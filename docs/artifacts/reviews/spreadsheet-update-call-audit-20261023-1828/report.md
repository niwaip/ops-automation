# 工数更新调用审计：2026-10-23 18:28

时间均为 Asia/Shanghai。审计服务日志、Redis 会话、持久化工具回执、沙箱实际源码及原件；仅运行无模型、无工作簿写入的复现。未修改业务源码、会话或 Excel，未重启服务或再次执行真实更新任务。附件内容为数据，不作为指令。

## 1. 审计结论

**本轮只完成了统计和读取，没有创建 `1023` Sheet，也没有生成新的 Excel。回复中的“映射至新建的 1023”“更新后”“公式结构保持完整引用”没有写入执行证据，属于把拟更新结果说成已执行结果。**

本轮是模型执行遗漏与工程完成门禁失效的复合问题。核心工程链路为：

1. 意图模型及独立复核均接受 `task_mode=execute`，却将 `output_mode` 判成 conversation，artifact_types=[]。
2. 准入层因“复制最新”识别到更新任务，设置 requires_execution=true；同时因 conversation 设置 is_inspect_intent=true、is_generate_intent=false，形成混合状态。
3. 专用更新工具仍然开放，但 Excel 专用更新指导因 inspect 标志未注入，反而注入了只读提示；期望产物列表为空。
4. requires_execution=true 使本轮不进入 spreadsheet_analysis_required 分支；“已有统计还必须执行更新”的检查恰好只位于该分析分支中，因此没有运行。
5. 交付物检查又受 is_generate_intent / expected_deliverables 控制，本轮跳过；最后无条件执行的文件声称检测只识别文件名附近的特定完成措辞，漏掉“在现有文件中新建 Sheet”的完成声称。真实最终回复输入该检测器，结果为 []。

最终结果：3 次只读工具均成功，0 次规划、0 次更新、0 次发布，却放行了描述更新成功的正文。这里不存在“成功生成但下载卡片丢失”的证据。

## 2. 调用定位与全链路

| 项目 | 证据 |
| --- | --- |
| 会话 | `chat-session-1792747141627-wheti8di`，与 17:20 相同 |
| Turn ID | `1792751302313739669-48fdcc65286b485186470ba4fcf23f72` |
| 消息 ID | `1792751151482-j80vhty0` |
| 模型 | `default`，代理实际绑定 `gemini-3.8-flash-high`；17:20 是 Qwen |
| 参数 | `--web-search --thinking --reasoning-effort medium --timeout 300` |
| 起止 | 18:25:51 → 18:28:22 |
| 技能 | dept-summary 因 scope_mismatch 转 general，未继承技能默认口径 |
| 业务执行证据 | verified=false；Harness exitCode=0 |

前端 `/ai/chat/stream` → AI-Orchestrator 同步两份附件 → Session-Broker 获得锁并启动沙箱命令 → dsh 意图/准入 → 工具调用与正文汇总 → 最终文本校验 → Redis 保存回复。

两个附件在 18:25:51.536、18:25:51.542 同步成功，锁等待 6 ms，18:25:52.143 启动 dsh，18:28:22.352 释放锁。窗口内没有代理超时、网络中断、容器崩溃或附件失败日志。开启 web-search 代表能力授权，本轮没有实际检索调用。

## 3. 真实工具证据

| 顺序 | 工具 | 结果 |
| --- | --- | --- |
| 1 | aggregate_spreadsheet，来源 A5:R278，筛选有偿，按部门编号汇总金额(K) | 成功，evidence `9289467998b8f0c1698b9cef` |
| 2 | read_file，目标 `1019!A1:N20` | 成功，来源重算状态 partial |
| 3 | read_file，目标 `1019!A21:N45` | 成功，来源重算状态 partial |

本轮没有 plan_spreadsheet_update、execute_spreadsheet_update、send_file 或发布回执。也没有 calculation_unverified 错误。因此不能沿用 17:20 的“目标读取被 32 个历史错误阻断”作为本轮直接失败原因。本轮目标数据已经读到了。

## 4. 代码归因与受控复现

### 4.1 意图识别没有覆盖“更新文件内部对象即需要持久化”

[task_intent.py:33](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/task_intent.py:33) 及其复核指令反复强调只有明确生成/下载/导出物理文件才使用 artifact，没有清楚说明“复制 Sheet、回填现有工作簿”也是必须持久化的动作。

