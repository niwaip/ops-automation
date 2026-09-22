import { carboneAPI } from '@/api/carbone';
import type {
  ActivityDsl,
  WorkflowDsl,
  WorkflowInputParamDefinition,
  WorkflowInputPolicy,
  WorkflowParamPolicy,
  WorkflowParamRequiredMode,
  WorkflowPolicyDefaultValue,
} from '@/api/temporal';
import { temporalWorkflowApi } from '@/api/temporal';

import {
  asPlainRecord,
  collectTemplateVariablesFromValue,
  getStepHttpRequestConfig,
  getStepInputPublicEntries,
  getStepStructuredTransformConfig,
  mergeWorkflowInputParamMaps,
  normalizeActivityInputParams,
  normalizeWorkflowInputParamMap,
  withNormalizedWorkflowInputParams,
} from './workflowInputHelpers';

export const resolveSingleWorkflowInputRenderPath = (renderPath?: unknown): string | undefined => {
  if (typeof renderPath === 'string' && renderPath.trim()) {
    return renderPath.trim();
  }
  if (Array.isArray(renderPath)) {
    const firstPath = renderPath.map((item) => String(item || '').trim()).find(Boolean);
    return firstPath || undefined;
  }
  return undefined;
};

export const normalizeWorkflowPolicyRequiredMode = (
  currentMode: WorkflowParamRequiredMode | undefined,
  required: boolean | undefined
): WorkflowParamRequiredMode => {
  if (currentMode === 'system_required') {
    return currentMode;
  }
  if (currentMode === 'conditional') {
    return required === false ? 'optional' : currentMode;
  }
  return required ? 'always' : 'optional';
};

export const normalizeWorkflowPolicyDefaultValue = (
  value: unknown,
  type: WorkflowInputParamDefinition['type']
): WorkflowPolicyDefaultValue | undefined => {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return undefined;
  }
  if (type === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const parsed = Number(trimmed);
      if (trimmed && Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return typeof value === 'string' ? value : undefined;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no', 'n'].includes(normalized)) {
        return false;
      }
      return value;
    }
    return undefined;
  }
  return typeof value === 'string' ? value : String(value);
};

export const buildSynchronizedWorkflowInputPolicy = (
  inputParams?: Record<string, WorkflowInputParamDefinition>,
  existingInputPolicy?: WorkflowInputPolicy
): WorkflowInputPolicy | undefined => {
  const normalizedInputParams = normalizeWorkflowInputParamMap(inputParams);
  const existingPolicies = existingInputPolicy?.params || {};
  const nextPolicies = Object.entries(normalizedInputParams).reduce<
    Record<string, WorkflowParamPolicy>
  >((acc, [key, definition]) => {
    const previousPolicy = existingPolicies[key] || {};
    const nextDefaultValue =
      definition.localizedDefaultValue && Object.keys(definition.localizedDefaultValue).length > 0
        ? definition.localizedDefaultValue
        : normalizeWorkflowPolicyDefaultValue(definition.defaultValue, definition.type);
    const nextPolicy: WorkflowParamPolicy = {
      ...previousPolicy,
      enabled: previousPolicy.enabled ?? true,
      requiredMode: normalizeWorkflowPolicyRequiredMode(
        previousPolicy.requiredMode,
        definition.required
      ),
    };
    const templateBinding = resolveSingleWorkflowInputRenderPath(
      (definition as WorkflowInputParamDefinition & { renderPath?: unknown }).renderPath
    );
    if (templateBinding) {
      nextPolicy.templateBinding = templateBinding;
    } else if (!previousPolicy.templateBinding) {
      delete nextPolicy.templateBinding;
    }
    if (nextDefaultValue !== undefined) {
      nextPolicy.defaultValue = nextDefaultValue;
    } else {
      delete nextPolicy.defaultValue;
    }
    acc[key] = nextPolicy;
    return acc;
  }, {});
  return Object.keys(nextPolicies).length > 0 ? { params: nextPolicies } : undefined;
};

