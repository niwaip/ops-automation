#!/usr/bin/env bash
set -e

# Personal Sandbox Container Entrypoint
echo "=== Starting Personal Sandbox for user: ${USER_ID:-anonymous} ==="
echo "Mode: ${USER_MODE:-personal}"
echo "Identity: $(id -un 2>/dev/null || whoami) (UID: $(id -u))"
echo "Workspace: ${WORKSPACE:-/workspace}"
echo "Knowledge Space: ${KNOWLEDGE_DIR:-/knowledge}"
echo "Plugin Directory: ${DSH_PLUGIN_DIR:-/opt/dsh/plugins}"

# 确保工作区目录可访问
cd "${WORKSPACE:-/workspace}" 2>/dev/null || true

# 检测个人知识库挂载状态
if [ -d "${KNOWLEDGE_DIR:-/knowledge}" ]; then
  NOTE_COUNT=$(find "${KNOWLEDGE_DIR:-/knowledge}" -type f 2>/dev/null | wc -l | tr -d ' ')
  echo "Knowledge space mounted: ${NOTE_COUNT} items available (read-only)."
else
  echo "Warning: Knowledge space not mounted at ${KNOWLEDGE_DIR:-/knowledge}"
fi

# 检测统一插件目录挂载状态
if [ -d "${DSH_PLUGIN_DIR:-/opt/dsh/plugins}" ]; then
  PLUGIN_COUNT=$(find "${DSH_PLUGIN_DIR:-/opt/dsh/plugins}" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
  echo "Managed plugins: ${PLUGIN_COUNT} certified plugins active."
fi

# 检查环境底座版本
echo "Node version: $(node -v 2>/dev/null || echo 'not installed')"
echo "Python version: $(python3 --version 2>/dev/null || echo 'not installed')"
echo "Git version: $(git --version 2>/dev/null || echo 'not installed')"

# 执行传入的命令，如果为空则常驻等待
if [ $# -eq 0 ]; then
  echo "Sandbox is ready. Entering idle listening state..."
  exec tail -f /dev/null
else
  exec "$@"
fi
