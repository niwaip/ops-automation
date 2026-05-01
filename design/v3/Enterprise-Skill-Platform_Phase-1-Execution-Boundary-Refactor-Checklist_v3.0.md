# 企业级 Skill 平台 Phase 1 执行边界重构实施清单

**Execution Boundary Refactor Checklist v3.0**  
日期：2026-05-01

> 本文用于把“先收口执行主状态与编排边界”的建议落成一份可执行清单。目标不是增加新功能，而是在保持现有机能不变的前提下，降低状态错乱、职责漂移和跨服务耦合带来的维护风险。

---

## 1. 本阶段目标

本阶段只做一件核心事情：

- 把 `Execution` 与 `ExecutionStep` 的主写入口收口到 `control-plane`

本阶段完成后，应满足以下约束：

- `control-plane` 是 `Execution` 主状态唯一可信写入口
- `control-plane` 是 `ExecutionStep` 状态唯一可信写入口
- `ai-orchestrator` 不再直接持久化执行主状态
- `ai-orchestrator` 保留 Planner / Decision / ReAct 推理职责
- 外部 API、页面交互、审批链路、接管链路保持兼容

---

## 2. 非目标

本阶段明确 **不做** 以下事项：

- 不拆物理服务
- 不大改数据库模型
- 不重写前端页面
- 不同时处理 `auth` 服务大规模拆分
- 不引入新的执行语义
- 不调整现有产品功能流程

---

## 3. 当前风险点

当前最高风险不是“功能缺失”，而是“边界未彻底收口”：

- `control-plane` 负责主执行链路，但 `ai-orchestrator` 内仍保留 `execution-step` 数据访问能力
- `react-engine` 已经声明状态写入委托给 `control-plane`，但边界仍依赖人为约束
- 状态枚举、错误码、步骤回写协议未统一成显式契约
- 跨服务出错时，容易出现“哪个服务才是真实状态源”不清楚的问题

受影响的核心位置：

- `services/control-plane/src/modules/execution/execution.service.ts`
- `services/ai-orchestrator/src/modules/react-engine/react-engine.service.ts`
- `services/ai-orchestrator/src/modules/execution-step/execution-step.service.ts`

---

## 4. 目标边界

### 4.1 `control-plane`

负责：

- `Execution` 创建
- `Execution` 主状态迁移
- `ExecutionStep` 状态落库
- `ExecutionEvent` 记录与流式事件分发
- 审批 / 接管 / 恢复 / 输入补全入口
- 调用下游 runtime 或 planner 服务

不负责：

- LLM 推理细节
- Prompt 组装
- 工具选择推理

### 4.2 `ai-orchestrator`

负责：

- 目标理解
- Skill 路由
- PlanDraft 生成
- 参数缺失识别
- ReAct 推理
- 失败分类

不负责：

- 直接写 `Execution`
- 直接写 `ExecutionStep`
- 直接决定最终持久化事实状态

---

## 5. 实施拆解

## 5.1 Task A: 写入口盘点

目标：

- 明确当前所有 `Execution` / `ExecutionStep` / `ExecutionEvent` 的写入口

动作：

- 检索 `prisma.execution`
- 检索 `prisma.executionStep`
- 检索 `prisma.executionEvent`
- 检索 `$executeRawUnsafe` / `$queryRawUnsafe` 中涉及执行链路的语句
- 产出一张“写操作矩阵”

输出物：

- `Who writes what` 清单
- 风险标记：`正式入口 / 临时兼容 / 待移除`

验收：

- 每个执行相关表都能回答“谁负责写、谁只读、谁应移除”

---

## 5.2 Task B: `control-plane` 内部职责拆分

目标：

- 在不改接口的前提下，把 `execution.service.ts` 拆成可维护的内部层次

建议拆分：

- `execution-application.service.ts`
- `execution-state.service.ts`
- `execution-step.service.ts`
- `execution-event.service.ts`
- `execution-runtime.service.ts`
- `execution.mapper.ts`

说明：

- 外部 controller 可先保持不动
- `execution.service.ts` 可保留为 facade，逐步转发到拆出的服务

验收：

- 主状态迁移逻辑不再和 DTO 映射、外部 HTTP 调用、事件拼装混在一个文件中

---

## 5.3 Task C: 收口 `ExecutionStep` 写入

目标：

- 让 `ExecutionStep` 的正式写入口只保留在 `control-plane`

动作：

- 审查 `ai-orchestrator/src/modules/execution-step/`
- 标记该模块是：
  - 彻底删除
  - 改成只读适配器
  - 改成调 `control-plane` 内部接口的客户端
- 调整 ReAct 运行时对步骤状态的更新方式

建议：

- Phase 1 优先采用“保留接口形态，但内部改为调 `control-plane`”的兼容方案
- 等回归稳定后，再进一步移除本地持久化模块

验收：

- `ai-orchestrator` 不再直接落库 `execution_steps`

---

## 5.4 Task D: 收口 `Execution` 主状态迁移

目标：

- 所有最终状态迁移只能通过 `control-plane` 完成

动作：

- 梳理 `queued / running / waiting_input / pending_approval / human_control / paused / succeeded / failed / cancelled`
- 把状态迁移规则从业务编排逻辑中分离
- 明确“谁能触发迁移、迁移前置条件、迁移后副作用”

建议产物：

- `execution-state-machine.ts`
- `execution-status.ts`
- `execution-transition-policy.ts`

验收：

- 状态迁移规则可独立阅读和测试
- 任意状态写入都能追溯到 `control-plane`

---

## 5.5 Task E: 统一执行契约

