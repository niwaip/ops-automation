# PDF 翻译调用审计：2026-11-09 12:04

## 1. 结论

**JSON 响应解析失败触发退出；没有有效续跑的主要原因是工程侧恢复分支覆盖不完整，叠加交付格式误判和模型从头重试。** 不是“已经进入页面修复但修不好”，也不能仅凭最终文案定性为模型输出被截断。

三处恢复路径在本轮没有接上：

1. `ModelGateway.translate` 在传输完成后解析 JSON；解析异常直接抛出，没有协议修复重试。
2. `translate_document` 只对已经得到字典、但 ID/译文校验失败的结果做单段重试；调用或 Future 抛异常会跳过这段逻辑。
3. `recover_pdf_translation` 的错误码白名单没有 `model_protocol_failed`，即使工具回执已经提供 `resume_dir`，也不会自动恢复检查点。

另一个放大因素是：任务意图把“保存格式不变”的 PDF 翻译识别为 `.docx` 交付，固定 PDF 工作流未命中。该工作流另有失败阶段续跑分支，但本轮走的是通用模型工具循环。模型第二次执行没有使用检查点，重新进行 39 页布局识别，随后又在翻译 JSON 解析处失败。

**本轮其实发生过局部自愈。** 第一次任务的第 26 批包含未知 ID，81 个输入单元被拒绝，之后逐个重试并继续到第 27 批。缺口集中在“JSON 无法解析”这一错误类别，不能概括为所有自愈都失效。

仅完成取证、源码核对和离线分支复现；未修改业务代码、重启服务、调用生产模型或重跑用户翻译。

## 2. 对应任务与全链路

| 项目 | 证据 |
| --- | --- |
| 用户请求 | 翻译文档，保存格式不变，生成中文文档 |
| 会话 | `chat-session-1794195982010-wh8eiqda` |
| Run | `b3bd1013395e4d579156b9490bb49f5d` |
| 用户 | `e7fce333-a8f4-4097-9a53-f0a4c729da46` |
| 附件 | `2611.08177v1.pdf`，39 页，7,105,919 字节 |
| 附件 SHA256 | `29572d411c73e552e80bf07f04f244278f1b4525a76c80336d5cc5db41fd4bf3` |
| 北京时间 | 2026-11-09 11:46:29—12:04:54 |
| 模型 | 平台实际 `qwen36-35b-a3b`；子调用使用 `default` / `vision` 别名 |
| 参数 | 外层 `--web-search --thinking --reasoning-effort medium`；翻译子模型关闭 thinking |
| 引擎 | `layout-html-v1` / `layout-html/10`，`auto`、`zh-CN`、`preserve` |
| 最终状态 | 两个 Job 均为 `failed` / `translate` / `model_protocol_failed`；`verified=false` |

链路为 User Web → AI Orchestrator 同步附件 → Session Broker 获取锁并启动 DSH → 意图与技能准入 → 通用规划/工具循环 → PDF CLI → 原生抽取、布局分析 → 文本翻译 → JSON 解析异常 → 发布门禁拒绝。

Broker 锁等待为 1ms，沙箱已运行，附件哈希与两次 Job 一致。没有发现本轮模型传输失败事件。最终阶段不是文件上传、容器启动、锁等待、渲染或页面审阅。

## 3. 两次执行实际做了什么

| Job | 北京时间 / manifest 耗时 | 结果 |
| --- | --- | --- |
| `67729906a9cd468e8589c6795d63ef72` | 11:47:31—11:57:57；625.604 秒 | 完成布局；第 26 批未知 ID 触发 81 次单段重试；保存到第 27 批；随后 JSON 解析失败。 |
| `3780e7c5608b4ac283d1e68dd0f1aa53` | 11:58:29—12:04:21；351.813 秒 | 未使用 `--resume`，重新布局全文；保存到第 3 批；随后同类解析失败。 |

第一次失败回执在 11:57:58 返回，包含有效的 `resume_dir`。两次 manifest 都没有 `resumed_from`。第二次又产生了 40 次布局模型调用，证明它没有复用第一次的完整布局。布局重做也使节点划分发生变化：第一份有 848 个交付文本单元，第二份有 820 个，不能将二者的节点计数当作同一套分母。

两次失败时的保存状态：

| Job | 应交付单元 | 检查点中的值 | 其中不需翻译而复制的字面值 | 未保存值 |
| --- | ---: | ---: | ---: | ---: |
| 第一次 | 848 | 704 | 391 | 144 |
| 第二次 | 820 | 401 | 382 | 419 |

这些是当前结构/字符规则下的保存数，不代表人工语义验收通过。第一次的 704 个值并未被第二次续用；第一次检查点仍在磁盘上。

按顺序消费 Future 的代码及最后保存批次推断，首次未完成批次分别是第 28 批（第 29—30 页相关 ID）和第 4 批（第 3—4 页相关 ID）。原始失败响应未留存，不能进一步确定该批具体哪个文本内容导致协议失败。完整 ID 列表在证据目录的 `job-summary.json`。

