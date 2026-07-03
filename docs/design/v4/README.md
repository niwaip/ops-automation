# v4 设计文档导航

当前实施基线：`v4`

本文用于说明 `docs/design/v4/` 目录下各类文档的定位，避免把“现状说明”“当前基线”“目标态设计”“迁移待办”混为一谈。

## 浏览器文档分层

### 1. 当前执行基线

- 浏览器执行指南：[Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md)
  - 适合回答：录制态 AI/planner 该输出什么、动作和 locator 应遵守什么规则。

### 2. 目标态设计

- 编排层重建设计书：[Enterprise-Skill-Platform_Orchestration-Reconstruction-Blueprint_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Reconstruction-Blueprint_v4.0.md)
  - 适合回答：目录重构基本完成后，编排层下一阶段应如何从“目录分层”走向“职责分层”，以及 `execution.service.ts`、`RecorderDebugService`、`planner`、`react-engine` 的目标治理方向。
- Browser Loop Workflow 控制改造：[Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md)
  - 适合回答：loop 为什么要提升为 workflow 可见模型，以及最终的 loop-aware plan 应该长什么样。
- Browser Phase 执行与恢复：[Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md)
  - 适合回答：phase、接管、恢复、执行 DTO 与前端 phase 展示的目标边界。
- Recorder 统一结果与快照复用草案：[Enterprise-Skill-Platform_Recorder-Unified-Outcome-and-Snapshot-Reuse-Draft_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Unified-Outcome-and-Snapshot-Reuse-Draft_v4.1.md)
  - 适合回答：recorder-debug 为什么需要统一 outcome 协议、如何复用页面快照做 grounding/verification，以及如何从 reply 驱动演进为证据化结果层。
- Recorder Outcome TypeSpec 草案：[Enterprise-Skill-Platform_Recorder-Outcome-TypeSpec_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Outcome-TypeSpec_v4.1.md)
  - 适合回答：统一结果方案在后端 DTO、前端响应与 session history 上应如何建模，以及 `outcome / observation / diff / verification` 应如何与现有 recorder-debug 类型兼容演进。
- Recorder Verification Rules 草案：[Enterprise-Skill-Platform_Recorder-Verification-Rules_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Verification-Rules_v4.1.md)
  - 适合回答：`Selection / DetailOpen / Fill / Navigation` 四类 verifier 应如何定义统一输入输出、检查项、短路条件、失败原因与实现落点。
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

- 后端迁移设计书：[Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md)
  - 适合回答：当前后端迁移的真实基线是什么、应按什么原则推进、哪些模块先拆职责再搬目录、未来 90 天的实施顺序是什么。
- `release-manager / capability-release` 拆分方案：[release-manager-capability-release-split-plan_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/release-manager-capability-release-split-plan_v4.1.md)
  - 适合回答：`capability-release` 应如何先在原目录拆成 `release / compiler / validator / publisher / audit`，以及首轮 PR 应该先动哪一刀。
- `release-manager / capability-release` 第一批 PR 任务分解：[release-manager-capability-release-pr-breakdown_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/release-manager-capability-release-pr-breakdown_v4.1.md)
  - 适合回答：`capability-release` 第一批 PR 应按什么顺序拆、每个 PR 改哪些文件、验证哪些测试、如何设置回滚点。
- `release-manager` 结构验收记录：[release-manager-structure-acceptance-record_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/release-manager-structure-acceptance-record_v4.1.md)
  - 适合回答：当前 `release-manager` 结构承接已经落到哪一层、这一批验证了什么、还有哪些遗留问题尚未进入更高风险切换。
- 后端目标平面结构验收记录：[backend-structure-acceptance-record_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/backend-structure-acceptance-record_v4.1.md)
  - 适合回答：当前 `governance / intelligence / registry-release` 目标平面的结构落地到了哪一层、哪些子层已脱离纯壳、哪些问题仍停留在真实实现迁移阶段。
- `workflow-registry / temporal-workflow` 拆分方案：[workflow-registry-temporal-workflow-split-plan_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/workflow-registry-temporal-workflow-split-plan_v4.1.md)
  - 适合回答：`temporal-workflow` 中哪些逻辑仍属于设计时注册面，哪些应外移到 `browser-domain`、`release-manager` 或运行时平面，以及第一刀该如何拆。
- `browser-domain / ai-orchestrator browser` 拆分方案：[browser-domain-ai-orchestrator-browser-split-plan_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/browser-domain-ai-orchestrator-browser-split-plan_v4.1.md)
  - 适合回答：`ai-orchestrator/modules/browser` 应如何先和主 Planner 解耦，再按 `recorder / observation / session / export / runtime-facade / intent` 收敛成可迁移结构。
- 迁移计划：[Enterprise-Skill-Platform_Migration-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Migration-Plan_v4.0.md)
- 开发 Backlog：[Enterprise-Skill-Platform_Development-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Development-Backlog_v4.0.md)
- Story Breakdown：[Enterprise-Skill-Platform_Story-Breakdown_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Story-Breakdown_v4.0.md)
- 编排层重建实施 Backlog：[Enterprise-Skill-Platform_Orchestration-Reconstruction-Implementation-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Reconstruction-Implementation-Backlog_v4.0.md)
  - 适合回答：编排层下一阶段应该按什么批次实施、每批改什么、验证什么、如何控制回归范围。
