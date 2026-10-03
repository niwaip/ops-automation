# 浏览器工作流：采集与人工接管恢复

录制模板的 `capture_profile` 在转换为 Temporal Browser Activity 时必须保留为 `config.captureProfile`。生成代码按步骤调用 browser-worker 的 `/browser/execute-step`，传入采集配置，保留快照引用与页面信息；候选元素探测仍使用轻量批量接口。

`read_value` 的 `data.text` 保持精确字段值。页面正文单独存为 `data.mainContent`，并通过原录制步骤 ID 的 `<step_id>_clean_content` 字段供后处理 LLM 使用。循环正文汇总必须保留接管前已经采集的内容。

执行时间线的 `stepId` 对应工作流 Activity 的逻辑步骤 ID；原录制步骤 ID 保留为 `templateStepId`。恢复不能使用 `execution_phase_steps.id` 这一数据库行 ID。时间线记录同时保存 `input.loopIteration`，用于定位本轮失败步骤。

自动接管先冻结原 runtime session，再进入 `human_control`。放行时先恢复会话，成功后才更新步骤及执行状态。冻结或恢复失败会返回错误，不能继续调用下游总结。

发布 Skill 的沙箱调用在人工接管后会受控退出。恢复调用通过 `__browserCheckpoint` 携带逻辑恢复步骤、循环次数、业务变量和 `previousPhaseResults`，继续使用原浏览器会话。生成代码跳过恢复点前的活动；放行过的接管记录标记为人工已处理，并保留历史截图。

修复生成器后，需要重新生成工作流 artifact、验证并正常构建发布 Skill。旧发布快照不会随容器重启更新。重新生成时保留已有输入策略、V2 输出声明及输出 Schema。

Release 沙箱验证支持 `timeout`（如 `180s`），流式验证使用同名 query 参数。默认等待 180 秒，避免多轮截图采集被原来的 60 秒验证时限提前中断。

相关服务按生产启动模式运行时，通过仓库根目录 `./docker/start-smart.sh full restart platform control-plane browser-worker` 重启并验证生效。

## 2026-10-03 端对端验证

通过正常生成、构建、沙箱验证、审核及发布流程发布修复后的 Skill；静态检查和沙箱检查均为 100 分。

- 工作流 artifact：v5，`sha256:204411ed29a92b7a1b56226496a15b01775aaeb96796e7aaac0ee7252fb823f5`。
- Skill：`live-export-replay-1790872547-a23b614d-1`，ID `03b55474-4e6f-4e84-a2a0-97e8714a335f`。
- 验证执行：`8b429fb1-0170-48db-b193-d427975c3b66`，最终状态 `succeeded`，浏览器和后处理两个阶段均完成。
- 原浏览器会话：`2679e7c7-4675-498c-8a1b-dbd906bd3d8e`；worker `60645100-0a0a-4268-ab74-8f48a39530c2`。

使用 Mock ERP 测试数据、20% 毛利率阈值，第一条 25.5% 自动通过，第二条 17.8% 和第三条 12.0% 分别通过真实页面提交人工放行。两次恢复点都是 `step_7`，循环次数分别为 2、3。第二次接管对应新的低毛利率案件，属于预期业务行为。

| 验证项 | 实测结果 |
| --- | --- |
| Browser sandbox | CLI 通过 CDP 连接已分配的 sandbox 浏览器，只有一次 attach；两次恢复复用同一 session |
| 恢复后的动作 | 登录 1 次，审批 3 次，返回列表 3 次，无重复登录 |
| 时间线 | 22 条步骤全部 completed，22 条均有逻辑 stepId，无遗留待接管步骤 |
| 截图 | 页面显示 5 张历史步骤截图，全部加载为 1919×936；最后一张高清原图可正常打开 |
| LLM 输入 | 实际解析的输入 JSON 长度 7248，正文包含 PRJ-2026-001、002、003 |
| LLM 页面结果 | 展示三条案件、客户和金额，以及 25.5%、17.8%、12.0% 毛利率 |
| 结束状态 | takeoverRequired=false，原 browser session 正常 closed |

平台 32 项、控制面 22 项、browser-worker 16 项和前端 3 项相关测试通过；前端类型检查、生成代码 checkpoint 验证及 `git diff --check` 通过。生成代码 checkpoint 验证脚本为 `tests/verify-browser-workflow-checkpoint.py`。

