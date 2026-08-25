# 企业任务编排设计与落地计划

> 文档状态：实施设计  
> 基线日期：2026-08-24  
> 实施原则：小步迁移、行为可验证、可灰度、可回滚，不做一次性微服务重写  
> 相关文档：[现状与 Harness 对比](./01-current-state-and-harness-comparison.md) · [目标架构](./02-target-architecture.md)

## 1. 实施目标

本计划把当前系统演进为：

- 五级规划分类。
- 快速路径优先、生成式规划受限。
- Control Plane API 与执行 Dispatcher 分离。
- Runtime Adapter 和业务能力注册式扩展。
- 数据有明确写入权威。
- Token、风险、版本和执行环境可证明。
- 开发 Docker 与不可变生产构建分离。

实施过程中必须持续满足：

- 已有 Task Mode 可用。
- 已保存工作流可继续执行。
- 正在运行的 Execution 不因新版本发布失效。
- 旧计划在保留期内仍能恢复。
- 每个阶段都可以独立上线和回滚。

## 2. 当前到目标的主要差距

| 领域          | 当前状态                            | 目标状态                                           |
| ------------- | ----------------------------------- | -------------------------------------------------- |
| 路由          | `single_skill / deterministic_plan` | 五级 Planning Class                                |
| 路由依据      | 关键词信号为主                      | 精确引用、检索、Recipe、成本、风险和置信度联合决策 |
| 决策记录      | Routing Observation 部分记录        | 完整 Planning Decision                             |
| Control Plane | API、Cron、Dispatcher、恢复同进程   | API、Dispatcher、Schedule Trigger 独立进程角色     |
| 执行启动      | 进程内异步触发                      | Outbox + 持久 Dispatcher                           |
| Runtime 扩展  | 构造函数硬编码 Adapter              | DI/Manifest 注册                                   |
| 数据库        | 多服务共享完整 Prisma Schema        | 逻辑 Schema、数据库角色、唯一写入权威              |
| 历史结果      | 长文本和对象直接传递                | Result Ref + 字段投影                              |
| Token         | 局部统计                            | 执行级预算、调用账本和稳定 Prompt Snapshot         |
| Docker        | 开发栈为主                          | dev override + 不可变生产镜像                      |
| Temporal      | 与自研 Scheduler 并存               | 明确顶层权威和 Runtime 边界                        |

## 3. 实施总体顺序

```mermaid
flowchart LR
    M0["M0 基线与门禁"] --> M1["M1 路由与审批收敛"]
    M1 --> M2["M2 持久化执行驱动"]
    M2 --> M3["M3 Capability Pack 与注册式 Runtime"]
    M3 --> M4["M4 数据所有权与部署固化"]
    M4 --> M5["M5 学习晋级与规模化"]
```

每个里程碑必须先完成测试和观测，再进入下一阶段。时间安排应根据团队容量确定，不把日历日期写死在架构合同中。

## 4. M0：建立可测基线和实施门禁

### 4.1 目标

在改变路由和调度前，先让当前行为可测、可比较、可回滚。

### 4.2 工作项

#### 4.2.1 建立任务路由 Golden Dataset

新增建议目录：

```text
tests/task-routing/
  fixtures/
    single-capability.jsonl
    saved-workflow.jsonl
    recipe-plan.jsonl
    generated-plan.jsonl
    no-match.jsonl
    adversarial.jsonl
  routing-golden.test.ts
  topology-golden.test.ts
```

每条 Fixture 至少包含：

```json
{
  "id": "route-001",
  "locale": "zh-CN",
  "request": "查询微博热点并总结后用 Bark 推送",
  "availableCapabilities": ["social.search", "text.summarize", "bark.push"],
  "expectedClass": "recipe_plan",
  "expectedCapabilities": ["social.search", "text.summarize", "bark.push"],
  "forbiddenCapabilities": [],
  "requiresApproval": false
}
```

数据来源：

- 当前单元测试。
- 真实匿名化请求。
- 历史成功执行。
- 历史误匹配和失败案例。
- 中英文、简称、企业术语和省略表达。

#### 4.2.2 建立执行不变量测试

必须覆盖：

- Plan Hash 被修改后拒绝执行。
- Frozen Contract Digest 漂移后拒绝执行。
- 同一 Step Lease 只能被一个 Worker 领取。
- 幂等键重复提交不会创建重复副作用。
- 缺少输入时冻结原计划并进入 `waiting_input`。
- 补充输入后恢复同一 Execution 和同一 Plan Hash。
- Pending Approval 不得被 Dispatcher 领取。
- 终态输出不满足合同则父 Execution 失败。
- 旧版本 Runtime 不得执行新版本 Contract。

#### 4.2.3 增加架构边界检查

在现有 Docker 分层验证之外增加：

- Intelligence 不得直接写 `execution.*` 数据。
- Runtime 不得导入 Planner 内部 DTO。
- Control Plane 不得导入具体 Capability Domain Service。
- 业务包不得修改中央 Router 关键词表。
- 跨服务类型必须来自 `packages/backend-contracts`。

### 4.3 验收

- 当前主链路 Golden Test 固化。
- 路由、冻结、等待输入、审批、恢复、结果合同均有自动测试。
- 新架构功能默认受 Feature Flag 控制。

## 5. M1：路由与审批收敛

### 5.1 拆分 Chat Orchestrator

当前 `ChatOrchestratorService.handleTaskMode()` 职责过多。建议拆成：

```text
modules/chat/task-mode/
  task-mode-orchestrator.service.ts
  task-resume.service.ts
  task-planning-context.service.ts
  task-route-execution.service.ts
  task-execution-observer.service.ts
  task-fallback-policy.service.ts
```

职责：

- `task-resume`：只处理已有 Execution。
- `task-planning-context`：历史、上传文件、上一结果引用。
- `task-route-execution`：执行 Planning Decision。
- `task-execution-observer`：SSE 和结果展示。
- `task-fallback-policy`：定义什么错误允许回退。

`TaskModeOrchestrator` 只负责编排这些服务，不继续堆积领域逻辑。

### 5.2 引入 Planning Decision

