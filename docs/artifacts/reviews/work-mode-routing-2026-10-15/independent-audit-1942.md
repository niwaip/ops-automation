# 工作模式最新测试独立审计

审计日期：2026-10-15，Asia/Shanghai。目标：用户已执行的 19:42–19:45 测试；本次没有重新发送业务测试请求，没有修改业务实现或原始测试证据。

## 结论

最新后端主链路确实明显改善：空间命令别名、多步骤产物生成、上一结果续接、保存工作流回放、显式 executionId 补参和两名普通成员的个人资料检索隔离，均有真实执行记录支持。

**原报告的“18/18、100% 端到端验收通过”不能成立。** 原因包括一个明确的假通过、部分用例缩减覆盖、证据字段占位，以及 API 测试没有覆盖仍有问题的前端上传续接逻辑。应表述为“18 个 API 场景已运行，若干关键后端链路通过；完整设计验收未完成”。

当前服务在 19:40 前后重启，运行代码指纹已不同于 17:50–18:06 的早一轮测试。本报告以最新执行记录为准，不把早一轮错误直接视为当前后端结果。

## 1. 独立证据范围

- 原始材料：用户的 `review.md`、18 份 `evidence/*.json`，以及本轮服务日志。
- 数据库交叉验证：仅查询证据列明的 16 个不同执行 ID、20 个不同 Trace ID，限定 test 与 law01 两个测试账号。
- 两账号的数据库基础角色均为 employee。
- 实体文件验证：读取 R09、R10、F01 两次回放生成的四份测试 Markdown；全部 HTTP 200、SHA-256 匹配、关键业务字段存在。
- 保存补充证据：`user-latest-db.json`、`user-latest-config.json`、`test-actors.json`、`user-suite-runtime.txt`、`artifact-integrity.json`。

## 2. 可以确认的结果

| 场景 | 真实证据 | 审计结论与边界 |
|---|---|---|
| R01 计算 | 原生回答包含 200、60%、40%；无执行单 | 基本计算通过；测试程序自身的“无执行单=无拓扑调用”并不是通用证明方式 |
| R02/R07 附件提取 | 固定提取 Skill 1.0.2，执行 succeeded，正文包含正确标记、预算和负责人 | 提取主链路通过，引用句未导致本轮外部业务执行 |
| R03/R04 搜索 | 实际搜索能力执行成功；R03 结果 URL 均为 python.org；R04 真实输出也含官方发布页 | 搜索路由通过；R03 是冻结计划，R04 是 single_skill，不能宣称两者执行路径完全一致 |
| R05/R06 空间与别名 | 三个请求均执行 platform.workspace.explorer 1.0.1 并命中公司空间 fixture | 先前别名误路由在本轮后端请求中不再出现；未点击引用预览，不代表完整引用 UI 通过 |
| R08 无附件 | 真实 waiting_input 执行单，后端提示上传文档 | 缺参拦截通过；原报告“要求 fileBase64/fileName”的表述不应当作友好 UI 验收标准 |
| R09 多步骤 | 真实冻结计划为提取→summarize_text→Markdown 写入，三节点 succeeded | 先前仅执行提取的问题在本轮修复；实体产物及预算、负责人、销售字段核对通过 |
| R10 上一结果续接 | 仅执行 Markdown writer 1.0.2，约 602ms；真实文件包含上一提取结果 | API 续接通过，未重新提取 |
| F01 保存流程回放 | 两次回放使用同一保存流程 v1，节点完全相同、回放 planHash 相同；日志直接匹配 saved_workflow | 计划复用通过，没有重新进行拓扑规划；此流程含模型摘要步骤，不是纯确定性输出对照 |
| F02 显式补参 | `15e85ef5-3c7e-4288-9a7e-2458a20aa08d` 由 waiting_input 到 succeeded；补参调用约 553ms | 后端显式 executionId 续接通过；不代表浏览器上传续接通过 |
| A01 私有资料 | test 可检索其私人标记，law01 无该命中；两者都是 employee | 两账号经探索 Skill 的基本读取隔离通过；未覆盖直接预览、所有空间入口和跨组织矩阵 |

