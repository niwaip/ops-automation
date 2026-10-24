# 工数更新调用审计：2026-10-23 19:00

时间为 Asia/Shanghai。审计服务日志、Redis 遥测、持久化工具回执、计划/状态/快照与真实沙箱源码。只运行内存编译及只读数据核验，未调用模型、未执行更新、未修改业务代码、会话、工作簿或事务状态，未重启服务。附件仅作为数据。

## 1. 结论与定性

**本轮已经调用更新工具，但执行在“计划编译”阶段被拒绝，尚未创建候选工作簿，更没有发布新 Excel。直接原因是目标预测单元格的语义绑定与计划不一致。最后的“文件未生成”只是结果提示，掩盖了可修复的真实错误。**

真实执行回执：

```text
Compilation failed: Forbidden: no semantic binding found in BindingRegistry for
FC48005::FC48005::有偿金额::202610::forecast::hours.
Plan operation 'op_2' specifies unverified coordinate 'C5'.
```

对同一快照和计划进行无写入编译复现，得到完全相同的错误。自动发现器实际给 C5 注册的是 `actual::hours`，计划要求 `forecast::hours`。预测列被发现器统一标成 actual，是工程问题；金额操作未声明单位而落到 hours，也说明计划和领域模型没有完成一致的量纲绑定。

同时存在独立的后续阻塞和错误计划：

- 来源查询、事实映射未进入更新事务：source_queries=[]、mappings=[]、事实表为空。
- 9 项回填中 6 项部门坐标不符，其中 C7、C12 是小计公式。
- 来源金额(K)被模型要求转换成元，而回填操作省略 unit，被编译器默认成 hours。
- 计划阶段只做结构与特性检查，未证明语义和事实可编译，却返回“计划已锁定”；执行失败后持久化状态仍为 planned，未保存失败原因。

因此不能靠关闭门禁、把 forecast 改成 actual 或增加超时完成任务。当前拒绝阻止了错误坐标及未绑定事实进入写入阶段，应保留保护并修复前置编排。

## 2. 全链路定位

| 项目 | 证据 |
| --- | --- |
| 会话 | `chat-session-1792753181184-xf6a3kw1`，新会话 |
| Turn ID | `1792753256707802129-334251a9cb5d41e0bcc3ce931ae2aec6` |
| 消息 ID | `1792753192361-pcd92aqi` |
| 主模型 | `qwen36-35b-a3b`，`d13e0d30-87b9-4e87-b96a-d8b1b3cf78af` |
| 参数 | `--web-search --thinking --reasoning-effort medium --timeout 300` |
| 请求起止 | 18:59:52 → 19:00:56 |
| 更新 Run | `run_1e043e19200a` |
| Plan | `plan_e96369cdf7c5` |
| Plan hash | `e96369cdf7c5db0fef615daadec59d2d31df312ae8e1054d76d5c1cee675329f` |
| 执行证据 | verified=false；Harness exitCode=0 |

前端 `/ai/chat/stream` → AI-Orchestrator 同步来源与目标附件 → Session-Broker 获取用户锁 → dsh 意图/技能准入 → 结构读取与来源统计 → 更新计划锁定/输入快照 → execute_spreadsheet_update → 编译拒绝 → 终态物理文件拒绝 → Redis 保存失败回复。

两个附件于 18:59:52.416、18:59:52.417 同步成功；锁等待 1 ms，18:59:52.976 启动沙箱命令，19:00:56.737 释放锁。没有网络、模型代理超时、附件丢失或容器失败证据。

## 3. 本轮实际执行到了哪里

| 顺序 | 工具 | 结果 |
| --- | --- | --- |
| 1 | inspect_spreadsheet_structure：目标 1019 | 成功 |
| 2 | inspect_spreadsheet_structure：来源明细 | 成功 |
| 3 | aggregate_spreadsheet：筛有偿、按部门编号/名称汇总金额 | 成功，evidence `0d90b0ef818683affc4fc0a7` |
| 4 | 重复 inspect 目标 1019 | loop_intercepted |
| 5 | plan_spreadsheet_update：复制 1019→1023，9 项回填 | 成功，10 项操作锁定，记录 32 个历史公式错误 |
| 6 | execute_spreadsheet_update | update_gate_rejected，编译失败 |

与 18:28 相比，artifact/.xlsx 意图和更新完成提醒已经生效。真实 guard 记录了两次 spreadsheet_update_evidence reject，促使模型继续规划/执行。这次不能再归因于“只统计、不调用更新工具”。

本轮也没有到更新后的重算或发布门禁。32 个模板历史错误已作为基线记录，不是本轮最先阻断的位置。

