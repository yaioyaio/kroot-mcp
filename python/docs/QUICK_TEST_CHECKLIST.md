# ⚡ 빠른 테스트 체크리스트

## 🎯 **우선순위 1: 즉시 테스트 필요**

### 🔧 **1. Claude Desktop MCP 연동 확인** (5분)

**준비:**
```bash
# 1. 설정 백업
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json.backup

# 2. DevFlow Monitor 설정 적용
cp /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/claude-desktop-config.json ~/Library/Application\ Support/Claude/claude_desktop_config.json

# 3. Claude Desktop 재시작 (완전 종료 후 재실행)
```

**테스트:**
Claude Desktop에서 새 대화 시작 후:
```
프로젝트 상태를 확인해줘
```

**✅ 성공 기준:**
- MCP 서버 연결 성공
- JSON 형태 응답 (마일스톤 2 완료 상태 포함)

---

### 🚀 **2. 실시간 통신 기능 테스트** (3분)

**Claude Desktop에서 순서대로 실행:**
```
1. WebSocket 서버를 시작해줘
2. WebSocket 서버 통계를 보여줘
3. "마일스톤 2 완료 테스트" 메시지로 시스템 알림을 브로드캐스트해줘
4. WebSocket 서버를 중지해줘
```

**✅ 성공 기준:**
- 4개 명령 모두 정상 실행
- 서버 시작/중지 성공 메시지
- 통계 정보 표시

---

### 📊 **3. 통합 도구 검증** (5분)

**Claude Desktop에서 실행:**
```
1. 개발 메트릭을 보여줘
2. 최근 활동 로그 5개를 조회해줘
3. 개발 방법론 준수도를 확인해줘
4. 현재 프로젝트의 병목 현상을 분석해줘
5. 일일 리포트를 생성해줘
```

**✅ 성공 기준:**
- 11개 MCP 도구 중 5개 핵심 도구 정상 작동
- 실제 프로젝트 데이터 표시

---

## 🎯 **우선순위 2: 선택적 테스트**

### 🔄 **4. 실시간 이벤트 감지** (3분)

**테스트 방법:**
```bash
# 터미널에서 파일 변경
echo "// 실시간 테스트" > realtime-test.js
```

**Claude Desktop에서:**
```
최근 활동 로그 3개를 조회해줘
```

**✅ 성공 기준:**
- 파일 변경 이벤트가 활동 로그에 표시

---

### 🔧 **5. 에러 처리 검증** (2분)

**Claude Desktop에서:**
```
1. WebSocket 서버를 99999 포트로 시작해줘
2. 존재하지 않는 도구를 실행해줘
```

**✅ 성공 기준:**
- 적절한 에러 메시지 표시
- 시스템 크래시 없음

---

## 📋 **전체 체크리스트**

### ✅ **필수 통과 항목**
- [ ] MCP 서버 Claude Desktop 연결 성공
- [ ] WebSocket 서버 시작/중지 성공
- [ ] 시스템 알림 브로드캐스트 성공
- [ ] 5개 핵심 MCP 도구 정상 작동
- [ ] 실제 프로젝트 데이터 표시

### ⚠️ **선택적 확인 항목**
- [ ] 실시간 파일 변경 감지
- [ ] 에러 상황 적절한 처리
- [ ] Git 활동 실시간 추적

---

## 🚨 **문제 해결**

### ❌ **MCP 서버 연결 실패 시:**
```bash
# 서버 수동 테스트
python /Users/yaio/dev/workspace/cincotime_projects/kroot-mcpdevflow_monitor

# 권한 확인
chmod +x /Users/yaio/dev/workspace/cincotime_projects/kroot-mcpdevflow_monitor

# 설정 확인
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### ❌ **WebSocket 도구 실행 실패 시:**
```bash
# 의존성 확인
cd /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp
poetry show websockets
```

### 🔄 **설정 되돌리기:**
```bash
cp ~/Library/Application\ Support/Claude/claude_desktop_config.json.backup ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

---

## 🎯 **예상 소요 시간: 총 15-20분**

**모든 필수 항목 통과 시 → 마일스톤 2 검증 완료** 🏆