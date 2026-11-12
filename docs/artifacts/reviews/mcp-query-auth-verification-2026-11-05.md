# MCP 查询参数鉴权修改与验证（2026-11-05）

已支持 API Key 请求头 / 查询参数配置，旧配置默认继续使用请求头。高德连接填写 `https://mcp.amap.com/mcp`，认证为 API Key，位置为查询参数，参数名为 `key`；每位用户保存本人密钥后发现并选择工具。

## 实现

- 连接配置仅保存基础地址、鉴权位置和参数名；拒绝把密钥写入 URL。参数名在前端、配置接口和 Runner 校验。
- Runner 在受保护 fetch 校验目标后才注入查询凭证，覆盖初始化及后续请求；SDK 地址保持无密钥。保留公开 HTTPS、私网双重允许名单、禁止跳转及跨路径等策略。
- 目录及调用结果统一处理凭证原文、URL percent 编码及表单编码脱敏。错误响应不返回 SDK/URL 原文。沿用用户独立加密凭证库、组织管理员配置权限、版本失效及撤销规则。
- 无数据库迁移，无依赖新增。未使用截图中的密钥，未调用真实高德服务。

## 验证结果

- Runner 构建及 7 项测试通过；配置和脱敏 4 项测试通过。
- Workbench 构建、user-web 与 portal 类型检查通过。
- 真实 MCP SDK + PostgreSQL 隔离集成回归 35 项通过，覆盖两个用户并发、特殊字符查询鉴权、工具发现与发布、读写确认、撤销、过期、跨组织隔离及持久化脱敏。
- 已通过统一入口重启 Platform 与 MCP Runner。运行中平台实际创建/读取查询鉴权配置成功，查询 URL 被拒绝，前端 Vite 提供新增配置字段；部署检查 7 项通过，临时连接已删除。
- 未完成浏览器交互回归或真实高德 Key 联网验证；上述 MCP 联调用的是受控服务。

证据：`mcp-query-auth-verification-2026-11-05.json`、`mcp-query-auth-deployment-2026-11-05.json`。

复现：先构建 Workbench / Runner，执行 `node --test tests/e2e/mcp/query-auth-config.test.cjs`；隔离集成通过 `MCP_VERIFICATION_OUTPUT=/workspace/docs/artifacts/reviews/mcp-query-auth-verification-2026-11-05.json python3 tests/e2e/mcp/run-verification.py`。所有 Docker 操作由该脚本调用仓库根目录的 `docker/start-smart.sh`。
