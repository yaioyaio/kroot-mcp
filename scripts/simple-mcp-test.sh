#!/bin/bash
# 간단한 MCP 테스트 - 프로젝트 루트에서 실행

echo "🧪 Testing MCP Server from project directory..."

cd /Users/yaio/dev/workspace/cincotime_projects/kroot-mcp

# Initialize request
INIT_REQUEST='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# Tools list request  
TOOLS_REQUEST='{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Tool call request
TOOL_REQUEST='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"getProjectStatus","arguments":{}}}'

echo "Sending initialize request..."
echo "$INIT_REQUEST" | node dist/server/index.js 2>/dev/null | grep -E '^\{'

echo "Sending tools/list request..."
echo "$TOOLS_REQUEST" | node dist/server/index.js 2>/dev/null | grep -E '^\{'

echo "Sending tool call request..."
echo "$TOOL_REQUEST" | node dist/server/index.js 2>/dev/null | grep -E '^\{'