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
    _options: EventPublishOptions = {},
  ): Promise<void> {
    // 통계 업데이트
    this.updateStatistics(event);

    // 전역 필터 적용
    if (!this.applyGlobalFilters(event)) {
      return;
    }

    // 변환기 적용
    const transformedEvent = await this.applyTransformers(event);

    // 이벤트 큐에 추가
    this.eventQueue.push(transformedEvent);

    // EventEmitter3로 이벤트 발행 (processEvent에서 구독자 처리는 별도)
    this.emit(transformedEvent.type, transformedEvent);
    this.emit('*', transformedEvent);
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
      lastEventTime: this.stats.lastEventTime as Date,
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
    this.stats.lastEventTime = Date.now();

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
}

// 싱글톤 인스턴스
export const eventEngine = new EventEngine();
