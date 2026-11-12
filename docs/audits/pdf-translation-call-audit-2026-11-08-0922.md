# PDF 日语翻译失败审计：2026-11-08 09:22

## 1. 审计结论

**复合原因：工程侧未保留可提取的原生表格结构，并在模型输入中合并了跨单元格文字；模型随后连续四次给出不一致的单元格归属，直接触发布局校验失败。发布门禁正确阻断。**

任务实际在布局阶段终止，尚未进入日语翻译、PDF 渲染或逐页验收。回复中的“完整性或页面验收”是通用失败话术，不能据此认为已经生成日文 PDF 后才发现页面问题。`do not fill arbitrary cells` 是程序的校验错误说明，意为不能为过关而随意填格，并非需要用户补填合同。

仅换模型或增加相同请求的重试不能解决跨单元格的原生文本合并问题。应先修复结构抽取，再保留单元格归属校验。

本次仅取证、离线重放并保存报告，没有修改业务源码、重启服务、重新调用生产模型或覆盖用户交付物。

## 2. 调用身份与边界

| 项目 | 本轮记录 |
| --- | --- |
| 用户请求 | 翻译这个文档，生成日语版的pdf |
| 附件 | `保密合同_狗宝_v1_20261012.pdf`，6 页，227,701 字节 |
| 原稿 SHA256 | `6ce4e97cc7d4adaec2e982ff8cd8f5c718d7cd9ff3a85f5fd329ade1d6daade1` |
| 会话 | `chat-session-1794100776683-riyli0ip` |
| Run | `6c1403dbfc054ab9b4d25d20b1b2390c` |
| 初次 Job | `ca30599255324b58849ac9bed3b455f6` |
| 恢复 Job | `f37ff8f3a7734df9b46cff28745b6298` |
| 用户 | `e7fce333-a8f4-4097-9a53-f0a4c729da46` |
| 北京时间 | 2026-11-08 09:20:02—09:22:44 |
| 引擎 | `layout-html/10`，`lang=ja`，`layout=balanced` |
| 启动参数 | `--web-search --thinking --reasoning-effort medium --model default` |
| 实际平台模型 | `qwen36-35b-a3b`，布局请求使用 `vision` 别名 |
| 交付状态 | 两个 Job 均为 `failed / layout / layout_unresolved`；`verified=false` |

09:22:55 同一会话又收到一次相同请求，对应另一个 Run `f461c92e79bb4211a645b7f4a0117961`。该后续执行与用户贴出的 09:22 失败不是同一轮，本报告不混入其耗时、Token 或后续结果。

实际读取：本轮会话、evidence、完整事件日志、两个 Job 的 manifest/IR/模型输出与模型事件、编排和 Broker 日志。已查看第 5 页完整原页，使用运行中的沙箱重新检查其 PDF 原生对象和表格几何，并对四份已保存的布局输出离线重放。

活动技能挂载目录为 `data/shared/dsh-skills/pdf`；57 个 Python、CSS、HTML、Markdown 文件与当前仓库对应文件哈希一致。运行时 `dsh_modules` 直接只读挂载当前仓库。源码证据与重放依赖保存在证据目录。未取得历史完整模型 messages，因此重建输入的结论以当前同哈希代码及本轮保存的原生 IR 为依据。

证据目录：[pdf-translation-audit-20261108-0922](../artifacts/reviews/pdf-translation-audit-20261108-0922/)。

## 3. 全链路与实际停止位置

User Web → AI Orchestrator 附件同步 → Session Broker 用户锁 → 运行中的个人沙箱 → 意图识别/复核/技能准入 → PDF 固定翻译流程 → 原生解析 → 布局模型 → 单元格校验失败 → 检查点恢复 → 再次校验失败 → 拒绝发布。

