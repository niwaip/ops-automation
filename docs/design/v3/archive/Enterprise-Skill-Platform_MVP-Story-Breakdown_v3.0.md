# 企业级 Skill 平台 Agent OS MVP Story Breakdown

**MVP Story Breakdown v3.0**  
日期：2026-04-26

> 本文将 `MVP Development Backlog` 进一步拆成可认领的 story。目标不是把任务打碎到工时级，而是给团队一个统一的 story 层交付视图，便于排期、分配、联调和验收。

---

## 1. Story 边界

本次 story 拆分遵循 4 条规则：

- 只覆盖最小 Browser MVP 闭环
- 只拆到“一个人或一条小组线可持续推进”的粒度
- 每个 story 必须有明确输入、输出和验收
- 不把 `P1 / Reserved` 混入 `P0` 主链

一句话：

> story 只为开工服务，不再扩架构范围。

---

## 2. 优先级说明

### P0 Story

- 不完成就无法形成 MVP 主链

### P1 Story

- 主链可运行，但缺少体验增强、查询增强或可观测增强

### Reserved Story

- 只记录未来入口
- 本期不排开发

---

## 3. P0 Story 列表

## 3.1 数据模型与存储

### `DATA-P0-01` Execution 主表落地

- 目标：落地 `executions` 表及核心索引
- 输入：`Execution` 对象字段定义
- 输出：schema、migration、读写仓储
- 验收：
  - 可以创建和查询 `Execution`
  - 可以按 `status / user_id / created_at` 基本检索

### `DATA-P0-02` ExecutionStep 主表落地

- 目标：落地 `execution_steps` 表及 step 级状态字段
- 输入：`ExecutionStep` 字段定义和状态枚举
- 输出：schema、migration、读写仓储
- 验收：
  - 可以按 execution 查询步骤
  - 可以更新 step 状态和输出结果

### `DATA-P0-03` RuntimeSession 主表落地

- 目标：落地 `runtime_sessions` 表及资源状态字段
- 输入：`RuntimeSession` 字段定义和状态枚举
- 输出：schema、migration、读写仓储
- 验收：
  - 可以创建、更新、关闭 `RuntimeSession`
  - 可以区分 `allocating / ready / busy / frozen / closed`

### `DATA-P0-04` ExecutionEvent 与 Redis 状态位落地

- 目标：落地 `execution_events` 与 Redis 高频状态 key
- 输入：事件模型、Redis key 约定
- 输出：事件写入逻辑、Redis 读写逻辑
- 验收：
  - 可以记录关键状态迁移
  - 可以读取当前 step 指针和 runtime 状态

## 3.2 `control-plane`

### `CP-P0-01` Execution 创建接口

- 目标：实现 `POST /executions`
- 输入：用户请求、skill 信息、Planner 生成结果
- 输出：`Execution` 创建结果
- 验收：
  - 能根据 Planner 输出创建 `Execution`
  - 能进入 `queued` 或 `waiting_input`

### `CP-P0-02` Execution 查询接口

- 目标：实现 `GET /executions/{id}` 与 `GET /executions/{id}/steps`
- 输入：`execution_id`
- 输出：Execution 详情和步骤时间线
- 验收：
  - Portal 可通过新接口读取任务与步骤

### `CP-P0-03` 主状态单写入口

- 目标：将 `Execution.status` 收敛到 `control-plane`
- 输入：Planner 结果、runtime 返回、人工接管动作
- 输出：统一状态迁移逻辑和事件记录
- 验收：
  - 业务主状态不再由其他服务直接写入

### `CP-P0-04` Step 驱动与回写

- 目标：由 `control-plane` 驱动 Browser step，并回写 `ExecutionStep`
- 输入：当前 step、runtime 返回结果
- 输出：step 状态、输出、失败原因
- 验收：
  - Browser step 可以统一推进
  - step 结果可以被结构化回写

### `CP-P0-05` 人工接管与恢复接口

