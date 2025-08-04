# DevFlow Monitor MCP - Claude 세션 가이드

## 프로젝트 개요

**DevFlow Monitor MCP**는 소프트웨어 개발의 모든 단계를 실시간으로 추적하고 시각화하는 AI 기반 개발 프로세스 모니터링 플랫폼입니다. 이 MCP 서버는 모든 프로젝트 참여자가 개발 워크플로우에 대한 일관된 가시성을 유지할 수 있도록 합니다.

## 핵심 기술 스택

- **언어**: TypeScript 5.3+ (Node.js 20+)
- **MCP SDK**: @modelcontextprotocol/sdk 0.6+
- **주요 라이브러리**: 
  - chokidar (파일 감시)
  - simple-git (Git 통합)
  - better-sqlite3 (로컬 데이터 저장 및 캐싱)
  - EventEmitter3 (이벤트 처리, 큐 관리, Pub/Sub 메시징)

## 개발 워크플로우

프로젝트는 다음 표준화된 프로세스를 따릅니다:

```
PRD → 기획서 → ERD → Wireframe → 화면단위 기획서 → 디자인 → 프론트/백엔드 → [AI 협업 + 실제 코딩] → Git 관리 → 배포 → 운영
```

### AI 협업 + 코딩 상세 플로우

```
UseCase 도출 → Event Storming → Domain 모델링 → UseCase 상세 설계 → AI 프롬프트 설계 → 1차 뼈대 구현(AI) → 비즈니스 로직 구현 → 리팩토링 → 단위 테스트 → 통합 테스트 → E2E 테스트
```

## 개발 방법론

이 프로젝트는 여러 개발 방법론을 통합합니다:

- **DDD (Domain-Driven Design)**: Ubiquitous Language, Bounded Contexts, Aggregates
- **TDD (Test-Driven Development)**: Red-Green-Refactor cycle
- **BDD (Behavior-Driven Development)**: User Stories, Given-When-Then scenarios
- **EDA (Event-Driven Architecture)**: Event Sourcing, CQRS, Saga patterns

## 프로젝트 구조

### 주요 디렉토리
```
devflow-monitor-mcp/
├── src/
│   ├── server/          # MCP server core
│   ├── monitors/        # Stage-specific monitors
│   ├── integrations/    # External tool integrations
│   ├── events/          # Event processing
│   ├── methodologies/   # DDD/TDD/BDD/EDA tracking
│   └── dashboard/       # CLI/TUI 대시보드
├── tests/
└── dist/
```

## 현재 진행 상황 (2025-08-04)

### 완료된 작업
*2025-08-02:*
- ✅ TypeScript 5.9.2 프로젝트 초기화
- ✅ ESLint, Prettier 개발 도구 설정
- ✅ 프로젝트 디렉토리 구조 생성
- ✅ 운영 가이드 문서 작성 (docs/operations/)
- ✅ 검증 스크립트 작성 (scripts/verify.sh)
- ✅ Git 커밋 및 브랜치 동기화 (커밋 ID: 53d4df7)
- ✅ MCP SDK @modelcontextprotocol/sdk@^0.6.1 설치
- ✅ MCP 서버 구현 (src/server/index.ts, config.ts, types.ts)
- ✅ 4개 MCP 도구 구현 (getProjectStatus, getMetrics, getActivityLog, analyzeBottlenecks)
- ✅ Claude Desktop 연동 테스트 성공
- ✅ 성능 테스트 통과 (평균 시작: 74.60ms, 응답: 2.60ms)

*2025-08-03:*
**마일스톤 1 완료:**
- ✅ chokidar 패키지 설치 및 설정
- ✅ BaseMonitor 추상 클래스 구현 (src/monitors/base.ts - 144줄)
- ✅ FileMonitor 클래스 구현 (src/monitors/file.ts - 232줄)
- ✅ 파일 필터링 시스템 구현 (ignore 패턴, 확장자 필터)
- ✅ 파일 변경 컨텍스트 분석 (test, config, source, docs, build)
- ✅ MCP 서버와 FileMonitor 통합 (getActivityLog에서 실제 이벤트 사용)
- ✅ 파일 모니터 테스트 스크립트 작성 (tests/manual/test-file-monitor.js)
- ✅ 테스트 파일 재구성 (4개 테스트 파일 tests/manual/로 이동)
- ✅ EventEmitter3 기반 이벤트 시스템 구축 (436줄)
- ✅ 이벤트 타입 정의 및 검증 (Zod 스키마 기반)
- ✅ SQLite 데이터베이스 6개 테이블 설계 및 구현
- ✅ Repository 패턴 데이터 접근 계층 구현
- ✅ Vitest 테스트 프레임워크 설정 및 테스트 작성
- ✅ API 문서화 28페이지 완성 (docs/API.md)
- ✅ 설치 가이드 30페이지 완성 (docs/INSTALLATION.md)
- ✅ 통합 테스트 검증 및 이슈 해결

