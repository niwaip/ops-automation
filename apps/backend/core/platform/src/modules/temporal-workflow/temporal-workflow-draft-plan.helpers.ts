import {
  HTTP_REQUEST_STEP_CONFIG_KEY,
  STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
} from './builtin-activity.registry';
import { buildStructuredTransformPlaceholderKeys } from './temporal-workflow-draft.helpers';
import {
  buildGenericAiDraftSampleValue,
  extractAiDraftSampleValuesFromReferenceUrl,
} from './temporal-workflow-draft.normalizers';
import type {
  AiDraftActivityResource,
  AiWorkflowDraftPlan,
  TemporalWorkflowAiDraftSupport,
} from './temporal-workflow-draft.service';

interface DraftPlanHelperDependencies {
  pickFirstNonEmptyString: (...values: unknown[]) => string;
  buildWorkflowSemanticHint: (...values: unknown[]) => string;
}

export function validateAiWorkflowDraftPlan(
  plan: AiWorkflowDraftPlan,
  activityResources: AiDraftActivityResource[],
  deps: DraftPlanHelperDependencies,
): string[] {
  const issues: string[] = [];
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const knownActivityRefs = new Set(activityResources.map((item) => item.ref));

  if (steps.length === 0) {
    issues.push('必须至少生成一个步骤。');
    return issues;
  }

  steps.forEach((step, index) => {
    const stepName = deps.pickFirstNonEmptyString(step?.name) || `步骤 ${index + 1}`;
    const activityRef = deps.pickFirstNonEmptyString(step?.activityRef);
    const input = step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
      ? step.input as Record<string, any>
      : {};

    if (!activityRef) {
      issues.push(`${stepName} 缺少 activityRef。`);
      return;
    }
    if (!knownActivityRefs.has(activityRef)) {
      issues.push(`${stepName} 使用了未注册的 activityRef: ${activityRef}。`);
      return;
    }

    if (activityRef === 'builtin:httpRequest') {
      const httpConfig = input[HTTP_REQUEST_STEP_CONFIG_KEY];
      const urlTemplate = String(httpConfig?.urlTemplate || '').trim();
      if (!httpConfig || typeof httpConfig !== 'object' || Array.isArray(httpConfig)) {
        issues.push(`${stepName} 缺少完整的 __httpRequest 配置。`);
      } else {
        if (!urlTemplate) {
          issues.push(`${stepName} 的 __httpRequest.urlTemplate 不能为空。`);
        }
        if (urlTemplate.includes('?')) {
          issues.push(`${stepName} 的 urlTemplate 不能直接带查询串，必须拆到 queryTemplate。`);
        }
      }
    }

    if (activityRef === 'builtin:structuredTransform' || activityRef === 'builtin:aiStructuredTransform') {
      const transformConfig = input[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY];
      const contentTemplate = String(transformConfig?.contentTemplate || '').trim();
      const instructionTemplate = String(transformConfig?.instructionTemplate || '').trim();
      const outputMode = String(transformConfig?.outputMode || '').trim().toLowerCase();
      const contentType = String(transformConfig?.contentType || '').trim().toLowerCase();
      const outputSchema = transformConfig?.outputSchema;
      const fieldMappings = transformConfig?.fieldMappings;
      const textTemplate = String(transformConfig?.textTemplate || '').trim();
      const isAiTransform = activityRef === 'builtin:aiStructuredTransform';
      if (!transformConfig || typeof transformConfig !== 'object' || Array.isArray(transformConfig)) {
        issues.push(`${stepName} 缺少完整的 __structuredTransform 配置。`);
      } else {
        if (!contentType) {
          issues.push(`${stepName} 的 __structuredTransform.contentType 不能为空。`);
        }
        if (!contentTemplate) {
          issues.push(`${stepName} 的 __structuredTransform.contentTemplate 不能为空，通常应为 {content}。`);
        }
        if (!outputMode) {
          issues.push(`${stepName} 的 __structuredTransform.outputMode 不能为空。`);
        }
        if (isAiTransform && !instructionTemplate) {
          issues.push(`${stepName} 的 AI 转换步骤必须提供 __structuredTransform.instructionTemplate。`);
        }
        if (
          outputMode === 'json'
          && (!outputSchema || typeof outputSchema !== 'object' || Array.isArray(outputSchema) || Object.keys(outputSchema).length === 0)
        ) {
          issues.push(`${stepName} 的 outputMode 为 json 时，必须提供非空 outputSchema。`);
        }
        if (!isAiTransform) {
          const blankFieldMappingKeys = collectBlankFieldMappingKeys(
            fieldMappings && typeof fieldMappings === 'object' && !Array.isArray(fieldMappings)
              ? fieldMappings as Record<string, any>
              : {},
          );
          if (blankFieldMappingKeys.length > 0) {
            issues.push(`${stepName} 的 fieldMappings 存在空映射: ${blankFieldMappingKeys.join('、')}。空字符串会导致运行时把整块 content 回填到该字段，请显式填写来源路径、别名或删除这些字段。`);
          }
        }
        if (!isAiTransform && outputMode === 'json') {
          const hasFieldMappings = Boolean(
            fieldMappings
            && typeof fieldMappings === 'object'
            && !Array.isArray(fieldMappings)
            && Object.keys(fieldMappings).length > 0,
          );
          const hasNestedOutputSchema = Boolean(
            outputSchema
            && typeof outputSchema === 'object'
            && !Array.isArray(outputSchema)
            && Object.values(outputSchema as Record<string, unknown>).some((value) => (
              Array.isArray(value) || (value && typeof value === 'object')
            )),
          );
          if (!hasFieldMappings && hasNestedOutputSchema) {
            issues.push(`${stepName} 的固定规则 JSON 转换存在嵌套 outputSchema，但未提供 fieldMappings。请显式提供 fieldMappings，或改用 builtin:aiStructuredTransform。`);
          }
        }
        if (
          !isAiTransform
          && outputMode === 'text'
          && !textTemplate
          && (!fieldMappings || typeof fieldMappings !== 'object' || Array.isArray(fieldMappings) || Object.keys(fieldMappings).length === 0)
        ) {
          issues.push(`${stepName} 的固定规则文本转换至少需要 textTemplate 或非空 fieldMappings。`);
        }
      }
    }
  });

  for (let index = 1; index < steps.length; index += 1) {
    const previousStep = steps[index - 1];
    const currentStep = steps[index];
    const currentStepName = deps.pickFirstNonEmptyString(currentStep?.name) || `步骤 ${index + 1}`;
    const previousActivityRef = deps.pickFirstNonEmptyString(previousStep?.activityRef);
    const currentActivityRef = deps.pickFirstNonEmptyString(currentStep?.activityRef);
    if (previousActivityRef !== 'builtin:httpRequest' || currentActivityRef !== 'builtin:structuredTransform') {
      continue;
    }
    const previousInput = previousStep?.input && typeof previousStep.input === 'object' && !Array.isArray(previousStep.input)
      ? previousStep.input as Record<string, any>
      : {};
    const currentInput = currentStep?.input && typeof currentStep.input === 'object' && !Array.isArray(currentStep.input)
      ? currentStep.input as Record<string, any>
      : {};
    const httpConfig = previousInput[HTTP_REQUEST_STEP_CONFIG_KEY];
    const transformConfig = currentInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY];
    if (!httpConfig || !transformConfig || typeof httpConfig !== 'object' || typeof transformConfig !== 'object') {
      continue;
    }
    const responseMode = String(httpConfig?.responseMode || 'body').trim();
    const responseFieldMappings = httpConfig?.responseFieldMappings && typeof httpConfig.responseFieldMappings === 'object' && !Array.isArray(httpConfig.responseFieldMappings)
      ? httpConfig.responseFieldMappings as Record<string, any>
      : {};
    const availableAliases = new Set(Object.keys(responseFieldMappings).map((key) => String(key || '').trim()).filter(Boolean));
    const textTemplate = String(transformConfig?.textTemplate || '').trim();
    const fieldMappings = transformConfig?.fieldMappings && typeof transformConfig.fieldMappings === 'object' && !Array.isArray(transformConfig.fieldMappings)
      ? transformConfig.fieldMappings as Record<string, any>
      : {};

    if (responseMode === 'bodyMap' && availableAliases.size === 0) {
      issues.push(`${currentStepName} 的上游 httpRequest 使用了 bodyMap，但 responseFieldMappings 为空。请改用 body，或显式提供 responseFieldMappings。`);
    }

    if (responseMode === 'bodyMap' && textTemplate) {
      const placeholders = extractTemplatePlaceholders(textTemplate);
      const rawPathPlaceholders = placeholders.filter((item) => (
        item.includes('.')
        && !item.startsWith('context.')
        && !availableAliases.has(item)
      ));
      if (rawPathPlaceholders.length > 0) {
        issues.push(`${currentStepName} 的上游 httpRequest 为 bodyMap，但 textTemplate 仍引用原始路径占位符: ${rawPathPlaceholders.join('、')}。请改为使用 responseFieldMappings 的别名，或将上游改回 body。`);
      }
    }

    if (responseMode === 'bodyMap' && Object.keys(fieldMappings).length > 0) {
      const invalidFieldMappings = Object.entries(fieldMappings)
        .filter(([, value]) => typeof value === 'string')
        .map(([, value]) => String(value || '').trim())
        .filter((value) => value && value.includes('.') && !value.startsWith('context.') && !availableAliases.has(value));
      if (invalidFieldMappings.length > 0) {
        issues.push(`${currentStepName} 的 fieldMappings 与上游 bodyMap 输出不匹配，仍引用原始路径: ${invalidFieldMappings.join('、')}。请改为使用 bodyMap 的别名。`);
      }
    }

    const contextRefs = collectContextReferenceKeys(fieldMappings);
    const hasContextTemplate = hasUsableContextTemplate(transformConfig?.contextTemplate);
    if (contextRefs.size > 0 && !hasContextTemplate) {
      issues.push(`${currentStepName} 的 fieldMappings 引用了 context.*，但 contextTemplate 为空。请显式传入所需运行时上下文。`);
    }
  }

  return issues;
}

