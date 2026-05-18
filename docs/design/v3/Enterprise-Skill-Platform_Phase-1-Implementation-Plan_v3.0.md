# 企业级 Skill 平台 Agent OS Phase 1 改造任务清单

**Phase 1 Implementation Plan v3.0**  
日期：2026-04-26

> 本文把 `Implementation Blueprint v3` 进一步拆成可分配、可排期、可验收的工作包。目标是让团队可以直接按服务推进第一阶段改造，而不是停留在概念层。

---

## 1. Phase 1 目标

Phase 1 只交付一个最小但正式的 Browser 闭环：

- Planner 产出结构化计划
- `Execution` 成为业务真相源
- `RuntimeSession` 成为资源真相源
- Browser step 执行统一接入 `control-plane`
- 人工接管和恢复打通
- 执行结束可归档、可复盘

### 1.1 MVP 收口原则

本阶段默认按 `MVP` 收口，而不是按“未来完整平台”收口：

- 只保证 Browser 主链正式可用
- 只保证最小对象、最小状态机、最小页面和最小接口
- 后续阶段需要的能力以接口预留为主，不在本阶段实做
- 任何不能直接支撑 Browser 闭环验收的需求，默认移出 `Phase 1`

### 1.2 `Phase 1` 的战略定位

`Phase 1` 不只是当前版本的交付范围，还承担两个后续责任：

- 为 `Phase 2` 提供统一 Policy 挂接点和多 Runtime 扩展点
- 为 `Phase 3/4` 提供可信的 Memory / Evaluation / Candidate Patch 输入

因此，`Phase 1` 的任务设计要遵循一个原则：

- 宁可把主对象、状态机和边界先做对，也不要提前塞入过多高级能力

---

## 2. 工作流拆分

建议拆成 6 条工作流：

- 数据模型与存储
- `control-plane`
- `ai-orchestrator`
- `session-broker`
- `browser-worker`
- `portal`

补充说明：

- `auth` 在 `Phase 1` 只做必要支撑，不单独拉出大工作流
- `policy / memory / evaluation` 只保留挂点和接口，不进入主实施面

---

## 3. 数据模型与存储

### 3.1 数据库任务

- 新增 `executions`
- 新增 `execution_steps`
- 新增 `runtime_sessions`
- 新增 `execution_events`
- 新增 `artifacts`
- 预留 `evaluations`
- 预留 `candidate_patches`

交付物：

- Prisma schema 变更
- migration 脚本
- 基础索引

验收：

- 能创建 `Execution`
- 能记录 step
- 能记录 runtime session
- 能查询事件和产物

MVP 约束：

- `artifacts` 只要求支持最小 screenshot / trace 引用
- `evaluations` / `candidate_patches` 优先保留 schema 或事件入口，不强制在本阶段落完整表和业务逻辑

### 3.2 Redis 任务

- 定义 runtime 高频 key
- 定义 freeze / resume key
- 定义 profile lock 规则

验收：

- 能稳定保存 step 指针和 runtime 状态

---

## 4. `control-plane` 工作包

### 4.1 `Execution` API

- `POST /executions`
- `GET /executions/{id}`
- `GET /executions/{id}/steps`
- `GET /executions/{id}/artifacts`
- `POST /executions/{id}/submit-input`
- `POST /executions/{id}/approve`
- `POST /executions/{id}/reject`
- `POST /executions/{id}/takeover`
- `POST /executions/{id}/release-human-control`
- `POST /executions/{id}/cancel`

MVP 优先级建议：

- P0 必做
  - `POST /executions`
  - `GET /executions/{id}`
  - `GET /executions/{id}/steps`
  - `POST /executions/{id}/submit-input`
  - `POST /executions/{id}/takeover`
  - `POST /executions/{id}/release-human-control`
- P1 条件做
  - `GET /executions/{id}/artifacts`
  - `POST /executions/{id}/approve`
  - `POST /executions/{id}/reject`
  - `POST /executions/{id}/cancel`

