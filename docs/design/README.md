# 设计与规范基线导航 (Design Baselines & Archive)

本目录收纳平台的系统级设计基线规范（`v4/`）以及框架迁移历史归档（`archive/`）。

---

## 0. 领域功能设计

- **合同法务审查套件功能设计**：[`Contract-Legal-Review-Toolkit-Functional-Design_v1.0.md`](Contract-Legal-Review-Toolkit-Functional-Design_v1.0.md)
  *围绕合同智能比对、合规诊断、统一问题项、证据锚点、Legal Playbook 与后续法务工作流衔接的功能设计。*

- **借鉴 Anthropic Skills 演进设计方案 (三阶段路线图)**：
  - **Phase 1: 深度 Office/PDF 能力架构与个人沙箱 (DSH) 隔离验证方案**：[`Phase1-Office-Engine-Deep-Capabilities-and-DSH-Sandbox-Design_v1.0.md`](Phase1-Office-Engine-Deep-Capabilities-and-DSH-Sandbox-Design_v1.0.md)  
    *在不影响现有微服务工作模式前提下，于个人沙箱 `dsh` 验证 Word 审阅留痕/批注、Excel 公式重算缓存与 PDF 交互式表单。*
  - **Phase 2: 技能全生命周期工程、意图优化与双路评测体系方案**：[`Phase2-Skill-Lifecycle-Evaluation-and-Intent-Optimization-Design_v1.0.md`](Phase2-Skill-Lifecycle-Evaluation-and-Intent-Optimization-Design_v1.0.md)  
    *借鉴 `skill-creator`，建立意图描述反向优化循环（混淆矩阵）、双路并行基线评测与 Portal 视觉审查看板。*
  - **Phase 3: 交互式 Web 成果物生成与 MCP 开放生态网关方案**：[`Phase3-Interactive-Web-Artifacts-and-MCP-Gateway-Design_v1.0.md`](Phase3-Interactive-Web-Artifacts-and-MCP-Gateway-Design_v1.0.md)  
    *借鉴 `web-artifacts-builder` 与 `mcp-builder`，落地单文件 React+Tailwind 交互成果物与平台级 MCP 开放网关。*

---

## 1. 核心总纲与项目描述 (`v4/`)

- **系统设计总纲**：[`v4/Enterprise-Skill-Platform_Master_v4.0.md`](v4/Enterprise-Skill-Platform_Master_v4.0.md)  
  *系统级总设计方案，阐述全局能力、治理结构与平台演进战略。*
- **项目边界与范围描述**：[`v4/Enterprise-Skill-Platform_Project-Description_v4.1.md`](v4/Enterprise-Skill-Platform_Project-Description_v4.1.md)  
  *定义当前项目的研发范围、核心交付边界与设计时到运行时的约束。*

---

## 2. 框架迁移与演进历史 (`archive/`)

- **ORM 统一重构**：[`archive/ORM-Unification_TypeORM-to-Prisma_v1.0.md`](archive/ORM-Unification_TypeORM-to-Prisma_v1.0.md)  
  *记录从 TypeORM 统一迁移至 Prisma ORM 的技术决策、实施方案与历史背景。*
- **后端目录演进说明**：[`archive/backend-directory-structure-plan.md`](archive/backend-directory-structure-plan.md)  
  *记录从历史混乱分层向现代机能平面迁移的过渡期设计。*
- **前端扩展方案说明**：[`archive/Office-Addin-Structure-Refactor-Complete-Solution_v1.0.md`](archive/Office-Addin-Structure-Refactor-Complete-Solution_v1.0.md)  
  *历史 Office-Addin 结构重构方案。*
- **页面语义探索历史**：[`archive/AI-Page-Understanding-and-React-Semantics-Compatibility-Plan_v1.0.md`](archive/AI-Page-Understanding-and-React-Semantics-Compatibility-Plan_v1.0.md)  
  *早期 AI 页面理解与 React 语义兼容性探索方案。*

---

## 3. 全局架构与实现真相

所有最新的业务主链路、5 大物理机能平面、两阶段确定性规划与工程规范，请统一参阅：  
👉 **[项目全景架构与技术说明书 (`../PROJECT_OVERVIEW.md`)](../PROJECT_OVERVIEW.md)**
