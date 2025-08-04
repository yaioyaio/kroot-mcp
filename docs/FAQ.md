# DevFlow Monitor MCP - 자주 묻는 질문 (FAQ)

## 목차
1. [일반 질문](#일반-질문)
2. [설치 및 설정](#설치-및-설정)
3. [사용법](#사용법)
4. [성능 및 최적화](#성능-및-최적화)
5. [보안 및 개인정보](#보안-및-개인정보)
6. [문제 해결](#문제-해결)
7. [개발 및 기여](#개발-및-기여)

## 일반 질문

### Q: DevFlow Monitor MCP가 무엇인가요?
A: DevFlow Monitor MCP는 개발 워크플로우를 지능적으로 모니터링하고 분석하는 Model Context Protocol (MCP) 서버입니다. Claude Desktop과 통합되어 실시간으로 개발 활동을 추적하고 생산성 향상을 위한 인사이트를 제공합니다.

### Q: MCP(Model Context Protocol)란 무엇인가요?
A: MCP는 AI 어시스턴트가 외부 도구와 데이터 소스에 안전하고 제어 가능한 방식으로 접근할 수 있게 해주는 프로토콜입니다. Claude Desktop이 DevFlow Monitor의 기능을 사용할 수 있게 해주는 다리 역할을 합니다.

### Q: 어떤 개발 언어와 프레임워크를 지원하나요?
A: DevFlow Monitor는 언어에 구애받지 않는 도구입니다. 다음과 같은 환경에서 특히 유용합니다:
- **언어**: TypeScript, JavaScript, Python, Java, Go, Rust, C#, PHP 등
- **프레임워크**: React, Vue, Angular, Express, Django, Spring Boot, .NET 등
- **개발 환경**: VS Code, WebStorm, IntelliJ, Vim, Emacs 등

### Q: 무료로 사용할 수 있나요?
A: 네, DevFlow Monitor MCP는 MIT 라이센스 하에 완전 무료로 제공됩니다. 상업적 용도로도 자유롭게 사용할 수 있습니다.

### Q: 오픈소스인가요?
A: 네, GitHub에서 소스 코드를 공개하고 있으며, 누구나 기여할 수 있습니다.

## 설치 및 설정

### Q: 설치 요구사항은 무엇인가요?
A: 최소 요구사항은 다음과 같습니다:
- **Node.js**: v20.0.0 이상 (LTS 권장)
- **npm**: v10.0.0 이상
- **Claude Desktop**: 최신 버전
- **운영체제**: Windows 10+, macOS 12+, Ubuntu 20.04+
- **RAM**: 최소 4GB, 권장 8GB
- **디스크**: 1GB 여유 공간

### Q: Docker를 사용할 수 있나요?
A: 네, Docker를 통한 설치와 실행을 지원합니다. `docker-compose.yml` 파일을 제공하여 쉽게 컨테이너 환경에서 실행할 수 있습니다.

```bash
# Docker Compose로 실행
docker-compose up -d
```

### Q: Claude Desktop 설정이 어려워요.
A: 자동 설치 스크립트를 사용하면 Claude Desktop 설정이 자동으로 완료됩니다:

```bash
./scripts/deploy/install-local.sh
```

수동 설정이 필요한 경우 [설치 가이드](./INSTALLATION.md#claude-desktop-연동-설정)를 참조하세요.

### Q: 여러 프로젝트에서 사용할 수 있나요?
A: 현재 버전에서는 한 번에 하나의 프로젝트만 모니터링 가능합니다. 다음과 같은 방법으로 여러 프로젝트를 관리할 수 있습니다:
- 프로젝트별로 별도 설치
- 설정 파일을 프로젝트별로 관리
- 환경 변수를 통한 동적 설정

### Q: 기존 프로젝트에 추가 설치할 때 주의사항이 있나요?
A: 다음 사항들을 확인해주세요:
- `.gitignore`에 로그 및 데이터 파일 추가
- 기존 빌드 스크립트와의 충돌 확인
- 포트 번호 중복 방지 (기본값: 3000)
- 파일 모니터링 제외 패턴 설정

## 사용법

### Q: Claude Desktop에서 어떤 명령을 사용할 수 있나요?
A: 다음과 같은 자연어 명령을 사용할 수 있습니다:

**프로젝트 상태**:
```
프로젝트 상태를 확인해주세요.
현재 시스템 리소스 사용률은 어떤가요?
```

**개발 활동 조회**:
```
최근 2시간 동안의 개발 활동을 보여주세요.
오늘의 Git 커밋 내역을 보여주세요.
```

**메트릭 분석**:
```
이번 주 생산성 메트릭을 분석해주세요.
AI 도구 사용 패턴을 보여주세요.
```

### Q: 대시보드는 어떻게 사용하나요?
A: 두 가지 대시보드를 제공합니다:

**CLI 대시보드** (간단한 테이블 형태):
```bash
npm run dashboard
```

**TUI 대시보드** (풀스크린 터미널 UI):
```bash
npm run dashboard:tui
```

TUI 대시보드에서는 다음 키를 사용할 수 있습니다:
- **r**: 새로고침
- **c**: 화면 지우기
- **h**: 도움말
- **q/ESC**: 종료

### Q: 실시간 모니터링은 어떻게 작동하나요?
A: DevFlow Monitor는 다음을 실시간으로 추적합니다:
- 파일 시스템 변경 (chokidar 기반)
- Git 활동 (simple-git 기반)
- AI 도구 사용 (프로세스 및 패턴 분석)
- 시스템 리소스 사용률
- 개발 단계 전환

### Q: 특정 파일이나 디렉토리를 모니터링에서 제외하려면 어떻게 하나요?
A: 설정 파일에서 ignore 패턴을 수정할 수 있습니다:

```json
// config/default.json
{
  "monitoring": {
    "fileSystem": {
      "ignorePatterns": [
        "**/node_modules/**",
        "**/dist/**",
        "**/.git/**",
        "**/coverage/**",
        "**/*.log",
        "**/your-custom-path/**"
      ]
    }
  }
}
```

### Q: AI 도구 사용 추적은 어떻게 작동하나요?
A: 다음과 같은 방식으로 AI 도구 사용을 감지합니다:
- **Claude API**: HTTP 요청 패턴 분석
- **GitHub Copilot**: 프로세스 모니터링 및 코드 변경 패턴 분석
- **ChatGPT**: 커밋 메시지 및 코드 패턴 분석
- **Cursor**: 프로세스 및 파일 변경 패턴 분석

## 성능 및 최적화

### Q: 시스템 리소스를 많이 사용하나요?
A: DevFlow Monitor는 성능을 위해 최적화되어 있습니다:
- **CPU**: 일반적으로 1-3% 사용률
- **메모리**: 50-200MB (프로젝트 크기에 따라)
- **디스크**: 로그 및 데이터베이스 파일만 사용

### Q: 대용량 프로젝트에서 성능 문제가 있나요?
A: 대용량 프로젝트를 위한 최적화 기능을 제공합니다:
- **선택적 모니터링**: 중요한 디렉토리만 모니터링
- **이벤트 배치 처리**: 100개 단위로 일괄 처리
- **메모리 제한**: 최대 100MB 제한
- **자동 정리**: 오래된 데이터 자동 삭제

### Q: 성능을 더 최적화하려면 어떻게 해야 하나요?
A: 다음 설정을 조정할 수 있습니다:

```json
// config/performance.json
{
  "events": {
    "batchSize": 200,        // 배치 크기 증가
    "flushInterval": 10000   // 플러시 간격 증가
  },
  "performance": {
    "cache": {
      "maxSize": 50000,      // 캐시 크기 조정
      "ttl": 900            // 캐시 TTL 증가
    }
  }
}
```

### Q: 메모리 사용량을 줄이려면?
A: 다음 방법을 시도해보세요:
1. 캐시 크기 감소
2. 이벤트 보관 기간 단축
3. 불필요한 모니터링 비활성화
4. 정기적인 데이터 정리

```bash
# 캐시 정리
npm run cache:clear

# 오래된 데이터 정리
npm run cleanup
```

## 보안 및 개인정보

### Q: 개인정보나 코드가 외부로 전송되나요?
A: 아니요. DevFlow Monitor는 다음 원칙을 준수합니다:
- **로컬 처리**: 모든 데이터는 로컬에서만 처리
- **외부 전송 없음**: 코드나 개인정보를 외부로 전송하지 않음
- **MCP 프로토콜**: Claude Desktop과는 MCP를 통해서만 통신
- **데이터 암호화**: 민감한 데이터는 AES-256-GCM으로 암호화

### Q: 어떤 데이터가 수집되나요?
A: 다음과 같은 메타데이터만 수집합니다:
- 파일 변경 이벤트 (경로, 시간, 유형)
- Git 활동 (커밋 해시, 브랜치명, 시간)
- 시스템 메트릭 (CPU, 메모리, 디스크 사용률)
- AI 도구 사용 패턴 (사용 시간, 빈도)

**수집하지 않는 것**:
- 실제 코드 내용
- 개인 식별 정보
- 프로젝트 기밀 정보
- 외부 API 키나 비밀번호

### Q: 프로덕션 환경에서 보안 설정은 어떻게 하나요?
A: 프로덕션 환경에서는 다음 보안 설정을 권장합니다:

```bash
# 환경 변수 설정
JWT_SECRET=your-strong-jwt-secret-32-characters
API_KEY_SALT=your-api-key-salt-16-chars
NODE_ENV=production
```

```json
// config/environments/production.json
{
  "security": {
    "auth": {
      "enabled": true,
      "jwt": {
        "secret": "${JWT_SECRET}",
        "expiresIn": "24h"
      }
    }
  }
}
```

### Q: 감사 로그는 어떻게 확인하나요?
A: 보안 감사 로그를 확인할 수 있습니다:

```
보안 감사 로그를 확인해주세요.
```

또는 직접 로그 파일 확인:
```bash
tail -f logs/security.log
```

## 문제 해결

### Q: Claude Desktop에서 도구가 표시되지 않아요.
A: 다음 순서로 확인해보세요:

1. **설정 파일 경로 확인**:
   ```bash
   # macOS
   ls -la ~/Library/Application\ Support/Claude/claude_desktop_config.json
   
   # Windows
   dir %APPDATA%\Claude\claude_desktop_config.json
   ```

2. **프로젝트 빌드 확인**:
   ```bash
   npm run build
   ls -la dist/server/index.js
   ```

3. **Claude Desktop 재시작**

4. **설정 파일 문법 확인**:
   ```bash
   node -e "console.log(JSON.parse(require('fs').readFileSync('claude-desktop-config.json', 'utf8')))"
   ```

### Q: 파일 변경이 감지되지 않아요.
A: 다음을 확인해보세요:

1. **파일 권한 확인**:
   ```bash
   ls -la your-file.js
   chmod 644 your-file.js  # 필요시
   ```

2. **ignore 패턴 확인**:
   ```bash
   npm run diagnose
   ```

3. **디버그 모드로 실행**:
   ```bash
   DEBUG=file:* npm start
   ```

### Q: 메모리 사용량이 계속 증가해요.
A: 메모리 누수 방지 방법:

1. **정기적인 캐시 정리**:
   ```bash
   npm run cache:clear
   ```

2. **오래된 데이터 정리**:
   ```bash
   npm run cleanup
   ```

3. **메모리 제한 설정**:
   ```bash
   node --max-old-space-size=2048 dist/server/index.js
   ```

### Q: Git 활동이 감지되지 않아요.
A: Git 통합 문제 해결:

1. **Git 저장소 확인**:
   ```bash
   git status
   git log --oneline -5
   ```

2. **Git 권한 확인**:
   ```bash
   ls -la .git/
   ```

3. **Git 디버그 모드**:
   ```bash
   DEBUG=git:* npm start
   ```

### Q: 성능이 느려요.
A: 성능 최적화 방법:

1. **성능 진단 실행**:
   ```bash
   npm run performance:analyze
   ```

2. **모니터링 범위 축소**:
   ```json
   {
     "monitoring": {
       "fileSystem": {
         "ignorePatterns": ["**/large-directory/**"]
       }
     }
   }
   ```

3. **이벤트 배치 크기 조정**:
   ```json
   {
     "events": {
       "batchSize": 200,
       "flushInterval": 10000
     }
   }
   ```

### Q: 대시보드가 깨져 보여요.
A: 터미널 호환성 문제 해결:

1. **터미널 크기 확인** (최소 80x24)
2. **색상 지원 확인**:
   ```bash
   echo $TERM
   echo $COLORTERM
   ```
3. **CLI 대시보드 사용**:
   ```bash
   npm run dashboard  # TUI 대신 CLI 사용
   ```

## 개발 및 기여

### Q: 개발에 기여하고 싶어요.
A: 기여를 환영합니다! 다음 단계를 따라주세요:

1. **저장소 포크** 및 클론
2. **개발 환경 설정**:
   ```bash
   npm install
   npm run dev
   ```
3. **테스트 실행**:
   ```bash
   npm test
   npm run test:coverage
   ```
4. **Pull Request 생성**

자세한 내용은 [기여 가이드라인](./CONTRIBUTING.md)을 참조하세요.

### Q: 버그를 발견했어요.
A: GitHub Issues에 버그 리포트를 작성해주세요. 다음 정보를 포함해주세요:
- 운영체제 및 버전
- Node.js 버전
- 재현 단계
- 오류 메시지 전문
- 관련 로그 파일

### Q: 새로운 기능을 제안하고 싶어요.
A: GitHub Discussions에서 기능 제안을 해주세요. 다음 내용을 포함해주세요:
- 기능 설명
- 사용 사례
- 예상 구현 방법
- 우선순위

### Q: 플러그인을 개발할 수 있나요?
A: 네, 플러그인 시스템을 지원합니다. [플러그인 개발 가이드](./PLUGIN_DEVELOPMENT.md)를 참조하세요.

### Q: API 문서는 어디에 있나요?
A: 다음 문서들을 참조하세요:
- [API 문서](./API.md): 전체 API 참조
- [TypeDoc 생성 문서](./docs/api/): 자동 생성된 API 문서
- [통합 가이드](./INTEGRATION.md): 외부 시스템 통합 방법

### Q: 테스트는 어떻게 작성하나요?
A: Vitest를 사용합니다:

```bash
# 단위 테스트 실행
npm test

# 특정 테스트 실행
npm test -- FileMonitor

# 커버리지 확인
npm run test:coverage

# 통합 테스트
npm run integration:test
```

---

**도움이 더 필요하신가요?**

이 FAQ에서 답을 찾지 못했다면:
1. [GitHub Issues](https://github.com/yaioyaio/kroot-mcp/issues)에서 검색해보세요
2. [GitHub Discussions](https://github.com/yaioyaio/kroot-mcp/discussions)에서 질문하세요
3. [사용자 매뉴얼](./USER_MANUAL.md)을 참조하세요
4. [설치 가이드](./INSTALLATION.md)를 다시 확인하세요

**최종 수정일**: 2025-08-04