# 文档参数主链路改造任务拆解 v1.0

**版本：** v1.0  
**日期：** 2026-05-29  
**状态：** 执行清单  
**依赖文档：**

- `Document-Parameter-Architecture-and-Refactor-Plan_v1.0.md`

---

## 1. 目标

本清单用于把统一架构方案拆成可执行研发任务，直接对应当前仓库模块与文件。

目标不是重新设计一套新链路，而是围绕现有主链路继续收敛：

```text
skill.paramsSchema
-> planner / recognizer
-> execution.normalizedInputJson
-> waiting_input resume
-> runtime/render
```

本清单默认不包含：

- Office Add-in 改造；
- Portal 前端大规模重做；
- Carbone 引擎内部重写；
- 历史 execution 数据迁移。

---

## 2. 当前任务总览

建议按以下优先级推进：

### P0：先固定主事实源

1. `control-plane` 强化 `paramResolution` 权威地位  
2. `runtime` 固定只消费 `normalizedInputJson.input`

### P1：再切策略真源

3. `planner` 从 `skill.paramsSchema` 迁出业务策略读取  
4. `workflowDsl.inputPolicy.params` 接入主链路

### P2：最后统一交互与映射

5. `waiting_input` 展示与恢复逻辑完全依赖 execution 快照  
6. `templateBinding / renderPath` 映射层显式化  
7. 修复主链路空文档问题并补齐可观测性  
8. 补齐回归测试与运行手册

### 当前新增判断

现阶段需要把“生成成功但文档内容为空”视为主链路 P0/P2 之间的阻断问题，而不是普通渲染显示问题。

已确认的直接原因是：

- Word Add-in 的 `previewWithSkill` 直接把样例数据规范化后交给渲染器；
- 主链路则要求 `paramResolution` 中的字段同时满足 `final === true` 与 `templateBinding/renderPath` 存在，才进入 runtime payload；
- 一旦上游未补齐这两个条件，最终发给渲染器的 `data` 会接近空对象。

因此后续任务拆解中，runtime 映射显式化不仅是结构优化项，也是当前线上故障修复项。

---

## 3. 模块拆解

## 3.1 T1：Skill Schema 收缩为 L1 定义层

### 目标

- `skill.paramsSchema` 只承载基础字段定义，不继续作为模板级业务策略真源。

### 主要文件

- `apps/backend/core/platform/src/modules/skill/interfaces.ts`
- `apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.ts`
- `apps/backend/core/ai-orchestrator/src/modules/recognizer/recognizer.service.ts`

### 当前问题

- `ParamsSchema` 仍包含 `default`、`previewBlocking`、`confirmationThreshold`；
- `planner` 直接读取这些字段做业务判断；
- `required` 既被当作识别提示，又被当作执行阻塞依据。

### 改造动作

1. 将 `ParamsSchema` 区分为“长期保留字段”和“过渡兼容字段”
2. 为 `default / previewBlocking / confirmationThreshold / 模板级 required` 添加注释，标记为过渡字段
3. 停止在新增代码中继续把模板策略写回 `skill.paramsSchema`
4. 让 `recognizer` 继续只消费字段定义，不关心业务策略

### 验收点

1. 新增 skill schema 不再以 L1 承载模板级策略
2. `recognizer` 输入仍只围绕基础字段定义
3. `planner` 后续可以切走对 schema 策略字段的强依赖

---

## 3.2 T2：Workflow Policy 成为 L2 真源

### 目标

- 让 `workflowDsl.inputPolicy.params` 成为模板级参数策略的唯一主入口。

### 主要文件

- `apps/backend/core/platform/src/modules/execution-flow/interfaces.ts`
- `apps/backend/core/platform/src/modules/execution-flow/execution-flow-template.service.ts`
- `apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow.service.ts`
- `apps/backend/core/platform/test/execution-flow-template.test.ts`
- `apps/backend/core/platform/test/temporal-workflow.test.ts`