验证证据保存在 `/private/tmp/ops-browser-fix/`：`final-evidence.txt`、`worker-command-metrics.json`、`completed-dom.txt`、`completed-screenshot-preview.jpg` 和 `after-resume-summary.jpg`。旧执行缺失的截图与正文不会被新发布版本补写，需要使用新 Skill 发起执行。

## 审批操作报告后处理

`post_process_1` 的操作报告提示词保存在 `docs/prompts/browser-approval-operation-report.md`，并同步到录制模板、工作流 composition 和发布源。它的 content 绑定同时读取既有页面正文与显式声明的 `operationReportContext` 输出。

生成器从本次 `phaseResults` 动态构造 `browser-operation-evidence/v1`，记录逻辑步骤、循环次数、实际命令、目标选择器、命令状态、页面内容、业务提取值和人工处置。点击命令的目标可能使用 `target`，读取命令可能使用 `selector`；证据归一化同时处理这两个字段。报告输入不包含填入的用户名、密码或凭据值。

恢复时保留原接管原因以及处置类型、用户备注、操作人、时间和 takeoverId，再更新等待状态。历史记录中的人工介入次数通过实际处置记录累加，不按页面上的介入提示文案统计。

报告必须区分人工确认放行和机器人随后执行审批。当前没有逐次记录人工在远程浏览器中的点击动作，证据中的 `humanBrowserActionsAudited=false` 明确这一点；备注中提到的手动动作只能作为用户说明。审批点击成功和业务最终状态单独核验也必须区分。

通用修复逻辑没有写死测试执行 ID、案件编号、毛利率或审批条数。原录制配置仍包含固定的 Mock ERP 地址、20% 默认阈值、测试账号及凭据默认值；这些原有配置没有作为操作报告中的统计结果。生成代码测试覆盖 3 条审批/2 次人工处置和 1 条审批/0 次人工处置两个场景，并直接执行生成 Activity 核对审批目标。

### 操作报告实测记录

- 发布 artifact：v8，`sha256:7c2bd1ac1dcc92d192e4be08ff8e826eb3159361e28fa672f007755f0f984cfb`。
- 新 Skill：`live-export-replay-1790872547-a23b614d-4`，ID `39a5496d-fbb9-41ed-9520-fae2b52a73d3`。
- 实测执行：`84e2c7e1-90ef-49bd-ae1b-87870ec724ce`，状态 `succeeded`，浏览器及后处理均完成；原会话 `e65fe6f7-b94c-442f-8d21-3e7a2c59db89` 正常关闭。
- 动态证据记录 3 次审批成功点击、2 次人工放行，循环 2、3 分别保留不同备注、处置时间和用户 ID。LLM 实际输入正文长度 20695，包含 `browser-operation-evidence/v1`。
- 页面报告列出 3 条案件的编号、名称、客户、受注金额、粗利益额、毛利率及处理方式，区分 1 条自动审批和 2 条人工放行后机器人审批；受注金额合计 ￥45,500,000，粗利益额合计 ￥7,978,000。
- 当前证据验证审批点击及待处理列表减少，没有单独回读最终业务审批状态，也没有采集人工在远程浏览器内的逐次点击。

平台相关两组回归共 26 项通过，生成代码 checkpoint 的实际 Activity 和不同数量场景验证通过；工作流验证、发布静态验证及沙箱验证均通过（100 分）。

完整文本检查发现，本轮首份模型报告在最后一个条目中途结束，但模型上报 `finishReason=stop`，输出上限为 8000 tokens。使用同一份脱敏 Mock ERP 证据、同一操作版本 `transform_text@1.0.28` 和原模型独立复验，生成了完整报告，没有再次执行 ERP 审批。复验仍偶尔出现内部字段名，提示词要求不构成严格格式验证。保留原执行结果，未用复验报告覆盖执行历史。

证据目录 `/private/tmp/ops-browser-report/` 中，`final-evidence.txt`、`approval-operation-report.md` 和 `completed-dom.txt` 对应原执行；`post-processing-recheck.json`、`approval-operation-report-recheck.md` 对应独立复验，`operation-report.jpg` 为原执行报告展示截图。测试案件来自 `tests/mock-erp/app.js` 的默认 fixture。
