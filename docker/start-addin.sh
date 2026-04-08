#!/bin/bash
# 一键启动 Carbone Office Add-in

set -e

echo "=========================================="
echo "   Carbone Office Add-in 一键启动"
echo "=========================================="

# 1. 启动Docker服务
echo ""
echo "1. 启动服务..."
cd "$(dirname "$0")"
docker-compose up -d 2>/dev/null | grep -v "level=warning" || true
sleep 3

# 2. 检查服务
echo "2. 检查服务..."
if ! curl -s http://localhost:3100/health > /dev/null 2>&1; then
    echo "❌ Carbone API 未启动"
    exit 1
fi
echo "   ✅ Carbone API: http://localhost:3100"

if ! curl -k -s https://localhost:3000/health > /dev/null 2>&1; then
    echo "❌ Office Add-in 未启动"
    exit 1
fi
echo "   ✅ Office Add-in: https://localhost:3000"

# 3. 信任证书
echo ""
echo "3. 信任SSL证书..."
CERT_FILE="$(pwd)/office-addin/certs/server.crt"
if [ -f "$CERT_FILE" ]; then
    echo "   请输入密码以信任证书:"
    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CERT_FILE" 2>/dev/null && \
        echo "   ✅ 证书已信任" || \
        echo "   ⚠️  证书信任需要手动确认"
fi

# 4. 下载manifest
echo ""
echo "4. 下载Manifest文件..."
mkdir -p /tmp/carbone-manifests
curl -k -s https://localhost:3000/manifest-word.xml -o /tmp/carbone-manifests/manifest-word.xml
curl -k -s https://localhost:3000/manifest-excel.xml -o /tmp/carbone-manifests/manifest-excel.xml
curl -k -s https://localhost:3000/manifest-ppt.xml -o /tmp/carbone-manifests/manifest-ppt.xml
echo "   ✅ Manifest已下载到 /tmp/carbone-manifests/"

# 5. 清理旧注册
echo ""
echo "5. 清理旧的Add-in注册..."
rm -rf ~/Library/Containers/com.microsoft.Word/Data/Documents/wef/*.xml 2>/dev/null
rm -rf ~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/*.xml 2>/dev/null
rm -rf ~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef/*.xml 2>/dev/null
echo "   ✅ 已清理"

# 6. 部署manifest到有效目录
echo ""
echo "6. 部署Manifest到Word有效目录..."
WORD_WEF_DIR=~/Library/Containers/com.microsoft.Word/Data/Documents/wef
EXCEL_WEF_DIR=~/Library/Containers/com.microsoft.Excel/Data/Documents/wef
PPT_WEF_DIR=~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef

mkdir -p "$WORD_WEF_DIR"
mkdir -p "$EXCEL_WEF_DIR"
mkdir -p "$PPT_WEF_DIR"

cp /tmp/carbone-manifests/manifest-word.xml "$WORD_WEF_DIR/carbone-template-assistant.xml"
cp /tmp/carbone-manifests/manifest-excel.xml "$EXCEL_WEF_DIR/carbone-template-assistant.xml"
cp /tmp/carbone-manifests/manifest-ppt.xml "$PPT_WEF_DIR/carbone-template-assistant.xml"
echo "   ✅ Manifest已部署到有效目录"

# 7. 加载Add-in
echo ""
echo "7. 加载Word Add-in..."
office-addin-debugging start /tmp/carbone-manifests/manifest-word.xml

echo ""
echo "=========================================="
echo "   完成！"
echo "=========================================="
echo ""
echo "Manifest已部署到:"
echo "   Word: ~/Library/Containers/com.microsoft.Word/Data/Documents/wef/"
echo "   Excel: ~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/"
echo "   PPT: ~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef/"
echo ""
echo "Word已打开，请在Word中:"
echo "   1. 点击 '插入' -> '我的加载项'"
echo "   2. 或查看右侧任务窗格"