export const normalizeWorkflowSkillParamKey = (name: unknown): string =>
  String(name || '')
    .trim()
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .replace(/^#/, '')
    .replace(/^\//, '')
    .replace(/^d\./, '')
    .trim();

export const buildWorkflowInputParamMapFromSkill = (
  skill?: any
): Record<string, Partial<WorkflowInputParamDefinition>> => {
  const parameters = Array.isArray(skill?.parameters) ? skill.parameters : [];
  return parameters.reduce((acc: any, rawParameter: any) => {
    const parameter = (rawParameter || {}) as Record<string, unknown>;
    const key = normalizeWorkflowSkillParamKey(parameter.name);
    if (!key || acc[key]) {
      return acc;
    }
    const arrayMatch = key.match(/^(.+\[\])\.(.+)$/);
    acc[key] = {
      description: typeof parameter.usage === 'string' ? parameter.usage : '',
      displayName: typeof parameter.displayName === 'string' ? parameter.displayName : '',
      groupLabel: [
        parameter.groupLabel,
        parameter.sheetName,
        parameter.chapter,
        parameter.section,
        parameter.group,
      ].find((value) => typeof value === 'string' && value.trim()) as string | undefined,
      paramKind: arrayMatch ? 'array' : 'scalar',
      arrayPath: arrayMatch?.[1] || '',
      fieldName: arrayMatch?.[2] || key,
    };
    return acc;
  }, {});
};

export const enrichWorkflowInputParamsWithSkill = (
  inputParams?: Record<string, WorkflowInputParamDefinition>,
  skill?: any
): Record<string, WorkflowInputParamDefinition> => {
  const normalizedInputParams = normalizeWorkflowInputParamMap(inputParams);
  if (Object.keys(normalizedInputParams).length === 0) {
    return normalizedInputParams;
  }
  const skillParamMap = buildWorkflowInputParamMapFromSkill(skill);
  return Object.entries(normalizedInputParams).reduce<Record<string, WorkflowInputParamDefinition>>(
    (acc, [key, value]) => {
      const metadata = skillParamMap[key] || {};
      acc[key] = {
        ...value,
        description: value.description || metadata.description || '',
        displayName: value.displayName || metadata.displayName || '',
        groupLabel: value.groupLabel || metadata.groupLabel || '',
        paramKind:
          value.paramKind || metadata.paramKind || (key.includes('[].') ? 'array' : 'scalar'),
        arrayPath:
          value.arrayPath ||
          metadata.arrayPath ||
          (key.includes('[].') ? `${key.split('[].')[0]}[]` : ''),
        fieldName:
          value.fieldName ||
          metadata.fieldName ||
          (key.includes('[].') ? key.split('[].')[1] || key : key),
      };
      return acc;
    },
    {}
  );
};

export type GroupedWorkflowInputParams = {
  key: string;
  label: string;
  scalarEntries: Array<[string, WorkflowInputParamDefinition]>;
  arrayGroups: Array<{
    arrayPath: string;
    entries: Array<[string, WorkflowInputParamDefinition]>;
  }>;
};

export const groupWorkflowInputParams = (
  inputParams?: Record<string, WorkflowInputParamDefinition>
): GroupedWorkflowInputParams[] => {
  const groupMap = new Map<string, GroupedWorkflowInputParams>();
  const entries = Object.entries(inputParams || {});

  entries.forEach(([key, param]) => {
    const explicitLabel = String(param.groupLabel || '').trim();
    const groupLabel = explicitLabel || '参数';
    const existing = groupMap.get(groupLabel) || {
      key: groupLabel,
      label: groupLabel,
      scalarEntries: [],
      arrayGroups: [],
    };

    const isArray = param.paramKind === 'array' || key.includes('[].');
    if (!isArray) {
      existing.scalarEntries.push([key, param]);
      groupMap.set(groupLabel, existing);
      return;
    }

    const arrayPath = String(param.arrayPath || '').trim() || `${key.split('[].')[0]}[]`;
    const arrayGroup = existing.arrayGroups.find((item) => item.arrayPath === arrayPath);
    if (arrayGroup) {
      arrayGroup.entries.push([key, param]);
    } else {
      existing.arrayGroups.push({
        arrayPath,
        entries: [[key, param]],
      });
    }

    groupMap.set(groupLabel, existing);
  });

  return Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      scalarEntries: group.scalarEntries.sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN')),
      arrayGroups: group.arrayGroups
        .map((arrayGroup) => ({
          ...arrayGroup,
          entries: arrayGroup.entries.sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN')),
        }))
        .sort((a, b) => a.arrayPath.localeCompare(b.arrayPath, 'zh-Hans-CN')),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
};

export const extractTemplatePlaceholders = (template: string): string[] =>
  Array.from(String(template || '').matchAll(/\{([^{}]+)\}/g))
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean);

export const collectContextReferenceKeys = (fieldMappings: Record<string, any>): string[] =>
  Object.values(fieldMappings || {})
    .filter((value): value is string => typeof value === 'string')
    .map(
      (value) =>
        String(value || '')
          .trim()
          .match(/^context\.([^.\s]+)$/)?.[1] || ''
    )
    .filter(Boolean);

export const hasUsableContextTemplate = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return Boolean(value.trim());
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return false;
};

