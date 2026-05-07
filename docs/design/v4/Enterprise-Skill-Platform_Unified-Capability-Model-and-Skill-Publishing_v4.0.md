# 企业级 Skill 平台：统一能力模型与 Skill 发布指南

**Unified Capability Model & Skill Publishing Guide v4.0**  
日期：2026-05-06

> 本文档定义如何将浏览器录制（Recorder）、浏览器执行（Execution）与平台正式发布链路（Skill / Release）收敛为一条统一能力路径。  
> 本指南遵循 `v4 Master` 的“契约优先”原则，并以当前代码现态为锚点，区分“已落地能力”“过渡形态”“目标形态”。

---

## 1. 文档定位

本文不是对未来理想状态的抽象宣言，而是用于回答三个落地问题：

1. 当前项目里，录制、执行、发布分别已经做到哪里。
2. 从当前实现走到“录制即 Skill”的过程中，中间需要补哪些正式对象和接口。
3. 如何保证同一浏览器行为在 `/recorder`、AI Chat、Portal Workflow、API 执行中保持一致。

当前系统中，这三条链路已经部分存在，但尚未完全打通：

- **录制链路**：`/recorder` + `ai-orchestrator/recorder-debug.service.ts` 已经能够沉淀浏览器命令、导出脚本，并生成内部 `publishPayload`。
- **执行链路**：`control-plane` / `ai-orchestrator` 可以通过 `browser_step` 工具驱动 `browser-worker` 执行浏览器步骤。
- **发布链路**：`platform/capability-release` 已经具备 `SkillDraftDTO -> Publish -> Skill` 的正式发布能力。

核心问题不在于“完全没有能力”，而在于这三条链路之间仍存在明显断层：

- Recorder 原生导出对象仍是调试/导出导向；当前依赖 bridge 进入正式 `SkillDraftDTO`
- 浏览器录制虽然已进入正式 `sourceType`，但 source snapshot 元数据与验证规则仍不完整
- 参数抽取、步骤抽象、运行时约束仍分散在不同层中
- Recorder 到 release/draft 的桥接契约仍需进一步收敛（字段稳定性、错误码目录、回放验证）

本文的目标是把这条路径收敛为一个统一的 **Capability Program**。

### 1.1 范围锁定（避免偏离目标）

`In Scope`（本阶段必须完成）：

- `browser_recording` 发布链路稳定化（bridge 输入输出协议、错误码、测试回归）
- `SkillDraft` 中 `executionFlow` 的一致性约束（写入、更新、发布前校验）
- source snapshot 的录制元数据沉淀（最小必要字段）
- 发布前验证链路补齐（先静态校验，后静默回放）

`Out of Scope`（本阶段不展开）：

- 重做 Planner 自然语言理解逻辑
- 重构 `browser-worker` 适配器框架
- 新建独立前端产品形态（仅允许在现有 `/recorder` 上增量改造）
- 大范围服务拆分与部署拓扑重构

### 1.2 阶段验收门槛（Go/No-Go）

为确保本阶段不偏离目标，以下四项全部满足才允许进入下一阶段。

| 验收项 | Go 条件（必须满足） | No-Go 触发条件 |
| --- | --- | --- |
| Bridge 稳定化 | `POST /capabilities/bridge/recorder-export` 在主流程可用；关键错误码（`missing_publish_payload`、`invalid_release_type`、`release_approval_pending`、`release_approval_rejected`、`skill_publish_tool_validation_failed`）均可稳定返回 | 仍依赖文案字符串分支；错误结构不稳定；无回归测试 |
| `executionFlow` 一致性 | `SkillDraft` 的 `executionFlow` 可写入、可更新、发布时可被正确消费；关键流程有自动化测试覆盖 | 发布前后 `executionFlow` 语义漂移；更新后未进入 `draftPayload` 或发布落地 |
| Snapshot 元数据 | `browser_recording` 的 source snapshot 至少包含 `goal/paramsSchema/executionFlow/tools/runtimeMetadata/recordingCommands/guidance` | 录制关键信息仅存在临时导出对象，无法在 release 维度追溯 |
| 发布前验证 | 至少完成静态校验（结构完整性、关键字段约束）；并具备回放验证接入位 | 无校验直接发布；发布失败后无法定位是参数问题还是脚本问题 |