两次 manifest 均停在 `translate`，没有 `candidate_path`，没有进入 `render`。最终“完整性或页面验收”是统一失败文案，**不表示本轮已经执行页面视觉审阅或页面自修复**。

## 4. 为什么没有自动恢复

### 4.1 JSON 解析异常发生在局部重试的入口之外

`model_gateway.py:111` 先检查 `finish_reason == stop` 和 `received_done`，否则报 `translation_incomplete`；通过后在 `:113` 执行 `json_response`。本轮最终错误来自后者。

因此可确定：触发该错误的响应已通过网关的结束标记检查。不能把错误直接解释成 `finish_reason=length`、流未结束或网络断线；也不能据此证明返回内容本身完整。`json_response` 对空串、非法 JSON、JSON 数组和其他非对象值都使用同一句错误文案。

网关的 `model_max_retries` 作用于底层传输重试；JSON 解析在代理返回后进行，增加传输重试次数无法覆盖这个异常。

`text_translator.py:70/73` 读取 Future 或调用网关，没有捕获该异常。后面的 `failed` 列表、单段重试及 `translation-attempts` 写盘只在成功取得字典后执行。因此失败批次既没有局部协议重试，也没有失败原始响应文件。

离线用“结束标记齐全但 JSON 未闭合”的固定响应验证：网关只调用一次；翻译器只调用一次；错误为 `model_protocol_failed`，没有 attempt 文件。对照样例返回可解析空字典，则能进入缺失 ID 检查、第二次调用成功并保存两份 attempt。

### 4.2 检查点恢复白名单遗漏了本次错误码

`pdf_translation_recovery.py:22` 仅允许：

```python
('translation_incomplete', 'layout_unresolved', 'budget_exhausted', 'image_transport_failed')
```

`model_protocol_failed` 不在其中，循环体完全不会执行：不发起 `--resume`，也不登记 `_pdf_checkpoint_retries` / `_pdf_stage_retries`。本轮主事件中没有 `pdf_checkpoint_recovery` guard，与代码一致。

离线给同一组合法 CLI 参数、充足预算和同一个 `resume_dir`：`model_protocol_failed` 执行恢复次数为 0；改为 `translation_incomplete` 则为 1。这里尚未走到预算或检查点校验，不能将失败归因于恢复预算耗尽。

因为没有登记恢复尝试，`exhausted_recovery` 也不会阻止模型再次启动完整 `auto`。`reusable_candidate` 只复用 `candidate_ready`，不能接续失败翻译。两者共同允许了本轮重复全量执行。

### 4.3 固定工作流被交付类型误判绕过

11:46:53 的 `task_intent` 将交付类型记录为 `[".docx"]`；11:46:56 技能准入显示 `initial_candidate=docx`、`scope_mismatch`，转入通用能力。最终还出现 `deliverable_contract: missing_physical_file_.docx`。

`runner.py:245` 和 `agent_loop.py:207` 调用 `fixed_translation(..., deliverables)`；`pdf_translation_workflow.py:27` 要求交付项全部以 `.pdf` 结尾。离线传入本轮请求和附件：`.docx` 返回 False，`.pdf` 返回 True。事件也没有 `pdf_translation_workflow: direct_execution`。

固定工作流 `run_fixed_translation` 在 `:66—89` 另有按失败阶段发起 `--resume` 的分支。本轮进入通用工具循环，没有使用这一层兜底。这是入口路由缺陷与恢复逻辑分散带来的工程问题；不能声称进入固定工作流后必然能翻译成功。

### 4.4 模型有恢复意图，但执行方向偏离回执

第一次失败后，模型没有按回执中的目录续跑。它先列目录、读取源码；两次带环境变量前缀的 PDF 命令被统一 CLI 语法拒绝；又尝试直接导入内部模块，出现 `ModuleNotFoundError: pdf_translation`。之后重新执行完整 `auto`，再次失败后继续查找旧目录并读到了另一份文档的历史 IR，最终没有形成有效恢复。

这些是模型执行选择的问题。系统同时存在误导性的通用自愈提示：内部模块导入路径错误被提示“使用隔离环境安装依赖”。本轮没有证据表明安装了依赖；该导入错误也不是最初 JSON 解析失败的原因。

## 5. 模型责任、工程责任与取证边界

| 判断 | 依据与边界 |
| --- | --- |
| 确认的模型协议错误 | 第一次第 26 批返回未知 ID；原始已解析响应保存在 attempt 中，81 个单元局部重试后继续。 |
| 确认的协议边界失败 | 两次翻译响应都在 JSON 对象解析边界退出。 |
| 不能确定的细节 | 翻译网关没有保存被拒绝的原始内容及 JSONDecodeError 位置；不能裁定是模型非法转义/自然语言/非对象 JSON，还是 JSON 提取规则误选内容。 |
| 工程主责：未自愈 | 局部异常未捕获、恢复白名单遗漏、固定工作流受错误交付类型影响、失败检查点未被自动接续。 |
| 模型次责：恢复选择 | 忽略现有 resume 回执，转向读源码和全量重跑，增加耗时并失去已存进度的复用。 |
| 发布行为 | 两次没有完整候选，拒绝发布正确；不能放宽发布门禁来掩盖恢复缺陷。 |

