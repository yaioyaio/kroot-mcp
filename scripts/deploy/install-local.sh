#!/bin/bash
# DevFlow Monitor MCP - Local Installation Script
# This script installs DevFlow Monitor as a local MCP server

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
LOG_FILE="/tmp/devflow-install.log"

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

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed. Please install Node.js 20+ first."
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        error "Node.js version 20+ is required. Current version: $(node -v)"
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        error "npm is not installed. Please install npm first."
    fi
    
    success "Prerequisites check passed"
}

# Create backup if updating
create_backup() {
    if [ -d "$INSTALL_DIR" ]; then
        log "Creating backup of existing installation..."
        
        BACKUP_NAME="devflow-backup-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        
        cp -r "$INSTALL_DIR" "$BACKUP_DIR/$BACKUP_NAME"
        success "Backup created at: $BACKUP_DIR/$BACKUP_NAME"
    fi
}

# Build project
build_project() {
    log "Building DevFlow Monitor..."
    
    # Clean previous build
    rm -rf dist/
    
    # Install dependencies
    npm ci || error "Failed to install dependencies"
    
    # Build project
    npm run build || error "Failed to build project"
    
    success "Build completed"
}

# Install MCP server
install_mcp_server() {
    log "Installing MCP server..."
    
    # Create installation directory
    mkdir -p "$INSTALL_DIR"
    
    # Copy files
    cp -r dist/* "$INSTALL_DIR/"
    cp package*.json "$INSTALL_DIR/"
    cp -r config "$INSTALL_DIR/"
    cp .env.example "$INSTALL_DIR/.env"
    
    # Copy documentation
    mkdir -p "$INSTALL_DIR/docs"
    cp -r docs/* "$INSTALL_DIR/docs/"
    
    # Install production dependencies
    cd "$INSTALL_DIR"
    npm ci --only=production || error "Failed to install production dependencies"
    cd - > /dev/null
    
    success "MCP server installed at: $INSTALL_DIR"
}

# Configure Claude Desktop
configure_claude_desktop() {
    log "Configuring Claude Desktop integration..."
    
    CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
    CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"
    
    # Create config directory if it doesn't exist
    mkdir -p "$CLAUDE_CONFIG_DIR"
    
    # Create or update configuration
    if [ -f "$CLAUDE_CONFIG_FILE" ]; then
        # Backup existing config
        cp "$CLAUDE_CONFIG_FILE" "$CLAUDE_CONFIG_FILE.backup"
        warning "Existing Claude Desktop config backed up to: $CLAUDE_CONFIG_FILE.backup"
    fi
    
    # Create new config
    cat > "$CLAUDE_CONFIG_FILE" << EOF
{
  "mcpServers": {
    "devflow-monitor": {
      "command": "node",
      "args": ["$INSTALL_DIR/server/index.js"],
      "env": {
        "NODE_ENV": "production",
        "DATABASE_PATH": "$INSTALL_DIR/data/devflow.db"
      }
    }
  }
}
EOF
    
    success "Claude Desktop configuration updated"
}

# Create launch script
create_launch_script() {
    log "Creating launch script..."
    
    LAUNCH_SCRIPT="$INSTALL_DIR/start.sh"
    
    cat > "$LAUNCH_SCRIPT" << 'EOF'
#!/bin/bash
# DevFlow Monitor MCP - Start Script

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Start the server
exec node server/index.js "$@"
EOF
    
    chmod +x "$LAUNCH_SCRIPT"
    success "Launch script created"
}

# Create uninstall script
create_uninstall_script() {
    log "Creating uninstall script..."
    
    UNINSTALL_SCRIPT="$INSTALL_DIR/uninstall.sh"
    
    cat > "$UNINSTALL_SCRIPT" << EOF
#!/bin/bash
# DevFlow Monitor MCP - Uninstall Script

echo "This will remove DevFlow Monitor MCP from your system."
read -p "Are you sure? (y/N) " -n 1 -r
echo

if [[ \$REPLY =~ ^[Yy]$ ]]; then
    # Remove installation directory
    rm -rf "$INSTALL_DIR"
    
    # Remove from Claude Desktop config
    if [ -f "$HOME/Library/Application Support/Claude/claude_desktop_config.json" ]; then
        # TODO: Remove only devflow-monitor entry from JSON
        echo "Please manually remove 'devflow-monitor' entry from Claude Desktop config"
    fi
    
    echo "DevFlow Monitor MCP has been uninstalled."
else
    echo "Uninstall cancelled."
fi
EOF
    
    chmod +x "$UNINSTALL_SCRIPT"
    success "Uninstall script created"
}

# Test installation
test_installation() {
    log "Testing installation..."
    
    cd "$INSTALL_DIR"
    
    # Test server startup
    timeout 5 node server/index.js --test 2>&1 | grep -q "MCP server" || warning "Server test failed"
    
    # Check file permissions
    if [ ! -r "server/index.js" ]; then
        error "Server files are not readable"
    fi
    
    success "Installation test passed"
}

# Main installation flow
main() {
    echo -e "${BLUE}DevFlow Monitor MCP - Local Installation${NC}"
    echo "========================================"
    echo
    
    # Start logging
    echo "Installation started at $(date)" > "$LOG_FILE"
    
    # Run installation steps
    check_prerequisites
    create_backup
    build_project
    install_mcp_server
    configure_claude_desktop
    create_launch_script
    create_uninstall_script
    test_installation
    
    # Print summary
    echo
    echo -e "${GREEN}Installation completed successfully!${NC}"
    echo
    echo "Installation directory: $INSTALL_DIR"
    echo "Launch script: $INSTALL_DIR/start.sh"
    echo "Uninstall script: $INSTALL_DIR/uninstall.sh"
    echo "Log file: $LOG_FILE"
    echo
    echo "Next steps:"
    echo "1. Review and update the configuration file: $INSTALL_DIR/.env"
    echo "2. Restart Claude Desktop to load the new MCP server"
    echo "3. Test the integration by using DevFlow Monitor tools in Claude"
    echo
    echo "To start the server manually:"
    echo "  $INSTALL_DIR/start.sh"
    echo
    echo "To uninstall:"
    echo "  $INSTALL_DIR/uninstall.sh"
}

# Run main function
main "$@"