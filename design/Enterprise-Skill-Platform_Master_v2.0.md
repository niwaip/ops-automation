# 企业级 Skill 平台（Enterprise Skill Platform）

**Master 文档 v2.0**  
日期：2026-04-19

> 本文用于替代早期以 Browser Control Plane 为中心的架构叙事，重新定义项目的目标、分层、边界和演进路线。

---

## 1. 定位

本项目不再将“浏览器自动化”视为唯一中心能力，而是将其纳入一个更大的企业级 Skill 平台中。

平台的核心目标是：

- 将企业流程能力沉淀为可治理、可发布、可执行、可审计的 Skill
- 将浏览器、文档、模板、数据连接器等能力抽象为 Skill 可调用的原子能力
- 在企业内保证 Skill 的执行稳定、权限可控、风险可治理、结果可追溯
- 在受控边界内支持 Skill 的记忆沉淀与能力进化

一句话概括：

> 这是一个以 Skill 为交付单元、以 Runtime 为执行底座、以 Policy 为治理边界、以 Memory 为长期复利的企业级能力平台。

---

## 2. 核心设计原则

### 2.1 Skill 是一等公民

- Skill 不等于 prompt，也不等于脚本
- Skill 是可版本化、可授权、可审批、可审计的业务能力单元
- 浏览器模板、文档模板、知识规则、参数抽取器都服务于 Skill

### 2.2 LLM 负责理解与规划，不直接持有高权限

- LLM 负责目标理解、参数识别、任务分解、异常判断
- 真实写操作必须进入受控 Runtime，由确定性执行器落地
- 高风险动作必须通过 Policy 检查和审批状态机

### 2.3 Runtime 必须稳定、可回放、可接管

- 执行器必须支持 step log、断言、重试、暂停、恢复、人工接管
- 浏览器和文档类高价值执行域应优先走 deterministic execution
- 接管是正式能力，不是异常补丁

### 2.4 权限不是接口权限，而是委托权限

- 企业真正需要的是“谁能在什么条件下让哪个 Skill 做什么”
- 授权对象必须覆盖人、Skill、Capability、Runtime、Artifact、Memory
- 高风险任务默认不自治

### 2.5 Knowledge 与 Memory 是长期壁垒

- 原始资料不应直接作为长期运行时上下文
- 平台应建设组织级 wiki / 结构化知识层
- Memory 应分层治理，而不是简单保存聊天记录

### 2.6 Evolution 必须受控

- Skill 可以进化，但线上 published 版本不能被运行时直接篡改
- 进化必须经过观测、归因、评估、灰度、发布、回滚闭环

---

## 3. 产品目标

### 3.1 In-scope

- 企业内部 Skill 的注册、治理、执行、审计
- Browser Runtime、Document Runtime、Template Capability
- 人工审批、人工接管、任务续跑、风险分级
- Session / User / Org / Skill 分层记忆
- Skill 候选版本与评估闭环

### 3.2 Out-of-scope

- 完全无治理的自治 Agent
- 直接让模型自由读写所有内部系统
- 没有审批和回滚能力的高风险自动化
- 将所有知识问题等同于简单向量检索

---

## 4. 平台分层

### 4.1 Experience Layer

- Portal
- Chat UI
- Office Add-in
- Admin Console

职责：

- 人机交互
- 任务提交与参数补全
- 审批、接管、查看日志、查看产物

### 4.2 Skill Control Plane

- Skill Registry
- Skill Versioning
- Approval Workflow
- Access Control
- Policy Binding
- Audit Index

职责：

- 定义有哪些 Skill
- 谁能使用、编辑、发布 Skill
- 什么情况下需要审批、接管或阻断

### 4.3 Orchestration Layer

- Skill Router
- Planner
- Verifier
- Failure Classifier
- Result Normalizer

职责：

- 根据目标选 Skill
- 结合 Memory 和 Policy 形成执行计划
- 在执行后验证结果并决定继续、重试、审批或接管

### 4.4 Runtime Plane

- Browser Runtime
- Document Runtime
- API Runtime
- Future Code Runtime

职责：

- 托管实际执行会话
- 保证资源隔离、健康检查、重试和回收

### 4.5 Capability Plane

- Browser Actions
- Document Actions
- Template Actions
- File Actions
- Internal API Actions

职责：

- 提供 typed、可审计、可验证的原子能力

### 4.6 Memory & Knowledge Plane

- Session Memory
- User Memory
- Org Memory
- Skill Memory
- Knowledge Wiki

职责：

- 为执行提供上下文
- 为组织沉淀知识
- 为 Skill 进化提供可检索经验

### 4.7 Evaluation & Evolution Plane