- 编排层 Batch R1 详细方案：[Enterprise-Skill-Platform_Orchestration-Batch-R1-Execution-Query-Refactor-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R1-Execution-Query-Refactor-Plan_v4.0.md)
  - 适合回答：`execution.service.ts` 的查询读路径第一刀应该怎么拆、先迁哪些方法、验证哪些接口和页面。
- 编排层 Batch R4 详细方案：[Enterprise-Skill-Platform_Orchestration-Batch-R4-Execution-Module-Export-Convergence-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R4-Execution-Module-Export-Convergence-Plan_v4.0.md)
  - 适合回答：`ExecutionModule exports` 应该如何收敛、先审计哪些外部消费点、如何避免收缩后模块注入回归。
- 编排层 Batch R5 详细方案：[Enterprise-Skill-Platform_Orchestration-Batch-R5-Browser-Submodule-Gateway-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R5-Browser-Submodule-Gateway-Plan_v4.0.md)
  - 适合回答：`browser/observe`、`loop`、`export`、`session` 应该如何补齐目录网关，以及哪些 import 应优先收敛。
- 编排层 Batch R6 详细方案：[Enterprise-Skill-Platform_Orchestration-Batch-R6-Recorder-Debug-Session-Facade-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R6-Recorder-Debug-Session-Facade-Plan_v4.0.md)
  - 适合回答：`RecorderDebugService` 的第一刀瘦身应该先拆哪类职责，以及 `recorder-debug-session.facade.ts` 应该承接什么能力。
- 编排层 Batch R7 详细方案：[Enterprise-Skill-Platform_Orchestration-Batch-R7-Recorder-Debug-Facade-Slimming-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R7-Recorder-Debug-Facade-Slimming-Plan_v4.0.md)
  - 适合回答：`RecorderDebugService` 在抽出 session facade 之后，下一步应该如何继续收敛成薄 Facade，以及哪些 helper 最适合继续下沉。
- 编排层 Batch R8 详细方案：[Enterprise-Skill-Platform_Orchestration-Batch-R8-Planner-Skill-Read-Path-Refactor-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R8-Planner-Skill-Read-Path-Refactor-Plan_v4.0.md)
  - 适合回答：`planner.service.ts` 的第一刀为什么应优先拆技能读取/缓存/匹配读路径，以及首轮 PR 应如何控制范围。
- 编排层 Batch R9 详细方案：[Enterprise-Skill-Platform_Orchestration-Batch-R9-Planner-Plan-Generation-Refactor-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R9-Planner-Plan-Generation-Refactor-Plan_v4.0.md)
  - 适合回答：`planner.service.ts` 在收敛 skill 读路径之后，下一步应如何拆出 plan generation 与 document semantic shaping。
- 编排层 Batch R10 详细方案：[Enterprise-Skill-Platform_Orchestration-Batch-R10-Planner-Param-Recognition-Refactor-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R10-Planner-Param-Recognition-Refactor-Plan_v4.0.md)
  - 适合回答：`planner.service.ts` 最复杂的参数识别、waiting-input 恢复与 `required_inputs` 计算，应该如何单独拆到 `params/`。
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
12. 编排层重建设计书：
   [Enterprise-Skill-Platform_Orchestration-Reconstruction-Blueprint_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Reconstruction-Blueprint_v4.0.md)
13. 编排层重建实施 Backlog：
   [Enterprise-Skill-Platform_Orchestration-Reconstruction-Implementation-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Reconstruction-Implementation-Backlog_v4.0.md)
14. 编排层 Batch R1 详细方案：
   [Enterprise-Skill-Platform_Orchestration-Batch-R1-Execution-Query-Refactor-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R1-Execution-Query-Refactor-Plan_v4.0.md)
15. 编排层 Batch R4 详细方案：
   [Enterprise-Skill-Platform_Orchestration-Batch-R4-Execution-Module-Export-Convergence-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R4-Execution-Module-Export-Convergence-Plan_v4.0.md)
16. 编排层 Batch R5 详细方案：
   [Enterprise-Skill-Platform_Orchestration-Batch-R5-Browser-Submodule-Gateway-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R5-Browser-Submodule-Gateway-Plan_v4.0.md)
17. 编排层 Batch R6 详细方案：
   [Enterprise-Skill-Platform_Orchestration-Batch-R6-Recorder-Debug-Session-Facade-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R6-Recorder-Debug-Session-Facade-Plan_v4.0.md)
18. 编排层 Batch R7 详细方案：
   [Enterprise-Skill-Platform_Orchestration-Batch-R7-Recorder-Debug-Facade-Slimming-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R7-Recorder-Debug-Facade-Slimming-Plan_v4.0.md)
19. 编排层 Batch R8 详细方案：
   [Enterprise-Skill-Platform_Orchestration-Batch-R8-Planner-Skill-Read-Path-Refactor-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R8-Planner-Skill-Read-Path-Refactor-Plan_v4.0.md)
20. 编排层 Batch R9 详细方案：
   [Enterprise-Skill-Platform_Orchestration-Batch-R9-Planner-Plan-Generation-Refactor-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R9-Planner-Plan-Generation-Refactor-Plan_v4.0.md)
21. 编排层 Batch R10 详细方案：
   [Enterprise-Skill-Platform_Orchestration-Batch-R10-Planner-Param-Recognition-Refactor-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Batch-R10-Planner-Param-Recognition-Refactor-Plan_v4.0.md)
