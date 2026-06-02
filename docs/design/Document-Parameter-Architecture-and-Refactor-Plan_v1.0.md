# 文档参数架构与主链路改造方案 v1.0

**版本：** v1.0  
**日期：** 2026-05-29  
**状态：** 建议方案  
**替代文档：**

- `Document-Parameter-Recognition-and-Template-Execution-Best-Practice_v1.0.md`
- `Document-Parameter-Recognition-and-Template-Execution-Implementation-Plan_v1.0.md`
- `Document-Parameter-Layering-Scheme_v1.0.md`

---

## 1. 目标

将当前“文档参数识别、补参、执行、渲染”的设计收敛为一份统一文档，明确：

1. 文档任务的唯一主链路是什么；
2. 参数定义、参数策略、执行快照、runtime 输入分别属于哪一层；
3. 当前仓库实现已经完成了什么、还缺什么；
4. 后续改造应优先修改哪些模块、按什么顺序推进。

补充原则：

- 模板型 workflow 的完整 `workflowDsl/activityDsl` 应由后端根据模板资产编译生成；
- 前端只提交模板编辑结果、少量展示配置与动态 `input policy` 覆盖；
- 前端不应成为 `renderPath/templateBinding` 或整份 DSL 的事实源。

本方案面向当前仓库中的文档生成主流程，不包含：

- Office Add-in 工作流重构；
- Portal 前端重做；
- Carbone 引擎内部能力重写；
- 预览链路的独立设计。

---

## 2. 当前结论

## 2.1 唯一主链路

文档任务的主链路应固定为：

```text
用户输入
-> skill match
-> 读取 skill.paramsSchema
-> recognizer 提取扁平字段
-> planner 输出 required_inputs / semantic / execution_snapshot
-> create execution
-> waiting_input 或 queued
-> submitInputAndResume 更新 execution.normalizedInputJson
-> runtime/render 消费 normalizedInputJson.input
-> 输出文档结果
```

## 2.2 当前实现状态

当前实现已经接近上述主链路，但尚未完全达到理想分层。

可以明确归纳为：

- L1 基础字段定义层已经存在，并以 `skill.paramsSchema` 为主；
- L2 workflow 参数策略层在平台侧已经有类型与持久化能力；
- L3 execution 参数解析层已经形成 `normalizedInputJson` 主模型；
- L4 runtime 输入消费层已经基本收敛到 `normalizedInputJson.input`；
- 但主链路中的业务判定仍主要依赖 `skill.paramsSchema` 上的策略字段，尚未真正切换到 workflow policy。

## 2.3 Workflow 应拆成两类

当前文档里提到的 `workflow`，实际上应拆成两种完全不同的模型：

### A. 模板编译型 Workflow

定义：

- 由模板资产、skill 基础定义、renderPlan 共同驱动；
- 目标是把模板渲染流程稳定编译为可执行的 `workflowDsl/activityDsl`；
- 其核心价值是“固定化编译”，不是让前端自由拼装。

真源：

- 模板资产；
- `skill.paramsSchema`；
- 后端编译规则；
- 前端仅可提交有限动态 policy 覆盖。

前端可编辑范围：

- 名称、描述、taskQueue 等展示或调度配置；
- `requiredMode/default/confirmationThreshold/previewBlocking` 等动态策略；
- 不可直接成为 `renderPath/templateBinding` 与步骤结构的真源。

### B. 自由编排型 Workflow

定义：

- 由用户或前端编排器直接构造步骤与 Activity 组合；
- 目标是支持通用自动化、查询、流程拼接等非模板驱动场景；
- 其核心价值是“显式编排”，不是模板编译。

真源：

- 用户编辑后的 `workflowDsl/activityDsl`；
- 平台侧 normalize / validate 规则。

前端可编辑范围：

- 步骤结构；
- Activity 选择与输入映射；
- 输入参数定义与 policy；
- 允许直接提交完整 DSL。

结论：

- 模板编译型 workflow 应坚持“后端编译、前端有限覆盖”；
- 自由编排型 workflow 应允许“前端直编 DSL、后端校验归一化”；
- 后续所有设计、接口、保存逻辑、发布逻辑都必须先判断当前属于哪一类 workflow。

---

## 3. 分层模型

## 3.1 L1：Skill 参数定义层

载体：

- `skill.paramsSchema`

职责：

- 定义标准字段名；
- 定义字段类型；
- 定义展示名、描述、分组；
- 定义抽取提示与语义角色；
- 定义通用格式语义与默认渲染锚点。

