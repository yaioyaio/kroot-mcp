# DevFlow Monitor MCP - 설치 가이드

## 시스템 요구사항

### 최소 요구사항
- **Node.js**: v20.0.0 이상 (LTS 권장)
- **npm**: v10.0.0 이상
- **OS**: Windows 10+, macOS 12+, Ubuntu 20.04+
- **RAM**: 최소 4GB, 권장 8GB
- **디스크**: 1GB 여유 공간

### 권장 요구사항
- **Node.js**: v20.19.1 LTS
- **TypeScript**: v5.3.0 이상 (개발 시)
- **Claude Desktop**: 최신 버전
- **Git**: v2.30.0 이상

## 설치 방법

### 1. 저장소 클론

```bash
git clone https://github.com/yaioyaio/devflow-monitor-mcp.git
cd devflow-monitor-mcp
```

### 2. 의존성 설치

```bash
# npm 사용
npm install

# 또는 yarn 사용
yarn install
```

### 3. 프로젝트 빌드

```bash
# TypeScript 컴파일
npm run build

# 또는 개발 모드로 실행
npm run dev
```

### 4. 설정 검증

프로젝트가 올바르게 설정되었는지 확인합니다:

```bash
# 검증 스크립트 실행
npm run verify

# 또는 수동 검증
./scripts/verify.sh
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
        "/ABSOLUTE/PATH/TO/PROJECT/dist/server/index.js"
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

## 지원 및 도움말

### 문서
- [API 문서](./API.md)
- [기능 명세](./FEATURES.md)
- [프로젝트 구조](./PROJECT_STRUCTURE_AND_STYLE.md)

### 커뮤니티
- **GitHub Issues**: [프로젝트 이슈](https://github.com/yaioyaio/devflow-monitor-mcp/issues)
- **GitHub Discussions**: [커뮤니티 토론](https://github.com/yaioyaio/devflow-monitor-mcp/discussions)

### 기술 지원
1. 먼저 [문제 해결](#문제-해결) 섹션을 확인하세요
2. GitHub Issues에서 유사한 문제를 검색하세요
3. 새로운 이슈를 생성할 때는 다음 정보를 포함하세요:
   - OS 및 버전
   - Node.js 버전
   - 오류 메시지 전문
   - 재현 단계

---

**참고:** 이 가이드는 DevFlow Monitor MCP v0.1.0 기준으로 작성되었습니다. 최신 정보는 [GitHub 저장소](https://github.com/yaioyaio/devflow-monitor-mcp)를 확인하세요.