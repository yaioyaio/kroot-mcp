# DevFlow Monitor MCP - Python 마이그레이션 실행 계획서

**작성일**: 2026-02-04
**목적**: 서브 에이전트를 활용한 TS → Python 마이그레이션 실행 가이드
**참조 문서**: `../TODOLIST-20260204-PYTHON-MIGRATION.md`

---

## 목차

1. [개요](#1-개요)
2. [사전 준비](#2-사전-준비)
3. [실행 흐름](#3-실행-흐름)
4. [Step별 실행 가이드](#4-step별-실행-가이드)
5. [세션 관리](#5-세션-관리)
6. [문제 해결](#6-문제-해결)

---

## 1. 개요

### 1.1 마이그레이션 구조

```
TypeScript 프로젝트                    Python 프로젝트
/kroot-mcp/                    →      /devflow-monitor-mcp-python/
├── src/server/                →      ├── src/devflow_monitor/server/
├── src/events/                →      ├── src/devflow_monitor/events/
├── src/monitors/              →      ├── src/devflow_monitor/monitors/
├── src/storage/               →      ├── src/devflow_monitor/storage/
├── src/integrations/          →      ├── src/devflow_monitor/integrations/
├── src/analyzers/             →      ├── src/devflow_monitor/analyzers/
├── src/plugins/               →      ├── src/devflow_monitor/plugins/
├── src/security/              →      ├── src/devflow_monitor/security/
├── src/performance/           →      ├── src/devflow_monitor/performance/
├── src/reports/               →      ├── src/devflow_monitor/reports/
└── src/notifications/         →      └── src/devflow_monitor/notifications/
```

### 1.2 Phase 의존성 그래프

```
                    ┌─────────────────────────────────────────┐
                    │         Phase 1: 코어 인프라            │
                    │   (server, events, storage)             │
                    │            ⭐ 필수 선행                  │
                    └─────────────────┬───────────────────────┘
                                      │
           ┌──────────────┬───────────┼───────────┬──────────────┐
           ▼              ▼           ▼           ▼              │
    ┌──────────┐   ┌──────────┐ ┌──────────┐ ┌──────────┐       │
    │ Phase 2  │   │ Phase 3  │ │ Phase 4  │ │ Phase 5  │       │
    │ monitors │   │ analyzers│ │integrat- │ │ security │       │
    │          │   │          │ │  ions    │ │  perf    │       │
    └──────────┘   └────┬─────┘ └──────────┘ └────┬─────┘       │
                        │                         │              │
                        │    ┌────────────────────┘              │
                        │    ▼                                   │
                        │ ┌──────────┐                           │
                        │ │ Phase 6  │                           │
                        │ │ plugins  │                           │
                        │ └──────────┘                           │
                        │                                        │
                        └─────────┐                              │
                                  ▼                              │
                           ┌──────────┐                          │
                           │ Phase 7  │                          │
                           │ reports  │                          │
                           │ notific. │                          │
                           └────┬─────┘                          │
                                │                                │
                                ▼                                │
                    ┌───────────────────────┐                    │
                    │      Phase 8          │◄───────────────────┘
                    │   테스트 & 안정화      │
                    └───────────────────────┘
```

### 1.3 서브 에이전트 병렬화 가능 구간

| Step | Phase | 실행 방식 | 에이전트 수 |
|------|-------|-----------|-------------|
| 0 | 초기화 | 수동 | - |
| 1 | Phase 1 | **순차** | 3개 |
| 2 | Phase 2, 3, 4, 5 | **병렬** | 4개 동시 |
| 3 | Phase 6, 7 | **병렬** | 2개 동시 |
| 4 | Phase 8 | **순차** | 1개 |

---

## 2. 사전 준비

### 2.1 필수 요구사항

- Python 3.11 이상
- Poetry (Python 패키지 관리자)
- Git
- Claude Code CLI

### 2.2 환경 변수 설정

```bash
# ~/.bashrc 또는 ~/.zshrc에 추가
export PYTHON_MIGRATION_BASE="$HOME/dev/devflow-monitor-mcp-python"
export TS_SOURCE_BASE="/Users/yaio/dev/workspace/cincotime_projects/kroot-mcp"
```

---

## 3. 실행 흐름

### 3.1 전체 타임라인

```
Day 1: Step 0 (프로젝트 초기화)
       ↓
Day 1-3: Step 1 (Phase 1 - 코어 인프라)
       ↓ ← Phase 1 완료 검증 필수
Day 4-6: Step 2 (Phase 2-5 병렬)
       ↓ ← Phase 2-5 완료 검증 필수
Day 7-8: Step 3 (Phase 6-7 병렬)
       ↓ ← Phase 6-7 완료 검증 필수
Day 9-11: Step 4 (Phase 8 - 테스트)
       ↓
완료
```

### 3.2 각 Step 실행 명령

| Step | Claude Code 명령 |
|------|------------------|
| 0 | (수동 실행 - 터미널에서) |
| 1 | "Phase 1을 순차 실행해줘. 01-AGENT-PROMPTS.md의 Phase 1 프롬프트 참조" |
| 2 | "Phase 2, 3, 4, 5를 병렬로 실행해줘. 01-AGENT-PROMPTS.md 참조" |
| 3 | "Phase 6, 7을 병렬로 실행해줘. 01-AGENT-PROMPTS.md 참조" |
| 4 | "Phase 8을 실행해줘. 01-AGENT-PROMPTS.md 참조" |

---

## 4. Step별 실행 가이드

### 4.1 Step 0: 프로젝트 초기화 (수동)

터미널에서 직접 실행:

```bash
# 1. 프로젝트 디렉토리 생성
mkdir -p ~/dev/devflow-monitor-mcp-python
cd ~/dev/devflow-monitor-mcp-python

# 2. Poetry 초기화
poetry init --name devflow-monitor-mcp --python "^3.11" -n

# 3. 디렉토리 구조 생성
mkdir -p src/devflow_monitor/{server,events,monitors,storage,integrations,analyzers,plugins,security,performance,reports,notifications,workflow,prediction,projects,feedback,dashboard}
mkdir -p src/devflow_monitor/events/types
mkdir -p src/devflow_monitor/analyzers/types
mkdir -p src/devflow_monitor/notifications/channels
mkdir -p src/devflow_monitor/storage/repositories
mkdir -p tests/{unit,integration,e2e,performance}
mkdir -p config/environments

# 4. __init__.py 파일 생성
find src -type d -exec touch {}/__init__.py \;

# 5. 기본 의존성 설치
poetry add mcp fastapi uvicorn pydantic pydantic-settings aiosqlite watchfiles gitpython httpx tenacity
poetry add --group dev pytest pytest-asyncio pytest-cov mypy ruff black

# 6. 설정 파일 생성
cat > pyproject.toml << 'EOF'
[tool.poetry]
name = "devflow-monitor-mcp"
version = "1.0.0"
description = "AI-powered development process monitoring MCP server"
authors = ["Your Name <your.email@example.com>"]
readme = "README.md"
packages = [{include = "devflow_monitor", from = "src"}]

[tool.poetry.dependencies]
python = "^3.11"
mcp = "^1.7.1"
fastapi = "^0.109.0"
uvicorn = "^0.27.0"
pydantic = "^2.5.0"
pydantic-settings = "^2.1.0"
aiosqlite = "^0.19.0"
watchfiles = "^0.21.0"
gitpython = "^3.1.40"
httpx = "^0.26.0"
tenacity = "^8.2.3"
pyjwt = "^2.8.0"
cryptography = "^41.0.0"
cachetools = "^5.3.0"
reportlab = "^4.0.0"
apscheduler = "^3.10.0"

[tool.poetry.group.dev.dependencies]
pytest = "^7.4.0"
pytest-asyncio = "^0.23.0"
pytest-cov = "^4.1.0"
mypy = "^1.8.0"
ruff = "^0.1.0"
black = "^24.1.0"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.mypy]
python_version = "3.11"
strict = true
warn_return_any = true
warn_unused_ignores = true

[tool.ruff]
line-length = 100
target-version = "py311"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"
EOF

# 7. 초기화 완료 확인
echo "✅ Step 0 완료"
ls -la src/devflow_monitor/
```

**완료 기준 체크**:
- [ ] ~/dev/devflow-monitor-mcp-python 디렉토리 존재
- [ ] pyproject.toml 파일 존재
- [ ] src/devflow_monitor/ 하위 디렉토리 모두 생성
- [ ] poetry install 성공

---

### 4.2 Step 1: Phase 1 실행 (순차)

**실행 명령**:
```
Claude Code에서:
"Phase 1을 실행한다.
참조: docs/todolists/python-migration/01-AGENT-PROMPTS.md의 Phase 1 섹션.
Agent 1-1, 1-2, 1-3을 순차적으로 실행해줘."
```

**실행 순서**:
1. Agent 1-1: MCP 서버 타입/설정 → 완료 대기
2. Agent 1-2: 이벤트 시스템 → 완료 대기
3. Agent 1-3: 스토리지 계층 → 완료 대기

**완료 검증**:
```bash
cd ~/dev/devflow-monitor-mcp-python
python docs/todolists/python-migration/03-verification-script.py --phase 1
```

**완료 기준 체크**:
- [ ] src/devflow_monitor/server/types.py 존재
- [ ] src/devflow_monitor/server/config.py 존재
- [ ] src/devflow_monitor/server/main.py 존재
- [ ] src/devflow_monitor/events/engine.py 존재
- [ ] src/devflow_monitor/events/types/base.py 존재
- [ ] src/devflow_monitor/storage/database.py 존재
- [ ] `python -c "from devflow_monitor.events.engine import EventEngine"` 성공

---

### 4.3 Step 2: Phase 2-5 실행 (병렬)

**사전 조건**: Step 1 (Phase 1) 완료 확인 필수

**실행 명령**:
```
Claude Code에서:
"Phase 2, 3, 4, 5를 병렬로 실행한다.
참조: docs/todolists/python-migration/01-AGENT-PROMPTS.md
4개 에이전트를 동시에 실행해줘."
```

**병렬 실행되는 에이전트**:
- Agent 2: monitors/ (Phase 2)
- Agent 3: analyzers/ (Phase 3)
- Agent 4: integrations/ (Phase 4)
- Agent 5: security/, performance/ (Phase 5)

**완료 검증**:
```bash
python docs/todolists/python-migration/03-verification-script.py --phase 2 3 4 5
```

**완료 기준 체크**:
- [ ] Phase 2: monitors/file.py, monitors/git.py 존재
- [ ] Phase 3: analyzers/stage_analyzer.py 등 존재
- [ ] Phase 4: integrations/jira.py 등 존재
- [ ] Phase 5: security/auth_manager.py 등 존재

---

### 4.4 Step 3: Phase 6-7 실행 (병렬)

**사전 조건**: Step 2 (Phase 2-5) 완료 확인 필수

**실행 명령**:
```
Claude Code에서:
"Phase 6, 7을 병렬로 실행한다.
참조: docs/todolists/python-migration/01-AGENT-PROMPTS.md
2개 에이전트를 동시에 실행해줘."
```

**완료 검증**:
```bash
python docs/todolists/python-migration/03-verification-script.py --phase 6 7
```

---

### 4.5 Step 4: Phase 8 실행 (테스트)

**사전 조건**: Phase 1-7 모두 완료

**실행 명령**:
```
Claude Code에서:
"Phase 8 테스트를 실행한다.
참조: docs/todolists/python-migration/01-AGENT-PROMPTS.md의 Phase 8 섹션."
```

**완료 검증**:
```bash
cd ~/dev/devflow-monitor-mcp-python
poetry run pytest --cov=src/devflow_monitor --cov-report=term-missing
```

---

## 5. 세션 관리

### 5.1 세션 시작 시 확인사항

새 Claude Code 세션 시작 시:

```
1. 현재 진행 상태 확인:
   "python docs/todolists/python-migration/03-verification-script.py"

2. 진행 상태 문서 확인:
   "docs/todolists/python-migration/02-PROGRESS-TRACKER.md 파일 읽어줘"

3. 다음 실행할 Step 확인:
   "02-PROGRESS-TRACKER.md 기준으로 다음 실행할 Step이 뭐야?"
```

### 5.2 세션 종료 전 필수 작업

```
1. 현재 진행 상태를 02-PROGRESS-TRACKER.md에 업데이트
2. 실행 중인 작업이 있다면 완료 대기 또는 중단 지점 기록
3. 다음 세션에서 할 작업 메모
```

### 5.3 세션 끊김 복구 절차

```
1. 검증 스크립트 실행하여 실제 파일 상태 확인
2. 02-PROGRESS-TRACKER.md와 비교
3. 불일치 시 실제 파일 기준으로 PROGRESS 업데이트
4. 미완료 Phase부터 재실행
```

---

## 6. 문제 해결

### 6.1 Import 오류 발생 시

```bash
# 의존성 확인
cd ~/dev/devflow-monitor-mcp-python
poetry install

# Import 테스트
poetry run python -c "from devflow_monitor.events.engine import EventEngine"
```

### 6.2 서브 에이전트 실패 시

1. 해당 Phase만 재실행
2. 에러 메시지 확인 후 프롬프트 수정
3. 수동으로 파일 수정 후 다음 Phase 진행

### 6.3 병렬 실행 중 일부 실패 시

```
실패한 Phase만 개별 재실행:
"Phase 3만 다시 실행해줘. 01-AGENT-PROMPTS.md의 Agent 3 프롬프트 참조"
```

---

## 부록: 빠른 참조

### 명령어 요약

| 작업 | 명령 |
|------|------|
| 진행 상태 확인 | `python 03-verification-script.py` |
| Phase 1 실행 | "Phase 1 순차 실행" |
| Phase 2-5 실행 | "Phase 2, 3, 4, 5 병렬 실행" |
| Phase 6-7 실행 | "Phase 6, 7 병렬 실행" |
| Phase 8 실행 | "Phase 8 실행" |
| 테스트 실행 | `poetry run pytest` |
| 타입 체크 | `poetry run mypy src/` |

### 파일 위치

| 문서 | 경로 |
|------|------|
| 원본 계획서 | `../TODOLIST-20260204-PYTHON-MIGRATION.md` |
| 실행 계획 | `00-MIGRATION-EXECUTION-PLAN.md` (이 문서) |
| 에이전트 프롬프트 | `01-AGENT-PROMPTS.md` |
| 진행 추적 | `02-PROGRESS-TRACKER.md` |
| 검증 스크립트 | `03-verification-script.py` |

---

**문서 작성 완료**: 2026-02-04
**최종 수정일**: 2026-02-04