新增共享合同建议：

```text
packages/backend-contracts/planning-decision/
  package.json
  index.d.ts
  schema.json
  validator.ts
```

AI Orchestrator 持久化：

- 路由类别。
- 决策来源。
- 候选和选择结果。
- Policy/Catalog Digest。
- 估计调用和 Token。
- 风险与审批。

Control Plane 只消费已经通过 Schema 校验的 Planning Decision，不重新调用 Router。

### 5.3 五级路由实现

建议服务划分：

```text
modules/planner/routing/
  planning-classifier.service.ts
  explicit-execution-reference.matcher.ts
  saved-workflow-route.service.ts
  single-capability-route.service.ts
  recipe-route.service.ts
  generated-plan-route.service.ts
  exploratory-route.service.ts
  planning-decision.assembler.ts
```

执行顺序：

1. 显式 Execution/Workflow/Capability Reference。
2. 已保存工作流确定性匹配。
3. 单能力检索与门槛。
4. 固定 Recipe 覆盖检查。
5. 受限拓扑规划。
6. 无覆盖时返回 No Match 或显式建议进入探索模式。

禁止生产 Task Mode 自动从失败路径进入 Exploratory Agent。

### 5.4 统一风险与审批

新增 `PlanRiskEvaluator`：

- 汇总节点 `sideEffectClass`。
- 校验数据分类。
- 检查跨组织或外部接收方。
- 检查幂等和补偿能力。
- 输出统一的 `riskLevel` 和 `requiresApproval`。

单 Skill、Recipe、Generated Plan 和 Saved Workflow 必须使用同一个风险评估器。

Control Plane 的 `createDeterministicExecution()` 增加：

- `PENDING_APPROVAL` 状态。
- Approval Record。
- 审批前禁止写 Outbox Ready Event。

### 5.5 收敛回退策略

定义统一错误分类：

| 错误                      | 默认行为                        |
| ------------------------- | ------------------------------- |
| `CAPABILITY_NOT_FOUND`    | 不执行，返回能力缺失            |
| `ROUTE_AMBIGUOUS`         | 请求用户确认                    |
| `PLAN_VALIDATION_FAILED`  | 不执行，记录 Planner 缺陷       |
| `CONTRACT_MISMATCH`       | Fail-closed                     |
| `RUNTIME_UNAVAILABLE`     | 按策略重试，不改写计划          |
| `EXECUTION_CREATE_FAILED` | 返回错误，不进入 ReAct          |
| `EXPLORATORY_REQUIRED`    | 仅提示用户显式进入探索/创作模式 |

### 5.6 验收

- 所有 Task 请求产生 Planning Decision。
- 常见请求分类准确率达到既定 Golden Dataset 门槛。
- 无隐式 ReAct 执行回退。
- 所有执行类型使用同一风险和审批策略。
- Chat Orchestrator 主方法收敛为薄编排层。

## 6. M2：持久化执行驱动

### 6.1 先修复 Cron 原子性

新增 `ScheduleFire`：

```text
schedule_fires
  id
  schedule_id
  scheduled_at
  status
  execution_id
  claimed_by
  lease_expires_at
  created_at

UNIQUE(schedule_id, scheduled_at)
```

触发算法：

1. 在一个事务中计算和写入 `ScheduleFire`。
2. 唯一键阻止重复触发。
3. 同一事务更新 `nextRunAt`。
4. 写入 Outbox `schedule.fire.created`。
5. Consumer 根据 Fire 创建 Execution，并回填 `executionId`。

禁止仅依赖 `FOR UPDATE SKIP LOCKED` 的瞬时查询锁保证一次触发。

### 6.2 Execution Outbox

新增：

```text
execution_outbox
  id
  aggregate_type
  aggregate_id
  event_type
  payload_json
  available_at
  claimed_by
  lease_expires_at
  attempts
  published_at
  created_at
```

Control Plane 在创建 Execution/Step 的同一数据库事务中写入 Outbox。

首期可以使用 PostgreSQL Polling，不急于引入新消息基础设施。

### 6.3 独立 Dispatcher 进程角色

建议先复用 Control Plane Package：

```text
apps/backend/execution-control/control-plane/src/main.ts
apps/backend/execution-control/control-plane/src/dispatcher-main.ts
apps/backend/execution-control/control-plane/src/schedule-main.ts
```

构建为同一镜像、不同启动命令：

```text
control-plane-api
execution-dispatcher
schedule-trigger
```

稳定后再决定是否物理迁移到独立 Package。

### 6.4 Ready Set 和 Lease

Dispatcher 算法：

1. 查找状态为 `queued/running` 且已审批的 Execution。
2. 读取 Frozen Plan 和 Steps。
3. 找到依赖全部完成的 Pending Step。
4. 使用单条条件更新领取 Lease。
5. 调用 Runtime。
6. 续租长任务或接收 Runtime Heartbeat。
7. 写入 Step Result、Event 和下一条 Outbox。

首期仍可保持一个 Execution 内串行执行。只有满足以下条件才并行：

- 节点声明 `concurrencySafe=true`。
- 无共享可变资源。
- 没有相同业务幂等作用域。
- 所有依赖完成。
- 计划策略允许并行。

### 6.5 持续恢复

Dispatcher 周期扫描：

- 过期 Step Lease。
- 已运行但无 Heartbeat 的节点。
- 有 Ready Step 但无 Outbox 的 Execution。
- Runtime 返回后未推进的父执行。
- 长时间停留在中间状态的异常执行。

服务启动恢复继续保留，但不再是唯一恢复机制。

### 6.6 验收

- API 实例全部重启时，已提交 Execution 不丢失。
- Dispatcher 任一实例终止后，其他实例能在 Lease 到期后接管。
- 多 Dispatcher 不重复执行同一步骤。
- Cron 多实例不会产生重复 Schedule Fire。
- API、Dispatcher、Schedule Trigger 可独立扩容。

## 7. M3：Capability Pack 和注册式 Runtime

### 7.1 Runtime Adapter DI 注册

新增 Token：

```typescript
export const RUNTIME_ADAPTER = Symbol('RUNTIME_ADAPTER');
```

