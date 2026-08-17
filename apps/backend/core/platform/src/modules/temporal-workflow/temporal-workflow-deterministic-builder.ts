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
  buildWorkflowResultSupportLines,
} from './temporal-workflow-fixed-workflow-code.helpers';
import {
  buildV2StepResultsArgument,
  hasV2OutputFields,
} from './temporal-workflow-result-builder.helpers';
import { TemporalWorkflowConfigService } from '../../workflow-registry/workflow-template/temporal-workflow-config.service';
import { TemporalWorkflowNormalizationService } from './temporal-workflow-normalization.service';
import { resolveDocumentWorkflowBindingPaths } from './temporal-workflow-template.helpers';
import { pickFirstNonEmptyString } from './temporal-workflow-json.utils';
import {
  buildExecuteActivityTimeoutLines,
  buildPythonJsonLiteral,
  durationToTimedeltaCode,
  normalizeInputParams,
  toPythonLiteral,
} from './temporal-workflow-python.utils';
import type {
  ActivityDefinition,
  ActivityDsl,
  WorkflowDsl,
  WorkflowStep,
} from './temporal-workflow.types';

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

/**
 * P1-C-B: 通用线性构建器（design doc §15.2 item 4 的确定性兜底）。
 *
 * 覆盖专用构建器不处理的 N 步线性链（N>=2）：非 HTTP+Transform 的 2 步链、
 * 3 步及以上链。所有步骤必须是 Activity、无 conditionals/signals/queries/
 * errorHandling，且每个步骤的 Activity 都具备确定性 generatedCode。
 *
 * 每步配置在构建期编译为「模板保留」的规范化 config（http/transform 走专用
 * 编译形状，其余走原始 config 渲染），运行时由 `_resolve_step_input` 统一解析：
 * - `{param}` / `{{param}}` → 工作流入参 base_input
 * - `{{stepId.path.to.value}}` → 前置步骤结果（含 list 下标）
 * - `{content}` / `{httpResult}` / `{httpBody}` → 最近一个步骤的结果（对齐
 *   固定 HTTP+Transform 构建器的 content 透传语义）
 *
 * 步骤结果按步骤类型归一化（http: responseMode body/bodyPath/bodyMap；
 * transform: 提取内层 `result`；其余原样），写入 step_results 供
 * `_build_workflow_result`（v2Output 或 legacy）返回。
 */
