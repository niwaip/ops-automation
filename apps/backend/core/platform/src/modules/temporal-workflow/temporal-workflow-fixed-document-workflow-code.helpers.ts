import type {
  ActivityDsl,
  WorkflowDsl,
  WorkflowParamRequiredMode,
  WorkflowStep,
} from './temporal-workflow.types';

type DurationToTimedeltaCodeFn = (duration: string) => string;
type BuildExecuteActivityTimeoutLinesFn = (step: WorkflowStep, fallbackStartToCloseTimeout: string) => string[];
type PickFirstNonEmptyStringFn = (...values: unknown[]) => string | undefined;
type BuildPythonJsonLiteralFn = (value: unknown) => string;
type ToPythonLiteralFn = (value: unknown, indent?: number) => string;
type ResolveDocumentWorkflowBindingPathsFn = (
  policyBinding: string | undefined,
  renderPath: string | string[] | undefined,
  fallbackKey: string,
) => string[];
type NormalizeWorkflowPolicyRequiredModeFn = (
  currentMode: WorkflowParamRequiredMode | undefined,
  required: boolean | undefined,
) => WorkflowParamRequiredMode;

function resolveWorkflowClassName(workflowDsl: WorkflowDsl): string {
  return workflowDsl.workflowClassName?.trim()
    || `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`;
}

function resolveWorkflowDisplayName(workflowDsl: WorkflowDsl, workflowClassName: string): string {
  return workflowDsl.workflowDefnName?.trim() || workflowDsl.name || workflowClassName;
}