每个 Adapter Module 提供：

```typescript
{
  provide: RUNTIME_ADAPTER,
  useClass: DocumentRuntimeAdapter,
  multi: true
}
```

如果 Nest 默认 Provider 组合不支持所需的多绑定形式，可以由 `RuntimeAdapterContributor` 收集器或动态模块统一注册，但业务 Adapter 不应再出现在中央 Registry 构造函数参数列表中。

启动时必须校验：

- Route Key 唯一。
- Adapter 声明版本。
- Runtime Protocol Version 兼容。
- 必要端点可用。
- 重复注册时 fail-fast。

### 7.2 Builtin Handler 下沉

当前文档、通知等 Builtin Handler 从 Control Plane 下沉：

- 文档处理由 Document Domain Adapter 注册。
- 通知由 Notification/Connector Runtime 注册。
- Control Plane 不保存具体 Endpoint 字符串。
- Handler Manifest 随 Capability Release 发布。

### 7.3 Capability Pack SDK

新增建议：

```text
packages/capability-sdk/
  manifest/
  contract/
  runtime-adapter/
  test-kit/
  fixture-runner/
  release-client/
```

SDK 提供：

- Manifest Schema 和验证。
- Routing Card Builder。
- Input/Output Contract 测试工具。
- Runtime Invocation/Result 类型。
- 幂等测试 Harness。
- Artifact Ref 工具。
- 本地真实探测工具。

### 7.4 Capability 晋级流水线

```text
draft
  -> experimental
  -> certified
  -> production
  -> deprecated
```

进入 `certified` 必须具备：

- 精确版本和 Digest。
- 输入输出合同。
- Routing 正反例。
- 权限和风险声明。
- 幂等行为。
- Runtime Probe。
- Contract Test。
- Owner 和 Runbook。

进入 `production` 额外要求：

- Shadow/Canary 数据。
- SLO 和资源预算。
- 回滚版本。
- 安全评审。

### 7.5 验收

- 新增一个示例 Capability Pack 不修改 Control Plane 核心代码。
- Adapter 重复 Route 在启动阶段失败。
- 未发布或无合同能力不能进入 Planner 候选。
- Runtime 只能执行精确 Capability/Contract Digest。

## 8. M4：数据所有权和部署固化

### 8.1 Prisma Schema 收口

第一阶段不立即拆数据库，先形成单一 Schema 来源：

```text
database/
  schemas/
    governance/
    registry/
    execution/
    runtime/
    intelligence/
    document/
  migrations/
```

各服务生成只包含自己所需模型的 Prisma Client。当前 Platform 与 Control Plane 的完整 Schema 镜像改为生成物，不再人工维护两份权威文件。

### 8.2 数据写入权威

迁移顺序：

1. 统计每个服务实际读写的 Prisma Model。
2. 为每张表指定 Owner。
3. 阻止非 Owner 新增写调用。
4. 建立只读 API 或 Read Model。
5. 切换数据库角色权限。
6. 最后删除非 Owner 的 Prisma Model 和写权限。

优先处理：

- Execution/Step/Event/Plan/Artifact -> Control Plane。
- Runtime Session -> Session Broker。
- LLM Operation/Eval -> AI Orchestrator。
- User/Organization/Role -> Governance/Platform。
- Skill/Release/Contract -> Registry/Release。

### 8.3 Result Ref 和 Artifact Ref

替换跨步骤大对象传递：

```text
完整结果落入结果存储/对象存储
  -> Execution Step 保存 Result Ref
  -> Binder 根据目标 Schema 请求字段投影
  -> Runtime 使用授权引用读取
```

过渡期：

- 同时支持 Inline Result 和 Result Ref。
- 新执行默认写 Ref。
- 旧执行读取时通过 Legacy Adapter 转换。
- 记录 Inline 路径命中指标，达到清零门槛后删除。

### 8.4 Docker 开发/生产分离

#### 开发

- 保留 `./docker/start-smart.sh`。
- 将源码挂载、watch、debug port 放入 dev override。
- 依赖安装改用 `pnpm install --frozen-lockfile`。
- 更新依赖通过显式命令完成，不在普通启动中修改 Lockfile。

#### 构建

统一 Node Service 多阶段 Dockerfile：

1. 复制 Workspace Manifest 和 Lockfile。
2. 冻结安装依赖。
3. 构建目标及其 Workspace Dependencies。
4. 生成 Prisma Client。
5. Prune Production Dependencies。
6. 复制到最小 Runtime Image。
7. 使用非 Root 用户运行。

#### 生产

- 使用精确 Image Digest。
- 不挂载源码和 Docker Socket。
- 数据库迁移单独运行。
- 配置 Secret Provider。
- 后端只使用内部 `expose`，由 Gateway 对外。
- 添加 readiness、liveness、graceful shutdown 和资源限制。
- 移除固定 `container_name`，允许多副本。

### 8.5 Compose 权威化

选择一种方式：

1. 权威服务片段 + 多个 override；或
2. 单一 Compose + Profiles。

不再同时维护内容不同的 base 与 legacy 分层服务定义。验证脚本需要比较：

- Image/Build。
- Command。
- Environment Key。
- Volume。
- Network。
- Healthcheck。
- Security Option。

而不仅是服务名称集合。

### 8.6 验收

- 核心表有唯一 Owner。
- 非 Owner 数据库角色无法写入。
- Platform 和 Control Plane 不再人工维护完整镜像 Schema。
- 生产镜像构建不需要运行时联网安装依赖。
- 同一提交和 Lockfile 构建得到可追踪的镜像 Digest。
- Control、Runtime 和 Data 网络隔离。

## 9. M5：Token、学习晋级和规模化

### 9.1 Token Ledger

新增执行级账本：

```text
llm_usage_ledger
  execution_id
  planning_decision_id
  step_id
  purpose
  provider
  model_id
  prompt_template_digest
  input_tokens
  output_tokens
  cached_tokens
  estimated_cost
  created_at
```

`purpose` 示例：

- route。
- topology。
- parameter_binding。
- llm_operation。
- result_presentation。
- compaction。

