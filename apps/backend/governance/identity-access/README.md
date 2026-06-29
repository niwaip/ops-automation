# identity-access

治理平面下的身份与访问控制边界。

## 当前已归位

- 权限元数据常量
- `decorators/*`
- `RolesGuard`
- `JwtAuthGuard`
- `RbacGuard`
- `jwt.strategy`
- `ldap.strategy`
- `auth.service` 应用编排
- `auth.controller`
- `auth.module`
- `auth` 请求 DTO 契约
- `auth` response 契约
- `user` 查询/角色变更/启停用服务
- `user.controller`
- `user.module`
- `user` 请求 DTO 与列表响应契约

## 后续归位

- `core/platform/src/governance/identity-access/*` runtime bridge 绑定

## 当前状态

- 已完成两批低耦合资产和一批最小适配层迁移：
- `JwtAuthGuard`
- `RbacGuard`
- `jwt.strategy`
- `ldap.strategy`
- `auth.service` 主体编排
- `Login/Register/Refresh/SwitchOrg/SSO` 请求 DTO
- `LoginResponse/MeResponse/UserDto/RoleDto` response 契约
- `user` 查询/角色变更/启停用主体
- `UpdateUserRolesDto/UserQueryDto/UserListResponse` 契约
- `RbacGuard` 和 `jwt.strategy` 通过最小 reader token 从 `platform` 注入查询实现，避免继续直接依赖 `PrismaService`
- `auth.service`、`auth.controller`、`auth.module`、auth 契约、`user` 身份访问侧主体及 `user.controller` / `user.module` 已迁入本目录
- `platform` 中当前仅保留 `core/platform/src/governance/identity-access/*` runtime bridge 绑定
- 组织治理入口已集中在 `governance/organization`
- 当前边界说明见 `apps/backend/core/platform/src/governance-boundaries.md`
