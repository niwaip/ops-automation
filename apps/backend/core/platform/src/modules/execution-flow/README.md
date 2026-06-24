# execution-flow -> workflow-registry

当前目录仍物理位于 `core/platform`，但逻辑归属已经切换为未来的
`registry-release/workflow-registry`。

## 该模块负责

- Execution Flow 模板定义与查询入口
- 面向设计时的流程模板接口
- 作为 Workflow Registry 的轻量模板注册面

## 该模块不负责

- Release 发布、审批、回滚
- Runtime 执行调度
- Temporal Activity 代码生成与执行

## 与发布链的关系

- Execution Flow 是设计时模板资产。
- 它需要与 Temporal Workflow 等工作流定义一起进入 release-manager，
  生成统一的 Release Manifest 后才能进入 control-plane。

## 当前逻辑分组

- 根入口：优先通过 `modules/execution-flow/index.ts` 访问稳定导出面
- `registry/`: Flow 模板注册入口
- `template/`: Flow 模板服务
- `validation/`: Flow 模板验证结果类型与验证 facade
