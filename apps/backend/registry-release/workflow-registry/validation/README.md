# workflow-registry/validation

当前目录代表未来 `registry-release/workflow-registry/validation` 的逻辑子层视图。

当前仓库里，相关实现仍主要物理位于：

- `apps/backend/core/platform/src/modules/execution-flow/validation`
- `apps/backend/core/platform/src/modules/execution-flow/interfaces.ts`
- `apps/backend/core/platform/src/modules/temporal-workflow/validation`
- `apps/backend/core/platform/src/modules/temporal-workflow/temporal-workflow-validation.service.ts`
- `apps/backend/core/platform/src/modules/temporal-workflow/temporal-activity-validation.service.ts`

本目录在当前批次的职责，是把 Flow / Workflow / Activity 的设计时校验 facade、
校验结果类型与校验服务出口，统一解释为 `workflow-registry` 内部的 `validation` 子层。

## 该子层负责

- Flow 模板验证结果类型与验证 facade
- Temporal Workflow 的设计时校验服务出口
- Temporal Activity 的结构校验与配置校验
- 为注册侧模板资产提供统一的发布前设计时校验入口

## 该子层不负责

- Flow 模板、Workflow 模板、Activity 定义的注册入口本身
- Workflow / Activity 的代码生成与配置归一化辅助
- Release Manifest 生成、发布门禁与回滚
- Control-plane 的执行状态推进
- Runtime worker 内的真实工作流执行

## 与其他子层的关系

`validation` 是 `workflow-registry` 中负责“设计时校验 facade 与校验结果收口”的子层，
但不是模板注册入口或代码生成所在层。

当前应按以下方式理解：

- `flow-template`
  - 负责 Execution Flow 模板定义与注册
- `workflow-template`
  - 负责 Temporal Workflow 模板与草稿
- `activity-template`
  - 负责 Activity 定义、CRUD 与相关辅助
- `validation`
  - 负责 Flow / Workflow / Activity 校验 facade、校验服务与相关类型
- `codegen`
  - 负责设计时代码生成与配置归一化辅助

约束：

- 新的设计时模板校验入口应进入 `validation`
- 新的模板注册、草稿管理或 CRUD 逻辑不应继续堆入 `validation`
- 新的代码生成辅助逻辑不应继续堆入 `validation`

## 与发布链的关系

`validation` 子层仍属于注册侧设计时资产范围，只负责在发布前提供模板校验结果，
不直接产出可执行发布态对象。

统一链路应保持为：

```text
execution-flow / temporal-workflow
  -> workflow-registry/validation
    -> release-manager
      -> Release Manifest
        -> control-plane
          -> runtime worker
```

约束：

- `validation` 只提供校验结果、校验服务与类型，不绕开 `release-manager`
- `control-plane` 不应直接消费 `validation` 子层内部校验细节驱动执行

## 当前物理实现映射

当前对应关系如下：

- `execution-flow/validation/index.ts`
  - 该过渡 barrel 已在后续 Phase E 删除；Flow 模板验证 facade 当前直接对齐 `execution-flow-validation.service.ts`、`execution-flow-validation-http.service.ts` 与 `execution-flow-validation-facade.service.ts`
- `ValidationResult` / `StepAnalysis`
  - 对应未来 Flow 模板验证结果类型
- `ExecutionFlowValidationService` / `ExecutionFlowValidationHttpService` / `ExecutionFlowValidationFacadeService`
  - 当前直接对应 Flow 模板验证服务、HTTP 校验入口与 facade
- `temporal-workflow-validation.service.ts` / `temporal-workflow-validation-facade.service.ts`
  - 对应未来 Workflow 设计时校验 facade 与服务
- `temporal-activity-validation.service.ts` / `temporal-activity-validation-facade.service.ts`
  - 对应未来 Activity 结构与配置校验 facade 与服务
- `workflow-registry/validation/temporal-workflow-artifact-validation.service.ts`
  - 对应未来 Workflow artifact 校验服务
- `workflow-registry/validation/temporal-workflow-dsl-validation.service.ts`
  - 对应未来 Workflow DSL 校验服务
- `TemporalWorkflowValidationService`
  - 对应未来 Workflow 设计时校验服务
- `ActivityValidationService`
  - 对应未来 Activity 结构与配置校验服务
- `temporal-workflow.types` / `temporal-activity.types`
  - 对应未来 Workflow / Activity 校验相关类型出口

## 当前结论

本轮之后，`workflow-registry` 内部的统一校验子层已进一步显式化：

- `validation` 统一承接 Flow / Workflow / Activity 的设计时校验 facade、服务与类型
- `validation` 继续作为注册侧进入发布链之前的校验收口层
- 模板注册与代码生成继续留在各自子层
- 当前已开始由目标包本身承接最小稳定 helper：
  - Execution Flow 校验通过判定
  - Temporal Workflow 校验消息汇总
  - Activity 校验消息汇总
- 当前先固定逻辑边界，不在本批次引入物理迁移