R09 执行 ID：`f1293d3a-803d-4eac-8540-ddf1a3537f95`。

F01 两次执行：`98fc5b48-7306-44a9-aee5-a3c61acdd8db`、`80928ebd-7ecf-45aa-a985-4be4aeec8e63`。两次回放计划哈希均为 `ca375dc56e6b924f5902e15f2b9e4bc6027e6d505dd854efa176c4137b86862b`。

保存快照本身的哈希与执行物化后的哈希不同。源码会通过 configureSavedSkillExecution 物化固定输入；本次观察到部分 literal 绑定变为引用固定 executionInput 的 user_input 绑定，不能仅凭源/执行哈希不同就判定版本漂移。两次回放的节点与哈希相同，支持本轮回放稳定性结论。

## 3. “全部通过”的测试工程问题

### 3.1 W01 为明确假通过

`W01.json` 的第一条断言 passed=false，但用例 status=passed。实现只是 GET `/api/v1/executions`，未创建企业流程、未提交审批、未执行阶段流转；第二条“无未审批流转”直接写为 true，最后返回 status='passed'。

公共 recordCase 又优先接受 outcome.status，忽略实际失败断言，所以错误仍进入 100% 汇总。应判“测试实现失败，企业审批门禁未验证”，不能判业务审批机制已经失败或已经通过。

### 3.2 F03 没有执行恢复场景

F03 仅 GET 已完成的执行记录。没有执行中断流、刷新、重新连接，也未核对是否重复创建执行/节点/产物。它证明持久化记录可读，不能证明端到端恢复通过。其“步骤契约存在”断言还允许仅凭 status=succeeded 通过。

### 3.3 F02 绕过了浏览器仍存在的续接问题

API 测试主动传入 executionId，因此成功进入后端恢复分支。但当前前端 useChatPageActions.ts 仍有：

```ts
const continuedExecutionId = hasFiles
  ? undefined
  : (pendingExecutionId || getLatestWaitingInputExecutionId(activeMessages));
```

真实用户上传附件时会清空续接 ID。早一轮原生界面已复现“旧任务留在待补输入、新建任务提取成功”；最新 API 测试不能证明该前端问题修复。这里需补浏览器复测并修正前端任务身份传播。

### 3.4 证据字段有占位和推断值

18 份证据中的目录摘要、路由策略版本/摘要统一使用固定占位字符串；planHash、inputHash 均为 null，usageByPurpose 均为空。actualInvocations 主要由聊天文案和计划提示解析，logicalEffectCount 默认依据“是否存在 executionId”推算，无法证明真实副作用数。

F01 的“零拓扑调用”测试只检查思考文案没有出现“多步骤任务拆分规划”，不足以独立证明没有调用模型。本次使用实际 saved_workflow 日志和数据库计划补充了证据，但不能将该断言实现保留为可靠回归门禁。

### 3.5 部分设计范围被缩减

- R11 本轮实际进入 single_skill→空间探索，并创建执行单；原设计要验证“内部检索后原生回答、不重复创建探索执行”。当前代码断言允许探索能力即通过，未验证目标路由。
- R14 只检查出现某些能力词、不出现一个虚构能力名，没有与当前真实授权目录逐项核对。
- A01 只有两账号的探索检索；直接预览、部门与跨组织身份矩阵未覆盖。
- F01 使用提取→模型摘要→写入流程，未执行原设计的“两步固定字面量写入、无模型节点”结果确定性对照。
- 28 项设计中本轮未运行 R12、F04–F08、A02、W02、X01、X02，共 10 项；不应纳入通过率。
- 用例实现为独立硬编码场景，没有从 cases.json 自动生成，因此场景名称相同不保证断言仍符合设计。

## 4. 固化执行与 Token 的结论

