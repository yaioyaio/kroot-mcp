/**
 * 실시간 이벤트 스트림 관리자
 * 이벤트 필터링, 버퍼링, 라우팅을 담당
 */

import { EventEmitter } from 'events';
import { eventEngine } from '../events/index.js';
import type { BaseEvent } from '../events/types/base.js';

/**
 * 스트림 필터 조건
 */
export interface StreamFilter {
  categories?: string[];
  severities?: string[];
  sources?: string[];
  timeWindow?: number; // 밀리초
  rateLimit?: number; // 초당 최대 이벤트 수
}

/**
 * 스트림 구독자
 */
interface StreamSubscriber {
  id: string;
  callback: (event: BaseEvent) => void;
  filter: StreamFilter;
  lastEventTime: number;
  eventCount: number;
  rateLimitBuffer: number[];
}

/**
 * 버퍼링된 이벤트
 */
interface BufferedEvent {
  event: BaseEvent;
  timestamp: number;
  processed: boolean;
}

/**
 * 스트림 통계
 */
export interface StreamStats {
  totalSubscribers: number;
  totalEvents: number;
  eventsPerSecond: number;
  bufferedEvents: number;
  droppedEvents: number;
  uptime: number;
}

/**
 * 실시간 이벤트 스트림 관리자
 */
export class EventStreamManager extends EventEmitter {
  private subscribers: Map<string, StreamSubscriber> = new Map();
  private eventBuffer: BufferedEvent[] = [];
  private stats = {
    totalEvents: 0,
    droppedEvents: 0,
    startTime: Date.now(),
  };
  private bufferSize = 1000; // 최대 버퍼 크기
  private cleanupInterval?: NodeJS.Timeout;
  private eventSubscriptionId?: string;

  constructor() {
    super();
    this.setupEventListeners();
    this.startCleanupTimer();
  }

  /**
   * 스트림 구독
   */
  subscribe(id: string, callback: (event: BaseEvent) => void, filter: StreamFilter = {}): void {
    const subscriber: StreamSubscriber = {
      id,
      callback,
      filter,
      lastEventTime: 0,
      eventCount: 0,
      rateLimitBuffer: [],
    };

    this.subscribers.set(id, subscriber);
    console.log(`[StreamManager] Subscriber added: ${id} (Total: ${this.subscribers.size})`);
    
    this.emit('subscriber_added', { id, filter });
  }

  /**
   * 스트림 구독 해제
   */
  unsubscribe(id: string): boolean {
    const removed = this.subscribers.delete(id);
    if (removed) {
      console.log(`[StreamManager] Subscriber removed: ${id} (Total: ${this.subscribers.size})`);
      this.emit('subscriber_removed', { id });
    }
    return removed;
  }

  /**
   * 구독자 필터 업데이트
   */
  updateFilter(id: string, filter: StreamFilter): boolean {
    const subscriber = this.subscribers.get(id);
    if (subscriber) {
      subscriber.filter = filter;
      console.log(`[StreamManager] Filter updated for subscriber: ${id}`);
      this.emit('filter_updated', { id, filter });
      return true;
    }
    return false;
  }

  /**
   * 이벤트 엔진 리스너 설정
   */
  private setupEventListeners(): void {
    this.eventSubscriptionId = eventEngine.subscribe('*', (event: BaseEvent) => {
      this.processEvent(event);
    });
  }

  /**
   * 이벤트 처리
   */
  private processEvent(event: BaseEvent): void {
    this.stats.totalEvents++;

    // 버퍼에 이벤트 추가
    this.addToBuffer(event);

    // 구독자들에게 이벤트 배포
    this.distributeEvent(event);

    this.emit('event_processed', event);
  }

  /**
   * 이벤트 버퍼에 추가
   */
  private addToBuffer(event: BaseEvent): void {
    const bufferedEvent: BufferedEvent = {
      event,
      timestamp: Date.now(),
      processed: false,
    };

    this.eventBuffer.push(bufferedEvent);

    // 버퍼 크기 제한
    if (this.eventBuffer.length > this.bufferSize) {
      const removed = this.eventBuffer.shift();
      if (removed && !removed.processed) {
        this.stats.droppedEvents++;
      }
    }
  }

  /**
   * 구독자들에게 이벤트 배포
   */
  private distributeEvent(event: BaseEvent): void {
    this.subscribers.forEach((subscriber) => {
      if (this.shouldDeliverEvent(subscriber, event)) {
        try {
          subscriber.callback(event);
          subscriber.eventCount++;
          subscriber.lastEventTime = Date.now();
          this.markEventAsProcessed(event);
        } catch (error) {
          console.error(`[StreamManager] Error delivering event to ${subscriber.id}:`, error);
          this.emit('delivery_error', { subscriberId: subscriber.id, error, event });
        }
      }
    });
  }

