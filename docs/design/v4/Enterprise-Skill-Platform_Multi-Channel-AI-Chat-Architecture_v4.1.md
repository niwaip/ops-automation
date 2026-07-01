# Enterprise Skill Platform Multi-Channel AI Chat Architecture v4.1

## 0. 架构评审结论

本版在 `v4.0` 基础上吸收了架构评审意见，并结合当前代码现状进行了收敛。总体评价如下：

- 战略方向正确：`协议内核 + 适配层 + 渲染层` 是当前最可持续的演进路径。
- 问题识别准确：`ChatWindow / ChatMessage / chatApi` 的职责耦合和文件膨胀，确实是当前最需要处理的结构性问题。
- 最大薄弱点已明确：`输出格式协议`、`结构化结果 schema`、`流式事件可靠性`、`跨通道能力矩阵` 在 `v4.0` 中定义不足，需要提升为一等设计对象。

本次文档修订重点引入以下增强：

1. `ContentPart` 消息内容模型，替代单一 `content: string`
2. `ExecutionResultPayload` / schema registry 设计
3. 带 `seq / protocol_version / session_id` 的统一流式事件协议
4. `ChannelCapability` 能力矩阵与降级决策
5. `context_strategy` 长会话上下文策略
6. `TaskAction.action_id` 幂等性交互协议
7. 面向实施的 `P0 / P1 / P2 / P3` 优先级重排

## 1. 背景

当前平台已经在两个前端形态中提供 AI 聊天能力：

- `5173 portal`：具备相对完整的 AI 聊天窗口、流式任务执行反馈、审批/补参/人工接管交互。
- `5174 user-web`：正在向 portal 聊天体验收敛，并逐步复用相同的任务语义。

后续规划中，AI 聊天能力不应只服务于 Web 前端，还需要支持：

- 桌面 App
- 第三方 IM / Bot 通道，例如企业微信、微信、飞书、钉钉
- 通过协议转换接入的外部系统、Webhook、消息总线

如果继续以“页面实现”为复用边界，会出现以下问题：

- Web 端之间仍会出现重复实现和体验漂移。
- 桌面端只能复制 UI，无法复用执行语义和状态机。
- 第三方通道缺少统一协议，只能为每个通道单独重做一套聊天流程。
- `审批 / 等待输入 / 人工接管 / 继续执行` 等复杂任务能力难以跨端一致。

因此，本设计的目标是将当前聊天能力抽象为“统一 AI 会话内核 + 多通道适配层 + 多端渲染层”。

## 2. 设计目标

### 2.1 核心目标

1. 将 AI 聊天能力从单一 Web 页面实现中解耦。
2. 统一聊天消息模型、流式事件协议和任务状态语义。
3. 支持 Web、桌面、第三方通道复用同一套会话和任务交互能力。
4. 将复杂任务交互能力标准化，包括：
   - 等待输入
   - 等待审批
   - 人工接管
   - 恢复执行
   - 任务完成结果展示
5. 将 UI 作为可替换渲染器，而不是业务协议承载体。

### 2.2 非目标

本阶段不直接实现以下内容：

- 不一次性重写所有现有聊天页面。
- 不直接替换所有现有 `portal` / `user-web` 聊天组件。
- 不在本设计中定义所有第三方 IM 的具体接入细节。
- 不要求所有端完全共享同一套 UI，只要求共享同一套协议和能力内核。

## 3. 当前现状与问题

### 3.1 现状

当前 `portal` 聊天实现已经具备较强能力：

- 流式聊天与任务执行
- 模型选择
- 文件上传和语音输入
- 结构化结果展示
- 审批与驳回
- 等待输入补参
- 人工接管与继续执行

但当前实现仍然存在较强耦合：

- `ChatWindow` 同时承担页面编排、流式事件解释、任务状态迁移、审批调用、通知更新。
- `ChatInput` 依赖 store 和 API。
- `ChatMessage` 夹带了执行语义、执行结果解析、浏览器执行展示逻辑。
- 流式事件协议解释逻辑分散在前端页面中。

