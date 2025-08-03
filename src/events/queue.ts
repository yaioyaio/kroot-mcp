/**
 * 인메모리 이벤트 큐 시스템
 * EventEmitter3 기반의 우선순위 큐 구현
 */

import EventEmitter from 'eventemitter3';
import { BaseEvent, EventSeverity } from './types/index.js';

/**
 * 큐 이벤트 타입
 */
export interface QueueEvents {
  enqueue: (event: BaseEvent) => void;
  dequeue: (event: BaseEvent) => void;
  process: (events: BaseEvent[]) => void;
  error: (error: Error) => void;
  overflow: (droppedEvents: BaseEvent[]) => void;
  stats: (stats: QueueStatistics) => void;
}

/**
 * 큐 설정 옵션
 */
export interface QueueOptions {
  maxSize?: number;
  maxMemoryMB?: number;
  batchSize?: number;
  flushInterval?: number;
  priorityLevels?: number;
  enableMetrics?: boolean;
  enablePersistence?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * 큐 통계 정보
 */
export interface QueueStatistics {
  size: number;
  memoryUsage: number;
  enqueuedCount: number;
  dequeuedCount: number;
  droppedCount: number;
  failedCount: number;
  processingTime: number;
  throughput: number;
  priorityDistribution: Map<number, number>;
  oldestEventAge?: number;
}

/**
 * 우선순위 큐 항목
 */
interface QueueItem {
  event: BaseEvent;
  priority: number;
  timestamp: number;
  retryCount: number;
  size: number;
}

/**
 * 이벤트 큐 클래스
 */
export class EventQueue extends EventEmitter<QueueEvents> {
  private readonly options: Required<QueueOptions>;
  private readonly queues: Map<number, QueueItem[]>;
  private stats: QueueStatistics;
  private flushTimer?: NodeJS.Timeout;
  private memoryUsage: number = 0;
  private isProcessing: boolean = false;
  private retryTracking?: Map<string, number>;

  constructor(options: QueueOptions = {}) {
    super();

    this.options = {
      maxSize: options.maxSize ?? 10000,
      maxMemoryMB: options.maxMemoryMB ?? 100,
      batchSize: options.batchSize ?? 100,
      flushInterval: options.flushInterval ?? 1000,
      priorityLevels: options.priorityLevels ?? 5,
      enableMetrics: options.enableMetrics ?? true,
      enablePersistence: options.enablePersistence ?? false,
      retryAttempts: options.retryAttempts ?? 3,
      retryDelay: options.retryDelay ?? 1000,
    };

    // 우선순위별 큐 초기화
    this.queues = new Map();
    for (let i = 0; i < this.options.priorityLevels; i++) {
      this.queues.set(i, []);
    }

    // 통계 초기화
    this.stats = {
      size: 0,
      memoryUsage: 0,
      enqueuedCount: 0,
      dequeuedCount: 0,
      droppedCount: 0,
      failedCount: 0,
      processingTime: 0,
      throughput: 0,
      priorityDistribution: new Map(),
    };

    // 자동 플러시 시작
    if (this.options.flushInterval > 0) {
      this.startAutoFlush();
    }
  }

  /**
   * 이벤트를 큐에 추가
   */
  async enqueue(event: BaseEvent): Promise<boolean> {
    try {
      // 메모리 및 크기 제한 확인
      if (!this.checkCapacity(event)) {
        return false;
      }

      const priority = this.calculatePriority(event);
      const size = this.estimateEventSize(event);
      const item: QueueItem = {
        event,
        priority,
        timestamp: Date.now(),
        retryCount: 0,
        size,
      };

      // 우선순위 큐에 추가
      const queue = this.queues.get(priority);
      if (queue) {
        queue.push(item);
        this.updateStats('enqueue', item);
        this.emit('enqueue', event);

        // 배치 크기 도달 시 즉시 처리
        if (this.getTotalSize() >= this.options.batchSize) {
          await this.flush();
        }

        return true;
      }

      return false;
    } catch (error) {
      this.emit('error', error as Error);
      return false;
    }
  }

