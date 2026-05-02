#!/bin/bash
# 本地开发验证脚本（不依赖 Docker）

SCRIPT_PATH="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$0")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"

echo "=== Carbone 本地开发验证 ==="
echo ""

# 检查 SSL 证书
if [ ! -f "$DOCKER_DIR/office-addin/certs/server.crt" ]; then
    echo "1. 生成 SSL 证书..."
    mkdir -p "$DOCKER_DIR/office-addin/certs"
    openssl req -x509 -newkey rsa:2048 \
        -keyout "$DOCKER_DIR/office-addin/certs/server.key" \
        -out "$DOCKER_DIR/office-addin/certs/server.crt" \
        -days 365 -nodes \
        -subj "/C=CN/ST=Shanghai/L=Shanghai/O=Carbone/OU=Addin/CN=localhost"

    echo ""
    echo "重要: 需要将证书添加到系统信任列表"
    echo "MacOS: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $DOCKER_DIR/office-addin/certs/server.crt"
fi

echo ""
echo "2. 安装 Office Add-in 依赖..."
cd "$REPO_ROOT/apps/office-addin"
npm install

echo ""
echo "3. 启动 Office Add-in 开发服务器..."
echo "运行: npm run dev"
echo ""
echo "服务将在 https://localhost:3000 启动"
echo ""
echo "=== Sideload 到 Office ==="
echo "1. 打开 Word/Excel/PPT"
echo "2. 插入 > 获取加载项 > 管理我的加载项 > 上载我的加载项"
echo "3. 选择 manifest 文件:"
echo "   - $REPO_ROOT/apps/office-addin/manifest-word.xml"
echo "   - $REPO_ROOT/apps/office-addin/manifest-excel.xml"
echo "   - $REPO_ROOT/apps/office-addin/manifest-ppt.xml"
echo ""
echo "=== Carbone API ==="
echo "如果需要 Carbone API，请单独启动:"
echo "cd $DOCKER_DIR/carbone-official"
echo "node carbone-server.js"
echo "API 地址: http://localhost:3100"
