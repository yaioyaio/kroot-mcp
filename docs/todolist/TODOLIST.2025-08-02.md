# DevFlow Monitor MCP - TODO List (2025-08-02)

## 개요
이 문서는 DevFlow Monitor MCP 프로젝트의 개발 우선순위에 따른 구체적인 작업 목록입니다. TASKS.md, PLANNING.md, PRD.md, CLAUDE.md를 기반으로 작성되었습니다.

## 개발 단계별 우선순위

### 🔴 즉시 시작 (Week 1-2) - 마일스톤 1: MVP 기반 구축

#### 1. 프로젝트 초기화 및 설정 ✅ (완료: 2025-08-02)
- [x] **[HIGH]** Node.js 20+ LTS 환경 확인 ✓ (v20.19.1)
- [x] **[HIGH]** TypeScript 5.3+ 프로젝트 초기화 ✓ (v5.9.2)
  ```bash
  npm init -y
  npm install -D typescript@^5.3.0 @types/node@^20.0.0
  npx tsc --init
  ```
- [x] **[HIGH]** 기본 프로젝트 구조 생성 ✓
  ```
  mkdir -p src/{server,monitors,events,analyzers,storage,tools,dashboard}
  mkdir -p tests docs config
  ```
- [x] **[HIGH]** Git 저장소 초기화 및 .gitignore 설정 ✓
- [x] **[HIGH]** ESLint, Prettier 설정 ✓
  ```bash
  npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
  npm install -D prettier eslint-config-prettier eslint-plugin-prettier
  ```
- [x] **[추가]** 운영 가이드 문서 작성 ✓ (docs/operations/)
- [x] **[추가]** 검증 스크립트 작성 ✓ (scripts/verify.sh)

#### 2. MCP 서버 기본 구현
- [ ] **[CRITICAL]** MCP SDK 0.6+ 설치
  ```bash
  npm install @modelcontextprotocol/sdk@^0.6.0
  ```
- [ ] **[CRITICAL]** MCP 서버 엔트리포인트 구현 (`src/server/index.ts`)
- [ ] **[CRITICAL]** 서버 설정 관리 (`src/server/config.ts`)
- [ ] **[HIGH]** 기본 도구 등록 시스템 구현
- [ ] **[HIGH]** Claude Desktop 연동 테스트

#### 3. 이벤트 시스템 구축
- [ ] **[HIGH]** EventEmitter3 설치 및 설정
  ```bash
  npm install eventemitter3 @types/eventemitter3
  ```
- [ ] **[HIGH]** 이벤트 타입 정의 (`src/events/types/`)
  - [ ] base.ts - 기본 이벤트 인터페이스
  - [ ] file.ts - 파일 시스템 이벤트
  - [ ] git.ts - Git 활동 이벤트
- [ ] **[HIGH]** EventEngine 클래스 구현
- [ ] **[MEDIUM]** 이벤트 검증 로직 구현

#### 4. 파일 시스템 모니터링
- [ ] **[HIGH]** chokidar 설치
  ```bash
  npm install chokidar @types/chokidar
  ```
- [ ] **[HIGH]** BaseMonitor 추상 클래스 구현
- [ ] **[HIGH]** FileMonitor 클래스 구현
- [ ] **[HIGH]** 파일 필터링 패턴 구현
  - [ ] ignore 패턴 (node_modules, build 등)
  - [ ] 중요 확장자 필터 (.ts, .tsx, .js, .jsx 등)
- [ ] **[MEDIUM]** 파일 변경 컨텍스트 분석 로직

#### 5. 데이터 저장소 구현
- [ ] **[HIGH]** better-sqlite3 설치
  ```bash
  npm install better-sqlite3 @types/better-sqlite3
  ```
- [ ] **[HIGH]** 데이터베이스 스키마 설계
  ```sql
  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    data TEXT NOT NULL,
    sync_id TEXT,
    sync_status TEXT DEFAULT 'pending',
    device_id TEXT,
    user_id TEXT
  );
  ```
- [ ] **[HIGH]** Repository 패턴 구현
- [ ] **[MEDIUM]** 마이그레이션 시스템 구현

### 🟡 다음 단계 (Week 3-5) - 마일스톤 2: 핵심 통합 구현

#### 6. Git 통합
- [ ] **[HIGH]** simple-git 설치
  ```bash
  npm install simple-git @types/simple-git
  ```
- [ ] **[HIGH]** GitMonitor 클래스 구현
- [ ] **[HIGH]** Git 이벤트 감지 (commit, branch, merge)
- [ ] **[MEDIUM]** 브랜치 패턴 분석
- [ ] **[MEDIUM]** 커밋 메시지 분석 (Conventional Commits)

