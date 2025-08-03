/**
 * 기본 이벤트 인터페이스
 * 모든 이벤트가 상속해야 하는 기본 구조를 정의합니다.
 */

/**
 * 이벤트 심각도 레벨
 */
export enum EventSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

/**
 * 이벤트 카테고리
 */
export enum EventCategory {
  SYSTEM = 'system',
  FILE = 'file',
  GIT = 'git',
  BUILD = 'build',
  TEST = 'test',
  DEPLOY = 'deploy',
  API = 'api',
  USER = 'user',
  AI = 'ai',
  ACTIVITY = 'activity',
  STAGE = 'stage',
}

/**
 * 기본 이벤트 인터페이스
 */
export interface BaseEvent {
  /** 고유 이벤트 ID */
  id: string;

  /** 이벤트 타입 (예: 'file:changed', 'git:commit') */
  type: string;

  /** 이벤트 카테고리 */
  category: EventCategory;

  /** 이벤트 발생 시간 (Unix timestamp in milliseconds) */
  timestamp: number;

  /** 이벤트 심각도 */
  severity: EventSeverity;

  /** 이벤트 소스 (발생 위치) */
  source: string;

  /** 이벤트 데이터 */
  data: Record<string, any>;

  /** 메타데이터 (선택적) */
  metadata?: EventMetadata;

  /** 상관관계 ID (관련 이벤트 추적용) */
  correlationId?: string;

  /** 부모 이벤트 ID */
  parentId?: string;
}

/**
 * 이벤트 메타데이터
 */
export interface EventMetadata {
  /** 환경 정보 */
  environment?: string;

  /** 사용자 정보 */
  userId?: string;

  /** 세션 ID */
  sessionId?: string;

  /** 프로젝트 정보 */
  projectId?: string;

  /** 추가 태그 */
  tags?: string[];

  /** 기타 메타데이터 */
  [key: string]: any;
}

/**
 * 이벤트 핸들러 인터페이스
 */
export interface EventHandler<T extends BaseEvent = BaseEvent> {
  (event: T): void | Promise<void>;
}

/**
 * 이벤트 필터 인터페이스
 */
export interface EventFilter<T extends BaseEvent = BaseEvent> {
  (event: T): boolean;
}

/**
 * 이벤트 변환기 인터페이스
 */
export interface EventTransformer<
  T extends BaseEvent = BaseEvent,
  R extends BaseEvent = BaseEvent,
> {
  (event: T): R | Promise<R>;
}

/**
 * 이벤트 구독 옵션
 */
export interface EventSubscriptionOptions {
  /** 필터 조건 */
  filter?: EventFilter;

  /** 우선순위 (높을수록 먼저 처리) */
  priority?: number;

  /** 한 번만 실행 */
  once?: boolean;

  /** 비동기 처리 여부 */
  async?: boolean;
}

/**
 * 이벤트 발행 옵션
 */
export interface EventPublishOptions {
  /** 동기 처리 강제 */
  sync?: boolean;

  /** 타임아웃 (ms) */
  timeout?: number;

  /** 재시도 횟수 */
  retries?: number;

  /** 큐 사용 여부 (기본값: true) */
  useQueue?: boolean;

  /** 이벤트 지속성 여부 (기본값: true) */
  persist?: boolean;
}

/**
 * 이벤트 배치
 */
export interface EventBatch<T extends BaseEvent = BaseEvent> {
  /** 배치 ID */
  id: string;

  /** 배치 내 이벤트들 */
  events: T[];

  /** 배치 생성 시간 */
  createdAt: number;

  /** 배치 메타데이터 */
  metadata?: Record<string, unknown>;
}

/**
 * 이벤트 통계
 */
export interface EventStatistics {
  /** 총 이벤트 수 */
  totalEvents: number;

  /** 카테고리별 이벤트 수 */
  eventsByCategory: Record<EventCategory, number>;

  /** 심각도별 이벤트 수 */
  eventsBySeverity: Record<EventSeverity, number>;

  /** 시간당 이벤트 수 */
  eventsPerHour: number;

  /** 마지막 이벤트 시간 */
  lastEventTime?: Date;
}

/**
 * 이벤트 스토어 인터페이스
 */
export interface EventStore {
  /** 이벤트 저장 */
  save(event: BaseEvent): Promise<void>;

  /** 이벤트 조회 */
  get(id: string): Promise<BaseEvent | undefined>;

  /** 이벤트 검색 */
  search(criteria: Partial<BaseEvent>): Promise<BaseEvent[]>;

  /** 이벤트 삭제 */
  delete(id: string): Promise<void>;

  /** 통계 조회 */
  getStatistics(): Promise<EventStatistics>;
}
