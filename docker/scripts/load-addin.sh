#!/bin/bash
# 加载 Office Add-in

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$DOCKER_DIR")"
ADDIN_BASE_URL="${OFFICE_ADDIN_BASE_URL:-${VITE_ADDIN_BASE_URL:-https://localhost:3000}}"
TMP_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "$TMP_DIR"
}

trap cleanup EXIT

APP=${1:-word}

case $APP in
    word)
        MANIFEST_URL="$ADDIN_BASE_URL/manifest-word.xml"
        MANIFEST="$TMP_DIR/manifest-word.xml"
        APP_NAME="Microsoft Word"
        ;;
    excel)
        MANIFEST_URL="$ADDIN_BASE_URL/manifest-excel.xml"
        MANIFEST="$TMP_DIR/manifest-excel.xml"
        APP_NAME="Microsoft Excel"
        ;;
    ppt|powerpoint)
        MANIFEST_URL="$ADDIN_BASE_URL/manifest-ppt.xml"
        MANIFEST="$TMP_DIR/manifest-ppt.xml"
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
echo "Add-in Base URL: $ADDIN_BASE_URL"
echo "Manifest URL: $MANIFEST_URL"
echo ""

# 检查服务是否运行
if ! curl -k -s "$ADDIN_BASE_URL/health" > /dev/null 2>&1; then
    echo "❌ Office Add-in 服务未运行"
    echo "请先在仓库根目录运行: ./docker/start-smart.sh docker-compose.addin.yml up -d"
    exit 1
fi

echo "✅ Office Add-in 服务运行中"
echo ""

echo "下载当前运行配置对应的 manifest..."
if ! curl -k -fsSL "$MANIFEST_URL" -o "$MANIFEST"; then
    echo "❌ Manifest 下载失败: $MANIFEST_URL"
    exit 1
fi
echo "✅ Manifest 已下载到: $MANIFEST"
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
