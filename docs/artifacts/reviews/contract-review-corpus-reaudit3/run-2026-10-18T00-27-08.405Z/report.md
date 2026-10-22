# 35B 工作模式合同审查：2026-10-18 第三次语料复审

## 结论

本轮首轮 48/54（88.9%）通过，同口径上一轮 43/54（79.6%）。PDF NDA 误判得到真实端到端修复验证，立场和 recognizer 调用本轮也稳定；仍不建议判定稳定验收通过。最重要的问题是 schema 投影丢失 items，导致新加的字符串数组转换单测虽通过，真实链路仍绕过转换并在调度阶段失败。另有随机语义 JSON 解析失败。

本轮未修改业务代码。保存了全量、失败项复测、独立核账、日志、运行产物与最小诊断复现。采用 execution-auditor 和 codebase-memory 技能，按真实调用路径审计；没有套用个人沙箱链路。

## 测试范围和版本

6 商业类型 × 中/日/中日 × DOCX/PDF/TXT，共 54 文件，对应 18 份语义合同。沿用原语料、提示词、模型、增强门禁和并发 2。真实认证上传 → /ai/chat/stream（config.mode=task）→ deterministic plan → contract-reviewer → control-plane 编排 → carbone 解析/渲染 + AI 语义调用 → 执行持久化与账本 → 下载 HTML。不是浏览器上传控件测试，也不是完整法律准确率评估。

在根目录经 start-smart.sh 重启 ai-orchestrator/control-plane，确认运行编译产物有页码过滤、数组元素转换。14 个既有跟踪核心文件逐用例 SHA 无漂移；另外保存了审计中发现的 selector/context-merge 指纹，其采集时点在运行中，不能当整轮起点证据。上一轮跟踪文件中，本次变化为 document-prober、parameter-binder、recognizer 和 manifest；其他未在旧指纹集中的变化不能由此排除。

## 首轮结果

| 格式 | 用例 | 门禁通过 | 有输出且全文保留 | 无输出 |
|---|---:|---:|---:|---:|
| DOCX | 18 | 17 | 17 | 1 |
| PDF | 18 | 16 | 18 | 0 |
| TXT | 18 | 15 | 17 | 1 |
| 合计 | 54 | 48 | 52 | 2 |

执行终态 52 succeeded、2 failed。两个无输出用例在输入校验处中断，不能说解析丢文。52 份输出均通过 8 标记及全部语言逐条正文对照、指标一致性、真实 HTML 下载与 hash 核对。4 份 succeeded 但语义不完整，harness 正确判失败。

首轮耗时 19.81 分钟，chat 中位 44.57 秒，最大 58.41 秒。业务账本 156 次调用全为 qwen36-35b-a3b，输入 147754、输出 64198 tokens；54 个 recognizer 记录均为指定 35B 注册 ID，无识别调用错误。注册/账本证明路由，不能独立验证远端模型权重。

旧门禁也是 48/54；本轮与上一轮增强门禁直接可比，提升 5 个通过。上一轮 11 个失败样本本轮全通过，6 个新失败，说明仍存在随机性与未闭合的工程边界，单次运行不能严格证明修复的总体因果收益。

隔离故障注入 31/31 通过；本次文档探测、参数绑定、识别、确定性参数回归 57/57 通过。它们没有覆盖下面的跨模块投影丢失，不能以单测全绿代替链路验收。

## 失败项单次复测

6 项中 5 项通过、1 项仍失败，绝不合并为首轮成功。CT06-zh-txt 首轮语义降级，复测变为 customCheckpoints 字符串数组导致 INPUT_SCHEMA_VIOLATION；说明同样请求会在不同阶段暴露问题。两份首轮输入失败复测通过，不等于投影缺口已修复，运行代码最小复现仍为确定性失败。

## 审计发现

### P1：真实投影链路丢失 items，修复未打通

首轮 CT03-zh-ja-docx、CT05-zh-txt 均收到模型生成的 customCheckpoints 字符串数组，冻结计划保留原数组，调度器按完整 skill schema 拒绝 INPUT_SCHEMA_VIOLATION。services.log 有对应执行单错误，执行 JSON 与冻结事件可互证。

根因链：CapabilityCandidateSelectorService.selectCandidates 把 manifest schema 经 extractRecognizerProperties/toRecognizerProperty 投影到 _rawInputSchema；toRecognizerProperty:538–561 和 pickSchemaConstraints:564–577 没有保留 items。binder 的 buildRecognizerProperties:506–524 收到的已是有损 schema；normalizeBySchema:545 之后的 itemSchema 分支因不存在 items 不执行。recognizer 的新转换也依赖 schema.items，遇到相同缺口。

