# DevFlow Monitor MCP - Python 마이그레이션 개발 계획서

**작성일**: 2026-02-04
**프로젝트**: DevFlow Monitor MCP (TypeScript → Python)
**예상 기간**: 17-26주 (4-6개월)
**총 코드량**: ~55,000줄 TypeScript → Python 변환

---

## 목차

1. [마이그레이션 개요](#1-마이그레이션-개요)
2. [Phase 1: 코어 인프라](#2-phase-1-코어-인프라-3-4주)
3. [Phase 2: 모니터링 시스템](#3-phase-2-모니터링-시스템-2-3주)
4. [Phase 3: 분석 엔진](#4-phase-3-분석-엔진-2-3주)
5. [Phase 4: 외부 통합](#5-phase-4-외부-통합-1-2주)
6. [Phase 5: 보안 & 성능](#6-phase-5-보안--성능-2-3주)
7. [Phase 6: 플러그인 시스템](#7-phase-6-플러그인-시스템-3-4주)
8. [Phase 7: 보고서 & 알림](#8-phase-7-보고서--알림-2-3주)
9. [Phase 8: 테스트 & 안정화](#9-phase-8-테스트--안정화-2-4주)

---

## 1. 마이그레이션 개요

### 1.1 기술 스택 변환 매핑

| 구분 | TypeScript | Python |
|------|------------|--------|
| 런타임 | Node.js 20+ | Python 3.11+ |
| MCP SDK | @modelcontextprotocol/sdk | mcp>=1.7.1 |
| 웹 프레임워크 | - | FastAPI |
| 비동기 | Promise/async-await | asyncio |
| 타입 시스템 | TypeScript strict | Pydantic + typing |
| 패키지 관리 | npm | pip + poetry |

### 1.2 프로젝트 구조 (Python)

```
devflow-monitor-mcp-python/
├── pyproject.toml
├── poetry.lock
├── README.md
├── src/
│   └── devflow_monitor/
│       ├── __init__.py
│       ├── server/
│       ├── events/
│       ├── monitors/
│       ├── storage/
│       ├── integrations/
│       ├── analyzers/
│       ├── plugins/
│       ├── security/
│       ├── performance/
│       ├── reports/
│       ├── notifications/
│       ├── workflow/
│       ├── prediction/
│       ├── projects/
│       ├── feedback/
│       └── dashboard/
├── tests/
├── config/
└── docs/
```

### 1.3 우선순위 결정 기준

1. **의존성 순서**: 다른 모듈이 의존하는 코어 모듈 먼저
2. **난이도**: 쉬운 것부터 시작하여 모멘텀 확보
3. **검증 가능성**: 단계별 테스트 가능한 단위로 분리

---

## 2. Phase 1: 코어 인프라 (3-4주)

### 2.1 프로젝트 초기 설정

- [ ] **Python 프로젝트 생성**
  ```bash
  mkdir devflow-monitor-mcp-python
  cd devflow-monitor-mcp-python
  poetry init
  ```

- [ ] **pyproject.toml 설정**
  ```toml
  [tool.poetry]
  name = "devflow-monitor-mcp"
  version = "1.0.0"
  description = "AI-powered development process monitoring MCP server"
  python = "^3.11"

  [tool.poetry.dependencies]
  mcp = "^1.7.1"
  fastapi = "^0.104.0"
  uvicorn = "^0.24.0"
  pydantic = "^2.5.0"
  aiosqlite = "^0.19.0"
  ```

- [ ] **디렉토리 구조 생성**
- [ ] **기본 설정 파일 생성** (pytest.ini, .pre-commit-config.yaml)
- [ ] **CI/CD 파이프라인 설정** (GitHub Actions)

---

### 2.2 MCP 서버 코어 마이그레이션

**원본**: `src/server/index.ts` (7,107줄)
**대상**: `src/devflow_monitor/server/`

#### 2.2.1 타입 정의 변환

- [ ] **types.ts → types.py 변환**

  **TypeScript (원본)**:
  ```typescript
  // src/server/types.ts
  export interface McpTool {
    name: string;
    description: string;
    inputSchema: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  }

  export interface GetProjectStatusArgs {
    projectPath?: string;
    includeMetrics?: boolean;
  }
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/server/types.py
  from typing import Any, Optional
  from pydantic import BaseModel, Field

  class McpToolInputSchema(BaseModel):
      type: str = "object"
      properties: dict[str, Any] = Field(default_factory=dict)
      required: list[str] = Field(default_factory=list)

  class McpTool(BaseModel):
      name: str
      description: str
      input_schema: McpToolInputSchema = Field(alias="inputSchema")

  class GetProjectStatusArgs(BaseModel):
      project_path: Optional[str] = Field(None, alias="projectPath")
      include_metrics: Optional[bool] = Field(False, alias="includeMetrics")
  ```

- [ ] **모든 Args/Response 타입 변환** (12개 도구 타입)

#### 2.2.2 설정 모듈 변환

- [ ] **config.ts → config.py 변환**

  **TypeScript (원본)**:
  ```typescript
  // src/server/config.ts
  export const config = {
    server: {
      name: 'devflow-monitor',
      version: '1.0.0',
    },
    monitoring: {
      pollInterval: 5000,
      maxEvents: 1000,
    },
    database: {
      path: './data/devflow.db',
    },
  };
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/server/config.py
  from pydantic_settings import BaseSettings
  from pydantic import Field

  class ServerConfig(BaseSettings):
      name: str = "devflow-monitor"
      version: str = "1.0.0"

  class MonitoringConfig(BaseSettings):
      poll_interval: int = Field(5000, alias="pollInterval")
      max_events: int = Field(1000, alias="maxEvents")

  class DatabaseConfig(BaseSettings):
      path: str = "./data/devflow.db"

  class Config(BaseSettings):
      server: ServerConfig = Field(default_factory=ServerConfig)
      monitoring: MonitoringConfig = Field(default_factory=MonitoringConfig)
      database: DatabaseConfig = Field(default_factory=DatabaseConfig)

      class Config:
          env_prefix = "DEVFLOW_"
          env_nested_delimiter = "__"

  config = Config()
  ```

#### 2.2.3 MCP 서버 메인 클래스 변환

- [ ] **MCP 서버 초기화 코드 변환**

  **TypeScript (원본)**:
  ```typescript
  // src/server/index.ts
  import { Server } from '@modelcontextprotocol/sdk/server/index.js';
  import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

  const server = new Server(
    { name: config.server.name, version: config.server.version },
    { capabilities: { tools: {} } }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/server/main.py
  from mcp.server import Server
  from mcp.server.stdio import stdio_server

  from .config import config

  server = Server(config.server.name)

  async def main():
      async with stdio_server() as (read_stream, write_stream):
          await server.run(
              read_stream,
              write_stream,
              server.create_initialization_options()
          )

  if __name__ == "__main__":
      import asyncio
      asyncio.run(main())
  ```

- [ ] **도구 등록 시스템 변환**

  **TypeScript (원본)**:
  ```typescript
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'getProjectStatus',
        description: 'Get current project status',
        inputSchema: { type: 'object', properties: {...} }
      },
      // ... 86개 더
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    switch (request.params.name) {
      case 'getProjectStatus':
        return handleGetProjectStatus(request.params.arguments);
      // ...
    }
  });
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/server/tools.py
  from mcp.server import Server
  from mcp.types import Tool, TextContent

  def register_tools(server: Server):
      @server.list_tools()
      async def list_tools() -> list[Tool]:
          return [
              Tool(
                  name="getProjectStatus",
                  description="Get current project status",
                  inputSchema={
                      "type": "object",
                      "properties": {
                          "projectPath": {"type": "string"},
                          "includeMetrics": {"type": "boolean"}
                      }
                  }
              ),
              # ... 86개 더
          ]

      @server.call_tool()
      async def call_tool(name: str, arguments: dict) -> list[TextContent]:
          match name:
              case "getProjectStatus":
                  return await handle_get_project_status(arguments)
              case _:
                  raise ValueError(f"Unknown tool: {name}")
  ```

- [ ] **87개 MCP 도구 핸들러 변환** (모듈별로 분리)

#### 2.2.4 검증 체크리스트

- [ ] MCP 서버 시작 테스트
- [ ] Claude Desktop 연동 테스트
- [ ] 기본 도구 호출 테스트 (getProjectStatus)
- [ ] 타입 검증 테스트

---

### 2.3 이벤트 시스템 마이그레이션

**원본**: `src/events/` (3,612줄)
**대상**: `src/devflow_monitor/events/`

#### 2.3.1 이벤트 타입 정의 변환

- [ ] **base.ts → base.py 변환**

  **TypeScript (원본)**:
  ```typescript
  // src/events/types/base.ts
  export enum EventCategory {
    FILE = 'file',
    GIT = 'git',
    BUILD = 'build',
    TEST = 'test',
    DEPLOY = 'deploy',
  }

  export enum EventSeverity {
    DEBUG = 'debug',
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical',
  }

  export interface BaseEvent {
    id: string;
    type: string;
    category: EventCategory;
    severity: EventSeverity;
    timestamp: Date;
    source: string;
    data: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/events/types/base.py
  from enum import Enum
  from datetime import datetime
  from typing import Any, Optional
  from pydantic import BaseModel, Field
  import uuid

  class EventCategory(str, Enum):
      FILE = "file"
      GIT = "git"
      BUILD = "build"
      TEST = "test"
      DEPLOY = "deploy"

  class EventSeverity(str, Enum):
      DEBUG = "debug"
      INFO = "info"
      WARNING = "warning"
      ERROR = "error"
      CRITICAL = "critical"

  class BaseEvent(BaseModel):
      id: str = Field(default_factory=lambda: str(uuid.uuid4()))
      type: str
      category: EventCategory
      severity: EventSeverity
      timestamp: datetime = Field(default_factory=datetime.utcnow)
      source: str
      data: dict[str, Any] = Field(default_factory=dict)
      metadata: Optional[dict[str, Any]] = None
  ```

- [ ] **file.ts → file.py 변환** (FileEvent 타입)
- [ ] **git.ts → git.py 변환** (GitEvent 타입)

#### 2.3.2 이벤트 엔진 변환

- [ ] **engine.ts → engine.py 변환**

  **TypeScript (원본)**:
  ```typescript
  // src/events/engine.ts
  import EventEmitter from 'eventemitter3';

  export class EventEngine extends EventEmitter {
    private subscribers: Map<string, EventSubscriber[]> = new Map();
    private eventHistory: BaseEvent[] = [];
    private maxHistorySize = 10000;

    subscribe<T extends BaseEvent>(
      pattern: string | RegExp,
      handler: (event: T) => void | Promise<void>
    ): string {
      const id = crypto.randomUUID();
      // ... 구독 로직
      return id;
    }

    async publish(event: BaseEvent): Promise<void> {
      this.eventHistory.push(event);
      if (this.eventHistory.length > this.maxHistorySize) {
        this.eventHistory.shift();
      }

      this.emit(event.type, event);
      this.emit(event.category, event);
      this.emit('*', event);

      // 매칭되는 구독자에게 전달
      for (const [pattern, subscribers] of this.subscribers) {
        if (this.matchPattern(pattern, event)) {
          for (const sub of subscribers) {
            await sub.handler(event);
          }
        }
      }
    }
  }
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/events/engine.py
  import asyncio
  import re
  import uuid
  from collections import deque
  from typing import Callable, Awaitable, Union
  from dataclasses import dataclass, field

  from .types.base import BaseEvent

  EventHandler = Callable[[BaseEvent], Awaitable[None]]

  @dataclass
  class EventSubscriber:
      id: str
      pattern: Union[str, re.Pattern]
      handler: EventHandler

  class EventEngine:
      def __init__(self, max_history_size: int = 10000):
          self._subscribers: dict[str, list[EventSubscriber]] = {}
          self._event_history: deque[BaseEvent] = deque(maxlen=max_history_size)
          self._type_handlers: dict[str, list[EventHandler]] = {}
          self._category_handlers: dict[str, list[EventHandler]] = {}
          self._global_handlers: list[EventHandler] = []

      def subscribe(
          self,
          pattern: Union[str, re.Pattern],
          handler: EventHandler
      ) -> str:
          """이벤트 패턴 구독"""
          sub_id = str(uuid.uuid4())
          subscriber = EventSubscriber(id=sub_id, pattern=pattern, handler=handler)

          pattern_key = pattern if isinstance(pattern, str) else pattern.pattern
          if pattern_key not in self._subscribers:
              self._subscribers[pattern_key] = []
          self._subscribers[pattern_key].append(subscriber)

          return sub_id

      def on(self, event_type: str, handler: EventHandler) -> None:
          """특정 이벤트 타입 리스너 등록"""
          if event_type == "*":
              self._global_handlers.append(handler)
          elif event_type not in self._type_handlers:
              self._type_handlers[event_type] = []
          self._type_handlers[event_type].append(handler)

      async def publish(self, event: BaseEvent) -> None:
          """이벤트 발행"""
          self._event_history.append(event)

          # 타입별 핸들러 호출
          tasks = []

          if event.type in self._type_handlers:
              for handler in self._type_handlers[event.type]:
                  tasks.append(handler(event))

          if event.category.value in self._category_handlers:
              for handler in self._category_handlers[event.category.value]:
                  tasks.append(handler(event))

          for handler in self._global_handlers:
              tasks.append(handler(event))

          # 패턴 매칭 구독자
          for pattern_key, subscribers in self._subscribers.items():
              if self._match_pattern(pattern_key, event):
                  for sub in subscribers:
                      tasks.append(sub.handler(event))

          if tasks:
              await asyncio.gather(*tasks, return_exceptions=True)

      def _match_pattern(self, pattern: str, event: BaseEvent) -> bool:
          """패턴 매칭"""
          if pattern == "*":
              return True
          if pattern == event.type:
              return True
          try:
              return bool(re.match(pattern, event.type))
          except re.error:
              return False

      def get_history(self, limit: int = 100) -> list[BaseEvent]:
          """이벤트 히스토리 조회"""
          return list(self._event_history)[-limit:]

  # 싱글톤 인스턴스
  event_engine = EventEngine()
  ```

#### 2.3.3 이벤트 큐 시스템 변환

- [ ] **queue.ts → queue.py 변환**

  **TypeScript (원본)**:
  ```typescript
  // src/events/queue.ts
  export class EventQueue {
    private queues: Map<Priority, BaseEvent[]> = new Map();
    private processing = false;
    private batchSize = 100;

    enqueue(event: BaseEvent, priority: Priority = Priority.NORMAL): void {
      const queue = this.queues.get(priority) || [];
      queue.push(event);
      this.queues.set(priority, queue);

      if (queue.length >= this.batchSize) {
        this.flush(priority);
      }
    }

    async flush(priority?: Priority): Promise<void> {
      // 우선순위 순서대로 처리
      const priorities = [Priority.CRITICAL, Priority.HIGH, Priority.NORMAL, Priority.LOW];
      for (const p of priorities) {
        if (priority && p !== priority) continue;
        const queue = this.queues.get(p) || [];
        while (queue.length > 0) {
          const batch = queue.splice(0, this.batchSize);
          await this.processBatch(batch);
        }
      }
    }
  }
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/events/queue.py
  import asyncio
  from enum import IntEnum
  from collections import defaultdict
  from typing import Callable, Awaitable
  import heapq

  from .types.base import BaseEvent

  class Priority(IntEnum):
      CRITICAL = 0
      HIGH = 1
      NORMAL = 2
      LOW = 3
      BATCH = 4

  class EventQueue:
      def __init__(self, batch_size: int = 100):
          self._queues: dict[Priority, list[BaseEvent]] = defaultdict(list)
          self._processing = False
          self._batch_size = batch_size
          self._processor: Callable[[list[BaseEvent]], Awaitable[None]] | None = None

      def set_processor(self, processor: Callable[[list[BaseEvent]], Awaitable[None]]) -> None:
          self._processor = processor

      async def enqueue(self, event: BaseEvent, priority: Priority = Priority.NORMAL) -> None:
          """이벤트 큐에 추가"""
          self._queues[priority].append(event)

          if len(self._queues[priority]) >= self._batch_size:
              await self.flush(priority)

      async def flush(self, priority: Priority | None = None) -> None:
          """큐 플러시 및 처리"""
          if self._processing:
              return

          self._processing = True
          try:
              priorities = [Priority.CRITICAL, Priority.HIGH, Priority.NORMAL, Priority.LOW, Priority.BATCH]

              for p in priorities:
                  if priority is not None and p != priority:
                      continue

                  queue = self._queues[p]
                  while queue:
                      batch = queue[:self._batch_size]
                      del queue[:self._batch_size]

                      if self._processor:
                          await self._processor(batch)
          finally:
              self._processing = False

      def get_stats(self) -> dict:
          """큐 상태 조회"""
          return {
              priority.name: len(events)
              for priority, events in self._queues.items()
          }
  ```

- [ ] **queue-manager.ts → queue_manager.py 변환**
- [ ] **builder.ts → builder.py 변환**
- [ ] **validator.ts → validator.py 변환**

#### 2.3.4 검증 체크리스트

- [ ] 이벤트 발행/구독 테스트
- [ ] 패턴 매칭 테스트
- [ ] 우선순위 큐 테스트
- [ ] 배치 처리 테스트
- [ ] 메모리 제한 테스트

---

### 2.4 스토리지 계층 마이그레이션

**원본**: `src/storage/` (2,317줄)
**대상**: `src/devflow_monitor/storage/`

#### 2.4.1 데이터베이스 매니저 변환

- [ ] **database.ts → database.py 변환**

  **TypeScript (원본)**:
  ```typescript
  // src/storage/database.ts
  import Database from 'better-sqlite3';

  export class DatabaseManager {
    private db: Database.Database;

    constructor(dbPath: string) {
      this.db = new Database(dbPath);
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');
      this.initializeTables();
    }

    private initializeTables(): void {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          category TEXT NOT NULL,
          severity TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          source TEXT NOT NULL,
          data TEXT NOT NULL,
          metadata TEXT
        )
      `);
      // ... 더 많은 테이블
    }
  }
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/storage/database.py
  import aiosqlite
  from pathlib import Path
  from contextlib import asynccontextmanager
  from typing import AsyncGenerator

  class DatabaseManager:
      def __init__(self, db_path: str = "./data/devflow.db"):
          self.db_path = Path(db_path)
          self.db_path.parent.mkdir(parents=True, exist_ok=True)
          self._connection: aiosqlite.Connection | None = None

      async def connect(self) -> None:
          """데이터베이스 연결"""
          self._connection = await aiosqlite.connect(self.db_path)
          await self._connection.execute("PRAGMA foreign_keys = ON")
          await self._connection.execute("PRAGMA journal_mode = WAL")
          await self._initialize_tables()

      async def disconnect(self) -> None:
          """연결 종료"""
          if self._connection:
              await self._connection.close()
              self._connection = None

      @asynccontextmanager
      async def transaction(self) -> AsyncGenerator[aiosqlite.Connection, None]:
          """트랜잭션 컨텍스트 매니저"""
          if not self._connection:
              raise RuntimeError("Database not connected")
          try:
              yield self._connection
              await self._connection.commit()
          except Exception:
              await self._connection.rollback()
              raise

      async def _initialize_tables(self) -> None:
          """테이블 초기화"""
          if not self._connection:
              return

          await self._connection.executescript("""
              CREATE TABLE IF NOT EXISTS events (
                  id TEXT PRIMARY KEY,
                  type TEXT NOT NULL,
                  category TEXT NOT NULL,
                  severity TEXT NOT NULL,
                  timestamp TEXT NOT NULL,
                  source TEXT NOT NULL,
                  data TEXT NOT NULL,
                  metadata TEXT
              );

              CREATE TABLE IF NOT EXISTS activities (
                  id TEXT PRIMARY KEY,
                  event_id TEXT,
                  activity_type TEXT NOT NULL,
                  description TEXT,
                  timestamp TEXT NOT NULL,
                  FOREIGN KEY (event_id) REFERENCES events(id)
              );

              CREATE TABLE IF NOT EXISTS metrics (
                  id TEXT PRIMARY KEY,
                  name TEXT NOT NULL,
                  value REAL NOT NULL,
                  unit TEXT,
                  timestamp TEXT NOT NULL,
                  tags TEXT
              );

              CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
              CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
              CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(name);
          """)

      @property
      def connection(self) -> aiosqlite.Connection:
          if not self._connection:
              raise RuntimeError("Database not connected")
          return self._connection

  # 싱글톤
  _db_manager: DatabaseManager | None = None

  def get_database_manager(db_path: str = "./data/devflow.db") -> DatabaseManager:
      global _db_manager
      if _db_manager is None:
          _db_manager = DatabaseManager(db_path)
      return _db_manager
  ```

#### 2.4.2 Repository 패턴 변환

- [ ] **base.ts → base.py 변환**

  **TypeScript (원본)**:
  ```typescript
  // src/storage/repositories/base.ts
  export abstract class BaseRepository<T> {
    protected db: Database.Database;
    protected tableName: string;

    constructor(db: Database.Database, tableName: string) {
      this.db = db;
      this.tableName = tableName;
    }

    abstract insert(item: T): Promise<void>;
    abstract findById(id: string): Promise<T | null>;
    abstract findAll(options?: QueryOptions): Promise<T[]>;
    abstract update(id: string, item: Partial<T>): Promise<void>;
    abstract delete(id: string): Promise<void>;
  }
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/storage/repositories/base.py
  from abc import ABC, abstractmethod
  from typing import TypeVar, Generic, Optional
  import aiosqlite

  T = TypeVar('T')

  class QueryOptions:
      def __init__(
          self,
          limit: int = 100,
          offset: int = 0,
          order_by: str | None = None,
          order_dir: str = "DESC",
          filters: dict | None = None
      ):
          self.limit = limit
          self.offset = offset
          self.order_by = order_by
          self.order_dir = order_dir
          self.filters = filters or {}

  class BaseRepository(ABC, Generic[T]):
      def __init__(self, connection: aiosqlite.Connection, table_name: str):
          self._connection = connection
          self._table_name = table_name

      @abstractmethod
      async def insert(self, item: T) -> None:
          """항목 삽입"""
          pass

      @abstractmethod
      async def find_by_id(self, id: str) -> Optional[T]:
          """ID로 조회"""
          pass

      @abstractmethod
      async def find_all(self, options: QueryOptions | None = None) -> list[T]:
          """전체 조회"""
          pass

      @abstractmethod
      async def update(self, id: str, item: dict) -> None:
          """항목 업데이트"""
          pass

      @abstractmethod
      async def delete(self, id: str) -> None:
          """항목 삭제"""
          pass

      async def count(self, filters: dict | None = None) -> int:
          """개수 조회"""
          query = f"SELECT COUNT(*) FROM {self._table_name}"
          params = []

          if filters:
              conditions = []
              for key, value in filters.items():
                  conditions.append(f"{key} = ?")
                  params.append(value)
              query += " WHERE " + " AND ".join(conditions)

          async with self._connection.execute(query, params) as cursor:
              row = await cursor.fetchone()
              return row[0] if row else 0
  ```

- [ ] **event.ts → event.py 변환** (EventRepository)
- [ ] **activity.ts → activity.py 변환** (ActivityRepository)
- [ ] **metrics.ts → metrics.py 변환** (MetricsRepository)
- [ ] **file-monitor-cache.ts → file_monitor_cache.py 변환**

#### 2.4.3 Storage Manager 변환

- [ ] **storage-manager.ts → storage_manager.py 변환**

  **Python (변환)**:
  ```python
  # src/devflow_monitor/storage/storage_manager.py
  from .database import DatabaseManager, get_database_manager
  from .repositories.event import EventRepository
  from .repositories.activity import ActivityRepository
  from .repositories.metrics import MetricsRepository
  from ..events.engine import EventEngine

  class StorageManager:
      def __init__(self, db_manager: DatabaseManager):
          self._db_manager = db_manager
          self._event_repo: EventRepository | None = None
          self._activity_repo: ActivityRepository | None = None
          self._metrics_repo: MetricsRepository | None = None

      async def initialize(self) -> None:
          """스토리지 초기화"""
          await self._db_manager.connect()
          conn = self._db_manager.connection

          self._event_repo = EventRepository(conn)
          self._activity_repo = ActivityRepository(conn)
          self._metrics_repo = MetricsRepository(conn)

      async def shutdown(self) -> None:
          """스토리지 종료"""
          await self._db_manager.disconnect()

      def connect_event_engine(self, engine: EventEngine) -> None:
          """이벤트 엔진 연결 - 이벤트 자동 저장"""
          async def save_event(event):
              if self._event_repo:
                  await self._event_repo.insert(event)

          engine.on("*", save_event)

      @property
      def events(self) -> EventRepository:
          if not self._event_repo:
              raise RuntimeError("Storage not initialized")
          return self._event_repo

      @property
      def activities(self) -> ActivityRepository:
          if not self._activity_repo:
              raise RuntimeError("Storage not initialized")
          return self._activity_repo

      @property
      def metrics(self) -> MetricsRepository:
          if not self._metrics_repo:
              raise RuntimeError("Storage not initialized")
          return self._metrics_repo

  # 싱글톤
  _storage_manager: StorageManager | None = None

  async def get_storage_manager() -> StorageManager:
      global _storage_manager
      if _storage_manager is None:
          db_manager = get_database_manager()
          _storage_manager = StorageManager(db_manager)
          await _storage_manager.initialize()
      return _storage_manager
  ```

#### 2.4.4 검증 체크리스트

- [ ] 데이터베이스 연결 테스트
- [ ] CRUD 작업 테스트
- [ ] 트랜잭션 테스트
- [ ] 마이그레이션 테스트
- [ ] 이벤트 엔진 연동 테스트

---

## 3. Phase 2: 모니터링 시스템 (2-3주)

### 3.1 파일 모니터 마이그레이션

**원본**: `src/monitors/file.ts` (232줄)
**대상**: `src/devflow_monitor/monitors/file.py`

#### 3.1.1 BaseMonitor 추상 클래스 변환

- [ ] **base.ts → base.py 변환**

  **TypeScript (원본)**:
  ```typescript
  // src/monitors/base.ts
  import EventEmitter from 'eventemitter3';

  export interface MonitorEvent {
    type: string;
    path: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }

  export abstract class BaseMonitor extends EventEmitter {
    protected isRunning = false;
    protected config: MonitorConfig;

    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
    abstract getStatus(): MonitorStatus;

    protected emitEvent(event: MonitorEvent): void {
      this.emit('event', event);
      this.emit(event.type, event);
    }
  }
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/monitors/base.py
  from abc import ABC, abstractmethod
  from dataclasses import dataclass, field
  from datetime import datetime
  from typing import Any, Callable, Awaitable
  from enum import Enum

  class MonitorStatus(str, Enum):
      STOPPED = "stopped"
      RUNNING = "running"
      ERROR = "error"

  @dataclass
  class MonitorEvent:
      type: str
      path: str
      timestamp: datetime = field(default_factory=datetime.utcnow)
      metadata: dict[str, Any] = field(default_factory=dict)

  @dataclass
  class MonitorConfig:
      paths: list[str] = field(default_factory=list)
      ignore_patterns: list[str] = field(default_factory=lambda: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/__pycache__/**",
          "**/.venv/**",
      ])
      extensions: list[str] = field(default_factory=list)
      poll_interval: int = 1000

  EventHandler = Callable[[MonitorEvent], Awaitable[None]]

  class BaseMonitor(ABC):
      def __init__(self, config: MonitorConfig | None = None):
          self._config = config or MonitorConfig()
          self._is_running = False
          self._status = MonitorStatus.STOPPED
          self._event_handlers: dict[str, list[EventHandler]] = {}
          self._global_handlers: list[EventHandler] = []

      def on(self, event_type: str, handler: EventHandler) -> None:
          """이벤트 핸들러 등록"""
          if event_type == "*":
              self._global_handlers.append(handler)
          else:
              if event_type not in self._event_handlers:
                  self._event_handlers[event_type] = []
              self._event_handlers[event_type].append(handler)

      async def _emit_event(self, event: MonitorEvent) -> None:
          """이벤트 발행"""
          import asyncio

          tasks = []

          # 타입별 핸들러
          if event.type in self._event_handlers:
              for handler in self._event_handlers[event.type]:
                  tasks.append(handler(event))

          # 글로벌 핸들러
          for handler in self._global_handlers:
              tasks.append(handler(event))

          if tasks:
              await asyncio.gather(*tasks, return_exceptions=True)

      @abstractmethod
      async def start(self) -> None:
          """모니터링 시작"""
          pass

      @abstractmethod
      async def stop(self) -> None:
          """모니터링 중지"""
          pass

      @abstractmethod
      def get_status(self) -> MonitorStatus:
          """상태 조회"""
          pass

      @property
      def is_running(self) -> bool:
          return self._is_running
  ```

#### 3.1.2 FileMonitor 클래스 변환

- [ ] **file.ts → file.py 변환**

  **TypeScript (원본)**:
  ```typescript
  // src/monitors/file.ts
  import chokidar, { FSWatcher } from 'chokidar';

  export class FileMonitor extends BaseMonitor {
    private watcher?: FSWatcher;
    private changeBuffer: Map<string, NodeJS.Timeout> = new Map();
    private debounceMs = 200;

    async start(): Promise<void> {
      this.watcher = chokidar.watch(this.config.paths, {
        ignored: this.config.ignorePatterns,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100,
        },
      });

      this.watcher.on('add', (path) => this.handleChange('add', path));
      this.watcher.on('change', (path) => this.handleChange('change', path));
      this.watcher.on('unlink', (path) => this.handleChange('unlink', path));

      this.isRunning = true;
    }

    private handleChange(type: string, path: string): void {
      // 디바운싱
      if (this.changeBuffer.has(path)) {
        clearTimeout(this.changeBuffer.get(path)!);
      }

      this.changeBuffer.set(path, setTimeout(() => {
        this.changeBuffer.delete(path);
        const context = this.analyzeFileContext(path);
        this.emitEvent({
          type: `file:${type}`,
          path,
          timestamp: new Date(),
          metadata: { context, extension: extname(path) },
        });
      }, this.debounceMs));
    }

    private analyzeFileContext(path: string): string {
      if (path.includes('test') || path.includes('spec')) return 'test';
      if (path.includes('config')) return 'config';
      if (path.endsWith('.md')) return 'docs';
      return 'source';
    }
  }
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/monitors/file.py
  import asyncio
  from pathlib import Path
  from datetime import datetime
  from watchdog.observers import Observer
  from watchdog.events import (
      FileSystemEventHandler,
      FileCreatedEvent,
      FileModifiedEvent,
      FileDeletedEvent,
      DirCreatedEvent,
      DirDeletedEvent,
  )
  import fnmatch

  from .base import BaseMonitor, MonitorConfig, MonitorEvent, MonitorStatus

  class FileEventHandler(FileSystemEventHandler):
      def __init__(self, monitor: "FileMonitor"):
          super().__init__()
          self._monitor = monitor

      def on_created(self, event):
          if not event.is_directory:
              asyncio.create_task(
                  self._monitor._handle_change("add", event.src_path)
              )

      def on_modified(self, event):
          if not event.is_directory:
              asyncio.create_task(
                  self._monitor._handle_change("change", event.src_path)
              )

      def on_deleted(self, event):
          if not event.is_directory:
              asyncio.create_task(
                  self._monitor._handle_change("unlink", event.src_path)
              )

  class FileMonitor(BaseMonitor):
      def __init__(self, config: MonitorConfig | None = None):
          super().__init__(config)
          self._observer: Observer | None = None
          self._change_buffer: dict[str, asyncio.Task] = {}
          self._debounce_seconds = 0.2

      async def start(self) -> None:
          """파일 모니터링 시작"""
          if self._is_running:
              return

          self._observer = Observer()
          event_handler = FileEventHandler(self)

          for path in self._config.paths:
              if Path(path).exists():
                  self._observer.schedule(event_handler, path, recursive=True)

          self._observer.start()
          self._is_running = True
          self._status = MonitorStatus.RUNNING

      async def stop(self) -> None:
          """파일 모니터링 중지"""
          if self._observer:
              self._observer.stop()
              self._observer.join()
              self._observer = None

          # 대기 중인 디바운스 취소
          for task in self._change_buffer.values():
              task.cancel()
          self._change_buffer.clear()

          self._is_running = False
          self._status = MonitorStatus.STOPPED

      def get_status(self) -> MonitorStatus:
          return self._status

      async def _handle_change(self, change_type: str, path: str) -> None:
          """파일 변경 처리 (디바운싱 적용)"""
          # 무시 패턴 체크
          if self._should_ignore(path):
              return

          # 기존 디바운스 취소
          if path in self._change_buffer:
              self._change_buffer[path].cancel()

          # 새 디바운스 태스크 생성
          async def debounced_emit():
              await asyncio.sleep(self._debounce_seconds)
              del self._change_buffer[path]

              context = self._analyze_file_context(path)
              extension = Path(path).suffix

              event = MonitorEvent(
                  type=f"file:{change_type}",
                  path=path,
                  timestamp=datetime.utcnow(),
                  metadata={
                      "context": context,
                      "extension": extension,
                      "filename": Path(path).name,
                  }
              )
              await self._emit_event(event)

          self._change_buffer[path] = asyncio.create_task(debounced_emit())

      def _should_ignore(self, path: str) -> bool:
          """무시 패턴 체크"""
          for pattern in self._config.ignore_patterns:
              if fnmatch.fnmatch(path, pattern):
                  return True
          return False

      def _analyze_file_context(self, path: str) -> str:
          """파일 컨텍스트 분석"""
          path_lower = path.lower()

          if "test" in path_lower or "spec" in path_lower:
              return "test"
          if "config" in path_lower:
              return "config"
          if path.endswith(".md"):
              return "docs"
          if "build" in path_lower or "dist" in path_lower:
              return "build"

          return "source"
  ```

#### 3.1.3 검증 체크리스트

- [ ] 파일 생성 이벤트 감지 테스트
- [ ] 파일 수정 이벤트 감지 테스트
- [ ] 파일 삭제 이벤트 감지 테스트
- [ ] 무시 패턴 테스트
- [ ] 디바운싱 테스트

---

### 3.2 Git 모니터 마이그레이션

**원본**: `src/monitors/git.ts` (435줄)
**대상**: `src/devflow_monitor/monitors/git.py`

#### 3.2.1 GitMonitor 클래스 변환

- [ ] **git.ts → git.py 변환**

  **TypeScript (원본)**:
  ```typescript
  // src/monitors/git.ts
  import simpleGit, { SimpleGit } from 'simple-git';

  export class GitMonitor extends BaseMonitor {
    private git: SimpleGit;
    private pollTimer?: NodeJS.Timeout;
    private lastCommitHash?: string;
    private lastBranchState: Map<string, string> = new Map();
    private pollInterval = 60000;

    constructor(config: GitMonitorConfig) {
      super(config);
      this.git = simpleGit(config.repoPath);
    }

    async start(): Promise<void> {
      await this.captureInitialState();
      this.pollTimer = setInterval(() => this.poll(), this.pollInterval);
      this.isRunning = true;
    }

    private async poll(): Promise<void> {
      await this.checkForNewCommits();
      await this.checkForBranchChanges();
      await this.checkForMerges();
    }

    private async checkForNewCommits(): Promise<void> {
      const log = await this.git.log({ maxCount: 1 });
      const latestHash = log.latest?.hash;

      if (latestHash && latestHash !== this.lastCommitHash) {
        const commitInfo = await this.analyzeCommit(log.latest!);
        this.emitEvent({
          type: 'git:commit',
          path: this.config.repoPath,
          timestamp: new Date(),
          metadata: commitInfo,
        });
        this.lastCommitHash = latestHash;
      }
    }

    private analyzeCommit(commit: LogResult): CommitAnalysis {
      const message = commit.message;
      const conventionalMatch = message.match(
        /^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?:\s(.+)/
      );

      return {
        hash: commit.hash,
        author: commit.author_name,
        message: commit.message,
        isConventional: !!conventionalMatch,
        type: conventionalMatch?.[1] || 'other',
        scope: conventionalMatch?.[2]?.slice(1, -1),
      };
    }
  }
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/monitors/git.py
  import asyncio
  import re
  from dataclasses import dataclass, field
  from datetime import datetime
  from pathlib import Path
  from git import Repo, InvalidGitRepositoryError
  from git.objects.commit import Commit

  from .base import BaseMonitor, MonitorConfig, MonitorEvent, MonitorStatus

  @dataclass
  class GitMonitorConfig(MonitorConfig):
      repo_path: str = "."
      poll_interval: int = 60000  # ms

  @dataclass
  class CommitAnalysis:
      hash: str
      author: str
      message: str
      is_conventional: bool
      commit_type: str
      scope: str | None = None
      files_changed: int = 0
      insertions: int = 0
      deletions: int = 0

  @dataclass
  class BranchAnalysis:
      name: str
      pattern: str
      is_feature: bool = False
      is_bugfix: bool = False
      is_hotfix: bool = False
      is_release: bool = False

  class GitMonitor(BaseMonitor):
      CONVENTIONAL_PATTERN = re.compile(
          r"^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)"
          r"(\(.+\))?:\s(.+)"
      )

      BRANCH_PATTERNS = {
          "feature": re.compile(r"^feature/"),
          "bugfix": re.compile(r"^(bugfix|fix)/"),
          "hotfix": re.compile(r"^hotfix/"),
          "release": re.compile(r"^release/"),
          "develop": re.compile(r"^develop$"),
          "main": re.compile(r"^(main|master)$"),
      }

      def __init__(self, config: GitMonitorConfig | None = None):
          super().__init__(config)
          self._config: GitMonitorConfig = config or GitMonitorConfig()
          self._repo: Repo | None = None
          self._poll_task: asyncio.Task | None = None
          self._last_commit_hash: str | None = None
          self._last_branch_state: dict[str, str] = {}
          self._poll_interval_seconds = self._config.poll_interval / 1000

      async def start(self) -> None:
          """Git 모니터링 시작"""
          if self._is_running:
              return

          try:
              self._repo = Repo(self._config.repo_path)
          except InvalidGitRepositoryError:
              self._status = MonitorStatus.ERROR
              raise ValueError(f"Invalid git repository: {self._config.repo_path}")

          await self._capture_initial_state()
          self._poll_task = asyncio.create_task(self._poll_loop())
          self._is_running = True
          self._status = MonitorStatus.RUNNING

      async def stop(self) -> None:
          """Git 모니터링 중지"""
          if self._poll_task:
              self._poll_task.cancel()
              try:
                  await self._poll_task
              except asyncio.CancelledError:
                  pass
              self._poll_task = None

          self._repo = None
          self._is_running = False
          self._status = MonitorStatus.STOPPED

      def get_status(self) -> MonitorStatus:
          return self._status

      async def _capture_initial_state(self) -> None:
          """초기 상태 캡처"""
          if not self._repo:
              return

          # 최신 커밋 해시
          try:
              self._last_commit_hash = self._repo.head.commit.hexsha
          except Exception:
              self._last_commit_hash = None

          # 브랜치 상태
          for branch in self._repo.branches:
              self._last_branch_state[branch.name] = branch.commit.hexsha

      async def _poll_loop(self) -> None:
          """폴링 루프"""
          while True:
              try:
                  await self._check_for_new_commits()
                  await self._check_for_branch_changes()
                  await asyncio.sleep(self._poll_interval_seconds)
              except asyncio.CancelledError:
                  break
              except Exception as e:
                  # 에러 로깅 후 계속
                  print(f"Git polling error: {e}")
                  await asyncio.sleep(self._poll_interval_seconds)

      async def _check_for_new_commits(self) -> None:
          """새 커밋 확인"""
          if not self._repo:
              return

          try:
              latest_commit = self._repo.head.commit
              latest_hash = latest_commit.hexsha

              if latest_hash != self._last_commit_hash:
                  analysis = self._analyze_commit(latest_commit)

                  event = MonitorEvent(
                      type="git:commit",
                      path=self._config.repo_path,
                      timestamp=datetime.utcnow(),
                      metadata={
                          "hash": analysis.hash,
                          "author": analysis.author,
                          "message": analysis.message,
                          "is_conventional": analysis.is_conventional,
                          "commit_type": analysis.commit_type,
                          "scope": analysis.scope,
                          "files_changed": analysis.files_changed,
                          "insertions": analysis.insertions,
                          "deletions": analysis.deletions,
                      }
                  )
                  await self._emit_event(event)
                  self._last_commit_hash = latest_hash

          except Exception as e:
              print(f"Error checking commits: {e}")

      async def _check_for_branch_changes(self) -> None:
          """브랜치 변경 확인"""
          if not self._repo:
              return

          current_branches = {b.name: b.commit.hexsha for b in self._repo.branches}

          # 새 브랜치 감지
          for name, hash_ in current_branches.items():
              if name not in self._last_branch_state:
                  analysis = self._analyze_branch(name)
                  event = MonitorEvent(
                      type="git:branch:create",
                      path=self._config.repo_path,
                      timestamp=datetime.utcnow(),
                      metadata={
                          "branch": name,
                          "pattern": analysis.pattern,
                          "is_feature": analysis.is_feature,
                          "is_bugfix": analysis.is_bugfix,
                      }
                  )
                  await self._emit_event(event)

          # 삭제된 브랜치 감지
          for name in self._last_branch_state:
              if name not in current_branches:
                  event = MonitorEvent(
                      type="git:branch:delete",
                      path=self._config.repo_path,
                      timestamp=datetime.utcnow(),
                      metadata={"branch": name}
                  )
                  await self._emit_event(event)

          self._last_branch_state = current_branches

      def _analyze_commit(self, commit: Commit) -> CommitAnalysis:
          """커밋 분석"""
          message = commit.message.strip()
          match = self.CONVENTIONAL_PATTERN.match(message)

          # 통계 계산
          stats = commit.stats.total
          files_changed = stats.get("files", 0)
          insertions = stats.get("insertions", 0)
          deletions = stats.get("deletions", 0)

          return CommitAnalysis(
              hash=commit.hexsha[:8],
              author=commit.author.name,
              message=message.split("\n")[0],  # 첫 줄만
              is_conventional=bool(match),
              commit_type=match.group(1) if match else "other",
              scope=match.group(2)[1:-1] if match and match.group(2) else None,
              files_changed=files_changed,
              insertions=insertions,
              deletions=deletions,
          )

      def _analyze_branch(self, name: str) -> BranchAnalysis:
          """브랜치 분석"""
          pattern = "other"
          is_feature = False
          is_bugfix = False
          is_hotfix = False
          is_release = False

          for pattern_name, regex in self.BRANCH_PATTERNS.items():
              if regex.match(name):
                  pattern = pattern_name
                  if pattern_name == "feature":
                      is_feature = True
                  elif pattern_name == "bugfix":
                      is_bugfix = True
                  elif pattern_name == "hotfix":
                      is_hotfix = True
                  elif pattern_name == "release":
                      is_release = True
                  break

          return BranchAnalysis(
              name=name,
              pattern=pattern,
              is_feature=is_feature,
              is_bugfix=is_bugfix,
              is_hotfix=is_hotfix,
              is_release=is_release,
          )
  ```

#### 3.2.2 검증 체크리스트

- [ ] 커밋 감지 테스트
- [ ] Conventional Commits 파싱 테스트
- [ ] 브랜치 생성/삭제 감지 테스트
- [ ] 브랜치 패턴 분석 테스트
- [ ] 폴링 간격 테스트

---

## 4. Phase 3: 분석 엔진 (2-3주)

### 4.1 Stage Analyzer 마이그레이션

**원본**: `src/analyzers/stage-analyzer.ts` (724줄)
**대상**: `src/devflow_monitor/analyzers/stage_analyzer.py`

#### 4.1.1 개발 단계 타입 정의

- [ ] **types/stage.ts → types/stage.py 변환**

  **Python (변환)**:
  ```python
  # src/devflow_monitor/analyzers/types/stage.py
  from enum import Enum
  from dataclasses import dataclass, field
  from datetime import datetime
  from typing import Any

  class DevelopmentStage(str, Enum):
      PRD = "prd"
      PLANNING = "planning"
      ERD = "erd"
      WIREFRAME = "wireframe"
      SCREEN_SPEC = "screen_spec"
      DESIGN = "design"
      FRONTEND = "frontend"
      BACKEND = "backend"
      AI_COLLABORATION = "ai_collaboration"
      CODING = "coding"
      GIT_MANAGEMENT = "git_management"
      DEPLOYMENT = "deployment"
      OPERATIONS = "operations"

  class CodingSubStage(str, Enum):
      USE_CASE = "use_case"
      EVENT_STORMING = "event_storming"
      DOMAIN_MODELING = "domain_modeling"
      USE_CASE_DETAIL = "use_case_detail"
      AI_PROMPT_DESIGN = "ai_prompt_design"
      SKELETON_IMPL = "skeleton_impl"
      BUSINESS_LOGIC = "business_logic"
      REFACTORING = "refactoring"
      UNIT_TEST = "unit_test"
      INTEGRATION_TEST = "integration_test"
      E2E_TEST = "e2e_test"

  @dataclass
  class StageDetection:
      stage: DevelopmentStage
      confidence: float
      timestamp: datetime = field(default_factory=datetime.utcnow)
      indicators: list[str] = field(default_factory=list)
      sub_stage: CodingSubStage | None = None

  @dataclass
  class StageTransition:
      from_stage: DevelopmentStage
      to_stage: DevelopmentStage
      timestamp: datetime
      confidence: float
      duration_ms: int
  ```

#### 4.1.2 StageAnalyzer 클래스 변환

- [ ] **stage-analyzer.ts → stage_analyzer.py 변환**

  **Python (변환 - 핵심 부분)**:
  ```python
  # src/devflow_monitor/analyzers/stage_analyzer.py
  import re
  from dataclasses import dataclass, field
  from datetime import datetime, timedelta
  from collections import deque

  from .types.stage import (
      DevelopmentStage,
      CodingSubStage,
      StageDetection,
      StageTransition,
  )
  from ..events.engine import EventEngine
  from ..events.types.base import BaseEvent

  @dataclass
  class StageAnalyzerConfig:
      confidence_threshold: float = 0.7
      transition_cooldown_ms: int = 60000
      history_size: int = 50

  @dataclass
  class DetectionRule:
      stage: DevelopmentStage
      patterns: list[re.Pattern]
      file_patterns: list[str]
      weight: float = 1.0

  class StageAnalyzer:
      def __init__(
          self,
          config: StageAnalyzerConfig | None = None,
          event_engine: EventEngine | None = None,
      ):
          self._config = config or StageAnalyzerConfig()
          self._event_engine = event_engine
          self._current_stage: DevelopmentStage | None = None
          self._current_sub_stage: CodingSubStage | None = None
          self._detection_history: deque[StageDetection] = deque(
              maxlen=self._config.history_size
          )
          self._transition_history: list[StageTransition] = []
          self._last_transition_time: datetime | None = None
          self._detection_rules = self._initialize_rules()

          if self._event_engine:
              self._subscribe_to_events()

      def _initialize_rules(self) -> dict[DevelopmentStage, DetectionRule]:
          """단계별 감지 규칙 초기화"""
          return {
              DevelopmentStage.PRD: DetectionRule(
                  stage=DevelopmentStage.PRD,
                  patterns=[
                      re.compile(r"PRD", re.IGNORECASE),
                      re.compile(r"product.?requirement", re.IGNORECASE),
                      re.compile(r"요구사항"),
                  ],
                  file_patterns=["**/PRD*.md", "**/requirements*.md"],
              ),
              DevelopmentStage.PLANNING: DetectionRule(
                  stage=DevelopmentStage.PLANNING,
                  patterns=[
                      re.compile(r"기획"),
                      re.compile(r"planning", re.IGNORECASE),
                      re.compile(r"specification", re.IGNORECASE),
                  ],
                  file_patterns=["**/planning/**", "**/specs/**"],
              ),
              DevelopmentStage.ERD: DetectionRule(
                  stage=DevelopmentStage.ERD,
                  patterns=[
                      re.compile(r"ERD"),
                      re.compile(r"entity.?relationship", re.IGNORECASE),
                      re.compile(r"database.?design", re.IGNORECASE),
                  ],
                  file_patterns=["**/erd/**", "**/*.erd", "**/schema*.sql"],
              ),
              DevelopmentStage.CODING: DetectionRule(
                  stage=DevelopmentStage.CODING,
                  patterns=[
                      re.compile(r"\.(ts|js|py|java|go|rs)$"),
                      re.compile(r"implement", re.IGNORECASE),
                  ],
                  file_patterns=["src/**/*.ts", "src/**/*.py", "src/**/*.js"],
                  weight=0.8,
              ),
              # ... 나머지 단계들
          }

      def _subscribe_to_events(self) -> None:
          """이벤트 구독"""
          if self._event_engine:
              self._event_engine.on("file:add", self._handle_file_event)
              self._event_engine.on("file:change", self._handle_file_event)
              self._event_engine.on("git:commit", self._handle_git_event)

      async def _handle_file_event(self, event: BaseEvent) -> None:
          """파일 이벤트 처리"""
          path = event.data.get("path", "")
          await self.analyze_from_path(path)

      async def _handle_git_event(self, event: BaseEvent) -> None:
          """Git 이벤트 처리"""
          message = event.data.get("message", "")
          await self.analyze_from_commit_message(message)

      async def analyze_from_path(self, path: str) -> StageDetection | None:
          """파일 경로에서 단계 분석"""
          scores: dict[DevelopmentStage, float] = {}

          for stage, rule in self._detection_rules.items():
              score = 0.0

              # 파일 패턴 매칭
              for pattern in rule.file_patterns:
                  if self._match_glob(path, pattern):
                      score += 0.5 * rule.weight

              # 경로 내 패턴 매칭
              for regex in rule.patterns:
                  if regex.search(path):
                      score += 0.3 * rule.weight

              if score > 0:
                  scores[stage] = score

          if not scores:
              return None

          best_stage = max(scores, key=scores.get)
          confidence = min(scores[best_stage], 1.0)

          if confidence >= self._config.confidence_threshold:
              detection = StageDetection(
                  stage=best_stage,
                  confidence=confidence,
                  indicators=[path],
              )
              await self._record_detection(detection)
              return detection

          return None

      async def analyze_from_commit_message(self, message: str) -> StageDetection | None:
          """커밋 메시지에서 단계 분석"""
          scores: dict[DevelopmentStage, float] = {}

          for stage, rule in self._detection_rules.items():
              for regex in rule.patterns:
                  if regex.search(message):
                      scores[stage] = scores.get(stage, 0) + 0.4 * rule.weight

          if not scores:
              return None

          best_stage = max(scores, key=scores.get)
          confidence = min(scores[best_stage], 1.0)

          if confidence >= self._config.confidence_threshold:
              detection = StageDetection(
                  stage=best_stage,
                  confidence=confidence,
                  indicators=[message[:100]],
              )
              await self._record_detection(detection)
              return detection

          return None

      async def _record_detection(self, detection: StageDetection) -> None:
          """감지 기록 및 전환 처리"""
          self._detection_history.append(detection)

          # 쿨다운 체크
          if self._last_transition_time:
              elapsed = (datetime.utcnow() - self._last_transition_time).total_seconds() * 1000
              if elapsed < self._config.transition_cooldown_ms:
                  return

          # 단계 전환
          if self._current_stage != detection.stage:
              if self._current_stage:
                  transition = StageTransition(
                      from_stage=self._current_stage,
                      to_stage=detection.stage,
                      timestamp=datetime.utcnow(),
                      confidence=detection.confidence,
                      duration_ms=int(elapsed) if self._last_transition_time else 0,
                  )
                  self._transition_history.append(transition)

              self._current_stage = detection.stage
              self._last_transition_time = datetime.utcnow()

      def _match_glob(self, path: str, pattern: str) -> bool:
          """Glob 패턴 매칭"""
          import fnmatch
          return fnmatch.fnmatch(path, pattern)

      def get_current_stage(self) -> DevelopmentStage | None:
          return self._current_stage

      def get_transition_history(self) -> list[StageTransition]:
          return self._transition_history.copy()

      def get_stage_summary(self) -> dict:
          """단계 요약 정보"""
          return {
              "current_stage": self._current_stage.value if self._current_stage else None,
              "current_sub_stage": self._current_sub_stage.value if self._current_sub_stage else None,
              "total_transitions": len(self._transition_history),
              "detection_count": len(self._detection_history),
          }
  ```

#### 4.1.3 검증 체크리스트

- [ ] 13개 개발 단계 감지 테스트
- [ ] 파일 경로 기반 감지 테스트
- [ ] 커밋 메시지 기반 감지 테스트
- [ ] 단계 전환 쿨다운 테스트
- [ ] 이벤트 엔진 연동 테스트

---

### 4.2 Methodology Analyzer 마이그레이션

**원본**: `src/analyzers/methodology-analyzer.ts` (1,185줄)
**대상**: `src/devflow_monitor/analyzers/methodology_analyzer.py`

#### 4.2.1 방법론 타입 정의

- [ ] **types/methodology.ts → types/methodology.py 변환**

  **Python (변환)**:
  ```python
  # src/devflow_monitor/analyzers/types/methodology.py
  from enum import Enum
  from dataclasses import dataclass, field
  from datetime import datetime

  class DevelopmentMethodology(str, Enum):
      DDD = "ddd"  # Domain-Driven Design
      TDD = "tdd"  # Test-Driven Development
      BDD = "bdd"  # Behavior-Driven Development
      EDA = "eda"  # Event-Driven Architecture

  @dataclass
  class MethodologyScore:
      methodology: DevelopmentMethodology
      score: float  # 0-100
      timestamp: datetime = field(default_factory=datetime.utcnow)
      indicators: list[str] = field(default_factory=list)
      strengths: list[str] = field(default_factory=list)
      weaknesses: list[str] = field(default_factory=list)
      recommendations: list[str] = field(default_factory=list)

  @dataclass
  class MethodologyDetection:
      methodology: DevelopmentMethodology
      pattern: str
      confidence: float
      file_path: str | None = None
      line_number: int | None = None
  ```

#### 4.2.2 MethodologyAnalyzer 클래스 변환

- [ ] **methodology-analyzer.ts → methodology_analyzer.py 변환**

  **Python (변환 - 핵심 부분)**:
  ```python
  # src/devflow_monitor/analyzers/methodology_analyzer.py
  import re
  from dataclasses import dataclass, field
  from datetime import datetime
  from collections import defaultdict

  from .types.methodology import (
      DevelopmentMethodology,
      MethodologyScore,
      MethodologyDetection,
  )
  from ..events.engine import EventEngine

  @dataclass
  class MethodologyRule:
      methodology: DevelopmentMethodology
      patterns: list[re.Pattern]
      weight: float = 1.0
      description: str = ""

  class MethodologyAnalyzer:
      def __init__(self, event_engine: EventEngine | None = None):
          self._event_engine = event_engine
          self._detections: list[MethodologyDetection] = []
          self._scores: dict[DevelopmentMethodology, MethodologyScore] = {}
          self._rules = self._initialize_rules()

          if self._event_engine:
              self._subscribe_to_events()

      def _initialize_rules(self) -> dict[DevelopmentMethodology, list[MethodologyRule]]:
          """방법론별 감지 규칙 초기화"""
          return {
              DevelopmentMethodology.DDD: [
                  MethodologyRule(
                      methodology=DevelopmentMethodology.DDD,
                      patterns=[
                          re.compile(r"class\s+\w+Entity"),
                          re.compile(r"class\s+\w+Aggregate"),
                          re.compile(r"interface\s+\w+Repository"),
                          re.compile(r"class\s+\w+ValueObject"),
                          re.compile(r"BoundedContext"),
                          re.compile(r"DomainEvent"),
                          re.compile(r"AggregateRoot"),
                      ],
                      weight=1.0,
                      description="DDD 패턴 감지",
                  ),
              ],
              DevelopmentMethodology.TDD: [
                  MethodologyRule(
                      methodology=DevelopmentMethodology.TDD,
                      patterns=[
                          re.compile(r"describe\s*\("),
                          re.compile(r"it\s*\("),
                          re.compile(r"test\s*\("),
                          re.compile(r"expect\s*\("),
                          re.compile(r"assert"),
                          re.compile(r"@Test"),
                          re.compile(r"def\s+test_"),
                      ],
                      weight=1.0,
                      description="TDD 패턴 감지",
                  ),
              ],
              DevelopmentMethodology.BDD: [
                  MethodologyRule(
                      methodology=DevelopmentMethodology.BDD,
                      patterns=[
                          re.compile(r"Feature:"),
                          re.compile(r"Scenario:"),
                          re.compile(r"Given\s+"),
                          re.compile(r"When\s+"),
                          re.compile(r"Then\s+"),
                          re.compile(r"\.feature$"),
                      ],
                      weight=1.0,
                      description="BDD 패턴 감지",
                  ),
              ],
              DevelopmentMethodology.EDA: [
                  MethodologyRule(
                      methodology=DevelopmentMethodology.EDA,
                      patterns=[
                          re.compile(r"EventEmitter"),
                          re.compile(r"@EventHandler"),
                          re.compile(r"publish\s*\("),
                          re.compile(r"subscribe\s*\("),
                          re.compile(r"class\s+\w+Event"),
                          re.compile(r"EventBus"),
                          re.compile(r"Saga"),
                          re.compile(r"CQRS"),
                      ],
                      weight=1.0,
                      description="EDA 패턴 감지",
                  ),
              ],
          }

      def _subscribe_to_events(self) -> None:
          """이벤트 구독"""
          if self._event_engine:
              self._event_engine.on("file:add", self._handle_file_event)
              self._event_engine.on("file:change", self._handle_file_event)

      async def _handle_file_event(self, event) -> None:
          """파일 이벤트 처리"""
          path = event.data.get("path", "")
          if path.endswith((".ts", ".js", ".py", ".java", ".feature")):
              # 파일 내용 분석 필요시 여기서 처리
              await self.analyze_file_path(path)

      async def analyze_file_path(self, path: str) -> list[MethodologyDetection]:
          """파일 경로에서 방법론 분석"""
          detections = []

          for methodology, rules in self._rules.items():
              for rule in rules:
                  for pattern in rule.patterns:
                      if pattern.search(path):
                          detection = MethodologyDetection(
                              methodology=methodology,
                              pattern=pattern.pattern,
                              confidence=0.5,
                              file_path=path,
                          )
                          detections.append(detection)
                          self._detections.append(detection)

          return detections

      async def analyze_content(
          self,
          content: str,
          file_path: str | None = None
      ) -> list[MethodologyDetection]:
          """코드 내용에서 방법론 분석"""
          detections = []
          lines = content.split("\n")

          for methodology, rules in self._rules.items():
              for rule in rules:
                  for pattern in rule.patterns:
                      for line_num, line in enumerate(lines, 1):
                          if pattern.search(line):
                              detection = MethodologyDetection(
                                  methodology=methodology,
                                  pattern=pattern.pattern,
                                  confidence=rule.weight,
                                  file_path=file_path,
                                  line_number=line_num,
                              )
                              detections.append(detection)
                              self._detections.append(detection)

          self._update_scores()
          return detections

      def _update_scores(self) -> None:
          """점수 업데이트"""
          counts = defaultdict(int)
          for detection in self._detections:
              counts[detection.methodology] += 1

          total = sum(counts.values()) or 1

          for methodology in DevelopmentMethodology:
              count = counts[methodology]
              score = min((count / total) * 100 * 2, 100)  # 정규화

              strengths = []
              weaknesses = []
              recommendations = []

              if score >= 70:
                  strengths.append(f"{methodology.value.upper()} 패턴이 잘 적용되어 있습니다")
              elif score >= 40:
                  weaknesses.append(f"{methodology.value.upper()} 패턴 적용이 부분적입니다")
                  recommendations.append(f"{methodology.value.upper()} 패턴을 더 일관되게 적용하세요")
              else:
                  weaknesses.append(f"{methodology.value.upper()} 패턴이 거의 없습니다")
                  recommendations.append(f"{methodology.value.upper()} 도입을 고려하세요")

              self._scores[methodology] = MethodologyScore(
                  methodology=methodology,
                  score=score,
                  indicators=[d.pattern for d in self._detections if d.methodology == methodology][:5],
                  strengths=strengths,
                  weaknesses=weaknesses,
                  recommendations=recommendations,
              )

      def get_scores(self) -> dict[DevelopmentMethodology, MethodologyScore]:
          return self._scores.copy()

      def get_summary(self) -> dict:
          """방법론 요약"""
          return {
              "scores": {
                  m.value: s.score for m, s in self._scores.items()
              },
              "total_detections": len(self._detections),
              "dominant_methodology": max(
                  self._scores.items(),
                  key=lambda x: x[1].score,
                  default=(None, None)
              )[0].value if self._scores else None,
          }
  ```

#### 4.2.3 검증 체크리스트

- [ ] DDD 패턴 감지 테스트
- [ ] TDD 패턴 감지 테스트
- [ ] BDD 패턴 감지 테스트
- [ ] EDA 패턴 감지 테스트
- [ ] 점수 계산 테스트
- [ ] 권장사항 생성 테스트

---

### 4.3 AI Monitor 마이그레이션

**원본**: `src/analyzers/ai-monitor.ts` (1,215줄)
**대상**: `src/devflow_monitor/analyzers/ai_monitor.py`

- [ ] **types/ai.ts → types/ai.py 변환**
- [ ] **ai-monitor.ts → ai_monitor.py 변환**
- [ ] AI 도구 타입 정의 (Claude, Copilot, ChatGPT, Cursor, TabNine, CodeWhisperer)
- [ ] 패턴 기반 AI 도구 감지
- [ ] 세션 추적 로직
- [ ] 효과성 메트릭 계산

### 4.4 Metrics Analyzer 마이그레이션

- [ ] **metrics-collector.ts → metrics_collector.py 변환**
- [ ] **bottleneck-detector.ts → bottleneck_detector.py 변환**
- [ ] **metrics-analyzer.ts → metrics_analyzer.py 변환**
- [ ] **types/metrics.ts → types/metrics.py 변환**

---

## 5. Phase 4: 외부 통합 (1-2주)

### 5.1 API 클라이언트 베이스 마이그레이션

**원본**: `src/integrations/base.ts` (346줄)
**대상**: `src/devflow_monitor/integrations/base.py`

#### 5.1.1 BaseAPIClient 추상 클래스 변환

- [ ] **base.ts → base.py 변환**

  **TypeScript (원본)**:
  ```typescript
  // src/integrations/base.ts
  import axios, { AxiosInstance } from 'axios';

  export abstract class BaseAPIClient {
    protected client: AxiosInstance;
    protected maxRetries = 3;

    constructor(config: APIClientConfig) {
      this.client = axios.create({
        baseURL: config.baseURL,
        timeout: config.timeout || 10000,
        headers: this.getAuthHeaders(config),
      });
    }

    protected async executeWithRetry<T>(
      fn: () => Promise<T>,
      maxRetries: number = this.maxRetries
    ): Promise<T> {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error as Error;
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      throw lastError;
    }
  }
  ```

  **Python (변환)**:
  ```python
  # src/devflow_monitor/integrations/base.py
  from abc import ABC, abstractmethod
  from dataclasses import dataclass, field
  from typing import Any, TypeVar, Callable, Awaitable
  from enum import Enum
  import httpx
  from tenacity import (
      retry,
      stop_after_attempt,
      wait_exponential_jitter,
      retry_if_exception_type,
  )

  class AuthType(str, Enum):
      BEARER = "bearer"
      BASIC = "basic"
      API_KEY = "api_key"

  @dataclass
  class APIClientConfig:
      base_url: str
      auth_type: AuthType = AuthType.BEARER
      token: str | None = None
      username: str | None = None
      password: str | None = None
      api_key: str | None = None
      api_key_header: str = "X-API-Key"
      timeout: float = 10.0
      max_retries: int = 3

  T = TypeVar("T")

  class BaseAPIClient(ABC):
      def __init__(self, config: APIClientConfig):
          self._config = config
          self._client = self._create_client()

      def _create_client(self) -> httpx.AsyncClient:
          """HTTP 클라이언트 생성"""
          headers = self._get_auth_headers()
          return httpx.AsyncClient(
              base_url=self._config.base_url,
              timeout=self._config.timeout,
              headers=headers,
          )

      def _get_auth_headers(self) -> dict[str, str]:
          """인증 헤더 생성"""
          headers = {"Content-Type": "application/json"}

          match self._config.auth_type:
              case AuthType.BEARER:
                  if self._config.token:
                      headers["Authorization"] = f"Bearer {self._config.token}"
              case AuthType.BASIC:
                  if self._config.username and self._config.password:
                      import base64
                      credentials = f"{self._config.username}:{self._config.password}"
                      encoded = base64.b64encode(credentials.encode()).decode()
                      headers["Authorization"] = f"Basic {encoded}"
              case AuthType.API_KEY:
                  if self._config.api_key:
                      headers[self._config.api_key_header] = self._config.api_key

          return headers

      async def _execute_with_retry(
          self,
          fn: Callable[[], Awaitable[T]],
      ) -> T:
          """재시도 로직이 포함된 실행"""
          @retry(
              stop=stop_after_attempt(self._config.max_retries),
              wait=wait_exponential_jitter(initial=1, max=10),
              retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
          )
          async def _retry_fn() -> T:
              return await fn()

          return await _retry_fn()

      async def get(self, endpoint: str, params: dict | None = None) -> dict[str, Any]:
          """GET 요청"""
          async def _request():
              response = await self._client.get(endpoint, params=params)
              response.raise_for_status()
              return response.json()

          return await self._execute_with_retry(_request)

      async def post(self, endpoint: str, data: dict | None = None) -> dict[str, Any]:
          """POST 요청"""
          async def _request():
              response = await self._client.post(endpoint, json=data)
              response.raise_for_status()
              return response.json()

          return await self._execute_with_retry(_request)

      async def put(self, endpoint: str, data: dict | None = None) -> dict[str, Any]:
          """PUT 요청"""
          async def _request():
              response = await self._client.put(endpoint, json=data)
              response.raise_for_status()
              return response.json()

          return await self._execute_with_retry(_request)

      async def delete(self, endpoint: str) -> dict[str, Any]:
          """DELETE 요청"""
          async def _request():
              response = await self._client.delete(endpoint)
              response.raise_for_status()
              return response.json()

          return await self._execute_with_retry(_request)

      @abstractmethod
      async def health_check(self) -> bool:
          """헬스 체크"""
          pass

      async def close(self) -> None:
          """클라이언트 종료"""
          await self._client.aclose()

      async def __aenter__(self):
          return self

      async def __aexit__(self, exc_type, exc_val, exc_tb):
          await self.close()
  ```

### 5.2 Jira 클라이언트 마이그레이션

- [ ] **jira.ts → jira.py 변환**

  **Python (변환)**:
  ```python
  # src/devflow_monitor/integrations/jira.py
  from dataclasses import dataclass
  from typing import Any
  from .base import BaseAPIClient, APIClientConfig, AuthType

  @dataclass
  class JiraIssue:
      key: str
      summary: str
      status: str
      assignee: str | None
      priority: str | None
      issue_type: str
      created: str
      updated: str

  class JiraClient(BaseAPIClient):
      def __init__(self, config: APIClientConfig):
          super().__init__(config)

      async def health_check(self) -> bool:
          """Jira 연결 확인"""
          try:
              await self.get("/rest/api/3/myself")
              return True
          except Exception:
              return False

      async def get_issue(self, issue_key: str) -> JiraIssue:
          """이슈 조회"""
          data = await self.get(f"/rest/api/3/issue/{issue_key}")
          return self._parse_issue(data)

      async def search_issues(
          self,
          jql: str,
          max_results: int = 50
      ) -> list[JiraIssue]:
          """JQL로 이슈 검색"""
          data = await self.post("/rest/api/3/search", {
              "jql": jql,
              "maxResults": max_results,
          })
          return [self._parse_issue(issue) for issue in data.get("issues", [])]

      async def create_issue(
          self,
          project_key: str,
          summary: str,
          issue_type: str = "Task",
          description: str | None = None,
      ) -> JiraIssue:
          """이슈 생성"""
          data = await self.post("/rest/api/3/issue", {
              "fields": {
                  "project": {"key": project_key},
                  "summary": summary,
                  "issuetype": {"name": issue_type},
                  "description": {
                      "type": "doc",
                      "version": 1,
                      "content": [{
                          "type": "paragraph",
                          "content": [{"type": "text", "text": description or ""}]
                      }]
                  } if description else None,
              }
          })
          return await self.get_issue(data["key"])

      async def update_issue_status(
          self,
          issue_key: str,
          transition_id: str
      ) -> None:
          """이슈 상태 변경"""
          await self.post(f"/rest/api/3/issue/{issue_key}/transitions", {
              "transition": {"id": transition_id}
          })

      def _parse_issue(self, data: dict[str, Any]) -> JiraIssue:
          """이슈 데이터 파싱"""
          fields = data.get("fields", {})
          return JiraIssue(
              key=data.get("key", ""),
              summary=fields.get("summary", ""),
              status=fields.get("status", {}).get("name", ""),
              assignee=fields.get("assignee", {}).get("displayName") if fields.get("assignee") else None,
              priority=fields.get("priority", {}).get("name") if fields.get("priority") else None,
              issue_type=fields.get("issuetype", {}).get("name", ""),
              created=fields.get("created", ""),
              updated=fields.get("updated", ""),
          )
  ```

### 5.3 나머지 통합 마이그레이션

- [ ] **notion.ts → notion.py 변환** (NotionClient)
- [ ] **figma.ts → figma.py 변환** (FigmaClient)
- [ ] **manager.ts → manager.py 변환** (IntegrationManager)

### 5.4 검증 체크리스트

- [ ] Jira API 연동 테스트
- [ ] Notion API 연동 테스트
- [ ] Figma API 연동 테스트
- [ ] 재시도 로직 테스트
- [ ] 인증 방식별 테스트 (Bearer, Basic, API Key)

---

## 6. Phase 5: 보안 & 성능 (2-3주)

### 6.1 보안 모듈 마이그레이션

**원본**: `src/security/` (3,373줄)
**대상**: `src/devflow_monitor/security/`

#### 6.1.1 인증 매니저 변환

- [ ] **auth-manager.ts → auth_manager.py 변환**

  **Python (변환)**:
  ```python
  # src/devflow_monitor/security/auth_manager.py
  import jwt
  import bcrypt
  import secrets
  from datetime import datetime, timedelta
  from dataclasses import dataclass, field
  from typing import Any

  @dataclass
  class TokenPayload:
      user_id: str
      roles: list[str]
      permissions: list[str]
      exp: datetime
      iat: datetime = field(default_factory=datetime.utcnow)

  @dataclass
  class AuthConfig:
      secret_key: str = field(default_factory=lambda: secrets.token_hex(32))
      access_token_ttl: int = 3600  # 1시간
      refresh_token_ttl: int = 604800  # 7일
      algorithm: str = "HS256"

  class AuthManager:
      def __init__(self, config: AuthConfig | None = None):
          self._config = config or AuthConfig()
          self._refresh_tokens: dict[str, str] = {}  # token -> user_id
          self._rate_limits: dict[str, list[datetime]] = {}

      def hash_password(self, password: str) -> str:
          """비밀번호 해싱"""
          salt = bcrypt.gensalt(rounds=10)
          return bcrypt.hashpw(password.encode(), salt).decode()

      def verify_password(self, password: str, hashed: str) -> bool:
          """비밀번호 검증"""
          return bcrypt.checkpw(password.encode(), hashed.encode())

      def generate_access_token(
          self,
          user_id: str,
          roles: list[str],
          permissions: list[str]
      ) -> str:
          """액세스 토큰 생성"""
          now = datetime.utcnow()
          payload = {
              "user_id": user_id,
              "roles": roles,
              "permissions": permissions,
              "iat": now,
              "exp": now + timedelta(seconds=self._config.access_token_ttl),
          }
          return jwt.encode(payload, self._config.secret_key, algorithm=self._config.algorithm)

      def generate_refresh_token(self, user_id: str) -> str:
          """리프레시 토큰 생성"""
          token = secrets.token_urlsafe(32)
          self._refresh_tokens[token] = user_id
          return token

      def verify_token(self, token: str) -> TokenPayload | None:
          """토큰 검증"""
          try:
              payload = jwt.decode(
                  token,
                  self._config.secret_key,
                  algorithms=[self._config.algorithm]
              )
              return TokenPayload(
                  user_id=payload["user_id"],
                  roles=payload["roles"],
                  permissions=payload["permissions"],
                  exp=datetime.fromtimestamp(payload["exp"]),
                  iat=datetime.fromtimestamp(payload["iat"]),
              )
          except jwt.ExpiredSignatureError:
              return None
          except jwt.InvalidTokenError:
              return None

      def refresh_access_token(
          self,
          refresh_token: str,
          roles: list[str],
          permissions: list[str]
      ) -> str | None:
          """토큰 갱신"""
          user_id = self._refresh_tokens.get(refresh_token)
          if not user_id:
              return None
          return self.generate_access_token(user_id, roles, permissions)

      def revoke_refresh_token(self, refresh_token: str) -> bool:
          """리프레시 토큰 폐기"""
          if refresh_token in self._refresh_tokens:
              del self._refresh_tokens[refresh_token]
              return True
          return False

      def check_rate_limit(
          self,
          identifier: str,
          max_requests: int = 100,
          window_seconds: int = 60
      ) -> bool:
          """레이트 리밋 체크"""
          now = datetime.utcnow()
          window_start = now - timedelta(seconds=window_seconds)

          if identifier not in self._rate_limits:
              self._rate_limits[identifier] = []

          # 윈도우 외 요청 제거
          self._rate_limits[identifier] = [
              t for t in self._rate_limits[identifier]
              if t > window_start
          ]

          if len(self._rate_limits[identifier]) >= max_requests:
              return False

          self._rate_limits[identifier].append(now)
          return True
  ```

#### 6.1.2 RBAC 매니저 변환

- [ ] **rbac-manager.ts → rbac_manager.py 변환**

  **Python (변환)**:
  ```python
  # src/devflow_monitor/security/rbac_manager.py
  from dataclasses import dataclass, field
  from enum import Enum
  from typing import Any

  class Permission(str, Enum):
      READ = "read"
      WRITE = "write"
      DELETE = "delete"
      ADMIN = "admin"
      EXECUTE = "execute"

  @dataclass
  class Role:
      name: str
      permissions: set[Permission] = field(default_factory=set)
      description: str = ""

  class RBACManager:
      DEFAULT_ROLES = {
          "admin": Role(
              name="admin",
              permissions={Permission.READ, Permission.WRITE, Permission.DELETE, Permission.ADMIN, Permission.EXECUTE},
              description="전체 관리자",
          ),
          "developer": Role(
              name="developer",
              permissions={Permission.READ, Permission.WRITE, Permission.EXECUTE},
              description="개발자",
          ),
          "viewer": Role(
              name="viewer",
              permissions={Permission.READ},
              description="읽기 전용",
          ),
      }

      def __init__(self):
          self._roles: dict[str, Role] = dict(self.DEFAULT_ROLES)
          self._user_roles: dict[str, set[str]] = {}

      def create_role(
          self,
          name: str,
          permissions: set[Permission],
          description: str = ""
      ) -> Role:
          """역할 생성"""
          role = Role(name=name, permissions=permissions, description=description)
          self._roles[name] = role
          return role

      def assign_role(self, user_id: str, role_name: str) -> bool:
          """사용자에게 역할 할당"""
          if role_name not in self._roles:
              return False

          if user_id not in self._user_roles:
              self._user_roles[user_id] = set()

          self._user_roles[user_id].add(role_name)
          return True

      def revoke_role(self, user_id: str, role_name: str) -> bool:
          """역할 해제"""
          if user_id in self._user_roles:
              self._user_roles[user_id].discard(role_name)
              return True
          return False

      def get_user_permissions(self, user_id: str) -> set[Permission]:
          """사용자 권한 조회"""
          permissions = set()
          for role_name in self._user_roles.get(user_id, set()):
              role = self._roles.get(role_name)
              if role:
                  permissions.update(role.permissions)
          return permissions

      def check_permission(
          self,
          user_id: str,
          required_permission: Permission
      ) -> bool:
          """권한 확인"""
          user_permissions = self.get_user_permissions(user_id)
          return required_permission in user_permissions or Permission.ADMIN in user_permissions

      def get_user_roles(self, user_id: str) -> list[str]:
          """사용자 역할 목록"""
          return list(self._user_roles.get(user_id, set()))
  ```

#### 6.1.3 암호화 매니저 변환

- [ ] **encryption-manager.ts → encryption_manager.py 변환**

  **Python (변환)**:
  ```python
  # src/devflow_monitor/security/encryption_manager.py
  import os
  import hashlib
  import hmac
  import secrets
  from base64 import b64encode, b64decode
  from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
  from cryptography.hazmat.backends import default_backend

  class EncryptionManager:
      def __init__(self, key: bytes | None = None):
          self._key = key or os.urandom(32)  # AES-256
          self._backend = default_backend()

      def encrypt(self, plaintext: str) -> str:
          """AES-256-GCM 암호화"""
          iv = os.urandom(12)  # 96-bit IV for GCM
          cipher = Cipher(
              algorithms.AES(self._key),
              modes.GCM(iv),
              backend=self._backend
          )
          encryptor = cipher.encryptor()

          ciphertext = encryptor.update(plaintext.encode()) + encryptor.finalize()
          tag = encryptor.tag

          # IV + Tag + Ciphertext
          result = iv + tag + ciphertext
          return b64encode(result).decode()

      def decrypt(self, encrypted: str) -> str:
          """AES-256-GCM 복호화"""
          data = b64decode(encrypted.encode())

          iv = data[:12]
          tag = data[12:28]
          ciphertext = data[28:]

          cipher = Cipher(
              algorithms.AES(self._key),
              modes.GCM(iv, tag),
              backend=self._backend
          )
          decryptor = cipher.decryptor()

          plaintext = decryptor.update(ciphertext) + decryptor.finalize()
          return plaintext.decode()

      def hash(self, data: str, algorithm: str = "sha256") -> str:
          """해시 생성"""
          hasher = hashlib.new(algorithm)
          hasher.update(data.encode())
          return hasher.hexdigest()

      def hmac_sign(self, data: str, key: bytes | None = None) -> str:
          """HMAC 서명"""
          signing_key = key or self._key
          signature = hmac.new(signing_key, data.encode(), hashlib.sha256)
          return signature.hexdigest()

      def hmac_verify(self, data: str, signature: str, key: bytes | None = None) -> bool:
          """HMAC 검증"""
          expected = self.hmac_sign(data, key)
          return hmac.compare_digest(expected, signature)

      def generate_secure_token(self, length: int = 32) -> str:
          """보안 토큰 생성"""
          return secrets.token_urlsafe(length)

      def rotate_key(self) -> bytes:
          """키 순환"""
          old_key = self._key
          self._key = os.urandom(32)
          return old_key
  ```

- [ ] **audit-logger.ts → audit_logger.py 변환**
- [ ] **types.ts → types.py 변환**
- [ ] **index.ts → __init__.py 변환** (SecurityManager)

### 6.2 성능 모듈 마이그레이션

**원본**: `src/performance/` (3,366줄)
**대상**: `src/devflow_monitor/performance/`

#### 6.2.1 캐시 매니저 변환

- [ ] **cache-manager.ts → cache_manager.py 변환**

  **Python (변환)**:
  ```python
  # src/devflow_monitor/performance/cache_manager.py
  import asyncio
  import time
  from dataclasses import dataclass, field
  from typing import Any, TypeVar, Generic
  from collections import OrderedDict
  import aiosqlite

  T = TypeVar("T")

  @dataclass
  class CacheEntry(Generic[T]):
      value: T
      timestamp: float
      ttl: float
      tags: list[str] = field(default_factory=list)

  @dataclass
  class CacheConfig:
      memory_max_size: int = 1000
      memory_ttl_ms: int = 300000  # 5분
      disk_ttl_ms: int = 3600000  # 1시간
      disk_path: str = "./data/cache.db"
      compression_enabled: bool = False
      encryption_enabled: bool = False

  class CacheManager:
      def __init__(self, config: CacheConfig | None = None):
          self._config = config or CacheConfig()
          self._memory_cache: OrderedDict[str, CacheEntry] = OrderedDict()
          self._disk_db: aiosqlite.Connection | None = None
          self._cleanup_task: asyncio.Task | None = None

      async def initialize(self) -> None:
          """캐시 초기화"""
          self._disk_db = await aiosqlite.connect(self._config.disk_path)
          await self._disk_db.execute("""
              CREATE TABLE IF NOT EXISTS cache (
                  key TEXT PRIMARY KEY,
                  value TEXT,
                  timestamp REAL,
                  ttl REAL,
                  tags TEXT
              )
          """)
          await self._disk_db.commit()

          # 정리 태스크 시작
          self._cleanup_task = asyncio.create_task(self._cleanup_loop())

      async def shutdown(self) -> None:
          """캐시 종료"""
          if self._cleanup_task:
              self._cleanup_task.cancel()
              try:
                  await self._cleanup_task
              except asyncio.CancelledError:
                  pass

          if self._disk_db:
              await self._disk_db.close()

      async def get(self, key: str) -> Any | None:
          """캐시 조회 (메모리 → 디스크)"""
          # 메모리 캐시 확인
          if key in self._memory_cache:
              entry = self._memory_cache[key]
              if not self._is_expired(entry):
                  # LRU: 최근 사용으로 이동
                  self._memory_cache.move_to_end(key)
                  return entry.value

              # 만료됨
              del self._memory_cache[key]

          # 디스크 캐시 확인
          if self._disk_db:
              async with self._disk_db.execute(
                  "SELECT value, timestamp, ttl FROM cache WHERE key = ?",
                  (key,)
              ) as cursor:
                  row = await cursor.fetchone()
                  if row:
                      value, timestamp, ttl = row
                      if time.time() - timestamp < ttl / 1000:
                          # 메모리에 승격
                          import json
                          parsed_value = json.loads(value)
                          await self.set(key, parsed_value, int(ttl))
                          return parsed_value

          return None

      async def set(
          self,
          key: str,
          value: Any,
          ttl_ms: int | None = None,
          tags: list[str] | None = None
      ) -> None:
          """캐시 설정"""
          ttl = ttl_ms or self._config.memory_ttl_ms

          entry = CacheEntry(
              value=value,
              timestamp=time.time(),
              ttl=ttl,
              tags=tags or [],
          )

          # 메모리 캐시에 저장
          if len(self._memory_cache) >= self._config.memory_max_size:
              # LRU: 가장 오래된 항목 제거
              self._memory_cache.popitem(last=False)

          self._memory_cache[key] = entry

          # 디스크 캐시에도 저장
          if self._disk_db:
              import json
              await self._disk_db.execute(
                  """
                  INSERT OR REPLACE INTO cache (key, value, timestamp, ttl, tags)
                  VALUES (?, ?, ?, ?, ?)
                  """,
                  (key, json.dumps(value), time.time(), self._config.disk_ttl_ms, json.dumps(tags or []))
              )
              await self._disk_db.commit()

      async def delete(self, key: str) -> bool:
          """캐시 삭제"""
          deleted = False

          if key in self._memory_cache:
              del self._memory_cache[key]
              deleted = True

          if self._disk_db:
              await self._disk_db.execute("DELETE FROM cache WHERE key = ?", (key,))
              await self._disk_db.commit()
              deleted = True

          return deleted

      async def invalidate_by_tag(self, tag: str) -> int:
          """태그로 무효화"""
          count = 0

          # 메모리 캐시
          keys_to_delete = [
              k for k, v in self._memory_cache.items()
              if tag in v.tags
          ]
          for key in keys_to_delete:
              del self._memory_cache[key]
              count += 1

          # 디스크 캐시
          if self._disk_db:
              async with self._disk_db.execute(
                  "SELECT key, tags FROM cache"
              ) as cursor:
                  async for row in cursor:
                      key, tags_json = row
                      import json
                      tags = json.loads(tags_json)
                      if tag in tags:
                          await self._disk_db.execute("DELETE FROM cache WHERE key = ?", (key,))
                          count += 1
              await self._disk_db.commit()

          return count

      async def clear(self) -> None:
          """전체 캐시 클리어"""
          self._memory_cache.clear()
          if self._disk_db:
              await self._disk_db.execute("DELETE FROM cache")
              await self._disk_db.commit()

      def _is_expired(self, entry: CacheEntry) -> bool:
          """만료 여부 확인"""
          return (time.time() - entry.timestamp) * 1000 > entry.ttl

      async def _cleanup_loop(self) -> None:
          """정리 루프"""
          while True:
              try:
                  await asyncio.sleep(60)  # 1분마다
                  await self._cleanup_expired()
              except asyncio.CancelledError:
                  break

      async def _cleanup_expired(self) -> None:
          """만료된 항목 정리"""
          # 메모리
          expired_keys = [
              k for k, v in self._memory_cache.items()
              if self._is_expired(v)
          ]
          for key in expired_keys:
              del self._memory_cache[key]

          # 디스크
          if self._disk_db:
              current_time = time.time()
              await self._disk_db.execute(
                  "DELETE FROM cache WHERE (? - timestamp) * 1000 > ttl",
                  (current_time,)
              )
              await self._disk_db.commit()

      def get_stats(self) -> dict:
          """캐시 통계"""
          return {
              "memory_size": len(self._memory_cache),
              "memory_max_size": self._config.memory_max_size,
              "memory_usage_percent": len(self._memory_cache) / self._config.memory_max_size * 100,
          }
  ```

- [ ] **performance-profiler.ts → performance_profiler.py 변환**
- [ ] **memory-optimizer.ts → memory_optimizer.py 변환**
- [ ] **async-optimizer.ts → async_optimizer.py 변환**
- [ ] **scaling-manager.ts → scaling_manager.py 변환**
- [ ] **index.ts → __init__.py 변환** (PerformanceManager)

### 6.3 검증 체크리스트

- [ ] JWT 토큰 생성/검증 테스트
- [ ] 비밀번호 해싱 테스트
- [ ] RBAC 권한 테스트
- [ ] AES-256-GCM 암호화/복호화 테스트
- [ ] 캐시 LRU 테스트
- [ ] 캐시 TTL 테스트
- [ ] 멀티레이어 캐시 테스트

---

## 7. Phase 6: 플러그인 시스템 (3-4주)

### 7.1 플러그인 아키텍처 설계 (Python 버전)

**중요**: Worker Threads가 Python에 없으므로 아키텍처 재설계 필요

#### 7.1.1 격리 전략 선택

- [ ] **격리 수준 결정**

  | 옵션 | 장점 | 단점 | 권장 |
  |------|------|------|------|
  | `multiprocessing.Process` | 진정한 프로세스 격리 | 메모리 오버헤드, IPC 비용 | 엄격한 격리 필요시 |
  | `subprocess` | 완전한 격리, 언어 무관 | 통신 복잡, 성능 저하 | 외부 플러그인 |
  | `asyncio` + 제한된 namespace | 가벼움, 빠름 | 진정한 격리 아님 | 신뢰할 수 있는 플러그인 |

#### 7.1.2 플러그인 타입 정의

- [ ] **types.ts → types.py 변환**

  **Python (변환)**:
  ```python
  # src/devflow_monitor/plugins/types.py
  from enum import Enum, auto
  from dataclasses import dataclass, field
  from typing import Any, Callable, Awaitable
  from datetime import datetime

  class PluginState(str, Enum):
      UNLOADED = "unloaded"
      LOADING = "loading"
      LOADED = "loaded"
      ACTIVE = "active"
      INACTIVE = "inactive"
      ERROR = "error"
      UNLOADING = "unloading"

  class PluginPermission(str, Enum):
      READ_FILES = "read_files"
      WRITE_FILES = "write_files"
      NETWORK = "network"
      DATABASE = "database"
      NOTIFICATIONS = "notifications"
      EVENTS = "events"
      SYSTEM = "system"

  class IsolationLevel(str, Enum):
      NONE = "none"  # 같은 프로세스
      BASIC = "basic"  # 제한된 namespace
      STRICT = "strict"  # 별도 프로세스

  @dataclass
  class PluginMetadata:
      id: str
      name: str
      version: str
      description: str = ""
      author: str = ""
      homepage: str = ""
      required_permissions: list[PluginPermission] = field(default_factory=list)
      dependencies: list[str] = field(default_factory=list)

  @dataclass
  class PluginDescriptor:
      metadata: PluginMetadata
      entry_point: str
      isolation_level: IsolationLevel = IsolationLevel.BASIC
      config: dict[str, Any] = field(default_factory=dict)

  @dataclass
  class PluginStatus:
      plugin_id: str
      state: PluginState
      loaded_at: datetime | None = None
      error: str | None = None
      memory_usage: int = 0
      cpu_usage: float = 0.0
  ```

#### 7.1.3 플러그인 로더 변환

- [ ] **loader.ts → loader.py 변환**

  **Python (변환)**:
  ```python
  # src/devflow_monitor/plugins/loader.py
  import asyncio
  import importlib.util
  import sys
  from pathlib import Path
  from typing import Any

  from .types import (
      PluginDescriptor,
      PluginMetadata,
      PluginState,
      PluginStatus,
      IsolationLevel,
  )

  class PluginLoader:
      def __init__(self, plugins_dir: str = "./plugins"):
          self._plugins_dir = Path(plugins_dir)
          self._loaded_plugins: dict[str, Any] = {}
          self._plugin_status: dict[str, PluginStatus] = {}

      async def discover_plugins(self) -> list[PluginDescriptor]:
          """플러그인 검색"""
          plugins = []

          if not self._plugins_dir.exists():
              return plugins

          for plugin_dir in self._plugins_dir.iterdir():
              if plugin_dir.is_dir():
                  manifest_path = plugin_dir / "plugin.json"
                  if manifest_path.exists():
                      descriptor = await self._load_manifest(manifest_path)
                      if descriptor:
                          plugins.append(descriptor)

          return plugins

      async def _load_manifest(self, path: Path) -> PluginDescriptor | None:
          """매니페스트 로드"""
          import json

          try:
              with open(path) as f:
                  data = json.load(f)

              metadata = PluginMetadata(
                  id=data["id"],
                  name=data["name"],
                  version=data["version"],
                  description=data.get("description", ""),
                  author=data.get("author", ""),
              )

              return PluginDescriptor(
                  metadata=metadata,
                  entry_point=data.get("entry_point", "main.py"),
                  isolation_level=IsolationLevel(data.get("isolation", "basic")),
              )
          except Exception as e:
              print(f"Failed to load manifest {path}: {e}")
              return None

      async def load_plugin(self, descriptor: PluginDescriptor) -> bool:
          """플러그인 로드"""
          plugin_id = descriptor.metadata.id

          self._plugin_status[plugin_id] = PluginStatus(
              plugin_id=plugin_id,
              state=PluginState.LOADING,
          )

          try:
              plugin_path = self._plugins_dir / plugin_id / descriptor.entry_point

              if not plugin_path.exists():
                  raise FileNotFoundError(f"Entry point not found: {plugin_path}")

              # 모듈 로드
              spec = importlib.util.spec_from_file_location(plugin_id, plugin_path)
              if spec and spec.loader:
                  module = importlib.util.module_from_spec(spec)
                  sys.modules[plugin_id] = module
                  spec.loader.exec_module(module)

                  # 플러그인 인스턴스 생성
                  if hasattr(module, "Plugin"):
                      plugin_instance = module.Plugin()
                      self._loaded_plugins[plugin_id] = plugin_instance

                      self._plugin_status[plugin_id].state = PluginState.LOADED
                      return True

              raise ValueError("Plugin class not found")

          except Exception as e:
              self._plugin_status[plugin_id].state = PluginState.ERROR
              self._plugin_status[plugin_id].error = str(e)
              return False

      async def unload_plugin(self, plugin_id: str) -> bool:
          """플러그인 언로드"""
          if plugin_id not in self._loaded_plugins:
              return False

          self._plugin_status[plugin_id].state = PluginState.UNLOADING

          try:
              plugin = self._loaded_plugins[plugin_id]

              # cleanup 호출
              if hasattr(plugin, "cleanup"):
                  await plugin.cleanup()

              del self._loaded_plugins[plugin_id]
              if plugin_id in sys.modules:
                  del sys.modules[plugin_id]

              self._plugin_status[plugin_id].state = PluginState.UNLOADED
              return True

          except Exception as e:
              self._plugin_status[plugin_id].state = PluginState.ERROR
              self._plugin_status[plugin_id].error = str(e)
              return False

      def get_plugin(self, plugin_id: str) -> Any | None:
          """플러그인 인스턴스 조회"""
          return self._loaded_plugins.get(plugin_id)

      def get_status(self, plugin_id: str) -> PluginStatus | None:
          """플러그인 상태 조회"""
          return self._plugin_status.get(plugin_id)

      def list_loaded(self) -> list[str]:
          """로드된 플러그인 목록"""
          return list(self._loaded_plugins.keys())
  ```

#### 7.1.4 플러그인 샌드박스 변환

- [ ] **sandbox.ts → sandbox.py 변환** (multiprocessing 기반)

  **Python (변환)**:
  ```python
  # src/devflow_monitor/plugins/sandbox.py
  import asyncio
  import multiprocessing as mp
  from multiprocessing import Process, Queue
  import json
  from typing import Any
  from dataclasses import dataclass

  from .types import PluginDescriptor, IsolationLevel, PluginPermission

  @dataclass
  class SandboxMessage:
      type: str  # "call", "result", "error", "event"
      data: Any

  class PluginSandbox:
      """프로세스 기반 플러그인 샌드박스"""

      def __init__(self):
          self._processes: dict[str, Process] = {}
          self._input_queues: dict[str, Queue] = {}
          self._output_queues: dict[str, Queue] = {}

      async def create_environment(
          self,
          descriptor: PluginDescriptor,
          permissions: list[PluginPermission]
      ) -> bool:
          """샌드박스 환경 생성"""
          plugin_id = descriptor.metadata.id

          if descriptor.isolation_level == IsolationLevel.STRICT:
              # 별도 프로세스로 실행
              input_queue = mp.Queue()
              output_queue = mp.Queue()

              process = Process(
                  target=self._run_plugin_process,
                  args=(plugin_id, descriptor.entry_point, input_queue, output_queue, permissions),
                  daemon=True,
              )
              process.start()

              self._processes[plugin_id] = process
              self._input_queues[plugin_id] = input_queue
              self._output_queues[plugin_id] = output_queue

              return True

          return False

      def _run_plugin_process(
          self,
          plugin_id: str,
          entry_point: str,
          input_queue: Queue,
          output_queue: Queue,
          permissions: list[PluginPermission],
      ) -> None:
          """플러그인 프로세스 메인 루프"""
          import importlib.util
          import sys
          from pathlib import Path

          # 제한된 builtins
          restricted_builtins = {
              "print": print,
              "len": len,
              "range": range,
              "str": str,
              "int": int,
              "float": float,
              "bool": bool,
              "list": list,
              "dict": dict,
              "tuple": tuple,
              "set": set,
          }

          # 권한에 따라 추가 기능 허용
          if PluginPermission.READ_FILES in permissions:
              restricted_builtins["open"] = open  # 읽기 전용으로 제한 필요

          try:
              # 플러그인 로드
              plugin_path = Path(f"./plugins/{plugin_id}/{entry_point}")
              spec = importlib.util.spec_from_file_location(plugin_id, plugin_path)
              if spec and spec.loader:
                  module = importlib.util.module_from_spec(spec)
                  spec.loader.exec_module(module)

                  plugin = module.Plugin() if hasattr(module, "Plugin") else None

                  # 메시지 루프
                  while True:
                      try:
                          msg = input_queue.get(timeout=1)
                          if msg.type == "call":
                              method_name = msg.data.get("method")
                              args = msg.data.get("args", [])
                              kwargs = msg.data.get("kwargs", {})

                              if plugin and hasattr(plugin, method_name):
                                  result = getattr(plugin, method_name)(*args, **kwargs)
                                  output_queue.put(SandboxMessage(type="result", data=result))
                              else:
                                  output_queue.put(SandboxMessage(type="error", data="Method not found"))

                          elif msg.type == "shutdown":
                              break

                      except Exception:
                          continue  # timeout, 계속 실행

          except Exception as e:
              output_queue.put(SandboxMessage(type="error", data=str(e)))

      async def call_plugin(
          self,
          plugin_id: str,
          method: str,
          *args,
          **kwargs
      ) -> Any:
          """플러그인 메서드 호출"""
          if plugin_id not in self._processes:
              raise ValueError(f"Plugin {plugin_id} not found")

          input_queue = self._input_queues[plugin_id]
          output_queue = self._output_queues[plugin_id]

          # 메시지 전송
          input_queue.put(SandboxMessage(
              type="call",
              data={"method": method, "args": args, "kwargs": kwargs}
          ))

          # 응답 대기 (비동기로)
          loop = asyncio.get_event_loop()
          result = await loop.run_in_executor(None, output_queue.get, True, 30)

          if result.type == "error":
              raise RuntimeError(result.data)

          return result.data

      async def destroy_environment(self, plugin_id: str) -> None:
          """샌드박스 환경 제거"""
          if plugin_id in self._processes:
              # 종료 메시지 전송
              self._input_queues[plugin_id].put(SandboxMessage(type="shutdown", data=None))

              # 프로세스 종료 대기
              process = self._processes[plugin_id]
              process.join(timeout=5)

              if process.is_alive():
                  process.terminate()

              del self._processes[plugin_id]
              del self._input_queues[plugin_id]
              del self._output_queues[plugin_id]
  ```

- [ ] **api-provider.ts → api_provider.py 변환**
- [ ] **manager.ts → manager.py 변환** (PluginManager)
- [ ] **registry.ts → registry.py 변환**

### 7.2 검증 체크리스트

- [ ] 플러그인 검색 테스트
- [ ] 플러그인 로드/언로드 테스트
- [ ] 프로세스 격리 테스트
- [ ] 권한 제한 테스트
- [ ] IPC 통신 테스트
- [ ] 메모리 누수 테스트

---

## 8. Phase 7: 보고서 & 알림 (2-3주)

### 8.1 보고서 시스템 마이그레이션

**원본**: `src/reports/` (5,205줄)
**대상**: `src/devflow_monitor/reports/`

#### 8.1.1 PDF 생성기 변환

- [ ] **pdf-generator.ts → pdf_generator.py 변환**

  **Python (변환)**:
  ```python
  # src/devflow_monitor/reports/pdf_generator.py
  from reportlab.lib import colors
  from reportlab.lib.pagesizes import letter, A4
  from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
  from reportlab.lib.units import inch
  from reportlab.platypus import (
      SimpleDocTemplate,
      Paragraph,
      Spacer,
      Table,
      TableStyle,
      PageBreak,
  )
  from reportlab.graphics.shapes import Drawing
  from reportlab.graphics.charts.barcharts import VerticalBarChart
  from reportlab.graphics.charts.piecharts import Pie
  from datetime import datetime
  from pathlib import Path
  from typing import Any

  class PDFGenerator:
      def __init__(self, output_dir: str = "./reports"):
          self._output_dir = Path(output_dir)
          self._output_dir.mkdir(parents=True, exist_ok=True)
          self._styles = getSampleStyleSheet()
          self._setup_custom_styles()

      def _setup_custom_styles(self) -> None:
          """커스텀 스타일 설정"""
          self._styles.add(ParagraphStyle(
              name="Title",
              fontSize=24,
              spaceAfter=30,
              alignment=1,  # CENTER
          ))
          self._styles.add(ParagraphStyle(
              name="Heading1",
              fontSize=18,
              spaceAfter=12,
              spaceBefore=20,
          ))
          self._styles.add(ParagraphStyle(
              name="Heading2",
              fontSize=14,
              spaceAfter=8,
              spaceBefore=15,
          ))

      async def generate(
          self,
          report_data: dict[str, Any],
          filename: str | None = None
      ) -> str:
          """PDF 보고서 생성"""
          if not filename:
              timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
              filename = f"report_{timestamp}.pdf"

          output_path = self._output_dir / filename
          doc = SimpleDocTemplate(
              str(output_path),
              pagesize=A4,
              rightMargin=72,
              leftMargin=72,
              topMargin=72,
              bottomMargin=72,
          )

          elements = []

          # 제목
          elements.append(Paragraph(
              report_data.get("title", "DevFlow Monitor Report"),
              self._styles["Title"]
          ))
          elements.append(Spacer(1, 12))

          # 생성 일시
          elements.append(Paragraph(
              f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
              self._styles["Normal"]
          ))
          elements.append(Spacer(1, 30))

          # 섹션별 내용 추가
          for section in report_data.get("sections", []):
              elements.extend(self._build_section(section))

          doc.build(elements)
          return str(output_path)

      def _build_section(self, section: dict[str, Any]) -> list:
          """섹션 빌드"""
          elements = []

          # 섹션 제목
          elements.append(Paragraph(
              section.get("title", ""),
              self._styles["Heading1"]
          ))

          # 내용 타입에 따라 처리
          content_type = section.get("type", "text")

          if content_type == "text":
              elements.append(Paragraph(
                  section.get("content", ""),
                  self._styles["Normal"]
              ))

          elif content_type == "table":
              table = self._build_table(section.get("data", []))
              elements.append(table)

          elif content_type == "chart":
              chart = self._build_chart(section.get("chart_type"), section.get("data", {}))
              if chart:
                  elements.append(chart)

          elif content_type == "metrics":
              metrics_table = self._build_metrics_table(section.get("metrics", {}))
              elements.append(metrics_table)

          elements.append(Spacer(1, 20))
          return elements

      def _build_table(self, data: list[list[Any]]) -> Table:
          """테이블 빌드"""
          table = Table(data)
          table.setStyle(TableStyle([
              ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
              ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
              ("ALIGN", (0, 0), (-1, -1), "CENTER"),
              ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
              ("FONTSIZE", (0, 0), (-1, 0), 12),
              ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
              ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
              ("GRID", (0, 0), (-1, -1), 1, colors.black),
          ]))
          return table

      def _build_chart(self, chart_type: str, data: dict) -> Drawing | None:
          """차트 빌드"""
          if chart_type == "bar":
              return self._build_bar_chart(data)
          elif chart_type == "pie":
              return self._build_pie_chart(data)
          return None

      def _build_bar_chart(self, data: dict) -> Drawing:
          """바 차트"""
          drawing = Drawing(400, 200)
          chart = VerticalBarChart()
          chart.x = 50
          chart.y = 50
          chart.height = 125
          chart.width = 300
          chart.data = [data.get("values", [0])]
          chart.categoryAxis.categoryNames = data.get("labels", [])
          drawing.add(chart)
          return drawing

      def _build_pie_chart(self, data: dict) -> Drawing:
          """파이 차트"""
          drawing = Drawing(300, 200)
          pie = Pie()
          pie.x = 100
          pie.y = 25
          pie.width = 150
          pie.height = 150
          pie.data = data.get("values", [1])
          pie.labels = data.get("labels", [])
          drawing.add(pie)
          return drawing

      def _build_metrics_table(self, metrics: dict[str, Any]) -> Table:
          """메트릭 테이블"""
          data = [["Metric", "Value"]]
          for key, value in metrics.items():
              data.append([key, str(value)])
          return self._build_table(data)
  ```

#### 8.1.2 보고서 스케줄러 변환

- [ ] **scheduler.ts → scheduler.py 변환**

  **Python (변환)**:
  ```python
  # src/devflow_monitor/reports/scheduler.py
  from apscheduler.schedulers.asyncio import AsyncIOScheduler
  from apscheduler.triggers.cron import CronTrigger
  from apscheduler.triggers.interval import IntervalTrigger
  from dataclasses import dataclass, field
  from datetime import datetime
  from typing import Callable, Awaitable, Any
  from enum import Enum

  class ScheduleType(str, Enum):
      CRON = "cron"
      INTERVAL = "interval"
      DAILY = "daily"
      WEEKLY = "weekly"
      MONTHLY = "monthly"

  @dataclass
  class ReportSchedule:
      id: str
      name: str
      schedule_type: ScheduleType
      cron_expression: str | None = None
      interval_minutes: int | None = None
      report_type: str = "daily"
      enabled: bool = True
      last_run: datetime | None = None
      next_run: datetime | None = None
      config: dict[str, Any] = field(default_factory=dict)

  class ReportScheduler:
      def __init__(self):
          self._scheduler = AsyncIOScheduler()
          self._schedules: dict[str, ReportSchedule] = {}
          self._report_generator: Callable[[str, dict], Awaitable[str]] | None = None

      def set_report_generator(
          self,
          generator: Callable[[str, dict], Awaitable[str]]
      ) -> None:
          """보고서 생성기 설정"""
          self._report_generator = generator

      async def start(self) -> None:
          """스케줄러 시작"""
          self._scheduler.start()

      async def stop(self) -> None:
          """스케줄러 중지"""
          self._scheduler.shutdown()

      def add_schedule(self, schedule: ReportSchedule) -> bool:
          """스케줄 추가"""
          if schedule.id in self._schedules:
              return False

          trigger = self._create_trigger(schedule)
          if not trigger:
              return False

          self._scheduler.add_job(
              self._run_report,
              trigger=trigger,
              id=schedule.id,
              args=[schedule.id],
          )

          self._schedules[schedule.id] = schedule
          return True

      def remove_schedule(self, schedule_id: str) -> bool:
          """스케줄 제거"""
          if schedule_id not in self._schedules:
              return False

          self._scheduler.remove_job(schedule_id)
          del self._schedules[schedule_id]
          return True

      def _create_trigger(self, schedule: ReportSchedule):
          """트리거 생성"""
          match schedule.schedule_type:
              case ScheduleType.CRON:
                  if schedule.cron_expression:
                      return CronTrigger.from_crontab(schedule.cron_expression)
              case ScheduleType.INTERVAL:
                  if schedule.interval_minutes:
                      return IntervalTrigger(minutes=schedule.interval_minutes)
              case ScheduleType.DAILY:
                  return CronTrigger(hour=9, minute=0)
              case ScheduleType.WEEKLY:
                  return CronTrigger(day_of_week="mon", hour=9, minute=0)
              case ScheduleType.MONTHLY:
                  return CronTrigger(day=1, hour=9, minute=0)

          return None

      async def _run_report(self, schedule_id: str) -> None:
          """보고서 실행"""
          schedule = self._schedules.get(schedule_id)
          if not schedule or not schedule.enabled:
              return

          if self._report_generator:
              try:
                  await self._report_generator(schedule.report_type, schedule.config)
                  schedule.last_run = datetime.utcnow()
              except Exception as e:
                  print(f"Report generation failed: {e}")

      def list_schedules(self) -> list[ReportSchedule]:
          """스케줄 목록"""
          return list(self._schedules.values())
  ```

- [ ] **report-engine.ts → report_engine.py 변환**
- [ ] **template-manager.ts → template_manager.py 변환**
- [ ] **delivery.ts → delivery.py 변환** (이메일, Slack, Webhook, S3, FTP)
- [ ] **types.ts → types.py 변환**

### 8.2 알림 시스템 마이그레이션

**원본**: `src/notifications/` (1,300줄)
**대상**: `src/devflow_monitor/notifications/`

- [ ] **notification-engine.ts → notification_engine.py 변환**
- [ ] **channels/slack-notifier.ts → channels/slack_notifier.py 변환**
- [ ] **channels/dashboard-notifier.ts → channels/dashboard_notifier.py 변환**
- [ ] **types.ts → types.py 변환**

### 8.3 검증 체크리스트

- [ ] PDF 생성 테스트
- [ ] 차트 생성 테스트 (바, 파이)
- [ ] 스케줄러 테스트 (cron, interval)
- [ ] 이메일 발송 테스트
- [ ] Slack 알림 테스트
- [ ] Webhook 호출 테스트

---

## 9. Phase 8: 테스트 & 안정화 (2-4주)

### 9.1 테스트 인프라 구축

#### 9.1.1 pytest 설정

- [ ] **pytest.ini / pyproject.toml 테스트 설정**

  ```toml
  # pyproject.toml
  [tool.pytest.ini_options]
  testpaths = ["tests"]
  python_files = ["test_*.py", "*_test.py"]
  python_classes = ["Test*"]
  python_functions = ["test_*"]
  asyncio_mode = "auto"
  addopts = [
      "-v",
      "--tb=short",
      "--cov=src/devflow_monitor",
      "--cov-report=term-missing",
      "--cov-report=html:coverage",
      "--cov-fail-under=80",
  ]

  [tool.coverage.run]
  branch = true
  source = ["src/devflow_monitor"]
  omit = ["*/tests/*", "*/__pycache__/*"]

  [tool.coverage.report]
  exclude_lines = [
      "pragma: no cover",
      "if TYPE_CHECKING:",
      "raise NotImplementedError",
  ]
  ```

- [ ] **conftest.py 설정**

  ```python
  # tests/conftest.py
  import pytest
  import asyncio
  from pathlib import Path
  import tempfile
  import shutil

  @pytest.fixture(scope="session")
  def event_loop():
      """세션 레벨 이벤트 루프"""
      loop = asyncio.get_event_loop_policy().new_event_loop()
      yield loop
      loop.close()

  @pytest.fixture
  def temp_dir():
      """임시 디렉토리"""
      path = Path(tempfile.mkdtemp())
      yield path
      shutil.rmtree(path)

  @pytest.fixture
  async def event_engine():
      """이벤트 엔진 픽스처"""
      from devflow_monitor.events.engine import EventEngine
      engine = EventEngine()
      yield engine

  @pytest.fixture
  async def storage_manager(temp_dir):
      """스토리지 매니저 픽스처"""
      from devflow_monitor.storage.database import DatabaseManager
      from devflow_monitor.storage.storage_manager import StorageManager

      db_path = temp_dir / "test.db"
      db_manager = DatabaseManager(str(db_path))
      storage = StorageManager(db_manager)
      await storage.initialize()

      yield storage

      await storage.shutdown()

  @pytest.fixture
  async def mcp_server():
      """MCP 서버 픽스처"""
      from devflow_monitor.server.main import create_server
      server = await create_server()
      yield server
  ```

### 9.2 단위 테스트 작성

#### 9.2.1 이벤트 시스템 테스트

- [ ] **tests/unit/events/test_engine.py**

  ```python
  # tests/unit/events/test_engine.py
  import pytest
  from datetime import datetime

  from devflow_monitor.events.engine import EventEngine
  from devflow_monitor.events.types.base import BaseEvent, EventCategory, EventSeverity

  @pytest.fixture
  def engine():
      return EventEngine()

  @pytest.fixture
  def sample_event():
      return BaseEvent(
          type="test:event",
          category=EventCategory.FILE,
          severity=EventSeverity.INFO,
          source="test",
          data={"key": "value"},
      )

  class TestEventEngine:
      @pytest.mark.asyncio
      async def test_publish_and_receive(self, engine, sample_event):
          """이벤트 발행 및 수신 테스트"""
          received_events = []

          async def handler(event):
              received_events.append(event)

          engine.on("test:event", handler)
          await engine.publish(sample_event)

          assert len(received_events) == 1
          assert received_events[0].type == "test:event"

      @pytest.mark.asyncio
      async def test_pattern_matching(self, engine, sample_event):
          """패턴 매칭 테스트"""
          received_events = []

          async def handler(event):
              received_events.append(event)

          engine.subscribe(r"test:.*", handler)
          await engine.publish(sample_event)

          assert len(received_events) == 1

      @pytest.mark.asyncio
      async def test_global_handler(self, engine, sample_event):
          """글로벌 핸들러 테스트"""
          received_events = []

          async def handler(event):
              received_events.append(event)

          engine.on("*", handler)
          await engine.publish(sample_event)

          assert len(received_events) == 1

      def test_event_history(self, engine, sample_event):
          """이벤트 히스토리 테스트"""
          import asyncio
          asyncio.run(engine.publish(sample_event))

          history = engine.get_history(limit=10)
          assert len(history) == 1
          assert history[0].type == "test:event"
  ```

#### 9.2.2 스토리지 테스트

- [ ] **tests/unit/storage/test_repositories.py**

  ```python
  # tests/unit/storage/test_repositories.py
  import pytest
  from datetime import datetime

  from devflow_monitor.events.types.base import BaseEvent, EventCategory, EventSeverity

  class TestEventRepository:
      @pytest.mark.asyncio
      async def test_insert_and_find(self, storage_manager):
          """삽입 및 조회 테스트"""
          event = BaseEvent(
              type="test:event",
              category=EventCategory.FILE,
              severity=EventSeverity.INFO,
              source="test",
              data={"key": "value"},
          )

          await storage_manager.events.insert(event)
          found = await storage_manager.events.find_by_id(event.id)

          assert found is not None
          assert found.type == "test:event"

      @pytest.mark.asyncio
      async def test_find_all_with_filters(self, storage_manager):
          """필터링 조회 테스트"""
          from devflow_monitor.storage.repositories.base import QueryOptions

          # 여러 이벤트 삽입
          for i in range(5):
              event = BaseEvent(
                  type=f"test:event:{i}",
                  category=EventCategory.FILE,
                  severity=EventSeverity.INFO,
                  source="test",
                  data={},
              )
              await storage_manager.events.insert(event)

          options = QueryOptions(limit=3)
          events = await storage_manager.events.find_all(options)

          assert len(events) == 3

      @pytest.mark.asyncio
      async def test_delete(self, storage_manager):
          """삭제 테스트"""
          event = BaseEvent(
              type="test:event",
              category=EventCategory.FILE,
              severity=EventSeverity.INFO,
              source="test",
              data={},
          )

          await storage_manager.events.insert(event)
          await storage_manager.events.delete(event.id)

          found = await storage_manager.events.find_by_id(event.id)
          assert found is None
  ```

#### 9.2.3 모니터 테스트

- [ ] **tests/unit/monitors/test_file_monitor.py**
- [ ] **tests/unit/monitors/test_git_monitor.py**

#### 9.2.4 분석기 테스트

- [ ] **tests/unit/analyzers/test_stage_analyzer.py**
- [ ] **tests/unit/analyzers/test_methodology_analyzer.py**
- [ ] **tests/unit/analyzers/test_ai_monitor.py**

#### 9.2.5 보안 테스트

- [ ] **tests/unit/security/test_auth_manager.py**

  ```python
  # tests/unit/security/test_auth_manager.py
  import pytest
  from devflow_monitor.security.auth_manager import AuthManager, AuthConfig

  @pytest.fixture
  def auth_manager():
      config = AuthConfig(secret_key="test-secret-key-32-characters-long")
      return AuthManager(config)

  class TestAuthManager:
      def test_password_hashing(self, auth_manager):
          """비밀번호 해싱 테스트"""
          password = "test-password"
          hashed = auth_manager.hash_password(password)

          assert hashed != password
          assert auth_manager.verify_password(password, hashed)
          assert not auth_manager.verify_password("wrong-password", hashed)

      def test_token_generation_and_verification(self, auth_manager):
          """토큰 생성 및 검증 테스트"""
          token = auth_manager.generate_access_token(
              user_id="user-1",
              roles=["developer"],
              permissions=["read", "write"],
          )

          payload = auth_manager.verify_token(token)

          assert payload is not None
          assert payload.user_id == "user-1"
          assert "developer" in payload.roles

      def test_refresh_token(self, auth_manager):
          """리프레시 토큰 테스트"""
          refresh_token = auth_manager.generate_refresh_token("user-1")
          new_access = auth_manager.refresh_access_token(
              refresh_token, ["developer"], ["read"]
          )

          assert new_access is not None

      def test_rate_limiting(self, auth_manager):
          """레이트 리밋 테스트"""
          identifier = "test-user"

          # 허용 범위 내
          for _ in range(5):
              assert auth_manager.check_rate_limit(identifier, max_requests=5)

          # 초과
          assert not auth_manager.check_rate_limit(identifier, max_requests=5)
  ```

- [ ] **tests/unit/security/test_rbac_manager.py**
- [ ] **tests/unit/security/test_encryption_manager.py**

### 9.3 통합 테스트 작성

- [ ] **tests/integration/test_event_flow.py**

  ```python
  # tests/integration/test_event_flow.py
  import pytest
  import asyncio

  class TestEventFlow:
      @pytest.mark.asyncio
      async def test_file_event_to_storage(self, event_engine, storage_manager):
          """파일 이벤트 → 스토리지 통합 테스트"""
          from devflow_monitor.events.types.base import BaseEvent, EventCategory, EventSeverity

          # 스토리지 연결
          storage_manager.connect_event_engine(event_engine)

          # 이벤트 발행
          event = BaseEvent(
              type="file:change",
              category=EventCategory.FILE,
              severity=EventSeverity.INFO,
              source="file-monitor",
              data={"path": "/test/file.py"},
          )

          await event_engine.publish(event)

          # 약간의 지연 후 확인
          await asyncio.sleep(0.1)

          # 스토리지에 저장되었는지 확인
          stored = await storage_manager.events.find_by_id(event.id)
          assert stored is not None
  ```

- [ ] **tests/integration/test_monitor_to_analyzer.py**
- [ ] **tests/integration/test_mcp_server.py**

### 9.4 E2E 테스트 작성

- [ ] **tests/e2e/test_complete_workflow.py**

  ```python
  # tests/e2e/test_complete_workflow.py
  import pytest
  import asyncio
  from pathlib import Path

  class TestCompleteWorkflow:
      @pytest.mark.asyncio
      async def test_file_change_to_report(self, temp_dir):
          """파일 변경 → 분석 → 보고서 전체 워크플로우"""
          from devflow_monitor.server.main import create_server
          from devflow_monitor.monitors.file import FileMonitor, MonitorConfig

          # 서버 초기화
          server = await create_server()

          # 파일 모니터 시작
          config = MonitorConfig(paths=[str(temp_dir)])
          monitor = FileMonitor(config)
          await monitor.start()

          # 파일 생성
          test_file = temp_dir / "test.py"
          test_file.write_text("print('hello')")

          # 이벤트 처리 대기
          await asyncio.sleep(0.5)

          # 모니터 중지
          await monitor.stop()

          # 보고서 생성 확인
          # (실제 구현에 따라 검증)
  ```

### 9.5 성능 테스트

- [ ] **tests/performance/test_event_throughput.py**

  ```python
  # tests/performance/test_event_throughput.py
  import pytest
  import asyncio
  import time

  class TestEventThroughput:
      @pytest.mark.asyncio
      async def test_10000_events_under_5_seconds(self, event_engine):
          """10,000 이벤트 5초 이내 처리"""
          from devflow_monitor.events.types.base import BaseEvent, EventCategory, EventSeverity

          events = [
              BaseEvent(
                  type=f"test:event:{i}",
                  category=EventCategory.FILE,
                  severity=EventSeverity.INFO,
                  source="test",
                  data={"index": i},
              )
              for i in range(10000)
          ]

          start = time.time()

          for event in events:
              await event_engine.publish(event)

          elapsed = time.time() - start

          assert elapsed < 5.0, f"Processing took {elapsed:.2f}s, expected < 5s"

      @pytest.mark.asyncio
      async def test_latency_percentiles(self, event_engine):
          """지연 시간 백분위수 테스트"""
          import statistics

          latencies = []

          async def measure_handler(event):
              pass

          event_engine.on("*", measure_handler)

          from devflow_monitor.events.types.base import BaseEvent, EventCategory, EventSeverity

          for i in range(1000):
              event = BaseEvent(
                  type="test:latency",
                  category=EventCategory.FILE,
                  severity=EventSeverity.INFO,
                  source="test",
                  data={},
              )

              start = time.time()
              await event_engine.publish(event)
              latencies.append((time.time() - start) * 1000)

          p50 = statistics.median(latencies)
          p95 = statistics.quantiles(latencies, n=20)[18]
          p99 = statistics.quantiles(latencies, n=100)[98]

          assert p50 < 10, f"P50 latency {p50:.2f}ms > 10ms"
          assert p95 < 50, f"P95 latency {p95:.2f}ms > 50ms"
          assert p99 < 100, f"P99 latency {p99:.2f}ms > 100ms"
  ```

- [ ] **tests/performance/test_memory_usage.py**
- [ ] **tests/performance/test_cache_performance.py**

### 9.6 검증 체크리스트

- [ ] 모든 단위 테스트 통과 (80% 커버리지)
- [ ] 모든 통합 테스트 통과
- [ ] E2E 테스트 통과
- [ ] 성능 테스트 기준 충족
- [ ] 메모리 누수 없음 확인
- [ ] CI/CD 파이프라인 통과

---

## 부록 A: 라이브러리 매핑 전체 목록

| TypeScript 패키지 | Python 대체 | 버전 | 비고 |
|------------------|-------------|------|------|
| @modelcontextprotocol/sdk | mcp | >=1.7.1 | 공식 SDK |
| ws | websockets | >=12.0 | 또는 FastAPI WebSocket |
| chokidar | watchdog | >=3.0.0 | |
| simple-git | GitPython | >=3.1.40 | |
| better-sqlite3 | aiosqlite | >=0.19.0 | |
| axios | httpx | >=0.25.2 | 비동기 지원 |
| eventemitter3 | (커스텀) | - | asyncio 기반 구현 |
| pdfkit | reportlab | >=4.0.7 | 또는 weasyprint |
| nodemailer | smtplib | (stdlib) | |
| node-cron | APScheduler | >=3.10.4 | |
| jsonwebtoken | PyJWT | >=2.8.1 | |
| bcryptjs | bcrypt | >=4.1.1 | |
| crypto | cryptography | >=41.0.7 | |
| zod | pydantic | >=2.5.0 | |
| uuid | uuid | (stdlib) | |
| chalk | rich | >=13.7.0 | CLI 출력 |
| commander | typer | >=0.9.0 | CLI 프레임워크 |
| blessed | rich | >=13.7.0 | TUI |

---

## 부록 B: 파일 매핑 전체 목록

```
TypeScript → Python 파일 매핑

src/server/
├── index.ts          → server/main.py, server/tools.py
├── config.ts         → server/config.py
├── types.ts          → server/types.py
├── websocket.ts      → server/websocket.py
└── stream-manager.ts → server/stream_manager.py

src/events/
├── engine.ts         → events/engine.py
├── queue.ts          → events/queue.py
├── queue-manager.ts  → events/queue_manager.py
├── builder.ts        → events/builder.py
├── validator.ts      → events/validator.py
├── types/base.ts     → events/types/base.py
├── types/file.ts     → events/types/file.py
└── types/git.ts      → events/types/git.py

src/monitors/
├── base.ts           → monitors/base.py
├── file.ts           → monitors/file.py
└── git.ts            → monitors/git.py

src/storage/
├── database.ts       → storage/database.py
├── storage-manager.ts→ storage/storage_manager.py
├── repositories/     → storage/repositories/
│   ├── base.ts       → base.py
│   ├── event.ts      → event.py
│   ├── activity.ts   → activity.py
│   └── metrics.ts    → metrics.py
└── migrations/       → storage/migrations/

src/analyzers/
├── stage-analyzer.ts → analyzers/stage_analyzer.py
├── methodology-analyzer.ts → analyzers/methodology_analyzer.py
├── ai-monitor.ts     → analyzers/ai_monitor.py
├── metrics-collector.ts → analyzers/metrics_collector.py
├── bottleneck-detector.ts → analyzers/bottleneck_detector.py
├── metrics-analyzer.ts → analyzers/metrics_analyzer.py
└── types/            → analyzers/types/

src/integrations/
├── base.ts           → integrations/base.py
├── jira.ts           → integrations/jira.py
├── notion.ts         → integrations/notion.py
├── figma.ts          → integrations/figma.py
└── manager.ts        → integrations/manager.py

src/security/
├── auth-manager.ts   → security/auth_manager.py
├── rbac-manager.ts   → security/rbac_manager.py
├── encryption-manager.ts → security/encryption_manager.py
├── audit-logger.ts   → security/audit_logger.py
├── types.ts          → security/types.py
└── index.ts          → security/__init__.py

src/performance/
├── cache-manager.ts  → performance/cache_manager.py
├── performance-profiler.ts → performance/performance_profiler.py
├── memory-optimizer.ts → performance/memory_optimizer.py
├── async-optimizer.ts → performance/async_optimizer.py
├── scaling-manager.ts → performance/scaling_manager.py
└── index.ts          → performance/__init__.py

src/plugins/
├── types.ts          → plugins/types.py
├── loader.ts         → plugins/loader.py
├── sandbox.ts        → plugins/sandbox.py
├── api-provider.ts   → plugins/api_provider.py
├── manager.ts        → plugins/manager.py
└── registry.ts       → plugins/registry.py

src/reports/
├── report-engine.ts  → reports/report_engine.py
├── pdf-generator.ts  → reports/pdf_generator.py
├── scheduler.ts      → reports/scheduler.py
├── template-manager.ts → reports/template_manager.py
├── delivery.ts       → reports/delivery.py
└── types.ts          → reports/types.py

src/notifications/
├── notification-engine.ts → notifications/notification_engine.py
├── channels/slack-notifier.ts → notifications/channels/slack_notifier.py
├── channels/dashboard-notifier.ts → notifications/channels/dashboard_notifier.py
└── types.ts          → notifications/types.py

src/workflow/
├── engine.ts         → workflow/engine.py
├── rule-engine.ts    → workflow/rule_engine.py
├── stage-builder.ts  → workflow/stage_builder.py
├── template-system.ts→ workflow/template_system.py
└── types.ts          → workflow/types.py
```

---

## 부록 C: 마이그레이션 추적 체크리스트

### 전체 진행률 추적

| Phase | 항목 | 상태 | 완료일 |
|-------|------|------|--------|
| 1 | 프로젝트 초기 설정 | [ ] | |
| 1 | MCP 서버 코어 | [ ] | |
| 1 | 이벤트 시스템 | [ ] | |
| 1 | 스토리지 계층 | [ ] | |
| 2 | 파일 모니터 | [ ] | |
| 2 | Git 모니터 | [ ] | |
| 3 | Stage Analyzer | [ ] | |
| 3 | Methodology Analyzer | [ ] | |
| 3 | AI Monitor | [ ] | |
| 3 | Metrics Analyzer | [ ] | |
| 4 | API 클라이언트 베이스 | [ ] | |
| 4 | Jira 클라이언트 | [ ] | |
| 4 | Notion 클라이언트 | [ ] | |
| 4 | Figma 클라이언트 | [ ] | |
| 5 | 인증 매니저 | [ ] | |
| 5 | RBAC 매니저 | [ ] | |
| 5 | 암호화 매니저 | [ ] | |
| 5 | 캐시 매니저 | [ ] | |
| 5 | 성능 프로파일러 | [ ] | |
| 6 | 플러그인 타입 | [ ] | |
| 6 | 플러그인 로더 | [ ] | |
| 6 | 플러그인 샌드박스 | [ ] | |
| 6 | 플러그인 매니저 | [ ] | |
| 7 | PDF 생성기 | [ ] | |
| 7 | 보고서 스케줄러 | [ ] | |
| 7 | 알림 엔진 | [ ] | |
| 7 | Slack 알림 | [ ] | |
| 8 | 단위 테스트 | [ ] | |
| 8 | 통합 테스트 | [ ] | |
| 8 | E2E 테스트 | [ ] | |
| 8 | 성능 테스트 | [ ] | |

---

## 부록 D: 참고 자료

### 공식 문서
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [MCP Python SDK Documentation](https://modelcontextprotocol.github.io/python-sdk/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [asyncio Documentation](https://docs.python.org/3/library/asyncio.html)

### 마이그레이션 가이드
- [TypeScript to Python Migration Patterns](https://docs.python.org/3/library/typing.html)
- [Node.js to Python Async Patterns](https://docs.python.org/3/library/asyncio-task.html)

---

**문서 작성 완료**: 2026-02-04
**예상 총 마이그레이션 기간**: 17-26주 (4-6개월)
**총 변환 대상 코드**: ~55,000줄 TypeScript → Python
