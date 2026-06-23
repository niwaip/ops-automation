# 企业级技能平台 编排层重建 Batch R4 详细方案

**Enterprise-Skill-Platform Orchestration Batch R4 Execution Module Export Convergence Plan v4.0**  
日期：2026-06-22

---

## 1. 任务目标

`Batch R4` 的目标是收敛 `control-plane` 中 `ExecutionModule` 的对外导出边界，建立“稳定导出白名单”，避免内部实现服务继续向模块外泄漏。

当前 [execution.module.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/control-plane/src/modules/execution/execution.module.ts) 中：

1. `providers` 与 `exports` 基本完全一致
2. `adapters / state / step-runner / human-control / recovery` 下的大量内部 service 都被对外导出
3. 外部模块无法区分哪些是稳定 API，哪些只是模块内部实现

本批次的目标不是“导出越少越好”，而是“只导出真正稳定且已被外部消费的边界”。

---

## 2. 当前现状

### 2.1 当前问题

`ExecutionModule` 当前直接导出以下内部实现类别：

1. runtime adapters
2. browser phase executor
3. planning / flow runner / step executor
4. human-control 内部服务
5. state 层内部服务
6. registry / interpreter / factory

这会带来三个问题：

1. 外部模块可能直接注入内部实现，破坏封装边界
2. 后续重构内部目录或 service 名称时，外部模块容易大面积受影响
3. `execution/index.ts` 虽已建立，但模块级导出边界并没有真正收敛

### 2.2 当前已确认的外部消费面

根据当前源码扫描，已经确认的跨模块消费主要包括：

1. [mcp.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/control-plane/src/modules/mcp/mcp.service.ts)
   - 依赖 `ExecutionService`
   - 同时从 `../execution` 稳定入口消费 DTO
2. [notification.service.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/control-plane/src/modules/notifications/notification.service.ts)
   - 依赖 `ExecutionService`
3. [mcp.module.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/control-plane/src/modules/mcp/mcp.module.ts)
   - 依赖 `ExecutionModule`
