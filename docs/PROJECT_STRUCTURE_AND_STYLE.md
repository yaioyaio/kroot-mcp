# DevFlow Monitor MCP - 프로젝트 구조 및 코딩 표준

## 목차
1. [프로젝트 구조](#1-프로젝트-구조)
2. [파일 명명 규칙](#2-파일-명명-규칙)
3. [코딩 표준](#3-코딩-표준)
4. [TypeScript 스타일 가이드](#4-typescript-스타일-가이드)
5. [커밋 메시지 규칙](#5-커밋-메시지-규칙)
6. [테스트 작성 가이드](#6-테스트-작성-가이드)

## 1. 프로젝트 구조

### 1.1 전체 디렉토리 구조
```
devflow-monitor-mcp/
├── src/                          # 소스 코드
│   ├── server/                   # MCP 서버 코어
│   │   ├── index.ts             # 서버 엔트리 포인트
│   │   ├── server.ts            # MCP 서버 구현
│   │   ├── config.ts            # 서버 설정
│   │   └── types.ts             # 서버 타입 정의
│   │
│   ├── monitors/                 # 모니터링 모듈
│   │   ├── base/                # 기본 모니터 클래스
│   │   │   └── BaseMonitor.ts
│   │   ├── file/                # 파일 시스템 모니터
│   │   │   ├── FileMonitor.ts
│   │   │   └── patterns.ts
│   │   ├── git/                 # Git 활동 모니터
│   │   │   ├── GitMonitor.ts
│   │   │   └── utils.ts
│   │   ├── test/                # 테스트 실행 모니터
│   │   │   └── TestMonitor.ts
│   │   └── ai/                  # AI 도구 모니터
│   │       └── AIMonitor.ts
│   │
│   ├── events/                   # 이벤트 시스템
│   │   ├── EventEngine.ts        # 이벤트 엔진
│   │   ├── EventProcessor.ts     # 이벤트 프로세서
│   │   ├── EventQueue.ts         # 이벤트 큐
│   │   └── types/               # 이벤트 타입 정의
│   │       ├── base.ts
│   │       ├── file.ts
│   │       ├── git.ts
│   │       └── ai.ts
│   │
│   ├── analyzers/                # 분석 엔진
│   │   ├── stage/               # 개발 단계 분석
│   │   │   ├── StageAnalyzer.ts
│   │   │   └── rules.ts
│   │   ├── methodology/         # 방법론 분석
│   │   │   ├── DDDAnalyzer.ts
│   │   │   ├── TDDAnalyzer.ts
│   │   │   ├── BDDAnalyzer.ts
│   │   │   └── EDAAnalyzer.ts
│   │   └── bottleneck/          # 병목 분석
│   │       ├── BottleneckDetector.ts
│   │       └── patterns.ts
│   │
│   ├── integrations/             # 외부 통합
│   │   ├── base/                # 기본 통합 클래스
│   │   │   └── BaseIntegration.ts
│   │   ├── jira/                # Jira 통합
│   │   ├── notion/              # Notion 통합
│   │   ├── figma/               # Figma 통합
│   │   └── github/              # GitHub 통합
│   │
│   ├── storage/                  # 데이터 저장
│   │   ├── database/            # 데이터베이스
│   │   │   ├── Database.ts
│   │   │   ├── migrations/
│   │   │   └── schemas/
│   │   ├── cache/               # 캐시
│   │   │   ├── CacheManager.ts
│   │   │   └── strategies/
│   │   └── queue/               # 큐
│   │       └── QueueManager.ts
│   │
│   ├── tools/                    # MCP 도구
│   │   ├── base/                # 기본 도구 클래스
│   │   │   └── BaseTool.ts
│   │   ├── query/               # 조회 도구
│   │   │   ├── GetProjectStatus.ts
│   │   │   └── GetMetrics.ts
│   │   ├── analyze/             # 분석 도구
│   │   │   ├── AnalyzeBottlenecks.ts
│   │   │   └── CheckMethodology.ts
│   │   └── report/              # 리포트 도구
│   │       └── GenerateReport.ts
│   │
│   ├── dashboard/                # CLI/TUI 대시보드
│   │   ├── cli/                 # CLI 인터페이스
│   │   │   ├── commands/
│   │   │   └── index.ts
│   │   └── tui/                 # TUI 인터페이스
│   │       ├── components/
│   │       ├── screens/
│   │       └── index.ts
│   │
│   ├── utils/                    # 유틸리티
│   │   ├── logger.ts            # 로깅
│   │   ├── errors.ts            # 에러 처리
│   │   ├── validation.ts        # 검증
│   │   └── helpers.ts           # 헬퍼 함수
│   │
│   └── types/                    # 전역 타입 정의
│       ├── global.d.ts
│       └── index.ts
│
├── tests/                        # 테스트
│   ├── unit/                    # 단위 테스트
│   ├── integration/             # 통합 테스트
│   ├── e2e/                     # E2E 테스트
│   └── fixtures/                # 테스트 픽스처
│
├── scripts/                      # 스크립트
│   ├── setup.ts                 # 초기 설정
│   ├── migrate.ts               # 마이그레이션
│   └── build.ts                 # 빌드 스크립트
│
├── config/                       # 설정 파일
│   ├── default.json             # 기본 설정
│   ├── development.json         # 개발 설정
│   └── production.json          # 프로덕션 설정
│
├── docs/                         # 문서
│   ├── api/                     # API 문서
│   └── guides/                  # 가이드
│
├── .github/                      # GitHub 설정
│   ├── workflows/               # GitHub Actions
│   └── ISSUE_TEMPLATE/          # 이슈 템플릿
│
├── dist/                         # 빌드 출력 (gitignore)
├── node_modules/                 # 의존성 (gitignore)
├── coverage/                     # 테스트 커버리지 (gitignore)
├── .env                         # 환경 변수 (gitignore)
├── .env.example                 # 환경 변수 예시
├── .eslintrc.json               # ESLint 설정
├── .prettierrc                  # Prettier 설정
├── .gitignore                   # Git 무시 파일
├── vitest.config.ts             # Vitest 설정
├── tsconfig.json                # TypeScript 설정
├── package.json                 # 패키지 정의
└── README.md                    # 프로젝트 설명
```

### 1.2 모듈 구조 원칙

#### 1.2.1 계층 구조
```
프레젠테이션 레이어 (CLI/TUI)
        ↓
    도구 레이어 (MCP Tools)
        ↓
    비즈니스 레이어 (Analyzers)
        ↓
    도메인 레이어 (Monitors/Events)
        ↓
    인프라 레이어 (Storage/Integrations)
```

#### 1.2.2 의존성 규칙
- 상위 레이어는 하위 레이어에 의존 가능
- 하위 레이어는 상위 레이어에 의존 불가
- 동일 레이어 간 의존은 인터페이스를 통해서만 가능

## 2. 파일 명명 규칙

### 2.1 일반 규칙
- **파일명**: PascalCase 사용 (예: `FileMonitor.ts`)
- **디렉토리명**: kebab-case 사용 (예: `file-monitor/`)
- **테스트 파일**: `*.test.ts` 또는 `*.spec.ts`
- **타입 정의 파일**: `*.types.ts` 또는 `types.ts`
- **설정 파일**: `*.config.ts` 또는 `config.ts`
- **유틸리티**: `*.utils.ts` 또는 `utils.ts`

### 2.2 컴포넌트별 규칙
```typescript
// 클래스 파일
FileMonitor.ts         // 메인 클래스

// 타입 정의
types/file.ts          // 파일 관련 타입

// 테스트
FileMonitor.test.ts    // 단위 테스트
FileMonitor.e2e.ts     // E2E 테스트

// 설정
file.config.ts         // 모듈 설정

// 유틸리티
file.utils.ts          // 헬퍼 함수
```

## 3. 코딩 표준

### 3.1 일반 원칙
- **DRY (Don't Repeat Yourself)**: 코드 중복 최소화
- **SOLID 원칙**: 객체지향 설계 원칙 준수
- **KISS (Keep It Simple, Stupid)**: 단순하고 명확한 코드
- **YAGNI (You Aren't Gonna Need It)**: 필요한 기능만 구현

### 3.2 코드 구성
```typescript
// 1. Imports (그룹별로 정렬)
// - Node.js 내장 모듈
// - 외부 라이브러리
// - 내부 모듈
// - 타입 정의
import { EventEmitter } from 'events';
import { watch } from 'chokidar';
import { BaseMonitor } from '../base/BaseMonitor';
import type { FileEvent } from '../../types';

// 2. 상수 정의
const DEFAULT_IGNORE_PATTERNS = ['node_modules', '.git'];

// 3. 타입/인터페이스 정의
interface FileMonitorOptions {
  ignorePaths?: string[];
  debounceMs?: number;
}

// 4. 클래스/함수 구현
export class FileMonitor extends BaseMonitor {
  // 구현...
}

// 5. Export
export { FileMonitor, FileMonitorOptions };
```

### 3.3 에러 처리
```typescript
// 커스텀 에러 클래스 사용
export class MonitorError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'MonitorError';
  }
}

// 에러 처리 예시
try {
  await this.processFile(filePath);
} catch (error) {
  if (error instanceof MonitorError) {
    logger.error('Monitor error', { code: error.code, details: error.details });
    throw error;
  }
  
  // 예상치 못한 에러는 래핑
  throw new MonitorError(
    'Unexpected error processing file',
    'FILE_PROCESS_ERROR',
    { originalError: error, filePath }
  );
}
```

## 4. TypeScript 스타일 가이드

### 4.1 타입 정의
```typescript
// ✅ Good - 명시적 타입 사용
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

// ❌ Bad - any 타입 사용
const processData = (data: any) => { ... };

// ✅ Good - 제네릭 사용
function processArray<T>(items: T[], processor: (item: T) => void): void {
  items.forEach(processor);
}

// ✅ Good - 유니온 타입
type Status = 'pending' | 'in_progress' | 'completed' | 'failed';

// ✅ Good - 타입 가드
function isFileEvent(event: unknown): event is FileEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    'path' in event
  );
}
```

### 4.2 클래스 스타일
```typescript
export class FileMonitor extends BaseMonitor {
  // 1. Private 필드 (언더스코어 없음)
  private watcher: FSWatcher | null = null;
  private readonly ignorePatterns: string[];
  
  // 2. Public 필드
  public readonly name = 'FileMonitor';
  
  // 3. Constructor
  constructor(private readonly options: FileMonitorOptions) {
    super();
    this.ignorePatterns = options.ignorePaths || DEFAULT_IGNORE_PATTERNS;
  }
  
  // 4. Public 메서드
  public async start(): Promise<void> {
    await this.initialize();
  }
  
  // 5. Protected 메서드
  protected async processEvent(event: FileEvent): Promise<void> {
    // 구현...
  }
  
  // 6. Private 메서드
  private async initialize(): Promise<void> {
    // 구현...
  }
  
  // 7. Static 메서드
  public static validatePath(path: string): boolean {
    return path.startsWith('/');
  }
}
```

### 4.3 비동기 처리
```typescript
// ✅ Good - async/await 사용
async function fetchData(): Promise<Data> {
  try {
    const response = await api.get('/data');
    return response.data;
  } catch (error) {
    throw new ApiError('Failed to fetch data', error);
  }
}

// ✅ Good - Promise.all 병렬 처리
async function processMultiple(ids: string[]): Promise<Result[]> {
  const promises = ids.map(id => processItem(id));
  return Promise.all(promises);
}

// ✅ Good - 에러 처리가 있는 병렬 처리
async function safeProcessMultiple(ids: string[]): Promise<Result[]> {
  const results = await Promise.allSettled(
    ids.map(id => processItem(id))
  );
  
  return results
    .filter((result): result is PromiseFulfilledResult<Result> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value);
}
```

### 4.4 함수형 프로그래밍
```typescript
// ✅ Good - 순수 함수
const addTax = (price: number, taxRate: number): number => 
  price * (1 + taxRate);

// ✅ Good - 불변성
const updateUser = (user: User, updates: Partial<User>): User => ({
  ...user,
  ...updates,
  updatedAt: new Date()
});

// ✅ Good - 함수 조합
const pipe = <T>(...fns: Array<(arg: T) => T>) => 
  (value: T): T => 
    fns.reduce((acc, fn) => fn(acc), value);

const processString = pipe(
  (s: string) => s.trim(),
  (s: string) => s.toLowerCase(),
  (s: string) => s.replace(/\s+/g, '-')
);
```

## 5. 커밋 메시지 규칙

### 5.1 Conventional Commits 형식
```
<type>(<scope>): <subject>

<body>

<footer>
```

### 5.2 타입 종류
- **feat**: 새로운 기능 추가
- **fix**: 버그 수정
- **docs**: 문서 수정
- **style**: 코드 포맷팅, 세미콜론 누락 등
- **refactor**: 코드 리팩토링
- **test**: 테스트 추가/수정
- **chore**: 빌드 프로세스, 도구 설정 등
- **perf**: 성능 개선
- **ci**: CI 설정 변경

### 5.3 예시
```bash
# 기능 추가
feat(monitors): add file system monitoring with chokidar

# 버그 수정
fix(git): handle branch names with special characters

# 문서 업데이트
docs(api): update MCP tool documentation

# 리팩토링
refactor(events): simplify event processing pipeline

# 테스트 추가
test(analyzers): add unit tests for StageAnalyzer
```

## 6. 테스트 작성 가이드

### 6.1 테스트 구조
```typescript
// 테스트 파일: FileMonitor.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileMonitor } from './FileMonitor';

describe('FileMonitor', () => {
  let monitor: FileMonitor;
  
  beforeEach(() => {
    monitor = new FileMonitor({ ignorePaths: ['node_modules'] });
  });
  
  afterEach(() => {
    monitor.stop();
  });
  
  describe('start()', () => {
    it('should initialize watcher successfully', async () => {
      await monitor.start();
      expect(monitor.isRunning()).toBe(true);
    });
    
    it('should throw error if already started', async () => {
      await monitor.start();
      await expect(monitor.start()).rejects.toThrow('Monitor already running');
    });
  });
  
  describe('file events', () => {
    it('should emit event when file is created', async () => {
      const eventSpy = vi.fn();
      monitor.on('file:created', eventSpy);
      
      // 파일 생성 시뮬레이션
      await createTestFile('test.ts');
      
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'add',
          path: expect.stringContaining('test.ts')
        })
      );
    });
  });
});
```

### 6.2 테스트 명명 규칙
```typescript
// ✅ Good - 명확한 테스트 이름
it('should return user data when valid ID is provided', async () => {});
it('should throw ValidationError when email format is invalid', () => {});
it('should retry 3 times before failing', async () => {});

// ❌ Bad - 모호한 테스트 이름
it('test user', () => {});
it('error case', () => {});
it('works', () => {});
```

### 6.3 테스트 원칙
- **AAA (Arrange, Act, Assert)** 패턴 사용
- 각 테스트는 하나의 동작만 검증
- 테스트 간 의존성 없음
- Mock/Stub 적절히 활용
- 엣지 케이스 포함

## 사용 가이드

이 문서는 DevFlow Monitor MCP 프로젝트의 일관된 코드 품질을 보장하기 위한 가이드입니다.

1. **새 기능 개발 시**: 디렉토리 구조와 명명 규칙을 따라 파일 생성
2. **코드 작성 시**: TypeScript 스타일 가이드 준수
3. **커밋 시**: Conventional Commits 형식 사용
4. **PR 생성 시**: 체크리스트 확인
   - [ ] 코딩 표준 준수
   - [ ] 테스트 작성 완료
   - [ ] 문서 업데이트
   - [ ] 린트 통과

모든 팀원은 이 가이드를 숙지하고 준수해야 합니다.

---

작성일: 2025-08-02  
최종 수정일: 2025-08-02  
작성자: yaioyaio