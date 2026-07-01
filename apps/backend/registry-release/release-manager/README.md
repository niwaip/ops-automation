# release-manager

当前目录代表未来 `registry-release/release-manager` 的统一逻辑视图。

当前仓库里，当前稳定实现与导出入口已主要收口到：

- `apps/backend/core/platform/src/release-manager`

旧兼容层仍保留在：

- `apps/backend/core/platform/src/modules/capability-release`

本目录在当前批次的职责，是把当前 `capability-release` 模块统一解释为发布侧中心，
并明确它与 `skill-registry`、`workflow-registry`、`control-plane`、runtime worker
的边界。

## 该目录负责

- Release 草稿、构建、校验、发布与回滚编排
- Release Manifest 生成与设计时资产装配
- 面向发布阶段的运行时绑定、部署与 smoke 校验
- 发布侧审计语义与审计事件映射
- 作为未来发布门禁中心的统一逻辑入口

## 该目录不负责

- Skill 定义、匹配、访问与工具绑定的注册入口
- Flow / Workflow / Activity 的设计时模板注册
- Control-plane 的执行状态推进
- Runtime worker 中的真实原子执行
- 浏览器域、文档域、专项 Agent 的内部高频运行逻辑

## 当前统一归属

当前应统一按以下方式理解：

- `capability-release`
  - 偏向发布编排、Manifest 装配、部署绑定、发布前校验与回滚

虽然当前仍物理位于 `core/platform`，但逻辑归属已经统一切换到：

- `registry-release/release-manager`

## 与注册侧的关系

`release-manager` 不承载设计时注册资产本身，而负责把注册侧资产收口为可执行发布态。

当前注册侧至少包含：

- `skill-registry`
- `workflow-registry`

约束：

- 新的 Skill 注册逻辑应进入 `skill-registry`
- 新的 Flow / Workflow / Activity 注册逻辑应进入 `workflow-registry`
- 新的发布编译、Manifest 装配、部署绑定逻辑应进入 `release-manager`

## 与执行链的关系

`release-manager` 是设计时资产进入执行链前的唯一受控门禁。

统一链路应保持为：

```text
skill-registry
  + workflow-registry
    -> release-manager
      -> Release Manifest
        -> control-plane
          -> runtime worker
```

约束：

- 任何新的可执行入口都不应绕开 `Release Manifest`
- `control-plane` 应消费发布态资产，而不是直接消费注册态对象
- runtime worker 应消费控制面下发的执行信息，而不是直接读取注册态定义

## 当前逻辑分层

未来 `release-manager` 至少应稳定包含以下几类逻辑：

- `release`
  - Release 主入口、控制器、Manifest 装配
- `compiler`
  - 构建、浏览器录制装配、Temporal schema 辅助
- `validator`
  - 发布前校验与录制动作约束
- `publisher`
  - 发布、部署、运行时绑定与 smoke 校验
- `audit`
  - 审计事件映射与发布侧审计语义

当前已补充的子层说明：

- `release/README.md`
  - 明确发布主入口、Manifest 装配与主流程收口边界
- `compiler/README.md`
  - 明确构建、浏览器录制装配与 Temporal schema 辅助边界
- `validator/README.md`
  - 明确发布前校验、录制动作约束与执行计划验证边界
- `publisher/README.md`
  - 明确发布动作、部署绑定、运行时绑定与 smoke 校验边界
- `audit/README.md`
  - 明确发布侧审计语义、事件映射与审计结果收口边界
- `package.json#exports`
  - 当前仅保留 `release` 稳定 subpath export；根入口 `.` 与 `src/index.ts` 已在后续 Phase E 删除，`compiler`、`publisher`、`validator`、`audit` 服务类与 `interfaces` DTO/type 当前均不再通过包根聚合暴露
- `core/platform/src/release-manager/platform/release-manager-runtime-adapter.module.ts`
  - 当前仅保留平台内 runtime token 绑定锚点；`release/ compiler/ publisher/ validator/ audit` 与根 `index.ts` 兼容导出层已在后续 Phase E 中删除
- `core/platform/src/release-manager/release/{release-accessor-deps,release-accessor-source}.service.ts`
  - 已开始承接一小束纯委托型 accessor 组装服务，作为 `release` 子层的最短真实 ownership 迁移切口
