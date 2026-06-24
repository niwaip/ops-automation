# 企业级技能平台 编排层重建 Batch R1 详细方案

**Enterprise-Skill-Platform Orchestration Batch R1 Execution Query Refactor Plan v4.0**  
日期：2026-06-22

---

## 1. 任务目标

`Batch R1` 的目标是从 `control-plane` 的 [execution.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/control-plane/src/modules/execution/execution.service.ts) 中下沉“只读查询”职责，建立独立的 execution 查询服务，同时保持对外 API 与运行时行为不变。

本批次是整个编排层重建的第一刀，优先级最高，原因如下：

1. `execution.service.ts` 当前超过 `2000` 行，是编排层最主要的复杂度热点。
2. 查询读路径相对稳定，适合作为职责拆分的第一步。
3. 最近 execution detail 的真实运行时问题已经证明，execution 查询聚合是高价值治理点。

---

## 2. 本批次范围

### 2.1 纳入范围

1. execution 列表查询
2. execution 详情查询
3. execution phase 查询
4. 与上述查询直接相关的只读组装逻辑

### 2.2 不纳入范围

1. `create / start / cancel / resume / takeover`
2. SSE / execution stream
3. human-control 写路径
4. runtime adapter 路由
5. 执行计划生成和步骤执行写路径

说明：

本批次只做“读路径下沉”，不触碰生命周期写逻辑。

---

## 3. 目标结构

目标结构如下：

```text
apps/backend/orchestration/control-plane/src/modules/execution/
├── execution.service.ts
├── query/
│   └── execution-query.service.ts
├── state/
├── step-runner/
├── human-control/
├── adapters/
└── recovery/
```

职责边界：

1. `execution.service.ts`
   - 保留为对外 Facade
   - 接收 controller 请求并分发到领域服务
   - 不再直接承载大量只读查询拼装逻辑
2. `query/execution-query.service.ts`
   - 专门负责 execution 列表、详情、phase 查询
   - 只依赖只读所需服务，不依赖写路径 orchestration 逻辑

---

## 4. 建议下沉的职责

以下逻辑优先从 `execution.service.ts` 下沉：

### 4.1 execution 列表相关

建议下沉内容：

1. execution 列表读取
2. execution 列表筛选条件解析
3. execution 列表 DTO 映射
4. execution 列表附加统计字段组装

目标方法示意：

```ts
listExecutions(...)
```

### 4.2 execution 详情相关

建议下沉内容：

1. `getExecution(...)`
2. execution 主记录读取
3. phase / step / artifact 只读聚合
4. 详情返回 DTO 组装

重点：

execution detail 是本批次最关键的回归点。  
最近“内部 error”问题已证明，这一块既复杂又贴近真实运行时风险。

### 4.3 execution phase 查询相关

建议下沉内容：

1. `listExecutionPhases(...)`
2. phase 只读装配
3. phase artifact / step / takeover 结果拼装

注意：

底层 phase 数据查询能力仍应留在 `state/execution-phase.service.ts`。  
本批次只把“聚合 orchestration”从 `execution.service.ts` 下沉到 `execution-query.service.ts`。

---

## 5. 依赖设计

`execution-query.service.ts` 建议只依赖以下对象：

1. `PrismaService`
2. `ExecutionPhaseService`
3. `ExecutionStateService`
4. `ExecutionEventService`，如果仅读路径确实需要少量只读能力
5. `ExecutionMapper` / `execution.dto.ts` 中已有只读映射能力

不建议依赖：

1. `ExecutionFlowRunnerService`
2. `ExecutionStepExecutorService`
3. `ExecutionPlanningService`
4. `ExecutionHumanControlService`
5. `RuntimeExecutionOrchestrator`

原则：

只读查询服务不应反向依赖写路径 orchestration service。

---

## 6. 建议实施步骤

### Step 1：识别读路径 public 方法

从 [execution.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/control-plane/src/modules/execution/execution.service.ts) 中先识别所有“只读 public 方法”，建立迁移清单。

建议输出清单字段：

