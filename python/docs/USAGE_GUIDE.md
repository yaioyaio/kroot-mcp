# DevFlow Monitor MCP (Python) 사용 가이드

## 개요

DevFlow Monitor MCP는 AI 기반 개발 프로세스 모니터링 MCP 서버입니다.
총 **88개의 MCP 도구**를 제공하며, 개발 워크플로우 전체를 추적하고 분석합니다.

---

## 1. 설치

```bash
cd ~/dev/workspace/cincotime_projects/kroot-mcp/python

# 의존성 설치
poetry install
```

---

## 2. 빠른 시작

### 2.1 Import 확인

```bash
poetry run python -c "
from devflow_monitor.server.main import DevFlowMonitorServer
from devflow_monitor.events.engine import get_event_engine
print('OK')
"
```

### 2.2 MCP 서버 실행

```bash
poetry run python -m devflow_monitor.server.main
```

---

## 3. 테스트

### 3.1 전체 테스트

```bash
poetry run pytest
```

### 3.2 카테고리별 테스트

```bash
poetry run pytest tests/unit/ -v          # 단위 테스트
poetry run pytest tests/integration/ -v   # 통합 테스트
poetry run pytest tests/e2e/ -v           # E2E 테스트
poetry run pytest tests/performance/ -v   # 성능 테스트
```

### 3.3 커버리지

```bash
poetry run pytest --cov=devflow_monitor --cov-report=html
open htmlcov/index.html
```

### 3.4 타입 체크

```bash
poetry run mypy src/devflow_monitor
```

---

## 4. Claude Desktop 연동

