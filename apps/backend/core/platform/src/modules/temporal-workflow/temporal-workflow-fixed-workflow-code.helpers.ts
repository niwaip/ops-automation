import {
  buildV2OutputResultBuilderLines,
  buildV2StepResultsArgument,
  hasV2OutputFields,
} from './temporal-workflow-result-builder.helpers';
import type {
  ActivityDefinition,
  ActivityDsl,
  WorkflowDsl,
  WorkflowStep,
} from './temporal-workflow.types';

type DurationToTimedeltaCodeFn = (duration: string) => string;
type BuildExecuteActivityTimeoutLinesFn = (
  step: WorkflowStep,
  fallbackStartToCloseTimeout: string
) => string[];
type ToPythonLiteralFn = (value: unknown, indent?: number) => string;

function resolveWorkflowClassName(workflowDsl: WorkflowDsl): string {
  return (
    workflowDsl.workflowClassName?.trim() ||
    `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`
  );
}

function resolveWorkflowDisplayName(workflowDsl: WorkflowDsl, workflowClassName: string): string {
  return workflowDsl.workflowDefnName?.trim() || workflowDsl.name || workflowClassName;
}

function resolveWorkflowResultType(activityFn: string): string {
  switch (String(activityFn || '').trim()) {
    case 'documentRender':
      return 'document';
    case 'emailSend':
    case 'webhookNotify':
    case 'imNotify':
      return 'notification';
    case 'fileRead':
      return 'import';
    case 'fileWrite':
    case 'templateRender':
    case 'csvParse':
      return 'export';
    case 'databaseQuery':
      return 'report';
    default:
      return 'generic';
  }
}

function buildSharedResultSupportLines(): string[] {
  return [
    '    @staticmethod',
    '    def _extract_summary(value: Any) -> str | None:',
    '        if isinstance(value, str):',
    '            return value.strip() or None',
    '        if isinstance(value, dict):',
    '            for key in ("chatSummary", "finalAnswer", "formatted_output", "summary", "message", "result", "text", "content"):',
    '                current = value.get(key)',
    '                if isinstance(current, str) and current.strip():',
    '                    return current.strip()',
    '        return None',
    '',
    '    @staticmethod',
    '    def _extract_detail_text(value: Any) -> str | None:',
    '        if isinstance(value, str):',
    '            return value.strip() or None',
    '        if isinstance(value, dict):',
    '            for key in ("detailText", "formatted_output", "result", "text", "content", "summary", "message", "chatSummary", "finalAnswer"):',
    '                current = value.get(key)',
    '                if isinstance(current, str) and current.strip():',
    '                    return current.strip()',
    '        return None',
    '',
    '    @classmethod',
    '    def _collect_artifacts(cls, value: Any) -> List[Dict[str, Any]]:',
    '        artifacts: List[Dict[str, Any]] = []',
    '        queue: List[Any] = [value]',
    '        visited_ids = set()',
    '        inspected = 0',
    '        while queue and inspected < 50:',
    '            current = queue.pop(0)',
    '            inspected += 1',
    '            if isinstance(current, (dict, list)):',
    '                current_id = id(current)',
    '                if current_id in visited_ids:',
    '                    continue',
    '                visited_ids.add(current_id)',
    '            if isinstance(current, list):',
    '                queue.extend(current)',
    '                continue',
    '            if not isinstance(current, dict):',
    '                continue',
    '            download_url = current.get("downloadUrl") or current.get("download_url")',
    '            url = current.get("url")',
    '            if isinstance(download_url, str) and download_url.strip():',
    '                artifacts.append({',
    '                    "type": "file",',
    '                    "name": current.get("name") or current.get("fileName") or current.get("label") or "result",',
    '                    "label": current.get("label") or current.get("name") or current.get("fileName") or "下载结果",',
    '                    "downloadUrl": download_url.strip(),',
    '                    "mimeType": current.get("mimeType") or current.get("mime_type"),',
    '                    "path": current.get("path"),',
    '                })',
    '            elif isinstance(url, str) and url.strip():',
    '                artifacts.append({',
    '                    "type": "url",',
    '                    "name": current.get("name") or current.get("label") or "result",',
    '                    "label": current.get("label") or current.get("name") or "查看结果",',
    '                    "url": url.strip(),',
    '                })',
    '            for item in current.values():',
    '                if isinstance(item, (dict, list)):',
    '                    queue.append(item)',
    '        return artifacts',
    '',
  ];
}

function buildLegacyWorkflowResultBuilderLines(args: {
  resultType: string;
  title: string;
  preferAiSummary: boolean;
}): string[] {
  const { resultType, title, preferAiSummary } = args;
  return [
    '    @classmethod',
    '    def _build_workflow_result(cls, raw_result: Any) -> Dict[str, Any]:',
    '        business_data = raw_result',
    '        if isinstance(raw_result, dict) and "result" in raw_result and raw_result.get("result") is not None:',
    '            business_data = raw_result.get("result")',
    '        summary = cls._extract_summary(raw_result)',
    '        if summary is None:',
    '            summary = cls._extract_summary(business_data)',
    '        detail_text = cls._extract_detail_text(raw_result)',
    '        if detail_text is None:',
    '            detail_text = cls._extract_detail_text(business_data)',
    '        return {',
    '            "execution": {',
    '                "status": "success",',
    '            },',
    '            "trigger": {',
    '                "type": "manual",',
    '            },',
    '            "result": {',
    `                "resultType": ${JSON.stringify(resultType)},`,
    `                "title": ${JSON.stringify(title)},`,
    '                "summary": summary,',
    '                "businessData": business_data,',
    '            },',
    '            "artifacts": cls._collect_artifacts(raw_result),',
    '            "presentation": {',
    `                "preferAiSummary": ${preferAiSummary ? 'True' : 'False'},`,
    '                "preferStructuredView": False,',
    '                "chatSummary": summary,',
    '                "notificationSummary": summary,',
    '                "summaryFormat": "plain_text",',
    '                "detailText": detail_text,',
    '                "detailFormat": "plain_text",',
    '            },',
    '        }',
    '',
  ];
}

