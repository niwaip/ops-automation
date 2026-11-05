# 2026-11-05 09:01 Azure VPN 调用审计

## 结论

本轮真实使用了 Microsoft Learn MCP，成功检索到微软文档，未改走普通 web_search。Skill 目录、Skill 读取、单工具契约披露接口均被访问。但执行顺序并未严格遵守“先契约后调用”，前两次 MCP 请求失败，之后两次成功，整体约 195 秒。最终回答的来源展示和若干技术结论不合格，不能将其判为“完整、正确的配置指南”。

会话 9354284d-8567-43ef-bbe4-ae3b600c45c0；消息 1793840279016-27kkpam3；用户 admin。开始时间 08:57:59，09:01:13 完成，均为 Asia/Shanghai。用户界面时间为回答完成时间，非请求开始时间。

## 调用链与分层

Frontend 个人聊天 → AI Orchestrator → Session Broker → admin 用户沙箱 dsh → Skill 准入 → MCP 个人代理 → Platform 网关 → Runner → https://learn.microsoft.com/api/mcp。

- 08:57:59：GET /ai/proxy/v1/mcp/skills，12ms。
- 08:58:06：GET /ai/proxy/v1/mcp/skills/mcp-b8886e38-4c6d-4053-86ba-09197d38c9cd，13ms。
- 准入结果：skill_admission=use，命中该 Microsoft Learn Skill。
- 08:58:11：list_external_tools(skill_id)，只读取索引。
- 随后未先读取契约，直接 call_external_tool，猜测加入 topic、language 参数。
- 08:59:02：才读取 list_external_tools(skill_id, tool_name=microsoft_docs_search) 的单工具契约。
- 后续调用只保留 query。没有 microsoft_docs_fetch，也没有普通 web_search/fetch_page。

因此分层接口已接通，模型仍可绕过先取契约这一步。后端会按已发布 Schema 校验，但未强制“本轮已取过该工具契约”。不能把第一次失败直接归因于多余参数：该请求进入了 MCP 执行，错误仅为 MCP_CALL_UNVERIFIED。

## 实际 MCP 记录

| 调用 ID | 开始 | 耗时 | 状态 |
|---|---|---:|---|
| ffe01cc7-1c35-49a4-b692-4e8bb0960031 | 08:58:14 | 46.585 秒 | failed |
| 456ec3ea-79df-4560-a3e2-08a391dec9a1 | 08:59:04 | 45.648 秒 | failed |
| f057624b-543d-4f27-908f-97a4fe5b5a59 | 08:59:54 | 6.614 秒 | completed |
| 4c878329-1dce-4b19-ab0c-d4a2c65f2867 | 09:00:04 | 7.817 秒 | completed |

均对应 binding e0449587-d7ee-4500-9cdc-ffdbd55fb4e6、工具 microsoft_docs_search、effect=read。失败耗时接近连接配置的 45 秒限时，但因 Runner 与网关把异常统一隐藏，无法还原具体失败阶段及 DNS/TLS/超时分类。此次没有数据库或 Azure 配置写操作。

## 来源核查

两次成功返回分别各有 10 条结果，存在同页不同片段及重复。

首次成功结果主要是 Azure Stack Hub VPN 配置、一个 Microsoft Q&A 回答、P2S RADIUS 和 VNet-to-VNet 页。它们来自 learn.microsoft.com，但“同域名”不等于“都是当前 Azure 公有云的权威配置教程”：Stack Hub 产品范围不同，Q&A 也不能等同于产品文档。

第二次成功查询更准确，结果集中到 Azure VPN Gateway 创建与 S2S 教程。

最终正文的 5 个官方链接：

| 链接路径（learn.microsoft.com 下） | 是否为返回条目的直接 URL | 是否在返回片段中出现 |
|---|---|---|
| /azure/vpn-gateway/tutorial-create-gateway-portal | 是 | 是 |
| /azure/vpn-gateway/tutorial-site-to-site-portal | 是 | 是 |
| /azure/vpn-gateway/vpn-gateway-about-vpn-gateway-settings | 否 | 是，关联文档链接 |
| /azure/vpn-gateway/vpn-gateway-about-vpngateways | 否 | 是，关联文档链接 |
| /azure/vpn-gateway/point-to-site-about | 否 | 是，关联文档链接 |

