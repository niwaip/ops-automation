# 07. 测试、验收标准与风险清单

## 1. 测试策略

测试分为六层：

1. 纯领域单元测试；
2. Provider Adapter 合同测试；
3. 数据库/并发集成测试；
4. 宿主 ABI 与安全测试；
5. 真实 Provider 探测测试；
6. 端到端工作流和故障注入测试。

不能仅用 SDK Mock 证明 Gmail/Outlook 可用。Provider 行为、Scope、分页和错误体会变化，必须保留最小真实探测套件，但真实测试账号只能用于专用环境。

## 2. 单元测试

### 2.1 合同验证

- `selector` 判别联合类型严格校验；
- `by_ref` 拒绝 cursor/limit；
- limit、正文和附件大小边界；
- RFC 3339 与时区边界；
- 未知字段按合同策略拒绝；
- 错误码包含正确 `retryable/actionRequired`；
- 输出不出现 Provider Token、原始 Cursor 和内部 ID。

### 2.2 Query Compiler

- Gmail 特殊字符、引号、OR、日期、多个发件人；
- OData 字面量转义和字段白名单；
- 不支持组合明确返回 Unsupported；
- 同一 Query AST 生成稳定哈希；
- 不允许 Gmail 运算符或 OData 注入；
- Provider 降级时 warning 可预测。

### 2.3 MIME 和正文

- plain、HTML、multipart/alternative、multipart/mixed；
- 嵌套 multipart；
- base64url 和 quoted-printable；
- 多 charset 和非法编码；
- 内联图片、同名附件、零字节附件；
- HTML script/style/form/remote image 清除；
- 超限正文转 Artifact；
- 解析失败保留元数据并返回 Partial Warning。

### 2.4 Ref 与 Cursor

- 正常签发/解析；
- 跨租户、跨连接、跨类型拒绝；
- 过期 Ref/Cursor；
- 篡改单字节即验证失败；
- Cursor 绑定 Query Hash；
- 密钥轮换期间新旧版本兼容；
- 错误信息不泄漏 Ref 内部内容。

### 2.5 发送 Canonicalization

- 地址大小写/Unicode/IDNA；
- 换行统一；
- 附件顺序策略；
- Payload 任何业务变化都改变哈希；
- 等价序列化不改变哈希；
- Canonical Version 隔离；
- 相同幂等键不同哈希产生 Conflict。

## 3. Provider Adapter 合同测试

两个 Adapter 必须运行同一套黑盒合同：

```ts
describeProviderContract(() => createGmailAdapter(fixtureTransport));
describeProviderContract(() => createOutlookAdapter(fixtureTransport));
```

共同断言：

- recent/search/by_ref 的规范化输出一致；
- summary 不请求/返回完整正文；
- full 限制数量和大小；
- 分页 Cursor 不透明且可继续；
- 删除邮件返回统一 Not Found；
- 429 映射 Retry-After；
- Token 失效映射 Reauth Required；
- 附件流中断不会生成 clean Artifact；
- 提交后超时进入 Unknown；
- Provider 原始错误不出现在用户输出。

### 3.1 Gmail Fixture

- messages.list 只有 ID；
- metadata/full 两种 get；
- MIME 树；
- nextPageToken；
- history 多页和非连续 historyId；
- history 404；
- send 成功 Message；
- quota exceeded / user rate limit。

### 3.2 Outlook Fixture

- `$select/$top` 分页；
- `@odata.nextLink` 不可自行解析；
- `Prefer: IdType="ImmutableId"`；
- Body HTML/text Preference；
- `InefficientFilter`；
- Delta 初始多页、增量、删除、deltaLink 失效；
- sendMail 202；
- 429 Retry-After 和 Graph 错误结构。

## 4. OAuth 与连接安全测试

- State 随机性、哈希保存、一次性消费、过期；
- PKCE S256 和错误 Verifier；
- OIDC nonce/issuer/audience/signature/expiry；
- Callback 中伪造 org/user/provider 无效；
- 开放重定向攻击；
- Google Callback 不返回新 Refresh Token 时保留旧 Token；
- Microsoft Refresh Token Rotation 并发覆盖测试；
- Tenant ID / Hosted Domain 拒绝；
- Scope 缺失与渐进授权；
- Secret 加密 AAD 跨租户替换攻击；
- 日志、Trace、异常快照中无 code/state/token/secret；
- Connection ACL 的 owner/user/role/saved_skill 组合；
- 撤销后运行中和后续调用的行为。

