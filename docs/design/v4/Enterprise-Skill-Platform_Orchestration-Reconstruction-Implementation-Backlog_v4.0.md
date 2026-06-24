# 企业级技能平台 编排层重建实施 Backlog

**Enterprise-Skill-Platform Orchestration Reconstruction Implementation Backlog v4.0**  
日期：2026-06-22

---

## 1. 文档目的

本文档是 [Enterprise-Skill-Platform_Orchestration-Reconstruction-Blueprint_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Reconstruction-Blueprint_v4.0.md) 的实施分解版本，用于把“目标态设计”转为可执行任务。

适用场景：

1. 拆分任务单
2. 排期评估
3. PR 范围控制
4. 阶段验收
5. 回滚点管理

本文档默认遵循以下约束：

1. 不再做无收益的大范围目录搬移。
2. 优先处理超大文件职责过载与导出边界问题。
3. 每个批次必须可独立验证、独立回滚。

---

## 2. 当前实施基线

截至 `2026-06-22`，以下事项已完成，不再纳入本 backlog 的“待实施”范围：

1. `browser/intent` 已完成 `profiles/`、`atomic-parsers/`、`ai-planner/` 目录拆分。
2. `browser/intent/index.ts` 已建立。
3. `execution/` 已完成 `adapters/`、`state/`、`step-runner/`、`human-control/`、`recovery/` 分层。
4. `execution/index.ts` 已建立。
5. `workflow` / 文档生成能力已并入 `execution/` 新分层。
6. 当前源码范围循环依赖已清零。

本 backlog 只关注“下一阶段职责重建”。

---

## 3. 优先级总览

| 优先级 | 任务主题 | 目标 | 风险 | 推荐批次 |
| :--- | :--- | :--- | :--- | :--- |
| P0 | `execution.service.ts` 拆分 | 降低 `control-plane` 核心编排复杂度 | 高 | Batch R1-R3 |
| P0 | `ExecutionModule exports` 收敛 | 建立模块封装边界 | 中 | Batch R4 |
| P1 | `browser` 子目录网关补齐 | 收敛深链路 import | 低 | Batch R5 |
| P1 | `RecorderDebugService` 瘦身 | 降低 `browser/execute` 维护成本 | 中 | Batch R6-R7 |
| P1 | `planner.service.ts` 拆分 | 形成 `skill/plan/params` 分层 | 高 | Batch R8-R10 |
| P1 | `react-engine.service.ts` 拆分 | 形成 `prompt/recovery` 分层 | 高 | Batch R11-R12 |
| P2 | `step-runner/browser/` 子目录化 | 隔离 Browser 专属执行逻辑 | 中 | Batch R13 |
| P2 | `execution-plan-normalization.service.ts` 分层 | 提高执行计划归一化可维护性 | 中 | Batch R14 |

---

## 4. 批次设计

## 4.1 Batch R1：下沉 execution 查询读路径

目标：

1. 从 `execution.service.ts` 中下沉 execution 列表、详情、phase 查询只读逻辑。
2. 新建 `query/execution-query.service.ts`。
3. 保持 `execution.controller.ts` 仍只依赖 `ExecutionService`。

建议文件：

1. `apps/backend/orchestration/control-plane/src/modules/execution/execution.service.ts`
2. `apps/backend/orchestration/control-plane/src/modules/execution/query/execution-query.service.ts`
3. `apps/backend/orchestration/control-plane/src/modules/execution/execution.module.ts`

验收：

1. `execution.service.ts` 行数显著下降。
2. `/api/executions`、`/api/executions/:id`、`/api/executions/:id/phases` 行为不变。
3. 相关测试与 execution 详情页 smoke 通过。

回归重点：

1. execution detail
2. phase 查询
3. artifact 展示
4. SSE 订阅是否受只读查询改动影响

### 4.2 Batch R2：下沉 execution 生命周期写路径

目标：

1. 新建 `lifecycle/execution-lifecycle.service.ts`
2. 从 `execution.service.ts` 下沉 `create / start / cancel / resume / takeover`

建议文件：

1. `execution.service.ts`
2. `lifecycle/execution-lifecycle.service.ts`
3. `execution.module.ts`

验收：

1. 创建执行、启动执行、恢复执行链路回归通过。
2. workflow / document / browser 三类 execution 入口行为不变。

回归重点：

1. execution 创建
2. execution resume
3. human-control resume
4. browser/workflow/document runtime 路由

### 4.3 Batch R3：下沉 execution 事件流

目标：

1. 新建 `lifecycle/execution-stream.service.ts`
2. 从 `execution.service.ts` 下沉 SSE / 事件流逻辑

验收：

1. 事件订阅无回归。
2. `ExecutionEventService` 与 stream 对外行为保持稳定。

### 4.4 Batch R4：收敛 `ExecutionModule exports`

目标：

1. 审计所有外部消费点。
2. 建立稳定导出白名单。
3. 从 `exports` 移除内部实现服务。