- `core/platform/src/release-manager/release/{release-facade-accessors,release-facade-context}.service.ts`
  - 已继续承接同一条纯委托型 facade 组装服务链，扩展 `release` 子层的真实 ownership 迁移范围
- `core/platform/src/release-manager/release/{release-facade-accessor-factory,release-accessor-factory}.service.ts`
  - 已继续承接同一条纯委托型工厂组装服务链，并把相关 accessor 依赖类型同步收口到稳定层
- `core/platform/src/release-manager/release/index.ts`
  - 当前仅保留稳定导出面；历史 `release-query.service.ts`、`release-draft.service.ts`、`release-support.service.ts`、`release-lifecycle.service.ts` 与 `release-audit-accessor-deps.service.ts` 本地薄包装已删除，运行时仅保留 `ReleaseManagerRuntimeAdapterModule` 负责 token 绑定
- `core/platform/src/release-manager/release/{release-draft-query-bridge,release-draft-query-source}.service.ts`
  - 已开始承接草稿查询桥接与来源组装服务，使草稿链在稳定层内形成更完整的最短协作闭环
- `apps/backend/registry-release/release-manager/src/{release,compiler,publisher,validator,audit}`
  - 已统一改为优先承接目标包本地实现；其中 `release` 继续保留稳定 subpath 入口，`compiler`、`publisher`、`validator`、`audit` 的子层 barrel 与包根 `src/index.ts` 已在后续 Phase E 删除，测试与平台消费方当前直接切到 `release` 稳定入口或目标包真实实现文件；旧 `modules/capability-release/*` 与 `core/platform/src/release-manager/*` compat facade 已在后续 Phase E 中删除
- `apps/backend/registry-release/release-manager/src/release/{capability-release.controller,capability-release.manifest.service,capability-release.module,capability-release.service}.ts`
  - 已补齐目标包 `release` 子层的本地稳定文件位形，先固定未来真实迁移落点，但当前仍只转发稳定层实现
- `apps/backend/registry-release/release-manager/src/compiler/*`
  - 当前不再保留 `src/compiler/index.ts` 子层 barrel；相关真实实现文件由包内直接承接
- `apps/backend/registry-release/release-manager/src/audit/*`
  - 当前不再保留 `src/audit/index.ts` 子层 barrel；相关真实实现文件由包内直接承接
- `apps/backend/registry-release/release-manager/src/validator/*`
  - 当前不再保留 `src/validator/index.ts` 子层 barrel；相关真实实现文件由包内直接承接
- `apps/backend/registry-release/release-manager/src/publisher/*`
  - 当前不再保留 `src/publisher/index.ts` 子层 barrel；相关真实实现文件由包内直接承接
- `apps/backend/registry-release/release-manager/src/validator/capability-release-publish-validator.service.ts`
  - 已承接 `CapabilityReleasePublishValidatorService` 的真实实现逻辑；旧 `core/platform/src/modules/capability-release/validator/*` 已在首批 Phase E 中删除
- `apps/backend/registry-release/release-manager/src/publisher/release-runtime-binding.service.ts`
  - 已承接 `ReleaseRuntimeBindingService` 的真实实现逻辑；旧 `core/platform/src/modules/capability-release/publisher/*` 已在首批 Phase E 中删除
- `apps/backend/registry-release/release-manager/src/publisher/capability-release-deployment-smoke.service.ts`
  - 已承接 `CapabilityReleaseDeploymentSmokeService` 的真实实现逻辑；旧 `core/platform/src/modules/capability-release/publisher/*` 已在首批 Phase E 中删除
- `apps/backend/registry-release/release-manager/src/publisher/capability-release-publish-writer.service.ts`
  - 已承接 `CapabilityReleasePublishWriterService` 的真实实现逻辑；旧 `core/platform/src/modules/capability-release/publisher/*` 已在首批 Phase E 中删除
- `apps/backend/registry-release/release-manager/src/publisher/capability-release-skill-publisher.service.ts`
  - 已承接 `CapabilityReleaseSkillPublisherService` 的真实实现逻辑；旧 `core/platform/src/modules/capability-release/publisher/*` 已在首批 Phase E 中删除
- `apps/backend/registry-release/release-manager/src/publisher/capability-release-deployment.service.ts`
  - 已承接 `CapabilityReleaseDeploymentService` 的真实实现逻辑；旧 `core/platform/src/modules/capability-release/publisher/*` 已在首批 Phase E 中删除