结合当前代码，可进一步确认以下问题已经具备“立即治理”的条件：

- `ChatMessage.tsx` 已超过千行，同时承担：
  - 业务状态解释
  - 审批/驳回 UI
  - 等待输入渲染
  - Browser 执行结果解析
  - Markdown 渲染
- `ChatWindow.tsx` 直接调用 `streamChat`、`executionApi`、`notificationStore`，属于典型容器巨石。
- `chatApi.ts` 中内联了大量 stream normalize 与 metadata 解释逻辑，导致协议层与 API 层耦合。

因此，`Stream Event Reducer` 抽离不是“可选优化”，而是当前收益最高的 P1 改造。

### 3.2 核心问题

#### 问题 A：复用边界错误

当前最容易被复用的是“页面组件”，但真正应该被复用的是：

- 消息协议
- 会话状态机
- 流式事件 reducer
- 任务交互动作

#### 问题 B：复杂任务交互没有标准化

当前以下能力虽然已经存在，但仍依赖前端页面自己拼装：

- `waiting_input`
- `pending_approval`
- `human_control`
- `completed`
- `failed`

这些语义应该沉到统一会话内核，而不是散落在不同前端页面中。

#### 问题 C：第三方通道没有统一映射方式

微信或 Bot 通道天然不具备完整 Web UI，需要将聊天协议转换为：

- 文本摘要
- markdown
- 按钮消息
- 菜单交互
- 深链接跳转

当前架构缺少统一的通道桥接层。

#### 问题 D：输出格式协议缺位

当前消息模型仍然默认：

- `content: string`
- `finalResultData?: unknown`
- `data?: Record<string, unknown>`

这种定义在单一 Web 页面中还能勉强工作，但一旦进入多通道场景，会立刻暴露问题：

- Web Renderer 需要 markdown 与结构化卡片
- IM Renderer 只支持文本、按钮、深链接
- 流式 JSON 若无 schema 和 chunk-level 约束，前端无法稳定增量消费
- `unknown` 会导致大量 `asRecord / asString / tryParse` 防御代码扩散到展示层

因此，输出格式协议必须提升为本设计的核心组成部分，而不是附属字段。

## 4. 总体架构

目标架构分为四层：

```text
+------------------------------------------------------+
| Presentation Layer                                   |
| Web UI / Desktop UI / IM Message Renderer            |
+------------------------------------------------------+
| Channel Adapter Layer                                |
| Web Adapter / Desktop Adapter / IM Adapter           |
+------------------------------------------------------+
| Chat Domain Core                                     |
| Session / Message / Stream Reducer / Task Actions    |
+------------------------------------------------------+
| AI Gateway / Orchestrator / Execution Services       |
| Chat API / Execution API / Upload / Approval / etc.  |
+------------------------------------------------------+
```

### 4.1 Chat Domain Core

这是未来复用的核心层，负责：

- 统一消息模型
- 统一会话模型
- 流式事件 reducer
- 任务状态迁移
- 等待输入 / 审批 / 接管 等交互状态管理
- 统一动作接口定义

要求：

- 不依赖 React
- 不依赖 Ant Design
- 不依赖具体页面
- 不依赖具体通道

### 4.2 Channel Adapter Layer

这是多端和多通道接入的关键桥梁，负责将不同端的事件和协议转换成统一 Chat Core 可理解的模型。

包括：

- Web Adapter
- Desktop Adapter
- IM Adapter
- Webhook Adapter

### 4.3 Presentation Layer

负责展示，不承担协议解释职责。

可能的呈现形态：

- Web Chat Window
- Desktop Chat Panel
- 微信/企微 Bot 文本卡片
- 外部控制台嵌入式聊天面板

### 4.4 AI Gateway / Orchestrator

对外提供稳定的聊天服务接口，包括：

