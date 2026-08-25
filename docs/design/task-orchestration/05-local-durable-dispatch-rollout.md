# 本地 Durable Dispatch 灰度运行手册

本手册只用于开发或验证环境，不得替代生产发布流程。生产发布仍必须执行
`03-design-and-implementation-plan.md` 的 20.4 顺序、使用真实镜像 Digest，并取得 DBA
的权限隔离批准。

## 目标

将已落地的 P0/P1 组件按可回滚顺序接入本地运行栈：

1. AI Orchestrator 只记录 Planning Decision 和模型调用账本。
2. Control Plane 开启 Outbox 与 Result Ref 双写。
3. 独立 Dispatcher 获得执行权，独立 Schedule Worker 获得调度权。

默认不启用 `PLAN_RISK_EVALUATOR_V2_ENABLED`、`SAFE_READY_SET_PARALLEL_ENABLED`，也不自动
激活 Candidate Recipe 或 Scoped Memory Prompt 注入。

Scoped Memory 已具备独立灰度开关 `SCOPED_MEMORY_PROMPT_ENABLED=true`，但不属于本手册的
Durable Dispatch 默认阶段：它需要先使用认证用户调用 `PUT /api/internal/scoped-memories/self`
写入 `planner_context/default`，再只在内部测试用户上开启。该上下文只用于规划，绝不进入
Execution input；组织和团队 Scope 在可信成员资格接入前不得启用。

## 入口

从仓库根目录运行：

```bash
./docker/scripts/rollout-durable-dispatch-local.sh all
```

支持按阶段执行：

```bash
./docker/scripts/rollout-durable-dispatch-local.sh record
./docker/scripts/rollout-durable-dispatch-local.sh dispatch
./docker/scripts/rollout-durable-dispatch-local.sh memory
./docker/scripts/rollout-durable-dispatch-local.sh verify
```

脚本始终通过 `./docker/start-smart.sh` 调用 Base Compose，且不写入 `docker/.env`。因此任何
后续的无环境变量服务重建都会回到 Compose 默认值；需要持续使用时，应通过同一脚本重新部署。

`memory` 是独立灰度阶段：它只重建 AI Orchestrator 并设置
`SCOPED_MEMORY_PROMPT_ENABLED=true`，同时保留 Planning Decision 和 Ledger 的记录开关。
它不写入任何 Memory 数据；先以认证用户调用 `PUT /api/internal/scoped-memories/self` 写入
`planner_context/default`，再通过 `memory` 阶段启用。

## 本地验收

执行后必须满足：

- `ai-orchestrator`：`PLANNING_DECISION_PERSIST_ENABLED=true`、
  `MODEL_INVOCATION_LEDGER_ENABLED=true`。
- `control-plane`：`EXECUTION_OUTBOX_ENABLED=true`、`RESULT_REF_ENABLED=true`。
- `execution-dispatcher`：`CONTROL_PLANE_ROLE=dispatcher`、
  `EXECUTION_DISPATCHER_V2_ENABLED=true`。
- `schedule-trigger`：`CONTROL_PLANE_ROLE=schedule`、`SCHEDULE_FIRE_V2_ENABLED=true`。
- `PRODUCTION_REACT_FALLBACK_ENABLED` 始终为 `false`。

执行 `memory` 阶段时，额外验证 `SCOPED_MEMORY_PROMPT_ENABLED=true`；未执行该阶段时必须为
`false`。

数据库验收：

```bash
DATABASE_URL='postgresql://ops:ops_secret@localhost:5432/ops' \
  pnpm --filter @ops/control-plane test -- --runInBand test/deterministic-execution-e2e.test.ts
```

## 回滚

先停止独立 Worker，再重建 API 服务为默认 Feature Flag：

```bash
./docker/start-smart.sh docker-compose.base.yml --profile durable-dispatch stop \
  execution-dispatcher schedule-trigger
./docker/start-smart.sh docker-compose.base.yml up -d --force-recreate control-plane ai-orchestrator
```

该回滚只关闭运行开关，不删除 Planning Decision、Outbox、Schedule Fire、Result Ref 或 Ledger
审计数据。
