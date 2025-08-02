# DevFlow Monitor MCP - 상세 기능 명세서

## 목차
1. [개요](#1-개요)
2. [파일 시스템 모니터링](#2-파일-시스템-모니터링)
3. [Git 활동 추적](#3-git-활동-추적)
4. [개발 단계 자동 인식](#4-개발-단계-자동-인식)
5. [AI 협업 추적](#5-ai-협업-추적)
6. [개발 방법론 모니터링](#6-개발-방법론-모니터링)
7. [실시간 메트릭 수집](#7-실시간-메트릭-수집)
8. [병목 현상 감지](#8-병목-현상-감지)
9. [MCP 도구 API](#9-mcp-도구-api)
10. [CLI/TUI 대시보드](#10-clitui-대시보드)
11. [데이터 모델](#11-데이터-모델)
12. [이벤트 흐름 시나리오](#12-이벤트-흐름-시나리오)

## 1. 개요

DevFlow Monitor MCP는 개발자의 로컬 환경에서 실행되는 MCP 서버로, 프로젝트의 모든 개발 활동을 자동으로 감지하고 추적합니다. 이 문서는 AI 협업 시 정확한 구현을 위한 상세 기능 명세를 제공합니다.

> 📌 **시스템의 동작 흐름을 시각적으로 이해하려면 [FLOWCHARTS.md](./FLOWCHARTS.md)를 참조하세요.**

### 1.1 핵심 원칙
- **Zero Configuration**: 추가 설정 없이 자동 감지
- **Non-Intrusive**: 개발 워크플로우 방해 없음
- **Real-time**: 모든 활동 실시간 추적
- **Intelligent**: 컨텍스트 기반 스마트 분석

## 2. 파일 시스템 모니터링

### 2.1 감지 대상
```typescript
interface FileSystemEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  timestamp: Date;
  stats: {
    size: number;
    extension: string;
    directory: string;
  };
  context?: {
    relatedFiles: string[];  // 같이 변경된 파일들
    gitBranch: string;
    developmentStage: string;
  };
}
```

### 2.2 지능형 필터링
```typescript
class FileWatcher {
  private ignorePatterns = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.log',
    '**/.DS_Store'
  ];
  
  private significantExtensions = [
    '.ts', '.tsx', '.js', '.jsx',  // 코드
    '.md', '.mdx',                  // 문서
    '.sql', '.prisma',              // 데이터베이스
    '.test.ts', '.spec.ts',         // 테스트
    '.json', '.yaml', '.yml'        // 설정
  ];
}
```

### 2.3 컨텍스트 분석
시스템은 파일 변경의 컨텍스트를 분석하여 의미 있는 정보를 추출합니다:
- **컴포넌트 생성**: `components/` 디렉토리에 새 파일 → "새 UI 컴포넌트 개발"
- **API 엔드포인트**: `api/` 또는 `routes/` 변경 → "백엔드 API 수정"
- **테스트 추가**: `*.test.ts` 생성 → "테스트 커버리지 향상"

## 3. Git 활동 추적

### 3.1 Git 이벤트 타입
```typescript
interface GitEvent {
  type: 'commit' | 'branch' | 'merge' | 'pull_request' | 'tag';
  timestamp: Date;
  author: string;
  data: {
    branch?: string;
    hash?: string;
    message?: string;
    files?: GitFileChange[];
    stats?: {
      additions: number;
      deletions: number;
      filesChanged: number;
    };
  };
}

interface GitFileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}
```

### 3.2 자동 감지 항목
- **브랜치 패턴 분석**:
  - `feature/*` → 새 기능 개발
  - `bugfix/*` → 버그 수정
  - `hotfix/*` → 긴급 수정
  - `refactor/*` → 코드 개선
- **커밋 메시지 분석**:
  - Conventional Commits 감지
  - 작업 유형 자동 분류
  - 관련 이슈 번호 추출

## 4. 개발 단계 자동 인식

### 4.1 단계 감지 규칙
```typescript
interface StageDetectionRule {
  stage: DevelopmentStage;
  patterns: {
    files?: string[];
    directories?: string[];
    activities?: string[];
  };
  confidence: number;  // 0-100
}

const detectionRules: StageDetectionRule[] = [
  {
    stage: 'PRD',
    patterns: {
      files: ['**/PRD.md', '**/requirements.md', '**/specs/*.md'],
      activities: ['문서 작성', '요구사항 정의']
    },
    confidence: 90
  },
  {
    stage: 'ERD',
    patterns: {
      files: ['**/*.sql', '**/*.prisma', '**/schema.*', '**/migrations/*'],
      activities: ['데이터베이스 설계', '스키마 정의']
    },
    confidence: 85
  },
  {
    stage: 'Coding',
    patterns: {
      files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      directories: ['src/', 'components/', 'pages/'],
      activities: ['구현', '개발', '코딩']
    },
    confidence: 95
  }
];
```

### 4.2 다중 단계 처리
여러 단계가 동시에 진행될 수 있으므로, 시스템은 가중치 기반으로 주요 단계를 결정합니다:
```typescript
interface StageWeight {
  stage: string;
  weight: number;
  recentActivity: Date;
}
```

## 5. AI 협업 추적

### 5.1 AI 상호작용 모델
```typescript
interface AIInteraction {
  id: string;
  timestamp: Date;
  tool: 'Claude' | 'GitHub Copilot' | 'ChatGPT' | string;
  type: 'prompt' | 'completion' | 'edit_suggestion';
  context: {
    currentFile?: string;
    currentFunction?: string;
    developmentStage: string;
  };
  prompt?: string;
  response?: {
    content: string;
    codeBlocks?: CodeBlock[];
  };
  applied: boolean;
  effectiveness?: {
    accepted: boolean;
    modified: boolean;
    timeToAccept?: number;
  };
}

interface CodeBlock {
  language: string;
  content: string;
  lines: number;
  purpose: 'new' | 'replacement' | 'refactor';
}
```

### 5.2 AI 사용 패턴 분석
```typescript
class AIUsageAnalyzer {
  analyzePatterns(interactions: AIInteraction[]) {
    return {
      // 도구별 사용 빈도
      toolFrequency: this.calculateToolFrequency(interactions),
      
      // 용도별 분류
      usageByPurpose: {
        codeGeneration: this.filterByPurpose(interactions, 'generation'),
        debugging: this.filterByPurpose(interactions, 'debugging'),
        refactoring: this.filterByPurpose(interactions, 'refactoring'),
        documentation: this.filterByPurpose(interactions, 'documentation')
      },
      
      // 효과성 메트릭
      effectiveness: {
        acceptanceRate: this.calculateAcceptanceRate(interactions),
        averageTimeToAccept: this.calculateAverageTimeToAccept(interactions),
        modificationRate: this.calculateModificationRate(interactions)
      },
      
      // 시간대별 사용 패턴
      temporalPatterns: this.analyzeTemporalPatterns(interactions)
    };
  }
}
```

## 6. 개발 방법론 모니터링

### 6.1 DDD (Domain-Driven Design) 추적
```typescript
interface DDDMetrics {
  entities: string[];
  valueObjects: string[];
  aggregates: string[];
  repositories: string[];
  services: string[];
  boundedContexts: Map<string, string[]>;
  ubiquitousLanguage: Set<string>;
  
  violations?: {
    type: 'boundary_leak' | 'missing_repository' | 'anemic_domain';
    location: string;
    severity: 'low' | 'medium' | 'high';
  }[];
}
```

### 6.2 TDD (Test-Driven Development) 추적
```typescript
interface TDDCycle {
  testFile: string;
  implementationFile: string;
  cycle: {
    redPhase: {
      testCreated: Date;
      testFailing: boolean;
    };
    greenPhase: {
      implementationStarted: Date;
      testsPassing: Date;
    };
    refactorPhase?: {
      refactoringStarted: Date;
      refactoringCompleted: Date;
      testsStillPassing: boolean;
    };
  };
}
```

### 6.3 BDD (Behavior-Driven Development) 추적
```typescript
interface BDDScenario {
  feature: string;
  scenario: string;
  steps: {
    given: string[];
    when: string[];
    then: string[];
  };
  implementation: {
    stepDefinitions: string[];
    status: 'pending' | 'implemented' | 'passing' | 'failing';
  };
}
```

### 6.4 EDA (Event-Driven Architecture) 추적
```typescript
interface EDAMetrics {
  events: {
    name: string;
    producers: string[];
    consumers: string[];
    frequency: number;
  }[];
  eventHandlers: Map<string, string[]>;
  sagaImplementations: string[];
  cqrsPatterns: {
    commands: string[];
    queries: string[];
    projections: string[];
  };
}
```

## 7. 실시간 메트릭 수집

### 7.1 생산성 메트릭
```typescript
interface ProductivityMetrics {
  timeframe: 'hour' | 'day' | 'week' | 'sprint';
  metrics: {
    linesOfCode: {
      added: number;
      deleted: number;
      net: number;
    };
    commits: {
      count: number;
      averageSize: number;
      frequency: number;  // per hour
    };
    files: {
      created: number;
      modified: number;
      deleted: number;
    };
    focusTime: {
      total: number;  // minutes
      longestSession: number;
      interruptions: number;
    };
  };
}
```

### 7.2 품질 메트릭
```typescript
interface QualityMetrics {
  testCoverage: {
    lines: number;
    branches: number;
    functions: number;
    statements: number;
    trend: 'improving' | 'declining' | 'stable';
  };
  codeComplexity: {
    cyclomatic: number;
    cognitive: number;
    hotspots: Array<{
      file: string;
      complexity: number;
      reason: string;
    }>;
  };
  technicalDebt: {
    score: number;
    items: Array<{
      type: 'duplication' | 'complexity' | 'coverage' | 'standards';
      location: string;
      effort: number;  // hours to fix
    }>;
  };
}
```

### 7.3 협업 메트릭
```typescript
interface CollaborationMetrics {
  pullRequests: {
    created: number;
    reviewed: number;
    averageReviewTime: number;  // hours
    averageComments: number;
  };
  codeOwnership: Map<string, {
    files: string[];
    percentage: number;
  }>;
  knowledgeSharing: {
    documentationAdded: number;
    commentsAdded: number;
    pairProgrammingSessions: number;
  };
}
```

## 8. 병목 현상 감지

### 8.1 병목 타입 정의
```typescript
interface Bottleneck {
  id: string;
  type: 'hotspot' | 'test_failure' | 'long_review' | 'blocked_task' | 'performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: {
    file?: string;
    process?: string;
    team?: string;
  };
  metrics: {
    frequency?: number;
    duration?: number;
    impact?: number;  // affected files/features
  };
  suggestions: string[];
  detectedAt: Date;
}
```

### 8.2 감지 알고리즘
```typescript
class BottleneckDetector {
  private rules = [
    {
      name: 'FileHotspot',
      detect: (events: FileSystemEvent[]) => {
        // 같은 파일이 하루에 10번 이상 수정
        const threshold = 10;
        const timeWindow = 24 * 60 * 60 * 1000; // 24 hours
        // ... detection logic
      }
    },
    {
      name: 'TestFailurePattern',
      detect: (testResults: TestResult[]) => {
        // 같은 테스트가 3번 이상 연속 실패
        const failureThreshold = 3;
        // ... detection logic
      }
    },
    {
      name: 'LongRunningPR',
      detect: (pullRequests: PullRequest[]) => {
        // PR이 3일 이상 열려있음
        const dayThreshold = 3;
        // ... detection logic
      }
    }
  ];
}
```

## 9. MCP 도구 API

### 9.1 조회 도구
```typescript
// 프로젝트 상태 조회
interface GetProjectStatusParams {
  includeMetrics?: boolean;
  timeRange?: 'today' | 'week' | 'sprint' | 'all';
}

interface ProjectStatus {
  currentStage: string;
  stageProgress: number;  // 0-100
  activeFeatures: string[];
  teamActivity: {
    commits: number;
    filesModified: number;
    testsRun: number;
  };
  health: 'healthy' | 'warning' | 'critical';
}

// 메트릭 조회
interface GetMetricsParams {
  type: 'productivity' | 'quality' | 'collaboration' | 'all';
  timeframe: 'hour' | 'day' | 'week' | 'sprint';
  groupBy?: 'developer' | 'feature' | 'file';
}
```

### 9.2 분석 도구
```typescript
// 병목 현상 분석
interface AnalyzeBottlenecksParams {
  severity?: 'all' | 'medium' | 'high' | 'critical';
  type?: string[];
}

interface BottleneckAnalysis {
  bottlenecks: Bottleneck[];
  trends: {
    improving: string[];
    worsening: string[];
  };
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
}

// 방법론 준수 체크
interface CheckMethodologyParams {
  methodology: 'DDD' | 'TDD' | 'BDD' | 'EDA' | 'all';
  strict?: boolean;
}

interface MethodologyCompliance {
  methodology: string;
  score: number;  // 0-100
  violations: Array<{
    rule: string;
    location: string;
    suggestion: string;
  }>;
  strengths: string[];
}
```

### 9.3 리포트 생성
```typescript
// 일일 리포트
interface GenerateDailyReportParams {
  date?: string;  // ISO date
  format: 'markdown' | 'json' | 'html';
  sections?: Array<'summary' | 'activity' | 'metrics' | 'bottlenecks' | 'ai-usage'>;
}

interface DailyReport {
  date: string;
  summary: {
    headline: string;
    keyAchievements: string[];
    challenges: string[];
  };
  activity: {
    commits: number;
    pullRequests: number;
    deployments: number;
    incidents: number;
  };
  // ... other sections
}
```

## 10. CLI/TUI 대시보드

### 10.1 대시보드 레이아웃
```typescript
interface DashboardLayout {
  header: {
    projectName: string;
    currentTime: string;
    connectionStatus: 'connected' | 'disconnected';
  };
  
  panels: {
    currentStage: {
      stage: string;
      progress: number;
      eta?: string;
    };
    
    todayActivity: {
      commits: number;
      filesModified: number;
      testsStatus: {
        passed: number;
        failed: number;
        total: number;
      };
      aiAssists: number;
    };
    
    methodologyCompliance: Map<string, number>;
    
    alerts: Array<{
      type: 'warning' | 'error' | 'info';
      message: string;
      timestamp: Date;
    }>;
    
    realtimeFeed: Array<{
      event: string;
      time: string;
      impact: 'low' | 'medium' | 'high';
    }>;
  };
}
```

### 10.2 인터랙티브 기능
```typescript
interface DashboardCommands {
  // 키보드 단축키
  shortcuts: {
    'r': 'refresh',
    'f': 'filter',
    'm': 'metrics',
    'b': 'bottlenecks',
    'h': 'help',
    'q': 'quit'
  };
  
  // 필터링 옵션
  filters: {
    stage?: string;
    developer?: string;
    timeRange?: string;
    severity?: string;
  };
  
  // 상세 보기
  drillDown: {
    file: (path: string) => FileDetails;
    commit: (hash: string) => CommitDetails;
    metric: (type: string) => MetricDetails;
  };
}
```

## 11. 데이터 모델

### 11.1 이벤트 저장 구조
```typescript
// SQLite 스키마
interface EventRecord {
  id: string;
  type: string;
  timestamp: number;
  projectId: string;
  data: string;  // JSON
  metadata: {
    stage?: string;
    developer?: string;
    branch?: string;
    impact?: number;
  };
  processed: boolean;
}

// Redis 캐시 구조
interface CacheStructure {
  'current:stage': string;
  'metrics:today': object;
  'bottlenecks:active': Bottleneck[];
  'events:queue': string[];  // event IDs
  'ai:interactions:recent': AIInteraction[];
}
```

### 11.2 집계 데이터 구조
```typescript
interface AggregatedData {
  hourly: {
    [hour: string]: {
      events: number;
      commits: number;
      filesChanged: number;
      testsRun: number;
    };
  };
  
  daily: {
    [date: string]: {
      summary: DailySummary;
      metrics: AllMetrics;
      bottlenecks: Bottleneck[];
    };
  };
  
  sprint: {
    [sprintId: string]: {
      velocity: number;
      burndown: Array<{date: string; remaining: number}>;
      achievements: string[];
    };
  };
}
```

## 12. 이벤트 흐름 시나리오

### 12.1 새 기능 개발 시나리오
```typescript
// 1. 브랜치 생성
{
  type: 'git.branch.create',
  data: { name: 'feature/user-auth', from: 'main' }
}
↓
// 2. 파일 생성 (TDD - 테스트 먼저)
{
  type: 'file.create',
  data: { path: 'src/auth/auth.service.test.ts' }
}
↓
// 3. AI 도움 요청
{
  type: 'ai.interaction',
  data: { 
    tool: 'Claude',
    prompt: 'UserAuth 서비스 테스트 코드 작성',
    codeGenerated: true
  }
}
↓
// 4. 구현 코드 작성
{
  type: 'file.create',
  data: { path: 'src/auth/auth.service.ts' }
}
↓
// 5. 테스트 실행
{
  type: 'test.run',
  data: { 
    files: ['auth.service.test.ts'],
    results: { passed: 5, failed: 0 }
  }
}
↓
// 6. 커밋
{
  type: 'git.commit',
  data: { 
    message: 'feat: Add user authentication service',
    files: 2,
    additions: 150,
    deletions: 0
  }
}
```

### 12.2 버그 수정 시나리오
```typescript
// 1. 이슈 발견 (테스트 실패)
{
  type: 'test.fail',
  data: { 
    file: 'user.service.test.ts',
    error: 'Expected 200 but got 500'
  }
}
↓
// 2. 디버깅 시작
{
  type: 'file.open',
  data: { path: 'src/user/user.service.ts' }
}
↓
// 3. 핫스팟 감지
{
  type: 'bottleneck.detected',
  data: { 
    type: 'hotspot',
    file: 'user.service.ts',
    modifications: 15  // in last 2 hours
  }
}
↓
// 4. 수정 및 테스트
// ... 여러 수정 시도 ...
↓
// 5. 해결
{
  type: 'test.pass',
  data: { 
    file: 'user.service.test.ts',
    duration: 1250  // ms
  }
}
```

### 12.3 코드 리뷰 프로세스
```typescript
// 1. PR 생성
{
  type: 'git.pr.create',
  data: { 
    number: 123,
    title: 'Add user authentication',
    files: 8,
    additions: 350,
    deletions: 20
  }
}
↓
// 2. 리뷰 시작
{
  type: 'git.pr.review.start',
  data: { 
    pr: 123,
    reviewer: 'john.doe'
  }
}
↓
// 3. 리뷰 코멘트
{
  type: 'git.pr.comment',
  data: { 
    pr: 123,
    file: 'auth.service.ts',
    line: 45,
    comment: 'Consider using dependency injection here'
  }
}
↓
// 4. 수정 사항 반영
// ... 코드 수정 ...
↓
// 5. 승인 및 머지
{
  type: 'git.pr.merge',
  data: { 
    pr: 123,
    strategy: 'squash',
    reviewTime: 3.5  // hours
  }
}
```

## 사용 가이드

이 문서는 DevFlow Monitor MCP를 구현할 때 참조해야 하는 핵심 명세서입니다. 각 기능을 구현할 때:

1. 해당 섹션의 인터페이스를 정확히 구현
2. 제공된 예시 시나리오를 테스트 케이스로 활용
3. 데이터 모델을 준수하여 일관성 유지
4. AI 협업 시 이 문서를 컨텍스트로 제공

모든 구현은 이 명세를 기반으로 하여, 일관되고 예측 가능한 동작을 보장해야 합니다.

---

작성일: 2025-08-02  
최종 수정일: 2025-08-02  
작성자: yaioyaio