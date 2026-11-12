# 23:02 PDF 归纳误入生成验收：审计与修复

## 1. 结论

这是**工程性错误**。主路由没有把“查看和归纳内容”识别为生成请求；旧版产物导出器在回答完成后自行依据完整提示中的`pdf`子串启动PDF编译，绕过了只读意图与空交付物契约。随后验收器又把上传文件名开头的“85页”当作输出页数要求，将已形成的归纳回答替换为交付失败提示。

本次模型只调用8次`read_file`；没有模型发起的`render_pdf`、`bash`、联网或视觉调用。失败的`render_pdf`回执来源明确为`external_pdf_gate`，不是`model_tool_call`。没有证据支持“模型擅自理解成生成85页PDF”的归因。

此前22:13修复覆盖了读取工具、视觉启用、联网误报和分段预算，但漏掉最终导出路径的独立生成判定，以及执行循环共用的8轮硬上限。本次补齐这两个遗漏。

## 2. 会话与链路

- 会话：`chat-session-1794409272371-mkqzq7fu`。
- 用户：`e7fce333-a8f4-4097-9a53-f0a4c729da46`。
- 原始用户指令：`查看和归纳内容`；本轮新上传85页PDF。
- 模型：`qwen36-35b-a3b`，模型ID `d13e0d30-87b9-4e87-b96a-d8b1b3cf78af`，thinking / medium。
- Broker命令含`--files`与`--web-search`许可；许可未转化为搜索调用。
- 23:01:18.707开始，23:02:09.994结束；锁等待0毫秒，沙箱已经运行。

链路：前端上传及用户指令 → Orchestrator个人沙箱分发 → Broker执行`dsh run` → PDF只读路由与原生文字读取 → 模型归纳正文 → `ArtifactExporter.export_deliverables`自动编译 → `enforce_external_pdf_delivery`验收拒绝 → 最终消息被替换。

同源参数路由复现和真实沙箱回放结果：

```json
{"skill_id":"pdf","is_inspect_intent":true,"is_generate_intent":false,"deliverables":[]}
```

当时事件没有单独保存完整路由对象，因此以上标志来自相同原始请求、附件的代码复现；实际工具轨迹与此一致。

## 3. 性能与证据

| 指标 | 实际值 |
| --- | --- |
| 端到端耗时 | 51.295秒 |
| DSH耗时 | 50.336秒 |
| 模型调用 | 9次，共47.462秒 |
| 模型发起工具 | 8次，全部`read_file` |
| 输入 / 输出tokens | 188,283 / 1,832 |
| 最终回答调用 | 输出1,200 tokens，`finishReason=length` |
| 自动编译结果 | 3页，未通过验收、未发布 |
| 验收错误 | `Expected at least 85 pages, got 3` |

`model-summary-before-export.md`保存当时自动编译使用的正文，内容是脑血管、骨科、眼底三个领域的归纳，并非生成85页文档的计划。`qa.json`证明3页候选PDF失败的原因。输入PDF不属于这次候选交付物。

## 4. 三处独立判定如何串成错误

### 4.1 主路由：正确的只读意图

`SkillRouter`识别PDF为输入格式，保持`is_generate_intent=false`，交付物为空。工具轨迹没有任何生成调用；9次模型请求均正常返回，没有超时、断连或视觉阶段失败。

### 4.2 自动导出：绕过路由再判定

`artifact_exporter.py`的旧条件包含：

```python
"pdf" in prompt.lower()
```

`materialize_pdf_from_markdown`内部也有相同宽松条件。`runner.py`传入的是含附件包装的完整提示；只需文件名以`.pdf`结尾，这两处条件就都成立。导出器因此把模型归纳写为`result.md`并编译成`result.pdf`。这一操作发生在主模型工具循环结束后，不在模型的8次工具调用之内。

### 4.3 页数验收：将源文件名当成输出约束

`pdf_external_delivery._stage_and_check`先尝试解析范围/总页数，未命中后直接在整个提示中搜索首个`数字 + 页`。它命中了附件名`85页_GHF组委会&沙利文_…pdf`，设置最少和最多均为85页。

实际候选为3页，于是结构检查返回错误。验收器随后无条件接管最终回答，输出“PDF尚未通过验收”，再由通用生成失败建议追加“扩写内容并重新生成”。这条建议建立在错误的生成前提上，不能证明用户要求过生成。

## 5. 已落实修复

- 新增`pdf_output_contract.py`，统一明确PDF输出契约的判定，隔离附件包装与输出页数。
- 自动导出器和Markdown转PDF兼容入口删除“只要出现PDF就生成”的兜底条件；保留明确输出动作和有效PDF交付物契约。
- `runner.py`把只读/生成标志传入最终导出器、外部验收器；只读轮次不创建交付物，也不允许生成验收信息覆盖归纳正文。
- 页数解析、外部验收的页数兜底、语义契约结果的数字约束检查均忽略附件包装和文件名中的数字。明确输出页数仍被保留。
- 修正只读文档循环的上限：最多12轮，同时受通用上限约束，不再被表格计算默认8轮上限截断。
- 同步更新`docs/runbook/document-reading.md`。

## 6. 验证与生效

68项相关Python回归全部通过，覆盖此次原始请求、纯文字归纳、生成文件名干扰、显式PDF导出、否定生成、旧交付物契约、意外新增PDF、页数参数隔离、十次连续续读、现有PDF与附件保护流程。`git diff --check`和相关Python语法检查通过。

真实用户沙箱的新Python进程通过现有源码挂载加载修复。使用本次原始请求与当时归纳正文，在临时目录隔离回放完整的旧导出及验收入口，结果：

```json
{"automatic_pdf_requested":false,"source_filename_page_requirement":false,
 "exported_files":[],"materialized_pdf":null,"external_gate_owns_answer":false,
 "summary_preserved":true,"compiler_calls":0,"model_calls":0,
 "explicit_pdf_output_still_allowed":true}
```

本次只改Python源码，无需重建编排服务；已用实际沙箱加载路径和文件哈希确认生效。Docker操作均通过根目录`./docker/start-smart.sh`执行。回放没有改写用户原始附件或原会话记录。

## 7. 验证边界

未再次调用主模型重跑全文归纳，不能以隔离回放宣称新的全文摘要已完成。原运行初始读取后续读只到3100/3895行；最终强制汇总仍受1200-token输出上限并以`length`结束。原正文存在覆盖范围与输出完整性不足，不能作为整份85页文档完整归纳的验收结果。修正轮数上限只消除了提前截断，不能代替真实阅读覆盖与内容质量验证。

## 8. 证据位置

`docs/artifacts/reviews/pdf-summary-audit-20261111-2302/`保存原会话、完整事件、证据回执、服务日志、候选QA、导出前正文、旧条件复现、真实沙箱回放脚本及结果、68项回归输出。`manifest.json`记录文件哈希，便于复核。
