# MCP 10:27 失败修复与验证

## 修复结果

针对 `chat-session-1793845500138-bq8e9zrz` 暴露的问题，已修改本地运行代码并通过仓库统一入口重新构建、重启 AI-Orchestrator；沙箱模块通过现有只读挂载由新 dsh 进程加载。未修改管理员模型选择、公开 MCP 连接配置或原失败会话内容。

1. 模型流使用结构化终止码 `MODEL_REPETITION`、`MODEL_GENERATION_BUDGET`、`MODEL_STREAM_LIMIT`；AgentLoopResult 保留 stop_reason，最终来源门禁不再覆盖真实中断原因，也不把无结果统一描述成连接异常。
2. 独立 `sandbox-stream-guard.ts` 在接收上游模型流时检查重复，取消仍在生成的请求，丢弃缓冲草稿，不自动重试或 fallback。保留正常网络故障的有界重试；工具参数不参与正文重复检测。错误中仅包含模式长度、重复次数、目标与 SHA-256。
3. 内部缓冲限制 2 MiB / 32768 帧；MCP 工具生成阶段预算 45 秒，其余内部缓冲阶段 180 秒。回归验证了没有任何 delta 时也能按预算取消。
4. 模型中断也计入调用次数和耗时，并写 model_failed 事件；用量未知标记 usageKnown=false，汇总标记 tokenUsageComplete=false，不补造 Token 数。
5. 明确选中的只读 MCP 用独立步骤门禁逐层提供读取 Skill、单工具披露和受限 binding 调用。仅复用已披露的一个 inputSchema 约束当前 arguments，不把全部工具 Schema 放入提示词；失败、待确认和写入任务不强制继续执行。
6. 真实回归额外发现错误字符串被适配成成功，已一并修复：MCP 参数/通信/响应失败返回类型化 ToolResult；非对象 arguments 在本地阻断；AI 代理保留安全 HTTP 状态而不传播 Axios 配置、凭证或上游正文。来源门禁使用固定错误类别说明。

## 自动回归

| 范围 | 结果 |
| --- | --- |
| Python MCP 测试（含 7 个新增失败回归） | 26 项通过 |
| Python 原有重复熔断 | 4 项通过 |
| Python 模型记账 | 3 项通过 |
| Jest 流保护、控制器、取消、完成响应、fallback | 29 项通过 |
| Jest MCP 代理安全错误边界 | 8 项通过 |
| Python 语法及 git diff --check | 通过 |

合计 70 项针对性检查。故障注入覆盖“read_skill 成功 → 第二轮收到重复熔断 → 保留原因并计入两次模型请求”、未知 Token、上游尚未结束就被取消、容量/时间预算、草稿不外泄、无自动 fallback、契约隔离和失败不误记成功。

AI 服务重启时按 Compose 的既有 command 执行构建，日志确认 Nest 成功启动；实际查询经重新启动的服务完成。

## 真实模型与外部 MCP 验证

使用 admin 已有 Microsoft Learn 公开只读连接、当前默认模型 `qwen36-35b-a3b`，通过实际用户沙箱执行原问题。均使用新的验证会话，不覆盖原用户会话。

- 中间版本：`mcp-skill-test-4362a847-a37a-448f-8ff2-05f6dd3cc0ba`，约 58.9 秒，完成 5 次搜索、2 条依据审核要点。期间发现空字符串业务参数被网关拒绝却记为成功，促成本次第 6 项修复。该记录仅作为中间发现保留，不作为最终版本结论。
- 最终版本：`mcp-skill-test-a889bae1-94bd-4032-979c-2ea500f4bb0e`，2026-11-05 10:52:11–10:52:44，沙箱耗时 **33261.87ms**，模型请求 8 次，Token 输入 29726 / 输出 1416；本轮 Token 汇总完整。
- 实际远端调用 **2 次，均 completed**：`microsoft_docs_search`、`microsoft_docs_fetch`。调用记录分别为 `d30a4a7e-5d03-43fd-a3af-097fbc96a06d`、`e1e8003e-eae5-4188-a32b-1dd2566b48ab`。
- 顺序：读取 Skill → 披露 search 契约 → search 成功 → 尝试直接 fetch 被本地 `MCP_CONTRACT_REQUIRED` 拦截 → 披露 fetch 契约 → fetch 成功 → 汇总与原文依据审核。拦截正确记录为 error，未发出额外远端调用。
- 最终返回 5 条带来源的要点，审核记录保留对应 invocationId、URL 和可匹配原文引句；分层披露与原文依据验证均通过。

最终证据：`mcp-recovery-live-model-verification-2026-11-05-2.json`。中间记录：`mcp-recovery-live-model-verification-2026-11-05-1.json`。原失败审计及证据保持不变。

## 验证边界

此次真实回归经过用户沙箱、真实模型代理、MCP 权限/契约网关和外部 Microsoft Learn 服务，没有重新操作浏览器前端；33.3 秒是本轮观测值，不是延迟保证。原文匹配与来源绑定不能形式化保证语义正确，仍遵守现有产品/版本范围约束。验证环境为本地开发 Compose，不代表远端环境已部署。
