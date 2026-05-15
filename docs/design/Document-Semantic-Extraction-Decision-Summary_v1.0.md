# 文档参数语义提取方案架构决策摘要

**版本：** v1.0  
**日期：** 2026-05-13  
**状态：** 待评审

> 本文是一页式架构决策摘要，用于快速评审复杂文档任务引入语义提取 Subagent 的大方向是否正确。它不展开所有实现细节，只冻结主流程、旁路边界、第一阶段范围和明确不做的事项。

---

## 1. 结论

本方案采用：

- **单一主流程**
- **Planner 内部复杂任务旁路增强**
- **Execution / control-plane 继续作为唯一执行主线与事实源**

换句话说：

- 主流程不改成两套；
- 语义 Subagent 不是新的执行编排器；
- 它只是复杂文档任务在 Planner 阶段和补输入解释阶段的增强侧车。

---

## 2. 冻结的主流程

复杂文档和简单任务统一使用同一条主流程：

```text
用户输入
-> Planner
-> PlanDraftDTO
-> 创建执行单
-> waiting_input / queued / running
-> 执行 / 渲染
-> 结果产出
-> Chat / Portal 展示
```

这条主流程是本次方案的稳定主干，不随是否启用 Subagent 改变。

---

## 3. 冻结的边界

本方案先冻结以下 5 个边界：

1. **旁路唯一主接入点**
   - `skill match` 之后、`buildRequiredInputs()` 之前
2. **旁路唯一主退出点**
   - 回到 `PlanDraftDTO`
3. **执行恢复唯一合法入口**
   - `submitInputAndResume()`
4. **执行状态唯一事实源**
   - `Execution` / `ExecutionStep`
5. **前端展示唯一服务端事实来源**
   - `ExecutionDto` / `ExecutionStepDto`

只要这 5 个边界不破，大方向就是对的。

---

## 4. 旁路的正确定位

语义提取 Subagent 只允许做 3 类增强：

1. **Planner 阶段参数质量增强**
   - 清洗模板噪音字段
   - 收敛数组组
   - 产出更合理的 `required_inputs`
2. **补输入解释增强**
   - 把用户的一段自然语言补充解释成字段字典
   - 最终仍回到 `submitInputAndResume()`
3. **展示增强**
   - 提供 `groupedMissing`
   - 提供 `previewReady / finalReady`
   - 提供更合理的业务组摘要

---

## 5. 明确不做的事

第一阶段明确不做以下事项：

- 不新增第二套执行状态机
- 不让 Subagent 自己创建执行单
- 不让 Portal / Chat 拥有自己的任务事实源
- 不让复杂文档绕过 `waiting_input`
- 不让 control-plane 承担文档理解职责
- 不把组级自然语言补充直接设计成新的 control-plane 协议
- 不先重写 Portal 整个补输入页面

这些都属于“看起来强，但会把主流程做乱”的方向。

---

## 6. 第一阶段只做什么

第一阶段只做最小且最值钱的增强：

1. **Planner 增加复杂度分流**
   - 简单任务继续走旧路径
   - 复杂文档任务进入语义旁路
2. **Planner 结果适配**
   - 去掉模板循环标记
   - 去掉明显技术噪音字段
   - 输出更干净的 `required_inputs`
3. **契约预埋**
   - `PlanDraftDTO.semantic`
   - `ExecutionDto.semantic`
   - `normalizedInputJson.semantic`
4. **Portal 只读展示增强**
   - 展示 `groupedMissing`
   - 展示 `previewReady / finalReady`

第一阶段的目标不是“把交互全部做完”，而是：

- 先减少错误 waiting_input
- 先把复杂文档任务的缺失项表达正确

---

## 7. 第一阶段暂不落地的增强

这些能力是后续阶段增强，不进入第一阶段：

- 组级自然语言补充
- partial submit 后语义刷新
- 列表页与通知中心增强
- 预览就绪联动
- 数组样例骨架回流
- 更复杂的文档专用理解接口

原因不是它们不重要，而是：

- 先把主流程和承载契约稳定下来更重要。

---

## 8. 简单任务与复杂任务的分工

### 简单任务

- 不进 Subagent
- 继续走现有 `recognizeParams()`
- 继续走字段级 `required_inputs`
- 继续使用现有 Portal 字段表单

### 复杂文档任务

- 在 Planner 内部命中复杂度分流
- 进入语义旁路
- 输出 `semantic`
- 最终仍返回统一 `PlanDraftDTO`
- 最终仍创建统一执行单

因此：

- 差异只发生在 Planner 内部；
- 主流程本身是统一的。

---

## 9. 回退策略

任何时候都必须能回退到现有线上机制：

```text
complex semantic path
-> fallback to recognizeParams
-> field-level required_inputs
-> existing waiting_input
-> existing submitInputAndResume
```

必须支持的回退场景：

- 复杂度判定未命中
- Subagent 超时
- Subagent 失败
- Subagent 低置信度
- Subagent 返回非法结构
- Portal 尚未消费 `semantic`

结论：

- 旁路是增强，不是依赖。

---

## 10. 第一阶段验收标准

只要满足以下 6 条，就说明第一阶段方向正确：

1. 简单任务无回归
2. 复杂文档任务仍沿统一执行单主线运行
3. `required_inputs` 中不再出现模板循环标记
4. 复杂文档缺失项更接近业务组和业务字段
5. 执行详情可展示 `groupedMissing / previewReady`
6. 旁路关闭后系统回到当前主流程

---

## 11. 推荐推进顺序

推荐按以下顺序推进：

1. 先冻结主流程边界
2. 再冻结 `semantic` 契约
3. 再在 Planner 接入复杂度分流与语义旁路
4. 再做 `ExecutionDto` 和 `normalizedInputJson` 透传
5. 最后才升级 Portal 展示和交互

不要倒过来从前端交互先做起。

---

## 12. 一句话决策

> **复杂文档语义提取必须被设计成主流程中的可回退增强旁路，而不是新的主流程；执行单与 control-plane 继续是唯一主线，第一阶段只增强 Planner 输出质量与执行详情展示，不重写状态机、不重写补输入协议。**

