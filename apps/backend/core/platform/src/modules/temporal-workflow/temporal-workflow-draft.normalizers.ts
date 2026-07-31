import {
  HTTP_REQUEST_STEP_CONFIG_KEY,
  STRUCTURED_TRANSFORM_STEP_CONFIG_KEY,
} from './builtin-activity.registry';
import type {
  WorkflowDsl,
  WorkflowInputParamDefinition,
  WorkflowInputParamType,
  WorkflowStep,
} from './temporal-workflow.types';

type PickFirstNonEmptyString = (...values: unknown[]) => string | undefined;
type BuildWorkflowSemanticHint = (...values: unknown[]) => string;
type CollectTemplateVariables = (value: unknown, target?: Set<string>) => Set<string>;
type NormalizeWorkflowInputRenderPath = (
  renderPath: string | string[] | undefined
) => string | string[] | undefined;
type SanitizeJsonValue = <T>(value: T) => T;
type NormalizeStructuredTransformConfig = (
  config: Record<string, any>,
  placeholderKeys?: Set<string>
) => Record<string, any>;

const defaultPickFirstNonEmptyString: PickFirstNonEmptyString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

export function extractValueByPath(value: unknown, path: string): unknown {
  const normalizedPath = String(path || '')
    .trim()
    .replace(/^body\./, '');
  if (!normalizedPath) {
    return value;
  }

  return normalizedPath.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    const key = String(segment || '').trim();
    if (!key) {
      return current;
    }
    if (Array.isArray(current)) {
      const index = Number(key);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

export function buildPlaceholderValueFromSchemaHint(
  schemaHint: unknown,
  fieldName: string
): unknown {
  const hint = String(schemaHint || '').toLowerCase();
  if (/(number|int|float|double|decimal)/.test(hint)) {
    return 0;
  }
  if (/(bool|boolean)/.test(hint)) {
    return false;
  }
  if (/(array|\[\])/.test(hint)) {
    return [];
  }
  if (/(object|map|dict)/.test(hint)) {
    return {};
  }
  return `${fieldName}_sample`;
}

export function buildGenericAiDraftSampleValue(args: {
  key: string;
  description?: string;
  referenceUrl: string;
  buildWorkflowSemanticHint: BuildWorkflowSemanticHint;
}): string | number | boolean {
  const { key, description, referenceUrl, buildWorkflowSemanticHint } = args;
  const hint = buildWorkflowSemanticHint(key, description);
  const normalizedKey =
    String(key || '')
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'value';
  if (/\b(url|uri|link)\b|网址|链接/.test(hint)) {
    return referenceUrl || `https://example.com/${normalizedKey}`;
  }
  if (/\b(bool|boolean)\b|启用|是否/.test(hint)) {
    return true;
  }
  if (
    /\b(number|int|float|double|decimal|count|size|limit|page|offset|age)\b|数量|页码|大小|编号/.test(
      hint
    )
  ) {
    return 1;
  }
  if (/\b(date|day|time|datetime)\b|时间|日期/.test(hint)) {
    return new Date().toISOString().slice(0, 10);
  }
  return `sample_${normalizedKey}`;
}

export function extractAiDraftSampleValuesFromReferenceUrl(
  referenceUrl: string,
  steps: Array<{ activityRef?: unknown; input?: unknown }>,
  pickFirstNonEmptyString: PickFirstNonEmptyString = defaultPickFirstNonEmptyString
): Record<string, string> {
  const resolved: Record<string, string> = {};
  const targetUrl = String(referenceUrl || '').trim();
  if (!targetUrl) {
    return resolved;
  }

  let actualUrl: URL;
  try {
    actualUrl = new URL(targetUrl);
  } catch {
    return resolved;
  }

  for (const step of steps || []) {
    const activityRef = pickFirstNonEmptyString(step?.activityRef);
    if (activityRef !== 'builtin:httpRequest') {
      continue;
    }
    const stepInput =
      step?.input && typeof step.input === 'object' && !Array.isArray(step.input)
        ? (step.input as Record<string, any>)
        : {};
    const httpConfig = stepInput[HTTP_REQUEST_STEP_CONFIG_KEY];
    if (!httpConfig || typeof httpConfig !== 'object' || Array.isArray(httpConfig)) {
      continue;
    }

    const urlTemplate = String(httpConfig.urlTemplate || '').trim();
    try {
      const templateUrl = new URL(urlTemplate.replace(/\{[^{}]+\}/g, '__placeholder__'));
      if (templateUrl.origin === actualUrl.origin) {
        const templatePath =
          urlTemplate.replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/[^/]+/, '').split('?')[0] || '/';
        const templateSegments = templatePath
          .split('/')
          .filter(Boolean)
          .map((item) => {
            try {
              return decodeURIComponent(item);
            } catch {
              return item;
            }
          });
        const actualSegments = actualUrl.pathname.split('/').filter(Boolean);
        if (templateSegments.length === actualSegments.length) {
          templateSegments.forEach((segment, index) => {
            const tokenMatch = segment.match(/^\{([^{}]+)\}$/);
            if (!tokenMatch) {
              return;
            }
            const token = String(tokenMatch[1] || '').trim();
            const actualValue = actualSegments[index];
            if (token && actualValue) {
              resolved[token] = decodeURIComponent(actualValue);
            }
          });
        }
      }
    } catch {
      // ignore malformed template URL and continue with query inference only
    }

    const queryTemplate =
      httpConfig.queryTemplate &&
      typeof httpConfig.queryTemplate === 'object' &&
      !Array.isArray(httpConfig.queryTemplate)
        ? (httpConfig.queryTemplate as Record<string, any>)
        : {};
    Object.entries(queryTemplate).forEach(([queryKey, queryValue]) => {
      const tokenMatch = String(queryValue || '')
        .trim()
        .match(/^\{([^{}]+)\}$/);
      if (!tokenMatch) {
        return;
      }
      const token = String(tokenMatch[1] || '').trim();
      const actualValue = actualUrl.searchParams.get(String(queryKey || '').trim());
      if (token && actualValue) {
        resolved[token] = actualValue;
      }
    });
  }

  return resolved;
}

function buildDefaultDraftInputDescription(key: string): string {
  const normalized = String(key || '').trim();
  if (!normalized) {
    return '工作流输入参数';
  }
  return `${normalized} 参数`;
}

export function normalizeWorkflowInputParamEnum(
  value: unknown
): Array<string | number> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const seen = new Set<string>();
  const normalized: Array<string | number> = [];
  value.forEach((item) => {
    const candidate =
      typeof item === 'string'
        ? item.trim()
        : typeof item === 'number' && Number.isFinite(item)
          ? item
          : undefined;
    if (candidate === undefined || candidate === '') {
      return;
    }
    const identity = `${typeof candidate}:${String(candidate)}`;
    if (seen.has(identity)) {
      return;
    }
    seen.add(identity);
    normalized.push(candidate);
  });
  return normalized.length > 0 ? normalized : undefined;
}

