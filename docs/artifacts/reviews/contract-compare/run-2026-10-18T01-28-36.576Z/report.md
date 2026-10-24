# 合同文档智能比对技能端到端功能审计

## 结论

已创建 16 组 A/B 合同共 32 个实际文件，并完成真实工作模式上传测试、恢复后的 15 组复测、16 组文档域对照和 6 项隔离回归。核心正文增删改基本有效，但发现 6 类需修复的功能问题，不能据“执行 succeeded、报告已生成”宣布整体可靠。

本轮只新增语料、harness、审计证据与回归测试，未修业务源码。使用 document/PDF 技能生成并视觉验证文件，execution-auditor 与 codebase-memory 技能核对调用链与归因。

## 文件与 case

文件目录 tests/fixtures/contract-compare-20261018，压缩包同名 zip。13 DOCX、2 文本 PDF、17 UTF-8 TXT；manifest.json 保存原文、每条稳定标记、预期类型和文件 SHA；cases.csv 为可读用例表；README.md 说明运行方法。

覆盖：相同合同、金额/账期、增删条款、删除否定词、移动、重编号、真实 Word 表格、日文、中日双语仅日文变化、DOCX/PDF 与 PDF/TXT、字体排版、重复标题、脚本样本文字、风险分析关闭、反向增删。均为合成数据。

13 份 DOCX 经本地打包 render_docx.py 发现 CJK 字体映射异常，两次字体配置尝试未解决；转用既有 carbone-engine LibreOffice + Noto CJK 独立渲染并查看全部 13 页，确认中日文和表格完整。2 份原生 PDF 也已查看。此为测试环境渲染器限制，不能归为输入丢文或被测比对问题。

## 批次和结果口径

| 批次 | 尝试 | 生成输出 | 核心 Diff 正确 | 完整门禁通过 |
|---|---:|---:|---:|---:|
| 首轮工作模式 | 16 | 3 | 3 | 1 |
| 服务恢复后工作模式 | 15 | 15 | 14 | 4 |
| 直接文档域解析/Diff | 16 | 16 | 15 | 不适用 |
| 隔离语义编排回归 | 6 | 不适用 | 不适用 | 1 通过、5 失败 |

核心 Diff 正确指逐条方向与类型、全部 A/B 正文保留、字符 Diff 双向重建、负例无误报；不包含模型选择、用量溯源或风险开关。完整门禁额外检查这些工程与功能条件。恢复批次 4/15 不能解读为只会识别四组差异，14/15 也不能解读为完整技能验收通过。

首轮平台短暂拒绝连接：control-plane 日志 09:29:39（上海时间）ECONNREFUSED 172.18.0.17:3001，导致一次技能权限验证失败，之后多个规划请求未取得业务 skill，只有基础 LLM 能力。原始首轮全部保留；平台目录恢复后新会话复测 15 组。首轮未执行的用例不归为算法漏检，也未用重跑覆盖原记录。

CMP14 的脚本样本文字在真实上传口被 HTTP 400 主动阻断，这是已观察的安全边界，未计作算法失败；所以恢复批次不重复该项。直接文档域为内部诊断，不能替代上传链路安全验收。

真实链路为认证登录 → 两次文件上传 → 工作模式 SSE → 比对 skill → 文档域 parse/diff → 语义模型调用 → render-report → 执行单 → HTML 下载；不包含浏览器文件选择控件。直接文档域无 LLM、无规划和权限链路，单独列示。没有修改被测业务逻辑、没有关闭其守卫来制造通过。

## 功能问题

### P1 1 同正文跨 DOCX/PDF 被误报为六处修改

CMP10 工作模式恢复批次与直接文档域均复现：五条合同正文及前言均报 MODIFIED，实际内容没有改变。DOCX content 包含“付款期限”等条款标题，PDF 将标题单独保存，content 仅正文；前言还有换行/空格差异。因此红线把真实存在的标题报为删除，又触发了不必要的语义风险分析。

证据：recovery/CMP10/output.json、oracle.json；domain/CMP10.json。例如 A='付款期限\nCMP-PAY 甲方在验收合格后30日内支付人民币100000元。'，B='CMP-PAY 甲方在验收合格后30日内支付人民币100000元。'。

代码：docx-openxml-parser.util.ts:514 将标题写入 content；section-aligner.service.ts:36/62/91/130 使用 content.trim() 相等决定状态。建议先统一多格式 AST 的标题/正文边界，再分别对标题、编号、正文做 Diff；仅标准化结构和可忽略排版，不能把否定词、数字或日文当噪声删除。跨格式相同正文应作为发布门禁。

### P1 2 enableRiskAnalysis=false 仍执行语义风险分析

CMP15 冻结计划明确 enableRiskAnalysis=false，但输出仍带“付款账期大幅拉长”等语义 keyChange。文档域自身能遵守此开关，控制面编排却只检查 skipLlmReview 和全局开关，没有检查 enableRiskAnalysis。

