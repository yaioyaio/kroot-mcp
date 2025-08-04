# DevFlow Monitor MCP - API Reference

## 목차
1. [MCP 도구 API](#mcp-도구-api)
2. [Core Classes](#core-classes)
3. [Event System](#event-system)
4. [Monitoring System](#monitoring-system)
5. [Analysis Engine](#analysis-engine)
6. [Storage Layer](#storage-layer)
7. [Security System](#security-system)
8. [Configuration](#configuration)

## MCP 도구 API

DevFlow Monitor는 37개의 MCP 도구를 제공합니다. 모든 도구는 Claude Desktop에서 자연어로 호출할 수 있습니다.

### 프로젝트 관리 도구

#### `getProjectStatus`
현재 프로젝트 상태와 시스템 메트릭을 조회합니다.

**Parameters:**
- 없음

**Returns:**
```typescript
{
  system: {
    cpu: number;      // CPU 사용률 (%)
    memory: number;   // 메모리 사용률 (%)
    disk: number;     // 디스크 사용률 (%)
  };
  monitors: {
    [key: string]: {
      active: boolean;
      status: string;
      lastUpdate: string;
    };
  };
  activity: {
    recent: Array<ActivityEvent>;
    summary: ActivitySummary;
  };
  milestones?: {
    current: string;
    progress: number;
    completed: string[];
  };
}
```

**Example:**
```
프로젝트 상태를 확인해주세요.
```

#### `getMetrics`
시간 범위별 메트릭 데이터를 조회합니다.

**Parameters:**
```typescript
{
  timeRange?: '1h' | '6h' | '1d' | '1w' | '1m';  // 기본값: '1d'
  category?: 'productivity' | 'quality' | 'performance' | 'collaboration';
  format?: 'detailed' | 'summary';              // 기본값: 'detailed'
}
```

**Returns:**
```typescript
{
  timeRange: string;
  metrics: {
    productivity: ProductivityMetrics;
    quality: QualityMetrics;
    performance: PerformanceMetrics;
    collaboration: CollaborationMetrics;
  };
  trends: {
    [key: string]: TrendData;
  };
  insights: string[];
}
```

### 개발 활동 분석 도구

#### `getActivityLog`
개발 활동 로그를 필터링하여 조회합니다.

**Parameters:**
```typescript
{
  timeRange?: string;           // '1h', '6h', '1d', '1w', '1m'
  category?: EventCategory;     // 'file', 'git', 'performance', 'ai' 등
  severity?: EventSeverity;     // 'critical', 'high', 'medium', 'low', 'info'
  limit?: number;              // 기본값: 100
  offset?: number;             // 기본값: 0
}
```

**Returns:**
```typescript
{
  events: Array<{
    id: string;
    type: string;
    category: EventCategory;
    severity: EventSeverity;
    timestamp: string;
    source: string;
    data: any;
    metadata?: any;
  }>;
  total: number;
  filtered: number;
  summary: {
    byCategory: Record<EventCategory, number>;
    bySeverity: Record<EventSeverity, number>;
    timeDistribution: Array<{
      time: string;
      count: number;
    }>;
  };
}
```

#### `analyzeStage`
현재 개발 단계를 분석합니다.

**Parameters:**
```typescript
{
  lookbackMinutes?: number;     // 분석할 시간 범위 (분)
  includeDetails?: boolean;     // 상세 정보 포함 여부
}
```

**Returns:**
```typescript
{
  currentStage: {
    name: string;               // 현재 단계명
    confidence: number;         // 신뢰도 (0-1)
    duration: number;           // 지속 시간 (분)
    activities: string[];       // 관련 활동들
  };
  recentTransitions: Array<{
    from: string;
    to: string;
    timestamp: string;
    confidence: number;
  }>;
  recommendations: string[];
  insights: string[];
}
```

### AI 협업 분석 도구

#### `analyzeAICollaboration`
AI 도구 사용 패턴을 분석합니다.

**Parameters:**
```typescript
{
  timeRange?: string;           // '1h', '6h', '1d', '1w', '1m'
  aiTool?: 'claude' | 'copilot' | 'chatgpt' | 'cursor' | 'tabnine' | 'codewhisperer';
  includeEffectiveness?: boolean;
}
```

**Returns:**
```typescript
{
  summary: {
    totalSessions: number;
    totalDuration: number;       // 분
    averageSessionLength: number; // 분
    mostUsedTool: string;
  };
  byTool: {
    [toolName: string]: {
      sessions: number;
      duration: number;
      acceptanceRate?: number;    // Copilot 등의 수락률
      productivity: number;       // 생산성 지수
      codeQuality: number;        // 코드 품질 개선도
    };
  };
  patterns: {
    peakHours: number[];         // 가장 활발한 시간대
    commonTasks: string[];       // 주로 사용하는 작업
    effectiveness: {
      timeSaved: number;         // 절약된 시간 (분)
      qualityImprovement: number; // 품질 개선도
      learningCurve: number;     // 학습 곡선
    };
  };
  recommendations: string[];
}
```

### 방법론 검증 도구

#### `checkMethodology`
개발 방법론 준수도를 검사합니다.

**Parameters:**
```typescript
{
  methodology: 'DDD' | 'TDD' | 'BDD' | 'EDA';
  timeRange?: string;
  strict?: boolean;             // 엄격한 검사 모드
}
```

**Returns:**
```typescript
{
  methodology: string;
  score: number;                // 준수도 점수 (0-100)
  violations: Array<{
    type: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    file?: string;
    line?: number;
    suggestion: string;
  }>;
  recommendations: string[];
  bestPractices: string[];
  resources: string[];          // 참고 자료 링크
}
```

### 리포트 생성 도구

#### `generateReport`
다양한 형태의 리포트를 생성합니다.

**Parameters:**
```typescript
{
  type: 'daily' | 'weekly' | 'monthly';
  sections?: Array<'summary' | 'productivity' | 'quality' | 'ai' | 'methodology'>;
  format?: 'markdown' | 'json' | 'html';
  includeCharts?: boolean;
}
```

**Returns:**
```typescript
{
  report: {
    title: string;
    period: {
      start: string;
      end: string;
    };
    summary: {
      totalEvents: number;
      codingTime: number;        // 분
      commits: number;
      aiUsage: number;           // 분
      productivity: number;      // 점수
    };
    sections: {
      [sectionName: string]: any;
    };
    charts?: {
      [chartName: string]: ChartData;
    };
  };
  insights: string[];
  recommendations: string[];
}
```

### 실시간 모니터링 도구

#### `startRealtimeMonitoring`
실시간 이벤트 스트리밍을 시작합니다.

**Parameters:**
```typescript
{
  filters?: {
    categories?: EventCategory[];
    severities?: EventSeverity[];
    sources?: string[];
  };
  options?: {
    bufferSize?: number;        // 버퍼 크기
    flushInterval?: number;     // 플러시 간격 (ms)
  };
}
```

#### `stopRealtimeMonitoring`
실시간 모니터링을 중지합니다.

#### `getRealtimeStats`
실시간 모니터링 통계를 조회합니다.

### 성능 최적화 도구

#### `getPerformanceReport`
성능 분석 리포트를 생성합니다.

#### `optimizePerformance`
자동 성능 최적화를 실행합니다.

#### `getOptimizationMetrics`
최적화 메트릭을 조회합니다.

#### `startPerformanceProfiling`
성능 프로파일링을 시작합니다.

#### `getCacheStatus`
캐시 상태를 조회합니다.

### 보안 관리 도구

#### `generateSecureToken`
보안 토큰을 생성합니다.

#### `validateApiKey`
API 키를 검증합니다.

#### `getUserPermissions`
사용자 권한을 조회합니다.

#### `getSecurityAuditLog`
보안 감사 로그를 조회합니다.

#### `encryptData`
데이터를 암호화합니다.

#### `decryptData`
데이터를 복호화합니다.

#### `getSecurityMetrics`
보안 메트릭을 조회합니다.

#### `rotateEncryptionKeys`
암호화 키를 순환합니다.

### 알림 시스템 도구

#### `configureNotifications`
알림 설정을 구성합니다.

#### `sendNotification`
즉시 알림을 발송합니다.

#### `getNotificationHistory`
알림 히스토리를 조회합니다.

#### `testNotificationChannels`
알림 채널을 테스트합니다.

#### `getNotificationStats`
알림 통계를 조회합니다.

### 대시보드 도구

#### `startDashboard`
대시보드를 시작합니다.

#### `getDashboardStatus`
대시보드 상태를 조회합니다.

## Core Classes

### EventEngine
이벤트 시스템의 핵심 클래스입니다.

```typescript
class EventEngine extends EventEmitter {
  // 이벤트 발행
  emit(eventType: string, data: any): boolean;
  
  // 이벤트 구독
  on(eventType: string, listener: Function): this;
  
  // 이벤트 구독 해제
  off(eventType: string, listener: Function): this;
  
  // 이벤트 통계 조회
  getStats(): EventStats;
  
  // 이벤트 히스토리 조회
  getHistory(options?: HistoryOptions): EventHistory;
}
```

### BaseMonitor
모든 모니터의 기본 클래스입니다.

```typescript
abstract class BaseMonitor extends EventEmitter {
  protected name: string;
  protected active: boolean;
  protected config: MonitorConfig;
  
  // 모니터 시작
  abstract start(): Promise<void>;
  
  // 모니터 중지
  abstract stop(): Promise<void>;
  
  // 상태 조회
  getStatus(): MonitorStatus;
  
  // 설정 업데이트
  updateConfig(config: Partial<MonitorConfig>): void;
}
```

### FileMonitor
파일 시스템 모니터링 클래스입니다.

```typescript
class FileMonitor extends BaseMonitor {
  private watcher: FSWatcher;
  private ignorePatterns: string[];
  private watchExtensions: string[];
  
  // 파일 변경 감지 시작
  start(): Promise<void>;
  
  // 파일 변경 감지 중지
  stop(): Promise<void>;
  
  // 감시 패턴 설정
  setWatchPatterns(patterns: string[]): void;
  
  // 제외 패턴 설정
  setIgnorePatterns(patterns: string[]): void;
}
```

### GitMonitor
Git 활동 모니터링 클래스입니다.

```typescript
class GitMonitor extends BaseMonitor {
  private git: SimpleGit;
  private pollInterval: number;
  
  // Git 활동 감지 시작
  start(): Promise<void>;
  
  // Git 활동 감지 중지
  stop(): Promise<void>;
  
  // 커밋 정보 조회
  getCommitInfo(hash: string): Promise<CommitInfo>;
  
  // 브랜치 정보 조회
  getBranchInfo(): Promise<BranchInfo>;
}
```

## Event System

### 이벤트 타입

#### BaseEvent
모든 이벤트의 기본 인터페이스입니다.

```typescript
interface BaseEvent {
  id: string;
  type: string;
  category: EventCategory;
  severity: EventSeverity;
  timestamp: Date;
  source: string;
  data: any;
  metadata?: Record<string, any>;
}
```

#### EventCategory
이벤트 카테고리 열거형입니다.

```typescript
enum EventCategory {
  FILE = 'file',
  GIT = 'git',
  PERFORMANCE = 'performance',
  AI = 'ai',
  SECURITY = 'security',
  SYSTEM = 'system',
  USER = 'user'
}
```

#### EventSeverity
이벤트 심각도 열거형입니다.

```typescript
enum EventSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info'
}
```

### 이벤트 큐 시스템

#### EventQueue
우선순위 기반 이벤트 큐입니다.

```typescript
class EventQueue {
  // 이벤트 추가
  enqueue(event: BaseEvent, priority?: number): void;
  
  // 이벤트 제거
  dequeue(): BaseEvent | null;
  
  // 큐 크기 조회
  size(): number;
  
  // 큐 비우기
  clear(): void;
  
  // 이벤트 필터링
  filter(predicate: (event: BaseEvent) => boolean): BaseEvent[];
}
```

## Monitoring System

### 개발 단계 인식

#### StageAnalyzer
개발 단계를 자동 인식하는 클래스입니다.

```typescript
class StageAnalyzer {
  // 현재 단계 분석
  analyzeCurrentStage(events: BaseEvent[]): StageAnalysis;
  
  // 단계 전환 감지
  detectTransition(from: string, to: string): TransitionInfo;
  
  // 단계별 패턴 등록
  registerPattern(stage: string, pattern: StagePattern): void;
}
```

#### 지원하는 개발 단계

1. **Planning** - 계획 및 설계
2. **Setup** - 환경 설정
3. **Implementation** - 구현
4. **Testing** - 테스트
5. **Debugging** - 디버깅
6. **Refactoring** - 리팩토링
7. **Documentation** - 문서화
8. **Review** - 코드 리뷰
9. **Integration** - 통합
10. **Deployment** - 배포
11. **Maintenance** - 유지보수
12. **Research** - 조사 및 학습
13. **Optimization** - 최적화

### AI 협업 추적

#### AIMonitor
AI 도구 사용을 추적하는 클래스입니다.

```typescript
class AIMonitor extends BaseMonitor {
  // AI 사용 세션 추적
  trackSession(tool: AITool, session: AISession): void;
  
  // 코드 제안 추적
  trackSuggestion(suggestion: CodeSuggestion): void;
  
  // 효과성 분석
  analyzeEffectiveness(timeRange: string): EffectivenessReport;
}
```

#### 지원하는 AI 도구

- **Claude API** - Anthropic Claude
- **GitHub Copilot** - GitHub의 AI 코딩 어시스턴트
- **ChatGPT** - OpenAI ChatGPT
- **Cursor** - AI 기반 코드 에디터
- **TabNine** - AI 코드 완성 도구
- **CodeWhisperer** - Amazon의 AI 코딩 어시스턴트

## Analysis Engine

### 메트릭 수집

#### MetricsCollector
다양한 메트릭을 수집하는 클래스입니다.

```typescript
class MetricsCollector {
  // 생산성 메트릭 수집
  collectProductivityMetrics(timeRange: string): ProductivityMetrics;
  
  // 품질 메트릭 수집
  collectQualityMetrics(timeRange: string): QualityMetrics;
  
  // 성능 메트릭 수집
  collectPerformanceMetrics(): PerformanceMetrics;
  
  // 협업 메트릭 수집
  collectCollaborationMetrics(timeRange: string): CollaborationMetrics;
}
```

### 병목 현상 감지

#### BottleneckDetector
성능 병목 현상을 감지하는 클래스입니다.

```typescript
class BottleneckDetector {
  // 병목 현상 감지
  detectBottlenecks(): BottleneckReport;
  
  // 임계값 설정
  setThresholds(thresholds: PerformanceThresholds): void;
  
  // 자동 최적화 제안
  suggestOptimizations(bottlenecks: Bottleneck[]): OptimizationSuggestion[];
}
```

## Storage Layer

### Repository 패턴

#### BaseRepository
모든 저장소의 기본 클래스입니다.

```typescript
abstract class BaseRepository<T> {
  protected db: Database;
  protected tableName: string;
  
  // 항목 생성
  abstract create(data: Omit<T, 'id'>): Promise<T>;
  
  // 항목 조회
  abstract findById(id: string): Promise<T | null>;
  
  // 항목 업데이트
  abstract update(id: string, data: Partial<T>): Promise<T>;
  
  // 항목 삭제
  abstract delete(id: string): Promise<boolean>;
  
  // 목록 조회
  abstract findAll(options?: QueryOptions): Promise<T[]>;
}
```

### 데이터베이스 스키마

#### Events 테이블
```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  source TEXT NOT NULL,
  data TEXT NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Metrics 테이블
```sql
CREATE TABLE metrics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  category TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Security System

### 인증 및 권한

#### SecurityManager
보안 관리 통합 클래스입니다.

```typescript
class SecurityManager {
  // 토큰 생성
  generateToken(payload: TokenPayload): Promise<TokenResult>;
  
  // 토큰 검증
  verifyToken(token: string): Promise<TokenVerification>;
  
  // API 키 생성
  generateApiKey(userId: string): Promise<ApiKeyResult>;
  
  // 권한 검사
  checkPermission(userId: string, permission: PermissionCheck): Promise<boolean>;
}
```

### RBAC (Role-Based Access Control)

#### RBACManager
역할 기반 접근 제어 관리자입니다.

```typescript
class RBACManager {
  // 역할 생성
  createRole(role: Role): Promise<Role>;
  
  // 사용자에게 역할 할당
  assignRole(assignment: RoleAssignment): Promise<boolean>;
  
  // 권한 확인
  hasPermission(userId: string, permission: string): Promise<boolean>;
}
```

### 데이터 암호화

#### EncryptionManager
데이터 암호화/복호화 관리자입니다.

```typescript
class EncryptionManager {
  // 데이터 암호화
  encrypt(data: string, key?: string): Promise<EncryptionResult>;
  
  // 데이터 복호화
  decrypt(input: DecryptionInput): Promise<string>;
  
  // 키 순환
  rotateKeys(): Promise<KeyRotationResult>;
}
```

## Configuration

### ConfigLoader
환경별 설정 로더입니다.

```typescript
class ConfigLoader {
  // 설정 로드
  load(): AppConfig;
  
  // 설정 값 조회
  getValue<T>(path: string): T | undefined;
  
  // 설정 리로드
  reload(): AppConfig;
  
  // 환경 확인
  getEnvironment(): string;
  isProduction(): boolean;
  isDevelopment(): boolean;
  isTest(): boolean;
}
```

### 설정 구조

#### AppConfig
애플리케이션 전체 설정 인터페이스입니다.

```typescript
interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  monitoring: MonitoringConfig;
  events: EventsConfig;
  performance: PerformanceConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
  notifications: NotificationsConfig;
  debug?: DebugConfig;
}
```

## 오류 처리

### 공통 오류 타입

```typescript
interface APIError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
}

// 오류 코드
enum ErrorCodes {
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}
```

## 버전 호환성

- **API 버전**: v0.1.0
- **MCP 프로토콜**: 0.6.x
- **Node.js**: >=20.0.0
- **TypeScript**: >=5.3.0

---

**참고**: 이 API 참조는 DevFlow Monitor MCP v0.1.0 기준으로 작성되었습니다. 최신 정보는 [GitHub 저장소](https://github.com/yaioyaio/kroot-mcp)를 확인하세요.

**최종 수정일**: 2025-08-04