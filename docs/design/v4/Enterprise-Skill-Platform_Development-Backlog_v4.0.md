# 企业级 Skill 平台 `v4` 开发 Backlog

**Development Backlog v4.0**  
日期：2026-05-01

> 本文将 `v4 迁移实施方案` 进一步下沉为可排期、可指派、可验收的开发 backlog。目标是确保系统在不破坏现有能力的前提下，平滑演进到 `v4` 目标架构。

---

## 1. Backlog 目标

当前 backlog 围绕以下核心目标展开：

- **契约冻结**：统一四类核心契约（Execution, Skill, Runtime, Tool）。
- **职责收敛**：明确 `control-plane`、`auth` (Registry)、`ai-orchestrator` (Planner) 的边界。
- **协议统一**：所有运行时（Browser, Document, Workflow）对齐统一南向协议。
- **分层部署**：实现按架构分层启动。

---

## 2. 优先级与阶段 (按 Migration Plan v4.0)

### P0: 契约冻结与基石准备
- 不完成此阶段，后续开发将继续处于职责模糊状态。

### P1: 控制面收敛
- 解决“多点写状态”问题，确立 `control-plane` 的唯一权威性。

### P2: Runtime 协议统一
- 外部能力接入的先决条件，完成南向接口标准化。

### P3-P5: 逻辑拆分、部署分层与开放接入
- 属于架构演进与生态开放阶段。

---

## 3. 服务级 Backlog

## 3.1 `control-plane` (Execution Core)

### P0: 契约对齐
- [ ] 按照 `API Contract Spec v4.0` 调整 `ExecutionDto` 结构。
- [ ] 按照 `API Contract Spec v4.0` 调整 `ExecutionStepDto` 结构。
- [ ] 引入标准错误码枚举。

### P1: 状态机收敛
- [ ] 确保 `Execution.status` 变更逻辑全部收敛至 `ExecutionService`。
- [ ] 实现统一的 `ExecutionEvent` 记录，涵盖所有关键状态机跳转。
- [ ] 对接 `session-broker` 的标准资源分配接口。

### P2: Runtime Adapter 引入
- [ ] 实现内部 `RuntimeAdapter` 接口，解耦具体 Runtime 私有协议。
- [ ] 实现 `BrowserRuntimeAdapter` 适配层。
- [ ] 实现 `DocumentRuntimeAdapter` (Carbone) 适配层。

---

## 3.2 `auth` (Skill Registry & Release)

### P0: 契约与术语对齐
- [ ] 统一 `Skill`、`ToolCatalog`、`PublishedSkillRuntimeContext` 的 DTO。
- [ ] 在代码注释和 API 文档中明确 `Skill Registry` 职责。

### P1: 发布链收敛
- [ ] 确保所有 Skill（包括手动定义、Temporal 转换、外部接入）都经过统一的 `publish` 流程。
- [ ] 实现 `CapabilitySnapshot` 逻辑，确保运行态 Context 的不可变性。

### P3: 逻辑域隔离
- [ ] 将 `identity` (身份鉴权) 与 `skill` (治理发布) 划分为独立的模块/文件夹。
- [ ] 减少 `control-plane` 对身份逻辑的直接穿透。

---

## 3.3 `ai-orchestrator` (Planner Facade)

### P0: 职责退缩
- [ ] 移除所有直接修改 `Execution` 状态的代码。
- [ ] 明确其仅作为“结构化计划生成器”和“结果验证器”。

### P1: 结构化输出增强
- [ ] 按照 `v4` 契约优化 `plans:generate` 输出。
- [ ] 增加 `RiskSummary` 与 `PolicyHint` 输出，供控制面决策。

---

## 3.4 `session-broker` & `runtime-workers`

### P2: 协议统一 (重点)
- [ ] **`session-broker`**: 对齐 `RuntimeSession` 状态机与 `v4` 资源管理语义。
- [ ] **`browser-worker`**: 升级 `execute-step` 接口以对齐 `RuntimeStepInvokeRequest/Result`。
- [ ] **`carbone-engine`**: 封装为标准 `DocumentRuntime`，对齐产物 (Artifact) 协议。
- [ ] **`temporal-worker`**: 封装为标准 `WorkflowRuntime`，统一长流程回写协议。

---

## 3.5 `portal` (Experience Layer)

### P1: 接口切换
- [ ] 核心查询页（Execution 列表/详情）全面切到 `control-plane` 的 `v4` API。
- [ ] 治理页（Skill/Tool 管理）切到 `auth` 的 Registry 正式 API。

### P2: 协议呈现
- [ ] 时间线视图支持展示 `v4` 标准化的 `ArtifactRef` 和 `SnapshotRef`。
- [ ] 接管工作台对齐 `v4` 的 `takeover` 语义。

---

## 4. 依赖顺序与开发节奏

1. **第 1 阶段 (P0)**: DTO 与错误码在全服务范围内的重命名与对齐。
2. **第 2 阶段 (P1)**: `control-plane` 状态机收敛 + `ai-orchestrator` 职责剥离。
3. **第 3 阶段 (P2)**: Runtime 协议统一（最重的工作量，建议先拿 Browser 开刀）。
4. **第 4 阶段 (P3-P4)**: `auth` 逻辑拆分与 `docker compose` 部署分层。

---

## 5. 验收门槛 (Definition of Done)

- [ ] **代码层面**: 无跨层直接写状态（如 Planner 写 Execution 状态）。
- [ ] **接口层面**: 所有 Runtime 的 Step 返回值符合统一 DTO。
- [ ] **部署层面**: 可以仅启动 `core` 组而不崩溃，且能通过 mock runtime 完成冒烟测试。
- [ ] **文档层面**: API 文档与 `API Contract Spec v4.0` 100% 吻合。

---

## 6. 一句话总结

> `v4` Backlog 的核心在于“收敛”与“标准化”，为后续外部能力的“大规模接入”扫清架构障碍。
