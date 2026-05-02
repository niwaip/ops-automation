#!/bin/bash
# 停止 Carbone 服务

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "停止 Carbone 服务..."

# 停止 Docker 服务
if docker ps --format '{{.Names}}' | grep -Eq '^(carbone-api|office-addin)$'; then
    cd "$SCRIPT_DIR"
    ./start-smart.sh docker-compose.addin.yml down
    echo "✅ Docker 服务已停止"
fi

# 停止本地进程
if [ -f "$SCRIPT_DIR/.carbone.pid" ]; then
    CARBONE_PID=$(cat "$SCRIPT_DIR/.carbone.pid")
    kill $CARBONE_PID 2>/dev/null
    rm "$SCRIPT_DIR/.carbone.pid"
    echo "✅ Carbone API 已停止"
fi

if [ -f "$SCRIPT_DIR/.addin.pid" ]; then
    ADDIN_PID=$(cat "$SCRIPT_DIR/.addin.pid")
    kill $ADDIN_PID 2>/dev/null
    rm "$SCRIPT_DIR/.addin.pid"
    echo "✅ Office Add-in 已停止"
fi

# 杀死端口占用
lsof -ti:3100 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

echo "✅ 所有服务已停止"
