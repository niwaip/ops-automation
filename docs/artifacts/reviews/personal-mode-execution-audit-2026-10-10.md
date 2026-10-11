# 个人模式执行过程审计

日期：2026-10-10，Asia/Shanghai。审计当前未提交工作区、当前服务状态、近期真实会话，以及使用替代模型和执行器的隔离探针。没有修改业务代码、调用真实模型、执行外发动作或重启服务。

## 结论

**当前个人模式存在执行与结果可信度缺口，不能把“进程退出成功”或“有最终回答”视为“用户任务已正确完成”。** 本轮确认 6 项 P1、4 项 P2，优先修复附件失败门禁、工具身份、并发输入与取消生命周期，再补齐最终正文和交付状态验收。

真实会话中，用户上传 `image001.png` 并问“附件是什么”，回答却延续上一轮微博热搜。附件实际为 MIP 加密容器。该样本发生后，文件诊断及提示已更新；本轮进一步用当前代码确认，即使明确的解析失败诊断已经进入模型上下文，替代模型返回无关回答仍会被保存和交付。这说明提示词修补尚未形成执行门禁。

| 编号 | 优先级 | 发现 | 本轮证据 |
|---|---|---|---|
| F1 | P1 | 附件解析失败仍能交付无关回答 | 真实记录 + 当前 Runner 隔离探针 |
| F2 | P1 | 工具名称规范化不一致，副作用授权可绕过 | 当前分发器隔离探针 |
| F3 | P1 | 获取执行锁之前覆盖会话输入 | 当前 Broker 并发探针 |
| F4 | P1 | 排队取消不完整，停止操作先释放锁且缺少所有权约束 | 当前 Broker 探针 + 源码 |
| F5 | P1 | 已核验数据经模型总结后没有再次验证正文 | 当前 synthesis 隔离探针 |
| F6 | P1 | 文件发送失败仍进入发送成功分支 | 当前分发器隔离探针 |
| F7 | P2 | 非法参数被默认化，合法 JSON 非对象导致崩溃 | 当前分发器隔离探针 |
| F8 | P2 | 读取进程退出状态失败被报告为成功 | 当前 Broker 隔离探针 |
| F9 | P2 | 信息类降级仅凭正文长度接受且标记 evidence accept | 当前 AnalysisTurn 隔离探针 |
| F10 | P2 | 失败重试与重复抑制混用，普通工具缺少逐轮证据归档 | 当前探针 + 真实记录 + 源码 |

“探针确认”证明当前分支行为；其中模型、Docker、提醒和外发均为替代实现，不代表线上已发生未授权副作用。P1 表示应优先修复，P2 表示需要随后修复的可靠性或审计问题。

## 当前执行链与运行核对

```mermaid
flowchart LR
  A[个人聊天请求与附件] --> B[ChatController]
  B --> C[个人 Dispatcher]
  C --> D[历史与文件同步]
  D --> E[Broker 排队与用户锁]
  E --> F[dsh run 新进程]
  F --> G[技能与上下文及工具选择]
  G --> H[模型与工具循环]
  H --> I[结束判断与正文生成]
  I --> J[产物与证据及历史]
  J --> K[DSH 标记转 SSE 与聊天保存]
```

- 个人聊天主路径使用用户沙箱；`office-` 会话、`source=office-addin` 或 `bypassSandbox=true` 可以走直连分支。审计结论针对个人沙箱路径，不能外推为所有入口具有同等保障。[入口代码](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/chat/chat.controller.ts:318)
- AI Orchestrator、Session Broker、Redis、Postgres、user-web 均在运行；运行中的用户沙箱使用 `ops-user-sandbox:local`、非 root 身份 `sandbox`。
- 沙箱工作区和个人知识目录持久化可写，共享技能及 Python 源码挂载只读。6 个关键 Python 模块的容器文件哈希与当前仓库完全一致。
- AI Orchestrator、Session Broker 使用构建后的 `node dist/main.js`，未启用 watch。Broker 当前编译文件仍包含锁前写输入、先释放锁、退出码 0 兜底及排队关闭条件。本轮未通过新业务 HTTP 请求证明所有 TypeScript 分支在常驻进程内的行为。
- 默认执行超时 300 秒，默认锁等待 35 秒；锁覆盖执行阶段，但没有覆盖此前的输入写入。
- 所有 Docker 操作均从仓库根目录通过 `./docker/start-smart.sh` 执行；入口输出的 `PROJECT_ROOT` 指向当前仓库。
- 代码图已存在，本轮首先使用知识图发现和追踪，再以源码 imports、请求地址及实际执行器交叉核对。图中 `emit` 等同名边存在误关联，未把这些边当作实际跨服务调用。

