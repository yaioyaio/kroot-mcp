# DevFlow Monitor MCP

AI-powered development process monitoring MCP server for real-time tracking and visualization of software development workflows.

**Status**: Milestone 3 in progress - Core monitoring systems complete, AI collaboration tracking and CLI/TUI dashboard implemented.

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
- 📋 **CLI/TUI Dashboard** - Real-time monitoring interface with blessed TUI and CLI table views
- 🛠️ **MCP Tools Suite** - 15 comprehensive development monitoring tools (including dashboard controls)

### 🚧 In Progress
- 🚨 Advanced alerting system
- 📈 Enhanced metrics engine and visualization

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

### Dashboard & UI
- **TUI Framework**: blessed 0.1.81 (terminal user interface)
- **CLI Styling**: chalk 5.5.0 (colorized output)
- **Table Rendering**: cli-table3 0.6.5 (structured data display)
- **CLI Framework**: commander 14.0.0 (command-line interface)

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

## Dashboard Usage

### CLI Dashboard
Simple table-based interface for monitoring:
```bash
# Start CLI dashboard
npx tsx scripts/dashboard.ts cli

# Compact mode with custom refresh interval
npx tsx scripts/dashboard.ts cli --compact --refresh 2000
```

### TUI Dashboard
Full-featured terminal interface with multiple panels:
```bash
# Start TUI dashboard (default)
npx tsx scripts/dashboard.ts tui

# Custom configuration
npx tsx scripts/dashboard.ts start --mode tui --refresh 1000 --max-events 100
```

#### TUI Keyboard Controls
- **r** - Refresh all data
- **c** - Clear activity feed
- **h** - Toggle help panel
- **q/ESC** - Quit dashboard

### Dashboard Features
- **Real-time Event Feed** - Live activity monitoring from all sources
- **System Status** - EventEngine statistics, uptime, queue status
- **Development Stage** - Current stage detection with confidence levels
- **Methodology Metrics** - DDD/TDD/BDD/EDA compliance scoring
- **AI Usage Tracking** - Real-time AI tool usage and effectiveness
- **Interactive Controls** - Keyboard shortcuts for navigation and control

## MCP Tools Available

This server provides 15 specialized tools for development monitoring:

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

### Dashboard Control
- `startDashboard` - Launch CLI/TUI dashboard with configurable options
- `getDashboardStatus` - Check dashboard running status and uptime

## Project Status

### Completed Milestones
- ✅ **Milestone 1**: MVP Foundation (TypeScript setup, MCP server, file monitoring)
- ✅ **Milestone 2**: Core Integrations (Git, APIs, event queuing, WebSocket)
- 🚧 **Milestone 3**: Intelligent Monitoring (80% complete)
  - ✅ Development stage recognition
  - ✅ Methodology monitoring  
  - ✅ AI collaboration tracking
  - ✅ CLI/TUI dashboard
  - 🚧 Advanced metrics engine
  - 🚧 Alert system

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
최종 수정일: 2025-08-04 (CLI/TUI 대시보드 완료, 마일스톤 3 80% 달성)  
작성자: yaioyaio

## Recent Updates

**2025-08-04**: 
- ✅ CLI/TUI dashboard system implemented
- ✅ Real-time monitoring interface with blessed TUI and CLI table views
- ✅ Interactive dashboard controls (r/c/h/q keyboard shortcuts)
- ✅ 6-panel TUI layout with live event feeds
- ✅ Dashboard MCP tools integration (startDashboard, getDashboardStatus)
- ✅ AI collaboration tracking system implemented
- ✅ 6 AI tools detection (Claude, Copilot, ChatGPT, Cursor, TabNine, CodeWhisperer)
- ✅ AI usage pattern analysis and effectiveness metrics
- ✅ All documentation synchronized

**2025-08-03**:
- ✅ Milestone 2 completed (Git integration, API connections, WebSocket streaming)
- ✅ Development stage recognition system
- ✅ Methodology monitoring (DDD/TDD/BDD/EDA)
