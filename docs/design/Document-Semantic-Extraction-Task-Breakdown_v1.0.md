# 文档参数语义提取 Subagent 开发任务拆解清单

**版本：** v1.0  
**日期：** 2026-05-13  
**状态：** 设计中

> 本文将 [Document-Semantic-Extraction-Integration-Blueprint_v1.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/Document-Semantic-Extraction-Integration-Blueprint_v1.0.md) 进一步下沉为可排期、可指派、可验收的开发任务清单。目标是在不破坏现有主流程的前提下，逐步引入复杂文档任务的语义提取 Subagent。

---

## 1. Backlog 目标

当前 backlog 围绕以下核心目标展开：

- **复杂任务分流**：让简单任务继续走旧路径，复杂文档任务走语义增强路径；
- **参数质量提升**：去除模板噪音字段、恢复数组组、纠正不合理必填项；
- **协议兼容**：在不重写 `control-plane` 的前提下，让 `semantic` 增强信息可透传；
- **交互升级**：让 `waiting_input` 从字段表单逐步升级为分组补输入；
- **渐进放量**：支持按阶段灰度、按配置回退、按任务类型逐步开启。

---

## 2. 优先级与阶段

### P0: 契约预埋与观测准备

- 不改变现有执行行为；
- 先把 DTO、配置开关、调试字段预埋好；
- 为后续灰度引入做好条件。

### P1: Planner 语义增强接入

- 第一收益来源；
- 先减少错误的 `required_inputs` 和错误的 `waiting_input`。

### P2: Control-plane 语义透传

- 不重写状态机；
- 只让执行单能携带 `semantic` 元信息。

### P3: Portal 展示升级

- 优先提升复杂文档执行单的可解释性；
- 先展示分组和 `previewReady`，再考虑交互重构。

### P4: 组级自然语言补充

- 最后才做组级输入；
- 确保前面 DTO、Planner、透传链路先稳定。

---

## 3. 服务级任务拆解

## 3.1 `ai-orchestrator` (Planner 主战场)

### P0: 契约与开关

- [ ] 增加文档语义增强总开关，例如 `DOCUMENT_SEMANTIC_SUBAGENT_ENABLED`
- [ ] 增加复杂度阈值配置，例如字段数阈值、缺失数阈值、数组组阈值
- [ ] 给 `PlanDraftDTO` 增加可选 `semantic` 字段
- [ ] 给 planner debug 快照预留 `semanticDebug` 结构

**建议涉及文件**

- [planner.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.ts)
- Planner 对应的 interfaces / dto 定义文件
- 配置读取相关模块

**验收门槛**

- [ ] 关闭开关时，Planner 输出与当前行为一致
- [ ] 开启开关但未命中复杂任务时，Planner 输出与当前行为一致
- [ ] `PlanDraftDTO` 序列化后兼容现有调用方

### P1: 复杂度分流

- [ ] 新增 `document-task-complexity.service.ts`
- [ ] 基于技能类型、参数数、数组组、缺失数判断 `simple / complex_document`
- [ ] 在 `generatePlan()` 中插入复杂度判定
- [ ] 将复杂度判定结果写入 planner debug

**建议涉及文件**

- [planner.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.ts)
- 新增 `document-task-complexity.service.ts`

**验收门槛**

- [ ] 简单任务被判为 `simple`
- [ ] 多 sheet、多数组、缺失多的文档任务被判为 `complex_document`
- [ ] 复杂度判定结果可在调试快照中看到

### P1: 语义 Subagent 接入

- [ ] 新增 `document-semantic-subagent.service.ts`
- [ ] 为复杂文档任务构造 Subagent 输入上下文
- [ ] 接入标准输出结果包
- [ ] 低置信度 / 超时 / 错误时自动回退旧路径

**建议涉及文件**

- [planner.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.ts)
- 新增 `document-semantic-subagent.service.ts`
- 现有 `recognizer.service.ts` 所在模块，视情况复用

**验收门槛**

- [ ] 命中复杂文档任务时可得到 `semantic.mode=complex_document`
- [ ] Subagent 失败时自动回到旧 `recognizeParams` 路径
- [ ] 回退原因可被记录

### P1: 语义结果适配

- [ ] 新增 `document-semantic-adapter.service.ts`
- [ ] 将 `semanticModel` 适配为现有 `recognizedParams`
- [ ] 将 `groupedMissing` 适配为较干净的 `required_inputs`
- [ ] 过滤模板循环标记和技术变量噪音
- [ ] 修正明显不合理的字段类型输出

**重点清理对象**

- `{#d.items}{/d.items}`
- `{#d.deliveryItems}{/d.deliveryItems}`
- `{#d.paymentSchedule}{/d.paymentSchedule}`

**验收门槛**

- [ ] `required_inputs` 中不再出现模板循环标记
- [ ] 复杂合同类任务的缺失字段数量明显下降
- [ ] `required_inputs` 中的字段更接近业务字段而非模板字段