### 当前问题

- 平台层已有 `WorkflowInputPolicy`，但主执行链路基本未消费；
- 默认 policy 仍从旧 `paramsSchema.required/default` 推导；
- workflow policy 还没有进入 execution create / planner 判缺主路径。

### 改造动作

1. 固定 `workflowDsl.inputPolicy.params` 作为模板策略正式承载位置
2. 明确 `requiredMode`、`defaultValueResolver`、`valueSourcePriority`、`templateBinding` 的契约
3. 保留从旧 `paramsSchema` 自动生成 policy 的兼容逻辑，但只作为迁移期行为
4. 为 policy key 非法、默认值非法、策略字段非法补齐校验
5. 对外返回“L1 字段定义 + L2 当前策略”组合视图，便于后续前端编辑

### 验收点

1. workflow/template 可以单独表达参数策略层
2. 非注册参数名会被拦截
3. 发布后的模板数据可稳定包含 `inputPolicy.params`

---

## 3.3 T3：Planner 收缩为“识别 + 候选值 + 初步判缺”

### 目标

- planner 保留主链路入口职责，但不再直接以 `skill.paramsSchema` 承担全部业务判定。

### 主要文件

- `apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.ts`
- `apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.spec.ts`

### 当前问题

- `buildRequiredInputs()` 直接读取 schema 上的 `required/default/previewBlocking/confirmationThreshold`
- 默认值注入和阻塞判定仍偏向 L1 驱动
- `required_inputs` 与理想中的 `paramResolution + policy 投影` 还不是同一层语义

### 改造动作

1. 为 planner 引入 workflow policy 读取入口
2. 将字段判缺逻辑逐步改为：
   - L1 提供字段定义
   - L2 提供 `requiredMode / defaultValue / confirmationThreshold / previewBlocking`
3. 将 `required_inputs` 的生成逻辑改为面向 execution 事实模型
4. 保持 recognizer schema 仍只来自 `skill.paramsSchema`
5. 为 `waiting_input_resume` 继续保留仅识别缺失字段的缩 schema 逻辑

### 验收点

1. planner 对同一 skill 在不同 workflow 下可以读取不同策略
2. planner 不再把 workflow 当第二份字段 schema 合并
3. `required_inputs` 与后续 execution 快照语义可对齐

---

## 3.4 T4：Control-Plane 固化 `paramResolution` 权威关系

### 目标

- `control-plane` 成为 execution 参数解析事实的唯一维护者。

### 主要文件

- `apps/backend/core/control-plane/src/modules/execution/execution.service.ts`
- `apps/backend/core/control-plane/src/modules/execution/execution.mapper.ts`
- `apps/backend/core/control-plane/test/execution.service.test.ts`
- `apps/backend/core/control-plane/test/execution.mapper.test.ts`

### 当前问题

- 当前 `paramResolution` 已存在，但字段语义还不完整；
- `source` 还未系统区分 `recognized / workflow_default / external`
- `requiredMode`、`final`、来源优先级等执行事实未完全进入快照

### 改造动作

1. 扩展 `paramResolution` 契约
2. 固定其至少包含：
   - `value`
   - `source`
   - `requiredMode`
   - `missing`
   - `needsConfirmation`
   - `confirmed`
   - `final`
3. 统一由 `paramResolution` 派生：
   - `input`
   - `requiredInputs`
   - `semantic`
4. 将 execution create / submit / resume 都改为更新同一份 `paramResolution`
5. 减少散落在局部逻辑里的手工状态修补

### 验收点

1. execution create、submit、resume 三条链路都由同一套模型解释
2. `requiredInputs` 不再是独立维护的长期事实源
3. `input` 只包含可安全进入 runtime 的确定态值

---

## 3.5 T5：waiting_input 恢复链路完全依赖 execution 快照

### 目标

- 自然语言补参与恢复执行只建立在 execution 快照之上。

### 主要文件

