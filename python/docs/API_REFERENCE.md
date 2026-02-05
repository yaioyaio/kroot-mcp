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

DevFlow Monitor는 88개의 MCP 도구를 제공합니다. 모든 도구는 Claude Desktop에서 자연어로 호출할 수 있습니다.

### 프로젝트 관리 도구

#### `getProjectStatus`
현재 프로젝트 상태와 시스템 메트릭을 조회합니다.

**Parameters:**
- 없음

**Returns:**
```python
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
```python
{
  timeRange?: '1h' | '6h' | '1d' | '1w' | '1m';  // 기본값: '1d'
  category?: 'productivity' | 'quality' | 'performance' | 'collaboration';
  format?: 'detailed' | 'summary';              // 기본값: 'detailed'
}
```

**Returns:**
```python
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
```python
{
  timeRange?: string;           // '1h', '6h', '1d', '1w', '1m'
  category?: EventCategory;     // 'file', 'git', 'performance', 'ai' 등
  severity?: EventSeverity;     // 'critical', 'high', 'medium', 'low', 'info'
  limit?: number;              // 기본값: 100
  offset?: number;             // 기본값: 0
}
```

**Returns:**
```python
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
```python
{
  lookbackMinutes?: number;     // 분석할 시간 범위 (분)
  includeDetails?: boolean;     // 상세 정보 포함 여부
}
```

**Returns:**
```python
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
```python
{
  timeRange?: string;           // '1h', '6h', '1d', '1w', '1m'
  aiTool?: 'claude' | 'copilot' | 'chatgpt' | 'cursor' | 'tabnine' | 'codewhisperer';
  includeEffectiveness?: boolean;
}
```

**Returns:**
```python
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
```python
{
  methodology: 'DDD' | 'TDD' | 'BDD' | 'EDA';
  timeRange?: string;
  strict?: boolean;             // 엄격한 검사 모드
}
```

**Returns:**
```python
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
```python
{
  type: 'daily' | 'weekly' | 'monthly';
  sections?: Array<'summary' | 'productivity' | 'quality' | 'ai' | 'methodology'>;
  format?: 'markdown' | 'json' | 'html';
  includeCharts?: boolean;
}
```

**Returns:**
```python
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
```python
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
이벤트 시스템의 핵심 클래스입니다. pyee 라이브러리를 사용합니다.

```python
class EventEngine:
    """이벤트 엔진."""

    def __init__(self):
        self._emitter = EventEmitter()

    def emit(self, event_type: str, data: Any) -> bool:
        """이벤트 발행."""
        ...

    def on(self, event_type: str, listener: Callable) -> None:
        """이벤트 구독."""
        ...

    def off(self, event_type: str, listener: Callable) -> None:
        """이벤트 구독 해제."""
        ...

    def get_stats(self) -> EventStats:
        """이벤트 통계 조회."""
        ...

    def get_history(self, options: Optional[HistoryOptions] = None) -> EventHistory:
        """이벤트 히스토리 조회."""
        ...
```

### BaseMonitor
모든 모니터의 기본 클래스입니다.

```python
from abc import ABC, abstractmethod

class BaseMonitor(ABC):
    """모니터 기본 클래스."""

    def __init__(self, config: MonitorConfig):
        self.name: str = ""
        self.active: bool = False
        self.config: MonitorConfig = config

    @abstractmethod
    async def start(self) -> None:
        """모니터 시작."""
        ...

    @abstractmethod
    async def stop(self) -> None:
        """모니터 중지."""
        ...

    def get_status(self) -> MonitorStatus:
        """상태 조회."""
        ...

    def update_config(self, config: MonitorConfig) -> None:
        """설정 업데이트."""
        ...
```

### FileMonitor
파일 시스템 모니터링 클래스입니다. watchfiles 라이브러리를 사용합니다.

```python
class FileMonitor(BaseMonitor):
    """파일 시스템 모니터."""

    def __init__(self, config: FileMonitorConfig):
        self.watcher: Optional[Any] = None
        self.ignore_patterns: list[str] = []
        self.watch_extensions: list[str] = []

    async def start(self) -> None:
        """파일 변경 감지 시작."""
        ...

    async def stop(self) -> None:
        """파일 변경 감지 중지."""
        ...

    def set_watch_patterns(self, patterns: list[str]) -> None:
        """감시 패턴 설정."""
        ...

    def set_ignore_patterns(self, patterns: list[str]) -> None:
        """제외 패턴 설정."""
        ...
```

