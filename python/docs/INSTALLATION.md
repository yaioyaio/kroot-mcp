# DevFlow Monitor MCP (Python) - 설치 가이드

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
- **Python**: 3.11 이상
- **Poetry**: 1.7.0 이상
- **OS**: Windows 10+, macOS 12+, Ubuntu 20.04+
- **RAM**: 최소 4GB, 권장 8GB
- **디스크**: 500MB 여유 공간

### 권장 요구사항
- **Python**: 3.12 LTS
- **Poetry**: 최신 버전
- **Claude Desktop**: 최신 버전
- **Git**: v2.30.0 이상
- **Docker**: 20.10 이상 (Docker 설치 시)

### 선택적 요구사항
- **Docker Desktop**: Docker 기반 설치 시
- **Visual Studio Code**: 개발 환경
- **pyenv**: Python 버전 관리

## 빠른 설치

### Poetry 사용 (권장)

가장 간단한 설치 방법입니다:

```bash
# 저장소 클론
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp/python

# Poetry 설치 (없는 경우)
curl -sSL https://install.python-poetry.org | python3 -

# 의존성 설치
poetry install

# MCP 서버 시작
poetry run python -m devflow_monitor
```

### pip 사용

```bash
# 저장소 클론
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp/python

# 가상환경 생성
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 의존성 설치
pip install -e .

# MCP 서버 시작
python -m devflow_monitor
```

## 수동 설치

### 1. 저장소 클론

```bash
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp/python
```

### 2. Python 버전 확인

```bash
# Python 버전 확인 (3.11+ 필요)
python --version

# pyenv 사용 시
pyenv install 3.12.0
pyenv local 3.12.0
```

### 3. Poetry 설치

```bash
# Poetry 설치
curl -sSL https://install.python-poetry.org | python3 -

# 설치 확인
poetry --version

# Poetry 설정
poetry config virtualenvs.in-project true
```

### 4. 의존성 설치

```bash
# 프로덕션 의존성 설치
poetry install --only main

# 개발 의존성 포함
poetry install --with dev

# 모든 의존성 (테스트 포함)
poetry install --with dev,test
```

### 5. 설정 검증

```bash
# 설치 검증
poetry run python -c "from devflow_monitor.server.main import DevFlowMonitorServer; print('OK')"

# 테스트 실행
poetry run pytest tests/ -v
```

## Docker 설치

### Docker Compose 사용 (권장)

```bash
# 저장소 클론
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp/python

# Docker Compose 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

### Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Poetry 설치
RUN pip install poetry

# 의존성 파일 복사
COPY pyproject.toml poetry.lock ./

# 의존성 설치
RUN poetry config virtualenvs.create false \
    && poetry install --only main --no-interaction --no-ansi

# 소스 코드 복사
COPY src/ ./src/

# 서버 실행
CMD ["python", "-m", "devflow_monitor"]
```

### Docker 빌드 및 실행

```bash
# Docker 이미지 빌드
docker build -t devflow-monitor-python:latest .

# 컨테이너 실행
docker run -d \
  --name devflow-monitor \
  -v devflow-data:/app/data \
  devflow-monitor-python:latest
```

## Claude Desktop 연동 설정

### 1. Claude Desktop 설정 파일 위치

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```bash
~/.config/Claude/claude_desktop_config.json
```

### 2. 설정 파일 편집

#### Poetry 사용 시 (권장)

```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "poetry",
      "args": ["run", "python", "-m", "devflow_monitor"],
      "cwd": "/absolute/path/to/kroot-mcp/python"
    }
  }
}
```

#### 직접 Python 사용 시

```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "/path/to/python",
      "args": ["-m", "devflow_monitor"],
      "env": {
        "PYTHONPATH": "/path/to/kroot-mcp/python/src"
      }
    }
  }
}
```

#### 가상환경 사용 시

```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "/path/to/kroot-mcp/python/.venv/bin/python",
      "args": ["-m", "devflow_monitor"]
    }
  }
}
```

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
# 개발 의존성 설치
poetry install --with dev

# pre-commit 설정
poetry run pre-commit install
```

### 2. VS Code 확장 프로그램

다음 확장 프로그램 설치를 권장합니다:

- **Python**: `ms-python.python`
- **Pylance**: `ms-python.vscode-pylance`
- **Ruff**: `charliermarsh.ruff`
- **Black Formatter**: `ms-python.black-formatter`
- **GitLens**: `eamodio.gitlens`

### 3. VS Code 설정

```json
// .vscode/settings.json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python",
  "python.formatting.provider": "none",
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.organizeImports": true
    }
  },
  "python.linting.enabled": true,
  "python.linting.ruffEnabled": true
}
```

## 설정 및 환경변수

### 환경 설정 파일

```bash
# 환경 변수 파일 생성
cp .env.example .env