### 9.2 预算策略

- L0：默认 0 次规划模型调用。
- L1：最多一次参数识别调用。
- L2：最多按选中节点进行参数识别，禁止拓扑调用。
- L3：最多一次拓扑调用和受限参数调用。
- 展示总结仅在合同没有可读结果且策略允许时调用。
- 超预算时不自动切换到更昂贵模型或 Agent Loop。

### 9.3 Prompt Snapshot

保存：

- System Prompt Version/Digest。
- Catalog Snapshot Digest。
- Routing Card 顺序。
- Model Policy Digest。
- Generation Parameter。
- 输入引用和投影路径。

动态数据必须放在稳定前缀之后，减少 Prompt Cache 失效。

### 9.4 习惯与 Recipe 晋级

从 Routing Observation 和成功 Execution 中产生候选：

1. 聚合同类请求指纹和计划结构。
2. 生成 Candidate Recipe。
3. 在历史 Fixture 上 Shadow 回放。
4. 比较能力覆盖、参数绑定和结果合同。
5. 人工审批。
6. 发布新 Recipe Version。
7. 小流量激活和持续监控。

禁止只根据出现频率自动发布高风险流程。

### 9.5 验收

- 每次模型调用都能归因到执行和用途。
- 可以统计不同 Planning Class 的平均 Token 和成功率。
- 高频流程能够从 L3 晋级为 L2/L0。
- 晋级过程有评测、审批和回滚记录。

## 10. 关键数据库迁移

建议依次引入：

1. `planning_decisions`。
2. `execution_provenance`。
3. `execution_outbox`。
4. `schedule_fires`。
5. Step Heartbeat 和 Lease 扩展字段。
6. `result_refs` / `artifact_refs`。
7. `llm_usage_ledger`。
8. Capability Pack / Catalog Snapshot 元数据。

所有迁移必须：

- 向后兼容至少一个发布窗口。
- 先加字段和双读，再切换写入，最后删除旧字段。
- 大表回填使用独立 Backfill Job。
- 不在普通应用容器启动时执行 `db push`。

## 11. API 和事件迁移

### 11.1 新增接口

建议：

```text
POST /executions
GET  /executions/:id/planning-decision
GET  /executions/:id/provenance
POST /executions/:id/approve
POST /executions/:id/input
POST /internal/dispatcher/heartbeat
POST /internal/runtime/results
```

### 11.2 核心事件

```text
planning.decision.created
execution.created
execution.approval.required
execution.ready
step.ready
step.claimed
step.heartbeat
step.succeeded
step.failed
execution.succeeded
execution.failed
schedule.fire.created
schedule.fire.execution_created
```

事件必须带：

- `eventId`。
- `executionId`。
- `orgId`。
- `traceId`。
- `schemaVersion`。
- `occurredAt`。
- `causationId`。
- `correlationId`。

### 11.3 兼容策略

- SSE 对外事件保持兼容，内部事件可升级为新版本。
- 老客户端仍能读取 `status`、`result` 和 `executionId`。
- 新字段只增不改，直到客户端完成迁移。
- 入口 Adapter 负责旧 DTO 到新合同的转换。

## 12. Feature Flag 与灰度

建议 Feature Flag：

```text
PLANNING_CLASSIFIER_V2_ENABLED
PLANNING_DECISION_PERSIST_ENABLED
PLAN_RISK_EVALUATOR_V2_ENABLED
EXECUTION_OUTBOX_ENABLED
EXECUTION_DISPATCHER_V2_ENABLED
RUNTIME_ADAPTER_PLUGIN_REGISTRY_ENABLED
RESULT_REF_ENABLED
PRODUCTION_REACT_FALLBACK_ENABLED=false
```

灰度顺序：

1. 只记录 V2 决策，不影响 V1 执行。
2. Shadow 对比 V1/V2 路由。
3. 只为内部用户启用 V2。
4. L0/L1 先切换。
5. L2 Recipe 切换。
6. L3 Generated Plan 最后切换。
7. Dispatcher 按新建 Execution 灰度，旧 Execution 保持原调度方式。

## 13. 测试体系

### 13.1 单元测试

- Planning Classifier。
- Saved Workflow Matcher。
- Recipe Coverage。
- Parameter Binding。
- Risk Evaluator。
- Contract Compiler。
- Ready Set 计算。
- Lease Claim。
- Retry/Compensation Policy。

### 13.2 合同测试

- Planner -> Control Plane。
- Control Plane -> Runtime。
- Runtime -> Control Plane。
- Capability Pack -> Registry。
- Result Ref -> Binder。
- SSE Event -> Frontend。

### 13.3 集成测试

- 单 Skill 成功/缺参/审批。
- Recipe 多步骤成功。
- Generated Plan 冻结失败。
- Dispatcher 进程中断和接管。
- Runtime Timeout、Retry 和幂等。
- Schedule 多实例去重。
- 数据库角色越权写入失败。

### 13.4 E2E 黄金链路

至少保留：

1. 搜索 -> 总结 -> 推送。
2. PDF 上传 -> 提取 -> 总结 -> Markdown Artifact。
3. 浏览器执行 -> 人工接管 -> 恢复。
4. 保存工作流 -> 定时触发 -> 同版本执行。
5. 高风险操作 -> 审批 -> 执行。
6. 上一结果 -> 单 Skill 延续。

## 14. 可观测性和 SLO

### 14.1 核心指标

- `planning_route_total{class,source,result}`。
- `planning_model_calls_total{purpose}`。
- `planning_tokens_total{purpose,model}`。
- `execution_created_total{mode}`。
- `execution_terminal_total{status,failure_code}`。
- `execution_duration_seconds{class}`。
- `step_lease_conflict_total`。
- `step_recovery_total{reason}`。
- `runtime_invocation_total{route,status}`。
- `schedule_duplicate_prevented_total`。
- `contract_violation_total{code}`。

### 14.2 建议初始 SLO

SLO 数值应在取得真实基线后确定。实施初期先要求：