建议执行规则：

- 任一项出现 `No-Go`，则暂停扩展功能，先修复该项缺口。
- 所有项满足 `Go` 后，再进入 `BrowserActionStep[]` 统一中间层阶段。

---

## 2. 当前代码现状锚点

在进入目标设计前，需要先固定现态边界，避免把未实现能力误写成既成事实。

### 2.1 Recorder 当前真实产物

当前 `recorder-debug.service.ts` 已经可以生成：

- `script`
- `guidance`
- `skillDraft`
- `skillDraft.publishPayload`
- `executionPlan`
- `commands`

其中，`publishPayload` 已包含以下关键字段：

- `name`
- `description`
- `triggerKeywords`
- `paramsSchema`
- `executionFlow`
- `tools`
- `apiEndpoints.runtimeMetadata`

这说明 Recorder 已经具备“生成 Skill 发布草案”的雏形，但它还不是 `platform` 模块中的正式 `SkillDraftDTO`。

### 2.2 Browser Runtime 当前真实边界

`browser-worker` 当前已经存在正式的 `BrowserExecutionAdapter` 接口，并已经落地：

- `LegacyCodegenAdapter`
- `PlaywrightCliAdapter`
- `ChromeDevtoolsCliAdapter`

这意味着浏览器运行时“适配层”已经成立，文档后续设计应尽量复用现有 `BrowserExecutionAdapter`，而不是重新发明另一套浏览器抽象。

### 2.3 Capability Release 当前真实边界

`platform/capability-release` 当前已具备：

- `SkillDraftDTO`
- `generateSkillDraft`
- `updateSkillDraft`
- `publishSkillDraft`
- `getPublishedSkillRuntimeContext`

当前 `CapabilitySourceType` 已支持：

- `execution_flow_template`
- `temporal_workflow`
- `browser_recording`

这意味着“浏览器录制”已经可以作为正式能力源进入发布链路；当前 bridge 的价值主要在于把 `recorder-debug` 导出结构稳定映射为 release/draft，而不是继续借道 `execution_flow_template` 类型本身。

### 2.4 Tool Governance 当前真实语义

当前 `ToolCatalog` 管的是**工具目录**，不是 Skill 目录。  
Skill 发布后不会“进入 ToolCatalog 成为一个工具”，而是：

- Skill 自身作为发布对象被持久化
- Skill 通过 `tools` / `SkillToolBinding` 绑定允许使用的工具
- 运行时通过 `getPublishedSkillRuntimeContext()` 获取允许工具与工具策略

因此，后续设计必须避免把 `Skill` 和 `Tool` 混为一谈。

---

## 3. 统一能力模型 (Unified Capability Model)

一个可发布能力应由五个维度组成，形成统一的 **5-Layer Program Model**。

### 3.1 意图层 (Intent Layer)

- **定义**：用户想完成什么目标。
- **当前锚点**：`userGoal`、录制会话描述、AI Prompt。
- **正式产物**：`Skill.name`、`Skill.description`、`triggerKeywords`。

### 3.2 参数层 (Param Layer)

- **定义**：执行前必须补齐的动态输入。
- **当前锚点**：`recorder-debug.service.ts` 中对 `url`、`query`、`value`、`resultIndex` 等参数的推断。
- **正式产物**：`paramsSchema`。
- **约束**：参数层必须只描述“调用方可变输入”，不能把固定执行计划重新暴露给调用方编辑。

### 3.3 行为层 (Behavior Layer)

- **定义**：能力实际执行的步骤序列。
- **当前锚点**：`BrowserCommand[]` + `executionFlow` 中的 `browser_step` 配置。
- **目标产物**：统一步骤模型。

这里需要区分两层：

- **过渡形态**：当前先以 `BrowserCommand[]` 作为事实来源，封装进 `executionFlow.config.executionPlan.commands`
- **目标形态**：后续再引入更强的 `BrowserActionStep[]`，用于统一 AI 录制、手动录制、脚本导出、模板导出

### 3.4 运行时层 (Runtime Layer)