- 用户锁等待 **1ms**，沙箱已运行，附件正常同步；不是锁竞争、容器未启动或附件读取失败。
- 意图与技能准入正确，目标语言明确传入 `ja`，没有误走中文版流程。
- 初次 Job 约 **98.53 秒**；成功布局的第 1—4 页写入检查点，第 5 页两次失败。
- 恢复 Job 约 **49.87 秒**；重新提取验证来源后复用第 1—4 页，第 5 页再次两次失败。
- 第 6 页并行工作曾有成功布局响应，但第 5 页失败使其结果没有并入连续前缀检查点，恢复时再次分析。
- 两个 Job 都没有译文 IR、渲染候选或页面验收回执；主账本没有 `pdf_translation` 模型调用。审计时目标 `_ja.pdf` 文件也不存在。

主流程不是被“发布授权”或页面审阅模型卡住；直接抛错位置为 `paragraph_candidates.expand_candidates` 的表格归属检查。

## 4. 工程侧根因：看到了表格边界，却丢失了单元格结构

### 4.1 原生表格识别只覆盖了部分 PDF 表达方式

本页实际是三张清晰的表单表格。运行环境 `pdfplumber.find_tables()` 能直接检测：

| 表格 | 原生行列 | 对应区域 y 范围 |
| --- | --- | --- |
| 归档合同基本信息 | 8 行 × 2 列 | 199.868—401.428 |
| 获批原件数字指纹存证 | 5 行 × 2 列 | 439.8724—578.3364 |
| 全流程节点审批与审查流转记录 | 5 行 × 4 列 | 616.7808—755.2448 |

但保存的 `source.ir.json` 中，本页 `table_candidates` 有三项，**`native_tables=[]`**。原因有两层：

1. `table_geometry.discover_tables` 要求页面出现 `Table 1`、`表1` 等题注才尝试原生表格。该页用“一、归档合同基本信息”等业务小节标题，正则不匹配，直接返回空列表。这是对论文题注样式的通用能力限制，不适用于大量合同、表单和清单。
2. 即使只放宽题注判断，该实现仍只从 `pdf_page.lines` 读取水平规则。该页 **`lines=0`、`rects=49`、`edges=196`**，表格由矩形绘制，仍会因没有足够水平规则而跳过。原生解析虽然调用了 `find_tables()`，却只保留其 bbox，没有复用已检测出的 rows/cells。

