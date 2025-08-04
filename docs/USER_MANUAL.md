# DevFlow Monitor MCP - 사용자 매뉴얼

## 목차
1. [소개](#소개)
2. [시작하기](#시작하기)
3. [기본 사용법](#기본-사용법)
4. [MCP 도구 활용](#mcp-도구-활용)
5. [대시보드 사용](#대시보드-사용)
6. [고급 기능](#고급-기능)
7. [실무 워크플로우](#실무-워크플로우)
8. [문제 해결](#문제-해결)

## 소개

DevFlow Monitor MCP는 개발 워크플로우를 지능적으로 모니터링하고 분석하는 Model Context Protocol (MCP) 서버입니다. Claude Desktop과 통합되어 실시간으로 개발 활동을 추적하고 생산성 향상을 위한 인사이트를 제공합니다.

### 주요 기능

- **파일 시스템 모니터링**: 코드 변경사항 실시간 추적
- **Git 통합**: 커밋, 브랜치, 머지 활동 분석
- **개발 단계 인식**: 13단계 개발 프로세스 자동 감지
- **AI 협업 추적**: Claude, Copilot 등 AI 도구 사용 패턴 분석
- **메트릭 분석**: 생산성, 품질, 성능 메트릭 계산
- **실시간 알림**: Slack, 대시보드를 통한 알림 시스템
- **CLI/TUI 대시보드**: 명령줄 및 터미널 UI 대시보드

### 시스템 요구사항

- Node.js v20.0.0 이상 (LTS 권장)
- Claude Desktop 최신 버전
- Git v2.30.0 이상
- 운영체제: Windows 10+, macOS 12+, Ubuntu 20.04+

## 시작하기

### 1. 설치 확인

DevFlow Monitor가 올바르게 설치되었는지 확인합니다:

```bash
# 설치 검증
npm run verify

# 또는 수동 확인
node scripts/verify.js
```

### 2. Claude Desktop 연동 확인

Claude Desktop에서 다음과 같이 테스트합니다:

```
프로젝트 상태를 확인해주세요.
```

정상적으로 작동하면 프로젝트 정보와 시스템 상태가 표시됩니다.

### 3. 첫 번째 모니터링 세션

프로젝트 디렉토리에서 DevFlow Monitor를 시작합니다:

```bash
npm start
```

이제 파일 변경, Git 활동, AI 도구 사용이 자동으로 모니터링됩니다.

## 기본 사용법

### Claude Desktop에서 활용

DevFlow Monitor는 Claude Desktop과 긴밀하게 통합됩니다. 다음과 같은 명령을 통해 다양한 정보를 조회할 수 있습니다:

#### 1. 프로젝트 상태 조회

```
현재 프로젝트 상태는 어떤가요?
```

다음 정보가 제공됩니다:
- 시스템 메트릭 (CPU, 메모리, 디스크)
- 활성 모니터 상태
- 최근 활동 요약
- 마일스톤 진행률

#### 2. 개발 활동 로그 확인

```
최근 개발 활동을 보여주세요.
```

또는 시간 범위를 지정:

```
지난 2시간 동안의 활동을 보여주세요.
```

#### 3. 메트릭 분석

```
오늘의 생산성 메트릭을 보여주세요.
```

제공되는 메트릭:
- 코딩 시간 통계
- 파일 변경 패턴
- Git 활동 분석
- AI 도구 사용률

#### 4. 병목 현상 분석

```
현재 병목 현상을 분석해주세요.
```

다음 사항들이 분석됩니다:
- 성능 문제
- 리소스 사용률
- 워크플로우 비효율성
- 개선 제안

### 명령줄 인터페이스

터미널에서 직접 사용할 수 있는 CLI 명령들:

```bash
# 대시보드 실행 (CLI 모드)
npm run dashboard

# 대시보드 실행 (TUI 모드)
npm run dashboard:tui

# 메트릭 리포트 생성
npm run report

# 현재 상태 확인
npm run status
```

## MCP 도구 활용

DevFlow Monitor는 37개의 MCP 도구를 제공합니다. 주요 도구들의 사용법을 소개합니다.

### 1. 프로젝트 관리 도구

#### getProjectStatus
```
프로젝트 상태를 확인해주세요.
```

실시간 시스템 메트릭과 모니터 상태를 제공합니다.

#### getMetrics
```
지난 주간의 메트릭을 보여주세요.
```

시간 범위별 필터링이 가능하며 트렌드 분석을 제공합니다.

### 2. 개발 활동 분석

#### getActivityLog
```
오늘의 Git 활동만 보여주세요.
```

필터링 옵션:
- `category`: file, git, performance, ai 등
- `severity`: critical, high, medium, low, info
- `timeRange`: 1h, 6h, 1d, 1w, 1m

#### analyzeStage
```
현재 개발 단계를 분석해주세요.
```

13단계 개발 프로세스 중 현재 위치를 파악합니다.

### 3. AI 협업 분석

#### analyzeAICollaboration
```
AI 도구 사용 패턴을 분석해주세요.
```

다음 AI 도구들의 사용 패턴을 분석:
- Claude API
- GitHub Copilot
- ChatGPT
- Cursor
- TabNine
- CodeWhisperer

### 4. 방법론 검증

#### checkMethodology
```
DDD 패턴 준수도를 확인해주세요.
```

지원하는 방법론:
- **DDD** (Domain-Driven Design)
- **TDD** (Test-Driven Development)
- **BDD** (Behavior-Driven Development)
- **EDA** (Event-Driven Architecture)

### 5. 리포트 생성

#### generateReport
```
주간 리포트를 생성해주세요.
```

리포트 타입:
- **daily**: 일일 활동 요약
- **weekly**: 주간 생산성 분석
- **monthly**: 월간 트렌드 리포트

## 대시보드 사용

### CLI 대시보드

간단한 테이블 형태의 대시보드:

```bash
npm run dashboard
```

제공되는 정보:
- 시스템 상태 요약
- 최근 이벤트 목록
- 카테고리별 통계
- 실시간 업데이트

### TUI 대시보드

풀스크린 터미널 인터페이스:

```bash
npm run dashboard:tui
```

#### 키보드 단축키

- **r**: 새로고침
- **c**: 화면 지우기
- **h**: 도움말 표시
- **q** 또는 **ESC**: 종료

#### 패널 구성

1. **시스템 상태**: CPU, 메모리, 디스크 사용률
2. **활동 피드**: 실시간 이벤트 스트림
3. **메트릭**: 주요 성능 지표
4. **통계**: 카테고리별 이벤트 분포
5. **알림**: 중요 알림 및 경고
6. **단계 정보**: 현재 개발 단계

### 대시보드 커스터마이징

설정 파일을 통해 대시보드를 커스터마이징할 수 있습니다:

```json
// config/dashboard.json
{
  "cli": {
    "refreshInterval": 5000,
    "maxRows": 20,
    "colorize": true
  },
  "tui": {
    "refreshInterval": 1000,
    "panels": {
      "system": { "enabled": true, "position": "top-left" },
      "activity": { "enabled": true, "position": "center" },
      "metrics": { "enabled": true, "position": "top-right" }
    }
  }
}
```

## 고급 기능

### 1. 실시간 웹소켓 스트리밍

실시간 이벤트 스트림을 받아보려면:

```
실시간 모니터링을 시작해주세요.
```

WebSocket 연결을 통해 다음이 제공됩니다:
- 실시간 이벤트 스트림
- 필터링된 알림
- 시스템 상태 업데이트

### 2. 성능 최적화 도구

#### 성능 프로파일링
```
성능 프로파일링을 실행해주세요.
```

다음을 분석합니다:
- CPU 사용 패턴
- 메모리 누수 감지
- I/O 병목 현상
- 함수 실행 시간

#### 캐시 관리
```
캐시 상태를 확인해주세요.
```

캐시 관리 기능:
- 캐시 히트율 조회
- 메모리 사용량 확인
- 캐시 정리 및 최적화

### 3. 보안 모니터링

#### 보안 감사
```
보안 감사 로그를 확인해주세요.
```

보안 관련 기능:
- 인증 시도 모니터링
- API 키 사용 추적
- 권한 변경 로그
- 보안 경고 알림

### 4. 알림 설정

#### Slack 통합
```json
// config/notifications.json
{
  "slack": {
    "enabled": true,
    "webhookUrl": "https://hooks.slack.com/services/...",
    "channel": "#dev-notifications",
    "filters": {
      "severity": ["critical", "high"],
      "categories": ["performance", "security"]
    }
  }
}
```

#### 알림 규칙 설정
```
알림 규칙을 설정해주세요.
```

규칙 예시:
- CPU 사용률 90% 초과 시 알림
- 메모리 사용률 85% 초과 시 경고
- Git 충돌 발생 시 즉시 알림
- AI 도구 오류 발생 시 알림

## 실무 워크플로우

### 1. 일일 개발 루틴

#### 아침 시작 루틴
```bash
# 1. 시스템 상태 확인
npm run status

# 2. 어제 활동 요약 확인
```
어제의 개발 활동 요약을 보여주세요.
```

# 3. 오늘의 목표 설정
```
오늘의 개발 목표를 설정해주세요.
```
```

#### 개발 중 모니터링
```
# 실시간 대시보드 실행
npm run dashboard:tui

# 또는 Claude에서 중간 점검
```
현재까지의 진행 상황을 보여주세요.
```
```

#### 저녁 마무리 루틴
```
# 일일 리포트 생성
```
오늘의 개발 활동 리포트를 생성해주세요.
```

# 내일을 위한 준비
```
내일의 우선순위를 추천해주세요.
```
```

### 2. 프로젝트 마일스톤 관리

#### 마일스톤 진행률 추적
```
현재 마일스톤 진행률을 보여주세요.
```

#### 병목 현상 식별 및 해결
```
프로젝트 병목 현상을 분석하고 해결책을 제안해주세요.
```

#### 품질 메트릭 모니터링
```
코드 품질 메트릭을 분석해주세요.
```

### 3. 팀 협업 워크플로우

#### 코드 리뷰 준비
```
코드 리뷰를 위한 변경사항 요약을 생성해주세요.
```

#### 머지 전 검증
```
머지 전 품질 검사를 실행해주세요.
```

#### 배포 준비 상태 확인
```
배포 준비 상태를 확인하고 체크리스트를 제공해주세요.
```

## 문제 해결

### 일반적인 문제들

#### 1. MCP 서버 연결 실패

**증상**: Claude Desktop에서 도구를 사용할 수 없음

**해결방법**:
1. 설정 파일 경로 확인
2. 프로젝트 빌드 상태 확인
3. Claude Desktop 재시작

```bash
# 연결 상태 확인
npm run diagnose

# 설정 파일 검증
node -e "console.log(JSON.parse(require('fs').readFileSync('claude-desktop-config.json', 'utf8')))"
```

#### 2. 성능 문제

**증상**: 높은 CPU/메모리 사용률

**해결방법**:
1. 모니터링 범위 조정
2. 캐시 설정 최적화
3. 이벤트 배치 크기 조정

```bash
# 성능 진단
npm run performance:analyze

# 캐시 정리
npm run cache:clear
```

#### 3. 파일 모니터링 누락

**증상**: 파일 변경이 감지되지 않음

**해결방법**:
1. 파일 권한 확인
2. ignore 패턴 검토
3. 파일 시스템 이벤트 확인

```bash
# 파일 모니터링 상태 확인
npm run monitor:status

# 디버그 모드로 실행
DEBUG=file:* npm start
```

### 디버깅 가이드

#### 로그 레벨 설정
```bash
# 상세 로그
LOG_LEVEL=debug npm start

# 오류만 표시
LOG_LEVEL=error npm start
```

#### 특정 모듈 디버깅
```bash
# 파일 모니터링 디버그
DEBUG=file:* npm start

# Git 모니터링 디버그
DEBUG=git:* npm start

# 이벤트 시스템 디버그
DEBUG=events:* npm start
```

### 성능 최적화 팁

#### 1. 메모리 사용량 최적화
- 캐시 크기 적절히 조정
- 오래된 이벤트 정기적 정리
- 불필요한 모니터링 비활성화

#### 2. CPU 사용률 최적화
- 이벤트 배치 크기 증가
- 폴링 간격 조정
- 무거운 분석 작업 스케줄링

#### 3. 디스크 I/O 최적화
- 로그 로테이션 설정
- 데이터베이스 정기 정리
- 임시 파일 자동 삭제

## FAQ

### Q: DevFlow Monitor는 어떤 프로젝트 유형을 지원하나요?
A: 모든 유형의 프로젝트를 지원합니다. 특히 TypeScript, JavaScript, Python, Java, Go 등의 언어로 작성된 프로젝트에 최적화되어 있습니다.

### Q: 개인정보나 민감한 코드 정보가 외부로 전송되나요?
A: 아니요. 모든 데이터는 로컬에서만 처리되며 외부로 전송되지 않습니다. Claude Desktop과는 MCP 프로토콜을 통해서만 통신합니다.

### Q: 여러 프로젝트를 동시에 모니터링할 수 있나요?
A: 현재 버전에서는 한 번에 하나의 프로젝트만 모니터링 가능합니다. 향후 버전에서 멀티 프로젝트 지원을 계획하고 있습니다.

### Q: 대용량 프로젝트에서도 성능이 괜찮나요?
A: 네, 성능 최적화 기능이 내장되어 있어 대용량 프로젝트도 효율적으로 처리할 수 있습니다. 필요시 모니터링 범위를 조정할 수 있습니다.

---

**참고**: 이 매뉴얼은 DevFlow Monitor MCP v0.1.0 기준으로 작성되었습니다. 최신 정보는 [GitHub 저장소](https://github.com/yaioyaio/kroot-mcp)를 확인하세요.

**최종 수정일**: 2025-08-04