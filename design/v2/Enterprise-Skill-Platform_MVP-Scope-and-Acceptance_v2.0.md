# 企业级 Skill 平台 MVP 范围与验收标准

**MVP Scope and Acceptance v2.0**  
日期：2026-04-19

> 本文用于定义企业级 Skill 平台第一阶段的最小交付边界，解决“概念很多、目标很大、但开发难以收口”的问题。

---

## 1. 文档目标

本文回答以下问题：

- 第一阶段到底要交付什么
- 哪些能力必须做成
- 哪些能力明确不做
- 什么叫“做完了”
- 如何用当前仓库的现有基础快速落地 MVP

---

## 2. MVP 定义

本项目的 MVP 不是“做一个更强的 Agent”，而是：

> 交付一条可治理、可执行、可接管、可审计的企业级 Skill 执行闭环。

换句话说，MVP 的重点是：

- 让 Skill 成为正式交付对象
- 让 Execution 成为正式业务主对象
- 让高风险步骤能够审批和接管
- 让执行结果可回看、可追溯、可归档

---

## 3. MVP 成功标准

若满足以下 5 条，则可视为 MVP 完成：

- 平台可注册并发布至少一类正式 Skill
- 用户可发起一次正式 Execution，并看到完整执行状态流转
- 高风险步骤可触发审批或人工接管
- 执行全过程可产生 step 级日志与产物索引
- 关键状态和审计信息不依赖进程内存保存

---

## 3.1 MVP 通过口径

MVP 通过不以“服务数量”或“页面数量”为标准，而以“闭环是否成立”为标准。

第一阶段默认采用以下口径：

- 至少 1 条浏览器类 Skill 闭环正式上线可演示
- 至少 1 条高风险步骤审批链路可演示
- 至少 1 条人工接管链路可演示
- 至少 1 条失败归档链路可演示

若仅满足以下情况，则不应算 MVP 完成：

- 页面做出来了，但主对象没有收口
- 执行能跑，但审计仍是内存态
- 有接管按钮，但没有正式状态机和恢复路径

---

## 4. MVP In-Scope

### 4.1 Skill 管理

必须包含：

- Skill 注册
- SkillVersion 创建
- SkillVersion 发布
- SkillVersion 停用
- 基础权限控制

MVP 不要求：

- 自动化版本比较
- 自动补丁生成
- 多版本灰度发布

---

## 4.2 Execution 闭环

必须包含：

- 创建 `Execution`
- 为 `Execution` 生成计划
- 分配 `RuntimeSession`
- 执行 step
- 记录 step log
- 汇总执行结果

必须支持的状态：

- `draft`
- `queued`
- `running`
- `pending_approval`
- `human_control`
- `succeeded`
- `failed`
- `cancelled`

MVP 可以暂不支持：

- `rolled_back`
- 复杂的 `paused` / `waiting_input`

---

## 4.3 Runtime 管理

必须包含：

- `RuntimeSession` 创建
- 浏览器 Runtime 分配
- 冻结
- 恢复
- 关闭
- 运行时健康检测的最小实现

MVP 不要求：

- 多 Runtime 联合编排
- 自动跨节点迁移
- 高级资源调度器

---

## 4.4 审批与接管

必须包含：

- 高风险 Execution 可触发审批
- 执行中关键步骤可触发接管
- 审批通过后可继续执行
- 接管完成后可从指定 step 恢复

MVP 不要求：

- 双人审批
- 审批链模板编排
- SLA 升级流转

---

## 4.5 审计与可观测性

必须包含：

- 记录谁发起了 Execution
- 使用了哪个 SkillVersion
- 进入过哪些关键状态
- 执行了哪些 step
- 是否发生审批
- 是否发生接管
- 最终产出了哪些 Artifact

MVP 不要求：

- 完整观测平台
- 复杂 BI 报表
- 全链路时序分析

---

## 4.6 Portal 最小功能

必须包含：

- Skill 列表页
- 执行发起页
- Execution 详情页
- 审批处理页
- 接管入口页
- 审计查看页

MVP 不要求：

- 全量运营后台
- 高级分析面板
- 复杂组织级配置中心

---

## 5. MVP Out-of-Scope

以下能力明确不作为第一阶段交付目标：

- 组织级正式 Memory 子系统
- Evaluation / Evolution 子系统
- 候选补丁自动生成与推广
- 多 Runtime 并行计划优化
- 完全自治的高权限 Agent
- 全量企业系统连接器平台
- 复杂文档工作流编排

---

## 5.1 范围冻结规则

第一阶段一旦进入开发，应冻结以下范围，避免 MVP 不断膨胀：

- 不新增 Memory 子系统正式需求
- 不新增 Evolution 自动进化需求
- 不新增“完全自治”类高权限 Agent 需求
- 不新增超过 2 类核心业务场景
- 不因为单个客户场景临时扩张平台主模型

