# 文档参数语义提取 Subagent 设计方案

**版本：** v1.0  
**日期：** 2026-05-13  
**状态：** 设计中

---

## 背景

当前文档型技能的参数获取链路已经具备可运行的主流程：

1. `ai-orchestrator` 完成技能匹配与参数初提取；
2. Planner 基于 `paramsSchema` 生成 `required_inputs`；
3. `control-plane` 根据缺失参数进入 `waiting_input` 或继续执行；
4. 文档渲染服务按结构化参数执行 `preview / render`。

这条链路对简单任务、单 sheet 模板、参数较少的技能基本成立，但在多 sheet、循环多、参数多的文档型任务中出现明显瓶颈：

- 参数定义过度贴近模板变量，业务语义不稳定；
- 数组型数据被拆成大量叶子字段，补输入成本高；
- 模板循环标记、技术变量名可能被误当作必填参数；
- `required_inputs` 采用字段平铺模式，容易把“可空不阻塞”的字段也变成阻塞项；
- 多 sheet 场景中，字段归属与展示归属混杂，参数协议难维护；
- 复杂文档常常在“可以预览但未补全”的情况下被过早拦截到 `waiting_input`。

本设计的目标不是重写现有主流程，而是在其前增加一个**语义提取 Subagent**，专门提升复杂文档任务的参数质量、数组恢复能力和缺失判断质量。

---

## 目标

### 核心目标

- 在**不改变现有主执行链路**的前提下，加强复杂文档任务的参数理解能力；
- 为多 sheet、循环多、字段多的文档模板建立稳定的**统一语义模型**；
- 将字段级 `required_inputs` 升级为更符合业务认知的**分组缺失与分级缺失**；
- 提高复杂文档任务的**可预览率**、**补输入成功率**和**参数复用能力**；
- 保持对现有 `planner -> control-plane -> render` 协议的兼容。

### 非目标

- 不替代现有 Planner；
- 不改写 `control-plane` 的执行状态机；
- 不直接接管文档渲染；
- 不在本版引入新的执行单真相源；
- 不要求所有技能都接入该 Subagent。

---

## 适用范围

### 优先适用的任务类型

- 文档型技能；
- 多 sheet Excel / Word / PPT 模板；
- 存在明显循环块的模板，例如 `items[]`、`deliveryItems[]`、`paymentSchedule[]`；
- 参数数较多的技能，例如总字段数大于 12；
- 首轮识别后缺失项较多的任务，例如缺失字段数大于 6；
- 用户输入为自然语言描述，而不是结构化表单直填。

### 不优先适用的任务类型

- 参数少、结构稳定的简单任务；
- 非文档类技能；
- 不存在数组循环和复杂条款的单页模板；
- 外部系统已直接给出结构化 JSON 的任务。

---

## 设计原则

### 1. 主流程不变，Subagent 只做前置增强

Subagent 只负责把复杂任务的输入整理为更高质量的结构化结果，再适配回现有主流程能接受的格式。

它不直接：

- 创建执行单事实；
- 改写审批逻辑；
- 改变运行时状态机；
- 替代渲染服务。

### 2. 简单任务走轻路径，复杂任务走增强路径

采用双轨制：

- 简单任务继续走当前轻量参数提取；
- 复杂文档任务命中后，先进入 Subagent，再进入现有 Planner。

### 3. 可旁路、可降级、可回退

Subagent 必须是可选增强层：

- 若置信度低；
- 若执行超时；
- 若服务异常；
- 若任务不满足复杂度条件；

则自动回退到当前流程，不得成为单点故障。

### 4. 统一语义模型优先于模板变量

Subagent 面向的是**业务对象**，不是模板语法。  
例如：

- 正确：`items[]`
- 错误：`{#d.items}{/d.items}`

模板变量标准化、sheet 映射属于下游模板映射层，不应直接暴露给用户补输入。

### 5. 缺失判断以“是否影响生成”为中心

不是所有缺失都应阻塞生成。  
字段必须按对生成的影响进行分层：

- 阻塞生成；
- 降级生成；
- 不影响生成；
- 可推导。

### 6. 补输入以业务组为中心

复杂文档场景下，不应优先让用户填写几十个叶子字段，而应按业务组补全，例如：

- 合同主体；
- 标的清单；
- 交付计划；
- 付款计划；
- 条款补充。

### 7. 全链路可观测

Subagent 必须输出可调试快照，用于解释：

- 为什么识别出这个结构；
- 为什么某字段被判为缺失；
- 为什么进入 `waiting_input`；
- 为什么允许 `previewReady=true` 但 `finalReady=false`。

---

## 现状问题拆解

### 1. 现有参数提取以字段平铺为主

