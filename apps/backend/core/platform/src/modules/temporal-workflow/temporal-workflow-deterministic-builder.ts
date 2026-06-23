import {
  AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY,
  BuiltinActivityRegistry,
  DOCUMENT_RENDER_ACTIVITY_KEY,
  HTTP_REQUEST_ACTIVITY_KEY,
  HTTP_REQUEST_STEP_CONFIG_KEY,
  STRUCTURED_TRANSFORM_ACTIVITY_KEY,
  STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
  FILE_READ_ACTIVITY_KEY,
  FILE_WRITE_ACTIVITY_KEY,
  WEBHOOK_NOTIFY_ACTIVITY_KEY,
  EMAIL_SEND_ACTIVITY_KEY,
  IM_NOTIFY_ACTIVITY_KEY,
  CSV_PARSE_ACTIVITY_KEY,
  JSON_TRANSFORM_ACTIVITY_KEY,
  TEMPLATE_RENDER_ACTIVITY_KEY,
  DATABASE_QUERY_ACTIVITY_KEY,
  SHELL_COMMAND_ACTIVITY_KEY,
  WAIT_DELAY_ACTIVITY_KEY,
  CONDITION_CHECK_ACTIVITY_KEY,
  FILE_READ_STEP_CONFIG_KEY,
  FILE_WRITE_STEP_CONFIG_KEY,
  WEBHOOK_NOTIFY_STEP_CONFIG_KEY,
  EMAIL_SEND_STEP_CONFIG_KEY,
  IM_NOTIFY_STEP_CONFIG_KEY,
  CSV_PARSE_STEP_CONFIG_KEY,
  JSON_TRANSFORM_STEP_CONFIG_KEY,
  TEMPLATE_RENDER_STEP_CONFIG_KEY,
  DATABASE_QUERY_STEP_CONFIG_KEY,
  SHELL_COMMAND_STEP_CONFIG_KEY,
  WAIT_DELAY_STEP_CONFIG_KEY,
  CONDITION_CHECK_STEP_CONFIG_KEY,
} from './builtin-activity.registry';
import {
  buildDeterministicBrowserActivityCode,
  buildDeterministicCarboneActivityCode,
} from './temporal-workflow-deterministic-activity-code.helpers';
import {
  buildFixedBrowserPhaseWorkflowCode as buildFixedBrowserPhaseWorkflowCodeHelper,
  buildFixedDocumentRenderWorkflowCode as buildFixedDocumentRenderWorkflowCodeHelper,
  buildFixedHttpRequestStructuredTransformWorkflowCode as buildFixedHttpRequestStructuredTransformWorkflowCodeHelper,
  buildFixedHttpRequestWorkflowCode as buildFixedHttpRequestWorkflowCodeHelper,
  buildFixedStructuredTransformWorkflowCode as buildFixedStructuredTransformWorkflowCodeHelper,
  buildFixedBuiltinWorkflowCode as buildFixedBuiltinWorkflowCodeHelper,
} from './temporal-workflow-fixed-workflow-code.helpers';
import { TemporalWorkflowConfigService } from './temporal-workflow-config.service';
import { TemporalWorkflowNormalizationService } from './temporal-workflow-normalization.service';
import { resolveDocumentWorkflowBindingPaths } from './temporal-workflow-template.helpers';
import type {
  ActivityDefinition,
  ActivityDsl,
  WorkflowDsl,
  WorkflowStep,
} from './temporal-workflow.types';
import {
  buildExecuteActivityTimeoutLines,
  buildPythonJsonLiteral,
  durationToTimedeltaCode,
  normalizeInputParams,
  pickFirstNonEmptyString,
  toPythonLiteral,
} from './temporal-workflow-service.utils';

interface DeterministicBuilderDependencies {
  builtinActivityRegistry: BuiltinActivityRegistry;
  workflowConfigService: TemporalWorkflowConfigService;
  workflowNormalizationService: TemporalWorkflowNormalizationService;
}

