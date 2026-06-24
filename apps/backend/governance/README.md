# Governance Plane

本目录用于承载未来从 `core/platform` 中拆出的治理能力。

## 当前规划

- `identity-access`
  - 认证、登录、令牌、权限、守卫、策略
- `organization`
  - 组织、部门、用户归属、治理侧读写边界

## 当前状态

- `identity-access` 已完成两批低耦合资产归位，并通过最小适配层继续迁出高耦合守卫/策略：
- 权限元数据
- `decorators/*`
- `RolesGuard`
- `JwtAuthGuard`
- `RbacGuard`
- `jwt.strategy`
- `ldap.strategy`
- `auth.service` 应用编排
- `auth` 请求 DTO 契约
- `auth` response 契约
- `user` 查询/角色变更/启停用主体
- `user` 请求 DTO 与列表响应契约
- `auth.controller`、`auth.module` 与旧 DTO/response 转发等外层壳目前继续物理留在 `apps/backend/core/platform`
- `user.controller`、`user.module` 与旧 DTO/response 转发兼容入口目前继续物理留在 `apps/backend/core/platform`
- `organization.service` 主体与组织请求 DTO 已进入 `governance/organization`
- `organization.controller`、`organization.module` 与旧 DTO 兼容入口目前继续物理留在 `apps/backend/core/platform`

## 迁移约束

- 新增 IAM、组织、访问控制逻辑应按 `governance/*` 归属设计
- 不应把 Skill、Workflow、Release 相关逻辑放入本平面
- 物理迁移前，优先通过 `core/platform` 中的边界文件维持所有权清晰
