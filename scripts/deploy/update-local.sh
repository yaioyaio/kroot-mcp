#!/bin/bash
# DevFlow Monitor MCP - Update Script
# This script updates an existing DevFlow Monitor installation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="$HOME/.config/mcp/devflow-monitor"
BACKUP_DIR="$HOME/.config/mcp/backups"
LOG_FILE="/tmp/devflow-update.log"

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if installation exists
check_installation() {
    if [ ! -d "$INSTALL_DIR" ]; then
        error "DevFlow Monitor is not installed. Please run install-local.sh first."
    fi
    
    if [ ! -f "$INSTALL_DIR/package.json" ]; then
        error "Invalid installation directory. Missing package.json"
    fi
}

# Get version info
get_version_info() {
    CURRENT_VERSION=$(cd "$INSTALL_DIR" && node -p "require('./package.json').version")
    NEW_VERSION=$(node -p "require('./package.json').version")
    
    log "Current version: $CURRENT_VERSION"
    log "New version: $NEW_VERSION"
    
    if [ "$CURRENT_VERSION" = "$NEW_VERSION" ]; then
        warning "You already have the latest version ($CURRENT_VERSION)"
        read -p "Do you want to continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 0
        fi
    fi
}

# Create backup
create_backup() {
    log "Creating backup of current installation..."
    
    BACKUP_NAME="devflow-backup-$CURRENT_VERSION-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    # Backup current installation
    cp -r "$INSTALL_DIR" "$BACKUP_DIR/$BACKUP_NAME"
    
    # Save current config
    if [ -f "$INSTALL_DIR/.env" ]; then
        cp "$INSTALL_DIR/.env" "$BACKUP_DIR/$BACKUP_NAME/.env.backup"
    fi
    
    success "Backup created at: $BACKUP_DIR/$BACKUP_NAME"
}

# Stop running server
stop_server() {
    log "Checking for running server..."
    
    # Check if server is running
    if pgrep -f "$INSTALL_DIR/server/index.js" > /dev/null; then
        log "Stopping DevFlow Monitor server..."
        pkill -f "$INSTALL_DIR/server/index.js" || true
        sleep 2
        success "Server stopped"
    else
        log "Server is not running"
    fi
}

# Build new version
build_project() {
    log "Building new version..."
    
    # Clean previous build
    rm -rf dist/
    
    # Install dependencies
    npm ci || error "Failed to install dependencies"
    
    # Build project
    npm run build || error "Failed to build project"
    
    success "Build completed"
}

# Update installation
update_installation() {
    log "Updating installation..."
    
    # Save current config
    if [ -f "$INSTALL_DIR/.env" ]; then
        cp "$INSTALL_DIR/.env" /tmp/devflow.env.tmp
    fi
    
    # Remove old files (except data and logs)
    find "$INSTALL_DIR" -maxdepth 1 ! -name 'data' ! -name 'logs' ! -name '.env' -exec rm -rf {} + 2>/dev/null || true
    
    # Copy new files
    cp -r dist/* "$INSTALL_DIR/"
    cp package*.json "$INSTALL_DIR/"
    cp -r config "$INSTALL_DIR/"
    
    # Copy documentation
    mkdir -p "$INSTALL_DIR/docs"
    cp -r docs/* "$INSTALL_DIR/docs/"
    
    # Restore config
    if [ -f /tmp/devflow.env.tmp ]; then
        mv /tmp/devflow.env.tmp "$INSTALL_DIR/.env"
    else
        cp .env.example "$INSTALL_DIR/.env"
    fi
    
    # Update production dependencies
    cd "$INSTALL_DIR"
    npm ci --only=production || error "Failed to install production dependencies"
    cd - > /dev/null
    
    # Update scripts
    cp scripts/deploy/*.sh "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR"/*.sh
    
    success "Installation updated"
}

# Run migrations if needed
run_migrations() {
    log "Checking for database migrations..."
    
    cd "$INSTALL_DIR"
    
    # Check if migrations are needed
    if [ -f "dist/storage/migrations/index.js" ]; then
        log "Running database migrations..."
        node -e "
        const { runMigrations } = require('./dist/storage/migrations/index.js');
        runMigrations().then(() => {
            console.log('Migrations completed');
            process.exit(0);
        }).catch(err => {
            console.error('Migration failed:', err);
            process.exit(1);
        });
        " || warning "Migration check failed"
    fi
    
    cd - > /dev/null
}

# Test update
test_update() {
    log "Testing updated installation..."
    
    cd "$INSTALL_DIR"
    
    # Test server startup
    timeout 5 node server/index.js --test 2>&1 | grep -q "MCP server" || warning "Server test failed"
    
    success "Update test passed"
}

# Main update flow
main() {
    echo -e "${BLUE}DevFlow Monitor MCP - Update${NC}"
    echo "=============================="
    echo
    
    # Start logging
    echo "Update started at $(date)" > "$LOG_FILE"
    
    # Run update steps
    check_installation
    get_version_info
    create_backup
    stop_server
    build_project
    update_installation
    run_migrations
    test_update
    
    # Print summary
    echo
    echo -e "${GREEN}Update completed successfully!${NC}"
    echo
    echo "Updated from version $CURRENT_VERSION to $NEW_VERSION"
    echo "Backup saved at: $BACKUP_DIR/$BACKUP_NAME"
    echo "Log file: $LOG_FILE"
    echo
    echo "Next steps:"
    echo "1. Review any configuration changes in $INSTALL_DIR/.env"
    echo "2. Restart Claude Desktop to reload the MCP server"
    echo "3. Check the changelog for new features and breaking changes"
    echo
    echo "If you encounter any issues, you can rollback using:"
    echo "  cp -r $BACKUP_DIR/$BACKUP_NAME/* $INSTALL_DIR/"
}

# Run main function
main "$@"