链接不是凭空捏造，但后三篇没有被独立读取；本轮仅调用 search，不能声称已经完整读取并验证这些文档。

回答末尾又列出三份无关的成果库文件（Agentic AI 企业架构资料和阿里 AI 开发资料），不能作为 Azure VPN 设置的来源。它们是现有来源页脚逻辑误归因，并非 MCP 返回的资料。

代码根因：runner.py:691 起只将 web_search/fetch_page 识别为专门检索证据，随后虽兜底收集含 URL 的工具消息，response_sources.py:77 的提取器仅匹配行首 Markdown 链接，不解析 MCP 的 structuredContent.results/contentUrl。以本次成功的两份原始 MCP JSON 复跑提取器，均返回 0 个来源；本地扫描的 matched/score 条目仍被追加到页脚。该门禁没有要求文档在本轮实际被使用或能支持具体结论。

## 内容准确性：三个明确问题

1. **VNet Peering 与 VNet-to-VNet VPN 混淆。** 回答把“VNet 对等互连”写成通过 VPN 网关实现的加密通信。官方 Peering 文档说明其通过微软骨干网连接，通信不需要 VPN 网关；VNet-to-VNet VPN 是另一种机制。
   依据：https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-peering-overview
2. **P2S Entra ID 配置不严谨。** 把 41b23e61-6c1e-4545-b367-cd054e0ed4b4 写成通用 Audience；这是旧手动注册客户端在 Azure Public 的值。当前微软注册客户端使用 c632b3df-fb67-4d84-bdcf-b95ad541b5c8。“并启用证书认证”也不应作为单独采用 Entra ID 的必需条件。两份成功检索结果中均无该 Audience 值或 Entra 配置依据，属于未核实补充。
   依据：https://learn.microsoft.com/en-us/azure/vpn-gateway/point-to-site-entra-gateway
3. **Active-Active 的两个公网 IP 归属写错。** Azure 网关的两个实例各有一个公网 IP，本地设备应面向这两个 Azure IP 配置两条隧道；不能一概说本地设备必须配置两个公网 IP。双本地设备冗余是另一种拓扑。
   依据：https://learn.microsoft.com/en-us/azure/vpn-gateway/about-active-active-gateways

## 性能和归因

- HTTP 端到端 194705ms；沙箱 194660ms；锁等待 2ms，调度不是瓶颈。
- MCP 调用共约 106.664 秒，其中前两次失败占约 92.233 秒。
- 记录到 11 次模型调用、7 次业务工具调用（3 次索引/契约披露，4 次 MCP 调用）。另有 08:58:06 的 Skill 正文读取用于准入。
- 模型请求累计约 86.507 秒；最终生成请求约 61.520 秒，含主模型流中断重试及多个不可用 fallback。日志有连接拒绝、模型不存在、认证失败及 aborted；最终再次尝试后完成。
- 累计输入 87979、输出 2603、合计 90582 tokens。这是多轮累计，不能等同于首轮提示词；后续返回文档片段和重复请求增加了上下文。
- ttftMs=2798.8 是首个被记录模型请求的 TTFT，不是用户最终正文首字时间。

工程问题：契约读取前置条件未强制、MCP 错误分类丢失、引用解析不支持 MCP、无关本地资料被附为来源、模型 fallback 链存在失效候选。
模型问题：未先取契约、冗余重复发现及检索、未区分 Stack Hub/Q&A/公有云文档、将不受当前证据支持的 P2S 内容写为确定操作步骤。

## 建议优先级

1. 对 MCP 结果生成结构化来源记录（invocationId、tool、产品范围、标题、contentUrl、片段），页脚只展示本轮实际使用的证据；阻止无关本地扫描条目混入。
2. 执行前要求读取目标契约，针对只读操作提供有界重试与安全错误分类；不能将此机制扩展为自动重复写操作。
3. 对答案中的关键配置值和场景分类要求逐项证据；无证据时缩小回答范围或继续读取相关文档。
4. 清理不可用及能力不匹配的 fallback，压缩无效等待；对重复检索和重复上下文做预算控制。

本次仅审计及保存证据，未修改原聊天记录、路由或引用实现。原始证据见 mcp-vpn-audit-evidence-2026-11-05.json。
