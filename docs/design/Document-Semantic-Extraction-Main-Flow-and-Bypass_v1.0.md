# 文档参数语义提取主流程与旁路设计说明

**版本：** v1.0  
**日期：** 2026-05-13  
**状态：** 设计中

> 本文聚焦“主流程先梳理清楚，旁路保持灵活”的目标。它不展开实现细节，而是先定义复杂文档任务接入语义提取 Subagent 后，哪些是必须稳定的主干流程，哪些是可灰度、可关闭、可回退的增强旁路。

---

## 1. 本文要解决的问题

在引入复杂文档任务语义提取 Subagent 时，最容易犯的错误不是“能力不够”，而是：

- 把旁路增强做成了新的主流程；
- 让控制平面承担了文档理解职责；
- 让复杂文档逻辑渗透到所有简单任务；
- 让 `waiting_input`、执行恢复、渲染链路被迫一起重写。

因此，第一原则不是先做“最强能力”，而是先把以下边界钉死：

- 什么是主流程；
- 什么是旁路；
- 旁路最早在哪插入；
- 旁路最晚在哪退出；
- 旁路失败时回哪条路径；
- 哪些主链路节点绝不能被替代。

---

## 2. 核心结论

### 2.1 主流程必须保持稳定

复杂文档任务即使引入 Subagent，真正的主流程仍然应该是：

```text
用户输入
-> 技能匹配
-> 计划生成
-> 创建执行单
-> waiting_input / queued / running
-> 执行结果产出
-> Portal / Chat 展示
```

其中必须保持稳定的，不是“参数识别实现方式”，而是：

- 执行单作为事实源；
- `control-plane` 作为状态机；
- `waiting_input` 作为补输入主状态；
- `queued / running / succeeded / failed` 的推进语义；
- Portal 与 Chat 都围绕执行单事实展示。

### 2.2 语义提取是旁路增强，不是第二主流程

Subagent 的角色应当被严格限定为：

- 在 `Planner` 阶段提升参数质量；
- 在 `waiting_input` 恢复阶段提升“补输入解释能力”；
- 在 Portal / Chat 展示时提供更合理的分组与摘要。

它**不能**直接替代：

- 执行单状态流转；
- 执行恢复接口；
- 渲染链路；
- 审批、接管、取消等控制能力。

### 2.3 最佳接入点只有一个

旁路增强的最佳主接入点应固定为：

- `skill match` 之后；
- `buildRequiredInputs()` 之前。

也就是：

- **先知道任务大概是什么**
- **再决定是否需要语义增强**
- **最后把结果适配回现有 `required_inputs` / `planDraft` 协议**

这保证了：

- 简单任务完全不受影响；
- 复杂任务能获得增强；
- 执行单创建前就能把噪音字段清掉；
- control-plane 不需要知道 Subagent 的内部逻辑。

---

## 3. 设计总原则

## 3.1 主干稳定原则

下列节点定义为主干节点，不应被旁路替代：

1. `PlannerService.generatePlan()`
2. 执行单创建
3. `Execution.status` 状态机推进
4. `ExecutionService.submitInputAndResume()`
5. 文档执行 / 渲染
6. 执行结果归档与展示

旁路只能增强这些节点的输入质量和展示质量，不能替代它们的职责。

## 3.2 旁路单向插入原则

旁路必须遵循：

- 从主流程进入；
- 处理后回到主流程；
- 不能自成闭环。

正确结构：

```text
主流程 -> 进入旁路增强 -> 返回主流程
```

错误结构：

```text
主流程 -> 进入旁路 -> 旁路自己创建执行单 / 自己决定完成态
```

## 3.3 先主流程后增强原则

应优先保证：

- 主流程定义清楚；
- DTO 承载边界清楚；
- 回退路径清楚；

然后再去增强：

- 分组提取；
- 预览就绪判定；
- 组级自然语言补充；
- 数组样例骨架回流。

## 3.4 增强可关停原则

每个旁路能力都必须允许独立关闭，例如：

- 复杂度分流关闭；
- Subagent 关闭；
- 分组 waiting_input 关闭；
- preview-ready 关闭；
- 组级补输入关闭。

关闭后系统仍应回到当前可用主流程。

---

## 4. 稳定主流程定义

## 4.1 统一主流程

无论简单任务还是复杂任务，统一主流程都应是：

```text
Step 1. 接收用户输入
Step 2. Planner 识别任务与参数
Step 3. 产出 PlanDraftDTO
Step 4. 根据计划创建执行单
Step 5. 如果缺关键输入，进入 waiting_input
Step 6. 如果输入已足够，进入 queued / running
Step 7. 调用执行 / 渲染链路
Step 8. 产出结果
Step 9. Chat 与 Portal 展示执行状态和结果
```

这个主流程对简单任务和复杂任务都成立。

### 简单任务与复杂任务的区别

