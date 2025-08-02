# DevFlow Monitor MCP - Claude Code 세션 가이드

## 프로젝트 개요

**DevFlow Monitor MCP**는 소프트웨어 개발의 모든 단계를 실시간으로 추적하고 시각화하는 AI 기반 개발 프로세스 모니터링 플랫폼입니다. 이 MCP 서버는 모든 프로젝트 참여자가 개발 워크플로우에 대한 일관된 가시성을 유지할 수 있도록 합니다.

## 핵심 기술 스택

- **언어**: TypeScript (Node.js 20+)
- **MCP SDK**: @modelcontextprotocol/sdk
- **주요 라이브러리**: 
  - chokidar (파일 감시)
  - simple-git (Git 통합)
  - better-sqlite3 (로컬 데이터 저장)
  - Redis (이벤트 큐 및 캐싱)
  - EventEmitter3 (이벤트 처리)

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

> 📌 **시스템 아키텍처와 데이터 플로우는 [FLOWCHARTS.md](../FLOWCHARTS.md)를 참조하세요.**
> 📌 **상세한 프로젝트 구조 및 코딩 표준은 [PROJECT_STRUCTURE_AND_STYLE.md](../PROJECT_STRUCTURE_AND_STYLE.md)를 참조하세요.**

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

## 주요 명령어

```bash
# 개발
npm run dev          # MCP 서버 개발 모드 실행
npm run build        # TypeScript 빌드
npm run test         # Vitest로 테스트 실행
npm run lint         # ESLint 실행
npm run typecheck    # TypeScript 타입 체크

# 프로덕션
npm run start        # MCP 서버 실행
npm run install-mcp  # Claude Desktop MCP로 설치
```

## 구현 가이드라인

> 📌 **상세 기능 구현 시 [FEATURES.md](../FEATURES.md)를 반드시 참조하세요.**

### 1. 이벤트 추적
모든 개발 단계는 다음 구조를 따르는 이벤트를 발행해야 합니다:
```typescript
interface ProcessEvent {
  stage: StageType;
  timestamp: Date;
  actor: string;
  action: string;
  metadata: { ... };
  status: 'started' | 'in_progress' | 'completed' | 'blocked';
}
```

### 2. 방법론 준수
기능 구현 시 방법론 추적을 보장하세요:
```typescript
interface MethodologyCheck {
  ddd: { ubiquitousLanguage: boolean; boundedContext: string[]; ... };
  tdd: { redPhase: {...}; greenPhase: {...}; refactorPhase: {...}; };
  bdd: { features: string[]; scenarios: {...}[]; ... };
  eda: { events: string[]; eventHandlers: string[]; ... };
}
```

### 3. 파일 모니터링
크로스 플랫폼 파일 시스템 모니터링을 위해 chokidar를 사용하세요:
```typescript
// 프로젝트 파일 모니터링
chokidar.watch(projectPath, {
  ignored: /(^|[\/\\])\../,
  persistent: true
});
```

### 4. Git 통합
simple-git을 사용하여 모든 Git 활동을 추적하세요:
```typescript
// Git 이벤트 모니터링
git.log()
git.status()
git.diff()
```

## 현재 개발 단계

프로젝트는 현재 **계획 단계**에 있습니다. 다음 단계는:

1. **마일스톤 1 (1-2주차)**: TypeScript 기반 기본 MCP 서버 설정
2. **마일스톤 2 (3-5주차)**: 프로세스 통합 및 이벤트 시스템
3. **마일스톤 3 (6-8주차)**: CLI/TUI 대시보드 개발 및 방법론 추적
4. **마일스톤 4 (9-10주차)**: 고급 기능 및 최적화
5. **마일스톤 5 (11-12주차)**: 확장 및 고도화

## 테스트 전략

- **단위 테스트**: 개별 모니터 및 이벤트 프로세서 테스트
- **통합 테스트**: 외부 도구 통합 테스트
- **E2E 테스트**: 완전한 워크플로우 시나리오 테스트
- **커버리지 목표**: 최소 80% 코드 커버리지

## 중요 사항

1. **타입 안정성**: 항상 TypeScript strict 모드 사용
2. **이벤트 기반**: 모든 상태 변경은 이벤트를 발행해야 함
3. **방법론 추적**: 모든 코드 변경은 DDD/TDD/BDD/EDA 원칙에 매핑되어야 함
4. **실시간 업데이트**: MCP 도구를 통한 데이터 조회
5. **오류 처리**: 재시도 로직을 포함한 강력한 오류 처리 구현

## 외부 통합

- **프로젝트 관리**: Jira, Asana, Notion API
- **디자인 도구**: Figma API, Sketch 플러그인
- **개발 도구**: VS Code 확장, Git hooks
- **AI 도구**: Claude MCP, GitHub Copilot 통합
- **CI/CD**: GitHub Actions, Jenkins 웹훅

## 성능 고려사항

- 더 나은 동시성을 위해 SQLite WAL 모드 사용
- 고빈도 변경사항에 대한 이벤트 배치 처리 구현
- 자주 접근하는 데이터를 Redis에 캐싱
- 파일 시스템 이벤트 디바운싱

## 보안 가이드라인

- 코드에 자격 증명을 절대 저장하지 않음
- 민감한 데이터에는 환경 변수 사용
- API 속도 제한 구현
- 모든 사용자 입력 검증
- 보안 모범 사례 준수

## 기여 워크플로우

1. `main`에서 feature 브랜치 생성
2. 개발 워크플로우에 따라 기능 구현
3. 모든 테스트 통과 및 커버리지 요구사항 충족 확인
4. 상세한 설명과 함께 PR 생성
5. 코드 리뷰 및 방법론 준수 확인
6. 승인 후 병합

기억하세요: 이 프로젝트는 전체 개발 프로세스에 투명성과 일관성을 가져오는 것을 목표로 합니다. 모든 구현은 이 목표에 기여해야 합니다.

---

작성일: 2025-08-02  
최종 수정일: 2025-01-03  
작성자: yaioyaio