# 文档参数语义提取 Subagent API / DTO 草案

**版本：** v1.0  
**日期：** 2026-05-13  
**状态：** 草案

> 本文定义复杂文档任务引入语义提取 Subagent 后，推荐采用的最小契约扩展方案。目标是在不破坏现有 `Planner -> control-plane -> Portal` 主链路的前提下，为复杂文档任务增加稳定的 `semantic` 契约。

---

## 1. 文档目标

本文回答以下问题：

- `semantic` 增强信息应该放在哪些 DTO 中；
- 哪些字段需要冻结为稳定语义；
- 哪些字段仅作为过渡期兼容字段；
- `required_inputs` 与 `groupedMissing` 如何并存；
- `normalizedInputJson` 中应如何承载语义增强结果；
- `Planner API` 和 `Execution API` 需要做哪些最小扩展。

本文是契约草案，不要求当前代码立即实现全部字段，但建议作为后续实现的冻结参考。

---

## 2. 设计原则

### 2.1 兼容优先

- 原有字段继续保留；
- 新增字段均为 optional；
- 老调用方忽略新字段也能工作；
- 新调用方可逐步消费增强信息。

### 2.2 语义稳定优先于实现细节

对外冻结的应该是：

- `previewReady`
- `finalReady`
- `groupedMissing`
- `requiredLevel`
- `renderImpact`

不应冻结 Subagent 内部 prompt、LLM 路由、规则细节。

### 2.3 字段级与组级并存

复杂文档场景下：

- `required_inputs` 继续作为兼容字段保留；
- `groupedMissing` 作为推荐交互入口新增；
- 组级和字段级不能互相替代，但必须能互相映射。

### 2.4 `normalizedInputJson` 仍是执行期承载容器

在不引入新真相表的前提下，`semantic` 推荐落在：

- `PlanDraftDTO.semantic`
- `ExecutionDto.semantic`
- `ExecutionStepDto.inputJson.groupedMissing`
- `Execution.normalizedInputJson.semantic`

---

## 3. 推荐新增 DTO

## 3.1 `RequiredLevel`

```ts
export type RequiredLevelDTO =
  | 'hard_required'
  | 'soft_required'
  | 'optional'
  | 'derived';
```

语义：

- `hard_required`：缺失时阻塞正式生成；
- `soft_required`：缺失时不阻塞预览，但应提示补全；
- `optional`：缺失时不影响主要流程；
- `derived`：优先由系统推导，不应直接要求用户填写。

## 3.2 `RenderImpact`

```ts
export type RenderImpactDTO =
  | 'blocking'
  | 'degrading'
  | 'none';
```

语义：

- `blocking`：缺失时阻塞生成或关键结构渲染；
- `degrading`：缺失时可生成，但质量下降；
- `none`：缺失时对生成结果影响可忽略。

## 3.3 `GroupedMissingDTO`

```ts
export interface GroupedMissingDTO {
  group: string;
  title: string;
  blocking: boolean;
  summary?: string;
  fields: string[];
}
```

字段说明：

- `group`：业务组 canonical key，例如 `items`、`deliveryItems`；
- `title`：面向用户展示的标题，例如“标的清单”；
- `blocking`：该组是否为阻塞组；
- `summary`：建议面向 Portal / Chat 展示的摘要；
- `fields`：该组下关联的 canonical field keys。

推荐示例：

```json
{
  "group": "items",
  "title": "标的清单",
  "blocking": true,
  "summary": "至少补充 1 条设备清单",
  "fields": ["items[].deviceName", "items[].quantity", "items[].unit"]
}
```

## 3.4 `FieldPolicyDTO`

```ts
export interface FieldPolicyDTO {
  key: string;
  group?: string;
  requiredLevel: RequiredLevelDTO;
  renderImpact: RenderImpactDTO;
  dataType?: string;
  description?: string;
  canAutoDerive?: boolean;
}
```

说明：

- `key` 必须使用 canonical key；
- `group` 用于关联业务组；
- `dataType` 面向前端提示和解析辅助，不要求强校验；
- `canAutoDerive` 用于表达该字段是否优先系统推导。

## 3.5 `SemanticSummaryDTO`

```ts
export interface SemanticSummaryDTO {
  mode: 'simple' | 'complex_document';
  previewReady?: boolean;
  finalReady?: boolean;
  groupedMissing?: GroupedMissingDTO[];
}
```