export const normalizeValidationInputValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const collectLeafPaths = (
  value: unknown,
  prefix = '',
  acc: Array<{ path: string; value: unknown }> = [],
  depth = 0
): Array<{ path: string; value: unknown }> => {
  if (depth > 6) {
    return acc;
  }
  if (Array.isArray(value)) {
    value.slice(0, 8).forEach((item, index) => {
      const nextPath = prefix ? `${prefix}.${index}` : String(index);
      collectLeafPaths(item, nextPath, acc, depth + 1);
    });
    return acc;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>)
      .slice(0, 20)
      .forEach(([key, item]) => {
        const nextPath = prefix ? `${prefix}.${key}` : key;
        collectLeafPaths(item, nextPath, acc, depth + 1);
      });
    return acc;
  }
  if (prefix) {
    acc.push({ path: prefix, value });
  }
  return acc;
};

export const unwrapValidationResultPayload = (value: unknown): unknown => {
  let current = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return current;
    }
    const record = current as Record<string, unknown>;
    if (!('result' in record)) {
      return current;
    }
    const hasExecutionEnvelope = ['success', 'error', 'logs', 'traceback', 'score'].some(
      (key) => key in record
    );
    if (!hasExecutionEnvelope) {
      return current;
    }
    current = record.result;
  }
  return current;
};

export const extractHttpPreviewBody = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const looksLikeHttpPreview =
    'body' in record &&
    ('statusCode' in record ||
      'headers' in record ||
      'ok' in record ||
      'text' in record ||
      'url' in record);
  return looksLikeHttpPreview ? record.body : value;
};

export const getStringRecordField = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : undefined;
};

export const getActivityInputParams = (activity?: any): Record<string, string> => {
  const params: Record<string, string> = {};
  if (!activity) {
    return params;
  }
  try {
    const config = activity.config as Record<string, any>;
    if (config?.steps && Array.isArray(config.steps) && config.steps.length > 0) {
      config.steps.forEach((step: Record<string, any>) => {
        normalizeActivityInputParams(step?.inputParams).forEach((param) => {
          if (param.key.trim() && !(param.key in params)) {
            params[param.key] = param.value || '';
          }
        });
      });
    }
  } catch (e) {
    // ignore
  }
  return params;
};

export const getActivityInputParamDefinitions = (
  activity?: any
): Record<string, WorkflowInputParamDefinition> => {
  const definitions: Record<string, WorkflowInputParamDefinition> = {};
  if (!activity) {
    return definitions;
  }
  try {
    const config = activity.config as Record<string, any>;
    if (config?.steps && Array.isArray(config.steps) && config.steps.length > 0) {
      config.steps.forEach((step: Record<string, any>) => {
        normalizeActivityInputParams(step?.inputParams).forEach((param) => {
          if (param.key.trim() && !definitions[param.key]) {
            definitions[param.key] = {
              description: '',
              required: param.required,
              defaultValue: param.value || '',
              source: 'inferred_from_template',
            };
          }
        });
      });
    }
  } catch (e) {
    // ignore
  }
  return definitions;
};

export const isHttpRequestActivity = (activity?: any, step?: WorkflowDsl['steps'][number]) =>
  activity?.fn === 'httpRequest' ||
  step?.activityRef === 'builtin:httpRequest' ||
  step?.activityName === 'httpRequest';