## 4. 直接工程根因：目标预测绑定被统一注册成 actual

[discovery.py:159](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/discovery.py:159) 在没有显式 region_specs 时，虽然会识别期间行及“预测”子表头，却在注册 LogicalKey 时固定使用：

```python
value_kind="actual"
unit="hours"
```

本轮计划没有 semantic_bindings.region_specs。编译器 [compiler.py:159](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/compiler.py:159) 使用计划的 value_kind=forecast 和省略单位后的默认 hours 构造键，要求完全匹配注册表，因此找不到 C5 的 forecast 绑定。

真实快照复现：

| 项目 | 键/坐标 |
| --- | --- |
| 计划要求 | FC48005 / 有偿金额 / 202610 / forecast / hours → C5 |
| 发现器实际注册 | FC48005 / 有偿金额 / 202610 / actual / hours → C5 |

不能通过将目标预测改成 actual 来掩盖差异。应基于目标表头建立真实 forecast 绑定，并明确来源实绩 actual 如何经受控映射填入目标 forecast，同时保存金额单位与来源证据。

## 5. 即使修正上述差异，事务仍缺少事实

### 5.1 分析回执未接入更新 FactTable

本轮 aggregate 回执已有 7 个部门金额，但更新计划仅列 sources 与自拟 fact_ref，没有 source_queries、mappings 或已核验事实的导入引用。

[tools.py:154](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/tools.py:154) 从 _ACTIVE_FACTS 取本次事实，否则构造空 FactTable。当前生产调用点没有将 aggregate 回执交给 register_turn_facts；该函数仅定义/导出。

[turn.py:163](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/turn.py:163) 尝试用 source_queries 重新摄取事实。但本轮查询列表为空，所以读取来源描述后不执行任何查询，产生 0 个事实、0 条 ingest issue。sources 中的 via_skill 不会自动执行：摄取器读取的是 query 中的 via_skill，而这里没有 query。

受控诊断仅在内存中将第一个操作改为 actual，并仅保留 copy+首个回填，随后编译错误变成：

```text
FactTable missing fact for logical key:
FC48005::FC48005::有偿金额::202610::actual::hours (op_id=op_2)
```

这是揭示下一层阻塞的诊断，不是修复建议，没有执行写入。

### 5.2 空事实表的基数校验错误地返回 valid

[sources.py:121](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/sources.py:121) 收集 missing_keys，却只用 conflicts/errors 判断 is_valid。本轮复现为 required=9、matched=0、missing=9、is_valid=true，因而没有在更清晰的“必要事实缺失”阶段停止。

编译器后续仍逐项查事实，所以本轮没有造成空值写入；但错误分层与规划预检不完整，影响恢复能力。

## 6. 模型计划中的独立错误

### 6.1 把部门压成连续行，忽略原表小计及真实编码

计划 9 项回填中 6 项与原表有偿区域的部门位置不符：

| 部门 | 计划坐标 | 正确部门坐标 | 计划坐标的实际内容 |
| --- | --- | --- | --- |
| FC44008 | C7 | C9 | North 小计公式 |
| FC44003 | C9 | C13 | FC44008 |
| FC44004 | C10 | C14 | FC45031 |
| FC44006 | C11 | C15 | FC34001 |
| FC45031 | C12 | C10 | East 小计公式 |
| FC34022 | C13 | C16 | FC44003 |

FC48005→C5、FC34032→C6、FC46005→C8 的行位置符合原表。FC34032、FC44008 不在本轮 7 个有偿统计部门中，也没有明确的缺失部门事实或处置规则。无匹配不应静默补造金额。

绑定校验和公式保护必须保留。模型可提出部门/指标/期间意图，真实写入坐标应由注册表解析，而非让模型连续猜 C5:C13。

### 6.2 金额单位与默认 hours 不一致

真实 query 对金额(K) 指定了 unit=元；引擎按要求转换，7 部门合计返回 1,747,125.79 元，对应原件 1,747.12579 K。独立 Decimal 复算逐部门验证了 ×1000 关系，数值转换本身有依据。

但用户没有要求换算，更新操作全部省略 unit，落入 hours 默认值。目标金额尺度也没有经过可验证的单位绑定。没有实际写入，因此不能说本轮已造成千倍错误；可确认的是当前计划不具备量纲一致性，直接接上数字仍有风险。

## 7. 规划、状态与错误呈现缺陷