  /**
   * 여러 이벤트를 한 번에 큐에 추가
   */
  async enqueueBatch(events: BaseEvent[]): Promise<number> {
    let successCount = 0;
    
    for (const event of events) {
      if (await this.enqueue(event)) {
        successCount++;
      }
    }

    return successCount;
  }

  /**
   * 큐에서 이벤트를 꺼내기
   */
  dequeue(count: number = 1): BaseEvent[] {
    const events: BaseEvent[] = [];
    let remaining = count;

    // 높은 우선순위부터 처리
    for (let priority = this.options.priorityLevels - 1; priority >= 0 && remaining > 0; priority--) {
      const queue = this.queues.get(priority);
      if (!queue || queue.length === 0) continue;

      const toTake = Math.min(remaining, queue.length);
      const items = queue.splice(0, toTake);

      for (const item of items) {
        events.push(item.event);
        this.updateStats('dequeue', item);
        this.emit('dequeue', item.event);
      }

      remaining -= toTake;
    }

    return events;
  }

  /**
   * 큐 플러시 (배치 처리)
   */
  async flush(): Promise<void> {
    if (this.isProcessing || this.getTotalSize() === 0) {
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      const events = this.dequeue(this.options.batchSize);
      if (events.length > 0) {
        this.emit('process', events);
        
        // 처리 시간 및 처리량 업데이트
        const processingTime = Date.now() - startTime;
        this.stats.processingTime = processingTime;
        this.stats.throughput = events.length / (processingTime / 1000);
      }
    } catch (error) {
      this.emit('error', error as Error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 실패한 이벤트 재시도
   */
  async retry(event: BaseEvent, _error?: Error): Promise<boolean> {
    const priority = this.calculatePriority(event);
    const queue = this.queues.get(priority);
    
    if (!queue) {
      return false;
    }

    // 전역으로 재시도 횟수 추적
    if (!this.retryTracking) {
      this.retryTracking = new Map<string, number>();
    }
    
    const currentRetryCount = this.retryTracking.get(event.id) || 0;
    
    if (currentRetryCount >= this.options.retryAttempts) {
      // 최대 재시도 횟수 초과
      this.stats.failedCount++;
      this.emit('error', new Error(`Event ${event.id} failed after ${currentRetryCount} retries`));
      return false;
    }
    
    // 재시도 횟수 증가
    this.retryTracking.set(event.id, currentRetryCount + 1);
    
    // 새 항목으로 추가
    const item: QueueItem = {
      event,
      priority,
      timestamp: Date.now(),
      retryCount: currentRetryCount + 1,
      size: this.estimateEventSize(event),
    };
    
    // 재시도 지연 적용
    setTimeout(() => {
      queue.push(item);
      this.updateStats('retry', item);
    }, this.options.retryDelay * item.retryCount);
    
    return true;
  }

  /**
   * 큐 비우기
   */
  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
    
    this.memoryUsage = 0;
    this.stats.size = 0;
    this.stats.priorityDistribution.clear();
  }

  /**
   * 큐 통계 가져오기
   */
  getStats(): QueueStatistics {
    // 현재 큐 상태 업데이트
    this.stats.size = this.getTotalSize();
    this.stats.memoryUsage = this.memoryUsage;

    // 우선순위 분포 업데이트
    this.stats.priorityDistribution.clear();
    for (const [priority, queue] of this.queues) {
      this.stats.priorityDistribution.set(priority, queue.length);
    }

    // 가장 오래된 이벤트 나이 계산
    let oldestTimestamp: number | null = null;
    for (const queue of this.queues.values()) {
      if (queue.length > 0) {
        const firstItem = queue[0];
        if (firstItem && (oldestTimestamp === null || firstItem.timestamp < oldestTimestamp)) {
          oldestTimestamp = firstItem.timestamp;
        }
      }
    }
    
    if (oldestTimestamp !== null) {
      this.stats.oldestEventAge = Date.now() - oldestTimestamp;
    } else {
      this.stats.oldestEventAge = undefined;
    }

    if (this.options.enableMetrics) {
      this.emit('stats', { ...this.stats });
    }

    return { ...this.stats };
  }

  /**
   * 큐 종료
   */
  async shutdown(): Promise<void> {
    // 자동 플러시 중지
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined as any;
    }

    // 남은 이벤트 모두 처리
    while (this.getTotalSize() > 0) {
      await this.flush();
    }

    this.clear();
    this.removeAllListeners();
  }

  // Private 메서드들

  private calculatePriority(event: BaseEvent): number {
    // 심각도 기반 우선순위 계산
    const severityPriority: Record<EventSeverity, number> = {
      [EventSeverity.CRITICAL]: 4,
      [EventSeverity.ERROR]: 3,
      [EventSeverity.WARNING]: 2,
      [EventSeverity.WARN]: 2,
      [EventSeverity.INFO]: 1,
      [EventSeverity.DEBUG]: 0,
    };

    const basePriority = severityPriority[event.severity] ?? 1;
    
    // 우선순위 레벨 범위로 제한
    return Math.min(Math.max(basePriority, 0), this.options.priorityLevels - 1);
  }

  private estimateEventSize(event: BaseEvent): number {
    // JSON 문자열 크기로 대략적인 메모리 사용량 추정
    try {
      return JSON.stringify(event).length * 2; // UTF-16 고려
    } catch {
      return 1024; // 기본값 1KB
    }
  }

  private checkCapacity(event: BaseEvent): boolean {
    const eventSize = this.estimateEventSize(event);
    
    // 크기 제한 확인
    if (this.getTotalSize() >= this.options.maxSize) {
      const droppedEvents = this.evictOldestEvents(1);
      this.emit('overflow', droppedEvents);
    }

    // 메모리 제한 확인
    const maxMemoryBytes = this.options.maxMemoryMB * 1024 * 1024;
    if (this.memoryUsage + eventSize > maxMemoryBytes) {
      const droppedEvents = this.evictByMemory(eventSize);
      this.emit('overflow', droppedEvents);
    }

    return true;
  }

  private evictOldestEvents(count: number): BaseEvent[] {
    const evicted: BaseEvent[] = [];
    let remaining = count;

    // 낮은 우선순위부터 제거
    for (let priority = 0; priority < this.options.priorityLevels && remaining > 0; priority++) {
      const queue = this.queues.get(priority);
      if (!queue || queue.length === 0) continue;

      const toEvict = Math.min(remaining, queue.length);
      const items = queue.splice(0, toEvict);

      for (const item of items) {
        evicted.push(item.event);
        this.memoryUsage -= item.size;
        this.stats.droppedCount++;
      }

      remaining -= toEvict;
    }

    return evicted;
  }

  private evictByMemory(requiredSize: number): BaseEvent[] {
    const evicted: BaseEvent[] = [];
    let freedMemory = 0;

    // 낮은 우선순위부터 메모리 확보
    for (let priority = 0; priority < this.options.priorityLevels && freedMemory < requiredSize; priority++) {
      const queue = this.queues.get(priority);
      if (!queue || queue.length === 0) continue;

      while (queue.length > 0 && freedMemory < requiredSize) {
        const item = queue.shift();
        if (!item) continue;
        evicted.push(item.event);
        freedMemory += item.size;
        this.memoryUsage -= item.size;
        this.stats.droppedCount++;
      }
    }

    return evicted;
  }

  private getTotalSize(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  private updateStats(operation: 'enqueue' | 'dequeue' | 'retry', item: QueueItem): void {
    switch (operation) {
      case 'enqueue':
        this.stats.enqueuedCount++;
        this.memoryUsage += item.size;
        break;
      case 'dequeue':
        this.stats.dequeuedCount++;
        this.memoryUsage -= item.size;
        break;
      case 'retry':
        // 재시도는 통계에만 반영
        break;
    }
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.options.flushInterval);
  }
}

/**
 * 기본 이벤트 큐 인스턴스
 */
export const eventQueue = new EventQueue({
  maxSize: 10000,
  maxMemoryMB: 100,
  batchSize: 100,
  flushInterval: 1000,
  priorityLevels: 5,
  enableMetrics: true,
});