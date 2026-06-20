# Debug Session: export-stale-backend

Status: OPEN

## Symptoms

- 用户确认点击了 `export` 按钮。
- 前端看到的导出结果疑似仍不是 `templateSteps` 链路产物，表现像旧逻辑或另一类产物。
- 怀疑后端未热更新或未重启，`export` 请求命中了旧服务。

## Scope

- Recorder Debug export request path
- Frontend export button trigger path
- AI Orchestrator export endpoint runtime evidence
- Docker/service restart and hot-reload status

## Hypotheses

1. 前端确实发送了 `POST /ai/recorder-debug/export`，但请求命中了旧实例或错误容器。
2. 请求到达了 AI Orchestrator，但服务未热更新，实际执行的是旧版 `recorder-debug.service.ts` 逻辑。
3. 后端已返回包含 `templateSteps` 的新产物，但前端展示层读取了旧字段或旧缓存。
4. `export` 路径在运行时触发异常、回退或条件未命中，导致响应里没有 `templateSteps/loopDraft`。

## Evidence Plan

- 检查前端 `export` 按钮触发的接口与响应消费路径。
- 确认当前 AI Orchestrator 的启动方式、容器映射和热更新模式。
- 读取最近服务日志，核对是否存在 `POST /ai/recorder-debug/export`。
- 如需进一步确认，再做最小化埋点，只记录 export 请求输入/输出摘要，不改业务逻辑。

## Progress Log

- 初始化调试会话，待收集运行时证据。
- 证据 1：前端 `export` 按钮直接调用 `POST /ai/recorder-debug/export`，随后调用 `templateApi.create('/templates')` 保存模板。
- 证据 2：`ops-ai-orchestrator` 容器挂载的是当前仓库 `apps/backend/orchestration/ai-orchestrator`，且以 `npm run dev` 启动；日志中存在本次会话对应的 `POST /ai/recorder-debug/export`。
- 证据 3：直接重放本次 `export` 请求，响应中明确返回 `templateSteps` 与 `loopDraft`；`templateSteps` 动作为 `navigate -> click -> click -> read_value -> branch -> click`。
- 证据 4：`ops-browser-template` 容器虽然也挂载当前源码，但启动命令是 `npm run build && npm run start`，不是热更新模式；容器启动于 `2026-06-15T15:14:29Z`。
- 证据 5：已保存模板 `b8401371-906b-46e0-8c64-e4313e5ddc59`（名称：`审批通过首条待审案件`）数据库中确实包含新结构：
  - `steps` 中有 `read_value` 与 `branch`
  - `config.loopDraft` 存在
  - `config.executionPlan.templateSteps` 存在
- 证据 6：该模板里的分支内容是“检查当前是否在案件详情页，若是则返回未承認一覧”，后续动作是点击 `一覧に戻る`，而不是“点击承认”。
- 证据 7：本次会话用户历史依次为：
  - `打开 http://192.168.100.143/#approvals`
  - `[循环对象:当前列表] 查看所有的未承认数据`
  - `[循环开始] 点击第一条数据，进入详细`
  - `点击承认`
  - `返回未承认一览`
- 证据 8：`buildBranchGenerationIntent()` 会逆序扫描用户消息，只要匹配 `/分歧|条件|大于|小于|否则|人工介入|人工接管|takeover|自动执行|直接执行|审批|批准|承认/` 就当成 branch intent；因此最后一条 `返回未承认一览` 会因为包含“未承认”中的“承认”而被错误识别为分支意图。
- 证据 9：已保存模板中的 `loopDraft` 只有 `mode/target/stopWhen`，没有 `eachIteration.stepIds`；运行时 `buildLoopPlan()` 在 `stepIds.length === 0` 时会直接返回 `null`，因此该模板的循环并未完整生成。
- 修复 1：已收紧 branch intent 识别，只在“明确条件控制”或“明确批量循环动作意图”时才触发 branch analysis，不再把 `返回未承认一览` 这类导航语句误判为分支意图。
- 修复 2：已为无显式分支的导出补上模板步骤回填逻辑，会从录制后的详情页操作流中自动映射出后续模板步骤；若缺少可执行控制信息，则退回页面接管提示而不是硬编码猜测。
- 修复 3：已让 `buildExportLoopEachIteration()` 在 `loopDraft.eachIteration` 缺失时，直接从导出的 `templateSteps` 反推单轮 `stepIds` 与 `stepCount`，避免循环草稿只剩 `stopWhen`。
- 验证 1：新增回归测试覆盖“返回未承认一览不会触发假 branch，且循环边界会自动补齐”的场景。
- 验证 2：`npm test -- recorder-debug.service.spec.ts --runInBand` 已通过，24/24 通过。
- 验证 3：`ops-ai-orchestrator` 日志显示 `recorder-debug.service.ts` 已被 SWC 重新编译并触发 Nest 进程重启，当前容器已加载新逻辑。

## Hypothesis Status

- H1 前端发了 export，但命中旧实例或错误容器：已基本否定。`ai-orchestrator` 日志明确记录了本次 `POST /ai/recorder-debug/export`，且容器挂载当前源码。
- H2 AI Orchestrator 未热更新，执行的是旧版 export 逻辑：已否定。实时重放 export 响应中已返回 `templateSteps + loopDraft` 新结构。
- H3 后端已返回新结构，但前端展示层读取了旧字段或旧缓存：部分否定。保存后的模板记录本身就带有 `read_value/branch/loopDraft`，不是展示层单独丢失。
- H4 export 运行时异常或回退导致没有 `templateSteps/loopDraft`：已否定。本次 export 响应与数据库模板均包含新结构。
- 新结论 A：`browser-template` 服务不是热更新模式，修改其代码后必须重启容器；但这不是本次模板结构错误的直接原因，因为当前保存结果已包含新字段。
- 新结论 B：本次错误的直接根因是 branch intent 识别过宽，把 `返回未承认一览` 误判成条件分支意图，导致导出出“返回列表”的 branch，而不是“审批通过”的动作链。
- 新结论 C：本次循环没有完整生成。虽然有 `loopDraft.stopWhen`，但缺少 `eachIteration.stepIds`，运行时不会真正进入循环执行。
- 当前状态：代码已修复并完成单测验证，待用户在页面重新点击 `export` 做一次真实回归确认。