## 近期真实执行样本

| 会话 | 可观察结果 | 证据边界 |
|---|---|---|
| `chat-session-1791621032190-yw4bjhq7` | Markdown 内容查看后生成 `AI解决方案实施路线图.pdf`，磁盘存在 89,859 字节文件 | 文件存在不证明正文中的页数或完整性已经核验；本轮未渲染 PDF |
| `chat-session-1791623291321-ezsdtm0s` | DOCX 总结后生成安装指南 PDF，磁盘存在 71,113 字节文件 | 同样仅核对存在性，未审计安装指南事实或 PDF 版式 |
| `chat-session-1791623848474-5a24uu9e` | 先总结 XLSX 配置清单，再总结本轮 PPTX | 能观察到话题切换成功样本；未逐项核对所有摘要内容 |
| `chat-session-1791624064077-bqoofxju` | 微博热点之后上传受保护图片，图片问询返回微博榜单 | **明确错答**，见 F1 |
| 最新微信 WSBK 问询 | 保存了一份具体赛程回答 | 未做外部赛程事实核验，不能认定该回答正确；本轮本地历史不含逐轮来源回执 |

这些是选取的近期样本，不构成线上成功率统计，也未覆盖所有用户、渠道、技能或失败条件。

## 发现与修复建议

### F1 — 附件诊断没有成为最终回答的强制条件（P1）

真实记录中最后用户问题为上传附件后的“附件是什么”，最终回答以“根据搜索结果，今日微博热搜榜 Top 15 如下”开头，并声称抓取于 17:31；该历史文件实际保存于北京时间 17:27:38。这一时间矛盾也是输出未经核验的证据，但不能据此判断当时具体调用过哪些工具。

附件有 101,344 字节，文件头为 `.pfile`，包含 `Microsoft Information Protection` 标记，并非 PNG。当前读取器会返回明确加密诊断；当前 `build_user_turn` 会注入异常告知要求，并且此次工具面只保留 `read_file / scan_knowledge / vision_inspect`。

当前 Runner 隔离探针中：加密诊断已在模型上下文，替代模型返回同类微博回答，无工具调用。系统仍保存该回答，没有 `verification`。因此，剔除搜索工具并不足以阻断无依据的最终文字。

建议：文件读取返回结构化 `unsupported/protected/corrupt/partial/success`；针对附件询问，由运行时直接编译失败说明或在终态检查附件状态。未取得可用附件内容时，不能将任意正文认作附件回答完成。多附件应区分单个失败与整个任务失败。

定位：[附件内容交接](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/runner.py:539)、[诊断提示](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/prompt_builder.py:258)、[最终结束分支](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/agent_loop.py:1037)。

### F2 — 白名单与授权使用不同工具身份（P1）

白名单用去前缀、小写后的 `requested_name`，提醒授权、安装拦截、重复签名仍用原始 `t_name`，执行器又会去前缀。

同样没有提醒授权，`create_reminders` 被拦截，`functions.create_reminders` 到达替代执行器；教程模式的 `bash` 安装被拦截，`functions.bash` 到达替代执行器。本轮没有创建提醒或执行安装。该结论以“调用进入当前分发器且 canonical 工具在白名单中”为条件，不声称模型供应商必然允许此工具名。

建议：入口只解析一次 canonical ID，授权、重复签名、遥测、执行和输出均使用它；别名显式注册。字段、时间依据等授权规则也应进入统一的能力定义。

定位：[白名单规范化](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/tool_dispatch.py:58)、[提醒授权](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/tool_dispatch.py:111)、[实际执行器](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/tools.py:452)。

### F3 — 同会话输入会在锁外被并发覆盖（P1）

`runHarness` 在获得用户锁之前写历史及附件索引。探针模拟第一轮已进入执行但尚未读历史、第二轮排队：第二轮先覆盖共享输入，第一轮随后读到 `second-history` 与 `second.txt` 索引。

这个探针确认历史和共享索引污染；不意味着第一轮的 `--files` 命令参数也变化，因为参数数组是独立的。本轮没有复现真实生产文件覆盖。

建议：获得执行锁之后再提交该轮输入，或使用不可变的 turn 目录和输入清单。Dispatcher 文件同步也应加入同一轮输入事务，不能仅移动 Broker 的两次写入而忽略上游同名文件复制。