function isValidTemplateToken(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(key || '').trim());
}

export function inferWorkflowInputParamType(args: {
  key: string;
  description?: string;
  defaultValue?: unknown;
  exampleValue?: unknown;
  buildWorkflowSemanticHint: BuildWorkflowSemanticHint;
}): WorkflowInputParamType {
  const { key, description, defaultValue, exampleValue, buildWorkflowSemanticHint } = args;
  const candidates = [defaultValue, exampleValue];
  if (candidates.some((value) => typeof value === 'boolean')) {
    return 'boolean';
  }
  if (candidates.some((value) => typeof value === 'number')) {
    return 'number';
  }
  const text = buildWorkflowSemanticHint(key, description, defaultValue, exampleValue);
  if (/\b(bool|boolean|enable|disabled?)\b|启用|是否/.test(text)) {
    return 'boolean';
  }
  if (/\b(date|day|time|datetime)\b|日期|时间/.test(text)) {
    return 'date';
  }
  if (
    /\b(number|int|float|double|decimal|count|size|limit|page|offset|age|temperature|temp|speed|pressure)\b|数量|页码|大小|编号/.test(
      text
    )
  ) {
    return 'number';
  }
  return 'string';
}

function collectWorkflowInputPlaceholdersFromSteps(args: {
  steps?: WorkflowStep[];
  pickFirstNonEmptyString: PickFirstNonEmptyString;
  collectTemplateVariables: CollectTemplateVariables;
}): Set<string> {
  const { steps, pickFirstNonEmptyString, collectTemplateVariables } = args;
  const placeholders = new Set<string>();
  for (const step of steps || []) {
    if (!step || step.type !== 'activity') {
      continue;
    }
    const activityRef = pickFirstNonEmptyString(step.activityRef);
    const stepInput =
      step.input && typeof step.input === 'object' && !Array.isArray(step.input)
        ? (step.input as Record<string, any>)
        : {};

    if (activityRef === 'builtin:httpRequest') {
      collectTemplateVariables(stepInput[HTTP_REQUEST_STEP_CONFIG_KEY], placeholders);
      continue;
    }

    if (
      activityRef === 'builtin:structuredTransform' ||
      activityRef === 'builtin:aiStructuredTransform'
    ) {
      const structuredConfig =
        stepInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] &&
        typeof stepInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] === 'object' &&
        !Array.isArray(stepInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY])
          ? (stepInput[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] as Record<string, any>)
          : {};
      collectTemplateVariables(structuredConfig, placeholders);
      const internalStructuredKeys = new Set<string>([
        'content',
        'context',
        'httpResult',
        'httpBody',
        ...Object.keys(
          structuredConfig.fieldMappings &&
            typeof structuredConfig.fieldMappings === 'object' &&
            !Array.isArray(structuredConfig.fieldMappings)
            ? structuredConfig.fieldMappings
            : {}
        ),
        ...Object.keys(
          structuredConfig.outputSchema &&
            typeof structuredConfig.outputSchema === 'object' &&
            !Array.isArray(structuredConfig.outputSchema)
            ? structuredConfig.outputSchema
            : {}
        ),
      ]);
      internalStructuredKeys.forEach((key) => placeholders.delete(key));
      continue;
    }

    Object.entries(stepInput).forEach(([key, value]) => {
      if (key === STRUCTURED_TRANSFORM_STEP_CONFIG_KEY || key === HTTP_REQUEST_STEP_CONFIG_KEY) {
        return;
      }
      collectTemplateVariables(value, placeholders);
    });
  }

  return new Set(Array.from(placeholders).filter((key) => isValidTemplateToken(key)));
}

