# DevFlow Monitor MCP - API 문서

## 개요

DevFlow Monitor MCP는 Model Context Protocol(MCP)을 통해 개발 프로세스 모니터링 도구를 제공합니다. 이 문서는 MCP 서버가 제공하는 도구(tools)와 기능들에 대한 상세한 설명을 포함합니다.

## MCP 도구 목록

### 1. getProjectStatus

프로젝트의 현재 상태와 진행 상황을 조회합니다.

**입력 스키마:**
```json
{
  "type": "object",
  "properties": {
    "includeDetails": {
      "type": "boolean",
      "description": "상세 정보 포함 여부",
      "default": false
    }
  }
}
```

**응답 예시:**
```json
{
  "project": {
    "name": "DevFlow Monitor MCP",
    "version": "0.1.0",
    "status": "active",
    "lastActivity": "2025-08-03T06:00:00Z"
  },
  "milestones": {
    "current": "Milestone 1: MVP 기반 구축",
    "progress": {
      "total": 5,
      "completed": 4,
      "current": "테스트 및 문서화"
    }
  },
  "environment": {
    "nodeVersion": "v20.19.1",
    "platform": "darwin",
    "cwd": "/path/to/project"
  }
}
```

### 2. getMetrics

프로젝트 메트릭 정보를 조회합니다.

**입력 스키마:**
```json
{
  "type": "object",
  "properties": {
    "timeRange": {
      "type": "string",
      "description": "시간 범위 (1h, 24h, 7d, 30d)",
      "default": "24h"
    },
    "categories": {
      "type": "array",
      "items": { "type": "string" },
      "description": "포함할 메트릭 카테고리",
      "default": ["all"]
    }
  }
}
```

**응답 예시:**
```json
{
  "timeRange": "24h",
  "timestamp": "2025-08-03T06:00:00Z",
  "metrics": {
    "files": {
      "totalFiles": 125,
      "modifiedFiles": 8,
      "linesOfCode": 15420
    },
    "events": {
      "totalEvents": 342,
      "fileEvents": 89,
      "gitEvents": 15
    },
    "development": {
      "commits": 12,
      "branches": 3,
      "testsRun": 45
    }
  }
}
```

### 3. getActivityLog

개발 활동 로그를 조회합니다.

**입력 스키마:**
```json
{
  "type": "object",
  "properties": {
    "limit": {
      "type": "number",
      "description": "반환할 활동 수",
      "default": 50
    },
    "category": {
      "type": "string",
      "description": "활동 카테고리 필터 (file, git, system, etc.)"
    },
    "since": {
      "type": "string",
      "description": "시작 시간 (ISO 8601 format)"
    }
  }
}
```

**응답 예시:**
```json
{
  "totalActivities": 156,
  "activities": [
    {
      "id": "activity-1",
      "type": "file:created",
      "timestamp": "2025-08-03T05:45:30Z",
      "source": "FileMonitor",
      "data": {
        "path": "/src/events/engine.ts",
        "action": "created",
        "size": 12845
      }
    },
    {
      "id": "activity-2", 
      "type": "git:committed",
      "timestamp": "2025-08-03T05:30:15Z",
      "source": "GitMonitor",
      "data": {
        "message": "feat: add event engine implementation",
        "hash": "abc123def",
        "author": "developer@example.com"
      }
    }
  ]
}
```

### 4. analyzeBottlenecks

개발 프로세스의 병목 현상을 분석합니다.

**입력 스키마:**
```json
{
  "type": "object",
  "properties": {
    "analysisDepth": {
      "type": "string",
      "enum": ["basic", "detailed", "comprehensive"],
      "description": "분석 깊이",
      "default": "basic"
    },
    "timeRange": {
      "type": "string",
      "description": "분석 시간 범위",
      "default": "7d"
    }
  }
}
```

**응답 예시:**
```json
{
  "analysisDepth": "basic",
  "timestamp": "2025-08-03T06:00:00Z",
  "bottlenecks": [
    {
      "category": "testing",
      "severity": "medium",
      "description": "테스트 실행 시간이 평균보다 30% 길어짐",
      "suggestion": "테스트 병렬화 또는 Mock 사용 검토"
    },
    {
      "category": "build",
      "severity": "low", 
      "description": "TypeScript 컴파일 시간 증가",
      "suggestion": "증분 컴파일 설정 최적화"
    }
  ],
  "recommendations": [
    "CI/CD 파이프라인 최적화",
    "코드 리뷰 프로세스 자동화"
  ]
}
```

### 5. getEventStatistics

이벤트 시스템 통계를 조회합니다.

**입력 스키마:**
```json
{
  "type": "object",
  "properties": {}
}
```

**응답 예시:**
```json
{
  "eventEngine": {
    "statistics": {
      "totalEvents": 1523,
      "eventsByCategory": {
        "file": 890,
        "git": 123,
        "system": 45,
        "activity": 234
      },
      "eventsBySeverity": {
        "info": 1420,
        "warning": 89,
        "error": 14
      },
      "eventsPerHour": 12.5,
      "lastEventTime": "2025-08-03T05:59:45Z"
    },
    "queueSize": 0,
    "subscriberCount": 3
  },
  "storage": {
    "database": {
      "tables": 6,
      "totalRows": 1523
    },
    "events": {
      "total": 1523,
      "byType": {
        "file:created": 445,
        "file:changed": 334,
        "file:deleted": 111
      }
    }
  }
}
```

