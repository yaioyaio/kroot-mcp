# Better-SQLite3 범용 빌드 솔루션 분석

## 문제 상황
- PC마다 Node.js 아키텍처가 다름 (ARM64, x86_64)
- Claude Desktop은 x86_64 Node.js 사용
- 개발자 환경은 ARM64 Native 사용
- better-sqlite3는 C++ native 모듈로 아키텍처별 빌드 필요

## 범용 대응 방법

### 1. **Prebuild 활용 (권장)**
```json
{
  "scripts": {
    "postinstall": "prebuild-install || npm run build-native",
    "build-native": "node-gyp rebuild"
  }
}
```
- 대부분의 환경에서 prebuild된 바이너리 자동 다운로드
- 실패 시 자동으로 소스 빌드

### 2. **Pure JavaScript 대안 사용**

#### **sql.js** (가장 안정적)
```javascript
// Pure WebAssembly SQLite
npm install sql.js
```
- 장점: 아키텍처 독립적, 빌드 불필요
- 단점: 메모리 DB만 지원, 성능 50-70% 수준

#### **@sqlite.org/sqlite-wasm** (공식)
```javascript
npm install @sqlite.org/sqlite-wasm
```
- SQLite 공식 WebAssembly 버전
- Node.js 18+ 필요

### 3. **동적 아키텍처 감지**
```javascript
// install-sqlite.js
const { execSync } = require('child_process');
const os = require('os');

function installSqlite() {
  const arch = process.arch;
  const platform = os.platform();
  
  console.log(`Installing for ${platform}-${arch}...`);
  
  try {
    // 먼저 prebuild 시도
    execSync('npm install better-sqlite3', { stdio: 'inherit' });
  } catch (error) {
    // 실패 시 아키텍처별 빌드
    if (platform === 'darwin' && arch === 'x64') {
      execSync('arch -x86_64 npm install better-sqlite3 --build-from-source', { stdio: 'inherit' });
    } else {
      execSync('npm install better-sqlite3 --build-from-source', { stdio: 'inherit' });
    }
  }
}

installSqlite();
```

### 4. **Docker 기반 솔루션**
```dockerfile
# Dockerfile
FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "start"]
```
- 환경 통일로 빌드 이슈 해결

### 5. **옵셔널 종속성 활용**
```json
{
  "dependencies": {
    "better-sqlite3": "^9.6.0"
  },
  "optionalDependencies": {
    "sql.js": "^1.10.0"
  },
  "scripts": {
    "postinstall": "node scripts/setup-database.js"
  }
}
```

```javascript
// scripts/setup-database.js
try {
  require('better-sqlite3');
  console.log('Using better-sqlite3');
} catch (error) {
  console.log('Falling back to sql.js');
  process.env.USE_SQLJS = 'true';
}
```

## 권장 솔루션

### **단기 해결책**
1. README에 설치 가이드 명시
2. 플랫폼별 설치 스크립트 제공
3. CI/CD에서 다중 플랫폼 빌드

### **장기 해결책**
1. **sql.js로 마이그레이션**
   - 성능 손실 감수
   - 완전한 크로스플랫폼 지원
   
2. **추상화 레이어 구현**
   ```typescript
   interface DatabaseAdapter {
     prepare(sql: string): Statement;
     exec(sql: string): void;
   }
   
   class BetterSqliteAdapter implements DatabaseAdapter { }
   class SqlJsAdapter implements DatabaseAdapter { }
   ```

3. **Prebuild 자동화**
   - GitHub Actions로 다중 플랫폼 빌드
   - npm 패키지에 prebuild 포함

## 결론

**즉시 적용 가능한 범용 솔루션:**
1. postinstall 스크립트로 자동 감지/빌드
2. 빌드 실패 시 sql.js 폴백
3. 문서화 및 가이드 제공

**완벽한 솔루션은 없지만**, 위 방법들을 조합하면 대부분의 환경에서 동작하는 범용 시스템 구축 가능합니다.