export const isStructuredTransformActivity = (
  activity?: any,
  step?: WorkflowDsl['steps'][number]
) =>
  activity?.fn === 'structuredTransform' ||
  activity?.fn === 'aiStructuredTransform' ||
  step?.activityRef === 'builtin:structuredTransform' ||
  step?.activityRef === 'builtin:aiStructuredTransform' ||
  step?.activityName === 'structuredTransform' ||
  step?.activityName === 'aiStructuredTransform';

export const shorten = (text: string, maxLength: number = 80): string => {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + '...';
};

export const syncWorkflowInputParams = (
  prev: WorkflowDsl,
  resolveStepActivity: (step?: WorkflowDsl['steps'][number]) => any
): WorkflowDsl => {
  if (!prev.steps.length) {
    return prev.inputParams && Object.keys(prev.inputParams).length > 0
      ? { ...prev, inputParams: {} }
      : prev;
  }
  const currentDefinitions = prev.inputParams || {};
  if (Object.keys(currentDefinitions).length > 0) {
    return prev;
  }
  const discoveredParams: Record<string, WorkflowInputParamDefinition> = {};

  prev.steps.forEach((step) => {
    const activity = resolveStepActivity(step);
    const activityDefinitions = getActivityInputParamDefinitions(activity);
    const stepInputEntries = getStepInputPublicEntries(step);

    Object.entries(activityDefinitions).forEach(([key, definition]) => {
      const def = definition as WorkflowInputParamDefinition;
      const currentDef = currentDefinitions[key] as WorkflowInputParamDefinition | undefined;
      if (!discoveredParams[key]) {
        discoveredParams[key] = {
          description: currentDef?.description || def.description || '',
          required: currentDef?.required ?? def.required ?? false,
          defaultValue: currentDef?.defaultValue ?? def.defaultValue ?? '',
          localizedDefaultValue: currentDef?.localizedDefaultValue ?? def.localizedDefaultValue,
          localizedVariants: currentDef?.localizedVariants ?? def.localizedVariants,
          source: currentDef?.source ?? def.source,
          type: currentDef?.type ?? def.type,
          exampleValue: currentDef?.exampleValue ?? def.exampleValue,
          displayName: currentDef?.displayName || def.displayName || '',
          groupLabel: currentDef?.groupLabel || def.groupLabel || '',
          paramKind: currentDef?.paramKind ?? def.paramKind,
          arrayPath: currentDef?.arrayPath || def.arrayPath || '',
          fieldName: currentDef?.fieldName || def.fieldName || '',
        };
      }
    });

    stepInputEntries.forEach(([key, value]) => {
      const currentDef = currentDefinitions[key] as WorkflowInputParamDefinition | undefined;
      if (!discoveredParams[key]) {
        discoveredParams[key] = {
          description: currentDef?.description || '',
          required: currentDef?.required ?? false,
          defaultValue:
            typeof value === 'string' ? value : (currentDef?.defaultValue ?? JSON.stringify(value)),
          localizedDefaultValue: currentDef?.localizedDefaultValue,
          localizedVariants: currentDef?.localizedVariants,
          source: currentDef?.source,
          type: currentDef?.type,
          exampleValue: currentDef?.exampleValue,
          displayName: currentDef?.displayName,
          groupLabel: currentDef?.groupLabel,
          paramKind: currentDef?.paramKind ?? (key.includes('[].') ? 'array' : 'scalar'),
          arrayPath:
            currentDef?.arrayPath ?? (key.includes('[].') ? `${key.split('[].')[0]}[]` : ''),
          fieldName:
            currentDef?.fieldName ?? (key.includes('[].') ? key.split('[].')[1] || key : key),
        };
      }
    });

    if (isHttpRequestActivity(activity, step)) {
      const httpVariables = Array.from(
        collectTemplateVariablesFromValue(getStepHttpRequestConfig(step, activity))
      );
      httpVariables.forEach((key) => {
        const currentDef = currentDefinitions[key] as WorkflowInputParamDefinition | undefined;
        if (!discoveredParams[key]) {
          discoveredParams[key] = {
            description: currentDef?.description || '',
            required: currentDef?.required ?? true,
            defaultValue: currentDef?.defaultValue ?? '',
            localizedDefaultValue: currentDef?.localizedDefaultValue,
            localizedVariants: currentDef?.localizedVariants,
            source: currentDef?.source,
            type: currentDef?.type,
            exampleValue: currentDef?.exampleValue,
            displayName: currentDef?.displayName,
            groupLabel: currentDef?.groupLabel,
            paramKind: currentDef?.paramKind ?? (key.includes('[].') ? 'array' : 'scalar'),
            arrayPath:
              currentDef?.arrayPath ?? (key.includes('[].') ? `${key.split('[].')[0]}[]` : ''),
            fieldName:
              currentDef?.fieldName ?? (key.includes('[].') ? key.split('[].')[1] || key : key),
          };
        }
      });
    }

    if (isStructuredTransformActivity(activity, step)) {
      const stVariables = Array.from(
        collectTemplateVariablesFromValue(getStepStructuredTransformConfig(step, activity))
      );
      stVariables.forEach((key) => {
        const currentDef = currentDefinitions[key] as WorkflowInputParamDefinition | undefined;
        if (!discoveredParams[key]) {
          discoveredParams[key] = {
            description: currentDef?.description || '',
            required: currentDef?.required ?? true,
            defaultValue: currentDef?.defaultValue ?? '',
            localizedDefaultValue: currentDef?.localizedDefaultValue,
            localizedVariants: currentDef?.localizedVariants,
            source: currentDef?.source,
            type: currentDef?.type,
            exampleValue: currentDef?.exampleValue,
            displayName: currentDef?.displayName,
            groupLabel: currentDef?.groupLabel,
            paramKind: currentDef?.paramKind ?? (key.includes('[].') ? 'array' : 'scalar'),
            arrayPath:
              currentDef?.arrayPath ?? (key.includes('[].') ? `${key.split('[].')[0]}[]` : ''),
            fieldName:
              currentDef?.fieldName ?? (key.includes('[].') ? key.split('[].')[1] || key : key),
          };
        }
      });
    }
  });

  const mergedParams = { ...discoveredParams };
  Object.entries(currentDefinitions).forEach(([key, definition]) => {
    if (!mergedParams[key]) {
      mergedParams[key] = definition;
    }
  });

  if (JSON.stringify(currentDefinitions) === JSON.stringify(mergedParams)) {
    return prev;
  }

  return {
    ...prev,
    inputParams: mergedParams,
  };
};