代码 contract-compare-orchestrator.ts:297–301。隔离 F01 验证模型调用仍发生；真实恢复 CMP15 复现风险解读。建议该选项同时约束规则和语义阶段，并检查关闭时不调用模型、不生成风险结论。

### P1 3 所选模型未传递，语义调用无法按执行单溯源

工作模式请求选择 35B，冻结节点保留对应 ID；编排语义请求却硬编码 modelId='default'（contract-compare-orchestrator.ts:175–178），忽略节点所选模型。实际运行编译文件也包含该逻辑。隔离 F04 复现。

恢复批次十个启用风险的变化用例均有语义 keyChange，但对应 execution /llm-usage 为 []。ModelController.callModel 能返回 usage/actualModel 等字段，当前编排没有向执行账本保存它们。不能据空账本声称没有调用，也不能声称实际使用了 35B 或明确用了另一种模型；已证实的是选择未传递且缺少可核账证据。

建议沿用执行节点的模型、推理参数及 trace/execution/step ID，保存实际模型、usage、耗时与响应状态。把模型一致性与账本齐全作为门禁，避免依赖默认配置碰巧相同。

### P1 4 中文甲方立场静默变为中立

真实 CMP02 冻结 myPosition='甲方'；manifest 声明支持甲方/乙方等中文输入，但 auditChangedClausesWithLlm 只将 buyer/seller 翻译为买方/卖方，其余全转中立。隔离 F05 直接复现提示词包含“中立客观商事法务专家”。

代码 contract-compare-orchestrator.ts:108–116。甲方不总是买方，不能简单全局映射；应保留明确的“甲方（买方）”角色，并结合合同主体确认，无法确定时澄清而非静默丢弃。真实 CMP02 的说明谈“现金回笼风险”，也提示立场解读需重点复核；这一语义观察不单独当作法律正确率统计。

### P1 5 模型失败仍报成功且不披露语义降级

隔离 F02 注入 ECONNRESET，结果 success=true，仅保留初步规则洞见，没有 isDegraded/warnings/incomplete。解析失败或空数组也走无显式披露分支。代码 contract-compare-orchestrator.ts:181–184、225–229。此为故障注入复现，未声称在本次真实 provider 批次发生同一失败。

建议记录每个变化条款 reviewed/failed/bypassed、attempt、失败码和响应引用；无法完成语义分析时报告显式 incomplete/degraded。规则可保留，但不能与完整语义结果混淆。

### P1 6 错误 clauseId 按数组位置挂到其他条款

隔离 F03 返回不属于请求的 foreign-clause，编排 find(id) 失败后使用数组位置回填，将 foreign-insight 挂到 pair-pay。代码 contract-compare-orchestrator.ts:186–188。模型漏项、乱序或重复 ID 可因此污染另一条款的风险解释。

建议严格校验 ID 集合、唯一性与覆盖率；未知/重复/缺失项明确失败，不能以位置兜底。此为隔离复现，真实批次没有证据证明已发生同样错挂。

## 通过项目与限制

本批表格单元格修改、日文金额账期、双语只改日文、否定词、重复标题、正反方向增删、同格式排版负例均按 oracle 正确；所有已核对输出正文完整，diffTokens 可重建两侧正文，指标与条款数一致，恢复批次 15 份 HTML 均真实下载并核验 hash。

条款移动没有误报增删；仅编号变化也被视为 UNCHANGED。本次编号 oracle 只要求不误报条款增删，允许 UNCHANGED/MODIFIED，故未将编号未高亮列为失败。如产品承诺编号/交叉引用也应红线展示，需要独立强化门禁。当前所有合同较短，未证明长合同、扫描 PDF、复杂跨页表格、OCR、取消恢复、多人并发或浏览器交互可靠。

## 修复顺序与复现

先修 AST 跨格式一致性、风险开关、模型/角色传递；再补语义结果 ID 校验、失败披露与执行账本。保留本次五个失败回归断言，不要改成迁就现状的绿测试。

- 语料生成器：tests/e2e/contract-compare-work/generate.py，需 bundled Python（含 python-docx/reportlab）。
- 真实 E2E：CMP_OUTPUT=<新目录> node tests/e2e/contract-compare-work/run.mjs。
- 文档域诊断：CMP_DOMAIN_OUTPUT=<新目录> node tests/e2e/contract-compare-work/run-domain.mjs。
- 独立审计：python3 tests/e2e/contract-compare-work/audit.py <本轮根目录>。
- 隔离回归：control-plane/test/contract-compare-harness-audit-20261018.test.ts，经根目录 start-smart.sh dev exec 运行 Jest。

## 证据索引

results.csv、audit-summary.json 分批列示，不混合首轮和恢复；full/ 保留环境阻断；recovery/ 保留真实功能结果；domain/ 保留内部诊断；isolated/jest-final.json 为 1 通过/5 失败及每个故障响应；runtime-compare.txt、services.log 为运行产物与日志；fixture-verification.json 记录文件视觉校验；harness/ 保存测试脚本。

原始上传/请求证据可能有附件票据，对外共享前脱敏。fixture zip 本身仅合成合同和 case 说明，不包含令牌或执行证据。
