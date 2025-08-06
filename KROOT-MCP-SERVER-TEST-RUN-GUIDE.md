# KROOT MCP 서버 테스트 및 실행 가이드

## 📋 개요

이 문서는 KROOT MCP (Model Context Protocol) 서버의 테스트 및 실행 방법을 안내합니다. 407개의 TypeScript 컴파일 오류를 수정한 후, 실제 서버가 정상 작동하는지 확인하는 방법들을 제공합니다.

## 🚀 기본 실행 방법

### 1. 서버 시작

#### 표준 실행
```bash
npm start
```

#### 직접 실행
```bash
node dist/server/index.js
```

#### 백그라운드 실행 (추천)
```bash
npm start > server.log 2>&1 &
```

### 2. 서버 상태 확인

#### 프로세스 확인
```bash
ps aux | grep "node dist/server/index.js"
```

#### 로그 실시간 보기
```bash
tail -f server.log
```

#### 서버 종료
```bash
# 포그라운드 실행 시: Ctrl+C
# 백그라운드 실행 시:
pkill -f "node dist/server/index.js"
```

## 🔍 MCP 서버 테스트 방법

### 1. MCP 클라이언트 연결 테스트

Claude Desktop 설정 예시:
```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "node",
      "args": ["dist/server/index.js"],
      "cwd": "/path/to/your/kroot-mcp-project"
    }
  }
}
```

### 2. 내장 테스트 스크립트 실행

```bash
# MCP 서버 테스트
npm run mcp:test

# 파일 모니터링 테스트
npm run monitor:test

# 성능 테스트
npm run performance:test

# 통합 테스트
npm run integration:test
```

### 3. HTTP API 테스트 (해당하는 경우)

```bash
# 헬스 체크
curl http://localhost:3000/health

# 서버 상태 확인
curl http://localhost:3000/api/status
```

## 📊 모니터링 및 로그 확인

### 1. 로그 파일 위치 및 확인

#### Audit 로그
```bash
# 로그 디렉토리 확인
ls -la logs/audit/

# SQLite 감사 로그 확인 (sqlite3 필요)
sqlite3 logs/audit/audit.db ".tables"
sqlite3 logs/audit/audit.db "SELECT * FROM audit_logs LIMIT 5;"
```

#### 서버 실행 로그
```bash
# 전체 로그 보기
cat server.log

# 에러만 필터링
grep ERROR server.log

# 실시간 로그 모니터링
tail -f server.log
```

### 2. 데이터베이스 상태 확인

```bash
# 저장소 데이터베이스 확인
ls -la data/storage/
ls -la data/security/

# SQLite 데이터베이스 내용 확인
sqlite3 data/storage/main.db ".tables"
```

### 3. 시스템 리소스 모니터링

```bash
# CPU/메모리 사용량 확인
top -p $(pgrep -f "node dist/server/index.js")

# 네트워크 포트 사용 확인
lsof -i -P -n | grep node

# 파일 디스크립터 확인
lsof -p $(pgrep -f "node dist/server/index.js")
```

## 🛠️ 개발자 도구 및 디버깅

### 1. 디버그 모드 실행

```bash
# 전체 디버그 로그 활성화
NODE_ENV=development DEBUG=* node dist/server/index.js

# 특정 모듈만 디버그
DEBUG=ProjectManager,GitMonitor node dist/server/index.js
```

### 2. 성능 프로파일링

```bash
# Chrome DevTools와 연동
node --inspect dist/server/index.js

# 그 후 Chrome에서 chrome://inspect 접속
```

### 3. 메모리 사용량 분석

```bash
# 힙 덤프 생성
node --inspect --heap-prof dist/server/index.js

# V8 프로파일링
node --prof dist/server/index.js
```

## 🧪 기능별 테스트 방법

### 1. 파일 모니터링 테스트

```bash
# 프로젝트 루트에서 파일 변경 테스트
touch test-file.js
echo "console.log('test')" > test-file.js
echo "// 수정됨" >> test-file.js
rm test-file.js
```

### 2. Git 모니터링 테스트

```bash
# Git 커밋 생성 (테스트용)
git add .
git commit -m "테스트 커밋"

# 브랜치 변경 테스트
git checkout -b test-branch
git checkout main
```

### 3. 성능 메트릭 확인