当前 Planner 的 `buildRequiredInputs()` 基本按 `paramsSchema.properties` 逐字段构造 `required_inputs`。  
这意味着：

- 数组字段缺乏组语义；
- 同类字段不会自动收敛为一个业务块；
- 模板技术变量容易污染补输入层。

### 2. 多 sheet 本质仍只有一份业务数据，但当前缺乏中间语义层

多 sheet 模板通常只是同一份业务数据的不同展示视图。  
如果直接把 sheet 与参数协议绑定，会导致：

- 参数归属不稳定；
- 模板一改，参数协议跟着抖；
- 多模板复用成本高。

### 3. “必填”定义过硬

当前流程容易把所有 required 字段视作阻塞项，但实际复杂文档中应至少区分：

- 法律或结构上真正必须的字段；
- 建议补全但不阻塞预览的字段；
- 可由系统推导的字段；
- 技术性变量，不应出现在人工补输入中。

---

## 总体方案

### 总体思路

在现有主链路中插入一个**语义提取 Subagent 侧车层**：

```text
用户输入
-> 技能匹配
-> 复杂度判定
   -> 简单任务：直接走现有参数提取
   -> 复杂文档任务：进入语义提取 Subagent
-> 输出标准语义结果包
-> 适配回 recognized params / normalized input / required inputs
-> 继续进入现有 Planner / control-plane / render
```

### 最小侵入接入点

推荐接入位置：

- 在 `skill match` 之后；
- 在 Planner 固化 `required_inputs` 之前。

原因：

- 这时已经知道大概率是什么技能；
- 还没有把错误的缺失字段写入执行单；
- 可以最大化保留现有 Planner、Execution、Render 的代码稳定性。

---

## 架构分层

### 第一层：复杂度判定层

职责：

- 判断当前任务是否需要进入语义提取 Subagent。

建议判定条件：

- 技能类型为文档型；
- 参数量超过阈值；
- 存在数组循环；
- 模板是多 sheet；
- 初次识别缺失参数过多；
- 用户输入为较长自然语言。

输出：

- `simple`
- `complex_document`

### 第二层：语义归一层

职责：

- 把自然语言描述归并成统一语义模型；
- 合并同义字段；
- 恢复数组组；
- 清理技术性变量噪音。

示例：

- `甲方`、`采购方`、`buyerParty` -> `parties.buyerParty`
- `标的明细`、`设备清单` -> `items[]`

### 第三层：就绪度判断层

职责：

- 基于语义模型判断：
  - 哪些缺失是阻塞项；
  - 哪些只是降级项；
  - 当前是否允许预览；
  - 当前是否允许正式出文。

输出：

- `previewReady`
- `finalReady`
- `blockingMissing`
- `nonBlockingMissing`

### 第四层：兼容适配层

职责：

- 将 Subagent 的标准输出适配回现有主流程可接受的数据结构。

典型兼容输出：

- `recognizedParams`
- `normalizedInput`
- `requiredInputs`
- `plannerHints`

---

## 统一语义模型

### 建模原则

- 不按 sheet 建模；
- 不按模板变量建模；
- 按业务语义建模；
- 同一字段只有一个 canonical key；
- sheet 只是视图，不是参数协议。

### 采购合同示例模型

```json
{
  "header": {
    "contractNumber": "",
    "projectName": "",
    "signingDate": "",
    "currency": "CNY",
    "contractSummary": ""
  },
  "parties": {
    "buyerParty": "",
    "supplierParty": ""
  },
  "items": [],
  "deliveryItems": [],
  "paymentSchedule": [],
  "clauses": {
    "subject": "",
    "qualityStandard": "",
    "qualityLiability": "",
    "acceptanceStandard": "",
    "installationTerms": "",
    "installationCondition": "",
    "otherTerms": "",
    "latePaymentPenaltyRatio": "",
    "warrantyPeriodMonths": null,
    "hasInstallationService": null
  }
}
```

### 多 sheet 的处理原则

多 sheet 模板应使用“统一主模型 + sheet 子视图”的方式：

- `sheet_cover` 读取 `header + parties`
- `sheet_items` 读取 `items[]`
- `sheet_delivery` 读取 `deliveryItems[]`
- `sheet_payment` 读取 `paymentSchedule[]`
- `sheet_clauses` 读取 `clauses`

也就是说：

- 一个字段只属于一个语义模型；
- 但可以被多个 sheet 消费；
- sheet 改版不应引发上游参数协议变动。

---

## 循环与数组定义规范

### 标准原则

循环必须定义为**业务数组对象**，而不是模板技术标记。

正确示例：

- `items[]`
- `deliveryItems[]`
- `paymentSchedule[]`