# .env 파일 편집
nano .env
```

### 주요 환경 변수

```bash
# 서버 설정
DEVFLOW_ENV=production
DEVFLOW_LOG_LEVEL=INFO

# 데이터베이스
DEVFLOW_DATABASE_PATH=./data/devflow.db

# 보안 (프로덕션 필수)
DEVFLOW_JWT_SECRET=your-secret-jwt-key
DEVFLOW_API_KEY_SALT=your-api-key-salt

# 성능
DEVFLOW_MAX_CONCURRENT_MONITORS=10
DEVFLOW_EVENT_BATCH_SIZE=100
DEVFLOW_CACHE_TTL=300
```

## 환경별 설정

### 개발 환경

```bash
# 개발 서버 실행
poetry run python -m devflow_monitor

# 디버그 모드
DEVFLOW_LOG_LEVEL=DEBUG poetry run python -m devflow_monitor
```

### 프로덕션 환경

```bash
# 프로덕션 서버 실행
DEVFLOW_ENV=production poetry run python -m devflow_monitor
```

### 테스트 환경

```bash
# 단위 테스트 실행
poetry run pytest tests/unit/

# 통합 테스트 실행
poetry run pytest tests/integration/

# 테스트 커버리지 확인
poetry run pytest --cov=src/devflow_monitor --cov-report=html

# 전체 MCP 도구 테스트
poetry run python scripts/test_all_mcp_tools.py
```

## 문제 해결

### 일반적인 문제들

#### 1. Python 버전 문제

```bash
# Python 버전 확인
python --version

# pyenv를 사용한 버전 관리 (권장)
pyenv install 3.12.0
pyenv local 3.12.0
```

#### 2. Poetry 설치 실패

```bash
# Poetry 캐시 정리
poetry cache clear . --all

# lock 파일 재생성
rm poetry.lock
poetry lock
poetry install
```

#### 3. 의존성 충돌

```bash
# 가상환경 삭제 후 재생성
rm -rf .venv
poetry install
```

#### 4. 모듈 임포트 오류

```bash
# PYTHONPATH 설정
export PYTHONPATH="${PYTHONPATH}:/path/to/kroot-mcp/python/src"

# 또는 editable 설치
pip install -e .
```

### Claude Desktop 연동 문제

#### 1. MCP 서버 연결 실패

1. 설정 파일 경로 확인:
   ```bash
   # macOS
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

   # Linux
   cat ~/.config/Claude/claude_desktop_config.json
   ```

2. Python 경로 확인:
   ```bash
   # Poetry 환경의 Python 경로
   poetry env info --executable

   # 또는
   which python
   ```

3. 서버 직접 실행 테스트:
   ```bash
   poetry run python -m devflow_monitor
   ```

#### 2. JSON 설정 파일 오류

설정 파일의 JSON 문법을 검증합니다:

```bash
# JSON 문법 검증
python -c "import json; json.load(open('claude_desktop_config.json'))"
```

#### 3. 디버그 모드 실행

```bash
# 디버그 로그 활성화
DEVFLOW_LOG_LEVEL=DEBUG poetry run python -m devflow_monitor
```

### 로그 확인

```bash
# 로그 파일 확인 (있는 경우)
tail -f logs/devflow.log

# 실시간 로그 확인
poetry run python -m devflow_monitor 2>&1 | tee server.log
```

## 업데이트

### 프로젝트 업데이트

```bash
# Git에서 최신 코드 가져오기
git pull origin main

# 의존성 업데이트
poetry update

# 또는 lock 파일 기준 설치
poetry install
```

### 의존성 보안 업데이트

```bash
# 보안 취약점 확인
poetry run pip-audit

# 패키지 업데이트
poetry update package-name
```

## 검증 및 진단

### 설치 검증

```bash
# 모듈 임포트 테스트
poetry run python -c "
from devflow_monitor.server.main import DevFlowMonitorServer
server = DevFlowMonitorServer()
print('서버 초기화 성공')
print(f'등록된 도구 수: {len(server._get_tools())}')
"

# 전체 MCP 도구 테스트
poetry run python scripts/test_all_mcp_tools.py
```

### 시스템 진단

```bash
# Python 환경 정보
poetry env info

# 설치된 패키지 목록
poetry show

# 의존성 트리
poetry show --tree
```

## 지원 및 도움말

### 문서
- [사용 가이드](./USAGE_GUIDE.md) - 88개 MCP 도구 사용법
- [API 레퍼런스](./API_REFERENCE.md)
- [FAQ](./FAQ.md)
- [아키텍처](./ARCHITECTURE.md)

### 커뮤니티
- **GitHub Issues**: [프로젝트 이슈](https://github.com/yaioyaio/kroot-mcp/issues)

### 버전 정보

- **문서 버전**: 2026-02-05
- **최소 Python**: 3.11
- **권장 Python**: 3.12
- **지원 플랫폼**: Windows, macOS, Linux

---

**최종 수정일**: 2026-02-05
