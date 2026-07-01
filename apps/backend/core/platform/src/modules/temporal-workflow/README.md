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

- 对外稳定入口：优先通过 `src/workflow-registry/workflow-template/*` 具名协作者实现、`src/modules/temporal-workflow/temporal-workflow.service.ts` 与 `temporal-workflow.types.ts` 访问 `TemporalWorkflowModule`、`TemporalWorkflowService` 与类型出口
- 历史模块根入口 `modules/temporal-workflow/index.ts` 已在后续 Phase E 删除；当前优先通过 `src/workflow-registry/{workflow-template,codegen,validation}`、`runtime-bridge/*` 或具体真实实现文件直接消费，运行时兼容锚点仍保留在 `browser-bridge` 目录与 `runtime-bridge/*` 真实实现
- `workflow-template`: Workflow façade、模板、草稿、配置，以及持久化 / draft / session / config 编排协作者
- `activity/`: Activity 注册、CRUD、定义解析、校验前管理
- `codegen`: Workflow 与 Activity 的代码生成辅助
- `validation/`: Workflow / Activity 校验 facade 所在目录；其中聚合 barrel 已删除，消费方直接指向具体 validation 服务与类型实现
- `browser-bridge/`: 浏览器模板草稿生成、脚本解析与浏览器 phase 编排兼容层
- `runtime-bridge/`: Activity 运行时执行辅助与结果归一化兼容层；其中聚合 barrel 已删除，消费方直接指向具体 controller / service / utils 实现

## 当前真实承接状态

- `src/workflow-registry/workflow-template` 已开始承接部分 Workflow 协作者实现：
  - `TemporalWorkflowArtifactService`
  - `TemporalWorkflowConfigOrchestrationService`
  - `TemporalWorkflowConfigService`
  - `TemporalWorkflowSessionSupportFactoryService`
  - `TemporalWorkflowSessionOrchestrationService`
  - `TemporalWorkflowDraftOrchestrationService`
  - `TemporalWorkflowManagementService`
  - `TemporalWorkflowTemplateService`
- `src/workflow-registry/validation` 已开始承接部分校验协作者实现：
  - `TemporalWorkflowDslValidationService`
  - `TemporalWorkflowArtifactValidationService`
- `src/workflow-registry/codegen` 已开始承接部分代码生成协作者实现：
  - `TemporalWorkflowCodegenOrchestrationService`
- `src/workflow-registry/codegen/index.ts` 与 `browser-bridge/index.ts` 过渡 barrel 已在后续 Phase E 删除；平台消费方当前直接切到 `codegen/temporal-workflow-codegen-orchestration.service.ts`、`browser-bridge/temporal-workflow-browser-draft.service.ts`、`browser-bridge/temporal-workflow-browser.helpers.ts`
- `modules/temporal-workflow/workflow/index.ts`、`modules/temporal-workflow/validation/index.ts`、`modules/temporal-workflow/codegen/index.ts`、`modules/temporal-workflow/runtime-bridge/index.ts`、`src/workflow-registry/workflow-template/index.ts` 与 `src/workflow-registry/validation/index.ts` 聚合壳已在后续 Phase E 删除；平台消费方当前直接切到 `src/workflow-registry/workflow-template/*`、`src/workflow-registry/codegen/*`、`src/workflow-registry/validation/*`、`runtime-bridge/*` 或具体真实实现文件
- `modules/temporal-workflow/activity/index.ts` 历史聚合壳也已删除；`activity-template` 相关消费方当前直接切到具体 activity 实现文件
- 根目录下历史 `temporal-workflow-browser-draft.service.ts`、`temporal-workflow-browser.helpers.ts`、`temporal-activity-execution.service.ts`、`temporal-activity-execution.helpers.ts` 转发壳也已删除，消费方分别切到 `browser-bridge` 与 `runtime-bridge`
- 根目录下历史 `temporal-workflow-service.utils.ts`、`temporal-workflow-codegen.helpers.ts` 聚合 wrapper 也已删除，消费方分别切到 `temporal-workflow-json.utils.ts` / `temporal-workflow-python.utils.ts` / `temporal-workflow-reference-url.utils.ts` 与具体 codegen helper 文件