使用本轮运行编译代码做最小复现（schema-projection-probe.cjs/json）：原始 {type:array,items:{type:object}} 直接传 binder 会生成 title/rule 对象；经真实 selector 投影后只剩 {type:array}，binder 返回原字符串。itemsPreserved=false、throughConforms=false。它是隔离诊断，不计为真实 E2E，也不是验收通过项。

归因：模型格式偏航是触发；丢失 schema 的工程路径使本次防御代码失效。后置校验正确阻止了伪成功。建议保留执行端同源完整 schema，与给模型的提示摘要分开；冻结前按完整 schema 验证并限次修复。新增 manifest → selector → recognizer → binder → scheduler 组合回归，不能只给 binder 手工构造完整 items。

代码边界建议：通用 binder 硬编码 title/rule 转换，不等于完整递归 schema 校验；其 object 分支没有递归 properties/required，部分非法元素会被丢弃。当前合同 schema 较宽松能兼容，不能直接推广为所有技能的通用修复。此为代码审计风险，未冒充本轮额外 E2E 故障。

### P2：4 份合同的语义响应解析失败

CT02-ja-pdf、CT06-zh-pdf、CT06-zh-txt、CT06-zh-ja-txt，每份 3 条，共 12 条降级。diagnostics 均有 INVALID_JSON_RESPONSE、modelId、elapsedMs、attempt 和原始截取片段。正文保留不等于语义审查完成，harness 的独立完整性门禁发挥作用。

现有证据支持“返回内容无法解析”；rawSnippet 是截取片段，不能仅凭末尾断开断言 provider 截断、token 上限或具体 JSON 语法。建议受控留存完整响应引用/hash、finish_reason、schema 校验错误和重试分支。对可修复 JSON 做限次修复/重试并重验；仍失败明确保留 incomplete/degraded。执行 succeeded 与语义完整的界限应持续公开。

## 已验证改善与仍有限的结论

- 两份此前稳定误判 procurement 的 PDF NDA 本轮通过，输入/输出均 nda。标题不再是 `[第 1 页]`，但实际回退为 CT03 zh / CT03 zh ja 文件名；不能声称已准确抽出真实标题。
- 已进入审查的所有合同全文保留，未见 DOCX 系统性丢文。
- 已生成结果中的受支持类型、请求立场来源均符合门禁；本轮无 recognizer 网络错误/空结果导致的立场失败。因未对识别故障做同等真实故障重现，不能仅据此宣布容错彻底修复。
- 既有 30/60 双语账期冲突在三种格式均通过；新增正负对照另列，不能仅以风险非 PASS 代替语义准确率。

## 新增双语正负对照

独立 TXT 三份首轮 3/3 通过：45/75 天冲突为 MEDIUM，生成解释对应中日两个账期差异；30/30 和 60/60 一致账期为 PASS。复核了生成文本与对应原文数值，未仅凭关键词门禁认定。支持有限的数值变体泛化和误报控制，样本小，不外推所有双语条款。结果见 metamorphic/、bilingual-manual-review.json。

## 对 harness 的判断和下一步

harness 较好的部分是同语料同门禁配对、每用例独立会话、真实模型账本、完整 SSE/冻结输入/执行单、正文逐条全语言核对、交付下载验证、源码指纹、原始失败与复测分离。这一轮尤其证明组合 E2E 能发现单模块单测覆盖不到的 schema 传递问题。

仍需补齐：将完整 schema 投影一致性设为独立门禁；加入失败识别/空对象不丢显式用户参数的组合测试；冻结版本跨时段重复运行，分别统计首轮成功率、语义完整率、解析修复率和 P95。当前 54 文件只有 18 个语义样本，仍未证明长文、扫描/OCR、复杂表格、跨页条款、取消恢复、多附件和真实 UI 可靠。继续加相似短合同，收益小于修复上述组合边界。

## 证据

- full/results.csv、case-matrix.md、audit-summary.json：首轮完整结果。
- retry/：只复测首轮失败项，原始失败保留。
- paired-comparison.json：与上一轮逐用例对照。
- schema-projection-probe.cjs/json：真实编译代码最小复现。
- pdf-nda-fix-evidence.json：PDF 类型修复输入输出。
- isolated-jest.json、parameter-regressions-jest.json：31 + 57 项测试结果。
- services.log、runtime-ai.txt：日志与实际编译修复检查。
- harness/：本轮测试脚本快照。

原始请求和上传证据可能含附件访问票据，对外共享前须脱敏。
