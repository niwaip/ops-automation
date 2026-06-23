import {
  WorkflowDsl,
  ActivityDsl,
  TemporalWorkflowSourceTemplate,
  TemporalWorkflowSourceContext,
  WorkflowInputParamDefinition,
} from '@/api/temporal';
import { CarboneSkill } from '@/api/carbone';
import type { DurationUnit } from './TemporalPage.types';
import {
  DEFAULT_DURATION_UNIT,
  PARAMETER_DESCRIPTION_PREVIEW_LIMIT,
} from './TemporalPage.constants';

export const beautifyText = (text: string, useDivider = true): string => {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n\s*\n\s*\n+/g, useDivider ? '\n\n---\n\n' : '\n\n')
    .replace(/^[\s\n]+|[\s\n]+$/g, '');
};

export const truncateText = (
  text: string,
  maxLength = PARAMETER_DESCRIPTION_PREVIEW_LIMIT
): string => {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

export const parseDurationValue = (duration?: string): { value?: number; unit: DurationUnit } => {
  if (!duration) {
    return { value: undefined, unit: DEFAULT_DURATION_UNIT };
  }
  const trimmed = duration.trim();
  const explicitMatch = trimmed.match(/^(\d+)\s*([smh])$/i);
  if (explicitMatch) {
    return {
      value: Number(explicitMatch[1]),
      unit: explicitMatch[2].toLowerCase() as DurationUnit,
    };
  }
  const numberOnly = trimmed.match(/^(\d+)$/);
  if (numberOnly) {
    return {
      value: Number(numberOnly[1]),
      unit: DEFAULT_DURATION_UNIT,
    };
  }
  return { value: undefined, unit: DEFAULT_DURATION_UNIT };
};

export const formatDurationValue = (
  value?: number | null,
  unit: DurationUnit = DEFAULT_DURATION_UNIT
): string | undefined => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return undefined;
  }
  return `${Math.max(0, Number(value))}${unit}`;
};

export const resolveApiErrorMessage = (error: any, fallback = '请求失败'): string => {
  const responseData = error?.response?.data;
  const messageText =
    typeof responseData?.message === 'string'
      ? responseData.message
      : typeof error?.message === 'string'
        ? error.message
        : fallback;
  const codeText =
    typeof responseData?.code === 'string'
      ? responseData.code
      : typeof responseData?.error === 'string'
        ? responseData.error
        : '';
  return codeText ? `${messageText} (${codeText})` : messageText;
};

export const deriveWorkflowSourceTemplate = (
  workflowDsl?: WorkflowDsl | null,
  activityDsl?: ActivityDsl | null
): TemporalWorkflowSourceTemplate | null => {
  const workflowDslRecord = workflowDsl as unknown as Record<string, unknown> | undefined;
  const workflowSource =
    workflowDslRecord && typeof workflowDslRecord.sourceTemplate === 'object'
      ? (workflowDsl as unknown as { sourceTemplate?: TemporalWorkflowSourceTemplate })
          .sourceTemplate
      : undefined;
  const workflowSourceContext =
    workflowDslRecord && typeof workflowDslRecord.sourceContext === 'object'
      ? (workflowDsl as unknown as { sourceContext?: TemporalWorkflowSourceContext }).sourceContext
      : undefined;
  const workflowSourceTemplate = workflowSourceContext?.sourceTemplate;
  const activities = Array.isArray(activityDsl?.activities) ? activityDsl.activities : [];
  const carboneActivity = activities.find((activity) => {
    if (activity?.handler === 'carbone') {
      return true;
    }
    const steps = Array.isArray(activity?.config?.steps) ? activity.config.steps : [];
    return steps.some((step: Record<string, any>) => step?.type === 'carbone');
  });
  const carboneStep = Array.isArray(carboneActivity?.config?.steps)
    ? carboneActivity?.config?.steps.find((step: Record<string, any>) => step?.type === 'carbone')
    : null;
  const sourceTemplate: TemporalWorkflowSourceTemplate = {
    templateId:
      workflowSource?.templateId ||
      workflowSourceTemplate?.templateId ||
      carboneStep?.config?.templateId ||
      carboneActivity?.config?.templateId,
    skillId:
      workflowSource?.skillId ||
      workflowSourceTemplate?.skillId ||
      carboneActivity?.config?.skillId ||
      undefined,
    fileName:
      workflowSource?.fileName ||
      workflowSourceTemplate?.fileName ||
      carboneActivity?.config?.fileName ||
      undefined,
    format:
      workflowSource?.format ||
      workflowSourceTemplate?.format ||
      carboneStep?.config?.format ||
      carboneActivity?.config?.format ||
      undefined,
    variableCount:
      workflowSource?.variableCount ||
      workflowSourceTemplate?.variableCount ||
      carboneActivity?.config?.variableCount ||
      Object.keys(workflowDsl?.inputParams || {}).length ||
      undefined,
  };
  if (!sourceTemplate.templateId && !sourceTemplate.skillId && !sourceTemplate.fileName) {
    return null;
  }
  return sourceTemplate;
};

