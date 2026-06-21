# v4 设计文档导航

当前实施基线：`v4`

本文用于说明 `docs/design/v4/` 目录下各类文档的定位，避免把“现状说明”“当前基线”“目标态设计”“迁移待办”混为一谈。

## 浏览器文档分层

### 1. 当前执行基线

- 浏览器执行指南：[Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md)
  - 适合回答：录制态 AI/planner 该输出什么、动作和 locator 应遵守什么规则。

### 2. 目标态设计

- Browser Loop Workflow 控制改造：[Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md)
  - 适合回答：loop 为什么要提升为 workflow 可见模型，以及最终的 loop-aware plan 应该长什么样。
- Browser Phase 执行与恢复：[Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md)
  - 适合回答：phase、接管、恢复、执行 DTO 与前端 phase 展示的目标边界。
- 浏览器语义规则版本化与模块重组方案：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Plan_v4.0.md)
  - 适合回答：测试网站如何升级为评测站、业务语义规则如何版本化、浏览器目录如何按处理流程重组。
- Browser Mock ERP 评测站页面矩阵与任务集：[Enterprise-Skill-Platform_Browser-Mock-ERP-Evaluation-Site-Matrix_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Mock-ERP-Evaluation-Site-Matrix_v4.0.md)
  - 适合回答：`mock-erp` 具体应该有哪些页面、变体、样本数据、任务集和评测指标。
- 浏览器语义规则版本化数据模型与发布回退流程：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-Data-and-Release-Flow_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-Data-and-Release-Flow_v4.0.md)
  - 适合回答：规则集如何建模、如何治理、如何灰度发布、如何回退、如何回放验证。
- 浏览器语义规则 Domain 下沉分层改造方案：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Domain-Extraction-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Domain-Extraction-Plan_v4.0.md)
  - 适合回答：浏览器业务语义规则为什么适合下沉到 `domain`、哪些能力应保留在 `ai-orchestrator`、如何分阶段迁移。
- Browser Semantics 服务 Schema 与模块蓝图：[Enterprise-Skill-Platform_Browser-Semantics-Service-Schema-and-Module-Blueprint_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantics-Service-Schema-and-Module-Blueprint_v4.0.md)
  - 适合回答：`browser-semantics` 服务的表结构、DTO、模块拆分、运行时接口和首期开发顺序。
- Browser Login 命令动态规则联动与 AI Fallback 方案：[Enterprise-Skill-Platform_Browser-Command-Login-Dynamic-Profile-and-AI-Fallback-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Command-Login-Dynamic-Profile-and-AI-Fallback-Plan_v4.0.md)
  - 适合回答：`command-login` 如何从固定正则演进到受控动态 profile、如何与规则管理联动、以及规则不中时如何进入 AI fallback。

### 3. 迁移与待办

- 迁移计划：[Enterprise-Skill-Platform_Migration-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Migration-Plan_v4.0.md)
- 开发 Backlog：[Enterprise-Skill-Platform_Development-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Development-Backlog_v4.0.md)
- Story Breakdown：[Enterprise-Skill-Platform_Story-Breakdown_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Story-Breakdown_v4.0.md)
- 浏览器语义规则版本化与模块重组实施 Backlog：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Implementation-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Implementation-Backlog_v4.0.md)
  - 适合回答：测试网站、规则版本化、浏览器目录重组应该先做什么、分几期做、每期验收什么。

说明：

- 这三类文档仍然用于指导后续工作，但不应被理解为“已经全部实现”。

## 其他平台基线

- 总纲：[Enterprise-Skill-Platform_Master_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Master_v4.0.md)
- API 契约：[Enterprise-Skill-Platform_API-Contract-Spec_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_API-Contract-Spec_v4.0.md)
- Runtime 能力协议：[Enterprise-Skill-Platform_Runtime-Capability-Protocol-Spec_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Runtime-Capability-Protocol-Spec_v4.0.md)
- 稳定接口与外部能力架构：[Enterprise-Skill-Platform_Stable-Interface-and-External-Capability-Architecture_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Stable-Interface-and-External-Capability-Architecture_v4.0.md)
- Docker 与部署蓝图：[Enterprise-Skill-Platform_Docker-and-Deployment-Blueprint_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Docker-and-Deployment-Blueprint_v4.0.md)

## 建议阅读顺序

1. 根目录总览：
   [AI-Browser-Recording-End-to-End-Flow-and-Next-Steps_v1.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/AI-Browser-Recording-End-to-End-Flow-and-Next-Steps_v1.0.md)
2. 当前执行基线：
   [Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md)
3. 语义规则与模块重组方案：
   [Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Plan_v4.0.md)
4. `mock-erp` 页面矩阵与任务集：
   [Enterprise-Skill-Platform_Browser-Mock-ERP-Evaluation-Site-Matrix_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Mock-ERP-Evaluation-Site-Matrix_v4.0.md)
5. 语义规则版本化数据模型与发布回退流程：
   [Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-Data-and-Release-Flow_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-Data-and-Release-Flow_v4.0.md)
6. 语义规则 Domain 下沉分层改造方案：
   [Enterprise-Skill-Platform_Browser-Semantic-Rule-Domain-Extraction-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Domain-Extraction-Plan_v4.0.md)
7. Browser Semantics 服务 Schema 与模块蓝图：
   [Enterprise-Skill-Platform_Browser-Semantics-Service-Schema-and-Module-Blueprint_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantics-Service-Schema-and-Module-Blueprint_v4.0.md)
8. Browser Login 命令动态规则联动与 AI Fallback：
   [Enterprise-Skill-Platform_Browser-Command-Login-Dynamic-Profile-and-AI-Fallback-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Command-Login-Dynamic-Profile-and-AI-Fallback-Plan_v4.0.md)
9. 语义规则与模块重组实施 Backlog：
   [Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Implementation-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Implementation-Backlog_v4.0.md)
10. loop 目标态设计：
   [Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md)
11. phase / 接管恢复设计：
   [Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md)