- 所有失败都有稳定 Error Code。
- 所有模型调用可归因。
- 所有 Runtime 调用有 Trace。
- 所有恢复都有原因和原 Lease Owner。
- 所有高风险执行都有审批记录。
- 所有生产执行可查询 Provenance。

## 15. 安全落地

- 用户 JWT 与服务身份凭据完全分离。
- 内部 Runtime API 不接受客户端自报 `userId/orgId` 作为信任来源。
- Runtime Invocation 由 Control Plane 签名或使用短期服务令牌。
- Capability Pack 声明权限和数据分类。
- Runtime 只能访问当前 Execution 授权的 Secret Scope。
- Browser/Sandbox 不直接挂载宿主机 Docker Socket；过渡期至少使用 Socket Proxy 和命令 Allowlist。
- Artifact 下载使用短期授权 URL，并校验组织归属。
- Prompt 和 Tool Result 中的外部内容标记来源并执行注入防护。

## 16. 回滚方案

### 路由回滚

- 保留 V1 Router。
- Planning Decision 记录 `routingPolicyVersion`。
- 可按组织、用户或请求类型切回 V1。

### Dispatcher 回滚

- V2 只处理带 `dispatcherVersion=v2` 的新执行。
- 旧执行继续由 V1 恢复逻辑处理。
- 回滚前停止 V2 Claim，新执行切回 V1。
- 已领取节点等待 Lease 结束或显式释放。

### Capability Pack 回滚

- Catalog Activation 指向前一版本。
- 已冻结执行继续使用原版本。
- 新执行使用回滚版本。
- 不修改历史 Plan Snapshot。

### 数据迁移回滚

- 先双写再切读。
- 删除旧字段必须跨至少一个稳定发布窗口。
- Backfill 有独立进度、校验和恢复点。

## 17. 实施风险

| 风险                      | 影响               | 缓解措施                              |
| ------------------------- | ------------------ | ------------------------------------- |
| 路由 V2 导致行为变化      | 用户任务误分类     | Shadow、Golden Dataset、按组织灰度    |
| Dispatcher 双执行         | 外部副作用重复     | 条件 Lease、业务幂等键、唯一约束      |
| 数据 Owner 切换破坏旧查询 | 服务异常           | 双读、Read Model、访问指标            |
| Capability Pack 过度复杂  | 业务接入变慢       | SDK、脚手架、最小 Manifest、示例包    |
| Docker 重构影响开发体验   | 本地启动变慢       | 保留 start-smart、缓存和 dev override |
| 两套调度器状态冲突        | 无法恢复或重复执行 | 明确执行版本和单一权威                |
| Token 优化损失上下文      | 匹配准确率下降     | Result Preview、字段索引、离线评测    |

## 18. 优先 Backlog

### P0：必须先做

1. 路由 Golden Dataset。
2. Planning Decision 合同和只记录模式。
3. 统一风险评估与多步骤审批。
4. 禁止生产模式隐式 ReAct 回退。
5. 修复 Schedule Fire 原子性。
6. Execution Outbox。
7. 周期性 Dispatcher/Recovery。
8. Chat Orchestrator 和 Execution Module 职责拆分。

### P1：扩展和成本

1. Top 3～6 Capability Retrieval。
2. Result Ref 和字段投影。
3. Runtime Adapter 注册式接入。
4. Capability Pack SDK。
5. Prompt Snapshot 和 Token Ledger。
6. 单一 Prisma Schema 来源和表 Owner 清单。
7. Dev/Production Docker 分离。

### P2：规模化

1. 组织/团队/用户作用域 Memory。
2. Candidate Recipe Shadow 晋级。
3. Runtime Worker 独立弹性扩容。
4. 明确安全并行的 Ready Set。
5. 数据库角色和网络强隔离。
6. 评估 Frozen Plan 是否迁移到 Temporal 顶层执行。

## 19. 完成定义

本计划完成不以“目录已经创建”或“新服务能够启动”为准，而以以下结果为准：

- 企业常见任务主要走 L0～L2 快速路径。
- 路由、Token、风险、合同和环境均可查询和解释。
- Control Plane API 重启不会中断持久执行驱动。
- Dispatcher 多实例不会重复执行同一节点。
- 新业务通过 Capability Pack 接入，不修改中心业务分支。
- 已冻结执行在新版本发布后仍可恢复。
- 数据写入权威明确且数据库权限能够强制执行。
- 开发环境仍可一条命令启动。
- 生产镜像可由提交、Lockfile 和 Image Digest 精确追踪。
- 探索 Agent 只能产出候选资产，不能绕过发布和审批直接获得生产执行权。

## 20. 代码落地台账与交付合同

> “代码完成”表示实现、Feature Flag 和自动测试已进入仓库，不表示生产数据库已迁移或开关已打开。
> 发布人员必须按本节顺序执行，不得在应用容器启动时执行 `db push`。

### 20.1 P0 交付卡