### GitMonitor
Git 활동 모니터링 클래스입니다. GitPython 라이브러리를 사용합니다.

```python
class GitMonitor(BaseMonitor):
    """Git 활동 모니터."""

    def __init__(self, config: GitMonitorConfig):
        self.repo: Optional[Repo] = None  # GitPython Repo
        self.poll_interval: int = 30000

    async def start(self) -> None:
        """Git 활동 감지 시작."""
        ...

    async def stop(self) -> None:
        """Git 활동 감지 중지."""
        ...

    async def get_commit_info(self, hash: str) -> CommitInfo:
        """커밋 정보 조회."""
        ...

    async def get_branch_info(self) -> BranchInfo:
        """브랜치 정보 조회."""
        ...
```

## Event System

### 이벤트 타입

#### BaseEvent
모든 이벤트의 기본 클래스입니다.

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

@dataclass
class BaseEvent:
    id: str
    type: str
    category: EventCategory
    severity: EventSeverity
    timestamp: datetime
    source: str
    data: Any
    metadata: Optional[dict[str, Any]] = None
```

#### EventCategory
이벤트 카테고리 열거형입니다.

```python
from enum import Enum

class EventCategory(str, Enum):
    FILE = "file"
    GIT = "git"
    PERFORMANCE = "performance"
    AI = "ai"
    SECURITY = "security"
    SYSTEM = "system"
    USER = "user"
```

#### EventSeverity
이벤트 심각도 열거형입니다.

```python
from enum import Enum

class EventSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"
```

### 이벤트 큐 시스템

#### EventQueue
우선순위 기반 이벤트 큐입니다.

```python
from typing import Callable, Optional

class EventQueue:
    """우선순위 기반 이벤트 큐."""

    def enqueue(self, event: BaseEvent, priority: Optional[int] = None) -> None:
        """이벤트 추가."""
        ...

    def dequeue(self) -> Optional[BaseEvent]:
        """이벤트 제거."""
        ...

    def size(self) -> int:
        """큐 크기 조회."""
        ...

    def clear(self) -> None:
        """큐 비우기."""
        ...

    def filter(self, predicate: Callable[[BaseEvent], bool]) -> list[BaseEvent]:
        """이벤트 필터링."""
        ...
```

## Monitoring System

### 개발 단계 인식

#### StageAnalyzer
개발 단계를 자동 인식하는 클래스입니다.

```python
class StageAnalyzer:
    """개발 단계 분석기."""

    def analyze_current_stage(self, events: list[BaseEvent]) -> StageAnalysis:
        """현재 단계 분석."""
        ...

    def detect_transition(self, from_stage: str, to_stage: str) -> TransitionInfo:
        """단계 전환 감지."""
        ...

    def register_pattern(self, stage: str, pattern: StagePattern) -> None:
        """단계별 패턴 등록."""
        ...
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

```python
class AIMonitor(BaseMonitor):
    """AI 도구 사용 추적 모니터."""

    def track_session(self, tool: AITool, session: AISession) -> None:
        """AI 사용 세션 추적."""
        ...

    def track_suggestion(self, suggestion: CodeSuggestion) -> None:
        """코드 제안 추적."""
        ...

    def analyze_effectiveness(self, time_range: str) -> EffectivenessReport:
        """효과성 분석."""
        ...
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

```python
class MetricsCollector:
    """메트릭 수집기."""

    def collect_productivity_metrics(self, time_range: str) -> ProductivityMetrics:
        """생산성 메트릭 수집."""
        ...

    def collect_quality_metrics(self, time_range: str) -> QualityMetrics:
        """품질 메트릭 수집."""
        ...

    def collect_performance_metrics(self) -> PerformanceMetrics:
        """성능 메트릭 수집."""
        ...

    def collect_collaboration_metrics(self, time_range: str) -> CollaborationMetrics:
        """협업 메트릭 수집."""
        ...
```

### 병목 현상 감지

#### BottleneckDetector
성능 병목 현상을 감지하는 클래스입니다.

```python
class BottleneckDetector:
    """병목 현상 감지기."""

    def detect_bottlenecks(self) -> BottleneckReport:
        """병목 현상 감지."""
        ...

    def set_thresholds(self, thresholds: PerformanceThresholds) -> None:
        """임계값 설정."""
        ...

    def suggest_optimizations(
        self, bottlenecks: list[Bottleneck]
    ) -> list[OptimizationSuggestion]:
        """자동 최적화 제안."""
        ...