建议步骤：

1. 先全仓 grep `ExecutionModule` 外部注入消费点。
2. 记录必须跨模块暴露的 service。
3. 先做一轮保守收缩，再观察回归。

默认保留项：

1. `ExecutionService`
2. `ExecutionEventService`

可选保留项：

1. 必须被外部模块直接注入的少数 facade

不应导出的对象：

1. `builder`
2. `mapper`
3. `policy`
4. `normalizer`
5. `registry`
6. `step-runner` 内部 orchestration service

### 4.5 Batch R5：补齐 `browser` 子目录网关

目标：

新增以下文件：

1. `browser/observe/index.ts`
2. `browser/loop/index.ts`
3. `browser/export/index.ts`
4. `browser/session/index.ts`

验收：

1. 目录外部 import 尽可能通过目录网关收敛。
2. 不引入新的循环依赖。
3. `BrowserModule` 可视需要改为通过网关导入。

### 4.6 Batch R6：抽离 RecorderDebug 会话聚合 Facade

目标：

1. 新建 `execute/recorder-debug-session.facade.ts`
2. 下沉会话、快照、观察、人工介入状态聚合逻辑

验收：

1. `RecorderDebugService` 明显瘦身。
2. `recorder-debug` 核心测试通过。

### 4.7 Batch R7：继续瘦身 `RecorderDebugService`

目标：

1. 保留 `RecorderDebugService` 作为薄 Facade
2. 对外 public 方法只做路由分发与统一编排

验收：

1. `RecorderDebugService` 接近 `300-500` 行目标区间。
2. `recorder-debug` 相关 spec 和真实录制链路无回归。

### 4.8 Batch R8：拆分 planner 技能读路径

目标：

1. 新建 `planner/skill/skill-matcher.service.ts`
2. 新建 `planner/skill/skill-cache.service.ts`
3. 优先迁出技能匹配和缓存读路径

验收：

1. `planner.service.ts` 不再直接承载技能读取细节。
2. 计划生成主路径行为不变。

### 4.9 Batch R9：拆分 planner 计划生成逻辑

目标：

1. 新建 `planner/plan/plan-generator.service.ts`
2. 新建 `planner/plan/plan-semantic.service.ts`

验收：

1. 计划生成和语义聚合边界清晰。
2. 相关 planner 测试通过。

### 4.10 Batch R10：拆分 planner 参数识别

目标：

1. 新建 `planner/params/param-recognizer.service.ts`
2. 下沉参数识别与参数推断逻辑

验收：

1. 参数识别逻辑不再和技能匹配、计划生成耦合在同一大文件。

### 4.11 Batch R11：拆分 react-engine prompt 逻辑

目标：

1. 新建 `react-engine/prompt/decision-context-summary.ts`
2. 将 prompt 组装与上下文摘要从主服务下沉

验收：

1. `react-engine.service.ts` 聚焦主循环。
2. prompt 输出一致性通过相关测试验证。

### 4.12 Batch R12：拆分 react-engine 恢复策略

目标：

1. 新建 `react-engine/recovery/error-recovery-policy.ts`
2. 下沉错误恢复策略与异常决策逻辑

验收：

1. ReAct 主循环不再内联恢复策略实现。
2. 工具失败与 fallback 路径行为不变。

### 4.13 Batch R13：`step-runner/browser/` 子目录化

前置条件：

1. `execution.service.ts` 拆分基本完成。
2. Browser 专属执行职责边界稳定。

目标：

1. 将 Browser 专属执行逻辑迁入 `step-runner/browser/`

建议文件：

1. `browser-phase.executor.ts`
2. `browser-phase.types.ts`
3. `browser-execution-constants.ts`
4. `browser-loop-workflow-plan.builder.ts`
5. `execution-browser-orchestration.service.ts`

验收：

1. 通用执行逻辑与 Browser 专属逻辑隔离。
2. 未来可预留 `workflow/` 子目录。

### 4.14 Batch R14：拆分 `execution-plan-normalization.service.ts`

目标：

1. 新建 `step-runner/normalization/`
2. 下沉归一化规则与输入桥接

建议文件：

1. `execution-plan-rule-normalizer.ts`
2. `execution-plan-input-bridge.ts`

验收：

1. `execution-plan-normalization.service.ts` 仅保留总入口编排。
2. 不破坏 human-control 与 execution planning 链路。

---

## 5. 首轮推荐执行顺序

建议的首轮顺序如下：

1. Batch R1
2. Batch R4
3. Batch R5

其中 `Batch R1` 的详细任务设计见：

- [Enterprise-Skill-Platform_Orchestration-Batch-R1-Execution-Query-Refactor-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R1-Execution-Query-Refactor-Plan_v4.0.md)

其中 `Batch R4` 的详细任务设计见：

