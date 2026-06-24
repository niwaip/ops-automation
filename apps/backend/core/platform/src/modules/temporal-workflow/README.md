# temporal-workflow -> workflow-registry

当前目录仍物理位于 `core/platform`，但逻辑归属已经切换为未来的
`registry-release/workflow-registry`。

## 该模块负责

- Temporal Workflow / Activity 的设计时模板管理
- Workflow 草稿、模板、活动定义与相关校验
- 面向注册阶段的代码生成与配置归一化辅助

## 该模块不负责

- Release 发布门禁与回滚
- Control-plane 执行状态推进
- Runtime Worker 内的实际工作流执行

## 与发布链的关系

- Temporal Workflow 与 Activity 都属于设计时工作流资产。
- 它们必须先进入 release-manager，转换成可执行的 Release Manifest，
  再由 control-plane 与 runtime worker 消费。

## 当前逻辑分组

- 根入口：优先通过 `modules/temporal-workflow/index.ts` 访问稳定导出面
- `workflow/`: Workflow 模板、草稿、配置、校验
- `activity/`: Activity 注册、CRUD、校验、执行辅助
- `codegen/`: Workflow 与 Activity 的代码生成辅助
- `validation/`: Workflow / Activity 校验 facade 与相关类型出口