| 编号                   | 状态             | 关键落点                                                                     | 激活/迁移                                                                                         | 验收标准                                                                           | 回滚                                   |
| ---------------------- | ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| P0-1 Golden Dataset    | 代码完成         | `ai-orchestrator/test/task-routing`                                          | 无运行时开关                                                                                      | 不少于 24 条，ID 唯一，包含中英文、No Match、对抗、保存工作流和多步                | 纯测试资产                             |
| P0-2 Planning Decision | 代码完成，默认关 | `@ops/backend-planning-decision`、Shadow/Control Plane Service               | 迁移 `20260824223000`；`PLANNING_DECISION_PERSIST_ENABLED`                                        | 保存工作流、单能力、Recipe、生成拓扑和 No Match 均有版本化决策；记录失败不中断任务 | 关开关，保留表                         |
| P0-3 Risk/Approval     | 代码完成，默认关 | `PlanRiskEvaluatorService` 与创建/审批/补输入路径                            | `PLAN_RISK_EVALUATOR_V2_ENABLED`                                                                  | 未声明副作用的 Skill 严格按 L2；L2/L3 必须审批；`pending_approval` 不入队          | 关 V2，不删审批记录                    |
| P0-4 Fail Closed       | 代码完成         | `TaskFallbackPolicyService`                                                  | `PRODUCTION_REACT_FALLBACK_ENABLED=false`                                                         | 无能力/规划失败返回 `not_started`，不创建 Execution，不隐式进 ReAct                | 应急可短时显式开启                     |
| P0-5 Schedule Fire     | 代码完成，默认关 | `ScheduleFireService/Dispatcher`                                             | 迁移 `20260824224500`；`SCHEDULE_FIRE_V2_ENABLED`                                                 | `schedule_id + scheduled_at` 唯一；Fire/next-run/Outbox 同事务；多实例不重复创建   | 关 V2，保留 Fire 审计                  |
| P0-6 Outbox/Dispatcher | 代码完成，默认关 | `execution/outbox`、`execution/dispatcher`、`worker-main.ts`                 | `EXECUTION_OUTBOX_ENABLED`、`EXECUTION_DISPATCHER_V2_ENABLED`；角色 `api/dispatcher/schedule/all` | `SKIP LOCKED`、Owner 条件完成、退避、Lease 恢复；API 重启不丢任务                  | 先停 Dispatcher，再关双写              |
| P0-7 职责拆分          | 代码完成         | `ChatTaskResumeService`、`ChatPlanningPresentationService`、Fallback Service | 无数据迁移                                                                                        | Chat Orchestrator 低于 800 行；恢复、等待输入、PDF 参数、Debug 权限独立测试        | 同进程 DI 可回退调用，禁止重新合并职责 |

P0 启用顺序：先迁移表，再打开只记录，然后 Outbox 双写，最后才切换 Dispatcher 执行权。

### 20.2 P1 交付卡

| 编号                     | 状态                                           | 关键落点                                                                                                                                             | 验收标准                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-1 Top 3～6 Retrieval  | 代码完成                                       | `CapabilityCandidateSelectorService`；`PLANNER_CAPABILITY_TOP_K=6`                                                                                   | 配置强制夹紧 3～6；先过滤未发布/无合同能力；显式点名能力不得被截断                                                                                                                                      |
| P1-2 Result Ref          | 代码完成，默认关                               | `@ops/backend-result-ref`、`ResultRefService`；迁移 `20260824231500`；`RESULT_REF_ENABLED`                                                           | 按 Execution Owner 授权；1～32 个字段路径；拒绝原型污染路径；Preview 限深、截断、敏感键脱敏；灰度期保留 `{inline,resultRef}`                                                                            |
| P1-3 Runtime Registry    | 代码完成                                       | Nest Discovery 自动发现 `RuntimeAdapterRegistry`                                                                                                     | 生产 DI 只需注册 Provider；Route 重复启动失败；兼容旧测试的构造参数不参与生产装配                                                                                                                       |
| P1-4 Capability SDK      | 代码完成                                       | `packages/capability-sdk`                                                                                                                            | Certified 强制 Digest、正反例、Owner、Runbook、幂等、Probe；Production 额外强制 SLO/Canary/回滚版本                                                                                                     |
| P1-5 Prompt/Token Ledger | 代码完成，默认关                               | Telemetry/Ledger Service；迁移 `20260824232500`；`MODEL_INVOCATION_LEDGER_ENABLED`                                                                   | Snapshot 只存 Digest、生成参数和引用；规划前调用按 Trace 记录，Execution 创建后 Attach；业务不因记账失败                                                                                                |
| P1-6 Schema/Owner        | 代码完成                                       | 权威 Schema、`database/schema-ownership.json`、同步/验证脚本                                                                                         | `pnpm validate:schema-ownership` 要求镜像字节相同、所有表恰好一个 Owner                                                                                                                                 |
| P1-7 Dev/Prod Docker     | 代码与严格交付流水线完成，待首次受保护分支发布 | `docker/node-service/Dockerfile`、`docker-compose.production.yml`、Release Job、`validate-production-delivery.sh`、`task-orchestration-delivery.yml` | 校验器自动拒绝非 Digest 镜像、非内部网络、host port/volume/Docker Socket、启动迁移、固定容器名和 Root Runtime；Release Job 仅通过 `release` Profile 运行，CI 严格验证、扫描并推送仅以 Digest 引用的镜像 |

P1 Result Ref 删除 Inline 和数据 Owner 撤权都必须跨至少一个稳定发布窗口，当前版本只做双写和权限模板。

### 20.3 P2 交付卡

| 编号                      | 状态                            | 关键落点                                                                                                                          | 验收标准                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-1 Scoped Memory        | 三层 Scope 注入完成，默认关     | `ScopedMemoryService`、`ScopedPlannerMemoryService`；迁移 `20260824234000`；`SCOPED_MEMORY_PROMPT_ENABLED`                        | Prompt 只接受 Active Memory，按 User > Team > Active Organization 优先；活动组织来自认证服务，Control Plane 再自行查询 Active Membership/Team，绝不信任客户端团队列表；深度/集合/字符串均截断；只进入 `plannerContext`、不写 Execution input；不可用时规划继续。 |
| P2-2 Candidate Recipe     | Shadow 治理链路完成，未自动激活 | `CandidateRecipeService`、`/admin/candidate-recipes` 和 Evaluation 表                                                             | 创建时 Advisory Lock 分配不可覆写版本且状态必为 candidate；`candidate -> shadow -> approved -> canary -> active`；同 Fixture 只计一次；晋级在单事务内行锁校验；审批门槛 20/95%，Active 门槛 50/98% 且必须有 Approver。运行时仍不得读取 Candidate/Shadow Recipe。 |
| P2-3 Runtime Worker       | 部署模板完成                    | Production Compose `runtime-worker`                                                                                               | `RUNTIME_WORKER_REPLICAS` 独立扩容；无 Data 网络；下线后 Lease 可接管                                                                                                                                                                                            |
| P2-4 Safe Ready Set       | 代码完成，默认串行              | `DeterministicReadySetService`；`SAFE_READY_SET_PARALLEL_ENABLED=false`                                                           | 依赖全成功才 Ready；仅 `none/read` 且幂等作用域不同才并行；元数据不足退化单节点                                                                                                                                                                                  |
| P2-5 DB/Network Isolation | 部署约束完成，待 DBA 授权切换   | `database/security/roles.sql`、`verify-application-roles.mjs`；应用和 Migration URL 分离；`control/runtime/data` Internal Network | Production Compose 强制 Control 与 AI 使用不同登录凭据；Schema Migrations 只接受 Release-only 管理凭据；AI 可写其 LLM Operation Registry、不能写 Execution；Control 不授 Registry Writer；Runtime 无 Data 网络；PUBLIC 无 Schema Create。                        |
| P2-6 Temporal 评估        | 已完成，结论不迁移              | `04-temporal-authority-decision.md`                                                                                               | Control Plane 继续是 Frozen Plan/审批/Ready Set/Outbox 唯一权威；Temporal 仅做精确 Capability Runtime                                                                                                                                                            |

