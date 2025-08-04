# DevFlow Monitor MCP

AI-powered development process monitoring MCP server for real-time tracking and visualization of software development workflows.

**Status**: Milestone 3 in progress - Core monitoring systems complete, AI collaboration tracking implemented.

## Overview

DevFlow Monitor MCP is a Model Context Protocol server that monitors all aspects of software development in real-time, providing insights and metrics through Claude Desktop integration.

## Features

### ✅ Implemented (Milestones 1-3)
- 📁 **File System Monitoring** - Real-time file change detection with intelligent filtering
- 🔄 **Git Integration** - Complete Git activity tracking, branch analysis, commit pattern recognition
- 🎯 **Development Stage Recognition** - 13-stage development process auto-detection
- 🤖 **AI Collaboration Tracking** - Claude, GitHub Copilot, ChatGPT usage monitoring and analysis
- 🏗️ **Methodology Monitoring** - DDD/TDD/BDD/EDA pattern recognition and scoring
- 📊 **Real-time Analytics** - Event processing, metrics collection, and bottleneck detection
- 🌐 **WebSocket Streaming** - Real-time event broadcasting to connected clients
- 🗄️ **Data Storage** - SQLite with in-memory caching and event queuing
- 🔌 **External API Integration** - Jira, Notion, Figma connectivity
- 🛠️ **MCP Tools Suite** - 13 comprehensive development monitoring tools

### 🚧 In Progress
- 📋 CLI/TUI dashboard
- 🚨 Advanced alerting system
- 📈 Enhanced metrics visualization

## Tech Stack

### Core Technologies
- **Language**: TypeScript 5.9.2 (strict mode)
- **Runtime**: Node.js 20.19.1 LTS
- **MCP SDK**: @modelcontextprotocol/sdk 0.6.1

### Data & Storage
- **Database**: SQLite (better-sqlite3 12.2.0)
- **Caching**: In-memory with EventEmitter3-based queuing
- **Event Processing**: EventEmitter3 5.0.1 with priority queues

### Monitoring & Integration
- **File Monitoring**: chokidar 3.x
- **Git Integration**: simple-git 3.27.0
- **API Client**: axios 1.11.0
- **Real-time Communication**: ws 8.18.3

### Development Tools
- **Testing**: Vitest 3.2.4 with coverage
- **Linting**: ESLint + Prettier
- **Build**: esbuild + tsx

## Installation

```bash
# Clone the repository
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Start the MCP server
npm start
```

### Claude Desktop Integration

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "node",
      "args": ["/path/to/kroot-mcp/dist/server/index.js"]
    }
  }
}
```

## Development

```bash
# Run in development mode
npm run dev

# Run linter
npm run lint

# Run type checking
npm run typecheck

# Format code
npm run format
```

## MCP Tools Available

This server provides 13 specialized tools for development monitoring:

### Core Monitoring
- `getProjectStatus` - Real-time project status and metrics
- `getMetrics` - Comprehensive development metrics with filtering
- `getActivityLog` - Detailed activity tracking across all sources
- `analyzeBottlenecks` - Automated bottleneck detection and analysis

### Advanced Analysis  
- `checkMethodology` - DDD/TDD/BDD/EDA compliance scoring
- `analyzeStage` - Development stage recognition and progression
- `analyzeAICollaboration` - AI tool usage patterns and effectiveness
- `generateReport` - Automated report generation

### Real-time Communication
- `startWebSocketServer` / `stopWebSocketServer` - WebSocket server management
- `getWebSocketStats` / `getStreamStats` - Connection monitoring
- `broadcastSystemNotification` - System-wide notifications

## Project Status

### Completed Milestones
- ✅ **Milestone 1**: MVP Foundation (TypeScript setup, MCP server, file monitoring)
- ✅ **Milestone 2**: Core Integrations (Git, APIs, event queuing, WebSocket)
- 🚧 **Milestone 3**: Intelligent Monitoring (75% complete)
  - ✅ Development stage recognition
  - ✅ Methodology monitoring  
  - ✅ AI collaboration tracking
  - 🚧 CLI/TUI dashboard
  - 🚧 Advanced analytics

## Documentation

### Planning & Architecture
- [📋 Planning Document](./PLANNING.md) - Complete project roadmap
- [📄 PRD (Product Requirements)](./PRD.md) - Product specifications
- [✅ Task List](./TASKS.md) - Detailed implementation tasks
- [🏗️ Project Structure & Style](./docs/PROJECT_STRUCTURE_AND_STYLE.md)

### Features & Implementation
- [🚀 Features Specification](./docs/FEATURES.md) - Detailed feature descriptions
- [📊 Flowcharts](./docs/FLOWCHARTS.md) - System flow visualizations
- [📝 Today's TODO](./docs/todolist/TODOLIST.2025-08-04.md) - Current progress
- [🔧 Claude Integration Guide](./.claude/CLAUDE.md) - Development workflow

### Operations
- [🚀 Installation Guide](./docs/INSTALLATION.md) - Complete setup instructions
- [📖 API Documentation](./docs/API.md) - Comprehensive API reference
- [⚙️ Operations Guide](./docs/operations/README.md) - Deployment and monitoring

## License

MIT © yaioyaio

---

작성일: 2025-08-02  
최종 수정일: 2025-08-04 (AI 협업 추적 완료, 마일스톤 3 진행 상황 반영)  
작성자: yaioyaio

## Recent Updates

**2025-08-04**: 
- ✅ AI collaboration tracking system implemented
- ✅ 6 AI tools detection (Claude, Copilot, ChatGPT, Cursor, TabNine, CodeWhisperer)
- ✅ AI usage pattern analysis and effectiveness metrics
- ✅ All documentation synchronized

**2025-08-03**:
- ✅ Milestone 2 completed (Git integration, API connections, WebSocket streaming)
- ✅ Development stage recognition system
- ✅ Methodology monitoring (DDD/TDD/BDD/EDA)
