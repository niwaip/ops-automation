# 企业级 Skill 平台 Agent OS MVP Implementation Sequence

**MVP Implementation Sequence v3.0**  
日期：2026-04-26

> 本文将 `MVP Story Breakdown` 和 `MVP Code Mapping` 进一步收敛成实际开发顺序。目标不是重新定义 backlog，而是明确“先改什么、后改什么、哪些能并行、哪些必须等联调关口通过后再继续”。

---

## 1. Sequence 目标

当前实施顺序只服务于一个目标：

- 用最小返工成本做成 Browser MVP 闭环

当前实施顺序不追求：

- 同时把所有服务都改到最终形态
- 提前补齐 `P1 / Reserved`
- 一上来就重构 `ai-orchestrator` 全部逻辑

一句话：

> 先收口主边界，再打通主链，再替换主协议，最后补体验层。

---

## 2. 排序原则

### 原则 1：先收口正式写入口

- 先确认 `Execution.status` 的唯一写入口
- 先确认 `RuntimeSession.state` 的唯一写入口

### 原则 2：先打通后端主链，再切前端主入口

- 后端 API 和 runtime 未稳定前，不应先大改 Portal

### 原则 3：先复用已有接口，再补新接口

- 优先用已有 `POST /executions`
- 优先用已有 `POST /runtime-sessions`
- 优先用已有 `POST /browser/execute-step`

### 原则 4：Planner 结构化改造放在主链已通之后

- 否则容易把问题混成“状态机问题 + Planner 协议问题”

---

## 3. 总体顺序

推荐按 5 个实施段推进：

1. 主对象与状态边界收口
2. Runtime 主链打通
3. Planner 协议替换
4. Portal 主入口切换
5. P1 补齐与稳定性增强

对应到实际心智：

- 第一段解决“谁写状态”
- 第二段解决“Browser 能不能真实跑通”
- 第三段解决“主链还要不要依赖 ReAct 文本”
- 第四段解决“用户是不是已经围绕 Execution 使用系统”
- 第五段解决“体验和可观测性是否够用”

---

## 4. Sequence 详细阶段

## 4.1 Sequence A：主对象与状态边界收口

### 目标

- 稳定 `Execution` 和 `RuntimeSession` 两个真相源
- 避免后续联调时继续双写状态

### 优先 story

- `DATA-P0-01`
- `DATA-P0-02`
- `DATA-P0-03`
- `DATA-P0-04`
- `CP-P0-03`

### 主要代码位置

- `services/control-plane/prisma/schema.prisma`
- `services/control-plane/src/modules/execution/execution.service.ts`
- `services/session-broker/src/modules/runtime-session/runtime-session.service.ts`
- `services/session-broker/src/modules/freeze/freeze.service.ts`

### 本阶段必须完成的事情

- 对齐 `Execution` 字段和状态枚举
- 对齐 `ExecutionStep` 字段和状态枚举
- 对齐 `RuntimeSession` 字段和状态枚举
- 确认 `Execution.status` 只能由 `control-plane` 更新
- 确认 `RuntimeSession.state` 只能由 `session-broker` 更新
- 把 Redis 高频状态位明确降级为缓存或控制态，不再替代数据库正式状态

### 可并行

- `control-plane` schema/DTO/service 调整
- `session-broker` schema/service/Redis key 调整

### 不应并行

- 此时不要先切 Portal 页面
- 此时不要先做 Planner 结构化接口

### 关口

- `Execution` 可以被稳定创建和查询
- `RuntimeSession` 可以被稳定创建和查询
- 双写状态点已被识别并列入改造清单

## 4.2 Sequence B：Runtime 主链打通

### 目标

- 跑通 Browser runtime 的真实执行、冻结、恢复链路

### 优先 story

- `RTM-P0-01`
- `RTM-P0-02`
- `RTM-P0-03`
- `BWR-P0-01`
- `BWR-P0-02`
- `BWR-P0-03`
- `CP-P0-04`
- `CP-P0-05`

### 主要代码位置

