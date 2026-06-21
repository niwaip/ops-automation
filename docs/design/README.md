# 设计文档导航

当前实施基线：`v4`

本文只把仍适合参与当前讨论和开发的文档放在前面。`v2`、`v3` 与 `archive/` 中的内容均视为历史资料，不再作为实现基线。

如果你主要在 `v4` 范围内工作，可先看目录索引：
[v4/README.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/README.md)

## 当前基线

- 总纲：[Enterprise-Skill-Platform_Master_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Master_v4.0.md)
- 稳定接口与外部能力架构：[Enterprise-Skill-Platform_Stable-Interface-and-External-Capability-Architecture_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Stable-Interface-and-External-Capability-Architecture_v4.0.md)
- API 契约：[Enterprise-Skill-Platform_API-Contract-Spec_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_API-Contract-Spec_v4.0.md)
- Runtime 能力协议：[Enterprise-Skill-Platform_Runtime-Capability-Protocol-Spec_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Runtime-Capability-Protocol-Spec_v4.0.md)
- Docker 与部署蓝图：[Enterprise-Skill-Platform_Docker-and-Deployment-Blueprint_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Docker-and-Deployment-Blueprint_v4.0.md)
- 迁移计划：[Enterprise-Skill-Platform_Migration-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Migration-Plan_v4.0.md)

## 当前活跃专题

- 统一能力模型与 Skill 发布：[Enterprise-Skill-Platform_Unified-Capability-Model-and-Skill-Publishing_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Unified-Capability-Model-and-Skill-Publishing_v4.0.md)
- 浏览器执行指南：[Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md)
- Browser Loop Workflow 控制改造：[Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md)
- Playwright CLI + AI 执行重构：[Enterprise-Skill-Platform_Playwright-CLI-AI-Execution-Refactor_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Playwright-CLI-AI-Execution-Refactor_v4.0.md)
- Browser Phase 执行与恢复：[Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md)
- browser-worker 模块拆分清单：[Enterprise-Skill-Platform_Browser-Worker-Module-Split-Checklist_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Worker-Module-Split-Checklist_v4.0.md)
- 开发 Backlog：[Enterprise-Skill-Platform_Development-Backlog_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Development-Backlog_v4.0.md)

## 浏览器文档怎么读

如果你关注浏览器链路，建议按下面顺序阅读：

1. 总览入口：
   [AI-Browser-Recording-End-to-End-Flow-and-Next-Steps_v1.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/AI-Browser-Recording-End-to-End-Flow-and-Next-Steps_v1.0.md)
   作用：跨录制、导出、bridge、publish、runtime、control-plane 展示的现状串联。
2. 当前执行基线：
   [Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_AI-Browser-Execution-Guide_v4.0.md)
   作用：录制态 AI/planner 的输入输出、动作边界、locator 与参数化规则。
3. Loop 工作流主设计：
   [Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Loop-Workflow-Control-Plan_v4.0.md)
   作用：解释为什么 loop 不能继续留在 runtime 黑盒中，以及 workflow 可见化的目标模型。
4. Phase 与接管恢复设计：
   [Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Browser-Phase-Execution-and-Recovery_v4.0.md)
   作用：解释 phase、接管、恢复、前端展示与执行 DTO 的边界。

补充说明：

- 上述 4 篇里，根目录总览文档偏“现状串联”。
- `v4` 中的浏览器文档偏“当前基线 + 目标态设计”。
- `Backlog`、`Migration Plan`、`Story Breakdown` 不应被理解为“已经实现”，它们仍然是迁移或待办文档。

## 当前仍可参考的专题方案

以下文档不是平台总基线，但仍与当前仓库中的模块或迁移工作有关：

- AI 浏览器录制到模板发布链路总览：[AI-Browser-Recording-End-to-End-Flow-and-Next-Steps_v1.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/AI-Browser-Recording-End-to-End-Flow-and-Next-Steps_v1.0.md)
- Workflow Artifact 与 Release 职责收敛：[Workflow-Artifact-and-Release-Convergence-Plan_v1.0.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/Workflow-Artifact-and-Release-Convergence-Plan_v1.0.md)
- 模板高级场景设计：[Template_Advanced_Scenarios.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/Template_Advanced_Scenarios.md)
- 项目技术栈总览：[项目技术栈总览.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/项目技术栈总览.md)

## 历史归档

- `v3/`：Agent OS 阶段设计，保留演进路径参考价值，不再作为实现基线。
- `v2/`：更早期平台设计，适合追溯概念来源，不直接指导当前代码。
- `archive/`：已完成、已失效或已不适合作为当前讨论入口的根目录专题方案归档，其中也包括已归档的旧浏览器专项设计。
