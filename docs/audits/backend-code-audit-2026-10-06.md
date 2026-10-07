# Backend 无用代码、过时实现与迁移残留审查

> 本报告保留首次审查时的证据。代码已修改，当前结论请查看[第三轮审查](/Users/chain/Documents/MyProject/ops-automation/docs/audits/backend-code-reaudit-round3-2026-10-06.md)；下文旧源码行号不代表修改后状态。

审查日期：2026-10-06（Asia/Shanghai）。代码基线：`613e1b70` 的当前工作区。

审查范围：`apps/backend`，并向 `packages`、前端、测试、Docker 与维护脚本追踪消费者。本次只新增审查报告，没有修改业务源码，也没有启动或重启容器。

## 结论

后端物理目录的迁移已取得明显进展，不能把带 `legacy`、`compat` 的代码统一当作垃圾删除。仍存在两个有行为影响的迁移缺口，以及未接入的目标架构包、无调用残留、重复维护和过时说明。

| 编号 | 优先级 | 分类 | 结论 |
| --- | --- | --- | --- |
| F1 | P1 | 迁移接线缺口 | 新模型能力边界校验器只被专门测试引用，正式草稿服务仍使用另一份校验器 |
| F2 | P2 | 配置迁移缺口 | 沙箱 HTTP `/execute` 分发任务时写死默认队列，自定义队列配置没有贯通 |
| F3 | P2 | 尚未接入 | 4 个目标架构包当前是模型与规范化函数的脚手架，没有仓库内消费者 |
| F4 | P2 | 重复维护 | 两个 Python Worker 各保留一套相同的工作流与执行实现 |
| F5 | P3 | 无用代码候选 | 1 个仅被测试调用的空函数、1 个未调用的工具函数、3 个未引用 DTO |
| F6 | P3 | 重复工具 | 输入标签与文件名编码工具各有两份完全相同的源码 |
| F7 | P3 | 过时说明 | 后端总 README 与部分 TODO / placeholder 注释落后于实现 |
| F8 | P2 | 维护债务 | 8 个业务源码文件超过 1200 行建议线；没有确认到超过 1600 行的非豁免业务源码 |

P1 表示应优先修复的行为问题；P2 表示条件触发的问题或需要明确安排的架构债务；P3 表示可按较低优先级清理的残留。本表中的 P2 架构项不等同于已发生线上故障。

## F1：模型能力边界校验器没有接入正式草稿服务

证据：

- [正式服务导入](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft.service.ts:18) 从 `temporal-workflow-draft-plan.helpers` 导入 `validateAiWorkflowDraftPlan`，并在 [validatePlan](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft.service.ts:291) 调用。
- [另一份同名校验器](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft-plan-validation.helpers.ts:42) 明确拒绝把 LLM Operation 放入 Activity；[第 53 行](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/workflow-registry/src/temporal/temporal-workflow-draft-plan-validation.helpers.ts:53) 拒绝新版本使用 `builtin:aiStructuredTransform`。
- 该新文件的仓库内引用只出现在 [专门的边界测试](/Users/chain/Documents/MyProject/ops-automation/apps/backend/platform/test/temporal-workflow-draft-plan-validation.test.ts:1)。原有测试辅助和正式服务均导入旧文件。

对当前 TypeScript 源码现场转译并调用 `TemporalWorkflowAiDraftService.validatePlan`，传入一个未声明旧版本、配置完整的 AI 转换步骤，得到：

```json
{
  "serviceValidatePlan": [],
  "isolatedValidator": [
    "AI transform 使用了已弃用的 builtin:aiStructuredTransform。新任务必须由控制面使用独立 llm_operation 计划节点，不能迁移为另一种 Activity。参见 three-capability-types-and-llm-operation-implementation-plan.md §10.3。"
  ]
}
```

这证明草稿校验入口没有执行新的迁移规则；不代表后续所有发布或执行校验都会放行。

建议：合并两份校验器，保留正式版本现有的输入 enum、默认值及 validation assertion 校验，再加入新能力边界规则。服务和测试必须调用同一入口，并通过 `TemporalWorkflowAiDraftService.validatePlan` 验证新版本拒绝与旧版本兼容场景。仅替换 import 可能丢失旧版本已有的校验能力。

## F2：任务队列配置迁移未贯通

