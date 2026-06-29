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

- `modules/execution-flow/index.ts` 根聚合 barrel 已在后续 Phase E 删除；当前应直接通过本目录下的真实实现文件或仍保留的稳定子层消费
- `registry/index.ts` 过渡 barrel 已在后续 Phase E 删除；`ExecutionFlowModule`、控制器与接口类型当前直接由 `execution-flow.module.ts`、`execution-flow.controller.ts` 与 `interfaces.ts` 承接
- Flow 模板服务：当前由本目录下真实实现文件承接，旧根入口与 `template/index.ts` compat 壳已在后续 Phase E 删除
- `validation/`: Flow 模板验证结果类型与验证 facade
