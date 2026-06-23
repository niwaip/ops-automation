# 企业级技能平台 编排层重建设计书

**Enterprise-Skill-Platform Orchestration Reconstruction Blueprint v4.0**  
日期：2026-06-22

---

## 1. 文档目标

本文档用于定义 `apps/backend/orchestration/ai-orchestrator` 与 `apps/backend/orchestration/control-plane` 的下一阶段重建设计。  
目标不是再次做一轮大范围目录搬移，而是在当前目录重构已经基本落地的前提下，继续解决以下三个结构性问题：

1. 超大文件仍然承担过多职责，违反单一职责边界。
2. 模块导出边界过宽，外部模块能够直接依赖内部实现细节。
3. 某些目录已经分层，但仍缺少稳定网关与后续扩展约束，未来容易再次回退到平铺和耦合状态。

本文档是后续重构实施、评审、验收和回滚的依据。

---

## 2. 当前状态判断

截至 `2026-06-22`，编排层已经完成一轮关键目录重构，以下结论成立：

### 2.1 已完成的结构收益

1. `browser/intent` 已完成 `profiles/`、`atomic-parsers/`、`ai-planner/` 三层拆分。
2. `browser/intent/index.ts` 已建立为稳定公开入口。
3. `control-plane/execution` 已完成 `adapters/`、`state/`、`step-runner/`、`human-control/`、`recovery/` 分层。
4. `control-plane/execution/index.ts` 已建立为稳定公开入口。
5. `workflow` 与文档生成能力已纳入 `execution/` 新分层，不再停留在旧的平行编排目录。
6. 已完成一轮 `madge` 循环依赖治理，当前源码范围内循环依赖已清零。

### 2.2 仍然存在的核心风险

1. 大文件问题仍然突出：
   - `browser/execute/recorder-debug.service.ts`
   - `planner/planner.service.ts`
   - `react-engine/react-engine.service.ts`
   - `execution/execution.service.ts`
   - `execution/step-runner/execution-plan-normalization.service.ts`
2. `ExecutionModule` 当前 `providers` 与 `exports` 近乎完全重复，模块封装性不足。
3. `browser/observe`、`browser/loop`、`browser/export`、`browser/session` 尚未建立目录级公开网关。
4. `step-runner/` 仍然混合“通用执行逻辑”和“Browser 专属执行逻辑”，未来对 `workflow` / `document` 的进一步扩展不够友好。

### 2.3 设计判断

本阶段不应再以“物理目录搬移”为主要目标，而应切换到：

1. 服务职责下沉。
2. 导出边界收敛。
3. 稳定网关补齐。
4. 面向未来能力扩展的目录治理。

---

## 3. 设计原则

### 3.1 最小必要重构

只做能够显著降低复杂度、并且可验证收益的重构。  
不再进行“为了目录更整齐而继续搬文件”的低收益调整。

### 3.2 先职责拆分，再目录细化

若某文件的问题本质是“职责过载”，优先做服务拆分。  
只有当职责边界已经清晰时，才继续细化目录结构。

### 3.3 保持稳定入口

模块外部必须优先通过根级稳定入口引用能力：

1. `browser/intent/index.ts`
2. `execution/index.ts`
3. 后续新增的目录级 `index.ts`

不得允许新的深链路依赖重新扩散。

### 3.4 导出最小化

Nest 模块的 `exports` 只暴露稳定 Facade 或明确需要跨模块消费的服务。  
内部编排服务、mapper、policy、normalizer、builder 不应默认对外导出。

### 3.5 面向运行时回归验证

所有重构都必须能通过以下方式证明未回归：

1. `typecheck`
2. 目标测试集
3. 必要时的端到端 smoke
4. 针对真实 execution / workflow / document 链路的运行时验证

---

## 4. 重建范围

本次重建设计只覆盖以下两个服务域：

1. `apps/backend/orchestration/ai-orchestrator`
2. `apps/backend/orchestration/control-plane`

不纳入本轮重建的范围：

1. 业务协议改造
2. 数据模型重做
3. API 契约大改
4. Docker 部署结构调整
5. Portal 页面重构

---

## 5. ai-orchestrator 目标设计

