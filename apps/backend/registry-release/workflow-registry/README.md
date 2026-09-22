# Workflow Registry

本包持有 Flow、Workflow、Activity 的设计时定义、草稿、校验和代码生成。实际源码位于 `src/flow-template/`、`src/workflow-template/`、`src/activity-template/`、`src/validation/`、`src/codegen/` 及 `src/temporal/` 等目录；Nest 模块、控制器和运行时桥接协作者也已落在本包。

设计时资产经 `release-manager` 编译和发布，再由 `control-plane` 与 runtime worker 执行。新增模板或校验能力应进入本包对应子目录。包的可用入口以 [package.json](package.json) 的 `exports` 为准。