这是最小可透传语义摘要，适合放入：

- 执行详情 DTO；
- 执行步骤 DTO；
- 列表摘要；
- 通知负载。

## 3.6 `SemanticPayloadDTO`

```ts
export interface SemanticPayloadDTO extends SemanticSummaryDTO {
  semanticModel?: Record<string, unknown>;
  fieldPolicies?: FieldPolicyDTO[];
  fallbackReason?: string | null;
  confidence?: number;
  debug?: {
    normalizedPaths?: string[];
    notes?: string[];
  };
}
```

这是完整语义结果包，适合：

- `planDraft`
- `normalizedInputJson.semantic`
- 调试快照

不建议第一阶段直接全部对外暴露给普通业务调用方。

---

## 4. DTO 扩展建议

## 4.1 `RequiredInputDTO`

### 当前结构

当前 `RequiredInputDTO` 定义见 [index.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/interfaces/index.ts#L269-L277)：

```ts
export interface RequiredInputDTO {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  value?: unknown;
  missing: boolean;
  source: 'user_input' | 'default' | 'unresolved';
}
```

### 推荐扩展

```ts
export interface RequiredInputDTO {
  name: string;
  type: string;
  description?: string;
  required: boolean;
  value?: unknown;
  missing: boolean;
  source: 'user_input' | 'default' | 'unresolved';
  group?: string;
  requiredLevel?: RequiredLevelDTO;
  renderImpact?: RenderImpactDTO;
}
```

### 兼容原则

- `required` 保留，作为旧逻辑兼容；
- `requiredLevel` 为新增增强语义；
- `group` 支持 Portal 按组聚合；
- `renderImpact` 支持 preview-ready 判定。

---

## 4.2 `PlanDraftDTO`

### 当前结构

当前 `PlanDraftDTO` 定义见 [index.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/interfaces/index.ts#L285-L296)。

### 推荐扩展

```ts
export interface PlanDraftDTO {
  plan_id: string;
  planner_mode: 'skill' | 'fallback';
  objective: string;
  summary: string;
  skill_match?: PlanSkillMatchDTO;
  steps: PlanStepDTO[];
  required_inputs: RequiredInputDTO[];
  usage?: LLMUsage;
  risk_summary: RiskSummaryDTO;
  metadata?: Record<string, unknown>;
  semantic?: SemanticPayloadDTO;
}
```

### 说明

- `semantic` 作为增强字段，不替代 `required_inputs`；
- `planDraft.semantic.previewReady` 是对复杂文档任务最重要的新增语义之一；
- `planDraft.semantic.groupedMissing` 是 Portal / Chat 升级交互的核心输入。

### 推荐示例

```json
{
  "plan_id": "plan-123",
  "planner_mode": "skill",
  "summary": "已识别技能 采购合同渲染，但仍缺少 2 个关键业务组。",
  "required_inputs": [
    {
      "name": "buyerParty",
      "type": "string",
      "required": true,
      "missing": false,
      "source": "user_input",
      "group": "parties",
      "requiredLevel": "hard_required",
      "renderImpact": "blocking"
    }
  ],
  "semantic": {
    "mode": "complex_document",
    "previewReady": true,
    "finalReady": false,
    "groupedMissing": [
      {
        "group": "items",
        "title": "标的清单",
        "blocking": true,
        "summary": "至少补充 1 条设备清单",
        "fields": ["items[].deviceName", "items[].quantity", "items[].unit"]
      }
    ]
  }
}
```

---

## 4.3 `CreateExecutionDto`

### 当前结构

当前 `CreateExecutionDto` 定义见 [execution.dto.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/control-plane/src/modules/execution/execution.dto.ts#L14-L58)。

### 推荐扩展

保持现有字段不变，仅通过 `planDraft` 和 `input` 透传：

```ts
export class CreateExecutionDto {
  skillId?: string;
  capabilityId?: string;
  skillVersion?: string;
  capabilityVersion?: string;
  runtimeType?: string;
  input: Record<string, unknown>;
  idempotencyKey?: string;
  usage?: Record<string, unknown>;
  planDraft?: Record<string, unknown>;
}
```

### 说明

第一阶段不建议直接增加独立顶层 `semantic` 字段，原因：

- 当前已有 `planDraft` 容器；
- 现有调用方已透传 `planDraft`；
- 先借助 `planDraft.semantic` 与 `normalizedInputJson.semantic` 更稳。

若后续需要冻结为正式 `Execution API v2`，再考虑增加顶层 `semantic`。

---

## 4.4 `ExecutionDto`

### 当前结构

当前 `ExecutionDto` 定义见 [execution.dto.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/control-plane/src/modules/execution/execution.dto.ts#L60-L167)。

### 推荐扩展

```ts
export class ExecutionDto {
  id: string;
  skillId: string;
  capabilityId?: string | null;
  skillVersion?: string | null;
  capabilityVersion?: string | null;
  status: ExecutionStatus;
  runtimeType?: string | null;
  riskLevel?: 'L0' | 'L1' | 'L2' | 'L3' | null;
  currentStepId?: string | null;
  requiresApproval?: boolean;
  approvalStatus?: ApprovalStatus | null;
  takeoverRequired?: boolean;
  takeoverReason?: string | null;
  resultJson?: Record<string, unknown> | null;
  inputJson?: Record<string, unknown> | null;
  normalizedInputJson?: Record<string, unknown> | null;
  input?: Record<string, unknown> | null;
  normalizedInput?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  usage?: Record<string, unknown> | null;
  failureCode?: string | null;
  failureReason?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
  semantic?: SemanticSummaryDTO | null;
}
```

### mapper 建议

`mapExecutionToDto()` 可从：

- `execution.normalizedInputJson.semantic`
- 或兼容旧结构中的 `normalizedInput.semantic`

读取并透传到 `ExecutionDto.semantic`。

对应 mapper 位置： [execution.mapper.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/control-plane/src/modules/execution/execution.mapper.ts#L6-L49)

### 说明

- `ExecutionDto.semantic` 应只暴露摘要，不暴露完整 `semanticModel`；
- 完整内容仍放在 `normalizedInputJson.semantic` 或调试快照中。

---

## 4.5 `ExecutionStepDto`

### 当前结构

当前 `ExecutionStepDto` 定义见 [execution.dto.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/control-plane/src/modules/execution/execution.dto.ts#L169-L229)。

### 推荐扩展

不建议第一阶段直接给 `ExecutionStepDto` 新增大量顶层字段。  
更稳妥的方式是扩展 `inputJson` 结构：

```json
{
  "requiredInputs": [],
  "groupedMissing": [],
  "semanticSummary": {
    "mode": "complex_document",
    "previewReady": true,
    "finalReady": false
  }
}
```

### 原因

- 当前 Portal 已经依赖 `step.inputJson.requiredInputs`；
- 在 `inputJson` 中扩展能减少 DTO 破坏；
- 便于逐步演进。

---

## 5. `normalizedInputJson` 结构建议

### 推荐结构

```json
{
  "input": {
    "buyerParty": "宁波海辰装备有限公司"
  },
  "requiredInputs": [],
  "__usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150
  },
  "semantic": {
    "mode": "complex_document",
    "previewReady": true,
    "finalReady": false,
    "groupedMissing": [],
    "fieldPolicies": [],
    "semanticModel": {},
    "fallbackReason": null,
    "confidence": 0.88,
    "debug": {
      "normalizedPaths": [],
      "notes": []
    }
  }
}
```

### 字段分工

- `input`：现有执行期输入快照；
- `requiredInputs`：现有字段级兼容容器；
- `semantic`：复杂文档语义增强容器；
- `__usage`：保留现有 token usage 汇总语义。

### 第一阶段最小要求

第一阶段只建议落以下字段：

```json
{
  "semantic": {
    "mode": "complex_document",
    "previewReady": true,
    "finalReady": false,
    "groupedMissing": []
  }
}
```

不必一开始就把 `semanticModel` 全量落库。

---

## 6. Planner API 草案

## 6.1 `POST /ai/plans/generate`

### 请求

请求结构保持不变：

```json
{
  "user_input": "生成采购合同",
  "user_id": "user-1",
  "modelId": "gpt-5.4",
  "context": {}
}
```

### 响应扩展

原响应基础上新增：

```json
{
  "plan_id": "plan-123",
  "planner_mode": "skill",
  "summary": "已识别技能 采购合同渲染，但仍缺少 2 个关键业务组。",
  "required_inputs": [],
  "semantic": {
    "mode": "complex_document",
    "previewReady": true,
    "finalReady": false,
    "groupedMissing": [
      {
        "group": "items",
        "title": "标的清单",
        "blocking": true,
        "summary": "至少补充 1 条设备清单",
        "fields": ["items[].deviceName", "items[].quantity", "items[].unit"]
      }
    ]
  }
}
```

### 兼容说明

- 未命中复杂文档任务时，`semantic` 可缺省；
- 旧调用方只消费 `required_inputs` 仍然成立。

---

## 6.2 `POST /ai/recognize-params`

### 建议

现有 `RecognizeParamsDTO / ResponseDTO` 不建议直接改成复杂结构。  
更推荐新增一条专用理解接口，而不是污染现有轻量接口。

---

## 6.3 新增候选接口：`POST /ai/document-semantics/understand`

### 目标

面向复杂文档任务，输出完整 `SemanticPayloadDTO`。

### 请求草案

```json
{
  "skillId": "21e835e6-3862-424a-855b-9700d577b3ae",
  "templateId": "template-123",
  "userInput": "生成采购合同，甲方是...",
  "context": {
    "sheetCount": 5,
    "loopGroups": ["items", "deliveryItems", "paymentSchedule"]
  },
  "recognizedParams": {},
  "paramsSchema": {}
}
```

### 响应草案

```json
{
  "semantic": {
    "mode": "complex_document",
    "previewReady": true,
    "finalReady": false,
    "groupedMissing": [],
    "fieldPolicies": [],
    "semanticModel": {},
    "confidence": 0.86,
    "fallbackReason": null,
    "debug": {
      "normalizedPaths": [],
      "notes": []
    }
  }
}
```

### 为什么建议新增而不是改旧接口

- `recognize-params` 适合轻量字段提取；
- 复杂文档语义理解输出明显更重；
- 单独接口更利于灰度、调试和回退。

---

## 7. Execution API 草案

## 7.1 `POST /executions`

第一阶段建议不改正式请求体，只通过：

- `planDraft.semantic`
- `input`

间接承载语义增强内容。

## 7.2 `GET /executions/{id}`

### 推荐响应扩展

```json
{
  "id": "execution-123",
  "status": "waiting_input",
  "normalizedInputJson": {
    "semantic": {
      "mode": "complex_document",
      "previewReady": true,
      "finalReady": false,
      "groupedMissing": []
    }
  },
  "semantic": {
    "mode": "complex_document",
    "previewReady": true,
    "finalReady": false,
    "groupedMissing": []
  }
}
```

### 说明

- `normalizedInputJson.semantic` 用于完整数据承载；
- `ExecutionDto.semantic` 用于摘要透传；
- Portal 优先读取摘要，必要时再从 `normalizedInputJson` 兜底。

## 7.3 `GET /executions/{id}/steps`

### 推荐响应扩展

等待输入步骤的 `inputJson` 增加：

```json
{
  "requiredInputs": [],
  "groupedMissing": [],
  "semanticSummary": {
    "mode": "complex_document",
    "previewReady": true,
    "finalReady": false
  }
}
```

---

## 8. 版本与兼容策略

### 第一阶段

- 所有新增字段均 optional；
- 不升大版本；
- 通过“增量扩展”方式兼容现有客户端。

### 第二阶段

如果后续需要冻结为正式稳定契约，建议考虑：

- `Planner API v2`
- `Execution API v2`

冻结对象优先级：

1. `GroupedMissingDTO`
2. `SemanticSummaryDTO`
3. `RequiredLevelDTO`
4. `RenderImpactDTO`

---

## 9. 推荐最小实现子集

如果只实现第一轮最关键的契约，建议最小子集是：

- `RequiredInputDTO.group`
- `RequiredInputDTO.requiredLevel`
- `RequiredInputDTO.renderImpact`
- `PlanDraftDTO.semantic`
- `ExecutionDto.semantic`
- `normalizedInputJson.semantic.previewReady`
- `normalizedInputJson.semantic.finalReady`
- `normalizedInputJson.semantic.groupedMissing`

这组字段足以支撑：

- Planner 复杂任务增强；
- Execution 语义透传；
- Portal 分组展示；
- 聊天 WAITING_INPUT 文案增强。

---

## 10. 一句话总结

> `semantic` 契约的最佳落法不是替换现有 DTO，而是在 `PlanDraftDTO`、`RequiredInputDTO`、`ExecutionDto` 和 `normalizedInputJson` 上做最小兼容扩展：保留字段级协议，同时新增组级摘要、就绪度和字段策略语义，为复杂文档任务提供稳定的增强接口。

