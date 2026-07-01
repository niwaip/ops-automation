#!/bin/bash

# AI识别测试运行脚本
# 用于在Docker环境中运行carbone-engine的AI识别测试

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"

echo "=============================================="
echo "AI识别测试 - Docker环境运行脚本"
echo "=============================================="

# 检查是否在Docker容器中运行
if [ -f /.dockerenv ]; then
  echo "[INFO] 已在Docker容器中运行"
  CONTAINER_MODE=true
else
  echo "[INFO] 在本地环境运行，需要进入Docker容器"
  CONTAINER_MODE=false
fi

# 设置测试环境变量
export NODE_ENV=test
export AI_ORCHESTRATOR_URL=http://localhost:3007
export AI_MODEL_ID=test-model-id
export TEMPLATES_DIR=/tmp/test_templates
export OUTPUTS_DIR=/tmp/test_outputs

# 创建测试目录
mkdir -p "$TEMPLATES_DIR"
mkdir -p "$OUTPUTS_DIR"

# 历史单元测试入口已退出仓库；当前只保留仍然存在的 AI e2e 场景。
echo ""
echo "[STEP 1] 跳过已移除的历史单元测试入口"
echo "=============================================="
echo "[INFO] ai-identifier.service.spec.ts 已不在当前仓库中，改为仅运行仍保留的 E2E 用例"

# 运行E2E测试
echo ""
echo "[STEP 2] 运行E2E测试..."
echo "=============================================="

(cd "$REPO_ROOT" && pnpm --filter carbone-engine test:e2e -- --testPathPattern="ai-identify.e2e-spec")

# 显示测试结果摘要
echo ""
echo "=============================================="
echo "[完成] 测试运行完成"
echo "=============================================="

# 如果测试失败，退出码为非零