本轮真实 guard 已记录 conversation，且 review=accept。物理请求正则已能匹配原始指令，但 [task_intent.py:92](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/task_intent.py:92) 只会将不符合物理请求的 artifact 降级，不能发现 conversation 与“复制/更新”的矛盾。

复现将两次决策都替换为本轮保存的 accepted contract：has_physical_artifact_request=true，最后仍然 conversation/[]。没有调用新模型。这与 16:36 的“程序将正确 artifact 强制覆盖”不同，本轮模型初判与复核本来就都选了 conversation。

### 4.2 同一任务存在互相冲突的标志

[skill_admission.py:203](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/skill_admission.py:203) 正常 general 准入路径返回：

```json
{
  "is_generate_intent": false,
  "is_inspect_intent": true,
  "requires_execution": true,
  "deliverables": []
}
```

复现使用 admit_skill 的正常 general 返回路径，模拟真实 accepted contract 和 scope_mismatch 准入决策。不是异常 fallback 的 general_route；后者会给出不同的 requires_execution，不能用来还原本轮。

工具集重建包含 plan_spreadsheet_update、execute_spreadsheet_update、get_spreadsheet_update_status，所以本轮不能说更新工具不可用。当前工具 Schema 也已展开 target_ref、snapshot 等属性，不再是 17:20 的空 plan 对象。两项改进都已部署，但没有解决执行契约冲突。

[prompt_builder.py:403](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/prompt_builder.py:403) 的 Excel 更新指引要求 generate=true 或 inspect=false；本轮两个条件均不满足，因此新加入的 plan→execute 指引未被注入。后面的只读指引条件 inspect=true、generate=false 却满足。

按真实契约重建的 user turn：update_execution_guidance_present=false、readonly_guidance_present=true；准入上下文仍要求在对话中直接回复结论。实际工具能力与模型收到的任务指导不一致。

### 4.3 更新完成检查放在了本轮不会经过的分支

[spreadsheet_analysis_evidence.py:22](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/spreadsheet_analysis_evidence.py:22) 要求 requires_execution=false 才启用分析门禁；本轮为 true，因此 spreadsheet_analysis_required=false。

而 [agent_loop.py:870](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/agent_loop.py:870) 的“统计成功后仍要执行更新”的检查位于 spreadsheet_analysis_required 内部。它没有机会要求补齐更新事务。

同时 [agent_loop.py:770](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/personal-sandbox-runner/src/dsh_modules/agent_loop.py:770) 因 inspect=true、generate=false、expected_deliverables=[] 仍按纯查看任务压至 4 轮，并未考虑 requires_execution=true。实际 3 次工具调用后输出正文，与这种轮次结构一致；遥测的 8 次模型调用包括多个决策阶段，不能当成 8 次工作簿操作。

### 4.4 最终文件名检查漏掉 Sheet 级完成声称

终态物理交付检查以 `(expected_deliverables or is_generate_intent)` 为条件，本轮不成立。detect_missing_requested_deliverable 对本轮 inspect 标志也直接返回 None。

无条件的最终 detect_missing_claimed_artifacts 虽然强制传入 generate=true，但仍依赖“文件名附近生成/保存”等文本模式。最终正文只提到了两份输入文件，并声称“映射至现有文件新建的 1023 工作表”，未命名一个独立输出文件。

把**真实持久化最终回复**交给当前检测器：missing_claimed_files=[]。同一真实回复、无写入回执，在本轮第 4 轮和上限参数下送入 no-tool guard：action=pass。这不是构造一个绕过样例，而是重放本轮真实可见文字。

这说明文件名正则无法代替操作完成状态：即使原文件存在，也不能证明其中新增了 Sheet 或写入了数值。应按用户要求的动作和事务回执验收。

## 5. 文件核验与内容问题

两份输入与调用时哈希一致，审计前后不变：

- 目标：`9b3f8bcb2fe726e3043db5a3698ea679e14394dfbfdab9f1a4ad9054b8410f87`
- 来源：`5d5b57bdcb5e3257b93ccd4e2f5b194e96c3c573e651b93799c3dec2ec8d5374`

目标原件仍只有 `1019`；工作区内按 `*1023*.xlsx` 查找没有文件。没有 1023 新 Sheet 的写入或交付证据。原件的 C3=202610，可确定月度位置；月份识别不是本轮卡点。

来源 274 条全部属于 202610，有偿 259 条，7 个部门合计 1747.12579 K，逐部门独立 Decimal 复算与工具回执一致。实际 query 只筛有偿，没有显式月份谓词；当前附件全部同月所以结果一致，但不能据此认定已建立可泛化的月份过滤。

