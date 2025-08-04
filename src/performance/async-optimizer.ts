/**
 * Async Optimizer
 * 비동기 작업 최적화 및 병렬 처리 관리
 */

import { EventEmitter } from 'eventemitter3';
import { performanceProfiler } from './performance-profiler.js';

export interface TaskConfig {
  maxConcurrency: number;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface Task<T = any> {
  id: string;
  name: string;
  fn: () => Promise<T>;
  config: TaskConfig;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  result?: T;
  error?: Error;
  startTime?: number;
  endTime?: number;
  duration?: number;
  retryCount: number;
  createdAt: number;
}

export interface BatchConfig {
  batchSize: number;
  maxWaitTime: number;
  processor: (items: any[]) => Promise<any[]>;
}

export interface AsyncStats {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  runningTasks: number;
  averageExecutionTime: number;
  successRate: number;
  concurrencyUtilization: number;
  queueLength: number;
}

export class AsyncOptimizer extends EventEmitter {
  private taskQueue: Task[] = [];
  private runningTasks = new Map<string, Task>();
  private completedTasks: Task[] = [];
  private failedTasks: Task[] = [];
  private maxConcurrency = 10;
  private isProcessing = false;
  private taskCounter = 0;

  // 배치 처리
  private batchQueues = new Map<string, { items: any[], config: BatchConfig, timer?: NodeJS.Timeout }>();

  // 리소스 풀
  private resourcePools = new Map<string, any[]>();

  constructor(maxConcurrency = 10) {
    super();
    this.maxConcurrency = maxConcurrency;
    this.startProcessing();
  }

  /**
   * 비동기 작업 추가
   */
  addTask<T>(
    name: string,
    fn: () => Promise<T>,
    config?: Partial<TaskConfig>
  ): Promise<T> {
    const taskId = `task_${++this.taskCounter}_${Date.now()}`;
    
    const defaultConfig: TaskConfig = {
      maxConcurrency: 1,
      timeout: 30000, // 30초
      retryAttempts: 3,
      retryDelay: 1000,
      priority: 'medium'
    };

    const task: Task<T> = {
      id: taskId,
      name,
      fn,
      config: { ...defaultConfig, ...config },
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      // 완료/실패 핸들러 추가
      const handleCompletion = (completedTask: Task<T>) => {
        if (completedTask.id === taskId) {
          this.off('taskCompleted', handleCompletion);
          this.off('taskFailed', handleFailure);
          
          if (completedTask.status === 'completed') {
            resolve(completedTask.result!);
          } else {
            reject(completedTask.error);
          }
        }
      };

      const handleFailure = (failedTask: Task<T>) => {
        if (failedTask.id === taskId) {
          this.off('taskCompleted', handleCompletion);
          this.off('taskFailed', handleFailure);
          reject(failedTask.error);
        }
      };

      this.on('taskCompleted', handleCompletion);
      this.on('taskFailed', handleFailure);

      // 우선순위에 따라 큐에 삽입
      this.insertTaskByPriority(task);
      this.emit('taskQueued', { taskId, name, queueLength: this.taskQueue.length });
    });
  }

  /**
   * 우선순위에 따른 작업 삽입
   */
  private insertTaskByPriority(task: Task): void {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const taskPriority = priorityOrder[task.config.priority];

    let insertIndex = this.taskQueue.length;
    
    for (let i = 0; i < this.taskQueue.length; i++) {
      const queuedTaskPriority = priorityOrder[this.taskQueue[i]?.config.priority || 'medium'];
      if (taskPriority < queuedTaskPriority) {
        insertIndex = i;
        break;
      }
    }

    this.taskQueue.splice(insertIndex, 0, task);
  }

