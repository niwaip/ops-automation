#!/bin/bash
# 加载 Office Add-in

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

APP=${1:-word}

case $APP in
    word)
        MANIFEST="$ROOT_DIR/services/office-addin/manifest-word.xml"
        APP_NAME="Microsoft Word"
        ;;
    excel)
        MANIFEST="$ROOT_DIR/services/office-addin/manifest-excel.xml"
        APP_NAME="Microsoft Excel"
        ;;
    ppt|powerpoint)
        MANIFEST="$ROOT_DIR/services/office-addin/manifest-ppt.xml"
        APP_NAME="Microsoft PowerPoint"
        ;;
    *)
        echo "用法: $0 [word|excel|ppt]"
        exit 1
        ;;
esac

echo "=========================================="
echo "   加载 Office Add-in"
echo "=========================================="
echo ""
echo "目标应用: $APP_NAME"
echo "Manifest: $MANIFEST"
echo ""

# 检查服务是否运行
if ! curl -k -s https://localhost:3000 > /dev/null 2>&1; then
    echo "❌ Office Add-in 服务未运行"
    echo "请先运行: $SCRIPT_DIR/start-cn.sh"
    exit 1
fi

echo "✅ Office Add-in 服务运行中"
echo ""

# 检测操作系统
if [[ "$OSTYPE" == "darwin"* ]]; then
    # MacOS
    echo "检测到 MacOS"
    echo ""

    # 尝试使用 office-addin-debugging
    if command -v office-addin-debugging &> /dev/null; then
        echo "使用 office-addin-debugging 自动加载..."
        office-addin-debugging start $APP --manifest "$MANIFEST"
    else
        echo "安装 office-addin-debugging..."
        npm install -g office-addin-debugging
        office-addin-debugging start $APP --manifest "$MANIFEST"
    fi

elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    echo "检测到 Windows"
    echo ""

    if command -v office-addin-debugging &> /dev/null; then
        office-addin-debugging start $APP --manifest "$MANIFEST"
    else
        npm install -g office-addin-debugging
        office-addin-debugging start $APP --manifest "$MANIFEST"
    fi
else
    echo "请手动加载 Add-in:"
    echo "1. 打开 $APP_NAME"
    echo "2. 插入 → 加载项 → 我的加载项"
    echo "3. 上传: $MANIFEST"
fi