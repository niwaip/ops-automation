# “今天的体育赛事”调用审计（2026-10-22）

## 1. 结论与定性

**执行正常结束，但答案交付不完整。** 后端最终仅保存了 24 字标题“2026年10月22日（周四）体育赛果与热点速览”，没有赛事正文。沙箱本地历史与 Redis 历史一致，故问题在进入前端展示之前已存在。

定性为**回答生成/处理阶段的提前收尾，加上工程完整性验收缺口**。现有证据支持模型过早结束的判断，但没有留存清洗前的逐轮模型响应，不能完全排除输出清洗剥离内容；不将模型责任写成已获原始响应证明的事实。

执行轨迹为 `exitCode=0`、最终 `finishReason=stop`，31 秒左右结束，未记录超时、网络异常或 `length`。没有证据支持“达到 300 秒时限”“锁等待超时”“前端丢失完整正文”的解释。

## 2. 调用定位与链路

- Session：`chat-session-1792663236087-4ucpjc0a`
- Assistant message：`1792663243471-kty8zl0i`
- User：`e7fce333-a8f4-4097-9a53-f0a4c729da46`
- Model：`qwen36-35b-a3b`（`d13e0d30-87b9-4e87-b96a-d8b1b3cf78af`）
- 参数：`--web-search --thinking --reasoning-effort medium --timeout 300`
- 链路：前端 `/ai/chat/stream` → AI-Orchestrator → Session-Broker → 用户沙箱 `dsh run` → 模型代理及网页搜索 → 沙箱最终输出 → Redis 会话历史。

以下时间均为北京时间（UTC+8）：

| 时间 | 事件 | 证据 |
| --- | --- | --- |
| 18:00:43 | 分发到个人沙箱，获取用户锁 | waitedMs=1；容器已在运行 |
| 18:00:44–18:00:51 | 第一次模型代理请求 | 7064 ms |
| 18:00:51–18:00:53 | 第二次模型代理请求 | 1928 ms |
| 18:00:53–18:00:56 | 搜索今日赛程与赛果 | 3722 ms |
| 18:00:56–18:00:59 | 搜索足球、欧冠、英超、NBA | 2959 ms |
| 18:00:59–18:01:06 | 搜索体育新闻热点 | 6797 ms |
| 18:01:06–18:01:10 | 第三次模型代理请求 | 3878 ms |
| 18:01:14 | 释放锁、保存标题回复、结束 HTTP 请求 | `/ai/chat/stream` 31007 ms |

三次模型请求的结束原因按记录顺序为 `stop / tool_calls / stop`。这表示三次模型调用，不应直接等同于三轮工具执行；runner 启用 thinking 时另有规划阶段。

## 3. 性能与资源

| 指标 | 数值 |
| --- | --- |
| HTTP 请求总耗时 | 31007 ms |
| Harness 耗时 | 30980 ms |
| Runner 记录耗时 | 30482.34 ms |
| 用户锁等待 | 1 ms |
| LLM 累计耗时 | 12886.66 ms |
| 搜索接口累计耗时 | 13478 ms（服务日志） |
| TTFT | 1930.56 ms（runner 指标，非用户点击到首屏端到端耗时） |
| 模型调用 / 工具调用 | 3 / 3 |
| 输入 / 输出 Token | 22097 / 674，均为多次调用累计 |
| 最终答案长度 | 24 个字符 |

674 个输出 Token 包含多次模型调用，不能据此认定模型曾输出了 674 Token 的赛事正文。检索回执中有实际来源与文本，并非三个空结果；检索成功也不等于其中所有赛果已获核实。

## 4. 根因证据与复现

### 已确认的事实

1. Redis 历史与沙箱 `.dsh/sessions/<session>.json` 的 assistant 内容完全相同，仅有标题。因此不是单纯的浏览器显示问题。
2. executionTrace 记录三次 `web_search` 均为 `success`；沙箱证据文件确有三份检索回执。
3. executionTrace 的 `guardDecisions=[]`；证据文件同样没有 guard 决策，`verified=false`。该字段本身并不证明工具失败。
4. 当前运行时 `_check_no_tool_assertion_guard` 对这条标题返回 `pass`、无反馈；`_finalize_agent_text` 原样返回标题，未调用补全模型。

### 工程缺口

`agent_loop.py` 的最终化检测主要处理空输出、行动垫话、虚假文件完成声明、内部计划和工具标签。短回复还需命中特定关键词才被当作垫话；这条标题虽短，却不满足这些条件，因此作为最终答案放行。

当前代码没有覆盖“检索任务已经得到回执，最终输出却只有标题、没有用户所需事实”的完整性检查。

- `apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/agent_loop.py:641`：最终文本验收与补全入口。
- `apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/agent_loop.py:681`：短文本与垫话判断。
- `apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/agent_loop.py:624`：无工具断言检查最终返回 `pass`。
- `apps/backend/intelligence/ai-orchestrator/src/modules/chat/user-sandbox-dispatcher.service.ts:985`：将最终答案持久化。

### 复现结果

使用本地当前源码导入运行时模块，传入原始问题和实际保存的标题；mock 模型函数以确保复核不发出新模型请求：

```json
{
  "title_chars": 24,
  "clean_output_unchanged": true,
  "same_as_title": true,
  "recovery_model_calls": 0,
  "guard_action": "pass",
  "feedback": null
}
```

这是对验收缺口的定向复现，不是对原始模型生成过程的重放。沙箱运行时模块为本地源码 bind mount，但没有该次调用发生时的源码 hash，不能保证审计时源码与调用时逐字一致。

### 归因边界

最终 `stop` 是 runner 接收到并记录的结束状态。现存会话没有保存最后一轮清洗前响应及全部 SSE 帧，因而无法单凭 `stop` 完全区分模型只生成标题、清洗后剩余标题、或上游服务提前结束。可以确认的是：答案在沙箱端已只剩标题，平台未对这种不完整交付进行修复。

## 5. 建议修复

1. 在独立的检索答案验收模块中检查“仅标题、无事实正文”，结合问题和检索回执判断，避免把所有短答案一律判错。
2. 检测到不完整答案时，在剩余 deadline 内允许一次有界补全；补全仍不合格，应返回明确的未完成状态，而非成功标题。
3. 为逐轮模型调用留存脱敏元数据：清洗前后长度与 hash、结束原因、是否收到 `[DONE]`、补全触发原因。不要将敏感原始响应无条件全量落日志。
4. 增加有针对性的回归覆盖：检索后仅标题、正常短事实回答、合法澄清提问、真实 length/超时。

本次仅审计，未修改业务代码、重启服务或重跑用户任务。

## 6. 留存证据

- `docs/artifacts/reviews/sports-call-audit-20261022/session-snapshot.json`：目标 Redis 会话快照，含 executionTrace。
- `docs/artifacts/reviews/sports-call-audit-20261022/service-logs.txt`：18:00:40–18:01:16 的编排服务及 Broker 日志。
- 沙箱原始历史：`data/users/e7fce333-a8f4-4097-9a53-f0a4c729da46/workspace/.dsh/sessions/chat-session-1792663236087-4ucpjc0a.json`。
- 沙箱回执：同目录 `chat-session-1792663236087-4ucpjc0a.evidence/1792663274494897927-6fb9f84c3fa24dd2826e6b9d7204b2ac.json`。