function durationToSeconds(duration: string | undefined, fallbackSeconds = 300): number {
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

export function buildDeterministicActivityCodeForWorkflow(
  activityDef: ActivityDsl['activities'][number]
): string | null {
  if (activityDef.handler === 'browser') {
    return buildDeterministicBrowserActivityCode({ activityDef });
  }
  return buildDeterministicCarboneActivityCode({
    activityDef,
    normalizeInputParams,
  });
}

export function buildDeterministicWorkflowCodeForWorkflow(
  workflowDsl: WorkflowDsl,
  activityDsl: ActivityDsl,
  deps: DeterministicBuilderDependencies
): string | null {
  const { builtinActivityRegistry, workflowConfigService, workflowNormalizationService } = deps;
  const declaredInputKeys = new Set(Object.keys(workflowDsl.inputParams || {}));
  const activitySteps = workflowDsl.steps.filter((step) => step.type === 'activity');
  const isSimpleStaticWorkflow =
    workflowDsl.steps.length === activitySteps.length &&
    (!workflowDsl.conditionals || workflowDsl.conditionals.length === 0) &&
    (!workflowDsl.signalHandlers || workflowDsl.signalHandlers.length === 0) &&
    (!workflowDsl.queryHandlers || workflowDsl.queryHandlers.length === 0) &&
    !workflowDsl.errorHandling;

  if (!isSimpleStaticWorkflow) {
    return null;
  }

  const extractActivityNameFromRef = (activityRef?: string): string | undefined => {
    const builtin = activityRef ? builtinActivityRegistry.getByRef(activityRef) : null;
    return builtin?.name;
  };

  const resolveStepActivityDef = (step: WorkflowStep): ActivityDefinition | null => {
    const stepActivityIdentifier =
      step?.activityName || extractActivityNameFromRef(step?.activityRef);
    if (!stepActivityIdentifier) {
      return null;
    }
    const activityDef = activityDsl.activities.find(
      (activity) =>
        activity.name === stepActivityIdentifier || activity.fn === stepActivityIdentifier
    );
    if (!activityDef?.generatedCode) {
      return null;
    }
    return activityDef;
  };

  const browserActivityPairs = activitySteps.map((step) => ({
    step,
    activityDef: resolveStepActivityDef(step),
  }));
  if (
    browserActivityPairs.length > 0 &&
    browserActivityPairs.every((pair) => pair.activityDef?.handler === 'browser')
  ) {
    return buildFixedBrowserPhaseWorkflowCodeHelper({
      workflowDsl,
      browserActivityPairs: browserActivityPairs as Array<{
        step: WorkflowStep;
        activityDef: ActivityDefinition;
      }>,
      durationToTimedeltaCode,
      buildExecuteActivityTimeoutLines,
    });
  }

  if (activitySteps.length === 2 && workflowDsl.steps.length === 2) {
    const [firstStep, secondStep] = activitySteps;
    const firstActivityDef = resolveStepActivityDef(firstStep);
    const secondActivityDef = resolveStepActivityDef(secondStep);
    const firstBuiltinKey = firstActivityDef
      ? builtinActivityRegistry.getByFn(firstActivityDef.fn)?.key
      : null;
    const secondBuiltinKey = secondActivityDef
      ? builtinActivityRegistry.getByFn(secondActivityDef.fn)?.key
      : null;
    if (
      firstActivityDef &&
      secondActivityDef &&
      firstBuiltinKey === HTTP_REQUEST_ACTIVITY_KEY &&
      (secondBuiltinKey === STRUCTURED_TRANSFORM_ACTIVITY_KEY ||
        secondBuiltinKey === AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY)
    ) {
      return buildFixedHttpRequestStructuredTransformWorkflowCodeHelper({
        workflowDsl,
        httpActivityDef: firstActivityDef,
        httpStep: firstStep,
        transformActivityDef: secondActivityDef,
        transformStep: secondStep,
        normalizedHttpConfig: normalizeHttpRequestStepConfig(
          firstStep,
          declaredInputKeys,
          workflowNormalizationService,
          workflowConfigService
        ),
        transformConfig: getStepStructuredTransformConfig(
          secondStep,
          declaredInputKeys,
          workflowConfigService
        ),
        durationToTimedeltaCode,
        buildExecuteActivityTimeoutLines,
        toPythonLiteral,
      });
    }
    return null;
  }

  if (activitySteps.length !== 1 || workflowDsl.steps.length !== 1) {
    return null;
  }

  const step = activitySteps[0];
  const activityDef = resolveStepActivityDef(step);
  if (!activityDef) {
    return null;
  }

  const builtinKey = builtinActivityRegistry.getByFn(activityDef.fn)?.key;
  if (builtinKey === DOCUMENT_RENDER_ACTIVITY_KEY) {
    return buildFixedDocumentRenderWorkflowCodeHelper({
      workflowDsl,
      activityDef,
      step,
      durationToTimedeltaCode,
      buildExecuteActivityTimeoutLines,
      pickFirstNonEmptyString,
      buildPythonJsonLiteral,
      toPythonLiteral,
      resolveDocumentWorkflowBindingPaths,
      normalizeWorkflowPolicyRequiredMode: (currentMode, required) =>
        workflowNormalizationService.normalizeWorkflowPolicyRequiredMode(currentMode, required),
    });
  }
  if (builtinKey === HTTP_REQUEST_ACTIVITY_KEY) {
    return buildFixedHttpRequestWorkflowCodeHelper({
      workflowDsl,
      activityDef,
      step,
      normalizedHttpConfig: normalizeHttpRequestStepConfig(
        step,
        declaredInputKeys,
        workflowNormalizationService,
        workflowConfigService
      ),
      durationToTimedeltaCode,
      buildExecuteActivityTimeoutLines,
      toPythonLiteral,
    });
  }
  if (
    builtinKey === STRUCTURED_TRANSFORM_ACTIVITY_KEY ||
    builtinKey === AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY
  ) {
    return buildFixedStructuredTransformWorkflowCodeHelper({
      workflowDsl,
      activityDef,
      step,
      transformConfig: getStepStructuredTransformConfig(
        step,
        declaredInputKeys,
        workflowConfigService
      ),
      durationToTimedeltaCode,
      buildExecuteActivityTimeoutLines,
      toPythonLiteral,
    });
  }
  if (
    builtinKey === FILE_READ_ACTIVITY_KEY ||
    builtinKey === FILE_WRITE_ACTIVITY_KEY ||
    builtinKey === WEBHOOK_NOTIFY_ACTIVITY_KEY ||
    builtinKey === EMAIL_SEND_ACTIVITY_KEY ||
    builtinKey === IM_NOTIFY_ACTIVITY_KEY ||
    builtinKey === CSV_PARSE_ACTIVITY_KEY ||
    builtinKey === JSON_TRANSFORM_ACTIVITY_KEY ||
    builtinKey === TEMPLATE_RENDER_ACTIVITY_KEY ||
    builtinKey === DATABASE_QUERY_ACTIVITY_KEY ||
    builtinKey === SHELL_COMMAND_ACTIVITY_KEY ||
    builtinKey === WAIT_DELAY_ACTIVITY_KEY ||
    builtinKey === CONDITION_CHECK_ACTIVITY_KEY
  ) {
    const builtin = builtinActivityRegistry.getByKey(builtinKey);
    const stepConfigKey = builtin?.config?.stepConfigKey;
    const defaultStepConfig = builtin?.config?.defaultStepConfig || {};
    const normalizedConfig = getStepBuiltinConfig(
      step,
      stepConfigKey,
      defaultStepConfig,
      workflowNormalizationService
    );
    return buildFixedBuiltinWorkflowCodeHelper({
      workflowDsl,
      activityDef,
      step,
      normalizedConfig,
      durationToTimedeltaCode,
      buildExecuteActivityTimeoutLines,
      toPythonLiteral,
    });
  }

  const workflowClassName =
    workflowDsl.workflowClassName?.trim() ||
    `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`;
  const workflowDisplayName =
    workflowDsl.workflowDefnName?.trim() || workflowDsl.name || workflowClassName;
  const inputParams = Object.entries(workflowDsl.inputParams || {});
  const workflowTimeoutCode = durationToTimedeltaCode(
    step.startToCloseTimeout || activityDef.timeout || '60s'
  );
  const executeActivityTimeoutLines = buildExecuteActivityTimeoutLines(
    step,
    activityDef.timeout || '60s'
  );
  const requestTimeoutSeconds = durationToSeconds(
    step.startToCloseTimeout || activityDef.timeout,
    300
  );
  const extraActivityInputLines =
    activityDef.handler === 'carbone'
      ? [`            "requestTimeoutSeconds": ${requestTimeoutSeconds},`]
      : [];

  const normalizeLines = inputParams.map(([key, config]) => {
    const defaultValue = config?.defaultValue ?? '';
    return `        ${JSON.stringify(key)}: cls._normalize(params.get(${JSON.stringify(key)}, ${JSON.stringify(String(defaultValue))})),`;
  });
  const requiredParamNames = inputParams
    .filter(([, config]) => Boolean(config?.required))
    .map(([key]) => key);

  return [
    'from datetime import timedelta',
    'from temporalio import workflow',
    'import json',
    '',
    (activityDef.generatedCode || '').trim(),
    '',
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
    '        except:',
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
    '    async def run(self, params: dict) -> Dict[str, Any]:',
    `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
    '        activity_input = self._build_activity_input(params or {})',
    ...extraActivityInputLines,
    '        self._validate_required_params(activity_input)',
    `        workflow.logger.info(${JSON.stringify(`执行 Activity: ${activityDef.name}`)})`,
    '        result = await workflow.execute_activity(',
    `            ${activityDef.fn},`,
    '            activity_input,',
    ...executeActivityTimeoutLines,
    '        )',
    '        return result',
    '',
  ].join('\n');
}

function normalizeHttpRequestStepConfig(
  step: WorkflowStep,
  declaredInputKeys: Set<string>,
  workflowNormalizationService: TemporalWorkflowNormalizationService,
  workflowConfigService: TemporalWorkflowConfigService
): Record<string, any> {
  const httpConfig = getStepHttpRequestConfig(step, workflowNormalizationService);
  return workflowConfigService.normalizeHttpRequestConfig(httpConfig, declaredInputKeys);
}

function getStepHttpRequestConfig(
  step: WorkflowStep,
  workflowNormalizationService: TemporalWorkflowNormalizationService
): Record<string, any> {
  const rawInput =
    step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
      ? (step.input as Record<string, any>)
      : {};
  const rawConfig = rawInput[HTTP_REQUEST_STEP_CONFIG_KEY];
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    return {};
  }
  return workflowNormalizationService.sanitizeJsonValue(rawConfig) as Record<string, any>;
}

function getStepStructuredTransformConfig(
  step: WorkflowStep,
  declaredInputKeys: Set<string>,
  workflowConfigService: TemporalWorkflowConfigService
): Record<string, any> {
  const rawInput =
    step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
      ? (step.input as Record<string, any>)
      : {};
  const rawConfig = rawInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY];
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    return workflowConfigService.normalizeStructuredTransformConfig({}, declaredInputKeys);
  }
  return workflowConfigService.normalizeStructuredTransformConfig(
    rawConfig as Record<string, any>,
    declaredInputKeys
  );
}

function getStepBuiltinConfig(
  step: WorkflowStep,
  stepConfigKey: string,
  defaultStepConfig: Record<string, unknown>,
  workflowNormalizationService: TemporalWorkflowNormalizationService
): Record<string, unknown> {
  if (!stepConfigKey) {
    return defaultStepConfig;
  }
  const rawInput =
    step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
      ? (step.input as Record<string, unknown>)
      : {};
  const rawConfig = rawInput[stepConfigKey];
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    return defaultStepConfig;
  }
  const sanitized = workflowNormalizationService.sanitizeJsonValue(rawConfig);
  if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
    return {
      ...defaultStepConfig,
      ...sanitized,
    };
  }
  return defaultStepConfig;
}
