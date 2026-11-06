# MCP Skills 分层披露实施与验证

## 结果

已启用且发布当前版本工具的 MCP 连接自动投影为用户权限范围内的虚拟 Skill。个人沙箱复用 get_available_skills、SkillRouter 和 read_skill；用户 Skills 页面新增“外部 MCP Skills”列表。未生成静态 SKILL.md 或把个人能力注册到全局目录。

三层披露：连接名称/简短用途 → 选定连接的工具索引 → 选定单个工具的参数契约。无参数的通用发现工具不再返回所有 Schema。工作模式继续使用受组织/角色限制的 builtin Skill 发布。

## 实际沙箱与真实模型

提示词：用Microsoft Learn mcp 查找 azure vpn设置的方法。

- 自动命中 mcp-b8886e38-4c6d-4053-86ba-09197d38c9cd。
- 当前目录新增 MCP 摘要约 194 字符；读取 Skill 后约 686 字符，均不含 inputSchema/outputSchema。
- 普通 MCP 查询的工具面为 read_skill、list_external_tools、call_external_tool；不附带 shell 或普通网页搜索。
- 完整模型执行依次调用 list_external_tools(skill_id)、list_external_tools(skill_id, tool_name=microsoft_docs_search)、call_external_tool。
- 真实 MCP 调用 471f1dc2-30dd-44f4-be1c-3dee2bf806c7，status=completed，属于 admin 的 Microsoft Learn 连接。
- 独立测试会话 mcp-skill-test-889f5335-ef71-4c25-8045-bc695e48b658，不覆盖原对话。
- 总耗时约 42.5 秒；模型调用 7 次，工具调用 3 次。现有任务意图/Skill 准入也调用模型，累计输入 40354 tokens，不等于首轮提示词大小；本次没有一次性注入全部远端 Schema。

原始日志和遥测见 mcp-skill-live-model-verification.json。复跑入口为 tests/e2e/mcp/verify-personal-skill.cjs，通过根目录 start-smart.sh 在 session-broker 内运行。

## 自动检查

- 28 项真实 MCP HTTP + PostgreSQL 集成检查通过，新增三层披露、组织/模式隔离、停用撤回验证。
- 6 项 Python 披露测试通过：元数据不含 Schema、按需读 Skill、文档早返回也可发现、失败不返回旧目录、查询不授予 shell/网页替代、单工具定向加载。
- 9 项附件保护回归通过。
- Workbench 与 AI Orchestrator 构建通过，用户前端 tsc 通过；Python 语法、diff whitespace、52 包依赖无环检查通过。
- Platform、AI Orchestrator、User Web 已显式重启；Python 模块由实际沙箱绑定挂载并在新进程加载。

## 边界

目录缓存最长 10 秒，实际执行始终重新做权限/版本/凭证检查。只公开给有权限的用户；“公开 Skill”不代表向其他用户公开连接或凭证。

该模型复测证明路由、分层读取及真实 MCP 调用成功，不等于逐项验证 VPN 技术指导。输出沿用现有知识库来源附加逻辑，含与本请求无关的成果库来源标题；该既有展示问题没有在此次改动中处理。
