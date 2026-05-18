# 企业级 Skill 平台 Agent OS MVP First Change Set

**MVP First Change Set v3.0**  
日期：2026-04-26

> 本文将 `MVP Implementation Sequence` 继续收敛成“第一批真实改动文件清单”。目标不是覆盖全部 Phase 1，而是明确第一次正式开工时，哪些文件应该先动、每个文件要解决什么问题、改完后应出现什么完成信号。

---

## 1. 文档目标

当前 `First Change Set` 只回答 4 个问题：

- 第一批先改哪些文件
- 每个文件的改动目标是什么
- 哪些改动可以并行
- 改完后如何判断已经可以进入下一批

一句话：

> 先把最容易决定成败的第一批文件改对，再继续扩到 Planner 和 Portal。

---

## 2. 第一批改动范围

第一批只覆盖 `Sequence A + Sequence B` 的最小启动集：

- `Execution` 主对象和状态边界
- `RuntimeSession` 主对象和状态边界
- Browser step 执行协议对齐
- 接管 / 恢复链路的后端主链

本批明确不做：

- `ai-orchestrator` 的结构化 planner facade
- `submit-input` 正式入口
- Portal 主入口切换
- Artifact 展示增强
- `P1 / Reserved` 全部事项

---

## 3. First Change Set 文件清单

## 3.1 `control-plane`

### 文件 1：[schema.prisma](file:///d:/workspace/ops-automation/services/control-plane/prisma/schema.prisma)

- 目标：
  - 对齐 `Execution`
  - 对齐 `ExecutionStep`
  - 对齐 `ExecutionEvent`
- 本批重点：
  - 核对状态枚举
  - 核对最小必需字段
  - 确认为后续 `RuntimeSession` 关联和失败原因结构预留字段
- 不在本批展开：
  - `evaluations`
  - `candidate_patches`
  - 复杂 policy 相关表
- 完成信号：
  - Prisma schema 可以支撑 MVP 主对象
  - migration 可以落地

### 文件 2：[execution.dto.ts](file:///d:/workspace/ops-automation/services/control-plane/src/modules/execution/execution.dto.ts)

- 目标：
  - 收口 `Execution` 创建、查询、接管相关 DTO
- 本批重点：
  - 对齐 `POST /executions`
  - 对齐 `takeover / release-human-control`
  - 为后续 `submit-input` 预留 DTO 位置，但本批不实现接口
- 不在本批展开：
  - `submit-input` 的完整请求体
  - 审批和 policy DTO
- 完成信号：
  - DTO 能稳定支撑当前控制面主链

### 文件 3：[execution.service.ts](file:///d:/workspace/ops-automation/services/control-plane/src/modules/execution/execution.service.ts)

- 目标：
  - 收口 `Execution.status` 单写入口
  - 建立 step 驱动和回写骨架
- 本批重点：
  - 明确 `create / updateStatus / takeover / resume / cancel` 的边界
  - 增加 Browser step 回写骨架
  - 增加与 `session-broker`、`browser-worker` 的协调点
- 不在本批展开：
  - 结构化 Planner 消费
  - `waiting_input` 主流程
- 完成信号：
  - 业务主状态只从这里写
  - step 回写入口明确

## 3.2 `session-broker`

### 文件 4：[runtime-session.service.ts](file:///d:/workspace/ops-automation/services/session-broker/src/modules/runtime-session/runtime-session.service.ts)

- 目标：
  - 收口 `RuntimeSession.state`
  - 稳定 `allocating / ready / busy / frozen / closed / error`
- 本批重点：
  - 核对 create/get/freeze/resume/close 语义
  - 明确数据库状态为正式源
  - 明确与 `control-plane` 的最小交互协议
- 不在本批展开：
  - heartbeat 深化
  - lease 回收增强
- 完成信号：
  - RuntimeSession 生命周期已稳定
  - 不再把资源状态写散到别的服务

### 文件 5：[freeze.service.ts](file:///d:/workspace/ops-automation/services/session-broker/src/modules/freeze/freeze.service.ts)

- 目标：
  - 将 Redis freeze 逻辑收敛为控制态缓存
- 本批重点：
  - 明确 Redis key 的职责
  - 明确与数据库状态的对应关系
  - 去掉“Redis 事实源”倾向
- 不在本批展开：
  - 复杂容错和补偿机制
- 完成信号：
  - freeze key 只负责高频控制，不再替代正式状态

## 3.3 `browser-worker`

### 文件 6：[worker.dto.ts](file:///d:/workspace/ops-automation/services/browser-worker/src/dto/worker.dto.ts)

- 目标：
  - 对齐 Browser step 请求和返回 DTO
- 本批重点：
  - 对齐 `ExecuteStepDto`
  - 对齐 `ExecuteStepResultDto`
  - 明确最小输出：`output / error / snapshot / shouldTakeover`
- 不在本批展开：
  - 完整验证结果扩展
  - 文档 runtime / API runtime DTO