错误示例：

- `{#d.items}{/d.items}`
- `{#d.deliveryItems}{/d.deliveryItems}`
- `{#d.paymentSchedule}{/d.paymentSchedule}`

### 数组组优先于叶子字段

对于复杂文档，补输入与缺失判断优先围绕数组组进行，而不是逐叶子字段。

例如：

- 不优先追问 `items[].seq`、`items[].unit`、`items[].quantity`
- 优先追问“请补充标的清单”

Subagent 再负责把一段自然语言解析成：

```json
{
  "items": [
    {
      "seq": "1",
      "materialCode": "RB-01",
      "deviceName": "机器人本体",
      "specModel": "IRB-4600",
      "unit": "台",
      "quantity": 3,
      "taxedPrice": 220000,
      "taxedSubtotal": 660000
    }
  ]
}
```

### 允许最小行集

数组字段的最小准入建议：

- `items[]` 至少一行时即可支持预览；
- `deliveryItems[]` 可为空，但若模板依赖较强则标记为降级项；
- `paymentSchedule[]` 可为空，但正式出文时可提升为业务必填。

---

## 字段策略模型

### 必填分层

建议将 `required` 从布尔值扩展为分层策略：

- `hard_required`
- `soft_required`
- `optional`
- `derived`

解释：

- `hard_required`：缺失时阻塞正式生成；
- `soft_required`：缺失时不阻塞预览，但提示建议补全；
- `optional`：缺失时无显著影响；
- `derived`：应由系统推导，不应直接要求用户填写。

### 渲染影响分层

再增加一个独立维度：

- `blocking`
- `degrading`
- `none`

这样可以表达：

- 某字段业务上重要，但当前允许先预览；
- 某字段没有值也不会影响结构；
- 某字段虽缺失，但可以由系统推导。

### 推荐字段策略示例

以采购合同为例：

- `buyerParty` -> `hard_required + blocking`
- `supplierParty` -> `hard_required + blocking`
- `contractNumber` -> `hard_required + blocking`
- `projectName` -> `hard_required + degrading`
- `items[]` -> `hard_required + blocking`
- `qualityStandard` -> `soft_required + degrading`
- `paymentSchedule[]` -> `soft_required + degrading`
- `otherTerms` -> `optional + none`
- `items[].taxedSubtotal` -> `derived + none`

---

## Subagent 输入输出协议

### 输入

Subagent 输入建议包括：

```json
{
  "taskType": "document",
  "skillId": "xxx",
  "templateId": "xxx",
  "documentContext": {
    "templateFormat": "xlsx",
    "sheetCount": 5,
    "loopGroups": ["items", "deliveryItems", "paymentSchedule"]
  },
  "userInput": "自然语言输入",
  "history": [],
  "recognizedParams": {},
  "paramsSchema": {},
  "sampleData": {}
}
```

### 输出

Subagent 输出标准化结果包：

```json
{
  "semanticModel": {},
  "recognizedParams": {},
  "groupedMissing": [
    {
      "group": "items",
      "blocking": true,
      "fields": ["deviceName", "quantity", "unit"]
    }
  ],
  "fieldPolicies": {},
  "previewReady": true,
  "finalReady": false,
  "confidence": 0.82,
  "fallbackReason": null,
  "debug": {
    "normalizedPaths": [],
    "notes": []
  }
}
```

### 兼容适配输出

为兼容现有主流程，增加适配层转换为：

- `recognizedParams`
- `normalizedInput.requiredInputs`
- `planner summary`
- `planner hints`

其中 `requiredInputs` 不再简单等于原始 schema required，而是由：

- 分组缺失；
- 字段策略；
- 预览就绪判断；

共同决定。

---

## Waiting Input 设计

### 当前问题

当前 `waiting_input` 倾向于按字段平铺展示，这对复杂文档极不友好。

### 推荐方案

将 `waiting_input` 升级为“分组优先、字段次级”的结构：

```json
{
  "groups": [
    {
      "name": "items",
      "title": "标的清单",
      "blocking": true,
      "summary": "至少补充 1 条设备清单",
      "fields": ["deviceName", "specModel", "quantity", "unit"]
    },
    {
      "name": "paymentSchedule",
      "title": "付款计划",
      "blocking": false,
      "summary": "建议补充付款节点与金额",
      "fields": ["node", "ratio", "amount", "condition"]
    }
  ]
}
```

### 交互原则

- 先显示业务组；
- 用户按组补充一段自然语言；
- 系统再次进入 Subagent 做二次结构化；
- 不要求用户直填技术字段名。

---

## 预览与正式生成策略

### 预览就绪判定

当满足最小生成集时，应允许预览，即使信息未完全齐全。