export const getStructuredTransformIssues = (
  selectedStep: any,
  selectedStepActivity: any,
  selectedStepIndexForConfig: number | null,
  selectedStepStructuredTransformConfig: Record<string, any>,
  steps: WorkflowDsl['steps'],
  resolveStepActivity: (step?: WorkflowDsl['steps'][number]) => any
): string[] => {
  if (!selectedStep || !isStructuredTransformActivity(selectedStepActivity, selectedStep)) {
    return [];
  }

  const issues: string[] = [];
  const isAiTransform = selectedStep.activityRef === 'builtin:aiStructuredTransform';
  const outputMode = String(selectedStepStructuredTransformConfig.outputMode || 'json')
    .trim()
    .toLowerCase();
  const outputSchema = asPlainRecord(selectedStepStructuredTransformConfig.outputSchema);
  const fieldMappings = asPlainRecord(selectedStepStructuredTransformConfig.fieldMappings);
  const blankMappingKeys = Object.entries(fieldMappings)
    .filter(([key, value]) => String(key || '').trim() && !String(value ?? '').trim())
    .map(([key]) => String(key));

  if (!isAiTransform && blankMappingKeys.length > 0) {
    issues.push(
      `fieldMappings 中存在空映射字段: ${blankMappingKeys.join('、')}。这会导致运行时把整块结果对象回填到该字段。`
    );
  }

  if (!isAiTransform && outputMode === 'json') {
    const unmappedSchemaKeys = Object.keys(outputSchema).filter(
      (key) => !String(fieldMappings[key] ?? '').trim()
    );
    if (unmappedSchemaKeys.length > 0) {
      issues.push(`outputSchema 中这些字段还没有对应映射: ${unmappedSchemaKeys.join('、')}。`);
    }
  }

  const previousStep =
    selectedStepIndexForConfig !== null && selectedStepIndexForConfig > 0
      ? steps[selectedStepIndexForConfig - 1]
      : undefined;
  const previousActivity = resolveStepActivity(previousStep);
  if (previousStep && isHttpRequestActivity(previousActivity, previousStep)) {
    const previousHttpConfig = getStepHttpRequestConfig(previousStep, previousActivity);
    const responseMode = String(previousHttpConfig.responseMode || 'body').trim();
    const availableAliases = new Set(
      Object.keys(asPlainRecord(previousHttpConfig.responseFieldMappings))
        .map((key) => String(key || '').trim())
        .filter(Boolean)
    );

    if (responseMode === 'bodyMap' && availableAliases.size === 0) {
      issues.push('上一步 httpRequest 使用了 bodyMap，但 responseFieldMappings 为空。');
    }

    if (responseMode === 'bodyMap') {
      const invalidFieldMappings = Object.entries(fieldMappings)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => ({
          key: String(key || '').trim(),
          value: String(value || '').trim(),
        }))
        .filter(
          (item) =>
            item.value &&
            item.value.includes('.') &&
            !item.value.startsWith('context.') &&
            !availableAliases.has(item.value)
        )
        .map((item) => `${item.key}<-${item.value}`);
      if (invalidFieldMappings.length > 0) {
        issues.push(
          `当前 fieldMappings 仍引用了上游原始路径，而不是 bodyMap 别名: ${invalidFieldMappings.join('、')}。`
        );
      }

      const rawPathPlaceholders = extractTemplatePlaceholders(
        String(selectedStepStructuredTransformConfig.textTemplate || '')
      ).filter(
        (item) => item.includes('.') && !item.startsWith('context.') && !availableAliases.has(item)
      );
      if (rawPathPlaceholders.length > 0) {
        issues.push(`textTemplate 仍引用了上游原始路径占位符: ${rawPathPlaceholders.join('、')}。`);
      }
    }
  }

  const contextKeys = collectContextReferenceKeys(fieldMappings);
  if (
    contextKeys.length > 0 &&
    !hasUsableContextTemplate(selectedStepStructuredTransformConfig.contextTemplate)
  ) {
    issues.push(
      `fieldMappings 使用了 context.* 字段，但 contextTemplate 仍为空: ${contextKeys.join('、')}。`
    );
  }

  return issues;
};