### 20.4 生产发布顺序

1. 备份并审核 Prisma Migration 历史；存在 Failed Migration 时先修复历史，禁止 `db push`。
2. 以受保护分支构建、扫描并推送不可变镜像，以 Digest 填充 Production Compose；应用服务保持未启动。
3. 使用 `pnpm run run:production-schema-migrator` 顺序执行共享 Platform 与 AI Orchestrator 两条 Prisma migration 历史。该 Job 仅在 `release` Profile 中存在，绝不作为应用启动依赖。
4. DBA 在迁移成功后执行 `database/security/roles.sql`，为 Login Role 配置约定的 group membership；禁止把管理员或 Migration URL 注入应用服务。
5. 使用 `pnpm run verify:production-release-db-roles` 运行正、反向权限验证；通过后再验证表、外键、唯一约束、索引和角色拒绝日志。
6. 所有新开关保持关闭部署代码，先完成旧链路回归。
7. 打开 Planning Decision/Token Ledger 只记录，再打开 Result Ref 双写。
8. 打开 Outbox 双写，启动独立 Dispatcher/Schedule，然后切换新执行权。
9. 仅对内部低风险组织启用 Risk V2/Ready Set；并行最后开启。
10. Candidate Recipe 只运行 Shadow，达门槛且人工批准后才 Canary。
11. 为各应用 Login Role 授予 Reader 和其承载的逻辑模块 Writer；每张表仍只有一个逻辑 Owner。观察拒绝日志后撤销共享写角色。
    Production Compose 必须分别注入 `CONTROL_PLANE_DATABASE_URL` 与
    `AI_ORCHESTRATOR_DATABASE_URL`，禁止回退为共享 `DATABASE_URL`。
12. Scoped Memory 先只为内部测试组织开启：通过 `PUT /api/internal/scoped-memories/self` 写入
    `planner_context/default`，确认规划 Prompt 命中且 Execution input 不含该值；活动组织必须来自
    `/auth/me`，Control Plane 以自身 Membership 查询扩展 Team Scope，禁止由客户端声明 Team ID。

### 20.5 统一验收命令

```bash
pnpm run validate:schema-ownership
pnpm --filter @ops/backend-planning-decision test
pnpm --filter @ops/backend-result-ref test
pnpm --filter @ops/capability-sdk test
pnpm --filter @ops/ai-orchestrator typecheck
pnpm --filter @ops/ai-orchestrator test -- --runInBand
pnpm --filter @ops/control-plane typecheck
DATABASE_URL="$CONTROL_PLANE_TEST_DATABASE_URL" \
  pnpm --filter @ops/control-plane test -- --runInBand
./docker/start-smart.sh docker-compose.base.yml --profile durable-dispatch config --quiet
./docker/scripts/validate-production-delivery.sh
```

其中 `CONTROL_PLANE_TEST_DATABASE_URL` 必须指向隔离的可迁移 PostgreSQL；控制面完整回归包含
真实 Prisma 端到端用例，未提供该变量时只能运行无数据库的单元测试子集，不能将连接失败视为业务回归。

数据库验收还必须覆盖：Migration 在生产基线副本上顺序执行、Outbox 多实例 Claim、Schedule Fire 唯一性、
Result Ref Owner 隔离、Trace Usage Attach 和并行 Ready Set。任一失败都必须保持对应 Feature Flag 关闭。

`validate-production-delivery.sh` 除必填变量和 Compose 渲染外，还必须解析包含 `release` Profile 的 JSON 并校验：所有应用镜像以
Digest 固定、服务网络精确满足 `control/runtime/data` 隔离、无发布到宿主机的端口、无 volume 或 Docker Socket、
无 `build`/`container_name`/`privileged`、无启动迁移命令，以及运行时 Dockerfile 明确切换为非 Root `ops` 用户。
它还必须验证 `schema-migrator` 与 `database-role-verifier` 均只在 `release` Profile、只接入 Data Network、无应用依赖、
无应用 `DATABASE_URL`、使用固定且经过审计的命令、并在镜像的非 Root 用户下运行。

开发环境的 `workspace-deps-init` 与 `apply-latest-db-schema.sh` 同样必须依次运行共享 Platform 和 AI Orchestrator 两条迁移历史；不能只迁移共享 Schema 后让 AI Registry 在空库上依赖应用启动时的隐式建表。

#### 20.5.1 生产数据库 Release Job 操作合同

Release Job 使用两个只给发布程序的数据库连接：

- `CONTROL_PLANE_MIGRATION_DATABASE_URL`：执行 canonical Platform/Control Plane 的唯一共享 Prisma 历史；脚本在已有但无历史的旧库上只会在基线 SQL 审核通过后 adopt baseline。
- `AI_ORCHESTRATOR_MIGRATION_DATABASE_URL`：执行 AI Orchestrator 所拥有的 LLM Operation Registry Prisma 历史；遇到未知的非空库/Prisma 历史异常时 fail-closed，禁止自动 `db push` 或推测 baseline。

在受保护 CI 的已审批发布环境中提供下列变量后，按以下不可跳过的关口执行：

```bash
pnpm run run:production-schema-migrator
# DBA applies database/security/roles.sql and login-role membership here.
pnpm run verify:production-release-db-roles
```

