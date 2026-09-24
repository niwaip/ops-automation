# Release Manager

本包负责将注册态 Skill 和 Workflow 资产编译、校验、发布为 Release Manifest，并处理部署绑定及发布审计。真实实现位于 `src/`：

- `release/`：发布入口、生命周期、查询和 Manifest 装配。
- `compiler/`：录制流程、Temporal Schema 和构建辅助。
- `validator/`：发布前约束和执行计划校验。
- `publisher/`：发布动作、运行时绑定、部署和 smoke 校验。
- `audit/`：发布侧审计。

新增逻辑按以上职责放置；包入口以 [package.json](package.json) 的 `exports` 为准。执行生命周期属于 `control-plane`，Skill 与 Workflow 的注册态编辑属于各自 registry。
