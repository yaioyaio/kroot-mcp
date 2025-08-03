/**
 * 이벤트 큐 매니저
 * 여러 큐를 관리하고 이벤트 라우팅을 담당
 */

import EventEmitter from 'eventemitter3';
import { EventQueue, QueueOptions, QueueStatistics } from './queue.js';
import { BaseEvent, EventCategory } from './types/index.js';

/**
 * 큐 매니저 이벤트
 */
export interface QueueManagerEvents {
  'queue:created': (name: string, queue: EventQueue) => void;
  'queue:destroyed': (name: string) => void;
  'event:routed': (event: BaseEvent, queueName: string) => void;
  'batch:processed': (events: BaseEvent[], queueName: string) => void;
  'error': (error: Error, queueName?: string) => void;
  'stats:update': (stats: Map<string, QueueStatistics>) => void;
}

/**
 * 큐 매니저 설정
 */
export interface QueueManagerOptions {
  defaultQueueOptions?: QueueOptions;
  enableAutoRouting?: boolean;
  enableMetrics?: boolean;
  metricsInterval?: number;
  maxQueues?: number;
}

/**
 * 라우팅 규칙
 */
export interface RoutingRule {
  name: string;
  predicate: (event: BaseEvent) => boolean;
  queueName: string;
  priority?: number;
}

/**
 * 큐 정보
 */
interface QueueInfo {
  name: string;
  queue: EventQueue;
  options: QueueOptions;
  createdAt: Date;
  eventCount: number;
}

/**
 * 이벤트 큐 매니저
 */
export class QueueManager extends EventEmitter<QueueManagerEvents> {
  private readonly queues: Map<string, QueueInfo>;
  private readonly routingRules: RoutingRule[];
  private readonly options: Required<QueueManagerOptions>;
  private metricsTimer?: NodeJS.Timeout;
  private processingHandlers: Map<string, (events: BaseEvent[]) => Promise<void>>;

  constructor(options: QueueManagerOptions = {}) {
    super();

    this.options = {
      defaultQueueOptions: options.defaultQueueOptions ?? {},
      enableAutoRouting: options.enableAutoRouting ?? true,
      enableMetrics: options.enableMetrics ?? true,
      metricsInterval: options.metricsInterval ?? 5000,
      maxQueues: options.maxQueues ?? 10,
    };

    this.queues = new Map();
    this.routingRules = [];
    this.processingHandlers = new Map();

    // 기본 큐 생성
    this.createDefaultQueues();

    // 자동 라우팅 설정
    if (this.options.enableAutoRouting) {
      this.setupAutoRouting();
    }

    // 메트릭 수집 시작
    if (this.options.enableMetrics) {
      this.startMetricsCollection();
    }
  }

  /**
   * 새 큐 생성
   */
  createQueue(name: string, options?: QueueOptions): EventQueue {
    if (this.queues.has(name)) {
      throw new Error(`Queue '${name}' already exists`);
    }

    if (this.queues.size >= this.options.maxQueues) {
      throw new Error(`Maximum number of queues (${this.options.maxQueues}) reached`);
    }

    const queueOptions = {
      ...this.options.defaultQueueOptions,
      ...options,
    };

    const queue = new EventQueue(queueOptions);
    
    // 큐 이벤트 리스닝
    queue.on('process', async (events) => {
      await this.handleBatchProcess(name, events);
    });

    queue.on('error', (error) => {
      this.emit('error', error, name);
    });

    const queueInfo: QueueInfo = {
      name,
      queue,
      options: queueOptions,
      createdAt: new Date(),
      eventCount: 0,
    };

    this.queues.set(name, queueInfo);
    this.emit('queue:created', name, queue);

    return queue;
  }

  /**
   * 큐 제거
   */
  async destroyQueue(name: string): Promise<void> {
    const queueInfo = this.queues.get(name);
    if (!queueInfo) {
      throw new Error(`Queue '${name}' not found`);
    }

    // 기본 큐는 제거할 수 없음
    if (['default', 'priority', 'batch', 'failed'].includes(name)) {
      throw new Error(`Cannot destroy system queue '${name}'`);
    }

    await queueInfo.queue.shutdown();
    this.queues.delete(name);
    this.emit('queue:destroyed', name);
  }

  /**
   * 큐 가져오기
   */
  getQueue(name: string): EventQueue | undefined {
    return this.queues.get(name)?.queue;
  }

