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
check "npm run 2>/dev/null | grep -q build" "build script exists"
check "npm run 2>/dev/null | grep -q lint" "lint script exists"
check "npm run 2>/dev/null | grep -q format" "format script exists"
check "npm run 2>/dev/null | grep -q typecheck" "typecheck script exists"

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