## 5. 数据库与并发测试

- 同一 Provider Subject 并发 Callback 只生成一个 Connection；
- Refresh Token 单飞和 `token_generation` 乐观锁；
- Checkpoint Lease 到期接管；
- 失去 Lease 的 Worker 无法提交；
- Provider 多页中途崩溃后从已提交 Cursor 恢复；
- Receipt Unique Constraint 消除重复；
- Cursor 与 Receipt 原子提交；
- 相同 requestId 并发 send 只有一个进入 SUBMITTING；
- Delivery 在 Provider 返回后、数据库提交前崩溃进入可运营 Unknown；
- Secret/Token 轮换与历史数据 Rewrap；
- 租户查询遗漏 org filter 时由 Repository Guard 测试阻断。

建议所有 Skill Repository 强制要求 `TenantScope` 参数，禁止存在无租户的普通 `findById(id)` 方法。

## 6. 宿主 ABI 测试

### 6.1 合同兼容

- 当前与前一合同版本的序列化兼容；
- 未支持合同版本明确拒绝；
- `orgId/actorUserId` 只来自签名上下文；
- `consumerId/scheduleFireId` 正确传递；
- Remote Runtime 超时、断路和错误映射；
- Manifest runtimeRef 只能解析白名单部署；
- Skill Output 敏感字段不会无条件进入长期结果。

### 6.2 松耦合门禁

CI 增加依赖边界检查：

- `skills/email/core` 不得 import 宿主应用源码；
- `providers/*` 不得 import Host Adapter；
- `adapters/ops-host` 不得包含 Gmail/Graph SDK；
- Skill 不得访问宿主 Prisma Client；
- 平台 Runtime Adapter 不得依赖 Email Provider 类型；
- 删除 Email Suite 构建目标后，平台核心包仍能编译和测试。

## 7. 定时与增量测试场景

| 场景 | 期望 |
| --- | --- |
| 新 Schedule，from_now | 历史邮件不交付，后续新邮件交付 |
| 新 Schedule，lookback=1d | 一天内历史邮件交付一次 |
| 同邮箱两个 Schedule | 各自独立收到变化，不互相推进游标 |
| 同 Schedule 重叠 Fire | 只有一个持有 Lease，另一个跳过/等待 |
| Gmail history 多页 | 全部 Receipt 成功后推进 historyId |
| Gmail history 404 | 进入 Recovering，受控重建并告警 |
| Outlook initial delta | 遍历到 deltaLink 才激活 |
| Outlook 消息移出 inbox | 输出删除/移出语义，不保留幽灵消息 |
| Outlook deltaLink 失效 | 重建基线并去重 |
| Worker 中途崩溃 | 重跑不丢失，可能重复被 Receipt 消除 |
| 多次 Misfire | 恢复只 catch-up 一次 |
| Connection reauth_required | Schedule 暂停并通知一次 |
| 429 持续发生 | 退避、Lag 告警、不形成请求风暴 |

## 8. 发送故障注入矩阵

| 故障点 | 状态 | 是否自动重试 |
| --- | --- | --- |
| Contract 校验失败 | 不创建或 FAILED_FINAL | 否 |
| Approval Port 暂时失败 | PENDING_APPROVAL | 可重试验证，不发送 |
| Approval Payload Hash 不符 | REJECTED | 否 |
| Token 获取失败 | APPROVED / FAILED_RETRYABLE | 有界重试 |
| 连接在 HTTP 写出前失败 | FAILED_RETRYABLE | 有界重试 |
| Provider 明确 429 且未接受 | FAILED_RETRYABLE | 尊重 Retry-After |
| Provider 明确 4xx 内容拒绝 | FAILED_FINAL | 否 |
| 请求写出后连接重置 | UNKNOWN | 否 |
| Graph 返回 202 | ACCEPTED | 不重试 |
| Gmail 返回 Message | ACCEPTED | 不重试 |
| Provider 成功后 DB 不可用 | UNKNOWN/恢复流程 | 禁止再次提交 |
| 同 requestId 并发 | 复用同 Delivery | 只有一个提交者 |

## 9. 性能与容量测试

需要建立可配置目标，而不是假设 Provider 配额无限：