- `apps/backend/core/ai-orchestrator/src/controllers/chat.controller.ts`
- `apps/backend/core/ai-orchestrator/src/controllers/chat.controller.spec.ts`
- `apps/backend/core/control-plane/src/modules/execution/execution.service.ts`

### 当前问题

- 主恢复链路已经基本可用，但仍需进一步对齐 execution 正式契约；
- 缺值、候选确认、数组组补全的交互语义仍可继续细化；
- 部分调试信息仍偏向当前实现，不够制度化。

### 改造动作

1. 展示缺失字段统一读取 `normalizedInputJson.requiredInputs`
2. 恢复执行只依赖 `executionId + normalizedInputJson`
3. 明确 `waiting_input` 中三类状态：
   - 缺值补录
   - 候选确认
   - 部分数组组补全
4. 保持当前 JSON / recognizer / planner fallback 优先级
5. 补齐“恢复执行不重新匹配 skill”的断言测试

### 验收点

1. waiting_input 恢复不重新匹配 skill
2. 用户补参后 execution 快照会完整重算
3. 前端/聊天层只消费 execution 投影视图

---

## 3.6 T6：Runtime 收缩为最终输入消费者

### 目标

- runtime 只消费 execution 已确认输入，不重复做业务参数判断。

### 主要文件

- `apps/backend/core/control-plane/src/modules/execution/runtime-step-request.factory.ts`
- `apps/backend/core/control-plane/src/modules/execution/runtime-result.interpreter.ts`
- `apps/backend/core/control-plane/test/runtime-step-request.factory.test.ts`
- 文档 runtime / activity 相关实现文件

### 当前问题

- runtime request 已读取 `normalizedInputJson.input`
- 但 `templateBinding / renderPath` 还没成为统一映射层
- runtime 侧“只做系统级必填校验”的边界还需要继续明确
- 当 `paramResolution` 缺少 `final` 或 binding path 时，字段会被静默过滤，最终可能生成空文档
- 预览链路与主链路的数据装配方式不一致，容易掩盖主链路契约缺口

### 改造动作

1. 固定 runtime request 只从 `normalizedInputJson.input` 取值
2. 建立 dot-path 到 runtime payload 的统一装配工具
3. 明确：
   - `renderPath` 是默认锚点
   - `templateBinding` 是 workflow 当前绑定覆盖
4. 显式定义字段进入 runtime 的最低条件：
   - `final === true`
   - 存在 `templateBinding` 或 `renderPath`
5. 为被过滤字段输出可定位的诊断信息，避免静默生成空文档
6. runtime 返回 `waiting_input` 时，仅返回系统新增缺项
7. 清理 runtime 侧业务级 required 反推逻辑

### 验收点

1. runtime 测试可证明其只消费 `input`
2. runtime 不再依赖 skill schema 做业务判缺
3. execution 输入可稳定映射成文档 payload
4. 缺少 `final` 或 binding path 时，测试能明确暴露原因
5. 不再出现“执行成功但 payload 为空且无诊断”的情况

### 对比基线

本任务的实现与验收，必须参考以下差异：

- Word Add-in `previewWithSkill`：样例数据直接渲染，偏“宽松透传”
- 主链路 runtime：execution 参数经 `paramResolution -> binding path -> data payload` 装配，偏“严格收口”

结论是：

- 预览链路可作为模板效果参考；
- 但主链路故障排查必须以 runtime payload 装配逻辑为准；
- 不能因为预览正常，就默认主链路绑定契约已经完整。

---

## 3.7 T7：Legacy 与旁路继续收口

### 目标

- 文档任务继续围绕统一主链路收敛，减少旁路回退。

### 主要文件

- `apps/backend/core/ai-orchestrator/src/controllers/chat.controller.ts`
- `apps/backend/core/ai-orchestrator/src/modules/react-engine/prompt-builder.ts`
- `apps/backend/domain/carbone-engine/src/modules/studio/studio.controller.ts`

### 当前问题

