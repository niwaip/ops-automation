#!/bin/bash
# 完整的 Carbone Office Add-in 启动脚本
# 包含：启动服务、信任证书、加载Add-in

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "[DEPRECATED] 建议优先使用 ./docker/scripts/start-smart.sh docker-compose.addin.yml up -d"
echo "[DEPRECATED] 本脚本保留为 Add-in 一键加载场景脚本。"
echo ""

echo "=========================================="
echo "   Carbone Office Add-in 一键启动"
echo "=========================================="
echo ""

# 1. 检查并启动Docker服务
echo "1. 启动 Docker 服务..."
cd "$SCRIPT_DIR"
./start-smart.sh docker-compose.addin.yml up -d 2>&1 | grep -v "level=warning" || true

sleep 3

# 检查服务状态
if curl -s http://localhost:3100/health > /dev/null 2>&1; then
    echo "   ✅ Carbone API 运行中: http://localhost:3100"
else
    echo "   ❌ Carbone API 未启动"
    exit 1
fi

if curl -k -s https://localhost:3000/health > /dev/null 2>&1; then
    echo "   ✅ Office Add-in 运行中: https://localhost:3000"
else
    echo "   ❌ Office Add-in 未启动"
    exit 1
fi

echo ""

# 2. 信任SSL证书
echo "2. 信任 SSL 证书..."
echo "   需要管理员权限，请输入密码："

CERT_FILE="$ROOT_DIR/office-addin/certs/server.crt"
if [ -f "$CERT_FILE" ]; then
    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CERT_FILE" 2>/dev/null && \
        echo "   ✅ SSL 证书已信任" || \
        echo "   ⚠️  证书信任失败，可能需要手动信任"
else
    echo "   ❌ 证书文件不存在"
fi

echo ""

# 3. 下载manifest文件
echo "3. 下载 Manifest 文件..."
mkdir -p /tmp/carbone-manifests

curl -k -s https://localhost:3000/manifest-word.xml -o /tmp/carbone-manifests/manifest-word.xml
curl -k -s https://localhost:3000/manifest-excel.xml -o /tmp/carbone-manifests/manifest-excel.xml
curl -k -s https://localhost:3000/manifest-ppt.xml -o /tmp/carbone-manifests/manifest-ppt.xml

echo "   ✅ Manifest 文件已下载到: /tmp/carbone-manifests/"

echo ""

# 4. 加载Office Add-in
echo "4. 加载 Office Add-in..."
echo ""
echo "请选择要加载的应用:"
echo "  1) Word"
echo "  2) Excel"
echo "  3) PowerPoint"
echo "  4) 全部"
echo "  q) 退出"
echo ""
read -p "请输入选项 (1-4/q): " choice

case $choice in
    1)
        echo "   启动 Word..."
        office-addin-debugging start /tmp/carbone-manifests/manifest-word.xml
        ;;
    2)
        echo "   启动 Excel..."
        office-addin-debugging start /tmp/carbone-manifests/manifest-excel.xml
        ;;
    3)
        echo "   启动 PowerPoint..."
        office-addin-debugging start /tmp/carbone-manifests/manifest-ppt.xml
        ;;
    4)
        echo "   启动 Word..."
        office-addin-debugging start /tmp/carbone-manifests/manifest-word.xml
        echo ""
        read -p "按回车启动 Excel..."
        office-addin-debugging start /tmp/carbone-manifests/manifest-excel.xml
        echo ""
        read -p "按回车启动 PowerPoint..."
        office-addin-debugging start /tmp/carbone-manifests/manifest-ppt.xml
        ;;
    q|Q)
        echo "退出"
        exit 0
        ;;
    *)
        echo "无效选项"
        exit 1
        ;;
esac

echo ""
echo "=========================================="
echo "   完成！"
echo "=========================================="
echo ""
echo "服务地址:"
echo "  - 下载页面: https://localhost:3000/download"
echo "  - Carbone API: http://localhost:3100"
echo ""
echo "Manifest 文件位置: /tmp/carbone-manifests/"
echo ""
echo "停止服务: ./docker/start-smart.sh docker-compose.addin.yml down"