- Execution Evaluation
- Candidate Patch Generation
- Shadow / Canary Validation
- Promotion / Rollback

职责：

- 观察结果
- 生成改进建议
- 评估新版本是否值得推广

---

## 5. 核心一等对象

- `Skill`
- `SkillVersion`
- `Execution`
- `ExecutionStep`
- `RuntimeSession`
- `Capability`
- `Policy`
- `ApprovalRequest`
- `Artifact`
- `MemoryItem`
- `Evaluation`
- `CandidatePatch`
- `Promotion`

这些对象共同组成平台的统一语言。后续所有服务拆分、权限设计、API 边界都应围绕这些对象，而不是围绕单个技术组件命名。

---

## 6. Skill 生命周期

推荐生命周期如下：

`draft -> review -> approved -> published -> deprecated -> revoked`

说明：

- `draft`：设计中，允许编辑和测试
- `review`：进入评审，检查能力边界、数据边界、风险等级
- `approved`：已通过评审，可等待上线
- `published`：线上可用版本
- `deprecated`：不推荐新调用，但保留兼容
- `revoked`：因风险或错误被强制停用

---

## 7. 执行状态机

推荐执行状态如下：

`draft -> queued -> running -> waiting_input -> pending_approval -> human_control -> paused -> succeeded / failed / cancelled / rolled_back`

关键说明：

- `waiting_input`：缺少参数、凭据或上下文
- `pending_approval`：治理态，等待审批人决策
- `human_control`：运行态，人工接管同一会话
- `rolled_back`：执行结果已被补偿或撤销

---

## 8. 权限与风险治理

### 8.1 权限层次

- 人对 Skill 的可见、执行、编辑、发布权限
- Skill 对 Capability 的使用权限
- Capability 对 Runtime 的调用权限
- 任务级风险判断
- 步骤级审批或接管判断

### 8.2 风险等级

- `S1`：建议与草稿类
- `S2`：辅助操作类
- `S3`：受控执行类
- `S4`：高危类，原则上不允许全自动

### 8.3 人工介入方式

- 预审批
- 运行中暂停审批
- 人工接管

---

## 9. 运行时策略

### 9.1 Browser Runtime

- 适合企业系统、门户、审批流等 Web 场景
- 使用 step 级日志、断言、快照、重试、接管
- Profile 作为企业资源治理对象，不是普通目录字符串

### 9.2 Document Runtime

- 负责模板编译、变量绑定、预览、渲染、导出
- 高价值输出应先进入草稿态，再决定是否提交或发送

### 9.3 API Runtime

- 用于企业内部系统、报表系统、审批接口等结构化调用
- 必须显式声明幂等性、重试策略、超时和影响范围

---

## 10. 记忆与知识策略

平台应支持以下记忆层：

- `Session Memory`：一次执行内的上下文
- `User Memory`：用户偏好、常用参数、习惯
- `Org Memory`：组织 SOP、术语、制度、模板
- `Skill Memory`：成功路径、失败模式、修复经验

同时应建设 `Knowledge Wiki`：

- 将原始文档蒸馏为结构化知识页
- 作为 Skill 与用户共同使用的知识中层
- 让检索、解释和权限控制更稳定

---

## 11. 演进路线

### MVP

- Skill 注册与执行
- Browser Runtime
- Template Capability
- 审批与接管状态机
- Step log 与 Artifact 存储

### v1

- Document Runtime
- Org Wiki
- Session / User / Skill Memory
- 更细粒度的 Policy

### v2

- Evaluation Service
- Candidate Patch
- Shadow / Canary
- Skill 进化闭环

### v3

- 多 Runtime 联合作业
- 企业 Skill Marketplace
- 跨团队能力共享与治理

---

## 12. 仓库与服务边界建议

建议后续服务边界围绕平台职责统一命名：

- `skill-control-plane`
- `skill-orchestrator`
- `policy-service`
- `memory-service`
- `evaluation-service`
- `evolution-service`
- `browser-runtime`
- `document-runtime`
- `template-service`
- `artifact-service`
- `auth-identity-service`

当前仓库中的 `auth`、`ai-orchestrator`、`session-broker`、`browser-worker`、`template`、`report`、`carbone-engine` 可逐步映射到上述边界中。

---

## 13. 结论

新的架构方向应从“Browser Control Plane”升级为“Enterprise Skill Platform”。

在这个新模型中：

- Browser 和 Document 是 Runtime
- Template 和 Report 是 Capability/Artifact 体系的一部分
- Skill 是一等业务能力单元
- Policy 与 Approval 是企业治理主轴
- Memory 与 Evolution 是长期竞争力来源

后续所有设计与实现，应以这个统一叙事为准绳。