- `apps/backend/registry-release/release-manager/src/publisher/capability-release-publish.service.ts`
  - 已承接 `CapabilityReleasePublishService` 的真实实现逻辑；旧 `core/platform/src/modules/capability-release/publisher/*` 已在首批 Phase E 中删除
- `apps/backend/registry-release/release-manager/src/release/release-query.service.ts`
  - 已承接 `ReleaseQueryService` 的真实实现逻辑；当前目标包直接拥有 Capability 详情聚合与发布中心可见性判定查询链
- `apps/backend/registry-release/release-manager/src/release/release-draft.service.ts`
  - 已承接 `ReleaseDraftService` 的真实实现逻辑；当前目标包直接拥有 release 创建、source snapshot 落库与 source 更新主链
- `apps/backend/registry-release/release-manager/src/release/{release-draft-query-bridge,release-draft-query-source}.service.ts`
  - 已承接 draft/query 最短协作桥接链；当前目标包直接拥有 release 子层内部 query-draft 组合编排入口
- `apps/backend/registry-release/release-manager/src/release/release-support.service.ts`
  - 已承接 `ReleaseSupportService` 的真实实现逻辑；当前目标包直接拥有 capability 基础设施自检、核心记录读取与 temporal artifact 绑定辅助链
- `apps/backend/registry-release/release-manager/src/release/release-accessor-factory.service.ts`
  - 已承接 `ReleaseAccessorFactoryService` 的真实实现逻辑；当前目标包直接拥有 release 子层 facade/runtime accessor 工厂组合入口
- `apps/backend/registry-release/release-manager/src/release/release-facade-accessor-factory.service.ts`
  - 已承接 `ReleaseFacadeAccessorFactoryService` 的真实实现逻辑；当前目标包直接拥有 publish/draft/query/lifecycle facade accessor 装配逻辑
- `apps/backend/registry-release/release-manager/src/release/{release-accessor-bindings,release-facade-accessor-bindings}.service.ts`
  - 已承接 release 子层 accessor binding 链；当前目标包直接拥有 management/runtime source 到 accessor deps 的本地绑定逻辑
- `apps/backend/registry-release/release-manager/src/release/release-accessor-deps.service.ts`
  - 已承接 `ReleaseAccessorDepsService` 的真实实现逻辑；当前目标包直接拥有 management/runtime deps source 到 accessor deps 的聚合装配逻辑
- `apps/backend/registry-release/release-manager/src/release/release-accessor-source.service.ts`
  - 已承接 `ReleaseAccessorSourceService` 的真实实现逻辑；当前目标包直接拥有 runtime/management source 聚合入口
- `apps/backend/registry-release/release-manager/src/release/release-management-accessor-source.service.ts`
  - 已承接 `ReleaseManagementAccessorSourceService` 的真实实现逻辑；当前目标包直接拥有 management 侧 query/draft/audit source 聚合入口
- `apps/backend/registry-release/release-manager/src/release/release-management-facade-accessors.service.ts`
  - 已承接 `ReleaseManagementFacadeAccessorsService` 的真实实现逻辑；当前目标包直接拥有 management facade accessors 的组合装配逻辑
- `apps/backend/registry-release/release-manager/src/release/{release-management-facade-context,release-facade-context}.service.ts`
  - 已承接 release 子层 facade context 链；当前目标包直接拥有 management/runtime facade 组合上下文入口
- `apps/backend/registry-release/release-manager/src/release/{release-runtime-accessor-factory,release-runtime-accessor-bindings,release-runtime-accessor-source}.service.ts`
  - 已承接 release 子层 runtime accessor 工厂、binding 与 source 链；当前目标包直接拥有 runtime deps 到 accessors 的本地装配与 runtime source 聚合入口
- `apps/backend/registry-release/release-manager/src/release/{release-runtime-facade-accessors,release-runtime-facade-context,release-facade-accessors}.service.ts`
  - 已承接 release 子层 runtime facade 访问器与组合上下文链；当前目标包直接拥有 runtime facade accessors 与 runtime/management 总装配器入口
- `apps/backend/registry-release/release-manager/src/release/release-support-accessor-deps.service.ts`
  - 已承接 `ReleaseSupportAccessorDepsService` 的真实实现逻辑；当前目标包直接拥有 support 能力到 management/runtime accessor deps 的本地桥接入口