  /**
   * 이벤트 전달 여부 결정
   */
  private shouldDeliverEvent(subscriber: StreamSubscriber, event: BaseEvent): boolean {
    const { filter } = subscriber;

    // 카테고리 필터
    if (filter.categories && filter.categories.length > 0) {
      if (!filter.categories.includes(event.category)) {
        return false;
      }
    }

    // 심각도 필터
    if (filter.severities && filter.severities.length > 0) {
      if (!filter.severities.includes(event.severity)) {
        return false;
      }
    }

    // 소스 필터
    if (filter.sources && filter.sources.length > 0) {
      if (!filter.sources.includes(event.source)) {
        return false;
      }
    }

    // 시간 윈도우 필터
    if (filter.timeWindow) {
      const timeSinceLastEvent = Date.now() - subscriber.lastEventTime;
      if (timeSinceLastEvent < filter.timeWindow) {
        return false;
      }
    }

    // 레이트 리미팅
    if (filter.rateLimit) {
      if (!this.checkRateLimit(subscriber, filter.rateLimit)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 레이트 리미팅 확인
   */
  private checkRateLimit(subscriber: StreamSubscriber, rateLimit: number): boolean {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    // 1초 이내의 이벤트만 유지
    subscriber.rateLimitBuffer = subscriber.rateLimitBuffer.filter(time => time > oneSecondAgo);

    // 레이트 리미트 확인
    if (subscriber.rateLimitBuffer.length >= rateLimit) {
      return false;
    }

    // 현재 시간 추가
    subscriber.rateLimitBuffer.push(now);
    return true;
  }

  /**
   * 이벤트를 처리됨으로 표시
   */
  private markEventAsProcessed(event: BaseEvent): void {
    const bufferedEvent = this.eventBuffer.find(be => 
      be.event.id === event.id && !be.processed
    );
    if (bufferedEvent) {
      bufferedEvent.processed = true;
    }
  }

  /**
   * 정리 타이머 시작
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // 1분마다 정리
  }

  /**
   * 오래된 데이터 정리
   */
  private cleanup(): void {
    const now = Date.now();
    const fifteenMinutesAgo = now - (15 * 60 * 1000);

    // 오래된 버퍼 이벤트 제거
    const originalLength = this.eventBuffer.length;
    this.eventBuffer = this.eventBuffer.filter(be => be.timestamp > fifteenMinutesAgo);
    
    const removed = originalLength - this.eventBuffer.length;
    if (removed > 0) {
      console.log(`[StreamManager] Cleaned up ${removed} old buffered events`);
    }

    // 구독자들의 레이트 리미트 버퍼 정리
    this.subscribers.forEach((subscriber) => {
      subscriber.rateLimitBuffer = subscriber.rateLimitBuffer.filter(time => time > now - 1000);
    });

    this.emit('cleanup_completed', { removedEvents: removed });
  }

  /**
   * 스트림 통계 조회
   */
  getStats(): StreamStats {
    const now = Date.now();
    const uptime = (now - this.stats.startTime) / 1000; // 초 단위
    const eventsPerSecond = uptime > 0 ? this.stats.totalEvents / uptime : 0;

    return {
      totalSubscribers: this.subscribers.size,
      totalEvents: this.stats.totalEvents,
      eventsPerSecond: Math.round(eventsPerSecond * 100) / 100,
      bufferedEvents: this.eventBuffer.length,
      droppedEvents: this.stats.droppedEvents,
      uptime: Math.round(uptime),
    };
  }

  /**
   * 구독자 정보 조회
   */
  getSubscribers(): Array<{
    id: string;
    filter: StreamFilter;
    eventCount: number;
    lastEventTime: number;
  }> {
    return Array.from(this.subscribers.values()).map(sub => ({
      id: sub.id,
      filter: sub.filter,
      eventCount: sub.eventCount,
      lastEventTime: sub.lastEventTime,
    }));
  }

  /**
   * 버퍼링된 이벤트 조회
   */
  getBufferedEvents(limit: number = 50): BaseEvent[] {
    return this.eventBuffer
      .slice(-limit)
      .map(be => be.event);
  }

  /**
   * 특정 구독자에게 히스토리 이벤트 재생
   */
  replayEvents(subscriberId: string, fromTimestamp?: number): boolean {
    const subscriber = this.subscribers.get(subscriberId);
    if (!subscriber) {
      return false;
    }

    const fromTime = fromTimestamp || (Date.now() - 60000); // 기본 1분 전
    const eventsToReplay = this.eventBuffer
      .filter(be => be.timestamp >= fromTime)
      .map(be => be.event);

    console.log(`[StreamManager] Replaying ${eventsToReplay.length} events for ${subscriberId}`);

    eventsToReplay.forEach(event => {
      if (this.shouldDeliverEvent(subscriber, event)) {
        try {
          subscriber.callback(event);
        } catch (error) {
          console.error(`[StreamManager] Error replaying event to ${subscriberId}:`, error);
        }
      }
    });

    this.emit('events_replayed', { subscriberId, eventCount: eventsToReplay.length });
    return true;
  }

  /**
   * 시스템 이벤트 발행
   */
  emitSystemEvent(type: string, data: any): void {
    const systemEvent = {
      type: `stream:${type}`,
      timestamp: Date.now(),
      data,
    };

    this.emit('system_event', systemEvent);
  }

  /**
   * 스트림 매니저 정리
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined as any;
    }

    if (this.eventSubscriptionId) {
      eventEngine.unsubscribe(this.eventSubscriptionId);
      this.eventSubscriptionId = undefined as any;
    }

    this.subscribers.clear();
    this.eventBuffer = [];
    this.removeAllListeners();

    console.log('[StreamManager] Destroyed');
  }
}

// 전역 스트림 매니저 인스턴스
export const streamManager = new EventStreamManager();