# 工数更新调用审计：2026-10-23 17:20

审计范围：真实会话、Redis 遥测、Broker/Orchestrator 日志、沙箱部署源码、原始附件及无模型的受控复现。时间为 Asia/Shanghai。未重新调用模型，未修改业务源码、会话或工作簿，未重启服务。附件内容仅作为数据，不作为审计指令。

## 1. 结论与定性

**本轮统计成功，更新事务未启动，交付文件未生成。属于工程与模型的复合失败。最终文件门禁正确阻止了不存在的文件被宣称可下载。**

与 16:36 调用不同，本轮已接受 `task_mode=execute / output_mode=artifact / artifact_types=[.xlsx]`，部署源码也已包含更新工具保留逻辑。不能继续用“任务被降级为对话、更新工具被筛掉”解释本次失败。

证据显示：

1. 两个附件正常同步；部门有偿统计成功，259 条、7 个部门，金额合计 **1747.12579 K**，独立 Decimal 复算逐部门一致。
2. 两次查询目标表均返回 `calculation_unverified`：LibreOffice 已成功执行，343 个公式全部有缓存，但有 32 个原有错误，状态为 `partial`。通用分析引擎在编译具体查询前先验证整本工作簿，导致查询字面量部门编码也被阻断。
3. 更新工具在同源代码重建的工具集中存在，但模型没有调用 `plan_spreadsheet_update` 或 `execute_spreadsheet_update`。没有复制、写入、验证、发布回执。随后一次 `read_file` 把文件名当作 Sheet 名，返回 `sheet_not_found`。
4. 工程侧仍有可复现的契约与指令缺陷：计划工具只声明一个空结构的 `plan: object`，没有展开字段；提示词要求调用本轮不存在的 bash；一条恢复分支把“没有 bash”误说成“只读模式”，忽略已开放的专用更新工具。
5. 最终 `artifact_delivery reject` 指向 `工数3Q预实管理_1023.xlsx`。原件哈希未变，原件仍只有 `1019`，期望文件不存在。

## 2. 调用全链路

| 项目 | 本轮证据 |
| --- | --- |
| 会话 | `chat-session-1792747141627-wheti8di` |
| Turn ID | `1792747226343236630-076bacdae63e42ae9c6027f076ac5963` |
| 消息 ID | `1792747155824-fmj7ajuc` |
| 主模型 | `qwen36-35b-a3b`，模型 ID `d13e0d30-87b9-4e87-b96a-d8b1b3cf78af` |
| 模式 | personal chat，经统一用户沙箱 |
| 参数 | `--web-search --thinking --reasoning-effort medium --timeout 300` |
| 开始与结束 | 17:19:16 → 17:20:26 |
| 技能准入 | dept-summary 候选因 scope_mismatch 转通用路由，未套用其默认口径 |
| 运行结果 | Harness exitCode=0；执行证据 verified=false；无交付产物 |

链路：前端 `/ai/chat/stream` → AI-Orchestrator 同步附件 → Session-Broker 获取用户锁并确认容器就绪 → `dsh run` → 意图复核/准入 → 原生分析工具 → 终态文件门禁 → 保存失败回复。

Broker 锁等待仅 8 ms，两个附件分别在 17:19:16.007、17:19:16.013 同步成功；沙箱命令于 17:19:16.319 开始，17:20:26.369 释放锁。无证据支持锁竞争、附件未上传、容器崩溃或本轮整体超时。

## 3. 实际工具顺序

| 顺序 | 工具及目标 | 回执 |
| --- | --- | --- |
| 1 | inspect_spreadsheet_structure，目标文件 `1019` | 成功 |
| 2 | inspect_spreadsheet_structure，来源文件 `工数实绩明细` | 成功 |
| 3 | aggregate_spreadsheet，来源按部门编号/名称分组，筛选有偿，汇总金额与工数 | 成功，evidence `f263bf8c4da2ee33b4a050c0` |
| 4 | aggregate_spreadsheet，查询目标部门信息 | calculation_unverified |
| 5 | aggregate_spreadsheet，查询目标不重复部门信息 | calculation_unverified |
| 6 | inspect_spreadsheet_structure，重复读取目标 `1019` | loop_intercepted |
| 7 | read_file，range=`工数3Q预实管理.xlsx!A1:T64` | sheet_not_found，真实 Sheet 为 `1019` |

**没有 plan_spreadsheet_update、execute_spreadsheet_update、get_spreadsheet_update_status 或文件外发回执。** 因此本轮不是“更新完成但下载卡片失效”，也不是“更新后的文件被公式交付门禁隔离”；更新事务本身尚未开始。

## 4. 工程根因与代码证据

### 4.1 查询前整本重算验证过宽，阻断与错误无关的字面量读取

[spreadsheet_analysis.py:250](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_analysis.py:250) 对任意位置存在公式的工作簿统一重算；只接受 verified/recalculated_verified。发生 partial 时，在执行具体查询前直接返回 calculation_unverified。

