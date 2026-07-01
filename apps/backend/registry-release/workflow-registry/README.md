# workflow-registry

当前目录代表未来 `registry-release/workflow-registry` 的统一逻辑视图。

当前仓库里，相关实现仍主要物理位于：

- `apps/backend/core/platform/src/modules/execution-flow`
- `apps/backend/core/platform/src/modules/temporal-workflow`
- `apps/backend/core/platform/src/workflow-registry`

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
- `execution-flow/execution-flow-template.service.ts`
  - 对应未来 `flow-template` 的模板服务；旧 `execution-flow/template/index.ts` compat 壳已在后续 Phase E 删除
- `execution-flow/validation`
  - 对应未来统一 `validation` 子层的一部分
- `core/platform/src/workflow-registry/workflow-template`
  - 对应未来 `workflow-template`；旧 `modules/temporal-workflow/workflow/index.ts` 与 `core/platform/src/workflow-registry/workflow-template/index.ts` 聚合壳已在后续 Phase E 删除
- `temporal-workflow/activity`
  - 对应未来 `activity-template`
- `core/platform/src/workflow-registry/codegen`
  - 对应未来 `codegen`；旧 `modules/temporal-workflow/codegen/index.ts` 聚合壳已在后续 Phase E 删除
- `temporal-workflow/validation`
  - 对应未来统一 `validation` 子层的一部分

当前已经开始出现一层更贴近真实归属的过渡承接：

- `core/platform/src/workflow-registry/workflow-template`
  - 已开始承接 `workflow-template` 子层的核心真实协作者实现
- `core/platform/src/modules/temporal-workflow/*`
  - `activity-template` 相关平台承接当前位于 `temporal-activity.service.ts`、`temporal-activity-crud.service.ts`、`temporal-activity-validation.service.ts`、`builtin-activity.registry.ts` 与 `temporal-activity.types.ts` 等真实实现文件；旧 `core/platform/src/workflow-registry/activity-template` facade 与 `modules/temporal-workflow/activity/index.ts` 聚合壳已在后续 Phase E 删除
- `core/platform/src/workflow-registry/validation`
  - 已开始承接部分 Workflow 校验相关真实协作者实现；旧 `core/platform/src/workflow-registry/validation/index.ts` 聚合壳已在后续 Phase E 删除
- `core/platform/src/workflow-registry/codegen`
  - 已开始承接部分 Workflow 代码生成相关真实协作者实现
- `core/platform/src/modules/execution-flow/registry`
  - 该过渡 barrel 已在后续 Phase E 删除；`core/platform/src/workflow-registry/flow-template` 这层纯 facade 也已删除，消费方当前直接切到 `modules/execution-flow/{execution-flow.module.ts,execution-flow.controller.ts,interfaces.ts}` 与相关真实实现文件
- `apps/backend/registry-release/workflow-registry/src/workflow-template`
  - 已开始通过目标包稳定导出这些 `workflow-template` 设计时协作者，而不再只暴露旧的 module/service 两个符号
- `apps/backend/registry-release/workflow-registry/src/workflow-template`
  - 已开始补充 sourceTemplate 解析与模板草稿来源判定 helper
- `apps/backend/registry-release/workflow-registry/src/activity-template`
  - 已开始以显式稳定导出方式承接活动定义/CRUD 协作者，并补充 builtin activity 引用判定与 codegen 成功判定 helper
- `apps/backend/registry-release/workflow-registry/src/flow-template`
  - 已开始以显式稳定导出方式承接 Flow 模板模块/控制器/模板服务，并补充分类元信息读取与工具名汇总 helper
- `apps/backend/registry-release/workflow-registry/src/{flow-template,workflow-template,activity-template,validation}`
  - 已统一改为只转发 `core/platform` 下的稳定设计时子层，不再直接指向旧 `execution-flow/*` 或 `temporal-workflow/*.types` 路径；其中 `workflow-template.services.ts`、`workflow-registry-validation.ts`、`workflow-registry-codegen.ts` 二跳 wrapper、顶层 `temporal-workflow.ts`、`temporal-activity.ts` compat shell，以及 `execution-flow.ts` 纯转发 leaf shell 已在后续 Phase E 删除
- `apps/backend/registry-release/workflow-registry/src/browser-bridge/index.ts`
  - 包侧 `browser-bridge` compat 子入口已在后续 Phase E 删除；当前保留的浏览器草稿运行时锚点仅位于 `core/platform/src/modules/temporal-workflow/browser-bridge/*`
- `apps/backend/registry-release/workflow-registry/src/index.ts`
  - 包侧根入口聚合 barrel 已在后续 Phase E 删除；当前只保留 `flow-template`、`workflow-template`、`activity-template`、`validation` 与 `codegen` 五个子层入口
- `apps/backend/registry-release/workflow-registry/src/codegen`
  - 已开始以显式稳定导出方式承接 codegen 协作者，并补充生成成功判定与结果摘要 helper

## 当前结论

本轮之后，`execution-flow` 与 `temporal-workflow` 的共同归属已进一步显式化：

- 两者统一属于 `workflow-registry`
- 两者统一只承接设计时工作流资产
- Execution Flow 模板注册面继续收口到 `workflow-registry/flow-template`
- 统一校验 facade 与相关类型继续收口到 `workflow-registry/validation`
- `codegen` 已开始由目标包承接最小稳定 helper，而不再只是纯透传
- `workflow-template` 已开始由目标包承接模板来源解析类 helper，而不再只是纯透传
- `activity-template` 已开始由目标包承接 builtin activity 与 codegen 判定类 helper，而不再只是纯透传
- `flow-template` 已开始由目标包承接 Flow 分类与工具汇总类 helper，而不再只是纯透传
- `core/platform/src/workflow-registry` 已开始承接部分真实实现，但 `apps/backend/registry-release/workflow-registry` 目标包本身仍主要承担稳定入口与逻辑归属表达
- 发布门禁继续属于 `release-manager`
- 执行语义继续属于 `control-plane` 与 runtime worker
- 当前尚未切换到 `apps/backend/registry-release/workflow-registry` 直接承接真实实现，但“只存在逻辑视图、不存在任何真实承接”的状态已经结束
