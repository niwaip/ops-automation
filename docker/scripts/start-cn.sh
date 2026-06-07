#!/bin/bash
# 一键启动 Carbone 服务（使用中国镜像源）

set -e

SCRIPT_PATH="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$0")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"

echo "[DEPRECATED] 建议优先使用 ./docker/scripts/start-smart.sh docker-compose.addin.yml up -d"
echo "[DEPRECATED] 本脚本仅保留为国内镜像环境的本地兼容入口。"
echo ""

echo "=========================================="
echo "   Carbone Office Add-in 一键启动"
echo "=========================================="
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，使用本地 npm 启动..."
    USE_DOCKER=false
else
    echo "✅ Docker 已安装"
    USE_DOCKER=true
fi

# 检查是否配置了中国镜像源
if [ "$USE_DOCKER" = true ]; then
    echo ""
    echo "配置 Docker 镜像源（中国境内加速）..."
    echo "请将以下内容添加到 Docker Desktop 设置中："
    echo ""
    cat "$DOCKER_DIR/daemon.json"
    echo ""
    read -p "已配置镜像源？继续... (y/n): " confirm
    if [ "$confirm" != "y" ]; then
        echo "请先配置镜像源后重试"
        exit 1
    fi
fi

# 创建必要目录
mkdir -p "$DOCKER_DIR/office-addin/certs"
mkdir -p "$DOCKER_DIR/carbone-official/node_modules"

# 生成 SSL 证书
if [ ! -f "$DOCKER_DIR/office-addin/certs/server.crt" ]; then
    echo ""
    echo "生成 SSL 证书..."
    openssl req -x509 -newkey rsa:2048 \
        -keyout "$DOCKER_DIR/office-addin/certs/server.key" \
        -out "$DOCKER_DIR/office-addin/certs/server.crt" \
        -days 365 -nodes \
        -subj "/C=CN/ST=Shanghai/L=Shanghai/O=Carbone/OU=Addin/CN=localhost" 2>/dev/null
    echo "✅ SSL 证书已生成"
fi

# 尝试使用 Docker
if [ "$USE_DOCKER" = true ]; then
    echo ""
    echo "尝试使用 Docker 启动..."

    # 拉取镜像（使用中国源）
    echo "拉取 node:18-alpine 镜像..."
    if docker pull docker.1ms.run/library/node:18-alpine 2>/dev/null; then
        docker tag docker.1ms.run/library/node:18-alpine node:18-alpine
        echo "✅ 镜像拉取成功"
    else
        echo "⚠️ Docker 镜像拉取失败，使用本地 npm 启动"
        USE_DOCKER=false
    fi
fi

# 启动服务
if [ "$USE_DOCKER" = true ]; then
    echo ""
    echo "启动 Docker 服务..."
    cd "$DOCKER_DIR"
    docker-compose up -d --build 2>&1 || {
        echo "⚠️ Docker 启动失败，切换到本地模式"
        USE_DOCKER=false
    }
fi

# 本地 npm 启动
if [ "$USE_DOCKER" = false ]; then
    echo ""
    echo "使用本地 npm 启动服务..."

    # 安装 Office Add-in 依赖
    echo "安装 Office Add-in 依赖..."
    cd "$REPO_ROOT/apps/office-addin"
    if [ ! -d "node_modules" ]; then
        npm install --registry=https://registry.npmmirror.com
    fi

    # 安装 Carbone API 依赖
    echo "安装 Carbone API 依赖..."
    cd "$DOCKER_DIR/carbone-official"
    if [ ! -d "node_modules" ]; then
        npm install --registry=https://registry.npmmirror.com
    fi

    # 启动服务
    echo ""
    echo "启动 Carbone API..."
    cd "$DOCKER_DIR/carbone-official"
    node carbone-server.js &
    CARBONE_PID=$!

    echo "启动 Office Add-in..."
    cd "$REPO_ROOT/apps/office-addin"
    npm run dev &
    ADDIN_PID=$!

    # 保存 PID
    echo $CARBONE_PID > "$DOCKER_DIR/.carbone.pid"
    echo $ADDIN_PID > "$DOCKER_DIR/.addin.pid"

    sleep 5
fi

# 检查服务状态
echo ""
echo "=========================================="
echo "   服务状态检查"
echo "=========================================="

if curl -s http://localhost:3100/health > /dev/null 2>&1; then
    echo "✅ Carbone API: http://localhost:3100"
else
    echo "❌ Carbone API 未启动"
fi

if curl -k -s https://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Office Add-in: https://localhost:3000"
else
    echo "❌ Office Add-in 未启动"
fi

echo ""
echo "=========================================="
echo "   下一步：加载 Office Add-in"
echo "=========================================="
echo ""
echo "方法1: 自动打开 Office 并加载"
echo "  运行: $DOCKER_DIR/load-addin.sh word"
echo ""
echo "方法2: 手动加载"
echo "  1. 打开 Word/Excel/PPT"
echo "  2. 插入 → 加载项 → 我的加载项"
echo "  3. 上传 manifest 文件:"
echo "     $REPO_ROOT/apps/office-addin/manifest-word.xml"
echo ""
echo "方法3: 下载 manifest 文件"
echo "  访问: https://localhost:3000/manifest-word.xml"
echo ""
echo "停止服务: $DOCKER_DIR/stop.sh"
