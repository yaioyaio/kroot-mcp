# DevFlow Monitor MCP - 검증 가이드

## 목차
1. [프로젝트 구조 검증](#1-프로젝트-구조-검증)
2. [개발 환경 검증](#2-개발-환경-검증)
3. [Python 설정 검증](#3-python-설정-검증)
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
# - pyproject.toml
# - pyproject.toml
# - .ruffrc.json
# - .blackrc
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
test -f pyproject.toml && echo "✓ pyproject.toml exists" || echo "✗ pyproject.toml missing"
test -f pyproject.toml && echo "✓ pyproject.toml exists" || echo "✗ pyproject.toml missing"
test -f .ruffrc.json && echo "✓ .ruffrc.json exists" || echo "✗ .ruffrc.json missing"
test -f .blackrc && echo "✓ .blackrc exists" || echo "✗ .blackrc missing"
test -f .gitignore && echo "✓ .gitignore exists" || echo "✗ .gitignore missing"
```

## 2. 개발 환경 검증

### 2.1 Python 및 Poetry 버전 확인
```bash
# Python 버전 확인 (3.11 이상)
python --version

# Poetry 버전 확인
poetry --version

# 버전 요구사항 검증
PYTHON_VERSION=$(python --version 2>&1 | cut -d' ' -f2)
PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)
if [ $PYTHON_MAJOR -eq 3 ] && [ $PYTHON_MINOR -ge 11 ]; then
    echo "✓ Python version is compatible ($PYTHON_VERSION)"
else
    echo "✗ Python version must be 3.11 or higher"
fi
```

### 2.2 설치된 패키지 확인
```bash
# 설치된 패키지 목록
poetry show

# 주요 패키지 버전 확인
poetry show | grep python
poetry show ruff
poetry show ruff
poetry show black
```

### 2.3 누락된 패키지 확인
```bash
# pyproject.toml과 .venv 비교
poetry show --tree
```

## 3. Python 설정 검증

### 3.1 Python 컴파일 테스트
```bash
# 테스트 파일 생성
echo "print('Python verification test');" > tests/test_verify.py

# 타입 체크
poetry run mypy src/

# 빌드 테스트
poetry build

# 빌드 결과 확인
ls -la src/

# 테스트 파일 정리
rm tests/test_verify.py
rm -rf src/
```

### 3.2 pyproject.toml 설정 확인
```bash
# Python 설정 검증
poetry run mypy --version
poetry run mypy src/ --config-file pyproject.toml

# strict 모드 확인
grep -q 'strict = true' pyproject.toml && echo "✓ Strict mode enabled" || echo "✗ Strict mode disabled"
```

## 4. 린팅 및 포맷팅 검증

### 4.1 Ruff 테스트
```bash
# 테스트 파일 생성 (의도적인 린트 오류 포함)
cat > tests/test_lint.py << 'EOF'
const unused = 'test';
print("hello world")
if(true){
print('bad formatting')
}
EOF

# Ruff 실행
poetry run ruff check .

# 자동 수정 테스트
poetry run ruff check .:fix

# 수정 결과 확인
cat tests/test_lint.py

# 정리
rm tests/test_lint.py
```

### 4.2 Black 테스트
```bash
# 테스트 파일 생성 (포맷팅 오류 포함)
cat > tests/test_format.py << 'EOF'
const obj={a:1,b:2,c:3};
function test(){return true}
const arr=[1,2,3,4,5];
EOF

# Black 체크
poetry run black src/:check

# 자동 포맷팅
poetry run black src/

# 결과 확인
cat tests/test_format.py

# 정리
rm tests/test_format.py
```

## 5. 빌드 시스템 검증

### 5.1 전체 빌드 프로세스
```bash
# 클린 빌드
poetry run python -m devflow_monitor.utils.clean
poetry build

# 빌드 출력 확인
find dist -type f -name "*.js" | head -5
find dist -type f -name "*.pyi" | head -5
```

### 5.2 Watch 모드 테스트
```bash
# Watch 모드 시작 (백그라운드)
poetry run python -m devflow_monitor &
DEV_PID=$!

# 프로세스 확인
ps aux | grep tsc

# Watch 모드 종료
kill $DEV_PID
```

## 6. Git 설정 검증

### 6.1 .gitignore 확인
```bash
# .venv가 무시되는지 확인
git check-ignore .venv && echo "✓ .venv ignored" || echo "✗ .venv not ignored"

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

# Python version check
echo -e "\n1. Environment Checks"
PYTHON_VERSION=$(python --version 2>&1 | cut -d' ' -f2)
PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)
check "[ $PYTHON_MINOR -ge 11 ]" "Python version 3.11+"

# Required files
echo -e "\n2. Required Files"
check "[ -f pyproject.toml ]" "pyproject.toml exists"
check "[ -f pyproject.toml ]" "pyproject.toml exists"
check "[ -f .ruffrc.json ]" ".ruffrc.json exists"
check "[ -f .blackrc ]" ".blackrc exists"
check "[ -f .gitignore ]" ".gitignore exists"

# Directory structure
echo -e "\n3. Directory Structure"
check "[ -d src ]" "src directory exists"
check "[ -d tests ]" "tests directory exists"
check "[ -d docs ]" "docs directory exists"
check "[ -d config ]" "config directory exists"

# poetry scripts
echo -e "\n4. NPM Scripts"
check "poetry build" "build script exists"
check "poetry run ruff check ." "lint script exists"
check "poetry run black src/" "format script exists"
check "poetry run mypy src/" "typecheck script exists"

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

### 8.1 Python 타입 체크 오류
```bash
# 타입 스텁 설치
poetry add --group dev types-aiofiles types-cachetools

# mypy 설정 확인
poetry run mypy --version
poetry run mypy src/ --show-error-codes
```

### 8.2 Ruff 오류
```bash
# Ruff 캐시 삭제
rm -rf .ruffcache

# Ruff 재설정
poetry run ruff --init
```

### 8.3 빌드 오류
```bash
# 클린 빌드
poetry run python -m devflow_monitor.utils.clean
rm -rf .venv poetry.lock
poetry install
poetry build
```

### 8.4 권한 오류
```bash
# 스크립트 실행 권한
chmod +x scripts/*.sh

# Poetry 설정
# Poetry는 별도 권한 설정 불필요
```

## 체크리스트

### 환경 설정
- [ ] Python 3.11+ 설치 확인
- [ ] Poetry 패키지 설치 완료
- [ ] mypy 타입 체크 설정 완료

### 프로젝트 구조
- [ ] 모든 필수 디렉토리 존재
- [ ] 모든 설정 파일 존재
- [ ] .gitignore 설정 완료

### 개발 도구
- [ ] Ruff 정상 작동
- [ ] Black 정상 작동
- [ ] Python 컴파일 성공

### 빌드 및 실행
- [ ] poetry build 성공
- [ ] poetry run python -m devflow_monitor 정상 작동
- [ ] 모든 Poetry 스크립트 테스트 완료

## 다음 단계

검증이 완료되면 [개발 가이드](./03-DEVELOPMENT.md)를 참고하여 개발을 시작하세요.

---

작성일: 2026-02-02  
최종 수정일: 2026-02-02  
작성자: yaioyaio