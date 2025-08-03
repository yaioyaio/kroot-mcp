/**
 * 이벤트 빌더 유틸리티
 * 이벤트 생성을 위한 헬퍼 함수들
 */

import {
  BaseEvent,
  EventCategory,
  EventSeverity,
} from './types/index.js';

/**
 * 기본 이벤트 생성
 */
export function createEvent(
  type: string,
  category: EventCategory,
  data: Record<string, any>,
  options: Partial<BaseEvent> = {}
): BaseEvent {
  return {
    id: options.id || generateEventId(),
    type,
    category,
    timestamp: options.timestamp || Date.now(),
    severity: options.severity || EventSeverity.INFO,
    source: options.source || 'unknown',
    data,
    ...(options.metadata && { metadata: options.metadata }),
    ...(options.correlationId && { correlationId: options.correlationId }),
    ...(options.parentId && { parentId: options.parentId }),
  };
}

/**
 * 이벤트 ID 생성
 */
export function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 이벤트 배치 생성
 */
export function createEventBatch<T extends BaseEvent = BaseEvent>(
  events: T[],
  metadata?: Record<string, any>
) {
  return {
    id: `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    events,
    count: events.length,
    timestamp: Date.now(),
    metadata,
  };
}