若必须新增需求，应同时满足：

- 不改变 `Execution`、`RuntimeSession`、`ApprovalRequest` 的主边界
- 不影响第一阶段 4 个验收场景
- 不导致新增核心服务拆分

---

## 6. MVP 推荐业务场景

MVP 阶段建议只选 2 类场景：

### 场景 A：浏览器类 Skill

例如：

- 受控表单填写
- 企业内部系统录入
- 需要接管的浏览器提交流程

原因：

- 当前仓库已有 `session-broker`、`browser-worker`、`replay-engine` 的基础

### 场景 B：文档类 Skill

例如：

- 模板参数生成
- 文档渲染
- 文档草稿生成

原因：

- 当前仓库已有 `template`、`carbone-engine`、`report` 的基础

不建议第一阶段选择：

- 横跨多个内部系统的大型编排场景
- 强依赖复杂 Memory 的长期任务

---

## 7. MVP 目标服务边界

第一阶段建议只强制落以下服务：

- `auth-identity-service`
- `skill-control-plane`
- `skill-orchestrator`
- `policy-service`
- `runtime-manager`
- `browser-runtime`
- `execution-engine`
- `template-service`
- `artifact-service`
- `portal`

第一阶段可暂时不独立成服务：

- `document-runtime`
- `memory-service`
- `evaluation-service`
- `evolution-service`

其中：

- `document-runtime` 可先以内聚模块存在于现有文档服务中
- `memory-service` 等后续再拆

---

## 8. 当前仓库复用策略

### 可直接复用

- `template` 的模板生命周期
- `replay-engine` 的 step 执行和日志能力
- `session-broker` 的 freeze / lock / allocation 基础
- `portal` 的前端入口框架

### 需要重构后复用

- `auth` 中的 Skill 管理
- `ai-orchestrator` 中的工具与模型状态管理
- `control-plane` 的代理模式
- `browser-worker` 的 worker 管理模式

### 不建议延续的实现方式

- 内存态审计
- 内存态 Agent / 文件存储
- `session` 同时代表业务执行和运行时资源
- 多服务各写一套执行状态

---

## 9. MVP 级交付对象

第一阶段至少要有以下正式对象：

### 主对象

- `Skill`
- `SkillVersion`
- `Execution`
- `ExecutionStep`
- `RuntimeSession`
- `ApprovalRequest`
- `Artifact`
- `Policy`

### 非正式对象

以下对象可后续补：

- `MemoryItem`
- `Evaluation`
- `CandidatePatch`
- `Promotion`

---

## 10. MVP 最小 API 集合

### Skill Control Plane

必须提供：

- `POST /skills`
- `GET /skills`
- `POST /skill-versions`
- `POST /skill-versions/{id}/publish`
- `POST /executions`
- `GET /executions/{id}`
- `POST /executions/{id}/status`
- `POST /executions/{id}/approval-requests`
- `POST /approval-requests/{id}/decision`

### Skill Orchestrator

必须提供：

- `POST /orchestrations/plan`
- `POST /orchestrations/verify`

### Policy Service

必须提供：

- `POST /policies/evaluate`

### Runtime Manager

必须提供：

- `POST /runtime-sessions`
- `POST /runtime-sessions/{id}/freeze`
- `POST /runtime-sessions/{id}/resume`
- `POST /runtime-sessions/{id}/close`

### Execution Engine

必须提供：

- `POST /executions/{id}/run`
- `POST /executions/{id}/resume`
- `GET /executions/{id}/steps`
- `GET /executions/{id}/summary`

### Artifact Service

必须提供：

- `POST /artifacts`
- `GET /artifacts/{id}`

---

## 11. MVP 验收场景

以下 4 个验收场景建议作为第一阶段必测清单。

---

## 11.1 场景一：低风险浏览器 Skill 成功执行

给定：

- 一个已发布的浏览器类 Skill
- 用户有执行权限

当：

- 用户提交任务

则：

- 创建 `Execution`
- 创建 `RuntimeSession`
- 执行 step
- 产生日志
- 最终状态为 `succeeded`

验收通过条件：

- Portal 可看到完整状态流转
- 可查询 step log
- 可查询 Artifact

---

## 11.2 场景二：高风险步骤触发审批

给定：

- 一个高风险 SkillVersion 或 step

当：

- 执行进入高风险区域

则：

- `policy-service` 返回 `require_approval`
- Execution 状态进入 `pending_approval`
- 创建 `ApprovalRequest`

验收通过条件：

- 审批通过前，执行不得继续
- 审批通过后，可继续执行
- 审批拒绝后，Execution 进入 `cancelled`

---

## 11.3 场景三：执行中触发人工接管

给定：

