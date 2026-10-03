import type {
  ActivityDefinition,
  WorkflowDsl,
  WorkflowStep,
} from './temporal-workflow.types';
import { hasV2OutputFields } from './temporal-workflow-result-builder.helpers';
import {
  buildWorkflowResultSupportLines,
  resolveWorkflowClassName,
  resolveWorkflowDisplayName,
} from './temporal-workflow-fixed-workflow-result.helpers';
import { toPythonLiteral } from './temporal-workflow-python.utils';
import { buildBrowserCheckpointRestoreLines, buildBrowserCheckpointResultLines } from './temporal-workflow-browser-checkpoint-code.helpers';

type DurationToTimedeltaCodeFn = (duration: string) => string;
type BuildExecuteActivityTimeoutLinesFn = (
  step: WorkflowStep,
  fallbackStartToCloseTimeout: string
) => string[];

export function buildFixedBrowserPhaseWorkflowCode(args: {
  workflowDsl: WorkflowDsl;
  browserActivityPairs: Array<{ step: WorkflowStep; activityDef: ActivityDefinition }>;
  durationToTimedeltaCode: DurationToTimedeltaCodeFn;
  buildExecuteActivityTimeoutLines: BuildExecuteActivityTimeoutLinesFn;
}): string | null {
  const {
    workflowDsl,
    browserActivityPairs,
    durationToTimedeltaCode,
    buildExecuteActivityTimeoutLines,
  } = args;
  if (
    browserActivityPairs.length === 0 ||
    browserActivityPairs.some((pair) => !pair.activityDef.generatedCode)
  ) {
    return null;
  }

  const workflowClassName = resolveWorkflowClassName(workflowDsl);
  const workflowDisplayName = resolveWorkflowDisplayName(workflowDsl, workflowClassName);
  const inputParams = Object.entries(workflowDsl.inputParams || {});
  const workflowTimeoutCode = durationToTimedeltaCode(
    browserActivityPairs[0]?.step.startToCloseTimeout ||
      browserActivityPairs[0]?.activityDef.timeout ||
      '60s'
  );
  const normalizeLines = inputParams.map(([key, config]) => {
    const defaultValue = config?.defaultValue ?? '';
    return `        ${JSON.stringify(key)}: cls._normalize(params.get(${JSON.stringify(key)}, ${JSON.stringify(String(defaultValue))})),`;
  });
  const requiredParamNames = inputParams
    .filter(([, config]) => Boolean(config?.required))
    .map(([key]) => key);
  const activityCodeBlocks = browserActivityPairs
    .map((pair) => (pair.activityDef.generatedCode || '').trim())
    .filter(Boolean);
  const workflowResultSupportLines = buildWorkflowResultSupportLines({
    resultType: 'generic',
    title: workflowDisplayName,
    v2Output: workflowDsl.v2Output,
    validV2StepIds: browserActivityPairs.map((pair) => pair.step.id),
  });
  const browserLoopDraft =
    workflowDsl.sourceContext?.sourceType === 'browser_template' &&
    workflowDsl.sourceContext.browserLoopDraft &&
    Array.isArray(workflowDsl.sourceContext.browserLoopDraft.eachIteration?.stepIds) &&
    workflowDsl.sourceContext.browserLoopDraft.eachIteration?.stepIds?.length
      ? workflowDsl.sourceContext.browserLoopDraft
      : undefined;

  const resolveLoopSegment = (pair: { step: WorkflowStep; activityDef: ActivityDefinition }) => {
    if (browserLoopDraft?.eachIteration?.stepIds?.includes(pair.step.id)) {
      return 'iteration';
    }
    const rawSegment =
      typeof pair.activityDef.config?.loopSegment === 'string'
        ? pair.activityDef.config.loopSegment
        : undefined;
    if (rawSegment === 'pre_loop' || rawSegment === 'iteration' || rawSegment === 'post_loop') {
      return rawSegment;
    }
    return 'pre_loop';
  };

  const preLoopPairs = browserActivityPairs.filter(
    (pair) => resolveLoopSegment(pair) === 'pre_loop'
  );
  const iterationPairs = browserActivityPairs.filter(
    (pair) => resolveLoopSegment(pair) === 'iteration'
  );
  const postLoopPairs = browserActivityPairs.filter(
    (pair) => resolveLoopSegment(pair) === 'post_loop'
  );

  const buildPhaseExecutionLines = (input: {
    pairs: Array<{ step: WorkflowStep; activityDef: ActivityDefinition }>;
    indentLevel: number;
    loopIterationExpression?: string;
  }) => {
    const indent = '    '.repeat(input.indentLevel);
    const childIndent = `${indent}    `;
    const grandIndent = `${childIndent}    `;
    return input.pairs.flatMap(({ step, activityDef }, pairIndex) => {
      const executeActivityTimeoutLines = buildExecuteActivityTimeoutLines(
        step,
        activityDef.timeout || '60s'
      ).map((line) => `${grandIndent}    ${line.trimStart()}`);
      const isTeardownPhase =
        Boolean(input.loopIterationExpression) &&
        (/(一覧に戻る|一覧へ戻る|返回列表|返回一览|回到列表|回到一览|back to list|return to list)/i.test(
          `${activityDef.name} ${step.name} ${(activityDef as any).description || ''} ${JSON.stringify(activityDef.config || {})}`
        ) || pairIndex === input.pairs.length - 1);
      return [
        `${indent}if (not resume_pending or resume_step_id == ${JSON.stringify(step.id)}) and (not skip_iteration or ${isTeardownPhase ? 'True' : 'False'}) and not loop_exhausted:`,
        `${childIndent}resume_pending = False`,
        `${childIndent}while True:`,
        `${grandIndent}workflow.logger.info(${JSON.stringify(`执行浏览器 Phase Activity: ${activityDef.name}`)})`,
        `${grandIndent}current_activity_input = dict(workflow_context)`,
        `${grandIndent}phase_result = await workflow.execute_activity(`,
        `${grandIndent}    ${activityDef.fn},`,
        `${grandIndent}    current_activity_input,`,
        ...executeActivityTimeoutLines,
        `${grandIndent})`,
        `${grandIndent}if isinstance(phase_result, dict):`,
        `${grandIndent}    phase_vars = phase_result.get("variables")`,
        `${grandIndent}    if isinstance(phase_vars, dict):`,
        `${grandIndent}        for var_key, var_value in phase_vars.items():`,
        `${grandIndent}            previous_value = workflow_context.get(var_key)`,
        `${grandIndent}            if var_key.endswith("_clean_content") and previous_value and previous_value != var_value:`,
        `${grandIndent}                workflow_context[var_key] = str(previous_value) + "\\n\\n" + str(var_value)`,
        `${grandIndent}            else:`,
        `${grandIndent}                workflow_context[var_key] = var_value`,
        `${grandIndent}phase_entry = {`,
        `${grandIndent}    "stepId": ${JSON.stringify(step.id)},`,
        `${grandIndent}    "stepName": ${JSON.stringify(step.name)},`,
        `${grandIndent}    "activityName": ${JSON.stringify(activityDef.name)},`,
        `${grandIndent}    "loopSegment": ${JSON.stringify(resolveLoopSegment({ step, activityDef }))},`,
        ...(input.loopIterationExpression
          ? [`${grandIndent}    "loopIteration": ${input.loopIterationExpression},`]
          : []),
        `${grandIndent}    "result": phase_result,`,
        `${grandIndent}}`,
        `${grandIndent}phase_results.append(phase_entry)`,
        `${grandIndent}phase_status = str((phase_result or {}).get("status") if isinstance(phase_result, dict) else "").strip().lower()`,
        `${grandIndent}requires_takeover = bool((phase_result or {}).get("requiresTakeover")) if isinstance(phase_result, dict) else False`,
        `${grandIndent}no_more_candidates = bool((phase_result or {}).get("noMoreCandidates")) if isinstance(phase_result, dict) else False`,
        `${grandIndent}if no_more_candidates:`,
        `${grandIndent}    workflow.logger.info("未找到更多待处理候选记录（可能已被全部跳过），退出循环")`,
        `${grandIndent}    loop_exhausted = True`,
        `${grandIndent}    break`,
        `${grandIndent}if phase_status in ("takeover_required", "waiting") or requires_takeover:`,
        `${grandIndent}    takeover_reason = str((phase_result or {}).get("takeoverReason") or "浏览器步骤触发人工接管")`,
        `${grandIndent}    self._takeover_active = True`,
        `${grandIndent}    self._takeover_resumed = False`,
        `${grandIndent}    self._current_phase_status = phase_status or "takeover_required"`,
        `${grandIndent}    self._takeover_reason = takeover_reason`,
        `${grandIndent}    workflow.logger.info(f"浏览器步骤触发人工接管: {takeover_reason}")`,
        `${grandIndent}    await workflow.wait_condition(`,
        `${grandIndent}        lambda: not self._takeover_active or self._takeover_resumed`,
        `${grandIndent}    )`,
        `${grandIndent}    if not self._takeover_resumed:`,
        `${grandIndent}        workflow.logger.warning("人工接管未收到恢复信号，工作流保持挂起/受控退出")`,
        `${grandIndent}        return {`,
        `${grandIndent}            "status": "takeover_required",`,
        `${grandIndent}            "requiresTakeover": True,`,
        `${grandIndent}            "takeoverReason": takeover_reason,`,
        `${grandIndent}            "execution": {"status": "waiting_takeover"},`,
        `${grandIndent}            "trigger": {"type": "manual"},`,
        `${grandIndent}            "result": {`,
        `${grandIndent}                "resultType": "generic",`,
        `${grandIndent}                "title": ${JSON.stringify(workflowDisplayName)},`,
        `${grandIndent}                "summary": f"等待人工接管: {takeover_reason}",`,
        `${grandIndent}                "businessData": {`,
        `${grandIndent}                    "result": phase_result if isinstance(phase_result, dict) else {"status": "takeover_required"},`,
        `${grandIndent}                    "runtimeSessionId": runtime_session_id,`,
        `${grandIndent}                    "backend": backend,`,
        `${grandIndent}                    "phaseResults": phase_results,`,
        `${grandIndent}                    "requiresTakeover": True,`,
        `${grandIndent}                    "takeoverReason": takeover_reason,`,
        `${grandIndent}                    "status": "takeover_required",`,
        `${grandIndent}                },`,
        `${grandIndent}            },`,
        `${grandIndent}            "artifacts": self._collect_artifacts(phase_result),`,
        `${grandIndent}            "presentation": {"preferAiSummary": True, "preferStructuredView": False, "summaryFormat": "plain_text", "detailFormat": "plain_text", "detailText": f"等待人工接管: {takeover_reason}", "chatSummary": f"等待人工接管: {takeover_reason}", "notificationSummary": f"等待人工接管: {takeover_reason}"},`,
        `${grandIndent}        }`,
        `${grandIndent}    phase_entry["takeoverResumed"] = True`,
        `${grandIndent}    phase_entry["takeoverPayload"] = self._takeover_payload`,
        `${grandIndent}    takeover_action = str((self._takeover_payload or {}).get("action") or "continue").strip().lower()`,
        `${grandIndent}    if takeover_action == "recheck":`,
        `${grandIndent}        self._takeover_resumed = False`,
        `${grandIndent}        self._takeover_active = False`,
        `${grandIndent}        payload_vars = (self._takeover_payload or {}).get("variables")`,
        `${grandIndent}        if isinstance(payload_vars, dict):`,
        `${grandIndent}            workflow_context.update(payload_vars)`,
        `${grandIndent}        workflow_context["_is_recheck"] = True`,
        `${grandIndent}        workflow.logger.info("人工接管选择重新校验 (recheck)，重新执行当前步骤")`,
        `${grandIndent}        continue`,
        `${grandIndent}    elif takeover_action in ("skip_to_next", "skip"):`,
        `${grandIndent}        workflow.logger.info("人工接管选择跳过当前项 (skip_to_next)")`,
        `${grandIndent}        skip_iteration = True`,
        `${grandIndent}        workflow_context["skip_offset"] = int(workflow_context.get("skip_offset") or 0) + 1`,
        `${grandIndent}        break`,
        `${grandIndent}    else:`,
        `${grandIndent}        workflow.logger.info("人工接管选择继续执行 (continue)")`,
        `${grandIndent}        payload_vars = (self._takeover_payload or {}).get("variables")`,
        `${grandIndent}        if isinstance(payload_vars, dict):`,
        `${grandIndent}            workflow_context.update(payload_vars)`,
        `${grandIndent}        break`,
        `${grandIndent}elif phase_status in ("failed", "blocked"):`,
        `${grandIndent}    return {`,
        `${grandIndent}        "execution": {"status": phase_status or "failed"},`,
        `${grandIndent}        "trigger": {"type": "manual"},`,
        `${grandIndent}        "result": {`,
        `${grandIndent}            "resultType": "generic",`,
        `${grandIndent}            "title": ${JSON.stringify(workflowDisplayName)},`,
        `${grandIndent}            "summary": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None,`,
        `${grandIndent}            "businessData": {`,
        `${grandIndent}                "runtimeSessionId": runtime_session_id,`,
        `${grandIndent}                "backend": backend,`,
        `${grandIndent}                "phaseResults": phase_results,`,
        `${grandIndent}                "result": phase_result,`,
        `${grandIndent}                "errorCode": phase_result.get("errorCode") if isinstance(phase_result, dict) else None,`,
        `${grandIndent}                "errorMessage": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None,`,
        `${grandIndent}                "retryable": bool(phase_result.get("retryable")) if isinstance(phase_result, dict) else False,`,
        `${grandIndent}                "requiresTakeover": False,`,
        `${grandIndent}                "takeoverReason": None,`,
        `${grandIndent}            },`,
        `${grandIndent}        },`,
        `${grandIndent}        "artifacts": self._collect_artifacts(phase_result),`,
        `${grandIndent}        "presentation": {"preferAiSummary": True, "preferStructuredView": False, "summaryFormat": "plain_text", "detailFormat": "plain_text", "detailText": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None, "chatSummary": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None, "notificationSummary": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None},`,
        `${grandIndent}    }`,
        `${grandIndent}else:`,
        `${grandIndent}    break`,
      ];
    });
  };

  const phaseExecutionLines = buildPhaseExecutionLines({
    pairs: browserActivityPairs,
    indentLevel: 2,
  });
  const browserLoopExecutionLines =
    browserLoopDraft && iterationPairs.length > 0
      ? [
          '        loop_stop_condition = self._normalize_stop_condition(self.BROWSER_LOOP_DRAFT)',
          '        on_no_progress = str((self.BROWSER_LOOP_DRAFT or {}).get("onNoProgress") or "takeover").strip().lower()',
          `        max_iterations = ${Math.max(1, Number(browserLoopDraft.maxIterations || 100))}`,
          '        current_iteration = max(1, int(checkpoint.get("loopIteration") or 1))',
          '        last_loop_value = None',
          '        consecutive_no_progress = 0',
          '        loop_exhausted = False',
          ...buildPhaseExecutionLines({
            pairs: preLoopPairs,
            indentLevel: 2,
          }),
          '        initial_loop_value = self._extract_loop_value(phase_results)',
          '        loop_stopped_early = False',
          '        if not resume_pending and not resume_step_id and initial_loop_value is not None:',
          '            loop_stopped_early = self._evaluate_loop_stop(loop_stop_condition, initial_loop_value)',
          '            if loop_stopped_early:',
          '                workflow.logger.info(f"初始列表中已无待处理项 (终止值: {initial_loop_value})，跳过循环")',
          '                current_iteration = max_iterations + 1',
          '        while current_iteration <= max_iterations:',
          '            iteration_start_index = len(phase_results)',
          '            skip_iteration = False',
          '            workflow_context["loopIteration"] = current_iteration',
          '            previous_loop_value = last_loop_value',
          ...buildPhaseExecutionLines({
            pairs: iterationPairs,
            indentLevel: 3,
            loopIterationExpression: 'current_iteration',
          }),
          '            if loop_exhausted:',
          '                break',
          '            iteration_phase_results = phase_results[iteration_start_index:]',
          '            last_loop_value = self._extract_loop_value(iteration_phase_results)',
          '            if last_loop_value is not None:',
          '                should_stop = self._evaluate_loop_stop(loop_stop_condition, last_loop_value)',
          '                if not skip_iteration and should_stop:',
          '                    workflow.logger.info(f"循环第 {current_iteration} 轮满足终止条件 (终止值: {last_loop_value})")',
          '                    break',
          '            # 进展检测 (No Progress Check)',
          '            is_no_progress = False',
          '            if skip_iteration:',
          '                is_no_progress = False',
          '                consecutive_no_progress = 0',
          '            elif previous_loop_value is not None and last_loop_value is not None and previous_loop_value == last_loop_value:',
          '                is_no_progress = True',
          '                consecutive_no_progress += 1',
          '            else:',
          '                consecutive_no_progress = 0',
          '            if consecutive_no_progress >= 2:',
          '                no_prog_msg = f"循环连续 {consecutive_no_progress} 轮无进展 (状态值未变化或连续跳过)"',
          '                workflow.logger.warning(no_prog_msg)',
          '                if on_no_progress == "takeover":',
          '                    self._takeover_active = True',
          '                    self._takeover_resumed = False',
          '                    self._current_phase_status = "takeover_required"',
          '                    self._takeover_reason = no_prog_msg',
          '                    workflow.logger.info("循环无进展触发人工接管")',
          '                    await workflow.wait_condition(lambda: not self._takeover_active or self._takeover_resumed)',
          '                    if not self._takeover_resumed:',
          '                        workflow.logger.warning("循环无进展人工接管未收到恢复信号，工作流保持挂起/受控退出")',
          '                        return {',
          '                            "status": "takeover_required",',
          '                            "requiresTakeover": True,',
          '                            "takeoverReason": no_prog_msg,',
          '                            "execution": {"status": "waiting_takeover"},',
          '                            "trigger": {"type": "manual"},',
          '                            "result": {',
          '                                "resultType": "generic",',
          `                                "title": ${JSON.stringify(workflowDisplayName)},`,
          '                                "summary": f"等待人工接管: {no_prog_msg}",',
          '                                "businessData": {',
          '                                    "result": {"status": "takeover_required", "message": no_prog_msg},',
          '                                    "runtimeSessionId": runtime_session_id,',
          '                                    "backend": backend,',
          '                                    "phaseResults": phase_results,',
          '                                    "requiresTakeover": True,',
          '                                    "takeoverReason": no_prog_msg,',
          '                                    "status": "takeover_required",',
          '                                },',
          '                            },',
          '                            "artifacts": [],',
          `                            "presentation": {"preferAiSummary": True, "preferStructuredView": False, "summaryFormat": "plain_text", "detailFormat": "plain_text", "detailText": f"等待人工接管: {no_prog_msg}", "chatSummary": f"等待人工接管: {no_prog_msg}", "notificationSummary": f"等待人工接管: {no_prog_msg}"},`,
          '                        }',
          '                    consecutive_no_progress = 0',
          '                elif on_no_progress == "stop":',
          '                    workflow.logger.info("循环无进展按配置自动停止")',
          '                    break',
          '            current_iteration += 1',
          '        loop_state = {',
          '            "status": "completed" if loop_stopped_early or loop_exhausted or current_iteration <= max_iterations else "max_iterations_reached",',
          '            "currentIteration": 0 if loop_stopped_early else min(current_iteration, max_iterations),',
          '            "maxIterations": max_iterations,',
          '            "lastValue": last_loop_value,',
          '            "stopCondition": loop_stop_condition,',
          '        }',
          ...buildPhaseExecutionLines({
            pairs: postLoopPairs,
            indentLevel: 2,
          }),
        ]
      : null;

  return [
    'import re',
    'from datetime import timedelta',
    'from typing import Any, Dict, List, Optional',
    '',
    'from temporalio import workflow',
    'from temporalio.exceptions import ApplicationError',
    '',
    ...activityCodeBlocks,
    '',
    `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
    `class ${workflowClassName}:`,
    `    ACTIVITY_START_TO_CLOSE_TIMEOUT = ${workflowTimeoutCode}`,
    ...(browserLoopDraft ? [`    BROWSER_LOOP_DRAFT = ${toPythonLiteral(browserLoopDraft, 4)}`] : []),
    '',
    '    def __init__(self) -> None:',
    '        self._takeover_active = False',
    '        self._takeover_resumed = False',
    '        self._takeover_payload: Dict[str, Any] = {}',
    '        self._current_phase_status = "idle"',
    '        self._takeover_reason: Optional[str] = None',
    '',
    '    @workflow.signal(name="resume_takeover")',
    '    async def resume_takeover(self, payload: Dict[str, Any]) -> None:',
    '        workflow.logger.info("收到人工接管恢复信号", extra={"payload": payload})',
    '        self._takeover_payload = payload or {}',
    '        self._takeover_resumed = True',
    '        self._takeover_active = False',
    '        self._current_phase_status = "resumed"',
    '',
    '    @workflow.query(name="get_takeover_status")',
    '    def get_takeover_status(self) -> Dict[str, Any]:',
    '        return {',
    '            "takeoverActive": self._takeover_active,',
    '            "takeoverResumed": self._takeover_resumed,',
    '            "currentPhaseStatus": self._current_phase_status,',
    '            "takeoverReason": self._takeover_reason,',
    '            "takeoverPayload": self._takeover_payload,',
    '        }',
    '',
    '    @staticmethod',
    '    def _normalize(value: Any) -> str:',
    '        if value is None:',
    '            return ""',
    '        return str(value)',
    '',
    '    @staticmethod',
    '    def _is_missing(value: Any) -> bool:',
    '        if value is None:',
    '            return True',
    '        if isinstance(value, str):',
    '            return not value.strip()',
    '        return False',
    '',
    '    @classmethod',
    '    def _build_activity_input(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
    '        return {',
    ...normalizeLines,
    '        }',
    '',
    '    @staticmethod',
    '    def _validate_required_params(activity_input: Dict[str, Any]) -> None:',
    `        required_params = ${JSON.stringify(requiredParamNames)}`,
    `        missing_params = [key for key in required_params if ${workflowClassName}._is_missing(activity_input.get(key))]`,
    '        if missing_params:',
    '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
    '',
    ...(browserLoopDraft
      ? [
          '    @staticmethod',
          '    def _normalize_stop_condition(loop_draft: Dict[str, Any]) -> str:',
          '        if not isinstance(loop_draft, dict):',
          '            return ""',
          '        stop_when = loop_draft.get("stopWhen") or {}',
          '        if not isinstance(stop_when, dict):',
          '            return ""',
          '        condition = stop_when.get("conditionFn") or stop_when.get("condition_fn") or ""',
          '        return str(condition or "").strip()',
          '',
          '    @staticmethod',
          '    def _extract_loop_value(iteration_phase_results: List[Dict[str, Any]]) -> Optional[str]:',
          '        for item in reversed(iteration_phase_results):',
          '            if not isinstance(item, dict):',
          '                continue',
          '            result = item.get("result")',
          '            if not isinstance(result, dict):',
          '                continue',
          '            if result.get("loopStopValue") is not None:',
          '                return str(result.get("loopStopValue"))',
          '        return None',
          '',
          '    @staticmethod',
          '    def _evaluate_loop_stop(condition: str, value: str) -> bool:',
          '        normalized = str(condition or "").strip()',
          '        if not normalized:',
          '            return False',
          '        if value is None:',
          '            return False',
          '        if "=>" in normalized:',
          '            normalized = normalized.split("=>", 1)[1].strip()',
          '        if normalized in ("value === 0", "value == 0"):',
          '            try:',
          '                return float(value or 0) == 0',
          '            except Exception:',
          '                return not str(value or "").strip()',
          '        if re.search(r"""!\\s*String\\(value\\s*\\|\\|\\s*[\\x27\\x22]\\s*[\\x27\\x22]\\)\\.trim\\(\\)""", normalized) or re.search(r"""!\\s*value(\\s*\\|\\|\\s*[\\x27\\x22]\\s*[\\x27\\x22])?(\\.trim\\(\\))?""", normalized):',
          '            return not str(value or "").strip()',
          '        if re.search(r"""String\\(value\\s*\\|\\|\\s*[\\x27\\x22]\\s*[\\x27\\x22]\\)\\.trim\\(\\)""", normalized):',
          '            return bool(str(value or "").strip())',
          '        if re.search(r"""value\\s*===?\\s*[\\x27\\x22]\\s*[\\x27\\x22]""", normalized):',
          '            return not str(value or "").strip()',
          '        if re.search(r"""value\\s*!==?\\s*[\\x27\\x22]\\s*[\\x27\\x22]""", normalized):',
          '            return bool(str(value or "").strip())',
          '        include_negated = re.search(r"""!\\s*\\(?\\s*(?:String\\()?value(?:\\s*\\|\\|\\s*[\\x27\\x22]{0,2}\\))?\\.includes\\(([\\x27\\x22])(.+?)\\1\\)\\)?""", normalized)',
          '        if include_negated:',
          '            return include_negated.group(2) not in str(value or "")',
          '        include_match = re.search(r"""(?:String\\()?value(?:\\s*\\|\\|\\s*[\\x27\\x22]{0,2}\\))?\\.includes\\(([\\x27\\x22])(.+?)\\1\\)""", normalized)',
          '        if include_match:',
          '            return include_match.group(2) in str(value or "")',
          '        equals_match = re.search(r"""value\\s*===?\\s*([\\x27\\x22])(.+?)\\1""", normalized)',
          '        if equals_match:',
          '            return str(value or "") == equals_match.group(2)',
          '        not_equals_match = re.search(r"""value\\s*!==?\\s*([\\x27\\x22])(.+?)\\1""", normalized)',
          '        if not_equals_match:',
          '            return str(value or "") != not_equals_match.group(2)',
          '        return False',
          '',
        ]
      : []),
    ...workflowResultSupportLines,
    ...buildBrowserCheckpointResultLines(),
    '    async def _run_browser(self, params: dict) -> Dict[str, Any]:',
    `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
    '        try:',
    '            wf_info = workflow.info()',
    '            wf_id = getattr(wf_info, "workflow_id", "wf")',
    '            wf_run_id = getattr(wf_info, "run_id", "run")',
    '        except Exception:',
    '            wf_id, wf_run_id = "wf", "run"',
    '        normalized_params = params or {}',
    '        activity_input = self._build_activity_input(normalized_params)',
    '        self._validate_required_params(activity_input)',
    '        runtime_session_id = str(normalized_params.get("runtimeSessionId") or normalized_params.get("workflowId") or "").strip()',
    '        if not runtime_session_id:',
    '            runtime_session_id = f"browser-{wf_id}-{wf_run_id[:8]}"',
    '        backend = str(normalized_params.get("backend") or "cli").strip() or "cli"',
    '        shared_activity_input = dict(activity_input)',
    '        shared_activity_input["runtimeSessionId"] = runtime_session_id',
    '        shared_activity_input["backend"] = backend',
    '        shared_activity_input["executionId"] = normalized_params.get("executionId") or runtime_session_id',
    '        if "initialUrl" in normalized_params:',
    '            shared_activity_input["initialUrl"] = self._normalize(normalized_params.get("initialUrl"))',
    '        workflow_context = dict(shared_activity_input)',
    '        skip_iteration = False',
    '        loop_exhausted = False',
    '        phase_results: List[Dict[str, Any]] = []',
    ...buildBrowserCheckpointRestoreLines(browserActivityPairs.map(pair => pair.step.id)),
    ...(browserLoopExecutionLines || phaseExecutionLines),
    ...(browserLoopDraft
      ? [
          '        if loop_stopped_early or loop_state.get("currentIteration") == 0:',
          '            workflow.logger.info("初始列表中无待处理记录或循环未执行任何迭代，返回处理成功结果")',
          '            return {',
          '                "execution": {',
          '                    "status": "success",',
          '                },',
          '                "trigger": {',
          '                    "type": "manual",',
          '                },',
          '                "result": {',
          '                    "resultType": "generic",',
          `                    "title": ${JSON.stringify(workflowDisplayName)},`,
          '                    "summary": "没有待处理记录，处理数量为 0",',
          '                    "businessData": {',
          '                        "processedCount": 0,',
          '                        "message": "没有待处理记录，处理数量为 0",',
          '                        "result": {',
          '                            "status": "completed",',
          '                            "processedCount": 0,',
          '                            "message": "没有待处理记录，处理数量为 0",',
          '                        },',
          '                        "runtimeSessionId": runtime_session_id,',
          '                        "backend": backend,',
          '                        "phaseResults": phase_results,',
          '                        "loopState": loop_state,',
          '                    },',
          '                },',
          '                "artifacts": [],',
          '                "presentation": {',
          '                    "preferAiSummary": True,',
          '                    "preferStructuredView": False,',
          '                    "summaryFormat": "plain_text",',
          '                    "detailFormat": "plain_text",',
          '                    "detailText": "没有待处理记录，处理数量为 0",',
          '                    "chatSummary": "没有待处理记录，处理数量为 0",',
          '                    "notificationSummary": "没有待处理记录，处理数量为 0",',
          '                },',
          '            }',
        ]
      : []),
    ...(hasV2OutputFields(workflowDsl.v2Output)
      ? [
          '        return self._build_workflow_result({entry["stepId"]: entry["result"] for entry in phase_results})',
        ]
      : [
          '        return self._build_workflow_result({',
          '            "runtimeSessionId": runtime_session_id,',
          '            "backend": backend,',
          '            "phaseResults": phase_results,',
          ...(browserLoopDraft ? ['            "loopState": loop_state,'] : []),
          '            "result": phase_results[-1]["result"] if phase_results else None,',
          '        })',
        ]),
    '',
  ].join('\n');
}
