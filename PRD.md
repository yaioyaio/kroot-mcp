# DevFlow Monitor MCP - 제품 요구사항 문서 (PRD)

## 1. 제품 개요

### 1.1 제품명
**DevFlow Monitor MCP** - AI 기반 통합 개발 프로세스 모니터링 플랫폼

### 1.2 비전
AI를 활용한 모든 프로젝트 개발 시, 전체 개발 프로세스를 실시간으로 추적하고 모니터링하여 프로젝트 참여자 모두가 일관성 있는 개발 흐름을 파악할 수 있는 통합 플랫폼

### 1.3 핵심 가치
- **일관성**: 모든 프로젝트에 표준화된 개발 프로세스 적용
- **투명성**: 전체 개발 단계의 실시간 가시화
- **협업성**: 모든 참여자가 동일한 정보를 실시간으로 공유
- **자동화**: AI 기반 자동 추적 및 보고

## 2. 개발 프로세스 단계

### 2.1 전체 워크플로우

#### 기본 프로세스
```
PRD → 기획서 → ERD → Wireframe → 화면단위 기획서 → 디자인 → 프론트/백엔드 → [AI 협업 + 실제 코딩] → Git 관리 → 배포 → 운영
```

#### AI 협업 + 실제 코딩 세분화
```
화면단위 기획서 → UseCase 도출 → Event Storming → Domain 모델링 → UseCase 상세 설계 → AI 프롬프트 설계 → 1차 뼈대 구현(AI) → 비즈니스 로직 구현 → 리팩토링 → 단위 테스트 → 통합 테스트 → E2E 테스트
```

### 2.2 단계별 정의

| 단계 | 설명 | 추적 항목 |
|------|------|-----------|
| **PRD** | 제품 요구사항 정의 | 문서 생성/수정, 요구사항 변경 이력 |
| **기획서** | 상세 기능 기획 | 기능 명세, 유저 스토리, 승인 상태 |
| **ERD** | 데이터베이스 설계 | 테이블 구조, 관계도, 변경 이력 |
| **Wireframe** | UI/UX 초안 설계 | 화면 구조, 플로우 다이어그램 |
| **화면단위 기획서** | 화면별 상세 기능 정의 | 화면별 기능 명세, 인터랙션 정의, 비즈니스 로직 |
| **디자인** | 시각 디자인 작업 | 디자인 파일, 스타일 가이드, 컴포넌트 디자인 |
| **프론트/백엔드** | 아키텍처 설계 | 기술 스택 결정, 모듈 구조, API 설계 |
| **AI 협업 + 실제 코딩** | AI 기반 코드 구현 | 아래 상세 단계 참조 |

### 2.3 AI 협업 + 실제 코딩 상세 단계

| 단계 | 설명 | AI 역할 | 추적 항목 |
|------|------|---------|-----------|
| **UseCase 도출** | 요구사항에서 UseCase 추출 | 요구사항 분석, 시나리오 생성 | UseCase 다이어그램, Actor 정의 |
| **Event Storming** | 도메인 이벤트 정의 | 도메인 이벤트 제안, 흐름 검증 | 이벤트 목록, Aggregate 정의 |
| **Domain 모델링** | 비즈니스 모델 설계 | 엔티티/VO 코드 생성 | 도메인 객체, 비즈니스 규칙 |
| **UseCase 상세 설계** | 구현 상세 정의 | 시퀀스 다이어그램 생성 | 메서드 시그니처, 인터페이스 |
| **AI 프롬프트 설계** | AI 사용 전략 수립 | - | 프롬프트 템플릿, 컨텍스트 정의 |
| **1차 뼈대 구현** | 기본 구조 생성 | 보일러플레이트 생성 | 클래스 구조, 기본 메서드 |
| **비즈니스 로직 구현** | 핵심 로직 코딩 | 핵심 로직 코드 생성/개선 | 구현 코드, AI 수정 이력 |
| **리팩토링** | 코드 품질 개선 | 코드 개선 제안 | 리팩토링 전/후 비교 |
| **단위 테스트** | 개별 기능 검증 | 테스트 코드 생성 | 테스트 케이스, 커버리지 |
| **통합 테스트** | 모듈 간 통합 검증 | 테스트 시나리오 생성 | API 테스트, 통합 지점 |
| **E2E 테스트** | 전체 플로우 검증 | 사용자 시나리오 테스트 생성 | UI 플로우 테스트 |
| **Git 관리** | 버전 관리 | 브랜치, PR, 머지 상태 |
| **배포** | 릴리즈 및 배포 | 배포 환경, 상태, 롤백 이력 |
| **운영** | 유지보수 및 모니터링 | 이슈 트래킹, 성능 모니터링, 사용자 피드백 |

## 3. 기능 요구사항

> 📌 **상세 기능 명세는 [FEATURES.md](./FEATURES.md)를 참조하세요.**