### P1: 字段策略中心

- [ ] 新增 `document-field-policy.service.ts`
- [ ] 定义 `hard_required / soft_required / optional / derived`
- [ ] 定义 `blocking / degrading / none`
- [ ] 在 Planner 中接入字段策略判断

**验收门槛**

- [ ] 合同主体和 `items[]` 能被识别为阻塞性关键字段
- [ ] 付款计划、补充条款可被判为非阻塞或降级项
- [ ] 派生字段不再优先要求人工填写

---

## 3.2 `ai-orchestrator / chat.controller`

### P0: 透传兼容准备

- [ ] 确认 `planDraft.semantic` 可透传到创建执行单请求中
- [ ] 确认流式响应 `data.plan` 中保留 `semantic`

**建议涉及文件**

- [chat.controller.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/controllers/chat.controller.ts)

**验收门槛**

- [ ] 老客户端忽略 `semantic` 字段不会报错
- [ ] 新客户端能从流式结果中读取 `semantic`

### P1: WAITING_INPUT 文案增强

- [ ] 复杂文档执行单返回时优先展示业务组摘要
- [ ] 复杂文档返回时增加 `previewReady / finalReady` 提示
- [ ] 恢复执行时优先解释“还缺哪几个业务组”

**验收门槛**

- [ ] 复杂文档 WAITING_INPUT 文案不再只是一串字段名
- [ ] 用户能从聊天消息中理解当前卡在哪个业务组

### P4: 组级补输入解析

- [ ] 在恢复 `waiting_input` 时支持“组级自然语言补充”
- [ ] 先识别用户补的是哪个组
- [ ] 再调用 Subagent 把组级文本转成字段字典
- [ ] 最终仍调用现有 `submitExecutionInput()`

**验收门槛**

- [ ] 用户输入“补充交付计划：第一批……”能够被转换为若干字段
- [ ] control-plane 接口无需改造也能继续接受

---

## 3.3 `control-plane` (Execution Core)

### P0: DTO 预埋

- [ ] 给 `ExecutionDto` 增加可选 `semantic`
- [ ] 给 `ExecutionStepDto` 或 `inputJson` 允许额外透传 `groupedMissing / semanticSummary`
- [ ] 给 mapper 增加安全透传逻辑

**建议涉及文件**

- `execution.dto.ts`
- `execution.mapper.ts`
- [execution.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/control-plane/src/modules/execution/execution.service.ts)

**验收门槛**

- [ ] 老执行单 DTO 不受影响
- [ ] 新字段为空时前后端行为一致

### P2: `normalizedInputJson.semantic` 落库透传

- [ ] 在创建执行单时允许把 `semantic` 写入 `normalizedInputJson`
- [ ] 在读取执行单时透传 `semantic` 到 DTO
- [ ] 在事件记录中允许带语义摘要

**验收门槛**

- [ ] 执行单详情接口中能读到 `semantic.mode`
- [ ] 能读到 `previewReady / finalReady`
- [ ] 现有执行恢复逻辑不受影响

### P2: `submitInputAndResume()` 语义刷新

- [ ] partial submit 后可刷新 `groupedMissing`
- [ ] partial submit 后可刷新 `previewReady / finalReady`
- [ ] 保持字段级提交协议不变

**建议涉及文件**

- [execution.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/control-plane/src/modules/execution/execution.service.ts)

**验收门槛**

- [ ] 部分补输入后，执行单详情里的缺失组摘要能同步变化
- [ ] 不会破坏当前 `allowedKeys` 校验和 resume 逻辑

---

## 3.4 `control-plane / mcp / debug`

### P2: 调试可见性

- [ ] 在调试读取执行单时可见 `semantic`
- [ ] 在 MCP 的 execution 详情里可见 `previewReady / groupedMissing`

**建议涉及文件**

- `mcp.service.ts`
- 调试快照查询相关模块

**验收门槛**

- [ ] 管理员或调试入口能看到 Subagent 增强结果

---

## 3.5 `portal / ExecutionDetailPage`

### P0: 兼容读取

- [ ] 新增 `semantic` 读取逻辑，但不改变旧字段表单渲染
- [ ] 新增空值保护，避免没有 `semantic` 的执行单报错

**建议涉及文件**

- [ExecutionDetailPage.tsx](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/pages/ExecutionDetailPage.tsx)

**验收门槛**

- [ ] 老执行单详情页展示不回归
- [ ] 带 `semantic` 的执行单详情页可正常打开

### P3: 分组展示增强

- [ ] 在 `waiting_input` 区块增加“复杂文档模式”卡片
- [ ] 展示 `previewReady / finalReady`
- [ ] 展示 `groupedMissing`
- [ ] 用业务组卡片替代“只看字段列表”的认知方式

**验收门槛**

- [ ] 用户进入复杂文档执行单时，首先看到的是业务组缺失，而不是几十个字段
- [ ] 简单任务仍使用现有字段表单

