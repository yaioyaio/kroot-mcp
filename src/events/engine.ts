/**
 * 이벤트 엔진
 * 중앙 이벤트 버스 및 이벤트 처리를 담당합니다.
 */

import EventEmitter from 'eventemitter3';
import {
  BaseEvent,
  EventHandler,
  EventFilter,
  EventTransformer,
  EventSubscriptionOptions,
  EventPublishOptions,
  EventBatch,
  EventStatistics,
  EventCategory,
  EventSeverity,
} from './types/index.js';
// queueManager는 나중에 동적으로 임포트

/**
 * 이벤트 구독자 정보
 */
interface EventSubscriber<T extends BaseEvent = BaseEvent> {
  id: string;
  pattern: string | RegExp;
  handler: EventHandler<T>;
  options: EventSubscriptionOptions;
  createdAt: Date;
}

/**
 * 이벤트 통계 데이터
 */
interface EventStats {
  totalEvents: number;
  eventsByCategory: Map<EventCategory, number>;
  eventsBySeverity: Map<EventSeverity, number>;
  eventsPerHour: number[];
  lastEventTime: Date | undefined;
}

/**
 * 이벤트 엔진 클래스
 */
export class EventEngine extends EventEmitter {
  private subscribers: Map<string, EventSubscriber[]> = new Map();
  private eventQueue: BaseEvent[] = [];
  private stats: EventStats;
  private transformers: Map<string, EventTransformer[]> = new Map();
  private globalFilters: EventFilter[] = [];
  private useQueueManager: boolean = true;
  private queueManager: any = null;

  constructor() {
    super();

    // 통계 초기화
    this.stats = {
      totalEvents: 0,
      eventsByCategory: new Map(),
      eventsBySeverity: new Map(),
      eventsPerHour: Array(24).fill(0),
      lastEventTime: undefined as Date | undefined,
    };

    // 카테고리별 통계 초기화
    Object.values(EventCategory).forEach((category) => {
      this.stats.eventsByCategory.set(category, 0);
    });

    // 심각도별 통계 초기화
    Object.values(EventSeverity).forEach((severity) => {
      this.stats.eventsBySeverity.set(severity, 0);
    });

    // QueueManager 이벤트 처리기 설정
    if (this.useQueueManager) {
      this.setupQueueManagerIntegration();
    }
  }

  /**
   * 이벤트 구독
   */
  subscribe<T extends BaseEvent = BaseEvent>(
    pattern: string | RegExp,
    handler: EventHandler<T>,
    options: EventSubscriptionOptions = {},
  ): string {
    const subscriberId = this.generateSubscriberId();
    const subscriber: EventSubscriber<T> = {
      id: subscriberId,
      pattern,
      handler: handler as EventHandler,
      options,
      createdAt: new Date(),
    };

    const key = pattern instanceof RegExp ? pattern.source : pattern;
    const subscribers = this.subscribers.get(key) || [];

    // 우선순위에 따라 정렬하여 추가
    const priority = options.priority || 0;
    const insertIndex = subscribers.findIndex((s) => (s.options.priority || 0) < priority);

    if (insertIndex === -1) {
      subscribers.push(subscriber as EventSubscriber);
    } else {
      subscribers.splice(insertIndex, 0, subscriber as EventSubscriber);
    }

    this.subscribers.set(key, subscribers);

    // EventEmitter3 이벤트 등록
    if (pattern instanceof RegExp) {
      // 정규식 패턴은 와일드카드로 처리
      this.on('*', (event: T) => {
        if (pattern.test(event.type)) {
          this.handleEvent(event, subscriber as EventSubscriber);
        }
      });
    } else {
      // 일반 문자열 패턴
      const eventHandler = (event: T) => this.handleEvent(event, subscriber as EventSubscriber);

      if (options.once) {
        this.once(pattern, eventHandler);
      } else {
        this.on(pattern, eventHandler);
      }
    }

    return subscriberId;
  }

