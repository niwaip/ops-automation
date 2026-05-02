#!/bin/bash

# AI识别测试运行脚本
# 用于在Docker环境中运行carbone-engine的AI识别测试

set -e

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
mkdir -p $TEMPLATES_DIR
mkdir -p $OUTPUTS_DIR

# 运行单元测试
echo ""
echo "[STEP 1] 运行单元测试..."
echo "=============================================="

npm run test -- --testPathPattern="ai-identifier.service.spec" --coverage

# 运行E2E测试
echo ""
echo "[STEP 2] 运行E2E测试..."
echo "=============================================="

npm run test:e2e -- --testPathPattern="ai-identify.e2e-spec"

# 显示测试结果摘要
echo ""
echo "=============================================="
echo "[完成] 测试运行完成"
echo "=============================================="

# 如果测试失败，退出码为非零