这一层回答：

- 这个技能有哪些稳定字段；
- 这些字段在识别阶段应该如何被理解。

这一层不应长期承载：

- 模板级默认值；
- 模板级必填规则；
- 客户、项目、组织级策略；
- 当前执行态的确认结果。

## 3.2 L2：Workflow 参数策略层

建议载体：

- 后端编译请求中的动态 `inputPolicy` 覆盖
- 编译后写入 `workflowDsl.inputPolicy.params`

职责：

- 声明当前模板实际启用哪些 skill 参数；
- 定义当前模板下的 `requiredMode`；
- 定义默认值、默认值求值器、来源优先级；
- 定义确认阈值、预览阻断规则、校验规则；
- 不负责生成模板静态绑定关系。

这一层回答：

- 同一个 skill 的标准字段，在当前 workflow / template 中应如何参与本次执行。

这一层不应负责：

- 生成整份 `workflowDsl/activityDsl`；
- 从前端回传 `templateBinding/renderPath`；
- 改写模板在生成时已经固化的参数绑定关系。

补充说明：

- 对模板编译型 workflow，L2 只表达动态策略，不表达模板静态绑定；
- 对自由编排型 workflow，L2 可以直接随 DSL 一起保存，但仍不应回流到 L1。

## 3.3 L3：Execution 参数解析层

载体：

- `execution.normalizedInputJson`

职责：

- 合并用户输入、识别结果、workflow 默认值、外部注入值；
- 记录每个字段的解析结果、来源、阻塞状态、确认状态；
- 为 `waiting_input`、恢复执行、最终 runtime 提供统一事实源。

核心结构应固定为：

- `input`
- `paramResolution`
- `requiredInputs`
- `semantic`

## 3.4 L4：Runtime 渲染输入层

载体：

- 发送给 document runtime / workflow runtime / activity 的最终 payload

职责：

- 只消费 execution 已确认的最终输入；
- 做格式转换、字段映射、模板绑定；
- 不再重新做业务级判缺；
- 不再重新从自然语言或 schema 猜参数。

---

## 4. 当前代码映射

## 4.1 已基本落地的部分

### A. Planner 主链路

当前 `planner` 已经：

- 先做 skill match；
- 基于 `skill.paramsSchema` 构造 recognizer schema；
- 生成 `required_inputs`；
- 生成 execution snapshot；
- 将缺失参数导向 `waiting_input`。

结论：

- 主链路主体已经形成。

### B. Recognizer 扁平字段输出

当前 `recognizer` 已经：

- 以 schema-compatible key 输出结果；
- 支持 nested JSON flatten；
- 支持数组字段；
- 支持 `field_confidences` 和 `uncertain_fields`。

结论：

- 识别层职责基本符合“只输出字段候选值”的要求。

### C. Execution 快照收敛

当前 `control-plane` 已经：

- 在 execution create 时写入 `normalizedInputJson`；
- 维护 `input / requiredInuts / paramResolution / semantic`；
- 在 `submitInputAndResume()` 中按 execution 快照更新状态；
- 基于 execution 快照恢复执行。

结论：

- L3 已经是当前实现最成熟的一层。

### D. Runtime 只读最终输入

当前 runtime request 构造已经优先读取：

- `execution.normalizedInputJson.input`

结论：

- runtime 输入收敛方向正确。

## 4.2 尚未彻底落地的部分

### A. L1 与 L2 尚未真正解耦

虽然平台层已经存在 `WorkflowInputPolicy` / `WorkflowParamPolicy`，但当前主链路里仍主要依赖 `skill.paramsSchema` 上的下列字段做业务判断：

- `required`
- `default`
- `previewBlocking`
- `confirmationThreshold`

这意味着：

- `skill.paramsSchema` 仍同时承担“字段定义”和“模板策略”两种职责；
- workflow policy 还没有成为 planner / control-plane 的主判断入口。

### B. Workflow policy 还未接入主执行链路

平台层已经支持：

- `inputPolicy.params`
- `requiredMode`
- `defaultValueResolver`
- `valueSourcePriority`
- `templateBinding`

但当前 planner / control-plane / runtime 的主链路并没有系统性消费这套策略。

这意味着：

- L2 目前更多是“平台数据模型能力”，不是“运行时事实依据”。

### C. 模板 workflow 的编译职责仍有前端越位

