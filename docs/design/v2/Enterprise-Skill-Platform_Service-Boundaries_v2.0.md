# 企业级 Skill 平台服务边界映射

**Service Boundaries v2.0**  
日期：2026-04-19

> 本文用于把当前仓库的服务现状映射到目标平台架构，帮助后续重构时避免“新概念”与“旧代码”脱节。

---

## 1. 目标

本文回答三个问题：

- 当前仓库里每个服务实际在承担什么职责
- 它们在目标平台里应该归属于哪一层
- 后续应该如何收敛服务边界，减少概念漂移

---

## 2. 目标平台服务边界

建议目标服务边界如下：

- `skill-control-plane`
- `skill-orchestrator`
- `policy-service`
- `memory-service`
- `evaluation-service`
- `evolution-service`
- `runtime-manager`
- `browser-runtime`
- `document-runtime`
- `template-service`
- `artifact-service`
- `auth-identity-service`

这些服务对应的平台分层为：

- Control Plane：`skill-control-plane`、`policy-service`、`auth-identity-service`
- Orchestration：`skill-orchestrator`
- Runtime：`runtime-manager`、`browser-runtime`、`document-runtime`
- Capability / Artifact：`template-service`、`artifact-service`
- Memory / Evolution：`memory-service`、`evaluation-service`、`evolution-service`

---

## 3. 当前仓库服务现状

当前主要服务包括：

- `auth`
- `ai-orchestrator`
- `session-broker`
- `browser-worker`
- `browser-template` (formerly `template`)
- `control-plane`
- `report`
- `carbone-engine`
- `portal`
- `office-addin`

这些服务并不是错误的，但其命名和职责边界仍停留在“浏览器自动化 + 辅助服务”的阶段，没有完全转向“企业级 Skill 平台”。

---

## 4. 当前到目标的映射建议

### 4.1 `auth`

当前职责：

- 用户认证
- 基础 RBAC
- 用户管理
- 一部分 skill 与 execution-flow 管理接口

目标归属：

- `auth-identity-service`
- 部分 skill 元数据能力未来应迁回 `skill-control-plane`

建议：

- 保留身份、用户、角色、权限模型
- 将 Skill 注册、Skill 发布等平台主能力逐步从 `auth` 中剥离
- 把它收敛为身份与授权基础设施，而不是业务控制中心

### 4.2 `ai-orchestrator`

当前职责：

- 模型调用
- 工具执行
- react 风格编排
- 参数识别与决策

目标归属：

- `skill-orchestrator`

建议：

- 强化目标理解、Skill 选择、执行规划、结果验证职责
- 减少对具体业务资源的直接拥有
- 与 `policy-service`、`memory-service`、`runtime-manager` 建立清晰调用边界

### 4.3 `session-broker`

当前职责：

- 会话创建
- worker 分配
- Redis 锁
- 冻结 / 解冻
- 执行状态维护

目标归属：

- `runtime-manager`

建议：

- 专注管理 RuntimeSession，而不是承担越来越多业务语义
- 保持 session、allocation、lease、lock、freeze/resume 的单一职责
- 与具体 Browser Runtime 实现解耦

### 4.4 `browser-worker`

当前职责：

- 浏览器控制
- codegen API 调用
- 浏览器会话模拟
- recorder 相关能力

目标归属：

- `browser-runtime`

建议：

- 以稳定执行和托管浏览器会话为中心
- 提供标准化 browser capability，而不是混合很多演示型接口
- 明确 profile、snapshot、step log、freeze、health 的正式协议

### 4.5 `browser-template` (formerly `template`)

当前职责：

- 模板编译
- 模板校验
- 模板服务接口

目标归属：

- `template-service`

建议：

- 强化模板作为 Skill 构建资产的定位
- 支持浏览器模板、参数 schema、验证规则、模板版本
- 不再只是“录制产物转换器”

### 4.6 `control-plane`

当前职责：

- API 代理
- 认证中间件
- 审计模块雏形

目标归属：

- 当前更像临时 `gateway`
- 长期应升级为 `skill-control-plane`

建议：

- 从代理层升级为真正的治理层
- 接管 Skill registry、publish、approval、audit index、policy binding
- 不建议继续只是下游代理壳

### 4.7 `report`

当前职责：

