# DevFlow Monitor MCP - 상세 기능 명세서

## 목차
1. [개요](#1-개요)
2. [파일 시스템 모니터링](#2-파일-시스템-모니터링)
3. [Git 활동 추적](#3-git-활동-추적)
4. [개발 단계 자동 인식](#4-개발-단계-자동-인식)
5. [AI 협업 추적](#5-ai-협업-추적)
6. [개발 방법론 모니터링](#6-개발-방법론-모니터링)
7. [실시간 메트릭 수집](#7-실시간-메트릭-수집)
8. [병목 현상 감지](#8-병목-현상-감지)
9. [MCP 도구 API](#9-mcp-도구-api)
10. [CLI/TUI 대시보드](#10-clitui-대시보드)
11. [데이터 모델](#11-데이터-모델)
12. [이벤트 흐름 시나리오](#12-이벤트-흐름-시나리오)

## 1. 개요

DevFlow Monitor MCP는 개발자의 로컬 환경에서 실행되는 MCP 서버로, 프로젝트의 모든 개발 활동을 자동으로 감지하고 추적합니다. 이 문서는 AI 협업 시 정확한 구현을 위한 상세 기능 명세를 제공합니다.

> 📌 **시스템의 동작 흐름을 시각적으로 이해하려면 [FLOWCHARTS.md](./FLOWCHARTS.md)를 참조하세요.**

### 1.1 핵심 원칙
- **Zero Configuration**: 추가 설정 없이 자동 감지
- **Non-Intrusive**: 개발 워크플로우 방해 없음
- **Real-time**: 모든 활동 실시간 추적
- **Intelligent**: 컨텍스트 기반 스마트 분석

## 2. 파일 시스템 모니터링

### 2.1 감지 대상
```python
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Optional

@dataclass
class FileStats:
    size: int
    extension: str
    directory: str

@dataclass
class FileContext:
    related_files: list[str]  # 같이 변경된 파일들
    git_branch: str
    development_stage: str

@dataclass
class FileSystemEvent:
    type: Literal['add', 'change', 'unlink', 'addDir', 'unlinkDir']
    path: str
    timestamp: datetime
    stats: FileStats
    context: Optional[FileContext] = None
```

### 2.2 지능형 필터링
```python
class FileWatcher:
    """파일 감시자."""

    IGNORE_PATTERNS: list[str] = [
        '**/.venv/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/coverage/**',
        '**/*.log',
        '**/.DS_Store'
    ]

    SIGNIFICANT_EXTENSIONS: list[str] = [
        '.py',                        # 코드
        '.md', '.mdx',                # 문서
        '.sql',                       # 데이터베이스
        '*_test.py', 'test_*.py',     # 테스트
        '.json', '.yaml', '.yml'      # 설정
    ]
```

### 2.3 컨텍스트 분석
시스템은 파일 변경의 컨텍스트를 분석하여 의미 있는 정보를 추출합니다:
- **컴포넌트 생성**: `components/` 디렉토리에 새 파일 → "새 UI 컴포넌트 개발"
- **API 엔드포인트**: `api/` 또는 `routes/` 변경 → "백엔드 API 수정"
- **테스트 추가**: `*_test.py` 생성 → "테스트 커버리지 향상"

## 3. Git 활동 추적

### 3.1 Git 이벤트 타입
```python
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Optional

@dataclass
class GitStats:
    additions: int
    deletions: int
    files_changed: int

@dataclass
class GitFileChange:
    path: str
    status: Literal['added', 'modified', 'deleted', 'renamed']
    additions: int
    deletions: int

@dataclass
class GitEventData:
    branch: Optional[str] = None
    hash: Optional[str] = None
    message: Optional[str] = None
    files: Optional[list[GitFileChange]] = None
    stats: Optional[GitStats] = None

@dataclass
class GitEvent:
    type: Literal['commit', 'branch', 'merge', 'pull_request', 'tag']
    timestamp: datetime
    author: str
    data: GitEventData
```

### 3.2 자동 감지 항목
- **브랜치 패턴 분석**:
  - `feature/*` → 새 기능 개발
  - `bugfix/*` → 버그 수정
  - `hotfix/*` → 긴급 수정
  - `refactor/*` → 코드 개선
- **커밋 메시지 분석**:
  - Conventional Commits 감지
  - 작업 유형 자동 분류
  - 관련 이슈 번호 추출

## 4. 개발 단계 자동 인식

### 4.1 단계 감지 규칙
```python
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class StagePatterns:
    files: list[str] = field(default_factory=list)
    directories: list[str] = field(default_factory=list)
    activities: list[str] = field(default_factory=list)

@dataclass
class StageDetectionRule:
    stage: str  # DevelopmentStage
    patterns: StagePatterns
    confidence: int  # 0-100

DETECTION_RULES: list[StageDetectionRule] = [
    StageDetectionRule(
        stage='PRD',
        patterns=StagePatterns(
            files=['**/PRD.md', '**/requirements.md', '**/specs/*.md'],
            activities=['문서 작성', '요구사항 정의']
        ),
        confidence=90
    ),
    StageDetectionRule(
        stage='ERD',
        patterns=StagePatterns(
            files=['**/*.sql', '**/schema.*', '**/migrations/*'],
            activities=['데이터베이스 설계', '스키마 정의']
        ),
        confidence=85
    ),
    StageDetectionRule(
        stage='Coding',
        patterns=StagePatterns(
            files=['**/*.py', '**/*.js', '**/*.jsx'],
            directories=['src/', 'components/', 'pages/'],
            activities=['구현', '개발', '코딩']
        ),
        confidence=95
    ),
]
```

### 4.2 다중 단계 처리
여러 단계가 동시에 진행될 수 있으므로, 시스템은 가중치 기반으로 주요 단계를 결정합니다:
```python
from dataclasses import dataclass
from datetime import datetime

@dataclass
class StageWeight:
    stage: str
    weight: float
    recent_activity: datetime
```

## 5. AI 협업 추적

### 5.1 AI 상호작용 모델
```python
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Optional

@dataclass
class AIContext:
    current_file: Optional[str] = None
    current_function: Optional[str] = None
    development_stage: str = ""

@dataclass
class CodeBlock:
    language: str
    content: str
    lines: int
    purpose: Literal['new', 'replacement', 'refactor']

@dataclass
class AIResponse:
    content: str
    code_blocks: Optional[list[CodeBlock]] = None

@dataclass
class AIEffectiveness:
    accepted: bool
    modified: bool
    time_to_accept: Optional[int] = None

@dataclass
class AIInteraction:
    id: str
    timestamp: datetime
    tool: str  # 'Claude', 'GitHub Copilot', 'ChatGPT' 등
    type: Literal['prompt', 'completion', 'edit_suggestion']
    context: AIContext
    prompt: Optional[str] = None
    response: Optional[AIResponse] = None
    applied: bool = False
    effectiveness: Optional[AIEffectiveness] = None
```

### 5.2 AI 사용 패턴 분석
```python
from dataclasses import dataclass

@dataclass
class UsageByPurpose:
    code_generation: list[AIInteraction]
    debugging: list[AIInteraction]
    refactoring: list[AIInteraction]
    documentation: list[AIInteraction]

@dataclass
class EffectivenessMetrics:
    acceptance_rate: float
    average_time_to_accept: float
    modification_rate: float

@dataclass
class AIUsagePatterns:
    tool_frequency: dict[str, int]
    usage_by_purpose: UsageByPurpose
    effectiveness: EffectivenessMetrics
    temporal_patterns: dict[str, int]

class AIUsageAnalyzer:
    """AI 사용 패턴 분석기."""

    def analyze_patterns(self, interactions: list[AIInteraction]) -> AIUsagePatterns:
        return AIUsagePatterns(
            tool_frequency=self._calculate_tool_frequency(interactions),
            usage_by_purpose=UsageByPurpose(
                code_generation=self._filter_by_purpose(interactions, 'generation'),
                debugging=self._filter_by_purpose(interactions, 'debugging'),
                refactoring=self._filter_by_purpose(interactions, 'refactoring'),
                documentation=self._filter_by_purpose(interactions, 'documentation'),
            ),
            effectiveness=EffectivenessMetrics(
                acceptance_rate=self._calculate_acceptance_rate(interactions),
                average_time_to_accept=self._calculate_average_time_to_accept(interactions),
                modification_rate=self._calculate_modification_rate(interactions),
            ),
            temporal_patterns=self._analyze_temporal_patterns(interactions),
        )
```

## 6. 개발 방법론 모니터링

### 6.1 DDD (Domain-Driven Design) 추적
```python
from dataclasses import dataclass, field
from typing import Literal, Optional

@dataclass
class DDDViolation:
    type: Literal['boundary_leak', 'missing_repository', 'anemic_domain']
    location: str
    severity: Literal['low', 'medium', 'high']

@dataclass
class DDDMetrics:
    entities: list[str] = field(default_factory=list)
    value_objects: list[str] = field(default_factory=list)
    aggregates: list[str] = field(default_factory=list)
    repositories: list[str] = field(default_factory=list)
    services: list[str] = field(default_factory=list)
    bounded_contexts: dict[str, list[str]] = field(default_factory=dict)
    ubiquitous_language: set[str] = field(default_factory=set)
    violations: Optional[list[DDDViolation]] = None
```

### 6.2 TDD (Test-Driven Development) 추적
```python
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

@dataclass
class RedPhase:
    test_created: datetime
    test_failing: bool

@dataclass
class GreenPhase:
    implementation_started: datetime
    tests_passing: datetime

@dataclass
class RefactorPhase:
    refactoring_started: datetime
    refactoring_completed: datetime
    tests_still_passing: bool

@dataclass
class TDDCycleInfo:
    red_phase: RedPhase
    green_phase: GreenPhase
    refactor_phase: Optional[RefactorPhase] = None

@dataclass
class TDDCycle:
    test_file: str
    implementation_file: str
    cycle: TDDCycleInfo
```

### 6.3 BDD (Behavior-Driven Development) 추적
```python
from dataclasses import dataclass
from typing import Literal

@dataclass
class BDDSteps:
    given: list[str]
    when: list[str]
    then: list[str]

@dataclass
class BDDImplementation:
    step_definitions: list[str]
    status: Literal['pending', 'implemented', 'passing', 'failing']

@dataclass
class BDDScenario:
    feature: str
    scenario: str
    steps: BDDSteps
    implementation: BDDImplementation
```

### 6.4 EDA (Event-Driven Architecture) 추적
```python
from dataclasses import dataclass, field

@dataclass
class EDAEvent:
    name: str
    producers: list[str]
    consumers: list[str]
    frequency: int

@dataclass
class CQRSPatterns:
    commands: list[str]
    queries: list[str]
    projections: list[str]

@dataclass
class EDAMetrics:
    events: list[EDAEvent] = field(default_factory=list)
    event_handlers: dict[str, list[str]] = field(default_factory=dict)
    saga_implementations: list[str] = field(default_factory=list)
    cqrs_patterns: CQRSPatterns = field(default_factory=CQRSPatterns)
```

## 7. 실시간 메트릭 수집

### 7.1 생산성 메트릭
```python
from dataclasses import dataclass
from typing import Literal

@dataclass
class LinesOfCodeMetrics:
    added: int
    deleted: int
    net: int

@dataclass
class CommitMetrics:
    count: int
    average_size: int
    frequency: float  # per hour

@dataclass
class FileMetrics:
    created: int
    modified: int
    deleted: int

@dataclass
class FocusTimeMetrics:
    total: int  # minutes
    longest_session: int
    interruptions: int

@dataclass
class ProductivityMetricsData:
    lines_of_code: LinesOfCodeMetrics
    commits: CommitMetrics
    files: FileMetrics
    focus_time: FocusTimeMetrics

@dataclass
class ProductivityMetrics:
    timeframe: Literal['hour', 'day', 'week', 'sprint']
    metrics: ProductivityMetricsData
```

### 7.2 품질 메트릭
```python
from dataclasses import dataclass, field
from typing import Literal

@dataclass
class TestCoverage:
    lines: float
    branches: float
    functions: float
    statements: float
    trend: Literal['improving', 'declining', 'stable']

@dataclass
class ComplexityHotspot:
    file: str
    complexity: int
    reason: str

@dataclass
class CodeComplexity:
    cyclomatic: int
    cognitive: int
    hotspots: list[ComplexityHotspot] = field(default_factory=list)

@dataclass
class TechnicalDebtItem:
    type: Literal['duplication', 'complexity', 'coverage', 'standards']
    location: str
    effort: int  # hours to fix

@dataclass
class TechnicalDebt:
    score: int
    items: list[TechnicalDebtItem] = field(default_factory=list)

@dataclass
class QualityMetrics:
    test_coverage: TestCoverage
    code_complexity: CodeComplexity
    technical_debt: TechnicalDebt
```

### 7.3 협업 메트릭
```python
from dataclasses import dataclass, field

@dataclass
class PRMetrics:
    created: int
    reviewed: int
    average_review_time: float  # hours
    average_comments: float

@dataclass
class CodeOwnershipInfo:
    files: list[str]
    percentage: float

@dataclass
class KnowledgeSharing:
    documentation_added: int
    comments_added: int
    pair_programming_sessions: int

@dataclass
class CollaborationMetrics:
    pull_requests: PRMetrics
    code_ownership: dict[str, CodeOwnershipInfo] = field(default_factory=dict)
    knowledge_sharing: KnowledgeSharing = field(default_factory=KnowledgeSharing)
```

## 8. 병목 현상 감지

### 8.1 병목 타입 정의
```python
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Optional

@dataclass
class BottleneckLocation:
    file: Optional[str] = None
    process: Optional[str] = None
    team: Optional[str] = None

@dataclass
class BottleneckMetrics:
    frequency: Optional[int] = None
    duration: Optional[int] = None
    impact: Optional[int] = None  # affected files/features

@dataclass
class Bottleneck:
    id: str
    type: Literal['hotspot', 'test_failure', 'long_review', 'blocked_task', 'performance']
    severity: Literal['low', 'medium', 'high', 'critical']
    location: BottleneckLocation
    metrics: BottleneckMetrics
    suggestions: list[str] = field(default_factory=list)
    detected_at: datetime = field(default_factory=datetime.now)
```

### 8.2 감지 알고리즘
```python
from dataclasses import dataclass
from typing import Callable, Any

@dataclass
class DetectionRule:
    name: str
    detect: Callable[[list[Any]], list[Bottleneck]]

class BottleneckDetector:
    """병목 현상 감지기."""

    def __init__(self):
        self.rules: list[DetectionRule] = [
            DetectionRule(
                name='FileHotspot',
                detect=self._detect_file_hotspot
            ),
            DetectionRule(
                name='TestFailurePattern',
                detect=self._detect_test_failure_pattern
            ),
            DetectionRule(
                name='LongRunningPR',
                detect=self._detect_long_running_pr
            ),
        ]

    def _detect_file_hotspot(self, events: list[FileSystemEvent]) -> list[Bottleneck]:
        """같은 파일이 하루에 10번 이상 수정."""
        threshold = 10
        time_window = 24 * 60 * 60  # 24 hours in seconds
        # ... detection logic
        return []

    def _detect_test_failure_pattern(self, test_results: list[Any]) -> list[Bottleneck]:
        """같은 테스트가 3번 이상 연속 실패."""
        failure_threshold = 3
        # ... detection logic
        return []

    def _detect_long_running_pr(self, pull_requests: list[Any]) -> list[Bottleneck]:
        """PR이 3일 이상 열려있음."""
        day_threshold = 3
        # ... detection logic
        return []
```

## 9. MCP 도구 API

### 9.1 조회 도구
```python
from dataclasses import dataclass
from typing import Literal, Optional

# 프로젝트 상태 조회
@dataclass
class GetProjectStatusParams:
    include_metrics: bool = False
    time_range: Literal['today', 'week', 'sprint', 'all'] = 'today'

@dataclass
class TeamActivity:
    commits: int
    files_modified: int
    tests_run: int

@dataclass
class ProjectStatus:
    current_stage: str
    stage_progress: int  # 0-100
    active_features: list[str]
    team_activity: TeamActivity
    health: Literal['healthy', 'warning', 'critical']

# 메트릭 조회
@dataclass
class GetMetricsParams:
    type: Literal['productivity', 'quality', 'collaboration', 'all']
    timeframe: Literal['hour', 'day', 'week', 'sprint']
    group_by: Optional[Literal['developer', 'feature', 'file']] = None
```

### 9.2 분석 도구
```python
from dataclasses import dataclass, field
from typing import Literal, Optional

# 병목 현상 분석
@dataclass
class AnalyzeBottlenecksParams:
    severity: Literal['all', 'medium', 'high', 'critical'] = 'all'
    type: Optional[list[str]] = None

@dataclass
class BottleneckTrends:
    improving: list[str]
    worsening: list[str]

@dataclass
class BottleneckRecommendations:
    immediate: list[str]
    short_term: list[str]
    long_term: list[str]

@dataclass
class BottleneckAnalysis:
    bottlenecks: list[Bottleneck]
    trends: BottleneckTrends
    recommendations: BottleneckRecommendations

# 방법론 준수 체크
@dataclass
class CheckMethodologyParams:
    methodology: Literal['DDD', 'TDD', 'BDD', 'EDA', 'all']
    strict: bool = False

@dataclass
class MethodologyViolation:
    rule: str
    location: str
    suggestion: str

@dataclass
class MethodologyCompliance:
    methodology: str
    score: int  # 0-100
    violations: list[MethodologyViolation] = field(default_factory=list)
    strengths: list[str] = field(default_factory=list)
```

### 9.3 리포트 생성
```python
from dataclasses import dataclass, field
from typing import Literal, Optional

# 일일 리포트
@dataclass
class GenerateDailyReportParams:
    date: Optional[str] = None  # ISO date
    format: Literal['markdown', 'json', 'html'] = 'markdown'
    sections: Optional[list[Literal['summary', 'activity', 'metrics', 'bottlenecks', 'ai-usage']]] = None

@dataclass
class ReportSummary:
    headline: str
    key_achievements: list[str]
    challenges: list[str]

@dataclass
class ReportActivity:
    commits: int
    pull_requests: int
    deployments: int
    incidents: int

@dataclass
class DailyReport:
    date: str
    summary: ReportSummary
    activity: ReportActivity
    # ... other sections
```

### 9.4 동기화 도구 (원격 통합)

```python
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Optional

# 동기화 상태 조회
@dataclass
class GetSyncStatusParams:
    verbose: bool = False

@dataclass
class SyncStatus:
    enabled: bool
    last_sync: Optional[datetime] = None
    pending_events: int = 0
    sync_errors: int = 0
    connection_status: Literal['connected', 'disconnected', 'error'] = 'disconnected'

# 동기화 설정
@dataclass
class ConfigureSyncParams:
    enabled: bool
    endpoint: Optional[str] = None
    interval: Optional[int] = None  # 초 단위
    batch_size: Optional[int] = None

# 수동 동기화
@dataclass
class TriggerSyncParams:
    force: bool = False
    full_sync: bool = False

@dataclass
class SyncError:
    code: str
    message: str

@dataclass
class SyncResult:
    success: bool
    synced_events: int
    errors: list[SyncError] = field(default_factory=list)
    duration: int = 0  # ms
```

## 10. CLI/TUI 대시보드

### 10.1 대시보드 레이아웃
```python
from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Optional

@dataclass
class DashboardHeader:
    project_name: str
    current_time: str
    connection_status: Literal['connected', 'disconnected']

@dataclass
class CurrentStagePanel:
    stage: str
    progress: int
    eta: Optional[str] = None

@dataclass
class TestsStatus:
    passed: int
    failed: int
    total: int

@dataclass
class TodayActivityPanel:
    commits: int
    files_modified: int
    tests_status: TestsStatus
    ai_assists: int

@dataclass
class Alert:
    type: Literal['warning', 'error', 'info']
    message: str
    timestamp: datetime

@dataclass
class RealtimeFeedItem:
    event: str
    time: str
    impact: Literal['low', 'medium', 'high']

@dataclass
class DashboardPanels:
    current_stage: CurrentStagePanel
    today_activity: TodayActivityPanel
    methodology_compliance: dict[str, int] = field(default_factory=dict)
    alerts: list[Alert] = field(default_factory=list)
    realtime_feed: list[RealtimeFeedItem] = field(default_factory=list)

@dataclass
class DashboardLayout:
    header: DashboardHeader
    panels: DashboardPanels
```

### 10.2 인터랙티브 기능
```python
from dataclasses import dataclass
from typing import Callable, Optional

@dataclass
class DashboardShortcuts:
    """키보드 단축키."""
    r: str = 'refresh'
    f: str = 'filter'
    m: str = 'metrics'
    b: str = 'bottlenecks'
    h: str = 'help'
    q: str = 'quit'

@dataclass
class DashboardFilters:
    """필터링 옵션."""
    stage: Optional[str] = None
    developer: Optional[str] = None
    time_range: Optional[str] = None
    severity: Optional[str] = None

@dataclass
class DashboardDrillDown:
    """상세 보기 기능."""
    file: Callable[[str], 'FileDetails']
    commit: Callable[[str], 'CommitDetails']
    metric: Callable[[str], 'MetricDetails']

@dataclass
class DashboardCommands:
    shortcuts: DashboardShortcuts
    filters: DashboardFilters
    drill_down: DashboardDrillDown
```

## 11. 데이터 모델

### 11.1 이벤트 저장 구조
```python
from dataclasses import dataclass, field
from typing import Any, Optional

# SQLite 스키마
@dataclass
class EventMetadata:
    stage: Optional[str] = None
    developer: Optional[str] = None
    branch: Optional[str] = None
    impact: Optional[int] = None

@dataclass
class EventRecord:
    id: str
    type: str
    timestamp: int
    project_id: str
    data: str  # JSON
    metadata: EventMetadata
    processed: bool = False

# 인메모리 캐시 구조
@dataclass
class CacheStructure:
    current_stage: str = ""
    metrics_today: dict[str, Any] = field(default_factory=dict)
    bottlenecks_active: list[Bottleneck] = field(default_factory=list)
    events_queue: list[str] = field(default_factory=list)  # event IDs
    ai_interactions_recent: list[AIInteraction] = field(default_factory=list)
```

### 11.2 집계 데이터 구조
```python
from dataclasses import dataclass, field
from typing import Any

@dataclass
class HourlyData:
    events: int = 0
    commits: int = 0
    files_changed: int = 0
    tests_run: int = 0

@dataclass
class DailyData:
    summary: 'DailySummary'
    metrics: 'AllMetrics'
    bottlenecks: list[Bottleneck] = field(default_factory=list)

@dataclass
class BurndownPoint:
    date: str
    remaining: int

@dataclass
class SprintData:
    velocity: float
    burndown: list[BurndownPoint] = field(default_factory=list)
    achievements: list[str] = field(default_factory=list)

@dataclass
class AggregatedData:
    hourly: dict[str, HourlyData] = field(default_factory=dict)
    daily: dict[str, DailyData] = field(default_factory=dict)
    sprint: dict[str, SprintData] = field(default_factory=dict)
```

## 12. 이벤트 흐름 시나리오

### 12.1 새 기능 개발 시나리오
```python
# 1. 브랜치 생성
event1 = {
    "type": "git.branch.create",
    "data": {"name": "feature/user-auth", "from": "main"}
}
# ↓
# 2. 파일 생성 (TDD - 테스트 먼저)
event2 = {
    "type": "file.create",
    "data": {"path": "src/auth/test_auth_service.py"}
}
# ↓
# 3. AI 도움 요청
event3 = {
    "type": "ai.interaction",
    "data": {
        "tool": "Claude",
        "prompt": "UserAuth 서비스 테스트 코드 작성",
        "code_generated": True
    }
}
# ↓
# 4. 구현 코드 작성
event4 = {
    "type": "file.create",
    "data": {"path": "src/auth/auth_service.py"}
}
# ↓
# 5. 테스트 실행
event5 = {
    "type": "test.run",
    "data": {
        "files": ["test_auth_service.py"],
        "results": {"passed": 5, "failed": 0}
    }
}
# ↓
# 6. 커밋
event6 = {
    "type": "git.commit",
    "data": {
        "message": "feat: Add user authentication service",
        "files": 2,
        "additions": 150,
        "deletions": 0
    }
}
```

### 12.2 버그 수정 시나리오
```python
# 1. 이슈 발견 (테스트 실패)
event1 = {
    "type": "test.fail",
    "data": {
        "file": "test_user_service.py",
        "error": "Expected 200 but got 500"
    }
}
# ↓
# 2. 디버깅 시작
event2 = {
    "type": "file.open",
    "data": {"path": "src/user/user_service.py"}
}
# ↓
# 3. 핫스팟 감지
event3 = {
    "type": "bottleneck.detected",
    "data": {
        "type": "hotspot",
        "file": "user_service.py",
        "modifications": 15  # in last 2 hours
    }
}
# ↓
# 4. 수정 및 테스트
# ... 여러 수정 시도 ...
# ↓
# 5. 해결
event5 = {
    "type": "test.pass",
    "data": {
        "file": "test_user_service.py",
        "duration": 1250  # ms
    }
}
```

### 12.3 코드 리뷰 프로세스
```python
# 1. PR 생성
event1 = {
    "type": "git.pr.create",
    "data": {
        "number": 123,
        "title": "Add user authentication",
        "files": 8,
        "additions": 350,
        "deletions": 20
    }
}
# ↓
# 2. 리뷰 시작
event2 = {
    "type": "git.pr.review.start",
    "data": {
        "pr": 123,
        "reviewer": "john.doe"
    }
}
# ↓
# 3. 리뷰 코멘트
event3 = {
    "type": "git.pr.comment",
    "data": {
        "pr": 123,
        "file": "auth_service.py",
        "line": 45,
        "comment": "Consider using dependency injection here"
    }
}
# ↓
# 4. 수정 사항 반영
# ... 코드 수정 ...
# ↓
# 5. 승인 및 머지
event5 = {
    "type": "git.pr.merge",
    "data": {
        "pr": 123,
        "strategy": "squash",
        "review_time": 3.5  # hours
    }
}
```

## 사용 가이드

이 문서는 DevFlow Monitor MCP를 구현할 때 참조해야 하는 핵심 명세서입니다. 각 기능을 구현할 때:

1. 해당 섹션의 인터페이스를 정확히 구현
2. 제공된 예시 시나리오를 테스트 케이스로 활용
3. 데이터 모델을 준수하여 일관성 유지
4. AI 협업 시 이 문서를 컨텍스트로 제공

모든 구현은 이 명세를 기반으로 하여, 일관되고 예측 가능한 동작을 보장해야 합니다.

---

작성일: 2026-02-02  
최종 수정일: 2026-02-02  
작성자: yaioyaio