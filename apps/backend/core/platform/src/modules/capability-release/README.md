# capability-release -> release-manager

当前目录仍物理位于 `core/platform`，但逻辑归属已经切换为未来的
`registry-release/release-manager`。

## 该模块负责

- Release 草稿、构建、校验、发布与回滚编排
- Release Manifest 生成与设计时资产装配
- 面向发布阶段的运行时绑定、部署与审计辅助

## 该模块不负责

- Skill、Execution Flow、Temporal Workflow 的注册入口
- Control-plane 执行状态推进
- Runtime Worker 内的原子执行逻辑

## 与发布链的关系

- Release 是唯一可执行资产门禁。
- Skill、Workflow、Template 等设计时对象必须先在这里完成装配、校验、
  发布并生成 Release Manifest，才能被 control-plane 消费。

## 当前逻辑分组

- `release/`: Release 主入口、控制器、Manifest 装配，以及与 `release-manager/release` 对齐的稳定导出面
- `compiler/`: 构建、浏览器录制装配、Temporal schema 辅助
- `validator/`: 发布前校验与录制动作约束
- `publisher/`: 发布、部署、运行时绑定与 smoke 校验
- `audit/`: 审计事件映射与发布侧审计语义

当前 `release/` 子层已具备本地稳定文件位形：

- `capability-release.controller.ts`
- `capability-release.manifest.service.ts`
- `capability-release.module.ts`
- `capability-release.service.ts`
- `index.ts`

当前 `CapabilityReleaseService` 也已开始把 `query` / `draft` / `build-validation` /
`runtime` / `publish` / `deployment` / `assist` 委托收敛为私有 façade helper，
减少在公开方法中散落的协作细节，同时保持外部 API 与路由不变。
