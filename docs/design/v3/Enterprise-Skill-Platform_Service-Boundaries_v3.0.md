# 企业级 Skill 平台 Agent OS 服务边界映射

**Service Boundaries v3.0**  
日期：2026-04-26

> 本文把当前仓库服务映射到 `Planner-only Agent OS` 目标架构，重点回答“现有服务保留什么、迁出什么、未来归属什么”，用于指导第一阶段实施时避免职责继续漂移。

---

## 1. 文档目标

本文回答以下问题：

- 当前仓库各服务在 `v3` 中应归属于哪一层
- 哪些服务可以原地升级，哪些应只保留部分职责
- 第一阶段哪些边界必须立刻收敛

---

## 2. `v3` 目标服务边界

`v3` 推荐目标边界如下：

- `execution-control-plane`
- `planner-service`
- `runtime-manager`
- `browser-runtime`
- `document-runtime`
- `policy-service`
- `memory-service`
- `evaluation-service`
- `evolution-service`
- `artifact-service`
- `skill-registry / release-service`
- `experience-apps`

第一阶段不要求把这些服务全部物理拆开，但必须先把逻辑边界稳定下来。

---

## 3. 当前服务到目标边界的映射

### 3.1 `control-plane`

当前能力：

- `Execution` API 雏形
- 审计模块雏形
- 代理转发能力

`v3` 目标归属：

- `execution-control-plane`

第一阶段保留：

- `Execution` 外部 API
- `Execution` 主状态管理
- 审批、接管、恢复入口
- 审计索引入口

第一阶段迁出或弱化：

- 单纯代理壳角色
- 与下游服务过度耦合的转发逻辑

结论：

- `control-plane` 是第一阶段最适合直接升级为正式控制面的服务

### 3.2 `ai-orchestrator`

当前能力：

- ReAct 推理与工具编排
- 参数识别
- 决策和失败分类
- 会话级上下文

`v3` 目标归属：

- `planner-service`

第一阶段保留：

- Goal 理解
- Skill 路由
- PlanDraft 生成
- 参数缺失识别
- 结果验证
- 失败分类

第一阶段迁出或弱化：

- 高权限工具直接执行
- 本地代码执行
- 对业务主状态的持有

结论：

- `ai-orchestrator` 不下线，但必须降级为 Planner

### 3.3 `session-broker`

当前能力：

- session 分配
- worker 分配
- Redis 锁
- freeze / resume
- 一部分执行状态维护

`v3` 目标归属：

- `runtime-manager`

第一阶段保留：

- `RuntimeSession` 分配与回收
- 资源锁和 lease
- freeze / resume
- worker / profile 绑定

第一阶段迁出或弱化：

- 业务执行状态
- 对 Execution 结果的判断

结论：

- `session-broker` 必须收敛为资源平面，不再承担业务语义

### 3.4 `browser-worker`

当前能力：

- 浏览器控制
- worker 管理
- recorder
- 浏览器步骤执行

`v3` 目标归属：

- `browser-runtime`

第一阶段保留：

- `browser_step` 执行
- 快照
- 健康检查
- Recorder / 接管支持

第一阶段补强：

- 标准 step 协议
- freeze / resume 协议一致性
- snapshot / artifact 输出标准化

结论：

- `browser-worker` 是 Browser Runtime 的直接承载体

### 3.5 `auth`

当前能力：

- 身份认证
- RBAC
- 用户管理
- Skill 和 execution-flow 管理
- capability-release
- temporal-workflow

`v3` 目标归属：

- `auth-identity-service`
- `skill-registry / release-service`

第一阶段保留：

- 身份认证
- RBAC
- capability-release
- temporal validate / sandbox

第一阶段迁出或弱化：

- 与 Skill 控制面强耦合的业务主入口

结论：

- `auth` 暂时继续承接身份和发布链，但后续 Skill 元数据控制面应逐步从身份域中剥离

### 3.6 `carbone-engine`

当前能力：

- 文档结构处理
- 渲染
- 预览

`v3` 目标归属：

- `document-runtime`

第一阶段保留：

- 预览
- 渲染
- 文档 runtime 能力

结论：

- 保持为文档运行时，不承担平台治理逻辑

### 3.7 `report`

当前能力：

- 报告生成
- 模板管理
- 通知

`v3` 目标归属：

- `artifact-service`
- 局部 `document-runtime`

第一阶段建议：

- 报表产物统一纳入 `Artifact` 模型
- 模板能力后续与 Skill 资产模型对齐

### 3.8 `portal`

当前能力：

- 前端主入口
- Execution 页面
- Capability Release 页面
- Execution 内联接管/恢复区

`v3` 目标归属：

- `experience-apps`

第一阶段目标页面：

- Execution 工作台
- Execution 详情页
- Approval Center
- Takeover Workbench
- Release Center

### 3.9 `office-addin`

当前能力：

- 文档类入口

`v3` 目标归属：

- `experience-apps`

第一阶段目标：

- 共用 Execution / Approval / Artifact 体系

### 3.10 `replay-engine`

当前能力：

- 执行、重试、接管、日志等旧链路

`v3` 目标归属：

- 部分思路归入 `execution-control-plane` 和 `browser-runtime`

第一阶段建议：

- 不继续扩散职责
- 将其视为迁移参考对象

---

## 4. 第一阶段必须收敛的边界

### 4.1 `Execution` 只在 `control-plane` 写

必须避免：

- `ai-orchestrator` 写主状态
- `session-broker` 写业务成功失败
- `portal` 直接拼接状态语义

### 4.2 `RuntimeSession` 只在 `session-broker` 写

必须避免：

- `control-plane` 直接写 runtime 状态
- `ai-orchestrator` 直接维护资源状态

### 4.3 Planner 只输出计划

必须避免：

- Planner 直接推动高风险外部动作
- Planner 通过自由工具调用绕过 Policy

---

## 5. 第一阶段推荐物理服务保持

为了降低改造成本，第一阶段建议保留现有物理服务，不急于大拆分：

- `control-plane`
- `ai-orchestrator`
- `session-broker`
- `browser-worker`
- `auth`
- `portal`

重点是先收敛“逻辑边界”和“写入边界”。

---

## 6. 第一阶段接口流向

推荐主链路：

- `portal -> control-plane`
- `control-plane -> ai-orchestrator`
- `control-plane -> policy decision`
- `control-plane -> session-broker`
- `control-plane -> browser-worker`
- `control-plane -> auth/capability-release`（发布链和后续演进链）

原则：

- `portal` 不直接依赖 runtime 细节
- `ai-orchestrator` 不直接依赖前端状态
- `session-broker` 不直接决定业务结果

---

## 7. 第二阶段预留边界

当第一阶段稳定后，再考虑继续拆出：

- `policy-service`
- `memory-service`
- `evaluation-service`
- `artifact-service`

但在第一阶段，这些可以先作为逻辑模块挂在现有服务里。

---

## 8. 一句话总结

`v3` 的服务收敛重点不是“立刻拆很多新服务”，而是：

> 先让现有服务只做自己该做的事，再决定哪些边界值得物理拆分。