**마일스톤 2 작업:**
- ✅ simple-git v3.27.0 패키지 설치 및 설정
- ✅ GitMonitor 클래스 구현 (src/monitors/git.ts - 435줄)
- ✅ BaseMonitor 상속 구조 구현
- ✅ Git 이벤트 감지 로직 구현 (커밋, 브랜치, 머지)
- ✅ 브랜치 패턴 분석 로직 (feature/, bugfix/, hotfix/ 등 7개 패턴)
- ✅ 커밋 메시지 분석 (Conventional Commits 지원)
- ✅ Git 통계 분석 (삽입/삭제/파일 수)
- ✅ 머지 타입 및 위험도 평가
- ✅ MCP 서버 통합 (GitMonitor 도구 등록)
- ✅ Git 단위 테스트 작성 (tests/unit/monitors/git.test.ts)
- ✅ Git 통합 테스트 작성 (tests/manual/test-git-integration-full.js)
- ✅ Git 전체 기능 검증 완료 (모든 Git 이벤트 감지 확인)
- ✅ axios v1.11.0 패키지 설치
- ✅ BaseAPIClient 추상 클래스 구현 (src/integrations/base.ts - 346줄)
- ✅ JiraClient 구현 (src/integrations/jira.ts - 483줄)
- ✅ NotionClient 구현 (src/integrations/notion.ts - 558줄)
- ✅ FigmaClient 구현 (src/integrations/figma.ts - 490줄)
- ✅ APIIntegrationManager 구현 (src/integrations/manager.ts - 518줄)
- ✅ 인증 시스템 구현 (Bearer, Basic, API Key)
- ✅ 재시도 로직 구현 (exponential backoff with jitter)
- ✅ EventEngine 통합 (모든 API 이벤트 발행)
- ✅ Health check 및 connection 검증
- ✅ 테스트 검증 완료 (test-api-integration-simple.cjs)
- ✅ EventQueue 클래스 구현 (src/events/queue.ts - 487줄)
- ✅ QueueManager 클래스 구현 (src/events/queue-manager.ts - 423줄)
- ✅ 우선순위 큐 시스템 구현 (5단계 우선순위)
- ✅ 배치 처리 시스템 구현 (100개씩 자동 플러시)
- ✅ 메모리 사용량 모니터링 (최대 100MB 제한)
- ✅ 실패 이벤트 재처리 로직 (최대 3회 재시도)
- ✅ 라우팅 규칙 구현 (심각도별, 카테고리별 자동 라우팅)
- ✅ EventEngine 통합 (동적 임포트로 순환 참조 해결)
- ✅ 단위 테스트 작성 (34개 테스트 모두 통과)
- ✅ 통합 테스트 검증 (109개 이벤트 처리 성공)
- ✅ getProjectStatus 도구 확장 (실시간 시스템 메트릭, 마일스톤 진행률)
- ✅ getMetrics 도구 확장 (시간 범위별 필터링, 트렌드 분석, 추천사항)
- ✅ getActivityLog 도구 확장 (모든 이벤트 소스 통합, 향상된 분류)
- ✅ analyzeBottlenecks 도구 확장 (실제 병목 감지, 시스템 상태 분석)
- ✅ checkMethodology 도구 구현 (DDD/TDD/BDD/EDA 준수도 검사)
- ✅ generateReport 도구 구현 (일일/주간/월간 리포트 생성)
- ✅ 총 12개 MCP 도구 완전 구현 (기존 7개 + WebSocket 5개)
- ✅ 실제 데이터 기반 분석 (EventEngine, QueueManager 통합)
- ✅ TypeScript 엄격 모드 준수 (모든 타입 안전성 보장)
- ✅ 종합적인 분석 로직 (방법론 점수, 병목 감지, 효율성 메트릭)
- ✅ ws 패키지 설치 및 설정 (v8.18.3 + @types/ws)
- ✅ WebSocket 서버 구현 (src/server/websocket.ts - 413줄)
- ✅ 스트림 매니저 구현 (src/server/stream-manager.ts - 404줄)
- ✅ 클라이언트 연결 관리 (연결 상태 추적, 하트비트 메커니즘)
- ✅ 이벤트 브로드캐스팅 구현 (실시간 이벤트 스트리밍)
- ✅ 클라이언트별 필터링 (카테고리, 심각도, 소스별 필터링)
- ✅ 연결 상태 모니터링 (통계 조회, 자동 정리)
- ✅ MCP WebSocket 도구 통합 (5개 도구: startWebSocketServer/stopWebSocketServer/getWebSocketStats/getStreamStats/broadcastSystemNotification)
- ✅ 사용자 테스트 가이드 작성 (USER_TESTING_GUIDE.md, QUICK_TEST_CHECKLIST.md)
- ✅ 실시간 통신 검증 스크립트 (3개 테스트 파일)