export function repairCommonDraftPlanIssues(
  plan: AiWorkflowDraftPlan,
  deps: Pick<DraftPlanHelperDependencies, 'pickFirstNonEmptyString'>,
): AiWorkflowDraftPlan {
  const steps = Array.isArray(plan.steps)
    ? plan.steps.map((step) => ({
      ...step,
      input: step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
        ? { ...(step.input as Record<string, any>) }
        : step?.input,
    }))
    : [];
  const warnings = Array.isArray(plan.warnings) ? [...plan.warnings] : [];
  const runtimeInputKeys = new Set(Object.keys(plan.inputParams || {}));

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const activityRef = deps.pickFirstNonEmptyString(step?.activityRef);
    const input = step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
      ? step.input as Record<string, any>
      : {};

    if (activityRef === 'builtin:httpRequest') {
      const httpConfig = input[HTTP_REQUEST_STEP_CONFIG_KEY];
      if (httpConfig && typeof httpConfig === 'object' && !Array.isArray(httpConfig)) {
        const responseMode = String(httpConfig.responseMode || 'body').trim();
        const responseFieldMappings = httpConfig.responseFieldMappings && typeof httpConfig.responseFieldMappings === 'object' && !Array.isArray(httpConfig.responseFieldMappings)
          ? httpConfig.responseFieldMappings as Record<string, any>
          : {};
        const responseBodyPath = String(httpConfig.responseBodyPath || '').trim();
        if (responseMode === 'bodyMap' && Object.keys(responseFieldMappings).length === 0) {
          httpConfig.responseMode = 'body';
          warnings.push(`已自动修正步骤「${buildStepLabel(step, index)}」: bodyMap 缺少 responseFieldMappings，已回退为 body。`);
        }
        if (responseMode === 'bodyPath' && !responseBodyPath) {
          httpConfig.responseMode = 'body';
          warnings.push(`已自动修正步骤「${buildStepLabel(step, index)}」: bodyPath 缺少 responseBodyPath，已回退为 body。`);
        }
      }
    }

    const previousStep = index > 0 ? steps[index - 1] : undefined;
    const previousActivityRef = deps.pickFirstNonEmptyString(previousStep?.activityRef);
    if (activityRef !== 'builtin:structuredTransform' || previousActivityRef !== 'builtin:httpRequest') {
      continue;
    }
    const previousInput = previousStep?.input && typeof previousStep.input === 'object' && !Array.isArray(previousStep.input)
      ? previousStep.input as Record<string, any>
      : {};
    const httpConfig = previousInput[HTTP_REQUEST_STEP_CONFIG_KEY];
    const transformConfig = input[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY];
    if (
      !httpConfig || typeof httpConfig !== 'object' || Array.isArray(httpConfig)
      || !transformConfig || typeof transformConfig !== 'object' || Array.isArray(transformConfig)
    ) {
      continue;
    }

    const responseMode = String(httpConfig.responseMode || 'body').trim();
    if (responseMode !== 'bodyMap') {
      const contextRefs = collectContextReferenceKeys(
        transformConfig.fieldMappings && typeof transformConfig.fieldMappings === 'object' && !Array.isArray(transformConfig.fieldMappings)
          ? transformConfig.fieldMappings as Record<string, any>
          : {},
      );
      if (contextRefs.size > 0 && !hasUsableContextTemplate(transformConfig.contextTemplate)) {
        transformConfig.contextTemplate = Object.fromEntries(
          Array.from(contextRefs).map((key) => [key, `{${key}}`]),
        );
        warnings.push(`已自动补全步骤「${buildStepLabel(step, index)}」的 contextTemplate，用于传递运行时上下文。`);
      }
      continue;
    }

    const responseFieldMappings = httpConfig.responseFieldMappings && typeof httpConfig.responseFieldMappings === 'object' && !Array.isArray(httpConfig.responseFieldMappings)
      ? httpConfig.responseFieldMappings as Record<string, any>
      : {};
    const aliasByPath = new Map<string, string>();
    Object.entries(responseFieldMappings).forEach(([alias, path]) => {
      const normalizedAlias = String(alias || '').trim();
      const normalizedPath = String(path || '').trim();
      if (normalizedAlias && normalizedPath) {
        aliasByPath.set(normalizedPath, normalizedAlias);
      }
    });
    const availableAliases = new Set(Object.keys(responseFieldMappings).map((key) => String(key || '').trim()).filter(Boolean));
    const fieldMappings = transformConfig.fieldMappings && typeof transformConfig.fieldMappings === 'object' && !Array.isArray(transformConfig.fieldMappings)
      ? { ...(transformConfig.fieldMappings as Record<string, any>) }
      : {};
    const blankFieldMappingKeys = collectBlankFieldMappingKeys(fieldMappings);
    let repairedBlankFieldMappings = false;
    blankFieldMappingKeys.forEach((key) => {
      if (availableAliases.has(key) || runtimeInputKeys.has(key)) {
        fieldMappings[key] = key;
        repairedBlankFieldMappings = true;
        warnings.push(`已自动修正步骤「${buildStepLabel(step, index)}」的空 fieldMapping: ${key} -> ${key}。`);
      }
    });
    if (repairedBlankFieldMappings) {
      transformConfig.fieldMappings = fieldMappings;
    }

    let textTemplate = String(transformConfig.textTemplate || '').trim();
    let rewroteTemplate = false;
    for (const placeholder of extractTemplatePlaceholders(textTemplate)) {
      if (placeholder.startsWith('context.')) {
        continue;
      }
      const mappedAlias = aliasByPath.get(placeholder);
      if (mappedAlias && mappedAlias !== placeholder) {
        textTemplate = textTemplate.replaceAll(`{${placeholder}}`, `{${mappedAlias}}`);
        rewroteTemplate = true;
      }
    }
    if (rewroteTemplate) {
      transformConfig.textTemplate = textTemplate;
      warnings.push(`已自动修正步骤「${buildStepLabel(step, index)}」的 textTemplate，使其与上游 bodyMap 别名保持一致。`);
    }

    let rewroteFieldMappings = false;
    Object.entries(fieldMappings).forEach(([key, value]) => {
      if (typeof value !== 'string') {
        return;
      }
      const normalizedValue = String(value || '').trim();
      const mappedAlias = aliasByPath.get(normalizedValue);
      if (mappedAlias && mappedAlias !== normalizedValue) {
        fieldMappings[key] = mappedAlias;
        rewroteFieldMappings = true;
      }
    });

    let autoFilledFieldMappings = false;
    for (const placeholder of extractTemplatePlaceholders(textTemplate)) {
      if (!placeholder || placeholder.startsWith('context.')) {
        continue;
      }
      if (availableAliases.has(placeholder) && !fieldMappings[placeholder]) {
        fieldMappings[placeholder] = placeholder;
        autoFilledFieldMappings = true;
      }
    }
    if (rewroteFieldMappings || autoFilledFieldMappings) {
      transformConfig.fieldMappings = fieldMappings;
      warnings.push(`已自动补全步骤「${buildStepLabel(step, index)}」的 fieldMappings，使其与上游 bodyMap 输出契约一致。`);
    }

    const contextRefs = collectContextReferenceKeys(fieldMappings);
    if (contextRefs.size > 0 && !hasUsableContextTemplate(transformConfig.contextTemplate)) {
      const contextTemplate = Object.fromEntries(
        Array.from(contextRefs)
          .filter((key) => runtimeInputKeys.has(key) || key)
          .map((key) => [key, `{${key}}`]),
      );
      if (Object.keys(contextTemplate).length > 0) {
        transformConfig.contextTemplate = contextTemplate;
        warnings.push(`已自动补全步骤「${buildStepLabel(step, index)}」的 contextTemplate，用于传递运行时上下文。`);
      }
    }
  }

  return {
    ...plan,
    steps,
    warnings,
  };
}