区别不在主流程节点，而在 `Step 2` 的内部实现：

- 简单任务：直接使用现有轻量参数识别；
- 复杂任务：在 Planner 内部插入语义提取旁路。

因此，主流程本身是统一的，复杂性只发生在 Planner 内部。

---

## 5. 简单任务主流程

## 5.1 时序

```text
User
-> Chat Controller
-> Planner.generatePlan()
-> recognizeParams()
-> buildRequiredInputs()
-> PlanDraftDTO
-> CreateExecution
-> waiting_input or queued/running
-> Execution Result
```

## 5.2 关键特点

- 无需 Subagent；
- `required_inputs` 基本按字段处理即可；
- Portal 展示旧字段表单即可；
- 恢复补输入继续按字段级提交。

## 5.3 对复杂文档方案的约束

复杂文档增强设计不能影响简单任务的：

- 延迟；
- 协议；
- 状态机；
- 前端展示兼容性。

如果复杂文档能力引入后让简单任务变慢、变重、变复杂，就说明方向错了。

---

## 6. 复杂文档主流程

## 6.1 正确的复杂文档主流程

复杂文档任务的正确主流程应是：

```text
User
-> Chat Controller
-> Planner.generatePlan()
   -> matchSkill
   -> detectComplexDocument
   -> runSemanticSubagent (旁路)
   -> adaptToRequiredInputs / semantic
   -> buildPlanDraft
-> CreateExecution
-> waiting_input / queued / running
-> Execution / Render
-> Result
```

### 关键判断

这里要强调：

- `runSemanticSubagent` 是 `Planner` 内的一个旁路步骤；
- 不是独立于 Planner 的第二计划系统；
- 不是新的执行前置服务；
- 更不是独立的执行编排器。

## 6.2 复杂文档主流程中的稳定主线

对于复杂文档，也必须保证：

1. 最终仍回到 `PlanDraftDTO`
2. 最终仍创建同一类 `Execution`
3. 最终仍使用 `waiting_input` 主状态
4. 最终仍用 `submitInputAndResume()` 恢复
5. 最终仍由原执行引擎调用渲染 / 执行能力

### 不能做的事

不能让复杂文档任务：

- 绕过执行单直接预览；
- 在语义旁路里自己维护“待补输入状态”；
- 在前端自己拼临时任务状态而不写回执行单；
- 在 Portal 和 Chat 使用两套事实源。

---

## 7. 旁路插入点与退出点

## 7.1 插入点

唯一推荐插入点：

```text
skill match 完成之后
buildRequiredInputs 之前
```

原因：

- 已经知道大致技能类型；
- 已经具备技能 schema、模板特征、上下文；
- 但还没把错误缺失项固化到执行单。

## 7.2 退出点

旁路的最佳退出点应是：

- 输出 `semantic`
- 输出更干净的 `required_inputs`
- 输出 `previewReady / finalReady`
- 然后回到正常 `PlanDraftDTO` 构建

也就是说，旁路结束后主流程只看到：

- 标准 `PlanDraftDTO`
- 标准 `required_inputs`
- 可选 `semantic` 摘要

而不需要知道 Subagent 内部怎么推理。

## 7.3 为什么退出点不能更晚

如果把旁路退出点放到：

- control-plane 之后；
- Portal 之前；
- 渲染之前；

就会出现问题：

- 噪音字段已经写进执行单；
- waiting_input 已经被错误定义；
- 需要更多补丁式修复；
- 复杂文档逻辑渗透到更多系统。

因此，最晚退出点也必须在 `PlanDraftDTO` 形成之前。

---

## 8. 旁路失败与回退路径

## 8.1 必须存在的回退路径

旁路不是强依赖，必须支持以下回退：

1. **复杂度判定未命中**
   - 直接走旧 `recognizeParams()` 路径
2. **Subagent 调用失败**
   - 回退到旧路径
3. **Subagent 返回低置信度**
   - 回退到旧路径
4. **Subagent 输出结构不合法**
   - 回退到旧路径
5. **Portal 不识别 `semantic`**
   - 回退到旧字段表单

## 8.2 回退后的系统行为

回退后必须满足：

- 仍能创建执行单；
- 仍能进入 waiting_input；
- 仍能恢复执行；
- 不因为 Subagent 失败导致任务不可执行。

## 8.3 回退优先级

建议优先回退顺序：

```text
semantic complex path
-> simple recognize path
-> field-level waiting_input
-> existing execution resume
```

换句话说：

- 最终兜底一定是当前线上已验证可运行的那套机制。

---

## 9. 复杂文档等待输入主流程

## 9.1 主流程目标

复杂文档进入 `waiting_input` 后，仍然应遵循同一条恢复主线：

```text
Execution in waiting_input
-> 用户补充输入
-> 系统解释输入
-> submitInputAndResume()
-> 更新 normalizedInput / requiredInputs
-> 继续 waiting_input 或进入 queued/running
```