function mergeDraftInputParamsWithStepPlaceholders(args: {
  inputParams?: Record<string, WorkflowInputParamDefinition>;
  steps?: WorkflowStep[];
  referenceUrl: string;
  pickFirstNonEmptyString: PickFirstNonEmptyString;
  collectTemplateVariables: CollectTemplateVariables;
  normalizeWorkflowInputRenderPath: NormalizeWorkflowInputRenderPath;
  buildWorkflowSemanticHint: BuildWorkflowSemanticHint;
}): Record<string, WorkflowInputParamDefinition> {
  const {
    inputParams,
    steps,
    referenceUrl,
    pickFirstNonEmptyString,
    collectTemplateVariables,
    normalizeWorkflowInputRenderPath,
    buildWorkflowSemanticHint,
  } = args;
  const merged: Record<string, WorkflowInputParamDefinition> = {};
  const referenceSamples = steps
    ? extractAiDraftSampleValuesFromReferenceUrl(referenceUrl, steps, pickFirstNonEmptyString)
    : {};

  Object.entries(inputParams || {}).forEach(([rawKey, value]) => {
    const key = String(rawKey || '').trim();
    if (!key) {
      return;
    }
    const enumValues = normalizeWorkflowInputParamEnum(value?.enum);
    merged[key] = {
      description: pickFirstNonEmptyString(value?.description),
      required: value?.required,
      defaultValue: value?.defaultValue ?? '',
      ...(enumValues ? { enum: enumValues } : {}),
      localizedDefaultValue:
        value?.localizedDefaultValue && Object.keys(value.localizedDefaultValue).length > 0
          ? value.localizedDefaultValue
          : undefined,
      source: value?.source || 'declared',
      type: value?.type,
      exampleValue: value?.exampleValue,
      ...(normalizeWorkflowInputRenderPath(value?.renderPath)
        ? { renderPath: normalizeWorkflowInputRenderPath(value?.renderPath) }
        : {}),
    };
  });

  collectWorkflowInputPlaceholdersFromSteps({
    steps,
    pickFirstNonEmptyString,
    collectTemplateVariables,
  }).forEach((key) => {
    const inferredDescription = buildDefaultDraftInputDescription(key);
    const referenceExample = referenceSamples[key];
    if (!merged[key]) {
      merged[key] = {
        description: inferredDescription,
        required: true,
        defaultValue: '',
        source:
          referenceExample !== undefined ? 'inferred_from_reference_url' : 'inferred_from_template',
        type: inferWorkflowInputParamType({
          key,
          description: inferredDescription,
          defaultValue: '',
          exampleValue: referenceExample,
          buildWorkflowSemanticHint,
        }),
        exampleValue:
          referenceExample !== undefined
            ? referenceExample
            : buildGenericAiDraftSampleValue({
                key,
                description: inferredDescription,
                referenceUrl,
                buildWorkflowSemanticHint,
              }),
      };
      return;
    }
    merged[key] = {
      ...merged[key],
      source:
        merged[key].source && merged[key].source !== 'declared' ? merged[key].source : 'merged',
      exampleValue:
        merged[key].exampleValue !== undefined
          ? merged[key].exampleValue
          : referenceExample !== undefined
            ? referenceExample
            : buildGenericAiDraftSampleValue({
                key,
                description: inferredDescription,
                referenceUrl,
                buildWorkflowSemanticHint,
              }),
    };
  });

  return merged;
}

