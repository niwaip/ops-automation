# workflow-registry

当前目录代表未来 `registry-release/workflow-registry` 的统一逻辑视图。

当前仓库里，相关实现仍主要物理位于：

- `apps/backend/core/platform/src/modules/execution-flow`
- `apps/backend/core/platform/src/modules/temporal-workflow`

本目录在当前批次的职责，是把两者统一解释为同一类设计时工作流注册资产，
并明确它们与 `release-manager`、`control-plane`、runtime worker 的边界。

## 该目录负责

- Execution Flow 模板的注册、查询与设计时定义
- Temporal Workflow 模板、Activity 定义与草稿资产
- Workflow / Activity / Flow 模板相关的设计时校验
- 设计时配置归一化与代码生成辅助
- 作为未来工作流注册中心的统一逻辑入口

## 该目录不负责

- Release 发布门禁、审批、回滚
- Release Manifest 生成
- Control-plane 的执行状态推进
- Runtime worker 中的真实工作流执行
- 浏览器模板、文档模板等非工作流设计时资产

## 当前统一归属

当前应统一按以下方式理解：

- `execution-flow`
  - 偏向 Flow 模板注册面与轻量设计时流程定义
- `temporal-workflow`
  - 偏向 Workflow / Activity 设计时模板、草稿、代码生成与校验

两者虽然当前仍位于 `core/platform`，但逻辑归属已经统一切换到：

- `registry-release/workflow-registry`

## 与发布链的关系

`workflow-registry` 只承接设计时资产，不直接产出可执行运行单元。

统一发布链应保持为：

```text
execution-flow / temporal-workflow
  -> release-manager
    -> Release Manifest
      -> control-plane
        -> runtime worker
```

约束：

- 任何新的 Workflow 模板执行入口，都不应绕开 `release-manager`
- 任何新的 Activity / Flow 模板能力，都不应直接进入 `control-plane`

## 当前逻辑分层

未来 `workflow-registry` 至少应稳定包含以下几类逻辑：

- `flow-template`
  - Execution Flow 模板定义与注册
- `workflow-template`
  - Temporal Workflow 模板与草稿
- `activity-template`
  - Activity 定义、CRUD 与相关辅助
- `validation`
  - Flow / Workflow / Activity 校验 facade 与相关类型
- `codegen`
  - 设计时代码生成与配置归一化辅助

当前已补充的子层说明：

- `flow-template/README.md`
  - 明确 Execution Flow 模板注册入口、模板服务与模板 DTO 边界
- `validation/README.md`
  - 明确 Flow / Workflow / Activity 校验 facade、校验服务与相关类型边界

## 当前物理实现映射

当前对应关系如下：

- `execution-flow/registry`
  - 对应未来 `flow-template` 的注册入口
- `execution-flow/template`
  - 对应未来 `flow-template` 的模板服务
- `execution-flow/validation`
  - 对应未来统一 `validation` 子层的一部分
- `temporal-workflow/workflow`
  - 对应未来 `workflow-template`
- `temporal-workflow/activity`
  - 对应未来 `activity-template`
- `temporal-workflow/codegen`
  - 对应未来 `codegen`
- `temporal-workflow/validation`
  - 对应未来统一 `validation` 子层的一部分

## 当前结论

本轮之后，`execution-flow` 与 `temporal-workflow` 的共同归属已进一步显式化：

- 两者统一属于 `workflow-registry`
- 两者统一只承接设计时工作流资产
- Execution Flow 模板注册面继续收口到 `workflow-registry/flow-template`
- 统一校验 facade 与相关类型继续收口到 `workflow-registry/validation`
- 发布门禁继续属于 `release-manager`
- 执行语义继续属于 `control-plane` 与 runtime worker
- 当前先固定统一逻辑视图，不在本批次引入物理迁移
