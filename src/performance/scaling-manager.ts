/**
 * Scaling Manager
 * 동적 확장성 관리 및 리소스 스케일링
 */

import { EventEmitter } from 'eventemitter3';
import { performanceProfiler } from './performance-profiler.js';
import { memoryOptimizer } from './memory-optimizer.js';
import { asyncOptimizer } from './async-optimizer.js';

export interface ScalingConfig {
  autoScaling: boolean;
  minInstances: number;
  maxInstances: number;
  targetCPUUsage: number; // 0-100
  targetMemoryUsage: number; // 0-100
  scaleUpThreshold: number; // 0-100
  scaleDownThreshold: number; // 0-100
  scaleUpCooldown: number; // ms
  scaleDownCooldown: number; // ms
  eventBatchSize: number;
  maxConcurrentTasks: number;
}

export interface ResourceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  eventQueueLength: number;
  activeConnections: number;
  responseTime: number;
  throughput: number;
  errorRate: number;
}

export interface ScalingAction {
  type: 'scale_up' | 'scale_down' | 'optimize' | 'throttle';
  reason: string;
  timestamp: number;
  metrics: ResourceMetrics;
  result?: {
    success: boolean;
    newCapacity?: number;
    message?: string;
  };
}

export interface LoadBalancerConfig {
  algorithm: 'round_robin' | 'least_connections' | 'weighted' | 'hash';
  healthCheckInterval: number;
  maxRetries: number;
  timeout: number;
}

export class ScalingManager extends EventEmitter {
  private config: ScalingConfig;
  private currentInstances = 1;
  private lastScaleAction = 0;
  private scalingHistory: ScalingAction[] = [];
  private resourceMetrics: ResourceMetrics;
  private isMonitoring = false;
  private monitoringInterval?: NodeJS.Timeout;

  // 이벤트 배치 처리
  private eventBatches = new Map<string, any[]>();
  private batchTimers = new Map<string, NodeJS.Timeout>();

  // 연결 풀링
  private connectionPools = new Map<string, any[]>();
  private poolMetrics = new Map<string, { active: number; idle: number; total: number }>();

  // 로드 밸런싱
  private loadBalancer: LoadBalancer;

  constructor(config?: Partial<ScalingConfig>) {
    super();
    
    this.config = {
      autoScaling: true,
      minInstances: 1,
      maxInstances: 10,
      targetCPUUsage: 70,
      targetMemoryUsage: 80,
      scaleUpThreshold: 85,
      scaleDownThreshold: 30,
      scaleUpCooldown: 300000, // 5분
      scaleDownCooldown: 600000, // 10분
      eventBatchSize: 100,
      maxConcurrentTasks: 50,
      ...config
    };

    this.resourceMetrics = {
      cpuUsage: 0,
      memoryUsage: 0,
      eventQueueLength: 0,
      activeConnections: 0,
      responseTime: 0,
      throughput: 0,
      errorRate: 0
    };

    this.loadBalancer = new LoadBalancer({
      algorithm: 'least_connections',
      healthCheckInterval: 30000,
      maxRetries: 3,
      timeout: 5000
    });

    this.initializeMonitoring();
  }

  /**
   * 모니터링 초기화
   */
  private initializeMonitoring(): void {
    if (this.config.autoScaling) {
      this.startMonitoring();
    }

    // 성능 프로파일러 이벤트 리스닝
    performanceProfiler.on('bottleneckDetected', (bottleneck) => {
      this.handleBottleneck(bottleneck);
    });

    performanceProfiler.on('memoryLeakDetected', (leak) => {
      this.handleMemoryLeak(leak);
    });
  }

