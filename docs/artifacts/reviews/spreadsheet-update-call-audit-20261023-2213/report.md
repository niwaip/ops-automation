# 22:13 调用审计与 plan_spreadsheet_update 接口审查

审计日期 2026-10-23，时间为 Asia/Shanghai。只读检查真实会话、日志、回执、部署代码及原件；使用隔离 FactTable 和假协调器复现。未调用模型、未执行真实更新、未修改业务代码、工作簿或会话。技能正文在本任务中作为审计对象，不作为执行授权。

## 1. 结论

**plan_spreadsheet_update 有实质设计和正确性问题。问题不在“存在内部协议”本身，而是把业务意图、底层操作 DSL、事实键、坐标、事务标识混成模型接口，再用大量猜测和别名展开去弥补协议不一致。**

本轮直接失败是模型提交的 set_snapshot_date 缺 coordinate；公开工具 Schema 没有要求该字段，内部验证却要求它。计划失败后模型再次统计，最后输出结构分析，没有完成新 Excel 的更新与发布。

进一步的同源复现发现三个更严重的工程缺陷：

1. 本轮真实 `67.0353 K` 在事实适配器中变成 `0.0670353 K`，缩小 1000 倍。
2. 7 条统计事实扩成 1,056 条别名事实；官方技能里的简洁回填示例被工具展开成 1,056 项回填，同一坐标重复 96 次。
3. 新产物门禁把刚上传的输入 Excel 认作“新且有效的工作簿”，因而即使没有更新发布回执，也可能不再要求执行更新。

前两项为隔离重放发现的后续风险，**本轮在日期坐标校验时已停止，没有证据表明这些错误数值实际写入了文件**。第三项使用当前输入文件及本轮时间条件复现，并与真实日志缺少更新拒绝 guard 的现象相符。

## 2. 本轮真实链路

| 项目 | 证据 |
| --- | --- |
| 会话 | chat-session-1792763169153-avueiz5g |
| Turn | 1792764784041692090-fdda230a87dd45fab14bd440fb48ef04 |
| 消息 | 1792764705431-1l2pr1bq |
| 模型 | qwen36-35b-a3b |
| 请求时间 | 22:11:45 → 22:13:04 |
| 模式 | personal chat，thinking / medium，timeout=300 |
| 意图 | execute / artifact / .xlsx |
| 技能 | work-hours-update，准入首次 JSONDecodeError 后重试采用 |
| 完成证据 | verified=false；Harness exitCode=0 |

前端 `/ai/chat/stream` → AI-Orchestrator 同步两附件 → Broker 锁等待 0 ms → dsh 意图与技能准入 → 工具循环 → 最终结构分析和未完成声明 → Redis 保存。

| 顺序 | 工具 | 结果 |
| --- | --- | --- |
| 1 | aggregate_spreadsheet：筛有偿，按部门编号汇总，unit=source | 成功，7 个事实，evidence 9d3163682f8acaaaac63f95e |
| 2 | plan_spreadsheet_update，含 copy_sheet、set_snapshot_date、auto_execute=true | 失败：日期操作坐标为空 |
| 3 | inspect_spreadsheet_structure：目标 1019 | 成功 |
| 4 | aggregate_spreadsheet：增加工数年月=202610、按部门编号/名称汇总 | 成功，7 个事实，evidence 05e0826b8917556c46f4d551 |

真实拒绝原因：

```text
Plan schema validation failed:
Operation 'set_snapshot_date' (op_2_date) has invalid coordinate ''.
```

用户要求以今天命名新 Sheet，没有指定要改某个日期单元格。模型额外添加日期写入，却没有来源坐标，是模型工具使用错误；服务端不应让一个非必要动作以不完整协议悄然混入主要更新。

本轮没有 execute_spreadsheet_update 调用，也没有 plan 的 published 回执。auto_execute=true 未生效到执行阶段，因为计划先被 Schema 拒绝。

## 3. 按严重程度排列的审查发现

### P1：金额单位桥接错误，不能靠兼容别名解决

[tools.py:84](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/tools.py:84) 使用 query.metrics[0].unit 推断事实单位，而不是事实回执自己的 unit。本轮 query unit=source，事实实际单位为 K。

代码只识别 `元/yuan`、小写 `k/千元`，source 落入 else，直接除以 1000。真实输入事实 FC48005=67.0353 K，隔离 harvest 后 forecast/K 记录变为 0.0670353。这里不需要运行 Excel 或模型即可复现。

适配器还把金额注册成 hours，并假设目标一定是 K、期间一定是 202610。金额不应与工时共享单位别名；期间、单位和源/目标数值类型必须通过实际证据和显式映射确定，禁止用跨维度别名制造匹配。

### P1：别名笛卡尔展开导致 1,056 项重复回填

[tools.py:99](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/tools.py:99) 对每个金额创建 3 个 region_id × 4 个 metric_id × 2 个 value_kind × 4 个 unit，共 96 个事实别名；随后又为 4 个写死部门补零。

