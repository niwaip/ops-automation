# Design Docs

## 说明

`design/` 目录中的旧文档已整理到 `design/history/`，不再作为当前架构的唯一依据。

以下文件属于历史文档：

- `history/Browser-Control-Plane_Master_v1.0.md`
- `history/Browser-Control-Plane_Requirements_v1.0 (1).md`
- `history/Browser-Control-Plane_Folder-Structure_and_Tech-Stack_v1.0 (1).md`
- `history/1.txt` ~ `history/12.txt`

这些历史文档反映了项目早期以浏览器自动化平台为中心的方案，对理解背景和演进路径有价值，但当前项目的目标已经调整为：

- 以 `Skill` 为一等公民的企业级能力平台
- 以权限治理、运行时治理、人工介入、审计闭环为核心
- 浏览器模板、文档模板、数据连接器等都作为 Skill 构建与执行的原子能力

## 当前推荐阅读顺序

1. `Enterprise-Skill-Platform_Master_v2.0.md`
2. `Enterprise-Skill-Platform_Domain-Model_v2.0.md`
3. `Enterprise-Skill-Platform_Runtime-and-Policy_v2.0.md`
4. `Enterprise-Skill-Platform_Service-Boundaries_v2.0.md`
5. `Enterprise-Skill-Platform_Core-Data-Model_v2.0.md`
6. `Enterprise-Skill-Platform_Execution-Lifecycle-RFC_v2.0.md`
7. `Enterprise-Skill-Platform_Service-API-and-Ownership-Contract_v2.0.md`
8. `Enterprise-Skill-Platform_MVP-Scope-and-Acceptance_v2.0.md`
9. `Enterprise-Skill-Platform_MVP-Implementation-Blueprint_v2.0.md`
10. `Enterprise-Skill-Platform_Execution-API-Spec_v2.0.md`
11. `Enterprise-Skill-Platform_MVP-Migration-Runbook_v2.0.md`
12. `Enterprise-Skill-Platform_Portal-UX-and-Page-Flow-Spec_v2.0.md`
- [Enterprise-Skill-Platform_Workflow-to-Skill-Release-Process-Spec_v2.0.md](file:///Users/chain/Documents/MyProject/ops-automation/design/Enterprise-Skill-Platform_Workflow-to-Skill-Release-Process-Spec_v2.0.md)
- [Enterprise-Skill-Platform_Capability-Release-API-Spec_v2.0.md](file:///Users/chain/Documents/MyProject/ops-automation/design/Enterprise-Skill-Platform_Capability-Release-API-Spec_v2.0.md)
- [Enterprise-Skill-Platform_Capability-Studio-and-Release-Center-Portal-Spec_v2.0.md](file:///Users/chain/Documents/MyProject/ops-automation/design/Enterprise-Skill-Platform_Capability-Studio-and-Release-Center-Portal-Spec_v2.0.md)
- [Enterprise-Skill-Platform_Capability-Release-Data-Model_v2.0.md](file:///Users/chain/Documents/MyProject/ops-automation/design/Enterprise-Skill-Platform_Capability-Release-Data-Model_v2.0.md)
- [Enterprise-Skill-Platform_Capability-Release-Implementation-Plan_v2.0.md](file:///Users/chain/Documents/MyProject/ops-automation/design/Enterprise-Skill-Platform_Capability-Release-Implementation-Plan_v2.0.md)
18. `Enterprise-Skill-Platform_Runtime-Takeover-Protocol-Spec_v2.0.md`
19. `Enterprise-Skill-Platform_Policy-and-Approval-Decision-Matrix_v2.0.md`
20. `Enterprise-Skill-Platform_Artifact-and-Audit-View-Spec_v2.0.md`

## 新文档定位

- `Enterprise-Skill-Platform_Master_v2.0.md`
  - 顶层愿景、系统分层、服务边界、演进路线
- `Enterprise-Skill-Platform_Domain-Model_v2.0.md`
  - Skill、Execution、RuntimeSession、Policy、Memory 等核心对象
- `Enterprise-Skill-Platform_Runtime-and-Policy_v2.0.md`
  - 权限、审批、接管、运行时隔离、危险任务治理
- `Enterprise-Skill-Platform_Service-Boundaries_v2.0.md`
  - 当前仓库服务到目标平台边界的映射建议
- `Enterprise-Skill-Platform_Core-Data-Model_v2.0.md`
  - 核心数据对象、表结构建议、关键索引与存储职责
- `Enterprise-Skill-Platform_Execution-Lifecycle-RFC_v2.0.md`
  - Execution、RuntimeSession、ExecutionStep 的主模型与状态机
- `Enterprise-Skill-Platform_Service-API-and-Ownership-Contract_v2.0.md`
  - 服务 ownership、主写权限、同步 API 合同与迁移冻结规则
- `Enterprise-Skill-Platform_MVP-Scope-and-Acceptance_v2.0.md`
  - 第一阶段范围、验收场景、里程碑出口条件与上线前检查清单
- `Enterprise-Skill-Platform_MVP-Implementation-Blueprint_v2.0.md` (NEW)
  - 第一阶段详细设计蓝图，补充数据库表、DTO、API、状态更新规则、服务职责和主链路时序
- `Enterprise-Skill-Platform_Execution-API-Spec_v2.0.md` (NEW)
  - 第一阶段 Execution 主链路的详细接口规范，补充请求响应、DTO、错误码、状态变更约束和 Portal 对接要求
- `Enterprise-Skill-Platform_MVP-Migration-Runbook_v2.0.md` (NEW)
  - 第一阶段迁移实施手册，补充分阶段迁移顺序、服务改造建议、兼容策略、风险与回退方案
- `Enterprise-Skill-Platform_Portal-UX-and-Page-Flow-Spec_v2.0.md` (NEW)
  - 第一阶段 Portal 工作台的页面结构、用户主流程、状态展示规则、页面交互约束和前端验收标准
- `Enterprise-Skill-Platform_Workflow-to-Skill-Release-Process-Spec_v2.0.md` (NEW)
  - 从 workflow/template 配置到 AI 生成、sandbox 验证、注册 Skill、部署上线的完整推荐流程规范
- `Enterprise-Skill-Platform_Capability-Release-API-Spec_v2.0.md` (NEW)
  - `CapabilityRelease` 主对象的 API、DTO、状态流转、错误码和服务分工规范
- `Enterprise-Skill-Platform_Capability-Studio-and-Release-Center-Portal-Spec_v2.0.md` (NEW)
  - 统一发布向导与发布中心的 Portal 页面结构、交互规则和实施建议
- `Enterprise-Skill-Platform_Capability-Release-Data-Model_v2.0.md` (NEW)
  - `CapabilityRelease` 闭环相关表结构、字段、索引、状态与现有对象映射设计
- `Enterprise-Skill-Platform_Capability-Release-Implementation-Plan_v2.0.md` (NEW)
  - `CapabilityRelease` 的分阶段实施计划、任务拆解、里程碑和验收建议
- `Enterprise-Skill-Platform_Runtime-Takeover-Protocol-Spec_v2.0.md` (NEW)
  - 第一阶段人工接管链路的运行时协议规范，补充 freeze、takeover、resume 的状态切换、握手流程和安全约束
- `Enterprise-Skill-Platform_Policy-and-Approval-Decision-Matrix_v2.0.md` (NEW)
  - 第一阶段治理决策矩阵，补充风险等级、审批要求、人工接管触发条件、默认策略和可解释决策输出
- `Enterprise-Skill-Platform_Artifact-and-Audit-View-Spec_v2.0.md` (NEW)
  - 第一阶段产物索引与审计展示规范，补充 Artifact 类型、Audit 事件、Portal 展示要求和最小审计闭环
- `Enterprise-Skill-Platform_MCP-Integration-RFC_v2.0.md` (NEW)
  - 平台能力如何通过 MCP 协议向企业内部外标准化暴露的方案
- `Enterprise-Skill-Platform_Memory-and-Evolution-RFC_v2.0.md` (NEW)
  - 记忆分层（Session/User/Skill/Org）架构与闭环进化（基于人机协同的错误反馈）的详细落地思路

## 后续整理建议

- 历史文档统一保存在 `design/history/`
- 新文档补齐架构图、状态机图、权限矩阵图
- 新文档应与代码结构和服务边界持续对齐
- RFC、Contract、MVP 文档应在每次主要服务边界调整后同步更新