### 4.2 `Execution` 状态写入

- 收敛 `Execution.status` 主写入口
- 定义允许的状态迁移
- 写入 `ExecutionEvent`

### 4.3 `ExecutionStep` 管理

- 创建 step
- 更新 step 状态
- 挂接 snapshot / trace / output 引用

### 4.4 协调逻辑

- 调 Planner
- 调 `session-broker`
- 调 `browser-worker`
- 调验证接口
- 触发复盘入口

验收：

- `control-plane` 成为唯一业务真相源写入口

---

## 5. `ai-orchestrator` 工作包

### 5.1 规划接口

- 增加内部 `plans:generate`
- 增加内部 `plans:verify`
- 增加内部 `failures:classify`

### 5.2 收敛 Planner 输出

- 输出 `PlanDraft`
- 输出 `PlanStep[]`
- 输出 `RequiredInput[]`
- 输出 `RiskSummary`

### 5.3 去执行化

- 不再直接写 `Execution.status`
- 不再直接持有高风险执行主链
- 高风险自由工具能力不再进入主闭环

验收：

- Planner 可以独立返回结构化结果
- `control-plane` 不再依赖 ReAct 文本协议驱动主状态

---

## 6. `session-broker` 工作包

### 6.1 `RuntimeSession` 模型

- 新增或收敛 `RuntimeSession` 持久化模型
- 统一 `allocating / ready / busy / frozen / closed / error`

### 6.2 资源分配

- worker 分配
- profile 绑定
- lease / lock

### 6.3 控制协议

- freeze
- resume
- close
- health heartbeat

验收：

- `RuntimeSession.state` 仅由 `session-broker` 维护

---

## 7. `browser-worker` 工作包

### 7.1 Step 执行协议

- 接受结构化 step 请求
- 返回结构化 step 结果
- 返回 snapshot / trace 引用
- 返回 takeover hint

### 7.2 接管支持

- freeze 期间停止自动推进
- 提供接管连接信息
- 接管结束后支持恢复

### 7.3 健康检查

- worker 健康
- browser session 健康
- runtime 执行异常回报

验收：

- `browser-worker` 不再暴露过多演示型接口作为主链路

---

## 8. `portal` 工作包

### 8.1 页面

- Execution 列表
- Execution 详情
- Step 时间线
- Artifact 列表
- Approval 操作页
- Takeover Workbench

MVP 页面建议：

- P0 必做
  - Execution 列表
  - Execution 详情
  - Step 时间线
  - Takeover Workbench
- P1 条件做
  - Artifact 列表
  - Approval 操作页

### 8.2 API 适配

- 全量改走 `Execution` API
- 逐步弱化旧 `session` 语义

验收：

- 用户看到的主对象是 `Execution`，不是分散的 session / worker / step 临时概念

---

## 9. `auth` 工作包

### 9.1 保持稳定

- 身份认证
- RBAC
- Skill / SkillVersion 查询
- capability-release 主链保持不变

### 9.2 预留接口

- 为后续 `Evaluation / CandidatePatch -> Release` 预留接入位

验收：

- Phase 1 内不大改 `auth` 业务边界，只补必要支撑

---

## 10. 任务依赖顺序

建议顺序：

1. 数据模型
2. `control-plane` 基础 API
3. `session-broker` `RuntimeSession`
4. `browser-worker` step 协议
5. `ai-orchestrator` `PlanDraft`
6. `portal` UI 对接
7. 复盘入口与产物归档

原因：

- 先定状态和表
- 再定 API 和 runtime
- 最后切前端和 planner

MVP 裁剪原则：

- 如果排期紧，优先保证 `control-plane + session-broker + browser-worker` 主链联调
- `portal` 先切查询和接管，不强求一次性补齐所有管理页
- `approve / reject / artifacts` 可放到 Browser 闭环跑通后补