- **定义**：执行这组行为所需的运行时约束。
- **当前锚点**：`BrowserExecutionAdapter`、`runtimeSessionId`、`backend`、工具策略、部署记录。
- **当前正式产物**：`getPublishedSkillRuntimeContext()` 返回的 `runtimeType`、`allowedToolNames`、`toolPolicies`、`runtimeSource`、`deploymentId` 等。
- **目标增强**：未来可扩展为包含浏览器 adapter、会话策略、环境基线的更强运行时上下文，但这不应被误写为当前已经存在的字段。

### 3.5 发布层 (Release Layer)

- **定义**：能力如何成为可追踪、可审计、可回滚的正式交付对象。
- **当前锚点**：`CapabilityRelease`、`SkillDraftDTO`、`publishSkillDraft`。
- **核心问题**：Recorder 当前产出的草案对象还未成为正式 `sourceSnapshot -> draft -> publish` 流水线的一部分。

---

## 4. 统一路径：从录制到正式 Skill

### 4.1 目标路径

推荐的正式链路应为：

`Recorder Session -> Capability Source Snapshot -> Skill Draft -> Publish -> Skill -> Execution`

含义如下：

1. **Recorder Session**
   负责收集目标、参数线索、浏览器命令、观察结果和脚本片段。
2. **Capability Source Snapshot**
   把一次录制沉淀为正式快照对象，而不是仅停留在临时导出结果。
3. **Skill Draft**
   基于快照生成可编辑的正式发布草稿。
4. **Publish**
   经校验后进入 `platform` 的正式发布逻辑。
5. **Skill / Execution**
   Skill 被北向消费，Execution 负责编排，Runtime 负责执行。

### 4.2 过渡路径

当前已支持 `browser_recording`，过渡重点从“类型绕行”变为“接口桥接稳定化”：

#### 方案 A：沿用 `execution_flow_template` 兼容桥接（历史过渡）

做法：

- Recorder 先把 `BrowserCommand[]` 包装成标准 `executionFlow`
- 再由现有 `capability-release` 把它当作 `execution_flow_template` 来源处理

优点：

- 改动最小
- 能最大程度复用现有 `generateSkillDraft / publishSkillDraft`

缺点：

- 语义不够准确
- 录制特有元数据（DOM 锚点、截图、观察信息）难以完整表达

#### 方案 B：使用 `browser_recording` 正式 sourceType（当前实现）

做法：

- 使用已落地的 `CapabilitySourceType.browser_recording`
- 为 Recorder 引入专属 source snapshot
- 在 `capability-release` 中补齐浏览器录制的 draft 构造逻辑

优点：

- 语义最清晰
- 更适合长期演进

缺点：

- 需要补齐更多数据模型和发布逻辑

建议：

- **当前采用方案 B 作为主路径**
- **保留方案 A 仅用于历史兼容回退**

---

## 5. 关键对象映射

为了避免实现时对象漂移，建议用下表统一术语。

| 层 | 当前对象 | 过渡对象 | 目标对象 |
| --- | --- | --- | --- |
| Intent | `userGoal` / 对话文本 | `publishPayload.name/description` | 正式 Skill 元数据 |
| Param | `inferSkillParameters()` 结果 | `paramsSchema` | 带验证与提取策略的参数模型 |
| Behavior | `BrowserCommand[]` | `executionFlow` 中的 `browser_step` | `BrowserActionStep[]` + 标准 DSL |
| Runtime | `backend` / `runtimeSessionId` / adapter | Runtime metadata | 扩展版 runtime context |
| Release | 内部 `publishPayload` | `SkillDraftDTO` 桥接 | 正式 Capability Source + Draft + Publish |

---

## 6. 技术实现要点

### 6.1 统一执行流

短期内，Skill 的统一执行流不应依赖尚未落地的新模型，而应直接复用当前已经存在的 `browser_step` 工具语义。

建议执行流示例：

```json
{
  "id": "skill_id_123",
  "name": "查询并导出报表",
  "executionFlow": [
    {
      "id": "step_browser_recording_execute",
      "type": "tool",
      "tool": { "name": "browser_step" },
      "config": {
        "executionMode": "recording_script",
        "parameterMode": "collected_only",
        "executionPlan": {
          "backend": "cli",
          "runtimeSessionId": "recorder-session-1",
          "commands": [
            { "tool": "navigate", "params": { "url": "https://erp.com" } },
            { "tool": "fill", "params": { "selector": "#user", "value": "{{params.username}}" } }
          ]
        }
      }
    }
  ]
}
```

