# 财务附件35B端对端复测

日期：2026-10-25，Asia/Shanghai。真实调用约10:22–10:30；随后完成数据核验、下载、刷新和无模型复现。

## 结论

**本版仍不满足数据正确性验收，而且交易异常场景出现了错误数据被放行的退化。**

原样重跑上一轮六项提示：1项直接通过、1项工具错误后恢复通过、4项未完成或数据错误。另增加一次仅更改输出文件名的诊断调用：成功下载，四项目标金额正确，但文件多出无合理业务口径的合计行。没有把该诊断结果替代原样F06的失败结果。

仍使用系统 `qwen36-35b-a3b`，所有前端请求均显式指定模型ID `d13e0d30-87b9-4e87-b96a-d8b1b3cf78af`。模型代理日志中实际客户端仅发现该35B模型，没有改用更大模型。本轮未修改业务源码、模型配置或原始附件。

## 环境与版本

- 相同前端 `http://192.168.100.143:5174/chat`，admin，助理/个人模式，thinking=true、reasoningEffort=medium、research=false。
- HEAD仍为 `17d0a22680d50639cfc4c0d7aad32c96343b9148`；本次针对用户新增的未提交修复，不能只用HEAD描述测试版本。
- 实际沙箱初始处于停止状态，首个正常聊天请求自动唤起；随后在容器中核对 analysis_contract.py、analysis_task_state.py、semantic_contract_judge.py，哈希与工作区完全一致，无需用旧常驻Python进程猜测代码是否生效。
- PROJECT_ROOT正确。Docker状态与日志从根目录通过 `./docker/start-smart.sh` 读取。没有手工重启服务。
- `environment.json`记录6份关键源码哈希；独立核验脚本确认测试结束时这些文件未变化。原有修改保持原样。
- 原件SHA-256始终为 `9d71ca8cc6172add7e558ac6a906f677c784fcc5c9d3444cbb17de2772fd992f`，与上轮、每次回执一致。
- A会话：`chat-session-1792894906850-um5ekgd1`，F01–F02。
- B会话：`chat-session-1792895050474-utx8y6z8`，F03–F07。B新建并重新上传；其余保留与上轮一致的多轮附件继承方式。

## 新旧结果对照

| ID | 场景 | 上轮 | 本轮 | 本轮耗时 / Tokens |
|---|---|---|---|---|
| F01 | 全年六项指标与利润率 | 未完成，分组误判 | 未完成，利润率类型未通过；却记录verified=true | 39.097s / 56,534 |
| F02 | 简化四项指标 | 正确ratio被拒 | 仍未交付，存在ratio及二次校验不一致；verified=true | 45.925s / 75,932 |
| F03 | 月度预算差异极值 | 错误恢复后通过 | 错误恢复后通过，全部24组月份指标值正确 | 24.796s / 42,885 |
| F04 | 重复、缺失、大额、跨期、审批 | 部分完成、阻断 | **错误数据作为已完成交付，verified=true** | 36.565s / 57,595 |
| F05 | 两条跨表勾稽等式 | 通过 | 通过，左右值及差额正确 | 25.878s / 39,663 |
| F06 | 原文件名生成XLSX | 通过 | 未生成交付，进入更新流程后要求确认单位 | 39.741s / 236,579 |
| F07 | 仅改新文件名的额外对照 | 无 | 文件下载及四项金额正确；多出无业务含义的合计 | 66.656s / 288,325 |

原样六项合计509,188 Tokens、44次模型调用、执行耗时合计212.002s。含F07共797,513 Tokens、57次模型调用、278.658s。全部7次流式均有done，退出码均为0；这些技术终态不代表数据验收通过。

F03首次`invalid_comparison`后修正成功。F02有`op=eq`错误，F06/F07有多次不合法分析参数。保留这些模型计划错误，没有把它们都裁定为工程错误。

## 已修复的两处解析问题

在同一实际沙箱只调用`build_analysis_contract`，没有模型参与：

- F01原提示：`is_grouped=false`、`group_dimension=null`，不再把算式说明解析为分组维度。
- F04原提示：`entity_predicates=[]`、`is_audit_intent=true`，不再把“为空”或相邻分号内容当成实体名称。

上述修复有效，但不等于任务能正确完成。

## P1：交易异常错误放行

F04最终回答宣称五项筛查全部完成，实际交付与原件如下：

| 检查 | 原件正确结果 | 本轮最终回答 |
|---|---|---|
| 重复凭证号 | V2026-0009，2条，第12、13行 | 凭证号和数量正确，但写成第7、9行 |
| 部门为空 | 1条，第28行，V2026-0025 | 0条，声称所有部门均有值 |
| 金额绝对值>10000 | 1条，第43行，金额98000，原件单位千元 | 0条，还改用了“元”的描述 |
| 日期不在2026年 | 1条，第58行，2027-01-03 | 0条，声称全部在2026年 |
| 不是已审批 | 1条，第73行，待审批 | 0条，声称全部已审批 |

错误链路已由真实回执确认：

1. 工具只执行了`GROUP BY 凭证号 + count_rows`，产生79个凭证号分组。没有执行另外四项条件核查，也没有相应checks/rules。
2. 重复凭证工具事实的source_cells明确为`交易明细!A12`、`交易明细!A13`，工具自身没有把行号算成7、9。
3. 完整性评审认为范围A4:K83覆盖就等于五项条件全部完成，建议无需补工具；`supporting_fact_ids=[]`。
4. `analysis_gate_review.py:37`允许仅凭`category=gate_false_positive`撤销unsolicited_filter_applied；`:72`只要存在完整coverage和任意group_by/having，就可撤销row_filter_not_applied。没有逐项证明用户请求的每个谓词已经执行。
5. 系统最后记录`spreadsheet_evidence=accept`、`verified=true`，回答被呈现为成功。

