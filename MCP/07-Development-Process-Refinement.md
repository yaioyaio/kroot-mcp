# DevFlow Monitor MCP - 개발 프로세스 세분화 문서

## 1. 개발 프로세스 재정렬

### 1.1 초기 프로세스
```
PRD → 기획서 → Wireframe → 디자인 → 프론트/백엔드 → ERD → 화면단위 계획서 → AI 협업 → 실제 코딩 → 테스트 → Git 관리 → 배포 → 개발/운영
```

### 1.2 논리적 흐름 기반 재정렬
```
PRD → 기획서 → ERD → Wireframe → 화면단위 기획서 → 디자인 → 프론트/백엔드 → AI 협업 → 실제 코딩 → 테스트 → Git 관리 → 배포 → 운영
```

**재정렬 근거:**
- ERD를 Wireframe 앞으로: 데이터 구조를 먼저 정의해야 화면 설계가 정확함
- 화면단위 기획서를 디자인 앞으로: 상세 기능 정의 후 시각 디자인 진행
- "개발/운영"을 "운영"으로 단순화: 배포 후가 운영 단계

## 2. AI 협업 단계 세분화

### 2.1 현재 구조의 한계
- "AI 협업"과 "실제 코딩"이 분리되어 있으나 실제로는 통합된 프로세스
- AI 도구 사용이 코딩의 모든 단계에 걸쳐 발생
- 테스트도 AI가 생성하거나 지원 가능

### 2.2 AI 협업 + 실제 코딩 통합 프로세스

#### 상세 흐름
```
화면단위 기획서 → UseCase 도출 → Event Storming → Domain 모델링 → UseCase 상세 설계 → AI 프롬프트 설계 → 1차 뼈대 구현(AI) → 비즈니스 로직 구현 → 리팩토링 → 단위 테스트 → 통합 테스트 → E2E 테스트
```

#### 단계별 정의

| 단계 | AI 역할 | 추적 항목 |
|------|---------|-----------|
| **UseCase 도출** | 요구사항 분석, 시나리오 생성 | UseCase 다이어그램, Actor 정의 |
| **Event Storming** | 도메인 이벤트 제안, 흐름 검증 | 이벤트 목록, Aggregate 정의 |
| **Domain 모델링** | 엔티티/VO 코드 생성 | 도메인 객체, 비즈니스 규칙 |
| **UseCase 상세 설계** | 시퀀스 다이어그램 생성 | 메서드 시그니처, 인터페이스 |
| **AI 프롬프트 설계** | - | 프롬프트 템플릿, 컨텍스트 정의 |
| **1차 뼈대 구현** | 보일러플레이트 생성 | 클래스 구조, 기본 메서드 |
| **비즈니스 로직 구현** | 핵심 로직 코드 생성/개선 | 구현 코드, AI 수정 이력 |
| **리팩토링** | 코드 개선 제안 | 리팩토링 전/후 비교 |
| **단위 테스트** | 테스트 코드 생성 | 테스트 케이스, 커버리지 |
| **통합 테스트** | 테스트 시나리오 생성 | API 테스트, 통합 지점 |
| **E2E 테스트** | 사용자 시나리오 테스트 생성 | UI 플로우 테스트 |

## 3. 개발 방법론 통합

### 3.1 방법론별 추적 구조

```typescript
interface MethodologyTracking {
  methodology: 'DDD' | 'TDD' | 'BDD' | 'EDA';
  stage: string;
  applied: boolean;
  artifacts: string[];
  validationStatus: 'passed' | 'failed' | 'pending';
}
```

### 3.2 통합 개발 프로세스 매트릭스

| 단계 | DDD | TDD | BDD | EDA | 추적 항목 |
|------|-----|-----|-----|-----|-----------|
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

### 3.3 MCP 서버 추적 기능

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

## 4. 구현 시 고려사항

### 4.1 AI 협업 추적
- 각 단계에서 사용된 AI 도구 기록
- 프롬프트와 생성된 코드의 매핑
- AI 제안 수락/거부 비율 추적

### 4.2 방법론 검증
- 각 방법론의 핵심 원칙 준수 여부 자동 체크
- 아티팩트 생성 여부 확인
- 방법론 간 충돌 사항 감지 및 알림

### 4.3 대시보드 시각화
- 전체 프로세스 진행률
- 방법론별 적용 현황
- AI 활용도 통계
- 병목 구간 실시간 감지

## 5. 예상 효과

- **프로세스 표준화**: 모든 프로젝트에 일관된 개발 프로세스 적용
- **품질 향상**: 방법론 기반 체계적 개발로 품질 보증
- **AI 효율성**: AI 도구의 효과적 활용으로 개발 속도 향상
- **투명성 확보**: 모든 단계의 진행 상황 실시간 추적 가능

---

작성일: 2025-08-02  
최종 수정일: 2025-08-02  
작성자: yaioyaio