- 规划阶段 [turn.py:103](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/turn.py:103) 做 Schema、特性检查和快照/哈希锁定，没有在返回 planned 前验证全部事实、坐标、单位和绑定。当前保存的错误计划能通过 validate_update_plan。
- 编译失败时 [turn.py:218](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/turn.py:218) 直接返回 failed 结果，未将状态机转为 failed。因此真实 state.json 仍是 planned、errors=[]、candidate/published=null；plan_id/plan_hash 顶层也仍为 null，仅在 phase_history 的 details 中保存了值。
- 计划 output.display_name 为 `工数3Q预实管理_1023.xlsx`，最终门禁却报告 `新工作表_1023.xlsx`。该提示来自最终回复的文件名检测，没有使用计划中的权威产物描述。两者均不存在；文件名不一致不是本轮编译失败原因。
- 最终笼统失败文案覆盖了绑定错误，用户无法据此区分语义编译失败、重算失败和下载失败。应该直接呈现“C5 的预测金额未完成绑定，尚未写入”，并提供可执行的恢复信息。

## 8. 文件与性能证据

运行目录只有 plan.json、state.json、输入快照，**没有 candidate.xlsx**；没有进入实际复制、回填或重算阶段。原目标仍只有 1019，无 1023。计划文件名与通知文件名均无对应成品。

原目标与快照哈希均为 `9b3f8bcb2fe726e3043db5a3698ea679e14394dfbfdab9f1a4ad9054b8410f87`，来源哈希为 `5d5b57bdcb5e3257b93ccd4e2f5b194e96c3c573e651b93799c3dec2ec8d5374`。与调用记录一致，原件/快照/计划/状态在审计复现前后全部未变。

| 指标 | 数值 |
| --- | ---: |
| HTTP 全程 | 64,342 ms |
| Harness | 64,307 ms |
| Runner | 63,342.68 ms |
| 锁等待 | 1 ms |
| Runner TTFT | 4,397.02 ms |
| Runner LLM 耗时 | 57,056.4 ms，约全程 88.7% |
| 模型调用 | 12 次，多阶段累计 |
| 工具尝试 | 6 次：4 成功、1 重复拦截、1 执行拒绝 |
| 输入/输出/总 tokens | 148,145 / 4,090 / 152,235 |

代理窗口无超时，最长请求约 12.814 秒。没有逐工具耗时，因此不把总时间差归为 Excel 计算。300 秒时限未耗尽；本轮需要修复契约，不是延长超时。

## 9. 修复顺序与验收

1. **P1：建立完整且可信的目标 IR 与事实导入链。** 按多行表头识别 forecast、期间、金额单位及区域；通过 evidence_id/事实目录将统计回执接入 FactTable，或提交可执行 source_queries 与 mappings。来源 actual 与目标 forecast 应显式映射，不以字段改名绕过。
2. **P1：在计划锁定成功前执行语义预检。** 全部 required keys 必须有目标绑定和唯一事实；missing 必须使基数检查失败；单位、保护区和部门行位置必须一致。计划预览展示真实坐标和受影响公式。
3. **P1：坐标由注册表决定。** 模型提出业务维度，编排器从原表定位行；禁止把小计当部门行，禁止缺事实直接写零。保留公式及预算保护。
4. **P2：持久化失败状态与权威输出描述。** 编译失败更新 state.failed/errors，正确保存 plan_id/hash；最终提示使用事务失败原因和计划 output，不依赖模型另起文件名。

最小验收使用本轮原始中文和原件真实走 plan→execute：必须解析 C3=202610、C4=预测，按原表有偿区部门行绑定，7 个来源金额逐项有证据，显式处理无记录部门，不覆盖 C7/C12 公式与原表。成功时发布副本中同时存在 1019/1023、金额与单位一致、重算及历史错误影响验证通过、状态 published 且有真实交付回执。失败时必须在规划预检给出明确缺项并保持原件不变。

## 10. 复现证据与限制

- `call-summary.json`：真实最终回复、guard、工具状态与关键回执，排除内部思考及人员/客户样本。
- `saved-plan.json`、`saved-state.json`：本次事务原始计划与最终持久化状态。
- `runtime-parity.json`：16 个相关模块本地/沙箱哈希一致，修改时间均早于调用。
- `replay.py`、`replay-result.json`：纯编译复现、空事实基数/摄取证明、坐标核对、金额量纲与文件哈希检查。未调用执行器写入，不构造交付 Excel。
- 原始最终回复在终态覆盖前未完整持久化，因此只根据真实 guard 确认“新工作表_1023.xlsx”被检测为缺失文件，不逐字还原模型中间声明。历史完整工具 Schema 未单独保存，但计划与真实执行错误均已保存，直接根因不依赖推测。

仓库根目录复现命令：

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$PWD/apps/backend/runtimes/personal-sandbox-runner/src" \
/Users/chain/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
docs/artifacts/reviews/spreadsheet-update-call-audit-20261023-1900/replay.py
```
