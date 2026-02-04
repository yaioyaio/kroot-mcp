#!/bin/bash
# 남은 경로 문제를 임시로 해결하는 스크립트

echo "🔧 Creating necessary directories in project root..."

# 프로젝트 루트에 필요한 디렉토리 생성
PROJECT_ROOT="/Users/yaio/dev/workspace/cincotime_projects/kroot-mcp"

mkdir -p "$PROJECT_ROOT/reports/generated"
mkdir -p "$PROJECT_ROOT/reports/templates"
mkdir -p "$PROJECT_ROOT/reports/temp"
mkdir -p "$PROJECT_ROOT/report-templates"
mkdir -p "$PROJECT_ROOT/plugins"
mkdir -p "$PROJECT_ROOT/node_modules/@devflow-plugins"

echo "✅ Directories created"

# Claude Desktop 설정 파일 생성
cat > "$PROJECT_ROOT/claude-desktop-config.json" << 'EOF'
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "node",
      "args": ["/Users/yaio/dev/workspace/cincotime_projects/kroot-mcp/dist/server/index.js"],
      "env": {
        "NODE_ENV": "production",
        "DEVFLOW_PROJECT_ROOT": "/Users/yaio/dev/workspace/cincotime_projects/kroot-mcp"
      }
    }
  }
}
EOF

echo "📋 Claude Desktop configuration saved to: claude-desktop-config.json"
echo ""
echo "To use with Claude Desktop:"
echo "1. Copy the content of claude-desktop-config.json"
echo "2. Add it to your Claude Desktop settings"
echo ""
echo "✨ Setup complete!"