### 5.1 `browser` 作为参考范式

`browser` 已经是当前仓库中最接近“按职责组织”的模块，后续设计应继续沿用以下模式：

1. `api/` 负责 HTTP 接入。
2. `intent/` 负责意图解析，并通过 `index.ts` 提供稳定入口。
3. `execute/` 负责执行编排。
4. `observe/` 负责快照和观察。
5. `loop/` 负责循环与中断控制。
6. `export/` 负责导出与模板组装。
7. `session/` 负责会话状态。
8. `recovery/` 负责异常恢复。

这一模式应作为其他超大模块拆分时的参考。

### 5.2 `RecorderDebugService` 重建目标

当前问题：

1. 文件超过 `1100` 行。
2. 具备 Facade 性质，但仍承担过多实际业务逻辑。
3. 构造函数依赖过多，说明职责边界尚未完全沉降。

目标状态：

```text
browser/execute/
├── recorder-debug.service.ts                # 总入口 Facade，保留
├── recorder-debug-execution.service.ts      # 执行控制
├── recorder-debug-chat-flow.service.ts      # 对话流编排
├── recorder-debug-response.service.ts       # 响应格式化
├── recorder-debug-session.facade.ts         # 新增，会话 + 快照汇聚
├── browser-execution-controller.service.ts  # 浏览器执行控制
└── execution-reconcile.service.ts           # 执行结果协调
```

约束：

1. `recorder-debug.service.ts` 只保留 Facade 角色，目标控制在 `300` 行以内。
2. Controller 仍然只调用 Facade，不直接拼装多个底层服务。
3. 会话、快照、观察、人工介入状态聚合优先下沉到 `recorder-debug-session.facade.ts`。
4. 仅当某段逻辑具备稳定复用语义时，才抽为独立 service；避免为了拆文件而制造空壳 service。

### 5.3 `observe` / `loop` / `export` / `session` 网关补齐

当前问题：

1. 目录已形成职责分层，但外部依赖仍指向具体文件。
2. 文件重命名、移动或拆分时，外部 import 容易发生批量波动。

目标状态：

```text
browser/observe/index.ts
browser/loop/index.ts
browser/export/index.ts
browser/session/index.ts
```

规则：

1. 外部模块只能依赖子目录 `index.ts`。
2. 子目录内部文件允许继续使用相对路径互相引用。
3. 新增网关后，应同步把可收敛的跨目录 import 改到目录网关。

### 5.4 `planner` 重建目标

当前问题：

1. `planner.service.ts` 超过 `2000` 行。
2. 技能匹配、计划生成、语义聚合、参数识别等职责混合。

目标结构：

```text
planner/
├── planner.service.ts
├── skill/
│   ├── skill-matcher.service.ts
│   └── skill-cache.service.ts
├── plan/
│   ├── plan-generator.service.ts
│   └── plan-semantic.service.ts
└── params/
    └── param-recognizer.service.ts
```

约束：

1. `planner.service.ts` 只保留顶层编排与公共入口。
2. 技能缓存、技能匹配、计划生成、参数识别分别独立下沉。
3. 首轮拆分优先做“读路径下沉”，避免与核心写路径同时变更。

### 5.5 `react-engine` 重建目标

当前问题：

1. `react-engine.service.ts` 超过 `1400` 行。
2. ReAct 主循环、prompt 构建、工具决策上下文、错误恢复逻辑混合。

目标结构：

```text
react-engine/
├── react-engine.service.ts
├── prompt/
│   ├── prompt-builder.ts
│   └── decision-context-summary.ts
├── tools/
├── recovery/
│   └── error-recovery-policy.ts
```

约束：

1. `react-engine.service.ts` 只保留主循环。
2. Prompt 拼装与上下文摘要下沉到 `prompt/`。
3. 错误恢复逻辑与工具决策逻辑不得继续内联膨胀到主服务中。

---

## 6. control-plane 目标设计

### 6.1 `execution.service.ts` 作为最高优先级治理对象

当前问题：

1. 文件超过 `2000` 行。
2. 同时承担生命周期、查询、SSE、人工干预路由、状态同步、运行时入口等职责。
3. 当前 `execution/` 虽已有子目录，但核心逻辑尚未充分下沉。

