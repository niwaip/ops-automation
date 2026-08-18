#!/bin/bash

# ============================================================
# Ops Automation - Development Environment Startup Script
# ============================================================
# Usage: ./docker/scripts/start-dev.sh [options]
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
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

# Load local overrides from repository root .env when available.
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    . "$PROJECT_ROOT/.env"
    set +a
fi

# Common local development defaults (can be overridden from environment/.env).
DEV_HOST="${DEV_HOST:-localhost}"
DEV_PUBLIC_HOST="${DEV_PUBLIC_HOST:-${HOST_IP:-$DEV_HOST}}"
LOCAL_DB_HOST="${LOCAL_DB_HOST:-$DEV_HOST}"
LOCAL_REDIS_HOST="${LOCAL_REDIS_HOST:-$DEV_HOST}"
POSTGRES_USER="${POSTGRES_USER:-ops}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-ops_secret}"
POSTGRES_DB="${POSTGRES_DB:-ops}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PASSWORD="${REDIS_PASSWORD:-redis_secret}"
REDIS_PORT="${REDIS_PORT:-6379}"
OFFICE_ADDIN_PORT="${OFFICE_ADDIN_PORT:-3000}"
NOVNC_PORT="${NOVNC_PORT:-6080}"
CARBONE_ENGINE_PORT="${CARBONE_ENGINE_PORT:-3009}"

# Service ports (bash 3.x compatible)
get_service_port() {
    case "$1" in
        "ai-orchestrator") echo "${AI_ORCHESTRATOR_PORT:-3007}" ;;
        "platform") echo "${PLATFORM_PORT:-3001}" ;;
        "auth") echo "${AUTH_PORT:-3001}" ;;
        "session-broker") echo "${SESSION_BROKER_PORT:-3002}" ;;
        "control-plane") echo "${CONTROL_PLANE_PORT:-3003}" ;;
        "browser-worker") echo "${BROWSER_WORKER_PORT:-3004}" ;;
        "browser-template") echo "${BROWSER_TEMPLATE_PORT:-3005}" ;;
        "carbone-engine"|"document-engine") echo "${CARBONE_ENGINE_PORT:-3009}" ;;
        "report") echo "${REPORT_PORT:-3008}" ;;
        "portal") echo "${PORTAL_PORT:-5173}" ;;
        *) echo "" ;;
    esac
}

get_service_dir() {
    case "$1" in
        "ai-orchestrator") echo "apps/backend/intelligence/ai-orchestrator" ;;
        "platform") echo "apps/backend/core/platform" ;;
        "auth") echo "apps/backend/core/platform" ;;
        "session-broker") echo "apps/backend/execution-control/session-broker" ;;
        "control-plane") echo "apps/backend/execution-control/control-plane" ;;
        "browser-worker") echo "apps/backend/runtimes/browser-worker" ;;
        "browser-template") echo "apps/backend/capabilities/browser-domain/templates" ;;
        "carbone-engine"|"document-engine") echo "apps/backend/capabilities/document-domain" ;;
        "report") echo "apps/backend/capabilities/document-domain/report" ;;
        "portal") echo "apps/frontend/portal" ;;
        *) echo "" ;;
    esac
}

# Services to start (NestJS services only, portal is separate)
NEST_SERVICES="ai-orchestrator platform session-broker control-plane browser-template browser-worker report document-engine"

# Log directory
LOG_DIR="$PROJECT_ROOT/docker/logs"
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
    local host="${3:-$DEV_HOST}"
    local max_attempts=30
    local attempt=1

    log_info "Waiting for $name to be ready on ${host}:${port}..."

    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://${host}:$port/health" >/dev/null 2>&1 || curl -s "http://${host}:$port" >/dev/null 2>&1; then
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

    # Start infrastructure services through the repository-aware entrypoint
    bash ./docker/start-smart.sh docker-compose.yml up -d

    # Wait for PostgreSQL
    log_info "Waiting for PostgreSQL to be ready..."
    sleep 5
    bash ./docker/start-smart.sh docker-compose.yml exec -T postgres \
        pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

    log_success "Docker containers started!"
}

# Function to stop Docker containers
stop_docker() {
    log_info "Stopping Docker containers..."
    bash ./docker/start-smart.sh docker-compose.yml down
    log_success "Docker containers stopped!"
}