export function normalizeDraftInputParams(args: {
  inputParams?: Record<string, WorkflowInputParamDefinition>;
  steps?: WorkflowStep[];
  referenceUrl?: string;
  pickFirstNonEmptyString: PickFirstNonEmptyString;
  collectTemplateVariables: CollectTemplateVariables;
  normalizeWorkflowInputRenderPath: NormalizeWorkflowInputRenderPath;
  buildWorkflowSemanticHint: BuildWorkflowSemanticHint;
}): WorkflowDsl['inputParams'] {
  const {
    inputParams,
    steps,
    referenceUrl = '',
    pickFirstNonEmptyString,
    collectTemplateVariables,
    normalizeWorkflowInputRenderPath,
    buildWorkflowSemanticHint,
  } = args;
  const mergedInputParams = mergeDraftInputParamsWithStepPlaceholders({
    inputParams,
    steps,
    referenceUrl,
    pickFirstNonEmptyString,
    collectTemplateVariables,
    normalizeWorkflowInputRenderPath,
    buildWorkflowSemanticHint,
  });
  const entries = Object.entries(mergedInputParams || {}).filter(([key]) =>
    String(key || '').trim()
  );
  if (!entries.length) {
    return undefined;
  }
  return entries.reduce<Record<string, WorkflowInputParamDefinition>>((acc, [key, value]) => {
    const normalizedKey = String(key).trim();
    const defaultValue = value?.defaultValue ?? '';
    const enumValues = normalizeWorkflowInputParamEnum(value?.enum);
    const localizedDefaultValue =
      value?.localizedDefaultValue && Object.keys(value.localizedDefaultValue).length > 0
        ? value.localizedDefaultValue
        : undefined;
    const description =
      pickFirstNonEmptyString(value?.description) ||
      buildDefaultDraftInputDescription(normalizedKey);
    const exampleValue =
      value?.exampleValue !== undefined &&
      (!enumValues || enumValues.includes(value.exampleValue as string | number))
        ? value.exampleValue
        : enumValues?.[0] !== undefined
          ? enumValues[0]
          : buildGenericAiDraftSampleValue({
              key: normalizedKey,
              description,
              referenceUrl,
              buildWorkflowSemanticHint,
            });
    acc[String(key).trim()] = {
      description,
      required:
        value?.required === undefined
          ? !String(defaultValue).trim() && !localizedDefaultValue
          : value.required !== false,
      defaultValue,
      ...(enumValues ? { enum: enumValues } : {}),
      localizedDefaultValue,
      source: value?.source,
      type:
        value?.type ||
        inferWorkflowInputParamType({
          key: normalizedKey,
          description,
          defaultValue,
          exampleValue,
          buildWorkflowSemanticHint,
        }),
      exampleValue,
      ...(normalizeWorkflowInputRenderPath(value?.renderPath)
        ? { renderPath: normalizeWorkflowInputRenderPath(value?.renderPath) }
        : {}),
    };
    return acc;
  }, {});
}