定位：[锁前写入](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/user-sandbox/user-sandbox-harness.service.ts:221)、[获取锁](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/user-sandbox/user-sandbox-harness.service.ts:279)。

### F4 — 排队、停止与锁释放缺少同一执行所有权（P1）

排队期间 SSE 关闭时，Controller 因 `hasAcquiredLock=false` 不取消等待，也不记录取消标志。探针随后发放锁，任务仍开始执行，停止调用次数为 0。已有测试也在此分支失败，但该测试本身没有模拟锁获取，不能将其断言直接当作完整并发语义。

`stopSandboxExecution` 不论指定哪个 session，先强制删除整个用户锁，再找容器并启动 `pkill`；没有等待进程结束或核对锁 token。探针确认次序为 `release_lock → find_container → create_kill_exec → start_kill_exec`。取消排队会话可能释放另一个执行中的会话的锁；新请求也可能在旧进程终止前获得锁。这是源码确定的风险条件，本轮未对真实容器进行竞争或 kill 复现。

Dispatcher 的超时分支还调用用户级 `stopPersonalSandbox(effectiveUserId)`，会中止该用户所有已记录执行，扩大同一用户多会话的停止范围。

建议：将 AbortSignal 贯穿排队、获锁回调和执行；排队取消只移除该排队项。停止必须匹配 execution ID、进程/进程组与锁 token，确认终止后由所有者安全释放锁；超时也应针对本轮。

定位：[排队关闭处理](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/user-sandbox/user-sandbox.controller.ts:194)、[提前强制释放锁](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/user-sandbox/user-sandbox-harness.service.ts:328)、[用户级超时停止](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/modules/chat/user-sandbox-dispatcher.service.ts:492)。

### F5 — 正确计算回执不能约束最终模型正文（P1）

`synthesize_analysis_summary` 只检查正文非空、长度至少 20、不是纯 JSON，然后与确定性明细拼接。

探针输入已核验营业收入 100 元，替代模型返回“营业收入已核验为 999,999 元，所有检查均已通过……”；错误正文原样进入输出。附带正确明细无法保证用户看到的主结论正确。没有发起真实模型请求，此探针证明缺失校验，不能作为模型实际错误概率。

建议：数字、范围、状态和未完成项由回执直接呈现；模型只提供受限制的解释，或把模型输出结构化并再次核对事实和覆盖要求。不通过则回退确定性正文。

定位：[正文接受](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/analysis_synthesis.py:144)、[调用位置](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_analysis_evidence.py:237)。

### F6 — 调用发送工具不等于文件已发送（P1）

分发器只根据工具名称设置 `is_file_sent=True`，不检查结果状态。`send_file(missing.txt)` 的替代结果为文件不存在，遥测为 `error`，返回的 `file_sent` 仍是 true。Agent 随后向模型注入“文件已成功标记并推送”的错误系统说明并提前结束。

建议：分别记录生成、可下载、提交渠道、渠道确认送达状态；至少只有成功结果且有交付凭据时才进入发送成功分支，失败应允许纠正路径或报告失败。

定位：[错误成功标志](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/tool_dispatch.py:180)、[后续成功说明](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/agent_loop.py:1205)。

### F7 — 参数协议没有严格拒绝非法输入（P2）

非法 JSON 被静默替换为 `{}` 后继续执行；JSON `[]` 可解析，但后续 `.get` 触发 `AttributeError`，结束本轮而非返回可修正错误。探针分别确认空参数传入 `web_search` 和数组触发异常。

建议：统一校验参数必须是对象，并按工具 schema 验证必填字段和类型。返回结构化 `invalid_arguments`，不要在协议解析层替换为默认动作。

定位：[解析与默认化](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/tool_dispatch.py:44)。

### F8 — 无法读取退出状态时默认成功（P2）

`exec.inspect()` 抛错或 ExitCode 缺失时返回 0，`runHarness` 再以 0 判定成功。探针模拟 inspect 抛错，结果确认为 `exitCode=0`。

建议：未知退出状态使用独立 `unknown/failed`，不得等价于成功；有可靠完成帧和证据时可单独判断已完成部分，保留基础设施错误。

定位：[退出状态兜底](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/user-sandbox/user-sandbox-harness.service.ts:164)。

### F9 — 信息类降级的 accept 含义不清（P2）

当未识别指标、审计、比较等要求时，只要模型正文至少 20 字符，就能触发信息类降级；`render` 返回正文并记录 `spreadsheet_evidence=accept`。空 evidence 列表加“清单包含 999 台服务器、全部验收通过”的替代正文也被接受。

