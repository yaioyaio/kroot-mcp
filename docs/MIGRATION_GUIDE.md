# DevFlow Monitor MCP 마이그레이션 가이드

이 문서는 이전 버전에서 DevFlow Monitor MCP v1.0.0으로 마이그레이션하는 방법을 설명합니다.

## 목차

1. [버전별 마이그레이션](#버전별-마이그레이션)
2. [데이터 마이그레이션](#데이터-마이그레이션)
3. [설정 마이그레이션](#설정-마이그레이션)
4. [API 변경사항](#api-변경사항)
5. [플러그인 마이그레이션](#플러그인-마이그레이션)
6. [문제 해결](#문제-해결)

## 버전별 마이그레이션

### 0.x.x → 1.0.0

v1.0.0은 첫 공식 릴리즈이므로, 이전 프리릴리즈 버전에서 마이그레이션하는 경우 다음 사항을 확인하세요.

#### 주요 변경사항

1. **데이터베이스 스키마 변경**
   - 새로운 테이블 추가: `plugins`, `projects`, `feedback`, `ab_tests`
   - 기존 테이블 변경: `events` 테이블에 새로운 인덱스 추가

2. **설정 파일 구조 변경**
   - 환경별 설정 파일 분리
   - 새로운 설정 옵션 추가

3. **API 엔드포인트 변경**
   - RESTful API 구조로 표준화
   - 인증 필수화

4. **MCP 도구 확장**
   - 87개의 새로운 도구 추가
   - 일부 기존 도구의 파라미터 변경

## 데이터 마이그레이션

### 1. 백업 생성

마이그레이션 전 반드시 데이터를 백업하세요:

```bash
# SQLite 데이터베이스 백업
sqlite3 /path/to/devflow.db ".backup /backup/devflow-pre-migration.db"

# 전체 데이터 디렉토리 백업
tar -czf /backup/devflow-data-backup.tar.gz /path/to/data
```

### 2. 데이터베이스 마이그레이션

#### 자동 마이그레이션

```bash
# 마이그레이션 스크립트 실행
npm run migrate:up

# 마이그레이션 상태 확인
npm run migrate:status
```

#### 수동 마이그레이션

```sql
-- 1. 새 테이블 생성
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  type TEXT,
  description TEXT,
  tags TEXT,
  settings TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  submitter TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ab_tests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  variants TEXT NOT NULL,
  metrics TEXT NOT NULL,
  results TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 2. 기존 테이블에 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_category_type ON events(category, type);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);

-- 3. 기존 데이터 변환 (필요한 경우)
-- 예: 이벤트 카테고리 업데이트
UPDATE events 
SET category = 'development' 
WHERE category = 'dev';
```

### 3. 데이터 검증

```bash
# 데이터 무결성 확인
sqlite3 /path/to/devflow.db "PRAGMA integrity_check;"

# 테이블 구조 확인
sqlite3 /path/to/devflow.db ".schema"

# 레코드 수 확인
sqlite3 /path/to/devflow.db "
  SELECT 'events', COUNT(*) FROM events
  UNION ALL
  SELECT 'projects', COUNT(*) FROM projects
  UNION ALL
  SELECT 'plugins', COUNT(*) FROM plugins;
"
```

## 설정 마이그레이션

### 1. 기존 설정 백업

```bash
cp config.json config.json.backup
cp .env .env.backup
```

### 2. 새 설정 형식으로 변환

#### 이전 형식 (config.json)

```json
{
  "port": 3000,
  "database": "./data/devflow.db",
  "logLevel": "info",
  "monitoring": {
    "fileSystem": true,
    "git": true
  }
}
```

#### 새 형식 (config/production.json)

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0"
  },
  "database": {
    "path": "./data/devflow.db",
    "backup": {
      "enabled": true,
      "interval": "daily"
    }
  },
  "logging": {
    "level": "info",
    "file": "./logs/production.log"
  },
  "monitoring": {
    "enableFileMonitoring": true,
    "enableGitMonitoring": true
  },
  "security": {
    "enableAuthentication": true,
    "jwtSecret": "${JWT_SECRET}"
  }
}
```

### 3. 환경 변수 업데이트

```bash
# .env 파일 업데이트
cat > .env << EOF
NODE_ENV=production
PORT=3000
DATABASE_PATH=./data/devflow.db
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
LOG_LEVEL=info
EOF
```

## API 변경사항

### 1. 인증 추가

v1.0.0부터 모든 API 요청에 인증이 필요합니다:

```javascript
// 이전
const response = await fetch('http://localhost:3000/api/events');

// 새 버전
const response = await fetch('http://localhost:3000/api/events', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

### 2. 엔드포인트 변경

| 이전 엔드포인트 | 새 엔드포인트 | 설명 |
|--------------|------------|-----|
| `/events` | `/api/events` | 모든 API 엔드포인트가 `/api` 접두사 추가 |
| `/status` | `/api/system/status` | 시스템 상태 확인 |
| `/metrics` | `/api/metrics` | 메트릭 조회 |
| `/mcp/invoke` | `/mcp/tools/invoke` | MCP 도구 실행 |

### 3. 응답 형식 표준화

```javascript
// 새로운 표준 응답 형식
{
  "success": true,
  "data": { /* 실제 데이터 */ },
  "metadata": {
    "timestamp": "2025-08-05T10:00:00Z",
    "version": "1.0.0"
  },
  "error": null // 오류 시 오류 정보
}
```

## 플러그인 마이그레이션

### 1. 플러그인 매니페스트 업데이트

#### 이전 형식

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "main": "index.js"
}
```

#### 새 형식

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "index.js",
  "devflowPlugin": {
    "displayName": "My Plugin",
    "description": "Plugin description",
    "author": "Your Name",
    "permissions": ["events:read", "projects:write"],
    "minVersion": "1.0.0",
    "maxVersion": "2.0.0"
  }
}
```

### 2. API 사용 업데이트

```javascript
// 이전 버전
module.exports = function(context) {
  context.on('event', (event) => {
    console.log(event);
  });
};

// 새 버전
module.exports = {
  async activate(context) {
    // 새로운 권한 기반 API
    const events = await context.api.events.list({ limit: 10 });
    
    // 이벤트 구독
    context.subscriptions.push(
      context.api.events.on('created', async (event) => {
        context.logger.info('New event:', event);
      })
    );
  },
  
  async deactivate() {
    // 정리 로직
  }
};
```

### 3. 권한 요청

플러그인이 필요한 권한을 명시적으로 요청해야 합니다:

```json
{
  "permissions": [
    "events:read",      // 이벤트 읽기
    "events:write",     // 이벤트 쓰기
    "projects:read",    // 프로젝트 읽기
    "projects:write",   // 프로젝트 쓰기
    "system:read",      // 시스템 정보 읽기
    "notifications:send" // 알림 전송
  ]
}
```

## 문제 해결

### 일반적인 마이그레이션 문제

#### 1. 데이터베이스 호환성 오류

```bash
# 오류: "no such column: priority"
# 해결: 수동으로 컬럼 추가
sqlite3 /path/to/devflow.db "ALTER TABLE events ADD COLUMN priority TEXT DEFAULT 'medium';"
```

#### 2. 설정 파일 오류

```bash
# 오류: "Cannot find config file"
# 해결: 환경별 설정 파일 생성
mkdir -p config
cp config.json config/production.json
```

#### 3. 플러그인 호환성 문제

```bash
# 오류: "Plugin API version mismatch"
# 해결: 플러그인 업데이트
npm update my-plugin
# 또는 플러그인 재설치
npm uninstall my-plugin
npm install my-plugin@latest
```

### 롤백 절차

마이그레이션 중 문제가 발생한 경우:

```bash
# 1. 서비스 중지
pm2 stop devflow-monitor

# 2. 데이터베이스 복원
cp /backup/devflow-pre-migration.db /path/to/devflow.db

# 3. 설정 파일 복원
cp config.json.backup config.json
cp .env.backup .env

# 4. 이전 버전으로 되돌리기
git checkout v0.9.0
npm install

# 5. 서비스 재시작
pm2 start devflow-monitor
```

## 마이그레이션 체크리스트

마이그레이션 전:
- [ ] 전체 백업 생성
- [ ] 현재 버전 확인
- [ ] 종속성 업데이트 확인
- [ ] 테스트 환경에서 먼저 실행

마이그레이션 중:
- [ ] 서비스 중지
- [ ] 데이터베이스 마이그레이션 실행
- [ ] 설정 파일 업데이트
- [ ] 플러그인 업데이트

마이그레이션 후:
- [ ] 서비스 시작
- [ ] 헬스 체크 확인
- [ ] 주요 기능 테스트
- [ ] 로그 모니터링
- [ ] 성능 확인

## 지원 리소스

마이그레이션 중 도움이 필요한 경우:

- **마이그레이션 문서**: [docs.devflow.dev/migration](https://docs.devflow.dev/migration)
- **FAQ**: [docs.devflow.dev/faq](https://docs.devflow.dev/faq)
- **커뮤니티 포럼**: [forum.devflow.dev](https://forum.devflow.dev)
- **지원 이메일**: migration@devflow.dev

### 긴급 지원

프로덕션 환경에서 긴급한 문제가 발생한 경우:
- **긴급 핫라인**: +1-555-DEVFLOW
- **엔터프라이즈 지원**: enterprise@devflow.dev

---

작성일: 2025-08-05  
버전: 1.0.0  
최종 수정: 2025-08-05