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
    '        return result',
    '',
  ].join('\n');
}