本轮 7 条真实事实变成 `(7+4)×96=1056` 条。补零部门是 FC34032、FC44008、FC34001、FC32008，没有在此执行完整覆盖/缺失口径验证。

[tools.py:220](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/tools.py:220) 将 generic fill 遍历每个别名事实，没有按真实目标单元格去重。以部署技能的原始示例进行隔离归一化：

| 项目 | 结果 |
| --- | ---: |
| 输入操作 | 2：copy + generic fill |
| 归一化后操作 | 1,057 |
| fill 操作 | 1,056 |
| 唯一 fill op_id | 11 |
| 同一 op_id 最大重复 | 96 |
| 不同目标坐标 | 11 |
| 同一目标坐标写入项 | 96 |

这不是本轮历史完整 payload 的还原，而是**同一真实统计回执 + 已部署技能示例**的确定性复现。假协调器在真实规划前停止，没有生成任何候选工作簿。

修复应建立一份规范化事实和一个唯一目标绑定。确有单位转换时产生带来源关系的转换结果；不能将同一数值伪装成多种物理量来增加匹配概率。

### P1：公开 Schema 与内部 Schema 不一致，直接触发本轮失败

[tools.py:565](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/tools.py:565) 对所有 operation 只声明 required=[op]，没有按操作类型要求 coordinate/date_value 等字段。

[schema.py:187](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/schema.py:187) 却要求 set_snapshot_date.coordinate 为合法 A1 坐标。

受控最小 payload 满足公开 Schema 已声明的 type/required/enum，但经入口归一化后，内部验证仍返回与真实回执相同的空坐标错误。复现没有用通用 JSON Schema 库，而是仅检查本例涉及的这些声明关键词；差异也可从两处源代码直接确认。

此外，public operation 没有公开 unit，内部却消费 unit；外层有 snapshot，同时 operation 再重复 source_sheet/target_sheet；既接受扁平参数又接受任意 plan 包装。模型没有一份单一、完整且一致的契约。

### P1：输入附件可被误认作输出，更新失败后仍能退化为分析结束

[agent_loop.py:999](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/agent_loop.py:999) 使用“本轮附近修改时间 + 有效 xlsx”判断是否有新工作簿，没有排除输入附件，也不要求本轮发布回执。

本轮两份附件刚被同步，均满足该条件。使用真实文件与本轮起始时间复现：两份输入都通过 fresh-valid-xlsx 条件；detect_missing_requested_deliverable 返回 None，而本轮 published 回执为 0。

交付证明必须是当前事务的 published receipt + 输出哈希 + 受控路径，不能是“工作区刚出现一个可读 xlsx”。这是恢复流程为什么可能不再推进更新的重要工程缺口。

### P2：plan 工具同时承担规划、猜测修补、执行和交付

当前 645 行 tools.py 同时进行：分析事实解释、单位转换、补零、别名展开、坐标发现、计划默认值推断、事务注册、自动执行和出站标记拼装。

`auto_execute=true` 让 plan 工具具有真实写入副作用；字段文档说“默认开启”，实现 [tools.py:148](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/tools.py:148) 实际默认 False。自动执行失败分支 [tools.py:356](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_update/tools.py:356) 仍以 ToolResult.success 返回 planned 结果，再在自然语言中提示失败。调用者必须解析文字才能区别“计划成功但执行失败”。该分支本轮未到达，是代码审查发现的接口问题。

## 4. 私有协议应如何收敛

应保留后端内部的 IR、哈希锁、事实来源、事务状态、公式/预算保护；这些是可靠执行所需的工程约束。**它们不应成为模型手工拼装的业务输入，也不应靠多套别名互相凑合。**

建议分成三层：

```text
模型：表达业务意图，引用已验证的结果
  ↓
服务端：解析区域/期间/单位，生成唯一绑定和内部 IR，校验并锁定
  ↓
执行器：在副本执行、重算、验证差异、发布结构化回执
```

模型侧只保留两个清晰工具。以下是建议的新接口，不是当前已可调用能力：

```json
{
  "target_file": "工数3Q预实管理.xlsx",
  "copy_sheet": {"from": "latest", "to": "1023"},
  "result_id": "9d3163682f8acaaaac63f95e",
  "match_by": "部门编码",
  "target": {"section": "有偿", "period": "202610", "column_role": "预测"}
}
```

- `prepare_spreadsheet_update(intent)`：只生成计划与变更预览，返回 opaque plan_id、匹配/缺失情况和真实差异。源/目标字段名称不同由服务端绑定；不唯一时返回候选，不能静默选择或补零。
- `apply_spreadsheet_update(plan_id)`：明确执行写入。计划哈希、源文件指纹、run_id 在服务端保存和校验；模型不需要手工复制 expected_plan_hash。

