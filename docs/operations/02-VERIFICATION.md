# DevFlow Monitor MCP - 검증 가이드

## 목차
1. [프로젝트 구조 검증](#1-프로젝트-구조-검증)
2. [개발 환경 검증](#2-개발-환경-검증)
3. [TypeScript 설정 검증](#3-typescript-설정-검증)
4. [린팅 및 포맷팅 검증](#4-린팅-및-포맷팅-검증)
5. [빌드 시스템 검증](#5-빌드-시스템-검증)
6. [Git 설정 검증](#6-git-설정-검증)
7. [자동화 검증 스크립트](#7-자동화-검증-스크립트)
8. [문제 해결](#8-문제-해결)

## 1. 프로젝트 구조 검증

### 1.1 기본 구조 확인
```bash
# 프로젝트 루트 확인
ls -la

# 예상 출력:
# - docs/
# - src/
# - tests/
# - config/
# - scripts/
# - package.json
# - tsconfig.json
# - .eslintrc.json
# - .prettierrc
# - .gitignore
```

### 1.2 소스 디렉토리 구조 확인
```bash
# src 디렉토리 구조 확인
ls -la src/

# 예상 하위 디렉토리:
# - analyzers/
# - dashboard/
# - events/
# - integrations/
# - monitors/
# - server/
# - storage/
# - tools/
# - types/
# - utils/
```

### 1.3 설정 파일 존재 확인
```bash
# 필수 설정 파일 확인
test -f package.json && echo "✓ package.json exists" || echo "✗ package.json missing"
test -f tsconfig.json && echo "✓ tsconfig.json exists" || echo "✗ tsconfig.json missing"
test -f .eslintrc.json && echo "✓ .eslintrc.json exists" || echo "✗ .eslintrc.json missing"
test -f .prettierrc && echo "✓ .prettierrc exists" || echo "✗ .prettierrc missing"
test -f .gitignore && echo "✓ .gitignore exists" || echo "✗ .gitignore missing"
```

## 2. 개발 환경 검증

### 2.1 Node.js 및 npm 버전 확인
```bash
# Node.js 버전 확인 (v20.0.0 이상)
node --version

# npm 버전 확인
npm --version

# 버전 요구사항 검증
NODE_VERSION=$(node -v | cut -d'v' -f2)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
if [ $NODE_MAJOR -ge 20 ]; then
    echo "✓ Node.js version is compatible"
else
    echo "✗ Node.js version must be 20.0.0 or higher"
fi
```

### 2.2 설치된 패키지 확인
```bash
# 설치된 패키지 목록
npm list --depth=0

# 주요 패키지 버전 확인
npm list typescript
npm list @typescript-eslint/parser
npm list eslint
npm list prettier
```

### 2.3 누락된 패키지 확인
```bash
# package.json과 node_modules 비교
npm ls
```

## 3. TypeScript 설정 검증

### 3.1 TypeScript 컴파일 테스트
```bash
# 테스트 파일 생성
echo "console.log('TypeScript verification test');" > src/verify.test.ts

# 타입 체크
npm run typecheck

# 빌드 테스트
npm run build

# 빌드 결과 확인
ls -la dist/

# 테스트 파일 정리
rm src/verify.test.ts
rm -rf dist/
```

### 3.2 tsconfig.json 설정 확인
```bash
# TypeScript 설정 검증
npx tsc --showConfig

# strict 모드 확인
grep -q '"strict": true' tsconfig.json && echo "✓ Strict mode enabled" || echo "✗ Strict mode disabled"
```

## 4. 린팅 및 포맷팅 검증

### 4.1 ESLint 테스트
```bash
# 테스트 파일 생성 (의도적인 린트 오류 포함)
cat > src/lint.test.ts << 'EOF'
const unused = 'test';
console.log("hello world")
if(true){
console.log('bad formatting')
}
EOF

# ESLint 실행
npm run lint

# 자동 수정 테스트
npm run lint:fix

# 수정 결과 확인
cat src/lint.test.ts

# 정리
rm src/lint.test.ts
```

### 4.2 Prettier 테스트
```bash
# 테스트 파일 생성 (포맷팅 오류 포함)
cat > src/format.test.ts << 'EOF'
const obj={a:1,b:2,c:3};
function test(){return true}
const arr=[1,2,3,4,5];
EOF

# Prettier 체크
npm run format:check

# 자동 포맷팅
npm run format

# 결과 확인
cat src/format.test.ts

# 정리
rm src/format.test.ts
```

## 5. 빌드 시스템 검증

### 5.1 전체 빌드 프로세스
```bash
# 클린 빌드
npm run clean
npm run build

# 빌드 출력 확인
find dist -type f -name "*.js" | head -5
find dist -type f -name "*.d.ts" | head -5
```

### 5.2 Watch 모드 테스트
```bash
# Watch 모드 시작 (백그라운드)
npm run dev &
DEV_PID=$!

# 프로세스 확인
ps aux | grep tsc

# Watch 모드 종료
kill $DEV_PID
```

## 6. Git 설정 검증

### 6.1 .gitignore 확인
```bash
# node_modules가 무시되는지 확인
git check-ignore node_modules && echo "✓ node_modules ignored" || echo "✗ node_modules not ignored"

# dist 디렉토리가 무시되는지 확인
git check-ignore dist && echo "✓ dist ignored" || echo "✗ dist not ignored"

# .env 파일이 무시되는지 확인
git check-ignore .env && echo "✓ .env ignored" || echo "✗ .env not ignored"
```

### 6.2 Git 상태 확인
```bash
# 현재 상태
git status --short

# 스테이징되지 않은 변경사항
git diff --stat
```

## 7. s자동화 검증 스크립트

### 7.1 검증 스크립트 생성
```bash
# scripts/verify.sh 생성
cat > scripts/verify.sh << 'EOF'
#!/bin/bash

echo "DevFlow Monitor MCP - Project Verification"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

# Function to check condition
check() {
    if eval "$1"; then
        echo -e "${GREEN}✓${NC} $2"
        ((PASSED++))
    else
        echo -e "${RED}✗${NC} $2"
        ((FAILED++))
    fi
}

# Node.js version check
echo -e "\n1. Environment Checks"
NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
check "[ $NODE_MAJOR -ge 20 ]" "Node.js version 20+"

# Required files
echo -e "\n2. Required Files"
check "[ -f package.json ]" "package.json exists"
check "[ -f tsconfig.json ]" "tsconfig.json exists"
check "[ -f .eslintrc.json ]" ".eslintrc.json exists"
check "[ -f .prettierrc ]" ".prettierrc exists"
check "[ -f .gitignore ]" ".gitignore exists"

# Directory structure
echo -e "\n3. Directory Structure"
check "[ -d src ]" "src directory exists"
check "[ -d tests ]" "tests directory exists"
check "[ -d docs ]" "docs directory exists"
check "[ -d config ]" "config directory exists"

# npm scripts
echo -e "\n4. NPM Scripts"
check "npm run | grep -q build" "build script exists"
check "npm run | grep -q lint" "lint script exists"
check "npm run | grep -q format" "format script exists"
check "npm run | grep -q typecheck" "typecheck script exists"

# Summary
echo -e "\n=========================================="
echo -e "Total: $((PASSED + FAILED)) | Passed: ${GREEN}$PASSED${NC} | Failed: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}All checks passed!${NC}"
    exit 0
else
    echo -e "\n${RED}Some checks failed. Please review the errors above.${NC}"
    exit 1
fi
EOF

# 실행 권한 부여
chmod +x scripts/verify.sh
```

### 7.2 검증 스크립트 실행
```bash
# 검증 실행
./scripts/verify.sh
```

## 8. 문제 해결

### 8.1 TypeScript 오류
```bash
# 타입 정의 누락
npm install --save-dev @types/node

# tsconfig.json 리셋
npx tsc --init --strict
```

### 8.2 ESLint 오류
```bash
# ESLint 캐시 삭제
rm -rf .eslintcache

# ESLint 재설정
npx eslint --init
```

### 8.3 빌드 오류
```bash
# 클린 빌드
npm run clean
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 8.4 권한 오류
```bash
# 스크립트 실행 권한
chmod +x scripts/*.sh

# npm 스크립트 권한
npm config set unsafe-perm true
```

## 체크리스트

### 환경 설정
- [ ] Node.js 20+ 설치 확인
- [ ] npm 패키지 설치 완료
- [ ] TypeScript 설정 완료

### 프로젝트 구조
- [ ] 모든 필수 디렉토리 존재
- [ ] 모든 설정 파일 존재
- [ ] .gitignore 설정 완료

### 개발 도구
- [ ] ESLint 정상 작동
- [ ] Prettier 정상 작동
- [ ] TypeScript 컴파일 성공

### 빌드 및 실행
- [ ] npm run build 성공
- [ ] npm run dev 정상 작동
- [ ] 모든 npm 스크립트 테스트 완료

## 다음 단계

검증이 완료되면 [개발 가이드](./03-DEVELOPMENT.md)를 참고하여 개발을 시작하세요.

---

작성일: 2025-08-02  
최종 수정일: 2025-08-02  
작성자: yaioyaio