# MCP 路由及 Skill 注册审计

## 结论

当前 Microsoft Learn 可以通过个人模式的两步通用工具入口调用，但没有自动注册成个人 Skill，也没有把 microsoft_docs_search 直接作为首轮函数注入模型。当前 admin 连接为 personal，未创建 builtinSkill。组织连接发布时才会创建 platform.mcp.<bindingId>，供工作能力目录使用。

## 实机复跑

在 admin 实际沙箱运行相同提示词“用Microsoft Learn mcp 查找 azure vpn设置的方法”，使用当前 SkillRouter 和 select_active_tools：

- selected_skill=null
- 当前本地 Skill 目录共 19 项，没有 Microsoft Learn 或 MCP 专用 Skill
- 最终工具列表：web_search、fetch_page、list_external_tools、call_external_tool

这是当前路由复跑，未重新调用模型，不等同于恢复历史请求原文。

数据库只读查询：

- 连接 b8886e38-4c6d-4053-86ba-09197d38c9cd，Microsoft Learn（公开测试），personal，active
- 工具 e0449587-d7ee-4500-9cdc-ffdbd55fb4e6，microsoft_docs_search，published
- 对应 builtinSkill 查询结果为空

## 实现路径

个人模式：SkillRouter 扫描本地 Skill 文件 → select_active_tools 追加通用 MCP 发现和调用工具 → 模型先 list_external_tools → 再 call_external_tool(binding_id, arguments) → 个人代理强制 personal 模式 → 平台权限与契约检查 → Runner → 远程 MCP。

代码依据：

- skills.py:get_available_skills 仅扫描 custom/certified 目录及 SKILL.md/README/manifest；不读取 McpToolBinding。
- tools.py 把 MCP_TOOLS 加入全局定义，并在派发时转 execute_mcp_tool。
- tool_routing.py:339–342，在一般分支尾部追加两项 MCP 通用工具。
- mcp_tools.py 两项描述均为泛化文案，没有首次注入具体连接名；模型需先发现目录。
- McpPublicationService.publish:11 对非 organization 直接 return；organization 才创建 manifest、版本、部署以及 triggerKeywords=[连接名,远端工具名]。

## 缺口

1. 个人连接只有工具绑定，未进入个人 Skill 自动路由；“连接已配置”和“Skill 已注册”是两件事。
2. 首轮只看见通用发现工具，不直接知道 Microsoft Learn 已连接，且普通 web_search 同时可用。没有来源优先或指定连接的履约约束。
3. select_active_tools 中 PDF/Word、部分表格和 Markdown 分支会提前 return，绕过尾部追加 MCP 工具。当前普通 VPN 问答不受影响，组合任务可能根本看不到 MCP。
4. tools 列表返回工具绑定和 connectionId，缺少专门的 connectionName 展示字段，供应商身份可发现性不足。
5. 没有成功 MCP 调用证据的回答仍可通过现有 substantive_answer 门禁。

## 建议

优先增加按用户和模式过滤的连接能力摘要，保留 progressive discovery，不把全部远端 Schema 塞入首轮；把统一工具汇合放到所有分支之后；用户显式指定连接时先解析连接、要求对应成功调用证据，失败需明确报告。个人和工作复用一个受权限控制的能力描述模型，但不把个人凭证或个人能力注册为全局可见 Skill。是否生成 SKILL.md 是表现形式，不能代替权限、路由及证据检查。

本次为只读审计及可复用复跑脚本，没有修改路由逻辑或连接范围。复跑脚本：tests/e2e/mcp/audit-routing.cjs。
