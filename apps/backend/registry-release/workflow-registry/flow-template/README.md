# workflow-registry/flow-template

当前目录代表未来 `registry-release/workflow-registry/flow-template` 的逻辑子层视图。

当前仓库里，相关实现仍主要物理位于：

- `apps/backend/core/platform/src/modules/execution-flow/registry`
- `apps/backend/core/platform/src/modules/execution-flow/template`
- `apps/backend/core/platform/src/modules/execution-flow/execution-flow.controller.ts`
- `apps/backend/core/platform/src/modules/execution-flow/execution-flow.module.ts`
- `apps/backend/core/platform/src/modules/execution-flow/execution-flow-template.service.ts`
- `apps/backend/core/platform/src/modules/execution-flow/interfaces.ts`

本目录在当前批次的职责，是把 Execution Flow 模板注册入口、模板服务与模板 DTO，
统一解释为 `workflow-registry` 内部的 `flow-template` 子层。

## 该子层负责

- Execution Flow 模板的注册、查询与设计时定义
- Flow 模板控制器入口与模块级收口
- Flow 模板创建、更新、删除、克隆、导入导出等模板生命周期能力
- Flow 模板分类、热门模板、使用统计等注册面辅助能力
- Flow 模板 DTO 与模板数据映射收口

## 该子层不负责

- Flow / Workflow / Activity 的统一校验 facade 与校验结果类型
- Temporal Workflow 模板、草稿与 Activity 定义
- Workflow / Activity 的代码生成与配置归一化辅助
- Release Manifest 生成、发布门禁与回滚
- Control-plane 的执行状态推进与 runtime worker 内的真实执行

## 与其他子层的关系

`flow-template` 是 `workflow-registry` 中负责“Execution Flow 模板注册面与模板服务”的子层，
但不是统一校验层、Temporal 模板层或代码生成层。

当前应按以下方式理解：

- `flow-template`
  - 负责 Execution Flow 模板定义、注册入口与模板服务
- `workflow-template`
  - 负责 Temporal Workflow 模板与草稿
- `activity-template`
  - 负责 Activity 定义、CRUD 与相关辅助
- `validation`
  - 负责 Flow / Workflow / Activity 校验 facade、校验服务与相关类型
- `codegen`
  - 负责设计时代码生成与配置归一化辅助

约束：

- 新的 Flow 模板注册入口、模板服务或模板 DTO 收口逻辑应进入 `flow-template`
- 新的统一校验 facade 不应继续堆入 `flow-template`
- 新的发布门禁或运行时执行逻辑不应继续堆入 `flow-template`

## 与发布链的关系

`flow-template` 子层只承接设计时 Flow 模板资产，不直接产出可执行发布态对象。

统一链路应保持为：

```text
workflow-registry/flow-template
  -> release-manager
    -> Release Manifest
      -> control-plane
        -> runtime worker
```

约束：

- `flow-template` 中的模板资产仍需经过 `release-manager` 才能进入执行链
- `control-plane` 不应直接消费模板注册态对象

## 当前物理实现映射

当前对应关系如下：

- `execution-flow/registry/index.ts`
  - 对应未来 `flow-template` 子层的注册面稳定出口
- `execution-flow/template/index.ts`
  - 对应未来 `flow-template` 子层的模板服务稳定出口
- `ExecutionFlowModule`
  - 对应未来 `flow-template` 子层模块级收口
- `ExecutionFlowTemplateController`
  - 对应未来 `flow-template` 子层控制器入口
- `ExecutionFlowTemplateService`
  - 对应未来 `flow-template` 子层模板服务与模板生命周期能力
- `CreateExecutionFlowTemplateDTO` / `UpdateExecutionFlowTemplateDTO` / `ExecutionFlowTemplateDTO`
  - 对应未来 `flow-template` 子层模板 DTO

## 当前结论

本轮之后，`workflow-registry` 内部的 Flow 模板子层已进一步显式化：

- `flow-template` 统一承接 Execution Flow 模板注册入口、模板服务与模板 DTO
- `flow-template` 继续作为注册侧进入发布链之前的 Flow 模板收口层
- 统一校验、Temporal 模板、代码生成继续留在各自子层
- 当前先固定逻辑边界，不在本批次引入物理迁移