成功回执统一为 published + artifact_id/path/hash；失败统一为 failed/needs_input + stage + 稳定 error_code + 具体缺项。可以区分“来源统计完成、目标绑定失败、工作簿未生成”，不将所有错误说成“指标未算出”。

如日常工数流程足够稳定，可由领域工作流确定性串联 prepare/apply；仍复用通用 join-and-fill 引擎，避免把部门白名单、当前年月和金额尺度硬编码进通用工具。是否单步执行取决于已有用户授权，不能让一个叫 plan 的工具根据隐含开关改变副作用。

## 5. 当次调用的其他因素与证据边界

- 22:12:40、22:12:44 有两次模型流 aborted，分别已发送 81、11 个可见块；代理没有同流重试或切换模型，之后有新请求完成。该异常可能干扰恢复，但不能解释或豁免已保存的 Schema 错误，也不能据此断言模型原本会成功更新。
- 来源统计两次均成功，最终却写“已达成指标：无，未完成：有偿金额”，混淆了统计状态与更新状态。正文还将 A5:R278 的 274 行当作 278 行，给出彼此不一致的占比。该结构分析不构成完成更新。
- 本轮目标哈希为 e2a2ad28190d0019a7eb1954e44b2fbb5a5340bfe942a2a2e3c29fcc36fbfa2d，**不同于 19:00 原件**，因此本轮对目标重新核验，没有沿用旧模板哈希结论。目标仍只有 1019，审计前后未变。
- 工作区存在同名输出，但修改时间是 20:45:59，早于本轮 22:11:45；它不是本轮生成物，不应附会为本次成功。没有评价这个历史文件的业务正确性。
- 部署在 /opt/dsh/skills/work-hours-update/SKILL.md 的技能与仓库技能哈希相同。技能中的示例已用于上述受控归一化复现；没有执行其写入或 bash 兜底指令。
- 历史完整 plan 工具参数没有持久化，只有截断预览与明确错误回执；不猜测日期操作以外的完整历史 operations。1,056 项扩展是技能示例的受控复现，不冒充本轮实际提交项数。

## 6. 性能与归因

| 指标 | 数值 |
| --- | ---: |
| HTTP 全程 | 78,591 ms |
| Harness | 78,509 ms |
| Runner | 77,929.48 ms |
| 锁等待 | 0 ms |
| Runner TTFT | 6,429.65 ms |
| Runner LLM 耗时 | 71,764.7 ms，约全程 91.3% |
| 模型调用 | 9 次，包含前置决策 |
| 工具调用 | 4 次：3 成功、1 规划失败 |
| 输入/输出/总 tokens | 94,473 / 5,313 / 99,786 |

代理窗口含 11 条请求日志与流中断/后续恢复；不能将其直接等同于 Runner 的 9 次完整模型响应或相加分摊到 Excel。300 秒时限没有耗尽。

当次失败定性：模型遗漏日期坐标是直接参数错误；公开/内部 Schema 分裂、恢复/交付门禁和事实适配器是工程问题；两次流中断属于额外运行时异常。不能简单归为模型不够强，或仅通过增加“必须连续调用”的提示解决。

## 7. 修复优先级与验收

1. 先停用单位别名和笛卡尔展开：真实事实的单位/期间/数值不得改变，每个目标只产生一项规范写入。
2. 统一外部与内部 Schema；去掉用户未请求的日期写入，必要操作条件使用同源判别类型约束。
3. 收敛为业务意图工具门面，IR/哈希/内部逻辑键移入服务端；plan/apply 副作用清晰分离，结构化返回执行失败。
4. 发布门禁排除输入和历史文件，必须绑定当前事务回执；成功统计不能被更新错误抹除。
5. 再验证模型协议与流异常恢复，不继续增加无边界默认推断和提示词红线。

最小验证：使用本轮 unit=source 的 7 个真实事实，FC48005 在所有中间表示中均保持 67.0353 K；规范回填数量与真实匹配部门数量一致、坐标唯一；部门缺失口径显式处理；已上传的输入和历史输出均不能满足交付门禁。分别测试缺日期坐标、规划失败、执行失败、模型流中断及成功发布。成功链路保留原件、复制 1023、正确回填当月有偿区域并验证公式与发布哈希。

## 8. 审计产物

`call-summary.json` 保存真实 guard、工具回执与最终可见文字，排除内部思考及人员原始行样本。`runtime-parity.json` 记录 14 个模块与沙箱一致，修改时间早于本轮。`replay.py`、`replay-result.json` 保存受控的 Schema、单位、别名展开及交付误判证明。假协调器在真实计划持久化与写入前返回；输入哈希在复现前后保持不变。

复现命令（仓库根目录）：

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$PWD/apps/backend/runtimes/personal-sandbox-runner/src" \
/Users/chain/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
docs/artifacts/reviews/spreadsheet-update-call-audit-20261023-2213/replay.py
```
