# DevFlow Monitor MCP

AI-powered development process monitoring MCP server for real-time tracking and visualization of software development workflows.

## Overview

DevFlow Monitor MCP is a Model Context Protocol server that monitors all aspects of software development in real-time, providing insights and metrics through Claude Desktop integration.

## Features

- 📁 File system monitoring with intelligent filtering
- 🔄 Git activity tracking and analysis
- 🎯 Automatic development stage recognition
- 🤖 AI collaboration tracking
- 📊 Real-time metrics and analytics
- 🏗️ Development methodology monitoring (DDD/TDD/BDD/EDA)
- 🚨 Bottleneck detection and alerts
- 📋 CLI/TUI dashboard

## Tech Stack

- **Language**: TypeScript 5.3+
- **Runtime**: Node.js 20+
- **MCP SDK**: @modelcontextprotocol/sdk 0.6+
- **Database**: SQLite (better-sqlite3)
- **Event System**: EventEmitter3
- **File Monitoring**: chokidar
- **Git Integration**: simple-git

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

## Documentation

- [Planning Document](./PLANNING.md)
- [PRD (Product Requirements Document)](./PRD.md)
- [Task List](./TASKS.md)
- [Features Specification](./docs/FEATURES.md)
- [Flowcharts](./docs/FLOWCHARTS.md)
- [Project Structure & Style Guide](./docs/PROJECT_STRUCTURE_AND_STYLE.md)

## License

MIT © yaioyaio

---

작성일: 2025-08-02  
최종 수정일: 2025-08-02  
작성자: yaioyaio