- 创建/恢复会话
- 发送消息
- 流式返回事件
- 文件上传
- 模型选择
- 批准/驳回
- 补参提交
- 人工接管恢复

## 5. 统一协议设计

### 5.1 Session 模型

```ts
interface UnifiedChatSession {
  sessionId: string;
  userId?: string;
  tenantId?: string;
  channelType: 'web' | 'desktop' | 'wechat' | 'wecom' | 'feishu' | 'webhook';
  channelUserId?: string;
  channelThreadId?: string;
  title?: string;
  status: 'active' | 'archived';
  contextStrategy?: 'sliding_window' | 'summary_compress' | 'retrieval_augment' | 'full';
  contextWindowTokens?: number;
  createdAt: string;
  updatedAt: string;
}
```

补充说明：

- `contextStrategy` 用于长会话上下文管理，避免复杂任务场景中“上下文截断导致任务失败”。
- `sliding_window` 适合短期高频对话。
- `summary_compress` 适合多轮长会话。
- `retrieval_augment` 适合结合记忆/RAG 的企业知识型会话。
- `full` 仅适合短会话或调试场景。

### 5.2 Message 模型

```ts
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'markdown'; markdown: string }
  | { type: 'structured_result'; schemaType: string; data: unknown }
  | { type: 'task_card'; taskStatus: ChatTaskStatus; executionId: string }
  | { type: 'approval_card'; executionId: string; riskLevel?: string }
  | { type: 'file_ref'; fileId: string; fileName: string; mimeType?: string }
  | { type: 'deeplink'; url: string; label: string };

interface UnifiedChatMessage {
  messageId: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  contentParts: ContentPart[];
  fallbackText?: string;
  attachments?: ChatAttachment[];
  metadata?: ChatMessageMetadata;
  createdAt: string;
}
```

设计说明：

- `content: string` 不再作为唯一内容承载字段，而是由 `contentParts` 驱动。
- `fallbackText` 用于低能力通道或日志归档。
- Web 端可完整渲染 `structured_result / task_card / approval_card`。
- IM / Bot 通道只需消费 `text / markdown / deeplink`，从而天然具备降级能力。
- 这比在 Adapter 层“临时猜测如何降级”更稳定，因为消息模型本身已经携带了降级信息。

### 5.2.1 结构化结果 Schema Registry

当前代码中 `finalResultData?: unknown` 是高风险类型债务，必须逐步收敛为可验证 schema。

建议在 `packages/contracts` 中建立执行结果 schema registry：

```ts
import { z } from 'zod';

export const BrowserTaskResultSchema = z.object({
  type: z.literal('browser_task'),
  screenshots: z.array(z.string().url()).optional(),
  extractedData: z.record(z.unknown()).optional(),
  summary: z.string(),
});

export const ReportResultSchema = z.object({
  type: z.literal('report'),
  downloadUrl: z.string().url(),
  previewUrl: z.string().url().optional(),
  fileName: z.string(),
});

export const ExecutionResultPayloadSchema = z.discriminatedUnion('type', [
  BrowserTaskResultSchema,
  ReportResultSchema,
]);
```

收敛目标：

- 后端不再输出无约束 `unknown`
- 前端不再依赖大量 `asRecord / asString`
- Web、Desktop、IM 渲染器统一基于 `schemaType + data` 消费结构化结果
- 支持未来与 `Structured Outputs`、`streamObject`、`Partial[T]` 等生态能力对接

### 5.3 Task 状态模型

```ts
type ChatTaskStatus =
  | 'running'
  | 'waiting_input'
  | 'pending_approval'
  | 'human_control'
  | 'completed'
  | 'failed';
```

### 5.4 Stream Event 协议

建议统一为以下事件集合：

```ts
type UnifiedStreamEventType =
  | 'thought'
  | 'action'
  | 'observation'
  | 'result'
  | 'waiting_input'
  | 'pending_approval'
  | 'human_control'
  | 'error'
  | 'session_patch';
```

