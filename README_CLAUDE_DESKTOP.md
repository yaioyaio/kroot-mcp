# Claude Desktop 연동 가이드

## 🚀 DevFlow Monitor MCP 서버를 Claude Desktop에 연동하는 방법

### 1. 백업 생성

```bash
# 현재 Claude Desktop 설정 백업
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json.backup
```

### 2. 설정 업데이트

현재 Claude Desktop에 다음 서버들이 설정되어 있습니다:
- `desktop-commander`: 데스크톱 제어 MCP 서버
- `playwright`: 브라우저 자동화 MCP 서버

**옵션 1: 기존 설정 유지하면서 추가**
```bash
# 통합 설정 파일을 Claude Desktop에 복사
cp /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/claude-desktop-integration.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**옵션 2: DevFlow Monitor만 사용**
```bash
# DevFlow Monitor만 설정
cp /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/claude-desktop-config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### 3. Claude Desktop 재시작

1. Claude Desktop 완전 종료
2. Claude Desktop 재실행
3. 새 대화 시작

### 4. 연동 테스트

Claude Desktop에서 다음 명령어들을 시도해보세요:

```
프로젝트 상태를 확인해줘
```

```
개발 메트릭을 보여줘
```

```
최근 활동 로그 5개를 조회해줘
```

```
현재 프로젝트의 병목 현상을 분석해줘
```

### 5. 예상 응답

성공적으로 연동되면 다음과 같은 응답을 받을 수 있습니다:

- **프로젝트 상태**: DevFlow Monitor MCP v0.1.0 정보, 마일스톤 진행률
- **개발 메트릭**: 커밋, 파일 변경, 테스트 결과 등의 통계
- **활동 로그**: 최근 개발 활동 목록
- **병목 분석**: 현재 개발 단계와 개선 제안

### 6. 문제 해결

**MCP 서버가 인식되지 않는 경우:**
```bash
# 서버 수동 테스트
node /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/dist/server/index.js

# 설정 파일 확인
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**권한 문제 해결:**
```bash
# 실행 권한 확인
chmod +x /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/dist/server/index.js
```

### 7. 설정 되돌리기

```bash
# 원래 설정으로 복원
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json.backup ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### 8. 로그 확인

Claude Desktop의 MCP 서버 로그는 다음 위치에서 확인할 수 있습니다:
- `~/Library/Application Support/Claude/logs/`

### 🎯 성공 기준

✅ Claude Desktop에서 MCP 서버 4개 도구 인식  
✅ 각 도구 호출 시 정상적인 JSON 응답  
✅ 에러 없이 실시간 개발 상태 조회 가능  

DevFlow Monitor MCP 서버가 성공적으로 연동되면 Claude Desktop을 통해 실시간으로 개발 프로세스를 모니터링할 수 있습니다!