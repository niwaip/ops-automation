# 03. Gmail 与 Outlook Provider Adapter

## 1. Adapter 设计目标

Provider Adapter 的职责是把统一业务意图转换为 Provider 调用，并把结果规范化；它不是简单的 HTTP Client 包装。

每个 Adapter 负责：

- Access Token 获取和刷新协调；
- 查询编译、分页和字段选择；
- Provider ID 与统一 Ref 的转换；
- MIME / HTML / 地址 / 时间规范化；
- 附件定位和流式下载；
- 发送格式转换；
- 增量同步协议；
- Provider 错误分类、限流和重试提示；
- 费用/配额感知的调用合并。

Adapter 不负责：

- 宿主身份鉴权；
- 审批交互；
- 调度；
- 长期邮件索引；
- 根据邮件内容决定调用其他工具。

## 2. Provider SPI

建议将 SPI 拆为小接口，组合成完整 Adapter：

```ts
export interface ProviderConnectionProbe {
  probe(context: ProviderContext): Promise<ProviderProbeResult>;
}

export interface ProviderMessageReader {
  listMessages(input: ProviderListInput): Promise<ProviderMessagePage>;
  searchMessages(input: ProviderSearchInput): Promise<ProviderMessagePage>;
  getMessage(input: ProviderGetInput): Promise<ProviderMessage>;
}

export interface ProviderAttachmentReader {
  getAttachment(input: ProviderAttachmentInput): Promise<ProviderAttachmentStream>;
}

export interface ProviderMessageSender {
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
}

export interface ProviderIncrementalSync {
  beginSync(input: ProviderBeginSyncInput): Promise<ProviderSyncPage>;
  continueSync(input: ProviderContinueSyncInput): Promise<ProviderSyncPage>;
}
```

分拆后，读取、发送和同步可以分别做权限探测和合同测试，也避免单文件承担全部 Provider 细节。

## 3. 能力映射总表

| 统一操作 | Gmail | Outlook / Microsoft Graph |
| --- | --- | --- |
| 最近邮件 | `users.messages.list` + 按需 `get` | `messages` list + `$select` |
| 搜索 | `messages.list(q=...)` | `$filter`、`$search` 或 Microsoft Search 的受控编译 |
| 单封读取 | `users.messages.get` | `GET /me/messages/{id}` |
| 附件 | message payload / `attachments.get` | `attachments` list/get |
| 发送 | MIME + `users.messages.send` | `POST /me/sendMail` 或 reply endpoint |
| 初始同步 | 列表基线 + Profile historyId | Folder message delta，直到 `deltaLink` |
| 增量同步 | `users.history.list` | Folder message delta 的 `nextLink/deltaLink` |
| 推送（后续） | Gmail `watch` + Pub/Sub | Graph Change Notifications |

## 4. Gmail Adapter

### 4.1 读取列表

Gmail `users.messages.list` 主要返回 message ID/thread ID，通常需要后续 `users.messages.get` 才能得到头部或正文。

实现策略：

1. 用 `messages.list` 获取 ID 页；
2. 对本页 ID 做受控并发 `messages.get`；
3. `detail=summary` 使用 `format=metadata` 并指定必要 headers；
4. `detail=full` 使用 `format=full`，解析 MIME 树；
5. 限制并发度，避免快速耗尽 per-user quota；
6. 仅把 Gmail `nextPageToken` 包装成绑定查询哈希的短期 Cursor。

常用 Header：

```text
Subject
From
To
Cc
Bcc
Date
Message-ID
In-Reply-To
References
```

Gmail 的 label 不直接等同于统一 folder。首期映射：

| Gmail Label | 统一 folder |
| --- | --- |
| `INBOX` | `inbox` |
| `SENT` | `sent` |
| `DRAFT` | `drafts` |
| 不含 `INBOX` 且非 sent/draft | `archive` 或 `other` |

保留原始用户 Label 的显示名需要额外列表缓存；首期可只返回系统 Label 的规范化集合。

### 4.2 Gmail 查询编译