- 一次运行中的浏览器 Execution

当：

- 出现验证码、MFA 或 UI 偏移

则：

- Execution 进入 `human_control`
- RuntimeSession 进入冻结态
- 接管人可进入同一 RuntimeSession

验收通过条件：

- 接管期间 Agent 不继续输入
- 接管完成后可从指定 step 继续
- 审计中可看到接管记录

---

## 11.4 场景四：执行失败并完成审计归档

给定：

- 一次执行失败

当：

- 重试耗尽

则：

- Execution 进入 `failed`
- 生成失败摘要
- 关闭 RuntimeSession
- 审计记录完整保留

验收通过条件：

- 能查询失败 step
- 能查询失败原因
- 能看到 Execution、RuntimeSession、Approval、Artifact 的关联信息

---

## 12. MVP 数据持久化要求

以下数据不得只存在内存中：

- `Execution`
- `ExecutionStep`
- `RuntimeSession` 主数据
- `ApprovalRequest`
- `Audit`
- `Artifact` 元数据

以下数据允许短期在 Redis 中保存，但必须有主数据落库：

- 当前运行状态
- lease
- lock
- current_step

以下数据可放对象存储：

- 截图
- trace
- 文档结果
- 模板包

---

## 13. MVP 安全要求

第一阶段最小安全要求如下：

- 不允许使用默认 JWT secret 进入正式环境
- 不允许继续把关键 API Key 以本地 JSON 文件作为正式方案
- 高风险动作必须走策略判定
- 接管入口必须有鉴权
- 审计日志必须脱敏

---

## 14. MVP 测试要求

第一阶段至少应包含以下测试层次：

### 契约测试

- Service API 输入输出契约
- 状态转换合法性

### 集成测试

- `skill-control-plane` 与 `policy-service`
- `runtime-manager` 与 `execution-engine`
- `execution-engine` 与 `artifact-service`

### 端到端测试

- 低风险成功执行
- 高风险审批
- 人工接管
- 执行失败归档

说明：

- 现有 E2E 测试可保留，但应逐步减少对 mock token 和弱断言的依赖

---

## 15. MVP 里程碑拆分

### M1：主模型收敛

交付：

- `Execution`
- `RuntimeSession`
- 统一状态机

出口条件：

- `Execution` 与 `RuntimeSession` 主对象已拍板
- 不再使用 `session` 代表业务执行主状态
- 至少一套主状态写路径已收口

### M2：执行链路跑通

交付：

- 浏览器类 Skill 正式执行闭环
- step log
- Artifact

出口条件：

- 可从 Portal 发起一次正式 Execution
- 可看到 step 级执行记录
- 执行完成后可查询 Artifact

### M3：治理闭环跑通

交付：

- Approval
- Takeover
- Audit

出口条件：

- 高风险步骤可进入 `pending_approval`
- 接管后可从指定 step 恢复
- 审计信息已持久化

### M4：Portal 体验收口

交付：

- Skill 列表
- Execution 工作台
- 审批中心
- 接管入口
- 审计视图

出口条件：

- 非研发角色可完成演示路径
- 页面不再依赖多个下游状态拼装“伪主状态”

---

## 16. 不通过验收的典型情况

以下情况出现任一项，MVP 不应判定为完成：

- 执行状态仍依赖多个服务分别维护
- 审批只是前端弹窗，没有正式对象
- 接管只是临时逻辑，没有状态收口
- 审计日志仍是内存态
- 核心对象 ownership 没有明确
- Portal 无法完整查看一次执行的闭环信息

---

## 16.1 上线前检查清单

MVP 准备对外演示或进入试运行前，建议至少完成以下检查：

- 所有关键服务地址已统一命名
- 默认 JWT secret 已移除
- API Key 不再以本地 JSON 作为正式方案
- Approval / Takeover / Audit 至少各完成 1 条真实验证
- Portal 可查看单次 Execution 的完整链路
- E2E 至少覆盖成功、审批、接管、失败四类场景

---

## 17. 建议的第一阶段团队分工

建议按三条线并行推进：

### 架构与主数据线

- 定义 `Execution` / `RuntimeSession` / `ApprovalRequest`
- 收口 ownership
- 输出最终接口合同

### 执行与运行时线

- 改造 `replay-engine`
- 改造 `session-broker`
- 改造 `browser-worker`

### 门户与治理线

- 改造 `control-plane`
- 改造 `portal`
- 建审批中心、接管入口、Execution 工作台

---

## 18. 结论

MVP 的关键不是“做很多”，而是“把第一条正式闭环做完整”。

一句话总结：

> 只要第一阶段能把 `Skill -> Execution -> RuntimeSession -> Approval/Takeover -> Artifact/Audit` 这条链路做成，项目就真正进入了企业级 Skill 平台的轨道。