```ts
interface UnifiedStreamEvent {
  seq: number;
  protocolVersion: '1';
  sessionId: string;
  type: UnifiedStreamEventType;
  content: string;
  data?: ContentPart | ContentPart[];
  iteration?: number;
}
```

设计说明：

- `seq` 用于断线重连、去重、乱序保护。
- `protocolVersion` 用于后续协议演进。
- `sessionId` 明确事件归属，避免窗口与通道层自己拼接上下文。
- `data` 不再使用 `Record<string, unknown>`，统一绑定到 `ContentPart` 模型。

相对于当前实现，还建议补充两类服务端直出事件：

- `session_patch`
  - 用于增量更新 `title / status / updatedAt / summary`
  - 减少对 session 轮询的依赖
- `human_control`
  - 作为独立事件显式上屏
  - 避免仅通过 `metadata.taskStatus` 间接推断，导致状态迁移逻辑分散

### 5.5 用户动作协议

统一动作接口：

```ts
interface UnifiedTaskAction {
  actionId: string;
  executionId: string;
  type: 'send_message' | 'stop_stream' | 'submit_input' | 'approve' | 'reject' | 'resume_human_control' | 'open_execution_detail';
  payload?: unknown;
  clientTimestamp: string;
}
```

设计说明：

- `actionId` 是幂等关键字段，必须由客户端生成。
- 企微 Bot callback、按钮重复点击、弱网重试都会导致重复提交，没有 `actionId` 会放大副作用。
- 后端需要对 `actionId + executionId + type` 做幂等去重。

## 6. Chat Core 能力拆分

建议将 Core 拆分为以下子模块。

### 6.1 Session Manager

职责：

- 创建会话
- 恢复会话
- 维护会话上下文
- 管理多端/多通道 session 绑定

### 6.2 Message Store

职责：

- 维护消息列表
- 应用 message patch
- 归并流式内容
- 维护最终结果和结构化结果

### 6.3 Stream Event Reducer

职责：

- 解释 `thought/action/observation/result` 事件
- 将事件映射为统一 message patch
- 维护任务状态迁移

建议暴露为纯函数：

```ts
reduceChatEvent(state, event) => nextState
```

补充原则：

- Reducer 必须无 UI 依赖
- Reducer 只解释协议，不直接访问 API
- Reducer 负责把 `UnifiedStreamEvent` 映射为：
  - message patch
  - session patch
  - task status transition
  - pending actions / cards

这一步是消除当前 `ChatWindow` 巨石的最高价值改造。

### 6.4 Task Interaction Controller

职责：

- 提交等待输入
- 批准 / 驳回
- 人工接管继续
- 恢复执行

补充要求：

- 统一接收 `UnifiedTaskAction`
- 统一处理 `actionId` 幂等性
- 与 UI 层解耦，不允许页面直接内联审批/恢复 API 细节

### 6.5 Attachment Controller

职责：

- 文件上传
- 文件附件映射
- 第三方通道附件降级

## 7. 多通道适配设计

### 7.1 Web Adapter

职责：

- 处理浏览器端 token、鉴权、流式传输
- 适配 WebSocket / SSE / fetch stream
- 为 React UI 提供 controller

适配对象：

- `portal`
- `user-web`
- 未来嵌入式 Web Chat Panel

### 7.2 Desktop Adapter

职责：

- 连接桌面端身份态
- 接入文件系统能力
- 接入系统剪贴板、通知和本地缓存
- 将桌面壳事件转换为统一消息动作

落地建议：

- 第一阶段：桌面壳直接复用 Web Chat Renderer
- 第二阶段：桌面端在 UI 层可按需替换为原生渲染器

### 7.3 IM Adapter

职责：

- 将微信/企微/飞书/钉钉的消息事件转换为统一 `ChatRequest`
- 将聊天结果映射为通道支持的文本/卡片/按钮
- 将复杂操作降级为“命令 + 深链接”

