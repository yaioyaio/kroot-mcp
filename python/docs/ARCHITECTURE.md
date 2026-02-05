# DevFlow Monitor MCP - 아키텍처 문서

## 목차
1. [개요](#개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [핵심 컴포넌트](#핵심-컴포넌트)
4. [데이터 플로우](#데이터-플로우)
5. [보안 아키텍처](#보안-아키텍처)
6. [성능 아키텍처](#성능-아키텍처)
7. [확장성 설계](#확장성-설계)
8. [배포 아키텍처](#배포-아키텍처)

## 개요

DevFlow Monitor MCP는 모듈러 아키텍처를 기반으로 설계된 개발 워크플로우 모니터링 시스템입니다. Model Context Protocol (MCP)을 통해 Claude Desktop과 통합되며, 실시간 이벤트 처리, 지능형 분석, 보안 관리를 지원합니다.

### 아키텍처 원칙

- **모듈성**: 각 기능을 독립적인 모듈로 분리
- **확장성**: 새로운 모니터와 분석기 쉽게 추가 가능
- **성능**: 실시간 처리를 위한 최적화된 이벤트 시스템
- **보안**: 다층 보안 아키텍처
- **관찰가능성**: 포괄적인 로깅 및 메트릭

## 시스템 아키텍처

### 고수준 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                        DevFlow Monitor MCP                      │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Claude Desktop│  │   VS Code    │  │   Other Clients      │  │
│  │   (MCP)       │  │ Extensions   │  │   (API/WebSocket)    │  │
│  └───────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│          │                 │                     │              │
│          └─────────────────┼─────────────────────┘              │
│                            │                                    │
├────────────────────────────┼────────────────────────────────────┤
│                       MCP Server                                │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │                    API Gateway                           │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │   MCP Tools  │  │   REST API   │  │  WebSocket   │  │  │
│  │  │   (88 tools) │  │   Endpoints  │  │   Server     │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └─────────────────────────┼─────────────────────────────────┘  │
│                            │                                    │
├────────────────────────────┼────────────────────────────────────┤
│                      Core Engine                               │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │                  Event Engine                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │ Event Queue  │  │   Routing    │  │  Processing  │  │  │
│  │  │  (Priority)  │  │   System     │  │   Pipeline   │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └─────────────────────────┼─────────────────────────────────┘  │
│                            │                                    │
├────────────────────────────┼────────────────────────────────────┤
│                   Monitoring Layer                             │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │File Monitor  │  │ Git Monitor  │  │ AI Monitor   │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │System Monitor│  │Perf Monitor  │  │ User Monitor │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └─────────────────────────┼─────────────────────────────────┘  │
│                            │                                    │
├────────────────────────────┼────────────────────────────────────┤
│                   Analysis Layer                               │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │Stage Analyzer│  │Metrics Coll. │  │Bottleneck Det│  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │AI Collaborat.│  │Report Engine │  │Notification  │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └─────────────────────────┼─────────────────────────────────┘  │
│                            │                                    │
├────────────────────────────┼────────────────────────────────────┤
│                   Security Layer                               │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │Auth Manager  │  │ RBAC Manager │  │Encryption Mgr│  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │Audit Logger  │  │ API Key Mgr  │  │ Token Manager│  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └─────────────────────────┼─────────────────────────────────┘  │
│                            │                                    │
├────────────────────────────┼────────────────────────────────────┤
│                   Storage Layer                                │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │   SQLite     │  │    Cache     │  │   File       │  │
│  │  │  Database    │  │   (Memory)   │  │   Storage    │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │ Repositories │  │   Migrations │  │   Backup     │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └─────────────────────────┼─────────────────────────────────┘  │
│                            │                                    │
├────────────────────────────┼────────────────────────────────────┤
│                   External Integrations                        │
│  ┌─────────────────────────┼─────────────────────────────────┐  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │     Jira     │  │    Notion    │  │    Figma     │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │    Slack     │  │   GitHub     │  │   GitLab     │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 컴포넌트 간 통신

```
      MCP Protocol
Claude Desktop ←→ MCP Server
                      ↓
                 Event Engine
                   ↓     ↑
    ┌──────────────┼─────┼──────────────┐
    ↓              ↓     ↑              ↓
File Monitor → Event Queue → Analyzer → Storage
Git Monitor  → Event Queue → Analyzer → Cache
AI Monitor   → Event Queue → Analyzer → Notification
```

## 핵심 컴포넌트

### 1. MCP Server

```python
from typing import Any, Protocol

class MCPServer(Protocol):
    """MCP 서버 프로토콜."""

    tools: dict[str, 'MCPTool']

    async def handle_request(self, request: 'MCPRequest') -> 'MCPResponse':
        """요청 처리."""
        ...

    def register_tool(self, tool: 'MCPTool') -> None:
        """도구 등록."""
        ...

    async def authenticate(self, request: 'MCPRequest') -> 'AuthContext':
        """인증 미들웨어."""
        ...
```

**주요 책임**:
- MCP 프로토콜 구현
- 도구 생명주기 관리
- 요청/응답 처리
- 인증 및 권한 검사

### 2. Event Engine

```python
from typing import Callable, Protocol

class EventEngine(Protocol):
    """이벤트 엔진 프로토콜."""

    async def emit(self, event: 'BaseEvent') -> None:
        """이벤트 발행."""
        ...

    def subscribe(self, pattern: 'EventPattern', handler: Callable) -> None:
        """이벤트 구독."""
        ...

    async def route(self, event: 'BaseEvent') -> None:
        """이벤트 라우팅."""
        ...

    def get_stats(self) -> 'EventStats':
        """통계 조회."""
        ...
```

**주요 책임**:
- 이벤트 수집 및 분산
- 우선순위 기반 큐 관리
- 이벤트 라우팅 및 변환
- 백프레셔 및 플로우 제어

### 3. Monitor System

```python
from abc import ABC, abstractmethod

class BaseMonitor(ABC):
    """모니터 기본 클래스."""

    @abstractmethod
    async def start(self) -> None:
        """모니터 시작."""
        ...

    @abstractmethod
    async def stop(self) -> None:
        """모니터 중지."""
        ...

    @abstractmethod
    def get_status(self) -> 'MonitorStatus':
        """상태 조회."""
        ...

    def _emit(self, event: 'BaseEvent') -> None:
        """이벤트 발행 (protected)."""
        ...

    def _configure(self, config: 'MonitorConfig') -> None:
        """설정 (protected)."""
        ...
```

**Monitor 구현체**:

#### FileMonitor
- **기술**: watchfiles/watchdog (파일 시스템 감시)
- **이벤트**: file_created, file_modified, file_deleted
- **필터링**: 확장자, 경로 패턴, ignore 규칙

#### GitMonitor
- **기술**: GitPython (Git 명령 실행)
- **이벤트**: commit_created, branch_created, merge_completed
- **분석**: 커밋 메시지, 브랜치 패턴, 머지 전략

#### AIMonitor
- **감지 방법**: 프로세스 모니터링, 파일 패턴 분석
- **이벤트**: ai_session_started, code_suggestion_accepted
- **지원 도구**: Claude, Copilot, ChatGPT, Cursor

### 4. Analysis Engine

```python
from typing import Protocol

class AnalysisEngine(Protocol):
    """분석 엔진 프로토콜."""

    def analyze_stage(self, events: list['BaseEvent']) -> 'StageAnalysis':
        """단계 분석."""
        ...

    def collect_metrics(self, time_range: 'TimeRange') -> 'Metrics':
        """메트릭 수집."""
        ...

    def detect_bottlenecks(self) -> list['Bottleneck']:
        """병목 감지."""
        ...

    def generate_report(self, options: 'ReportOptions') -> 'Report':
        """리포트 생성."""
        ...
```

**분석기 구현체**:

#### StageAnalyzer
- **방법**: 패턴 매칭 + 머신러닝
- **단계**: 13개 개발 단계 인식
- **신뢰도**: 확률 기반 신뢰도 계산

#### MetricsCollector
- **메트릭 유형**: 생산성, 품질, 성능, 협업
- **수집 주기**: 실시간, 배치 (5분, 1시간, 1일)
- **저장**: SQLite + 메모리 캐시

#### BottleneckDetector
- **감지 영역**: CPU, 메모리, I/O, 네트워크
- **알고리즘**: 임계값 기반 + 이상 감지
- **자동화**: 자동 최적화 제안

### 5. Security System

```python
from typing import Protocol

class SecurityManager(Protocol):
    """보안 매니저 프로토콜."""

    async def authenticate(self, credentials: 'Credentials') -> 'AuthResult':
        """인증."""
        ...

    async def authorize(self, user: 'User', resource: str, action: str) -> bool:
        """권한 검사."""
        ...

    async def generate_token(self, payload: 'TokenPayload') -> str:
        """토큰 생성."""
        ...

    async def verify_token(self, token: str) -> 'TokenClaims':
        """토큰 검증."""
        ...

    async def audit_log(self, event: 'SecurityEvent') -> None:
        """감사 로그."""
        ...
```

**보안 컴포넌트**:

#### AuthManager
- **인증 방식**: JWT 토큰, API 키
- **토큰 유형**: Access Token (24h), Refresh Token (30d)
- **보안**: HMAC SHA-256, 키 순환

#### RBACManager
- **역할**: admin, developer, viewer, guest
- **권한**: 리소스별 세분화된 권한
- **상속**: 역할 기반 권한 상속

#### EncryptionManager
- **알고리즘**: AES-256-GCM
- **키 관리**: 환경별 분리, 자동 순환
- **데이터**: 민감한 설정, 토큰, 로그

## 데이터 플로우

### 이벤트 처리 플로우

```
1. Event Generation
   File Change → FileMonitor → BaseEvent

2. Event Queuing
   BaseEvent → EventQueue → Priority Ordering

3. Event Processing
   EventQueue → EventEngine → Analysis Pipeline

4. Analysis & Storage
   Analysis Pipeline → MetricsCollector → Database
                    → StageAnalyzer → Stage Update
                    → BottleneckDetector → Alert

5. Response Generation
   Analysis Results → MCP Tool → Claude Desktop
```

### 상세 데이터 플로우

#### 1. 파일 변경 감지

```
파일 시스템 변경
        ↓
   watchfiles 이벤트
        ↓
   FileMonitor.handleChange()
        ↓
   이벤트 필터링 (ignore 패턴)
        ↓
   BaseEvent 생성
        ↓
   EventEngine.emit()
        ↓
   EventQueue 우선순위 삽입
        ↓
   배치 처리 (100개 또는 5초)
        ↓
   분석 파이프라인
```

#### 2. Git 활동 추적

```
Git 명령 실행
        ↓
   GitMonitor 폴링 (30초)
        ↓
   GitPython 상태 조회
        ↓
   변경사항 감지
        ↓
   커밋/브랜치 분석
        ↓
   Git 이벤트 생성
        ↓
   StageAnalyzer 단계 업데이트
```

#### 3. AI 협업 추적

```
AI 도구 실행
        ↓
   프로세스 모니터링
        ↓
   AIMonitor 패턴 매칭
        ↓
   사용 세션 추적
        ↓
   효과성 분석
        ↓
   협업 메트릭 업데이트
```

### 데이터베이스 스키마

```sql
-- 이벤트 저장
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  source TEXT NOT NULL,
  data TEXT NOT NULL,           -- JSON
  metadata TEXT,                -- JSON
  processed BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 메트릭 저장
CREATE TABLE metrics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  category TEXT NOT NULL,
  tags TEXT,                    -- JSON
  timestamp DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 단계 전환 추적
CREATE TABLE stage_transitions (
  id TEXT PRIMARY KEY,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  confidence REAL NOT NULL,
  duration INTEGER,             -- milliseconds
  context TEXT,                 -- JSON
  timestamp DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 활동 로그
CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  file_path TEXT,
  git_hash TEXT,
  stage TEXT,
  ai_tool TEXT,
  metadata TEXT,                -- JSON
  timestamp DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 보안 감사 로그
CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id TEXT,
  resource TEXT,
  action TEXT,
  result TEXT NOT NULL,         -- success, failure, blocked
  ip_address TEXT,
  user_agent TEXT,
  details TEXT,                 -- JSON
  timestamp DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 보안 아키텍처

### 인증 플로우

```
1. API Key Authentication
   Request Header → API-Key → KeyManager.validate()
                           → User Context

2. JWT Token Authentication  
   Request Header → Bearer Token → TokenManager.verify()
                                → Claims → RBAC Check

3. MCP Tool Authorization
   Tool Call → SecurityManager.authorize()
            → Permission Check
            → Audit Log
            → Allow/Deny
```

### 보안 계층

#### 1. 네트워크 보안
- **포트 바인딩**: localhost만 허용 (기본)
- **HTTPS**: 프로덕션 환경에서 필수
- **방화벽**: 필요한 포트만 열기

#### 2. 애플리케이션 보안
- **입력 검증**: Pydantic 스키마 기반
- **SQL 인젝션 방지**: Prepared Statement
- **XSS 방지**: 입력 sanitization

#### 3. 데이터 보안
- **암호화**: AES-256-GCM
- **해싱**: bcrypt (패스워드), SHA-256 (무결성)
- **키 관리**: 환경별 분리, 순환

#### 4. 운영 보안
- **감사 로그**: 모든 보안 이벤트 기록
- **접근 제어**: RBAC 기반
- **모니터링**: 비정상 활동 감지

### 권한 시스템

```python
from enum import Enum

# 역할 정의
class Role(str, Enum):
    ADMIN = "admin"           # 모든 권한
    DEVELOPER = "developer"   # 개발 관련 권한
    VIEWER = "viewer"         # 읽기 전용
    GUEST = "guest"           # 제한된 접근

# 권한 정의
class Permission(str, Enum):
    # 프로젝트 관리
    PROJECT_READ = "project:read"
    PROJECT_WRITE = "project:write"

    # 메트릭 관리
    METRICS_READ = "metrics:read"
    METRICS_WRITE = "metrics:write"

    # 보안 관리
    SECURITY_READ = "security:read"
    SECURITY_WRITE = "security:write"
    SECURITY_ADMIN = "security:admin"

    # 시스템 관리
    SYSTEM_READ = "system:read"
    SYSTEM_WRITE = "system:write"
    SYSTEM_ADMIN = "system:admin"

# 역할-권한 매핑
ROLE_PERMISSIONS: dict[Role, list[Permission]] = {
    Role.ADMIN: [
        Permission.PROJECT_READ, Permission.PROJECT_WRITE,
        Permission.METRICS_READ, Permission.METRICS_WRITE,
        Permission.SECURITY_READ, Permission.SECURITY_WRITE, Permission.SECURITY_ADMIN,
        Permission.SYSTEM_READ, Permission.SYSTEM_WRITE, Permission.SYSTEM_ADMIN,
    ],
    Role.DEVELOPER: [
        Permission.PROJECT_READ, Permission.PROJECT_WRITE,
        Permission.METRICS_READ,
        Permission.SECURITY_READ,
        Permission.SYSTEM_READ,
    ],
    Role.VIEWER: [
        Permission.PROJECT_READ,
        Permission.METRICS_READ,
        Permission.SYSTEM_READ,
    ],
    Role.GUEST: [
        Permission.PROJECT_READ,
    ],
}
```

## 성능 아키텍처

### 성능 최적화 전략

#### 1. 이벤트 처리 최적화

```python
from dataclasses import dataclass, field
import asyncio
from typing import Any

@dataclass
class BatchProcessorConfig:
    max_size: int = 100
    max_wait: int = 5000  # ms

@dataclass
class MemoryMonitorConfig:
    max_memory: int = 100 * 1024 * 1024  # 100MB

class PerformanceOptimizedEventQueue:
    """성능 최적화된 이벤트 큐."""

    def __init__(self):
        self.queue: list['BaseEvent'] = []
        self.batch_config = BatchProcessorConfig()
        self.memory_config = MemoryMonitorConfig()

    async def enqueue(self, event: 'BaseEvent') -> None:
        """이벤트 큐에 추가."""
        # 메모리 압박 시 오래된 이벤트 정리
        if self._is_under_memory_pressure():
            await self._cleanup()

        self.queue.append(event)
        await self._process_batch_if_needed()

    def _is_under_memory_pressure(self) -> bool:
        """메모리 압박 상태 확인."""
        import psutil
        process = psutil.Process()
        return process.memory_info().rss > self.memory_config.max_memory

    async def _cleanup(self) -> None:
        """오래된 이벤트 정리."""
        ...

    async def _process_batch_if_needed(self) -> None:
        """배치 처리가 필요하면 실행."""
        if len(self.queue) >= self.batch_config.max_size:
            await self._process_batch()
```

#### 2. 캐싱 전략

```python
from dataclasses import dataclass
from typing import Any, Optional, Protocol
import time

@dataclass
class CacheEntry:
    value: Any
    expires_at: float

    def is_expired(self) -> bool:
        return time.time() > self.expires_at

class CacheManager(Protocol):
    """캐시 매니저 프로토콜."""

    # L1: 메모리 캐시 (빠름, 용량 제한)
    l1_cache: dict[str, CacheEntry]

    # L2: SQLite 캐시 (중간, 영구 저장)
    l2_cache: 'SQLiteCache'

    async def get(self, key: str) -> Optional[Any]:
        """캐시 계층 조회."""
        ...

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """캐시 설정."""
        ...

    async def invalidate(self, pattern: str) -> None:
        """패턴 기반 무효화."""
        ...

# 캐시 계층 구현
class MultiLevelCache:
    """다층 캐시 구현."""

    def __init__(self):
        self.l1_cache: dict[str, CacheEntry] = {}
        self.l2_cache: Optional['SQLiteCache'] = None

    async def get(self, key: str) -> Optional[Any]:
        # L1 캐시 확인
        entry = self.l1_cache.get(key)
        if entry and not entry.is_expired():
            return entry.value

        # L2 캐시 확인
        if self.l2_cache:
            entry = await self.l2_cache.get(key)
            if entry and not entry.is_expired():
                # L1에 복사
                self.l1_cache[key] = entry
                return entry.value

        return None
```

#### 3. 데이터베이스 최적화

```sql
-- 인덱스 최적화
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_events_type_timestamp ON events(type, timestamp);

CREATE INDEX idx_metrics_name_timestamp ON metrics(name, timestamp);
CREATE INDEX idx_metrics_category_timestamp ON metrics(category, timestamp);

CREATE INDEX idx_activities_timestamp ON activities(timestamp);
CREATE INDEX idx_activities_type ON activities(type);

-- 파티셔닝 (월별)
-- SQLite는 파티셔닝을 지원하지 않으므로 수동 분할
CREATE TABLE events_202501 (...);
CREATE TABLE events_202502 (...);

-- 자동 정리 (30일 이상 된 데이터)
DELETE FROM events 
WHERE timestamp < datetime('now', '-30 days');

-- 통계 업데이트
ANALYZE;
```

### 성능 모니터링

```python
from dataclasses import dataclass, field
from typing import Protocol
import asyncio
import psutil

@dataclass
class MemoryStats:
    used: int
    free: int
    cached: int
    percentage: float

@dataclass
class EventStats:
    processed: int = 0
    errors: int = 0
    average_time: float = 0
    queue_size: int = 0

@dataclass
class DatabaseStats:
    queries: int = 0
    average_time: float = 0
    connections: int = 0

class PerformanceMonitor(Protocol):
    """성능 모니터 프로토콜."""

    def get_cpu_usage(self) -> float:
        """CPU 사용률."""
        ...

    def get_memory_usage(self) -> MemoryStats:
        """메모리 사용률."""
        ...

    def get_event_processing_stats(self) -> EventStats:
        """이벤트 처리 성능."""
        ...

    def get_database_stats(self) -> DatabaseStats:
        """데이터베이스 성능."""
        ...

class SystemPerformanceMonitor:
    """시스템 성능 모니터."""

    def __init__(self):
        self.event_stats = EventStats()
        self.db_stats = DatabaseStats()
        self._running = False

    def get_cpu_usage(self) -> float:
        return psutil.cpu_percent()

    def get_memory_usage(self) -> MemoryStats:
        mem = psutil.virtual_memory()
        return MemoryStats(
            used=mem.used,
            free=mem.free,
            cached=mem.cached if hasattr(mem, 'cached') else 0,
            percentage=mem.percent,
        )

    async def start_monitoring(self) -> None:
        """모니터링 시작."""
        self._running = True
        while self._running:
            await self._update_stats()
            await self._check_thresholds()
            await asyncio.sleep(5)

    async def _check_thresholds(self) -> None:
        """임계값 확인."""
        # CPU 사용률이 90% 초과 시 경고
        if self.get_cpu_usage() > 90:
            await self._emit_warning("high_cpu", self.get_cpu_usage())

        # 메모리 사용률이 85% 초과 시 경고
        memory_usage = self.get_memory_usage().percentage
        if memory_usage > 85:
            await self._emit_warning("high_memory", memory_usage)
```

## 확장성 설계

### 수평 확장

```python
from typing import Protocol
from dataclasses import dataclass

@dataclass
class ClusterNode:
    id: str
    address: str
    port: int

@dataclass
class ClusterHealth:
    healthy_nodes: int
    total_nodes: int

class ClusterManager(Protocol):
    """클러스터 노드 관리."""

    async def register_node(self, node: ClusterNode) -> None:
        """노드 등록."""
        ...

    async def distribute_load(self, task: 'Task') -> ClusterNode:
        """부하 분산."""
        ...

    async def health_check(self) -> ClusterHealth:
        """헬스 체크."""
        ...

    async def handle_failover(self, failed_node: ClusterNode) -> None:
        """페일오버."""
        ...

# 마이크로서비스 아키텍처 (향후)
@dataclass
class ServiceEndpoint:
    host: str
    port: int

class ServiceMesh(Protocol):
    """서비스 메시 프로토콜."""

    async def discover(self, service_name: str) -> list[ServiceEndpoint]:
        """서비스 디스커버리."""
        ...

    async def balance(self, requests: list['Request']) -> list['Response']:
        """로드 밸런싱."""
        ...
```

### 수직 확장

```python
from dataclasses import dataclass
from typing import Literal, Optional

@dataclass
class ScaleThresholds:
    cpu: int
    memory: int
    queue: int

@dataclass
class ScalingThresholds:
    scale_up: ScaleThresholds
    scale_down: ScaleThresholds

@dataclass
class ScalingDecision:
    action: Literal['scale_up', 'scale_down', 'no_change']
    target: Optional[int] = None

# 자동 스케일링
class AutoScaler:
    """자동 스케일러."""

    def __init__(self):
        self.thresholds = ScalingThresholds(
            scale_up=ScaleThresholds(
                cpu=70,      # CPU 70% 초과 시 스케일 업
                memory=80,   # 메모리 80% 초과 시 스케일 업
                queue=1000   # 큐 크기 1000 초과 시 스케일 업
            ),
            scale_down=ScaleThresholds(
                cpu=30,      # CPU 30% 미만 시 스케일 다운
                memory=50,   # 메모리 50% 미만 시 스케일 다운
                queue=100    # 큐 크기 100 미만 시 스케일 다운
            ),
        )

    async def evaluate_scaling(self) -> ScalingDecision:
        """스케일링 평가."""
        current = await self._get_current_metrics()

        if self._should_scale_up(current):
            return ScalingDecision(
                action='scale_up',
                target=self._calculate_target_capacity(current, 'up'),
            )

        if self._should_scale_down(current):
            return ScalingDecision(
                action='scale_down',
                target=self._calculate_target_capacity(current, 'down'),
            )

        return ScalingDecision(action='no_change')
```

### 플러그인 아키텍처

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional
import importlib

@dataclass
class Plugin(ABC):
    """플러그인 기본 클래스."""

    name: str
    version: str
    dependencies: list[str] = field(default_factory=list)

    @abstractmethod
    async def register(self, context: 'PluginContext') -> None:
        """플러그인 등록."""
        ...

    @abstractmethod
    async def start(self) -> None:
        """플러그인 시작."""
        ...

    @abstractmethod
    async def stop(self) -> None:
        """플러그인 중지."""
        ...

# 플러그인 매니저
class PluginManager:
    """플러그인 매니저."""

    def __init__(self):
        self.plugins: dict[str, Plugin] = {}

    async def load_plugin(self, plugin_path: str) -> None:
        """플러그인 로드."""
        module = importlib.import_module(plugin_path)
        plugin = module.create_plugin()

        # 의존성 확인
        if not self._check_dependencies(plugin):
            raise RuntimeError(f"Missing dependencies for {plugin.name}")

        # 등록
        await plugin.register(self._create_context())
        self.plugins[plugin.name] = plugin

        # 시작
        await plugin.start()

    async def unload_plugin(self, name: str) -> None:
        """플러그인 언로드."""
        plugin = self.plugins.get(name)
        if plugin:
            await plugin.stop()
            del self.plugins[name]
```

## 배포 아키텍처

### 컨테이너 아키텍처

```dockerfile
# Multi-stage 빌드
FROM python:3.12-slim AS builder
WORKDIR /app

# Poetry 설치
RUN pip install poetry

# 의존성 파일 복사
COPY pyproject.toml poetry.lock ./

# 의존성 설치
RUN poetry config virtualenvs.create false \
    && poetry install --only main --no-interaction --no-ansi

FROM python:3.12-slim
WORKDIR /app

# 보안 강화
RUN groupadd -g 1001 devflow && \
    useradd -u 1001 -g devflow devflow

# 애플리케이션 복사
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --chown=devflow:devflow src/ ./src/

# 권한 설정
USER devflow

# 헬스 체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import devflow_monitor; print('OK')"

EXPOSE 3000
CMD ["python", "-m", "devflow_monitor"]
```

### 오케스트레이션 (Kubernetes)

```yaml
# Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: devflow-monitor
spec:
  replicas: 3
  selector:
    matchLabels:
      app: devflow-monitor
  template:
    metadata:
      labels:
        app: devflow-monitor
    spec:
      containers:
      - name: devflow-monitor
        image: devflow-monitor:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_PATH
          value: "/data/devflow.db"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        volumeMounts:
        - name: data-volume
          mountPath: /data
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: data-volume
        persistentVolumeClaim:
          claimName: devflow-data-pvc

---
# Service
apiVersion: v1
kind: Service
metadata:
  name: devflow-monitor-service
spec:
  selector:
    app: devflow-monitor
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer

---
# PVC
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: devflow-data-pvc
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

### CI/CD 파이프라인

```yaml
# GitHub Actions
name: Build and Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-python@v4
      with:
        python-version: '3.12'

    - name: Install Poetry
      run: pip install poetry

    - name: Install dependencies
      run: poetry install

    - name: Lint
      run: poetry run ruff check .

    - name: Type check
      run: poetry run mypy src/

    - name: Test
      run: poetry run pytest

    - name: Test coverage
      run: poetry run pytest --cov=src/devflow_monitor --cov-report=xml

    - name: Upload coverage
      uses: codecov/codecov-action@v3

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
    - uses: actions/checkout@v3

    - name: Build Docker image
      run: |
        docker build -t devflow-monitor:${{ github.sha }} .
        docker tag devflow-monitor:${{ github.sha }} devflow-monitor:latest

    - name: Push to registry
      run: |
        echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
        docker push devflow-monitor:${{ github.sha }}
        docker push devflow-monitor:latest

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
    - name: Deploy to production
      run: |
        kubectl set image deployment/devflow-monitor devflow-monitor=devflow-monitor:${{ github.sha }}
        kubectl rollout status deployment/devflow-monitor
```

### 모니터링 및 로깅

```yaml
# Prometheus 설정
global:
  scrape_interval: 15s

scrape_configs:
- job_name: 'devflow-monitor'
  static_configs:
  - targets: ['devflow-monitor:3000']
  metrics_path: /metrics
  scrape_interval: 10s

# Grafana 대시보드
dashboard:
  panels:
  - title: "Event Processing Rate"
    type: graph
    targets:
    - expr: rate(devflow_events_processed_total[5m])
  
  - title: "Memory Usage"
    type: graph
    targets:
    - expr: devflow_memory_usage_bytes / 1024 / 1024
  
  - title: "Response Time"
    type: graph
    targets:
    - expr: histogram_quantile(0.95, rate(devflow_request_duration_seconds_bucket[5m]))
```

---

**참고**: 이 아키텍처 문서는 DevFlow Monitor MCP (Python) 기준으로 작성되었습니다. 최신 정보는 [GitHub 저장소](https://github.com/yaioyaio/kroot-mcp)를 확인하세요.

**최종 수정일**: 2026-02-04