- [sandbox-worker 配置](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/sandbox-worker/src/worker/config.py:32) 已读取 `SANDBOX_WORKER_TASK_QUEUE`，并兼容旧变量 `SANDBOX_TASK_QUEUE`。
- [temporal-worker 配置](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/temporal-worker/src/config.py:31) 读取相同变量，其 [实际 Worker](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/temporal-worker/worker.py:45) 使用 `config.task_queue`。
- [HTTP 网关启动](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/sandbox-worker/src/worker/runtime.py:36) 只传递验证队列和端口，没有传递执行队列。
- [HTTP `/execute`](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/sandbox-worker/src/api/sandbox_http_server.py:63) 仍固定使用 `task_queue='sandbox-worker-task-queue'`。

源级验证：将变量设为 `audit-custom-task-queue`，两个配置对象均返回该值；AST 检查确认 `/execute` 仍分发到默认队列。若 Worker 改为自定义队列且默认队列没有消费者，该接口任务会无法被对应 Worker 消费，最终可能走等待超时。

默认 Compose 当前使用默认队列，因此不能据此断言现有部署已经故障。

建议：把执行队列从配置传到 HTTP Server，再传给 `start_workflow`；增加自定义队列下的分发验证。

## F3：4 个目标架构包仍是未接入脚手架

| 包 | 目前内容 | 证据入口 |
| --- | --- | --- |
| `@ops/master-planner` | Planner 对象模型、规范化函数；facade 只有接口 | [facade](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/master-planner/src/facade/index.ts:1) |
| `@ops/agent-catalog` | Agent 注册模型、作用域和能力列表规范化 | [agent-profile](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/agent-catalog/src/agent-profile/index.ts:27) |
| `@ops/template-registry` | 浏览器和文档模板目录模型、规范化函数 | [browser-template](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/template-registry/src/browser-template/index.ts:13) |
| `@ops/audit-policy` | 审计与策略模型、规范化函数 | [policy](/Users/chain/Documents/MyProject/ops-automation/apps/backend/governance/audit-policy/src/policy/index.ts:5) |

知识图谱和仓库文本检索未发现其他代码引用这些包名；这些包的代表性规范化函数也只有定义，没有消费者。README 明确说明它们用于未来迁移，因此应归类为“尚未接入”，不能直接断言是不需要的功能。

建议：为每个包记录当前实现来源、实际消费者、切换条件和负责人。确定继续迁移的包应接入真实流程；没有实施计划的包可考虑移回设计文档，减少工作区中看似已经完成的能力。删除前仍需确认仓库外消费者。

## F4：Python Worker 拆分后保留两套相同实现

SHA-256 比较确认以下文件在 `runtimes/temporal-worker` 与 `runtimes/sandbox-worker` 下逐字相同：

```text
src/execution/runner_template.py
src/execution/sandbox_executor.py
src/workflows/agent_session_workflow.py
src/workflows/validation_workflows.py
src/workflows/shared.py
src/workflows/activities.py
```

[temporal-worker](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/temporal-worker/worker.py:5) 注册工作流和 Activity；[sandbox HTTP API](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/sandbox-worker/src/api/sandbox_http_server.py:9) 引用工作流类来启动、查询和发信号，[流式执行](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/sandbox-worker/src/api/sandbox_http_server.py:230) 则直接使用本地执行器。

因此两套目录均有实际运行关系。问题是共享实现通过复制维护，修改一份不会自然同步到另一份。

建议：抽出共同的工作流协议和执行库，通过镜像构建安装同一份源码。保留各 Worker 的启动和 API 职责；不能直接删除 sandbox-worker 的整套工作流或执行目录。

## F5：可清理的局部无调用残留

以下结论限于当前仓库，已复核文本引用，不只依赖知识图谱的零入度结果。