`selector.kind=search` 可编译为 Gmail 搜索语法，但上层不能直接传原始 `q`。

示例：

```text
text="预算"
from=["alice@example.com"]
hasAttachment=true
since=2026-08-24T00:00:00Z
until=2026-08-31T00:00:00Z
```

编译为概念查询：

```text
预算 from:alice@example.com has:attachment after:... before:...
```

编译器要求：

- 转义引号和特殊字符；
- 日期边界统一后再转换；
- 多个 `from` 的 OR 逻辑必须显式加括号；
- 不允许调用方注入 Gmail 运算符；
- 将规范化 Query AST 一起哈希并绑定分页 Cursor；
- 对 Gmail 不支持或语义不稳定的条件返回显式 warning/error。

### 4.3 Gmail MIME 解析

邮件正文可能出现在多层 `multipart/*` 中。解析优先级：

1. `text/plain`；
2. `text/html` 清洗并转换为安全文本；
3. 对 `multipart/alternative` 选择最合适的正文而非重复拼接；
4. 跳过带 `Content-Disposition: attachment` 的正文候选；
5. 正确处理 base64url、charset 和 transfer encoding；
6. 内联图片作为附件元数据，不主动下载。

解析失败不能丢弃整封邮件，应返回元数据并附加 `EMAIL_BODY_PARSE_PARTIAL` warning。

### 4.4 Gmail 发送

Gmail 发送使用 RFC 2822/MIME 消息，经 base64url 编码后调用 `users.messages.send`。

首期建议：

- 新邮件构建纯文本 MIME；
- 回复时设置 `threadId`，并依据原邮件设置 `In-Reply-To` 和 `References`；
- 生成稳定的内部 `deliveryId`，可在允许时写入自定义追踪 Header；
- 不把自定义 Header 当作 Provider 幂等保证；
- Provider 返回 Message 后签发 `providerMessageRef`；
- 如果提交后网络断开且无法确定 Provider 是否接受，进入 `unknown`。

Gmail `messages.send` 的配额成本明显高于 list/history；Provider Budget 必须按官方最新值配置，不能硬编码到业务逻辑。

### 4.5 Gmail 增量同步

事实来源是 `users.history.list`：

- Checkpoint 保存 `historyId`；
- 每次从 `startHistoryId` 开始拉取全部分页；
- History ID 单调但不连续，不能做 `+1`；
- 历史记录可能同时包含 messageAdded、messageDeleted、labelAdded、labelRemoved；
- 只在整批分页处理成功并持久化 Receipt 后推进 Checkpoint；
- `startHistoryId` 过旧时 Provider 返回 404，此时进入受控全量重建。

Gmail 文档说明 History ID 通常至少可用一周，但有时可能更短，因此调度间隔和故障恢复不能假设固定保留期。

## 5. Outlook Adapter

### 5.1 ID 稳定性

Microsoft Graph 的默认 message ID 可能在邮件移动文件夹时变化。读取消息相关调用统一发送：

```http
Prefer: IdType="ImmutableId"
```

Skill 的 MessageRef 仍不暴露 Immutable ID；该 Header 只是提升内部引用稳定性。实现必须确保 list/get/attachment/delta 路径对 ID 类型使用一致，否则可能出现 Ref 无法解析。

### 5.2 列表读取

列表调用遵循：

- 使用 `$select` 只取必要字段；
- 用 `$top` 控制页大小，逐步探测稳定上限；
- 完整保留并服务端加密/封装 `@odata.nextLink`；
- 不解析 nextLink 中的 `$skip` 并自行拼装下一页；
- 默认 Body 是 HTML，需要正文时发送 `Prefer: outlook.body-content-type="text"` 或进行严格 HTML 清洗；
- 避免复杂 `$filter + $orderby` 组合触发 `InefficientFilter`。

建议 `$select`：

```text
id,conversationId,internetMessageId,parentFolderId,
subject,from,toRecipients,ccRecipients,receivedDateTime,
sentDateTime,isRead,importance,hasAttachments,bodyPreview
```