- `generate-parameters` 已下线；
- 但异常路径仍可能回退到 ReAct 直跑；
- 主链路和 fallback 的治理边界还可以进一步收紧。

### 改造动作

1. 尽量减少 create execution 失败后直接退回 ReAct 的范围
2. 为文档任务增加更明确的 main-flow 保护
3. 补充“主链路可用时不应走 legacy/旁路”的测试

### 验收点

1. 文档任务默认只走统一主链路
2. fallback 只在显式允许的异常路径触发
3. 自动化测试能保护这一点

---

## 3.8 T8：测试基线补齐

### 目标

- 为新的参数分层模型建立稳定回归网。

### 主要文件

- `apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.spec.ts`
- `apps/backend/core/ai-orchestrator/src/modules/recognizer/recognizer.service.spec.ts`
- `apps/backend/core/ai-orchestrator/src/controllers/chat.controller.spec.ts`
- `apps/backend/core/control-plane/test/execution.service.test.ts`
- `apps/backend/core/control-plane/test/runtime-step-request.factory.test.ts`
- `apps/backend/core/platform/test/execution-flow-template.test.ts`
- `apps/backend/core/platform/test/temporal-workflow.test.ts`

### 最小测试集

1. L1 字段定义与 L2 策略分离测试
2. execution create 生成 `paramResolution` 一致性测试
3. workflow 默认值待确认不进入最终 `input` 测试
4. 用户确认后清除 `needsConfirmation` 测试
5. waiting_input resume 不重新匹配 skill 测试
6. runtime 只读取 `normalizedInputJson.input` 测试
7. workflow policy key 非法时报错测试
8. 主链路可用时不进入 legacy 旁路测试

---

## 4. 推荐执行顺序

建议按以下顺序推进：

1. T4 `control-plane` 先收敛 `paramResolution`
2. T2 固定 workflow policy 类型与存储契约
3. T3 planner 接入 workflow policy
4. T6 runtime 输入消费与 binding 映射收缩
5. 优先补一轮“空文档”诊断与回归测试
6. T5 waiting_input 交互完全对齐 execution 快照
7. T7 legacy / fallback 收口
8. T8 测试补齐与 runbook 更新
9. T1 最后彻底收缩 skill schema 中的策略字段

原因：

- 先固定 execution 事实层，后续 planner 和 runtime 才有稳定收口点；
- 先让 workflow policy 可消费，再迁出 skill schema 上的策略字段；
- 最后再做完全清理，风险最低。

---

## 5. 里程碑建议

## Milestone A：事实层稳定

完成标准：

- `paramResolution` 正式成为 execution 权威事实表；
- `input / requiredInputs / semantic` 可由其解释。

## Milestone B：策略层接管

完成标准：

- planner / control-plane 的业务判定主要读取 workflow policy；
- `skill.paramsSchema` 不再承担模板级判缺规则。

## Milestone C：runtime 收缩完成

完成标准：

- runtime 只消费 execution 最终输入；
- payload 映射层稳定；
- runtime 不再反推业务缺参。

## Milestone D：交互和回归闭环

完成标准：

- waiting_input 恢复、渲染、继续执行全部基于 execution 快照；
- 自动化测试覆盖最小可信回归网。

---

## 6. 最终输出标准

当以下结果全部出现时，可以认为本轮改造已完成：

1. `Skill 定义字段`
2. `Workflow 定义策略`
3. `Execution 冻结结果`
4. `Runtime 消费输入`

具体到代码层面，要求是：

1. `skill.paramsSchema` 仅承担 L1 主职责
2. `workflowDsl.inputPolicy.params` 成为 L2 真源
3. `execution.normalizedInputJson.paramResolution` 成为 L3 真源
4. runtime 只消费 `execution.normalizedInputJson.input`
5. runtime payload 的空结果能够区分是“模板确实无数据”还是“字段在装配阶段被过滤”

这应作为后续文档参数体系开发任务的执行清单。
