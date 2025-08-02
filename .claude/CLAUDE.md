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

## 현재 진행 상황 (2025-08-02)

### 완료된 작업
- ✅ TypeScript 5.9.2 프로젝트 초기화
- ✅ ESLint, Prettier 개발 도구 설정
- ✅ 프로젝트 디렉토리 구조 생성
- ✅ 운영 가이드 문서 작성 (docs/operations/)
- ✅ 검증 스크립트 작성 (scripts/verify.sh)
- ✅ Git 커밋 및 브랜치 동기화 (커밋 ID: 53d4df7)

### 진행 중인 마일스톤
**마일스톤 1: MVP 기반 구축 (1-2주차)**
- [x] 프로젝트 초기화 ✅
- [ ] MCP 서버 기본 구현
- [ ] 이벤트 시스템 구축
- [ ] 파일 시스템 모니터링
- [ ] 데이터 저장소 구현

### 다음 작업
1. **MCP SDK 설치**: `npm install @modelcontextprotocol/sdk@^0.6.0`
2. **서버 엔트리포인트 구현**: `src/server/index.ts`
3. **서버 설정 관리**: `src/server/config.ts`
4. **Claude Desktop 연동 테스트**

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
- [오늘의 할 일](../docs/todolist/TODOLIST.2025-08-02.md)
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
최종 수정일: 2025-08-02  
작성자: yaioyaio  
상태: 마일스톤 1 - 프로젝트 초기화 완료