这里优先对齐当前 `recorder-debug.service.ts` 的真实 payload 结构，而不是使用项目里尚未存在的字段名。

### 6.2 Recorder 的职责扩展

`/recorder` 前端建议增加“发布向导”，但应按当前系统能力分阶段做：

1. **P1：命令复核**
   展示当前录制得到的 `BrowserCommand[]` 与可推断参数。
2. **P2：参数编辑**
   允许用户确认哪些值进入 `paramsSchema`。
3. **P3：正式发布**
   调用 `platform/capability-release` 的桥接接口，生成正式 `SkillDraftDTO`。

这样可以先打通发布链，再逐步升级到更强的步骤中间层。

### 6.3 browser-worker 的角色边界

`browser-worker` 应继续扮演 **Runtime Adapter Host**，而不是承担 Skill Registry 职责。

它应该负责：

- 浏览器 session 初始化
- 命令执行
- 会话冻结 / 恢复
- 结果归一化

它不应该负责：

- 发布 Skill
- 持久化 Skill 元数据
- 决定某个能力是否进入正式发布体系

### 6.4 Tool Governance 的接入方式

Recorder 生成的 Skill 在发布后，不是“变成一个新工具”，而是：

- 在 `Skill` 中声明 `tools`
- 由 `SkillService` 同步 `SkillToolBinding`
- 由 `CapabilityReleaseService.getPublishedSkillRuntimeContext()` 下发允许工具与策略

这点必须在产品设计和文档命名上保持一致。

### 6.5 API 桥接草案

为了让 Recorder 真正进入正式发布链，建议新增一层桥接 API，而不是要求前端自己拼装多段能力发布请求。

#### 6.5.1 当前已存在的接口

Recorder 当前已存在：

- `POST /ai/recorder-debug/chat`
- `POST /ai/recorder-debug/export`
- `POST /ai/recorder-debug/reset`

Capability Release 当前已存在：

- `POST /capability-releases/:id/generate-skill-draft`
- `GET /capability-releases/:id/skill-draft`
- `PUT /capability-releases/:id/skill-draft`
- `POST /capability-releases/:id/publish-skill`

问题在于，这两组接口之间没有直接桥接关系。

#### 6.5.2 推荐新增接口

推荐在 `platform` 增加桥接入口：

`POST /capabilities/bridge/recorder-export`

用途：

- 接收 Recorder 导出的结构化结果
- 自动创建或复用一个 capability release
- 自动写入 source snapshot / source payload
- 自动生成一个可编辑的 `SkillDraftDTO`

推荐请求体：

```json
{
  "sessionId": "recorder-debug-123",
  "userGoal": "登录 ERP 并查询报表",
  "sourceMode": "recorder_debug",
  "exportArtifacts": {
    "skillDraft": {
      "name": "erp-report-query",
      "description": "浏览器录制生成技能",
      "parameters": [],
      "publishPayload": {
        "name": "erp-report-query",
        "description": "浏览器录制生成技能：登录 ERP 并查询报表",
        "triggerKeywords": ["ERP查询报表"],
        "paramsSchema": {
          "properties": {},
          "required": []
        },
        "executionFlowTemplateIds": [],
        "executionFlow": [
          {
            "id": "step_browser_recording_execute",
            "type": "tool",
            "tool": { "name": "browser_step" },
            "config": {
              "executionMode": "recording_script",
              "parameterMode": "collected_only",
              "executionPlan": {
                "backend": "cli",
                "runtimeSessionId": "recorder-debug-123",
                "commands": []
              }
            }
          }
        ],
        "tools": ["skill_match", "browser_step"],
        "apiEndpoints": {
          "runtimeMetadata": {
            "sourceType": "browser_recording"
          }
        }
      }
    },
    "commands": [],
    "guidance": "..."
  }
}
```

推荐返回体：

```json
{
  "release": {
    "id": "release-id"
  },
  "skillDraft": {
    "id": "draft-id",
    "name": "erp-report-query"
  },
  "bridgeMode": "browser_recording_native"
}
```

推荐错误结构（用于前端按 `code` 分支）：

```json
{
  "statusCode": 400,
  "code": "missing_publish_payload",
  "message": "缺少 exportArtifacts.skillDraft.publishPayload"
}
```