代码：[table_geometry.py:42](../../apps/backend/runtimes/personal-sandbox-runner/skills/pdf/scripts/pdf_translation/table_geometry.py#L42)、[native_parser.py:80](../../apps/backend/runtimes/personal-sandbox-runner/skills/pdf/scripts/pdf_translation/native_parser.py#L80)。

### 4.2 输入中的一个不可分割 ID 实际横跨三列

`native_parser.page_lines` 在切分同一基线文字时，仅通过 `ruled_table_bounds()` 判断是否在表内。该函数同样只查看 `page.lines`，本页返回空列表，于是采用普通正文 **14pt** 间距阈值，未采用表内阈值。

第三张表“智能合规审查”一行被抽为：

```text
p5_l45 / p5_g3
platform.document.contra 合规诊断通过 (45分 / HIGH) 2026-10-12 09:16:34
bbox = [177.82, 674.12, 508.66, 683.12]
```

其中承办人、结论、时间戳原本属于第 2、3、4 列。跨列相邻文字间隙约 **12.103pt** 和 **13.228pt**，都低于 14pt，故被串接成一个原生文本 ID。几何复核确认该 ID 与三个原始单元格相交。

布局协议要求每个输入 ID 只能归属一次，模型返回的是 ID 列表，不能把一个 ID 的内部文字重新分割为三个原生单元格。把这个候选分给单一格、重复分给多个格或改成跨三列合并格，都不能忠实表达原表。**这是模型收到输入之前已经存在的工程问题。**

代码：[native_parser.py:21](../../apps/backend/runtimes/personal-sandbox-runner/skills/pdf/scripts/pdf_translation/native_parser.py#L21)。直接证据：`native-geometry.json`，包含原始表格边界、跨格文本、三个相交单元格和词级坐标。

## 5. 模型侧直接错误：四份输出均已离线复现

校验要求一个 table block 的 `line_ids` 与全部 cells 的 ID 集合一致，且每个 ID 在 cells 中仅出现一次。四份原始 JSON 保存在各 Job 的 `layout-p5-1.json` 和 `layout-p5-2.json`。

| 尝试 | 保存输出中的确定问题 | 实际拒绝原因 |
| --- | --- | --- |
| 初次 Job / 1 | 第三张表包含 `p5_g56`，cells 未收录它。其文字是 `(Archived)`。 | 第三张表缺少单元格归属。 |
| 初次 Job / 2 | 第一张表 cells 使用了属于其他表格的 `p5_g13`—`p5_g18`，没有正确分配第一表右列 `p5_g29`—`p5_g38`；其他表也有跨表错分。 | 第一张表 block/cells 的集合不一致。 |
| 恢复 Job / 1 | 第三张表 cells 多出 `p5_g29`，其原文为第一张表表头“内容信息”；另有跨三列候选 `p5_g3` 的集合不一致。 | 程序依据 bbox 补入 `p5_g3` 后，错误的跨表 `p5_g29` 仍导致拒绝。 |
| 恢复 Job / 2 | 第三张表将 `p5_g51` 和 `p5_g56` 分别分配两次。 | 程序补齐 block 的遗漏 ID 后，cells 中的重复仍导致拒绝。 |

四份输出不是程序原本正确却全部误杀：**raw JSON 自身就存在漏分、跨表错分或重复**。`expand_candidates` 会做几何补齐/消歧，因此拒绝时的集合与 raw 可能不同；离线重放同时记录了 raw 归属和异常抛出时的实际集合，避免把后处理影响全部归咎模型。

触发位置：[paragraph_candidates.py:324](../../apps/backend/runtimes/personal-sandbox-runner/skills/pdf/scripts/pdf_translation/paragraph_candidates.py#L324)。

重放未调用模型，使用保存的输入和同哈希源码快照，四次均复现同一错误：

```bash
python3 docs/artifacts/reviews/pdf-translation-audit-20261108-0922/replay_ownership.py
```

## 6. 恢复为什么没有收敛

`_analyze_page_worker` 每页尝试两次。第一次失败后，提示仅补充通用错误 `table cell ownership missing or duplicate; do not fill arbitrary cells`，没有提供具体表格、缺失/多余/重复 ID、对应文字及位置。每次仍要求模型重写整页全部布局 JSON。

外围 `recover_pdf_translation` 对布局阶段允许一次检查点恢复，复用已验证前缀，之后再执行相同每页两次尝试。它不会根据本次错误切换到原生表格单元格抽取，也不会重新分割 `p5_l45` 这类跨格来源片段。因此实际得到的是 **相同结构问题上的四次整页重答**。

这不是没有重试，也不是恢复把整本从第一页全部重跑；缺陷在于恢复没有改变造成失败的输入结构，错误反馈又不够具体。

代码：[layout_analyzer.py:223](../../apps/backend/runtimes/personal-sandbox-runner/skills/pdf/scripts/pdf_translation/layout_analyzer.py#L223)、[pdf_translation_recovery.py:23](../../apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/pdf_translation_recovery.py#L23)。

## 7. 性能和另一项传输异常

| 指标 | 观测值 |
| --- | ---: |
| HTTP 端到端 | 162.132 秒，约 2 分 42 秒 |
| DSH 墙钟 | 161.500 秒 |
| 用户锁等待 | 1ms |
| 模型调用 | 14 次：意图/复核/准入 3 次，布局 11 次 |
| 布局调用状态 | 10 次完成，1 次 `image_transport_failed` |
| 第 5 页完成的布局请求 | 4 次，调用时长合计 115.425 秒 |
| 失败的图像请求 | 60.049 秒，用量未知 |
| 已知输入 / 输出 Token | 69,248 / 19,368 |
| 已知总 Token | 88,616；另有传输失败请求的未知用量 |
| `tokenUsageComplete` | false，与未知用量相符 |
| 网络检索、日语翻译、渲染、页面复核 | 本轮未执行 |

初次 Job 还发生一次图像请求传输失败。耗时约 60 秒，与传输函数配置的 60 秒超时一致；可确认有传输异常，但现有失败事件没有保存底层异常文本，不能进一步断言是连接、读取还是上游推理超时。Gateway 内部重试后继续运行，不是最终停止的直接原因。

`metrics.finishReason=image_transport_failed` 仍保留中途失败值，最终业务错误却是 `layout_unresolved`。`TelemetryStats.record_model_failure` 将子调用错误写入全局 finish_reason，后续辅助成功调用没有使本轮最终业务状态与该字段统一。若只看 finishReason，会把本轮错误误判为纯图像网络失败。应分别记录“子调用异常”“恢复结果”“最终业务失败”。

`llmDurationMs=253766.43` 是调用累计时长，含并行请求和失败请求，不是用户墙钟；不能将其与 161.5 秒直接相加。TTFT 4.022 秒的作用域为 `model_request`，不是用户拿到译文的时间。

## 8. 责任裁决与修复优先级

| 层面 | 裁决 |
| --- | --- |
| 工程：源结构 | 确定缺陷。矩形表格未进入原生单元格路径，且出现跨三列的不可分割来源 ID。 |
| 模型：布局响应 | 确定错误。四次 raw 输出均有归属不一致；最后一次存在明确重复 ID。 |
| 工程：恢复 | 能复用已通过前缀，但没有针对结构问题修复输入；整页通用重试未收敛。 |
| 工程：传输 | 有一次约 60 秒异常，增加耗时，已恢复；不能作为最终表格失败的唯一根因。 |
| 发布校验 | 符合预期。没有生成并发布内容关系不可靠的日文 PDF。 |
| 用户请求 / 日语支持 | 无证据表明是原因；目标语言已正确路由，失败发生在翻译前。 |

建议按以下顺序修复，不建议降低验收门槛：

1. **P1：先建立可靠的表格来源结构。** 对 `find_tables()` 已明确识别的矩形网格使用其 rows/cells 与词/字符坐标建立归属；支持 rect-derived edges，不能以论文式题注作为唯一准入条件。保留歧义拒绝，避免无条件信任所有网格检测。
2. **P1：在文本行合并之前保护单元格边界。** 先确定可靠的 cell 几何，再在各 cell 内组合词和换行；发现现有 ID 跨格时重新抽取并生成来源可追溯的细粒度 ID，不能仅在下游随意移动 ID。题注规则与对象类型支持需要一起修，单独放宽题注不足以解决本页。
3. **P2：错误反馈结构化并局部修复。** 返回 table ID、缺失/多余/重复 ID、文字、坐标及格位，只修复受影响表；对输入不具备可满足归属的情况转回抽取层，避免无限增加整页重试。
4. **P2：统一最终业务状态和辅助异常遥测。** 保存图像异常类型与原因；独立呈现已恢复异常，最终状态使用实际阻断错误。继续保留未知 Token 标志。
5. **验证要求。** 覆盖无题注合同、矩形网格、窄列、跨格误合并、换行单元格、跨表 ID 和重复 ID 等通用样例；再对本原稿执行完整日语翻译及页面验收。不要硬编码本文件名、哈希或候选 ID，也不要靠将 `(Archived)` 随意塞入某格来过关。

## 9. 证据索引

- `audit-scope.json`：Run、会话、输入哈希、审计时 Git commit，以及明确排除的后续 Run。
- `source.pdf`、`jobs/ca305…/source-5.png`：原稿与本轮第 5 页完整预览。
- `jobs/*/manifest.json`、`source.ir.json`：两个失败 Job、目标语言、失败阶段和已通过前缀。
- `jobs/*/layout-p5-{1,2}.json`：四份原始布局模型 JSON。
- `ownership-replay.json`、`replay_ownership.py`：原始归属与处理后异常集合，可离线重现。
- `native-geometry.json`：运行容器中对原 PDF 的原生对象、行列、跨格片段和词级位置复核。
- `metrics.json`、`events/6c1403….jsonl`、`jobs/*/model-events.jsonl`：用量、失败请求、恢复和最终门禁。
- `ops-ai-orchestrator.log`、`ops-session-broker.log`：限定本轮窗口的服务日志。
- `code-hashes.json`、`code-snapshot/`：活动技能哈希核对和审计源码快照。