建议引入显式通道能力声明：

```ts
interface ChannelCapability {
  channel: 'web' | 'desktop' | 'wechat' | 'wecom' | 'feishu' | 'webhook';
  supportsMarkdown: boolean;
  supportsInteractiveButtons: boolean;
  maxMessageLength: number;
  supportsFileAttachment: boolean;
  supportsStreaming: boolean;
  buttonLimit?: number;
}
```

并在运行时使用统一降级决策：

```ts
function resolveOutputStrategy(
  contentPart: ContentPart,
  capability: ChannelCapability
): RenderedOutput {
  // ...
}
```

示例映射：

| 统一状态 | IM 输出策略 |
| --- | --- |
| `running` | 输出最新一条进展摘要 |
| `waiting_input` | 回复缺失字段清单，支持命令补参 |
| `pending_approval` | 回复“1 批准 / 2 驳回”或按钮卡片 |
| `human_control` | 回复深链接，引导用户去 Web 处理 |
| `completed` | 输出结构化结果摘要 |
| `failed` | 输出错误摘要 + 执行详情链接 |

通道能力矩阵是本设计从“概念上支持多通道”走向“工程上可落地”的关键一步：

- 企微通常不适合逐 token 流式输出
- 飞书卡片按钮数量有限
- 微信文本长度和交互能力有限
- Web 与桌面端可以完整渲染复杂卡片与结构化结果

### 7.4 Webhook Adapter

职责：

- 支持外部系统通过 webhook 调用 AI chat
- 输出统一响应体或异步事件回调

## 8. 渲染层设计

### 8.1 Web Renderer

目标：

- `5173` 和 `5174` 共享同一套聊天渲染层
- 页面差异只保留壳层和布局，不保留消息协议差异

建议拆成：

- `ChatShell`
- `ChatHeader`
- `ChatInputPanel`
- `MessageBubble`
- `TaskOutcomeCard`
- `TaskProgressCard`

### 8.2 Desktop Renderer

可先复用 Web Renderer，再逐步独立。

### 8.3 IM Renderer

不是 UI 组件，而是消息格式化器：

- 纯文本摘要格式化器
- Markdown 格式化器
- 按钮/菜单消息格式化器
- 深链接生成器

补充约束：

- IM Renderer 必须围绕 `ContentPart` 做格式化，而不是围绕原始 `content: string` 猜测内容语义。
- IM Renderer 只消费统一协议，不直接感知执行领域内部 DTO。
- 当通道不支持结构化卡片时，应优先退化为：
  - 文本摘要
  - 操作提示
  - 深链接

## 8.4 输出格式协议深化

这是 `v4.1` 相对 `v4.0` 的核心补充。

### 8.4.1 设计原则

1. 结构化结果必须先有 schema，再有渲染器
2. 流式输出必须支持顺序控制与断线恢复
3. 多通道降级必须依赖统一消息模型，而不是页面临时转换
4. 思考过程不能再通过前端正则解析字符串标签

### 8.4.2 对当前代码的直接启示

当前 `portal` 中仍存在：

- `finalResultData?: unknown`
- 同时解析 `<think>`、`【思考】`、`【行动】` 等多种字符串格式
- 前端手动从 `content` 中识别是否为执行结果

在 `v4.1` 中，这些都应收敛为：

- 服务端输出显式 `thought / action / observation / result / human_control`
- 前端只消费 `UnifiedStreamEvent`
- 最终结果通过 `structured_result` content part 或 schema registry 解释

### 8.4.3 与开源生态的兼容方向

本设计建议尽量兼容以下事实标准：

- `Structured Outputs / JSON Schema`
- `streamObject / partial object patch`
- `ContentPart[]` 风格消息模型
- `tool_use / function calling` 风格 UI 指令块

后续如果引入：

- `ag-ui protocol`
- `Vercel AI SDK`
- `OpenAI Responses API`

