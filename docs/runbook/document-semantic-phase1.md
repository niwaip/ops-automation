# 文档语义增强（Phase 1）运行与回退手册

本手册用于确保 Phase 1 严格遵循设计目标：

- 主流程只有一条：Planner -> PlanDraftDTO -> 创建执行单 -> waiting_input/queued/running -> 执行 -> 结果 -> Chat/Portal 展示
- 语义理解是 Planner 内部旁路增强，可关闭、可回退
- Execution / control-plane 仍是唯一执行事实源
- `submitInputAndResume()` 仍是唯一合法恢复入口

## 1. 开关与阈值

环境变量（ai-orchestrator）：

- `DOCUMENT_SEMANTIC_SUBAGENT_ENABLED`：`true/false`，关闭后应完全回到字段级 required_inputs 机制
- `DOCUMENT_SEMANTIC_PARAM_THRESHOLD`：默认 `8`
- `DOCUMENT_SEMANTIC_MISSING_THRESHOLD`：默认 `4`
- `DOCUMENT_SEMANTIC_ARRAY_GROUP_THRESHOLD`：默认 `2`

## 2. 预期输出形态

当命中复杂文档任务且开关开启时：

- Planner 输出 `required_inputs` 应被清洗：不包含模板循环标记与明显技术噪音字段
- Planner 输出 `semantic`（PlanDraftDTO.semantic）：
  - `groupedMissing`：缺失项按业务组表达（如 items/deliveryItems/paymentSchedule）
  - `previewReady / finalReady`：按组级阻塞逻辑给出可预览/可最终生成状态
- control-plane 将 `semantic` 透传到：
  - `normalizedInputJson.semantic`
  - `ExecutionDto.semantic`
  - `step.waiting_input` 事件 payload（如发生 waiting_input）
- Portal 执行详情只读展示 `semantic`（不替换现有字段表单兜底）
- Chat 在 waiting_input 时优先按 `groupedMissing` 给出提示，字段级作为兜底

## 3. 回退验证（必须）

将 `DOCUMENT_SEMANTIC_SUBAGENT_ENABLED=false` 后：

- 简单任务应无回归（Planner/Execution 状态流转不变）
- 复杂文档任务应回到旧机制：
  - Planner 不输出 `semantic`（或不启用 complex_document 模式）
  - `required_inputs` 仍可走字段级缺失（不依赖 groupedMissing）
  - waiting_input 仍由现有字段级 required_inputs 驱动
  - `submitInputAndResume()` 仍可恢复执行

## 4. 一期验收清单（对齐设计文档）

- 简单任务无回归
- 复杂文档仍走统一执行单主线
- `required_inputs` 不再出现模板循环标记
- 缺失项表达更接近业务字段/业务组
- 执行详情可展示 `groupedMissing / previewReady`
- 关闭旁路后系统回到当前主流程