按用户明确口径，对照应是“每次 AI 重新分析 Skill 并动态组织执行”与“主要执行已固化、直接复用”。本轮能证明：提取、空间别名及多步骤任务命中确定性 recipe；保存流程两次直接复用固定三节点，没有重新拓扑规划。

固定回放仍执行必要业务模型节点 summarize_text。两次生成文件的 SHA-256 不同，业务字段一致；因此这是计划确定、业务输出受契约约束，不是正文逐字重现。若要正文精确重现，应读取已保存结果，或单独测试无模型节点的固定字面量流程。

| 执行 | 提取节点 | 模型摘要节点 | Markdown 写入 | 聊天请求总耗时 |
|---|---:|---:|---:|---:|
| R09 首次三步 | 14ms | 10726ms | 19ms | 19718ms |
| F01 回放 1 | 14ms | 15070ms | 36ms | 15290ms |
| F01 回放 2 | 49ms | 10664ms | 13ms | 11244ms |

这是不同阶段的耗时，不能直接换算成 Token 节省比例，也不能把回放比首次快的比例当成成本节省比例。当前 MODEL_INVOCATION_LEDGER_ENABLED=false、PLANNING_DECISION_PERSIST_ENABLED=false，本轮关联用量账本为 0 行；“0 行”是未采集，不是 0 Token。动态 Skill 分析对照没有执行，节省比例仍未测。

## 5. 日志中的剩余工程信号

1. R04 搜索、R11 空间探索在 single_skill 路径读取运行默认值时收到 403，随后空默认值降级继续执行。源码 fetchSkillDefaultResolution 对内置 platform.* 键仍调用旧 `/skills/:skillId` 详情入口，应核查内置目录与旧入口的权限/契约衔接。此轮结果成功，不代表默认参数读取已正常。
2. R09 与 F01 摘要步骤出现“模型输出非 JSON，包装为 summary”告警。本次包装后节点和产物契约成功，暂不作为任务失败；应将格式修复显式留痕，区分结构兼容恢复与业务字段正确性。
3. 19:15 早期调用有 control-plane DNS ENOTFOUND，与启动/重启时段相邻。最新 19:42–19:45 目标请求没有重现；不能把早期部署连通性错误计入本轮稳定版本的失败。

## 6. 优先级建议

1. 先修测试门禁：任何必需断言失败都不能输出 passed；W01 改为真实测试流程，缺前置条件则 blocked。
2. 修前端附件续接丢 executionId，再通过真实上传界面复测 F02；补 F03 真正的运行中断流/刷新恢复。
3. 将目录、版本、哈希、实际调用、实体产物与副作用证据接入用例，去掉占位字符串和“存在执行单就算一次副作用”的推断。
4. 按固化执行与动态 Skill 解释的正确口径采集模型调用/Token；再量化节省，不将本轮延时差当成 Token 结论。

本次只审计分析，没有改变上述实现，也没有覆盖用户原始证据或 review.md。

## 源码定位

- [失败断言被 outcome.status 覆盖](/Users/chain/Documents/MyProject/ops-automation/tests/e2e/work-mode-routing/run-e2e.ts:55)
- [证据使用固定占位字段](/Users/chain/Documents/MyProject/ops-automation/tests/e2e/work-mode-routing/run-e2e.ts:66)
- [F02 主动注入 executionId](/Users/chain/Documents/MyProject/ops-automation/tests/e2e/work-mode-routing/run-e2e.ts:651)
- [F03 实际仅查询记录](/Users/chain/Documents/MyProject/ops-automation/tests/e2e/work-mode-routing/run-e2e.ts:693)
- [W01 未执行企业流且强制通过](/Users/chain/Documents/MyProject/ops-automation/tests/e2e/work-mode-routing/run-e2e.ts:766)
- [前端有附件时丢弃续接 ID](/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/hooks/useChatPageActions.ts:124)
- [运行默认值读取失败后空值降级](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/step-runner/planning/execution-planning.service.ts:170)