export function buildAiDraftResolutionSampleInputs(
  inputParams: AiWorkflowDraftPlan['inputParams'],
  referenceUrl: string,
  steps: NonNullable<AiWorkflowDraftPlan['steps']>,
  support: TemporalWorkflowAiDraftSupport,
  deps: DraftPlanHelperDependencies,
): Record<string, any> {
  const result: Record<string, any> = {};
  const knownEntries = Object.entries(inputParams || {});
  const placeholderKeys = new Set<string>();
  const inferredReferenceSamples = extractAiDraftSampleValuesFromReferenceUrl(
    referenceUrl,
    steps,
    (...values) => deps.pickFirstNonEmptyString(...values),
  );

  steps.forEach((step) => {
    support.collectTemplateVariables(step?.input || {}, placeholderKeys);
  });

  [...knownEntries.map(([key]) => key), ...Array.from(placeholderKeys)].forEach((rawKey) => {
    const key = String(rawKey || '').trim();
    if (!key || result[key] !== undefined) {
      return;
    }
    const config = inputParams?.[key];
    const defaultValue = support.pickFirstNonEmptyString(config?.defaultValue);
    if (defaultValue) {
      result[key] = defaultValue;
      return;
    }
    if (inferredReferenceSamples[key] !== undefined) {
      result[key] = inferredReferenceSamples[key];
      return;
    }
    result[key] = buildGenericAiDraftSampleValue({
      key,
      description: support.pickFirstNonEmptyString(config?.description),
      referenceUrl,
      buildWorkflowSemanticHint: (...values) => deps.buildWorkflowSemanticHint(...values),
    });
  });

  return result;
}