export const hydrateWorkflowDslForEditor = async (
  rawWorkflowDsl: WorkflowDsl,
  rawActivityDsl: ActivityDsl
): Promise<WorkflowDsl> => {
  let nextWorkflowDsl = withNormalizedWorkflowInputParams(rawWorkflowDsl, rawActivityDsl);
  const sourceContextType = String(nextWorkflowDsl.sourceContext?.sourceType || '').trim();
  const sourceTemplateId = String(
    nextWorkflowDsl.sourceContext?.sourceTemplate?.templateId || ''
  ).trim();
  const shouldBackfillTemplateMetadata =
    sourceContextType === 'template' &&
    Boolean(sourceTemplateId) &&
    Object.values(nextWorkflowDsl.inputParams || {}).some(
      (param) => !Array.isArray(param.localizedVariants) || param.localizedVariants.length === 0
    );

  if (shouldBackfillTemplateMetadata) {
    try {
      const latestTemplateDraft = await temporalWorkflowApi.generateTemplateDraft(sourceTemplateId);
      nextWorkflowDsl = {
        ...nextWorkflowDsl,
        inputParams: mergeWorkflowInputParamMaps(
          nextWorkflowDsl.inputParams,
          latestTemplateDraft.workflowDsl.inputParams
        ),
        sourceContext:
          nextWorkflowDsl.sourceContext || latestTemplateDraft.workflowDsl.sourceContext,
      };
    } catch (error) {
      // Keep editing usable even if template metadata backfill fails.
    }
  }

  const sourceSkillId = String(nextWorkflowDsl.sourceContext?.sourceTemplate?.skillId || '').trim();
  if (
    sourceSkillId &&
    !Object.values(nextWorkflowDsl.inputParams || {}).some((param) =>
      String(param.groupLabel || '').trim()
    )
  ) {
    try {
      const sourceSkill = await carboneAPI.getSkill(sourceSkillId);
      nextWorkflowDsl = {
        ...nextWorkflowDsl,
        inputParams: enrichWorkflowInputParamsWithSkill(nextWorkflowDsl.inputParams, sourceSkill),
      };
    } catch (error) {
      // Keep editor usable even if skill enrichment fails.
    }
  }

  return nextWorkflowDsl;
};
