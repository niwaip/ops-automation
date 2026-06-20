# Debug Session: missing-branch-export

Status: OPEN

## Symptoms

- 会话 `ecorder-debug-1781619987033` 没有生成条件分支。
- 期望是在录制/导出阶段生成包含 `read_value + branch + 后续动作/人工接管` 的单模板结构。

## Scope

- Recorder Debug export path
- Branch analysis trigger path
- Exported template/templateSteps generation

## Hypotheses

1. 该会话没有形成可供分支分析的详情页观测，导致 `buildTemplateStepsForExport()` 直接返回空。
2. 该会话的用户意图或历史消息没有命中“生成条件分支”的识别条件，分支分析服务未被调用。
3. 分支分析服务被调用了，但返回结果为空或不完整，导致导出时回退为普通步骤。
4. 分支步骤已经生成，但在导出/保存模板时被后续归一化、映射或发布流程覆盖掉了。
5. 当前会话生成的是另一类模板产物，前端看到的不是 `templateSteps` 那条链路的结果。

## Evidence Plan

- 拉取 `ecorder-debug-1781619987033` 对应的 recorder-debug 会话详情、history、executedCommands、lastObservation。
- 检查 export 路径中 `buildTemplateStepsForExport()` 的输入是否满足生成条件。
- 检查 branch analysis 是否被调用，以及返回的 `branchStepSpec/nextAction` 内容。
- 对照最终导出模板/会话结果，确认分支是在“未生成”还是“生成后丢失”。

## Progress Log

- 证据 1：真实会话 ID 为 `recorder-debug-1781619987033`；`GET /ai/recorder-debug/:sessionId` 可正常读到会话。
- 证据 2：该会话的 `lastObservation` 已经位于审批详情页，包含：
  - `currentPageUrl = http://192.168.100.143/#approvals`
  - 粗利率文本 `25.5%`
  - 按钮 `承認する (Approve)` / `却下する (Reject)`
  - 标题 `AI搭載スマート倉庫管理システム導入`
    因此“缺少详情页观测”不是原因。
- 证据 3：该会话的 `executedCommands` 只有 3 条线性命令：
  - `navigate -> http://192.168.100.143/#approvals`
  - `click -> 第一条记录详情`
  - `click -> btn-approve`
    说明录制态本身仍是线性命令序列。
- 证据 4：手动调用 `POST /ai/recorder-debug/export` 后，返回结果明确包含 `templateSteps`，其中有：
  - `step_3 read_value`
  - `step_4 branch`
  - `step_5 click`
    同时 `skillDraft.executionPlan.templateSteps` 和 `publishPayload.executionFlow[].config.executionPlan.templateSteps` 中也都带有同一组条件分支步骤。
- 证据 5：代码路径确认：
  - `exportArtifacts()` 会调用 `buildExportArtifacts()`，见 `recorder-debug.service.ts`
  - `buildExportArtifacts()` 会调用 `buildTemplateStepsForExport()` 并把结果挂到 `executionPlan.templateSteps`
  - `buildTemplateStepsForExport()` 在本会话场景下会调用 `branchAnalysisService.analyzeBranchCondition()`，并显式 push `read_value -> branch -> click`
- 证据 6：AI Orchestrator 日志中，针对该会话在我检查前只有多次 `GET /ai/recorder-debug/recorder-debug-1781619987033`，没有 `POST /ai/recorder-debug/export`；唯一一条 `POST /ai/recorder-debug/export` 是我手动触发检查时产生的。

## Hypothesis Status

- H1 该会话没有详情页观测：已否定。详情页观测完整，足够生成条件分支。
- H2 用户意图没命中条件识别：基本否定。手动 export 立即产出 branch，说明 branch intent 与分析链可正常工作。
- H3 分支分析服务被调用但返回空：已否定。export 返回了完整 `branchStepSpec` 落地结果。
- H4 分支步骤生成后被覆盖：当前未见证据。export 响应、`skillDraft.executionPlan`、`publishPayload` 中都保留了 `templateSteps`。
- H5 看到的不是 templateSteps 链路结果：已确认。你查看时拿到的是录制态会话/线性 commands，而不是 export 后的 `templateSteps` 产物。