### 5.3 Outlook 查询编译

Microsoft Graph 的搜索能力与 Gmail `q` 不完全等价，查询编译器需要按 AST 特征选择路径：

1. 结构化时间、isRead、hasAttachments、sender 等条件优先用 `$filter`；
2. 自由文本条件使用受支持的 `$search` 或 Microsoft Search 路径；
3. 若自由文本和复杂过滤无法可靠组合，采用候选集搜索后在受控上限内做本地精确过滤；
4. 若候选集可能超限而导致不完整，返回 `EMAIL_QUERY_UNSUPPORTED`，不能假装完整；
5. 输出 warning 标记发生过 Provider 语义降级。

禁止将自然语言直接拼入 OData。编译器必须生成 AST、转义字面值，并对字段和运算符使用白名单。

### 5.4 Folder 映射

Outlook well-known folder name 可映射为统一 folder：

| Graph well-known folder | 统一 folder |
| --- | --- |
| `inbox` | `inbox` |
| `sentitems` | `sent` |
| `drafts` | `drafts` |
| `archive` | `archive` |
| 其他 | `other` |

连接 Probe 时可解析并缓存 Folder ID。缓存按 Connection 隔离，并允许刷新；不能把一个邮箱的 Folder ID 用到另一邮箱。

### 5.5 Outlook 发送

新邮件可用 `POST /me/sendMail`：

- JSON 模式适合首期纯文本和小附件；
- MIME 模式可以作为高级实现，但必须统一编码与错误处理；
- Graph `202 Accepted` 表示请求已接受，不提供送达保证；
- 默认响应没有可直接用作稳定发送结果的 Message 对象，因此 `providerMessageRef` 可为空；
- 提交后超时进入 `unknown`，不能自动二次发送。

回复应优先使用 Graph 专门的 reply/replyAll 流程，保持会话关系。首期若只实现 reply，应在 Manifest 中明确不支持 replyAll 和 forward，避免模型误判。

### 5.6 Outlook 增量同步

使用 Message Delta：

- Delta 是 folder 级别；首期只同步 inbox；
- 初始请求遍历所有 `@odata.nextLink`，最终获得 `@odata.deltaLink`；
- 增量请求从已保存的 deltaLink 开始；
- 中间页只保存临时 Progress，不推进已提交 Checkpoint；
- 完整到达新的 deltaLink 且 Receipt 写入成功后，原子更新 Checkpoint；
- 处理新增、更新、删除；邮件移出 inbox 可能表现为删除；
- Delta 不支持 `$search`，后台同步与交互搜索必须分开实现。

nextLink/deltaLink 是 Provider 生成的不透明 URL，Skill 可以持久化，但必须：

- 加密或按 Secret 等级保护；
- 校验 Host 属于预期 Microsoft Graph 域；
- 不接受调用方提交；
- 不进入日志、指标或模型输出；
- 仅交给 Outlook Adapter 使用。

## 6. 统一规范化

### 6.1 地址

```ts
type MailAddress = {
  name?: string;
  address: string;
};
```

- 地址用于显示时保留 Provider 原值；
- 用于比较/去重时做 IDNA、大小写等规范化，但保留原始显示；
- 不使用模糊显示名直接作为发送地址；
- Planner 解析到只有姓名没有邮箱时，需要用户消歧或独立通讯录能力。

### 6.2 时间

- Provider 返回时间全部解析为 instant；
- 对外输出 RFC 3339 UTC；
- Query 的本地日期边界由宿主传入的可信时区转换；
- 不以服务进程默认时区解释“今天”。

### 6.3 正文

标准化为优先纯文本：

- 保留合理换行；
- 折叠极长引用历史可作为可选策略，但必须标记 `truncated`；
- 不把签名、免责声明自动判定为无用并永久删除；
- HTML Sanitizer 使用固定白名单；
- 超限正文写入敏感 Artifact。

### 6.4 附件

Gmail 和 Graph 的内联附件语义不同，统一模型保留 `inline`，但不在消息读取阶段自动下载内容。