目标结构：

```text
execution/
├── execution.service.ts
├── lifecycle/
│   ├── execution-lifecycle.service.ts
│   └── execution-stream.service.ts
├── query/
│   └── execution-query.service.ts
├── adapters/
├── state/
├── step-runner/
├── human-control/
└── recovery/
```

职责定义：

1. `execution.service.ts`
   - 作为唯一公开入口 Facade
   - 负责对外 API 级路由分发
   - 不再直接承载大段业务流程
2. `execution-lifecycle.service.ts`
   - 负责 `create / start / cancel / resume / takeover`
3. `execution-stream.service.ts`
   - 负责 SSE 与执行事件对外流转
4. `execution-query.service.ts`
   - 负责 execution 列表、详情、phase 查询、只读聚合

说明：

优先按“外部 API 场景”拆，而不是先按纯技术主题拆。  
这样更贴近 `execution.controller.ts` 的接口边界，也更容易验证回归。

### 6.2 `ExecutionModule` 导出边界收敛

当前问题：

1. `providers` 与 `exports` 近乎完全一致。
2. 模块边界形同透明，外部模块可以直接消费内部实现。

目标策略：

1. 先盘点所有外部消费点。
2. 建立“稳定导出白名单”。
3. 逐步移除非必要的内部服务导出。

首轮建议保留导出的对象：

```ts
exports: [
  ExecutionService,
  ExecutionEventService,
]
```

如果存在必须跨模块直接消费的少数 Facade，可加入白名单；  
但以下类型默认不应导出：

1. `builder`
2. `mapper`
3. `policy`
4. `normalizer`
5. `registry`
6. `step-runner` 内部 orchestration service

### 6.3 `step-runner` 的 Browser 专属隔离

当前问题：

1. `step-runner/` 中通用逻辑与 Browser 专属逻辑混合。
2. 未来新增 `workflow` / `document` 专属执行时，目录会再次混乱。

目标结构：

```text
step-runner/
├── execution-flow-runner.service.ts
├── execution-step-executor.service.ts
├── runtime-execution.orchestrator.ts
├── browser/
│   ├── browser-phase.executor.ts
│   ├── browser-phase.types.ts
│   ├── browser-execution-constants.ts
│   ├── browser-loop-workflow-plan.builder.ts
│   └── execution-browser-orchestration.service.ts
└── workflow/   # 预留
```

注意：

此项不是当前最优先动作。  
只有当 `execution.service.ts` 的职责下沉完成，且 Browser 专属逻辑已经在语义上稳定后，再执行这一步，避免同时叠加“服务拆分 + 目录迁移”两种风险。

### 6.4 `execution-plan-normalization.service.ts` 治理

当前问题：

1. 文件接近 `1500` 行。
2. 参数解析、plan 归一化、执行输入桥接仍偏集中。

目标：

1. 优先拆出“纯归一化规则”和“人工输入解析桥接”。
2. 保持 `step-runner/` 中的执行路径可追踪，避免再向 `execution.service.ts` 反向堆积。

建议结构：

```text
step-runner/
├── execution-plan-normalization.service.ts
├── normalization/
│   ├── execution-plan-rule-normalizer.ts
│   └── execution-plan-input-bridge.ts
```

---

## 7. 实施优先级

### 7.1 P0

1. 拆分 `execution.service.ts`
2. 收敛 `ExecutionModule exports`

原因：

1. 影响面最大。
2. 是当前最主要的模块边界风险。
3. 对后续 `workflow` / `document` / `browser` 统一扩展影响最大。

### 7.2 P1

1. 为 `observe/`、`loop/`、`export/`、`session/` 增加 `index.ts`
2. 瘦身 `RecorderDebugService`
3. 拆分 `planner.service.ts`
4. 拆分 `react-engine.service.ts`

原因：

1. 收益明确，但不必与 `control-plane` 核心拆分并行推进。
2. 适合作为分批、渐进式治理项。

### 7.3 P2

1. `step-runner/browser/` 子目录化
2. `execution-plan-normalization.service.ts` 进一步分层

原因：