### 완료된 마일스톤
**마일스톤 1: MVP 기반 구축 (1-2주차)** ✅ 완료 (2025-08-03)
- [x] 프로젝트 초기화 ✅ (2025-08-02)
- [x] MCP 서버 기본 구현 ✅ (2025-08-02)
- [x] 파일 시스템 모니터링 ✅ (2025-08-03)
- [x] 이벤트 시스템 구축 ✅ (2025-08-03)
- [x] 데이터 저장소 구현 ✅ (2025-08-03)
- [x] 테스트 및 문서화 ✅ (2025-08-03)

**마일스톤 2: 핵심 통합 구현 (3-5주차)** ✅ 완료 (2025-08-03) - 진행률: 100% (5/5 섹션 완료)

1. **Git 통합** ✅ 완료 (2025-08-03)
   - [x] simple-git 설치 ✅
   - [x] GitMonitor 클래스 구현 ✅ (435줄)
   - [x] Git 이벤트 감지 (commit, branch, merge) ✅
   - [x] 브랜치 패턴 분석 ✅ (7개 패턴)
   - [x] Conventional Commits 분석 ✅
   - [x] 머지 위험도 평가 ✅
   - [x] MCP 서버 통합 ✅
   - [x] 단위 & 통합 테스트 ✅
   - [x] 전체 기능 검증 완료 ✅

2. **외부 API 통합** ✅ 완료 (2025-08-03)
   - [x] API 클라이언트 베이스 구축 ✅ (BaseAPIClient - 346줄)
   - [x] Jira API 통합 ✅ (JiraClient - 483줄)
   - [x] Notion API 통합 ✅ (NotionClient - 558줄)
   - [x] Figma API 통합 ✅ (FigmaClient - 490줄)
   - [x] APIIntegrationManager ✅ (통합 관리자 - 518줄)
   - [x] 인증 시스템 ✅ (Bearer, Basic, API Key)
   - [x] 재시도 로직 ✅ (exponential backoff with jitter)
   - [x] EventEngine 통합 ✅
   - [x] Health check 시스템 ✅

3. **인메모리 이벤트 큐 구현** ✅ 완료 (2025-08-03)
   - [x] EventEmitter3 기반 큐 시스템 설계 ✅
   - [x] 큐 매니저 클래스 구현 ✅ (QueueManager - 423줄)
   - [x] 우선순위 큐 로직 구현 ✅ (5단계 우선순위)
   - [x] 배치 처리 시스템 구현 ✅ (100개씩 자동 플러시)
   - [x] 메모리 사용량 모니터링 ✅ (최대 100MB 제한)
   - [x] 실패 이벤트 재처리 로직 ✅ (최대 3회 재시도)
   - [x] EventQueue 클래스 구현 ✅ (src/events/queue.ts - 487줄)
   - [x] 다중 큐 관리 시스템 ✅ (default, priority, batch, failed)
   - [x] 라우팅 규칙 구현 ✅ (심각도별, 카테고리별 자동 라우팅)
   - [x] EventEngine 통합 ✅ (동적 임포트로 순환 참조 해결)
   - [x] 단위 테스트 작성 ✅ (34개 테스트 모두 통과)
   - [x] 통합 테스트 검증 ✅ (109개 이벤트 처리 성공)

