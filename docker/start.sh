#!/bin/bash
# Carbone 服务启动脚本

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Carbone 服务启动 ==="
echo ""

# 1. 生成 SSL 证书（如果不存在）
if [ ! -f "$SCRIPT_DIR/office-addin/certs/server.crt" ]; then
    echo "1. 生成 SSL 证书..."
    cd "$SCRIPT_DIR/office-addin"
    chmod +x generate-certs.sh
    ./generate-certs.sh

    # MacOS 添加信任
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "添加证书到系统信任列表..."
        sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certs/server.crt
    fi
fi

echo ""
echo "2. 启动 Docker 服务..."
cd "$SCRIPT_DIR"
docker-compose up -d --build

echo ""
echo "等待服务启动..."
sleep 5

# 检查服务状态
echo ""
echo "=== 服务状态 ==="
docker-compose ps

echo ""
echo "=== 服务地址 ==="
echo "Office Add-in: https://localhost:3000"
echo "Carbone API:   http://localhost:3100"
echo ""
echo "健康检查:"
curl -s http://localhost:3100/health || echo "Carbone API 未就绪"

echo ""
echo "=== 下一步 ==="
echo "1. 打开 Word/Excel/PPT"
echo "2. 插入 > 获取加载项 > 管理我的加载项 > 上载我的加载项"
echo "3. 选择 manifest 文件: services/office-addin/manifest-word.xml"
echo ""
echo "停止服务: docker-compose down"