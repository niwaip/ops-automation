# Platform 装配中心说明 (Composition Root & Database Authority)

`apps/backend/platform` 现已完成从旧有的 `apps/backend/core/platform` 迁移，并正式确立为后端的**装配中心 (Composition Root)** 与**数据库权威治理源**。

## 一、定位与架构职责

- **零业务领域逻辑**：平台本身不再存放具体业务 Domain 逻辑，而是作为 NestJS 依赖注入装配根，将分散在各机能平面的微服务模块装配聚合。
- **数据库 Schema 权威**：保留 PostgreSQL Prisma 权威模型定义 (`prisma/schema.prisma`) 与迁移序列 (`prisma/migrations/`)。
- **统一路由与全局 Guard**：提供统一的全局中间件、JWT Guard、CORS 和 Swagger 入口。

## 二、领域模块物理归位现状

原存在于单体内部的业务模块已全部物理下沉解耦至专属机能包：

- **治理平面 (`governance/`)**：
  - `@ops/identity-access`：认证、鉴权、RBAC
  - `@ops/organization`：组织架构、部门
  - `@ops/workbench`：工作台待办、协同收件箱 (GTD)、工作区协同
  - `@ops/im-gateway`：外部 IM 通道与微信长连
  - `@ops/system-backup`：系统配置与技能资产灾备引擎
- **资产与发布平面 (`registry-release/`)**：
  - `@ops/skill-registry`：技能注册中心
  - `@ops/workflow-registry`：工作流与 Temporal 编排定义
  - `@ops/release-manager`：资产编译、发布门禁与不可变清单 (Release Manifest)

## 三、开发红线

1. 禁止在 `platform/src` 下直接新增具体的业务领域代码；新增能力必须归入对应机能平面包。
2. `platform` 通过 `package.json` 中的 `workspace:*` 依赖各独立领域包，并通过依赖注入 Token 进行桥接。