export function buildFixedDocumentRenderWorkflowCode(args: {
  workflowDsl: WorkflowDsl;
  activityDef: ActivityDsl['activities'][number];
  step: WorkflowStep;
  durationToTimedeltaCode: DurationToTimedeltaCodeFn;
  buildExecuteActivityTimeoutLines: BuildExecuteActivityTimeoutLinesFn;
  pickFirstNonEmptyString: PickFirstNonEmptyStringFn;
  buildPythonJsonLiteral: BuildPythonJsonLiteralFn;
  toPythonLiteral: ToPythonLiteralFn;
  resolveDocumentWorkflowBindingPaths: ResolveDocumentWorkflowBindingPathsFn;
  normalizeWorkflowPolicyRequiredMode: NormalizeWorkflowPolicyRequiredModeFn;
}): string | null {
  const {
    workflowDsl,
    activityDef,
    step,
    durationToTimedeltaCode,
    buildExecuteActivityTimeoutLines,
    pickFirstNonEmptyString,
    buildPythonJsonLiteral,
    toPythonLiteral,
    resolveDocumentWorkflowBindingPaths,
    normalizeWorkflowPolicyRequiredMode,
  } = args;
  const workflowClassName = resolveWorkflowClassName(workflowDsl);
  const workflowDisplayName = resolveWorkflowDisplayName(workflowDsl, workflowClassName);
  const inputParams = Object.entries(workflowDsl.inputParams || {});
  const workflowTimeoutCode = durationToTimedeltaCode(step.startToCloseTimeout || activityDef.timeout || '60s');
  const executeActivityTimeoutLines = buildExecuteActivityTimeoutLines(step, activityDef.timeout || '60s');
  const carboneStep = Array.isArray(activityDef.config?.steps)
    ? activityDef.config.steps.find((item: Record<string, any>) => item?.type === 'carbone')
    : null;

  if (!carboneStep) {
    return null;
  }

  const templateId = String(carboneStep.config?.templateId || activityDef.config?.templateId || '');
  const outputFormat = String(carboneStep.config?.format || 'docx');
  const outputName = String(carboneStep.config?.outputName || '');
  const sourceLanguage = pickFirstNonEmptyString(
    activityDef.config?.sourceLanguage,
    carboneStep.config?.sourceLanguage,
  );
  const targetLanguages = Array.isArray(activityDef.config?.targetLanguages)
    ? activityDef.config.targetLanguages
    : Array.isArray(carboneStep.config?.targetLanguages)
      ? carboneStep.config.targetLanguages
      : [];
  const workflowInputPolicies = workflowDsl.inputPolicy?.params || {};
  const renderBindings = inputParams.reduce<Record<string, string[]>>((acc, [key, config]) => {
    acc[key] = resolveDocumentWorkflowBindingPaths(
      workflowInputPolicies?.[key]?.templateBinding,
      config?.renderPath,
      key,
    );
    return acc;
  }, {});
  const renderBindingsLiteral = toPythonLiteral(renderBindings, 4);
  const normalizeLines = inputParams.map(([key, config]) => {
    const defaultValueExpr = config?.localizedDefaultValue && Object.keys(config.localizedDefaultValue).length > 0
      ? buildPythonJsonLiteral(config.localizedDefaultValue)
      : buildPythonJsonLiteral(config?.defaultValue ?? '');
    return `            ${JSON.stringify(key)}: cls._normalize(params.get(${JSON.stringify(key)}, ${defaultValueExpr})),`;
  });
  const requiredParamNames = inputParams
    .filter(([key, config]) => {
      const requiredMode = normalizeWorkflowPolicyRequiredMode(
        workflowInputPolicies?.[key]?.requiredMode,
        config?.required,
      );
      return requiredMode === 'always';
    })
    .map(([key]) => key)
    .filter((key) => !String(key).includes('{#') && !String(key).includes('{/'));

  return [
    'import json',
    'import re',
    'from datetime import timedelta',
    'from typing import Any, Dict, List',
    '',
    'from temporalio import activity, workflow',
    'from temporalio.exceptions import ApplicationError',
    '',
    (activityDef.generatedCode || '').trim(),
    '',
    `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
    `class ${workflowClassName}:`,
    `    ACTIVITY_START_TO_CLOSE_TIMEOUT = ${workflowTimeoutCode}`,
    `    RENDER_BINDINGS = ${renderBindingsLiteral}`,
    '',
    '    @staticmethod',
    '    def _normalize(value: Any) -> Any:',
    '        if value is None:',
    '            return ""',
    '        if isinstance(value, (str, int, float, bool, dict, list)):',
    '            return value',
    '        try:',
    '            json.dumps(value, ensure_ascii=False)',
    '            return value',
    '        except Exception:',
    '            return str(value)',
    '',
    '    @classmethod',
    '    def _normalize_params(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
    '        return {',
    ...normalizeLines,
    '        }',
    '',
    '    @staticmethod',
    '    def _is_missing(value: Any) -> bool:',
    '        if value is None:',
    '            return True',
    '        if isinstance(value, str):',
    '            return value.strip() == ""',
    '        if isinstance(value, (dict, list)):',
    '            return len(value) == 0',
    '        return False',
    '',
    '    @classmethod',
    '    def _resolve_binding_paths(cls, key: str) -> List[str]:',
    '        raw_paths = cls.RENDER_BINDINGS.get(key) or [key]',
    '        if isinstance(raw_paths, str):',
    '            raw_paths = [raw_paths]',
    '        normalized: List[str] = []',
    '        for item in raw_paths:',
    '            if not isinstance(item, str):',
    '                continue',
    '            path = item.strip()',
    '            if not path:',
    '                continue',
    '            if path.startswith("{d.") and path.endswith("}"):',
    '                path = path[3:-1].strip()',
    '            if path.startswith("d."):',
    '                path = path[2:].strip()',
    '            if path.startswith("data."):',
    '                path = path[5:].strip()',
    '            if path and path not in normalized:',
    '                normalized.append(path)',
    '        return normalized or [key]',
    '',
    '    @staticmethod',
    '    def _set_nested_value(target: Dict[str, Any], path: str, value: Any) -> None:',
    '        segments = [segment.strip() for segment in str(path or "").split(".") if segment and segment.strip()]',
    '        if not segments:',
    '            return',
    '        current = target',
    '        for segment in segments[:-1]:',
    '            existing = current.get(segment)',
    '            if not isinstance(existing, dict):',
    '                existing = {}',
    '                current[segment] = existing',
    '            current = existing',
    '        current[segments[-1]] = value',
    '',
    '    @staticmethod',
    '    def _ensure_array_path(target: Dict[str, Any], path: str) -> list:',
    '        segments = [segment.strip() for segment in str(path or "").split(".") if segment and segment.strip()]',
    '        if not segments:',
    '            return []',
    '        current = target',
    '        for segment in segments[:-1]:',
    '            existing = current.get(segment)',
    '            if not isinstance(existing, dict):',
    '                existing = {}',
    '                current[segment] = existing',
    '            current = existing',
    '        leaf_key = segments[-1]',
    '        existing_leaf = current.get(leaf_key)',
    '        if not isinstance(existing_leaf, list):',
    '            existing_leaf = []',
    '            current[leaf_key] = existing_leaf',
    '        return existing_leaf',
    '',
    '    @staticmethod',
    '    def _extract_binding_locale(path: str) -> str | None:',
    '        normalized_path = str(path or "").strip()',
    '        if re.search(r"(_cn|_zh)$", normalized_path, re.IGNORECASE):',
    '            return "cn"',
    '        if re.search(r"(_jp|_ja)$", normalized_path, re.IGNORECASE):',
    '            return "jp"',
    '        return None',
    '',
    '    @classmethod',
    '    def _resolve_localized_binding_value(cls, path: str, value: Any) -> Any:',
    '        if not isinstance(value, dict):',
    '            return value',
    '        locale = cls._extract_binding_locale(path)',
    '        if not locale:',
    '            for candidate in ["cn", "zh", "jp", "ja"]:',
    '                if candidate in value and value[candidate] is not None:',
    '                    return value[candidate]',
    '            return value',
    '        locale_candidates = ["cn", "zh"] if locale == "cn" else ["jp", "ja"]',
    '        for candidate in locale_candidates:',
    '            if candidate in value and value[candidate] is not None:',
    '                return value[candidate]',
    '        return None',
    '',
    '    @classmethod',
    '    def _set_bound_value(cls, target: Dict[str, Any], path: str, value: Any) -> None:',
    '        resolved_value = cls._resolve_localized_binding_value(path, value)',
    '        if resolved_value is None:',
    '            return',
    '        array_match = re.match(r"^(.*)\\[\\]\\.(.+)$", str(path or "").strip())',
    '        if array_match:',
    '            array_path = array_match.group(1).strip()',
    '            item_path = array_match.group(2).strip()',
    '            if not array_path or not item_path or not isinstance(resolved_value, list):',
    '                return',
    '            items = cls._ensure_array_path(target, array_path)',
    '            for index, item_value in enumerate(resolved_value):',
    '                existing_item = items[index] if index < len(items) else None',
    '                if not isinstance(existing_item, dict):',
    '                    existing_item = {}',
    '                    if index < len(items):',
    '                        items[index] = existing_item',
    '                    else:',
    '                        items.append(existing_item)',
    '                cls._set_nested_value(existing_item, item_path, item_value)',
    '            return',
    '        cls._set_nested_value(target, path, resolved_value)',
    '',
    '    @classmethod',
    '    def _build_render_data(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
    '        render_data: Dict[str, Any] = {}',
    '        for key, value in params.items():',
    '            for binding_path in cls._resolve_binding_paths(key):',
    '                cls._set_bound_value(render_data, binding_path, value)',
    '        return render_data',
    '',
    '    @staticmethod',
    '    def _validate_required_params(params: Dict[str, Any]) -> None:',
    `        required_params = ${JSON.stringify(requiredParamNames)}`,
    `        missing_params = [key for key in required_params if ${workflowClassName}._is_missing(params.get(key))]`,
    '        if missing_params:',
    '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
    '',
    '    async def run(self, params: dict) -> Dict[str, Any]:',
    `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
    '        normalized_params = self._normalize_params(params or {})',
    '        self._validate_required_params(normalized_params)',
    '        activity_input = {',
    `            "templateId": ${JSON.stringify(templateId)},`,
    '            "data": normalized_params,',
    `            "outputFormat": ${JSON.stringify(outputFormat)},`,
    ...(sourceLanguage ? [`            "sourceLanguage": ${JSON.stringify(sourceLanguage)},`] : []),
    ...(targetLanguages.length > 0 ? [`            "targetLanguages": ${buildPythonJsonLiteral(targetLanguages)},`] : []),
    '            "prepareLocalizedRenderData": True,',
    ...(outputName ? [`            "outputName": ${JSON.stringify(outputName)},`] : []),
    '        }',
    `        workflow.logger.info(${JSON.stringify(`执行共享文档渲染 Activity: ${activityDef.name}`)})`,
    '        result = await workflow.execute_activity(',
    `            ${activityDef.fn},`,
    '            activity_input,',
    ...executeActivityTimeoutLines,
    '        )',
    '        return result',
    '',
  ].join('\n');
}