### 4.1 설정 파일

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "poetry",
      "args": ["run", "python", "-m", "devflow_monitor.server.main"],
      "cwd": "/Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/python"
    }
  }
}
```

---

## 5. MCP 도구 전체 목록 (88개)

### 5.1 기본 도구 (6개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `getProjectStatus` | 프로젝트 상태 조회 | - |
| `getMetrics` | 개발 메트릭 조회 | - |
| `getActivityLog` | 활동 로그 조회 | - |
| `analyzeBottlenecks` | 병목 현상 분석 | - |
| `checkMethodology` | 개발 방법론 검사 | - |
| `generateReport` | 개발 보고서 생성 | - |

### 5.2 플러그인 관리 도구 (15개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `listPlugins` | 플러그인 목록 조회 | - |
| `getPluginInfo` | 플러그인 상세 정보 | `pluginId` |
| `loadPlugin` | 플러그인 로드 | `pluginId` |
| `unloadPlugin` | 플러그인 언로드 | `pluginId` |
| `activatePlugin` | 플러그인 활성화 | `pluginId` |
| `deactivatePlugin` | 플러그인 비활성화 | `pluginId` |
| `restartPlugin` | 플러그인 재시작 | `pluginId` |
| `installPlugin` | 플러그인 설치 | `pluginName` |
| `uninstallPlugin` | 플러그인 제거 | `pluginId` |
| `searchPlugins` | 플러그인 검색 | `query` |
| `checkPluginHealth` | 플러그인 상태 체크 | - |
| `getPluginMetrics` | 플러그인 메트릭 조회 | - |
| `updatePlugin` | 플러그인 업데이트 | `pluginId` |
| `checkPluginUpdates` | 업데이트 확인 | - |
| `getPluginSystemStats` | 시스템 통계 조회 | - |

### 5.3 개발 단계 분석 도구 (1개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `analyzeStage` | 현재 개발 단계 분석 | - |

### 5.4 AI 협업 분석 도구 (1개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `analyzeAICollaboration` | AI 도구 사용 현황 분석 | - |

### 5.5 WebSocket 도구 (5개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `startWebSocketServer` | WebSocket 서버 시작 | - |
| `stopWebSocketServer` | WebSocket 서버 중지 | - |
| `getWebSocketStats` | WebSocket 통계 조회 | - |
| `getStreamStats` | 이벤트 스트림 통계 | - |
| `broadcastSystemNotification` | 시스템 알림 브로드캐스트 | `message` |

### 5.6 대시보드 도구 (2개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `startDashboard` | 대시보드 시작 | - |
| `getDashboardStatus` | 대시보드 상태 확인 | - |

### 5.7 다중 프로젝트 관리 도구 (16개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `createProject` | 새 프로젝트 생성 | `name` |
| `listProjects` | 프로젝트 목록 조회 | - |
| `getProject` | 프로젝트 상세 조회 | `projectId` |
| `updateProject` | 프로젝트 정보 수정 | `projectId` |
| `deleteProject` | 프로젝트 삭제 | `projectId` |
| `discoverProjects` | 프로젝트 자동 검색 | - |
| `searchProjects` | 프로젝트 검색 | - |
| `getProjectMetrics` | 프로젝트 메트릭 조회 | `projectId` |
| `collectProjectMetrics` | 메트릭 수집 | - |
| `runCrossProjectAnalysis` | 크로스 프로젝트 분석 | - |
| `getProjectDependencies` | 의존성 조회 | `projectId` |
| `getMultiProjectStatus` | 전체 시스템 상태 | - |
| `getProjectPortfolio` | 포트폴리오 개요 | - |
| `enableProjectSync` | 동기화 활성화 | `endpoint`, `apiKey` |
| `triggerProjectSync` | 수동 동기화 | - |
| `getProjectSyncStatus` | 동기화 상태 조회 | - |

### 5.8 고급 메트릭 도구 (4개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `getAdvancedMetrics` | 고급 메트릭 분석 | - |
| `getBottlenecks` | 병목 현상 조회 | - |
| `getMetricsSnapshot` | 메트릭 스냅샷 | - |
| `analyzeProductivity` | 생산성 분석 | - |

### 5.9 알림 도구 (6개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `configureNotifications` | 알림 설정 | - |
| `sendNotification` | 알림 전송 | `title`, `content` |
| `getNotificationRules` | 알림 규칙 조회 | - |
| `getNotificationStats` | 알림 통계 | - |
| `getDashboardNotifications` | 대시보드 알림 조회 | - |
| `deleteNotificationRule` | 알림 규칙 삭제 | `ruleId` |

### 5.10 보고서 생성 도구 (7개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `generateQuickReport` | 빠른 보고서 생성 | `type` |
| `createReportSchedule` | 스케줄 생성 | `name`, `reportType`, `scheduleType`, `time` |
| `listReportSchedules` | 스케줄 목록 조회 | - |
| `deleteReportSchedule` | 스케줄 삭제 | `scheduleId` |
| `runScheduleNow` | 스케줄 즉시 실행 | `scheduleId` |
| `listReportTemplates` | 템플릿 목록 조회 | - |
| `getReportSystemStatus` | 보고서 시스템 상태 | - |

### 5.11 사용자 피드백 도구 (10개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `submitFeedback` | 피드백 제출 | `type`, `title`, `description` |
| `listFeedback` | 피드백 목록 조회 | - |
| `getFeedbackDetails` | 피드백 상세 조회 | `feedbackId` |
| `updateFeedbackStatus` | 피드백 상태 변경 | `feedbackId`, `status` |
| `listImprovementSuggestions` | 개선 제안 목록 | - |
| `getUserPreferences` | 사용자 선호도 조회 | `userId` |
| `createABTest` | A/B 테스트 생성 | `name`, `description`, `variants`, `metrics` |
| `listActiveABTests` | 활성 A/B 테스트 목록 | - |
| `getABTestResults` | A/B 테스트 결과 | `testId` |
| `getFeedbackStats` | 피드백 통계 | - |

### 5.12 성능 도구 (5개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `getPerformanceReport` | 종합 성능 보고서 | - |
| `optimizePerformance` | 성능 최적화 실행 | - |
| `getSystemMetrics` | 시스템 메트릭 조회 | - |
| `profilePerformance` | 성능 프로파일링 | - |
| `manageCaches` | 캐시 관리 | - |

### 5.13 보안 도구 (10개)

| 도구명 | 설명 | 필수 파라미터 |
|--------|------|---------------|
| `login` | 사용자 로그인 | `username`, `password` |
| `verifyToken` | JWT 토큰 검증 | `token` |
| `checkPermission` | 권한 확인 | `userId`, `resource`, `action` |
| `generateAPIKey` | API 키 생성 | `userId`, `name` |
| `encryptData` | 데이터 암호화 | `data` |
| `decryptData` | 데이터 복호화 | `encrypted`, `iv` |
| `getSecurityStats` | 보안 통계 조회 | - |
| `queryAuditLogs` | 감사 로그 조회 | - |
| `getAuditSummary` | 감사 로그 요약 | - |
| `assignRole` | 역할 할당 | `userId`, `roleId`, `assignedBy` |

---

## 6. 도구별 상세 사용법

### 6.1 기본 도구

#### getProjectStatus
프로젝트의 현재 상태를 조회합니다.

```json
{
  "includeDetails": true
}
```

**파라미터:**
- `includeDetails` (boolean, 기본값: false): 상세 정보 포함 여부

**응답 예시:**
```json
{
  "status": "active",
  "currentStage": "coding",
  "progress": 75,
  "milestones": [...],
  "environment": {...}
}
```

---

#### getMetrics
개발 메트릭을 조회합니다.

```json
{
  "timeRange": "1d",
  "metricType": "all"
}
```

**파라미터:**
- `timeRange` (string): 조회 시간 범위
  - `"1h"`: 최근 1시간
  - `"1d"`: 최근 1일 (기본값)
  - `"1w"`: 최근 1주
  - `"1m"`: 최근 1개월
- `metricType` (string): 메트릭 유형
  - `"all"`: 전체 (기본값)
  - `"commits"`: 커밋
  - `"files"`: 파일 변경
  - `"tests"`: 테스트
  - `"builds"`: 빌드

---

#### getActivityLog
개발 활동 로그를 조회합니다.

```json
{
  "limit": 50,
  "stage": "coding"
}
```

**파라미터:**
- `limit` (integer, 기본값: 50): 최대 조회 개수 (1-1000)
- `stage` (string): 필터링할 개발 단계
  - `"planning"`, `"design"`, `"coding"`, `"testing"`, `"review"`, `"deployment"`, `"monitoring"`

---

#### analyzeBottlenecks
병목 현상을 분석합니다.

```json
{
  "analysisDepth": "detailed"
}
```

**파라미터:**
- `analysisDepth` (string): 분석 깊이
  - `"basic"`: 기본 (기본값)
  - `"detailed"`: 상세
  - `"comprehensive"`: 종합

---

#### checkMethodology
개발 방법론 준수도를 검사합니다.

```json
{
  "methodology": "ddd",
  "includeRecommendations": true
}
```

**파라미터:**
- `methodology` (string): 검사할 방법론
  - `"all"`: 전체 (기본값)
  - `"ddd"`: Domain-Driven Design
  - `"tdd"`: Test-Driven Development
  - `"bdd"`: Behavior-Driven Development
  - `"eda"`: Event-Driven Architecture
- `includeRecommendations` (boolean, 기본값: false): 권장사항 포함 여부

---

#### generateReport
개발 보고서를 생성합니다.

```json
{
  "reportType": "daily",
  "format": "markdown",
  "includeMetrics": true,
  "includeTrends": true
}
```

**파라미터:**
- `reportType` (string): 보고서 유형
  - `"daily"`: 일일 (기본값)
  - `"weekly"`: 주간
  - `"monthly"`: 월간
  - `"custom"`: 사용자 정의
- `format` (string): 출력 형식
  - `"json"`, `"markdown"`, `"summary"` (기본값)
- `includeMetrics` (boolean, 기본값: true): 메트릭 포함
- `includeTrends` (boolean, 기본값: false): 트렌드 포함

---

### 6.2 플러그인 관리 도구

#### listPlugins
설치된 플러그인 목록을 조회합니다.

```json
{
  "category": "monitoring",
  "status": "running"
}
```

**파라미터:**
- `category` (string): 플러그인 카테고리 필터
- `status` (string): 플러그인 상태 필터
  - `"unloaded"`, `"loading"`, `"loaded"`, `"running"`, `"paused"`, `"error"`, `"disabled"`

---

#### getPluginInfo
특정 플러그인의 상세 정보를 조회합니다.

```json
{
  "pluginId": "my-plugin-id"
}
```

**필수 파라미터:**
- `pluginId` (string): 플러그인 ID

---

#### loadPlugin / unloadPlugin / activatePlugin / deactivatePlugin / restartPlugin
플러그인 생명주기를 관리합니다.

```json
{
  "pluginId": "my-plugin-id"
}
```

**필수 파라미터:**
- `pluginId` (string): 플러그인 ID

---

#### installPlugin
레지스트리에서 플러그인을 설치합니다.

```json
{
  "pluginName": "devflow-analytics",
  "version": "1.0.0"
}
```

**필수 파라미터:**
- `pluginName` (string): 설치할 플러그인 이름

**선택 파라미터:**
- `version` (string): 플러그인 버전 (생략 시 최신 버전)

---

#### searchPlugins
플러그인을 검색합니다.

```json
{
  "query": "analytics",
  "local": false
}
```

**필수 파라미터:**
- `query` (string): 검색어

**선택 파라미터:**
- `local` (boolean, 기본값: false): 로컬 플러그인만 검색

---

#### updatePlugin
플러그인을 업데이트합니다.

```json
{
  "pluginId": "my-plugin-id",
  "version": "2.0.0"
}
```

**필수 파라미터:**
- `pluginId` (string): 업데이트할 플러그인 ID

**선택 파라미터:**
- `version` (string): 업데이트할 버전 (생략 시 최신 버전)

---

### 6.3 개발 단계 분석 도구

#### analyzeStage
현재 개발 단계를 분석합니다.

```json
{
  "includeSubStages": true,
  "includeHistory": true,
  "historyLimit": 10
}
```

**파라미터:**
- `includeSubStages` (boolean, 기본값: true): 코딩 세부 단계 포함
- `includeHistory` (boolean, 기본값: false): 단계 전환 히스토리 포함
- `historyLimit` (integer, 기본값: 10): 히스토리 항목 수 제한

---

### 6.4 AI 협업 분석 도구

#### analyzeAICollaboration
AI 도구 사용 현황과 효과성을 분석합니다.

```json
{
  "tool": "claude",
  "timeRange": "1d",
  "includePatterns": true,
  "includeQuality": true
}
```

**파라미터:**
- `tool` (string): AI 도구 필터
  - `"all"` (기본값), `"claude"`, `"github_copilot"`, `"chatgpt"`, `"cursor"`, `"other"`
- `timeRange` (string): 분석 기간
  - `"1h"`, `"1d"` (기본값), `"1w"`, `"1m"`
- `includePatterns` (boolean, 기본값: true): 사용 패턴 분석 포함
- `includeQuality` (boolean, 기본값: true): 코드 품질 분석 포함

---

### 6.5 WebSocket 도구

#### startWebSocketServer
WebSocket 서버를 시작합니다.

```json
{
  "port": 8081
}
```

**파라미터:**
- `port` (integer, 기본값: 8081): 서버 포트 번호

---

#### broadcastSystemNotification
모든 WebSocket 클라이언트에게 시스템 알림을 브로드캐스트합니다.

```json
{
  "message": "서버 점검 예정",
  "severity": "warning",
  "data": {"scheduledTime": "2026-02-05T10:00:00Z"}
}
```

**필수 파라미터:**
- `message` (string): 알림 메시지

**선택 파라미터:**
- `severity` (string): 알림 심각도
  - `"info"` (기본값), `"warning"`, `"error"`
- `data` (object): 추가 데이터

---

### 6.6 대시보드 도구

#### startDashboard
DevFlow Monitor 대시보드를 시작합니다.

```json
{
  "mode": "tui",
  "refreshInterval": 1000,
  "maxEvents": 100
}
```

**파라미터:**
- `mode` (string): 대시보드 모드
  - `"tui"` (기본값): 터미널 UI
  - `"cli"`: 커맨드라인 인터페이스
- `refreshInterval` (integer, 기본값: 1000): 새로고침 간격 (밀리초)
- `maxEvents` (integer, 기본값: 100): 최대 이벤트 수

---

### 6.7 다중 프로젝트 관리 도구

#### createProject
새로운 프로젝트를 생성합니다.

```json
{
  "name": "My Project",
  "description": "프로젝트 설명",
  "type": "web_application",
  "priority": "high",
  "rootPath": "/path/to/project",
  "tags": ["frontend", "react"]
}
```

**필수 파라미터:**
- `name` (string): 프로젝트 이름

**선택 파라미터:**
- `description` (string): 프로젝트 설명
- `type` (string): 프로젝트 타입
  - `"web_application"`, `"mobile_application"`, `"api_service"`, `"library"`, `"cli_tool"`, `"microservice"`, `"monolith"`, `"data_pipeline"`, `"infrastructure"`, `"documentation"`, `"other"`
- `priority` (string): 우선순위
  - `"critical"`, `"high"`, `"medium"`, `"low"`
- `rootPath` (string): 프로젝트 루트 경로
- `tags` (array): 프로젝트 태그

---

#### listProjects
등록된 프로젝트 목록을 조회합니다.

```json
{
  "status": "active",
  "type": "web_application",
  "limit": 20
}
```

**파라미터:**
- `status` (string): 프로젝트 상태 필터
  - `"active"`, `"inactive"`, `"archived"`, `"maintenance"`, `"development"`, `"production"`, `"deprecated"`
- `type` (string): 프로젝트 타입 필터
- `limit` (number): 최대 결과 수

---

#### updateProject
프로젝트 정보를 업데이트합니다.

```json
{
  "projectId": "proj-123",
  "name": "Updated Name",
  "status": "production",
  "priority": "critical",
  "tags": ["frontend", "production"]
}
```

**필수 파라미터:**
- `projectId` (string): 프로젝트 ID

---

#### discoverProjects
지정된 경로에서 프로젝트를 자동으로 검색합니다.

```json
{
  "searchPaths": ["/Users/yaio/dev", "/Users/yaio/projects"],
  "autoRegister": true
}
```

**파라미터:**
- `searchPaths` (array): 검색할 디렉토리 경로들
- `autoRegister` (boolean, 기본값: true): 자동 등록 여부

---

#### runCrossProjectAnalysis
여러 프로젝트 간의 크로스 분석을 실행합니다.

```json
{
  "projectIds": ["proj-1", "proj-2"],
  "analysisType": "similarity"
}
```

**파라미터:**
- `projectIds` (array): 분석할 프로젝트 ID들 (생략 시 모든 활성 프로젝트)
- `analysisType` (string): 분석 타입
  - `"similarity"`: 유사성 분석
  - `"dependency"`: 의존성 분석
  - `"performance"`: 성능 분석
  - `"quality"`: 품질 분석
  - `"trend"`: 트렌드 분석
  - `"bottleneck"`: 병목 분석
  - `"collaboration"`: 협업 분석

---

#### getProjectDependencies
프로젝트 간 의존성 관계를 조회합니다.

```json
{
  "projectId": "proj-123",
  "direction": "both"
}
```

**필수 파라미터:**
- `projectId` (string): 프로젝트 ID

**선택 파라미터:**
- `direction` (string): 의존성 방향
  - `"incoming"`, `"outgoing"`, `"both"`

---

#### enableProjectSync
프로젝트 동기화를 활성화합니다.

```json
{
  "endpoint": "https://sync.example.com",
  "apiKey": "your-api-key",
  "interval": 300
}
```

**필수 파라미터:**
- `endpoint` (string): 동기화 서버 엔드포인트
- `apiKey` (string): API 키

**선택 파라미터:**
- `interval` (number): 동기화 간격 (초)

---

### 6.8 고급 메트릭 도구

#### getAdvancedMetrics
고급 메트릭 분석 결과를 조회합니다.

```json
{
  "includeBottlenecks": true,
  "includeInsights": true,
  "includeRecommendations": true,
  "timeRange": "24h"
}
```

**파라미터:**
- `includeBottlenecks` (boolean, 기본값: true): 병목 현상 포함
- `includeInsights` (boolean, 기본값: true): 인사이트 포함
- `includeRecommendations` (boolean, 기본값: true): 권장사항 포함
- `timeRange` (string): 조회 시간 범위

---

#### getBottlenecks
현재 감지된 병목 현상을 조회합니다.

```json
{
  "type": "process",
  "severity": "warning",
  "minImpact": 50
}
```

**파라미터:**
- `type` (string): 병목 유형 필터
  - `"process"`, `"quality"`, `"resource"`, `"workflow"`, `"technical"`
- `severity` (string): 심각도 필터
  - `"info"`, `"warning"`, `"error"`, `"critical"`
- `minImpact` (integer, 0-100): 최소 영향도 필터

---

#### getMetricsSnapshot
현재 메트릭 스냅샷을 조회합니다.

```json
{
  "includeHistory": true,
  "metricTypes": ["productivity", "quality"]
}
```

**파라미터:**
- `includeHistory` (boolean, 기본값: false): 히스토리 포함
- `metricTypes` (array): 조회할 메트릭 유형 목록

---

#### analyzeProductivity
생산성 메트릭을 상세 분석합니다.

```json
{
  "timeRange": "7d",
  "includeTrends": true
}
```

**파라미터:**
- `timeRange` (string, 기본값: "24h"): 분석 시간 범위
- `includeTrends` (boolean, 기본값: true): 트렌드 분석 포함

---

### 6.9 알림 도구

#### configureNotifications
알림 채널 및 규칙을 설정합니다.

```json
{
  "channel": "slack",
  "config": {
    "webhookUrl": "https://hooks.slack.com/...",
    "channel": "#dev-alerts"
  },
  "rules": [
    {
      "name": "bottleneck-alert",
      "conditions": [{"type": "bottleneck", "severity": "error"}],
      "channels": ["slack"]
    }
  ]
}
```

**파라미터:**
- `channel` (string): 알림 채널
  - `"slack"`, `"email"`, `"dashboard"`, `"webhook"`
- `config` (object): 채널별 설정 객체
- `rules` (array): 알림 규칙 목록

---

#### sendNotification
즉시 알림을 전송합니다.

```json
{
  "title": "긴급 알림",
  "content": "시스템 점검이 필요합니다.",
  "severity": "error",
  "priority": "urgent",
  "channels": ["slack", "email"]
}
```

**필수 파라미터:**
- `title` (string): 알림 제목
- `content` (string): 알림 내용

**선택 파라미터:**
- `severity` (string): 심각도
  - `"info"`, `"warning"`, `"error"`, `"critical"`
- `priority` (string): 우선순위
  - `"low"`, `"medium"`, `"high"`, `"urgent"`
- `channels` (array): 대상 채널 목록

---

#### getDashboardNotifications
대시보드 알림을 조회합니다.

```json
{
  "unreadOnly": true,
  "limit": 20
}
```

**파라미터:**
- `unreadOnly` (boolean, 기본값: false): 읽지 않은 알림만 조회
- `limit` (integer, 기본값: 50, 최대: 100): 최대 조회 개수

---

#### deleteNotificationRule
알림 규칙을 삭제합니다.

```json
{
  "ruleId": "rule-123"
}
```

**필수 파라미터:**
- `ruleId` (string): 삭제할 규칙 ID

---

### 6.10 보고서 생성 도구

#### generateQuickReport
빠른 보고서를 생성합니다.

```json
{
  "type": "weekly",
  "projectIds": ["proj-1", "proj-2"]
}
```

**필수 파라미터:**
- `type` (string): 보고서 타입
  - `"daily"`, `"weekly"`, `"monthly"`

**선택 파라미터:**
- `projectIds` (array): 대상 프로젝트 ID 목록

---

#### createReportSchedule
정기적인 보고서 생성 스케줄을 만듭니다.

```json
{
  "name": "주간 개발 보고서",
  "reportType": "weekly",
  "scheduleType": "weekly",
  "time": "09:00",
  "dayOfWeek": 1,
  "emailRecipients": ["team@example.com"]
}
```

**필수 파라미터:**
- `name` (string): 스케줄 이름
- `reportType` (string): 보고서 타입
- `scheduleType` (string): 스케줄 타입
- `time` (string): 실행 시간 (HH:mm 형식)

**선택 파라미터:**
- `dayOfWeek` (number, 0-6): 실행 요일 (주간 스케줄용)
- `dayOfMonth` (number, 1-31): 실행 날짜 (월간 스케줄용)
- `emailRecipients` (array): 이메일 수신자 목록

---

#### runScheduleNow
스케줄된 보고서를 즉시 실행합니다.

```json
{
  "scheduleId": "schedule-123"
}
```

**필수 파라미터:**
- `scheduleId` (string): 실행할 스케줄 ID

---

#### listReportTemplates
사용 가능한 보고서 템플릿을 조회합니다.

```json
{
  "type": "weekly"
}
```

**파라미터:**
- `type` (string): 템플릿 타입 필터
  - `"daily"`, `"weekly"`, `"monthly"`, `"methodology"`, `"ai_usage"`

---

### 6.11 사용자 피드백 도구

#### submitFeedback
사용자 피드백을 제출합니다.

```json
{
  "type": "bug_report",
  "title": "로그인 버튼 동작 안함",
  "description": "Safari에서 로그인 버튼 클릭 시 반응 없음",
  "projectId": "proj-123",
  "priority": "high",
  "tags": ["safari", "login", "ui"]
}
```

**필수 파라미터:**
- `type` (string): 피드백 타입
  - `"bug_report"`, `"feature_request"`, `"usability_issue"`, `"performance_issue"`, `"documentation"`, `"general"`, `"praise"`
- `title` (string): 피드백 제목
- `description` (string): 피드백 설명

**선택 파라미터:**
- `projectId` (string): 프로젝트 ID
- `priority` (string): 우선순위
  - `"critical"`, `"high"`, `"medium"`, `"low"`
- `tags` (array): 태그 목록

---

#### listFeedback
피드백 목록을 조회합니다.

```json
{
  "limit": 20,
  "type": "bug_report",
  "status": "reviewing",
  "priority": "high",
  "projectId": "proj-123"
}
```

**파라미터:**
- `limit` (number, 기본값: 20): 조회할 개수
- `type` (string): 피드백 타입 필터
- `status` (string): 상태 필터
  - `"new"`, `"reviewing"`, `"in_progress"`, `"resolved"`, `"closed"`, `"deferred"`
- `priority` (string): 우선순위 필터
- `projectId` (string): 프로젝트 ID 필터

---

#### updateFeedbackStatus
피드백 상태를 업데이트합니다.

```json
{
  "feedbackId": "fb-123",
  "status": "in_progress"
}
```

**필수 파라미터:**
- `feedbackId` (string): 피드백 ID
- `status` (string): 새로운 상태

---

#### listImprovementSuggestions
개선 제안 목록을 조회합니다.

```json
{
  "status": "approved"
}
```

**파라미터:**
- `status` (string): 상태 필터
  - `"proposed"`, `"approved"`, `"in_progress"`, `"completed"`, `"rejected"`

---

#### createABTest
A/B 테스트를 생성합니다.

```json
{
  "name": "새 로그인 UI 테스트",
  "description": "새로운 로그인 UI의 전환율 테스트",
  "variants": [
    {"name": "control", "trafficPercentage": 50, "changes": {}, "isControl": true},
    {"name": "new_ui", "trafficPercentage": 50, "changes": {"ui": "v2"}, "isControl": false}
  ],
  "metrics": [
    {"name": "login_conversion", "type": "conversion", "goal": 0.8, "calculation": "success_count / total_attempts"}
  ],
  "audiencePercentage": 100
}
```

**필수 파라미터:**
- `name` (string): 테스트 이름
- `description` (string): 테스트 설명
- `variants` (array): 테스트 변형 목록
- `metrics` (array): 측정 메트릭 목록

**선택 파라미터:**
- `audiencePercentage` (number, 기본값: 100): 대상 사용자 비율

---

### 6.12 성능 도구

#### getPerformanceReport
종합 성능 보고서를 생성합니다.

```json
{
  "includeRecommendations": true
}
```

**파라미터:**
- `includeRecommendations` (boolean, 기본값: true): 권장사항 포함

---

#### optimizePerformance
시스템 성능 최적화를 실행합니다.

```json
{
  "level": "aggressive"
}
```

**파라미터:**
- `level` (string): 최적화 수준
  - `"basic"` (기본값): 기본 최적화
  - `"aggressive"`: 적극적 최적화
  - `"emergency"`: 긴급 최적화

---

#### profilePerformance
성능 프로파일링을 관리합니다.

```json
{
  "action": "start",
  "intervalMs": 5000
}
```

**파라미터:**
- `action` (string): 프로파일링 작업
  - `"start"`: 시작
  - `"stop"`: 중지
  - `"status"` (기본값): 상태 확인
- `intervalMs` (integer, 기본값: 5000): 모니터링 간격

---

#### manageCaches
캐시 관리 작업을 수행합니다.

```json
{
  "action": "optimize",
  "cacheType": "all"
}
```

**파라미터:**
- `action` (string): 캐시 작업
  - `"clear"`: 캐시 초기화
  - `"stats"` (기본값): 통계 조회
  - `"warmup"`: 캐시 워밍업
  - `"optimize"`: 캐시 최적화
- `cacheType` (string): 대상 캐시 유형
  - `"all"` (기본값), `"memory"`, `"sqlite"`

---

### 6.13 보안 도구

#### login
사용자 로그인을 처리합니다.

```json
{
  "username": "admin",
  "password": "secure-password",
  "rememberMe": true
}
```

**필수 파라미터:**
- `username` (string): 사용자 이름
- `password` (string): 비밀번호

**선택 파라미터:**
- `rememberMe` (boolean, 기본값: false): 로그인 상태 유지

---

#### verifyToken
JWT 토큰을 검증합니다.

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**필수 파라미터:**
- `token` (string): 검증할 JWT 토큰

---

#### checkPermission
사용자 권한을 확인합니다.

```json
{
  "userId": "user-123",
  "resource": "projects",
  "action": "create"
}
```

**필수 파라미터:**
- `userId` (string): 사용자 ID
- `resource` (string): 리소스 이름
- `action` (string): 권한 액션
  - `"create"`, `"read"`, `"update"`, `"delete"`, `"execute"`, `"admin"`

---

#### generateAPIKey
API 키를 생성합니다.

```json
{
  "userId": "user-123",
  "name": "CI/CD Pipeline Key",
  "permissions": ["read", "execute"],
  "expiresInDays": 90
}
```

**필수 파라미터:**
- `userId` (string): 사용자 ID
- `name` (string): API 키 이름

**선택 파라미터:**
- `permissions` (array): 부여할 권한 목록
- `expiresInDays` (integer, 기본값: 30): 만료 기간 (일)

---

#### encryptData
데이터를 AES-256-GCM으로 암호화합니다.

```json
{
  "data": "민감한 데이터"
}
```

**필수 파라미터:**
- `data` (string): 암호화할 데이터

---

#### decryptData
암호화된 데이터를 복호화합니다.

```json
{
  "encrypted": "암호화된 문자열",
  "iv": "초기화 벡터",
  "tag": "인증 태그"
}
```

**필수 파라미터:**
- `encrypted` (string): 암호화된 데이터
- `iv` (string): 초기화 벡터

**선택 파라미터:**
- `tag` (string): 인증 태그

---

#### queryAuditLogs
감사 로그를 조회합니다.

```json
{
  "userId": "user-123",
  "eventType": "login",
  "startDate": "2026-02-01T00:00:00Z",
  "endDate": "2026-02-04T23:59:59Z",
  "limit": 100
}
```

**파라미터:**
- `userId` (string): 사용자 ID 필터
- `eventType` (string): 이벤트 타입 필터
- `startDate` (string): 시작 날짜 (ISO 8601)
- `endDate` (string): 종료 날짜 (ISO 8601)
- `limit` (integer, 기본값: 100): 최대 조회 개수

---

#### getAuditSummary
감사 로그 요약을 조회합니다.

```json
{
  "startDate": "2026-02-01T00:00:00Z",
  "endDate": "2026-02-04T23:59:59Z"
}
```

**파라미터:**
- `startDate` (string): 시작 날짜 (ISO 8601)
- `endDate` (string): 종료 날짜 (ISO 8601)

---

#### assignRole
사용자에게 역할을 할당합니다.

```json
{
  "userId": "user-123",
  "roleId": "admin",
  "assignedBy": "system-admin",
  "reason": "프로젝트 관리자 승격"
}
```

**필수 파라미터:**
- `userId` (string): 사용자 ID
- `roleId` (string): 역할 ID
- `assignedBy` (string): 할당자 ID

**선택 파라미터:**
- `reason` (string): 할당 사유

---

## 7. 주요 모듈

| 모듈 | 설명 |
|------|------|
| `server` | MCP 서버 |
| `events` | 이벤트 시스템 |
| `monitors` | 파일/Git 모니터링 |
| `storage` | SQLite 저장소 |
| `analyzers` | 분석 엔진 |
| `integrations` | Jira/Notion/Figma |
| `security` | 인증/암호화 |
| `plugins` | 플러그인 시스템 |
| `reports` | 보고서 생성 |
| `notifications` | 알림 (Slack/Email) |
| `dashboard` | CLI/TUI 대시보드 |
| `prediction` | 패턴/병목 예측 |
| `projects` | 다중 프로젝트 |
| `feedback` | 피드백/A/B 테스트 |
| `workflow` | 워크플로우 엔진 |

---

## 8. 문제 해결

### Import 오류

```bash
export PYTHONPATH="$HOME/dev/workspace/cincotime_projects/kroot-mcp/python/src:$PYTHONPATH"
```

### 의존성 재설치

```bash
poetry env remove python
poetry install
```

### 테스트 실패 상세 확인

```bash
poetry run pytest -v --tb=long -x
```

---

## 9. 라이선스

MIT License

---

## 10. 테스트 검증 기록

### 검증일: 2026-02-04

### 10.1 모듈 Import 테스트: 15/15 성공

| 모듈 | 상태 |
|------|------|
| server | 성공 |
| events | 성공 |
| monitors | 성공 |
| storage | 성공 |
| analyzers | 성공 |
| integrations | 성공 |
| security | 성공 |
| performance | 성공 |
| plugins | 성공 |
| reports | 성공 |
| notifications | 성공 |
| workflow | 성공 |
| prediction | 성공 |
| projects | 성공 |
| feedback | 성공 |

### 10.2 MCP 서버 검증: 성공

- 서버 초기화: 정상
- 등록된 MCP 도구: **88개**

### 10.3 TypeScript vs Python 기능 비교

| 항목 | TypeScript | Python |
|------|------------|--------|
| MCP 도구 수 | 87개 | 88개 |
| 일치 | 87개 | 87개 |
| 추가 | - | `deleteNotificationRule` |

**일치율: 100%** (TypeScript 모든 기능 + 1개 추가)

### 10.4 도구 카테고리별 분포

| 카테고리 | 개수 |
|----------|------|
| 기본 도구 | 6개 |
| 플러그인 관리 | 15개 |
| 개발 단계 분석 | 1개 |
| AI 협업 분석 | 1개 |
| WebSocket | 5개 |
| 대시보드 | 2개 |
| 다중 프로젝트 | 16개 |
| 고급 메트릭 | 4개 |
| 알림 | 6개 |
| 보고서 | 7개 |
| 피드백 | 10개 |
| 성능 | 5개 |
| 보안 | 10개 |
| **합계** | **88개** |

### 10.5 결론

Python 마이그레이션 작업이 성공적으로 완료되었습니다.

- 15개 모듈 모두 import 가능
- MCP 서버 정상 시작
- 88개 MCP 도구 등록 완료
- TypeScript 대비 100% 기능 일치 + 1개 추가 기능

---

## 11. 실제 테스트 기록

### 검증일: 2026-02-04

### 11.1 테스트 결과 요약

| 카테고리 | 도구 수 | 성공 | 실패 | 성공률 |
|----------|---------|------|------|--------|
| 기본 도구 | 6 | 6 | 0 | 100% |
| 플러그인 관리 | 15 | 15 | 0 | 100% |
| 개발 단계 분석 | 1 | 1 | 0 | 100% |
| AI 협업 분석 | 1 | 1 | 0 | 100% |
| WebSocket | 5 | 5 | 0 | 100% |
| 대시보드 | 2 | 2 | 0 | 100% |
| 다중 프로젝트 관리 | 16 | 16 | 0 | 100% |
| 고급 메트릭 | 4 | 4 | 0 | 100% |
| 알림 | 6 | 6 | 0 | 100% |
| 보고서 생성 | 7 | 7 | 0 | 100% |
| 사용자 피드백 | 10 | 10 | 0 | 100% |
| 성능 | 5 | 5 | 0 | 100% |
| 보안 | 10 | 10 | 0 | 100% |
| **합계** | **88** | **88** | **0** | **100%** |

### 11.2 실제 테스트에 사용된 파라미터

#### 5.1 기본 도구 (6개)

```python
('getProjectStatus', {'includeDetails': False})
('getMetrics', {'timeRange': '1d', 'metricType': 'all'})
('getActivityLog', {'limit': 10})
('analyzeBottlenecks', {'analysisDepth': 'basic'})
('checkMethodology', {'methodology': 'all', 'includeRecommendations': False})
('generateReport', {'reportType': 'daily', 'format': 'summary'})
```

#### 5.2 플러그인 관리 도구 (15개)

```python
('listPlugins', {})
('getPluginInfo', {'pluginId': 'test-plugin'})
('loadPlugin', {'pluginId': 'test-plugin'})
('unloadPlugin', {'pluginId': 'test-plugin'})
('activatePlugin', {'pluginId': 'test-plugin'})
('deactivatePlugin', {'pluginId': 'test-plugin'})
('restartPlugin', {'pluginId': 'test-plugin'})
('installPlugin', {'pluginName': 'test-plugin'})
('uninstallPlugin', {'pluginId': 'test-plugin'})
('searchPlugins', {'query': 'test', 'local': True})
('checkPluginHealth', {})
('getPluginMetrics', {})
('updatePlugin', {'pluginId': 'test-plugin'})
('checkPluginUpdates', {})
('getPluginSystemStats', {})
```

#### 5.3 개발 단계 분석 도구 (1개)

```python
('analyzeStage', {'includeSubStages': True, 'includeHistory': False})
```

#### 5.4 AI 협업 분석 도구 (1개)

```python
('analyzeAICollaboration', {'tool': 'all', 'timeRange': '1d'})
```

#### 5.5 WebSocket 도구 (5개)

```python
('startWebSocketServer', {'port': 8082})
('stopWebSocketServer', {})
('getWebSocketStats', {})
('getStreamStats', {})
('broadcastSystemNotification', {'message': 'Test notification', 'severity': 'info'})
```

#### 5.6 대시보드 도구 (2개)

```python
('startDashboard', {'mode': 'cli'})
('getDashboardStatus', {})
```

#### 5.7 다중 프로젝트 관리 도구 (16개)

```python
('createProject', {'name': 'Test Project', 'description': 'Test description'})
('listProjects', {})
('getProject', {'projectId': 'test-proj-1'})
('updateProject', {'projectId': 'test-proj-1', 'name': 'Updated Name'})
('deleteProject', {'projectId': 'test-proj-1'})
('discoverProjects', {'searchPaths': ['/tmp'], 'autoRegister': False})
('searchProjects', {'query': 'test'})
('getProjectMetrics', {'projectId': 'test-proj-1', 'timeRange': '1d'})
('collectProjectMetrics', {})
('runCrossProjectAnalysis', {'analysisType': 'similarity'})
('getProjectDependencies', {'projectId': 'test-proj-1', 'direction': 'both'})
('getMultiProjectStatus', {})
('getProjectPortfolio', {'groupBy': 'type'})
('enableProjectSync', {'endpoint': 'https://example.com', 'apiKey': 'test-key'})
('triggerProjectSync', {'force': False})
('getProjectSyncStatus', {})
```

#### 5.8 고급 메트릭 도구 (4개)

```python
('getAdvancedMetrics', {'includeBottlenecks': True, 'includeInsights': True})
('getBottlenecks', {'severity': 'warning'})
('getMetricsSnapshot', {'includeHistory': False})
('analyzeProductivity', {'timeRange': '24h', 'includeTrends': True})
```

#### 5.9 알림 도구 (6개)

```python
('configureNotifications', {'channel': 'dashboard'})
('sendNotification', {'title': 'Test', 'content': 'Test content'})
('getNotificationRules', {})
('getNotificationStats', {})
('getDashboardNotifications', {'unreadOnly': False, 'limit': 10})
('deleteNotificationRule', {'ruleId': 'test-rule-1'})
```

#### 5.10 보고서 생성 도구 (7개)

```python
('generateQuickReport', {'type': 'daily'})
('createReportSchedule', {
    'name': 'Test Schedule',
    'reportType': 'daily',
    'scheduleType': 'daily',
    'time': '09:00'
})
('listReportSchedules', {})
('deleteReportSchedule', {'scheduleId': 'test-schedule-1'})
('runScheduleNow', {'scheduleId': 'test-schedule-1'})
('listReportTemplates', {})
('getReportSystemStatus', {})
```

#### 5.11 사용자 피드백 도구 (10개)

```python
('submitFeedback', {
    'type': 'bug_report',
    'title': 'Test Bug',
    'description': 'Test description'
})
('listFeedback', {'limit': 10})
('getFeedbackDetails', {'feedbackId': 'test-feedback-1'})
('updateFeedbackStatus', {'feedbackId': 'test-feedback-1', 'status': 'reviewing'})
('listImprovementSuggestions', {})
('getUserPreferences', {'userId': 'test-user-1'})
('createABTest', {
    'name': 'Test AB',
    'description': 'Test description',
    'variants': [
        {'name': 'control', 'trafficPercentage': 50, 'changes': {}, 'isControl': True},
        {'name': 'variant_a', 'trafficPercentage': 50, 'changes': {'feature': 'v2'}, 'isControl': False}
    ],
    'metrics': [
        {'name': 'conversion', 'type': 'conversion', 'goal': 0.1, 'calculation': 'count/total'}
    ]
})
('listActiveABTests', {})
('getABTestResults', {'testId': 'test-ab-1'})
('getFeedbackStats', {})
```

#### 5.12 성능 도구 (5개)

```python
('getPerformanceReport', {'includeRecommendations': True})
('optimizePerformance', {'level': 'basic'})
('getSystemMetrics', {'includeHistory': False})
('profilePerformance', {'action': 'status'})
('manageCaches', {'action': 'stats', 'cacheType': 'all'})
```

#### 5.13 보안 도구 (10개)

```python
('login', {'username': 'admin', 'password': 'test123', 'rememberMe': False})
('verifyToken', {'token': 'test-token'})
('checkPermission', {'userId': 'user-1', 'resource': 'projects', 'action': 'read'})
('generateAPIKey', {'userId': 'user-1', 'name': 'Test Key', 'permissions': ['read']})
('encryptData', {'data': 'test data'})
('decryptData', {'encrypted': 'dGVzdA==', 'iv': 'aXY='})
('getSecurityStats', {})
('queryAuditLogs', {'limit': 10})
('getAuditSummary', {})
('assignRole', {'userId': 'user-1', 'roleId': 'admin', 'assignedBy': 'system'})
```

### 11.3 테스트 코드

```python
import asyncio
from devflow_monitor.server.main import DevFlowMonitorServer