信息类总结不需要数学核算是合理的，但至少应区分“存在可用来源内容”与“最终事实已验证”。当前方法不检查 Runner 初始读取是否成功，也不验证正文断言。这个探针只确认门禁函数，不表示最近配置清单摘要实际有错。

建议：信息类完成需要当前来源成功读取记录、覆盖边界和来源身份；将 `content_available` 与 `facts_verified` 分开，避免长度门禁产生 evidence accept。

定位：[降级条件](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/analysis_turn.py:30)、[返回及状态](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/analysis_turn.py:68)。

### F10 — 重试规则与审计回执不完整（P2）

调用签名在实际执行之前写入；只读工具同参数只允许一次，第一次临时失败后第二次被 `loop_intercepted` 阻断。普通字符串结果即使遥测记录成功，也仅在附带 `.tool_result` 时进入结构化 evidence。

Runner 只在 evidence 非空时保存每轮证据。下午几份普通文档、图片和搜索会话的本地历史没有 verification，新版逐轮证据目录最近记录仍是 14:34 的分析任务。因此这些本地归档不足以重建所有执行步骤；不代表系统其他日志或聊天遥测完全不存在。指定图片会话的 Redis 直读未取得可用 JSON，本轮没有把缺失遥测补成推测。

建议：统一每次尝试的调用回执，明确成功、暂时失败、参数错误、阻断、未知与来源可信等级。重试根据错误类别及预算处理；写操作需要幂等键。每轮都保存执行摘要，即便没有结构化领域证据，也保存输入状态、工具尝试与完成/失败原因。

定位：[重复签名](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/tool_dispatch.py:141)、[证据收集](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/tool_dispatch.py:167)、[条件归档](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/runner.py:718)。

## 验证结果与修复顺序

| 验证 | 结果 |
|---|---|
| Python Runner 全套单元测试 | 367/367 通过，19.294 秒 |
| Broker：用户沙箱服务、Controller、锁测试 | 26/27 通过；Controller 断连测试失败，3.002 秒 |
| 当前 Python 隔离探针 | 确认授权身份、参数、失败重试、失败发送、正文改写、附件错答、信息类降级问题 |
| 当前 Broker 隔离探针 | 确认锁前覆盖、排队断连后仍执行、停止先释放锁、inspect 失败默认退出 0 |
| 运行代码核对 | 6 个 Python 模块哈希一致；Broker 编译文件存在对应问题分支 |

单测通过未覆盖上述所有失败条件，不能作为整条执行链已经正确的证明。

建议分三步修复：

1. 统一执行身份和生命周期：canonical 工具 ID、严格参数、turn 输入快照、排队取消、token 所有权、进程终止确认。
2. 统一完成与交付条件：附件读取状态、正文事实核验、信息类来源、文件发送回执、未知退出状态。
3. 统一观测和恢复：所有尝试的结构化回执、有限重试、全类型逐轮档案，再进行真实模型和 SSE 端到端验证。

修改 TypeScript 后，应通过统一 Docker 入口重建/重启 AI Orchestrator、Session Broker。Python 源码只读挂载、每轮新进程，源码变更会在下一轮载入，但依赖、环境、共享技能和镜像改动仍需按运行方式处理。

文件规模方面：Dispatcher 1,264 行，Agent loop 1,274 行，已越过仓库 1,200 行评估阈值；chat Controller 975 行、Runner 1,039 行。建议修复时分别下沉输入准备、流式协议、取消生命周期、终态验收；不按行数机械拆分。本轮保持只读审计，没有重构这些文件。

## 配套材料

- [机器可读证据与测试摘要](/Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/personal-mode-execution-audit-2026-10-10.json)
- [Python 隔离探针脚本](/Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/personal-mode-execution-audit-2026-10-10/runner_probes.py)
- [Broker 隔离探针脚本](/Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/personal-mode-execution-audit-2026-10-10/broker_probes.cjs)
- [此前通用机制审查](/Users/chain/Documents/MyProject/ops-automation/docs/artifacts/reviews/personal-sandbox-general-call-flow-review-2026-10-10.md)

配套脚本读取当前仓库并替代模型/Docker/执行器，仅在临时目录内建立测试状态；Python 附件探针依赖该已有样本。脚本输出路径位于 `/tmp`。机器可读材料中的源码哈希用于固定本轮代码证据；后续修改应重新运行探针与必要测试。
