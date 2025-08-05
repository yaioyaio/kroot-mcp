# DevFlow Monitor MCP

소프트웨어 개발 워크플로우의 실시간 추적 및 시각화를 위한 AI 기반 개발 프로세스 모니터링 MCP 서버

## 프로젝트 개요

DevFlow Monitor MCP는 소프트웨어 개발의 모든 측면을 실시간으로 모니터링하고, Claude Desktop 통합을 통해 인사이트와 메트릭을 제공하는 Model Context Protocol 서버입니다.

**현재 상태**: 마일스톤 5 진행중 (46.7% 완료) - 고급 기능 구현 완료, 플러그인 시스템 구현 완료

## 주요 기능

### ✅ 구현 완료 (마일스톤 1-3)
- 📁 **파일 시스템 모니터링** - 지능형 필터링을 통한 실시간 파일 변경 감지
- 🔄 **Git 통합** - 완전한 Git 활동 추적, 브랜치 분석, 커밋 패턴 인식
- 🎯 **개발 단계 인식** - 13단계 개발 프로세스 자동 감지
- 🤖 **AI 협업 추적** - Claude, GitHub Copilot, ChatGPT 사용 모니터링 및 분석
- 🏗️ **방법론 모니터링** - DDD/TDD/BDD/EDA 패턴 인식 및 점수화
- 📊 **실시간 분석** - 이벤트 처리, 메트릭 수집, 병목 현상 감지
- 🌐 **WebSocket 스트리밍** - 연결된 클라이언트에 실시간 이벤트 브로드캐스팅
- 🗄️ **데이터 저장소** - SQLite와 인메모리 캐싱 및 이벤트 큐잉
- 🔌 **외부 API 통합** - Jira, Notion, Figma 연결
- 📋 **CLI/TUI 대시보드** - blessed TUI 및 CLI 테이블 뷰를 통한 실시간 모니터링 인터페이스
- 📈 **고급 메트릭 엔진** - 포괄적인 메트릭 수집, 분석 및 병목 현상 감지
- 🚨 **알림 시스템** - 규칙 기반 알림 (Slack 및 대시보드 채널)
- ⚡ **성능 최적화** - 프로파일링, 캐싱, 스케일링을 포함한 완전한 성능 최적화 시스템
- 🔐 **보안 시스템** - JWT 인증, RBAC, 암호화 및 감사 로깅
- 🛠️ **MCP 도구 모음** - 68개의 포괄적인 개발 모니터링 도구

### ✅ 마일스톤 4 완료 (100%)
- ✅ **성능 최적화** - 포괄적인 최적화 시스템
- ✅ **보안 시스템** - JWT 인증, RBAC, 암호화
- ✅ **배포 준비** - Docker 지원 및 CI/CD 파이프라인
- ✅ **문서화 모음** - 완전한 사용자 및 개발자 문서
- ✅ **테스트 스위트** - 80%+ 커버리지를 갖춘 E2E, 통합 및 성능 테스트

### 🔄 마일스톤 5 진행중 (60.0% 완료)
- ✅ **예측 분석 시스템** - 패턴 인식, 속도 예측, 병목 예측
- ✅ **워크플로우 엔진** - 사용자 정의 워크플로우 및 자동화 시스템
- ✅ **템플릿 시스템** - 5가지 산업 표준 워크플로우 템플릿
- ✅ **플러그인 시스템** - 완전한 플러그인 아키텍처 구현 완료
- ✅ **다중 프로젝트 지원** - 포괄적인 다중 프로젝트 관리 시스템
- ⏳ **고급 보고서** - 자동화된 상세 리포트 생성 (진행 예정)

### 📋 향후 개선사항 (마일스톤 5+)
- 📊 고급 보고서 생성
- 📱 모바일 컴패니언 앱 (선택사항)
- 🏪 플러그인 마켓플레이스 (선택사항)

## 기술 스택

### 핵심 기술
- **언어**: TypeScript 5.9.2 (strict mode)
- **런타임**: Node.js 20.19.1 LTS
- **MCP SDK**: @modelcontextprotocol/sdk 0.6.1

### 데이터 및 저장소
- **데이터베이스**: SQLite (better-sqlite3 12.2.0)
- **캐싱**: EventEmitter3 기반 큐잉을 통한 인메모리
- **이벤트 처리**: 우선순위 큐를 갖춘 EventEmitter3 5.0.1

### 모니터링 및 통합
- **파일 모니터링**: chokidar 3.x
- **Git 통합**: simple-git 3.27.0
- **API 클라이언트**: axios 1.11.0
- **실시간 통신**: ws 8.18.3

### 대시보드 및 UI
- **TUI 프레임워크**: blessed 0.1.81 (터미널 사용자 인터페이스)
- **CLI 스타일링**: chalk 5.5.0 (컬러 출력)
- **테이블 렌더링**: cli-table3 0.6.5 (구조화된 데이터 표시)
- **CLI 프레임워크**: commander 14.0.0 (명령줄 인터페이스)

### 개발 도구
- **테스팅**: Vitest 3.2.4 with coverage
- **린팅**: ESLint + Prettier
- **빌드**: esbuild + tsx

## 설치 방법

### 빠른 시작

```bash
# 저장소 클론
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp

# 자동 설치 실행
./scripts/deploy/install-local.sh
```

이렇게 하면 DevFlow Monitor가 `~/.config/mcp/devflow-monitor`에 설치되고 Claude Desktop이 자동으로 구성됩니다.

### 수동 설치

```bash
# 종속성 설치
npm install

# 프로젝트 빌드
npm run build

# MCP 서버 시작
npm start
```

### Docker 설치