### 10.1 对后续阶段的显式依赖输出

`Phase 1` 结束时，必须显式输出以下后续阶段依赖物：

- 给 `Phase 2`
  - 统一 `ExecutionStep` 边界
  - 统一 Runtime step 调用协议
  - 可挂接 `PolicyDecision` 的 precheck / step-check 位置
- 给 `Phase 3`
  - 结构化 `Execution`
  - 结构化 `ExecutionStep`
  - 基础 `Artifact`
  - `Evaluation enqueue` 标准入口
- 给 `Phase 4`
  - 失败原因结构化字段
  - 人工接管记录与恢复记录

---

## 11. 推荐排期拆分

### Sprint 1

- 数据模型
- `control-plane` 基础 `Execution` API
- `session-broker` `RuntimeSession`

### Sprint 2

- `browser-worker` 统一 step 协议
- `control-plane` 协调执行主链
- 最小接管闭环

### Sprint 3

- `ai-orchestrator` 输出 `PlanDraft`
- Portal Execution 工作台
- Artifact 展示

### Sprint 4

- `waiting_input / pending_approval / human_control`
- 统一 `Evaluation enqueue`
- 联调和回归

如果需要进一步压缩为 MVP 三段式，也可改为：

- Sprint A
  - 数据模型
  - `control-plane` 基础 API
  - `session-broker` `RuntimeSession`
- Sprint B
  - `browser-worker` 统一 step 协议
  - `control-plane` 主链协调
  - `human_control` 闭环
- Sprint C
  - `ai-orchestrator` `PlanDraft`
  - Portal 最小工作台
  - `waiting_input`
  - `Evaluation enqueue` 占位

---

## 12. 验收清单

以下能力全部通过时，Phase 1 可验收：

- 用户可创建一个 Execution
- Planner 返回结构化计划
- RuntimeSession 可被分配和释放
- Browser step 可被统一执行和记录
- 任务可进入 `waiting_input`
- 任务可进入 `pending_approval`
- 任务可进入 `human_control`
- 用户可释放人工接管并继续执行
- 执行结果、步骤、产物可被统一查询

此外，还需满足进入下一阶段的“平台级验收”：

- 旧链路不再多点写主状态
- Planner 已不再充当高权限执行器
- Portal 已不再以旧 session 语义为主入口
- Browser 链路中的状态和资源语义已经分离

---

## 13. 风险清单

### 13.1 最大风险

- 旧链路仍同时写状态
- Planner 改造后主链断裂
- Portal 继续依赖旧 session 语义
- `Phase 1` 为了赶进度塞入过多 `Phase 2/3` 能力

### 13.2 控制策略

- 所有状态写入口先集中到 `control-plane`
- 对旧链路加兼容层，不直接硬删
- 前端优先切读 API，再切写 API
- 明确超出 `Phase 1` 的需求统一记入后续阶段，不在本阶段混做

---

## 14. 交付物清单

Phase 1 最终交付应包括：

- 数据库 migration
- `Execution` API
- `RuntimeSession` 控制接口
- Browser step 协议
- Planner `PlanDraft` 接口
- Portal Execution 工作台
- 内联接管/恢复主链
- 执行结束复盘入口

其中建议按两层定义：

- MVP 必交付
  - 数据库 migration
  - `Execution` API 基础集
  - `RuntimeSession` 控制接口
  - Browser step 协议
  - Planner `PlanDraft` 接口
  - Portal 最小 Execution 工作台
  - 内联接管/恢复主链
- 预留或条件交付
  - Artifact 展示增强
  - 审批页完整体验
  - `evaluations` / `candidate_patches` 占位结构

---

## 15. 一句话总结

Phase 1 的目标不是“做一个完整 Agent OS”，而是：

> 先做成一个最小但正式可用的 Browser MVP 闭环，并把后续能力控制在接口预留层，而不是提前全部实现。
