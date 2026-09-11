# 项目文档导航 (Documentation Hub)

本目录集中收纳平台的**全局技术规范、架构全景说明、重塑背景与框架迁移历史**。

---

## 1. 核心必读（当前架构真相来源）

- **最新项目全景说明书**：[`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md)  
  *涵盖 5 大物理机能平面划分、业务主链（意图 -> 两阶段规划 -> 统一能力 -> 发布门禁 -> 调度执行）、六大核心架构设计模式、技术栈以及工程红线。*
- **项目架构重塑背景书**：[`project_architecture_redesign.md`](project_architecture_redesign.md)  
  *详细阐述从旧单体分层向机能域驱动演进的根本原因、业务痛点与重塑原则。*
- **产品化就绪度评估**：[`productization-readiness-assessment.md`](productization-readiness-assessment.md)  
  *平台上线准入、各模块成熟度与就绪度基线。*

---

## 2. 规范基线与迁移历史

- **系统设计基线 (`design/v4/`)**：
  - [企业级平台系统设计总纲 (v4.0)](design/v4/Enterprise-Skill-Platform_Master_v4.0.md)
  - [企业级平台项目描述 (v4.1)](design/v4/Enterprise-Skill-Platform_Project-Description_v4.1.md)
- **技术框架迁移历史 (`design/archive/`)**：
  - [ORM 统一重构：从 TypeORM 全面收敛至 Prisma](design/archive/ORM-Unification_TypeORM-to-Prisma_v1.0.md)
  - [后端目录演进历史与结构变迁说明](design/archive/backend-directory-structure-plan.md)
  - [页面语义理解与 React 兼容方案演进](design/archive/AI-Page-Understanding-and-React-Semantics-Compatibility-Plan_v1.0.md)
  - [Office-Addin 结构重构方案说明](design/archive/Office-Addin-Structure-Refactor-Complete-Solution_v1.0.md)

---

## 3. 运维与验证

- **运维与排障指南**：[`runbook/README.md`](runbook/README.md)
- **样例交付物与模板**：[`artifacts/README.md`](artifacts/README.md)

---

## 4. 维护与清理原则

- **单一真相来源**：一切以当前代码物理实现（`apps/backend/`、`apps/frontend/`）与 `PROJECT_OVERVIEW.md` 为准，不再保留任何阶段性草稿或过期实施计划。
- **背景与历史沉淀**：框架迁移历史收敛于 `design/archive/`，背景动因收敛于 `project_architecture_redesign.md`。
- **避免文档堆砌**：单次任务走查、临时对比笔记与已完成的阶段计划随重构落地即时清理。
