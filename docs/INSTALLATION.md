# DevFlow Monitor MCP - 설치 가이드

## 목차
1. [시스템 요구사항](#시스템-요구사항)
2. [빠른 설치](#빠른-설치)
3. [수동 설치](#수동-설치)
4. [Docker 설치](#docker-설치)
5. [Claude Desktop 연동](#claude-desktop-연동)
6. [설정 및 환경변수](#설정-및-환경변수)
7. [문제 해결](#문제-해결)

## 시스템 요구사항

### 최소 요구사항
- **Node.js**: v20.0.0 이상 (LTS 권장)
- **npm**: v10.0.0 이상
- **OS**: Windows 10+, macOS 12+, Ubuntu 20.04+
- **RAM**: 최소 4GB, 권장 8GB
- **디스크**: 1GB 여유 공간

### 권장 요구사항
- **Node.js**: v20.19.1 LTS
- **TypeScript**: v5.9.2 이상 (개발 시)
- **Claude Desktop**: 최신 버전
- **Git**: v2.30.0 이상
- **Docker**: 20.10 이상 (Docker 설치 시)

### 선택적 요구사항
- **Docker Desktop**: Docker 기반 설치 시
- **Visual Studio Code**: 개발 환경
- **SQLite**: 데이터베이스 (자동 설치됨)

## 빠른 설치

### 자동 설치 스크립트 사용 (권장)

가장 간단한 설치 방법입니다:

```bash
# 저장소 클론
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp

# 자동 설치 스크립트 실행
./scripts/deploy/install-local.sh
```

이 스크립트는 다음 작업을 자동으로 수행합니다:
- 필수 요구사항 확인
- 프로젝트 빌드
- `~/.config/mcp/devflow-monitor`에 설치
- Claude Desktop 설정 자동 구성
- 시작 스크립트 생성

### 업데이트

기존 설치를 업데이트하려면:

```bash
./scripts/deploy/update-local.sh
```

## 수동 설치

### 1. 저장소 클론

```bash
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp
```

### 2. 의존성 설치

```bash
# 개발 및 프로덕션 의존성 모두 설치
npm install

# 또는 프로덕션 의존성만 설치
npm ci --only=production
```

### 3. 프로젝트 빌드

```bash
# TypeScript 컴파일
npm run build

# 빌드 확인
ls -la dist/
```

### 4. 설정 검증

프로젝트가 올바르게 설정되었는지 확인합니다:

```bash
# 검증 스크립트 실행
npm run verify

# 또는 수동 검증
./scripts/verify.sh
```

## Docker 설치

### Docker Compose 사용 (권장)

가장 간단한 Docker 기반 설치 방법입니다:

```bash
# 저장소 클론
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp

# 개발 환경
docker-compose up -d

# 프로덕션 환경
docker-compose -f docker-compose.prod.yml up -d
```

### Docker 빌드 및 실행

```bash
# Docker 이미지 빌드
docker build -t devflow-monitor:latest .

# 컨테이너 실행
docker run -d \
  --name devflow-monitor \
  -p 127.0.0.1:3000:3000 \
  -v devflow-data:/app/data \
  -v devflow-logs:/app/logs \
  devflow-monitor:latest
```

### Docker 배포 스크립트 사용

```bash
# 자동 배포 스크립트
./scripts/deploy/deploy-docker.sh

# 프로덕션 배포
./scripts/deploy/deploy-docker.sh --compose prod
```

### Docker 관리 명령어

```bash
# 컨테이너 상태 확인
docker ps | grep devflow-monitor

# 로그 확인
docker logs -f devflow-monitor

# 컨테이너 중지
docker stop devflow-monitor

# 컨테이너 시작
docker start devflow-monitor

# 컨테이너 제거
docker rm devflow-monitor
```

## Claude Desktop 연동 설정

### 1. Claude Desktop 설정 파일 생성

Claude Desktop 설정 파일을 생성합니다:

**macOS:**
```bash
# 설정 디렉토리 생성
mkdir -p ~/Library/Application\ Support/Claude/

# 설정 파일 복사
cp claude-desktop-config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
# 설정 디렉토리로 이동
cd %APPDATA%\Claude\

# 설정 파일 복사
copy /path/to/project/claude-desktop-config.json claude_desktop_config.json
```

**Linux:**
```bash
# 설정 디렉토리 생성
mkdir -p ~/.config/Claude/

# 설정 파일 복사
cp claude-desktop-config.json ~/.config/Claude/claude_desktop_config.json
```

### 2. 설정 파일 편집

`claude_desktop_config.json` 파일을 열어 프로젝트 경로를 수정합니다:

```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "node",
      "args": [
        "~/.config/mcp/devflow-monitor/server/index.js"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**중요:** `/ABSOLUTE/PATH/TO/PROJECT`를 실제 프로젝트 절대 경로로 변경하세요.

### 3. Claude Desktop 재시작

설정을 적용하기 위해 Claude Desktop을 완전히 종료하고 재시작합니다.

### 4. 연동 테스트

Claude Desktop에서 다음과 같이 테스트합니다:

```
프로젝트 상태를 확인해주세요.
```

정상적으로 작동하면 프로젝트 정보가 표시됩니다.

## 개발 환경 설정

### 1. 개발 도구 설치

```bash
# 전역 개발 도구 설치
npm install -g typescript@latest
npm install -g eslint@latest
npm install -g prettier@latest
```

### 2. VS Code 확장 프로그램

다음 확장 프로그램 설치를 권장합니다:

- **TypeScript**: 기본 내장
- **ESLint**: `ms-vscode.vscode-eslint`
- **Prettier**: `esbenp.prettier-vscode`
- **GitLens**: `eamodio.gitlens`
- **Auto Rename Tag**: `formulahendry.auto-rename-tag`

### 3. Git Hooks 설정

```bash
# Git hooks 설정 (선택사항)
npx husky install
npx husky add .husky/pre-commit "npm run lint && npm run typecheck"
npx husky add .husky/pre-push "npm run test"
```

## 설정 및 환경변수

### 환경 설정 파일

DevFlow Monitor는 환경별 설정을 지원합니다:

```bash
# 환경 변수 파일 생성
cp .env.example .env

# .env 파일 편집
nano .env
```

### 주요 환경 변수

```bash
# 서버 설정
NODE_ENV=production
MCP_SERVER_PORT=3000
MCP_SERVER_HOST=0.0.0.0

# 데이터베이스
DATABASE_PATH=./data/devflow.db

# 로깅
LOG_LEVEL=info
LOG_FILE_PATH=./logs/server.log

# 보안 (프로덕션 필수)
JWT_SECRET=your-secret-jwt-key
API_KEY_SALT=your-api-key-salt

# 성능
MAX_CONCURRENT_MONITORS=10
EVENT_BATCH_SIZE=100
CACHE_TTL=300
```

### 설정 파일 구조

```
config/
├── default.json          # 기본 설정
├── environments/
│   ├── development.json  # 개발 환경
│   ├── production.json   # 프로덕션 환경
│   └── test.json        # 테스트 환경
```

## 환경별 설정

### 개발 환경

```bash
# 개발 서버 실행
npm run dev

# 파일 변경 시 자동 재시작
npm run watch
```

### 프로덕션 환경

```bash
# 프로덕션 빌드
npm run build

# 프로덕션 서버 실행
npm start
```

### 테스트 환경

```bash
# 단위 테스트 실행
npm test

# 테스트 커버리지 확인
npm run test:coverage

# 통합 테스트 실행
npm run integration:test
```

## 문제 해결

### 일반적인 문제들

#### 1. Node.js 버전 문제

```bash
# Node.js 버전 확인
node --version

# nvm을 사용한 버전 관리 (권장)
nvm install 20.19.1
nvm use 20.19.1
```

#### 2. 의존성 설치 실패

```bash
# npm 캐시 정리
npm cache clean --force

# node_modules 제거 후 재설치
rm -rf node_modules package-lock.json
npm install
```

#### 3. 권한 문제 (Linux/macOS)

```bash
# npm 권한 설정
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

#### 4. TypeScript 컴파일 오류

```bash
# TypeScript 설정 확인
npm run typecheck

# 타입 정의 파일 재설치
rm -rf node_modules/@types
npm install
```

### Claude Desktop 연동 문제

#### 1. MCP 서버 연결 실패

1. 설정 파일 경로 확인:
   ```bash
   # macOS
   ls -la ~/Library/Application\ Support/Claude/claude_desktop_config.json
   
   # Windows
   dir %APPDATA%\Claude\claude_desktop_config.json
   
   # Linux
   ls -la ~/.config/Claude/claude_desktop_config.json
   ```

2. 프로젝트 경로 확인:
   ```bash
   # 절대 경로 확인
   pwd
   ls -la dist/server/index.js
   ```

3. 파일 권한 확인:
   ```bash
   # 실행 권한 부여
   chmod +x dist/server/index.js
   ```

#### 2. JSON 설정 파일 오류

설정 파일의 JSON 문법을 검증합니다:

```bash
# JSON 문법 검증
node -e "console.log(JSON.parse(require('fs').readFileSync('claude-desktop-config.json', 'utf8')))"
```

#### 3. 디버그 모드 실행

```bash
# 디버그 모드로 서버 실행
DEBUG=true node dist/server/index.js
```

### 로그 확인

#### 1. 애플리케이션 로그

```bash
# 로그 파일 확인 (있는 경우)
tail -f logs/app.log

# 또는 직접 실행 시 콘솔 출력 확인
npm run dev
```

#### 2. Claude Desktop 로그

**macOS:**
```bash
# 콘솔 앱에서 Claude 로그 확인
open /Applications/Utilities/Console.app
# 필터: Claude
```

**Windows:**
```
이벤트 뷰어에서 Claude 관련 로그 확인
```

## 성능 최적화

### 1. 파일 모니터링 최적화

```bash
# 큰 디렉토리 제외 설정
# .gitignore에 추가:
node_modules/
dist/
.git/
*.log
```

### 2. 데이터베이스 최적화

```bash
# 정기적인 데이터 정리 (cron 작업 추가)
# 매일 자정에 30일 이상 된 데이터 정리
0 0 * * * cd /path/to/project && npm run cleanup
```

### 3. 메모리 사용량 모니터링

```bash
# 메모리 사용량 확인
node -e "console.log(process.memoryUsage())"

# Node.js 메모리 제한 설정 (필요시)
node --max-old-space-size=2048 dist/server/index.js
```

## 업데이트

### 1. 프로젝트 업데이트

```bash
# Git에서 최신 코드 가져오기
git pull origin main

# 의존성 업데이트
npm update

# 다시 빌드
npm run build
```

### 2. 의존성 보안 업데이트

```bash
# 보안 취약점 확인
npm audit

# 자동 수정
npm audit fix

# 수동 업데이트가 필요한 경우
npm audit fix --force
```

## 검증 및 진단

### 설치 검증

설치가 올바르게 되었는지 확인합니다:

```bash
# 검증 스크립트 실행
npm run verify

# 또는 개별 검증
node scripts/verify.js
```

검증 항목:
- ✓ Node.js 버전 확인
- ✓ 필수 의존성 설치 확인
- ✓ 빌드 결과 확인
- ✓ 설정 파일 유효성
- ✓ 데이터베이스 연결
- ✓ MCP 서버 시작 가능 여부

### 시스템 진단

문제 발생 시 진단 도구를 사용합니다:

```bash
# 시스템 진단
npm run diagnose

# 상세 로그와 함께 실행
DEBUG=* npm run diagnose
```

### 헬스 체크

서버 상태를 확인합니다:

```bash
# 헬스 체크 엔드포인트
curl http://localhost:3000/health

# MCP 도구로 확인
node -e "require('./dist/server/index.js').checkHealth()"
```

## 고급 설정

### 커스텀 플러그인

DevFlow Monitor는 플러그인 시스템을 지원합니다:

```javascript
// plugins/my-plugin.js
module.exports = {
  name: 'my-plugin',
  version: '1.0.0',
  register: async (server) => {
    // 플러그인 로직
    server.addTool({
      name: 'myCustomTool',
      description: 'Custom tool description',
      inputSchema: { /* ... */ },
      handler: async (args) => {
        // 도구 구현
      }
    });
  }
};
```

### 인증 설정

프로덕션 환경에서는 인증을 활성화해야 합니다:

```json
// config/environments/production.json
{
  "security": {
    "auth": {
      "enabled": true,
      "jwt": {
        "secret": "${JWT_SECRET}",
        "expiresIn": "24h"
      },
      "apiKey": {
        "salt": "${API_KEY_SALT}"
      }
    }
  }
}
```

### 모니터링 커스터마이징

특정 파일이나 디렉토리를 모니터링에서 제외:

```json
// config/custom-monitoring.json
{
  "monitoring": {
    "fileSystem": {
      "ignorePatterns": [
        "**/node_modules/**",
        "**/dist/**",
        "**/.git/**",
        "**/coverage/**",
        "**/*.log",
        "**/tmp/**"
      ],
      "watchExtensions": [
        ".ts", ".tsx", ".js", ".jsx",
        ".json", ".md", ".yml", ".yaml"
      ]
    }
  }
}
```

### 성능 튜닝

대규모 프로젝트를 위한 성능 최적화:

```bash
# 메모리 제한 증가
node --max-old-space-size=4096 dist/server/index.js

# 워커 스레드 활성화
WORKER_THREADS=4 npm start

# 캐시 크기 조정
CACHE_MAX_SIZE=1000000 npm start
```

성능 설정 예시:

```json
{
  "performance": {
    "cache": {
      "enabled": true,
      "ttl": 600,
      "maxSize": 100000
    },
    "scaling": {
      "enabled": true,
      "minWorkers": 2,
      "maxWorkers": 8,
      "scaleUpThreshold": 0.8,
      "scaleDownThreshold": 0.3
    }
  }
}
```

## 통합 가이드

### VS Code 통합

1. VS Code 설정에 추가:
   ```json
   // .vscode/settings.json
   {
     "devflow.monitor": {
       "enabled": true,
       "serverPath": "~/.config/mcp/devflow-monitor"
     }
   }
   ```

2. Tasks 설정:
   ```json
   // .vscode/tasks.json
   {
     "version": "2.0.0",
     "tasks": [
       {
         "label": "Start DevFlow Monitor",
         "type": "shell",
         "command": "npm",
         "args": ["start"],
         "problemMatcher": []
       }
     ]
   }
   ```

### CI/CD 통합

GitHub Actions 예시:

```yaml
# .github/workflows/devflow-monitor.yml
name: DevFlow Monitor

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - name: Run DevFlow Analysis
        run: |
          npm start -- analyze --report
```

### API 통합

외부 서비스와 통합하기:

```javascript
// 예시: Jira 통합
const { JiraClient } = require('devflow-monitor');

const jira = new JiraClient({
  baseUrl: 'https://your-domain.atlassian.net',
  email: 'your-email@example.com',
  token: process.env.JIRA_API_TOKEN
});

// 이슈 생성
await jira.createIssue({
  project: 'DEV',
  summary: 'Performance bottleneck detected',
  description: 'High memory usage in production'
});
```

## 백업 및 복구

### 데이터 백업

```bash
# 데이터베이스 백업
npm run backup

# 특정 위치에 백업
npm run backup -- --output /path/to/backup

# 자동 백업 설정 (cron)
0 2 * * * cd /path/to/devflow-monitor && npm run backup
```

### 데이터 복구

```bash
# 백업에서 복구
npm run restore -- --input /path/to/backup/devflow-backup-20250804.db

# 특정 시점으로 복구
npm run restore -- --timestamp "2025-08-04 10:00:00"
```

### 마이그레이션

버전 업그레이드 시:

```bash
# 마이그레이션 실행
npm run migrate

# 마이그레이션 롤백
npm run migrate:rollback

# 마이그레이션 상태 확인
npm run migrate:status
```

## 보안 권장사항

### 1. 프로덕션 체크리스트

- [ ] 강력한 JWT_SECRET 설정 (최소 32자)
- [ ] API_KEY_SALT 설정 (최소 16자)
- [ ] HTTPS 사용 (리버스 프록시)
- [ ] 방화벽 규칙 설정
- [ ] 정기적인 보안 업데이트
- [ ] 감사 로그 활성화
- [ ] 백업 암호화

### 2. 접근 제어

```nginx
# nginx 설정 예시
server {
    listen 443 ssl http2;
    server_name devflow.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        
        # IP 제한
        allow 192.168.1.0/24;
        deny all;
    }
}
```

### 3. 모니터링 보안

```bash
# 보안 이벤트 모니터링
tail -f logs/security.log | grep "WARN\|ERROR"

# 비정상 접근 감지
npm run security:audit
```

## 지원 및 도움말

### 문서
- [API 문서](./API.md)
- [기능 명세](./FEATURES.md)
- [프로젝트 구조](./PROJECT_STRUCTURE_AND_STYLE.md)
- [사용자 매뉴얼](./USER_MANUAL.md)
- [FAQ](./FAQ.md)

### 커뮤니티
- **GitHub Issues**: [프로젝트 이슈](https://github.com/yaioyaio/kroot-mcp/issues)
- **GitHub Discussions**: [커뮤니티 토론](https://github.com/yaioyaio/kroot-mcp/discussions)

### 기술 지원
1. 먼저 [문제 해결](#문제-해결) 섹션을 확인하세요
2. [FAQ](./FAQ.md)에서 자주 묻는 질문을 확인하세요
3. GitHub Issues에서 유사한 문제를 검색하세요
4. 새로운 이슈를 생성할 때는 다음 정보를 포함하세요:
   - OS 및 버전
   - Node.js 버전
   - 오류 메시지 전문
   - 재현 단계
   - 관련 로그 파일

### 버전 정보

- **현재 버전**: v0.1.0
- **최소 Node.js**: v20.0.0
- **권장 Node.js**: v20.19.1 LTS
- **지원 플랫폼**: Windows, macOS, Linux

---

**참고:** 이 가이드는 DevFlow Monitor MCP v0.1.0 기준으로 작성되었습니다. 최신 정보는 [GitHub 저장소](https://github.com/yaioyaio/kroot-mcp)를 확인하세요.

**최종 수정일**: 2025-08-04