`model_completed` 只说明代理调用完成，并不包含后置 JSON 解析结果。本轮 `model_failed=0` 和最终业务失败不矛盾。这也说明当前遥测缺少协议校验失败与具体 call_id、批次的绑定。

## 6. 性能与资源

| 指标 | 记录 |
| --- | ---: |
| DSH 墙钟 | 1,105.005 秒，约 18 分 25 秒 |
| 锁等待 | 1ms |
| 全部模型调用 | 230 次，均记录 completed |
| 布局调用 | 80 次；累计 1,282.652 秒 |
| 翻译调用 | 121 次；累计 531.057 秒 |
| 通用工具循环模型调用 | 24 次 |
| 工具调用 | 23 次 |
| 输入 / 输出 / 总 Token | 874,547 / 139,554 / 1,014,101 |
| 用量完整性 | `tokenUsageComplete=true` |
| TTFT | 9,692.08ms；`model_request` 范围，不是端到端首次业务进度 |
| 联网检索 | 开关开启，事件中没有实际检索调用 |

累计模型时长包含并行调用，不能相加当作用户等待时间。第二次完整重做耗费约 5 分 52 秒 Job 时间和 248,533 Token，仍没有完成翻译。第一轮第 26 批的 81 次单段重试也是显著开销，但它已经恢复，不能将其当作最终阻断点。

`finishReason=tool_calls` 是外层循环的遥测状态；本轮业务状态应以 manifest 和发布 evidence 的失败为准。

## 7. 建议修复顺序

1. **先补齐协议失败证据。** 在翻译 JSON 解析前保存受控的原始响应、call_id、批次、finish_reason、received_done、解析错误位置与摘要；避免只存一句泛化错误。已有布局拒绝响应保存逻辑可复用。
2. **对失败批次做有限协议恢复。** 捕获可恢复的协议异常，带明确错误反馈重试；必要时拆为单 ID。已通过译文持续保存，后续已完成的并发结果也应尽量保全。不能补原文冒充译文或凭空补齐 JSON 内容。
3. **统一阶段恢复策略。** 将可恢复的翻译协议错误接入同一预算和尝试次数控制，按 manifest.stage 判断恢复方向，优先复用已校验布局与译文；预算耗尽再明确报告。
4. **纠正格式保持路由。** 单 PDF 附件且明确要求格式保持、未要求另存为 Word 时，应由明确的格式约束确定 PDF 交付，不能被“文档”一词推断成 DOCX 而退出固定工作流。
5. **收紧失败后的通用循环。** 由运行时返回可直接执行的续跑动作，统一防止同目标重复全量 `auto`；模块路径错误给出路径诊断，避免一律建议安装依赖。

验证应覆盖：完整传输但非法 JSON、未知 ID、恢复次数耗尽、断点续跑不重做布局、中文“保存格式不变”的入口、失败原始响应留存，以及最终候选和逐页验收。此次离线复现不证明未来模型重试一定收敛。

## 8. 证据与复现

证据目录：`docs/artifacts/reviews/pdf-translation-audit-20261109-1204/`。

- `run-events.jsonl`、`metrics.json`、`session.json`、`evidence.json`：本轮链路、调用和拒绝发布证据。
- `jobs/`：两个 Job 的 manifest、上下文、来源/译文 IR、模型事件、已解析响应及失败记录。
- `job-summary.json`：时间、调用、Token、保存进度和推断的首个未记录批次。
- `code-snapshot/`、`code-hashes.json`、`sandbox-mounts.json`：审计源码与活动技能/运行时挂载对比；最初保存的 18 个文件均一致。后补保存了两个发布门禁源码文件。
- `historical-round-*.txt`、`historical-code-comparison.json`：本轮工具回执曾读取的 pipeline/gateway 源码，去尾部空白后与审计源码一致；其他文件有活动挂载/哈希和早于调用的 mtime 佐证，不冒充完整历史请求存档。
- `ops-session-broker.log`、`ops-ai-orchestrator.log`：相应时窗的调度、会话和实际模型路由日志。
- `probe_recovery.py` / `probe-results.json`：10 项离线分支断言。核心目标函数从本目录源码快照加载，底层运行时依赖从仓库导入，网络边界替换为固定结果；使用临时目录，不写回用户检查点。

```bash
PYTHONDONTWRITEBYTECODE=1 python3 docs/artifacts/reviews/pdf-translation-audit-20261109-1204/probe_recovery.py
```

源码通过 codebase-memory 首先检索；原索引未覆盖近期 PDF 模块，补充对 runner 子项目完整索引后核对调用路径和符号。审计没有执行生产翻译，也没有更改 Docker 配置或运行状态。