目标：

- 把执行链路中散落的状态、错误码、事件类型收成显式契约

建议新增共享内容：

- `ExecutionStatus`
- `ExecutionStepStatus`
- `ApprovalStatus`
- `ExecutionEventType`
- `TakeoverReason`
- `ExecutionFailureCode`

建议位置：

- 第一版可先放在 `control-plane/src/modules/execution/contracts/`
- 第二版再抽到 `packages/contracts`

验收：

- 不再在多个服务里散落手写字符串状态

---

## 5.6 Task F: `ai-orchestrator` 退回 Planner 职责

目标：

- 保留现有推理能力，但去掉“事实状态拥有者”的角色

动作：

- 将 `react-engine` 中与执行落库相关的方法继续替换为控制面调用
- 将控制器中的跨服务拼接逻辑逐步转移到独立 client
- 明确 `ai-orchestrator` 输出的是：
  - 计划
  - 建议
  - 决策
  - 运行结果候选

不是：

- 持久化后的最终执行事实

验收：

- `ai-orchestrator` 代码层面不再形成“我也能改执行状态”的认知

---

## 5.7 Task G: 回归测试补强

目标：

- 保证边界收口不改变现有机能

必须覆盖的链路：

- 创建执行
- 计划生成后进入 `queued`
- 缺参进入 `waiting_input`
- 高风险进入 `pending_approval`
- 批准后恢复执行
- 接管进入 `human_control`
- 恢复后继续执行
- 取消执行
- 执行成功与失败回写

优先级最高的测试类型：

- `control-plane` 服务级集成测试
- `ai-orchestrator -> control-plane` 契约测试
- 关键 SSE 事件流测试

验收：

- 核心状态迁移链路都有测试保护

---

## 6. 推荐任务顺序

建议按以下顺序推进：

1. `Task A` 写入口盘点
2. `Task B` `control-plane` 内部拆层
3. `Task C` 收口 `ExecutionStep` 写入
4. `Task D` 收口 `Execution` 主状态迁移
5. `Task E` 统一执行契约
6. `Task F` `ai-orchestrator` 去执行化
7. `Task G` 回归测试补强

原则：

- 先盘点，再拆层
- 先收口写入口，再抽契约
- 先保兼容，再删旧实现

---

## 7. 文件级改动建议

### 7.1 必动文件

- `services/control-plane/src/modules/execution/execution.service.ts`
- `services/control-plane/src/modules/execution/execution.controller.ts`
- `services/ai-orchestrator/src/modules/react-engine/react-engine.service.ts`
- `services/ai-orchestrator/src/modules/execution-step/execution-step.service.ts`

### 7.2 高概率新增文件

- `services/control-plane/src/modules/execution/execution-state.service.ts`
- `services/control-plane/src/modules/execution/execution-step.service.ts`
- `services/control-plane/src/modules/execution/execution-event.service.ts`
- `services/control-plane/src/modules/execution/execution-state-machine.ts`
- `services/control-plane/src/modules/execution/contracts/*.ts`
- `services/ai-orchestrator/src/client/control-plane.client.ts`

### 7.3 暂缓文件

- `services/auth/src/modules/capability-release/capability-release.service.ts`
- `services/auth/src/modules/skill/skill.service.ts`
- `services/portal/src/pages/*`

原因：

- 这些文件确实需要整理，但不应与 Phase 1 同时大动

---

## 8. 风险与缓解

### 风险 1：收口后出现状态回写断链

缓解：

- 先保留兼容层
- 增加日志与事件追踪
- 通过灰度方式替换写入口

### 风险 2：SSE 或前端展示被动变化

缓解：

- 事件结构保持兼容
- 在测试中加入执行事件流校验

### 风险 3：重构过程中耦合暴露过多，改动面超出预期

缓解：

- 每次只收一个边界
- 禁止在 Phase 1 顺手处理 `auth` 过载问题

### 风险 4：团队误以为 Phase 1 已完成全部架构治理

缓解：

- 明确本阶段只是“边界止血”
- 后续仍需做 `auth` 域拆分、共享基础设施和治理后台建设

---

## 9. 完成定义

当以下条件全部满足时，Phase 1 可视为完成：

- `Execution` 主状态只有 `control-plane` 可写
- `ExecutionStep` 只有一个正式写入口
- `ai-orchestrator` 只负责 Planner / Decision / ReAct
- 关键执行链路测试通过
- 页面、审批、接管、恢复等现有机能未发生行为回归
- 代码结构已经从“单大文件混合职责”变成“可分层理解”

---

## 10. 下一阶段入口

Phase 1 完成后，优先进入以下两项之一：

### 方案 A：`auth` 域内拆分

适用场景：

- 团队已能稳定控制执行链路
- 下一步要解决发布链路与 Skill 管理过载

### 方案 B：共享基础设施抽离

适用场景：

- 团队已经频繁受到重复 URL、鉴权、配置、契约定义的影响
- 希望在不大动业务的前提下，先降低全仓维护成本

---

## 11. 建议立即创建的 Issue

建议先建以下 8 个 issue：

1. 盘点执行相关写入口并输出矩阵
2. 拆分 `control-plane` `execution.service.ts`
3. 建立执行状态机与状态迁移策略
4. 收口 `ExecutionStep` 正式写入口
5. 建立 `ai-orchestrator` 到 `control-plane` 的执行客户端
6. 清理 `ai-orchestrator` 内本地执行持久化逻辑
7. 补齐执行主链路契约测试
8. 验证前端与 SSE 兼容性

这 8 个 issue 足够支撑第一轮重构落地。
