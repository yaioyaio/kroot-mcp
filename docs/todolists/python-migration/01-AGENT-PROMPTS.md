# 서브 에이전트 프롬프트 모음

**용도**: Claude Code에서 서브 에이전트 실행 시 복사하여 사용
**참조**: 원본 마이그레이션 문서 `../TODOLIST-20260204-PYTHON-MIGRATION.md`

---

## 목차

1. [Phase 1: 코어 인프라](#phase-1-코어-인프라)
2. [Phase 2: 모니터링 시스템](#phase-2-모니터링-시스템)
3. [Phase 3: 분석 엔진](#phase-3-분석-엔진)
4. [Phase 4: 외부 통합](#phase-4-외부-통합)
5. [Phase 5: 보안 & 성능](#phase-5-보안--성능)
6. [Phase 6: 플러그인 시스템](#phase-6-플러그인-시스템)
7. [Phase 7: 보고서 & 알림](#phase-7-보고서--알림)
8. [Phase 8: 테스트 & 안정화](#phase-8-테스트--안정화)

---

## Phase 1: 코어 인프라

### Agent 1-1: MCP 서버 타입/설정

```
TypeScript에서 Python으로 MCP 서버 코어를 마이그레이션한다.

## 참조 문서
- 마이그레이션 가이드: /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/docs/todolists/TODOLIST-20260204-PYTHON-MIGRATION.md
  - 섹션 2.2 (109-320줄) 참조

## 참조 TypeScript 소스
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/server/types.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/server/config.ts

## 대상 디렉토리
~/dev/devflow-monitor-mcp-python/

## 생성할 파일

### 1. src/devflow_monitor/server/types.py
- 모든 MCP 도구의 Args 타입 정의 (Pydantic BaseModel)
- 모든 MCP 도구의 Response 타입 정의
- McpTool, McpToolInputSchema 타입
- GetProjectStatusArgs, GetMetricsArgs 등 12개 이상 도구 타입

### 2. src/devflow_monitor/server/config.py
- pydantic-settings 기반 설정 클래스
- ServerConfig, MonitoringConfig, DatabaseConfig
- 환경 변수 지원 (DEVFLOW_ 접두사)
- 기본값 포함

### 3. src/devflow_monitor/server/main.py
- MCP 서버 진입점
- mcp 패키지의 Server 클래스 사용
- stdio_server 컨텍스트 매니저 사용
- 기본 구조만 (도구 등록은 별도)

## 완료 기준
- Python 3.11+ 문법 사용
- Pydantic v2 사용 (Field, BaseModel)
- 모든 타입에 타입 힌트 적용
- mypy --strict 통과 가능한 수준
- import 오류 없음

## 코드 스타일
- snake_case 변수/함수명
- PascalCase 클래스명
- 100자 줄 길이 제한
- Google 스타일 docstring
```

---

### Agent 1-2: 이벤트 시스템

```
TypeScript에서 Python으로 이벤트 시스템을 마이그레이션한다.

## 참조 문서
- 마이그레이션 가이드: /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/docs/todolists/TODOLIST-20260204-PYTHON-MIGRATION.md
  - 섹션 2.3 (321-657줄) 참조

## 참조 TypeScript 소스
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/events/types/base.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/events/types/file.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/events/types/git.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/events/engine.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/events/queue.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/events/queue-manager.ts

## 대상 디렉토리
~/dev/devflow-monitor-mcp-python/

## 생성할 파일

### 1. src/devflow_monitor/events/types/base.py
- EventCategory (Enum): FILE, GIT, BUILD, TEST, DEPLOY, API, SYSTEM, SECURITY
- EventSeverity (Enum): DEBUG, INFO, WARNING, ERROR, CRITICAL
- BaseEvent (Pydantic BaseModel): id, type, category, severity, timestamp, source, data, metadata
- uuid4 기반 자동 ID 생성
- datetime.utcnow 기반 자동 타임스탬프

### 2. src/devflow_monitor/events/types/file.py
- FileEventType (Enum): CREATED, MODIFIED, DELETED, RENAMED
- FileContext (Enum): SOURCE, TEST, CONFIG, DOCS, BUILD
- FileEvent (BaseEvent 상속): file_path, event_type, context, size, extension

### 3. src/devflow_monitor/events/types/git.py
- GitEventType (Enum): COMMIT, BRANCH_CREATE, BRANCH_DELETE, MERGE, PUSH, PULL
- BranchType (Enum): FEATURE, BUGFIX, HOTFIX, RELEASE, MAIN, DEVELOP
- GitEvent (BaseEvent 상속): commit_hash, branch, author, message, files_changed

### 4. src/devflow_monitor/events/engine.py
- EventEngine 클래스
- asyncio 기반 비동기 이벤트 처리
- subscribe(pattern, handler) -> subscription_id
- unsubscribe(subscription_id)
- publish(event) -> async
- on(event_type, handler) 리스너 등록
- deque 기반 이벤트 히스토리 (max 10000)
- 정규식 패턴 매칭 지원
- 싱글톤 패턴 (get_event_engine())

### 5. src/devflow_monitor/events/queue.py
- EventQueue 클래스
- 우선순위 기반 큐 (heapq 사용)
- 배치 처리 지원 (batch_size=100)
- 메모리 제한 (max_memory_mb=100)
- 재시도 로직 (max_retries=3)

### 6. src/devflow_monitor/events/queue_manager.py
- QueueManager 클래스
- 다중 큐 관리 (default, priority, batch, failed)
- 라우팅 규칙 기반 자동 분배
- 통계 및 모니터링

## 완료 기준
- asyncio 기반 비동기 처리
- 패턴 매칭 구독 지원 (문자열 및 정규식)
- deque 기반 이벤트 히스토리
- 타입 안전성 보장
- import 오류 없음
- 순환 참조 없음
```

---

### Agent 1-3: 스토리지 계층

```
TypeScript에서 Python으로 스토리지 계층을 마이그레이션한다.

## 참조 문서
- 마이그레이션 가이드: /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/docs/todolists/TODOLIST-20260204-PYTHON-MIGRATION.md
  - 섹션 2.4 (658-975줄) 참조

## 참조 TypeScript 소스
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/storage/storage-manager.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/storage/repositories/base.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/storage/repositories/event.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/storage/repositories/activity.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/storage/repositories/metrics.ts

## 대상 디렉토리
~/dev/devflow-monitor-mcp-python/

## 의존성 (이미 생성되어 있어야 함)
- src/devflow_monitor/events/types/base.py

## 생성할 파일

### 1. src/devflow_monitor/storage/database.py
- DatabaseManager 클래스
- aiosqlite 기반 비동기 SQLite 접근
- 연결 풀 관리
- 테이블 자동 생성 (마이그레이션)
- 트랜잭션 지원
- 싱글톤 패턴 (get_database_manager())

테이블 스키마:
- events: id, type, category, severity, timestamp, source, data (JSON), metadata (JSON)
- activities: id, event_id, description, timestamp
- metrics: id, name, value, timestamp, tags (JSON)

### 2. src/devflow_monitor/storage/repositories/base.py
- BaseRepository 추상 클래스 (ABC)
- Generic[T] 타입 파라미터
- CRUD 메서드: create, find_by_id, find_all, update, delete
- QueryOptions 데이터클래스: limit, offset, order_by, order_dir, filters

### 3. src/devflow_monitor/storage/repositories/event.py
- EventRepository (BaseRepository[BaseEvent] 상속)
- find_by_category(category) -> list[BaseEvent]
- find_by_severity(severity) -> list[BaseEvent]
- find_by_time_range(start, end) -> list[BaseEvent]
- find_by_source(source) -> list[BaseEvent]
- count_by_category() -> dict[str, int]

### 4. src/devflow_monitor/storage/repositories/activity.py
- ActivityRepository 클래스
- 활동 로그 저장/조회

### 5. src/devflow_monitor/storage/repositories/metrics.py
- MetricsRepository 클래스
- 메트릭 저장/조회/집계

### 6. src/devflow_monitor/storage/storage_manager.py
- StorageManager 클래스
- DatabaseManager와 Repository들 통합 관리
- 초기화/종료 라이프사이클 관리
- events, activities, metrics 프로퍼티로 Repository 접근
- 싱글톤 패턴 (get_storage_manager())

## 완료 기준
- aiosqlite 비동기 DB 접근
- Repository 패턴 구현
- 마이그레이션 시스템 포함
- JSON 직렬화/역직렬화
- 타입 안전성 보장
- import 오류 없음
```

---

## Phase 2: 모니터링 시스템

### Agent 2: 모니터링 시스템

```
TypeScript에서 Python으로 모니터링 시스템을 마이그레이션한다.

## 참조 문서
- 마이그레이션 가이드: /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/docs/todolists/TODOLIST-20260204-PYTHON-MIGRATION.md
  - 섹션 3 (976-1643줄) 참조

## 참조 TypeScript 소스
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/monitors/base.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/monitors/file.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/monitors/git.ts

## 대상 디렉토리
~/dev/devflow-monitor-mcp-python/

## 의존성 (Phase 1에서 생성됨, 반드시 존재해야 함)
- src/devflow_monitor/events/engine.py
- src/devflow_monitor/events/types/base.py
- src/devflow_monitor/events/types/file.py
- src/devflow_monitor/events/types/git.py

## 생성할 파일

### 1. src/devflow_monitor/monitors/base.py
- MonitorConfig (Pydantic BaseModel): paths, ignore_patterns, extensions, poll_interval
- MonitorState (Enum): STOPPED, STARTING, RUNNING, STOPPING, ERROR
- BaseMonitor (ABC 추상 클래스):
  - __init__(config: MonitorConfig, event_engine: EventEngine)
  - start() -> async
  - stop() -> async
  - state 프로퍼티
  - is_running 프로퍼티
  - _emit_event(event: BaseEvent) -> async

### 2. src/devflow_monitor/monitors/file.py
- FileMonitor (BaseMonitor 상속)
- watchfiles 라이브러리 사용 (from watchfiles import awatch)
- 파일 변경 감지: created, modified, deleted
- 파일 컨텍스트 자동 분류: source, test, config, docs, build
- ignore 패턴 지원: node_modules, __pycache__, .git, *.pyc
- 확장자 필터링
- FileEvent 발행

### 3. src/devflow_monitor/monitors/git.py
- GitMonitor (BaseMonitor 상속)
- gitpython 라이브러리 사용 (from git import Repo)
- Git 이벤트 감지:
  - 커밋 감지 (새 커밋)
  - 브랜치 생성/삭제
  - 체크아웃
  - 머지
- 브랜치 타입 분석: feature/, bugfix/, hotfix/, release/
- Conventional Commits 파싱
- GitEvent 발행
- 폴링 기반 변경 감지

## 완료 기준
- watchfiles 기반 비동기 파일 감시
- gitpython 기반 Git 상태 감시
- EventEngine과 통합 (이벤트 발행)
- 적절한 에러 핸들링
- 리소스 정리 (stop 시)
- import 오류 없음

## 테스트 방법
```python
# 테스트 코드 예시
import asyncio
from devflow_monitor.events.engine import get_event_engine
from devflow_monitor.monitors.file import FileMonitor, MonitorConfig

async def test():
    engine = get_event_engine()
    config = MonitorConfig(paths=["/tmp/test"])
    monitor = FileMonitor(config, engine)

    engine.on("file", lambda e: print(f"File event: {e}"))

    await monitor.start()
    await asyncio.sleep(10)
    await monitor.stop()

asyncio.run(test())
```
```

---

## Phase 3: 분석 엔진

### Agent 3: 분석 엔진

```
TypeScript에서 Python으로 분석 엔진을 마이그레이션한다.

## 참조 문서
- 마이그레이션 가이드: /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/docs/todolists/TODOLIST-20260204-PYTHON-MIGRATION.md
  - 섹션 4 (1644-2228줄) 참조

## 참조 TypeScript 소스
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/analyzers/stage-analyzer.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/analyzers/methodology-analyzer.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/analyzers/ai-monitor.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/analyzers/metrics-analyzer.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/analyzers/metrics-collector.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/analyzers/bottleneck-detector.ts

## 대상 디렉토리
~/dev/devflow-monitor-mcp-python/

## 의존성 (Phase 1에서 생성됨)
- src/devflow_monitor/events/engine.py
- src/devflow_monitor/events/types/base.py

## 생성할 파일

### 1. src/devflow_monitor/analyzers/types/stage.py
- DevelopmentStage (Enum): PRD, PLANNING, ERD, WIREFRAME, SCREEN_SPEC, DESIGN, FRONTEND, BACKEND, AI_COLLABORATION, GIT_MANAGEMENT, DEPLOYMENT, OPERATION
- CodingSubStage (Enum): USE_CASE, EVENT_STORMING, DOMAIN_MODELING, USE_CASE_DETAIL, AI_PROMPT_DESIGN, SKELETON_IMPL, BUSINESS_LOGIC, REFACTORING, UNIT_TEST, INTEGRATION_TEST, E2E_TEST
- StageTransition (Pydantic): from_stage, to_stage, timestamp, confidence

### 2. src/devflow_monitor/analyzers/types/methodology.py
- MethodologyType (Enum): DDD, TDD, BDD, EDA
- DDDPattern (Enum): ENTITY, VALUE_OBJECT, AGGREGATE, REPOSITORY, SERVICE, FACTORY
- TDDPhase (Enum): RED, GREEN, REFACTOR
- BDDElement (Enum): FEATURE, SCENARIO, GIVEN, WHEN, THEN
- EDAPattern (Enum): EVENT, HANDLER, SAGA, CQRS
- MethodologyScore (Pydantic): methodology, score, patterns_found, recommendations

### 3. src/devflow_monitor/analyzers/types/metrics.py
- MetricType (Enum): PRODUCTIVITY, QUALITY, VELOCITY, COLLABORATION
- MetricValue (Pydantic): name, value, unit, timestamp
- TrendDirection (Enum): UP, DOWN, STABLE

### 4. src/devflow_monitor/analyzers/stage_analyzer.py
- StageAnalyzer 클래스
- 13개 개발 단계 자동 감지
- 파일 패턴 기반 단계 추론
- 신뢰도 점수 계산
- 단계 전환 감지 (쿨다운 메커니즘)
- analyze_current_stage() -> DevelopmentStage
- get_stage_progress() -> dict
- EventEngine 구독하여 실시간 분석

### 5. src/devflow_monitor/analyzers/methodology_analyzer.py
- MethodologyAnalyzer 클래스
- DDD 패턴 감지 (Entity, Aggregate, Repository 등)
- TDD 사이클 추적 (Red-Green-Refactor)
- BDD 시나리오 파싱 (Given-When-Then)
- EDA 패턴 인식 (Event, Handler, Saga)
- 0-100점 점수 시스템
- analyze_methodology() -> list[MethodologyScore]
- get_recommendations() -> list[str]

### 6. src/devflow_monitor/analyzers/ai_monitor.py
- AIToolType (Enum): CLAUDE, COPILOT, CHATGPT, CURSOR, TABNINE, CODEWHISPERER
- AISuggestionStatus (Enum): ACCEPTED, REJECTED, MODIFIED
- AIMonitor 클래스
- AI 도구 사용 패턴 감지
- 제안 수락/거부 추적
- 효과성 메트릭 계산
- track_suggestion(tool, status, code_diff)
- get_ai_stats() -> dict

### 7. src/devflow_monitor/analyzers/metrics_collector.py
- MetricsCollector 클래스
- 실시간 메트릭 수집
- 파일, Git, 테스트, 빌드 이벤트 기반
- 집계 및 트렌드 계산
- collect() -> list[MetricValue]
- get_summary() -> dict

### 8. src/devflow_monitor/analyzers/metrics_analyzer.py
- MetricsAnalyzer 클래스
- 트렌드 분석
- 생산성/품질/성능 점수 계산
- 인사이트 자동 생성
- analyze() -> AnalysisResult
- get_insights() -> list[str]

### 9. src/devflow_monitor/analyzers/bottleneck_detector.py
- BottleneckType (Enum): PROCESS, QUALITY, RESOURCE, WORKFLOW, TECHNICAL
- Bottleneck (Pydantic): type, severity, description, recommendation
- BottleneckDetector 클래스
- 병목 현상 자동 감지
- 심각도 평가
- 해결 권장사항 생성
- detect() -> list[Bottleneck]

## 완료 기준
- EventEngine과 실시간 연동
- 정확한 패턴 매칭
- 점수 계산 로직 구현
- 타입 안전성 보장
- import 오류 없음
```

---

## Phase 4: 외부 통합

### Agent 4: 외부 통합

```
TypeScript에서 Python으로 외부 API 통합을 마이그레이션한다.

## 참조 문서
- 마이그레이션 가이드: /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/docs/todolists/TODOLIST-20260204-PYTHON-MIGRATION.md
  - 섹션 5 (2229-2529줄) 참조

## 참조 TypeScript 소스
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/integrations/base.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/integrations/jira.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/integrations/notion.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/integrations/figma.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/integrations/manager.ts

## 대상 디렉토리
~/dev/devflow-monitor-mcp-python/

## 의존성 (Phase 1에서 생성됨)
- src/devflow_monitor/events/engine.py

## 생성할 파일

### 1. src/devflow_monitor/integrations/base.py
- AuthType (Enum): BEARER, BASIC, API_KEY
- APIClientConfig (Pydantic): base_url, auth_type, credentials, timeout, max_retries
- BaseAPIClient (ABC 추상 클래스):
  - httpx.AsyncClient 사용
  - _request(method, endpoint, **kwargs) -> async
  - 재시도 로직 (tenacity 라이브러리)
  - 인증 헤더 자동 추가
  - 에러 핸들링
  - health_check() -> async bool
  - connect() / disconnect() -> async

### 2. src/devflow_monitor/integrations/jira.py
- JiraConfig (APIClientConfig 상속): project_key, board_id
- JiraClient (BaseAPIClient 상속):
  - get_issue(issue_key) -> dict
  - create_issue(summary, description, issue_type) -> dict
  - update_issue(issue_key, fields) -> dict
  - get_sprint_issues(sprint_id) -> list[dict]
  - add_comment(issue_key, comment) -> dict
  - transition_issue(issue_key, transition_id) -> dict

### 3. src/devflow_monitor/integrations/notion.py
- NotionConfig (APIClientConfig 상속): database_id
- NotionClient (BaseAPIClient 상속):
  - get_page(page_id) -> dict
  - create_page(parent_id, properties) -> dict
  - update_page(page_id, properties) -> dict
  - query_database(database_id, filter) -> list[dict]
  - append_block(page_id, children) -> dict

### 4. src/devflow_monitor/integrations/figma.py
- FigmaConfig (APIClientConfig 상속): file_key
- FigmaClient (BaseAPIClient 상속):
  - get_file(file_key) -> dict
  - get_file_nodes(file_key, node_ids) -> dict
  - get_comments(file_key) -> list[dict]
  - post_comment(file_key, message, position) -> dict
  - get_team_projects(team_id) -> list[dict]

### 5. src/devflow_monitor/integrations/manager.py
- APIIntegrationManager 클래스:
  - 모든 클라이언트 통합 관리
  - register_client(name, client)
  - get_client(name) -> BaseAPIClient
  - connect_all() -> async
  - disconnect_all() -> async
  - health_check_all() -> async dict[str, bool]
  - EventEngine 통합 (API 이벤트 발행)

## 완료 기준
- httpx 비동기 HTTP 클라이언트 사용
- tenacity 기반 재시도 로직 (exponential backoff)
- 3가지 인증 방식 지원 (Bearer, Basic, API Key)
- 타임아웃 및 에러 핸들링
- EventEngine 통합
- import 오류 없음

## 환경 변수 (테스트용)
```
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-api-token
NOTION_API_KEY=your-notion-api-key
FIGMA_ACCESS_TOKEN=your-figma-token
```
```

---

## Phase 5: 보안 & 성능

### Agent 5: 보안 & 성능

```
TypeScript에서 Python으로 보안 및 성능 모듈을 마이그레이션한다.

## 참조 문서
- 마이그레이션 가이드: /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/docs/todolists/TODOLIST-20260204-PYTHON-MIGRATION.md
  - 섹션 6 (2530-3104줄) 참조

## 참조 TypeScript 소스
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/security/auth-manager.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/security/rbac-manager.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/security/encryption-manager.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/security/audit-logger.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/performance/cache-manager.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/performance/memory-optimizer.ts

## 대상 디렉토리
~/dev/devflow-monitor-mcp-python/

## 생성할 파일

### 보안 모듈

### 1. src/devflow_monitor/security/types.py
- Permission (Enum): READ, WRITE, DELETE, ADMIN, EXECUTE
- Role (Pydantic): name, permissions, description
- User (Pydantic): id, username, roles, api_key
- TokenPayload (Pydantic): user_id, username, roles, exp, iat
- AuditLogEntry (Pydantic): timestamp, user_id, action, resource, details

### 2. src/devflow_monitor/security/auth_manager.py
- AuthConfig (Pydantic): jwt_secret, jwt_algorithm, access_token_expire, refresh_token_expire
- AuthManager 클래스:
  - PyJWT 라이브러리 사용
  - create_access_token(user) -> str
  - create_refresh_token(user) -> str
  - verify_token(token) -> TokenPayload
  - refresh_access_token(refresh_token) -> str
  - generate_api_key() -> str
  - verify_api_key(api_key) -> User
  - 레이트 리미팅 (token bucket)

### 3. src/devflow_monitor/security/rbac_manager.py
- RBACManager 클래스:
  - create_role(name, permissions) -> Role
  - assign_role(user_id, role_name)
  - revoke_role(user_id, role_name)
  - check_permission(user_id, permission) -> bool
  - get_user_permissions(user_id) -> set[Permission]
  - 기본 역할: admin, developer, viewer

### 4. src/devflow_monitor/security/encryption_manager.py
- EncryptionManager 클래스:
  - cryptography 라이브러리 사용
  - AES-256-GCM 암호화
  - encrypt(plaintext) -> str (base64)
  - decrypt(ciphertext) -> str
  - hash_password(password) -> str
  - verify_password(password, hashed) -> bool
  - generate_secure_token(length) -> str
  - rotate_key() -> new_key

### 5. src/devflow_monitor/security/audit_logger.py
- AuditLogger 클래스:
  - log(user_id, action, resource, details)
  - query(filters) -> list[AuditLogEntry]
  - get_user_activity(user_id) -> list[AuditLogEntry]
  - export_logs(start, end, format) -> bytes
  - 로그 순환 및 아카이빙

### 성능 모듈

### 6. src/devflow_monitor/performance/cache_manager.py
- CacheConfig (Pydantic): max_size, ttl, compression
- CacheManager 클래스:
  - cachetools 라이브러리 사용
  - LRU 캐시 + TTL 지원
  - get(key) -> Optional[Any]
  - set(key, value, ttl=None)
  - delete(key)
  - clear()
  - get_stats() -> dict
  - 태그 기반 무효화

### 7. src/devflow_monitor/performance/memory_optimizer.py
- MemoryOptimizer 클래스:
  - 메모리 사용량 모니터링
  - 자동 가비지 컬렉션 트리거
  - 대용량 객체 정리
  - get_memory_usage() -> dict
  - optimize() -> dict (freed_bytes)

### 8. src/devflow_monitor/security/__init__.py
- SecurityManager 통합 클래스
- auth_manager, rbac_manager, encryption_manager, audit_logger 통합

### 9. src/devflow_monitor/performance/__init__.py
- PerformanceManager 통합 클래스
- cache_manager, memory_optimizer 통합

## 완료 기준
- PyJWT 기반 토큰 관리
- cryptography 기반 AES-256-GCM 암호화
- 역할 기반 접근 제어 (RBAC)
- 감사 로깅
- 비동기 캐시 시스템
- 메모리 최적화
- import 오류 없음
```

---

## Phase 6: 플러그인 시스템

### Agent 6: 플러그인 시스템

```
TypeScript에서 Python으로 플러그인 시스템을 마이그레이션한다.

## 참조 문서
- 마이그레이션 가이드: /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/docs/todolists/TODOLIST-20260204-PYTHON-MIGRATION.md
  - 섹션 7 (3105-3513줄) 참조

## 참조 TypeScript 소스
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/plugins/types.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/plugins/loader.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/plugins/sandbox.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/plugins/api-provider.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/plugins/manager.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/plugins/registry.ts

## 대상 디렉토리
~/dev/devflow-monitor-mcp-python/

## 의존성 (Phase 5에서 생성됨)
- src/devflow_monitor/security/auth_manager.py
- src/devflow_monitor/security/rbac_manager.py

## 생성할 파일

### 1. src/devflow_monitor/plugins/types.py
- PluginPermission (Enum): FILE_READ, FILE_WRITE, NETWORK, DATABASE, SYSTEM
- PluginState (Enum): UNLOADED, LOADED, ACTIVE, INACTIVE, ERROR, UPDATING
- PluginMetadata (Pydantic): name, version, author, description, permissions, dependencies
- Plugin (ABC 추상 클래스):
  - metadata: PluginMetadata
  - activate() -> async
  - deactivate() -> async
  - on_event(event) -> async
- PluginContext (Pydantic): plugin_id, api, config

### 2. src/devflow_monitor/plugins/loader.py
- PluginLoader 클래스:
  - importlib 동적 모듈 로딩
  - load_plugin(path) -> Plugin
  - unload_plugin(plugin_id)
  - reload_plugin(plugin_id) -> Plugin
  - validate_plugin(plugin) -> bool
  - 의존성 해결
  - 핫 리로드 지원

### 3. src/devflow_monitor/plugins/sandbox.py
- IsolationLevel (Enum): NONE, BASIC, STRICT
- PluginSandbox 클래스:
  - RestrictedPython 또는 multiprocessing 기반 격리
  - 리소스 제한 (CPU, 메모리, 시간)
  - 허용된 모듈만 import 가능
  - execute(code, context) -> result
  - 위험한 작업 차단

### 4. src/devflow_monitor/plugins/api_provider.py
- PluginAPIProvider 클래스:
  - 플러그인에게 제공되는 API
  - 권한 기반 접근 제어
  - file_api: read, write (권한 필요)
  - http_api: get, post (권한 필요)
  - event_api: subscribe, publish
  - storage_api: get, set, delete

### 5. src/devflow_monitor/plugins/manager.py
- PluginManager 클래스:
  - 플러그인 생명주기 관리
  - install_plugin(source) -> Plugin
  - uninstall_plugin(plugin_id)
  - activate_plugin(plugin_id)
  - deactivate_plugin(plugin_id)
  - get_plugin(plugin_id) -> Plugin
  - list_plugins() -> list[PluginMetadata]
  - 이벤트 라우팅

### 6. src/devflow_monitor/plugins/registry.py
- PluginRegistry 클래스:
  - 원격 플러그인 레지스트리
  - search(query) -> list[PluginMetadata]
  - download(plugin_id) -> bytes
  - publish(plugin) -> bool
  - get_versions(plugin_id) -> list[str]

## 완료 기준
- 동적 플러그인 로딩
- 권한 기반 API 접근 제어
- 샌드박스 실행 환경
- 플러그인 생명주기 관리
- EventEngine 통합
- import 오류 없음
```

---

## Phase 7: 보고서 & 알림

### Agent 7: 보고서 & 알림

```
TypeScript에서 Python으로 보고서 및 알림 시스템을 마이그레이션한다.

## 참조 문서
- 마이그레이션 가이드: /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/docs/todolists/TODOLIST-20260204-PYTHON-MIGRATION.md
  - 섹션 8 (3514-3855줄) 참조

## 참조 TypeScript 소스
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/reports/report-engine.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/reports/pdf-generator.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/reports/scheduler.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/reports/template-manager.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/reports/delivery.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/notifications/notification-engine.ts
- /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/src/notifications/channels/slack-notifier.ts

## 대상 디렉토리
~/dev/devflow-monitor-mcp-python/

## 의존성 (Phase 3에서 생성됨)
- src/devflow_monitor/analyzers/metrics_analyzer.py
- src/devflow_monitor/analyzers/methodology_analyzer.py

## 생성할 파일

### 보고서 모듈

### 1. src/devflow_monitor/reports/types.py
- ReportType (Enum): DAILY, WEEKLY, MONTHLY, QUARTERLY, CUSTOM
- ReportFormat (Enum): PDF, HTML, MARKDOWN, JSON, CSV
- ReportSection (Pydantic): title, content, charts, tables
- ReportConfig (Pydantic): type, format, sections, recipients
- Report (Pydantic): id, config, generated_at, data, file_path

### 2. src/devflow_monitor/reports/report_engine.py
- ReportEngine 클래스:
  - generate_report(config) -> Report
  - 분석기들과 통합하여 데이터 수집
  - 섹션별 데이터 집계
  - 10가지 보고서 타입 지원

### 3. src/devflow_monitor/reports/pdf_generator.py
- PDFGenerator 클래스:
  - reportlab 라이브러리 사용
  - generate(report) -> bytes
  - 차트 렌더링 (matplotlib 연동)
  - 테이블 렌더링
  - 스타일링 (헤더, 푸터, 페이지 번호)

### 4. src/devflow_monitor/reports/scheduler.py
- ReportScheduler 클래스:
  - APScheduler 라이브러리 사용
  - schedule(config, cron_expression)
  - unschedule(schedule_id)
  - list_schedules() -> list
  - 일일/주간/월간 자동 생성

### 5. src/devflow_monitor/reports/template_manager.py
- ReportTemplate (Pydantic): id, name, sections, style
- TemplateManager 클래스:
  - create_template(config) -> ReportTemplate
  - get_template(template_id) -> ReportTemplate
  - list_templates() -> list[ReportTemplate]
  - 5가지 기본 템플릿 제공

### 6. src/devflow_monitor/reports/delivery.py
- DeliveryChannel (Enum): EMAIL, SLACK, WEBHOOK, FILESYSTEM, S3
- DeliveryConfig (Pydantic): channel, recipients, options
- ReportDelivery 클래스:
  - deliver(report, config) -> bool
  - 이메일: smtplib/aiosmtplib
  - Slack: httpx webhook
  - 파일시스템: aiofiles

### 알림 모듈

### 7. src/devflow_monitor/notifications/types.py
- NotificationPriority (Enum): LOW, MEDIUM, HIGH, URGENT
- NotificationType (Enum): INFO, WARNING, ERROR, SUCCESS
- NotificationRule (Pydantic): id, condition, channels, priority
- Notification (Pydantic): id, type, priority, title, message, data

### 8. src/devflow_monitor/notifications/notification_engine.py
- NotificationEngine 클래스:
  - send(notification) -> async
  - add_rule(rule) -> str
  - remove_rule(rule_id)
  - process_event(event) -> 규칙 매칭 후 자동 알림
  - EventEngine 통합

### 9. src/devflow_monitor/notifications/channels/slack_notifier.py
- SlackConfig (Pydantic): webhook_url, channel, username
- SlackNotifier 클래스:
  - send(notification) -> async bool
  - format_message(notification) -> dict
  - Block Kit 지원

### 10. src/devflow_monitor/notifications/channels/email_notifier.py
- EmailConfig (Pydantic): smtp_host, smtp_port, username, password
- EmailNotifier 클래스:
  - send(notification, recipients) -> async bool
  - aiosmtplib 사용

## 완료 기준
- PDF 보고서 생성 (reportlab)
- 스케줄링 (APScheduler)
- 다채널 배포 (Email, Slack, Webhook)
- 규칙 기반 자동 알림
- EventEngine 통합
- import 오류 없음
```

---

## Phase 8: 테스트 & 안정화

### Agent 8: 테스트 & 안정화

```
Python 마이그레이션 프로젝트의 테스트 스위트를 작성한다.

## 참조 문서
- 마이그레이션 가이드: /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/docs/todolists/TODOLIST-20260204-PYTHON-MIGRATION.md
  - 섹션 9 (3856-4332줄) 참조

## 대상 디렉토리
~/dev/devflow-monitor-mcp-python/

## 의존성 (모든 Phase 완료 필요)
- src/devflow_monitor/ 전체

## 생성할 파일

### 테스트 설정

### 1. tests/conftest.py
- pytest fixtures 정의
- event_engine fixture
- storage_manager fixture
- temp_dir fixture
- mock_http_client fixture
- 테스트 데이터베이스 설정

### 단위 테스트

### 2. tests/unit/test_events.py
- test_event_creation
- test_event_serialization
- test_event_engine_subscribe
- test_event_engine_publish
- test_pattern_matching
- test_event_queue_priority

### 3. tests/unit/test_monitors.py
- test_file_monitor_detect_create
- test_file_monitor_detect_modify
- test_file_monitor_detect_delete
- test_file_monitor_ignore_patterns
- test_git_monitor_detect_commit
- test_git_monitor_detect_branch

### 4. tests/unit/test_storage.py
- test_database_connection
- test_event_repository_create
- test_event_repository_find
- test_query_options
- test_json_serialization

### 5. tests/unit/test_analyzers.py
- test_stage_analyzer_detect
- test_methodology_analyzer_ddd
- test_methodology_analyzer_tdd
- test_metrics_collector
- test_bottleneck_detector

### 6. tests/unit/test_security.py
- test_jwt_create_verify
- test_password_hash
- test_encryption_decrypt
- test_rbac_permission_check
- test_audit_log

### 통합 테스트

### 7. tests/integration/test_event_flow.py
- test_monitor_to_event_engine
- test_event_to_storage
- test_event_to_analyzer
- 전체 이벤트 흐름 검증

### 8. tests/integration/test_mcp_server.py
- test_server_start
- test_tool_registration
- test_tool_execution
- Claude Desktop 연동 테스트

### E2E 테스트

### 9. tests/e2e/test_complete_workflow.py
- test_file_change_to_report
- 파일 생성 → 이벤트 → 분석 → 보고서 전체 흐름

### 성능 테스트

### 10. tests/performance/test_throughput.py
- test_10000_events_under_5_seconds
- test_latency_percentiles
- test_memory_usage_under_limit
- test_concurrent_monitors

### 테스트 실행 스크립트

### 11. scripts/run_tests.py
- 전체 테스트 실행
- 커버리지 리포트 생성
- 결과 요약 출력

## 완료 기준
- pytest 실행 시 모든 테스트 통과
- 커버리지 80% 이상
- mypy --strict 통과
- ruff 린트 통과
- 성능 테스트 통과 (10,000 이벤트 5초 이내)

## 테스트 실행 명령
```bash
cd ~/dev/devflow-monitor-mcp-python

# 전체 테스트
poetry run pytest

# 커버리지 포함
poetry run pytest --cov=src/devflow_monitor --cov-report=html

# 특정 테스트만
poetry run pytest tests/unit/test_events.py -v

# 성능 테스트
poetry run pytest tests/performance/ -v --timeout=60
```
```

---

## 사용 방법

### Step 1 실행 시

```
Claude Code에서 다음과 같이 입력:

"Phase 1을 순차 실행한다.
docs/todolists/python-migration/01-AGENT-PROMPTS.md 파일의
Agent 1-1, Agent 1-2, Agent 1-3 프롬프트를 순서대로 실행해줘.
각 에이전트 완료 후 다음 에이전트 실행."
```

### Step 2 실행 시 (병렬)

```
Claude Code에서 다음과 같이 입력:

"Phase 2, 3, 4, 5를 병렬로 실행한다.
docs/todolists/python-migration/01-AGENT-PROMPTS.md 파일의
Agent 2, Agent 3, Agent 4, Agent 5 프롬프트를 동시에 실행해줘.
4개 서브 에이전트를 병렬로 실행."
```

---

**문서 작성 완료**: 2026-02-04