  /**
   * 모니터링 시작
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.evaluateScaling();
    }, 10000); // 10초마다 평가

    this.emit('monitoringStarted');
  }

  /**
   * 모니터링 중지
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.emit('monitoringStopped');
  }

  /**
   * 리소스 메트릭 수집
   */
  private collectMetrics(): void {
    const metricId = performanceProfiler.startMetric('collect_metrics');
    
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const profilerStats = performanceProfiler.getStats();
      const asyncStats = asyncOptimizer.getStats();

      this.resourceMetrics = {
        cpuUsage: this.calculateCPUUsage(cpuUsage),
        memoryUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        eventQueueLength: asyncStats.queueLength,
        activeConnections: this.getActiveConnections(),
        responseTime: profilerStats.averageResponseTime,
        throughput: this.calculateThroughput(),
        errorRate: ((asyncStats.failedTasks / asyncStats.totalTasks) || 0) * 100
      };

      this.emit('metricsCollected', this.resourceMetrics);
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * CPU 사용률 계산
   */
  private calculateCPUUsage(cpuUsage: NodeJS.CpuUsage): number {
    // 실제 구현에서는 이전 측정값과 비교하여 사용률 계산
    // 여기서는 간단한 시뮬레이션
    const totalTime = cpuUsage.user + cpuUsage.system;
    return Math.min((totalTime / 1000000) * 100, 100); // 마이크로초를 퍼센트로 변환
  }

  /**
   * 처리량 계산
   */
  private calculateThroughput(): number {
    const asyncStats = asyncOptimizer.getStats();
    const timeWindow = 60000; // 1분
    return (asyncStats.completedTasks / timeWindow) * 1000; // 초당 완료 작업 수
  }

  /**
   * 활성 연결 수 조회
   */
  private getActiveConnections(): number {
    let totalConnections = 0;
    for (const metrics of this.poolMetrics.values()) {
      totalConnections += metrics.active;
    }
    return totalConnections;
  }

  /**
   * 스케일링 평가
   */
  private evaluateScaling(): void {
    if (!this.config.autoScaling) {
      return;
    }

    const now = Date.now();
    const timeSinceLastScale = now - this.lastScaleAction;

    // 스케일 업 조건 확인
    if (this.shouldScaleUp() && timeSinceLastScale > this.config.scaleUpCooldown) {
      this.scaleUp();
    }
    // 스케일 다운 조건 확인
    else if (this.shouldScaleDown() && timeSinceLastScale > this.config.scaleDownCooldown) {
      this.scaleDown();
    }
    // 최적화 필요 조건 확인
    else if (this.shouldOptimize()) {
      this.performOptimization();
    }
  }

  /**
   * 스케일 업 필요 여부 확인
   */
  private shouldScaleUp(): boolean {
    const metrics = this.resourceMetrics;
    
    return (
      this.currentInstances < this.config.maxInstances &&
      (
        metrics.cpuUsage > this.config.scaleUpThreshold ||
        metrics.memoryUsage > this.config.scaleUpThreshold ||
        metrics.eventQueueLength > this.config.eventBatchSize * 2 ||
        metrics.responseTime > 5000 // 5초 이상
      )
    );
  }

  /**
   * 스케일 다운 필요 여부 확인
   */
  private shouldScaleDown(): boolean {
    const metrics = this.resourceMetrics;
    
    return (
      this.currentInstances > this.config.minInstances &&
      metrics.cpuUsage < this.config.scaleDownThreshold &&
      metrics.memoryUsage < this.config.scaleDownThreshold &&
      metrics.eventQueueLength < this.config.eventBatchSize / 2 &&
      metrics.responseTime < 1000 // 1초 이하
    );
  }

  /**
   * 최적화 필요 여부 확인
   */
  private shouldOptimize(): boolean {
    const metrics = this.resourceMetrics;
    
    return (
      metrics.errorRate > 5 || // 5% 이상 오류율
      metrics.responseTime > 2000 || // 2초 이상 응답시간
      metrics.memoryUsage > 90 // 90% 이상 메모리 사용
    );
  }

  /**
   * 스케일 업 실행
   */
  private async scaleUp(): Promise<void> {
    const metricId = performanceProfiler.startMetric('scale_up');
    
    try {
      const action: ScalingAction = {
        type: 'scale_up',
        reason: this.getScaleUpReason(),
        timestamp: Date.now(),
        metrics: { ...this.resourceMetrics }
      };

      // 가상 인스턴스 증가 (실제로는 워커 프로세스나 클러스터 생성)
      const newInstanceCount = Math.min(this.currentInstances + 1, this.config.maxInstances);
      
      // 동시성 제한 증가
      asyncOptimizer.updateConcurrency(newInstanceCount * 10);
      
      // 이벤트 배치 크기 증가
      this.increaseBatchCapacity();

      this.currentInstances = newInstanceCount;
      this.lastScaleAction = Date.now();

      action.result = {
        success: true,
        newCapacity: this.currentInstances,
        message: `Scaled up to ${this.currentInstances} instances`
      };

      this.scalingHistory.push(action);
      this.emit('scaledUp', action);
    } catch (error) {
      this.emit('scalingError', { 
        type: 'scale_up', 
        error: (error as Error).message 
      });
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 스케일 다운 실행
   */
  private async scaleDown(): Promise<void> {
    const metricId = performanceProfiler.startMetric('scale_down');
    
    try {
      const action: ScalingAction = {
        type: 'scale_down',
        reason: 'Low resource utilization',
        timestamp: Date.now(),
        metrics: { ...this.resourceMetrics }
      };

      // 가상 인스턴스 감소
      const newInstanceCount = Math.max(this.currentInstances - 1, this.config.minInstances);
      
      // 동시성 제한 감소
      asyncOptimizer.updateConcurrency(newInstanceCount * 10);
      
      // 이벤트 배치 크기 감소
      this.decreaseBatchCapacity();

      this.currentInstances = newInstanceCount;
      this.lastScaleAction = Date.now();

      action.result = {
        success: true,
        newCapacity: this.currentInstances,
        message: `Scaled down to ${this.currentInstances} instances`
      };

      this.scalingHistory.push(action);
      this.emit('scaledDown', action);
    } catch (error) {
      this.emit('scalingError', { 
        type: 'scale_down', 
        error: (error as Error).message 
      });
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 성능 최적화 실행
   */
  private async performOptimization(): Promise<void> {
    const metricId = performanceProfiler.startMetric('performance_optimization');
    
    try {
      const action: ScalingAction = {
        type: 'optimize',
        reason: this.getOptimizationReason(),
        timestamp: Date.now(),
        metrics: { ...this.resourceMetrics }
      };

      // 메모리 최적화
      await memoryOptimizer.optimize();
      
      // 캐시 정리
      this.cleanupCaches();
      
      // 배치 처리 최적화
      this.optimizeBatchProcessing();
      
      // 연결 풀 최적화
      this.optimizeConnectionPools();

      action.result = {
        success: true,
        message: 'Performance optimization completed'
      };

      this.scalingHistory.push(action);
      this.emit('optimized', action);
    } catch (error) {
      this.emit('scalingError', { 
        type: 'optimize', 
        error: (error as Error).message 
      });
    } finally {
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 스케일 업 이유 생성
   */
  private getScaleUpReason(): string {
    const metrics = this.resourceMetrics;
    const reasons: string[] = [];

    if (metrics.cpuUsage > this.config.scaleUpThreshold) {
      reasons.push(`High CPU usage: ${metrics.cpuUsage.toFixed(1)}%`);
    }
    if (metrics.memoryUsage > this.config.scaleUpThreshold) {
      reasons.push(`High memory usage: ${metrics.memoryUsage.toFixed(1)}%`);
    }
    if (metrics.eventQueueLength > this.config.eventBatchSize * 2) {
      reasons.push(`Large event queue: ${metrics.eventQueueLength} events`);
    }
    if (metrics.responseTime > 5000) {
      reasons.push(`Slow response time: ${metrics.responseTime.toFixed(0)}ms`);
    }

    return reasons.join(', ');
  }

  /**
   * 최적화 이유 생성
   */
  private getOptimizationReason(): string {
    const metrics = this.resourceMetrics;
    const reasons: string[] = [];

    if (metrics.errorRate > 5) {
      reasons.push(`High error rate: ${metrics.errorRate.toFixed(1)}%`);
    }
    if (metrics.responseTime > 2000) {
      reasons.push(`Slow response time: ${metrics.responseTime.toFixed(0)}ms`);
    }
    if (metrics.memoryUsage > 90) {
      reasons.push(`Critical memory usage: ${metrics.memoryUsage.toFixed(1)}%`);
    }

    return reasons.join(', ');
  }

  /**
   * 이벤트 배치 처리
   */
  addEventToBatch<T>(batchName: string, event: T): Promise<void> {
    return new Promise((resolve) => {
      if (!this.eventBatches.has(batchName)) {
        this.eventBatches.set(batchName, []);
      }

      const batch = this.eventBatches.get(batchName)!;
      batch.push({ event, resolve });

      // 배치 크기 도달 시 즉시 처리
      if (batch.length >= this.config.eventBatchSize) {
        this.processBatch(batchName);
      } else {
        // 타이머 설정 (아직 없는 경우)
        if (!this.batchTimers.has(batchName)) {
          const timer = setTimeout(() => {
            this.processBatch(batchName);
          }, 1000); // 1초 대기
          this.batchTimers.set(batchName, timer);
        }
      }
    });
  }

  /**
   * 배치 처리 실행
   */
  private async processBatch(batchName: string): Promise<void> {
    const batch = this.eventBatches.get(batchName);
    if (!batch || batch.length === 0) {
      return;
    }

    const metricId = performanceProfiler.startMetric(`batch_${batchName}`);
    
    try {
      // 배치 타이머 정리
      const timer = this.batchTimers.get(batchName);
      if (timer) {
        clearTimeout(timer);
        this.batchTimers.delete(batchName);
      }

      // 이벤트 처리
      const events = batch.map(item => item.event);
      await this.processBatchEvents(batchName, events);

      // 완료 알림
      batch.forEach(item => item.resolve());

      this.emit('batchProcessed', {
        batchName,
        eventCount: events.length,
        processingTime: Date.now()
      });
    } catch (error) {
      this.emit('batchError', {
        batchName,
        error: (error as Error).message
      });
    } finally {
      // 배치 정리
      this.eventBatches.set(batchName, []);
      performanceProfiler.endMetric(metricId);
    }
  }

  /**
   * 배치 이벤트 처리
   */
  private async processBatchEvents(batchName: string, events: any[]): Promise<void> {
    // 실제 이벤트 처리 로직
    await asyncOptimizer.parallel(
      events.map(event => () => this.processEvent(event)),
      Math.min(this.currentInstances * 5, events.length)
    );
  }

  /**
   * 개별 이벤트 처리
   */
  private async processEvent(event: any): Promise<void> {
    // 이벤트 처리 시뮬레이션
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  }

  /**
   * 연결 풀 생성
   */
  createConnectionPool(poolName: string, maxConnections: number): void {
    const connections: any[] = [];
    
    // 가상 연결 생성
    for (let i = 0; i < maxConnections; i++) {
      connections.push({
        id: `conn_${i}`,
        isActive: false,
        createdAt: Date.now()
      });
    }

    this.connectionPools.set(poolName, connections);
    this.poolMetrics.set(poolName, {
      active: 0,
      idle: maxConnections,
      total: maxConnections
    });

    this.emit('connectionPoolCreated', { poolName, size: maxConnections });
  }

  /**
   * 연결 획득
   */
  async acquireConnection(poolName: string): Promise<any> {
    const pool = this.connectionPools.get(poolName);
    if (!pool) {
      throw new Error(`Connection pool ${poolName} not found`);
    }

    const availableConnection = pool.find(conn => !conn.isActive);
    if (!availableConnection) {
      throw new Error(`No available connections in pool ${poolName}`);
    }

    availableConnection.isActive = true;
    this.updatePoolMetrics(poolName);

    return availableConnection;
  }

  /**
   * 연결 반환
   */
  releaseConnection(poolName: string, connection: any): void {
    connection.isActive = false;
    this.updatePoolMetrics(poolName);
    
    this.emit('connectionReleased', { poolName, connectionId: connection.id });
  }

  /**
   * 풀 메트릭 업데이트
   */
  private updatePoolMetrics(poolName: string): void {
    const pool = this.connectionPools.get(poolName);
    if (!pool) return;

    const activeCount = pool.filter(conn => conn.isActive).length;
    const idleCount = pool.length - activeCount;

    this.poolMetrics.set(poolName, {
      active: activeCount,
      idle: idleCount,
      total: pool.length
    });
  }

  /**
   * 병목 현상 처리
   */
  private handleBottleneck(bottleneck: any): void {
    if (bottleneck.severity === 'critical') {
      // 즉시 스케일링 시도
      if (this.shouldScaleUp()) {
        this.scaleUp();
      } else {
        this.performOptimization();
      }
    }
  }

  /**
   * 메모리 누수 처리
   */
  private handleMemoryLeak(leak: any): void {
    if (leak.severity === 'high') {
      // 즉시 메모리 최적화
      memoryOptimizer.optimize();
      this.performOptimization();
    }
  }

  /**
   * 배치 용량 증가
   */
  private increaseBatchCapacity(): void {
    this.config.eventBatchSize = Math.min(this.config.eventBatchSize * 1.5, 500);
    this.emit('batchCapacityChanged', { 
      newSize: this.config.eventBatchSize, 
      direction: 'increased' 
    });
  }

  /**
   * 배치 용량 감소
   */
  private decreaseBatchCapacity(): void {
    this.config.eventBatchSize = Math.max(this.config.eventBatchSize * 0.8, 50);
    this.emit('batchCapacityChanged', { 
      newSize: this.config.eventBatchSize, 
      direction: 'decreased' 
    });
  }

  /**
   * 캐시 정리
   */
  private cleanupCaches(): void {
    // 캐시 매니저와 연동하여 정리
    this.emit('cacheCleanupRequested');
  }

  /**
   * 배치 처리 최적화
   */
  private optimizeBatchProcessing(): void {
    // 배치 크기 동적 조정
    const avgResponseTime = this.resourceMetrics.responseTime;
    
    if (avgResponseTime > 3000) {
      this.config.eventBatchSize = Math.max(this.config.eventBatchSize * 0.9, 50);
    } else if (avgResponseTime < 1000) {
      this.config.eventBatchSize = Math.min(this.config.eventBatchSize * 1.1, 500);
    }
  }

  /**
   * 연결 풀 최적화
   */
  private optimizeConnectionPools(): void {
    for (const [poolName, pool] of this.connectionPools.entries()) {
      const metrics = this.poolMetrics.get(poolName);
      if (!metrics) continue;

      // 사용률이 낮으면 풀 크기 감소
      if (metrics.active < metrics.total * 0.3) {
        const newSize = Math.max(Math.floor(pool.length * 0.8), 5);
        pool.splice(newSize);
        this.updatePoolMetrics(poolName);
      }
      // 사용률이 높으면 풀 크기 증가
      else if (metrics.active > metrics.total * 0.8) {
        const additionalConnections = Math.floor(pool.length * 0.2);
        for (let i = 0; i < additionalConnections; i++) {
          pool.push({
            id: `conn_${pool.length + i}`,
            isActive: false,
            createdAt: Date.now()
          });
        }
        this.updatePoolMetrics(poolName);
      }
    }
  }

  /**
   * 현재 상태 조회
   */
  getStatus(): {
    instances: number;
    metrics: ResourceMetrics;
    config: ScalingConfig;
    recentActions: ScalingAction[];
  } {
    return {
      instances: this.currentInstances,
      metrics: this.resourceMetrics,
      config: this.config,
      recentActions: this.scalingHistory.slice(-10)
    };
  }

  /**
   * 설정 업데이트
   */
  updateConfig(newConfig: Partial<ScalingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.autoScaling !== undefined) {
      if (newConfig.autoScaling && !this.isMonitoring) {
        this.startMonitoring();
      } else if (!newConfig.autoScaling && this.isMonitoring) {
        this.stopMonitoring();
      }
    }

    this.emit('configUpdated', this.config);
  }

  /**
   * 리소스 정리
   */
  cleanup(): void {
    this.stopMonitoring();
    
    // 배치 타이머 정리
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }
    
    this.eventBatches.clear();
    this.batchTimers.clear();
    this.connectionPools.clear();
    this.poolMetrics.clear();
    this.scalingHistory.length = 0;

    this.removeAllListeners();
  }
}

/**
 * 로드 밸런서
 */
class LoadBalancer {
  private config: LoadBalancerConfig;
  private instances: Array<{ id: string; healthy: boolean; connections: number; weight: number }> = [];
  private currentIndex = 0;

  constructor(config: LoadBalancerConfig) {
    this.config = config;
  }

  addInstance(id: string, weight = 1): void {
    this.instances.push({
      id,
      healthy: true,
      connections: 0,
      weight
    });
  }

  removeInstance(id: string): void {
    const index = this.instances.findIndex(instance => instance.id === id);
    if (index !== -1) {
      this.instances.splice(index, 1);
    }
  }

  getNextInstance(): string | null {
    const healthyInstances = this.instances.filter(instance => instance.healthy);
    
    if (healthyInstances.length === 0) {
      return null;
    }

    switch (this.config.algorithm) {
      case 'round_robin':
        return this.roundRobin(healthyInstances);
      case 'least_connections':
        return this.leastConnections(healthyInstances);
      case 'weighted':
        return this.weighted(healthyInstances);
      default:
        return healthyInstances[0].id;
    }
  }

  private roundRobin(instances: any[]): string {
    const instance = instances[this.currentIndex % instances.length];
    this.currentIndex++;
    return instance.id;
  }

  private leastConnections(instances: any[]): string {
    return instances.reduce((min, current) => 
      current.connections < min.connections ? current : min
    ).id;
  }

  private weighted(instances: any[]): string {
    const totalWeight = instances.reduce((sum, instance) => sum + instance.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const instance of instances) {
      random -= instance.weight;
      if (random <= 0) {
        return instance.id;
      }
    }
    
    return instances[0].id;
  }
}

// 싱글톤 인스턴스
export const scalingManager = new ScalingManager();