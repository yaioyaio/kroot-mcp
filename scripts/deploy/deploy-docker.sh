#!/bin/bash
# DevFlow Monitor MCP - Docker Deployment Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="devflow-monitor"
IMAGE_NAME="devflow-monitor:latest"
CONTAINER_NAME="devflow-monitor"
DATA_VOLUME="devflow-monitor-data"
LOG_VOLUME="devflow-monitor-logs"

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check Docker
check_docker() {
    log "Checking Docker installation..."
    
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
    fi
    
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running. Please start Docker."
    fi
    
    success "Docker is ready"
}

# Build Docker image
build_image() {
    log "Building Docker image..."
    
    docker build -t "$IMAGE_NAME" . || error "Failed to build Docker image"
    
    success "Docker image built: $IMAGE_NAME"
}

# Stop existing container
stop_container() {
    if docker ps -a | grep -q "$CONTAINER_NAME"; then
        log "Stopping existing container..."
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
        success "Existing container stopped and removed"
    fi
}

# Create volumes
create_volumes() {
    log "Creating Docker volumes..."
    
    docker volume create "$DATA_VOLUME" || true
    docker volume create "$LOG_VOLUME" || true
    
    success "Docker volumes created"
}

# Deploy container
deploy_container() {
    log "Deploying container..."
    
    # Check for .env file
    ENV_FILE=""
    if [ -f ".env" ]; then
        ENV_FILE="--env-file .env"
    elif [ -f ".env.example" ]; then
        cp .env.example .env
        warning "Created .env from .env.example. Please update with your values."
        ENV_FILE="--env-file .env"
    fi
    
    # Run container
    docker run -d \
        --name "$CONTAINER_NAME" \
        --restart unless-stopped \
        -p "127.0.0.1:3000:3000" \
        -v "$DATA_VOLUME:/app/data" \
        -v "$LOG_VOLUME:/app/logs" \
        -v "$(pwd)/config:/app/config:ro" \
        $ENV_FILE \
        -e NODE_ENV=production \
        --health-cmd="node -e \"require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))\"" \
        --health-interval=30s \
        --health-timeout=3s \
        --health-retries=3 \
        "$IMAGE_NAME" || error "Failed to start container"
    
    success "Container deployed: $CONTAINER_NAME"
}

# Wait for health check
wait_for_health() {
    log "Waiting for container to be healthy..."
    
    TIMEOUT=60
    ELAPSED=0
    
    while [ $ELAPSED -lt $TIMEOUT ]; do
        if docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null | grep -q "healthy"; then
            success "Container is healthy"
            return 0
        fi
        
        sleep 2
        ELAPSED=$((ELAPSED + 2))
        echo -n "."
    done
    
    error "Container failed to become healthy within $TIMEOUT seconds"
}

# Show container info
show_info() {
    log "Container information:"
    
    echo
    docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo
    
    log "Container logs (last 10 lines):"
    docker logs --tail 10 "$CONTAINER_NAME"
    echo
    
    log "Volume information:"
    docker volume ls | grep "$PROJECT_NAME"
    echo
}

# Create management scripts
create_management_scripts() {
    log "Creating management scripts..."
    
    # Start script
    cat > docker-start.sh << 'EOF'
#!/bin/bash
docker start devflow-monitor
echo "DevFlow Monitor started"
EOF
    
    # Stop script
    cat > docker-stop.sh << 'EOF'
#!/bin/bash
docker stop devflow-monitor
echo "DevFlow Monitor stopped"
EOF
    
    # Logs script
    cat > docker-logs.sh << 'EOF'
#!/bin/bash
docker logs -f devflow-monitor
EOF
    
    # Status script
    cat > docker-status.sh << 'EOF'
#!/bin/bash
docker ps --filter "name=devflow-monitor" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo
docker inspect --format='Health: {{.State.Health.Status}}' devflow-monitor 2>/dev/null || echo "Health: unknown"
EOF
    
    chmod +x docker-*.sh
    
    success "Management scripts created"
}

# Main deployment flow
main() {
    echo -e "${BLUE}DevFlow Monitor MCP - Docker Deployment${NC}"
    echo "========================================"
    echo
    
    # Check for docker-compose
    if [ "$1" = "--compose" ] || [ "$1" = "-c" ]; then
        log "Using docker-compose deployment..."
        
        if ! command -v docker-compose &> /dev/null; then
            error "docker-compose is not installed"
        fi
        
        if [ "$2" = "prod" ] || [ "$2" = "production" ]; then
            docker-compose -f docker-compose.prod.yml up -d || error "Failed to start with docker-compose"
        else
            docker-compose up -d || error "Failed to start with docker-compose"
        fi
        
        success "Deployment completed with docker-compose"
        exit 0
    fi
    
    # Run deployment steps
    check_docker
    build_image
    stop_container
    create_volumes
    deploy_container
    wait_for_health
    show_info
    create_management_scripts
    
    # Print summary
    echo
    echo -e "${GREEN}Docker deployment completed successfully!${NC}"
    echo
    echo "Container: $CONTAINER_NAME"
    echo "Image: $IMAGE_NAME"
    echo "Port: 127.0.0.1:3000"
    echo "Data volume: $DATA_VOLUME"
    echo "Logs volume: $LOG_VOLUME"
    echo
    echo "Management commands:"
    echo "  ./docker-start.sh   - Start container"
    echo "  ./docker-stop.sh    - Stop container"
    echo "  ./docker-logs.sh    - View logs"
    echo "  ./docker-status.sh  - Check status"
    echo
    echo "To use with Claude Desktop, update your configuration to:"
    echo '  "command": "docker",'
    echo '  "args": ["exec", "-i", "devflow-monitor", "node", "/app/server/index.js"]'
}

# Run main function
main "$@"