### 3.1 이벤트 캡처 시스템
```typescript
interface ProcessEvent {
  stage: StageType;
  timestamp: Date;
  actor: string;
  action: string;
  metadata: {
    files?: string[];
    tools?: string[];
    changes?: ChangeDetail[];
    aiInteraction?: AIDetail[];
  };
  status: 'started' | 'in_progress' | 'completed' | 'blocked';
}
```

### 3.2 핵심 기능

#### 자동 감지 도구
- `detect_prd_changes`: PRD 문서 변경 감지
- `track_planning`: 기획 문서 추적
- `track_erd_changes`: ERD 및 데이터 모델 변경 추적
- `monitor_wireframe`: Wireframe 업데이트 감지
- `track_screen_planning`: 화면단위 기획서 추적
- `monitor_design`: 디자인 파일 변경 감지
- `capture_architecture`: 아키텍처 결정 추적
- `track_ai_collaboration`: AI 도구 사용 모니터링
- `monitor_development`: 코드 변경 추적
- `track_testing`: 테스트 실행 모니터링
- `monitor_deployment`: 배포 프로세스 추적

#### 데이터 통합
- `aggregate_metrics`: 전체 프로세스 메트릭 집계
- `generate_reports`: 단계별 리포트 생성
- `alert_bottlenecks`: 병목 구간 알림
- `sync_dashboard`: 대시보드 실시간 동기화

### 3.3 개발 방법론 통합 추적

#### 방법론별 적용 단계

| 단계 | DDD | TDD | BDD | EDA | 추적 항목 |
|------|-----|-----|-----|-----------|
| **UseCase 도출** | ✓ Ubiquitous Language | - | ✓ User Story | - | 도메인 용어집, Given-When-Then |
| **Event Storming** | ✓ Domain Event | - | - | ✓ Event 정의 | 이벤트 목록, Command/Query |
| **Domain 모델링** | ✓ Aggregate/Entity/VO | - | - | ✓ Event Sourcing | 도메인 모델, 이벤트 스트림 |
| **UseCase 상세 설계** | ✓ Application Service | ✓ Test First | ✓ Scenario | - | 테스트 시나리오, 인터페이스 |
| **AI 프롬프트 설계** | ✓ Context Mapping | ✓ Red 단계 | ✓ Feature 정의 | - | 테스트 케이스, Feature 파일 |
| **1차 뼈대 구현** | ✓ Repository Pattern | ✓ Green 단계 | - | ✓ Event Handler | 패턴 적용, 테스트 통과 |
| **비즈니스 로직 구현** | ✓ Domain Service | ✓ Refactor 단계 | ✓ Step Definition | ✓ Saga/CQRS | 핵심 로직, 이벤트 처리 |
| **리팩토링** | ✓ Anti-corruption Layer | ✓ 테스트 유지 | - | - | 경계 컨텍스트, 테스트 커버리지 |
| **단위 테스트** | - | ✓ Unit Test | - | - | 테스트 결과, 커버리지 |
| **통합 테스트** | ✓ Bounded Context 검증 | ✓ Integration Test | ✓ Acceptance Test | ✓ Event Flow | 컨텍스트 통합, 이벤트 추적 |
| **E2E 테스트** | - | - | ✓ End-to-End Scenario | ✓ Event Chain | 시나리오 검증, 이벤트 체인 |

#### 방법론 추적 구조

```typescript
interface MethodologyCheck {
  // DDD 체크포인트
  ddd: {
    ubiquitousLanguage: boolean;
    boundedContext: string[];
    aggregates: string[];
    domainEvents: string[];
  };
  
  // TDD 사이클
  tdd: {
    redPhase: { testWritten: boolean; failing: boolean; };
    greenPhase: { implemented: boolean; passing: boolean; };
    refactorPhase: { refactored: boolean; testsStillPass: boolean; };
  };
  
  // BDD 시나리오
  bdd: {
    features: string[];
    scenarios: { given: string; when: string; then: string; }[];
    stepsPassed: number;
  };
  
  // EDA 추적
  eda: {
    events: string[];
    eventHandlers: string[];
    sagaOrchestration: boolean;
    eventSourcing: boolean;
  };
}
```

### 3.4 AI 협업 추적
```typescript
interface AICollaboration {
  tool: 'Claude' | 'GitHub Copilot' | 'ChatGPT' | string;
  sessionId: string;
  prompts: Array<{
    timestamp: Date;
    prompt: string;
    response: string;
    applied: boolean;
  }>;
  generatedCode: Array<{
    file: string;
    lines: number;
    accepted: boolean;
  }>;
}
```

## 4. 기술 요구사항

### 4.1 MCP 서버 아키텍처
- **언어**: TypeScript (Node.js 20+)
- **프로토콜**: JSON-RPC over stdio/WebSocket
- **통합 방식**: Claude Desktop 및 기타 AI 도구 플러그인
- **프레임워크**: 
  - MCP SDK: @modelcontextprotocol/sdk 0.6+
  - 이벤트 처리: EventEmitter3

