# 企业级 Skill 平台 Agent OS MVP 开发 Backlog

**MVP Development Backlog v3.0**  
日期：2026-04-26

> 本文将 `MVP 实施清单` 进一步下沉为可排期、可指派、可验收的开发 backlog。目标是让团队围绕最小 Browser 闭环推进开发，而不是继续扩展后续阶段能力。

---

## 1. Backlog 目标

当前 backlog 只服务于一个目标：

- 做成最小 Browser MVP 闭环

当前 backlog 不服务于以下目标：

- 一次性补齐多 Runtime
- 一次性补齐 Policy / Memory / Evaluation 正式服务
- 一次性补齐复杂审批、运营、回归平台

一句话：

> 先把最小执行主链做通，再谈后续扩展。

---

## 2. 优先级规则

### P0

- 不做就无法形成 Browser MVP 闭环

### P1

- 闭环能跑，但没有它体验或可观测性较差

### Reserved

- 只保留接口、字段或扩展位
- 本次开发不排期

---

## 3. 服务级 Backlog

## 3.1 数据模型与存储

### P0

- 建立 `executions` 表
- 建立 `execution_steps` 表
- 建立 `runtime_sessions` 表
- 建立 `execution_events` 表
- 增加核心索引
- 定义 Redis key：
  - `execution:{id}:current_step`
  - `runtime:{id}:state`
  - `runtime:{id}:control_mode`
  - `lock:profile:{profile_id}`
  - `lease:runtime:{id}`

### P1

- 建立最小 `artifacts` 表
- 打通 screenshot / trace 引用存储

### Reserved

- `evaluations`
- `candidate_patches`

### 完成标准

- 可以持久化 `Execution / Step / RuntimeSession / Event`
- 可以读取当前 step 和 runtime 状态

---

## 3.2 `control-plane`

### P0

- 实现 `POST /executions`
- 实现 `GET /executions/{id}`
- 实现 `GET /executions/{id}/steps`
- 实现 `POST /executions/{id}/submit-input`
- 实现 `POST /executions/{id}/takeover`
- 实现 `POST /executions/{id}/release-human-control`
- 收敛 `Execution.status` 单写入口
- 增加 `ExecutionStep` 创建逻辑
- 增加 `ExecutionStep` 更新逻辑
- 增加 `ExecutionEvent` 写入逻辑
- 串起 `ai-orchestrator -> session-broker -> browser-worker`

### P1

- 实现 `GET /executions/{id}/artifacts`
- 实现 `POST /executions/{id}/cancel`
- 预留 `approve / reject` 路由
- 增加最小错误码与失败原因结构

### Reserved

- `policy:precheck`
- `policy:step-check`
- `policy:postcheck`

### 完成标准

- `control-plane` 成为唯一业务状态写入口
- Browser step 可以由 `control-plane` 统一推进

---

## 3.3 `ai-orchestrator`

### P0

- 提供内部 `plans:generate`
- 定义 `PlanDraft` DTO
- 定义 `PlanStep[]` DTO
- 定义 `RequiredInput[]` DTO
- 输出结构化计划，不再依赖 ReAct 文本驱动主状态

### P1

- 提供内部 `plans:verify`
- 提供内部 `failures:classify`
- 增加 `RiskSummary` 输出

### Reserved

- 最终 Policy 判断
- 高风险自由工具执行
- Code Runtime 编排

### 完成标准

- `control-plane` 可以稳定消费 Planner 输出
- `ai-orchestrator` 不再写主状态

---

## 3.4 `session-broker`

### P0

- 收敛 `RuntimeSession` 持久化模型
- 实现 runtime 分配
- 实现 worker / profile 绑定
- 实现 `allocating -> ready -> busy`
- 实现 freeze
- 实现 resume
- 实现 close

### P1

- 增加 health heartbeat
- 增加 lease 超时回收
- 优化 profile lock 冲突处理

### Reserved

- 多 Runtime 统一编排
- 复杂容量调度

