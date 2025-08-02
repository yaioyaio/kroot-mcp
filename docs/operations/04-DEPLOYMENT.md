# DevFlow Monitor MCP - 배포 가이드

## 목차
1. [배포 준비](#1-배포-준비)
2. [빌드 프로세스](#2-빌드-프로세스)
3. [MCP 서버 배포](#3-mcp-서버-배포)
4. [Claude Desktop 통합](#4-claude-desktop-통합)
5. [프로덕션 환경 설정](#5-프로덕션-환경-설정)
6. [배포 자동화](#6-배포-자동화)
7. [롤백 절차](#7-롤백-절차)
8. [문제 해결](#8-문제-해결)

## 1. 배포 준비

### 1.1 배포 전 체크리스트
```bash
# 1. 코드 품질 확인
npm run lint
npm run typecheck
npm test
npm run test:coverage

# 2. 의존성 확인
npm audit --production
npm outdated

# 3. 빌드 테스트
npm run build
npm run start

# 4. 환경 변수 확인
cat .env.production
```

### 1.2 버전 관리
```bash
# package.json 버전 업데이트
npm version patch  # 1.0.0 → 1.0.1
npm version minor  # 1.0.1 → 1.1.0
npm version major  # 1.1.0 → 2.0.0

# Git 태그 생성
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### 1.3 릴리즈 노트 작성
```markdown
# Release v1.0.0

## Features
- 파일 시스템 모니터링
- Git 활동 추적
- 개발 단계 자동 인식
- MCP 도구 API

## Bug Fixes
- 메모리 누수 수정
- 연결 타임아웃 처리 개선

## Breaking Changes
- API 엔드포인트 변경: /api/v1/* → /api/v2/*

## Migration Guide
...
```

## 2. 빌드 프로세스

### 2.1 프로덕션 빌드
```bash
# 클린 빌드
npm run clean
npm run build

# 프로덕션 최적화 빌드
NODE_ENV=production npm run build

# 빌드 결과 확인
du -sh dist/
ls -la dist/
```

### 2.2 빌드 최적화
```json
// tsconfig.prod.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "sourceMap": false,
    "removeComments": true,
    "declaration": false,
    "declarationMap": false
  },
  "exclude": [
    "tests/**/*",
    "**/*.test.ts",
    "**/*.spec.ts"
  ]
}
```

### 2.3 번들링 (선택사항)
```bash
# esbuild 설치
npm install -D esbuild

# 번들링 스크립트
cat > scripts/bundle.js << 'EOF'
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['dist/server/index.js'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/bundle.js',
  minify: true,
  sourcemap: 'external',
  external: ['@modelcontextprotocol/sdk']
}).catch(() => process.exit(1));
EOF

node scripts/bundle.js
```

## 3. MCP 서버 배포

### 3.1 로컬 MCP 서버 설치
```bash
# MCP 설정 디렉토리 생성
mkdir -p ~/.config/mcp

# 서버 파일 복사
cp -r dist/ ~/.config/mcp/devflow-monitor/

# 실행 스크립트 생성
cat > ~/.config/mcp/devflow-monitor/start.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
node server/index.js
EOF

chmod +x ~/.config/mcp/devflow-monitor/start.sh
```

### 3.2 MCP 서버 설정
```json
// ~/.config/mcp/servers.json
{
  "devflow-monitor": {
    "command": "node",
    "args": ["/Users/YOUR_USERNAME/.config/mcp/devflow-monitor/server/index.js"],
    "env": {
      "NODE_ENV": "production",
      "MCP_SERVER_PORT": "3000"
    }
  }
}
```

### 3.3 시스템 서비스 등록 (macOS)
```bash
# LaunchAgent 생성
cat > ~/Library/LaunchAgents/com.devflow.monitor.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.devflow.monitor</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/YOUR_USERNAME/.config/mcp/devflow-monitor/server/index.js</string>
    </array>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>/tmp/devflow-monitor.err</string>
    <key>StandardOutPath</key>
    <string>/tmp/devflow-monitor.out</string>
</dict>
</plist>
EOF

# 서비스 로드
launchctl load ~/Library/LaunchAgents/com.devflow.monitor.plist
```

## 4. Claude Desktop 통합

### 4.1 Claude Desktop 설정
```json
// Claude Desktop MCP 설정
{
  "mcpServers": {
    "devflow-monitor": {
      "name": "DevFlow Monitor",
      "description": "Development process monitoring",
      "endpoint": "http://localhost:3000",
      "tools": [
        "getProjectStatus",
        "getMetrics",
        "getActivityLog",
        "analyzeBottlenecks",
        "generateReport"
      ]
    }
  }
}
```

### 4.2 연결 테스트
```bash
# MCP 서버 상태 확인
curl http://localhost:3000/health

# 도구 목록 확인
curl http://localhost:3000/tools

# 테스트 도구 호출
curl -X POST http://localhost:3000/tools/getProjectStatus \
  -H "Content-Type: application/json" \
  -d '{"includeMetrics": true}'
```

### 4.3 Claude Desktop 재시작
```bash
# macOS
osascript -e 'quit app "Claude"'
sleep 2
open -a Claude

# Windows
taskkill /F /IM Claude.exe
start "" "C:\Program Files\Claude\Claude.exe"
```

## 5. 프로덕션 환경 설정

### 5.1 환경 변수
```bash
# .env.production
NODE_ENV=production
MCP_SERVER_PORT=3000
MCP_SERVER_HOST=0.0.0.0

# Database
DATABASE_PATH=/var/lib/devflow/devflow.db
DATABASE_WAL_MODE=true

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=/var/log/devflow/server.log
LOG_MAX_SIZE=10m
LOG_MAX_FILES=7

# Security
CORS_ORIGIN=http://localhost:*
API_RATE_LIMIT=100

# Performance
MAX_CONCURRENT_MONITORS=10
EVENT_BATCH_SIZE=100
CACHE_TTL=300
```

### 5.2 보안 설정
```typescript
// src/server/security.ts
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

export const securityMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"]
      }
    }
  }),
  
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100, // 최대 요청 수
    message: 'Too many requests'
  })
];
```

### 5.3 로깅 설정
```typescript
// src/utils/logger.ts
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const transport = new DailyRotateFile({
  filename: process.env.LOG_FILE_PATH || 'logs/devflow-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '10m',
  maxFiles: '7d'
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    transport,
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

## 6. 배포 자동화

### 6.1 배포 스크립트
```bash
#!/bin/bash
# scripts/deploy.sh

set -e

echo "🚀 Starting deployment..."

# 1. 빌드
echo "📦 Building project..."
npm run clean
npm run build

# 2. 테스트
echo "🧪 Running tests..."
npm test

# 3. 버전 업데이트
echo "📝 Updating version..."
npm version patch

# 4. 배포 디렉토리 준비
DEPLOY_DIR="$HOME/.config/mcp/devflow-monitor"
echo "📁 Preparing deployment directory: $DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# 5. 파일 복사
echo "📋 Copying files..."
cp -r dist/* "$DEPLOY_DIR/"
cp package.json "$DEPLOY_DIR/"
cp .env.production "$DEPLOY_DIR/.env"

# 6. 의존성 설치
echo "📚 Installing production dependencies..."
cd "$DEPLOY_DIR"
npm install --production

# 7. 서비스 재시작
echo "🔄 Restarting service..."
launchctl unload ~/Library/LaunchAgents/com.devflow.monitor.plist
launchctl load ~/Library/LaunchAgents/com.devflow.monitor.plist

echo "✅ Deployment completed!"
```

### 6.2 GitHub Actions 배포
```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build
      run: npm run build
    
    - name: Test
      run: npm test
    
    - name: Create release artifact
      run: |
        tar -czf devflow-monitor-${{ github.ref_name }}.tar.gz \
          dist/ \
          package.json \
          package-lock.json \
          README.md
    
    - name: Create Release
      uses: softprops/action-gh-release@v1
      with:
        files: devflow-monitor-${{ github.ref_name }}.tar.gz
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 7. 롤백 절차

### 7.1 백업 생성
```bash
# 배포 전 백업
BACKUP_DIR="$HOME/.config/mcp/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r ~/.config/mcp/devflow-monitor/* "$BACKUP_DIR/"
```

### 7.2 롤백 스크립트
```bash
#!/bin/bash
# scripts/rollback.sh

BACKUP_DIR="$1"

if [ -z "$BACKUP_DIR" ]; then
  echo "Usage: ./rollback.sh <backup-directory>"
  exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
  echo "Backup directory not found: $BACKUP_DIR"
  exit 1
fi

echo "🔄 Rolling back to: $BACKUP_DIR"

# 서비스 중지
launchctl unload ~/Library/LaunchAgents/com.devflow.monitor.plist

# 파일 복원
rm -rf ~/.config/mcp/devflow-monitor/*
cp -r "$BACKUP_DIR"/* ~/.config/mcp/devflow-monitor/

# 서비스 시작
launchctl load ~/Library/LaunchAgents/com.devflow.monitor.plist

echo "✅ Rollback completed!"
```

## 8. 문제 해결

### 8.1 배포 실패
```bash
# 로그 확인
tail -f /tmp/devflow-monitor.err
tail -f /tmp/devflow-monitor.out

# 프로세스 상태 확인
ps aux | grep devflow
lsof -i :3000

# 서비스 상태 확인
launchctl list | grep devflow
```

### 8.2 연결 문제
```bash
# 포트 확인
netstat -an | grep 3000

# 방화벽 설정 확인
sudo pfctl -s rules

# Claude Desktop 로그 확인
cat ~/Library/Logs/Claude/claude.log
```

### 8.3 성능 문제
```bash
# CPU/메모리 사용량 확인
top -pid $(pgrep -f devflow)

# 디스크 사용량 확인
du -sh ~/.config/mcp/devflow-monitor/

# 데이터베이스 최적화
sqlite3 ~/.config/mcp/devflow-monitor/devflow.db "VACUUM;"
```

## 배포 체크리스트

### 배포 전
- [ ] 모든 테스트 통과
- [ ] 코드 리뷰 완료
- [ ] 문서 업데이트
- [ ] 버전 태깅
- [ ] 백업 생성

### 배포 중
- [ ] 빌드 성공
- [ ] 파일 복사 완료
- [ ] 서비스 재시작
- [ ] 헬스 체크 통과

### 배포 후
- [ ] Claude Desktop 연결 확인
- [ ] 모니터링 정상 작동
- [ ] 로그 확인
- [ ] 성능 모니터링

## 다음 단계

배포가 완료되면 [모니터링 가이드](./05-MONITORING.md)를 참고하여 시스템을 모니터링하세요.

---

작성일: 2025-08-02  
최종 수정일: 2025-08-02  
작성자: yaioyaio