当前模板型 workflow 虽然已经存在后端 `generateTemplateWorkflowDraft()` 能力，但前端编辑页仍在本地维护并提交整份 `workflowDsl/activityDsl`。

这意味着：

- 前端实际上承担了模板 workflow 的 DSL 生成职责；
- 后端更多在做 normalize，而不是以模板资产为真源重新编译；
- 一旦前端本地状态与模板资产脱节，就可能把错误的 `inputPolicy`、步骤结构或绑定信息写回系统。

### D. 两类 workflow 的边界尚未显式制度化

当前平台虽然同时承载模板驱动和自由编排两类场景，但接口和文档层面还没有先区分 workflow 类型。

这意味着：

- 模板编译型 workflow 和自由编排型 workflow 共享了同一套保存心智；
- 前端容易把“自由编排”的编辑能力误用于“模板编译”场景；
- 后端也缺少基于 workflow 类型切换保存/编译逻辑的显式契约。

### E. Execution 事实字段语义尚未完全升级

当前 `paramResolution` 已存在，但仍未完全按目标契约表达：

- `workflow_default`
- `recognized`
- `external`
- `requiredMode`
- `final`
- `valueSourcePriority`

这意味着：

- execution 事实表结构已成型；
- 但字段语义仍偏向现状实现，不够完整。

### F. Runtime 映射规则还未显式化

当前 runtime 已读 `normalizedInputJson.input`，但：

- `renderPath`
- `templateBinding`

尚未在主链路里形成统一、显式、可复用的映射层。

这意味着：

- “runtime 只消费最终输入”基本已做到；
- “runtime 如何根据 L2/L1 规则稳定映射 payload”仍需补齐。

### G. 已出现的线上症状：文档生成结果为空

当前代码已能解释一个明确现象：主链路生成的文档内容可能整体为空，而 Word Add-in 的预览链路仍可正常看到填充值。

已确认的差异是：

- Word Add-in 的 `previewWithSkill` 直接取 `skill.dataExampleJson` 或自动生成的模拟数据；
- 预览链路只做 `normalizeRenderData` 规范化，然后直接把数据交给 Carbone 渲染；
- 当前主链路则会在 runtime request 装配阶段遍历 `execution.normalizedInputJson.paramResolution`；
- 只有满足 `final === true` 且存在 `templateBinding/renderPath` 的字段，才会被写入最终 `data` payload。

这意味着：

- 预览链路本质上是“给什么渲什么”；
- 主链路本质上是“仅渲染已确认且已绑定的最终参数”；
- 一旦上游未补齐 `final` 或未补齐 `templateBinding/renderPath`，主链路就会把字段全部过滤掉；
- 发给 Carbone 的 `data` 为空时，模板虽然成功执行，但会产出空内容文档。

额外说明：

- 历史 `generate-parameters` 接口已不是现行主链路依据；
- 当前真正可对比的参考实现应以 Word Add-in 的 `previewWithSkill` 为主，而不是已下线的旧生成参数接口。

---

## 5. 现状与目标的差距

## 5.1 已完成

1. 文档任务主链路已形成；
2. `waiting_input` 自然语言恢复已可用；
3. execution 快照已成为恢复执行的主事实源；
4. runtime 已基本改为消费最终输入；
5. legacy `generate-parameters` 已被显式下线。

## 5.2 未完成

1. `skill.paramsSchema` 中仍保留策略字段；
2. workflow policy 尚未成为 planner / control-plane 的主依据；
3. `requiredMode` 三层语义尚未真正分离；
4. execution `paramResolution` 契约尚未完整升级；
5. runtime 的 `templateBinding/renderPath` 映射规则未完全落地；
6. 主链路在 `final + binding path` 不完整时会直接生成空 payload；
7. 异常路径下仍存在脱离主链路的回退风险。

---

## 6. 目标契约

## 6.1 Skill 层

长期建议保留在 `skill.paramsSchema` 的字段：

- `type`
- `displayName`
- `description`
- `groupLabel`
- `semanticRole`
- `extractionPrompt`
- `extractionHints`
- `format`
- `renderPath`
- `paramKind`

长期建议迁出 `skill.paramsSchema` 的字段：

- `default`
- `previewBlocking`
- `confirmationThreshold`
- 模板级 `required`

## 6.2 Workflow 策略层

建议固定使用：

- `workflowDsl.inputPolicy.params`

建议长期支持：

- `enabled`
- `requiredMode`
- `defaultValue`
- `defaultValueResolver`
- `valueSourcePriority`
- `confirmationThreshold`
- `previewBlocking`
- `validationRules`
- `transformRule`