4. [notification.module.ts](file:///Users/chain/Documents/MyProject/ops-automation/apps/backend/orchestration/control-plane/src/modules/notifications/notification.module.ts)
   - 依赖 `ExecutionModule`

当前没有发现其他模块显式跨模块注入 `ExecutionApprovalService`、`ExecutionPlanningService`、`RuntimeAdapterRegistry` 等内部实现。

### 2.3 当前存在的边界瑕疵

虽然 `mcp.service.ts` 已开始从 `../execution` 入口消费 DTO，但当前仍存在直接深链路导入：

1. `import { ExecutionService } from '../execution/execution.service';`

这意味着：

1. 模块导出边界没有完全收敛
2. 稳定入口虽然存在，但尚未成为唯一消费方式

因此，`Batch R4` 除了收缩 `ExecutionModule exports`，还应同步收敛外部 import 路径。

---

## 3. 本批次范围

### 3.1 纳入范围

1. `ExecutionModule exports` 白名单设计
2. 外部模块消费点审计
3. 外部模块 import 收敛到稳定入口
4. 模块导出最小化验证

### 3.2 不纳入范围

1. `execution.service.ts` 内部职责拆分
2. lifecycle/query/stream 新服务创建
3. `execution/index.ts` 大范围重写
4. `execution` 内部 providers 重新分组

说明：

本批次只解决“导出边界”问题，不与职责拆分混做。

---

## 4. 目标状态

### 4.1 目标原则

`ExecutionModule` 的 `exports` 应只保留：

1. 明确对外的 Facade
2. 明确需要被外部模块订阅或调用的稳定服务

默认不应导出：

1. `builder`
2. `mapper`
3. `policy`
4. `normalizer`
5. `registry`
6. `factory`
7. `step-runner` 内部 orchestration service
8. `human-control` 内部 service
9. `recovery` 内部 service
10. 各类 runtime adapter

### 4.2 首轮建议白名单

首轮建议 `ExecutionModule` 只保留以下导出：

```ts
exports: [
  ExecutionService,
  ExecutionEventService,
]
```

说明：

1. `ExecutionService` 是当前主要稳定 Facade
2. `ExecutionEventService` 如确有跨模块流式订阅或事件消费需求，可保留

若后续发现个别 service 的确需要跨模块注入，应进入白名单而不是默认全量导出。

### 4.3 外部消费路径目标

外部模块应优先通过以下两种方式消费：

1. 注入 `ExecutionService`
2. 从 `../execution` 稳定入口导入 DTO / 类型

不应继续出现：

1. `../execution/execution.service`
2. `../execution/state/...`
3. `../execution/step-runner/...`
4. `../execution/adapters/...`

---

## 5. 建议实施步骤

### Step 1：建立外部消费审计清单

建议先生成一份清单：

| 外部模块 | 消费对象 | 导入路径 | 是否稳定入口 | 是否必须保留 |
| :--- | :--- | :--- | :--- | :--- |

当前已知首批记录：

| 外部模块 | 消费对象 | 导入路径 | 是否稳定入口 | 是否必须保留 |
| :--- | :--- | :--- | :--- | :--- |
| `mcp.service.ts` | `ExecutionService` | `../execution/execution.service` | 否 | 是 |
| `mcp.service.ts` | DTO | `../execution` | 是 | 是 |
| `notification.service.ts` | `ExecutionService` | `../execution/execution.service` | 否 | 是 |

### Step 2：先收敛 import 路径

在收缩 `exports` 之前，先把外部深链路导入改为稳定入口。

例如：

```ts
import { ExecutionService } from '../execution';
```

而不是：

```ts
import { ExecutionService } from '../execution/execution.service';
```

原因：

先把消费路径统一，再收 exports，回归更可控。

### Step 3：收缩 `ExecutionModule exports`

先做一轮保守收缩：

1. 保留 `ExecutionService`
2. 保留 `ExecutionEventService`
3. 移除其余内部实现导出

### Step 4：编译和模块注入验证

重点验证：

1. `McpModule`
2. `NotificationModule`
3. 任何依赖 `ExecutionModule` 的模块启动是否正常

### Step 5：记录白名单结果

将最终保留的导出对象写入设计文档或 backlog，作为后续治理的基线，避免再次回到“谁要用就直接 export”的状态。

---

## 6. 验收标准

### 6.1 结构验收

1. `execution.module.ts` 的 `exports` 明显收缩
2. 外部模块不再从 `execution.service.ts` 深链路导入
3. 未新增新的跨层导入

### 6.2 编译验收

1. `npm --prefix apps/backend/orchestration/control-plane run typecheck` 通过

### 6.3 测试验收

至少验证以下范围：

1. `mcp` 相关测试
2. `notification` 相关测试，如存在
3. execution 相关核心测试

### 6.4 启动验收

至少验证以下运行时行为：

1. `control-plane` 服务启动成功
2. `mcp` 路径不因注入失败报错
3. `notification` 路径不因注入失败报错

---

## 7. 风险点

### 7.1 最大风险

1. 某些外部模块隐式依赖了当前全量导出，收缩后才暴露出问题
2. 仅靠 grep 未覆盖动态模块装配或测试专用注入路径
3. import 路径虽然改成稳定入口，但 `index.ts` 未完整导出所需对象

### 7.2 控制策略

1. 先统一 import 路径，再收缩 exports
2. 先做“保守白名单”，不要一步压缩到最小理论值
3. 收缩后立即跑 `typecheck` 和模块启动验证
4. 如发现新外部消费点，必须记录进白名单，而不是重新放开全量 exports

---

## 8. 回滚策略

若本批次引入注入失败或模块启动失败，按以下顺序回滚：

1. 先恢复 `ExecutionModule exports`
2. 保留外部模块改成稳定入口的 import 路径
3. 待补齐消费点审计后，再重新做一轮收缩

推荐回滚粒度：

1. `ExecutionModule exports` 收缩单独一个 commit
2. 外部 import 路径收敛单独一个 commit，或与本批次一起但保持 patch 清晰

---

## 9. 建议的首轮 PR 范围

首轮 PR 建议只包含：

1. 更新 `mcp.service.ts` 的 `ExecutionService` 导入路径
2. 更新 `notification.service.ts` 的 `ExecutionService` 导入路径
3. 收缩 `execution.module.ts` 的 `exports`
4. 跑 `typecheck` 与基础模块验证

首轮 PR 不建议包含：

1. `execution.service.ts` 职责拆分
2. `execution/index.ts` 大范围整理
3. 其他模块同时做导出边界收缩

---

## 10. 结论

`Batch R4` 的核心价值是把 `ExecutionModule` 从“内部实现全量外露”的状态，收敛为“只暴露稳定边界”的模块。

它虽然不像 `R1` 那样直接降低超大文件体量，但它会为后续所有 `execution` 内部重构提供保护层：

1. 内部 service 可以更安全地移动和重命名
2. 外部模块不再直接绑定内部实现
3. `execution/index.ts` 才能真正成为稳定入口

如果 `R4` 做稳，后续 `R2/R3/R13/R14` 的重构成本都会明显下降。
