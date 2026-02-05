# MCP 서버 테스트 가이드

## 개요

Claude Desktop 없이 MCP (Model Context Protocol) 서버를 빠르고 효율적으로 테스트하는 방법들을 제공합니다.

## 테스트 방법들

### 1. MCP Inspector 사용 (권장)

MCP Inspector는 브라우저 기반 GUI로 MCP 서버를 테스트할 수 있는 공식 도구입니다.

#### 설치
```bash
poetry install -g @modelcontextprotocol/inspector
```

#### 실행
```bash
# 프로젝트 루트에서 실행
mcp-inspector python src/server/index.js
```

#### 사용법
1. 브라우저에서 `http://localhost:5173` 접속
2. 서버가 자동으로 초기화됨
3. Tools 탭에서 사용 가능한 도구 확인
4. 각 도구를 클릭하여 파라미터 입력 후 실행
5. 실시간으로 요청/응답 확인 가능

### 2. 직접 STDIO 테스트

#### 간단한 테스트
```bash
# 초기화 테스트
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' | python src/server/index.js

# 도구 목록 확인
(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}'; 
 sleep 0.5; 
 echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}') | python src/server/index.js
```

### 3. 테스트 스크립트 사용

#### test-mcp.sh
```bash
#!/bin/bash
# MCP 서버 기본 테스트 스크립트

echo "🧪 Testing MCP Server..."

# 초기화 테스트
echo "1. Testing initialization..."
INIT_RESPONSE=$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | timeout 5s python src/server/index.js 2>&1)

if echo "$INIT_RESPONSE" | grep -q '"initialized"'; then
    echo "✅ Initialization successful"
else
    echo "❌ Initialization failed"
    echo "$INIT_RESPONSE"
    exit 1
fi

# 도구 목록 테스트
echo "2. Testing tools list..."
TOOLS_RESPONSE=$((echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}'; 
                  sleep 0.5; 
                  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}') | timeout 5s python src/server/index.js 2>&1)

if echo "$TOOLS_RESPONSE" | grep -q '"getProjectStatus"'; then
    echo "✅ Tools list successful"
    TOOL_COUNT=$(echo "$TOOLS_RESPONSE" | grep -o '"name"' | wc -l)
    echo "   Found $TOOL_COUNT tools"
else
    echo "❌ Tools list failed"
fi

# 특정 도구 호출 테스트
echo "3. Testing tool execution..."
TOOL_RESPONSE=$((echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}'; 
                 sleep 0.5; 
                 echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"getProjectStatus","arguments":{}}}') | timeout 5s python src/server/index.js 2>&1)

if echo "$TOOL_RESPONSE" | grep -q '"content"'; then
    echo "✅ Tool execution successful"
else
    echo "❌ Tool execution failed"
fi

echo "✨ Test completed!"
```

#### test-mcp-client.js
```javascript
// Python 기반 MCP 클라이언트 테스트
import { spawn } from 'child_process';

class MCPTestClient {
  constructor() {
    this.server = null;
    this.requestId = 0;
  }

  start() {
    this.server = spawn('node', ['src/server/index.js']);
    
    this.server.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        try {
          const response = JSON.parse(line);
          console.log('📥 Response:', JSON.stringify(response, null, 2));
        } catch (e) {
          // Ignore non-JSON output
        }
      });
    });

    this.server.stderr.on('data', (data) => {
      console.error('❌ Error:', data.toString());
    });

    this.server.on('close', (code) => {
      console.log(`Server exited with code ${code}`);
    });
  }

  sendRequest(method, params = {}) {
    const request = {
      jsonrpc: "2.0",
      id: ++this.requestId,
      method: method,
      params: params
    };
    
    console.log('📤 Request:', JSON.stringify(request, null, 2));
    this.server.stdin.write(JSON.stringify(request) + '\n');
  }

  async test() {
    this.start();
    
    // Initialize
    this.sendRequest('initialize', {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" }
    });

    // Wait and get tools
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.sendRequest('tools/list');

    // Test a tool
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.sendRequest('tools/call', {
      name: 'getProjectStatus',
      arguments: {}
    });

    // Cleanup
    setTimeout(() => {
      this.server.kill();
    }, 5000);
  }
}

// Run test
const client = new MCPTestClient();
client.test();
```

### 4. VS Code 디버깅

`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "debugpy",
      "request": "launch",
      "name": "Debug MCP Server",
      "module": "devflow_monitor",
      "console": "integratedTerminal",
      "cwd": "${workspaceFolder}",
      "env": {
        "DEVFLOW_ENV": "development",
        "DEVFLOW_DEBUG": "true"
      }
    },
    {
      "type": "debugpy",
      "request": "launch",
      "name": "Debug with MCP Inspector",
      "module": "devflow_monitor",
      "console": "integratedTerminal",
      "cwd": "${workspaceFolder}"
    }
  ]
}
```

### 5. 자동화된 테스트

#### 테스트 스크립트 사용
```bash
# MCP 테스트 실행
./scripts/test-mcp.sh

# 또는 직접 실행
poetry run pytest tests/ -v

# MCP 서버 디버그 모드 실행
DEVFLOW_DEBUG=true poetry run python -m devflow_monitor
```

## 일반적인 테스트 시나리오

### 1. 서버 초기화 확인
- 서버가 올바르게 시작되는지 확인
- 초기화 응답에 서버 정보 포함 여부 확인

### 2. 도구 목록 확인
- 87개의 도구가 모두 등록되었는지 확인
- 각 도구의 스키마가 올바른지 확인

### 3. 주요 도구 테스트
- `getProjectStatus`: 프로젝트 상태 확인
- `getMetrics`: 메트릭 수집 확인
- `getActivityLog`: 활동 로그 확인

### 4. 오류 처리 테스트
- 잘못된 도구 이름으로 호출
- 필수 파라미터 누락
- 잘못된 파라미터 타입

## 트러블슈팅

### 문제: "Cannot open database" 오류
- 해결: `data` 디렉토리가 있는지 확인
- `mkdir -p data logs/audit` 실행

### 문제: JSON 파싱 오류
- 원인: console.log가 stdout에 출력
- 해결: console.log 대신 console.error 사용

### 문제: 서버가 즉시 종료됨
- 원인: 초기화 오류
- 해결: stderr 출력 확인

## 유용한 팁

1. **로그 레벨 조정**: `DEBUG=* python src/server/index.js`
2. **Pretty JSON 출력**: 응답을 `jq` 명령어로 파이프
3. **실시간 모니터링**: `tail -f` 로 로그 파일 모니터링

## 참고 자료

- [MCP 공식 문서](https://modelcontextprotocol.io)
- [MCP Inspector GitHub](https://github.com/modelcontextprotocol/inspector)
- [프로젝트 README](../README.md)

---

작성일: 2026-02-06
작성자: Claude & yaio