当前 bridge 关键错误码：

- `missing_publish_payload`：缺少最小发布载荷。
- `invalid_release_type`：传入的 `releaseId` 不是 `browser_recording` 类型。
- `release_approval_pending`：发布时审批状态仍为 pending。
- `release_approval_rejected`：发布时审批已被拒绝。
- `skill_publish_tool_validation_failed`：发布前工具治理校验失败。

#### 6.5.3 桥接服务职责

建议新增 `RecorderSkillBridgeService`，职责如下：

1. 校验 Recorder 导出结果是否包含最小可发布字段。
2. 将 `publishPayload` 转换为当前 `capability-release` 可接受的 source payload。
3. 创建或查找对应的 release。
4. 生成正式 `SkillDraftDTO`。
5. 返回 release 与 draft，交由前端继续编辑和发布。

这样，前端只需要调用一个桥接接口，而不必理解 `capability-release` 的内部阶段机。

### 6.6 字段映射规则

#### 6.6.1 Recorder Export -> SkillDraftDTO

推荐的直接映射关系如下：

| Recorder 导出字段 | 目标字段 | 说明 |
| --- | --- | --- |
| `publishPayload.name` | `SkillDraftDTO.name` | 可直接复用 |
| `publishPayload.description` | `SkillDraftDTO.description` | 可直接复用 |
| `publishPayload.triggerKeywords` | `SkillDraftDTO.triggerKeywords` | 可直接复用 |
| `publishPayload.paramsSchema` | `SkillDraftDTO.paramsSchema` | 可直接复用 |
| `publishPayload.executionFlowTemplateIds` | `SkillDraftDTO.executionFlowTemplateIds` | 当前通常为空 |
| `publishPayload.tools` | `SkillDraftDTO.tools` | 进入工具治理链 |
| `publishPayload.apiEndpoints` | `SkillDraftDTO.apiEndpoints` | 保存 runtime metadata |
| `publishPayload` 全量 | `SkillDraftDTO.draftPayload` | 作为完整草案事实源 |

#### 6.6.2 Recorder Export -> Capability Source Payload

如果短期走 `execution_flow_template` 兼容方案，建议把以下字段落入 `sourcePayload`：

| Recorder 导出字段 | sourcePayload 字段 |
| --- | --- |
| `userGoal` | `goal` |
| `publishPayload.description` | `description` |
| `publishPayload.paramsSchema` | `paramsSchema` |
| `publishPayload.executionFlow` | `executionFlow` |
| `publishPayload.tools` | `tools` |
| `publishPayload.apiEndpoints.runtimeMetadata` | `runtimeMetadata` |
| `commands` | `recordingCommands` |
| `guidance` | `guidance` |

这样后续即使重建 Skill Draft，也仍然能从 source snapshot 恢复足够上下文。

### 6.7 当前 DTO 限制与建议修改

当前 `UpdateSkillDraftDTO` 只支持更新：

- `name`
- `description`
- `triggerKeywords`
- `paramsSchema`
- `executionFlowTemplateIds`
- `tools`
- `apiEndpoints`

目前该限制已经解除：`UpdateSkillDraftDTO` 已支持 `executionFlow`，并已在 `capability-release` 中进入 `draftPayload` 合并逻辑。

因此，当前重点不再是“能不能写入 executionFlow”，而是“如何保证 executionFlow 在发布前后的一致性校验与回放验证”。

后续建议收敛为两项：

#### 方案 A：发布前静态校验增强（推荐先做）

- 对 `executionFlow` 中的 `tool`、`config.executionPlan.commands` 做结构校验。
- 对 `browser_step` 的关键字段（backend/runtimeSessionId/commands）做最小约束。

#### 方案 B：发布前回放验证补齐（中期）

- 针对 `browser_recording` sourceType 增加静默回放。
- 将回放结果写入 release audit，形成可追踪证据链。

---

## 7. 行为统一性保证

为了保证录制、调试、工作流和正式 Skill 的行为一致，建议明确以下三条硬约束：

### 7.1 同一执行后端

- 录制时使用的 browser backend
- 调试时调用的 `browser_step`
- 正式 Skill 发布后的运行时 backend