- 目标：实现 `POST /executions/{id}/takeover` 与 `POST /executions/{id}/release-human-control`
- 输入：接管请求、恢复请求
- 输出：Execution 与 RuntimeSession 的联动变更
- 验收：
  - 任务可进入 `human_control`
  - 用户释放后可恢复执行

### `CP-P0-06` 输入补全接口

- 目标：实现 `POST /executions/{id}/submit-input`
- 输入：缺失参数补充内容
- 输出：Execution 输入更新与重推进
- 验收：
  - `waiting_input` 任务可继续执行

## 3.3 `ai-orchestrator`

### `PLN-P0-01` 结构化计划生成接口

- 目标：提供内部 `plans:generate`
- 输入：goal、上下文、skill 信息
- 输出：`PlanDraft`
- 验收：
  - `control-plane` 可稳定消费结构化计划

### `PLN-P0-02` PlanStep DTO 收敛

- 目标：统一 `PlanStep[]` 结构
- 输入：现有 Planner 输出能力
- 输出：结构化 step DTO
- 验收：
  - 不再依赖 ReAct 文本驱动主执行状态

### `PLN-P0-03` RequiredInput 输出

- 目标：输出 `RequiredInput[]`
- 输入：参数缺失判断逻辑
- 输出：缺失字段清单
- 验收：
  - `waiting_input` 可以由结构化字段驱动

## 3.4 `session-broker`

### `RTM-P0-01` RuntimeSession 分配能力

- 目标：创建并分配 Browser `RuntimeSession`
- 输入：execution 信息、runtime 请求
- 输出：已绑定 worker/profile 的 `RuntimeSession`
- 验收：
  - `control-plane` 可以拿到 `ready` 的 runtime

### `RTM-P0-02` Runtime 状态流转

- 目标：支持 `allocating -> ready -> busy -> frozen -> closed`
- 输入：执行命令、freeze/resume/close 控制命令
- 输出：统一状态变更
- 验收：
  - 状态变化由 `session-broker` 独立维护

### `RTM-P0-03` Freeze/Resume 协议

- 目标：定义并实现 freeze/resume 控制协议
- 输入：接管、恢复动作
- 输出：对 Browser runtime 的冻结和恢复控制
- 验收：
  - 接管时不会继续自动推进
  - 恢复后可以继续执行

## 3.5 `browser-worker`

### `BWR-P0-01` Step 请求 DTO

- 目标：定义统一 Browser step 请求结构
- 输入：PlanStep、runtime 信息
- 输出：结构化请求 DTO
- 验收：
  - 不同 Browser step 都走同一请求壳

### `BWR-P0-02` Step 执行返回 DTO

- 目标：定义统一 Browser step 返回结构
- 输入：浏览器执行结果
- 输出：`output / snapshot refs / trace refs / takeover hint`
- 验收：
  - `control-plane` 可稳定解析和回写

### `BWR-P0-03` Freeze/Resume 执行配合

- 目标：Browser worker 响应 runtime freeze/resume
- 输入：来自 `session-broker` 或控制面的控制命令
- 输出：停止推进或恢复推进
- 验收：
  - 人工接管时不再误推进后续步骤

## 3.6 `portal`

### `UI-P0-01` Execution 列表页

- 目标：提供 MVP 任务列表入口
- 输入：Execution 查询接口
- 输出：Execution 列表页面
- 验收：
  - 用户可以看到任务状态和基本信息

### `UI-P0-02` Execution 详情与步骤时间线

- 目标：提供任务详情和 step 时间线
- 输入：Execution 详情接口、steps 接口
- 输出：详情页和时间线视图
- 验收：
  - 用户可看到当前进度、当前步骤和历史步骤

### `UI-P0-03` Execution 内联接管/恢复区

- 目标：在 Execution 页面内提供人工接管入口和恢复操作
- 输入：takeover/release 接口、runtime 连接信息
- 输出：Execution 详情页/列表页中的内联接管与实时预览区域
- 验收：
  - 用户可以在 Execution 页面完成接管并恢复执行

## 3.7 `auth`

### `AUTH-P0-01` Skill / SkillVersion 查询支撑

