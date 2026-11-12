# Azure VPN 对话的 MCP 使用审计

结论：2026-11-04 22:21（Asia/Shanghai）这轮没有使用 Microsoft Learn MCP；实际调用一次普通 web_search，然后生成回答。

- 会话：9354284d-8567-43ef-bbe4-ae3b600c45c0
- 用户：admin
- 输入：用Microsoft Learn mcp 查找 azure vpn设置的方法
- 路径：个人聊天 → AI Orchestrator → Session Broker → 用户沙箱 dsh → 模型代理 → 普通网页搜索 → 模型回答。

## 执行证据

指定 Redis chat_session 的 assistant.metadata.executionTrace 显示：

- durationMs：29842；exitCode：0
- 模型调用：2 次；工具调用：1 次
- 唯一工具：web_search，status=success
- 参数：query="Azure VPN gateway setup configuration Microsoft Learn"，freshness="month"
- 输入 tokens：15287；输出 tokens：1270
- 工具循环耗时：10047.17ms、15138.07ms
- 检索回答验证：completed / substantive_answer

AI Orchestrator 日志：22:21:25 POST /ai/proxy/v1/search/web，3395ms。该轮没有 /ai/proxy/v1/mcp/tools 或 /invoke 请求。

McpInvocation 查询窗口 22:15–22:24 仅有一条 22:18:11.941 的成功调用，ID=5035153a-9493-4d66-bfc1-79d32c2edd39。这是之前 Azure SQL 连接池的配置连通性测试，不是本轮 VPN 请求。

## 原因与边界

本次只读检查实际用户沙箱：DSH_MCP_ENABLED=true，get_sandbox_tools 可返回 list_external_tools 和 call_external_tool，当前路由源码也包含追加 MCP 工具逻辑。没有证据显示 MCP 服务器调用失败：这轮根本没有走到 MCP 网关。

可确认的偏差是模型选择普通网页搜索，未遵循用户明确指定的 MCP 来源。工程上当前仅提供通用发现/调用工具，没有为显式指定连接建立来源履约约束，回答门禁仅接受 substantive_answer，没有检查 MCP 成功调用证据。沙箱当前工具可用性不等于留存了历史模型请求的完整工具列表，因此不声称已逐字还原当时工具列表。

建议：显式指定外部连接时，先发现用户授权目录、确定连接，优先调用对应工具；不可用时明确报告，禁止静默改用普通搜索。结果校验应核对连接 ID、工具和成功调用记录，并在界面展示实际来源。无需把特定品牌硬编码为统一路由规则。

本次仅审计，没有修改原对话或执行逻辑。