서버 실행 후 로그에서 다음 정보 확인:
- `📊 MetricsCollector started`
- `🔍 BottleneckDetector started`
- `📈 MetricsAnalyzer started`

## 🔧 문제 해결 가이드

### 서버 시작 실패 시

#### 1. 의존성 문제
```bash
# 의존성 재설치
rm -rf node_modules package-lock.json
npm install

# 누락된 패키지 확인
npm audit
```

#### 2. 디렉토리 권한 문제
```bash
# 필수 디렉토리 생성
mkdir -p data/security data/storage logs/audit

# 권한 설정
chmod -R 755 dist/
chmod -R 755 data/
chmod -R 755 logs/
```

#### 3. 포트 충돌 문제
```bash
# 사용 중인 포트 확인
netstat -tulpn | grep :3000
lsof -i :3000

# 프로세스 종료
kill -9 $(lsof -t -i:3000)
```

### Git 모니터 오류 해결

```bash
# Git 상태 확인
git status
git log --oneline -5

# Git 권한 확인
ls -la .git/
```

### 메모리 누수 체크

```bash
# 메모리 사용량 모니터링
watch -n 5 'ps -p $(pgrep -f "node dist/server/index.js") -o pid,ppid,cmd,%mem,%cpu'
```

## 📱 실시간 모니터링

### TUI 대시보드 (있는 경우)

```bash
# Blessed 기반 터미널 대시보드
npm run dashboard
```

### 로그 대시보드

```bash
# 여러 로그를 동시에 모니터링
multitail server.log logs/audit/audit.log

# 또는 tmux 세션 사용
tmux new-session -d -s mcp-monitor
tmux split-window -h
tmux send-keys -t 0 'tail -f server.log' C-m
tmux send-keys -t 1 'watch -n 2 "ps aux | grep node"' C-m
tmux attach-session -t mcp-monitor
```

## 🎯 권장 확인 순서

### 1차 확인 (기본 동작)
1. `npm start` 실행
2. `tail -f server.log` 로그 모니터링
3. 다음 메시지들이 나타나는지 확인:
   - `[INFO] Registered 87 MCP tools`
   - `[INFO] DevFlow Monitor MCP server started`
   - `📊 MetricsCollector started`

### 2차 확인 (기능 테스트)
1. `ps aux | grep node` 프로세스 확인
2. `npm run mcp:test` 테스트 스크립트 실행
3. 파일 변경 테스트로 모니터링 기능 확인

### 3차 확인 (안정성 테스트)
1. 10분간 서버 실행 유지
2. 메모리 사용량 모니터링
3. 에러 로그 발생 여부 확인

## 📈 성능 벤치마크

### 정상 동작 기준값

- **시작 시간**: 5초 이내
- **메모리 사용량**: 초기 100MB 이하
- **CPU 사용률**: 유휴 시 5% 이하
- **응답 시간**: MCP 요청당 100ms 이하

### 성능 측정 명령어

```bash
# 시작 시간 측정
time npm start

# 메모리 사용량
ps -o pid,ppid,cmd,%mem,%cpu -p $(pgrep -f "node dist/server/index.js")

# 네트워크 연결 수
netstat -an | grep :3000 | wc -l
```

## 🚨 알려진 이슈 및 해결방안

### GitMonitor `spawn EBADF` 오류
- **증상**: `Error: spawn EBADF` 반복 발생
- **원인**: Git 명령어 동시 실행으로 인한 일시적 오류
- **해결**: 서버 기능에는 영향 없음, 무시 가능
- **개선**: Git 명령어 큐잉 로직 구현 권장

### TypeScript 컴파일 경고 148개
- **증상**: `npm run typecheck` 시 경고 발생
- **원인**: 엄격한 타입 체크 설정
- **해결**: 런타임 실행에는 영향 없음
- **개선**: 점진적 타입 안전성 개선 권장

## 📞 지원 및 문의

서버 실행 중 문제가 발생하면:

1. **로그 수집**: `server.log` 파일 전체 내용
2. **환경 정보**: Node.js 버전, OS 정보
3. **에러 메시지**: 정확한 에러 스택 트레이스
4. **재현 방법**: 문제 발생까지의 단계별 과정

---

**마지막 업데이트**: 2025-08-06  
**테스트 환경**: Node.js v20.19.1, macOS Darwin 24.5.0  
**서버 버전**: KROOT MCP Server v1.0.0