- 目标：提供 MVP 主链所需的 skill 查询能力
- 输入：skill 标识、版本标识
- 输出：可供 Planner 和 Execution 使用的 skill 元数据
- 验收：
  - 不阻塞 `POST /executions` 主链

### `AUTH-P0-02` 身份与 RBAC 校验支撑

- 目标：为 Execution 创建与查看提供基础鉴权
- 输入：用户身份、资源信息
- 输出：授权判断结果
- 验收：
  - Portal 到 control-plane 主链可完成最小鉴权

---

## 4. P1 Story 列表

### `DATA-P1-01` Artifact 最小表与引用存储

- 目标：落地最小 `artifacts` 表
- 验收：
  - 可以看到 screenshot / trace 引用

### `CP-P1-01` Cancel 接口

- 目标：实现 `POST /executions/{id}/cancel`
- 验收：
  - 正在执行任务可进入 `cancelled`

### `CP-P1-02` 最小失败码与错误结构

- 目标：补齐最小错误码和失败原因结构
- 验收：
  - API 和时间线中能看到结构化失败原因

### `PLN-P1-01` 结果验证接口

- 目标：提供 `plans:verify`
- 验收：
  - step 或结果可被最小验证

### `PLN-P1-02` 失败分类接口

- 目标：提供 `failures:classify`
- 验收：
  - 失败结果可归入结构化分类

### `RTM-P1-01` Heartbeat 与 lease 回收

- 目标：补齐 runtime 健康和超时释放能力
- 验收：
  - 长时间无心跳 runtime 可被识别

### `BWR-P1-01` Worker 健康与异常分类增强

- 目标：提升 Browser runtime 可观测性
- 验收：
  - 异常类别更清晰

### `UI-P1-01` `waiting_input` 输入页

- 目标：支持用户补充缺失输入
- 验收：
  - 用户可直接在 Portal 完成缺失输入补全

### `UI-P1-02` Artifact 列表

- 目标：展示最小 screenshot / trace 引用
- 验收：
  - 用户可以在详情页查看产物索引

---

## 5. Reserved Story 列表

### `POL-RSV-01`

- `policy:precheck / step-check / postcheck` 挂点

### `EVA-RSV-01`

- `Evaluation enqueue` 之后的正式生成链

### `DOC-RSV-01`

- API Runtime / Document Runtime 执行链

### `MEM-RSV-01`

- Memory 正式注入主链

### `EVO-RSV-01`

- Candidate Patch 自动生成

---

## 6. 建议排期映射

### Stage A

- `DATA-P0-01`
- `DATA-P0-02`
- `DATA-P0-03`
- `DATA-P0-04`
- `CP-P0-01`
- `CP-P0-02`
- `AUTH-P0-01`
- `AUTH-P0-02`

### Stage B

- `RTM-P0-01`
- `RTM-P0-02`
- `RTM-P0-03`
- `BWR-P0-01`
- `BWR-P0-02`
- `BWR-P0-03`
- `CP-P0-03`
- `CP-P0-04`
- `CP-P0-05`

### Stage C

- `PLN-P0-01`
- `PLN-P0-02`
- `PLN-P0-03`
- `CP-P0-06`
- `UI-P0-01`
- `UI-P0-02`
- `UI-P0-03`

### Stage D

- 全链路联调
- P1 选择性补齐

---

## 7. 联调关口

### Gate 1

- `control-plane` 可以创建 Execution
- `session-broker` 可以分配 RuntimeSession

### Gate 2

- `browser-worker` 可以执行 step 并返回结构化结果
- `control-plane` 可以回写 step

### Gate 3

- `ai-orchestrator` 可以生成结构化计划
- `waiting_input` 可由结构化字段驱动

### Gate 4

- Portal 可以发起、查看、接管、恢复一个完整 Execution

---

## 8. 一句话总结

这份 story breakdown 的目标是：

> 在不扩 scope 的前提下，把 MVP backlog 继续压缩成可认领、可联调、可验收的一组 story。
