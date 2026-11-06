# MCP HTTP 支持与验证

## 结果

已解除配置保存和 Runner 请求两层的 HTTPS 强制要求，支持公开 HTTP、自定义 HTTP 端口及运维批准的本机 HTTP 服务。传输方式仍为 Streamable HTTP，无需另选一种协议。

当前开发环境已配置：

```dotenv
MCP_LOCAL_HOST=host.docker.internal
MCP_TRUSTED_ENDPOINTS=http://host.docker.internal:9000/,http://host.docker.internal:9000/mcp
```

填写 `http://localhost:9000` 会保存为 `http://host.docker.internal:9000/`；`127.0.0.1`、`::1` 与 `/mcp` 路径同样支持。这里的“本机”指平台部署宿主机，不是远程浏览器所在电脑。Runner 通过 Docker host-gateway 访问宿主机。

原有域名、DNS 实际连接地址、禁止重定向、禁止跨路径及凭证隔离检查继续生效。精确本机端点名单不能由连接请求自行扩展，不会放行相邻端口或其他路径；云元数据、链路本地及广播地址即使写入名单仍被拒绝。组织连接管理及每用户凭证规则未变。

## 验证

- Workbench 和 MCP Runner 构建通过；user-web、portal 类型检查通过。
- 配置与鉴权测试 6 项通过；Runner 网络策略、鉴权及真实 HTTP SDK 测试 10 项通过。
- 使用官方 SDK 构造临时只读 MCP Server，监听宿主机 9000；经过真实 Platform → HMAC Runner → 宿主机 HTTP 链路完成创建、工具发现、工具发布、契约校验和只读调用。
- 截图中的根地址 `http://localhost:9000` 和带 `/mcp` 路径均实测成功。公开 HTTP 自定义端口可保存；未批准的 localhost:9001 被拒绝。
- 实际浏览器新增个人连接，输入 `http://localhost:9000/mcp`、无需认证，保存返回 201；发现工具返回 201，并显示 `fixture_status`。
- 已重新创建 platform 和 mcp-client-runner，核对运行结果，未依赖旧进程热更新。
- 所有临时连接和调用记录已删除，临时 9000 服务已关闭。未调用或扫描真实 Trivy 服务；验收结束时宿主机 9000 未有服务监听。

证据：`mcp-http-deployment-2026-11-06.json`、`mcp-http-browser-2026-11-06.json`。

涉及文件：配置策略 `mcp-endpoint-policy.ts` / `mcp.types.ts`，Runner `network-policy.ts`，共享连接页面 `McpConnectionsPanel.tsx`，Compose 环境及 host-gateway 配置，运维文档 `docs/design/MCP-Outbound-Operations.md`。没有改动已有连接配置、授权或业务工具。