export function normalizeDraftOutputParams(
  outputParams: Record<string, { description?: string; sourceStep?: string }> | undefined,
  pickFirstNonEmptyString: PickFirstNonEmptyString
): WorkflowDsl['outputParams'] {
  const entries = Object.entries(outputParams || {}).filter(([key]) => String(key || '').trim());
  if (!entries.length) {
    return {
      result: {
        description: '工作流输出结果',
        sourceStep: 'step_1',
      },
    };
  }
  return entries.reduce<Record<string, { description?: string; sourceStep?: string }>>(
    (acc, [key, value]) => {
      acc[String(key).trim()] = {
        description: pickFirstNonEmptyString(value?.description) || '',
        sourceStep: pickFirstNonEmptyString(value?.sourceStep) || 'step_1',
      };
      return acc;
    },
    {}
  );
}

function inferStructuredTransformOutputMode(
  stepName: string,
  workflowIntentText: string,
  normalizedConfig: Record<string, any>
): 'json' | 'text' {
  const signalText = [
    stepName,
    workflowIntentText,
    String(normalizedConfig.instructionTemplate || ''),
    String(normalizedConfig.textTemplate || ''),
  ]
    .filter(Boolean)
    .join('\n');

  if (
    String(normalizedConfig.textTemplate || '').trim() ||
    /(格式化|format|render|文本|text|纯文本|markdown|邮件|消息|总结|summary|报告|report)/i.test(
      signalText
    )
  ) {
    return 'text';
  }
  return 'json';
}