| 符号 | 现状 | 清理建议 |
| --- | --- | --- |
| [findTemporalCredentialDefaults](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/release-manager/src/publisher/temporal-runtime-credential.resolver.ts:55) | 忽略参数，恒返回 `[]`；唯一消费者是同文件旁的 spec | 删除无实际能力的导出及对应空断言；保留真正的 `resolveTemporalRuntimeCredentials` 行为测试 |
| [inferImageArrayPath](/Users/chain/Documents/MyProject/ops-automation/apps/backend/capabilities/document-domain/template/workflow-authoring/utils/table-loop-helper.ts:149) | 全仓库只有定义，仍包含基于“运维自动化报告”名称的特殊分支 | 确认没有外部消费后删除 |
| [UploadTemplateDto](/Users/chain/Documents/MyProject/ops-automation/apps/backend/capabilities/document-domain/template/studio/studio.dto.ts:15) | 全仓库只有定义 | 随相关文件清理 |
| [ParseTemplateDto](/Users/chain/Documents/MyProject/ops-automation/apps/backend/capabilities/document-domain/template/studio/studio.dto.ts:19) | 全仓库只有定义 | 随相关文件清理 |
| [TakeoverRequestDto](/Users/chain/Documents/MyProject/ops-automation/apps/backend/runtimes/replay-worker/src/dto/index.ts:133) | 全仓库只有定义；ReplayController 没有导入 | 确认无外部导出消费者后删除 |

`findTemporalCredentialDefaults` 的 [现有断言](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/release-manager/src/publisher/temporal-runtime-credential.resolver.spec.ts:32) 只验证恒空结果，不能证明凭据发现功能有效；不应把这个函数视为已完成的检测能力。

## F6：公共工具存在源码复制

以下两组经 SHA-256 验证完全相同：

- [release-manager/input-label](/Users/chain/Documents/MyProject/ops-automation/apps/backend/registry-release/release-manager/src/common/input-label.ts:1) 与 [ai-orchestrator/input-label](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/common/input-label.ts:1)。
- [ai-orchestrator/filename-encoding](/Users/chain/Documents/MyProject/ops-automation/apps/backend/intelligence/ai-orchestrator/src/common/utils/filename-encoding.util.ts:1) 与 [document-domain/filename-encoding](/Users/chain/Documents/MyProject/ops-automation/apps/backend/capabilities/document-domain/runtime-facade/filename-encoding.util.ts:1)。

这些是重复维护问题，不能仅因相同就删掉一个服务的文件。建议将纯函数放入边界明确的共享工具包，由各服务显式依赖，避免服务互相导入内部源码。

也发现几份 PrismaService、内部认证 Guard 和 endpoint 配置相同；它们可能因独立部署而需要本地适配，不列为直接删除项。

## F7：迁移说明和占位注释已经过时

- [后端总 README](/Users/chain/Documents/MyProject/ops-automation/apps/backend/README.md:12) 仍把 `core/`、`orchestration/`、`shared/` 列为当前层，并说明旧 `sessions/`、`runtime/` 目录仍保留；这些顶层目录当前均不存在。
- [第 38 行](/Users/chain/Documents/MyProject/ops-automation/apps/backend/README.md:38) 仍声称 workbench/workspace 暂挂在 `core/platform`，与当前 `governance/workbench` 的物理实现和 [platform README](/Users/chain/Documents/MyProject/ops-automation/apps/backend/platform/README.md:3) 不一致。
- [FreezeService TODO](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/freeze/freeze.service.ts:52) 和 [placeholder 注释](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/freeze/freeze.service.ts:123) 声称向 Worker 发信号待实现；方法实际已经发送 `/browser/freeze` 和 `/browser/resume` HTTP 请求。

建议：README 根据当前目录和装配入口更新；已实现的占位注释改为描述实际通知行为。这些注释问题不等同于 FreezeService 没有实现。

## F8：大文件仍需按职责继续下沉

仓库复杂度检查报告 9 个超 1200 行文件，其中 1 个是 Python 测试，8 个是业务源码。行数采用检查脚本的 `split('\n').length` 口径。

| 文件 | 行数 | 拆分方向 |
| --- | ---: | --- |
| `control-plane/.../deterministic-plan-scheduler.service.ts` | 1404 | 调度循环、节点状态推进、运行结果处理 |
| `ai-orchestrator/.../chat-orchestrator.service.ts` | 1388 | 请求编排、分支路由、结果与流处理 |
| `release-manager/.../capability-release-build-validation.service.ts` | 1361 | 按能力类型下沉验证适配，保留门禁编排 |
| `workbench/.../coordination-automation-runner.service.ts` | 1324 | 自动化调度、动作执行、结果处理 |
| `workbench/.../workspace.service.ts` | 1300 | 工作区写操作、查询、成员与访问协调 |
| `workbench/.../workbench-coordination.service.ts` | 1294 | 协同状态、审批、关联资源操作 |
| `personal-sandbox-runner/.../agent_loop.py` | 1204 | 循环控制、工具调用、上下文与输出处理 |
| `document-domain/.../contract-review-html-client-script.builder.ts` | 1202 | 按浏览器交互能力拆脚本构建；避免机械切行 |

