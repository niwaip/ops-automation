import {
  WorkflowDsl,
  ActivityDsl,
  TemporalWorkflowSourceTemplate,
  TemporalWorkflowSourceContext,
  WorkflowInputParamDefinition,
} from '@/api/temporal';
import {
  DurationUnit,
  DEFAULT_DURATION_UNIT,
  HttpResponseMode,
} from './types';

export const parseDurationValue = (
  duration?: string
): { value?: number; unit: DurationUnit } => {
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

export const beautifyText = (text: string, useDivider = true): string => {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n\s*\n\s*\n+/g, useDivider ? '\n\n---\n\n' : '\n\n')
    .replace(/^[\s\n]+|[\s\n]+$/g, '');
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
                .filter(
                  (item): item is string | number => item !== undefined && item !== ''
                )
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