# Function to run database migrations
run_migrations() {
    log_info "Running database migrations..."
    bash ./docker/scripts/apply-latest-db-schema.sh

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
    local service_dir

    if [ -z "$port" ]; then
        log_error "Unknown service: $service"
        return 1
    fi

    service_dir="$(get_service_dir "$service")"
    if [ -z "$service_dir" ] || [ ! -d "$service_dir" ]; then
        log_error "Service directory not found for $service"
        return 1
    fi

    log_info "Starting $service on port $port..."

    # Set environment variables
    export PORT=$port
    export DATABASE_URL="${DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${LOCAL_DB_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}}"
    export REDIS_URL="${REDIS_URL:-redis://:${REDIS_PASSWORD}@${LOCAL_REDIS_HOST}:${REDIS_PORT}}"
    export AUTH_HOST="${AUTH_HOST:-$DEV_HOST}"
    export AUTH_PORT="${AUTH_PORT:-3001}"
    export PLATFORM_PORT="${PLATFORM_PORT:-3001}"
    export PLATFORM_SERVICE_URL="${PLATFORM_SERVICE_URL:-http://${DEV_HOST}:${PLATFORM_PORT}}"
    export AUTH_SERVICE_URL="${AUTH_SERVICE_URL:-$PLATFORM_SERVICE_URL}"
    export SESSION_BROKER_HOST="${SESSION_BROKER_HOST:-$DEV_HOST}"
    export SESSION_BROKER_PORT="${SESSION_BROKER_PORT:-3002}"
    export SESSION_BROKER_URL="${SESSION_BROKER_URL:-http://${DEV_HOST}:${SESSION_BROKER_PORT}}"
    export TEMPLATE_HOST="${TEMPLATE_HOST:-$DEV_HOST}"
    export TEMPLATE_PORT="${TEMPLATE_PORT:-3005}"
    export BROWSER_TEMPLATE_HOST="${BROWSER_TEMPLATE_HOST:-$TEMPLATE_HOST}"
    export BROWSER_TEMPLATE_PORT="${BROWSER_TEMPLATE_PORT:-$TEMPLATE_PORT}"
    export BROWSER_TEMPLATE_SERVICE_URL="${BROWSER_TEMPLATE_SERVICE_URL:-http://${DEV_HOST}:${BROWSER_TEMPLATE_PORT}}"
    export BROWSER_WORKER_HOST="${BROWSER_WORKER_HOST:-$DEV_HOST}"
    export BROWSER_WORKER_PORT="${BROWSER_WORKER_PORT:-3004}"
    export BROWSER_WORKER_URL="${BROWSER_WORKER_URL:-http://${DEV_HOST}:${BROWSER_WORKER_PORT}}"
    export AI_ORCHESTRATOR_HOST="${AI_ORCHESTRATOR_HOST:-$DEV_HOST}"
    export AI_ORCHESTRATOR_PORT="${AI_ORCHESTRATOR_PORT:-3007}"
    export AI_ORCHESTRATOR_URL="${AI_ORCHESTRATOR_URL:-http://${DEV_HOST}:${AI_ORCHESTRATOR_PORT}}"
    export AI_MODELS_DATA_DIR="${AI_MODELS_DATA_DIR:-$PROJECT_ROOT/apps/backend/var/cache/ai-orchestrator}"
    export CARBONE_SERVICE_URL="${CARBONE_SERVICE_URL:-http://${DEV_HOST}:${CARBONE_ENGINE_PORT}}"
    export CARBONE_EXTERNAL_URL="${CARBONE_EXTERNAL_URL:-http://${DEV_PUBLIC_HOST}:${CARBONE_ENGINE_PORT}}"
    export VITE_HOST_IP="${VITE_HOST_IP:-$DEV_PUBLIC_HOST}"
    export VITE_RECORDER_WS_URL="${VITE_RECORDER_WS_URL:-ws://${DEV_PUBLIC_HOST}:${BROWSER_WORKER_PORT}}"
    export VITE_NOVNC_URL="${VITE_NOVNC_URL:-http://${DEV_PUBLIC_HOST}:${NOVNC_PORT}/vnc.html}"
    export VITE_OFFICE_ADDIN_BASE_URL="${VITE_OFFICE_ADDIN_BASE_URL:-https://${DEV_PUBLIC_HOST}:${OFFICE_ADDIN_PORT}}"

    # Start the service
    cd "$service_dir"

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
    for port in \
        "${OFFICE_ADDIN_PORT}" \
        "${PLATFORM_PORT:-3001}" \
        "${SESSION_BROKER_PORT:-3002}" \
        "${CONTROL_PLANE_PORT:-3003}" \
        "${BROWSER_WORKER_PORT:-3004}" \
        "${BROWSER_TEMPLATE_PORT:-3005}" \
        "${AI_ORCHESTRATOR_PORT:-3007}" \
        "${PORTAL_PORT:-5173}"; do
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
        wait_for_service "$service" "$port" "$DEV_HOST"
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

    for service in ai-orchestrator platform session-broker control-plane browser-template browser-worker portal; do
        local port=$(get_service_port "$service")
        local status="NOT RUNNING"
        local color=$RED

        if curl -s "http://${DEV_HOST}:$port/health" >/dev/null 2>&1 || curl -s "http://${DEV_HOST}:$port" >/dev/null 2>&1; then
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
    bash ./docker/start-smart.sh docker-compose.yml ps 2>/dev/null || echo "  Docker not running"
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
        wait_for_service "$ONLY_SERVICE" "$port" "$DEV_HOST"
    else
        log_error "Unknown service: $ONLY_SERVICE"
        echo "Available services: ai-orchestrator platform session-broker control-plane browser-template browser-worker portal"
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
echo "  - AI Orchestrator:  http://${DEV_PUBLIC_HOST}:${AI_ORCHESTRATOR_PORT:-3007}"
echo "  - Platform:         http://${DEV_PUBLIC_HOST}:${PLATFORM_PORT:-3001}"
echo "  - Session Broker:   http://${DEV_PUBLIC_HOST}:${SESSION_BROKER_PORT:-3002}"
echo "  - Control Plane:    http://${DEV_PUBLIC_HOST}:${CONTROL_PLANE_PORT:-3003}"
echo "  - Browser Template: http://${DEV_PUBLIC_HOST}:${BROWSER_TEMPLATE_PORT:-3005}"
echo "  - Browser Worker:   http://${DEV_PUBLIC_HOST}:${BROWSER_WORKER_PORT:-3004}"
echo "  - Portal:           http://${DEV_PUBLIC_HOST}:${PORTAL_PORT:-5173}"
echo ""
echo "Logs are available in: $LOG_DIR"
echo ""
echo "To stop all services, run: $0 --stop"