则可以通过适配层做近零语义损失映射。

## 9. 与现有代码的收敛路径

### 9.1 P0：统一协议与结构化结果契约

优先落地：

- 在 `packages/contracts` 中定义 `ExecutionResultPayload` discriminated union
- 为 stream event 增加 `seq / protocolVersion / sessionId`
- 在服务端补齐 `human_control / session_patch`
- 停止新增 `unknown + asRecord` 风格的结果协议

这一阶段的目标是先把“协议底座”立住，避免后续拆 UI 时继续复制类型债务。

### 9.2 P1：抽协议解释层

从现有 `portal` 中抽出：

- Stream Event Reducer
- Message Metadata 映射逻辑
- Task Status 状态迁移逻辑

目标：

- `portal` 和 `user-web` 先共享同一套协议解释逻辑

### 9.3 P1：拆分 ChatMessage 职责

建议从当前消息组件中拆出：

- `TaskOutcomeCard`
- `TaskProgressCard`
- `ApprovalCard`
- `WaitingInputCard`

这样可以直接缓解当前 `ChatMessage.tsx` 体积与职责混杂问题。

### 9.4 P2：抽 Controller

把现有页面里直接调用 API 的逻辑抽为统一 controller：

- `send`
- `stop`
- `approve`
- `reject`
- `submitInput`
- `resume`

### 9.5 P2：引入 ContentPart 与通道降级框架

- 用 `ContentPart[]` 替换 `content: string` 单字段模型
- 引入 `ChannelCapability` 矩阵
- 建立统一 `resolveOutputStrategy`

### 9.6 P3：统一 Web Renderer

将 `5174` 直接切换为复用 `5173` 的聊天渲染器。

### 9.7 P3：接入 Desktop

桌面端先复用 Web Renderer 与 Chat Core。

### 9.8 P3：接入 IM / 第三方通道

通过 Channel Adapter 实现协议转换和消息降级。

## 10. 模块目录建议

建议新增统一聊天内核包：

```text
packages/
  contracts/
    src/
      chat/
      execution-results/
      channel-capabilities/
  chat-core/
    src/
      types/
      reducer/
      controller/
      adapters/
      render-contract/
      formatters/
```

Web 侧建议目录：

```text
apps/frontend/
  portal/src/features/chat-web/
  user-web/src/features/chat-web/
```

服务侧建议目录：

```text
services/
  chat-gateway/
    src/
      sessions/
      messages/
      channels/
      webhooks/
      attachments/
```

## 11. 风险与约束

### 11.1 复杂任务交互跨通道不对等

第三方 IM 通道无法完全复用 Web UI，需要提供降级策略。

### 11.2 身份与权限映射复杂

第三方用户和内部用户、租户、角色的映射将成为关键治理问题。

### 11.3 流式输出策略差异

Web 适合持续流式渲染，IM 更适合阶段性汇总和最终结果回写。

### 11.4 当前实现存在容器巨石

现有聊天页面需要先解耦，否则难以稳定迁移到多端。

### 11.5 输出格式升级会带来兼容期成本

从 `content: string` 升级到 `ContentPart[]` 会带来一段协议双写期：

- 服务端需要同时输出 fallback 文本和结构化 parts
- 旧前端需要维持兼容
- schema registry 需要逐步盘点现有 skill 结果类型

因此，必须明确版本策略和灰度窗口。

## 12. 建议实施顺序

### P0：统一协议与结构化结果契约

- 定义 `ExecutionResultPayload` schema registry
- stream event 增加 `seq / protocolVersion / sessionId`
- 停止扩大 `finalResultData?: unknown`
- 统一服务端事件名称，消除前端正则解析思考标签

### P1：统一协议解释与消息拆分

- 抽统一 event reducer
- 抽 message patch 规则
- 拆分 `ChatMessage`
- 消灭 `ChatWindow` 中的大部分事件解释逻辑

### P2：统一消息模型与通道降级框架