Provider Attachment Locator 只存在服务端映射：

```ts
type AttachmentLocator = {
  connectionId: string;
  providerMessageId: string;
  providerAttachmentId: string;
  expectedFilename?: string;
  expectedSize?: number;
};
```

## 7. 错误分类

Provider Adapter 把 HTTP/SDK 错误转换为统一分类：

| Provider 情况 | 统一错误 | 处理 |
| --- | --- | --- |
| 401 + token 可刷新 | 内部刷新一次 | 不暴露给上层 |
| refresh `invalid_grant` | `EMAIL_REAUTH_REQUIRED` | 停止重试，更新连接状态 |
| 403 缺 Scope | `EMAIL_SCOPE_MISSING` | 引导增量授权 |
| 403 策略阻止 | `EMAIL_CONNECTION_FORBIDDEN` | 联系管理员 |
| 404 message | `EMAIL_MESSAGE_NOT_FOUND` | 不重试 |
| Gmail history 404 | `EMAIL_SYNC_CURSOR_EXPIRED` | 受控重建基线 |
| Graph delta token invalid | `EMAIL_SYNC_CURSOR_EXPIRED` | 受控重建基线 |
| 429 | `EMAIL_RATE_LIMITED` | 尊重 Retry-After，加抖动 |
| 5xx / 网络连接失败 | `EMAIL_PROVIDER_TEMPORARY` | 有界重试 |
| send 提交后的超时 | `EMAIL_SEND_STATE_UNKNOWN` | 不自动重试 |

未经分类的 Provider 错误默认不应无限重试。

## 8. 限流与资源预算

每个 Adapter 维护四层预算：

1. Provider App 全局预算；
2. 组织预算；
3. Connection / 用户预算；
4. 单次 Invocation 的最大请求数和字节数。

建议默认值：

| 项目 | 默认值 |
| --- | --- |
| 读取 Hydration 并发 | 每 Connection 4 |
| 单次 `email.messages` Provider 请求 | 25 |
| 单次 `email.poll` 变化条数 | 200 |
| 单次正文内联 | 8 KiB |
| 单封 full 正文 | 256 KiB，超出转 Artifact |
| 单附件 | 20 MiB |
| Provider 请求超时 | 10 秒；附件流单独配置 |

这些是产品默认值而不是 Provider 常量，应配置化并根据真实配额探测调整。Gmail 的方法 quota units 和 Graph 限流策略可能变化，运行手册应链接官方页面而不是在代码中写死历史数字。

## 9. Provider 能力矩阵与探测

每个 Connection Probe 返回：

```ts
type ProviderProbeResult = {
  providerIdentity: {
    subject: string;
    emailAddress: string;
    tenantId?: string;
  };
  capabilities: {
    read: "available" | "missing_scope" | "blocked";
    send: "available" | "missing_scope" | "blocked";
    incrementalSync: "available" | "unsupported" | "blocked";
    attachments: "available" | "blocked";
  };
  grantedScopes: string[];
  warnings: string[];
  probedAt: string;
};
```

部署验证和连接创建都应运行真实 Probe，不能仅凭配置存在或 Token 解析成功就宣布连接可用。

## 10. 官方 API 参考

Gmail：

- [List messages](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [Get message](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)
- [Send email](https://developers.google.com/workspace/gmail/api/guides/sending)
- [Synchronize clients](https://developers.google.com/workspace/gmail/api/guides/sync)
- [List history](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)
- [Usage limits](https://developers.google.com/workspace/gmail/api/reference/quota)

Microsoft Graph：

- [List messages](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0)
- [Get message](https://learn.microsoft.com/en-us/graph/api/message-get?view=graph-rest-1.0)
- [Message resource and ImmutableId](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0)
- [Get attachment](https://learn.microsoft.com/en-us/graph/api/attachment-get?view=graph-rest-1.0)
- [Send mail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
- [Message delta](https://learn.microsoft.com/en-us/graph/api/message-delta?view=graph-rest-1.0)