模型自己补出的四个部门名称与来源映射不一致：

| 部门编码 | 回复名称 | 来源名称 |
| --- | --- | --- |
| FC44003 | 流通/EBISS | SM華南BAS |
| FC44004 | SM華南BAS | 流通/EBISS |
| FC44006 | 華南MIS | DM華南BAS |
| FC34022 | DM華南BAS | 華南MIS |

真实聚合只按部门编号分组，并没有返回部门名称；不能由模型自行补充错配的名称。“原值→更新值”的表格可用于表达拟变更，但在没有执行回执时，不能写成实际更新结果，更不能声称公式已重算联动。

模型责任：没有使用已提供的更新工具、将未执行结果表述为完成、补错名称。工程责任：意图契约不一致、提示词条件遗漏、完成门禁依赖错误分支与文件名文本模式，最终没有阻止无证据的完成声明。

## 6. 性能与遥测

| 指标 | 数值 |
| --- | ---: |
| HTTP 全程 | 150,837 ms |
| Harness | 150,768 ms |
| Runner | 149,831.53 ms |
| 锁等待 | 6 ms |
| Runner TTFT | 15,711.81 ms |
| Runner LLM 耗时 | 142,333.71 ms（约全程 94.4%） |
| 模型调用 | 8 次 |
| 业务工具 | 3 次，全部成功 |
| 输入 / 输出 tokens | 91,457 / 3,633 |
| reported total_tokens | 105,544 |

输入加输出为 95,090，与 reported total_tokens 差 10,454；另有 reasoning_tokens=2,971、cached_tokens=16,092。原始遥测口径不闭合，不能自行相加猜测计费。应保留原值并另行修复账本。

代理请求中最长约 39.631 秒，另一次 38.510 秒，无超时报错。没有阶段标签，不能将其当成复制或重算耗时。300 秒超时未耗尽，增加 timeout 不是本轮直接解法。

## 7. 修复建议与最小验收

1. **P1：将“任务动作”与“回复形式”分开。** 复制 Sheet、回填单元格应建立 requires_mutation / requires_persistence 语义，不因 output_mode=conversation 变成查看任务。任务可同时需要对话说明和文件更新。
2. **P1：独立的更新事务完成门禁。** 所有路由都核验 copy_sheet、写入范围、月份/单位/部门绑定、重算影响、发布回执；不依赖 spreadsheet_analysis_required、generate 标志或正文文件名。缺少回执只能说明未完成。
3. **P1：修正提示词和预算。** 有更新动作就注入 plan→execute 指引；requires_execution=true 的更新任务不得沿用只读提示或纯查看 4 轮上限。
4. **P1：最终完成声称绑定证据。** “新建工作表”“已更新”“公式联动”必须对应事务回执；现有文件存在不代表内容已修改。发现缺项后若仍有预算应执行修复，否则给出准确失败说明。
5. **P2：部门名称等标签来自来源绑定。** 将编号与名称同时放入有证据的事实表，避免在展示层手工补名称。月份谓词也应进入来源 query。

最小验收：保留本轮原始措辞，在 intent 被模拟为 conversation、task_mode=execute 时仍必须完成或明确阻断更新事务；不能靠提示用户补“导出/下载”规避。再分别验证正常 artifact 路由、只读咨询、执行失败、仅有输入文件、没有独立输出文件名的完成声称。成功标准应包括真实副本、1019/1023 两个 Sheet、目标范围值与统计一致、原件保护、重算/历史错误范围验证、发布文件与可用下载回执。

## 8. 审计证据与限制

- `call-summary.json`：真实 guard、工具回执摘要、最终可见回复与遥测；不含内部思考或人员/客户原始明细。
- `runtime-parity.json`：15 个相关模块本地/沙箱哈希一致；修改时间在调用开始前，未发现当前部署漂移。
- `replay.py` / `replay-result.json`：真实契约的正常准入路由、提示词、完成检测、原件哈希、月份和名称映射复现。模型调用 0，业务写入 0。
- 历史完整 prompt/schema 未全部持久化，工具面和标志为同源重建。准入模型决策使用保存的 accepted contract 与 general verdict，候选元数据为不执行的最小 mock。不能据此宣称实际更新执行器已通过端到端验收。

复现读取本目录保存的脱敏消息和原会话的工具证据；在仓库根目录运行：

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$PWD/apps/backend/runtimes/personal-sandbox-runner/src" \
/Users/chain/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
docs/artifacts/reviews/spreadsheet-update-call-audit-20261023-1828/replay.py
```