### P3: 兼容字段表单折叠

- [ ] 保留现有字段表单作为兜底
- [ ] 对复杂文档只默认展开当前组相关字段

**验收门槛**

- [ ] 复杂文档详情页信息密度显著下降
- [ ] 仍可在需要时查看所有字段

### P4: 组级自然语言输入 UI

- [ ] 为每个缺失组增加 `TextArea`
- [ ] 支持“补充标的清单 / 交付计划 / 付款计划”
- [ ] 提交前走组级解析，再转字段字典

**验收门槛**

- [ ] 用户可以只输入一段“第一批到货……”而不是逐字段填写

---

## 3.6 `portal / ExecutionListPage` 与通知中心

### P3: 列表摘要增强

- [ ] 对复杂文档执行单展示 `待补 2 组信息`
- [ ] 展示 `可预览` 标签
- [ ] 展示主阻塞组摘要，例如“缺少标的清单”

**建议涉及文件**

- `ExecutionListPage.tsx`
- `ExecutionNotificationCenter.tsx`
- 通知类型与展示工具类

**验收门槛**

- [ ] 列表页无需进入详情即可理解执行单卡点

---

## 3.7 `carbone-engine` 与文档侧契约对齐

### P1: canonical key 对齐

- [ ] 对齐模板变量路径标准化结果与 Subagent 语义 key
- [ ] 明确数组组 canonical key：
  - `items`
  - `deliveryItems`
  - `paymentSchedule`

**建议涉及文件**

- [ai-identifier.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/domain/carbone-engine/src/modules/studio/ai-identifier.service.ts)

**验收门槛**

- [ ] 上游 Subagent 和文档侧路径标准化结果一致

### P2: 样例骨架回流准备

- [ ] 评估将 `preview / validate` 里的数组样例骨架输出为 Subagent 先验
- [ ] 先定义接口契约，不急于深度集成

**验收门槛**

- [ ] 有一条明确的“样例骨架回流”设计路径

---

## 4. 文件级首批改造建议

如果按“最小侵入 + 最大收益”原则推进，建议第一轮优先改以下文件：

### 第一批必须动

- [planner.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.ts)
- [chat.controller.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/controllers/chat.controller.ts)
- `PlanDraftDTO` / planner interfaces 定义文件
- `ExecutionDto` / `ExecutionStepDto` 定义文件
- [ExecutionDetailPage.tsx](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/pages/ExecutionDetailPage.tsx)

### 第一批新增

- `document-task-complexity.service.ts`
- `document-semantic-subagent.service.ts`
- `document-semantic-adapter.service.ts`
- `document-field-policy.service.ts`

### 第二批再动

- [execution.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/control-plane/src/modules/execution/execution.service.ts)
- `execution.mapper.ts`
- `mcp.service.ts`
- `ExecutionListPage.tsx`
- `ExecutionNotificationCenter.tsx`

---

## 5. 验收用例建议

## 用例 A：简单任务不回归

- 输入一个参数少、非文档或单模板简单任务
- 期望：
  - 不进入 Subagent
  - `required_inputs` 与现有逻辑一致
  - 执行单与 Portal 无异常

## 用例 B：复杂采购合同任务

- 输入多数组、多条款、多 sheet 的采购合同描述
- 期望：
  - 命中 `complex_document`
  - `required_inputs` 中不出现模板循环标记
  - 缺失项按业务组收敛

## 用例 C：部分补输入后可预览

- 首轮仅补合同主体 + 1 条标的清单
- 期望：
  - `previewReady=true`
  - `finalReady=false`
  - 仍缺付款计划等非阻塞组

## 用例 D：聊天恢复复杂文档执行单

- 已存在 `waiting_input` 执行单
- 用户输入“补充第一批交付计划……”
- 期望：
  - 系统优先识别业务组
  - 最终仍走现有字段级提交协议

## 用例 E：Portal 复杂文档详情页

- 打开带 `semantic.groupedMissing` 的执行单
- 期望：
  - 先看到业务组卡片
  - 仍保留旧字段兜底表单

---

## 6. 首轮排期建议

### Sprint 1

- P0 契约预埋
- Planner 复杂度分流
- Subagent adapter 接入
- 去除模板噪音字段

### Sprint 2

- `semantic` 落库透传
- Portal 执行详情分组展示
- 聊天 WAITING_INPUT 摘要增强

### Sprint 3

- partial submit 后语义刷新
- 列表/通知增强
- 预览就绪联动

### Sprint 4

- 组级自然语言补充
- 样例骨架回流
- 更细的策略灰度

---

## 7. 一句话总结

> 这次改造的第一优先级不是“重做执行链路”，而是“先把复杂文档任务进入执行链路前的数据质量做好”，因此任务拆解必须以 `Planner 增强 -> DTO 透传 -> Portal 展示升级` 为主线，控制面保持稳定、渐进演进。