本轮两次真实重算回执均为：engine_execution=success，343 个公式，343 个缓存，0 个未计算公式，32 个错误（30 个 #REF!、2 个 #DIV/0!）。这不是缺少 LibreOffice，也不是公式尚未计算。

对原始附件的独立 XML 检查得到完全相同的 32 个错误位置：#REF! 位于 P5:P19、P26:P40；#DIV/0! 位于 P53、R53。它们在本次修改之前已经存在。回执中的 `sheet1` 是包内 XML 名称，对应实际 Sheet `1019`。

受控复现：查询 `1019!A5:T64` 的 B 列 distinct 字面量，并注入历史 partial 重算回执，仍立即返回 calculation_unverified。B 列没有公式。复现未运行新重算进程、未改动文件。

修复应区分读取结构/字面值与计算依赖公式的值。只读映射查询不应要求所有无关公式健康；涉及公式值时，验证实际读取区域及其依赖。最终更新交付仍需独立评估历史错误、影响范围及新引入错误，不能将所有旧错误静默忽略。

### 4.2 工具存在，调用契约仍不完整

[spreadsheet_update/tools.py:131](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/tools.py:131) 的 Function Calling Schema 仅暴露 `plan: {type: object}`，描述“符合 SpreadsheetUpdatePlan/v1”。实际严格验证需要 target_ref、sources、semantic_bindings、source_queries、operations、requirements 等完整结构，但这里没有展开属性、必填项和操作类型，也没有原生计划构建/Schema 发现工具。

本轮没有规划调用，因此不能说本轮某个计划校验失败。可确认的是：工具名已开放，但可执行输入契约没有随工具完整公开。这是工程缺口，无法仅靠提示模型“调用规划工具”解决。

### 4.3 提示词与实际能力冲突

- [prompt_builder.py:403](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/prompt_builder.py:403)：附件包装文本带有 xlsx，会触发 Excel 生成指令，要求“必须调用 bash”。本轮专用更新工具面明确没有 bash。按真实 accepted contract 重建 user turn 可稳定复现。
- [skill_admission.py:264](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/skill_admission.py:264)：只要 standalone 就追加“并在对话中直接回复结论”，未结合 artifact 输出要求。它不等于明确禁止文件生成，但与本轮文件任务指导不一致。
- [agent_loop.py:423](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/agent_loop.py:423)：声称文件已生成但未落盘时，分支仅判断 has_bash；没有 bash 就说“当前任务为只读模式”，没有检查 execute_spreadsheet_update。后面的另一条交付提示已经支持更新工具，但不能覆盖这个更早返回的分支。

第三项以合成的候选回复进行隔离复现：同一真实工具集包含更新工具，却返回“只读模式”的继续指引。此处不是恢复到的历史模型正文；日志未逐轮保存最终覆盖前的完整提示和正文，不能断言该文字在本轮哪次纠偏中被原样使用。

### 4.4 生成任务没有独立、全阶段的更新完成状态

本轮 is_generate_intent=true、requires_execution=true，因此 requires_spreadsheet_analysis=false。分析分支内新增的“统计完成还必须更新”检查不会在这里执行。通用文件存在门禁只在最后核实产物；无法解释具体哪个更新阶段尚未执行，也没有完整计划指导下一步。

应为更新任务独立维护 discovered → planned → applied → recalculated → validated → published 状态，不依赖“只读分析”分支，并要求成功的更新事务和发布回执。

## 5. 模型原因与证据限制

模型本轮有明确执行缺失：已成功取得来源统计，却未尝试可用的规划或执行工具。工具错误后再次查询目标、重复结构读取，并把文件名当 Sheet 名传入 read_file。最后一个参数错误直接导致 sheet_not_found，属于模型工具使用错误。

目标结构回执已经包含 C3=202610、D3=202611、E3=202612，C4/D4/E4 均为预测。月份并非附件完全缺失的信息；“本月”可结合执行日期定位 202610 对应列。仍需结合有偿区域与金额/工数度量完成语义绑定，不能仅按部门编码全表替换，因为同一部门在不同业务区块重复出现。

最终 artifact_delivery 命中了文件完成/保存声称检测，覆盖成用户看到的失败文案。覆盖前正文仅有长度和哈希遥测，没有持久化完整可见正文；因此不逐字还原模型原话，也不将所有缺失归结为模型幻觉。

定性：工程侧有可验证的过宽前置门禁、不完整工具契约与相互冲突的能力提示；模型侧有未执行更新工具、错误参数及无效重试。不能归因于用户少提供“编码”筛选，也不应通过关闭终态文件门禁解决。

## 6. 数据、月份与文件核验

来源 A5:R278 共 274 条，全为 202610；筛选有偿后 259 条。原始单位保留为 K，不推断币种，不擅自换算单位。