建议定义：

- `previewReady`：允许生成预览；
- `finalReady`：允许正式出文。

### 建议准入规则

对于复杂合同类模板：

- 满足合同主体 + 至少 1 条 `items[]` 时可预览；
- `paymentSchedule[]`、详细条款可作为降级项；
- 若缺少核心主体或完全缺少清单，则阻塞。

### 业务价值

这样做可以避免：

- 用户刚补了一半信息就被流程完全拦死；
- 明明模板可以生成基本预览，却只能停在 `waiting_input`；
- 用户没有反馈回路，不知道当前数据离可用还差多少。

---

## 观测与调试

Subagent 必须保留调试快照，便于定位复杂任务问题。

建议记录：

- 原始用户输入；
- 复杂度判定结果；
- 语义模型输出；
- 数组恢复结果；
- 缺失分组结果；
- `previewReady / finalReady` 判定依据；
- 置信度；
- 回退原因；
- 适配前与适配后的关键差异。

推荐接入现有执行单调试视图，而不是额外造一套孤立调试入口。

---

## 集成方案

### 方案 A：Planner 内联增强

做法：

- 在 Planner 内增加复杂任务分流与 Subagent 调用。

优点：

- 接入点清晰；
- 现有上下文最完整；
- 最容易复用当前 `recognized params`、`required_inputs` 流程。

缺点：

- Planner 模块职责会变重。

### 方案 B：独立语义服务

做法：

- 以独立服务或独立模块形式提供 `semantic-understand` 接口；
- Planner 调用该接口。

优点：

- 职责边界更清晰；
- 后续可被多入口复用。

缺点：

- 初期部署和运维复杂度更高；
- 需要额外定义服务契约与降级策略。

### 推荐

本阶段推荐 **方案 A：Planner 内联增强**。

原因：

- 目标是最小侵入；
- 当前主流程已存在；
- 先以模块内联方式验证语义增强价值，后续再决定是否独立服务化。

---

## 实施阶段建议

### 第一阶段：只做语义清洗与兼容适配

目标：

- 不改现有 `waiting_input` 页面；
- 先把模板噪音字段、循环标记、类型错误从源头压下去。

产出：

- 标准路径清洗；
- 数组组恢复；
- `requiredInputs` 收敛。

### 第二阶段：引入分组缺失与 `previewReady`

目标：

- 让复杂文档不再“一缺就死”；
- 支持先预览、后补全。

产出：

- `blockingMissing`
- `nonBlockingMissing`
- `previewReady / finalReady`

### 第三阶段：前端补输入体验升级

目标：

- Portal/聊天窗口按业务组展示缺失项；
- 支持整段自然语言补“标的清单 / 付款计划 / 交付计划”。

---

## 风险与控制

### 风险 1：Subagent 输出不稳定

控制：

- 增加置信度阈值；
- 低置信度自动回退当前流程；
- 保留调试快照。

### 风险 2：兼容层过于复杂

控制：

- 只增加一层标准结果包；
- 不直接改动 Execution 真相模型；
- 逐步替换 `requiredInputs` 生成逻辑。

### 风险 3：模板差异过大，统一模型难建

控制：

- 统一模型只针对“领域模板族”；
- 不要求所有模板共享一套字段；
- 允许“统一主模型 + 模板族局部扩展”。

### 风险 4：简单任务被复杂链路拖慢

控制：

- 复杂度判定前置；
- 简单任务仍走旧路径；
- Subagent 不参与不必要的任务。

---

## 最终建议

在不改变现有主流程的前提下，最优设计方针是：

1. 在 `skill match` 之后、Planner 固化 `required_inputs` 之前引入语义提取 Subagent；
2. Subagent 仅服务复杂文档任务，简单任务继续走当前轻路径；
3. 以**统一语义模型**作为参数理解的中心，而不是模板变量或 sheet；
4. 以**业务数组组**定义循环，而不是模板循环标记；
5. 将“必填”升级为**字段策略 + 渲染影响**双维度模型；
6. 让 `waiting_input` 从字段平铺升级为**分组补输入**；
7. 引入 `previewReady / finalReady`，避免复杂文档被过早阻塞；
8. 通过兼容适配层输出现有主流程可接受的数据结构，实现最小侵入落地。

---

## 开放问题

- `paramsSchema` 的 canonical key 应由谁维护：技能发布中心、模板识别层，还是 Planner 侧适配层？
- 多模板共享同一领域模型时，模板族版本如何演进？
- `previewReady` 是否应直接影响 Portal UI 按钮状态？
- `waiting_input` 的分组结构是否作为新的执行单 DTO 对外暴露，还是只作为内部兼容层存在？