1. 更偏向扩展性优化。
2. 当前收益低于 `P0/P1`。

---

## 8. 分阶段实施策略

### 8.1 Phase A：边界收敛

目标：

1. 盘点 `ExecutionModule` 的外部依赖。
2. 收敛 `exports`。
3. 为 `browser` 子目录补齐 `index.ts` 网关。

验收：

1. 无新增深链路导入。
2. 所有模块编译通过。
3. 外部模块不再直接依赖明显内部服务。

### 8.2 Phase B：核心服务拆分

目标：

1. 拆 `execution.service.ts`
2. 拆 `RecorderDebugService`

验收：

1. 顶层 Facade 文件体量显著下降。
2. 关键 public API 行为保持不变。
3. 目标测试和 smoke 全部通过。

### 8.3 Phase C：超大模块治理

目标：

1. 拆 `planner.service.ts`
2. 拆 `react-engine.service.ts`
3. 拆 `execution-plan-normalization.service.ts`

验收：

1. 每个顶层主服务只承担编排职责。
2. 子服务职责边界清晰。
3. 无新增循环依赖。

### 8.4 Phase D：扩展性目录优化

目标：

1. `step-runner/browser/` 子目录化
2. 预留 `workflow/` 子目录

验收：

1. Browser 专属逻辑从通用步骤执行中隔离。
2. 未来新增 workflow / document 专属逻辑时不再需要继续污染平级目录。

---

## 9. 验收标准

每一阶段都必须同时满足以下标准：

1. `typecheck` 通过
2. 目标测试通过
3. `madge --circular` 无新增环路
4. 公开入口与模块导出边界符合设计
5. 若涉及运行时主链路，必须至少完成一轮端到端 smoke

附加结构标准：

1. 顶层 Facade 不再长期超过 `500` 行，特殊情况下需单独说明。
2. 新增目录必须有明确职责说明，禁止“先建目录、后找内容”。
3. 内部实现默认不向模块外导出。

---

## 10. 非目标

以下事项不属于本设计书的直接实施目标：

1. 重写 execution 协议
2. 改写前端页面结构
3. 修改 workflow / document 的业务语义
4. 大规模更换测试框架
5. 为了追求目录对称性而进行无收益搬移

---

## 11. 风险与控制

### 11.1 最大风险

1. 在同一轮改动中同时做“职责拆分 + 目录迁移 + 契约调整”，导致回归难以定位。
2. 导出边界收窄过快，破坏跨模块注入。
3. 为追求小文件，把强耦合逻辑机械拆散，反而增加跳转成本。

### 11.2 控制策略

1. 每阶段只做一类主要变更。
2. 先做消费面审计，再收窄 `exports`。
3. 对超大文件优先按“读写路径”和“对外 API 场景”拆分。
4. 每阶段都保留可独立回滚的提交边界。

---

## 12. 建议的首轮实施清单

首轮只做以下动作：

1. 盘点 `ExecutionModule` 外部消费点。
2. 生成 `ExecutionModule exports` 白名单。
3. 新增 `browser/observe/index.ts`
4. 新增 `browser/loop/index.ts`
5. 新增 `browser/export/index.ts`
6. 新增 `browser/session/index.ts`
7. 设计 `execution.service.ts` 的 `lifecycle/query/stream` 拆分边界，但首轮只下沉一类职责。

推荐首刀：

1. 先把 execution 查询读路径从 `execution.service.ts` 下沉到 `execution-query.service.ts`

原因：

1. 读路径相对稳定。
2. 回归范围可控。
3. 与最近 execution detail 真实问题定位高度相关，收益明确。

---

## 13. 结论

当前编排层已经完成“目录分层”第一阶段，但还没有完成“职责分层”第二阶段。  
下一阶段的重建重点应从“继续搬文件”转向“收敛 Facade、下沉业务职责、缩小导出边界”。

如果执行顺序合理，本次重建将带来以下长期收益：

1. 降低超大文件维护成本。
2. 建立真正稳定的模块边界。
3. 为 `browser`、`workflow`、`document` 三类能力的后续扩展提供一致的演化路径。
4. 降低未来再次发生“目录整齐但职责仍堆在单文件中”的反复重构成本。