- 引入 `ContentPart[]`
- 引入 `ChannelCapability`
- 抽统一聊天控制器
- 将 API 调用与 UI 分离

### P3：统一 Web 端聊天渲染

- `5174` 直接复用 `5173` 渲染器
- 保留不同页面壳层，不再保留不同消息逻辑

### P3：桌面端与第三方通道接入

- 先复用 Web Renderer 接入 Desktop
- 再接入 webhook / bot 风格通道
- 再补企业微信、微信、飞书等协议转换

## 13. 开放问题

以下问题需要在正式实施前与架构方确认：

1. `packages/chat-core` 是否必须保持纯 TypeScript、无 UI 框架依赖
   - 如果要同时服务 Browser、Desktop、Node Bot，这一点必须成立
2. 后端 AI Orchestrator 的 stream 格式是否允许直接升级为 `UnifiedStreamEvent`
   - 如果允许，前端改造量会显著下降
3. 现有 `finalResultData` 实际存在多少种结果类型
   - 需要先做一次 result payload inventory，才能建立 schema registry
4. 第三方通道身份映射如何设计
   - 例如 `open_id / union_id / external_user_id` 如何绑定内部 `userId`
5. 是否接受兼容业界协议
   - 如 `ag-ui protocol`、`ContentPart` 风格约定、`Structured Outputs`

## 14. 结论

未来的 AI 聊天能力不应继续以单个前端页面作为复用边界，而应以“统一会话内核 + 统一协议 + 多通道适配”作为系统边界。

推荐决策如下：

1. 以 `Chat Domain Core` 作为长期复用中心。
2. 将 `5173` 现有聊天实现拆解为可复用内核、控制器和渲染器。
3. `5174` 优先复用 Web Renderer，而不是继续局部仿制。
4. 桌面端优先复用 Web Renderer + Chat Core。
5. 第三方聊天工具通过 Channel Adapter 做协议转换，而不是复制 UI 逻辑。
6. 输出格式协议必须升级为 `ContentPart + Schema Registry + Sequenced Stream Event`，否则多通道架构无法稳定落地。

该方案可以在不丢失现有 Web 端能力的前提下，为桌面 App 和第三方聊天工具建立稳定、一致、可扩展、可验证的 AI 聊天能力底座。

## 15. 当前实现进度

截至本轮实现，以下内容已经完成第一阶段落地：

1. 已新增共享协议包 `packages/backend-contracts/ai-chat-protocol`
   - 提供 `ContentPart`
   - 提供 `ExecutionResultPayload`
   - 提供 `UnifiedStreamEvent`
   - 提供 `UnifiedTaskAction`
2. `packages/user-core` 已接入共享聊天协议
   - `chat.types.ts` 已扩展 `contentParts / contextStrategy / seq / protocolVersion / sessionId`
   - `chat.api.ts` 已兼容新协议字段归一化
3. `packages/user-core` 已新增可复用的 `reduceChatStreamEvent()`
   - 已统一 `missingInputs`
   - 已统一 `progressLog`
   - 已统一 `normalizedResult`
   - 已统一 `taskStatus`
   - 已支持 `sessionPatch`
4. `apps/frontend/user-web` 已切换到共享 reducer
   - 已支持 `human_control` 状态展示
   - 已兼容新 `event.data` 联合类型
5. `apps/frontend/portal` 已切换到共享 reducer 与共享 `StreamEventType`
   - 已开始收敛本地重复聊天类型
   - 已兼容协议层新增字段

当前尚未完成的后续工作：

- `portal` 的 `ChatMessage.tsx` 仍需继续拆分
- `portal` 的本地聊天类型仍有剩余兼容层，尚未完全删除
- `ContentPart` 目前已进入协议与 reducer，但 Web UI 还未全面按 part renderer 重构
- `ExecutionResultPayload` 当前已完成第一版 discriminated union，后续仍需按真实 skill 结果继续扩展 registry
