# 项目文档导航 (Documentation Hub)

本目录集中收纳平台的**全局技术规范、架构全景说明、重塑背景与框架迁移历史**。

---

## 1. 核心必读（当前架构真相来源）

- **最新项目全景说明书**：[`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md)  
  _涵盖 5 大物理机能平面划分、业务主链（意图 -> 两阶段规划 -> 统一能力 -> 发布门禁 -> 调度执行）、六大核心架构设计模式、技术栈以及工程红线。_
- **项目架构重塑背景书**：[`project_architecture_redesign.md`](project_architecture_redesign.md)  
  _详细阐述从旧单体分层向机能域驱动演进的根本原因、业务痛点与重塑原则。_
- **架构治理与生产加固落地指南**：[`architecture-hardening-and-governance-guide.md`](architecture-hardening-and-governance-guide.md)
  _沉淀自最新代码与配置核验，涵盖五大认知校准、P0~P3 分级重构路线图与关键修改点速查。_
- **产品化就绪度评估（2026-08-14 快照）**：[`productization-readiness-assessment.md`](productization-readiness-assessment.md)
  _保留当时的风险判断与治理建议；分数、规模和风险现态需重新评估后才能用于发布决策。_

---

## 2. 规范基线与迁移历史

- **仓库目录与 Workspace 边界规范**：[`standards/REPOSITORY_STRUCTURE_STANDARD.md`](standards/REPOSITORY_STRUCTURE_STANDARD.md)，定义根目录职责、后端物理平面、包管理约束和当前迁移债务。
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
- **Docker 启动模式与服务数量**：[`../docker/README.md`](../docker/README.md)
- **样例交付物与模板**：[`artifacts/README.md`](artifacts/README.md)

---

## 4. 维护与清理原则

- **单一真相来源**：目录与入口以当前代码、`pnpm-workspace.yaml` 和 `docker/start-smart.sh` 为准；`PROJECT_OVERVIEW.md` 是维护中的架构概览。
- **背景与历史沉淀**：框架迁移历史收敛于 `design/archive/`，背景动因收敛于 `project_architecture_redesign.md`。
- **避免文档堆砌**：单次任务走查、临时对比笔记与已完成的阶段计划随重构落地即时清理。
