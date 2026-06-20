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

function buildWorkflowResultSupportLines(args: {
  resultType: string;
  title: string;
  preferAiSummary?: boolean;
}): string[] {
  const { resultType, title, preferAiSummary = true } = args;
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
  });

  const phaseExecutionLines = browserActivityPairs.flatMap(({ step, activityDef }) => {
    const executeActivityTimeoutLines = buildExecuteActivityTimeoutLines(
      step,
      activityDef.timeout || '60s'
    );
    return [
      `        workflow.logger.info(${JSON.stringify(`执行浏览器 Phase Activity: ${activityDef.name}`)})`,
      '        phase_result = await workflow.execute_activity(',
      `            ${activityDef.fn},`,
      '            shared_activity_input,',
      ...executeActivityTimeoutLines,
      '        )',
      '        phase_results.append({',
      `            "stepId": ${JSON.stringify(step.id)},`,
      `            "stepName": ${JSON.stringify(step.name)},`,
      `            "activityName": ${JSON.stringify(activityDef.name)},`,
      '            "result": phase_result,',
      '        })',
      '        phase_status = str((phase_result or {}).get("status") if isinstance(phase_result, dict) else "").strip().lower()',
      '        if phase_status in ("failed", "blocked", "waiting", "takeover_required"):',
      '            return {',
      '                "execution": {"status": phase_status or "failed"},',
      '                "trigger": {"type": "manual"},',
      '                "result": {',
      '                    "resultType": "generic",',
      `                    "title": ${JSON.stringify(workflowDisplayName)},`,
      '                    "summary": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None,',
      '                    "businessData": {',
      '                        "runtimeSessionId": runtime_session_id,',
      '                        "backend": backend,',
      '                        "phaseResults": phase_results,',
      '                        "result": phase_result,',
      '                        "errorCode": phase_result.get("errorCode") if isinstance(phase_result, dict) else None,',
      '                        "errorMessage": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None,',
      '                        "retryable": bool(phase_result.get("retryable")) if isinstance(phase_result, dict) else False,',
      '                        "requiresTakeover": bool(phase_result.get("requiresTakeover")) if isinstance(phase_result, dict) else False,',
      '                        "takeoverReason": phase_result.get("takeoverReason") if isinstance(phase_result, dict) else None,',
      '                    },',
      '                },',
      '                "artifacts": self._collect_artifacts(phase_result),',
      '                "presentation": {"preferAiSummary": True, "preferStructuredView": False, "summaryFormat": "plain_text", "detailFormat": "plain_text", "detailText": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None, "chatSummary": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None, "notificationSummary": phase_result.get("errorMessage") if isinstance(phase_result, dict) else None},',
      '            }',
    ];
  });

  return [
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
    ...phaseExecutionLines,
    '        return self._build_workflow_result({',
    '            "runtimeSessionId": runtime_session_id,',
    '            "backend": backend,',
    '            "phaseResults": phase_results,',
    '            "result": phase_results[-1]["result"] if phase_results else None,',
    '        })',
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
  });

  return [
    'import re',
    'from datetime import timedelta',
    'from typing import Any, Dict',
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
    '        return self._build_workflow_result(normalized_result)',
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
  });

  return [
    'import re',
    'from datetime import timedelta',
    'from typing import Any, Dict',
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
    '        return self._build_workflow_result(normalized_result)',
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
  if (!transformInstructionTemplate) {
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
  });

  return [
    'import re',
    'from datetime import timedelta',
    'from typing import Any, Dict',
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
    '        return self._build_workflow_result(normalized_result)',
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
    'from typing import Any, Dict',
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
    '        return self._build_workflow_result(result)',
    '',
  ].join('\n');
}
