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

function buildWorkflowResultSupportLines(title: string): string[] {
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
    '    def _collect_artifacts(cls, value: Any) -> list[Dict[str, Any]]:',
    '        artifacts: list[Dict[str, Any]] = []',
    '        queue: list[Any] = [value]',
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
    '        summary = cls._extract_summary(raw_result)',
    '        detail_text = cls._extract_detail_text(raw_result)',
    '        return {',
    '            "execution": {"status": "success"},',
    '            "trigger": {"type": "manual"},',
    '            "result": {',
    '                "resultType": "document",',
    `                "title": ${JSON.stringify(title)},`,
    '                "summary": summary,',
    '                "businessData": raw_result,',
    '            },',
    '            "artifacts": cls._collect_artifacts(raw_result),',
    '            "presentation": {',
    '                "preferAiSummary": True,',
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

function durationToSeconds(duration: string, fallbackSeconds = 300): number {
  const normalized = String(duration || '').trim();
  const match = normalized.match(/^(\d+)\s*([smhd])$/i);
  if (!match) {
    return fallbackSeconds;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 60 * 60 * 24;
    case 's':
    default:
      return value;
  }
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
  const activityTimeout = step.startToCloseTimeout || activityDef.timeout || '300s';
  const requestTimeoutSeconds = durationToSeconds(activityTimeout, 300);
  const inputParams = Object.entries(workflowDsl.inputParams || {});
  const workflowTimeoutCode = durationToTimedeltaCode(activityTimeout);
  const executeActivityTimeoutLines = buildExecuteActivityTimeoutLines(step, activityDef.timeout || '300s');
  const carboneStep = Array.isArray(activityDef.config?.steps)
    ? activityDef.config.steps.find((item: Record<string, any>) => item?.type === 'carbone')
    : null;

  if (!carboneStep) {
    return null;
  }

  const templateId = String(carboneStep.config?.templateId || activityDef.config?.templateId || '');
  const skillId = String(
    carboneStep.config?.skillId
    || activityDef.config?.skillId
    || workflowDsl.sourceContext?.sourceTemplate?.skillId
    || '',
  );
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
  const runtimeWorkflowInputParams = inputParams.reduce<Record<string, Record<string, any>>>((acc, [key, config]) => {
    const renderPaths = resolveDocumentWorkflowBindingPaths(
      workflowInputPolicies?.[key]?.templateBinding,
      config?.renderPath,
      key,
    );
    acc[key] = {
      ...(config && typeof config === 'object' ? config : {}),
      renderPath: renderPaths,
    };
    return acc;
  }, {});
  const runtimeWorkflowInputParamsLiteral = toPythonLiteral(runtimeWorkflowInputParams, 4);
  const runtimeWorkflowInputPolicy = (
    workflowDsl.inputPolicy
    && typeof workflowDsl.inputPolicy === 'object'
    && !Array.isArray(workflowDsl.inputPolicy)
  )
    ? workflowDsl.inputPolicy
    : { params: workflowInputPolicies };
  const runtimeWorkflowInputPolicyLiteral = toPythonLiteral(runtimeWorkflowInputPolicy, 4);
  const shouldPrepareLocalizedRenderData = (
    Boolean(sourceLanguage)
    || targetLanguages.length > 0
    || inputParams.some(([, config]) => Array.isArray(config?.localizedVariants) && config.localizedVariants.length > 0)
    || Object.values(runtimeWorkflowInputParams).some((config) => {
      const paths = Array.isArray(config.renderPath) ? config.renderPath : [];
      return paths.length > 1 || paths.some((path) => /(?:_cn|_zh|_jp|_ja|_en)$/i.test(String(path)));
    })
  );
  const normalizeLines = inputParams.map(([key]) => {
    return `            ${JSON.stringify(key)}: cls._normalize(params.get(${JSON.stringify(key)})),`;
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
  const workflowResultSupportLines = buildWorkflowResultSupportLines(workflowDisplayName);

  return [
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
    `    WORKFLOW_INPUT_PARAMS = ${runtimeWorkflowInputParamsLiteral}`,
    `    WORKFLOW_INPUT_POLICY = ${runtimeWorkflowInputPolicyLiteral}`,
    `    PREPARE_LOCALIZED_RENDER_DATA = ${shouldPrepareLocalizedRenderData ? 'True' : 'False'}`,
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
    '    @staticmethod',
    '    def _validate_required_params(params: Dict[str, Any]) -> None:',
    `        required_params = ${JSON.stringify(requiredParamNames)}`,
    `        missing_params = [key for key in required_params if ${workflowClassName}._is_missing(params.get(key))]`,
    '        if missing_params:',
    '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
    '',
    ...workflowResultSupportLines,
    '    @workflow.run',
    '    async def run(self, params: dict) -> Dict[str, Any]:',
    `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
    '        normalized_params = self._normalize_params(params or {})',
    '        self._validate_required_params(normalized_params)',
    '        activity_input = {',
    `            "templateId": ${JSON.stringify(templateId)},`,
    ...(skillId ? [`            "skillId": ${JSON.stringify(skillId)},`] : []),
    '            "data": normalized_params,',
    `            "requestTimeoutSeconds": ${requestTimeoutSeconds},`,
    '            "workflowInputParams": self.WORKFLOW_INPUT_PARAMS,',
    '            "workflowInputPolicy": self.WORKFLOW_INPUT_POLICY,',
    '            "prepareLocalizedRenderData": self.PREPARE_LOCALIZED_RENDER_DATA,',
    `            "outputFormat": ${JSON.stringify(outputFormat)},`,
    ...(sourceLanguage ? [`            "sourceLanguage": ${JSON.stringify(sourceLanguage)},`] : []),
    ...(targetLanguages.length > 0 ? [`            "targetLanguages": ${buildPythonJsonLiteral(targetLanguages)},`] : []),
    ...(outputName ? [`            "outputName": ${JSON.stringify(outputName)},`] : []),
    '        }',
    `        workflow.logger.info(${JSON.stringify(`执行共享文档渲染 Activity: ${activityDef.name}`)})`,
    '        result = await workflow.execute_activity(',
    `            ${activityDef.fn},`,
    '            activity_input,',
    ...executeActivityTimeoutLines,
    '        )',
    '        return self._build_workflow_result(result)',
    '',
  ].join('\n');
}
