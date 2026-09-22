import type {
  ActivityDsl,
  TemporalWorkflowSourceContext,
  TemporalWorkflowSourceTemplate,
  WorkflowDsl,
  WorkflowInputParamDefinition,
} from '@/api/temporal';
import React from 'react';

export type HttpResponseMode = 'body' | 'full' | 'bodyPath' | 'bodyMap';
export type DurationUnit = 's' | 'm' | 'h';

export interface HttpRequestStepConfig {
  method?: string;
  urlTemplate?: string;
  queryTemplate?: Record<string, string>;
  headersTemplate?: Record<string, string>;
  jsonTemplate?: Record<string, string>;
  dataTemplate?: Record<string, string>;
  timeout?: number;
  responseMode?: HttpResponseMode;
  responseBodyPath?: string;
  responseFieldMappings?: Record<string, string>;
}

export type StructuredTransformContentType = 'text' | 'html' | 'json';
export type StructuredTransformOutputMode = 'json' | 'text';

export interface StructuredTransformStepConfig {
  contentType?: StructuredTransformContentType;
  contentTemplate?: string;
  instructionTemplate?: string;
  outputMode?: StructuredTransformOutputMode;
  outputSchema?: Record<string, any>;
  contextTemplate?: string;
  fieldMappings?: Record<string, string>;
  textTemplate?: string;
}

export const DEFAULT_DURATION_UNIT: DurationUnit = 's';
export const DURATION_UNITS: Array<{ label: string; value: DurationUnit }> = [
  { label: '秒(s)', value: 's' },
  { label: '分(m)', value: 'm' },
  { label: '时(h)', value: 'h' },
];

export type StepDurationField =
  | 'startToCloseTimeout'
  | 'scheduleToCloseTimeout'
  | 'heartbeatTimeout';

export const STEP_DURATION_DEFAULTS: Record<StepDurationField, string> = {
  startToCloseTimeout: '60s',
  scheduleToCloseTimeout: '5m',
  heartbeatTimeout: '30s',
};

export const STEP_DURATION_FIELD_DEFAULTS: Record<string, string> = {
  startToCloseTimeout: '60s',
  scheduleToCloseTimeout: '5m',
  heartbeatTimeout: '30s',
};

export const DURATION_INPUT_WIDTH = 64;
export const DURATION_SEGMENTED_WIDTH = 78;
export const COLLAPSED_SIDEBAR_WIDTH = 44;
export const RESOURCE_SIDEBAR_WIDTH = 260;

export const SECTION_CARD_STYLE: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid var(--bg-secondary)',
  boxShadow: 'var(--shadow-md)',
};

export const SECTION_CARD_BODY_STYLE: React.CSSProperties = {
  padding: 14,
};

export const SOFT_PANEL_STYLE: React.CSSProperties = {
  border: '1px solid var(--bg-secondary)',
  padding: 12,
  borderRadius: 10,
  background: 'var(--bg-card)',
};

export const CONFIG_SECTION_STYLE: React.CSSProperties = {
  border: '1px solid var(--bg-secondary)',
  borderRadius: 10,
  background: 'var(--bg-card)',
  padding: 12,
  marginBottom: 12,
};

export const TWO_COLUMN_GRID_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
};

export const DEFAULT_HTTP_REQUEST_STEP_CONFIG: HttpRequestStepConfig = {
  method: 'GET',
  urlTemplate: '',
  queryTemplate: {},
  headersTemplate: {},
  jsonTemplate: {},
  dataTemplate: {},
  timeout: 30,
  responseMode: 'body',
  responseBodyPath: '',
  responseFieldMappings: {},
};

export const getStepHttpRequestConfig = (
  step?: WorkflowDsl['steps'][number],
  activity?: any
): HttpRequestStepConfig => {
  const activityDefaults = asPlainRecord(activity?.config?.defaultStepConfig);
  const stepInput = asPlainRecord(step?.input);
  const rawConfig = asPlainRecord(stepInput[HTTP_REQUEST_STEP_CONFIG_KEY]);
  return {
    ...DEFAULT_HTTP_REQUEST_STEP_CONFIG,
    ...activityDefaults,
    ...rawConfig,
    queryTemplate: {
      ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.queryTemplate),
      ...asPlainRecord(activityDefaults.queryTemplate),
      ...asPlainRecord(rawConfig.queryTemplate),
    },
    headersTemplate: {
      ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.headersTemplate),
      ...asPlainRecord(activityDefaults.headersTemplate),
      ...asPlainRecord(rawConfig.headersTemplate),
    },
    jsonTemplate: {
      ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.jsonTemplate),
      ...asPlainRecord(activityDefaults.jsonTemplate),
      ...asPlainRecord(rawConfig.jsonTemplate),
    },
    dataTemplate: {
      ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.dataTemplate),
      ...asPlainRecord(activityDefaults.dataTemplate),
      ...asPlainRecord(rawConfig.dataTemplate),
    },
    responseFieldMappings: {
      ...asPlainRecord(DEFAULT_HTTP_REQUEST_STEP_CONFIG.responseFieldMappings),
      ...asPlainRecord(activityDefaults.responseFieldMappings),
      ...asPlainRecord(rawConfig.responseFieldMappings),
    },
  };
};

