/**
 * 방법론 모니터링 관련 타입 정의
 */

/**
 * 지원하는 개발 방법론
 */
export enum DevelopmentMethodology {
  DDD = 'DDD',
  TDD = 'TDD',
  BDD = 'BDD',
  EDA = 'EDA'
}

/**
 * DDD (Domain-Driven Design) 패턴
 */
export enum DDDPattern {
  DOMAIN_MODEL = 'domain_model',
  BOUNDED_CONTEXT = 'bounded_context',
  AGGREGATE = 'aggregate',
  VALUE_OBJECT = 'value_object',
  ENTITY = 'entity',
  REPOSITORY = 'repository',
  SERVICE = 'service',
  FACTORY = 'factory',
  UBIQUITOUS_LANGUAGE = 'ubiquitous_language'
}

/**
 * TDD (Test-Driven Development) 사이클 단계
 */
export enum TDDCycle {
  RED = 'red',       // 실패하는 테스트 작성
  GREEN = 'green',   // 테스트 통과하는 최소 코드 작성
  REFACTOR = 'refactor' // 코드 개선
}

/**
 * BDD (Behavior-Driven Development) 요소
 */
export enum BDDElement {
  FEATURE = 'feature',
  SCENARIO = 'scenario',
  GIVEN = 'given',
  WHEN = 'when',
  THEN = 'then',
  AND = 'and',
  BUT = 'but'
}

/**
 * EDA (Event-Driven Architecture) 패턴
 */
export enum EDAPattern {
  EVENT = 'event',
  EVENT_HANDLER = 'event_handler',
  EVENT_STORE = 'event_store',
  SAGA = 'saga',
  CQRS = 'cqrs',
  EVENT_SOURCING = 'event_sourcing',
  COMMAND = 'command',
  QUERY = 'query',
  PROJECTION = 'projection'
}

/**
 * 방법론 감지 결과
 */
export interface MethodologyDetection {
  methodology: DevelopmentMethodology;
  pattern?: DDDPattern | TDDCycle | BDDElement | EDAPattern;
  confidence: number;
  evidence: string[];
  timestamp: number;
  filePath?: string;
  codeSnippet?: string;
}

/**
 * 방법론 준수도 점수
 */
export interface MethodologyScore {
  methodology: DevelopmentMethodology;
  score: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  details: Record<string, any>;
}

/**
 * 방법론 분석 결과
 */
export interface MethodologyAnalysisResult {
  timestamp: number;
  detections: MethodologyDetection[];
  scores: Record<DevelopmentMethodology, MethodologyScore>;
  overallScore: number;
  dominantMethodology: DevelopmentMethodology | null;
  trends: MethodologyTrend[];
}

/**
 * 방법론 사용 트렌드
 */
export interface MethodologyTrend {
  methodology: DevelopmentMethodology;
  usage: number[]; // 시간대별 사용 횟수
  timeWindow: 'hour' | 'day' | 'week';
  growth: number; // 성장률 (%)
}

/**
 * 방법론 감지 규칙
 */
export interface MethodologyDetectionRule {
  methodology: DevelopmentMethodology;
  patterns: RegExp[];
  filePatterns?: string[];
  requiredKeywords?: string[];
  excludeKeywords?: string[];
  minConfidence: number;
}

/**
 * TDD 사이클 상태
 */
export interface TDDCycleState {
  currentPhase: TDDCycle;
  phaseStartTime: number;
  testCount: number;
  failingTests: number;
  passingTests: number;
  coverage: number;
  cycleCount: number;
  averageCycleTime: number;
}

/**
 * DDD 컨텍스트 맵
 */
export interface DDDContextMap {
  boundedContexts: Map<string, BoundedContextInfo>;
  relationships: ContextRelationship[];
  ubiquitousTerms: Set<string>;
  aggregates: Map<string, AggregateInfo>;
}

export interface BoundedContextInfo {
  name: string;
  path: string;
  entities: string[];
  valueObjects: string[];
  services: string[];
  repositories: string[];
}

export interface ContextRelationship {
  from: string;
  to: string;
  type: 'shared_kernel' | 'customer_supplier' | 'conformist' | 'anticorruption_layer' | 'open_host_service' | 'published_language';
}

export interface AggregateInfo {
  name: string;
  rootEntity: string;
  entities: string[];
  valueObjects: string[];
  domainEvents: string[];
}

/**
 * BDD 시나리오 정보
 */
export interface BDDScenario {
  feature: string;
  scenario: string;
  steps: BDDStep[];
  tags: string[];
  status: 'pending' | 'passing' | 'failing' | 'skipped';
  filePath: string;
}

export interface BDDStep {
  type: BDDElement;
  text: string;
  parameters?: Record<string, any>;
  status?: 'pending' | 'passing' | 'failing' | 'skipped';
}

/**
 * EDA 이벤트 플로우
 */
export interface EDAEventFlow {
  events: Map<string, EventInfo>;
  handlers: Map<string, HandlerInfo>;
  sagas: Map<string, SagaInfo>;
  eventFlows: EventFlowEdge[];
}

export interface EventInfo {
  name: string;
  type: 'command' | 'domain_event' | 'integration_event';
  schema?: Record<string, any>;
  producers: string[];
  consumers: string[];
}

export interface HandlerInfo {
  name: string;
  eventTypes: string[];
  handlerType: 'sync' | 'async' | 'saga';
  filePath: string;
}

export interface SagaInfo {
  name: string;
  steps: string[];
  compensations: string[];
  status: 'active' | 'completed' | 'compensating' | 'failed';
}

export interface EventFlowEdge {
  from: string;
  to: string;
  eventType: string;
  isAsync: boolean;
}

/**
 * 방법론 분석기 이벤트
 */
export interface MethodologyAnalyzerEvents {
  methodologyDetected: (detection: MethodologyDetection) => void;
  tddCycleChanged: (state: TDDCycleState) => void;
  dddPatternFound: (pattern: DDDPattern, context: DDDContextMap) => void;
  bddScenarioUpdated: (scenario: BDDScenario) => void;
  edaEventFlowChanged: (flow: EDAEventFlow) => void;
  scoreUpdated: (scores: Record<DevelopmentMethodology, MethodologyScore>) => void;
}