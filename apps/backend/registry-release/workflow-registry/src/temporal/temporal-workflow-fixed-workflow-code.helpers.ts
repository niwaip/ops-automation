import type {
  ActivityDsl,
  WorkflowDsl,
  WorkflowStep,
} from './temporal-workflow.types';
import {
  buildV2WorkflowResultReturnLine,
  buildWorkflowResultSupportLines,
  resolveWorkflowClassName,
  resolveWorkflowDisplayName,
  resolveWorkflowResultType,
} from './temporal-workflow-fixed-workflow-result.helpers';
import { toPythonLiteral } from './temporal-workflow-python.utils';

export { buildWorkflowResultSupportLines } from './temporal-workflow-fixed-workflow-result.helpers';

type DurationToTimedeltaCodeFn = (duration: string) => string;
type BuildExecuteActivityTimeoutLinesFn = (
  step: WorkflowStep,
  fallbackStartToCloseTimeout: string
) => string[];
type ToPythonLiteralFn = (value: unknown, indent?: number) => string;

export { buildFixedBrowserPhaseWorkflowCode } from './temporal-workflow-fixed-browser-workflow-code.helpers';

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
    '        raw_headers = cls._prune_empty(cls._render_template(config.get("headersTemplate") or {}, params)) or {}',
    '        headers = dict(raw_headers) if isinstance(raw_headers, dict) else {}',
    '        headers.setdefault("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")',
    '        activity_input = {',
    '            "url": cls._render_template(config.get("urlTemplate", ""), params),',
    '            "method": str(config.get("method") or "GET").upper(),',
    '            "headers": headers,',
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
    buildV2WorkflowResultReturnLine(
      workflowDsl.v2Output,
      { [step.id]: 'normalized_result' },
      'normalized_result'
    ),
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
    buildV2WorkflowResultReturnLine(
      workflowDsl.v2Output,
      { [step.id]: 'normalized_result' },
      'normalized_result'
    ),
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
