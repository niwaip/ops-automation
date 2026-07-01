#!/bin/bash
# 停止 Carbone 服务

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"

stop_pid_file() {
    local label="$1"
    shift
    local pid_file
    local pid

    for pid_file in "$@"; do
        if [ -f "$pid_file" ]; then
            pid=$(cat "$pid_file")
            kill "$pid" 2>/dev/null || true
            rm -f "$pid_file"
            echo "✅ ${label} 已停止"
            return 0
        fi
    done

    return 1
}

echo "停止 Carbone 服务..."

# 停止 Docker 服务
if docker ps --format '{{.Names}}' | grep -Eq '^(carbone-api|office-addin)$'; then
    cd "$SCRIPT_DIR"
    ./start-smart.sh docker-compose.addin.yml down
    echo "✅ Docker 服务已停止"
fi

# 停止本地进程
stop_pid_file "Carbone API" \
    "$DOCKER_DIR/.carbone.pid" \
    "$SCRIPT_DIR/.carbone.pid" || true

stop_pid_file "Office Add-in" \
    "$DOCKER_DIR/.addin.pid" \
    "$SCRIPT_DIR/.addin.pid" || true

# 杀死端口占用
lsof -ti:3100 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

echo "✅ 所有服务已停止"