export const deriveWorkflowSourceContext = (
  workflowDsl?: WorkflowDsl | null,
  activityDsl?: ActivityDsl | null
): TemporalWorkflowSourceContext | null => {
  const workflowDslRecord = workflowDsl as unknown as Record<string, unknown> | undefined;
  const workflowSourceContext =
    workflowDslRecord && typeof workflowDslRecord.sourceContext === 'object'
      ? (workflowDsl as unknown as { sourceContext?: TemporalWorkflowSourceContext }).sourceContext
      : undefined;
  const sourceTemplate = deriveWorkflowSourceTemplate(workflowDsl, activityDsl);
  if (
    !workflowSourceContext?.sourceType &&
    !workflowSourceContext?.referenceUrl &&
    !workflowSourceContext?.userDescription &&
    !workflowSourceContext?.generatedAt &&
    !workflowSourceContext?.warnings?.length &&
    !sourceTemplate
  ) {
    return null;
  }
  return {
    ...workflowSourceContext,
    sourceType: workflowSourceContext?.sourceType || (sourceTemplate ? 'template' : undefined),
    sourceTemplate: workflowSourceContext?.sourceTemplate || sourceTemplate,
  };
};

export const buildWorkflowDraftSignature = (
  workflowDsl: WorkflowDsl,
  activityDsl: ActivityDsl,
  workflowName?: string
): string =>
  JSON.stringify({
    workflowDsl: {
      ...workflowDsl,
      name: workflowName || workflowDsl.name || '',
    },
    activityDsl,
  });

export const asPlainRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

export const getStepInputPublicEntries = (
  step?: WorkflowDsl['steps'][number]
): Array<[string, any]> =>
  Object.entries(step?.input || {}).filter(([key]) => key !== 'timeout' && !key.startsWith('__'));

export const collectTemplateVariablesFromValue = (
  value: unknown,
  target: Set<string> = new Set<string>()
): Set<string> => {
  if (typeof value === 'string') {
    Array.from(value.matchAll(/\{([^{}]+)\}/g)).forEach((match) => {
      const variable = String(match[1] || '').trim();
      if (variable) {
        target.add(variable);
      }
    });
    return target;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTemplateVariablesFromValue(item, target));
    return target;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectTemplateVariablesFromValue(item, target)
    );
  }
  return target;
};

export const normalizeWorkflowInputParamMap = (
  inputParams?: Record<string, WorkflowInputParamDefinition>
): Record<string, WorkflowInputParamDefinition> => {
  if (!inputParams || typeof inputParams !== 'object') {
    return {};
  }
  return Object.entries(inputParams).reduce<Record<string, WorkflowInputParamDefinition>>(
    (acc, [rawKey, value]) => {
      const key = String(rawKey || '').trim();
      if (!key) {
        return acc;
      }
      acc[key] = {
        description: typeof value?.description === 'string' ? value.description : '',
        required: value?.required === true,
        defaultValue:
          value?.defaultValue === undefined || value?.defaultValue === null
            ? ''
            : String(value.defaultValue),
        source: value?.source,
        type: value?.type,
        exampleValue: value?.exampleValue,
        displayName: typeof value?.displayName === 'string' ? value.displayName : '',
        groupLabel: typeof value?.groupLabel === 'string' ? value.groupLabel : '',
        paramKind: value?.paramKind,
        arrayPath: typeof value?.arrayPath === 'string' ? value.arrayPath : '',
        fieldName: typeof value?.fieldName === 'string' ? value.fieldName : '',
      };
      return acc;
    },
    {}
  );
};

