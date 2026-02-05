# DevFlow Monitor MCP (Python)

소프트웨어 개발 워크플로우의 실시간 추적 및 시각화를 위한 AI 기반 개발 프로세스 모니터링 MCP 서버

## 프로젝트 개요

DevFlow Monitor MCP는 소프트웨어 개발의 모든 측면을 실시간으로 모니터링하고, Claude Desktop 통합을 통해 인사이트와 메트릭을 제공하는 Model Context Protocol 서버입니다.

**Python 버전**: TypeScript에서 Python으로 완전 마이그레이션 완료

## 주요 기능

### 구현 완료
- 📁 **파일 시스템 모니터링** - watchdog을 통한 실시간 파일 변경 감지
- 🔄 **Git 통합** - GitPython을 통한 완전한 Git 활동 추적
- 🎯 **개발 단계 인식** - 13단계 개발 프로세스 자동 감지
- 🤖 **AI 협업 추적** - Claude, GitHub Copilot, ChatGPT 사용 모니터링
- 🏗️ **방법론 모니터링** - DDD/TDD/BDD/EDA 패턴 인식 및 점수화
- 📊 **실시간 분석** - 이벤트 처리, 메트릭 수집, 병목 현상 감지
- 🌐 **WebSocket 스트리밍** - 실시간 이벤트 브로드캐스팅
- 🗄️ **데이터 저장소** - SQLite(aiosqlite)와 인메모리 캐싱
- 🔌 **외부 API 통합** - Jira, Notion, Figma 연결
- 📋 **CLI/TUI 대시보드** - Rich TUI 및 CLI 테이블 뷰
- 📈 **고급 메트릭 엔진** - 포괄적인 메트릭 수집 및 분석
- 🚨 **알림 시스템** - 규칙 기반 알림 (Slack, 대시보드)
- ⚡ **성능 최적화** - 프로파일링, 캐싱, 스케일링
- 🔐 **보안 시스템** - JWT 인증, RBAC, 암호화
- 🛠️ **MCP 도구 모음** - 88개의 포괄적인 개발 모니터링 도구
- 🔌 **플러그인 시스템** - 완전한 플러그인 아키텍처
- 📂 **다중 프로젝트 지원** - 포괄적인 다중 프로젝트 관리
- 📑 **고급 보고서 생성** - PDF, 스케줄링, 배포

## 기술 스택

### 핵심 기술
- **언어**: Python 3.11+ (type hints, async/await)
- **패키지 관리**: Poetry
- **MCP SDK**: mcp (Model Context Protocol)

### 데이터 및 저장소
- **데이터베이스**: SQLite (aiosqlite)
- **캐싱**: 인메모리 (asyncio 기반)
- **이벤트 처리**: asyncio 우선순위 큐

### 모니터링 및 통합
- **파일 모니터링**: watchdog, watchfiles
- **Git 통합**: GitPython
- **API 클라이언트**: httpx (async)
- **실시간 통신**: aiohttp (WebSocket)

### 대시보드 및 UI
- **TUI 프레임워크**: Rich, Textual
- **CLI 스타일링**: Rich console
- **CLI 프레임워크**: Typer

### 개발 도구
- **테스팅**: pytest + pytest-asyncio
- **린팅**: ruff, mypy
- **포맷팅**: black, isort

## 설치 방법

### 빠른 시작

```bash
# 저장소 클론
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp/python

# Poetry로 의존성 설치
poetry install

# MCP 서버 시작
poetry run python -m devflow_monitor
```

### 개발 환경 설정

```bash
# 개발 의존성 포함 설치
poetry install --with dev

# 테스트 실행
poetry run pytest

# 린트 실행
poetry run ruff check .

# 타입 체크
poetry run mypy src/
```

### Claude Desktop 통합

Claude Desktop 설정 파일에 추가:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

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

또는 직접 Python 실행:

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

## 개발

```bash
# 개발 모드 실행
poetry run python -m devflow_monitor

# 린터 실행
poetry run ruff check .

# 타입 체크
poetry run mypy src/

# 코드 포맷
poetry run black src/
poetry run isort src/

# 테스트 실행
poetry run pytest

# 테스트 커버리지
poetry run pytest --cov=src/devflow_monitor
```

## 사용 가능한 MCP 도구

이 서버는 개발 모니터링을 위한 88개의 전문 도구를 제공합니다:

### 핵심 모니터링 (6개)
- `getProjectStatus` - 실시간 프로젝트 상태 및 메트릭
- `getMetrics` - 필터링을 통한 포괄적인 개발 메트릭
- `getActivityLog` - 모든 소스에 걸친 상세한 활동 추적
- `analyzeBottlenecks` - 자동화된 병목 현상 감지 및 분석
- `checkMethodology` - DDD/TDD/BDD/EDA 준수 점수
- `generateReport` - 자동화된 보고서 생성

### 플러그인 시스템 (15개)
- `listPlugins` - 설치된 플러그인 목록 조회
- `getPluginInfo` - 플러그인 상세 정보
- `loadPlugin` / `unloadPlugin` - 플러그인 로딩 관리
- `activatePlugin` / `deactivatePlugin` - 플러그인 활성화 관리
- `installPlugin` / `uninstallPlugin` - 플러그인 설치 관리
- 외 7개...

### 다중 프로젝트 관리 (16개)
- `createProject` / `listProjects` / `getProject`
- `updateProject` / `deleteProject`
- `runCrossProjectAnalysis`
- 외 10개...

[전체 88개 도구 목록은 USAGE_GUIDE.md 참조](./USAGE_GUIDE.md)

## 프로젝트 구조

```
python/
├── src/
│   └── devflow_monitor/
│       ├── server/          # MCP 서버 핵심
│       ├── monitors/         # 파일/Git 모니터
│       ├── analyzers/        # 분석 엔진
│       ├── integrations/     # 외부 API 통합
│       ├── events/           # 이벤트 시스템
│       ├── storage/          # 데이터베이스
│       ├── plugins/          # 플러그인 시스템
│       ├── projects/         # 다중 프로젝트
│       ├── reports/          # 보고서 생성
│       ├── security/         # 보안 시스템
│       ├── notifications/    # 알림 시스템
│       ├── performance/      # 성능 최적화
│       ├── feedback/         # 피드백 시스템
│       ├── prediction/       # 예측 분석
│       ├── workflow/         # 워크플로우 엔진
│       ├── config/           # 설정 로더
│       ├── dashboard/        # CLI/TUI 대시보드
│       └── utils/            # 유틸리티
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── performance/
├── docs/
├── pyproject.toml
└── poetry.lock
```

## 문서

- [📖 사용 가이드](./USAGE_GUIDE.md) - 88개 MCP 도구 사용법
- [📚 설치 가이드](./INSTALLATION.md) - 완전한 설정 지침
- [📖 사용자 매뉴얼](./USER_MANUAL.md) - 포괄적인 사용 가이드
- [❓ FAQ](./FAQ.md) - 자주 묻는 질문
- [🔧 API 레퍼런스](./API_REFERENCE.md) - 완전한 MCP 도구 레퍼런스
- [🏗️ 아키텍처](./ARCHITECTURE.md) - 시스템 아키텍처

## 라이선스

MIT © yaioyaio

---

**문서 버전**: 2026-02-05
**원본 TypeScript 버전**: 2026-02-05
작성자: yaioyaio
