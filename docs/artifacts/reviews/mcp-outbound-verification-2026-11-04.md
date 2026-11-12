# MCP 出站接入实施与验证

已完成本地代码、数据库增量迁移、开发服务启动和真实协议/数据库联调。

## 交付

- 官方 SDK 1.32.2 的独立 Streamable HTTP Runner；HMAC、防重放、连接隔离、网络目标限制、结果体积和超时控制。
- 个人管理自己的连接；工作连接由组织管理员配置发布，每位用户绑定本人加密凭证。
- 不可变连接版本、工具参数契约、角色/组织校验；接入现有 capability registry 和工作执行 handler。
- 个人沙箱通过现有认证代理调用两项渐进工具，不接触远程凭证。
- 写入确认、同一调用标识防重复、响应丢失标记结果不明且不自动重试。
- 用户设置和管理后台页面；数据库 schema 镜像、所有权及角色声明同步。

## 结果

- 26 项真实 MCP HTTP + PostgreSQL 集成检查全部通过，逐项记录见同名 JSON。
- Runner 4 项网络策略测试通过。
- Workbench、Registry、Runner 构建，Platform/Control Plane 和两个前端类型检查通过；Control Plane 最终重新构建通过。
- Python 模块语法检查通过；52 个 workspace 包的依赖和无环检查通过；diff whitespace 检查通过。
- 开发数据库迁移已执行，两个 Prisma Client 已生成；schema ownership 与迁移权威检查通过。
- 最终显式重启 Platform、Runner、Control Plane；个人代理及前端也已重启。Platform MCP 路由和个人代理无凭证返回 401，Runner 健康检查返回 200。

## 范围和限制

- 测试使用受控 MCP 服务、真实开发 PostgreSQL 的临时 schema 和临时账号；没有使用生产数据库或真实第三方凭证。
- 个人测试私网 fixture 路由通过测试数据直接设置；生产个人 API 仍拒绝私网。
- 处理器和个人代理执行了真实 HTTP 转发；目录组织边界验证调用真实权限模块。未验证完整模型对话、浏览器交互及整条工作流恢复。
- 当前认证为手工 Bearer/API Key，没有 OAuth 和 stdio；没有生产部署。
- AI Orchestrator 全量类型检查仍有与本次 MCP 文件无关的既有错误，不能声称全仓类型检查通过。迁移目标检查缺少 CONTROL_PLANE_MIGRATION_DATABASE_URL、AI_ORCHESTRATOR_MIGRATION_DATABASE_URL，尚未完成该环境级验证。
- 外部数据库适配、账号权限与业务对账由接入的 MCP 服务承担；本次验证不证明任意第三方写入具有 exactly-once 保证。

运维、配置和使用步骤见 `docs/design/MCP-Outbound-Operations.md`。