export function projectHttpPreviewToStepOutput(
  previewResponse: Record<string, any>,
  httpConfig: Record<string, any>,
  support: TemporalWorkflowAiDraftSupport,
): unknown {
  const responseMode = String(httpConfig?.responseMode || 'body').trim();
  const body = previewResponse?.body ?? previewResponse;

  if (responseMode === 'full') {
    return previewResponse;
  }
  if (responseMode === 'bodyPath') {
    return support.extractValueByPath(body, String(httpConfig?.responseBodyPath || ''));
  }
  if (responseMode === 'bodyMap') {
    const mappings = httpConfig?.responseFieldMappings && typeof httpConfig.responseFieldMappings === 'object' && !Array.isArray(httpConfig.responseFieldMappings)
      ? httpConfig.responseFieldMappings as Record<string, any>
      : {};
    return Object.fromEntries(
      Object.entries(mappings).map(([key, path]) => [
        String(key || '').trim(),
        support.extractValueByPath(body, String(path || '').trim()),
      ]),
    );
  }
  return body;
}

export function simulateFixedStructuredTransformOutputSample(
  sourceSample: unknown,
  transformConfig: Record<string, any>,
  support: TemporalWorkflowAiDraftSupport,
): unknown {
  const normalizedConfig = support.normalizeStructuredTransformConfig(
    transformConfig || {},
    buildStructuredTransformPlaceholderKeys({}, transformConfig),
  );
  const outputMode = String(normalizedConfig.outputMode || 'json').trim().toLowerCase();
  const sourceObject = sourceSample && typeof sourceSample === 'object' && !Array.isArray(sourceSample)
    ? sourceSample as Record<string, unknown>
    : {};
  const fieldMappings = normalizedConfig.fieldMappings && typeof normalizedConfig.fieldMappings === 'object' && !Array.isArray(normalizedConfig.fieldMappings)
    ? normalizedConfig.fieldMappings as Record<string, any>
    : {};
  const values: Record<string, unknown> = {
    ...sourceObject,
    content: typeof sourceSample === 'string' ? sourceSample : JSON.stringify(sourceSample ?? ''),
  };

  Object.entries(fieldMappings).forEach(([key, mapping]) => {
    const mappingPath = String(mapping || '').trim();
    if (!mappingPath) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(sourceObject, mappingPath)) {
      values[key] = sourceObject[mappingPath];
      return;
    }
    values[key] = support.extractValueByPath(sourceSample, mappingPath);
  });

  if (outputMode === 'text') {
    const rendered = support.renderHttpTemplateValue(
      String(normalizedConfig.textTemplate || '{content}'),
      values,
    );
    return String(rendered ?? '').trim();
  }

  const outputSchema = normalizedConfig.outputSchema && typeof normalizedConfig.outputSchema === 'object' && !Array.isArray(normalizedConfig.outputSchema)
    ? normalizedConfig.outputSchema as Record<string, any>
    : {};
  const resultKeys = Object.keys(fieldMappings).length > 0
    ? Object.keys(fieldMappings)
    : Object.keys(outputSchema);
  if (resultKeys.length === 0) {
    return sourceSample;
  }
  return Object.fromEntries(
    resultKeys.map((key) => [
      key,
      values[key] !== undefined ? values[key] : support.extractValueByPath(sourceSample, key),
    ]),
  );
}

