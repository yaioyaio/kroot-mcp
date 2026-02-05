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
- **Python**: 3.11 이상 (LTS 버전 권장)
- **Poetry**: 1.7.0 이상
- **Git**: v2.30.0 이상

### 권장 소프트웨어
- **VS Code**: 최신 버전
- **pyenv**: Python 버전 관리 도구

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

### 3.1 Python 버전 확인
```bash
# Python 버전 확인 (3.11 이상이어야 함)
python --version

# Poetry 버전 확인
poetry --version
```

### 3.2 패키지 설치
```bash
# 모든 의존성 설치
poetry install

# 개발 의존성만 설치
poetry install --only=dev

# 프로덕션 의존성만 설치
poetry install --only=prod
```

### 3.3 전역 도구 설치 (선택사항)
```bash
# Python 버전 관리 도구
pip install pyenv

# MCP 개발 도구 (사용 가능한 경우)
pip install mcp
```

## 4. 프로젝트 초기화

### 4.1 Python 설정
```bash
# Poetry 프로젝트 초기화 (이미 되어있음)
# poetry init

# 기존 설정 확인
cat pyproject.toml
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
DEVFLOW_ENV=development
DEVFLOW_DEBUG=true
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
    "dbaeumer.vscode-ruff",
    "esbenp.black-vscode",
    "ms-vscode.vscode-python-next",
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
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter",
    "editor.codeActionsOnSave": {
      "source.organizeImports": "explicit"
    }
  },
  "python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python",
  "python.analysis.typeCheckingMode": "basic",
  "ruff.enable": true,
  "files.exclude": {
    "**/.git": true,
    "**/.DS_Store": true,
    "**/.venv": true,
    "**/dist": true,
    "**/coverage": true,
    "**/__pycache__": true,
    "**/*.pyc": true
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
      "name": "Debug MCP Server",
      "type": "debugpy",
      "request": "launch",
      "module": "devflow_monitor",
      "cwd": "${workspaceFolder}",
      "envFile": "${workspaceFolder}/.env",
      "justMyCode": true
    },
    {
      "name": "Debug Current File",
      "type": "debugpy",
      "request": "launch",
      "program": "${file}",
      "cwd": "${workspaceFolder}",
      "justMyCode": true
    }
  ]
}
```

## 7. 문제 해결

### 7.1 Python 버전 문제
```bash
# pyenv를 사용하여 Python 버전 관리
curl https://pyenv.run | bash

# 셸 설정에 추가 (bash의 경우)
echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.bashrc
echo 'command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.bashrc
echo 'eval "$(pyenv init -)"' >> ~/.bashrc

# Python 3.12 설치 및 사용
pyenv install 3.12.0
pyenv local 3.12.0
```

### 7.2 권한 문제
```bash
# Poetry 설치
curl -sSL https://install.python-poetry.org | python3 -
# Poetry는 별도 설정 불필요
# Poetry 경로는 자동 설정됨
source ~/.bashrc
```

### 7.3 의존성 충돌
```bash
# poetry.lock 재생성
rm -rf .venv poetry.lock
poetry install

# 캐시 정리
poetry cache clear . --all
```

### 7.4 Python 타입 체크 오류
```bash
# Python 버전 확인
python --version

# mypy 버전 확인
poetry run mypy --version

# 타입 체크 실행
poetry run mypy src/

# 타입 스텁 재설치 (필요시)
poetry add --group dev types-aiofiles types-cachetools
```

## 다음 단계

초기 설정이 완료되면 [검증 가이드](./02-VERIFICATION.md)를 참고하여 설정이 올바른지 확인하세요.

---

작성일: 2026-02-02  
최종 수정일: 2026-02-02  
작성자: yaioyaio