4. **MCP 도구 API 구현** ✅ 완료 (2025-08-03)
   - [x] getProjectStatus 도구 확장 ✅ (실시간 시스템 메트릭, 마일스톤 진행률)
   - [x] getMetrics 도구 확장 ✅ (시간 범위별 필터링, 트렌드 분석)
   - [x] getActivityLog 도구 확장 ✅ (모든 이벤트 소스 통합, 향상된 분류)
   - [x] analyzeBottlenecks 도구 확장 ✅ (실제 병목 감지, 시스템 상태 분석)
   - [x] checkMethodology 도구 구현 ✅ (DDD/TDD/BDD/EDA 준수도 검사)
   - [x] generateReport 도구 구현 ✅ (일일/주간/월간 리포트 생성)

5. **실시간 통신** ✅ 완료 (2025-08-03)
   - [x] ws 패키지 설치 및 설정 ✅ (v8.18.3 + @types/ws)
   - [x] WebSocket 서버 구현 ✅ (src/server/websocket.ts - 413줄)
   - [x] 클라이언트 연결 관리 ✅ (연결 상태 추적, 하트비트 메커니즘)
   - [x] 이벤트 브로드캐스팅 구현 ✅ (실시간 이벤트 스트리밍)
   - [x] 클라이언트별 필터링 ✅ (카테고리, 심각도, 소스별 필터링)
   - [x] 연결 상태 모니터링 ✅ (통계 조회, 자동 정리)
   - [x] 스트림 매니저 구현 ✅ (src/server/stream-manager.ts - 404줄)
   - [x] MCP WebSocket 도구 통합 ✅ (5개 도구: startWebSocketServer/stopWebSocketServer/getWebSocketStats/getStreamStats/broadcastSystemNotification)
   - [x] 사용자 테스트 가이드 작성 ✅ (USER_TESTING_GUIDE.md, QUICK_TEST_CHECKLIST.md)
   - [x] 실시간 통신 검증 스크립트 ✅ (3개 테스트 파일)

**마일스톤 3: 지능형 모니터링 (6-8주차)** ✅ 완료 (2025-08-04)

6. **개발 단계 인식 시스템** ✅ 완료 (2025-08-03)
   - [x] StageAnalyzer 클래스 구현 ✅ (src/analyzers/stage-analyzer.ts - 724줄)
   - [x] 13개 개발 단계 자동 감지 ✅ (PRD → 기획 → ERD → ... → 운영)
   - [x] 단계별 패턴 기반 감지 규칙 엔진 ✅
   - [x] 신뢰도 기반 단계 전환 감지 ✅ (쿨다운 메커니즘)
   - [x] 11개 코딩 세부 단계 추적 ✅ (UseCase → Event Storming → ... → E2E Test)
   - [x] 단계별 진행률 및 소요 시간 추적 ✅
   - [x] MCP 도구 통합 ✅ (analyzeStage 도구 - 13번째 도구 추가)
   - [x] 단계 전환 히스토리 관리 ✅
   - [x] 실시간 단계 분석 및 제안사항 생성 ✅

7. **방법론 모니터링** ✅ 완료 (2025-08-04)
   - [x] MethodologyAnalyzer 클래스 구현 ✅ (src/analyzers/methodology-analyzer.ts - 1,185줄)
   - [x] 4가지 방법론 자동 감지 ✅ (DDD, TDD, BDD, EDA)
   - [x] DDD 패턴 분석 ✅ (Entity, Aggregate, Repository, BoundedContext)
   - [x] TDD 사이클 추적 ✅ (Red-Green-Refactor, 테스트 커버리지)
   - [x] BDD 시나리오 파싱 ✅ (Feature 파일, Given-When-Then)
   - [x] EDA 패턴 인식 ✅ (Event, Handler, Saga, CQRS)
   - [x] 방법론별 0-100점 점수 시스템 ✅
   - [x] 강점/약점 분석 및 개선 권장사항 ✅
   - [x] 시간대별 사용 트렌드 분석 ✅
   - [x] MCP checkMethodology 도구 업데이트 ✅
   - [x] EventEngine과 실시간 연동 ✅