补充约束：

- 前端提交的 policy 只应用于动态策略覆盖；
- `templateBinding` 不应作为前端可编辑真源；
- 模板静态绑定应由模板资产或后端编译阶段固化进入 `renderPath/binding`。

## 6.2A Workflow 类型契约

建议显式区分：

- `template_compiled`
- `free_form`

### 模板编译型

固定规则：

- 保存请求不直接提交最终 DSL 作为真源；
- 后端必须根据模板资产重新编译 `workflowDsl/activityDsl`；
- 前端仅可提交有限覆盖字段；
- 发布、回放、运行统一消费后端编译结果。

### 自由编排型

固定规则：

- 前端可直接提交完整 `workflowDsl/activityDsl`；
- 后端负责 normalize、validate、补默认值与安全校验；
- 不依赖模板资产或 renderPlan 才可成立。

## 6.3 Execution 快照层

建议固定权威关系：

- `paramResolution` 是唯一参数解析事实表；
- `requiredInputs` 是由 `paramResolution + workflow policy` 派生的交互视图；
- `input` 只包含可安全进入 runtime 的确定态值。

## 6.4 Runtime 层

固定规则：

- 只读取 `normalizedInputJson.input`
- 不再回读 schema 做业务必填判断
- 不再根据自然语言二次识别参数
- 仅保留系统必填校验与 payload 装配

---

## 7. 改造原则

1. 先固定 execution 契约，再切换 planner 和 runtime；
2. 先让 workflow policy 成为运行时真实输入，再清理 skill schema 中的策略字段；
3. 先保证主链路和恢复链路稳定，再收缩 legacy/旁路；
4. 所有补参与恢复逻辑都继续建立在 execution 快照之上；
5. 任何 runtime 消费方都不能重新发明第二套参数命名；
6. 模板型 workflow 必须由后端根据模板资产编译，前端不再直接生成整份 DSL。
7. 任何保存、发布、执行链路都必须先判断当前 workflow 属于模板编译型还是自由编排型。

---

## 8. 分阶段改造计划

## 8.1 Phase 1：统一契约

目标：

- 固定 L1/L2/L3/L4 边界；
- 固定 `ExecutionNormalizedInput` 结构；
- 固定“模板资产 -> 后端编译 DSL -> execution/runtime 消费”的主路径。

任务：

1. 定版 skill / workflow / execution 三层类型；
2. 固定字段归属矩阵；
3. 约束新代码不再向 L1 回流策略字段；
4. 约束模板 workflow 的创建/保存不再由前端直接提交完整 DSL；
5. 为 workflow 显式补充类型区分：模板编译型 / 自由编排型。

## 8.2 Phase 2：Control-Plane 先收敛

目标：

- 让 `control-plane` 成为参数解析的唯一装配者。

任务：

1. 继续以 `paramResolution` 为事实表；
2. 明确由 `paramResolution` 派生 `requiredInputs`、`semantic`、`input`；
3. 将默认值注入、补参提交、外部注入统一收敛到 `paramResolution` 更新。

## 8.3 Phase 3：Planner 接入 workflow policy

目标：

- planner 停止直接依赖 schema 中的业务策略字段。

任务：

1. planner 仍只基于 `skill.paramsSchema` 做字段识别；
2. planner 在判缺、默认值、确认态、阻塞语义时改为读取 workflow policy；
3. 逐步将 `required/default/previewBlocking/confirmationThreshold` 从 skill schema 使用路径迁出。

## 8.4 Phase 4：Runtime 映射层显式化

目标：

- runtime 只消费 execution 最终输入，并根据 binding 规则稳定映射。

任务：

1. 固定 runtime request 只读 `normalizedInputJson.input`；
2. 建立 `templateBinding/renderPath` 的统一映射逻辑；
3. 明确 `paramResolution.final` 与 `templateBinding/renderPath` 的进入 runtime 契约；
4. 为缺失 binding 或未 final 的字段提供可观测诊断日志；
5. 清理 runtime 内任何业务级 required 反推逻辑。

### Phase 4 补充判断

当前“空文档”问题应视为 Phase 4 尚未收口完成的直接证据。

根因不是 Carbone 渲染器本身，而是主链路在 runtime payload 装配时缺少稳定、统一、可追踪的映射契约，导致有效参数在进入渲染前被全部过滤。

## 8.5 Phase 5：模板 workflow 编译职责后移

目标：