这些是建议的边界评估方向，不代表本次已验证每项具体重构方案。按照 AGENTS.md，后续新增功能应优先做职责下沉。

`public/js/app.js` 虽有约 3700 行，但它由 `studio-web` 源码生成，不能当作必须手工拆分的业务巨石；生成一致性检查已通过。

## 已确认仍需要的兼容逻辑

| 内容 | 当前消费者/用途 | 删除前条件 |
| --- | --- | --- |
| [SessionController](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/session-broker/src/modules/session/session.controller.ts:27) 的旧 `/sessions` API | 仍由 AppModule 装配；[user-core/session.api](/Users/chain/Documents/MyProject/ops-automation/packages/user-core/src/api/session.api.ts:14) 仍调用旧路径，Portal 会话页面仍使用相关 API | 完成调用方与相关行为到 RuntimeSession/Execution 的迁移，验证旧路径无消费 |
| [carbone-engine-compat](/Users/chain/Documents/MyProject/ops-automation/apps/backend/capabilities/carbone-engine-compat/package.json:5) | [开发 Compose](/Users/chain/Documents/MyProject/ops-automation/docker/compose/docker-compose.base.yml:537) 仍通过旧包名启动，AI 测试脚本也使用旧 filter | 先把实际命令切为 `@ops/document-domain`，再移除 shell |
| [LegacyOutputAdapterService](/Users/chain/Documents/MyProject/ops-automation/apps/backend/execution-control/control-plane/src/modules/execution/plan-runtime/legacy-output-adapter.service.ts:11) | 正式执行模块仍装配，用于没有权威输出 schema 的旧计划，且记录 legacy 使用日志 | 统计旧计划消费并迁移历史数据；不能只按文件名清理 |
| 文档的 `downloadUrl/result_file` 等旧字段 | 文档域 README 明确记录与统一 `ArtifactRef` 共存 | 调用方改用 `artifacts` 并验证历史结果兼容 |
| Prisma migrations、生成客户端、Studio bundle、`var` 运行数据 | 数据库历史、构建产物或运行资产 | 不以“老文件”或“没有静态调用者”为理由删除 |

## 验证与审查限制

已完成：

1. 用 codebase-memory 重新建立索引并查询目录、符号和调用候选；对关键结论复核实际 import 和源码。
2. `node scripts/check-workspace-architecture.mjs`：通过，检查 51 个工作区包，依赖图无环。
3. `bash scripts/check-file-complexity.sh`：通过 1600 行红线，报告 9 个建议线警告。
4. `node apps/backend/capabilities/document-domain/scripts/build-studio-web.mjs --check`：通过。
5. 直接执行当前源代码的草稿服务 `validatePlan` 并与另一份校验器对比：确认 F1。
6. 自定义队列环境变量加载与 HTTP `start_workflow` AST 对比：确认 F2 的配置不一致。
7. 仓库引用复核和重复文件 SHA-256 比较：支持 F3—F6。

没有运行完整测试集、数据库集成测试或容器端到端流程；没有读取生产访问日志。因此“无引用”限定为当前仓库，不保证仓库外客户端没有使用这些导出。

知识图谱对同名符号的调用归属和部分对象方法存在误匹配；例如它曾将 `validatePlan` 归到另一份同名校验器。报告的 F1 以真实 import 和服务方法现场执行结果为准，未把图谱零入度直接当作删除依据。

## 建议处理顺序

1. 修复 F1 的校验入口，并保留两份实现中已经存在的有效规则；补正式服务入口的边界测试。
2. 修复 F2 的执行队列配置透传，验证自定义队列下的派发。
3. 小步清理 F5 的无调用局部残留，并同步 F7 的架构说明和已实现 TODO。
4. 为 F3 的 4 个脚手架包明确接入或退出计划。
5. 按运行时共享边界处理 F4、按纯工具边界处理 F6，再结合具体需求逐步处理 F8。