export function simulateAiStructuredTransformOutputSample(
  sourceSample: unknown,
  transformConfig: Record<string, any>,
  support: TemporalWorkflowAiDraftSupport,
): unknown {
  const normalizedConfig = support.normalizeStructuredTransformConfig(
    transformConfig || {},
    buildStructuredTransformPlaceholderKeys({}, transformConfig),
  );
  const outputMode = String(normalizedConfig.outputMode || 'json').trim().toLowerCase();
  if (outputMode === 'text') {
    if (typeof sourceSample === 'string') {
      return sourceSample;
    }
    return JSON.stringify(sourceSample ?? '').slice(0, 500);
  }

  const outputSchema = normalizedConfig.outputSchema && typeof normalizedConfig.outputSchema === 'object' && !Array.isArray(normalizedConfig.outputSchema)
    ? normalizedConfig.outputSchema as Record<string, any>
    : {};
  const sourceObject = sourceSample && typeof sourceSample === 'object' && !Array.isArray(sourceSample)
    ? sourceSample as Record<string, unknown>
    : {};
  const keys = Object.keys(outputSchema);
  if (keys.length === 0) {
    return sourceSample;
  }
  return Object.fromEntries(
    keys.map((key) => [
      key,
      sourceObject[key] !== undefined
        ? sourceObject[key]
        : support.buildPlaceholderValueFromSchemaHint(outputSchema[key], key),
    ]),
  );
}