三者必须可追踪，并尽量保持一致。当前最合适的统一目标是 `PlaywrightCliAdapter`，但过渡期允许 `legacy` 与 `chrome-devtools` 共存。

### 7.2 同一执行计划事实源

短期统一事实源应为：

- `BrowserCommand[]`

而不是：

- 手动录制脚本文本
- 前端临时模板结构
- AI 自由解释后的二次步骤

只有这样，才能避免“同一录制在不同出口行为不同”。

### 7.3 同一运行时治理

正式 Skill 的执行必须经过：

- `allowedToolNames`
- `toolPolicies`
- deployment/runtime context

而不能绕过 `platform` 直接以调试态调用浏览器运行时，否则会破坏 `v4` 的治理边界。

---

## 8. 优化后的实施路线图

### P1：桥接当前 Recorder 与正式 Release（已完成）

- 为 Recorder 新增“导出为正式草稿”接口
- 把当前内部 `publishPayload` 映射为 `SkillDraftDTO`
- 使用 `browser_recording` 作为 release source type
- 允许在草案层保留 `executionFlow`

### P2：补齐浏览器录制 source snapshot 与验证元数据

- 增加 `browser_recording` source snapshot
- 让录制元数据进入正式 source snapshot 模型

### P3：统一步骤中间层

- 从 `BrowserCommand[]` 升级到 `BrowserActionStep[]`
- 统一 AI 录制、手动录制、脚本导出、模板导出

### P4：补齐验证与回放

- 发布前增加静默回放校验
- 为 DOM 锚点、截图、页面观察建立验证规则
- 将验证结果纳入 release audit

### P5：补齐正式 DTO 与接口契约

- 固化 bridge 输入输出协议（请求字段、响应字段、错误码）
- 明确 `browser_recording_native` 语义，不再沿用兼容命名
- 冻结 Recorder 导出对象到正式 Skill Draft 的映射规则

---

## 9. 最小实现清单

如果目标是尽快打通“录制 -> 发布”为一条最小闭环，建议最先改以下位置：

### 9.1 ai-orchestrator

- [recorder-debug.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/modules/browser-command/recorder-debug.service.ts)
  保持当前导出能力不变，但建议稳定 `publishPayload` 结构，视为桥接输入契约
- [recorder-debug.controller.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/ai-orchestrator/src/modules/browser-command/recorder-debug.controller.ts)
  可保留 `/export`，作为桥接前的数据出口

### 9.2 platform / capability-release

- [interfaces.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/platform/src/modules/capability-release/interfaces.ts)
  已补 `executionFlow?`，且已支持 `browser_recording` source type
- [capability-release.controller.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/platform/src/modules/capability-release/capability-release.controller.ts)
  已新增 Recorder bridge endpoint（`/capabilities/bridge/recorder-export`）
- [capability-release.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/platform/src/modules/capability-release/capability-release.service.ts)
  已新增 bridge service 入口与 draft payload 写入逻辑，并补充结构化错误码

### 9.3 platform / skill

- [skill.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/core/platform/src/modules/skill/skill.service.ts)
  当前已支持 `executionFlow`，可直接作为发布落点复用

### 9.4 验收标准

- Recorder 导出结果可一键生成正式 release 和 draft
- 生成后的 draft 可在 `platform` 页面继续编辑
- 发布后的 Skill 保留 `browser_step` 执行流
- 运行时工具校验仍能通过 `SkillToolBinding` 和 `ToolCatalog` 生效

---

## 10. 最终结论

这条设计路线最重要的优化，不是再发明一个新的“录制产物”，而是把当前已经存在的三套能力用正式对象串起来：

- Recorder 继续负责采集与导出
- `browser-worker` 继续负责统一浏览器执行
- `platform/capability-release` 负责正式草稿、发布、部署与治理

当前已完成最小闭环：`BrowserCommand[] + browser_step + SkillDraftDTO bridge + browser_recording sourceType`。  
下一阶段的核心目标应聚焦为：`BrowserActionStep[]` 统一中间层与正式验证流水线（静态校验 + 回放验证 + 审计沉淀）。

这样才能真正做到：

- 同一行为只定义一次
- 同一能力可在多个入口复用
- 同一 Skill 同时具备可发布、可治理、可审计、可回滚的企业级属性