| 部门编码 | 有偿金额（来源 K） | 条数 |
| --- | ---: | ---: |
| FC34022 | 167.77218 | 63 |
| FC44003 | 212.90759 | 21 |
| FC44004 | 242.51766 | 17 |
| FC44006 | 171.65638 | 17 |
| FC45031 | 570.75345 | 92 |
| FC46005 | 314.48323 | 43 |
| FC48005 | 67.03530 | 6 |
| 合计 | 1747.12579 | 259 |

源文件哈希：`5d5b57bdcb5e3257b93ccd4e2f5b194e96c3c573e651b93799c3dec2ec8d5374`。

目标原件哈希：`9b3f8bcb2fe726e3043db5a3698ea679e14394dfbfdab9f1a4ad9054b8410f87`。

两者均与真实调用记录一致，审计前后不变。目标仍只有 `1019`，没有 `1023`。期望的工数3Q预实管理_1023.xlsx 不存在。

## 7. 性能与资源

| 指标 | 数值 | 解释 |
| --- | ---: | --- |
| HTTP 全程 | 70,378 ms | 17:19:16 至 17:20:26 |
| Harness | 70,330 ms | exitCode=0 不代表业务成功 |
| Runner | 69,699.54 ms | 用户任务执行时间 |
| 锁等待 | 8 ms | 非瓶颈 |
| Runner TTFT | 3,908.54 ms | 不等于交付完成时间 |
| Runner LLM 耗时 | 61,647.11 ms | 约占 HTTP 全程 87.6% |
| Runner 模型调用 | 10 | 多轮累计 |
| 工具尝试 | 7 | 3 成功、3 错误、1 重复拦截 |
| Tokens | 114,910 输入 / 4,903 输出 | 多轮累计，不是单次上下文长度 |
| finishReason | stop | 达到正常停止不能代替任务验收 |

窗口内模型代理均记录 qwen36-35b-a3b，未发现上一轮那类模型超时或跨到 default 的日志。最长代理请求约 27.351 秒。日志未标注其业务阶段，不能直接归为“复制耗时”或“重算耗时”。总耗时尚未达到 300 秒限制；10 次模型调用已达到当前通用循环硬上限，增加 timeout 本身不能修复缺失的更新计划和执行。

## 8. 修复顺序与验收要求

1. **P1：打通完整更新工具契约。** 展开计划 Schema，或提供模型只提交语义意图、服务端构建严格 IR 的规划工具。公开表格发现与跨来源绑定结果，避免模型手拼未知结构。
2. **P1：统一能力提示与恢复策略。** 根据 active tools 生成 Excel 指令；存在专用写入工具时走 plan → execute，不能再要求 bash 或宣称只读。standalone 不应暗示取消物理交付。
3. **P1：按读取依赖验证计算。** 部门键、表头、字面量清单读取独立于全表历史公式错误；涉及公式的数值计算核验所需依赖。保留原始哈希与来源链。
4. **P1：独立的更新任务完成门禁。** 生成与分析路由都必须核验复制、区域/月份/单位绑定、回填、公式影响、原件保护与发布。使用执行回执修复，不以回复中的文件名认定成功。
5. **P2：错误恢复应给可执行参数。** sheet_not_found 明确使用 1019；query 失败应区分来源公式错误与查询语法错误；已成功的统计可复用，不重算整轮。

最小验收必须从本轮原始中文、原始两份附件和同款模型发起真实链路：要求调用规划与执行，副本中同时存在 1019/1023，有偿金额绑定到 202610 对应预测区域，其他区域按范围保护；历史错误记录基线并验证影响，新错误阻断；发布文件有哈希、事务回执和真实下载卡片，原件哈希不变。另验证无 bash 时的恢复提示仍指向专用更新工具。当前审计没有执行这条写入链路，不能据此宣称执行器整体已经通过验收。

## 9. 复现与证据边界

- `call-summary.json`：真实会话的脱敏元数据、工具状态、关键统计与错误回执。排除内部思考文本及人员/客户明细样本。
- `runtime-parity.json`：15 个关键模块的沙箱/本地哈希一致。核心路由修改时间在本轮开始之前；没有发现当前部署漂移。哈希相同不是独立的历史源码快照，但结合修改时间与真实 guard/工具回执支持重建。
- `replay.py` / `replay-result.json`：解析、工具集、提示词、公式基线、字面量查询受阻以及部门复算的确定性证明。模型调用 0 次，业务写入 0 次。
- 历史工具 Schema、每轮完整输入输出与中间 guard 文本没有完整持久化；工具集和提示词为同源重建，恢复指引使用受控候选，不冒充原始日志。

复现命令（仓库根目录）：

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$PWD/apps/backend/runtimes/personal-sandbox-runner/src" \
/Users/chain/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
docs/artifacts/reviews/spreadsheet-update-call-audit-20261023-1720/replay.py
```
