[OPEN] browser-runtime-mismatch

# Browser Runtime Mismatch Debug

## Bug

- execution id: `5117e4e6-7c61-467f-b54d-bee7d1f967c7`
- symptom: 应该走浏览器执行运行时，但当前看起来被路由到了非浏览器/代码执行运行时。
- expectation: browser recording skill/direct browser execution 应命中浏览器 runtime，而不是 code/custom runtime 分支。

## Hypotheses

- H1: execution 创建时 `normalizedInputJson` 或 `planSteps` 被错误重写，导致 step action/runtime type 已经不是浏览器执行。
- H2: `RuntimeStepRequestFactory` 在构造 runtime request 时把该 execution 识别成了错误的 runtime type / capability type。
- H3: `control-plane -> platform` 调用参数正确，但 `platform` 侧根据 capability/source type 再次路由到了代码执行 runtime。
- H4: 该 execution 关联的 skill / published capability 元数据本身就不是 browser recording source type，导致整条链路按代码运行时处理。
- H5: 用户观察到的是某个下游 phase/step 的执行器日志，看起来像代码执行，但实际上 control-plane phase 选择才是真正偏航点。

## Evidence Plan

- 读取 execution / phases / steps / output_json
- 核对 execution 关联 skill / capability / source_type
- 核对 runtime request 构造逻辑与真实请求参数
- 对照 platform runtime 路由条件确认实际命中分支

## Status

- session created
- runtime evidence collected

## Evidence

- `executions`:
  - id=`5117e4e6-7c61-467f-b54d-bee7d1f967c7`
  - status=`human_control`
  - runtime_type=`custom`
  - skill_id=`470217d6-d334-4c74-9633-210d354e5285`
  - normalized_input_json.runtimeSourceType=`browser_recording`
  - `planSteps` count=`1`
- `execution_phases`:
  - `phase_01_execute_selected_skill`
  - `phase_type=system_skill`
  - `status=waiting_takeover`
- runtime result payload:
  - `runtime=browser_recording`
  - `runtimeSessionId=5117e4e6-7c61-467f-b54d-bee7d1f967c7`
  - `executionPlanVersion=browser-recording-ir/v1`
  - `currentLoopIteration=1`
- `skill_configs.id=470217d6-d334-4c74-9633-210d354e5285`
  - contains `executionPlan.loopDraft.mode=repeat_until`
  - contains browser step flow with `navigate/fill/click/read_value/branch`

## Hypothesis Status

- H1 rejected: execution 创建后仍保留 `runtimeSourceType=browser_recording`，且 plan 被收敛为单步直通 skill runtime。
- H2 partially true but expected: execution 表层 `runtime_type=custom`，这是 skill runtime 适配层字段，不代表命中了代码执行 runtime。
- H3 rejected: runtime result 明确返回 `runtime=browser_recording`。
- H4 rejected: capability/skill 配置本身包含 browser recording flow 与 loopDraft。
- H5 confirmed: 用户看到的“像代码执行”现象来自 browser runtime 输出的 `Ran Playwright code` 片段，而不是实际路由到了 code runtime。

## Root Cause

- 真实执行链路没有跑到代码运行时。
- 偏差来自“展示层语义”和“适配层 runtime_type”混用：
  - `executions.runtime_type=custom` 仅表示 control-plane 通过 `capability-runtime.adapter` 调 skill runtime。
  - 该 skill runtime 的真实结果里仍是 `runtime=browser_recording`。
  - `PromptDebugPage` 直接展示原始 `execution.runtimeType`，未复用浏览器证据判定，因此把这类 execution 展示成了非浏览器运行时。

## Fix

- `apps/frontend/portal/src/features/admin/prompt-debug/pages/PromptDebugPage.tsx`
  - 复用 `extractBrowserExecutionResult()` + `hasBrowserExecutionEvidence()`
  - 对带浏览器执行证据的 execution 统一显示 `browser`
  - 不改后端执行链路

## Verification

- `GetDiagnostics` for `PromptDebugPage.tsx`: 0 errors
- expected post-fix behavior:
  - Prompt 调试台中的 execution metadata / timeline “运行类型”显示 `browser`
  - 不再误导成 `custom`
