# DevFlow Monitor MCP (Python) - 빠른 설치 가이드

## 빠른 시작

### 1. 저장소 클론

```bash
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp/python
```

### 2. Poetry 설치 (없는 경우)

```bash
# macOS / Linux
curl -sSL https://install.python-poetry.org | python3 -

# Windows (PowerShell)
(Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -
```

### 3. 의존성 설치

```bash
poetry install
```

### 4. 서버 실행

```bash
poetry run python -m devflow_monitor
```

## Claude Desktop 연동

### macOS

```bash
# 설정 파일 편집
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### Windows

```
%APPDATA%\Claude\claude_desktop_config.json
```

### Linux

```bash
nano ~/.config/Claude/claude_desktop_config.json
```

### 설정 내용

```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "poetry",
      "args": ["run", "python", "-m", "devflow_monitor"],
      "cwd": "/path/to/kroot-mcp/python"
    }
  }
}
```

> **중요**: `/path/to/kroot-mcp/python`을 실제 경로로 변경하세요.

## 테스트

### 설치 확인

```bash
poetry run python -c "from devflow_monitor.server.main import DevFlowMonitorServer; print('OK')"
```

### 전체 도구 테스트

```bash
poetry run python scripts/test_all_mcp_tools.py
```

## 문제 해결

### Python 버전 문제

```bash
# Python 3.11+ 필요
python --version

# pyenv 사용 시
pyenv install 3.12.0
pyenv local 3.12.0
```

### Poetry 캐시 문제

```bash
poetry cache clear . --all
rm -rf .venv poetry.lock
poetry install
```

### 모듈 찾기 실패

```bash
# PYTHONPATH 설정
export PYTHONPATH="${PYTHONPATH}:$(pwd)/src"
```

## 추가 정보

자세한 설치 방법은 [INSTALLATION.md](./INSTALLATION.md)를 참조하세요.

---

**최종 수정일**: 2026-02-05