### 完成标准

- `RuntimeSession.state` 只由 `session-broker` 维护
- 接管与恢复链路可稳定工作

---

## 3.5 `browser-worker`

### P0

- 定义结构化 step 请求 DTO
- 定义结构化 step 返回 DTO
- 返回 step output
- 返回 snapshot refs
- 返回 trace refs
- 返回 takeover hint
- 支持 freeze 后停止自动推进
- 支持 resume 后继续执行

### P1

- 增加 worker 健康检查
- 增加 browser session 健康检查
- 增加更清晰的异常分类

### Reserved

- 演示型旁路接口继续扩展
- 非 Browser Runtime 能力

### 完成标准

- 所有 Browser step 都走统一协议
- takeover / resume 不依赖人工补链

---

## 3.6 `portal`

### P0

- Execution 列表页
- Execution 详情页
- Step 时间线
- Takeover Workbench
- 改走 `Execution` API 读链路

### P1

- Artifact 列表
- `waiting_input` 输入页
- 弱化旧 `session` 页面入口

### Reserved

- 完整审批中心
- 复杂运营视图
- 多 Runtime 管理台

### 完成标准

- 用户围绕 `Execution` 看到任务
- 用户可完成接管和恢复

---

## 3.7 `auth`

### P0

- 提供身份认证
- 提供 RBAC
- 提供 Skill / SkillVersion 查询能力

### P1

- 预留 release / evaluation 接入位

### Reserved

- 将 `auth` 改造成新的 Skill 控制面

### 完成标准

- 不阻塞 MVP 主链
- 不扩大本阶段边界

---

## 4. 依赖顺序

推荐开发顺序：

1. 数据模型与存储
2. `control-plane`
3. `session-broker`
4. `browser-worker`
5. `ai-orchestrator`
6. `portal`
7. `auth` 的必要支撑补齐

推荐联调顺序：

1. `control-plane + session-broker`
2. `control-plane + browser-worker`
3. `control-plane + ai-orchestrator`
4. `portal + control-plane`

---

## 5. 建议分配方式

如果按并行开发拆分，建议最少拆成 4 条线：

- 任务线 A
  - 数据模型
  - `control-plane` API 和状态机
- 任务线 B
  - `session-broker`
  - `browser-worker`
- 任务线 C
  - `ai-orchestrator` 结构化 Planner 输出
- 任务线 D
  - `portal` 最小工作台

`auth` 建议穿插支持，不单独拉成大迭代。

---

## 6. 验收门槛

### P0 完成门槛

- 用户可以发起一个 Execution
- Planner 可以生成结构化 PlanDraft
- RuntimeSession 可以被分配
- Browser step 可以被执行并回写步骤结果
- 人工接管和恢复可以打通
- Portal 可以查看任务和步骤

### P1 完成门槛

- 可以查看最小 Artifact
- 可以更清楚地定位失败原因
- 基础取消和补充查询能力可用

---

## 7. 不应进入本期开发的事项

- 正式 `policy-service`
- 正式 `memory-service`
- 正式 `evaluation-service`
- API Runtime / Document Runtime 执行链
- 自动 Candidate Patch
- Code Runtime
- Replay / Benchmark / Shadow / Canary

---

## 8. 风险提醒

- 风险 1：旧链路继续多点写状态
- 风险 2：Planner 输出仍夹杂 ReAct 文本控制语义
- 风险 3：Portal 继续围绕旧 `session` 模型构建
- 风险 4：为了“接口完整”把 P1 和 Reserved 提前做大

对应控制：

- 先收敛写入口，再联调功能
- 先做 DTO 契约，再接模型调用
- 先切主查询页，再替换旧入口
- 每次评审显式区分 `P0 / P1 / Reserved`

---

## 9. 一句话总结

这份 backlog 的核心作用是：

> 把 `MVP 实施清单` 变成可以直接排期和指派的开发任务单，并持续防止 Phase 1 被后续能力拖大。
