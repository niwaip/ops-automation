# 企业级 Skill 平台 `v4` Story Breakdown

**Story Breakdown v4.0**  
日期：2026-05-01

> 本文将 `v4 Development Backlog` 进一步拆解为可认领的 Story。Story 关注于如何实现 `v4` 的稳定契约和边界收敛。

---

## 1. Story 拆解原则

- **契约先行**：每个 Story 的第一步通常是 DTO 和接口定义的调整。
- **渐进式迁移**：支持新旧协议并存，通过 Adapter 模式完成切换。
- **可验证性**：每个 Story 必须有明确的验收标准 (AC)。

---

## 2. P0: 契约冻结与基础对齐

### `V4-P0-01` 核心 DTO 统一重构

- **目标**：在全服务范围内对齐 `ExecutionDto`、`ExecutionStepDto`、`SkillConfigDto`。
- **验收标准**：
  - 替换 `control-plane`、`auth`、`ai-orchestrator` 中的旧 DTO 定义。
  - 编译通过，基本查询功能保持正常。

### `V4-P0-02` 标准错误码体系落地

- **目标**：定义并导出跨服务的标准错误码枚举（Execution, Skill, Runtime, Auth）。
- **验收标准**：
  - 核心 Controller 返回的错误响应包含结构化的 `errorCode`。

---

## 3. P1: 控制面收敛与职责清理

### `V4-P1-01` Execution 状态写权限收敛

- **目标**：禁止 `ai-orchestrator` 和其他服务直接操作数据库修改 Execution 状态。
- **验收标准**：
  - 移除 `ai-orchestrator` 中所有对 `PrismaService.execution` 的写操作。
  - 所有状态跳转通过调用 `control-plane` 的内部 API 或事件完成。

### `V4-P1-02` Planner 纯净化改造

- **目标**：将 `ai-orchestrator` 改造为无状态的“计划生成器”。
- **验收标准**：
  - `POST /plans:generate` 接口返回符合 `v4` 规范的 `PlanDraft`。
  - 移除 Planner 内部的“执行驱动”逻辑。

### `V4-P1-03` Portal 北向接口切换

- **目标**：Portal 详情页改走 `control-plane` 的 `v4` API。
- **验收标准**：
  - 详情页展示的数据完全来自 `ExecutionDto` 及其关联的 `ExecutionStepDto`。

---

## 4. P2: Runtime 协议标准化 (南向)

### `V4-P2-01` 统一 Runtime Adapter 抽象

- **目标**：在 `control-plane` 中引入 `RuntimeAdapter` 抽象层。
- **验收标准**：
  - 定义 `RuntimeAdapter` 接口，包含 `invokeStep`, `freeze`, `resume`, `close` 等方法。

### `V4-P2-02` Browser Runtime 对齐协议

- **目标**：改造 `browser-worker` 使其接口符合 `RuntimeStepInvokeRequest/Result`。
- **验收标准**：
  - 成功执行一个浏览器步骤并返回标准化的 `output`、`artifacts` 和 `takeoverHint`。

### `V4-P2-03` Document/Workflow Runtime 适配

- **目标**：为 `carbone-engine` 和 `temporal-worker` 编写 `v4` 适配器。
- **验收标准**：
  - 文档渲染和工作流运行的结果能被 `control-plane` 以标准方式回写至 Step。

---

## 5. P3-P4: 逻辑隔离与部署演进

### `V4-P3-01` Auth 服务逻辑域拆分

- **目标**：在 `auth` 服务内部完成 `Identity` 和 `Registry` 模块的代码隔离。
- **验收标准**：
  - `skill` 模块不直接依赖 `user` 模块的非必要业务逻辑。

### `V4-P4-01` Compose 分层文件实现

- **目标**：创建 `docker-compose.core.yml`、`docker-compose.runtime.yml` 等分层文件。
- **验收标准**：
  - 执行 `./docker/start-smart.sh docker-compose.core.yml up` 能成功启动最小核心。

---

## 6. 联调与 Gate 验收

- **Gate 1 (P0+P1)**: 核心 DTO 统一，Planner 职责收敛，控制面主写入口唯一。
- **Gate 2 (P2)**: 至少 Browser Runtime 完成协议对齐，全链路跑通。
- **Gate 3 (P3+P4)**: 逻辑拆分完成，可分层启动，外部接入文档就绪。

---

## 7. 一句话总结

> 每一个 Story 都是在为系统的“确定性”加砖盖瓦，最终实现架构模型与代码实现的完全对齐。
