# DevFlow Monitor MCP

AI-powered development process monitoring MCP server for real-time tracking and visualization of software development workflows.

**Status**: Milestone 4 in progress (2025-08-04) - Performance optimization and security enhancements completed.

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
- 📈 **Advanced Metrics Engine** - Comprehensive metrics collection, analysis, and bottleneck detection
- 🚨 **Notification System** - Rule-based alerting with Slack and dashboard channels
- ⚡ **Performance Optimization** - Complete performance optimization system with profiling, caching, and scaling
- 🔐 **Security System** - JWT authentication, RBAC, encryption, and audit logging
- 🛠️ **MCP Tools Suite** - 37 comprehensive development monitoring tools

### 🚧 Next Phase (Milestone 4 continued)
- 🚀 Production deployment optimization
- 📦 Container orchestration
- 📝 Documentation finalization

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

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp

# Run automated installation
./scripts/deploy/install-local.sh
```

This will install DevFlow Monitor to `~/.config/mcp/devflow-monitor` and configure Claude Desktop automatically.

### Manual Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the MCP server
npm start
```

### Docker Installation

```bash
# Using Docker Compose
docker-compose up -d

# Or using deployment script
./scripts/deploy/deploy-docker.sh
```

For detailed installation instructions, see the [Deployment Guide](./docs/DEPLOYMENT.md).

### Claude Desktop Integration

The installation script automatically configures Claude Desktop. For manual configuration:

```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "node",
      "args": ["~/.config/mcp/devflow-monitor/server/index.js"]
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

This server provides 37 specialized tools for development monitoring:

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

### Metrics & Analytics
- `getAdvancedMetrics` - Advanced metrics with time-based filtering
- `getBottlenecks` - Detailed bottleneck detection and analysis
- `getMetricsSnapshot` - Current metrics snapshot
- `analyzeProductivity` - Productivity analysis and insights

### Notification System
- `configureNotifications` - Configure notification channels and rules
- `sendNotification` - Send manual notifications
- `getNotificationStats` - Notification system statistics
- `getNotificationRules` - List active notification rules
- `deleteNotificationRule` - Remove notification rules

### Performance Optimization
- `getPerformanceReport` - Comprehensive performance analysis and metrics
- `optimizePerformance` - Execute system-wide performance optimization
- `getSystemMetrics` - Real-time system resource monitoring
- `profilePerformance` - Performance profiling with bottleneck detection
- `manageCaches` - Multi-layer cache management and optimization

### Security Management
- `login` - User authentication with JWT token generation
- `verifyToken` - JWT token validation and context retrieval
- `checkPermission` - Role-based permission verification
- `generateAPIKey` - Secure API key creation with custom permissions
- `encryptData` / `decryptData` - AES-256-GCM encryption/decryption
- `getSecurityStats` - Security system statistics and monitoring
- `queryAuditLogs` - Security audit log retrieval and analysis
- `assignRole` - User role management and assignment

## Project Status

### Completed Milestones
- ✅ **Milestone 1**: MVP Foundation (TypeScript setup, MCP server, file monitoring)
- ✅ **Milestone 2**: Core Integrations (Git, APIs, event queuing, WebSocket)
- ✅ **Milestone 3**: Intelligent Monitoring (100% complete)
  - ✅ Development stage recognition
  - ✅ Methodology monitoring (DDD/TDD/BDD/EDA)
  - ✅ AI collaboration tracking
  - ✅ CLI/TUI dashboard
  - ✅ Advanced metrics engine
  - ✅ Notification system
- ✅ **Milestone 4**: Production Readiness (100% complete)
  - ✅ Performance optimization system
  - ✅ Security enhancements
  - ✅ Deployment preparation (Docker, CI/CD, local installation)

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
- [🚢 Deployment Guide](./docs/DEPLOYMENT.md) - Comprehensive deployment instructions
- [✅ Deployment Checklist](./docs/DEPLOYMENT_CHECKLIST.md) - Pre and post deployment verification

## License

MIT © yaioyaio

---

작성일: 2025-08-02  
최종 수정일: 2025-08-04 (배포 준비 완료)  
작성자: yaioyaio

## Recent Updates

**2025-08-04**: 
- ✅ **Deployment Preparation** - Complete deployment infrastructure
  - Docker support: Multi-stage Dockerfile, docker-compose for dev/prod
  - Environment configuration: Flexible config system with environment overrides
  - CI/CD Pipeline: GitHub Actions for automated testing and releases
  - Local installation: Automated scripts for easy MCP server setup
  - Deployment documentation: Comprehensive guides and checklists
- ✅ **Security Enhancement System** - Complete security system implementation
  - SecurityManager: Integrated authentication and authorization system
  - JWT Authentication: Token-based authentication with refresh tokens
  - API Key Management: Secure API key generation and validation
  - RBAC System: Role-based access control with permission checking
  - Data Encryption: AES-256-GCM encryption/decryption with key rotation
  - Audit Logging: Comprehensive security event logging and analysis
  - MCP Security Tools: 8 new security management tools
  - Authentication Middleware: Permission checks for sensitive MCP tools
- ✅ **Performance Optimization System** - Complete performance optimization implementation
  - PerformanceProfiler: Metric tracking, bottleneck detection, memory leak monitoring
  - MemoryOptimizer: LRU cache system, automatic cleanup, TTL management
  - AsyncOptimizer: Priority queues, batch processing, resource pooling
  - CacheManager: Multi-layer caching (memory + SQLite), tag-based invalidation
  - ScalingManager: Dynamic scaling, event batching, load balancing
  - 5 new MCP tools for performance management
- ✅ **Milestone 3 completed** - All intelligent monitoring systems implemented
- ✅ CLI/TUI dashboard system with blessed TUI and CLI table views
- ✅ AI collaboration tracking for 6 AI tools (Claude, Copilot, ChatGPT, etc.)
- ✅ Advanced metrics engine with real-time collection and analysis
- ✅ Notification system with rule-based alerting
- ✅ Slack and dashboard notification channels
- ✅ Bottleneck detection with 5 types (process/quality/resource/workflow/technical)
- ✅ 37 total MCP tools (added 8 security tools + 14 metrics/notifications/performance tools)
- ✅ All documentation synchronized

**2025-08-03**:
- ✅ Milestone 2 completed (Git integration, API connections, WebSocket streaming)
- ✅ Development stage recognition system
- ✅ Methodology monitoring (DDD/TDD/BDD/EDA)
