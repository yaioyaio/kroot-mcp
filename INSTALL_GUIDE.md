# Better-SQLite3 설치 가이드

## 문제 상황
- 개발 환경: ARM64 (Apple Silicon Native) Node.js
- Claude Desktop: x86_64 (Rosetta) Node.js  
- better-sqlite3는 native 모듈로 각 아키텍처별 빌드 필요

## 해결 방법

### Claude Desktop 사용자

1. **x86_64 Node.js 사용 중인 경우**
```bash
# x86_64 바이너리 설치
npm install better-sqlite3

# 또는 강제 x86_64 빌드
arch -x86_64 npm install better-sqlite3
```

2. **설정 확인**
```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "/path/to/x86_64/node",
      "args": ["/path/to/kroot-mcp/dist/server/index.js"]
    }
  }
}
```

### 개발자 (터미널 사용)

1. **ARM64 Mac (M1/M2)**
```bash
# ARM64 네이티브 설치
npm install better-sqlite3
```

2. **Intel Mac 또는 Linux**
```bash
# 일반 설치
npm install better-sqlite3
```

### 문제 해결

**에러: "incompatible architecture"**
- 원인: Node.js와 better-sqlite3 아키텍처 불일치
- 해결: 
  ```bash
  # 현재 Node.js 아키텍처 확인
  node -p process.arch
  
  # 설치된 바이너리 확인
  file node_modules/better-sqlite3/build/Release/better_sqlite3.node
  ```

**Claude Desktop 전용 설치**
```bash
# 1. 프로젝트 디렉토리에서
cd /path/to/kroot-mcp

# 2. x86_64 전용 설치
arch -x86_64 npm install better-sqlite3

# 3. 빌드
npm run build

# 4. Claude Desktop 재시작
```

## 장기 해결책

1. **CI/CD에서 다중 플랫폼 빌드**
2. **Docker 컨테이너 사용**
3. **Pure JavaScript 데이터베이스로 마이그레이션**

## 현재 상태
- better-sqlite3 v9.6.0 사용 중
- x86_64 바이너리 필요 (Claude Desktop)
- ARM64 바이너리 필요 (개발 환경)