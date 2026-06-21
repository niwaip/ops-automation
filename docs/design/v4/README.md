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

### 3. 迁移与待办

- 迁移计划：[Enterprise-Skill-Platform_Migration-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Migration-Plan_v4.0.md)
- 开发 Backlog：[Enterprise-Skill-Platform_Development-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Development-Backlog_v4.0.md)
- Story Breakdown：[Enterprise-Skill-Platform_Story-Breakdown_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Story-Breakdown_v4.0.md)

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
3. loop 目标态设计：
   [Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md)
4. phase / 接管恢复设计：
   [Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md)