8. **AI 협업 추적** ✅ 완료 (2025-08-04)
   - [x] AIMonitor 클래스 구현 ✅ (src/analyzers/ai-monitor.ts - 1,215줄)
   - [x] AI 도구 타입 정의 ✅ (src/analyzers/types/ai.ts - 238줄)
   - [x] Claude/GitHub Copilot/ChatGPT/Cursor/TabNine/CodeWhisperer 감지 ✅
   - [x] 패턴 기반 AI 도구 감지 시스템 ✅
   - [x] AI 제안 추적 및 수락/거부/수정 분석 ✅
   - [x] 세션 기반 AI 사용 패턴 추적 ✅
   - [x] 코드 품질 분석 ✅ (readability, maintainability, performance)
   - [x] AI 효과성 메트릭 ✅ (수락률, 시간 절약, 생산성 향상)
   - [x] 사용 패턴 분석 ✅ (피크 시간, 평균 세션 시간)
   - [x] MCP 도구 통합 ✅ (analyzeAICollaboration)
   - [x] EventEngine 통합 및 실시간 분석 ✅
   - [x] 테스트 스크립트 작성 ✅ (tests/manual/test-ai-monitor.js)

9. **CLI/TUI 대시보드** ✅ 완료 (2025-08-04)
   - [x] 대시보드 프레임워크 선택 ✅ (blessed for TUI, chalk+cli-table3 for CLI)
   - [x] CLI 대시보드 구현 ✅ (src/dashboard/cli/dashboard.ts - 365줄)
   - [x] TUI 대시보드 구현 ✅ (src/dashboard/tui/dashboard.ts - 606줄)
   - [x] 6개 패널 TUI 레이아웃 ✅ (상태, 단계, 활동, 메트릭, 방법론, AI 사용)
   - [x] 테이블 기반 CLI 인터페이스 ✅ (시스템 상태, 활동 기록, 메트릭)
   - [x] 실시간 이벤트 피드 ✅ (EventEngine 연동)
   - [x] 인터랙티브 기능 ✅ (키보드 단축키: r, c, h, q/ESC)
   - [x] 대시보드 진입점 구현 ✅ (Commander CLI 프로그램)
   - [x] MCP 도구 통합 ✅ (startDashboard, getDashboardStatus)
   - [x] 실행 및 테스트 스크립트 작성 ✅

10. **메트릭 및 분석 엔진** ✅ 완료 (2025-08-04)
   - [x] MetricsCollector 클래스 구현 ✅ (src/analyzers/metrics-collector.ts - 585줄)
   - [x] BottleneckDetector 클래스 구현 ✅ (src/analyzers/bottleneck-detector.ts - 486줄)
   - [x] MetricsAnalyzer 클래스 구현 ✅ (src/analyzers/metrics-analyzer.ts - 574줄)
   - [x] 메트릭 타입 정의 ✅ (src/analyzers/types/metrics.ts - 309줄)
   - [x] 실시간 메트릭 수집 ✅ (파일, Git, 테스트, 빌드, AI 이벤트)
   - [x] 병목 현상 감지 ✅ (5가지 타입: 프로세스/품질/리소스/워크플로우/기술적)
   - [x] 트렌드 분석 및 점수 계산 ✅ (생산성/품질/성능 점수)
   - [x] 인사이트 및 권장사항 자동 생성 ✅
   - [x] 4개 새로운 MCP 도구 추가 ✅ (getAdvancedMetrics, getBottlenecks, getMetricsSnapshot, analyzeProductivity)
   - [x] 테스트 스크립트 작성 ✅ (scripts/test-metrics.ts)

11. **알림 시스템** ✅ 완료 (2025-08-04)
   - [x] NotificationEngine 클래스 구현 ✅ (src/notifications/notification-engine.ts - 708줄)
   - [x] 알림 타입 정의 ✅ (src/notifications/types.ts - 195줄)
   - [x] SlackNotifier 구현 ✅ (src/notifications/channels/slack-notifier.ts - 198줄)
   - [x] DashboardNotifier 구현 ✅ (src/notifications/channels/dashboard-notifier.ts - 164줄)
   - [x] 규칙 기반 자동 알림 발송 시스템 ✅
   - [x] 4단계 우선순위 시스템 ✅ (urgent/high/medium/low)
   - [x] 채널별 설정 및 활성화 관리 ✅
   - [x] 스로틀링 및 재시도 메커니즘 ✅
   - [x] 이벤트 기반 알림 트리거링 ✅ (EventEngine 통합)
   - [x] 병목 현상 및 메트릭 임계값 알림 ✅
   - [x] 5개 새로운 MCP 도구 추가 ✅ (configureNotifications, sendNotification, getNotificationStats, getNotificationRules, deleteNotificationRule)
   - [x] 테스트 스크립트 작성 ✅ (scripts/test-notifications.ts)
   - [x] 통합 테스트 검증 ✅ (병목 현상, 메트릭 알림 작동 확인)