function buildStepLabel(
  step: NonNullable<AiWorkflowDraftPlan['steps']>[number] | undefined,
  index: number,
): string {
  return String(step?.name || step?.id || `step_${index + 1}`);
}

function extractTemplatePlaceholders(template: string): string[] {
  return Array.from(String(template || '').matchAll(/\{([^{}]+)\}/g))
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean);
}

function collectContextReferenceKeys(fieldMappings: Record<string, any>): Set<string> {
  const keys = new Set<string>();
  Object.values(fieldMappings || {}).forEach((value) => {
    if (typeof value !== 'string') {
      return;
    }
    const match = String(value || '').trim().match(/^context\.([^.\s]+)$/);
    if (match?.[1]) {
      keys.add(String(match[1]).trim());
    }
  });
  return keys;
}

function collectBlankFieldMappingKeys(fieldMappings: Record<string, any>): string[] {
  return Object.entries(fieldMappings || {})
    .map(([key, value]) => ({
      key: String(key || '').trim(),
      value: typeof value === 'string' ? value.trim() : String(value ?? '').trim(),
    }))
    .filter((item) => item.key && !item.value)
    .map((item) => item.key);
}

function hasUsableContextTemplate(value: unknown): boolean {
  if (typeof value === 'string') {
    return Boolean(value.trim());
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return false;
}