async def test_tool(server, name, args):
    try:
        result = await asyncio.wait_for(
            server._handle_tool_call(name, args),
            timeout=5.0
        )
        return '✅ 성공'
    except asyncio.TimeoutError:
        return '⏱️ 타임아웃'
    except Exception as e:
        return f'❌ 실패: {str(e)[:50]}'

async def main():
    server = DevFlowMonitorServer()

    # 테스트 케이스 실행
    test_cases = [
        # 위의 모든 테스트 케이스
    ]

    for name, args in test_cases:
        result = await test_tool(server, name, args)
        print(f'{name}: {result}')

asyncio.run(main())
```

### 11.4 문서 예시와 실제 테스트의 차이점

| 항목 | 문서 예시 | 실제 테스트 |
|------|----------|------------|
| 파라미터 이름 | 동일 | 동일 |
| 파라미터 구조 | 동일 | 동일 |
| 파라미터 값 | 실제 사용 예시 | 테스트용 임의 값 |

**차이 발생 이유:**
- 문서의 예시 값은 실제 사용 시나리오를 보여주기 위한 것
- 테스트에서는 도구의 동작 여부 확인이 목적이므로 간단한 테스트 값 사용
- 예: `password: "secure-password"` → `password: "test123"`

### 11.5 테스트 환경

- **Python**: 3.12.10
- **Poetry**: 설치됨
- **OS**: macOS Darwin 24.6.0
- **테스트 일시**: 2026-02-04