function extractStructuredTransformCandidateFieldKeys(...sources: unknown[]): string[] {
  const keys = new Set<string>();
  const blockedWords = new Set([
    'json',
    'text',
    'html',
    'content',
    'context',
    'output',
    'outputs',
    'input',
    'inputs',
    'field',
    'fields',
    'schema',
    'format',
    'formatted',
    'transform',
    'structured',
    'workflow',
    'step',
    'data',
    'message',
    'messages',
    'report',
    'render',
    'result',
    'results',
  ]);

  const addKey = (value: unknown) => {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return;
    }
    const sanitized = normalized
      .replace(/^[`"'[{(]+/, '')
      .replace(/[`"'\]})]+$/, '')
      .trim();
    if (!sanitized) {
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(sanitized)) {
      return;
    }
    if (blockedWords.has(sanitized.toLowerCase())) {
      return;
    }
    keys.add(sanitized);
  };

  const visit = (source: unknown) => {
    if (!source) {
      return;
    }
    if (typeof source === 'string') {
      for (const match of source.matchAll(/\{([^{}]+)\}/g)) {
        addKey(match[1]);
      }
      for (const match of source.matchAll(/[`"'"]([a-zA-Z][a-zA-Z0-9_]*)[`"'"]/g)) {
        addKey(match[1]);
      }
      for (const match of source.matchAll(
        /\b([a-z][a-zA-Z0-9_]*[A-Z][a-zA-Z0-9_]*|[a-z][a-zA-Z0-9_]*_[a-zA-Z0-9_]+)\b/g
      )) {
        addKey(match[1]);
      }
      const fieldHintMatches = source.match(
        /(?:字段|fields?|返回|输出|包含|保留|重点保证字段)\s*[:：]?\s*([^\n。；;]+)/i
      );
      if (fieldHintMatches?.[1]) {
        fieldHintMatches[1].split(/[,\s、，|/]+/).forEach((item) => addKey(item));
      }
      return;
    }
    if (Array.isArray(source)) {
      source.forEach((item) => visit(item));
      return;
    }
    if (typeof source === 'object') {
      Object.keys(source as Record<string, unknown>).forEach((key) => addKey(key));
    }
  };

  sources.forEach((source) => visit(source));
  return Array.from(keys);
}

function buildDefaultAiStructuredTransformInstruction(
  stepName: string,
  outputMode: string,
  outputSchema: unknown
): string {
  const normalizedSchema =
    outputSchema && typeof outputSchema === 'object' && !Array.isArray(outputSchema)
      ? (outputSchema as Record<string, any>)
      : {};
  if (String(outputMode || '').toLowerCase() === 'text') {
    return `请根据输入内容完成${stepName}，输出整理后的纯文本结果，只返回纯文本，不要 JSON。`;
  }
  const fields = Object.keys(normalizedSchema);
  const fieldSummary = fields.length > 0 ? `重点保证字段：${fields.join('、')}。` : '';
  return `请根据输入内容完成${stepName}，按 outputSchema 返回结构化 JSON。${fieldSummary}`.trim();
}

function buildDefaultStructuredTransformOutputSchema(
  stepName: string,
  workflowIntentText: string,
  normalizedConfig?: Record<string, any>
): Record<string, string> {
  const candidateFieldKeys = extractStructuredTransformCandidateFieldKeys(
    normalizedConfig?.fieldMappings,
    normalizedConfig?.outputSchema,
    normalizedConfig?.textTemplate,
    normalizedConfig?.instructionTemplate,
    normalizedConfig?.contextTemplate,
    stepName,
    workflowIntentText
  );
  if (candidateFieldKeys.length > 0) {
    return Object.fromEntries(candidateFieldKeys.slice(0, 8).map((key) => [key, 'string']));
  }

  const signalText = `${stepName}\n${workflowIntentText}`;
  if (/(总结|summary|摘要|概览|overview)/i.test(signalText)) {
    return { summary: 'string' };
  }
  if (/(建议|advice|recommend|推荐)/i.test(signalText)) {
    return { advice: 'string' };
  }
  if (/(标题|title)/i.test(signalText)) {
    return { title: 'string' };
  }
  return { result: 'string' };
}

function humanizeStructuredTransformFieldLabel(
  stepName: string,
  fieldKey: string,
  pickFirstNonEmptyString: PickFirstNonEmptyString
): string {
  const normalized = String(fieldKey || '').trim();
  if (!normalized) {
    return pickFirstNonEmptyString(stepName) || 'Field';
  }
  if (/^[a-z0-9]+(?:[A-Z][a-z0-9]+)+$/.test(normalized)) {
    return normalized
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/^./, (item) => item.toUpperCase());
  }
  const segments = normalized.replace(/[_-]+/g, ' ').split(/\s+/).filter(Boolean);
  if (segments.length === 0) {
    return normalized;
  }
  return segments.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join(' ');
}

function buildDefaultStructuredTransformTextTemplate(
  stepName: string,
  fieldKeys: string[],
  pickFirstNonEmptyString: PickFirstNonEmptyString
): string {
  const normalizedFields = fieldKeys.map((key) => String(key || '').trim()).filter(Boolean);
  if (normalizedFields.length === 0) {
    return '{content}';
  }
  return normalizedFields
    .slice(0, 8)
    .map(
      (key) =>
        `${humanizeStructuredTransformFieldLabel(stepName, key, pickFirstNonEmptyString)}: {${key}}`
    )
    .join('\n');
}