- 前端不再生成模板型 workflow 的完整 DSL；
- 后端成为模板 workflow 的唯一编译者。

任务：

1. 前端模板编辑页只提交 `templateId + policy overrides + 展示级配置`；
2. 后端基于模板资产、skill 基础定义、renderPlan 重新编译 `workflowDsl/activityDsl`；
3. 前端传入的 `inputPolicy` 不再允许覆盖模板静态绑定；
4. 保存、发布、回放统一以“后端编译后的 DSL”作为事实源。

## 8.6 Phase 6：两类 workflow 的接口分流

目标：

- 在平台接口和前端交互层明确区分模板编译型与自由编排型。

任务：

1. 保存接口先识别 workflow 类型再决定走编译还是直存；
2. 前端编辑器根据 workflow 类型裁剪可编辑能力；
3. 发布链路根据 workflow 类型决定校验项；
4. 文档、测试、日志、诊断统一输出 workflow 类型。

## 8.7 Phase 7：聊天与前端对齐 execution 快照

目标：

- 交互层只依赖 execution 视图。

任务：

1. 缺失字段展示只读 `requiredInputs`；
2. 恢复执行固定使用 `executionId + normalizedInputJson`；
3. 不再从前端或聊天层重新计算 required 规则。

---

## 9. 代码落点

### A. Planner

- `apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.ts`
- `apps/backend/core/ai-orchestrator/src/modules/planner/planner.service.spec.ts`

### B. Recognizer

- `apps/backend/core/ai-orchestrator/src/modules/recognizer/recognizer.service.ts`
- `apps/backend/core/ai-orchestrator/src/modules/recognizer/recognizer.service.spec.ts`

### C. Chat / waiting_input

- `apps/backend/core/ai-orchestrator/src/controllers/chat.controller.ts`
- `apps/backend/core/ai-orchestrator/src/controllers/chat.controller.spec.ts`

### D. Control-Plane

- `apps/backend/core/control-plane/src/modules/execution/execution.service.ts`
- `apps/backend/core/control-plane/src/modules/execution/runtime-step-request.factory.ts`
- `apps/backend/core/control-plane/src/modules/execution/execution.mapper.ts`
- `apps/backend/core/control-plane/test/execution.service.test.ts`
- `apps/backend/core/control-plane/test/runtime-step-request.factory.test.ts`

### E. Platform / Workflow Policy

- `apps/backend/core/platform/src/modules/execution-flow/interfaces.ts`
- `apps/backend/core/platform/src/modules/execution-flow/execution-flow-template.service.ts`
- `apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow.service.ts`
- `apps/backend/core/platform/src/modules/skill/interfaces.ts`

---

## 10. 最小验收标准

当以下条件全部满足时，可认为本次改造完成：

1. planner 识别字段只看 `skill.paramsSchema`；
2. planner / control-plane 的业务判定主要看 `workflowDsl.inputPolicy.params`；
3. `execution.normalizedInputJson.paramResolution` 可以解释 `input` 与 `requiredInputs`；
4. `waiting_input` 补参与恢复执行只依赖 execution 快照；
5. runtime 只读取 `normalizedInputJson.input`；
6. runtime 不再从 schema 推导业务级 required；
7. 当上游参数缺失 `final` 或 binding path 时，系统可以明确报出诊断信息，而不是静默生成空文档；
8. `skill.paramsSchema` 不再继续承载模板级策略字段；
9. 模板编译型 workflow 的保存不会再由前端直接提交整份 DSL；
10. 自由编排型 workflow 仍可直接保存 DSL，但会经过后端 normalize 与 validate。

---

## 11. 最终建议

当前仓库最合理的演进方向不是重写整条文档链路，而是沿着已有主链路继续收敛：

1. 保留 `planner + recognizer + control-plane + runtime` 这条主骨架；
2. 将 workflow policy 从“平台侧类型能力”升级为“主链路真实策略真源”；
3. 将 `skill.paramsSchema` 收缩回基础字段定义层；
4. 将 execution 快照固定为补参、恢复、执行、渲染的唯一事实源；
5. 将 runtime 彻底收缩为最终输入消费者；
6. 在平台层明确区分模板编译型与自由编排型两类 workflow。

简化表达：

```text
Skill 定义字段
Template Workflow 由后端编译
Free-form Workflow 由前端编排
Workflow Policy 定义动态策略
Execution 冻结结果
Runtime 消费输入
```

这应作为后续文档参数体系改造的统一基线。