| 方法名 | 当前职责 | 是否直接暴露给 Controller | 是否读取 phases | 风险等级 |
| :--- | :--- | :--- | :--- | :--- |

### Step 2：创建 `execution-query.service.ts`

先创建空骨架：

```ts
@Injectable()
export class ExecutionQueryService {}
```

先完成依赖注入和模块注册，不立即迁移所有逻辑。

### Step 3：优先迁移 execution detail

建议先迁移最关键的 detail 读路径，而不是先迁移列表。

原因：

1. detail 聚合最复杂，收益最高。
2. 可以优先覆盖最近出现过真实问题的路径。
3. 迁完后最容易用 live execution 直接验证。

### Step 4：迁移 phase 查询

迁移完成 detail 之后，再迁移 phase 查询聚合。

### Step 5：迁移列表查询

列表查询通常复杂度低于 detail，可以最后收口。

### Step 6：把 `execution.service.ts` 改为委托

最终状态：

```ts
return this.executionQueryService.getExecution(...)
return this.executionQueryService.listExecutionPhases(...)
return this.executionQueryService.listExecutions(...)
```

---

## 7. 验收标准

### 7.1 代码结构验收

1. 新增 `query/execution-query.service.ts`
2. `execution.service.ts` 中查询类方法改为委托
3. 不引入新的跨层反向依赖

### 7.2 编译验收

1. `npm --prefix apps/backend/orchestration/control-plane run typecheck` 通过

### 7.3 测试验收

至少覆盖以下内容：

1. execution detail 相关测试
2. execution phase 查询相关测试
3. execution mapper / dto 相关测试
4. 与 execution detail 紧密相关的 artifact 展示测试

### 7.4 运行时验收

至少完成以下 live 验证：

1. `GET /api/executions`
2. `GET /api/executions/:id`
3. `GET /api/executions/:id/phases`
4. portal execution detail 页真实访问

推荐使用至少一条真实 execution 做回归：

1. browser execution
2. workflow execution
3. document execution

如果环境不足，至少验证 browser execution。

---

## 8. 风险点

### 8.1 最大风险

1. 下沉过程中把 DTO 组装和权限校验一并搬错位置
2. 把本应留在 `state/` 的底层查询实现重复复制到 `query/`
3. 因为 detail / phases 聚合逻辑改动，导致 portal 执行详情页回归

### 8.2 控制策略

1. 权限校验仍优先保留在 Facade 或明确边界处，不要在多处散落复制
2. `query/` 只做读路径编排，不重复实现底层 phase 查询
3. 每迁移一个 public 方法就跑一次针对性测试
4. 在批次结束前做一次 live execution detail 验证

---

## 9. 回滚策略

若本批次引入回归，回滚顺序如下：

1. 回滚 `execution.service.ts` 中对 `ExecutionQueryService` 的委托修改
2. 暂时保留 `execution-query.service.ts` 空骨架或直接回滚整个批次
3. 恢复到“所有查询仍在 `execution.service.ts`”的状态

推荐做法：

1. `Batch R1` 使用单独 commit
2. 不与 `R2/R3/R4` 混做

---

## 10. 建议的首轮 PR 范围

首轮 PR 只建议包含：

1. 新建 `query/execution-query.service.ts`
2. 迁移 `getExecution(...)`
3. 迁移 `listExecutionPhases(...)`
4. 更新 `execution.module.ts`
5. 更新相关测试

首轮 PR 不建议同时包含：

1. execution 列表查询
2. lifecycle 写路径
3. stream/SSE
4. `ExecutionModule exports` 收缩

原因：

首轮先把最复杂、最能证明收益的 detail 读路径做稳，再继续推进更合适。

---

## 11. 结论

`Batch R1` 的核心价值不只是“把方法挪出去”，而是建立一个明确的演进方向：

1. `execution.service.ts` 只保留 Facade
2. execution 读路径拥有独立职责边界
3. execution detail 的复杂聚合不再继续堆积在单个超大文件中

如果 `R1` 执行顺利，后续 `R2` 和 `R3` 将更容易落地，整个 `execution` 模块也会从“目录已经拆了，但逻辑仍在大文件里”真正进入职责分层阶段。