最终回答也经过了现有的数值grounding校验。不能说“系统完全没有校验”，准确结论是**现有校验不足以验证数值与业务字段、条件、实体和原件行号的绑定关系**。在实际沙箱中，用同一份回执和已知错误正文直接调用`analysis_synthesis._is_synthesis_grounded`，无模型复现返回`True`。

责任：计划只做了一项以及正文编造零值、错行号属于模型行为；允许缺项任务标完成、放行错误正文属于harness工程缺口。按本次数据正确性要求，必须阻断，不能归入可忽略的回答质量问题。

证据：`F04-evidence.json`、`F04-stream.json`、`F04-ui.jpg`、`harness-probes.json`、`verification.json`。

## P1：指标二次校验与终态矛盾

F01/F02最终正文都明确说“本次分析尚未通过执行证据核验”，但回执均`verified=true`，遥测均`spreadsheet_evidence=accept`。

- F01收入、毛利、营业利润、净利润值正确。毛利率0.430924…与营业利润率0.171015…却被标为“千元”，净利率没有执行事实。评审仍以“已有计算条件”代替“已实际执行”，撤销required_metrics_missing。
- F02已有正确ratio事实，后续修复没有真正转换为带%单位的事实。二次校验继续报毛利率缺失，并附带已恢复的历史`op=eq`错误。

两个入口没有统一：`AnalysisTurn.render`先根据`analysis_task_state`记录accept，随后调用`render_analysis_response`；`spreadsheet_analysis_evidence.evidence_error`又执行另一套严格指标/单位检查，拒绝后正文变为失败。accept没有随最终渲染失败回写。

定位：

- `analysis_gate_review.py:23`，required_metrics_missing/metric_unit_mismatch采用“有任意匹配事实或支持ID”即可撤销整项问题，没有证明每一个缺失指标都存在正确类型的事实。
- `analysis_task_state.py:449`复核后重写issues，`:460`以not issues判complete；missing_metrics仍可能残留。
- `analysis_turn.py:168`的render，先记录spreadsheet_evidence后再渲染。
- `spreadsheet_analysis_evidence.py:70`的evidence_error，以及`:177`的render_analysis_response，再次校验并返回失败文本。

需要真正执行单位归一化和缺项计算，并让最终交付状态成为唯一完成依据，不能只删除告警。

## 文件交付回归

F06原样提示未产生本轮可下载文件。xlsx技能连续两次准入字段不完整，退回general；之后模型使用plan_spreadsheet_update操作原始附件，先后缺少section/target_kind/target_label、base_sheet，最后进入单位确认。

F07仅把输出名改为`E2E_finance_35B_rerun.xlsx`，其他提示保持不变。该次xlsx准入成功，使用read_file/bash生成，真实下载后四项目标数值均正确：124020、53443.25、21209.4、16038.3，单位千元，来源为利润表B4/B6/B10/B14。

两次运行同时存在历史上下文、技能准入和模型采样差异，**不能仅凭该对照断言文件名冲突是根因**。可以确认生成/更新路径选择仍不稳定，F07不替代F06的失败。

F07产物额外加入`合计=SUM(B5:B8)=214710.95`，将收入、毛利、营业利润、净利润相加。这四个指标不构成可加总的并列明细，因此合计没有合理业务含义。所需四项金额验证通过，但不能把整个产物当成完全正确的财务交付。

文件6279 bytes，SHA-256 `0c2b6ac6d9f0916b6cb9d628365bc95496ff6967a4eb34a3c42e32ebecd225cb`。刷新后B会话历史10条消息保留；下载入口仍在，二次下载与沙箱生成文件字节一致。原件和源码未修改。

## 修复优先级

1. **先堵错误放行**：每一项请求的过滤/异常规则都必须有独立可核验的执行证据，范围覆盖或存在group_by不能替代谓词执行。
2. 禁止评审用“已有源数据/可以算出”替代已执行事实；缺失指标必须逐个验证，单位必须连同倍率转换。
3. 数值grounding增加“字段/条件/实体/行号—数值”绑定；没有执行某项检查时，只能报告未检查，不能报告0。
4. 统一任务验收、二次渲染和evidence_store完成状态；渲染失败不得保留verified=true。
5. 单独回归生成与更新路径、技能准入降级，并禁止给非可加总指标自动添加合计。

## 取证与核验

- `F01`–`F07`各有实际request、解码脱敏SSE、业务evidence；提示列表在`prompts.json`。
- `metrics.json`保存trace、耗时、Token、工具错误和终态。
- `verify_results.py`已运行通过，表示证据核验工作完成；其输出`overall_data_acceptance=false`，不表示产品测试通过。
- 数据oracle来自上一轮独立Decimal重建，原件SHA-256未变；重新核对了原件80条交易的五类异常，以及预算全部24组数值、两条勾稽、下载文件四项金额。
- `runtime-log.txt`仅保留本轮时间窗口，锁token已脱敏；归档JSON中未发现JWT。
- `harness-probes.json`记录无模型解析与grounding复现。

| ID | Trace |
|---|---|
| F01 | d98b6c78-9598-4228-9f99-bbc64a8a64da |
| F02 | 6ee775fd-7f75-4c10-b4f1-a94e212a333d |
| F03 | 751607e1-f566-443e-af46-3a5a333f4c6a |
| F04 | ed505c30-0fb5-4808-84ed-99cab4c04e7e |
| F05 | 8aee6da4-3157-477f-a969-414fc122038f |
| F06 | f7a8d7c2-14e2-4bde-9fda-859916631dae |
| F07 | 845df6ed-d1a6-483d-aa16-dd74bd9b8445 |
