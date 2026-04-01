#!/bin/bash

# ============================================================
# Ops Automation - Development Environment Startup Script
# ============================================================
# Usage: ./scripts/start-dev.sh [options]
# Options:
#   --skip-docker    Skip Docker container startup
#   --skip-build     Skip building services
#   --only <service> Start only specified service
#   --stop           Stop all services
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Service ports (bash 3.x compatible)
get_service_port() {
    case "$1" in
        "ai-orchestrator") echo 3000 ;;
        "auth") echo 3001 ;;
        "session-broker") echo 3002 ;;
        "control-plane") echo 3003 ;;
        "template") echo 3004 ;;
        "replay-engine") echo 3005 ;;
        "browser-worker") echo 3006 ;;
        "portal") echo 5173 ;;
        *) echo "" ;;
    esac
}

# Services to start (NestJS services only, portal is separate)
NEST_SERVICES="ai-orchestrator auth session-broker control-plane template replay-engine browser-worker"

# Log directory
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

# Function to print colored messages
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to wait for a service to be ready
wait_for_service() {
    local name=$1
    local port=$2
    local max_attempts=30
    local attempt=1

    log_info "Waiting for $name to be ready on port $port..."

    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://localhost:$port/health" >/dev/null 2>&1 || curl -s "http://localhost:$port" >/dev/null 2>&1; then
            log_success "$name is ready!"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done

    echo ""
    log_warning "$name might not be ready yet (timeout after ${max_attempts}s)"
    return 0
}

# Function to start Docker containers
start_docker() {
    log_info "Starting Docker containers (PostgreSQL, Redis)..."

    if ! command_exists docker; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi

    # Start shared services
    docker compose -f docker/docker-compose.shared.yml up -d

    # Wait for PostgreSQL
    log_info "Waiting for PostgreSQL to be ready..."
    sleep 5
    docker compose -f docker/docker-compose.shared.yml exec -T postgres pg_isready -U ops -d ops

    log_success "Docker containers started!"
}

# Function to stop Docker containers
stop_docker() {
    log_info "Stopping Docker containers..."
    docker compose -f docker/docker-compose.shared.yml down
    log_success "Docker containers stopped!"
}