#### 7. MCP 도구 API 구현
- [ ] **[HIGH]** getProjectStatus 도구
- [ ] **[HIGH]** getMetrics 도구
- [ ] **[HIGH]** getActivityLog 도구
- [ ] **[MEDIUM]** analyzeBottlenecks 도구
- [ ] **[LOW]** generateReport 도구

#### 8. 외부 API 통합 (선택적)
- [ ] **[MEDIUM]** axios 설치 및 API 클라이언트 베이스
- [ ] **[LOW]** Jira API 통합
- [ ] **[LOW]** Notion API 통합
- [ ] **[LOW]** Figma API 통합

### 🟢 중기 목표 (Week 6-8) - 마일스톤 3: 지능형 모니터링

#### 9. 개발 단계 인식 시스템
- [ ] **[HIGH]** StageAnalyzer 클래스 구현
- [ ] **[HIGH]** 13단계 프로세스 감지 규칙
- [ ] **[MEDIUM]** 다중 단계 처리 로직
- [ ] **[MEDIUM]** 신뢰도 계산 알고리즘

#### 10. 방법론 모니터링
- [ ] **[MEDIUM]** DDD 패턴 추적
- [ ] **[MEDIUM]** TDD 사이클 감지
- [ ] **[LOW]** BDD 시나리오 추적
- [ ] **[LOW]** EDA 패턴 인식

#### 11. CLI/TUI 대시보드
- [ ] **[HIGH]** 대시보드 프레임워크 선택 (blessed/ink)
- [ ] **[HIGH]** 기본 레이아웃 구현
- [ ] **[MEDIUM]** 실시간 활동 피드
- [ ] **[MEDIUM]** 메트릭 시각화
- [ ] **[LOW]** 인터랙티브 기능

### 🔵 장기 목표 (Week 9-12) - 마일스톤 4&5: 프로덕션 및 확장

#### 12. 테스트 및 품질
- [ ] **[HIGH]** Vitest 설정
- [ ] **[HIGH]** 단위 테스트 작성 (70% 커버리지)
- [ ] **[MEDIUM]** 통합 테스트
- [ ] **[LOW]** E2E 테스트

#### 13. 문서화
- [ ] **[HIGH]** API 문서 작성
- [ ] **[HIGH]** 설치 가이드
- [ ] **[MEDIUM]** 사용자 매뉴얼
- [ ] **[LOW]** 개발자 가이드

#### 14. 원격 통합 (선택적)
- [ ] **[LOW]** 동기화 클라이언트 구현
- [ ] **[LOW]** 중앙 서버 API 개발
- [ ] **[LOW]** WebSocket 실시간 통신

## 오늘의 구체적인 작업 (2025-08-02)

### 🎯 목표: 프로젝트 기초 설정 완료

1. **[09:00-10:00]** 개발 환경 설정
   - [ ] Node.js 20+ 설치 확인
   - [ ] VS Code 확장 프로그램 설치
   - [ ] Git 설정

2. **[10:00-12:00]** 프로젝트 초기화
   - [ ] package.json 생성
   - [ ] TypeScript 설정
   - [ ] 프로젝트 구조 생성
   - [ ] 개발 도구 설정 (ESLint, Prettier)

3. **[13:00-15:00]** MCP 서버 기본 구현
   - [ ] MCP SDK 설치
   - [ ] 서버 엔트리포인트 작성
   - [ ] 기본 설정 파일 작성

4. **[15:00-17:00]** 이벤트 시스템 기초
   - [ ] EventEmitter3 설치
   - [ ] 기본 이벤트 타입 정의
   - [ ] EventEngine 뼈대 구현

5. **[17:00-18:00]** 테스트 및 검증
   - [ ] MCP 서버 실행 테스트
   - [ ] Claude Desktop 연동 확인
   - [ ] 기본 도구 응답 테스트

## 주의사항

1. **우선순위 기준**
   - CRITICAL: 다른 작업의 전제조건
   - HIGH: 핵심 기능 구현
   - MEDIUM: 중요하지만 나중에 가능
   - LOW: 선택적 기능

2. **의존성 관계**
   - MCP 서버 → 이벤트 시스템 → 모니터 구현
   - 데이터 저장소 → 모든 데이터 관련 기능
   - 기본 모니터링 → 고급 분석 기능

3. **리스크 관리**
   - MCP SDK 버전 호환성 주의
   - TypeScript strict 모드 사용
   - 테스트 주도 개발 권장

---

작성일: 2025-08-02  
최종 수정일: 2025-08-02  
작성자: yaioyaio  
진행 상황: 마일스톤 1 - 프로젝트 초기화 완료 (15개 파일 생성, Git 커밋 완료)