- 1000 个活跃 Connection 的分散 Poll；
- 同一时间整点 Schedule 的 Jitter 效果；
- 大邮箱 Outlook Delta Baseline；
- Gmail list 后 Hydration 的并发预算；
- 20 MiB 附件的流式内存占用；
- 429 时队列和连接池是否稳定；
- Token 集中过期时的单飞和 KMS 压力；
- Provider 延迟升高时交互请求与后台 Poll 的公平性；
- Receipt 和审计表的保留/清理性能。

首期 SLO 建议作为起点：

| 指标 | 目标 |
| --- | --- |
| `email.messages` summary P95（不含 Provider 大面积故障） | < 3 秒 |
| `email.messages` full P95 | < 5 秒 |
| Schedule 新邮件发现 P95 | 小于 2 个调度周期 |
| Skill 自身可用性 | 99.9% |
| 重复 Send（由 Skill 自动造成） | 0 |
| 跨租户数据泄露 | 0 |
| Token/Secret 日志泄露 | 0 |

## 10. 真实 Provider 测试

### 10.1 环境

- 专用 Google Workspace / Gmail 测试账号；
- 专用 Microsoft 365 Developer/Test Tenant；
- 独立 OAuth App，不复用生产 App；
- 测试邮箱不含真实客户数据；
- 测试发送只允许到受控域/回收邮箱；
- CI 默认运行 Fixture，真实测试按计划或发布门禁运行。

### 10.2 最小真实 Probe

Gmail：

- OAuth、Refresh、Scope；
- list/search/get；
- 带多层 MIME 和附件的邮件；
- send 到受控邮箱；
- history 增量；
- 撤销授权后的错误映射。

Outlook：

- Entra Tenant 限制、OAuth、Refresh；
- list/search/get + ImmutableId；
- sendMail 202；
- Delta 初始化和增量；
- 移动邮件后的行为；
- 撤销同意/过期 Token 后的错误映射。

真实测试必须清理发送内容和 Token，并记录测试 App/账号所有者。

## 11. 安全威胁清单

| 威胁 | 主要控制 |
| --- | --- |
| OAuth CSRF / Account Linking Attack | state + PKCE + nonce + 一次性 Attempt + 主体验证 |
| 跨租户 Connection 引用 | 可信 TenantContext + Repository TenantScope + Ref 绑定 |
| Token 泄露 | 信封加密、最小解密面、日志清洗、Secret 分表 |
| Prompt Injection | untrusted_external 标记、动作重新授权、禁止自动跟随正文指令 |
| HTML/追踪像素 | 清洗 HTML、不加载远程资源 |
| Query Injection | AST 编译、字段/运算符白名单、字面量转义 |
| SSRF | 固定 Provider Host、nextLink Host 校验、禁止任意 URL |
| 恶意附件 | 大小限制、流式、哈希、隔离、病毒扫描 |
| 重复发送 | Delivery Ledger、状态机、Payload Hash、Unknown 不重试 |
| 调度漏信 | Provider 增量游标、Receipt、游标过期恢复、Lag 告警 |
| 调度重复 | Checkpoint Lease、Receipt、下游幂等键 |
| 高权限连接滥用 | 最小 Scope、读/发分离、ACL、审批、审计 |
| 数据过度保留 | 正文默认不入库、短期 Artifact、保留任务 |
| Provider 配额耗尽 | 分层预算、限流、退避、Jitter、字段选择 |

## 12. 验收标准

### 12.1 独立性

- [ ] Email Skill 可以使用 Mock Host 独立启动、迁移和执行合同测试；
- [ ] Skill 业务代码不依赖当前平台 Prisma/Nest Service；
- [ ] 当前平台只有通用 Remote Runtime、Context、Approval、Artifact 集成；
- [ ] 安装、升级、禁用、卸载不要求修改核心邮件业务代码；
- [ ] 新增 Provider 只需实现 Provider SPI 和测试，不修改宿主。

### 12.2 Gmail / Outlook 功能

- [ ] 两个 Provider 均支持 recent/search/by_ref；
- [ ] 两个 Provider 均返回统一 NormalizedMessage；
- [ ] 两个 Provider 均支持新邮件和 reply；
- [ ] 两个 Provider 均支持附件导入 Artifact；
- [ ] Gmail History 和 Outlook Delta 均支持重启恢复；
- [ ] Cursor 过期有显式 Recovering 流程；
- [ ] Scope 缺失可以引导增量授权。

### 12.3 安全与可靠性