### 4.2 감지 메커니즘
- **파일 시스템 감시**: chokidar (크로스 플랫폼 파일 변경 감지)
- **Git 통합**: simple-git (Git 명령어 프로그래매틱 실행)
- **문서 추적**: 클라우드 문서 API (Notion, Google Docs)
- **디자인 도구**: Figma API, Sketch 플러그인
- **개발 도구**: Git hooks, IDE 플러그인, CI/CD 통합
- **AI 도구**: MCP 프로토콜, API 래퍼

### 4.3 데이터 저장 및 전송
- **로컬 캐시**: SQLite (better-sqlite3) - 오프라인 작업 지원
- **메시지 큐**: Redis (ioredis) - 이벤트 처리 및 Pub/Sub
- **실시간 처리**: EventEmitter3 - 이벤트 기반 아키텍처
- **배치 전송**: node-cron - 주기적 데이터 동기화
- **API 클라이언트**: axios - 외부 서비스 통합

## 5. 통합 요구사항

### 5.1 지원 플랫폼
- **프로젝트 관리**: Jira, Asana, Monday.com, Notion
- **디자인 도구**: Figma, Sketch, Adobe XD
- **개발 도구**: VS Code, IntelliJ, GitHub, GitLab
- **AI 도구**: Claude, GitHub Copilot, ChatGPT
- **CI/CD**: GitHub Actions, Jenkins, GitLab CI

### 5.2 대시보드 기능
- **실시간 진행률**: 각 단계별 진행 상태
- **타임라인 뷰**: 전체 프로세스 시각화
- **병목 분석**: 지연 구간 자동 감지
- **팀 활동**: 참여자별 기여도
- **AI 활용도**: AI 도구 사용 통계
- **방법론 적용 현황**: DDD/TDD/BDD/EDA 적용 비율
- **코드 품질 메트릭**: 테스트 커버리지, 코드 복잡도

## 6. 개발 로드맵

### Phase 1 - 기반 구축 (2주)
- TypeScript + MCP SDK 기본 서버 구축
- 핵심 이벤트 모델 정의 (타입 시스템 활용)
- 파일 시스템 모니터링 (chokidar) 구현
- Git 이벤트 추적 (simple-git) 통합
- SQLite 로컬 저장소 구현

### Phase 2 - 프로세스 통합 (3주)
- 외부 도구 API 연동 (Jira, Notion, Figma)
- 이벤트 수집 및 처리 시스템 구현
- Redis 메시지 큐 통합
- EventEmitter3 기반 실시간 이벤트 처리
- AI 도구 추적 시스템 (Claude, GitHub Copilot)
- 테스트 러너 통합 (Vitest)

### Phase 3 - 대시보드 개발 (3주)
- MCP 도구 기반 데이터 조회 API
- CLI/TUI 대시보드 구현
- 실시간 데이터 시각화
- 개발 방법론 추적 로직 구현
- 메트릭 집계 시스템
- 리포트 생성 및 알림 기능

### Phase 4 - 프로덕션 준비 (2주)
- 성능 최적화 완료
- 완전한 문서화
- PM2 기반 프로덕션 배포 설정
- 모니터링 및 로깅 시스템

### Phase 5 - 확장 및 고도화 (2주)
- 사용자 정의 워크플로우 지원
- 플러그인 시스템 구현
- 다중 프로젝트 지원
- 고급 보고서 생성

## 7. 성공 지표

### 7.1 정량적 지표
- 프로세스 가시성: 95% 이상의 개발 활동 자동 추적
- 보고 시간 절감: 수동 보고 대비 90% 감소
- 병목 감지: 24시간 내 병목 구간 자동 알림
- AI 활용도: AI 도구 사용 패턴 100% 추적

### 7.2 정성적 지표
- 팀 협업 만족도 향상
- 프로젝트 투명성 증대
- 의사결정 속도 개선
- 개발 프로세스 표준화

## 8. 제약사항 및 가정

### 8.1 제약사항
- 기존 도구들의 API 제한사항 준수
- 개인정보 및 코드 보안 고려
- 실시간 처리를 위한 성능 최적화

### 8.2 가정
- 팀원들의 MCP 도구 설치 및 사용 동의
- 기본적인 개발 도구 사용 환경 구축
- 안정적인 네트워크 연결

### 8.3 프로젝트 상태
- **현재 단계**: 계획 단계
- **다음 단계**: 프로젝트 초기화 및 기본 구조 설정

## 9. 향후 확장 가능성

- **다중 프로젝트 관리**: 포트폴리오 레벨 대시보드
- **팀 성과 분석**: KPI 자동 측정
- **지식 관리**: 프로젝트 학습 내용 축적
- **자동화 확장**: 반복 작업 자동 실행

---

작성일: 2025-08-02  
최종 수정일: 2025-01-03  
작성자: yaioyaio