export function buildUniversalLinearWorkflowCode(
  workflowDsl: WorkflowDsl,
  activityDsl: ActivityDsl,
  deps: DeterministicBuilderDependencies
): string | null {
  const { builtinActivityRegistry, workflowConfigService, workflowNormalizationService } = deps;
  const declaredInputKeys = new Set(Object.keys(workflowDsl.inputParams || {}));

  // G1: 线性 Activity-only 拓扑（与 isSimpleStaticWorkflow 相同门控）
  const activitySteps = workflowDsl.steps.filter((step) => step.type === 'activity');
  if (workflowDsl.steps.length !== activitySteps.length) {
    return null;
  }
  if (
    (workflowDsl.conditionals && workflowDsl.conditionals.length > 0) ||
    (workflowDsl.signalHandlers && workflowDsl.signalHandlers.length > 0) ||
    (workflowDsl.queryHandlers && workflowDsl.queryHandlers.length > 0) ||
    workflowDsl.errorHandling
  ) {
    return null;
  }

  // G2: 单步工作流由专用/通用单步构建器处理
  if (activitySteps.length < 2) {
    return null;
  }

  interface UniversalStepPlan {
    step: WorkflowStep;
    activityDef: ActivityDefinition;
    kind: 'http' | 'transform' | 'generic';
    config: Record<string, any>;
  }

  const stepPlans: UniversalStepPlan[] = [];
  for (const step of activitySteps) {
    const stepActivityIdentifier =
      step?.activityName ||
      (step.activityRef ? builtinActivityRegistry.getByRef(step.activityRef)?.name : undefined);
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

    const builtinKey = builtinActivityRegistry.getByFn(activityDef.fn)?.key ?? null;
    let kind: UniversalStepPlan['kind'] = 'generic';
    let config: Record<string, any>;
    if (builtinKey === HTTP_REQUEST_ACTIVITY_KEY) {
      config = normalizeHttpRequestStepConfig(
        step,
        declaredInputKeys,
        workflowNormalizationService,
        workflowConfigService
      );
      if (!String(config.urlTemplate || '').trim()) {
        return null;
      }
      kind = 'http';
    } else if (
      builtinKey === STRUCTURED_TRANSFORM_ACTIVITY_KEY ||
      builtinKey === AI_STRUCTURED_TRANSFORM_ACTIVITY_KEY
    ) {
      config = getStepStructuredTransformConfig(step, declaredInputKeys, workflowConfigService);
      kind = 'transform';
    } else {
      const builtin = builtinKey ? builtinActivityRegistry.getByKey(builtinKey) : null;
      const stepConfigKey = builtin?.config?.stepConfigKey;
      config = stepConfigKey
        ? (getStepBuiltinConfig(
            step,
            stepConfigKey,
            builtin?.config?.defaultStepConfig || {},
            workflowNormalizationService
          ) as Record<string, any>)
        : Object.fromEntries(
            Object.entries(
              step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
                ? (step.input as Record<string, any>)
                : {}
            ).filter(([key]) => !key.startsWith('__'))
          );
      kind = 'generic';
    }
    stepPlans.push({ step, activityDef, kind, config });
  }

  const workflowClassName =
    workflowDsl.workflowClassName?.trim() ||
    `${(workflowDsl.name || 'Custom').replace(/\s+/g, '') || 'Custom'}Workflow`;
  const workflowDisplayName =
    workflowDsl.workflowDefnName?.trim() || workflowDsl.name || workflowClassName;

  const inputParams = Object.entries(workflowDsl.inputParams || {});
  const normalizeLines = inputParams.map(([key, config]) => {
    const defaultValue = config?.defaultValue ?? '';
    return `        ${JSON.stringify(key)}: cls._normalize(params.get(${JSON.stringify(key)}, ${JSON.stringify(String(defaultValue))})),`;
  });
  const requiredParamNames = Array.from(
    new Set(inputParams.filter(([, config]) => Boolean(config?.required)).map(([key]) => key))
  );

  const maxWorkflowSeconds = Math.max(
    60,
    ...stepPlans.map((plan) =>
      durationToSeconds(plan.step.startToCloseTimeout || plan.activityDef.timeout, 60)
    )
  );
  const workflowTimeoutCode = durationToTimedeltaCode(`${maxWorkflowSeconds}s`);
  const kindsExpression = JSON.stringify(stepPlans.map((plan) => plan.kind));
  const configsExpression = toPythonLiteral(
    stepPlans.map((plan) => plan.config),
    4
  );

  const stepVarNames: Record<string, string> = {};
  const executionBlocks: string[] = [];
  stepPlans.forEach((plan, index) => {
    stepVarNames[plan.step.id] = `step_result_${index}`;
    executionBlocks.push(
      `        step_input_${index} = self._resolve_step_input(${index}, base_input, step_results)`,
      `        workflow.logger.info(${JSON.stringify(`执行 Activity: ${plan.activityDef.name}`)})`,
      `        raw_result_${index} = await workflow.execute_activity(`,
      `            ${plan.activityDef.fn},`,
      `            step_input_${index},`,
      ...buildExecuteActivityTimeoutLines(plan.step, plan.activityDef.timeout || '60s'),
      '        )',
      `        step_result_${index} = self._normalize_step_result(${index}, raw_result_${index}, params or {})`,
      `        step_results[${JSON.stringify(plan.step.id)}] = step_result_${index}`,
      ''
    );
  });

  const workflowResultSupportLines = buildWorkflowResultSupportLines({
    resultType: 'generic',
    title: workflowDisplayName,
    v2Output: workflowDsl.v2Output,
    validV2StepIds: stepPlans.map((plan) => plan.step.id),
  });
  const returnLine = hasV2OutputFields(workflowDsl.v2Output)
    ? `        return self._build_workflow_result(${buildV2StepResultsArgument(stepVarNames)})`
    : '        return self._build_workflow_result(step_results)';

  return [
    'import re',
    'import json',
    'from datetime import timedelta',
    'from typing import Any, Dict, List',
    '',
    'from temporalio import workflow',
    'from temporalio.exceptions import ApplicationError',
    '',
    ...stepPlans.map((plan) => (plan.activityDef.generatedCode || '').trim()),
    '',
    `@workflow.defn(name=${JSON.stringify(workflowDisplayName)})`,
    `class ${workflowClassName}:`,
    `    ACTIVITY_START_TO_CLOSE_TIMEOUT = ${workflowTimeoutCode}`,
    `    STEP_KINDS = ${kindsExpression}`,
    `    STEP_CONFIGS = ${configsExpression}`,
    '',
    '    @staticmethod',
    '    def _normalize(value: Any) -> str:',
    '        if value is None:',
    '            return ""',
    '        return str(value)',
    '',
    '    @classmethod',
    '    def _build_base_input(cls, params: Dict[str, Any]) -> Dict[str, Any]:',
    '        return {',
    ...normalizeLines,
    '        }',
    '',
    '    @staticmethod',
    '    def _validate_required_params(base_input: Dict[str, Any]) -> None:',
    `        required_params = ${JSON.stringify(requiredParamNames)}`,
    '        missing_params = [key for key in required_params if str(base_input.get(key, "")).strip() == ""]',
    '        if missing_params:',
    '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
    '',
    '    @staticmethod',
    '    def _resolve_ref(ref: str, base_input: Dict[str, Any], step_results: Dict[str, Any]) -> Any:',
    '        clean_ref = str(ref or "").strip()',
    '        if clean_ref.startswith("$."):',
    '            clean_ref = clean_ref[2:]',
    '        elif clean_ref.startswith("$"):',
    '            clean_ref = clean_ref[1:]',
    '        parts = [part for part in clean_ref.split(".") if part]',
    '        if not parts:',
    '            return None',
    '        first = parts[0]',
    '        if first in step_results:',
    '            current = step_results[first]',
    '            for part in parts[1:]:',
    '                clean_part = part.lstrip("$")',
    '                if isinstance(current, dict):',
    '                    if part in current:',
    '                        current = current[part]',
    '                    elif clean_part in current:',
    '                        current = current[clean_part]',
    '                    elif clean_part in ("result", "data", "body") and not any(k in current for k in ("result", "data", "body")):',
    '                        pass',
    '                    else:',
    '                        return None',
    '                elif isinstance(current, list) and clean_part.isdigit():',
    '                    index = int(clean_part)',
    '                    current = current[index] if 0 <= index < len(current) else None',
    '                else:',
    '                    return None',
    '                if current is None:',
    '                    return None',
    '            return current',
    '        if len(parts) == 1:',
    '            if first in base_input:',
    '                return base_input[first]',
    '            clean_first = first.lstrip("$")',
    '            if clean_first in base_input:',
    '                return base_input[clean_first]',
    '            if clean_first in ("result", "content", "httpResult", "httpBody", "data", "body") and step_results:',
    '                return list(step_results.values())[-1]',
    '        return None',
    '',
    '    @classmethod',
    '    def _render_template(cls, value: Any, base_input: Dict[str, Any], step_results: Dict[str, Any]) -> Any:',
    '        if isinstance(value, str):',
    '            stripped = value.strip()',
    '            whole_match = re.fullmatch(r"\\{\\{\\s*([^{}]+)\\s*\\}\\}", stripped)',
    '            if whole_match:',
    '                return cls._resolve_ref(whole_match.group(1).strip(), base_input, step_results)',
    '            single_match = re.fullmatch(r"\\{\\s*([^{}]+)\\s*\\}", stripped)',
    '            if single_match:',
    '                return cls._resolve_ref(single_match.group(1).strip(), base_input, step_results)',
    '            def replace(match: re.Match[str]) -> str:',
    '                resolved = cls._resolve_ref(match.group(1).strip(), base_input, step_results)',
    '                return "" if resolved is None else str(resolved)',
    '            rendered = re.sub(r"\\{\\{\\s*([^{}]+)\\s*\\}\\}", replace, value)',
    '            return re.sub(r"\\{\\s*([^{}]+)\\s*\\}", replace, rendered)',
    '        if isinstance(value, dict):',
    '            return {str(k): cls._render_template(v, base_input, step_results) for k, v in value.items()}',
    '        if isinstance(value, list):',
    '            return [cls._render_template(item, base_input, step_results) for item in value]',
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
    '    @classmethod',
    '    def _resolve_step_input(cls, step_index: int, base_input: Dict[str, Any], step_results: Dict[str, Any]) -> Dict[str, Any]:',
    '        kind = cls.STEP_KINDS[step_index]',
    '        config = cls.STEP_CONFIGS[step_index] or {}',
    '        if kind == "http":',
    '            activity_input = {',
    '                "url": cls._render_template(str(config.get("urlTemplate") or ""), base_input, step_results),',
    '                "method": str(config.get("method") or "GET").upper(),',
    '                "headers": cls._prune_empty(cls._render_template(config.get("headersTemplate") or {}, base_input, step_results)),',
    '                "params": cls._prune_empty(cls._render_template(config.get("queryTemplate") or {}, base_input, step_results)),',
    '                "timeout": config.get("timeout") or 30,',
    '            }',
    '            json_payload = cls._prune_empty(cls._render_template(config.get("jsonTemplate") or {}, base_input, step_results))',
    '            if json_payload not in (None, "", {}, []):',
    '                activity_input["json"] = json_payload',
    '            data_payload = cls._prune_empty(cls._render_template(config.get("dataTemplate"), base_input, step_results))',
    '            if data_payload not in (None, "", {}, []):',
    '                activity_input["data"] = data_payload',
    '            return activity_input',
    '        if kind == "transform":',
    '            return {',
    '                "content": cls._render_template(config.get("contentTemplate", "{content}"), base_input, step_results),',
    '                "contentType": str(config.get("contentType") or "text"),',
    '                "instruction": cls._render_template(str(config.get("instructionTemplate") or ""), base_input, step_results),',
    '                "outputMode": str(config.get("outputMode") or "json"),',
    '                "outputSchema": config.get("outputSchema") or {},',
    '                "context": cls._normalize_context(cls._render_template(str(config.get("contextTemplate") or ""), base_input, step_results)),',
    '                "fieldMappings": config.get("fieldMappings") or {},',
    '                "textTemplate": str(config.get("textTemplate") or ""),',
    '            }',
    '        resolved = dict(base_input)',
    '        rendered_config = cls._render_template(config, base_input, step_results)',
    '        if isinstance(rendered_config, dict):',
    '            for key, item in rendered_config.items():',
    '                if item is not None:',
    '                    resolved[key] = item',
    '        return resolved',
    '',
    '    @classmethod',
    '    def _normalize_step_result(cls, step_index: int, raw_result: Any, params: Dict[str, Any]) -> Any:',
    '        kind = cls.STEP_KINDS[step_index]',
    '        if kind == "http":',
    '            config = cls.STEP_CONFIGS[step_index] or {}',
    '            if bool(params.get("__httpResponsePreview")):',
    '                return raw_result',
    '            response_mode = str(config.get("responseMode") or "body").strip() or "body"',
    '            if response_mode == "full":',
    '                return raw_result',
    '            body = raw_result.get("body") if isinstance(raw_result, dict) else raw_result',
    '            if response_mode == "bodyPath":',
    '                return cls._extract_path(body, str(config.get("responseBodyPath") or ""))',
    '            if response_mode == "bodyMap":',
    '                mappings = config.get("responseFieldMappings") or {}',
    '                if not isinstance(mappings, dict) or not mappings:',
    '                    return body',
    '                return {str(key): cls._extract_path(body, str(path)) for key, path in mappings.items()}',
    '            return body',
    '        if kind == "transform":',
    '            return raw_result.get("result") if isinstance(raw_result, dict) and "result" in raw_result else raw_result',
    '        return raw_result',
    '',
    ...(workflowResultSupportLines || []),
    '    async def run(self, params: dict) -> Any:',
    `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
    '        base_input = self._build_base_input(params or {})',
    '        self._validate_required_params(base_input)',
    '        step_results = {}',
    '',
    ...executionBlocks,
    returnLine,
    '',
  ].join('\n');
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
      const specializedCode = buildFixedHttpRequestStructuredTransformWorkflowCodeHelper({
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
      if (specializedCode) {
        return specializedCode;
      }
    }
    // 非 HTTP+Transform 的 2 步链 → 交给通用线性构建器兜底
  }

  if (activitySteps.length !== 1 || workflowDsl.steps.length !== 1) {
    // P1-C-B: 多步线性链（N>=2）兜底——全部 Activity 具备确定性代码时
    // 由通用线性构建器编译，避免整文件 AI 生成
    const universalCode = buildUniversalLinearWorkflowCode(workflowDsl, activityDsl, deps);
    if (universalCode) {
      return universalCode;
    }
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
      ? [`        "requestTimeoutSeconds": ${requestTimeoutSeconds},`]
      : [];

  const normalizeLines = inputParams.map(([key, config]) => {
    const defaultValue = config?.defaultValue ?? '';
    return `        ${JSON.stringify(key)}: cls._normalize(params.get(${JSON.stringify(key)}, ${JSON.stringify(String(defaultValue))})),`;
  });
  const requiredParamNames = inputParams
    .filter(([, config]) => Boolean(config?.required))
    .map(([key]) => key);
  const v2FieldsDeclared = hasV2OutputFields(workflowDsl.v2Output);
  const workflowResultSupportLines = buildWorkflowResultSupportLines({
    resultType: 'generic',
    title: workflowDisplayName,
    v2Output: workflowDsl.v2Output,
    validV2StepIds: [step.id],
  });

  return [
    'from datetime import timedelta',
    'from temporalio import workflow',
    'import json',
    'from typing import Any, Dict, List',
    'from temporalio.exceptions import ApplicationError',
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
    ...extraActivityInputLines,
    '        }',
    '',
    '    @staticmethod',
    '    def _validate_required_params(activity_input: Dict[str, Any]) -> None:',
    `        required_params = ${JSON.stringify(requiredParamNames)}`,
    `        missing_params = [key for key in required_params if ${workflowClassName}._is_missing(activity_input.get(key))]`,
    '        if missing_params:',
    '            raise ApplicationError(f"缺少必需参数: {\', \'.join(missing_params)}", non_retryable=True)',
    '',
    ...(workflowResultSupportLines || []),
    '    async def run(self, params: dict) -> Dict[str, Any]:',
    `        workflow.logger.info(${JSON.stringify(`启动工作流: ${workflowDisplayName}`)})`,
    '        activity_input = self._build_activity_input(params or {})',
    '        self._validate_required_params(activity_input)',
    `        workflow.logger.info(${JSON.stringify(`执行 Activity: ${activityDef.name}`)})`,
    '        result = await workflow.execute_activity(',
    `            ${activityDef.fn},`,
    '            activity_input,',
    ...executeActivityTimeoutLines,
    '        )',
    ...(v2FieldsDeclared
      ? [`        return self._build_workflow_result(${buildV2StepResultsArgument({ [step.id]: 'result' })})`]
      : ['        return self._build_workflow_result(result)']),
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