  /**
   * 이벤트 구독 해제
   */
  unsubscribe(subscriberId: string): boolean {
    for (const [key, subscribers] of this.subscribers.entries()) {
      const index = subscribers.findIndex((s) => s.id === subscriberId);
      if (index !== -1) {
        subscribers.splice(index, 1);
        if (subscribers.length === 0) {
          this.subscribers.delete(key);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * 이벤트 발행
   */
  async publish<T extends BaseEvent = BaseEvent>(
    event: T,
    options: EventPublishOptions = {},
  ): Promise<void> {
    // 통계 업데이트
    this.updateStatistics(event);

    // 전역 필터 적용
    if (!this.applyGlobalFilters(event)) {
      return;
    }

    // 변환기 적용
    const transformedEvent = await this.applyTransformers(event);

    // QueueManager 사용 시 큐로 라우팅
    if (this.useQueueManager && this.queueManager && (options as any).useQueue !== false) {
      const routed = await this.queueManager.routeEvent(transformedEvent);
      if (routed) {
        // 큐로 라우팅된 경우 직접 처리하지 않음
        this.emit('event:queued', transformedEvent);
        return;
      }
    }

    // 이벤트 큐에 추가
    this.eventQueue.push(transformedEvent);

    // EventEmitter3로 이벤트 발행 (processEvent에서 구독자 처리는 별도)
    this.emit(transformedEvent.type, transformedEvent);
    this.emit('*', transformedEvent);
    this.emit('event:published', transformedEvent);
  }

  /**
   * 배치 이벤트 발행
   */
  async publishBatch<T extends BaseEvent = BaseEvent>(
    batch: EventBatch<T>,
    options: EventPublishOptions = {},
  ): Promise<void> {
    for (const event of batch.events) {
      await this.publish(event, options);
    }
  }

  /**
   * 이벤트 변환기 등록
   */
  registerTransformer<T extends BaseEvent = BaseEvent, R extends BaseEvent = BaseEvent>(
    pattern: string | RegExp,
    transformer: EventTransformer<T, R>,
  ): void {
    const key = pattern instanceof RegExp ? pattern.source : pattern;
    const transformers = this.transformers.get(key) || [];
    transformers.push(transformer as unknown as EventTransformer<BaseEvent, BaseEvent>);
    this.transformers.set(key, transformers);
  }

  /**
   * 전역 필터 추가
   */
  addGlobalFilter(filter: EventFilter): void {
    this.globalFilters.push(filter);
  }

  /**
   * 전역 필터 제거
   */
  removeGlobalFilter(filter: EventFilter): boolean {
    const index = this.globalFilters.indexOf(filter);
    if (index !== -1) {
      this.globalFilters.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 통계 조회
   */
  getStatistics(): EventStatistics {
    return {
      totalEvents: this.stats.totalEvents,
      eventsByCategory: Object.fromEntries(this.stats.eventsByCategory) as Record<
        EventCategory,
        number
      >,
      eventsBySeverity: Object.fromEntries(this.stats.eventsBySeverity) as Record<
        EventSeverity,
        number
      >,
      eventsPerHour: this.calculateEventsPerHour(),
      ...(this.stats.lastEventTime && { lastEventTime: this.stats.lastEventTime }),
    };
  }

  /**
   * 이벤트 큐 크기 조회
   */
  getQueueSize(): number {
    return this.eventQueue.length;
  }

  /**
   * 구독자 수 조회
   */
  getSubscriberCount(): number {
    let count = 0;
    for (const subscribers of this.subscribers.values()) {
      count += subscribers.length;
    }
    return count;
  }

  /**
   * 이벤트 큐 비우기
   */
  clearQueue(): void {
    this.eventQueue = [];
  }

  /**
   * 모든 구독 해제
   */
  clearAllSubscriptions(): void {
    this.subscribers.clear();
    this.removeAllListeners();
  }

  /**
   * 이벤트 처리
   */
  private async handleEvent(event: BaseEvent, subscriber: EventSubscriber): Promise<void> {
    try {
      // 필터 적용
      if (subscriber.options.filter && !subscriber.options.filter(event)) {
        return;
      }

      // 핸들러 실행
      if (subscriber.options.async === false) {
        // 동기 실행
        subscriber.handler(event);
      } else {
        // 비동기 실행 (기본값)
        await subscriber.handler(event);
      }
    } catch (error) {
      // 에러 이벤트 발행
      const errorEvent: BaseEvent = {
        id: `error-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'system:error',
        category: EventCategory.SYSTEM,
        timestamp: Date.now(),
        severity: EventSeverity.ERROR,
        source: 'EventEngine',
        data: {
          originalEvent: event,
          subscriberId: subscriber.id,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : (undefined as string | undefined),
        },
      };

      // 에러 이벤트는 직접 emit (무한 루프 방지)
      this.emit('system:error', errorEvent);
    }
  }

  /**
   * 통계 업데이트
   */
  private updateStatistics(event: BaseEvent): void {
    this.stats.totalEvents++;
    this.stats.lastEventTime = new Date();

    // 카테고리별 통계
    const categoryCount = this.stats.eventsByCategory.get(event.category) || 0;
    this.stats.eventsByCategory.set(event.category, categoryCount + 1);

    // 심각도별 통계
    const severityCount = this.stats.eventsBySeverity.get(event.severity) || 0;
    this.stats.eventsBySeverity.set(event.severity, severityCount + 1);

    // 시간대별 통계
    const hour = new Date().getHours();
    if (this.stats.eventsPerHour[hour] !== undefined) {
      this.stats.eventsPerHour[hour]++;
    }
  }

  /**
   * 전역 필터 적용
   */
  private applyGlobalFilters(event: BaseEvent): boolean {
    for (const filter of this.globalFilters) {
      if (!filter(event)) {
        return false;
      }
    }
    return true;
  }

  /**
   * 변환기 적용
   */
  private async applyTransformers(event: BaseEvent): Promise<BaseEvent> {
    let transformedEvent = event;

    // 정확한 타입 매칭 변환기
    const exactTransformers = this.transformers.get(event.type) || [];
    for (const transformer of exactTransformers) {
      transformedEvent = await transformer(transformedEvent);
    }

    // 정규식 패턴 변환기
    for (const [pattern, transformers] of this.transformers.entries()) {
      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        const regex = new RegExp(pattern.slice(1, -1));
        if (regex.test(event.type)) {
          for (const transformer of transformers) {
            transformedEvent = await transformer(transformedEvent);
          }
        }
      }
    }

    return transformedEvent;
  }

  /**
   * 시간당 이벤트 수 계산
   */
  private calculateEventsPerHour(): number {
    const total = this.stats.eventsPerHour.reduce((sum, count) => sum + count, 0);
    return total / 24;
  }

  /**
   * 구독자 ID 생성
   */
  private generateSubscriberId(): string {
    return `sub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * QueueManager 통합 설정
   */
  private async setupQueueManagerIntegration(): Promise<void> {
    try {
      // 동적 임포트로 순환 참조 해결
      const { queueManager } = await import('./queue-manager.js');
      this.queueManager = queueManager;
      
      // 기본 처리기 등록
      queueManager.registerProcessor('default', async (events) => {
        for (const event of events) {
          await this.processQueuedEvent(event);
        }
      });

      queueManager.registerProcessor('priority', async (events) => {
        for (const event of events) {
          await this.processQueuedEvent(event);
        }
      });

      queueManager.registerProcessor('batch', async (events) => {
        // 배치 처리 최적화
        await this.processBatchEvents(events);
      });

      // 실패한 이벤트 재처리
      queueManager.registerProcessor('failed', async (events) => {
        for (const event of events) {
          try {
            await this.processQueuedEvent(event);
          } catch (error) {
            console.error('Failed to reprocess event:', event.id, error);
          }
        }
      });

      // 큐 매니저 이벤트 리스닝
      queueManager.on('error', (error: Error, queueName?: string) => {
        console.error(`Queue error in ${queueName}:`, error);
        this.emit('queue:error', { error, queueName });
      });

      queueManager.on('stats:update', (stats: any) => {
        this.emit('queue:stats', stats);
      });
    } catch (error) {
      console.error('Failed to setup queue manager integration:', error);
      this.useQueueManager = false;
    }
  }

  /**
   * 이벤트와 매칭되는 구독자 찾기
   */
  private findMatchingSubscribers(event: BaseEvent): EventSubscriber[] {
    const subscribers: EventSubscriber[] = [];
    
    // 정확한 타입 매칭
    const exactMatch = this.subscribers.get(event.type);
    if (exactMatch) {
      subscribers.push(...exactMatch);
    }
    
    // 정규식 패턴 매칭
    for (const [pattern, subs] of this.subscribers.entries()) {
      if (pattern !== event.type) {
        try {
          const regex = new RegExp(pattern);
          if (regex.test(event.type)) {
            subscribers.push(...subs);
          }
        } catch {
          // 정규식이 아닌 경우 무시
        }
      }
    }
    
    return subscribers;
  }

  /**
   * 큐에서 가져온 이벤트 처리
   */
  private async processQueuedEvent(event: BaseEvent): Promise<void> {
    // 매칭되는 구독자 찾기
    const matchingSubscribers = this.findMatchingSubscribers(event);

    // 구독자에게 이벤트 전달
    for (const subscriber of matchingSubscribers) {
      try {
        // 구독자별 필터 적용
        if (subscriber.options.filter && !(await subscriber.options.filter(event))) {
          continue;
        }

        // 핸들러 실행
        await subscriber.handler(event);
      } catch (error) {
        console.error(`Error in event handler ${subscriber.id}:`, error);
        throw error; // 재시도를 위해 에러 전파
      }
    }
  }

  /**
   * 배치 이벤트 처리
   */
  private async processBatchEvents(events: BaseEvent[]): Promise<void> {
    // 타입별로 그룹화
    const eventsByType = new Map<string, BaseEvent[]>();
    
    for (const event of events) {
      const list = eventsByType.get(event.type) || [];
      list.push(event);
      eventsByType.set(event.type, list);
    }

    // 타입별로 배치 처리
    for (const [type, typeEvents] of eventsByType) {
      const subscribers = this.subscribers.get(type) || [];
      
      for (const subscriber of subscribers) {
        try {
          // 배치 핸들러가 있는 경우
          if ((subscriber.options as any).batchHandler) {
            await (subscriber.options as any).batchHandler(typeEvents);
          } else {
            // 개별 처리
            for (const event of typeEvents) {
              if (!subscriber.options.filter || await subscriber.options.filter(event)) {
                await subscriber.handler(event);
              }
            }
          }
        } catch (error) {
          console.error(`Error in batch handler ${subscriber.id}:`, error);
        }
      }
    }
  }

  /**
   * 큐 관리자 활성화/비활성화
   */
  async setUseQueueManager(enabled: boolean): Promise<void> {
    this.useQueueManager = enabled;
    if (enabled && !this.queueManager) {
      await this.setupQueueManagerIntegration();
    }
  }

  /**
   * 큐 통계 가져오기
   */
  getQueueStats(): Map<string, any> | null {
    if (this.useQueueManager && this.queueManager) {
      return this.queueManager.getAllStats();
    }
    return null;
  }

  /**
   * 큐 매니저 가져오기
   */
  getQueueManager() {
    return this.queueManager;
  }

  /**
   * 통계 가져오기
   */
  getStats() {
    return {
      totalEvents: this.stats.totalEvents,
      lastEventTime: this.stats.lastEventTime,
      eventsByCategory: Object.fromEntries(this.stats.eventsByCategory),
      eventsBySeverity: Object.fromEntries(this.stats.eventsBySeverity),
      eventsPerHour: this.stats.eventsPerHour,
      subscriberCount: this.subscribers.size,
      transformerCount: Array.from(this.transformers.values()).flat().length,
      globalFilterCount: this.globalFilters.length
    };
  }
}

// 싱글톤 인스턴스
export const eventEngine = new EventEngine();
