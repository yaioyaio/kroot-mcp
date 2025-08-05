# Basic Plugin Template

DevFlow Monitor용 기본 플러그인 템플릿입니다.

## 개요

이 템플릿은 DevFlow Monitor 플러그인 개발을 위한 기본 구조와 패턴을 제공합니다. 새로운 플러그인을 개발할 때 이 템플릿을 기반으로 시작할 수 있습니다.

## 기능

- ✅ 기본 플러그인 라이프사이클 구현
- ✅ 이벤트 처리 시스템
- ✅ 설정 관리
- ✅ 헬스 체크
- ✅ 로깅 시스템
- ✅ 오류 처리

## 구조

```
basic-plugin/
├── package.json      # 플러그인 매니페스트
├── index.ts          # 메인 플러그인 클래스
├── tsconfig.json     # TypeScript 설정
└── README.md         # 문서
```

## 설치

```bash
# 플러그인 디렉토리로 이동
cd plugins/basic-plugin

# 종속성 설치
npm install

# 빌드
npm run build
```

## 설정

플러그인 설정은 `package.json`의 `configSchema`에 정의되어 있습니다:

```json
{
  "enabled": true,
  "logLevel": "info"
}
```

### 설정 옵션

- `enabled` (boolean): 플러그인 활성화 여부
- `logLevel` (string): 로그 레벨 (debug, info, warn, error)

## 개발

### 플러그인 클래스 구현

모든 플러그인은 `Plugin` 인터페이스를 구현해야 합니다:

```typescript
export class MyPlugin implements Plugin {
  readonly metadata: PluginMetadata = { /* ... */ };
  
  async initialize(context: PluginAPIContext): Promise<void> {
    // 초기화 로직
  }
  
  async activate(): Promise<void> {
    // 활성화 로직
  }
  
  async deactivate(): Promise<void> {
    // 비활성화 로직
  }
  
  async dispose(): Promise<void> {
    // 정리 로직
  }
}
```

### 이벤트 처리

플러그인은 DevFlow Monitor의 다양한 이벤트를 수신할 수 있습니다:

```typescript
// 파일 이벤트 수신
context.events.on('file.*', (event) => {
  console.log('File event:', event.type, event.data);
});

// Git 이벤트 수신
context.events.on('git.*', (event) => {
  console.log('Git event:', event.type, event.data);
});

// 커스텀 이벤트 발생
context.events.emit('plugin.custom', {
  message: 'Hello from plugin!'
});
```

### API 사용

플러그인 컨텍스트를 통해 다양한 API에 접근할 수 있습니다:

```typescript
// 로깅
context.logger.info('Plugin message');

// 파일 시스템 (권한 필요)
const content = await context.fs.readFile('/path/to/file');

// HTTP 클라이언트 (권한 필요)
const response = await context.http.get('https://api.example.com');

// 스토리지
await context.storage.set('key', 'value');
const value = await context.storage.get('key');

// 알림 (권한 필요)
await context.notifications.send('Hello!', 'info');
```

### 권한 관리

플러그인이 사용할 수 있는 기능은 `package.json`의 `permissions` 배열에 정의해야 합니다:

```json
{
  "permissions": [
    "events:read",
    "events:write",
    "files:read",
    "files:write",
    "network:access",
    "notifications:send"
  ]
}
```

### 헬스 체크

플러그인의 상태를 모니터링하기 위해 헬스 체크를 구현하세요:

```typescript
async healthCheck(): Promise<PluginHealthStatus> {
  try {
    // 상태 확인 로직
    return {
      status: 'healthy',
      message: 'Plugin is running normally',
      lastCheck: new Date()
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message,
      lastCheck: new Date()
    };
  }
}
```

## 테스트

```bash
# 개발 모드로 실행
npm run dev

# 빌드
npm run build

# 정리
npm run clean
```

## 배포

1. 플러그인을 빌드합니다:
   ```bash
   npm run build
   ```

2. 플러그인 디렉토리를 DevFlow Monitor의 플러그인 폴더에 복사합니다.

3. DevFlow Monitor를 재시작하거나 핫 리로드를 사용합니다.

## 고급 기능

### 커스텀 MCP 도구 등록

```typescript
context.mcp.registerTool(
  'myCustomTool',
  'Description of my custom tool',
  async (args) => {
    // 도구 로직
    return { result: 'success' };
  }
);
```

### 플러그인 간 통신

```typescript
// 다른 플러그인에 메시지 전송
await context.communication.sendMessage('other-plugin-id', {
  type: 'greeting',
  message: 'Hello!'
});

// 브로드캐스트
context.communication.broadcast('my-event', { data: 'value' });

// 이벤트 구독
context.communication.subscribe('other-event', (data) => {
  console.log('Received:', data);
});
```

## 문제 해결

### 일반적인 오류

1. **Permission denied**: 필요한 권한이 `package.json`에 정의되어 있는지 확인하세요.

2. **Module not found**: 종속성이 설치되어 있고 `package.json`에 정의되어 있는지 확인하세요.

3. **Plugin not loading**: 플러그인 매니페스트가 올바른지, 필수 필드가 모두 있는지 확인하세요.

### 디버깅

로그 레벨을 `debug`로 설정하여 자세한 정보를 확인할 수 있습니다:

```json
{
  "logLevel": "debug"
}
```

## 라이선스

MIT License