# Function to run database migrations
run_migrations() {
    log_info "Running database migrations..."

    # Set database URL
    export DATABASE_URL="postgresql://ops:ops_secret@localhost:5432/ops"

    # Run SQL migrations if they exist
    if [ -d "infra/sql/migrations" ]; then
        for sql_file in infra/sql/migrations/*.sql; do
            if [ -f "$sql_file" ]; then
                log_info "Applying migration: $sql_file"
                docker compose -f docker/docker-compose.shared.yml exec -T postgres \
                    psql -U ops -d ops -f - < "$sql_file" 2>/dev/null || true
            fi
        done
    fi

    # Run Prisma migrations for auth service
    if [ -d "services/auth/prisma" ]; then
        log_info "Running Prisma migrations for auth service..."
        cd services/auth
        if [ -f "prisma/schema.prisma" ]; then
            npx prisma migrate deploy 2>/dev/null || npx prisma db push --skip-generate 2>/dev/null || true
        fi
        cd "$PROJECT_ROOT"
    fi

    log_success "Database migrations completed!"
}

# Function to build all services
build_services() {
    log_info "Building all services..."

    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        pnpm install
    fi

    # Build all services
    pnpm run build

    log_success "All services built!"
}

# Function to start a single service
start_service() {
    local service=$1
    local port=$(get_service_port "$service")
    local log_file="$LOG_DIR/${service}.log"

    if [ -z "$port" ]; then
        log_error "Unknown service: $service"
        return 1
    fi

    log_info "Starting $service on port $port..."

    # Set environment variables
    export PORT=$port
    export DATABASE_URL="postgresql://ops:ops_secret@localhost:5432/ops"
    export REDIS_URL="redis://localhost:6379"
    export AUTH_HOST=localhost
    export AUTH_PORT=3001
    export SESSION_BROKER_HOST=localhost
    export SESSION_BROKER_PORT=3002
    export TEMPLATE_HOST=localhost
    export TEMPLATE_PORT=3004
    export AI_ORCHESTRATOR_HOST=localhost
    export AI_ORCHESTRATOR_PORT=3000
    export REPLAY_ENGINE_HOST=localhost
    export REPLAY_ENGINE_PORT=3005

    # Start the service
    cd "services/$service"

    if [ -f "dist/main.js" ]; then
        node dist/main.js > "$log_file" 2>&1 &
    elif [ -f "dist/src/main.js" ]; then
        node dist/src/main.js > "$log_file" 2>&1 &
    else
        log_warning "No entry point found for $service, trying dev mode..."
        pnpm run dev > "$log_file" 2>&1 &
    fi

    cd "$PROJECT_ROOT"
    echo $! > "$LOG_DIR/${service}.pid"

    log_success "$service started (PID: $(cat $LOG_DIR/${service}.pid), Log: $log_file)"
}

# Function to stop all services
stop_services() {
    log_info "Stopping all services..."

    for service in $NEST_SERVICES portal; do
        local pid_file="$LOG_DIR/${service}.pid"
        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
                log_success "Stopped $service (PID: $pid)"
            fi
            rm -f "$pid_file"
        fi
    done

    # Also kill any node processes on our ports
    for port in 3000 3001 3002 3003 3004 3005 3006 5173; do
        local pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill 2>/dev/null || true
        fi
    done

    log_success "All services stopped!"
}

# Function to start all services
start_all_services() {
    log_info "Starting all services..."

    for service in $NEST_SERVICES; do
        start_service "$service"
        sleep 1
    done

    # Wait for all services to be ready
    for service in $NEST_SERVICES; do
        local port=$(get_service_port "$service")
        wait_for_service "$service" "$port"
    done

    log_success "All services started!"
}

# Function to show status
show_status() {
    echo ""
    echo "=========================================="
    echo "   Ops Automation - Service Status"
    echo "=========================================="
    echo ""

    for service in ai-orchestrator auth session-broker control-plane template replay-engine browser-worker portal; do
        local port=$(get_service_port "$service")
        local status="NOT RUNNING"
        local color=$RED

        if curl -s "http://localhost:$port/health" >/dev/null 2>&1 || curl -s "http://localhost:$port" >/dev/null 2>&1; then
            status="RUNNING"
            color=$GREEN
        fi

        echo -e "  $service (port $port): ${color}${status}${NC}"
    done

    echo ""
    echo "=========================================="
    echo ""

    # Show Docker status
    echo "Docker Containers:"
    docker compose -f docker/docker-compose.shared.yml ps 2>/dev/null || echo "  Docker not running"
    echo ""
}

# Parse command line arguments
SKIP_DOCKER=false
SKIP_BUILD=false
STOP_MODE=false
ONLY_SERVICE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --skip-docker)
            SKIP_DOCKER=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --only)
            ONLY_SERVICE="$2"
            shift 2
            ;;
        --stop)
            STOP_MODE=true
            shift
            ;;
        --status)
            show_status
            exit 0
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-docker    Skip Docker container startup"
            echo "  --skip-build     Skip building services"
            echo "  --only <service> Start only specified service"
            echo "  --stop           Stop all services"
            echo "  --status         Show service status"
            echo "  -h, --help       Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Main execution
log_info "Starting Ops Automation Development Environment..."

if [ "$STOP_MODE" = true ]; then
    stop_services
    stop_docker
    exit 0
fi

# Start Docker if not skipped
if [ "$SKIP_DOCKER" = false ]; then
    start_docker
    run_migrations
fi

# Build services if not skipped
if [ "$SKIP_BUILD" = false ]; then
    build_services
fi

# Start services
if [ -n "$ONLY_SERVICE" ]; then
    port=$(get_service_port "$ONLY_SERVICE")
    if [ -n "$port" ]; then
        start_service "$ONLY_SERVICE"
        wait_for_service "$ONLY_SERVICE" "$port"
    else
        log_error "Unknown service: $ONLY_SERVICE"
        echo "Available services: ai-orchestrator auth session-broker control-plane template replay-engine browser-worker portal"
        exit 1
    fi
else
    start_all_services
fi

# Show final status
show_status

log_success "Development environment is ready!"
echo ""
echo "Service URLs:"
echo "  - AI Orchestrator:  http://localhost:3000"
echo "  - Auth:             http://localhost:3001"
echo "  - Session Broker:   http://localhost:3002"
echo "  - Control Plane:    http://localhost:3003"
echo "  - Template:         http://localhost:3004"
echo "  - Replay Engine:    http://localhost:3005"
echo "  - Browser Worker:   http://localhost:3006"
echo ""
echo "Logs are available in: $LOG_DIR"
echo ""
echo "To stop all services, run: $0 --stop"