- [ ] 跨租户 Ref、Connection、Artifact 均被拒绝；
- [ ] Refresh Token、Client Secret、OAuth Code 不进入日志/Trace/API；
- [ ] 邮件正文被标记为外部不可信；
- [ ] `email.send` 必须经过 Payload-bound Approval；
- [ ] Unknown Send 不自动重试；
- [ ] 同一 requestId 并发不会提交两次；
- [ ] 多实例 Poll 不会同时推进同一 Checkpoint；
- [ ] 敏感正文遵守 TTL 和访问策略。

### 12.4 运营

- [ ] 管理员能查看 Provider App、Connection、Checkpoint 和 Delivery 状态；
- [ ] 运维能按统一错误码定位问题，不需要查看邮件正文；
- [ ] Reauth、Lag、Cursor Rebuild、Unknown Send 有告警；
- [ ] 能按组织禁用发送或整个 Suite；
- [ ] 回滚保留 Delivery Ledger 和已提交 Checkpoint。

## 13. 主要风险与缓解

### R1：Google Restricted Scope 合规成本

`gmail.readonly` 属于 Restricted Scope。不同部署方式可能涉及 Google App Verification、安全评估或客户管理员策略。

缓解：BYOA、最小 Scope、渐进授权、不长期存正文、提前提供客户配置清单。进入实现前由产品/法务/安全结合部署模式确认要求。

### R2：Microsoft 搜索语义与 Gmail 不完全一致

统一搜索可能误导用户认为两个 Provider 完全等价。

缓解：Query AST + 能力矩阵；无法完整表达时明确 Unsupported；对受控候选集才允许本地后过滤；结果返回降级 Warning。

### R3：发送接口缺少 exactly-once

提交后超时可能无法判断 Provider 是否处理。

缓解：Delivery Ledger、严格状态机、Unknown 不重试、人工处置、可选追踪 Header；产品文案不承诺绝对 exactly-once。

### R4：宿主执行结果长期保存正文

现有通用执行结果可能把 Output JSON 长期存储，扩大敏感数据面。

缓解：正文默认 ArtifactRef、字段敏感标记和 TTL；在宿主未具备敏感结果治理前限制 full 输出的内联内容。

### R5：定时任务与游标错误导致漏信

错误推进、多个 Consumer 共用游标或 Cursor 过期都会造成漏信。

缓解：每 Consumer Checkpoint、原子提交、Receipt、Lease、Baseline 握手、Cursor Recovery 和 Lag 监控。

### R6：过度嵌入当前系统

若连接配置、Token 或 Provider 逻辑进入平台核心模块，后续升级与复用成本会快速增加。

缓解：以 Mock Host 独立运行作为 CI 门禁；Host Adapter 不含邮件业务逻辑；Skill 自有 Schema；只通过版本化 ABI/Port 集成。

## 14. 上线前决策门

以下事项在编码前需评审确认，但不改变总体架构：

1. Gmail Restricted Scope 的具体发布/验证责任由平台方还是客户承担；
2. Outlook 首期是否仅允许单租户 Entra App；
3. 敏感 Artifact 的默认 TTL、最大正文和最大附件；
4. 首期是否实现 reply，还是只实现 new send；
5. `email.messages` 的 Outlook 自由文本搜索采用哪条 Graph API 路径；
6. Host Approval 是否已经支持 Preview/Payload Hash 绑定；
7. Host Runtime Context 增加 orgId/consumerId/scheduleFireId 的合同版本；
8. Skill 数据库使用同实例独立 Schema还是独立实例。

推荐默认选择：

- Gmail/Outlook 均由客户 BYOA；
- Outlook 优先单租户；
- 正文 8 KiB 内联、256 KiB 单封阈值、附件 20 MiB、Artifact TTL 24 小时；
- 首期 new + reply，不做 reply-all/forward；
- 先实现结构化搜索，复杂自由文本搜索做显式能力探测；
- 数据库先同实例独立 Schema，保留迁往独立实例的能力。

## 15. Definition of Done

首期可以宣称完成，必须同时满足：

1. Gmail 和 Outlook 真实测试账号通过读取、搜索、发送、附件和增量同步；
2. Email Skill 在 Mock Host 下独立运行；
3. 当前平台没有新增 Provider 专用业务 Handler；
4. 多租户、Token、Prompt Injection、附件和发送故障测试通过；
5. 定时 Poll 在重启、多实例、429、Cursor 过期场景不丢失已知变化；
6. Unknown Send 有明确 UI/Runbook，不会被自动重试；
7. 监控、告警、审计、回滚和数据保留策略可操作；
8. 官方 API 与 Scope 文档已在发布时重新核对。