**마일스톤 4: 프로덕션 준비 (9-10주차)** - 진행중

12. **성능 최적화** ✅ 완료 (2025-08-04)
   - [x] PerformanceProfiler 구현 ✅ (src/performance/performance-profiler.ts - 484줄)
     - 메트릭 추적 및 프로파일링
     - 병목 현상 감지 시스템
     - 메모리 누수 모니터링
     - CPU 사용량 추적
   - [x] MemoryOptimizer 구현 ✅ (src/performance/memory-optimizer.ts - 538줄)
     - LRU 캐시 시스템
     - 자동 메모리 정리
     - TTL 기반 만료 관리
     - 메모리 압박 상황 대응
   - [x] AsyncOptimizer 구현 ✅ (src/performance/async-optimizer.ts - 559줄)
     - 우선순위 기반 작업 큐
     - 배치 처리 시스템
     - 리소스 풀 관리
     - 동시성 제어
   - [x] CacheManager 구현 ✅ (src/performance/cache-manager.ts - 637줄)
     - 다층 캐싱 시스템 (메모리 + SQLite)
     - 태그 기반 무효화
     - 압축 및 암호화 지원
     - 캐시 워밍업 기능
   - [x] ScalingManager 구현 ✅ (src/performance/scaling-manager.ts - 854줄)
     - 동적 스케일링 시스템
     - 이벤트 배치 처리
     - 연결 풀 관리
     - 로드 밸런싱
   - [x] PerformanceManager 통합 ✅ (src/performance/index.ts - 211줄)
     - 모든 성능 모듈 통합 관리
     - 종합 성능 리포트 생성
     - 자동 최적화 실행
   - [x] 5개 MCP 도구 통합 ✅
     - getPerformanceReport: 성능 현황 조회
     - optimizePerformance: 시스템 최적화 실행
     - getSystemMetrics: 실시간 시스템 메트릭
     - profilePerformance: 성능 프로파일링
     - manageCaches: 캐시 관리
   - [x] 성능 테스트 시스템 ✅ (tests/manual/test-performance-optimization.js)
     - 시뮬레이션 기반 검증
     - 부하 테스트 (100개 동시 작업)
     - 메모리 및 성능 모니터링

## 주요 명령어

```bash
# 개발
npm run dev          # TypeScript watch mode
npm run build        # 프로덕션 빌드
npm run lint         # ESLint 실행
npm run format       # Prettier 포맷팅
npm run typecheck    # TypeScript 타입 체크

# 검증
./scripts/verify.sh  # 프로젝트 설정 검증
```

## 참고 문서

- [프로젝트 계획서](../PLANNING.md)
- [작업 목록](../TASKS.md)
- [오늘의 할 일](../docs/todolist/TODOLIST.2025-08-04.md)
- [운영 가이드](../docs/operations/README.md)
- [기능 명세](../docs/FEATURES.md)
- [프로젝트 구조](../docs/PROJECT_STRUCTURE_AND_STYLE.md)

## Git 브랜치 전략

- `main`: 프로덕션 릴리즈
- `develop`: 개발 통합 브랜치 (현재 활성)
- `feature/*`: 새 기능 개발
- `bugfix/*`: 버그 수정
- `hotfix/*`: 긴급 수정

## Claude 세션 시작 시 체크리스트

1. [ ] 현재 브랜치 확인: `git branch`
2. [ ] 프로젝트 상태 확인: `./scripts/verify.sh`
3. [ ] 최신 코드 풀: `git pull origin develop`
4. [ ] 다음 작업 확인: TODOLIST 문서 참조

## 중요 사항

- 모든 코드는 TypeScript strict 모드로 작성
- 커밋 메시지는 Conventional Commits 형식 준수
- 테스트 주도 개발(TDD) 권장
- 문서와 코드의 동기화 유지

---

작성일: 2025-08-02  
최종 수정일: 2025-08-04 (성능 최적화 완료)  
작성자: yaioyaio