```

## Storage Layer

### Repository 패턴

#### BaseRepository
모든 저장소의 기본 클래스입니다.

```python
from abc import ABC, abstractmethod
from typing import Generic, Optional, TypeVar

T = TypeVar("T")

class BaseRepository(ABC, Generic[T]):
    """저장소 기본 클래스."""

    def __init__(self):
        self._db: Database = None  # type: ignore
        self._table_name: str = ""

    @abstractmethod
    async def create(self, data: dict) -> T:
        """항목 생성."""
        ...

    @abstractmethod
    async def find_by_id(self, id: str) -> Optional[T]:
        """항목 조회."""
        ...

    @abstractmethod
    async def update(self, id: str, data: dict) -> T:
        """항목 업데이트."""
        ...

    @abstractmethod
    async def delete(self, id: str) -> bool:
        """항목 삭제."""
        ...

    @abstractmethod
    async def find_all(self, options: Optional[QueryOptions] = None) -> list[T]:
        """목록 조회."""
        ...
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

```python
class SecurityManager:
    """보안 관리자."""

    async def generate_token(self, payload: TokenPayload) -> TokenResult:
        """토큰 생성."""
        ...

    async def verify_token(self, token: str) -> TokenVerification:
        """토큰 검증."""
        ...

    async def generate_api_key(self, user_id: str) -> ApiKeyResult:
        """API 키 생성."""
        ...

    async def check_permission(
        self, user_id: str, permission: PermissionCheck
    ) -> bool:
        """권한 검사."""
        ...
```

### RBAC (Role-Based Access Control)

#### RBACManager
역할 기반 접근 제어 관리자입니다.

```python
class RBACManager:
    """역할 기반 접근 제어 관리자."""

    async def create_role(self, role: Role) -> Role:
        """역할 생성."""
        ...

    async def assign_role(self, assignment: RoleAssignment) -> bool:
        """사용자에게 역할 할당."""
        ...

    async def has_permission(self, user_id: str, permission: str) -> bool:
        """권한 확인."""
        ...
```

### 데이터 암호화

#### EncryptionManager
데이터 암호화/복호화 관리자입니다.

```python
from typing import Optional

class EncryptionManager:
    """데이터 암호화/복호화 관리자."""

    async def encrypt(
        self, data: str, key: Optional[str] = None
    ) -> EncryptionResult:
        """데이터 암호화."""
        ...

    async def decrypt(self, input: DecryptionInput) -> str:
        """데이터 복호화."""
        ...

    async def rotate_keys(self) -> KeyRotationResult:
        """키 순환."""
        ...
```

## Configuration

### ConfigLoader
환경별 설정 로더입니다.

```python
from typing import Any, Optional, TypeVar

T = TypeVar("T")

class ConfigLoader:
    """환경별 설정 로더."""

    def load(self) -> AppConfig:
        """설정 로드."""
        ...

    def get_value(self, path: str, default: Optional[T] = None) -> Optional[T]:
        """설정 값 조회."""
        ...

    def reload(self) -> AppConfig:
        """설정 리로드."""
        ...

    def get_environment(self) -> str:
        """환경 확인."""
        ...

    def is_production(self) -> bool:
        """프로덕션 환경 여부."""
        ...

    def is_development(self) -> bool:
        """개발 환경 여부."""
        ...

    def is_test(self) -> bool:
        """테스트 환경 여부."""
        ...
```

### 설정 구조

#### AppConfig
애플리케이션 전체 설정 클래스입니다.

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class AppConfig:
    server: ServerConfig
    database: DatabaseConfig
    monitoring: MonitoringConfig
    events: EventsConfig
    performance: PerformanceConfig
    security: SecurityConfig
    logging: LoggingConfig
    notifications: NotificationsConfig
    debug: Optional[DebugConfig] = None
```

## 오류 처리

### 공통 오류 타입

```python
from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional

@dataclass
class APIError:
    code: str
    message: str
    timestamp: str
    details: Optional[Any] = None


class ErrorCodes(str, Enum):
    """오류 코드."""
    INVALID_PARAMETERS = "INVALID_PARAMETERS"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
```

## 버전 호환성

- **API 버전**: v0.1.0
- **MCP 프로토콜**: 1.7.x
- **Python**: >=3.11
- **권장 Python**: 3.12

---

**참고**: 이 API 참조는 DevFlow Monitor MCP (Python) 기준으로 작성되었습니다. 최신 정보는 [GitHub 저장소](https://github.com/yaioyaio/kroot-mcp)를 확인하세요.

**최종 수정일**: 2026-02-04