export const normalizeActivityInputParams = (
  inputParams: unknown
): Array<{ key: string; value: string; required: boolean }> => {
  if (!inputParams) {
    return [];
  }
  if (Array.isArray(inputParams)) {
    return inputParams.map((item: any) => ({
      key: item?.key || '',
      value: item?.value || '',
      required: Boolean(item?.required),
    }));
  }
  if (typeof inputParams === 'object') {
    return Object.entries(inputParams as Record<string, any>).map(([key, value]) => ({
      key,
      value: value || '',
      required: !value,
    }));
  }
  return [];
};

export const buildWorkflowInputParamsFromActivityDsl = (
  activityDsl?: ActivityDsl
): Record<string, WorkflowInputParamDefinition> => {
  const merged: Record<string, WorkflowInputParamDefinition> = {};
  (activityDsl?.activities || []).forEach((activity) => {
    const config = activity?.config as Record<string, any> | undefined;
    const steps = Array.isArray(config?.steps) ? config.steps : [];
    steps.forEach((step) => {
      normalizeActivityInputParams((step as Record<string, any>)?.inputParams).forEach((param) => {
        const key = String(param.key || '').trim();
        if (!key || merged[key]) {
          return;
        }
        merged[key] = {
          description: '',
          required: param.required,
          defaultValue: param.value || '',
          paramKind: key.includes('[].') ? 'array' : 'scalar',
          arrayPath: key.includes('[].') ? String(key).split('[].')[0] + '[]' : '',
          fieldName: key.includes('[].') ? String(key).split('[].')[1] || key : key,
        };
      });
    });
  });
  return merged;
};

export const mergeWorkflowInputParamMaps = (
  preferred?: Record<string, WorkflowInputParamDefinition>,
  fallback?: Record<string, WorkflowInputParamDefinition>
): Record<string, WorkflowInputParamDefinition> => {
  const base = normalizeWorkflowInputParamMap(fallback);
  const overlay = normalizeWorkflowInputParamMap(preferred);
  const mergedKeys = Array.from(new Set([...Object.keys(base), ...Object.keys(overlay)]));
  return mergedKeys.reduce<Record<string, WorkflowInputParamDefinition>>((acc, key) => {
    const fallbackValue = base[key] || {};
    const preferredValue = overlay[key] || {};
    acc[key] = {
      ...fallbackValue,
      ...preferredValue,
      description: preferredValue.description || fallbackValue.description || '',
      required: preferredValue.required ?? fallbackValue.required ?? false,
      defaultValue: preferredValue.defaultValue ?? fallbackValue.defaultValue ?? '',
      source: preferredValue.source ?? fallbackValue.source,
      type: preferredValue.type ?? fallbackValue.type,
      exampleValue: preferredValue.exampleValue ?? fallbackValue.exampleValue,
      displayName: preferredValue.displayName || fallbackValue.displayName || '',
      groupLabel: preferredValue.groupLabel || fallbackValue.groupLabel || '',
      paramKind: preferredValue.paramKind ?? fallbackValue.paramKind,
      arrayPath: preferredValue.arrayPath || fallbackValue.arrayPath || '',
      fieldName: preferredValue.fieldName || fallbackValue.fieldName || '',
    };
    return acc;
  }, {});
};

export const withNormalizedWorkflowInputParams = (
  workflowDsl: WorkflowDsl,
  activityDsl?: ActivityDsl
): WorkflowDsl => {
  const mergedInputParams = mergeWorkflowInputParamMaps(
    workflowDsl?.inputParams,
    buildWorkflowInputParamsFromActivityDsl(activityDsl)
  );
  if (Object.keys(mergedInputParams).length === 0) {
    return workflowDsl.inputParams ? { ...workflowDsl, inputParams: {} } : workflowDsl;
  }
  return {
    ...workflowDsl,
    inputParams: mergedInputParams,
  };
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
  skill?: CarboneSkill | null
): Record<string, Partial<WorkflowInputParamDefinition>> => {
  const parameters = Array.isArray(skill?.parameters) ? skill.parameters : [];
  return parameters.reduce<Record<string, Partial<WorkflowInputParamDefinition>>>(
    (acc, rawParameter) => {
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
    },
    {}
  );
};

export const enrichWorkflowInputParamsWithSkill = (
  inputParams?: Record<string, WorkflowInputParamDefinition>,
  skill?: CarboneSkill | null
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