- [Enterprise-Skill-Platform_Orchestration-Batch-R4-Execution-Module-Export-Convergence-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R4-Execution-Module-Export-Convergence-Plan_v4.0.md)

其中 `Batch R5` 的详细任务设计见：

- [Enterprise-Skill-Platform_Orchestration-Batch-R5-Browser-Submodule-Gateway-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R5-Browser-Submodule-Gateway-Plan_v4.0.md)

其中 `Batch R6` 的详细任务设计见：

- [Enterprise-Skill-Platform_Orchestration-Batch-R6-Recorder-Debug-Session-Facade-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R6-Recorder-Debug-Session-Facade-Plan_v4.0.md)

其中 `Batch R7` 的详细任务设计见：

- [Enterprise-Skill-Platform_Orchestration-Batch-R7-Recorder-Debug-Facade-Slimming-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R7-Recorder-Debug-Facade-Slimming-Plan_v4.0.md)

其中 `Batch R8` 的详细任务设计见：

- [Enterprise-Skill-Platform_Orchestration-Batch-R8-Planner-Skill-Read-Path-Refactor-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R8-Planner-Skill-Read-Path-Refactor-Plan_v4.0.md)

其中 `Batch R9` 的详细任务设计见：

- [Enterprise-Skill-Platform_Orchestration-Batch-R9-Planner-Plan-Generation-Refactor-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R9-Planner-Plan-Generation-Refactor-Plan_v4.0.md)

其中 `Batch R10` 的详细任务设计见：

- [Enterprise-Skill-Platform_Orchestration-Batch-R10-Planner-Param-Recognition-Refactor-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R10-Planner-Param-Recognition-Refactor-Plan_v4.0.md)

原因：

1. `R1` 收益最大，且和最近 execution detail 的真实运行时问题直接相关。
2. `R4` 可以尽早建立模块封装边界，防止继续外泄内部实现。
3. `R5` 风险低、收益稳定，适合作为快速收口项。

不建议首轮立即并行启动：

1. `planner.service.ts`
2. `react-engine.service.ts`
3. `step-runner/browser/` 子目录化

原因：

这些项同时开工会导致 review 范围过大、运行时回归定位困难。

---

## 6. 任务卡模板

每个批次的任务单建议包含以下字段：

| 字段 | 说明 |
| :--- | :--- |
| 批次编号 | 例如 `Batch R1` |
| 目标文件 | 本轮要修改/新增的核心文件 |
| 目标职责 | 本轮要下沉或收敛的职责 |
| 非目标 | 本轮明确不做的内容 |
| 回归验证 | `typecheck`、测试、smoke、运行时验证 |
| 风险点 | 本轮最容易引入回归的位置 |
| 回滚点 | 对应 commit / PR / patch |

---

## 7. 验收矩阵

| 批次 | 编译 | 测试 | 运行时 | 结构审计 |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `control-plane` `typecheck` | execution query 相关测试 | execution detail live 验证 | 不新增循环依赖 |
| R2 | `control-plane` `typecheck` | execution lifecycle 相关测试 | create/start/resume live 验证 | `execution.service.ts` 行数下降 |
| R3 | `control-plane` `typecheck` | execution event/stream 测试 | SSE live 验证 | stream 逻辑从主服务下沉 |
| R4 | `control-plane` `typecheck` | 外部消费点测试 | 可选 smoke | `exports` 白名单成立 |
| R5 | `ai-orchestrator` `typecheck` | browser execute / loop / export 测试 | 可选 smoke | import 收敛到网关 |
| R6-R7 | `ai-orchestrator` `typecheck` | recorder-debug 相关测试 | recorder live 验证 | `RecorderDebugService` 明显瘦身 |
| R8-R10 | `ai-orchestrator` `typecheck` | planner 相关测试 | planner task smoke | `planner.service.ts` 明显瘦身 |
| R11-R12 | `ai-orchestrator` `typecheck` | react-engine 相关测试 | AI/task smoke | `react-engine.service.ts` 明显瘦身 |
| R13-R14 | `control-plane` `typecheck` | step-runner/planning 测试 | browser/workflow/document smoke | 无新增循环依赖 |

---

## 8. 风险提示

1. 不要把“行数下降”当成唯一目标，职责边界清晰比文件变小更重要。
2. 不要在同一批次同时改 API 契约、目录结构和领域职责。
3. `ExecutionModule exports` 收缩前，必须先做外部消费点审计。
4. `RecorderDebugService` 的瘦身应保持 Facade 模式，不建议让 Controller 直接编排多个子服务。

---

## 9. 结论

本 backlog 的核心思路是：

1. 先拆 `execution.service.ts`
2. 再收敛 `ExecutionModule` 边界
3. 再补 `browser` 子目录网关
4. 最后逐步处理 `RecorderDebugService`、`planner.service.ts`、`react-engine.service.ts`

这样可以把“结构治理”从一次性大重构，转成多批次、可验证、可回滚的渐进式重建。