export const getStepStructuredTransformConfig = (
  step?: WorkflowDsl['steps'][number],
  activity?: any
): StructuredTransformStepConfig => {
  const activityDefaults = asPlainRecord(activity?.config?.defaultStepConfig);
  const stepInput = asPlainRecord(step?.input);
  const rawConfig = asPlainRecord(stepInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]);
  return {
    ...DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG,
    ...activityDefaults,
    ...rawConfig,
    outputSchema:
      rawConfig.outputSchema && typeof rawConfig.outputSchema === 'object'
        ? rawConfig.outputSchema
        : activityDefaults.outputSchema && typeof activityDefaults.outputSchema === 'object'
          ? activityDefaults.outputSchema
          : DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG.outputSchema,
    fieldMappings: {
      ...asPlainRecord(DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG.fieldMappings),
      ...asPlainRecord(activityDefaults.fieldMappings),
      ...asPlainRecord(rawConfig.fieldMappings),
    },
  };
};

export const HTTP_REQUEST_STEP_CONFIG_KEY = '__httpRequest';
export const STRUCTURED_TRANSFORM_STEP_CONFIG_KEY = '__structuredTransform';

export const DEFAULT_STRUCTURED_TRANSFORM_STEP_CONFIG: StructuredTransformStepConfig = {
  contentType: 'text',
  contentTemplate: '',
  instructionTemplate: '',
  outputMode: 'json',
  outputSchema: {},
  contextTemplate: '',
  fieldMappings: {},
  textTemplate: '',
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

export const beautifyText = (text: string, useDivider = true): string => {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n\s*\n\s*\n+/g, useDivider ? '\n\n---\n\n' : '\n\n')
    .replace(/^[\s\n]+|[\s\n]+$/g, '');
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

export const resolveApiErrorMessage = (error: unknown, fallback = '请求失败'): string => {
  const errorRecord =
    typeof error === 'object' && error !== null
      ? (error as {
          message?: unknown;
          response?: {
            data?: {
              message?: unknown;
              code?: unknown;
              error?: unknown;
            };
          };
        })
      : undefined;
  const responseData = errorRecord?.response?.data;
  const messageText =
    typeof responseData?.message === 'string'
      ? responseData.message
      : typeof errorRecord?.message === 'string'
        ? errorRecord.message
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
  const carboneActivity = activities.find((activity: any) => {
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
      const localizedDefaultValue =
        value?.localizedDefaultValue && typeof value.localizedDefaultValue === 'object'
          ? Object.entries(value.localizedDefaultValue).reduce<
              Record<string, string | number | boolean>
            >((map, [lang, langValue]) => {
              const normalizedLang = String(lang || '').trim();
              if (
                !normalizedLang ||
                langValue === undefined ||
                langValue === null ||
                String(langValue).trim() === ''
              ) {
                return map;
              }
              map[normalizedLang] = typeof langValue === 'string' ? langValue : langValue;
              return map;
            }, {})
          : undefined;
      const renderPath =
        typeof value?.renderPath === 'string' && value.renderPath.trim()
          ? value.renderPath.trim()
          : Array.isArray(value?.renderPath)
            ? value.renderPath.map((item) => String(item || '').trim()).filter(Boolean)
            : undefined;
      const enumValues = Array.isArray(value?.enum)
        ? Array.from(
            new Map(
              value.enum
                .map((item) =>
                  typeof item === 'string'
                    ? item.trim()
                    : typeof item === 'number' && Number.isFinite(item)
                      ? item
                      : undefined
                )
                .filter((item): item is string | number => item !== undefined && item !== '')
                .map((item) => [`${typeof item}:${String(item)}`, item])
            ).values()
          )
        : undefined;
      acc[key] = {
        description: typeof value?.description === 'string' ? value.description : '',
        required: value?.required === true,
        defaultValue:
          value?.defaultValue === undefined || value?.defaultValue === null
            ? ''
            : value.type === 'number' || value.type === 'integer'
              ? Number.isFinite(Number(value.defaultValue))
                ? Number(value.defaultValue)
                : value.defaultValue
              : typeof value.defaultValue === 'boolean'
                ? value.defaultValue
                : String(value.defaultValue),
        enum: enumValues && enumValues.length > 0 ? enumValues : undefined,
        localizedDefaultValue:
          localizedDefaultValue && Object.keys(localizedDefaultValue).length > 0
            ? localizedDefaultValue
            : undefined,
        localizedVariants: Array.isArray(value?.localizedVariants)
          ? (() => {
              const normalizedVariants = value.localizedVariants
                .map((lang) => String(lang || '').trim())
                .filter(Boolean);
              return normalizedVariants.length > 0 ? normalizedVariants : undefined;
            })()
          : undefined,
        source: value?.source,
        type: value?.type,
        exampleValue: value?.exampleValue,
        displayName: typeof value?.displayName === 'string' ? value.displayName : '',
        groupLabel: typeof value?.groupLabel === 'string' ? value.groupLabel : '',
        paramKind: value?.paramKind,
        arrayPath: typeof value?.arrayPath === 'string' ? value.arrayPath : '',
        fieldName: typeof value?.fieldName === 'string' ? value.fieldName : '',
        renderPath: renderPath && renderPath.length > 0 ? renderPath : undefined,
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
      enum: preferredValue.enum ?? fallbackValue.enum,
      localizedDefaultValue:
        preferredValue.localizedDefaultValue ?? fallbackValue.localizedDefaultValue,
      localizedVariants: preferredValue.localizedVariants ?? fallbackValue.localizedVariants,
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
  const hasDeclaredInputs =
    !!workflowDsl?.inputParams && Object.keys(workflowDsl.inputParams).length > 0;
  const mergedInputParams = hasDeclaredInputs
    ? normalizeWorkflowInputParamMap(workflowDsl.inputParams)
    : mergeWorkflowInputParamMaps(
        workflowDsl?.inputParams,
        buildWorkflowInputParamsFromActivityDsl(activityDsl)
      );
  if (Object.keys(mergedInputParams).length === 0) {
    return workflowDsl.inputParams ? { ...workflowDsl, inputParams: {} } : workflowDsl;
  }
  const policyParams = workflowDsl.inputPolicy?.params || {};
  const hydratedInputParams = Object.entries(mergedInputParams).reduce<
    Record<string, WorkflowInputParamDefinition>
  >((acc, [key, definition]) => {
    const policy = policyParams[key];
    const policyDefaultValue = policy?.defaultValue;
    const required = policy?.requiredMode
      ? policy.requiredMode !== 'optional'
      : definition.required;
    if (
      policyDefaultValue &&
      typeof policyDefaultValue === 'object' &&
      !Array.isArray(policyDefaultValue)
    ) {
      const localizedDefaultValue = Object.entries(policyDefaultValue).reduce<
        Record<string, string | number | boolean>
      >((map, [lang, value]) => {
        const normalizedLang = String(lang || '').trim();
        if (
          !normalizedLang ||
          value === undefined ||
          value === null ||
          String(value).trim() === ''
        ) {
          return map;
        }
        map[normalizedLang] = value as string | number | boolean;
        return map;
      }, {});
      acc[key] = {
        ...definition,
        required,
        defaultValue: '',
        localizedDefaultValue:
          Object.keys(localizedDefaultValue).length > 0
            ? localizedDefaultValue
            : definition.localizedDefaultValue,
      };
      return acc;
    }
    if (
      policyDefaultValue !== undefined &&
      policyDefaultValue !== null &&
      String(policyDefaultValue).trim() !== ''
    ) {
      acc[key] = {
        ...definition,
        required,
        defaultValue:
          definition.type === 'number' || definition.type === 'integer'
            ? Number.isFinite(Number(policyDefaultValue))
              ? Number(policyDefaultValue)
              : String(policyDefaultValue)
            : typeof policyDefaultValue === 'boolean'
              ? policyDefaultValue
              : String(policyDefaultValue),
        localizedDefaultValue: undefined,
      };
      return acc;
    }
    acc[key] = {
      ...definition,
      required,
    };
    return acc;
  }, {});
  return {
    ...workflowDsl,
    inputParams: hydratedInputParams,
  };
};