```bash
# Docker Compose 사용
docker-compose up -d

# 또는 배포 스크립트 사용
./scripts/deploy/deploy-docker.sh
```

자세한 설치 지침은 [배포 가이드](./docs/DEPLOYMENT.md)를 참조하세요.

### Claude Desktop 통합

설치 스크립트가 Claude Desktop을 자동으로 구성합니다. 수동 구성의 경우:

```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "node",
      "args": ["~/.config/mcp/devflow-monitor/server/index.js"]
    }
  }
}
```

## 개발

```bash
# 개발 모드 실행
npm run dev

# 린터 실행
npm run lint

# 타입 체크
npm run typecheck

# 코드 포맷
npm run format

# 테스트 실행
npm run test
```

## 대시보드 사용법

### CLI 대시보드
모니터링을 위한 간단한 테이블 기반 인터페이스:
```bash
# CLI 대시보드 시작
npx tsx scripts/dashboard.ts cli

# 사용자 정의 새로고침 간격을 가진 컴팩트 모드
npx tsx scripts/dashboard.ts cli --compact --refresh 2000
```

### TUI 대시보드
여러 패널을 가진 완전한 기능의 터미널 인터페이스:
```bash
# TUI 대시보드 시작 (기본값)
npx tsx scripts/dashboard.ts tui

# 사용자 정의 구성
npx tsx scripts/dashboard.ts start --mode tui --refresh 1000 --max-events 100
```

#### TUI 키보드 단축키
- **r** - 모든 데이터 새로고침
- **c** - 활동 피드 지우기
- **h** - 도움말 패널 토글
- **q/ESC** - 대시보드 종료

## 사용 가능한 MCP 도구

이 서버는 개발 모니터링을 위한 52개의 전문 도구를 제공합니다:

### 핵심 모니터링
- `getProjectStatus` - 실시간 프로젝트 상태 및 메트릭
- `getMetrics` - 필터링을 통한 포괄적인 개발 메트릭
- `getActivityLog` - 모든 소스에 걸친 상세한 활동 추적
- `analyzeBottlenecks` - 자동화된 병목 현상 감지 및 분석

### 고급 분석
- `checkMethodology` - DDD/TDD/BDD/EDA 준수 점수
- `analyzeStage` - 개발 단계 인식 및 진행
- `analyzeAICollaboration` - AI 도구 사용 패턴 및 효과성
- `generateReport` - 자동화된 보고서 생성

### 실시간 통신
- `startWebSocketServer` / `stopWebSocketServer` - WebSocket 서버 관리
- `getWebSocketStats` / `getStreamStats` - 연결 모니터링
- `broadcastSystemNotification` - 시스템 전체 알림

### 플러그인 시스템 (신규: 2025-08-05)
- `listPlugins` - 설치된 플러그인 목록 조회
- `getPluginInfo` - 플러그인 상세 정보
- `loadPlugin` / `unloadPlugin` - 플러그인 로딩 관리
- `activatePlugin` / `deactivatePlugin` - 플러그인 활성화 관리
- `installPlugin` / `uninstallPlugin` - 플러그인 설치 관리
- `searchPlugins` - 플러그인 검색 및 발견
- `checkPluginHealth` - 플러그인 상태 점검
- `getPluginMetrics` - 플러그인 메트릭 조회
- `getPluginSystemStats` - 플러그인 시스템 통계

[전체 도구 목록은 API 레퍼런스 참조](./docs/API_REFERENCE.md)

## 프로젝트 문서

### 계획 및 아키텍처
- [📋 계획 문서](./PLANNING.md) - 완전한 프로젝트 로드맵
- [📄 PRD (제품 요구사항)](./PRD.md) - 제품 사양
- [✅ 작업 목록](./TASKS.md) - 상세한 구현 작업
- [🏗️ 프로젝트 구조 및 스타일](./docs/PROJECT_STRUCTURE_AND_STYLE.md)

### 기능 및 구현
- [🚀 기능 사양](./docs/FEATURES.md) - 상세한 기능 설명
- [📊 플로우차트](./docs/FLOWCHARTS.md) - 시스템 흐름 시각화
- [📝 오늘의 TODO](./docs/todolist/TODOLIST.2025-08-05.md) - 현재 진행 상황
- [🔧 Claude 통합 가이드](./.claude/CLAUDE.md) - 개발 워크플로우

### 사용자 및 개발자 문서
- [📖 설치 가이드](./docs/INSTALLATION.md) - 완전한 설정 지침 (884줄)
- [📚 사용자 매뉴얼](./docs/USER_MANUAL.md) - 포괄적인 사용 가이드 (552줄)
- [❓ FAQ](./docs/FAQ.md) - 자주 묻는 질문 (455줄, 76개 Q&A)
- [🔧 API 레퍼런스](./docs/API_REFERENCE.md) - 완전한 MCP 도구 레퍼런스 (836줄)
- [🔗 통합 가이드](./docs/INTEGRATION.md) - IDE, CI/CD, 외부 서비스 (1,363줄)
- [🏗️ 아키텍처](./docs/ARCHITECTURE.md) - 시스템 아키텍처 및 컴포넌트 (1,058줄)

### 운영 및 배포
- [⚙️ 운영 가이드](./docs/operations/README.md) - 배포 및 모니터링
- [🚢 배포 가이드](./docs/DEPLOYMENT.md) - 포괄적인 배포 지침
- [✅ 배포 체크리스트](./docs/DEPLOYMENT_CHECKLIST.md) - 배포 전후 검증

## 기여하기

프로젝트 기여 가이드는 준비 중입니다.

## 라이선스

MIT © yaioyaio

---

작성일: 2025-08-02  
최종 수정일: 2025-08-05 (다중 프로젝트 지원 구현 완료)  
작성자: yaioyaio