## 이벤트 시스템 API

### EventEngine 클래스

이벤트 발행/구독을 관리하는 핵심 클래스입니다.

#### 메서드

##### `subscribe(pattern, handler, options)`

이벤트를 구독합니다.

**매개변수:**
- `pattern`: 이벤트 패턴 (string | RegExp)
- `handler`: 이벤트 핸들러 함수
- `options`: 구독 옵션 (priority, filter, once 등)

**반환값:** 구독 ID (string)

**예시:**
```typescript
const subscriptionId = eventEngine.subscribe(
  'file:*',
  (event) => console.log('File event:', event),
  { priority: 10 }
);
```

##### `publish(event, options)`

이벤트를 발행합니다.

**매개변수:**
- `event`: 발행할 이벤트 객체
- `options`: 발행 옵션 (sync 등)

**예시:**
```typescript
await eventEngine.publish({
  id: 'event-123',
  type: 'file:created',
  category: EventCategory.FILE,
  timestamp: new Date(),
  severity: EventSeverity.INFO,
  source: 'FileMonitor',
  data: { path: '/new/file.ts' }
});
```

##### `getStatistics()`

이벤트 엔진 통계를 조회합니다.

**반환값:** EventStatistics 객체

### 파일 모니터링 API

#### FileMonitor 클래스

파일 시스템 변경사항을 모니터링합니다.

##### `start()`

파일 모니터링을 시작합니다.

##### `stop()`

파일 모니터링을 중지합니다.

##### `getConfig()`

현재 모니터 설정을 조회합니다.

**반환값:**
```typescript
{
  name: string;
  enabled: boolean;
  paths: string[];
  ignore: string[];
}
```

## 데이터 저장소 API

### StorageManager 클래스

데이터베이스 작업을 관리합니다.

#### 메서드

##### `getStatistics()`

저장소 통계를 조회합니다.

##### `cleanOldData(olderThanDays)`

오래된 데이터를 정리합니다.

**매개변수:**
- `olderThanDays`: 정리할 데이터의 기준 일수 (기본값: 30)

##### `backup(destinationPath)`

데이터베이스를 백업합니다.

**매개변수:**
- `destinationPath`: 백업 파일 경로

## 타입 정의

### BaseEvent

모든 이벤트의 기본 인터페이스입니다.

```typescript
interface BaseEvent {
  id: string;
  type: string;
  category: EventCategory;
  timestamp: Date;
  severity: EventSeverity;
  source: string;
  data: Record<string, any>;
  metadata?: Record<string, any>;
  tags?: string[];
}
```

### EventCategory

이벤트 카테고리 열거형입니다.

```typescript
enum EventCategory {
  SYSTEM = 'system',
  FILE = 'file',
  GIT = 'git',
  BUILD = 'build',
  TEST = 'test',
  DEPLOY = 'deploy',
  API = 'api',
  USER = 'user',
  AI = 'ai',
  ACTIVITY = 'activity',
  STAGE = 'stage',
}
```

### EventSeverity

이벤트 심각도 열거형입니다.

```typescript
enum EventSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}
```

## 오류 처리

### 오류 코드

- `METHOD_NOT_FOUND`: 요청한 도구를 찾을 수 없음
- `INVALID_PARAMS`: 잘못된 매개변수
- `INTERNAL_ERROR`: 내부 서버 오류

### 오류 응답 형식

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "상세 오류 메시지",
    "data": {
      "additionalInfo": "추가 정보"
    }
  }
}
```

## 사용 예시

### Claude Desktop에서 사용

1. 프로젝트 상태 확인:
   ```
   프로젝트의 현재 상태를 확인해주세요.
   ```

2. 활동 로그 조회:
   ```
   최근 24시간 동안의 파일 변경 이력을 보여주세요.
   ```

3. 병목 현상 분석:
   ```
   현재 개발 프로세스에서 병목이 되는 부분을 분석해주세요.
   ```

### 프로그래밍 방식 사용

```typescript
// 이벤트 구독
eventEngine.subscribe('file:created', (event) => {
  console.log('새 파일 생성:', event.data.path);
});

// 파일 모니터링 시작
const fileMonitor = new FileMonitor();
await fileMonitor.start();

// 통계 조회
const stats = await storageManager.getStatistics();
console.log('총 이벤트 수:', stats.events.total);
```

## 제한사항

- 동시 연결 수: 제한 없음
- 이벤트 큐 크기: 메모리 제한에 따름
- 데이터 보관 기간: 기본 30일 (설정 가능)
- 파일 모니터링: 최대 1000개 파일 동시 모니터링

## 성능 고려사항

- 이벤트 발행은 비동기로 처리됩니다
- 대용량 파일 변경 시 debounce가 적용됩니다 (기본 100ms)
- 데이터베이스는 WAL 모드로 최적화되어 있습니다
- 정기적인 데이터 정리를 권장합니다

---

**참고:** 이 문서는 DevFlow Monitor MCP v0.1.0 기준으로 작성되었습니다. 최신 버전의 변경사항은 [CHANGELOG.md](../CHANGELOG.md)를 확인하세요.