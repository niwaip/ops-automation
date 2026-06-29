# release-manager 结构验收记录 (v4.1)

日期：2026-06-26

> 对应 [Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md) 中的 `11.2 结构验收` 与 `11.6 最小验收记录格式`。

## 批次名称

Phase B / release-manager release 子层稳定承接批次

## 目标

将 `capability-release` 的 `release` 子层从“逻辑上像 `release-manager`、实现上仍直接落在旧路径”推进到“稳定子层真实承接主要协作者实现”，并让旧 `modules/capability-release/release` 入口退化为兼容壳；当前稳定入口已进一步收口到 `@ops/release-manager/release`，平台侧仅保留 runtime adapter。

## 影响范围

- `apps/backend/core/platform/src/release-manager/platform/release-manager-runtime-adapter.module.ts`
- `apps/backend/registry-release/release-manager/src/release/*`
- `apps/backend/core/platform/src/modules/capability-release/*`（兼容层）
- `apps/backend/registry-release/release-manager/*`

本批次已承接的稳定层实现包括：

- `ReleaseAccessorDepsService`
- `ReleaseAccessorSourceService`
- `ReleaseAccessorBindingsService`
- `ReleaseAccessorFactoryService`
- `ReleaseAuditAccessorDepsService`
- `ReleaseDraftService`
- `ReleaseDraftQueryBridgeService`
- `ReleaseDraftQuerySourceService`
- `ReleaseFacadeAccessorBindingsService`
- `ReleaseFacadeAccessorFactoryService`
- `ReleaseFacadeAccessorsService`
- `ReleaseFacadeContextService`
- `ReleaseLifecycleService`
- `ReleaseManagementAccessorSourceService`
- `ReleaseManagementFacadeAccessorsService`
- `ReleaseManagementFacadeContextService`
- `ReleaseQueryService`
- `ReleaseRuntimeAccessorBindingsService`
- `ReleaseRuntimeAccessorFactoryService`
- `ReleaseRuntimeAccessorSourceService`
- `ReleaseRuntimeFacadeAccessorsService`
- `ReleaseRuntimeFacadeContextService`
- `ReleaseSupportAccessorDepsService`
- `ReleaseSupportService`

并已完成的结构收口包括：

- `CapabilityReleaseService` 已切到包侧 `@ops/release-manager/release`，平台与测试消费面也已切到包侧稳定入口
- `CapabilityReleaseModule` 当前已由 `core/platform/src/app.module.ts` 直接装配包侧 `@ops/release-manager/release`
- `core/platform/src/release-manager/{index,release,compiler,publisher,validator,audit}` 兼容导出层已在后续 Phase E 中删除；平台侧当前仅保留 `platform/release-manager-runtime-adapter.module.ts` 负责 runtime token 绑定
- `modules/capability-release/*` 物理路径已在后续 Phase E 中完成删除
- `modules/capability-release/compiler|publisher|validator|audit/*` 已在首批 Phase E 中删除
- `modules/capability-release/{capability-release-assist,capability-release-skill-draft,capability-release.mapper,capability-release-manifest.mapper,interfaces,capability-release.constants}.ts` 已在后续 Phase E 中删除

## 验证结果

- 编译：`pnpm --filter @ops/release-manager build` 通过
- 测试：未新增自动化测试；本批次以 `build`、`typecheck` 与静态诊断作为最小验证
- 接口：未改 controller、route、对外 API 面
- 容器：后续 Phase D 已执行 `./docker/start-smart.sh docker-compose.base.yml up -d platform`、`docker logs --tail 40 ops-platform` 与 `curl http://127.0.0.1:3001/` 回归，`platform` 启动与监听正常
- 类型检查：`pnpm --filter @ops/release-manager typecheck` 通过
- 诊断：新增与改动文件经 `GetDiagnostics` 检查，无新增错误

## 结论

- 是否通过：通过当前 `11.2 结构验收` 的最小批次标准
- 遗留问题：
  - `core/platform/src/modules/capability-release/*` 仍作为兼容导出层与运行时适配锚点保留
  - 历史 split plan / PR breakdown 等文档仍保留旧路径描述，需与“当前状态说明”类文档区分看待
- 下一批次前置条件：
  - 在不改路由与协议的前提下，继续评估兼容根入口是否还能进一步缩窄为更小的历史门面
  - 继续同步“当前状态说明”类设计文档，避免把旧 `modules/capability-release/*` 写成活动实现面