export function buildWorkflowResultSupportLines(args: {
  resultType: string;
  title: string;
  preferAiSummary?: boolean;
  v2Output?: WorkflowDsl['v2Output'];
  validV2StepIds?: string[];
}): string[] {
  const { resultType, title, preferAiSummary = true, v2Output, validV2StepIds } = args;
  const sharedLines = buildSharedResultSupportLines();
  if (!hasV2OutputFields(v2Output)) {
    return [...sharedLines, ...buildLegacyWorkflowResultBuilderLines({ resultType, title, preferAiSummary })];
  }
  return [
    ...sharedLines,
    ...buildV2OutputResultBuilderLines({
      v2Output: v2Output as NonNullable<WorkflowDsl['v2Output']>,
      validStepIds: validV2StepIds || [],
      resultType,
      title,
      preferAiSummary,
    }),
  ];
}

/**
 * Builds the call-site return line passing each source step's result variable
 * into `_build_workflow_result(...)`; without v2Output the legacy single-value
 * passthrough is kept byte-for-byte.
 */
function buildV2WorkflowResultReturnLine(
  v2Output: WorkflowDsl['v2Output'] | undefined,
  stepToVar: Record<string, string>,
  legacyArg: string
): string {
  if (!hasV2OutputFields(v2Output)) {
    return `        return self._build_workflow_result(${legacyArg})`;
  }
  return `        return self._build_workflow_result(${buildV2StepResultsArgument(stepToVar)})`;
}

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
    const rawSegment =
      typeof pair.activityDef.config?.loopSegment === 'string'
        ? pair.activityDef.config.loopSegment
        : undefined;
    if (rawSegment === 'pre_loop' || rawSegment === 'iteration' || rawSegment === 'post_loop') {
      return rawSegment;
    }
    return 'pre_loop';
  };
  const preLoopPairs = browserActivityPairs.filter((pair) => resolveLoopSegment(pair) === 'pre_loop');
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
    return input.pairs.flatMap(({ step, activityDef }) => {
      const executeActivityTimeoutLines = buildExecuteActivityTimeoutLines(
        step,
        activityDef.timeout || '60s'
      ).map((line) => `${childIndent}${line.trimStart()}`);
      return [
        `${indent}workflow.logger.info(${JSON.stringify(`执行浏览器 Phase Activity: ${activityDef.name}`)})`,
        `${indent}phase_result = await workflow.execute_activity(`,
        `${childIndent}${activityDef.fn},`,
        `${childIndent}shared_activity_input,`,
        ...executeActivityTimeoutLines,
        `${indent})`,
        `${indent}phase_entry = {`,
        `${childIndent}"stepId": ${JSON.stringify(step.id)},`,
        `${childIndent}"stepName": ${JSON.stringify(step.name)},`,
        `${childIndent}"activityName": ${JSON.stringify(activityDef.name)},`,
        `${childIndent}"loopSegment": ${JSON.stringify(resolveLoopSegment({ step, activityDef }))},`,
        ...(input.loopIterationExpression
          ? [`${childIndent}"loopIteration": ${input.loopIterationExpression},`]
          : []),
        `${childIndent}"result": phase_result,`,
        `${indent}}`,
        `${indent}phase_results.append(phase_entry)`,
        `${indent}phase_status = str((phase_result or {}).get("status") if isinstance(phase_result, dict) else "").strip().lower()`,
        `${indent}if phase_status in ("failed", "blocked", "waiting", "takeover_required"):`,
        `${childIndent}return {`,
        `${grandIndent}"execution": {"status": phase_status or "failed"},`,
        `${grandIndent}"trigger": {"type": "manual"},`,
        `${grandIndent}"result": {`,
        `${grandIndent}    "resultType": "generic",`,
        `${grandIndent}    "title": ${JSON.stringify(workflowDisplayName)},`,
        `${grandIndent}    "summary": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None,`,
        `${grandIndent}    "businessData": {`,
        `${grandIndent}        "runtimeSessionId": runtime_session_id,`,
        `${grandIndent}        "backend": backend,`,
        `${grandIndent}        "phaseResults": phase_results,`,
        `${grandIndent}        "result": phase_result,`,
        `${grandIndent}        "errorCode": phase_result.get("errorCode") if isinstance(phase_result, dict) else None,`,
        `${grandIndent}        "errorMessage": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None,`,
        `${grandIndent}        "retryable": bool(phase_result.get("retryable")) if isinstance(phase_result, dict) else False,`,
        `${grandIndent}        "requiresTakeover": bool(phase_result.get("requiresTakeover")) if isinstance(phase_result, dict) else False,`,
        `${grandIndent}        "takeoverReason": phase_result.get("takeoverReason") if isinstance(phase_result, dict) else None,`,
        `${grandIndent}    },`,
        `${grandIndent}},`,
        `${grandIndent}"artifacts": self._collect_artifacts(phase_result),`,
        `${grandIndent}"presentation": {"preferAiSummary": True, "preferStructuredView": False, "summaryFormat": "plain_text", "detailFormat": "plain_text", "detailText": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None, "chatSummary": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None, "notificationSummary": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None},`,
        `${childIndent}}`,
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
          `        max_iterations = ${Math.max(1, Number(browserLoopDraft.maxIterations || 100))}`,
          '        current_iteration = 1',
          '        last_loop_value = ""',
          ...buildPhaseExecutionLines({
            pairs: preLoopPairs,
            indentLevel: 2,
          }),
          '        while current_iteration <= max_iterations:',
          '            iteration_start_index = len(phase_results)',
          ...buildPhaseExecutionLines({
            pairs: iterationPairs,
            indentLevel: 3,
            loopIterationExpression: 'current_iteration',
          }),
          '            iteration_phase_results = phase_results[iteration_start_index:]',
          '            last_loop_value = self._extract_loop_value(iteration_phase_results)',
          '            should_stop = self._evaluate_loop_stop(loop_stop_condition, last_loop_value)',
          '            if should_stop:',
          '                break',
          '            current_iteration += 1',
          '        loop_state = {',
          '            "status": "completed",',
          '            "currentIteration": current_iteration,',
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
    'from typing import Any, Dict, List',
    'import json',
    '',
    'from temporalio import workflow',
    'from temporalio.exceptions import ApplicationError',
    '',
    ...activityCodeBlocks.flatMap((block, index) => (index === 0 ? [block, ''] : ['', block, ''])),
    `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
    `class ${workflowClassName}:`,
    `    ACTIVITY_START_TO_CLOSE_TIMEOUT = ${workflowTimeoutCode}`,
    ...(browserLoopDraft
      ? [`    BROWSER_LOOP_DRAFT = ${JSON.stringify(browserLoopDraft)}`]
      : []),
    '',
    '    @staticmethod',
    '    def _normalize(value: Any) -> Any:',
    '        if value is None:',
    '            return ""',
    '        if isinstance(value, (str, int, float, bool, dict, list)):',
    '            return value',
    '        try:',
    '            return json.loads(json.dumps(value))',
    '        except Exception:',
    '            return str(value)',
    '',
    '    @staticmethod',
    '    def _is_missing(value: Any) -> bool:',
    '        if value is None:',
    '            return True',
    '        if isinstance(value, str):',
    '            return not value.strip()',
    '        if isinstance(value, (list, dict)):',
    '            return len(value) == 0',
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
          '    def _extract_loop_value(iteration_phase_results: List[Dict[str, Any]]) -> str:',
          '        for item in reversed(iteration_phase_results):',
          '            if not isinstance(item, dict):',
          '                continue',
          '            result = item.get("result")',
          '            if not isinstance(result, dict):',
          '                continue',
          '            raw_results = result.get("results") or []',
          '            if not isinstance(raw_results, list):',
          '                continue',
          '            for raw in reversed(raw_results):',
          '                if not isinstance(raw, dict):',
          '                    continue',
          '                data = raw.get("data")',
          '                if isinstance(data, dict):',
          '                    text_value = data.get("text")',
          '                    if text_value is not None:',
          '                        return str(text_value)',
          '            message = result.get("message")',
          '            if message is not None:',
          '                return str(message)',
          '        return ""',
          '',
          '    @staticmethod',
          '    def _evaluate_loop_stop(condition: str, value: str) -> bool:',
          '        normalized = str(condition or "").strip()',
          '        if not normalized:',
          '            return False',
          `        include_negated = re.match(r"""^!String\\(value \\|\\| ['"]{2}\\)\\.includes\\((['"])(.+)\\1\\)$""", normalized)`,
          '        if include_negated:',
          '            return include_negated.group(2) not in str(value or "")',
          `        include_match = re.match(r"""^String\\(value \\|\\| ['"]{2}\\)\\.includes\\((['"])(.+)\\1\\)$""", normalized)`,
          '        if include_match:',
          '            return include_match.group(2) in str(value or "")',
          `        equals_match = re.match(r"""^value\\s*===\\s*(['"])(.+)\\1$""", normalized)`,
          '        if equals_match:',
          '            return str(value or "") == equals_match.group(2)',
          `        not_equals_match = re.match(r"""^value\\s*!==\\s*(['"])(.+)\\1$""", normalized)`,
          '        if not_equals_match:',
          '            return str(value or "") != not_equals_match.group(2)',
          '        return False',
          '',
        ]
      : []),
    ...workflowResultSupportLines,
    '    async def run(self, params: dict) -> Dict[str, Any]:',
    `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
    '        normalized_params = params or {}',
    '        activity_input = self._build_activity_input(normalized_params)',
    '        self._validate_required_params(activity_input)',
    '        runtime_session_id = str(normalized_params.get("runtimeSessionId") or normalized_params.get("workflowId") or "").strip()',
    '        if not runtime_session_id:',
    `            runtime_session_id = ${JSON.stringify(`browser-phase-${workflowClassName}`)}`,
    '        backend = str(normalized_params.get("backend") or "cli").strip() or "cli"',
    '        shared_activity_input = dict(activity_input)',
    '        shared_activity_input["runtimeSessionId"] = runtime_session_id',
    '        shared_activity_input["backend"] = backend',
    '        if "initialUrl" in normalized_params:',
    '            shared_activity_input["initialUrl"] = self._normalize(normalized_params.get("initialUrl"))',
    '        phase_results: List[Dict[str, Any]] = []',
    ...(browserLoopExecutionLines || phaseExecutionLines),
    ...(hasV2OutputFields(workflowDsl.v2Output)
      ? [
          // v2: 编译器密封输出 — 按 phase 的 stepId 汇总全部步骤结果交给 Result Builder 逐字段提取
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

export { buildFixedDocumentRenderWorkflowCode } from './temporal-workflow-fixed-document-workflow-code.helpers';

export function buildFixedHttpRequestWorkflowCode(args: {
  workflowDsl: WorkflowDsl;
  activityDef: ActivityDsl['activities'][number];
  step: WorkflowStep;
  normalizedHttpConfig: Record<string, any>;
  durationToTimedeltaCode: DurationToTimedeltaCodeFn;
  buildExecuteActivityTimeoutLines: BuildExecuteActivityTimeoutLinesFn;
  toPythonLiteral: ToPythonLiteralFn;
}): string | null {
  const {
    workflowDsl,
    activityDef,
    step,
    normalizedHttpConfig,
    durationToTimedeltaCode,
    buildExecuteActivityTimeoutLines,
    toPythonLiteral,
  } = args;
  const workflowClassName = resolveWorkflowClassName(workflowDsl);
  const workflowDisplayName = resolveWorkflowDisplayName(workflowDsl, workflowClassName);
  const workflowTimeoutCode = durationToTimedeltaCode(
    step.startToCloseTimeout || activityDef.timeout || '30s'
  );
  const executeActivityTimeoutLines = buildExecuteActivityTimeoutLines(
    step,
    activityDef.timeout || '30s'
  );
  const urlTemplate = String(normalizedHttpConfig.urlTemplate || '').trim();
  if (!urlTemplate) {
    return null;
  }

  const inputParams = Object.entries(workflowDsl.inputParams || {});
  const requiredParamNames = Array.from(
    new Set(inputParams.filter(([, config]) => Boolean(config?.required)).map(([key]) => key))
  );
  const httpConfigExpression = toPythonLiteral(normalizedHttpConfig, 4);
  const workflowResultSupportLines = buildWorkflowResultSupportLines({
    resultType: 'generic',
    title: workflowDisplayName,
    v2Output: workflowDsl.v2Output,
    validV2StepIds: [step.id],
  });

  return [
    'import re',
    'from datetime import timedelta',
    'from typing import Any, Dict, List',
    '',
    'from temporalio import workflow',
    'from temporalio.exceptions import ApplicationError',
    '',
    (activityDef.generatedCode || '').trim(),
    '',
    `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
    `class ${workflowClassName}:`,
    `    ACTIVITY_START_TO_CLOSE_TIMEOUT = ${workflowTimeoutCode}`,
    `    HTTP_REQUEST_CONFIG = ${httpConfigExpression}`,
    '',
    '    @staticmethod',
    '    def _normalize(value: Any) -> str:',
    '        if value is None:',
    '            return ""',
    '        return str(value)',
    '',
    '    @classmethod',
    '    def _render_template(cls, value: Any, params: Dict[str, Any]) -> Any:',
    '        if isinstance(value, str):',
    '            def replace(match: re.Match[str]) -> str:',
    '                key = match.group(1).strip()',
    '                raw = params.get(key)',
    '                return "" if raw is None else str(raw)',
    '            return re.sub(r"\\{([^{}]+)\\}", replace, value)',
    '        if isinstance(value, dict):',
    '            return {str(k): cls._render_template(v, params) for k, v in value.items()}',
    '        if isinstance(value, list):',
    '            return [cls._render_template(item, params) for item in value]',
    '        return value',
    '',
    '    @classmethod',
    '    def _prune_empty(cls, value: Any) -> Any:',
    '        if isinstance(value, dict):',
    '            cleaned = {}',
    '            for key, item in value.items():',
    '                normalized = cls._prune_empty(item)',
    '                if normalized not in (None, "", {}, []):',
    '                    cleaned[key] = normalized',
    '            return cleaned',
    '        if isinstance(value, list):',
    '            return [cls._prune_empty(item) for item in value if cls._prune_empty(item) not in (None, "", {}, [])]',
    '        return value',
    '',
    '    @staticmethod',
    '    def _extract_path(value: Any, path: str) -> Any:',
    '        current = value',
    '        for segment in [item for item in str(path or "").split(".") if item]:',
    '            if isinstance(current, list) and segment.isdigit():',
    '                index = int(segment)',
    '                current = current[index] if 0 <= index < len(current) else None',
    '            elif isinstance(current, dict):',
    '                current = current.get(segment)',
    '            else:',
    '                return None',
    '        return current',
    '',
    '    @staticmethod',
    '    def _validate_required_params(params: Dict[str, Any]) -> None:',
    `        required_params = ${JSON.stringify(requiredParamNames)}`,
    '        missing_params = [key for key in required_params if str(params.get(key, "")).strip() == ""]',
    '        if missing_params:',
    '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
    '',
    '    @classmethod',
    '    def _build_activity_input(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
    '        config = cls.HTTP_REQUEST_CONFIG or {}',
    '        activity_input = {',
    '            "url": cls._render_template(config.get("urlTemplate", ""), params),',
    '            "method": str(config.get("method") or "GET").upper(),',
    '            "headers": cls._prune_empty(cls._render_template(config.get("headersTemplate") or {}, params)),',
    '            "params": cls._prune_empty(cls._render_template(config.get("queryTemplate") or {}, params)),',
    '            "timeout": config.get("timeout") or 30,',
    '        }',
    '        json_payload = cls._prune_empty(cls._render_template(config.get("jsonTemplate") or {}, params))',
    '        if json_payload not in (None, "", {}, []):',
    '            activity_input["json"] = json_payload',
    '        data_payload = cls._prune_empty(cls._render_template(config.get("dataTemplate"), params))',
    '        if data_payload not in (None, "", {}, []):',
    '            activity_input["data"] = data_payload',
    '        return activity_input',
    '',
    '    @classmethod',
    '    def _normalize_result(cls, result: Dict[str, Any], params: Dict[str, Any]) -> Any:',
    '        if bool(params.get("__httpResponsePreview")):',
    '            return result',
    '        config = cls.HTTP_REQUEST_CONFIG or {}',
    '        response_mode = str(config.get("responseMode") or "body").strip() or "body"',
    '        if response_mode == "full":',
    '            return result',
    '        body = result.get("body") if isinstance(result, dict) else result',
    '        if response_mode == "bodyPath":',
    '            return cls._extract_path(body, str(config.get("responseBodyPath") or ""))',
    '        if response_mode == "bodyMap":',
    '            mappings = config.get("responseFieldMappings") or {}',
    '            if not isinstance(mappings, dict) or not mappings:',
    '                return body',
    '            return {str(key): cls._extract_path(body, str(path)) for key, path in mappings.items()}',
    '        return body',
    '',
    ...workflowResultSupportLines,
    '    async def run(self, params: dict) -> Any:',
    `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
    '        normalized_params = params or {}',
    '        self._validate_required_params(normalized_params)',
    '        activity_input = self._build_activity_input(normalized_params)',
    `        workflow.logger.info(${JSON.stringify(`执行共享 HTTP 请求 Activity: ${activityDef.name}`)})`,
    '        result = await workflow.execute_activity(',
    `            ${activityDef.fn},`,
    '            activity_input,',
    ...executeActivityTimeoutLines,
    '        )',
    '        normalized_result = self._normalize_result(result, normalized_params)',
    buildV2WorkflowResultReturnLine(workflowDsl.v2Output, { [step.id]: 'normalized_result' }, 'normalized_result'),
    '',
  ].join('\n');
}

export function buildFixedStructuredTransformWorkflowCode(args: {
  workflowDsl: WorkflowDsl;
  activityDef: ActivityDsl['activities'][number];
  step: WorkflowStep;
  transformConfig: Record<string, any>;
  durationToTimedeltaCode: DurationToTimedeltaCodeFn;
  buildExecuteActivityTimeoutLines: BuildExecuteActivityTimeoutLinesFn;
  toPythonLiteral: ToPythonLiteralFn;
}): string | null {
  const {
    workflowDsl,
    activityDef,
    step,
    transformConfig,
    durationToTimedeltaCode,
    buildExecuteActivityTimeoutLines,
    toPythonLiteral,
  } = args;
  const workflowClassName = resolveWorkflowClassName(workflowDsl);
  const workflowDisplayName = resolveWorkflowDisplayName(workflowDsl, workflowClassName);
  const workflowTimeoutCode = durationToTimedeltaCode(
    step.startToCloseTimeout || activityDef.timeout || '90s'
  );
  const executeActivityTimeoutLines = buildExecuteActivityTimeoutLines(
    step,
    activityDef.timeout || '90s'
  );
  const contentTemplate = String(transformConfig.contentTemplate || '').trim();
  const instructionTemplate = String(transformConfig.instructionTemplate || '').trim();
  if (!contentTemplate || !instructionTemplate) {
    return null;
  }

  const requiredParamNames = Array.from(
    new Set(
      Object.entries(workflowDsl.inputParams || {})
        .filter(([, config]) => Boolean(config?.required))
        .map(([key]) => key)
    )
  );
  const transformConfigExpression = toPythonLiteral(transformConfig, 4);
  const workflowResultSupportLines = buildWorkflowResultSupportLines({
    resultType: 'generic',
    title: workflowDisplayName,
    v2Output: workflowDsl.v2Output,
    validV2StepIds: [step.id],
  });

  return [
    'import re',
    'from datetime import timedelta',
    'from typing import Any, Dict, List',
    '',
    'from temporalio import workflow',
    'from temporalio.exceptions import ApplicationError',
    '',
    (activityDef.generatedCode || '').trim(),
    '',
    `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
    `class ${workflowClassName}:`,
    `    ACTIVITY_START_TO_CLOSE_TIMEOUT = ${workflowTimeoutCode}`,
    `    STRUCTURED_TRANSFORM_CONFIG = ${transformConfigExpression}`,
    '',
    '    @classmethod',
    '    def _render_template(cls, value: Any, params: Dict[str, Any]) -> Any:',
    '        if isinstance(value, str):',
    '            raw_match = re.fullmatch(r"\\{([^{}]+)\\}", value.strip())',
    '            if raw_match:',
    '                return params.get(raw_match.group(1).strip())',
    '            def replace(match: re.Match[str]) -> str:',
    '                key = match.group(1).strip()',
    '                raw = params.get(key)',
    '                return "" if raw is None else str(raw)',
    '            return re.sub(r"\\{([^{}]+)\\}", replace, value)',
    '        if isinstance(value, dict):',
    '            return {str(k): cls._render_template(v, params) for k, v in value.items()}',
    '        if isinstance(value, list):',
    '            return [cls._render_template(item, params) for item in value]',
    '        return value',
    '',
    '    @staticmethod',
    '    def _normalize_context(value: Any) -> Any:',
    '        if isinstance(value, str):',
    '            stripped = value.strip()',
    '            if stripped.startswith("{") or stripped.startswith("["):',
    '                try:',
    '                    return json.loads(stripped)',
    '                except Exception:',
    '                    return value',
    '        return value',
    '',
    '    @staticmethod',
    '    def _validate_required_params(params: Dict[str, Any]) -> None:',
    `        required_params = ${JSON.stringify(requiredParamNames)}`,
    '        missing_params = [key for key in required_params if str(params.get(key, "")).strip() == ""]',
    '        if missing_params:',
    '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
    '',
    '    @classmethod',
    '    def _build_activity_input(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
    '        config = cls.STRUCTURED_TRANSFORM_CONFIG or {}',
    '        return {',
    '            "content": cls._render_template(config.get("contentTemplate", ""), params),',
    '            "contentType": str(config.get("contentType") or "text"),',
    '            "instruction": cls._render_template(config.get("instructionTemplate", ""), params),',
    '            "outputMode": str(config.get("outputMode") or "json"),',
    '            "outputSchema": config.get("outputSchema") or {},',
    '            "context": cls._normalize_context(cls._render_template(config.get("contextTemplate", ""), params)),',
    '            "fieldMappings": config.get("fieldMappings") or {},',
    '            "textTemplate": str(config.get("textTemplate", "") or ""),',
    '        }',
    '',
    ...workflowResultSupportLines,
    '    async def run(self, params: dict) -> Any:',
    `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
    '        normalized_params = params or {}',
    '        self._validate_required_params(normalized_params)',
    '        activity_input = self._build_activity_input(normalized_params)',
    `        workflow.logger.info(${JSON.stringify(`执行共享结构化转换 Activity: ${activityDef.name}`)})`,
    '        result = await workflow.execute_activity(',
    `            ${activityDef.fn},`,
    '            activity_input,',
    ...executeActivityTimeoutLines,
    '        )',
    '        normalized_result = result.get("result") if isinstance(result, dict) and "result" in result else result',
    buildV2WorkflowResultReturnLine(workflowDsl.v2Output, { [step.id]: 'normalized_result' }, 'normalized_result'),
    '',
  ].join('\n');
}

export function buildFixedHttpRequestStructuredTransformWorkflowCode(args: {
  workflowDsl: WorkflowDsl;
  httpActivityDef: ActivityDsl['activities'][number];
  httpStep: WorkflowStep;
  transformActivityDef: ActivityDsl['activities'][number];
  transformStep: WorkflowStep;
  normalizedHttpConfig: Record<string, any>;
  transformConfig: Record<string, any>;
  durationToTimedeltaCode: DurationToTimedeltaCodeFn;
  buildExecuteActivityTimeoutLines: BuildExecuteActivityTimeoutLinesFn;
  toPythonLiteral: ToPythonLiteralFn;
}): string | null {
  const {
    workflowDsl,
    httpActivityDef,
    httpStep,
    transformActivityDef,
    transformStep,
    normalizedHttpConfig,
    transformConfig,
    buildExecuteActivityTimeoutLines,
    toPythonLiteral,
  } = args;
  const workflowClassName = resolveWorkflowClassName(workflowDsl);
  const workflowDisplayName = resolveWorkflowDisplayName(workflowDsl, workflowClassName);
  const urlTemplate = String(normalizedHttpConfig.urlTemplate || '').trim();
  if (!urlTemplate) {
    return null;
  }

  const transformInstructionTemplate = String(transformConfig.instructionTemplate || '').trim();
  if (transformActivityDef.fn === 'aiStructuredTransform' && !transformInstructionTemplate) {
    return null;
  }
  const normalizedTransformConfig = {
    ...transformConfig,
    contentTemplate: String(transformConfig.contentTemplate || '').trim() || '{content}',
  };

  const inputParams = Object.entries(workflowDsl.inputParams || {});
  const normalizeLines = inputParams.map(([key, config]) => {
    const defaultValue = config?.defaultValue ?? '';
    return `        ${JSON.stringify(key)}: cls._normalize(params.get(${JSON.stringify(key)}, ${JSON.stringify(String(defaultValue))})),`;
  });
  const requiredParamNames = Array.from(
    new Set(
      Object.entries(workflowDsl.inputParams || {})
        .filter(([, config]) => Boolean(config?.required))
        .map(([key]) => key)
    )
  );

  const httpConfigExpression = toPythonLiteral(normalizedHttpConfig, 4);
  const transformConfigExpression = toPythonLiteral(normalizedTransformConfig, 4);
  const httpExecuteActivityTimeoutLines = buildExecuteActivityTimeoutLines(
    httpStep,
    httpActivityDef.timeout || '30s'
  );
  const transformExecuteActivityTimeoutLines = buildExecuteActivityTimeoutLines(
    transformStep,
    transformActivityDef.timeout || '90s'
  );
  const workflowResultSupportLines = buildWorkflowResultSupportLines({
    resultType: 'generic',
    title: workflowDisplayName,
    v2Output: workflowDsl.v2Output,
    validV2StepIds: [httpStep.id, transformStep.id],
  });

  return [
    'import re',
    'from datetime import timedelta',
    'from typing import Any, Dict, List',
    '',
    'from temporalio import workflow',
    'from temporalio.exceptions import ApplicationError',
    '',
    (httpActivityDef.generatedCode || '').trim(),
    '',
    (transformActivityDef.generatedCode || '').trim(),
    '',
    `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
    `class ${workflowClassName}:`,
    `    HTTP_REQUEST_CONFIG = ${httpConfigExpression}`,
    `    STRUCTURED_TRANSFORM_CONFIG = ${transformConfigExpression}`,
    '',
    '    @staticmethod',
    '    def _normalize(value: Any) -> str:',
    '        if value is None:',
    '            return ""',
    '        return str(value)',
    '',
    '    @classmethod',
    '    def _render_http_template(cls, value: Any, params: Dict[str, Any]) -> Any:',
    '        if isinstance(value, str):',
    '            def replace(match: re.Match[str]) -> str:',
    '                key = match.group(1).strip()',
    '                raw = params.get(key)',
    '                return "" if raw is None else str(raw)',
    '            return re.sub(r"\\{([^{}]+)\\}", replace, value)',
    '        if isinstance(value, dict):',
    '            return {str(k): cls._render_http_template(v, params) for k, v in value.items()}',
    '        if isinstance(value, list):',
    '            return [cls._render_http_template(item, params) for item in value]',
    '        return value',
    '',
    '    @classmethod',
    '    def _render_transform_template(cls, value: Any, params: Dict[str, Any]) -> Any:',
    '        if isinstance(value, str):',
    '            raw_match = re.fullmatch(r"\\{([^{}]+)\\}", value.strip())',
    '            if raw_match:',
    '                return params.get(raw_match.group(1).strip())',
    '            def replace(match: re.Match[str]) -> str:',
    '                key = match.group(1).strip()',
    '                raw = params.get(key)',
    '                return "" if raw is None else str(raw)',
    '            return re.sub(r"\\{([^{}]+)\\}", replace, value)',
    '        if isinstance(value, dict):',
    '            return {str(k): cls._render_transform_template(v, params) for k, v in value.items()}',
    '        if isinstance(value, list):',
    '            return [cls._render_transform_template(item, params) for item in value]',
    '        return value',
    '',
    '    @staticmethod',
    '    def _normalize_context(value: Any) -> Any:',
    '        if isinstance(value, str):',
    '            stripped = value.strip()',
    '            if stripped.startswith("{") or stripped.startswith("["):',
    '                try:',
    '                    return json.loads(stripped)',
    '                except Exception:',
    '                    return value',
    '        return value',
    '',
    '    @classmethod',
    '    def _prune_empty(cls, value: Any) -> Any:',
    '        if isinstance(value, dict):',
    '            cleaned = {}',
    '            for key, item in value.items():',
    '                normalized = cls._prune_empty(item)',
    '                if normalized not in (None, "", {}, []):',
    '                    cleaned[key] = normalized',
    '            return cleaned',
    '        if isinstance(value, list):',
    '            cleaned_items = []',
    '            for item in value:',
    '                normalized = cls._prune_empty(item)',
    '                if normalized not in (None, "", {}, []):',
    '                    cleaned_items.append(normalized)',
    '            return cleaned_items',
    '        return value',
    '',
    '    @classmethod',
    '    def _normalize_runtime_params(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
    '        raw_params = params or {}',
    '        return {',
    ...normalizeLines,
    '        }',
    '',
    '    @staticmethod',
    '    def _extract_path(value: Any, path: str) -> Any:',
    '        current = value',
    '        for segment in [item for item in str(path or "").split(".") if item]:',
    '            if isinstance(current, list) and segment.isdigit():',
    '                index = int(segment)',
    '                current = current[index] if 0 <= index < len(current) else None',
    '            elif isinstance(current, dict):',
    '                current = current.get(segment)',
    '            else:',
    '                return None',
    '        return current',
    '',
    '    @staticmethod',
    '    def _validate_required_params(params: Dict[str, Any]) -> None:',
    `        required_params = ${JSON.stringify(requiredParamNames)}`,
    '        missing_params = [key for key in required_params if str(params.get(key, "")).strip() == ""]',
    '        if missing_params:',
    '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
    '',
    '    @classmethod',
    '    def _build_http_activity_input(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
    '        config = cls.HTTP_REQUEST_CONFIG or {}',
    '        activity_input = {',
    '            "url": cls._render_http_template(config.get("urlTemplate", ""), params),',
    '            "method": str(config.get("method") or "GET").upper(),',
    '            "headers": cls._prune_empty(cls._render_http_template(config.get("headersTemplate") or {}, params)),',
    '            "params": cls._prune_empty(cls._render_http_template(config.get("queryTemplate") or {}, params)),',
    '            "timeout": config.get("timeout") or 30,',
    '        }',
    '        json_payload = cls._prune_empty(cls._render_http_template(config.get("jsonTemplate") or {}, params))',
    '        if json_payload not in (None, "", {}, []):',
    '            activity_input["json"] = json_payload',
    '        data_payload = cls._prune_empty(cls._render_http_template(config.get("dataTemplate"), params))',
    '        if data_payload not in (None, "", {}, []):',
    '            activity_input["data"] = data_payload',
    '        return activity_input',
    '',
    '    @classmethod',
    '    def _normalize_http_result(cls, result: Dict[str, Any], params: Dict[str, Any]) -> Any:',
    '        if bool(params.get("__httpResponsePreview")):',
    '            return result',
    '        config = cls.HTTP_REQUEST_CONFIG or {}',
    '        response_mode = str(config.get("responseMode") or "body").strip() or "body"',
    '        if response_mode == "full":',
    '            return result',
    '        body = result.get("body") if isinstance(result, dict) else result',
    '        if response_mode == "bodyPath":',
    '            return cls._extract_path(body, str(config.get("responseBodyPath") or ""))',
    '        if response_mode == "bodyMap":',
    '            mappings = config.get("responseFieldMappings") or {}',
    '            if not isinstance(mappings, dict) or not mappings:',
    '                return body',
    '            return {str(key): cls._extract_path(body, str(path)) for key, path in mappings.items()}',
    '        return body',
    '',
    '    @classmethod',
    '    def _build_transform_activity_input(cls, params: Dict[str, Any], http_result: Any) -> Dict[str, Any]:',
    '        config = cls.STRUCTURED_TRANSFORM_CONFIG or {}',
    '        runtime_params = {',
    '            **params,',
    '            "content": http_result,',
    '            "httpResult": http_result,',
    '            "httpBody": http_result,',
    '        }',
    '        return {',
    '            "content": cls._render_transform_template(config.get("contentTemplate", "{content}"), runtime_params),',
    '            "contentType": str(config.get("contentType") or "text"),',
    '            "instruction": cls._render_transform_template(config.get("instructionTemplate", ""), runtime_params),',
    '            "outputMode": str(config.get("outputMode") or "json"),',
    '            "outputSchema": config.get("outputSchema") or {},',
    '            "context": cls._normalize_context(cls._render_transform_template(config.get("contextTemplate", ""), runtime_params)),',
    '            "fieldMappings": config.get("fieldMappings") or {},',
    '            "textTemplate": str(config.get("textTemplate", "") or ""),',
    '        }',
    '',
    ...workflowResultSupportLines,
    '    async def run(self, params: dict) -> Any:',
    `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
    '        normalized_params = self._normalize_runtime_params(params or {})',
    '        self._validate_required_params(normalized_params)',
    '        http_activity_input = self._build_http_activity_input(normalized_params)',
    `        workflow.logger.info(${JSON.stringify(`执行共享 HTTP 请求 Activity: ${httpActivityDef.name}`)})`,
    '        http_result_raw = await workflow.execute_activity(',
    `            ${httpActivityDef.fn},`,
    '            http_activity_input,',
    ...httpExecuteActivityTimeoutLines,
    '        )',
    '        http_result = self._normalize_http_result(http_result_raw, normalized_params)',
    '        transform_activity_input = self._build_transform_activity_input(normalized_params, http_result)',
    `        workflow.logger.info(${JSON.stringify(`执行共享结构化转换 Activity: ${transformActivityDef.name}`)})`,
    '        transform_result = await workflow.execute_activity(',
    `            ${transformActivityDef.fn},`,
    '            transform_activity_input,',
    ...transformExecuteActivityTimeoutLines,
    '        )',
    '        normalized_result = transform_result.get("result") if isinstance(transform_result, dict) and "result" in transform_result else transform_result',
    buildV2WorkflowResultReturnLine(
      workflowDsl.v2Output,
      { [httpStep.id]: 'http_result', [transformStep.id]: 'normalized_result' },
      'normalized_result'
    ),
    '',
  ].join('\n');
}

export function buildFixedBuiltinWorkflowCode(args: {
  workflowDsl: WorkflowDsl;
  activityDef: ActivityDsl['activities'][number];
  step: WorkflowStep;
  normalizedConfig: Record<string, any>;
  durationToTimedeltaCode: DurationToTimedeltaCodeFn;
  buildExecuteActivityTimeoutLines: BuildExecuteActivityTimeoutLinesFn;
  toPythonLiteral: ToPythonLiteralFn;
}): string | null {
  const {
    workflowDsl,
    activityDef,
    step,
    normalizedConfig,
    durationToTimedeltaCode,
    buildExecuteActivityTimeoutLines,
    toPythonLiteral,
  } = args;
  const workflowClassName = resolveWorkflowClassName(workflowDsl);
  const workflowDisplayName = resolveWorkflowDisplayName(workflowDsl, workflowClassName);
  const workflowTimeoutCode = durationToTimedeltaCode(
    step.startToCloseTimeout || activityDef.timeout || '60s'
  );
  const executeActivityTimeoutLines = buildExecuteActivityTimeoutLines(
    step,
    activityDef.timeout || '60s'
  );

  const inputParams = Object.entries(workflowDsl.inputParams || {});
  const requiredParamNames = Array.from(
    new Set(inputParams.filter(([, config]) => Boolean(config?.required)).map(([key]) => key))
  );
  const configExpression = toPythonLiteral(normalizedConfig, 4);
  const workflowResultSupportLines = buildWorkflowResultSupportLines({
    resultType: resolveWorkflowResultType(activityDef.fn),
    title: workflowDisplayName,
    v2Output: workflowDsl.v2Output,
    validV2StepIds: [step.id],
  });

  const isWaitDelay = activityDef.fn === 'waitDelay';
  const executeLines = isWaitDelay
    ? [
        '        duration = str(activity_input.get("duration") or "").strip()',
        '        duration_seconds = float(activity_input.get("durationSeconds") or 60)',
        '        if duration:',
        '            match = re.match(r"^(\\d+)\\s*([smhd])$", duration, re.IGNORECASE)',
        '            if match:',
        '                val = int(match.group(1))',
        '                unit = match.group(2).lower()',
        '                if unit == "m":',
        '                    duration_seconds = val * 60',
        '                elif unit == "h":',
        '                    duration_seconds = val * 3600',
        '                elif unit == "d":',
        '                    duration_seconds = val * 86400',
        '                else:',
        '                    duration_seconds = val',
        "        workflow.logger.info(f\"等待 {duration_seconds} 秒: {activity_input.get('message') or ''}\")",
        '        await workflow.sleep(timedelta(seconds=duration_seconds))',
        '        result = {"status": "success", "durationSeconds": duration_seconds}',
      ]
    : [
        `        workflow.logger.info("执行 Builtin Activity: ${activityDef.name}")`,
        '        result = await workflow.execute_activity(',
        `            ${activityDef.fn},`,
        '            activity_input,',
        ...executeActivityTimeoutLines,
        '        )',
      ];

  return [
    'import re',
    'import json',
    'from datetime import timedelta',
    'from typing import Any, Dict, List',
    '',
    'from temporalio import workflow',
    'from temporalio.exceptions import ApplicationError',
    '',
    (activityDef.generatedCode || '').trim(),
    '',
    `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
    `class ${workflowClassName}:`,
    `    ACTIVITY_START_TO_CLOSE_TIMEOUT = ${workflowTimeoutCode}`,
    `    BUILTIN_CONFIG = ${configExpression}`,
    '',
    '    @staticmethod',
    '    def _normalize(value: Any) -> str:',
    '        if value is None:',
    '            return ""',
    '        return str(value)',
    '',
    '    @classmethod',
    '    def _render_template(cls, value: Any, params: Dict[str, Any]) -> Any:',
    '        if isinstance(value, str):',
    '            def replace(match: re.Match[str]) -> str:',
    '                key = match.group(1).strip()',
    '                raw = params.get(key)',
    '                return "" if raw is None else str(raw)',
    '            rendered = re.sub(r"\\{\\{\\s*([^{}]+)\\s*\\}\\}", replace, value)',
    '            return re.sub(r"\\{\\s*([^{}]+)\\s*\\}", replace, rendered)',
    '        if isinstance(value, dict):',
    '            return {str(k): cls._render_template(v, params) for k, v in value.items()}',
    '        if isinstance(value, list):',
    '            return [cls._render_template(item, params) for item in value]',
    '        return value',
    '',
    '    @classmethod',
    '    def _prune_empty(cls, value: Any) -> Any:',
    '        if isinstance(value, dict):',
    '            cleaned = {}',
    '            for key, item in value.items():',
    '                normalized = cls._prune_empty(item)',
    '                if normalized not in (None, "", {}, []):',
    '                    cleaned[key] = normalized',
    '            return cleaned',
    '        if isinstance(value, list):',
    '            return [cls._prune_empty(item) for item in value if cls._prune_empty(item) not in (None, "", {}, [])]',
    '        return value',
    '',
    '    @staticmethod',
    '    def _validate_required_params(params: Dict[str, Any]) -> None:',
    `        required_params = ${JSON.stringify(requiredParamNames)}`,
    '        missing_params = [key for key in required_params if str(params.get(key, "")).strip() == ""]',
    '        if missing_params:',
    '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
    '',
    '    @classmethod',
    '    def _build_activity_input(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
    '        config = cls.BUILTIN_CONFIG or {}',
    '        return cls._render_template(config, params)',
    '',
    ...workflowResultSupportLines,
    '    async def run(self, params: dict) -> Any:',
    `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
    '        normalized_params = params or {}',
    '        self._validate_required_params(normalized_params)',
    '        activity_input = self._build_activity_input(normalized_params)',
    ...executeLines,
    buildV2WorkflowResultReturnLine(workflowDsl.v2Output, { [step.id]: 'result' }, 'result'),
    '',
  ].join('\n');
}