  /**
   * 작업 처리 시작
   */
  private startProcessing(): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.processQueue();
  }

  /**
   * 큐 처리
   */
  private async processQueue(): Promise<void> {
    while (this.isProcessing) {
      // 실행 가능한 작업 수 계산
      const availableSlots = this.maxConcurrency - this.runningTasks.size;
      
      if (availableSlots <= 0 || this.taskQueue.length === 0) {
        await this.sleep(100); // 100ms 대기
        continue;
      }

      // 실행할 작업들 선택
      const tasksToRun = this.taskQueue.splice(0, availableSlots);
      
      // 병렬 실행
      tasksToRun.forEach(task => {
        this.executeTask(task);
      });

      await this.sleep(10); // 10ms 대기
    }
  }

  /**
   * 개별 작업 실행
   */
  private async executeTask<T>(task: Task<T>): Promise<void> {
    const metricId = performanceProfiler.startMetric(`async_task_${task.name}`);
    
    try {
      task.status = 'running';
      task.startTime = Date.now();
      this.runningTasks.set(task.id, task);

      this.emit('taskStarted', { 
        taskId: task.id, 
        name: task.name,
        runningCount: this.runningTasks.size 
      });

      // 타임아웃 설정
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Task ${task.name} timed out after ${task.config.timeout}ms`));
        }, task.config.timeout);
      });

      // 작업 실행 (타임아웃과 경주)
      try {
        task.result = await Promise.race([
          task.fn(),
          timeoutPromise
        ]);
        
        task.status = 'completed';
        task.endTime = Date.now();
        task.duration = task.endTime - task.startTime!;

        this.runningTasks.delete(task.id);
        this.completedTasks.push(task);

        this.emit('taskCompleted', task);
      } catch (error) {
        await this.handleTaskError(task, error as Error);
      }
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 작업 오류 처리
   */
  private async handleTaskError<T>(task: Task<T>, error: Error): Promise<void> {
    task.error = error;
    task.retryCount++;

    // 재시도 가능한지 확인
    if (task.retryCount <= task.config.retryAttempts) {
      this.emit('taskRetry', { 
        taskId: task.id, 
        name: task.name, 
        retryCount: task.retryCount,
        error: error.message 
      });

      // 재시도 지연
      await this.sleep(task.config.retryDelay * task.retryCount);
      
      // 큐에 다시 추가 (우선순위 높임)
      const retryTask = { ...task };
      retryTask.config.priority = this.increasePriority(task.config.priority);
      retryTask.status = 'pending';
      
      this.runningTasks.delete(task.id);
      this.insertTaskByPriority(retryTask);
    } else {
      // 재시도 횟수 초과
      task.status = 'failed';
      task.endTime = Date.now();
      task.duration = task.endTime - task.startTime!;

      this.runningTasks.delete(task.id);
      this.failedTasks.push(task);

      this.emit('taskFailed', task);
    }
  }

  /**
   * 우선순위 증가
   */
  private increasePriority(currentPriority: TaskConfig['priority']): TaskConfig['priority'] {
    const priorities: TaskConfig['priority'][] = ['low', 'medium', 'high', 'critical'];
    const currentIndex = priorities.indexOf(currentPriority);
    return priorities[Math.min(currentIndex + 1, priorities.length - 1)] || 'medium';
  }

  /**
   * 배치 처리 큐 추가
   */
  addToBatch<T>(
    batchName: string,
    item: T,
    config: BatchConfig
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.batchQueues.has(batchName)) {
        this.batchQueues.set(batchName, {
          items: [],
          config,
          timer: undefined as NodeJS.Timeout | undefined
        });
      }

      const batch = this.batchQueues.get(batchName)!;
      batch.items.push({ item, resolve, reject });

      // 배치 크기 도달 시 즉시 처리
      if (batch.items.length >= config.batchSize) {
        this.processBatch(batchName);
      } else if (!batch.timer) {
        // 최대 대기 시간 타이머 설정
        batch.timer = setTimeout(() => {
          this.processBatch(batchName);
        }, config.maxWaitTime);
      }
    });
  }

  /**
   * 배치 처리 실행
   */
  private async processBatch(batchName: string): Promise<void> {
    const batch = this.batchQueues.get(batchName);
    if (!batch || batch.items.length === 0) {
      return;
    }

    // 타이머 정리
    if (batch.timer) {
      clearTimeout(batch.timer);
      batch.timer = undefined as NodeJS.Timeout | undefined;
    }

    const metricId = performanceProfiler.startMetric(`batch_${batchName}`);
    
    try {
      const items = batch.items.map(entry => entry.item);
      const results = await batch.config.processor(items);

      // 결과 매핑
      batch.items.forEach((entry, index) => {
        entry.resolve(results[index]);
      });

      this.emit('batchProcessed', {
        batchName,
        itemCount: items.length,
        processingTime: Date.now()
      });
    } catch (error) {
      // 모든 항목에 오류 전파
      batch.items.forEach(entry => {
        entry.reject(error);
      });

      this.emit('batchFailed', {
        batchName,
        itemCount: batch.items.length,
        error: (error as Error).message
      });
    } finally {
      // 배치 큐 정리
      batch.items.length = 0;
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 병렬 실행 (제한된 동시성)
   */
  async parallel<T>(
    tasks: (() => Promise<T>)[],
    concurrency = this.maxConcurrency
  ): Promise<T[]> {
    const metricId = performanceProfiler.startMetric('parallel_execution');
    
    try {
      const results: T[] = new Array(tasks.length);
      const executing: Promise<void>[] = [];
      let index = 0;

      const executeNext = async (): Promise<void> => {
        const currentIndex = index++;
        if (currentIndex >= tasks.length) {
          return;
        }

        try {
          const task = tasks[currentIndex];
          if (task) {
            results[currentIndex] = await task();
          }
        } catch (error) {
          results[currentIndex] = error as any;
        }

        return executeNext();
      };

      // 동시성 제한으로 병렬 실행
      for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
        executing.push(executeNext());
      }

      await Promise.all(executing);

      // 오류가 있는지 확인
      const errors = results.filter(result => result instanceof Error);
      if (errors.length > 0) {
        throw new AggregateError(errors, `${errors.length} tasks failed`);
      }

      return results;
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 리소스 풀 생성
   */
  createResourcePool<T>(name: string, resources: T[]): void {
    this.resourcePools.set(name, [...resources]);
    
    this.emit('resourcePoolCreated', {
      name,
      size: resources.length
    });
  }

  /**
   * 리소스 풀에서 리소스 획득
   */
  async acquireResource<T>(poolName: string, timeout = 30000): Promise<T> {
    return new Promise((resolve, reject) => {
      const pool = this.resourcePools.get(poolName);
      if (!pool) {
        reject(new Error(`Resource pool ${poolName} not found`));
        return;
      }

      if (pool.length > 0) {
        const resource = pool.pop()!;
        resolve(resource);
        return;
      }

      // 리소스가 없으면 대기
      const timeoutId = setTimeout(() => {
        reject(new Error(`Resource acquisition timeout for pool ${poolName}`));
      }, timeout);

      const checkResource = () => {
        if (pool.length > 0) {
          clearTimeout(timeoutId);
          this.off('resourceReleased', checkResource);
          const resource = pool.pop()!;
          resolve(resource);
        }
      };

      this.on('resourceReleased', checkResource);
    });
  }

  /**
   * 리소스 풀에 리소스 반환
   */
  releaseResource<T>(poolName: string, resource: T): void {
    const pool = this.resourcePools.get(poolName);
    if (pool) {
      pool.push(resource);
      this.emit('resourceReleased', { poolName, resourceCount: pool.length });
    }
  }

  /**
   * 통계 조회
   */
  getStats(): AsyncStats {
    const totalTasks = this.completedTasks.length + this.failedTasks.length + this.runningTasks.size + this.taskQueue.length;
    const completedCount = this.completedTasks.length;
    const failedCount = this.failedTasks.length;
    
    const durations = this.completedTasks
      .filter(task => task.duration !== undefined)
      .map(task => task.duration!);

    return {
      totalTasks,
      completedTasks: completedCount,
      failedTasks: failedCount,
      runningTasks: this.runningTasks.size,
      averageExecutionTime: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      successRate: totalTasks > 0 ? (completedCount / (completedCount + failedCount)) * 100 : 100,
      concurrencyUtilization: (this.runningTasks.size / this.maxConcurrency) * 100,
      queueLength: this.taskQueue.length
    };
  }

  /**
   * 대기 중인 작업 취소
   */
  cancelPendingTasks(predicate?: (task: Task) => boolean): number {
    const tasksToCancel = predicate 
      ? this.taskQueue.filter(predicate)
      : [...this.taskQueue];

    tasksToCancel.forEach(task => {
      const index = this.taskQueue.indexOf(task);
      if (index !== -1) {
        this.taskQueue.splice(index, 1);
        this.emit('taskCancelled', { taskId: task.id, name: task.name });
      }
    });

    return tasksToCancel.length;
  }

  /**
   * 동시성 제한 업데이트
   */
  updateConcurrency(newLimit: number): void {
    const oldLimit = this.maxConcurrency;
    this.maxConcurrency = Math.max(1, newLimit);
    
    this.emit('concurrencyUpdated', {
      oldLimit,
      newLimit: this.maxConcurrency
    });
  }

  /**
   * 유틸리티: sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 정리 작업
   */
  cleanup(): void {
    this.isProcessing = false;
    
    // 배치 타이머 정리
    this.batchQueues.forEach(batch => {
      if (batch.timer) {
        clearTimeout(batch.timer);
      }
    });

    this.taskQueue.length = 0;
    this.runningTasks.clear();
    this.completedTasks.length = 0;
    this.failedTasks.length = 0;
    this.batchQueues.clear();
    this.resourcePools.clear();

    this.removeAllListeners();
  }
}

// 싱글톤 인스턴스
export const asyncOptimizer = new AsyncOptimizer();