- `services/session-broker/src/modules/runtime-session/runtime-session.controller.ts`
- `services/session-broker/src/modules/runtime-session/runtime-session.service.ts`
- `services/session-broker/src/modules/freeze/freeze.service.ts`
- `services/browser-worker/src/dto/worker.dto.ts`
- `services/browser-worker/src/modules/browser/browser.controller.ts`
- `services/browser-worker/src/modules/browser/browser.service.ts`
- `services/control-plane/src/modules/execution/execution.service.ts`

### 本阶段必须完成的事情

- `control-plane` 能调用 `runtime-sessions` 分配 runtime
- `control-plane` 能调用 `browser/execute-step`
- Browser step 结果能结构化回写到 `ExecutionStep`
- `takeover` 能触发 runtime freeze
- `resume` 能触发 runtime resume
- `close/cancel` 能结束 runtime

### 可并行

- `session-broker` 的 freeze/resume/close 收口
- `browser-worker` 的 step DTO 和返回 DTO 对齐
- `control-plane` 的 step 驱动壳开发

### 不应并行

- 此时不要引入完整 `RequiredInput` 交互
- 此时不要让 Portal 依赖未稳定的 runtime 连接模型

### 关口

- Browser step 可统一执行
- `control-plane` 可统一回写 step
- 接管和恢复链可在无前端参与下打通

## 4.3 Sequence C：Planner 协议替换

### 目标

- 让主链从 ReAct 文本协议转为结构化 Planner 输出

### 优先 story

- `PLN-P0-01`
- `PLN-P0-02`
- `PLN-P0-03`
- `CP-P0-01`
- `CP-P0-06`

### 主要代码位置

- `services/ai-orchestrator/src/modules/react-engine/interfaces.ts`
- `services/ai-orchestrator/src/modules/react-engine/react-engine.service.ts`
- `services/ai-orchestrator/src/modules/react-engine/prompt-builder.ts`
- `services/ai-orchestrator/src/controllers/chat.controller.ts`
- `services/control-plane/src/modules/execution/execution.controller.ts`
- `services/control-plane/src/modules/execution/execution.dto.ts`
- `services/control-plane/src/modules/execution/execution.service.ts`

### 本阶段必须完成的事情

- 提供 `plans:generate` 内部接口
- 产出 `PlanDraft / PlanStep[] / RequiredInput[]`
- `POST /executions` 创建流程优先消费结构化 Planner 结果
- 新增 `POST /executions/{id}/submit-input`
- `waiting_input` 不再依赖 ReAct 文本文案判断

### 可并行

- `ai-orchestrator` 的 planner facade/DTO 收口
- `control-plane` 的 create 流程和 submit-input 流程调整

### 不应并行

- 此时不要顺手做完整 `plans:verify / failures:classify`
- 此时不要把 `policy` 挂点做成正式服务

### 关口

- `control-plane` 能消费结构化 Planner 输出
- `waiting_input` 由结构化字段驱动
- 主链不再依赖 ReAct 文本协议推进 `Execution`

## 4.4 Sequence D：Portal 主入口切换

### 目标

- 让用户正式围绕 `Execution` 使用系统

### 优先 story

- `UI-P0-01`
- `UI-P0-02`
- `UI-P0-03`

### 主要代码位置

- `apps/frontend/portal/src/api/execution.ts`
- `apps/frontend/portal/src/features/executions/pages/ExecutionListPage.tsx`
- `apps/frontend/portal/src/features/executions/pages/ExecutionDetailPage.tsx`
- `apps/frontend/portal/src/components/execution/InlineRecoveryPanel.tsx`

### 本阶段必须完成的事情

- 列表页可用 `Execution` API 稳定查询
- 详情页可展示执行状态、步骤和失败信息
- 详情页/列表页内联恢复区可进入并恢复
- 页面主入口优先围绕 `Execution`，而不是旧 `session`

### 可并行

- 列表页和详情页
- 内联接管/恢复区和 execution API client 对齐

### 不应并行

- 此时不要顺手补完整审批中心
- 此时不要先清理所有旧 session 页面

### 关口

- 用户可发起、查看、接管、恢复一个完整 Execution
- Portal 主入口已切向 `Execution`