  /**
   * 모든 큐 이름 가져오기
   */
  getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * 라우팅 규칙 추가
   */
  addRoutingRule(rule: RoutingRule): void {
    // 우선순위 순으로 정렬
    this.routingRules.push(rule);
    this.routingRules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * 라우팅 규칙 제거
   */
  removeRoutingRule(name: string): boolean {
    const index = this.routingRules.findIndex(rule => rule.name === name);
    if (index !== -1) {
      this.routingRules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 이벤트 라우팅
   */
  async routeEvent(event: BaseEvent): Promise<boolean> {
    // 라우팅 규칙 적용
    for (const rule of this.routingRules) {
      if (rule.predicate(event)) {
        const queue = this.getQueue(rule.queueName);
        if (queue) {
          const success = await queue.enqueue(event);
          if (success) {
            const queueInfo = this.queues.get(rule.queueName)!;
            queueInfo.eventCount++;
            this.emit('event:routed', event, rule.queueName);
            return true;
          }
        }
      }
    }

    // 기본 큐로 라우팅
    const defaultQueue = this.getQueue('default');
    if (defaultQueue) {
      const success = await defaultQueue.enqueue(event);
      if (success) {
        const queueInfo = this.queues.get('default')!;
        queueInfo.eventCount++;
        this.emit('event:routed', event, 'default');
        return true;
      }
    }

    return false;
  }

  /**
   * 배치 이벤트 라우팅
   */
  async routeEventBatch(events: BaseEvent[]): Promise<number> {
    let successCount = 0;

    for (const event of events) {
      if (await this.routeEvent(event)) {
        successCount++;
      }
    }

    return successCount;
  }

  /**
   * 처리 핸들러 등록
   */
  registerProcessor(queueName: string, handler: (events: BaseEvent[]) => Promise<void>): void {
    this.processingHandlers.set(queueName, handler);
  }

  /**
   * 처리 핸들러 제거
   */
  unregisterProcessor(queueName: string): void {
    this.processingHandlers.delete(queueName);
  }

  /**
   * 모든 큐 통계 가져오기
   */
  getAllStats(): Map<string, QueueStatistics> {
    const allStats = new Map<string, QueueStatistics>();

    for (const [name, queueInfo] of this.queues) {
      allStats.set(name, queueInfo.queue.getStats());
    }

    return allStats;
  }

  /**
   * 특정 큐 통계 가져오기
   */
  getQueueStats(name: string): QueueStatistics | undefined {
    const queue = this.getQueue(name);
    return queue?.getStats();
  }

  /**
   * 모든 큐 플러시
   */
  async flushAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const queueInfo of this.queues.values()) {
      promises.push(queueInfo.queue.flush());
    }

    await Promise.all(promises);
  }

  /**
   * 큐 매니저 종료
   */
  async shutdown(): Promise<void> {
    // 메트릭 수집 중지
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined as any;
    }

    // 모든 큐 종료
    const promises: Promise<void>[] = [];
    for (const queueInfo of this.queues.values()) {
      promises.push(queueInfo.queue.shutdown());
    }

    await Promise.all(promises);

    this.queues.clear();
    this.routingRules.length = 0;
    this.processingHandlers.clear();
    this.removeAllListeners();
  }

  // Private 메서드들

  private createDefaultQueues(): void {
    // 기본 큐
    this.createQueue('default', {
      maxSize: 5000,
      batchSize: 50,
      flushInterval: 1000,
    });

    // 우선순위 큐
    this.createQueue('priority', {
      maxSize: 1000,
      batchSize: 10,
      flushInterval: 100,
      priorityLevels: 10,
    });

    // 배치 처리 큐
    this.createQueue('batch', {
      maxSize: 10000,
      batchSize: 500,
      flushInterval: 5000,
    });

    // 실패한 이벤트 큐
    this.createQueue('failed', {
      maxSize: 1000,
      batchSize: 10,
      flushInterval: 10000,
      retryAttempts: 5,
      retryDelay: 5000,
    });
  }

  private setupAutoRouting(): void {
    // 카테고리별 라우팅
    this.addRoutingRule({
      name: 'critical-events',
      predicate: (event) => event.severity === 'critical' || event.severity === 'error',
      queueName: 'priority',
      priority: 100,
    });

    // 파일 이벤트는 배치로
    this.addRoutingRule({
      name: 'file-events',
      predicate: (event) => event.category === EventCategory.FILE,
      queueName: 'batch',
      priority: 50,
    });

    // Git 이벤트는 우선순위 큐로
    this.addRoutingRule({
      name: 'git-events',
      predicate: (event) => event.category === EventCategory.GIT,
      queueName: 'priority',
      priority: 60,
    });

    // EventEngine 연동은 나중에 설정
  }

  private async handleBatchProcess(queueName: string, events: BaseEvent[]): Promise<void> {
    const handler = this.processingHandlers.get(queueName);
    
    if (handler) {
      try {
        await handler(events);
        this.emit('batch:processed', events, queueName);
      } catch (error) {
        this.emit('error', error as Error, queueName);
        
        // 실패한 이벤트를 실패 큐로 이동
        const failedQueue = this.getQueue('failed');
        if (failedQueue && queueName !== 'failed') {
          for (const event of events) {
            await failedQueue.enqueue(event);
          }
        }
      }
    } else {
      // 핸들러가 없으면 경고만 출력
      console.warn(`No handler registered for queue '${queueName}'`);
      this.emit('batch:processed', events, queueName);
    }
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      const stats = this.getAllStats();
      this.emit('stats:update', stats);
    }, this.options.metricsInterval);
  }
}

/**
 * 기본 큐 매니저 인스턴스
 */
export const queueManager = new QueueManager({
  enableAutoRouting: true,
  enableMetrics: true,
  metricsInterval: 5000,
  maxQueues: 20,
});