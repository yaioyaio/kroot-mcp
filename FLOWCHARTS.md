# DevFlow Monitor MCP - 시스템 플로우차트

## 목차
1. [전체 시스템 아키텍처 플로우](#1-전체-시스템-아키텍처-플로우)
2. [데이터 처리 파이프라인](#2-데이터-처리-파이프라인)
3. [파일 모니터링 플로우](#3-파일-모니터링-플로우)
4. [Git 활동 추적 플로우](#4-git-활동-추적-플로우)
5. [개발 단계 인식 플로우](#5-개발-단계-인식-플로우)
6. [AI 협업 추적 플로우](#6-ai-협업-추적-플로우)
7. [방법론 모니터링 플로우](#7-방법론-모니터링-플로우)
8. [병목 감지 플로우](#8-병목-감지-플로우)
9. [MCP 도구 처리 플로우](#9-mcp-도구-처리-플로우)
10. [시나리오: 새 기능 개발](#10-시나리오-새-기능-개발)
11. [시나리오: 버그 수정](#11-시나리오-버그-수정)
12. [시나리오: 코드 리뷰](#12-시나리오-코드-리뷰)

## 1. 전체 시스템 아키텍처 플로우

```mermaid
graph TB
    subgraph "개발 환경"
        IDE[IDE/Editor]
        FS[파일 시스템]
        GIT[Git Repository]
        AI[AI 도구들]
    end
    
    subgraph "MCP Server"
        subgraph "모니터들"
            FM[파일 모니터]
            GM[Git 모니터]
            TM[테스트 모니터]
            AM[AI 모니터]
        end
        
        subgraph "이벤트 처리"
            EE[이벤트 엔진]
            EQ[이벤트 큐]
            EP[이벤트 프로세서]
        end
        
        subgraph "분석 엔진"
            SA[단계 분석기]
            MA[방법론 분석기]
            BA[병목 분석기]
        end
        
        subgraph "저장소"
            SQL[(SQLite)]
            REDIS[(Redis)]
        end
    end
    
    subgraph "출력"
        API[MCP API]
        CLI[CLI/TUI]
        REPORT[리포트]
    end
    
    %% 연결
    IDE --> FM
    FS --> FM
    GIT --> GM
    AI --> AM
    
    FM --> EE
    GM --> EE
    TM --> EE
    AM --> EE
    
    EE --> EQ
    EQ --> EP
    
    EP --> SA
    EP --> MA
    EP --> BA
    
    EP --> SQL
    EP --> REDIS
    
    SQL --> API
    REDIS --> API
    
    API --> CLI
    API --> REPORT
    
    style MCP Server fill:#f9f,stroke:#333,stroke-width:4px
```

## 2. 데이터 처리 파이프라인

```mermaid
graph LR
    subgraph "입력 단계"
        E1[파일 변경 이벤트]
        E2[Git 이벤트]
        E3[테스트 결과]
        E4[AI 상호작용]
    end
    
    subgraph "수집 단계"
        C[이벤트 수집기]
        V[검증기]
        F[필터]
    end
    
    subgraph "처리 단계"
        T[변환기]
        EN[보강기]
        AG[집계기]
    end
    
    subgraph "저장 단계"
        PS[영구 저장<br/>SQLite]
        CS[캐시 저장<br/>Redis]
        QS[큐 저장<br/>Redis]
    end
    
    subgraph "분석 단계"
        RT[실시간 분석]
        BA[배치 분석]
        PR[예측 분석]
    end
    
    subgraph "출력 단계"
        API[API 응답]
        ALERT[알림]
        DASH[대시보드]
    end
    
    E1 --> C
    E2 --> C
    E3 --> C
    E4 --> C
    
    C --> V
    V --> F
    F --> T
    T --> EN
    EN --> AG
    
    AG --> PS
    AG --> CS
    AG --> QS
    
    CS --> RT
    PS --> BA
    BA --> PR
    
    RT --> API
    RT --> ALERT
    RT --> DASH
    BA --> API
    PR --> API
```

## 3. 파일 모니터링 플로우

```mermaid
flowchart TD
    START[파일 시스템 감시 시작]
    
    WATCH[chokidar 파일 감시]
    EVENT{파일 이벤트<br/>발생?}
    
    TYPE{이벤트<br/>타입?}
    ADD[파일 추가]
    CHANGE[파일 변경]
    DELETE[파일 삭제]
    
    FILTER{무시 패턴<br/>확인}
    IGNORE[이벤트 무시]
    
    CONTEXT[컨텍스트 분석]
    STAGE[개발 단계 매핑]
    
    CREATE[이벤트 객체 생성]
    EMIT[이벤트 발행]
    
    START --> WATCH
    WATCH --> EVENT
    EVENT -->|Yes| TYPE
    EVENT -->|No| WATCH
    
    TYPE -->|add| ADD
    TYPE -->|change| CHANGE
    TYPE -->|unlink| DELETE
    
    ADD --> FILTER
    CHANGE --> FILTER
    DELETE --> FILTER
    
    FILTER -->|Match| IGNORE
    FILTER -->|No Match| CONTEXT
    
    IGNORE --> WATCH
    
    CONTEXT --> STAGE
    STAGE --> CREATE
    CREATE --> EMIT
    EMIT --> WATCH
    
    style START fill:#90EE90
    style EMIT fill:#FFB6C1
```

## 4. Git 활동 추적 플로우

```mermaid
flowchart TD
    START[Git 모니터링 시작]
    
    subgraph "Git 감지"
        POLL[Git 상태 폴링]
        HOOK[Git Hook 트리거]
    end
    
    DETECT{변경사항<br/>감지?}
    
    subgraph "Git 이벤트 타입"
        COMMIT[Commit 감지]
        BRANCH[Branch 변경]
        MERGE[Merge 발생]
        PR[PR 생성/업데이트]
    end
    
    ANALYZE[변경 분석]
    FILES[파일 변경 목록]
    STATS[통계 계산]
    
    MESSAGE[커밋 메시지 분석]
    PATTERN{패턴<br/>매칭}
    
    CONVENTIONAL[Conventional<br/>Commit]
    CUSTOM[커스텀 패턴]
    
    BUILD[Git 이벤트 생성]
    STORE[이벤트 저장]
    NOTIFY[알림 발송]
    
    START --> POLL
    START --> HOOK
    POLL --> DETECT
    HOOK --> DETECT
    
    DETECT -->|Yes| COMMIT
    DETECT -->|Yes| BRANCH
    DETECT -->|Yes| MERGE
    DETECT -->|Yes| PR
    DETECT -->|No| POLL
    
    COMMIT --> ANALYZE
    BRANCH --> ANALYZE
    MERGE --> ANALYZE
    PR --> ANALYZE
    
    ANALYZE --> FILES
    ANALYZE --> STATS
    FILES --> MESSAGE
    STATS --> MESSAGE
    
    MESSAGE --> PATTERN
    PATTERN --> CONVENTIONAL
    PATTERN --> CUSTOM
    
    CONVENTIONAL --> BUILD
    CUSTOM --> BUILD
    
    BUILD --> STORE
    STORE --> NOTIFY
    NOTIFY --> POLL
```

## 5. 개발 단계 인식 플로우

```mermaid
flowchart TD
    START[단계 인식 시작]
    
    subgraph "입력 수집"
        FILE[파일 이벤트]
        GIT[Git 이벤트]
        TEST[테스트 결과]
        AI[AI 활동]
    end
    
    COLLECT[이벤트 수집]
    WINDOW[시간 윈도우<br/>5분]
    
    subgraph "패턴 분석"
        P1[PRD 패턴<br/>*.prd.md]
        P2[기획 패턴<br/>planning/*]
        P3[ERD 패턴<br/>*.sql, schema.*]
        P4[코딩 패턴<br/>*.ts, *.tsx]
        P5[테스트 패턴<br/>*.test.*]
    end
    
    CALC[신뢰도 계산]
    WEIGHT[가중치 적용]
    
    COMPARE{최고<br/>신뢰도?}
    
    CURRENT[현재 단계 결정]
    UPDATE[단계 업데이트]
    
    TRANSITION{단계<br/>전환?}
    EVENT[전환 이벤트]
    METRIC[메트릭 기록]
    
    START --> FILE
    START --> GIT
    START --> TEST
    START --> AI
    
    FILE --> COLLECT
    GIT --> COLLECT
    TEST --> COLLECT
    AI --> COLLECT
    
    COLLECT --> WINDOW
    WINDOW --> P1
    WINDOW --> P2
    WINDOW --> P3
    WINDOW --> P4
    WINDOW --> P5
    
    P1 --> CALC
    P2 --> CALC
    P3 --> CALC
    P4 --> CALC
    P5 --> CALC
    
    CALC --> WEIGHT
    WEIGHT --> COMPARE
    COMPARE --> CURRENT
    CURRENT --> UPDATE
    
    UPDATE --> TRANSITION
    TRANSITION -->|Yes| EVENT
    TRANSITION -->|No| START
    EVENT --> METRIC
    METRIC --> START
```

## 6. AI 협업 추적 플로우

```mermaid
flowchart TD
    START[AI 추적 시작]
    
    subgraph "AI 도구 감지"
        CLAUDE[Claude MCP]
        COPILOT[GitHub Copilot]
        CHATGPT[ChatGPT API]
    end
    
    INTERCEPT[요청 가로채기]
    
    subgraph "요청 분석"
        PROMPT[프롬프트 추출]
        CONTEXT[컨텍스트 수집]
        FILE[현재 파일]
        FUNC[현재 함수]
    end
    
    SEND[AI 요청 전송]
    RESPONSE[응답 수신]
    
    subgraph "응답 분석"
        CODE{코드<br/>포함?}
        EXTRACT[코드 블록 추출]
        PURPOSE[용도 분류]
    end
    
    TRACK[사용자 액션 추적]
    
    ACTION{사용자<br/>액션?}
    ACCEPT[수락됨]
    MODIFY[수정됨]
    REJECT[거부됨]
    
    CALC[효과성 계산]
    
    subgraph "메트릭 계산"
        TIME[응답 시간]
        RATE[수락률]
        IMPACT[코드 영향도]
    end
    
    STORE[상호작용 저장]
    AGGREGATE[패턴 집계]
    
    START --> CLAUDE
    START --> COPILOT
    START --> CHATGPT
    
    CLAUDE --> INTERCEPT
    COPILOT --> INTERCEPT
    CHATGPT --> INTERCEPT
    
    INTERCEPT --> PROMPT
    INTERCEPT --> CONTEXT
    CONTEXT --> FILE
    CONTEXT --> FUNC
    
    PROMPT --> SEND
    FILE --> SEND
    FUNC --> SEND
    
    SEND --> RESPONSE
    RESPONSE --> CODE
    
    CODE -->|Yes| EXTRACT
    CODE -->|No| TRACK
    EXTRACT --> PURPOSE
    PURPOSE --> TRACK
    
    TRACK --> ACTION
    ACTION --> ACCEPT
    ACTION --> MODIFY
    ACTION --> REJECT
    
    ACCEPT --> CALC
    MODIFY --> CALC
    REJECT --> CALC
    
    CALC --> TIME
    CALC --> RATE
    CALC --> IMPACT
    
    TIME --> STORE
    RATE --> STORE
    IMPACT --> STORE
    
    STORE --> AGGREGATE
    AGGREGATE --> START
```

## 7. 방법론 모니터링 플로우

```mermaid
flowchart TD
    START[방법론 모니터링 시작]
    
    subgraph "코드 변경 감지"
        CREATE[파일 생성]
        MODIFY[파일 수정]
        TEST[테스트 실행]
    end
    
    ANALYZE[코드 분석]
    
    subgraph "DDD 검사"
        DDD_E[Entity 패턴]
        DDD_V[ValueObject 패턴]
        DDD_R[Repository 패턴]
        DDD_B[Bounded Context]
    end
    
    subgraph "TDD 검사"
        TDD_T{테스트<br/>먼저?}
        TDD_R[Red 단계]
        TDD_G[Green 단계]
        TDD_RF[Refactor 단계]
    end
    
    subgraph "BDD 검사"
        BDD_F[Feature 파일]
        BDD_S[시나리오]
        BDD_GWT[Given-When-Then]
    end
    
    subgraph "EDA 검사"
        EDA_E[이벤트 정의]
        EDA_H[핸들러 구현]
        EDA_S[Saga 패턴]
    end
    
    SCORE[준수 점수 계산]
    VIOLATION{위반<br/>발견?}
    
    REPORT[준수 리포트]
    SUGGEST[개선 제안]
    ALERT[위반 알림]
    
    START --> CREATE
    START --> MODIFY
    START --> TEST
    
    CREATE --> ANALYZE
    MODIFY --> ANALYZE
    TEST --> ANALYZE
    
    ANALYZE --> DDD_E
    ANALYZE --> TDD_T
    ANALYZE --> BDD_F
    ANALYZE --> EDA_E
    
    DDD_E --> DDD_V
    DDD_V --> DDD_R
    DDD_R --> DDD_B
    
    TDD_T -->|Yes| TDD_R
    TDD_T -->|No| VIOLATION
    TDD_R --> TDD_G
    TDD_G --> TDD_RF
    
    BDD_F --> BDD_S
    BDD_S --> BDD_GWT
    
    EDA_E --> EDA_H
    EDA_H --> EDA_S
    
    DDD_B --> SCORE
    TDD_RF --> SCORE
    BDD_GWT --> SCORE
    EDA_S --> SCORE
    
    SCORE --> VIOLATION
    VIOLATION -->|Yes| ALERT
    VIOLATION -->|No| REPORT
    ALERT --> SUGGEST
    
    REPORT --> START
    SUGGEST --> START
```

## 8. 병목 감지 플로우

```mermaid
flowchart TD
    START[병목 감지 시작]
    
    subgraph "메트릭 수집"
        M1[파일 수정 빈도]
        M2[테스트 실패율]
        M3[PR 대기 시간]
        M4[빌드 시간]
        M5[코드 복잡도]
    end
    
    COLLECT[메트릭 집계]
    WINDOW[시간 윈도우 분석]
    
    subgraph "임계값 체크"
        T1{파일 수정<br/>> 10회/일?}
        T2{테스트 실패<br/>> 3회 연속?}
        T3{PR 대기<br/>> 3일?}
        T4{빌드 시간<br/>> 30분?}
        T5{복잡도<br/>> 20?}
    end
    
    subgraph "병목 타입"
        B1[핫스팟 파일]
        B2[불안정 테스트]
        B3[리뷰 지연]
        B4[빌드 성능]
        B5[복잡한 코드]
    end
    
    SEVERITY[심각도 계산]
    
    SEV{심각도}
    LOW[낮음]
    MED[중간]
    HIGH[높음]
    CRIT[치명적]
    
    subgraph "대응 액션"
        A1[개발자 알림]
        A2[팀 알림]
        A3[자동 리포트]
        A4[긴급 알림]
    end
    
    SUGGEST[개선 제안 생성]
    TRACK[추적 시작]
    
    START --> M1
    START --> M2
    START --> M3
    START --> M4
    START --> M5
    
    M1 --> COLLECT
    M2 --> COLLECT
    M3 --> COLLECT
    M4 --> COLLECT
    M5 --> COLLECT
    
    COLLECT --> WINDOW
    
    WINDOW --> T1
    WINDOW --> T2
    WINDOW --> T3
    WINDOW --> T4
    WINDOW --> T5
    
    T1 -->|Yes| B1
    T2 -->|Yes| B2
    T3 -->|Yes| B3
    T4 -->|Yes| B4
    T5 -->|Yes| B5
    
    B1 --> SEVERITY
    B2 --> SEVERITY
    B3 --> SEVERITY
    B4 --> SEVERITY
    B5 --> SEVERITY
    
    SEVERITY --> SEV
    
    SEV --> LOW
    SEV --> MED
    SEV --> HIGH
    SEV --> CRIT
    
    LOW --> A1
    MED --> A2
    HIGH --> A3
    CRIT --> A4
    
    A1 --> SUGGEST
    A2 --> SUGGEST
    A3 --> SUGGEST
    A4 --> SUGGEST
    
    SUGGEST --> TRACK
    TRACK --> START
```

## 9. MCP 도구 처리 플로우

```mermaid
flowchart TD
    START[MCP 도구 호출]
    
    subgraph "도구 라우팅"
        TOOL{도구 타입?}
        GET[조회 도구]
        ANALYZE[분석 도구]
        REPORT[리포트 도구]
    end
    
    subgraph "파라미터 검증"
        VALIDATE[파라미터 검증]
        ERROR1{유효한가?}
        REJECT[요청 거부]
    end
    
    subgraph "데이터 소스"
        CACHE{캐시<br/>확인}
        REDIS[(Redis)]
        SQLITE[(SQLite)]
    end
    
    subgraph "처리 로직"
        QUERY[쿼리 실행]
        TRANSFORM[데이터 변환]
        AGGREGATE[집계 처리]
    end
    
    subgraph "응답 포맷"
        FORMAT{포맷<br/>타입?}
        JSON[JSON 포맷]
        MD[Markdown 포맷]
        CSV[CSV 포맷]
    end
    
    RESPONSE[응답 반환]
    UPDATE[캐시 업데이트]
    
    START --> TOOL
    
    TOOL --> GET
    TOOL --> ANALYZE
    TOOL --> REPORT
    
    GET --> VALIDATE
    ANALYZE --> VALIDATE
    REPORT --> VALIDATE
    
    VALIDATE --> ERROR1
    ERROR1 -->|No| REJECT
    ERROR1 -->|Yes| CACHE
    
    CACHE -->|Hit| TRANSFORM
    CACHE -->|Miss| SQLITE
    
    SQLITE --> QUERY
    QUERY --> AGGREGATE
    AGGREGATE --> TRANSFORM
    
    TRANSFORM --> FORMAT
    
    FORMAT --> JSON
    FORMAT --> MD
    FORMAT --> CSV
    
    JSON --> RESPONSE
    MD --> RESPONSE
    CSV --> RESPONSE
    
    RESPONSE --> UPDATE
    UPDATE --> REDIS
```

## 10. 시나리오: 새 기능 개발

```mermaid
sequenceDiagram
    participant DEV as 개발자
    participant GIT as Git
    participant FM as 파일 모니터
    participant GM as Git 모니터
    participant SA as 단계 분석기
    participant MA as 방법론 분석기
    participant DB as 데이터베이스
    participant DASH as 대시보드
    
    DEV->>GIT: feature/login 브랜치 생성
    GIT->>GM: 브랜치 생성 이벤트
    GM->>SA: 새 기능 개발 시작
    SA->>DB: 단계 = "코딩" 설정
    
    DEV->>DEV: login.test.ts 생성
    DEV->>FM: 파일 생성 감지
    FM->>MA: TDD 패턴 확인
    MA->>DB: TDD Red 단계 기록
    
    DEV->>DEV: login.service.ts 생성
    DEV->>FM: 파일 생성 감지
    FM->>MA: 구현 시작
    MA->>DB: TDD Green 단계 기록
    
    DEV->>DEV: 테스트 실행
    DEV->>DB: 테스트 통과 기록
    
    DEV->>GIT: 커밋: "feat: Add login service"
    GIT->>GM: 커밋 이벤트
    GM->>DB: 진행 상황 업데이트
    
    DB->>DASH: 실시간 업데이트
    DASH->>DEV: 진행률 80% 표시
```

## 11. 시나리오: 버그 수정

```mermaid
sequenceDiagram
    participant USER as 사용자
    participant TEST as 테스트 러너
    participant TM as 테스트 모니터
    participant BA as 병목 분석기
    participant DEV as 개발자
    participant AI as Claude
    participant FM as 파일 모니터
    participant DB as 데이터베이스
    
    USER->>TEST: 테스트 실행
    TEST->>TM: 테스트 실패
    TM->>BA: 연속 실패 감지
    BA->>DB: 병목 현상 기록
    BA->>DEV: 알림: "user.service.test 연속 3회 실패"
    
    DEV->>FM: user.service.ts 열기
    FM->>BA: 핫스팟 감지 (15회 수정/2시간)
    BA->>DEV: 경고: "파일이 너무 자주 수정됨"
    
    DEV->>AI: "이 테스트가 왜 실패하는지 분석해줘"
    AI->>DEV: 문제 분석 및 해결 방안 제시
    
    DEV->>FM: 코드 수정
    FM->>DB: 수정 이벤트 기록
    
    loop 수정 시도
        DEV->>TEST: 테스트 재실행
        TEST->>TM: 결과 확인
    end
    
    TEST->>TM: 테스트 통과
    TM->>BA: 병목 해결
    BA->>DB: 해결 시간 기록
    DB->>DEV: 성공 알림
```

## 12. 시나리오: 코드 리뷰

```mermaid
sequenceDiagram
    participant DEV as 개발자
    participant GIT as GitHub
    participant GM as Git 모니터
    participant BA as 병목 분석기
    participant REV as 리뷰어
    participant MA as 방법론 분석기
    participant DB as 데이터베이스
    participant DASH as 대시보드
    
    DEV->>GIT: PR #123 생성
    GIT->>GM: PR 생성 이벤트
    GM->>DB: PR 정보 저장
    GM->>REV: 리뷰 요청 알림
    
    Note over BA: 3일 후...
    
    BA->>BA: PR 대기 시간 체크
    BA->>DB: 병목 감지: "PR 3일 이상 대기"
    BA->>REV: 긴급 리뷰 요청
    BA->>DASH: 병목 현황 표시
    
    REV->>GIT: 코드 리뷰 시작
    GIT->>GM: 리뷰 시작 이벤트
    
    REV->>GIT: 코멘트: "DDD 패턴 위반"
    GIT->>GM: 코멘트 이벤트
    GM->>MA: 방법론 위반 기록
    
    DEV->>GIT: 코드 수정 푸시
    GIT->>GM: 업데이트 이벤트
    
    REV->>GIT: 승인
    GIT->>GM: 승인 이벤트
    
    DEV->>GIT: PR 머지
    GIT->>GM: 머지 이벤트
    GM->>DB: 리뷰 시간: 3.5일 기록
    DB->>DASH: 메트릭 업데이트
```

## 사용 가이드

### 플로우차트 읽는 방법

1. **도형 의미**
   - 사각형: 프로세스/액션
   - 마름모: 의사결정
   - 원통: 데이터 저장소
   - 평행사변형: 입출력

2. **화살표 의미**
   - 실선: 주요 흐름
   - 점선: 선택적 흐름
   - 굵은 선: 중요 경로

3. **색상 코딩**
   - 초록색: 시작점
   - 분홍색: 종료점
   - 노란색: 중요 프로세스

### 구현 시 참고사항

1. 각 플로우차트는 FEATURES.md의 상세 스펙과 연결됨
2. 시퀀스 다이어그램은 실제 구현 순서를 나타냄
3. 병목 지점은 특별히 모니터링 필요

이 플로우차트들은 시스템의 전체적인 동작을 이해하고 구현 시 참조하는 핵심 가이드입니다.

---

작성일: 2025-08-02  
최종 수정일: 2025-01-03  
작성자: yaioyaio