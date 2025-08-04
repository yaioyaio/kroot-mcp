# DevFlow Monitor MCP - Deployment Guide

## Overview

DevFlow Monitor MCP is designed as a local MCP (Model Context Protocol) server that integrates directly with Claude Desktop. This guide covers various deployment methods for different use cases.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Local Installation](#local-installation)
3. [Docker Deployment](#docker-deployment)
4. [Environment Configuration](#environment-configuration)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- Node.js 20.19.1 or higher
- npm 10.x or higher
- Git
- Claude Desktop (for MCP integration)
- Docker (optional, for containerized deployment)

### Fastest Installation

```bash
# Clone the repository
git clone https://github.com/yaioyaio/kroot-mcp.git
cd kroot-mcp

# Run the local installation script
./scripts/deploy/install-local.sh
```

## Local Installation

### Method 1: Automated Installation (Recommended)

The automated installation script handles all setup steps:

```bash
# Make the script executable
chmod +x scripts/deploy/install-local.sh

# Run the installation
./scripts/deploy/install-local.sh
```

This script will:
- Check prerequisites
- Build the project
- Install to `~/.config/mcp/devflow-monitor`
- Configure Claude Desktop integration
- Create launch and uninstall scripts

### Method 2: Manual Installation

1. **Build the project**
   ```bash
   npm ci
   npm run build
   ```

2. **Create installation directory**
   ```bash
   mkdir -p ~/.config/mcp/devflow-monitor
   ```

3. **Copy files**
   ```bash
   cp -r dist/* ~/.config/mcp/devflow-monitor/
   cp package*.json ~/.config/mcp/devflow-monitor/
   cp -r config ~/.config/mcp/devflow-monitor/
   cp .env.example ~/.config/mcp/devflow-monitor/.env
   ```

4. **Install production dependencies**
   ```bash
   cd ~/.config/mcp/devflow-monitor
   npm ci --only=production
   ```

5. **Configure Claude Desktop**
   
   Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "devflow-monitor": {
         "command": "node",
         "args": ["~/.config/mcp/devflow-monitor/server/index.js"],
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

### Updating

To update an existing installation:

```bash
./scripts/deploy/update-local.sh
```

This will:
- Backup current installation
- Build and install new version
- Preserve your configuration
- Run any necessary migrations

## Docker Deployment

### Method 1: Docker Compose (Recommended)

**Development Environment:**
```bash
docker-compose up -d
```

**Production Environment:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Method 2: Standalone Docker

1. **Build the image**
   ```bash
   docker build -t devflow-monitor:latest .
   ```

2. **Run with automated script**
   ```bash
   ./scripts/deploy/deploy-docker.sh
   ```

3. **Or run manually**
   ```bash
   docker run -d \
     --name devflow-monitor \
     --restart unless-stopped \
     -p 127.0.0.1:3000:3000 \
     -v devflow-data:/app/data \
     -v devflow-logs:/app/logs \
     -e NODE_ENV=production \
     devflow-monitor:latest
   ```

### Docker Management

The deployment script creates helper scripts:
- `./docker-start.sh` - Start the container
- `./docker-stop.sh` - Stop the container
- `./docker-logs.sh` - View logs
- `./docker-status.sh` - Check status

### Claude Desktop with Docker

Update Claude Desktop configuration for Docker:
```json
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "docker",
      "args": ["exec", "-i", "devflow-monitor", "node", "/app/server/index.js"]
    }
  }
}
```

## Environment Configuration

### Configuration Structure

```
config/
├── default.json           # Base configuration
├── environments/
│   ├── development.json   # Development overrides
│   ├── production.json    # Production overrides
│   └── test.json         # Test environment
```

### Environment Variables

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Key environment variables:

```bash
# Server
NODE_ENV=production
MCP_SERVER_PORT=3000

# Database
DATABASE_PATH=./data/devflow.db

# Security (Required for production)
JWT_SECRET=your-secret-key
API_KEY_SALT=your-salt-value

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs/server.log

# Performance
MAX_CONCURRENT_MONITORS=10
EVENT_BATCH_SIZE=100
CACHE_TTL=300
```

### Configuration Loading Order

1. `config/default.json` (base configuration)
2. `config/environments/{NODE_ENV}.json` (environment-specific)
3. Environment variables (highest priority)

## CI/CD Pipeline

### GitHub Actions

The project includes automated CI/CD workflows:

#### Continuous Integration (`ci.yml`)
- Runs on: Push to main/develop, Pull requests
- Steps: Lint → Test → Build → Docker Build → Security Scan

#### Release Pipeline (`release.yml`)
- Runs on: Version tags (v*)
- Steps: Build → Package → Docker Push → GitHub Release

### Creating a Release

1. **Update version**
   ```bash
   npm version patch  # or minor/major
   ```

2. **Push with tags**
   ```bash
   git push origin main --tags
   ```

3. **GitHub Actions will automatically:**
   - Build and test
   - Create Docker images
   - Generate release artifacts
   - Create GitHub release

## Monitoring & Maintenance

### Health Checks

The server provides a health endpoint:
```bash
curl http://localhost:3000/health
```

### Logs

**Local Installation:**
- Application logs: `~/.config/mcp/devflow-monitor/logs/`
- Error logs: Check Claude Desktop logs

**Docker Installation:**
```bash
docker logs devflow-monitor
# or
./docker-logs.sh
```

### Database Maintenance

**Backup database:**
```bash
cp ~/.config/mcp/devflow-monitor/data/devflow.db ~/devflow-backup.db
```

**Optimize database:**
```bash
sqlite3 ~/.config/mcp/devflow-monitor/data/devflow.db "VACUUM;"
```

### Performance Monitoring

Use the built-in performance tools:
```typescript
// In Claude Desktop
await devflow.getPerformanceReport()
await devflow.getSystemMetrics()
```

## Troubleshooting

### Common Issues

#### 1. Server Won't Start
- Check Node.js version: `node -v` (must be 20+)
- Check logs for errors
- Verify file permissions
- Ensure port 3000 is available

#### 2. Claude Desktop Can't Connect
- Restart Claude Desktop after configuration changes
- Verify server is running: `ps aux | grep devflow`
- Check Claude Desktop logs
- Ensure correct path in configuration

#### 3. Database Errors
- Check disk space
- Verify database file permissions
- Try database repair:
  ```bash
  sqlite3 devflow.db ".recover" | sqlite3 devflow-recovered.db
  ```

#### 4. Docker Issues
- Ensure Docker daemon is running
- Check container logs: `docker logs devflow-monitor`
- Verify volume permissions
- Check resource limits

### Debug Mode

Enable debug mode for detailed logging:

**Local:**
```bash
DEBUG=true LOG_LEVEL=debug node server/index.js
```

**Docker:**
```bash
docker run -e DEBUG=true -e LOG_LEVEL=debug devflow-monitor:latest
```

### Getting Help

1. Check the [documentation](./docs/)
2. Review [GitHub Issues](https://github.com/yaioyaio/kroot-mcp/issues)
3. Enable debug logging
4. Collect logs and system information

## Security Considerations

### Production Deployment

1. **Always set in production:**
   - `JWT_SECRET` - Strong random string
   - `API_KEY_SALT` - Different from JWT secret
   - `NODE_ENV=production`

2. **Network Security:**
   - Bind to localhost only (127.0.0.1)
   - Use firewall rules if exposing externally
   - Enable HTTPS for external access

3. **File Permissions:**
   ```bash
   chmod 600 ~/.config/mcp/devflow-monitor/.env
   chmod 700 ~/.config/mcp/devflow-monitor/data
   ```

### Regular Maintenance

1. **Weekly:**
   - Check logs for errors
   - Monitor disk usage
   - Review security events

2. **Monthly:**
   - Update dependencies
   - Backup database
   - Review performance metrics

3. **Quarterly:**
   - Security audit
   - Performance optimization
   - Feature updates

---

작성일: 2025-08-04  
작성자: yaioyaio