这里唯一允许变化的是“系统解释输入”的能力。

## 9.2 正确的增强方式

正确方式：

```text
用户补充一段自然语言
-> Chat / Portal 调用语义解释旁路
-> 旁路产出字段字典
-> 继续走 submitInputAndResume()
```

错误方式：

```text
用户补充一段自然语言
-> 旁路自己维护补输入状态
-> 旁路自己决定任务是否可执行
```

### 原因

`submitInputAndResume()` 必须继续是：

- 唯一合法的恢复入口；
- 唯一更新执行单输入事实的位置；
- 唯一推进 waiting_input -> queued/running 的控制点。

---

## 10. Portal 与 Chat 的职责边界

## 10.1 Chat 的职责

Chat 适合做：

- 返回业务组摘要；
- 用自然语言提示当前还缺什么；
- 接受一段业务补充文本；
- 把这段文本送去语义解释旁路。

Chat 不适合做：

- 自己维护任务真实状态；
- 绕过执行单直接判断“完成”；
- 绕过 control-plane 推进流程。

## 10.2 Portal 的职责

Portal 适合做：

- 展示 `groupedMissing`
- 展示 `previewReady / finalReady`
- 允许字段级或组级补输入
- 展示执行状态和执行结果

Portal 不适合做：

- 自己拼临时 missing 规则；
- 以页面本地状态替代 `ExecutionDto.semantic`
- 在本地做最终 readiness 判定并绕过服务端。

---

## 11. 推荐的四条标准时序

## 11.1 时序 A：简单任务

```text
User
-> Chat
-> Planner
-> recognizeParams
-> buildRequiredInputs
-> PlanDraft
-> Execution
-> Result
```

说明：

- 不进入语义旁路；
- 主流程全程保持原样。

## 11.2 时序 B：复杂文档首次进入

```text
User
-> Chat
-> Planner
-> matchSkill
-> detectComplexDocument
-> semanticSubagent (旁路)
-> semanticAdapter
-> PlanDraft(required_inputs + semantic)
-> Execution
-> waiting_input
```

说明：

- 旁路只发生在 Planner 内部；
- 执行单仍是主线；
- `waiting_input` 仍是主状态。

## 11.3 时序 C：复杂文档补输入恢复

```text
User补充自然语言
-> Chat / Portal
-> semantic interpret bypass
-> 字段字典
-> submitInputAndResume
-> Execution更新
-> waiting_input 或 queued/running
```

说明：

- 旁路只负责解释用户补充；
- 控制平面仍负责真正恢复。

## 11.4 时序 D：旁路失败回退

```text
Planner
-> detectComplexDocument
-> semanticSubagent failed
-> fallback to recognizeParams
-> buildRequiredInputs
-> PlanDraft
-> Execution
```

说明：

- 任何时候都必须能回到旧路径；
- 不能因为旁路失败阻塞主流程。

---

## 12. 主流程正确性的判定标准

如果要判断“大方向是否正确”，建议用以下标准：

## 12.1 对简单任务

- 简单任务不需要理解 `semantic` 也能正常运行；
- 简单任务响应耗时不应因为复杂文档增强显著上升；
- 简单任务 Portal 页面不需要新心智负担。

## 12.2 对复杂文档

- 复杂文档最终仍回到统一执行单主线；
- 复杂文档不会产生第二套状态机；
- 复杂文档不会产生第二套事实源；
- 复杂文档增强失败时仍可运行旧流程。

## 12.3 对系统整体

- Planner 变聪明，但 control-plane 不变脆弱；
- Portal 变易用，但不脱离服务端事实；
- Chat 变自然，但不拥有执行控制权。

---

## 13. 最应该先冻结的边界

如果只先冻结 5 个关键边界，建议先冻结这些：

1. **旁路唯一主接入点**
   - `skill match` 后，`buildRequiredInputs` 前
2. **旁路唯一主退出点**
   - 回到 `PlanDraftDTO`
3. **执行恢复唯一合法入口**
   - `submitInputAndResume()`
4. **执行状态唯一事实源**
   - `Execution` / `ExecutionStep`
5. **前端展示唯一服务端事实来源**
   - `ExecutionDto` / `ExecutionStepDto`

只要这 5 个边界不破，大方向就不会错。

---

## 14. 最终建议

对你现在这条线，最稳的方向不是“尽快把旁路做强”，而是：

1. 先冻结主流程
2. 再限定旁路只做增强
3. 再保证旁路随时可回退
4. 最后再逐步开放：
   - grouped missing
   - preview ready
   - 组级自然语言补充
   - 数组样例骨架回流

因此，这套设计的正确姿势可以浓缩成一句话：

> **主流程始终只有一条，旁路只在 Planner 和补输入解释阶段短暂插入，并且必须无条件回到执行单主线。**

