# v4 设计文档导航

当前实施基线：`v4`

本文用于说明 `docs/design/v4/` 目录下各类文档的定位，避免把“当前基线”“目标态设计”“迁移待办”和“一次性校验记录”混为一谈。

## 当前先读

- 浏览器执行指南：[Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md)
- Recorder 统一结果与快照复用草案：[Enterprise-Skill-Platform_Recorder-Unified-Outcome-and-Snapshot-Reuse-Draft_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Unified-Outcome-and-Snapshot-Reuse-Draft_v4.1.md)
- Browser Domain 统一逻辑视图：[browser-domain-logical-view_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/browser-domain-logical-view_v4.1.md)
- Browser Domain 发布边界梳理：[browser-domain-release-boundary_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/browser-domain-release-boundary_v4.1.md)
- 后端迁移设计书：[Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md)

## 浏览器专题

- Browser Loop Workflow 控制改造：[Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md)
- Browser Phase 执行与恢复：[Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md)
- Recorder Outcome TypeSpec 草案：[Enterprise-Skill-Platform_Recorder-Outcome-TypeSpec_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Outcome-TypeSpec_v4.1.md)
- Recorder Verification Rules 草案：[Enterprise-Skill-Platform_Recorder-Verification-Rules_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Verification-Rules_v4.1.md)
- Recorder Rollback 与恢复方案：[Enterprise-Skill-Platform_Recorder-Rollback-and-Recovery-Plan_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Rollback-and-Recovery-Plan_v4.1.md)
- Recorder Snapshot Identity 与 Diff 规则：[Enterprise-Skill-Platform_Recorder-Snapshot-Identity-and-Diff-Rules_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Recorder-Snapshot-Identity-and-Diff-Rules_v4.1.md)
- 浏览器语义规则版本化与模块重组方案：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Plan_v4.0.md)
- 浏览器语义规则版本化数据模型与发布回退流程：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-Data-and-Release-Flow_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-Data-and-Release-Flow_v4.0.md)
- Browser Semantics 服务 Schema 与模块蓝图：[Enterprise-Skill-Platform_Browser-Semantics-Service-Schema-and-Module-Blueprint_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantics-Service-Schema-and-Module-Blueprint_v4.0.md)

## 平台基线

- 总纲：[Enterprise-Skill-Platform_Master_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Master_v4.0.md)
- API 契约：[Enterprise-Skill-Platform_API-Contract-Spec_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_API-Contract-Spec_v4.0.md)
- Runtime 能力协议：[Enterprise-Skill-Platform_Runtime-Capability-Protocol-Spec_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Runtime-Capability-Protocol-Spec_v4.0.md)
- 稳定接口与外部能力架构：[Enterprise-Skill-Platform_Stable-Interface-and-External-Capability-Architecture_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Stable-Interface-and-External-Capability-Architecture_v4.0.md)
- Docker 与部署蓝图：[Enterprise-Skill-Platform_Docker-and-Deployment-Blueprint_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Docker-and-Deployment-Blueprint_v4.0.md)
- 统一能力模型与 Skill 发布：[Enterprise-Skill-Platform_Unified-Capability-Model-and-Skill-Publishing_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Unified-Capability-Model-and-Skill-Publishing_v4.0.md)

## 迁移与实施

- `release-manager / capability-release` 拆分方案：[release-manager-capability-release-split-plan_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/release-manager-capability-release-split-plan_v4.1.md)
- `release-manager / capability-release` 第一批 PR 任务分解：[release-manager-capability-release-pr-breakdown_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/release-manager-capability-release-pr-breakdown_v4.1.md)
- `workflow-registry / temporal-workflow` 拆分方案：[workflow-registry-temporal-workflow-split-plan_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/workflow-registry-temporal-workflow-split-plan_v4.1.md)
- `browser-domain / ai-orchestrator browser` 拆分方案：[browser-domain-ai-orchestrator-browser-split-plan_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/browser-domain-ai-orchestrator-browser-split-plan_v4.1.md)
- 编排层重建设计书：[Enterprise-Skill-Platform_Orchestration-Reconstruction-Blueprint_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Reconstruction-Blueprint_v4.0.md)
- 编排层重建实施 Backlog：[Enterprise-Skill-Platform_Orchestration-Reconstruction-Implementation-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Orchestration-Reconstruction-Implementation-Backlog_v4.0.md)
- 浏览器语义规则版本化与模块重组实施 Backlog：[Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Implementation-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Semantic-Rule-Versioning-and-Module-Reorg-Implementation-Backlog_v4.0.md)
- 迁移计划：[Enterprise-Skill-Platform_Migration-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Migration-Plan_v4.0.md)
- 开发 Backlog：[Enterprise-Skill-Platform_Development-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Development-Backlog_v4.0.md)
- Story Breakdown：[Enterprise-Skill-Platform_Story-Breakdown_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Story-Breakdown_v4.0.md)

## 使用说明

- 先看根目录的功能概要，再进入这里查详细设计。
- `Backlog`、`Migration Plan`、`Story Breakdown` 仍然是待办或迁移材料，不代表已经实现。
- 阶段性验收记录和兼容性检查不再作为主入口；只有在具体 backlog 或复盘中需要时再回看。
