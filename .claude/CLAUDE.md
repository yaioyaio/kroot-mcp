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

## 현재 진행 상황 (2025-08-03)

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

### 완료된 마일스톤
**마일스톤 1: MVP 기반 구축 (1-2주차)** ✅ 완료 (2025-08-03)
- [x] 프로젝트 초기화 ✅ (2025-08-02)
- [x] MCP 서버 기본 구현 ✅ (2025-08-02)
- [x] 파일 시스템 모니터링 ✅ (2025-08-03)
- [x] 이벤트 시스템 구축 ✅ (2025-08-03)
- [x] 데이터 저장소 구현 ✅ (2025-08-03)
- [x] 테스트 및 문서화 ✅ (2025-08-03)

### 진행 중인 마일스톤
**마일스톤 2: 핵심 통합 구현 (3-5주차)** - 진행률: 41.7%
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

2. **외부 API 통합** (다음 작업)
   - [ ] API 클라이언트 베이스 구축
   - [ ] Jira API 통합
   - [ ] Notion API 통합
   - [ ] WebSocket 실시간 통신

3. **MCP 도구 API 구현** (다음 작업)
   - [ ] getProjectStatus 도구 확장
   - [ ] getMetrics 도구 확장
   - [ ] analyzeBottlenecks 도구 확장

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
- [오늘의 할 일](../docs/todolist/TODOLIST.2025-08-03.md)
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
최종 수정일: 2025-08-03  
작성자: yaioyaio  
상태: **마일스톤 2: 핵심 통합 구현 - Git 통합 완료** ✅ (2025-08-03)

**완료된 마일스톤:**
- **마일스톤 1: MVP 기반 구축 완료** ✅ (2025-08-03)
  - 프로젝트 초기화 및 설정 ✅
  - MCP 서버 기본 구현 ✅
  - 파일 시스템 모니터링 ✅
  - 이벤트 시스템 구축 ✅
  - 데이터 저장소 구현 ✅
  - 테스트 및 문서화 ✅

**진행 중인 마일스톤:**
- **마일스톤 2: 핵심 통합 구현** (진행률: 41.7%)
  - Git 통합 ✅ (2025-08-03) - GitMonitor 클래스, 이벤트 감지, 브랜치 패턴 분석, Conventional Commits 분석
  - MCP 도구 API 구현 (다음 작업)
  - 외부 API 통합 (계획 중)