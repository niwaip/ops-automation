# backend 结构验收记录 (v4.1)

日期：2026-06-26

> 对应 [Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md](file:///Users/chain/Documents/MyProject/ops-automation/docs/design/v4/Enterprise-Skill-Platform_Backend-Migration-Design_v4.1.md) 中的 `11.2 结构验收` 与 `11.6 最小验收记录格式`。

## 批次名称

Phase A-B / backend target planes structure acceptance batch

## 目标

将后端目标平面的结构落地从“目录骨架 + README + re-export 壳”推进到“目标目录存在、根入口稳定、关键子层开始承接最小真实源码能力”，并为后续更深层的真实实现迁移建立可复核的结构基线。

## 影响范围

- `apps/backend/governance/audit-policy/*`
- `apps/backend/intelligence/master-planner/*`
- `apps/backend/registry-release/template-registry/*`
- `apps/backend/registry-release/agent-catalog/*`
- `apps/backend/registry-release/skill-registry/*`
- `apps/backend/registry-release/workflow-registry/*`
- `apps/backend/README.md`
- `apps/backend/governance/README.md`
- `apps/backend/intelligence/README.md`
- `apps/backend/registry-release/README.md`
- `apps/backend/{governance,intelligence,registry-release}/index.ts`
- `scripts/check-backend-plane-shells.js`
- `docs/design/v4/README.md`

本批次新增的目标子包包括：

- `governance/audit-policy`
- `intelligence/master-planner`
- `registry-release/template-registry`
- `registry-release/agent-catalog`

本批次已从“纯壳”推进到“显式导出 + 最小 helper 承接”的关键子层包括：

- `registry-release/skill-registry/registry`
- `registry-release/skill-registry/access`
- `registry-release/skill-registry/binding`
- `registry-release/skill-registry/enrichment`
- `registry-release/skill-registry/matching`
- `registry-release/skill-registry/validation`
- `registry-release/workflow-registry/flow-template`
- `registry-release/workflow-registry/workflow-template`
- `registry-release/workflow-registry/activity-template`
- `registry-release/workflow-registry/validation`
- `registry-release/workflow-registry/codegen`

补充现态：

- `skill-registry` 的 `access / binding / enrichment / matching / validation` 五个零消费者叶子入口已在后续 Phase E 删除
- 当前仅保留 `registry/index.ts` 作为最小逻辑视图占位与 helper 承接点

并已完成的结构收口包括：

- `registry-release/index.ts` 根聚合壳已在后续 Phase E 删除；当前直接保留各子包 README / package 边界与稳定子路径入口
- `governance/index.ts` 已显式导出 `audit-policy`
- `intelligence/index.ts` 已显式导出 `master-planner`
- `scripts/check-backend-plane-shells.js` 已同步收敛，只校验仍需保留的包边界文件，不再把零消费者 root shell 视为必需路径

## 验证结果

- 编译：
  - `pnpm --filter @ops/template-registry run typecheck` 通过
  - `pnpm --filter @ops/agent-catalog run typecheck` 通过
  - `pnpm --filter @ops/audit-policy run typecheck` 通过
  - `pnpm --filter @ops/master-planner run typecheck` 通过
  - `pnpm --filter @ops/skill-registry run typecheck` 通过
  - `pnpm --filter @ops/workflow-registry run typecheck` 通过
- 测试：未新增自动化测试；本批次以目标包 `typecheck`、结构脚本与静态诊断作为最小验证
- 接口：未改 controller route、HTTP 契约与主 API 入口
- 容器：本批次未执行容器级回归；当前仍聚焦结构验收，不涉及真实运行单元迁移
- 结构校验：
  - `node scripts/check-backend-plane-shells.js` 通过
  - 当前必需结构路径校验数为 `71`
- 诊断：新增与改动文件经 `GetDiagnostics` 检查，无新增错误

## 结论

- 是否通过：通过当前 `11.2 结构验收` 的最小批次标准
- 已达成：
  - 新增需求的归属判断更稳定，目标平面的物理目录已更接近设计书目标结构
  - `registry-release` 不再只是目标命名层，`skill-registry` 与 `workflow-registry` 已出现成体系的稳定子层承接
  - `governance/audit-policy`、`intelligence/master-planner`、`template-registry`、`agent-catalog` 不再缺失物理落点
- 遗留问题：
  - 大量重逻辑服务主体仍物理位于 `core/platform`
  - 当前“已落地”主要体现在目标包稳定入口与最小 helper 承接，尚不等于真实实现所有权已完全迁出
  - `capabilities/*` 仍主要停留在逻辑视图与边界表达阶段，尚未形成同等级别的非纯壳承接
- 下一批次前置条件：
  - 若继续做结构验收增强，应优先进入“真实实现外移”而不是继续只补 helper
  - 若进入更高风险迁移批次，需要补充接口回归、服务启动与容器验证记录

---

## 批次名称

Phase C / PR-01 to PR-05 re-anchored acceptance sweep

## 目标

在“不要偏移”的约束下，重新严格对照设计书 `11.2` 与 `12.1` 到 `12.5`，
只补齐首批 PR 中仍然明确缺失、且适合以低风险小步落地的结构与边界缺口。

## 影响范围

- `apps/backend/README.md`
- `apps/backend/core/platform/README.md`
- `apps/backend/core/platform/src/release-manager/*`
- `apps/backend/core/platform/src/modules/temporal-workflow/runtime-bridge/*`
- `apps/backend/intelligence/ai-orchestrator/src/modules/browser/README.md`
- `apps/backend/intelligence/ai-orchestrator/src/modules/planner/index.ts`
- `apps/backend/domain/README.md`
- `packages/backend-contracts/*`
- `packages/contracts/README.md`

本批次明确核对并确认的首批 PR 状态包括：

- `PR-01`：基线冻结与归属说明已在根 README、`core/platform`、`domain/*`、
  `packages/backend-contracts/*`、`packages/contracts` 中形成边界约束
- `PR-02`：`capability-release` 已补齐本地 `release/` 稳定子层，并继续把
  `CapabilityReleaseService` 的 `query` / `draft` / `build-validation` /
  `runtime` / `publish` / `deployment` / `assist` 委托收敛为私有 façade helper
- `PR-03`：`temporal-workflow/runtime-bridge` 已存在，设计时注册面与运行时辅助
  具备首轮边界表达
- `PR-04`：`planner/*` 未发现继续深层依赖 `browser/*` 内部实现的新增违规点
- `PR-05`：`packages/backend-contracts/*` 已形成首个及后续源码化子包模式，
  `src/`、`tsconfig`、构建入口与兼容壳约束均已落地

## 验证结果

- 编译：
  - `pnpm --filter @ops/platform run typecheck` 通过
- 测试：未新增自动化测试；本批次仍以定向 `typecheck` 与静态代码/文档核对为主
- 接口：未改 controller、route、数据库 Schema 与外部 API
- 容器：本批次未执行容器重启与接口回归；当前改动未触达需要强制重启验证的运行链
- 诊断：
  - `capability-release.service.ts` 与 `capability-release/README.md` 经
    `GetDiagnostics` 检查，无新增阻断问题
  - `capability-release.service.ts` 仍有既存未使用依赖 `Hint`，但非本批次引入

## 结论

- 是否通过：通过当前 `PR-01` 到 `PR-05` 首批范围内的再次对齐复核标准
- 已达成：
  - 首批 PR 的主锚点已重新收束到设计书，不再按“还能补什么结构”横向扩张
  - `capability-release` 已具备更清晰的稳定子层与总入口 façade 形态，符合
    `PR-02` “只补 façade 与内部协作边界”的要求
  - `PR-03`、`PR-04`、`PR-05` 当前未发现新的显式缺口，说明首批结构基线已基本成形
- 遗留问题：
  - `capability-release` 的真实实现所有权仍主要物理位于 `core/platform`，
    尚未进入 `registry-release/release-manager` 的实际目录迁移阶段
  - `capabilities/*` 仍未形成与 `registry-release/*` 同等级别的实质承接
  - 容器级与接口级验证仍需放到后续更高风险批次中补齐
- 下一批次前置条件：
  - 若继续推进，应优先选择一个仍有明确设计书落点的热点模块做同等级别小步收口
  - 若开始真实实现迁移或跨服务链路调整，需同步补齐接口回归与容器验证记录

---

## 批次名称

Phase C prep / release-manager target-package landing shape

## 目标

在不直接迁移真实实现的前提下，为 `registry-release/release-manager` 目标包补齐
`release` 子层的本地稳定文件位形，先固定未来真实迁移的承接落点。

## 影响范围

- `apps/backend/registry-release/release-manager/src/release/index.ts`
- `apps/backend/registry-release/release-manager/src/release/capability-release.controller.ts`
- `apps/backend/registry-release/release-manager/src/release/capability-release.manifest.service.ts`
- `apps/backend/registry-release/release-manager/src/release/capability-release.module.ts`
- `apps/backend/registry-release/release-manager/src/release/capability-release.service.ts`
- `apps/backend/registry-release/release-manager/README.md`

本批次调整要点：

- `release-manager/src/release/index.ts` 不再整层透传，而是改为优先走本地稳定文件位形
- 新增 `controller` / `manifest.service` / `module` / `service` 四个本地入口文件
- 当时新增文件仍只转发 `core/platform/src/release-manager/release` 稳定层实现；该兼容层已在后续 Phase E 中删除，当前统一消费 `@ops/release-manager/release`
- `release-manager/src/compiler/index.ts`、`src/validator/index.ts`、`src/publisher/index.ts` 与 `src/audit/index.ts`
  已在后续 Phase E 中删除；当前 `compiler / validator / publisher / audit` 相关测试与包内消费面已切到目标包真实实现文件，`@ops/release-manager` 包根入口与 `src/index.ts` 也已在后续 Phase E 删除，仅保留 `@ops/release-manager/release` 稳定子路径
- `release-manager/src/validator/{index,capability-release-publish-validator.service}.ts`
  已补齐缺失的发布前校验服务文件位形，并改为优先从目标包本地 `validator/*` 文件导出
- `release-manager/src/publisher/{index,capability-release-deployment,capability-release-deployment-smoke,capability-release-document-runtime,capability-release-publish,capability-release-publish-writer,capability-release-runtime,capability-release-skill-publisher,release-runtime-binding}.service.ts`
  已补齐缺失的发布/部署/运行时绑定服务文件位形，并改为优先从目标包本地 `publisher/*` 文件导出
- `release-manager/src/validator/capability-release-publish-validator.service.ts`
  已承接 `CapabilityReleasePublishValidatorService` 的真实实现逻辑，形成当前 `release-manager`
  目标包中的首个真实实现迁移切口；`core/platform` 兼容层当前仍保留旧入口，未在本批次直接切换消费方
- `release-manager/src/publisher/release-runtime-binding.service.ts`
  已承接 `ReleaseRuntimeBindingService` 的真实实现逻辑，形成当前 `release-manager`
  目标包中的第二个真实实现迁移切口；`core/platform` 兼容层当前仍保留旧入口，未在本批次直接切换消费方
- `release-manager/src/publisher/capability-release-deployment-smoke.service.ts`
  已承接 `CapabilityReleaseDeploymentSmokeService` 的真实实现逻辑，形成当前
  `release-manager` 目标包中的第三个真实实现迁移切口；`core/platform` 兼容层当前仍保留旧入口，未在本批次直接切换消费方
- `release-manager/src/publisher/capability-release-publish-writer.service.ts`
  已承接 `CapabilityReleasePublishWriterService` 的真实实现逻辑，形成当前
  `release-manager` 目标包中的第四个真实实现迁移切口；`core/platform` 兼容层当前仍保留旧入口，未在本批次直接切换消费方
- `release-manager/src/publisher/capability-release-skill-publisher.service.ts`
  已承接 `CapabilityReleaseSkillPublisherService` 的真实实现逻辑，形成当前
  `release-manager` 目标包中的第五个真实实现迁移切口；`core/platform` 兼容层当前仍保留旧入口，未在本批次直接切换消费方
- `release-manager/src/publisher/capability-release-deployment.service.ts`
  已承接 `CapabilityReleaseDeploymentService` 的真实实现逻辑，形成当前
  `release-manager` 目标包中的第六个真实实现迁移切口；`core/platform` 兼容层当前仍保留旧入口，未在本批次直接切换消费方
- `release-manager/src/publisher/capability-release-publish.service.ts`
  已承接 `CapabilityReleasePublishService` 的真实实现逻辑，形成当前
  `release-manager` 目标包中的第七个真实实现迁移切口；`core/platform` 兼容层当前仍保留旧入口，未在本批次直接切换消费方
- `release-manager/src/release/release-query.service.ts`
  已承接 `ReleaseQueryService` 的真实实现逻辑，形成当前 `release-manager`
  目标包中的第八个真实实现迁移切口；`release` 子层开始直接承接详情聚合与发布中心可见性查询链
- `release-manager/src/release/release-draft.service.ts`
  已承接 `ReleaseDraftService` 的真实实现逻辑，形成当前 `release-manager`
  目标包中的第九个真实实现迁移切口；`release` 子层开始直接承接 release 创建、source snapshot 落库与 source 更新主链
- `release-manager/src/release/{release-draft-query-bridge,release-draft-query-source}.service.ts`
  已承接 draft/query 最短协作桥接链，形成当前 `release-manager`
  目标包中的第十与第十一个真实实现迁移切口；`release` 子层已具备最小 query-draft 组合编排闭环
- `release-manager/src/release/release-support.service.ts`
  已承接 `ReleaseSupportService` 的真实实现逻辑，形成当前 `release-manager`
  目标包中的第十二个真实实现迁移切口；`release` 子层开始直接承接基础设施自检、核心记录读取与 temporal artifact 绑定辅助链
- `release-manager/src/release/release-accessor-factory.service.ts`
  已承接 `ReleaseAccessorFactoryService` 的真实实现逻辑，形成当前 `release-manager`
  目标包中的第十三个真实实现迁移切口；`release` 子层开始直接承接 facade/runtime accessor 工厂组合入口
- `release-manager/src/release/release-facade-accessor-factory.service.ts`
  已承接 `ReleaseFacadeAccessorFactoryService` 的真实实现逻辑，形成当前
  `release-manager` 目标包中的第十四个真实实现迁移切口；`release` 子层开始直接承接 publish/draft/query/lifecycle facade accessor 装配逻辑
- `release-manager/src/release/{release-accessor-bindings,release-facade-accessor-bindings}.service.ts`
  已承接 release 子层 accessor binding 链，形成当前 `release-manager`
  目标包中的第十五与第十六个真实实现迁移切口；`release` 子层已开始直接承接 management/runtime source 到 accessor deps 的本地绑定逻辑
- `release-manager/src/release/release-accessor-deps.service.ts`
  已承接 `ReleaseAccessorDepsService` 的真实实现逻辑，形成当前 `release-manager`
  目标包中的第十七个真实实现迁移切口；`release` 子层开始直接承接 management/runtime deps source 到 accessor deps 的聚合装配逻辑
- `release-manager/src/release/release-accessor-source.service.ts`
  已承接 `ReleaseAccessorSourceService` 的真实实现逻辑，形成当前 `release-manager`
  目标包中的第十八个真实实现迁移切口；`release` 子层开始直接承接 runtime/management source 聚合入口
- `release-manager/src/release/release-management-accessor-source.service.ts`
  已承接 `ReleaseManagementAccessorSourceService` 的真实实现逻辑，形成当前
  `release-manager` 目标包中的第十九个真实实现迁移切口；`release` 子层开始直接承接 management 侧 query/draft/audit source 聚合入口
- `release-manager/src/release/release-management-facade-accessors.service.ts`
  已承接 `ReleaseManagementFacadeAccessorsService` 的真实实现逻辑，形成当前
  `release-manager` 目标包中的第二十个真实实现迁移切口；`release` 子层开始直接承接 management facade accessors 组合装配逻辑
- `release-manager/src/release/{release-management-facade-context,release-facade-context}.service.ts`
  已承接 release 子层 facade context 链，形成当前 `release-manager`
  目标包中的第二十一与第二十二个真实实现迁移切口；`release` 子层已开始直接承接 management/runtime facade 组合上下文入口
- `release-manager/src/release/{release-runtime-accessor-factory,release-runtime-accessor-bindings,release-runtime-accessor-source}.service.ts`
  已承接 release 子层 runtime accessor 工厂、binding 与 source 链，形成当前
  `release-manager` 目标包中的第二十三到第二十五个真实实现迁移切口；`release` 子层开始直接承接 runtime deps 到 accessors 的本地装配与 runtime source 聚合入口
- `release-manager/src/release/{release-runtime-facade-accessors,release-runtime-facade-context,release-facade-accessors}.service.ts`
  已承接 release 子层 runtime facade accessors 与总装配上下文链，形成当前
  `release-manager` 目标包中的第二十六到第二十八个真实实现迁移切口；`release` 子层开始直接承接 runtime facade accessors 与 runtime/management 总装配器入口
- `release-manager/src/release/release-support-accessor-deps.service.ts`
  已承接 `ReleaseSupportAccessorDepsService` 的真实实现逻辑，形成当前
  `release-manager` 目标包中的第二十九个真实实现迁移切口；`release` 子层开始直接承接 support 能力到 management/runtime accessor deps 的本地桥接入口
- `release-manager/src/release/release-audit-accessor-deps.service.ts`
  已承接 `ReleaseAuditAccessorDepsService` 的真实实现逻辑，形成当前
  `release-manager` 目标包中的第三十个真实实现迁移切口；`release` 子层开始直接承接到 audit 子层的本地审计事件桥接入口
- `release-manager/src/release/release-lifecycle.service.ts`
  已承接 `ReleaseLifecycleService` 的真实实现逻辑，形成当前
  `release-manager` 目标包中的第三十一个真实实现迁移切口；`release` 子层开始直接承接 capability 归档与已发布 Skill 停用的 lifecycle 主流程
- `release-manager/src/release/{capability-release.controller,capability-release.service,capability-release.manifest.service,capability-release.module}.ts`
  已承接 release 子层更上层主入口实现，形成当前
  `release-manager` 目标包中的第三十二到第三十五个真实实现迁移切口；`release` 子层开始直接承接 capabilities 路由入口、发布主服务、manifest 组装入口与模块装配入口
- `release-manager/package.json`
  已补齐顶层主入口本地化所需的最小依赖声明，并把 `main` / `types` / `exports` 对齐到真实 `dist` 产物路径；当前目标包可独立解析 Nest 装饰器、release manifest 合约类型并完成包级 build/typecheck
- 本批次除选定的最小真实实现迁移切口外，不引入更大范围的实现迁移，不改 controller route，不改外部 API

## 验证结果

- 编译：
  - `pnpm --filter @ops/release-manager run typecheck` 通过
  - `pnpm --filter @ops/platform run typecheck` 通过
- 测试：未新增自动化测试；本批次属于目标包稳定导出面与文件位形补齐
- 接口：未改 route、协议与数据库 Schema
- 容器：未执行；本批次未触达需要容器级验证的运行链
- 诊断：
  - `release-manager/src/release/index.ts` 无 diagnostics
  - 新增的 `capability-release.service.ts` 与
    `capability-release.manifest.service.ts` 无 diagnostics
  - 新增的 `release-support-accessor-deps.service.ts` 与本轮调整的
    `release-accessor-{factory,bindings,deps,source}.service.ts`、
    `release-{runtime-accessor-source,facade-context}.service.ts`
    无 diagnostics
  - 新增的 `release-audit-accessor-deps.service.ts`、
    `release-lifecycle.service.ts` 与本轮调整的
    `release-{management-accessor-source,draft-query-source}.service.ts`、
    `release-{facade-accessor-factory,management-facade-accessors,management-facade-context,facade-accessors,facade-context}.service.ts`
    无 diagnostics
  - 新增的 `capability-release.{controller,service,manifest.service,module}.ts`
    与 `package.json` 无 diagnostics
  - `release-manager/README.md` 无 diagnostics
  - `pnpm --filter @ops/release-manager run build` 通过，且 `package.json` 导出路径已能命中真实 `dist` 产物

## 结论

- 是否通过：通过当前 `Phase C` 前置准备的小步落地标准
- 已达成：
  - `release-manager` 目标包的 `release` 子层已有清晰的本地文件位形
  - 后续若把 `CapabilityReleaseController`、`CapabilityReleaseService`、
    `CapabilityReleaseManifestService` 等真实实现逐步迁入目标包，已有明确文件落点
  - `compiler` 子层入口已开始优先消费目标包本地文件，而不是继续整层透传旧稳定层入口
  - `audit` 子层入口已开始优先消费目标包本地服务文件，而不是继续整层透传旧稳定层入口
  - `validator` 子层已补齐缺失的发布前校验服务文件位形，入口也已开始优先消费目标包本地文件
  - `publisher` 子层已补齐缺失的发布/部署/运行时绑定服务文件位形，入口也已开始优先消费目标包本地文件
  - `release-manager` 目标包已开始承接多个真实实现，而不再只有文件位形和导出面
  - `publisher` 子层已经具备部署主流程、发布主流程、运行时绑定、部署后 smoke test、发布写入和 Skill 发布六类真实实现切口
  - `release` 子层已经具备详情查询、release 创建与 source 更新、draft/query 组合桥接、support 支撑链、support accessor deps、audit accessor deps、lifecycle 主流程、accessor factory、accessor bindings、accessor deps、accessor source、runtime accessor factory、runtime accessor bindings、runtime accessor source、management facade accessors、runtime facade accessors、facade accessors、management/runtime facade context，以及 controller/service/module/manifest 顶层主入口等真实实现切口
  - 当前改动仍保持外部 API、route、数据库 Schema 与消费方不切换，只推进目标包内部真实实现迁移
- 遗留问题：
- `core/platform/src/release-manager/{index,release,compiler,publisher,validator,audit}` compat facade 已删除；平台侧消费方已切到 `@ops/release-manager/*`
  - `release-manager` 目标包虽然已具备顶层主入口实现且包导出已对齐构建产物，但当前尚未执行消费方切换与容器/接口回归
  - `core/platform` 若直接跨包引用 `release-manager/src/*` 源码会触发 `rootDir` 边界错误；后续消费方切换需基于包产物与依赖关系调整，而不是继续直接引用目标包源码
- 下一批次前置条件：
- 当前 `@ops/platform -> @ops/release-manager` 的包依赖/消费策略已落地；后续可继续围绕容器/接口回归与剩余文档同步推进
  - 若准备切换消费方，则需同步补接口回归与容器验证记录
