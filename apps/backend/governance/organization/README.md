# organization

目标服务壳，用于承接当前 `core/platform` 中的组织与归属治理能力。

## 目标归入范围

- `modules/organization`
- `modules/user` 中曾经承担的组织归属入口，现已收敛回 `modules/organization`

## 当前状态

- 已完成首批组织归属服务归位：
- `organization.service` 主体
- `organization.controller` 主体
- `CreateOrganizationDto / CreateDepartmentDto / CreateTeamDto / AddOrganizationMemberDto`
- 组织 response 契约
- 组织治理 repository token 与契约
- 组织归属读写入口已集中在 `modules/organization`
- `platform` 中保留 `organization.module` 与旧 controller/DTO 兼容入口
- 当前边界说明见 `apps/backend/core/platform/src/governance-boundaries.md`
