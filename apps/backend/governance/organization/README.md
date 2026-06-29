# organization

目标服务壳，用于承接当前组织与归属治理能力的真实实现与稳定入口。

## 目标归入范围

- `organization/*`
- 组织与归属治理相关 controller / service / module / contracts

## 当前状态

- 已完成首批组织归属服务归位：
- `organization.service` 主体
- `organization.controller` 主体
- `CreateOrganizationDto / CreateDepartmentDto / CreateTeamDto / AddOrganizationMemberDto`
- 组织 response 契约
- 组织治理 repository token 与契约
- 组织归属读写入口已集中在本目录
- `platform` 中当前仅保留 `core/platform/src/governance/organization/*` runtime bridge 绑定
- 当前边界说明见 `apps/backend/core/platform/src/governance-boundaries.md`