- `apps/backend/registry-release/release-manager/src/release/release-audit-accessor-deps.service.ts`
  - 已承接 `ReleaseAuditAccessorDepsService` 的真实实现逻辑；当前目标包直接拥有 release 子层到 audit 子层的本地审计事件桥接入口
- `apps/backend/registry-release/release-manager/src/release/release-lifecycle.service.ts`
  - 已承接 `ReleaseLifecycleService` 的真实实现逻辑；当前目标包直接拥有 capability 归档与已发布 Skill 停用的 lifecycle 主流程
- `apps/backend/registry-release/release-manager/src/release/{capability-release.controller,capability-release.service,capability-release.manifest.service,capability-release.module}.ts`
  - 已承接 release 子层更上层主入口实现；当前目标包直接拥有 capabilities 路由入口、发布主服务、manifest 组装入口与模块装配入口
- `apps/backend/registry-release/release-manager/package.json`
  - 已补齐顶层主入口本地化所需的最小依赖声明，并把 `main` / `types` / `exports` 对齐到真实 `dist` 产物路径；当前目标包可独立解析 Nest 装饰器、release manifest 合约类型与稳定 subpath 导出

## 当前物理实现映射

当前对应关系如下：

- `apps/backend/registry-release/release-manager/src/release`
  - 已作为当前稳定 `release` 子层实现出口
- `apps/backend/registry-release/release-manager/src/compiler`
  - 已作为当前稳定 `compiler` 子层实现出口
- `apps/backend/registry-release/release-manager/src/validator`
  - 已作为当前稳定 `validator` 子层实现出口
- `apps/backend/registry-release/release-manager/src/publisher`
  - 已作为当前稳定 `publisher` 子层实现出口
- `apps/backend/registry-release/release-manager/src/audit`
  - 已作为当前稳定 `audit` 子层实现出口
- `core/platform/src/release-manager/platform`
  - 已作为平台内 `release-manager` 运行时依赖绑定与 token adapter 的稳定锚点
- `core/platform/src/modules/capability-release/*`
  - 旧物理路径已在后续 Phase E 中完成删除，不再作为平台内消费面或兼容锚点存在

## 当前结论

本轮之后，`registry-release` 平面里的发布侧骨架已进一步显式化：

- `capability-release` 统一属于 `release-manager`
- `release-manager` 与 `skill-registry`、`workflow-registry` 在平面内形成完整三段式结构
- `@ops/release-manager` 包根入口已在后续 Phase E 删除；稳定 subpath 当前仅保留 `release`
- `release-manager` 目标包入口已统一收口到 `core/platform/src/release-manager/*` 稳定子层
- `release / compiler / publisher / validator / audit` 与共享符号已开始通过 `core/platform/src/release-manager/*` 显式承接稳定导出面
- `release` 子层继续经由 `@ops/release-manager/release` 与 `core/platform/src/release-manager/*` 暴露；`compiler / publisher / validator / audit` 当前由目标包真实实现文件与 `core/platform/src/release-manager/*` 暴露
- 旧 `modules/capability-release/*` 物理路径已全部退出
- `release` 子层的草稿、查询、support、lifecycle、facade/runtime accessor 链已完成包侧承接
- `release` 子层的 controller/service/module/manifest 顶层主入口已完成包侧承接
- `audit accessor deps` 与 `release draft` 的 core 本地桥接残留已降为兼容转发，不再反向依赖旧 `modules/capability-release/*`
- `ReleaseManagerRuntimeAdapterModule` 已迁入 `core/platform/src/release-manager/platform`，`AppModule` 已不再直连旧 `modules/capability-release/*`
- 发布门禁、发布前校验、审计收口与 Release Manifest 生成继续集中在 `release-manager`
- 执行语义继续属于 `control-plane` 与 runtime worker
- `core/platform/src/app.module.ts` 已开始直接装配 `@ops/release-manager/release`
  的 `CapabilityReleaseModule`，作为首条运行时主入口切换
- `core/platform/src/release-manager/{release,compiler,publisher,validator,audit}` 已成为平台内的稳定发布侧消费平面
- `core/platform/src/modules/capability-release/*`
  - 旧兼容目录已在 Phase E 中完成删除；当前仅保留 `core/platform/src/release-manager/*` 作为平台内稳定发布侧消费平面
- 其余兼容层与消费方当前仍以最小切换策略推进，避免一次性扩大迁移面