两个命令都会先做静态交付校验；前者只运行 `schema-migrator`，后者只运行 `database-role-verifier`。两者都不执行应用 `up`，也不打开任何 Feature Flag。`database/security/roles.sql` 必须由 DBA 在两条 migration history 均成功后、权限验证之前执行；验证器会同时检查 AI 对 `llm_operations` 的正向写权限，以及 AI 对 `executions`、Control 对 `builtin_skills` 的反向拒绝权限。

Release Job 的验收标准：

1. 审计日志能关联受保护提交、三个应用 Image Digest、两条 migration URL 的密钥引用（不记录值）和 Prisma migration history。
2. `schema-migrator`、DBA 授权与 `database-role-verifier` 三个关口均成功，两个 Job 不产生常驻容器；普通 `docker compose up` 不会包含它们。
3. 三个应用 Login 使用不同凭据；migration/admin 凭据未出现在任何应用 service 的 rendered environment。
4. 75 张当前纳入治理的表均有且仅有一个 Owner；AI 只能写 LLM Registry/Intelligence 表，不能写 Execution；Control 不能写 Registry 表。
5. 任一 migration、权限或验证失败时停止于应用部署之前；仅允许按已审核的补偿/回滚 Runbook 处理，不自动降级权限或重试 DDL。

### 20.6 2026-08-25 多步骤搜索链路加固

针对“搜索 DeepSeek Harness 新闻，然后总结”的生产复现，以下缺口已经按平台协议修复：

| 缺口                                  | 标准化落点                                                                                                               | 验收标准                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 原请求已有搜索词却再次补问            | `DeterministicParamResolverService` 依据能力语义角色和 Routing Policy，在 Recognizer 前解析唯一搜索主语                  | `搜索deepseek harness的新闻，然后进行总结` 绑定 `query=deepseek harness`；`搜索一下` 仍进入 `waiting_input`；解析过程不消耗模型 Token |
| 用户切换模型但总结仍使用全局默认模型  | 冻结计划的 `llm_operation` 节点新增精确 `modelId`，由 Chat → Planner → Plan Hash → Control Plane → Runtime V2 全链路传递 | Runtime 必须调用冻结模型；模型不存在或未激活时失败关闭，禁止静默改用默认模型；Provider 瞬时错误仅在同一模型上有界重试一次             |
| Dispatcher 已写终态但页面永远执行中   | SSE 以 `execution_events` 持久日志为事实源，按 `(createdAt,id)` 游标轮询和重放；进程内 Subject 仅保留为同进程通知能力    | API 与 Dispatcher 分进程时仍收到终态；晚连接可重放；终态关闭 SSE；15 秒心跳防代理空闲断开                                             |
| 三个控制面角色并发重建同一共享 `dist` | Docker 开发栈统一调用带内容指纹与跨容器原子目录锁的 Control Plane 构建脚本，再从同一快照启动 API/Dispatcher/Schedule     | 同批重建只产生一次实际构建；其他角色命中快照；启动不再依赖每个容器临时下载 pnpm；三个角色持续运行                                     |
| Runtime 调用日志泄露凭据值            | 执行日志只记录输入字段名，不序列化输入值                                                                                 | API Key、Token、Password 等值不得出现在 Control Plane 运行日志                                                                        |

该修复不要求重新发布 `WebSearchWorkflow` 或 `summarize_list`。工作流版本和端到端能力合同未发生变化；需要重建并重启 AI Orchestrator、Control Plane API、Execution Dispatcher 与 Schedule Trigger，使新的规划、冻结和事件协议生效。

### 20.7 2026-08-25 标准 LLM 能力路由

针对“上海天气怎么样”完成后追问“给出穿衣建议”的生产复现，确认原请求被错误送入
`single_skill` 快速路径：Skill 匹配服务两次返回 503 时表现为“能力匹配模型暂时不可用”，服务恢复后又因为没有业务 Skill 命中而返回“当前没有可执行 Skills”。`transform_text` 虽已注册为 LLM Operation，但单 Skill 路径不会加载 LLM Operation Catalog，因此没有进入候选集。

标准化落地如下：

| 能力层         | 落地                                                                                | 合同与边界                                                                                                                     | 验收标准                                                                                                |
| -------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 路由           | Routing Policy 新增 `generation` 信号组；建议、解释、起草、对比等请求进入确定性规划 | 信号集中在版本化策略中，不在 Chat/Planner Service 散落业务关键词                                                               | `给出穿衣建议` 和 `写一封项目复盘邮件` 不调用 Skill 匹配快速路径                                        |
| 有上下文生成   | 新增 `grounded_text_transform` Recipe，固定选择 `transform_text`                    | 必须存在上一完成执行的可信结果；不得包含搜索、文件、推送等外部动作                                                             | 天气结果按 Schema 投影到 `content`，本轮原始请求绑定到 `instruction`；Topology 与参数识别模型调用均为 0 |
| 通用无工具生成 | 新增 `generate_text` 系统 LLM Operation                                             | `instruction` 必填、`context` 可选；`tools=disabled`、`externalAccess=denied`、`sideEffects=none`；实时/私有事实缺失时禁止虚构 | 无上下文的解释、建议、起草类任务可以形成单 Operation 冻结计划，不要求伪造内容输入                       |
| 文本变换       | `transform_text` 稳定 ID 保持不变，展示名调整为“标准 LLM 文本变换”                  | 仍要求 `content + instruction`，用于已有正文或上一执行结果的变换，不承担外部查询                                               | 现有冻结计划继续按原版本执行；新规划从 Catalog 获取当前激活版本和 Digest                                |
| 参数成本       | Binder 对显式可选的 LLM `content` 字段在无来源时直接省略                            | 只有权威 Schema 明确该字段可选才跳过；旧 Manifest 缺少 required 快照时不猜测                                                   | `generate_text` 无上下文时不调用参数识别模型，也不进入 `waiting_input`                                  |

`generate_text` 是新增受治理系统 Operation，需要由 AI Orchestrator bootstrap 创建、跑 Eval、生成摘要证明并激活；不需要重新发布任何业务工作流。`transform_text` 只更新系统元数据和确定性路由，不修改已有版本 Manifest。
