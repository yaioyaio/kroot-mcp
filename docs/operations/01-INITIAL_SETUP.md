# DevFlow Monitor MCP - 초기 설정 가이드

## 목차
1. [개발 환경 요구사항](#1-개발-환경-요구사항)
2. [프로젝트 클론](#2-프로젝트-클론)
3. [의존성 설치](#3-의존성-설치)
4. [프로젝트 초기화](#4-프로젝트-초기화)
5. [환경 변수 설정](#5-환경-변수-설정)
6. [IDE 설정](#6-ide-설정)
7. [문제 해결](#7-문제-해결)

## 1. 개발 환경 요구사항

### 필수 소프트웨어
- **Node.js**: v20.0.0 이상 (LTS 버전 권장)
- **npm**: v8.0.0 이상
- **Git**: v2.30.0 이상

### 권장 소프트웨어
- **VS Code**: 최신 버전
- **TypeScript**: v5.3.0 이상 (프로젝트에 포함)

### 운영체제
- macOS 12.0 이상
- Windows 10/11 (WSL2 권장)
- Ubuntu 20.04 LTS 이상

## 2. 프로젝트 클론

```bash
# HTTPS를 사용하는 경우
git clone https://github.com/yaioyaio/kroot-mcp.git

# SSH를 사용하는 경우
git clone git@github.com:yaioyaio/kroot-mcp.git

# 프로젝트 디렉토리로 이동
cd kroot-mcp
```

## 3. 의존성 설치

### 3.1 Node.js 버전 확인
```bash
# Node.js 버전 확인 (v20.0.0 이상이어야 함)
node --version

# npm 버전 확인
npm --version
```

### 3.2 패키지 설치
```bash
# 모든 의존성 설치
npm install

# 개발 의존성만 설치
npm install --only=dev

# 프로덕션 의존성만 설치
npm install --only=prod
```

### 3.3 전역 도구 설치 (선택사항)
```bash
# TypeScript 컴파일러
npm install -g typescript

# MCP CLI (사용 가능한 경우)
npm install -g @modelcontextprotocol/cli
```

## 4. 프로젝트 초기화

### 4.1 TypeScript 설정
```bash
# TypeScript 설정 파일이 없는 경우
npx tsc --init

# 기존 설정 확인
cat tsconfig.json
```

### 4.2 프로젝트 구조 생성
```bash
# 필수 디렉토리가 없는 경우 생성
mkdir -p src/{server,monitors,events,analyzers,storage,tools,dashboard}
mkdir -p tests/{unit,integration,e2e,fixtures}
mkdir -p config scripts
```

### 4.3 Git 설정
```bash
# Git 사용자 정보 설정
git config user.name "Your Name"
git config user.email "your.email@example.com"

# 기본 브랜치 설정
git config init.defaultBranch main
```

## 5. 환경 변수 설정

### 5.1 환경 변수 파일 생성
```bash
# .env 파일 생성
cp .env.example .env

# .env 파일이 없는 경우 직접 생성
cat > .env << EOF
# MCP Server Configuration
MCP_SERVER_PORT=3000
MCP_SERVER_HOST=localhost

# Database Configuration
DATABASE_PATH=./data/devflow.db

# Logging Configuration
LOG_LEVEL=info
LOG_FILE_PATH=./logs/devflow.log

# Development Settings
NODE_ENV=development
DEBUG=devflow:*
EOF
```

### 5.2 환경별 설정
```bash
# 개발 환경
cp .env .env.development

# 테스트 환경
cp .env .env.test

# 프로덕션 환경
cp .env .env.production
```

## 6. IDE 설정

### 6.1 VS Code 확장 프로그램
필수 확장 프로그램 설치:
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next",
    "streetsidesoftware.code-spell-checker",
    "eamodio.gitlens",
    "usernamehw.errorlens"
  ]
}
```

### 6.2 VS Code 설정
`.vscode/settings.json` 파일 생성:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "files.exclude": {
    "**/.git": true,
    "**/.DS_Store": true,
    "**/node_modules": true,
    "**/dist": true,
    "**/coverage": true
  }
}
```

### 6.3 디버그 설정
`.vscode/launch.json` 파일 생성:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug MCP Server",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/dist/server/index.js",
      "preLaunchTask": "npm: build",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "envFile": "${workspaceFolder}/.env"
    }
  ]
}
```

## 7. 문제 해결

### 7.1 Node.js 버전 문제
```bash
# nvm을 사용하여 Node.js 버전 관리
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

### 7.2 권한 문제
```bash
# npm 전역 설치 권한 문제 해결
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### 7.3 의존성 충돌
```bash
# package-lock.json 재생성
rm -rf node_modules package-lock.json
npm install

# 캐시 정리
npm cache clean --force
```

### 7.4 TypeScript 오류
```bash
# TypeScript 버전 확인
npx tsc --version

# tsconfig.json 검증
npx tsc --showConfig

# 타입 정의 재설치
npm install --save-dev @types/node
```

## 다음 단계

초기 설정이 완료되면 [검증 가이드](./02-VERIFICATION.md)를 참고하여 설정이 올바른지 확인하세요.

---

작성일: 2025-08-02  
최종 수정일: 2025-08-02  
작성자: yaioyaio