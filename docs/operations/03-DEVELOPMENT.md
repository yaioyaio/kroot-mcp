# DevFlow Monitor MCP - 개발 가이드

## 목차
1. [개발 워크플로우](#1-개발-워크플로우)
2. [코드 작성 규칙](#2-코드-작성-규칙)
3. [테스트 작성 및 실행](#3-테스트-작성-및-실행)
4. [디버깅 방법](#4-디버깅-방법)
5. [개발 도구 사용법](#5-개발-도구-사용법)
6. [Git 워크플로우](#6-git-워크플로우)
7. [CI/CD 파이프라인](#7-cicd-파이프라인)
8. [개발 팁과 모범 사례](#8-개발-팁과-모범-사례)

## 1. 개발 워크플로우

### 1.1 일일 개발 프로세스
```bash
# 1. 최신 코드 가져오기
git pull origin develop

# 2. 새 기능 브랜치 생성
git checkout -b feature/your-feature-name

# 3. 개발 모드 실행
npm run dev

# 4. 코드 작성 및 테스트
# ... 개발 작업 ...

# 5. 린트 및 포맷팅
npm run lint:fix
npm run format

# 6. 테스트 실행
npm test

# 7. 커밋
git add .
git commit -m "feat: add your feature description"

# 8. 푸시 및 PR 생성
git push origin feature/your-feature-name
```

### 1.2 개발 스크립트
```json
{
  "scripts": {
    "dev": "tsc --watch",                    // TypeScript watch 모드
    "dev:server": "nodemon dist/server",     // 서버 자동 재시작
    "dev:full": "concurrently \"npm:dev\" \"npm:dev:server\"", // 전체 개발 모드
    "test:watch": "vitest watch",             // 테스트 watch 모드
    "lint:watch": "esw --watch --ext .ts"    // 린트 watch 모드
  }
}
```

## 2. 코드 작성 규칙

### 2.1 TypeScript 스타일 가이드
```typescript
// ✅ Good - 명시적 타입과 인터페이스 사용
interface MonitorConfig {
  name: string;
  enabled: boolean;
  interval: number;
}

export class FileMonitor implements IMonitor {
  private readonly config: MonitorConfig;
  
  constructor(config: MonitorConfig) {
    this.config = config;
  }
  
  public async start(): Promise<void> {
    // 구현
  }
}

// ❌ Bad - any 타입, 불명확한 구조
export class FileMonitor {
  constructor(private config: any) {}
  
  start() {
    // 구현
  }
}
```

### 2.2 파일 구조 규칙
```typescript
// src/monitors/file/FileMonitor.ts

// 1. Imports (그룹화 및 정렬)
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

import { BaseMonitor } from '../base/BaseMonitor';
import { FileEvent, MonitorConfig } from '../../types';
import { logger } from '../../utils/logger';

// 2. Constants
const DEFAULT_INTERVAL = 1000;
const MAX_FILE_SIZE = 1024 * 1024 * 10; // 10MB

// 3. Types/Interfaces
interface FileMonitorOptions extends MonitorConfig {
  watchPatterns: string[];
  ignorePatterns: string[];
}

// 4. Main Class
export class FileMonitor extends BaseMonitor {
  // 구현
}

// 5. Helper Functions
function isValidPath(filePath: string): boolean {
  // 구현
}

// 6. Exports
export { FileMonitorOptions };
```

### 2.3 명명 규칙
```typescript
// 인터페이스: PascalCase, 'I' 접두사 선택적
interface IMonitor { }
interface MonitorConfig { }

// 클래스: PascalCase
class FileMonitor { }

// 함수/메서드: camelCase
function processFile() { }
async function fetchData() { }

// 상수: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 5000;

// 변수: camelCase
let isRunning = false;
const fileName = 'test.ts';

// 타입: PascalCase
type EventType = 'file' | 'git' | 'test';

// 열거형: PascalCase, 멤버는 UPPER_SNAKE_CASE
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  ERROR = 'error'
}
```

## 3. 테스트 작성 및 실행

### 3.1 테스트 구조
```typescript
// tests/unit/monitors/FileMonitor.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileMonitor } from '../../../src/monitors/file/FileMonitor';

describe('FileMonitor', () => {
  let monitor: FileMonitor;
  
  beforeEach(() => {
    monitor = new FileMonitor({
      name: 'test-monitor',
      enabled: true,
      interval: 1000
    });
  });
  
  afterEach(() => {
    monitor.stop();
    vi.clearAllMocks();
  });
  
  describe('start()', () => {
    it('should start monitoring successfully', async () => {
      const startSpy = vi.spyOn(monitor, 'start');
      
      await monitor.start();
      
      expect(startSpy).toHaveBeenCalled();
      expect(monitor.isRunning()).toBe(true);
    });
    
    it('should emit events when files change', async () => {
      const eventSpy = vi.fn();
      monitor.on('file:changed', eventSpy);
      
      // 파일 변경 시뮬레이션
      await simulateFileChange('test.ts');
      
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'change',
          path: expect.stringContaining('test.ts')
        })
      );
    });
  });
});
```

### 3.2 테스트 실행 명령어
```bash
# 모든 테스트 실행
npm test

# 특정 파일/패턴 테스트
npm test FileMonitor
npm test -- --grep "should start"

# 커버리지 확인
npm run test:coverage

# Watch 모드
npm run test:watch

# 디버그 모드
npm test -- --inspect-brk
```

### 3.3 통합 테스트
```typescript
// tests/integration/mcp-server.test.ts

import { MCPServer } from '../../src/server';
import { TestClient } from '../helpers/TestClient';

describe('MCP Server Integration', () => {
  let server: MCPServer;
  let client: TestClient;
  
  beforeAll(async () => {
    server = new MCPServer({ port: 0 }); // 랜덤 포트
    await server.start();
    
    client = new TestClient(server.getPort());
    await client.connect();
  });
  
  afterAll(async () => {
    await client.disconnect();
    await server.stop();
  });
  
  it('should handle tool requests', async () => {
    const response = await client.callTool('getProjectStatus', {
      includeMetrics: true
    });
    
    expect(response).toHaveProperty('currentStage');
    expect(response).toHaveProperty('metrics');
  });
});
```

## 4. 디버깅 방법

### 4.1 VS Code 디버깅
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug TypeScript",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/server/index.js",
      "preLaunchTask": "npm: build",
      "sourceMaps": true,
      "smartStep": true,
      "internalConsoleOptions": "openOnSessionStart",
      "skipFiles": [
        "<node_internals>/**"
      ]
    },
    {
      "name": "Debug Current Test",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "${file}"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### 4.2 로깅 및 디버깅 도구
```typescript
// src/utils/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// 사용 예시
logger.debug('Starting file monitor', { path: '/src' });
logger.info('Server started', { port: 3000 });
logger.error('Failed to process file', { error, file });
```

### 4.3 성능 프로파일링
```typescript
// 성능 측정
import { performance } from 'perf_hooks';

export function measurePerformance(name: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const start = performance.now();
      try {
        const result = await originalMethod.apply(this, args);
        const duration = performance.now() - start;
        logger.debug(`${name} took ${duration.toFixed(2)}ms`);
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        logger.error(`${name} failed after ${duration.toFixed(2)}ms`, { error });
        throw error;
      }
    };
  };
}

// 사용
class FileProcessor {
  @measurePerformance('File processing')
  async processFile(path: string): Promise<void> {
    // 구현
  }
}
```

## 5. 개발 도구 사용법

### 5.1 npm 스크립트 활용
```bash
# 동시 실행 (개발 모드)
npm install -D concurrently
npm run dev:full

# 파일 변경 감지
npm install -D nodemon
npm run dev:server

# 환경 변수 관리
npm install -D dotenv-cli
dotenv -e .env.development npm run dev
```

### 5.2 코드 생성 도구
```bash
# 새 모니터 생성
npm run generate:monitor -- --name GitMonitor

# 새 도구 생성
npm run generate:tool -- --name AnalyzeCode

# 테스트 파일 생성
npm run generate:test -- --file src/monitors/GitMonitor.ts
```

### 5.3 의존성 관리
```bash
# 의존성 업데이트 확인
npm outdated

# 안전한 업데이트
npm update

# 취약점 확인
npm audit

# 취약점 자동 수정
npm audit fix

# 사용하지 않는 의존성 찾기
npx depcheck
```

## 6. Git 워크플로우

### 6.1 브랜치 전략
```bash
main          # 프로덕션 릴리즈
develop       # 개발 통합 브랜치
feature/*     # 새 기능 개발
bugfix/*      # 버그 수정
hotfix/*      # 긴급 수정
release/*     # 릴리즈 준비
```

### 6.2 커밋 메시지 규칙
```bash
# 형식: <type>(<scope>): <subject>

feat(monitors): add file change detection
fix(server): handle connection timeout
docs(api): update tool documentation
style(dashboard): improve UI layout
refactor(events): simplify event processing
test(monitors): add unit tests for GitMonitor
chore(deps): update dependencies
perf(analyzer): optimize stage detection
```

### 6.3 Pull Request 프로세스
```markdown
## PR 체크리스트
- [ ] 코드가 프로젝트 스타일 가이드를 따름
- [ ] 모든 테스트가 통과함
- [ ] 새로운 기능에 대한 테스트 추가됨
- [ ] 문서가 업데이트됨
- [ ] 변경 로그가 업데이트됨
- [ ] 성능 영향이 고려됨
- [ ] 보안 영향이 검토됨
```

## 7. CI/CD 파이프라인

### 7.1 GitHub Actions 설정
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [20.x, 22.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - run: npm ci
    - run: npm run build
    - run: npm run lint
    - run: npm test
    - run: npm run test:coverage
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

### 7.2 자동화된 검사
```yaml
# .github/workflows/quality.yml
name: Code Quality

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: SonarCloud Scan
      uses: SonarSource/sonarcloud-github-action@master
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
    
    - name: Check dependencies
      run: |
        npm audit --production
        npx depcheck
```

## 8. 개발 팁과 모범 사례

### 8.1 성능 최적화
```typescript
// 배치 처리
class EventBatcher {
  private batch: Event[] = [];
  private timer: NodeJS.Timeout | null = null;
  
  add(event: Event): void {
    this.batch.push(event);
    
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 100);
    }
  }
  
  private flush(): void {
    if (this.batch.length > 0) {
      this.processBatch(this.batch);
      this.batch = [];
    }
    this.timer = null;
  }
}
```

### 8.2 에러 처리
```typescript
// 커스텀 에러 클래스
export class MonitorError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'MonitorError';
  }
}

// 에러 처리 래퍼
export function withErrorHandling<T extends (...args: any[]) => any>(
  fn: T,
  context: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      logger.error(`Error in ${context}`, { error, args });
      throw new MonitorError(
        `Failed to execute ${context}`,
        'EXECUTION_ERROR',
        { originalError: error }
      );
    }
  }) as T;
}
```

### 8.3 메모리 관리
```typescript
// 메모리 누수 방지
class ResourceManager {
  private resources = new Map<string, IDisposable>();
  
  register(id: string, resource: IDisposable): void {
    this.resources.set(id, resource);
  }
  
  async dispose(id: string): Promise<void> {
    const resource = this.resources.get(id);
    if (resource) {
      await resource.dispose();
      this.resources.delete(id);
    }
  }
  
  async disposeAll(): Promise<void> {
    const promises = Array.from(this.resources.values())
      .map(r => r.dispose());
    await Promise.all(promises);
    this.resources.clear();
  }
}
```

## 다음 단계

개발이 완료되면 [배포 가이드](./04-DEPLOYMENT.md)를 참고하여 배포를 준비하세요.

---

작성일: 2025-08-02  
최종 수정일: 2025-08-02  
작성자: yaioyaio