- 报告生成
- 模板管理
- 分析与通知

目标归属：

- 一部分属于 `artifact-service`
- 一部分属于 `document-runtime`

建议：

- 将“报告模板”和“报告产物”与 Skill 产物体系统一
- 输出应纳入 Artifact 模型和审批治理

### 4.8 `carbone-engine`

当前职责：

- 文档预览
- 文档结构处理
- AI identify 辅助
- Carbone 渲染

目标归属：

- `document-runtime`

建议：

- 作为文档类 Skill 的执行底座
- 与 `template-service` 协作，但不承担平台治理逻辑

### 4.9 `portal`

当前职责：

- 前端入口
- 任务、模板、会话、管理页

目标归属：

- Experience Layer

建议：

- 向“Skill 目录、Execution 工作台、审批中心、接管中心、审计视图”演进

### 4.10 `office-addin`

当前职责：

- Office 内部入口
- 文档能力入口

目标归属：

- Experience Layer

建议：

- 作为文档类 Skill 的业务入口
- 与平台共用 Skill、Approval、Artifact 体系

---

## 5. 推荐收敛后的服务责任

### `skill-control-plane`

拥有：

- Skill 注册
- SkillVersion 生命周期
- ApprovalRequest
- 发布、停用、回滚入口
- 审计索引

不拥有：

- 实际浏览器执行
- 文档渲染执行
- 长时会话资源分配

### `skill-orchestrator`

拥有：

- 目标理解
- Skill 选择
- 计划生成
- 结果验证
- 失败分流

不拥有：

- 长期身份认证
- 主动存储 Artifact 主数据
- Runtime 资源生命周期

### `policy-service`

拥有：

- 策略定义
- 风险评估
- 审批要求判断
- Runtime 限制判断

不拥有：

- 实际审批流程 UI
- Runtime 具体执行

### `runtime-manager`

拥有：

- RuntimeSession
- worker allocation
- lease / ttl
- lock / freeze / resume

不拥有：

- Skill 业务语义
- 文档模板规则

### `browser-runtime`

拥有：

- 浏览器托管
- step 执行
- snapshot
- human control protocol

不拥有：

- 用户权限裁决
- Skill 发布治理

### `document-runtime`

拥有：

- 模板渲染执行
- 文档预览与导出
- 文档执行时状态

### `template-service`

拥有：

- 模板定义
- 模板版本
- 模板编译与校验

### `artifact-service`

拥有：

- 产物索引
- 产物访问控制
- 文件引用与元数据

### `memory-service`

拥有：

- MemoryItem
- 检索
- 写入策略
- wiki/知识页索引

### `evaluation-service`

拥有：

- 执行质量评估
- 技术指标与业务指标

### `evolution-service`

拥有：

- CandidatePatch
- shadow / canary 结果
- promotion 候选输入

---

## 6. 推荐重构顺序

### 第一阶段：先统一命名与叙事

- 将 `control-plane` 从 gateway 视角升级为治理视角
- 将 `session-broker` 明确为 runtime manager
- 将 `browser-worker` 明确为 browser runtime

### 第二阶段：按职责收敛

- 从 `auth` 中剥离 Skill 治理职责
- 从 `report` 和 `carbone-engine` 中抽出统一 artifact/document runtime 视角

### 第三阶段：补齐新平台能力

- 新增 `policy-service`
- 新增 `memory-service`
- 新增 `evaluation-service`
- 新增 `evolution-service`

---

## 7. 对当前仓库最重要的提醒

当前最大的风险不是服务数量多，而是“同一个概念在不同服务里反复出现、边界不清”。

例如：

- Skill 元数据散落
- 执行状态和运行时状态纠缠
- 审计还不是平台级主对象
- 文档能力和产物能力尚未统一

因此，后续不是简单改服务名，而是要围绕统一领域对象重新切边界。

---

## 8. 结论

当前仓库已经具备向企业级 Skill 平台演化的基础，但仍需要从“多服务实现集合”收敛为“统一领域模型驱动的平台结构”。

服务边界收敛的原则是：

- 身份归身份
- 编排归编排
- Runtime 归 Runtime
- 治理归治理
- 记忆、评估、进化独立成正式子系统

这样后续能力增长时，架构才不会继续漂移。