## 4.5 Sequence E：P1 补齐与稳定性增强

### 目标

- 在 P0 主链成立后补最小体验和可观测性

### 优先 story

- `DATA-P1-01`
- `CP-P1-01`
- `CP-P1-02`
- `PLN-P1-01`
- `PLN-P1-02`
- `RTM-P1-01`
- `BWR-P1-01`
- `UI-P1-01`
- `UI-P1-02`

### 本阶段应重点补的内容

- Artifact 最小表和 Portal 列表
- 失败码和失败原因结构
- runtime heartbeat 和 lease 回收
- Browser runtime 异常分类
- `waiting_input` 输入页

### 说明

- 这一段只在 P0 主链稳定后进入
- 如果上线压力大，可拆成独立的小迭代

---

## 5. 并行开发建议

### 并行面 A：控制面与数据面

- `control-plane`
- `control-plane prisma`
- `session-broker runtime-session`

### 并行面 B：runtime 面

- `browser-worker`
- `session-broker freeze`

### 并行面 C：planner 面

- `ai-orchestrator` 的 planner facade 和 DTO

### 并行面 D：portal 面

- `ExecutionListPage`
- `ExecutionDetailPage`
- `InlineRecoveryPanel`

### 穿插支持

- `auth`

---

## 6. 联调顺序

### 联调 1

- `control-plane + session-broker`

目标：

- 创建 Execution 后可以拿到 RuntimeSession

### 联调 2

- `control-plane + browser-worker`

目标：

- step 可以被执行并回写

### 联调 3

- `control-plane + session-broker + browser-worker`

目标：

- 接管和恢复可真实打通

### 联调 4

- `control-plane + ai-orchestrator`

目标：

- 创建接口消费结构化计划
- `waiting_input` 可继续推进

### 联调 5

- `portal + control-plane`

目标：

- 用户完整走通创建、查看、接管、恢复

---

## 7. 建议首批改动文件

如果按最小启动集开始，建议第一批先改这些文件：

1. `services/control-plane/prisma/schema.prisma`
2. `services/control-plane/src/modules/execution/execution.dto.ts`
3. `services/control-plane/src/modules/execution/execution.service.ts`
4. `services/session-broker/src/modules/runtime-session/runtime-session.service.ts`
5. `services/session-broker/src/modules/freeze/freeze.service.ts`
6. `services/browser-worker/src/dto/worker.dto.ts`
7. `services/browser-worker/src/modules/browser/browser.service.ts`

第二批再进入：

1. `services/ai-orchestrator/src/modules/react-engine/interfaces.ts`
2. `services/ai-orchestrator/src/modules/react-engine/react-engine.service.ts`
3. `services/ai-orchestrator/src/modules/react-engine/prompt-builder.ts`
4. `apps/frontend/portal/src/api/execution.ts`
5. `apps/frontend/portal/src/features/executions/pages/ExecutionListPage.tsx`
6. `apps/frontend/portal/src/features/executions/pages/ExecutionDetailPage.tsx`
7. `apps/frontend/portal/src/components/execution/InlineRecoveryPanel.tsx`

---

## 8. 最容易卡住的地方

### 卡点 1：`Execution.status` 越界写入

- 如果 `ai-orchestrator` 继续直接 finalize execution，主链就会一直双写

### 卡点 2：数据库状态与 Redis 状态不一致

- 如果 `RuntimeSession.state` 和 freeze key 各自为政，接管会变得不可信

### 卡点 3：Planner 输出仍是文本主协议

- 如果 `control-plane` 继续依赖 Thought/Action 文本，后续治理和 waiting_input 都会不稳

### 卡点 4：Portal 过早吃未稳定接口

- 如果前端先大改，而后端 DTO 仍在变化，会导致联调反复返工

---

## 9. 一句话总结

这份 implementation sequence 的核心判断是：

> 最合理的实施顺序不是“所有服务一起改”，而是先收口状态边界，再打通 Browser runtime 主链，再替换 Planner 主协议，最后再把 Portal 主入口切过来。