- 完成信号：
  - `control-plane` 与 `browser-worker` 可按统一 DTO 联调

### 文件 7：[browser.service.ts](file:///d:/workspace/ops-automation/services/browser-worker/src/modules/browser/browser.service.ts)

- 目标：
  - 稳定 Browser step 执行和 freeze/resume 配合
- 本批重点：
  - 对齐 step 执行入参与返回值
  - 增加对 freeze/resume 控制的最小响应
  - 返回 takeover hint
- 不在本批展开：
  - 更细的异常分类
  - 复杂 trace 管理
- 完成信号：
  - Browser step 可以被统一调用
  - 接管时不会继续误推进

---

## 4. 并行拆分建议

### 任务线 A：`control-plane`

- [schema.prisma](file:///d:/workspace/ops-automation/services/control-plane/prisma/schema.prisma)
- [execution.dto.ts](file:///d:/workspace/ops-automation/services/control-plane/src/modules/execution/execution.dto.ts)
- [execution.service.ts](file:///d:/workspace/ops-automation/services/control-plane/src/modules/execution/execution.service.ts)

### 任务线 B：`session-broker`

- [runtime-session.service.ts](file:///d:/workspace/ops-automation/services/session-broker/src/modules/runtime-session/runtime-session.service.ts)
- [freeze.service.ts](file:///d:/workspace/ops-automation/services/session-broker/src/modules/freeze/freeze.service.ts)

### 任务线 C：`browser-worker`

- [worker.dto.ts](file:///d:/workspace/ops-automation/services/browser-worker/src/dto/worker.dto.ts)
- [browser.service.ts](file:///d:/workspace/ops-automation/services/browser-worker/src/modules/browser/browser.service.ts)

并行原则：

- A、B、C 可以同时开始
- 但 `execution.service.ts` 中的联调逻辑要在 B、C 的 DTO/状态收口后再合并

---

## 5. 建议提交顺序

### Commit 1：模型与状态对齐

- `control-plane/schema.prisma`
- `session-broker/runtime-session.service.ts`
- `session-broker/freeze.service.ts`

目标：

- 稳定两个真相源

### Commit 2：控制面 DTO 与状态入口

- `control-plane/execution.dto.ts`
- `control-plane/execution.service.ts`

目标：

- 让控制面真正成为主写入口

### Commit 3：Browser step 协议对齐

- `browser-worker/worker.dto.ts`
- `browser-worker/browser.service.ts`

目标：

- 让 Browser runtime 可以按统一协议接入

### Commit 4：后端主链联调修正

- 允许回到：
  - [execution.service.ts](file:///d:/workspace/ops-automation/services/control-plane/src/modules/execution/execution.service.ts)
  - [runtime-session.service.ts](file:///d:/workspace/ops-automation/services/session-broker/src/modules/runtime-session/runtime-session.service.ts)
  - [browser.service.ts](file:///d:/workspace/ops-automation/services/browser-worker/src/modules/browser/browser.service.ts)

目标：

- 打通 create -> runtime allocate -> execute-step -> takeover/resume

---

## 6. 本批完成后的进入条件

以下条件满足后，才建议进入第二批：

- `Execution.status` 单写入口已成立
- `RuntimeSession.state` 单写入口已成立
- Browser step 可通过统一 DTO 执行
- `control-plane + session-broker + browser-worker` 已完成最小联调
- 接管和恢复可在无 Portal 改造前打通

如果以上条件不满足，不建议进入：

- `ai-orchestrator` 结构化 planner 改造
- `portal` 入口切换

---

## 7. 第二批预告

第二批再进入这些文件：

- [interfaces.ts](file:///d:/workspace/ops-automation/services/ai-orchestrator/src/modules/react-engine/interfaces.ts)
- [react-engine.service.ts](file:///d:/workspace/ops-automation/services/ai-orchestrator/src/modules/react-engine/react-engine.service.ts)
- [prompt-builder.ts](file:///d:/workspace/ops-automation/services/ai-orchestrator/src/modules/react-engine/prompt-builder.ts)
- [execution.ts](file:///d:/workspace/ops-automation/services/portal/src/api/execution.ts)
- [ExecutionListPage.tsx](file:///d:/workspace/ops-automation/services/portal/src/pages/ExecutionListPage.tsx)
- [ExecutionDetailPage.tsx](file:///d:/workspace/ops-automation/services/portal/src/pages/ExecutionDetailPage.tsx)
- [InlineRecoveryPanel.tsx](file:///Users/chain/Documents/MyProject/ops-automation/apps/frontend/portal/src/components/execution/InlineRecoveryPanel.tsx)

原因：

- 第二批的风险更偏协议替换和前后端联调
- 必须建立在第一批后端主链稳定的前提上

---

## 8. 一句话总结

这份 `First Change Set` 的核心判断是：

> 第一次正式开工不要同时碰 Planner 和 Portal，先把 `control-plane + session-broker + browser-worker` 这一批后端关键文件收稳，Browser MVP 主链才真正有落地基础。
