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
poetry run python -m devflow_monitor

# 4. 코드 작성 및 테스트
# ... 개발 작업 ...

# 5. 린트 및 포맷팅
poetry run ruff check .:fix
poetry run black src/

# 6. 테스트 실행
poetry run pytest

# 7. 커밋
git add .
git commit -m "feat: add your feature description"

# 8. 푸시 및 PR 생성
git push origin feature/your-feature-name
```

### 1.2 개발 스크립트
```bash
# 개발 모드 실행
poetry run python -m devflow_monitor

# 테스트 watch 모드
poetry run pytest-watch

# 린트 실행
poetry run ruff check .

# 타입 체크
poetry run mypy src/

# 코드 포맷팅
poetry run black src/
poetry run isort src/
```

## 2. 코드 작성 규칙

### 2.1 Python 스타일 가이드
```python
# ✅ Good - 명시적 타입과 Pydantic 모델 사용
from pydantic import BaseModel

class MonitorConfig(BaseModel):
    name: str
    enabled: bool
    interval: int

class FileMonitor:
    def __init__(self, config: MonitorConfig) -> None:
        self.config = config

    async def start(self) -> None:
        """모니터 시작."""
        ...

# ❌ Bad - Any 타입, 불명확한 구조
from typing import Any

class FileMonitor:
    def __init__(self, config: Any):
        self.config = config

    def start(self):
        # 구현
        pass
```

### 2.2 파일 구조 규칙
```python
# src/devflow_monitor/monitors/file.py

# 1. Imports (그룹화 및 정렬 - isort 사용)
# 표준 라이브러리
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional

# 서드파티 라이브러리
from pydantic import BaseModel

# 로컬 모듈
from .base import BaseMonitor, MonitorConfig
from ..events.types.file import FileEvent
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
```python
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
const fileName = 'test.py';

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
```python
// tests/unit/monitors/test_file_monitor.py

import { describe, it, expect, beforeEach, afterEach, vi } from 'pytest';
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
      await simulateFileChange('test.py');
      
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'change',
          path: expect.stringContaining('test.py')
        })
      );
    });
  });
});
```

### 3.2 테스트 실행 명령어
```bash
# 모든 테스트 실행
poetry run pytest

# 특정 파일/패턴 테스트
poetry run pytest FileMonitor
poetry run pytest -- --grep "should start"

# 커버리지 확인
poetry run pytest:coverage

# Watch 모드
poetry run pytest:watch

# 디버그 모드
poetry run pytest -- --inspect-brk
```

### 3.3 통합 테스트
```python
// tests/integration/mcp-server.test.py

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
      "name": "Debug MCP Server",
      "type": "debugpy",
      "request": "launch",
      "module": "devflow_monitor",
      "cwd": "${workspaceFolder}",
      "justMyCode": true
    },
    {
      "name": "Debug Current Test",
      "type": "debugpy",
      "request": "launch",
      "module": "pytest",
      "args": ["-v", "${file}"],
      "console": "integratedTerminal",
      "cwd": "${workspaceFolder}"
    }
  ]
}
```

### 4.2 로깅 및 디버깅 도구
```python
// src/utils/logger.py
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
```python
import time
import functools
from typing import Callable, Any

def measure_performance(name: str) -> Callable:
    """성능 측정 데코레이터."""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            start = time.perf_counter()
            try:
                result = await func(*args, **kwargs)
                duration = (time.perf_counter() - start) * 1000
                logger.debug(f"{name} took {duration:.2f}ms")
                return result
            except Exception as error:
                duration = (time.perf_counter() - start) * 1000
                logger.error(f"{name} failed after {duration:.2f}ms", exc_info=error)
                raise
        return wrapper
    return decorator

# 사용
class FileProcessor:
    @measure_performance("File processing")
    async def process_file(self, path: str) -> None:
        # 구현
        ...
```

## 5. 개발 도구 사용법

### 5.1 Poetry 스크립트 활용
```bash
# 동시 실행 (개발 모드)
poetry install -D concurrently
poetry run python -m devflow_monitor:full

# 파일 변경 감지
poetry install -D nodemon
poetry run python -m devflow_monitor:server

# 환경 변수 관리
poetry install -D dotenv-cli
dotenv -e .env.development poetry run python -m devflow_monitor
```

### 5.2 코드 생성 도구
```bash
# 새 모니터 생성
poetry run python -m devflow_monitor.generators.monitor --name GitMonitor

# 새 도구 생성
poetry run python -m devflow_monitor.generators.tool --name AnalyzeCode

# 테스트 파일 생성
poetry run python -m devflow_monitor.generators.test --file src/devflow_monitor/monitors/git.py
```

### 5.3 의존성 관리
```bash
# 의존성 업데이트 확인
poetry show --outdated

# 안전한 업데이트
poetry update

# 취약점 확인
poetry run pip-audit

# 취약점 자동 수정
poetry run pip-audit fix

# 사용하지 않는 의존성 찾기
poetry run depcheck
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
    
    - name: Use Python ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'poetry'
    
    - run: poetry install
    - run: poetry build
    - run: poetry run ruff check .
    - run: poetry run pytest
    - run: poetry run pytest:coverage
    
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
        poetry run pip-audit --production
        poetry run depcheck
```

## 8. 개발 팁과 모범 사례

### 8.1 성능 최적화
```python
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
```python
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
```python
import asyncio
from typing import Protocol, Dict

class Disposable(Protocol):
    async def dispose(self) -> None: ...

class ResourceManager:
    """메모리 누수 방지를 위한 리소스 관리자."""

    def __init__(self) -> None:
        self._resources: Dict[str, Disposable] = {}

    def register(self, id: str, resource: Disposable) -> None:
        self._resources[id] = resource

    async def dispose(self, id: str) -> None:
        resource = self._resources.get(id)
        if resource:
            await resource.dispose()
            del self._resources[id]

    async def dispose_all(self) -> None:
        tasks = [r.dispose() for r in self._resources.values()]
        await asyncio.gather(*tasks)
        self._resources.clear()
```

## 다음 단계

개발이 완료되면 [배포 가이드](./04-DEPLOYMENT.md)를 참고하여 배포를 준비하세요.

---

작성일: 2026-02-02  
최종 수정일: 2026-02-02  
작성자: yaioyaio