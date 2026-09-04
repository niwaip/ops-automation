# 独立 Email Skill Suite 设计文档

状态：设计评审稿  
版本：`0.1`  
范围：Gmail、Microsoft Outlook / Microsoft 365  
最后更新：2026-09-02

## 1. 文档目的

本目录定义一个可独立安装、独立部署、独立演进的 Email Skill Suite。它借鉴
[DeepSeek Harness Discussion #528](https://github.com/deepseek-ai/deepseek-harness/discussions/528)
中“以统一邮件工具屏蔽不同 Provider 差异”的思路，但不复制其本地单用户配置方式，也不把邮箱能力深度嵌入现有平台。

核心结论如下：

- 对用户和模型暴露少量、稳定、面向意图的能力，而不是把 Gmail API 和 Microsoft Graph 的每个接口都暴露出来。
- 对平台只暴露稳定的 Skill ABI；OAuth、连接、令牌、Provider 路由、游标和幂等记录由 Email Skill 自己拥有。
- 一个 Email Skill Suite 可以发布多个能力入口，但它们共享同一连接层、Provider Adapter 和安全策略。
- 首期只支持 Gmail 和 Outlook 的委托用户授权；应用权限、共享邮箱、域级委派和邮件规则不在首期范围。
- 邮件读取是外部不可信输入；邮件发送是有副作用动作，必须单独授权、审批和幂等控制。
- 定时拉取复用宿主平台的通用调度与执行能力，Email Skill 只负责邮件增量同步状态，不接管平台调度器。

## 2. 分段文档

建议按以下顺序阅读：

1. [总体架构与边界](00-architecture-and-boundaries.md)
2. [能力暴露与统一契约](01-capability-contracts.md)
3. [连接、OAuth、租户与安全](02-connections-oauth-and-security.md)
4. [Gmail 与 Outlook Provider Adapter](03-provider-adapters.md)
5. [定时拉取、增量同步与事件交付](04-scheduling-and-sync.md)
6. [发送审批、幂等与未知状态](05-outbound-safety-and-idempotency.md)
7. [部署、宿主集成、可观测性与实施计划](06-deployment-integration-and-rollout.md)
8. [测试、验收标准与风险清单](07-testing-acceptance-and-risks.md)

## 3. 关键术语

| 术语 | 含义 |
| --- | --- |
| Email Skill Suite | 本文设计的独立邮件能力包及其运行时 |
| Host / 宿主 | 安装并调用该 Skill 的当前平台或其他兼容平台 |
| Provider | Gmail 或 Microsoft Outlook / Microsoft 365 |
| Provider App | 用户单位在 Google Cloud 或 Microsoft Entra 中创建的 OAuth 应用 |
| Connection | 某组织中的某个邮箱账号与 Provider App 建立的授权连接 |
| Capability Entry | 暴露给规划器或工作流的稳定能力入口 |
| Host Port | Skill 调用宿主提供的身份、审批、制品、审计等抽象接口 |
| MessageRef | Skill 生成的不透明邮件引用，不等同于 Provider 原始 ID |
| Checkpoint | Gmail historyId 或 Outlook deltaLink 的持久化包装 |

## 4. 决策摘要

| 主题 | 决策 |
| --- | --- |
| 产品形态 | 一个独立 Email Skill Suite，而不是平台内部的 Email 模块 |
| 模型可见入口 | `email.messages`、`email.send`、`email.attachment`；`email.poll` 默认仅运行时/调度可见 |
| 连接管理 | 独立管理 API，不作为模型工具暴露 |
| Provider 路由 | `mailboxKey -> connection -> provider adapter`，调用方不传 Provider 密钥 |
| OAuth | 组织自带 OAuth App（BYOA），委托授权，最小 Scope |
| 数据存储 | Skill 自有逻辑 Schema；不与宿主业务表建立物理外键 |
| 运行形态 | 独立服务为规范形态；同进程运行只能是兼容优化，须保持同一 ABI |
| 定时任务 | 宿主调度、Skill 同步；以 `consumerId` 隔离检查点 |
| 推送通知 | 非首期；后续仅作唤醒信号，增量 API 才是事实来源 |
| 写操作 | `email.send` 独立审批、Payload 哈希绑定、幂等账本 |
| 邮件正文 | 标记为敏感且不可信；限制内联大小，优先短期制品引用 |

## 5. 非目标

首期不包含：

- IMAP/SMTP 通用接入；
- Yahoo、iCloud、Exchange On-Premises；
- Google Workspace 域级委派；
- Microsoft Graph 应用权限；
- 共享邮箱、代理发送、Send As / Send on Behalf；
- 邮件删除、移动、标记已读、标签管理、规则管理；
- 自动执行邮件正文中的操作指令；
- 自建完整邮件索引或长期归档系统；
- 以 Provider Webhook 替代持久化增量游标。

上述能力以后可以通过新增 Provider Adapter、Capability Entry 或 Policy 扩展，不需要改变首期统一契约的基本边界。
