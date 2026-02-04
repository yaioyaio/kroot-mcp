#!/bin/bash
# MCP 서버 기본 테스트 스크립트

echo "🧪 Testing MCP Server..."

# 초기화 테스트
echo "1. Testing initialization..."
INIT_RESPONSE=$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | timeout 5s node dist/server/index.js 2>&1)

if echo "$INIT_RESPONSE" | grep -q '"initialized"'; then
    echo "✅ Initialization successful"
else
    echo "❌ Initialization failed"
    echo "$INIT_RESPONSE"
    exit 1
fi

# 도구 목록 테스트
echo "2. Testing tools list..."
TOOLS_RESPONSE=$((echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}'; 
                  sleep 0.5; 
                  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}') | timeout 5s node dist/server/index.js 2>&1)

if echo "$TOOLS_RESPONSE" | grep -q '"getProjectStatus"'; then
    echo "✅ Tools list successful"
    TOOL_COUNT=$(echo "$TOOLS_RESPONSE" | grep -o '"name"' | wc -l)
    echo "   Found $TOOL_COUNT tools"
else
    echo "❌ Tools list failed"
fi

# 특정 도구 호출 테스트
echo "3. Testing tool execution..."
TOOL_RESPONSE=$((echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}'; 
                 sleep 0.5; 
                 echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"getProjectStatus","arguments":{}}}') | timeout 5s node dist/server/index.js 2>&1)

if echo "$TOOL_RESPONSE" | grep -q '"content"'; then
    echo "✅ Tool execution successful"
else
    echo "❌ Tool execution failed"
fi

echo "✨ Test completed!"