export function normalizeAiDraftStepInput(args: {
  rawInput: Record<string, any>;
  activityRef: string;
  stepName: string;
  workflowIntentText: string;
  previousActivityRef?: string;
  sanitizeJsonValue: SanitizeJsonValue;
  normalizeStructuredTransformConfig: NormalizeStructuredTransformConfig;
  pickFirstNonEmptyString?: PickFirstNonEmptyString;
}): Record<string, any> {
  const {
    rawInput,
    activityRef,
    stepName,
    workflowIntentText,
    previousActivityRef,
    sanitizeJsonValue,
    normalizeStructuredTransformConfig,
    pickFirstNonEmptyString = defaultPickFirstNonEmptyString,
  } = args;
  const input = sanitizeJsonValue(rawInput || {}) as Record<string, any>;
  if (
    activityRef !== 'builtin:structuredTransform' &&
    activityRef !== 'builtin:aiStructuredTransform'
  ) {
    return input;
  }

  const isAiTransform = activityRef === 'builtin:aiStructuredTransform';
  const previousIsHttpRequest = previousActivityRef === 'builtin:httpRequest';
  const rawStructuredConfig =
    input[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] &&
    typeof input[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] === 'object'
      ? (input[STRUCTURED_TRANSFORM_STEP_CONFIG_KEY] as Record<string, any>)
      : {};
  const structuredPlaceholderKeys = new Set<string>([
    'content',
    ...Object.keys(
      rawStructuredConfig.fieldMappings &&
        typeof rawStructuredConfig.fieldMappings === 'object' &&
        !Array.isArray(rawStructuredConfig.fieldMappings)
        ? rawStructuredConfig.fieldMappings
        : {}
    ),
    ...Object.keys(
      rawStructuredConfig.outputSchema &&
        typeof rawStructuredConfig.outputSchema === 'object' &&
        !Array.isArray(rawStructuredConfig.outputSchema)
        ? rawStructuredConfig.outputSchema
        : {}
    ),
  ]);
  const normalizedConfig = normalizeStructuredTransformConfig(
    rawStructuredConfig,
    structuredPlaceholderKeys
  );

  const declaredOutputMode = String(rawStructuredConfig.outputMode || '')
    .trim()
    .toLowerCase();
  let outputMode = declaredOutputMode;
  if (!outputMode) {
    outputMode = inferStructuredTransformOutputMode(stepName, workflowIntentText, normalizedConfig);
  }

  let contentType = String(rawStructuredConfig.contentType || '')
    .trim()
    .toLowerCase();
  if (!contentType) {
    contentType = previousIsHttpRequest ? 'json' : 'text';
  }

  const outputSchema =
    normalizedConfig.outputSchema &&
    typeof normalizedConfig.outputSchema === 'object' &&
    !Array.isArray(normalizedConfig.outputSchema)
      ? { ...normalizedConfig.outputSchema }
      : {};
  if (outputMode === 'json' && Object.keys(outputSchema).length === 0) {
    Object.assign(
      outputSchema,
      buildDefaultStructuredTransformOutputSchema(stepName, workflowIntentText, normalizedConfig)
    );
  }

  let instructionTemplate = String(normalizedConfig.instructionTemplate || '').trim();
  if (!instructionTemplate && isAiTransform) {
    instructionTemplate = buildDefaultAiStructuredTransformInstruction(
      stepName,
      outputMode,
      outputSchema
    );
  }

  const fieldMappings =
    normalizedConfig.fieldMappings &&
    typeof normalizedConfig.fieldMappings === 'object' &&
    !Array.isArray(normalizedConfig.fieldMappings)
      ? { ...normalizedConfig.fieldMappings }
      : {};
  let textTemplate = String(normalizedConfig.textTemplate || '').trim();

  if (!isAiTransform) {
    if (outputMode === 'text' && !textTemplate) {
      const inferredTextFieldKeys =
        Object.keys(fieldMappings).length > 0
          ? Object.keys(fieldMappings)
          : Object.keys(outputSchema);
      textTemplate = buildDefaultStructuredTransformTextTemplate(
        stepName,
        inferredTextFieldKeys,
        pickFirstNonEmptyString
      );
      inferredTextFieldKeys.forEach((key) => {
        if (!fieldMappings[key]) {
          fieldMappings[key] = key;
        }
      });
    }

    if (
      outputMode === 'json' &&
      Object.keys(fieldMappings).length === 0 &&
      Object.keys(outputSchema).length > 0
    ) {
      Object.keys(outputSchema).forEach((key) => {
        fieldMappings[key] = key;
      });
    }
  }

  return {
    ...input,
    [STRUCTURED_TRANSFORM_STEP_CONFIG_KEY]: {
      contentType,
      contentTemplate: '{content}',
      instructionTemplate,
      outputMode,
      outputSchema,
      contextTemplate: String(normalizedConfig.contextTemplate || '').trim(),
      fieldMappings,
      textTemplate,
    },
  };
}
