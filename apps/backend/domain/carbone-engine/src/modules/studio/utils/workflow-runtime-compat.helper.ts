import {
  WorkflowBindingPlan,
  WorkflowBindingPlanBinding,
  WorkflowTemplateFieldSpec,
} from './workflow-assets';

type WorkflowRuntimeInputDefinition = Record<string, unknown>;

// #region debug-point E:runtime-compat-helper
const debugReport = (hypothesisId: string, msg: string, data: Record<string, unknown> = {}) => {
  const fs = require('fs');
  let url = 'http://127.0.0.1:7777/event';
  let sessionId = 'signing-date-render';
  try {
    const env = fs.readFileSync('.dbg/signing-date-render.env', 'utf8');
    url = env.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || url;
    sessionId = env.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || sessionId;
  } catch {}
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      runId: 'pre-fix',
      hypothesisId,
      location: 'workflow-runtime-compat.helper.ts',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};
// #endregion

function normalizeRenderPath(renderPath: unknown): string[] {
  if (typeof renderPath === 'string' && renderPath.trim()) {
    return [renderPath.trim()];
  }
  if (!Array.isArray(renderPath)) {
    return [];
  }
  return Array.from(new Set(
    renderPath
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim()),
  ));
}

function normalizeLanguageCode(value: unknown): string | undefined {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'cn' || normalized === 'zh-cn' || normalized === 'zh-hans' || normalized === 'zh-hans-cn') {
    return 'zh';
  }
  if (normalized === 'jp' || normalized === 'ja-jp') {
    return 'ja';
  }
  if (normalized === 'en-us' || normalized === 'en-gb') {
    return 'en';
  }
  if (normalized === 'zh' || normalized === 'ja' || normalized === 'en') {
    return normalized;
  }
  return undefined;
}

function resolveBindingLanguage(
  variablePath: string,
  localizedVariants: string[],
  index: number,
  sourceLanguage: string,
  targetLanguages: string[],
): string | undefined {
  const normalizedPath = String(variablePath || '').trim();
  if (/_((?:cn|zh))$/iu.test(normalizedPath)) {
    return 'zh';
  }
  if (/_((?:jp|ja))$/iu.test(normalizedPath)) {
    return 'ja';
  }
  if (/_(en)$/iu.test(normalizedPath)) {
    return 'en';
  }

  const variantLanguage = normalizeLanguageCode(localizedVariants[index]);
  if (variantLanguage) {
    return variantLanguage;
  }

  if (index === 0) {
    return sourceLanguage;
  }
  return targetLanguages[index - 1] || targetLanguages[0];
}

function inferSelectorLanguage(
  definition: WorkflowRuntimeInputDefinition,
  variablePath: string,
  localizedVariants: string[],
  index: number,
  sourceLanguage: string,
  targetLanguages: string[],
): string {
  return resolveBindingLanguage(variablePath, localizedVariants, index, sourceLanguage, targetLanguages)
    || normalizeLanguageCode(definition.sourceLanguage)
    || sourceLanguage;
}

function inferFieldSpecType(definition: WorkflowRuntimeInputDefinition): string {
  return typeof definition.type === 'string' && definition.type.trim()
    ? definition.type.trim()
    : 'string';
}

function inferFieldSpecPolicy(
  definition: WorkflowRuntimeInputDefinition,
  type: string,
): WorkflowTemplateFieldSpec['policy'] | undefined {
  if (
    definition.policy === 'dictionary_first'
    || definition.policy === 'enum_mapping'
    || definition.policy === 'format_only'
    || definition.policy === 'llm_translate'
  ) {
    return definition.policy;
  }

  if (type === 'date' || type === 'currency_amount' || type === 'bank_account' || type === 'number') {
    return 'format_only';
  }

  return undefined;
}

function inferValueMode(definition: WorkflowRuntimeInputDefinition): WorkflowTemplateFieldSpec['valueMode'] {
  if (definition.valueMode === 'list' || definition.type === 'array') {
    return 'list';
  }
  if (definition.valueMode === 'object' || definition.type === 'object') {
    return 'object';
  }
  return 'scalar';
}

function inferTransform(type: string): string {
  if (type === 'currency_amount') {
    return 'currency_format';
  }
  if (type === 'date') {
    return 'date_format';
  }
  return 'identity';
}

function resolveRequired(
  definition: WorkflowRuntimeInputDefinition,
  policy: WorkflowRuntimeInputDefinition,
): boolean {
  if (typeof definition.required === 'boolean') {
    return definition.required;
  }
  return policy.requiredMode === 'always';
}

export function buildWorkflowRuntimeCompatConfig(input: {
  templateId: string;
  inputParams?: Record<string, unknown>;
  inputPolicy?: Record<string, unknown>;
  sourceLanguage: string;
  targetLanguages: string[];
}): {
  templateFieldSpecs: WorkflowTemplateFieldSpec[];
  carboneBindingPlan: WorkflowBindingPlan;
} | undefined {
  const entries = Object.entries(input.inputParams || {});
  if (entries.length === 0) {
    return undefined;
  }

  const templateFieldSpecs: WorkflowTemplateFieldSpec[] = [];
  const bindings: WorkflowBindingPlanBinding[] = [];
  const bindingKeys = new Set<string>();
  const normalizedSourceLanguage = normalizeLanguageCode(input.sourceLanguage) || 'zh';
  const normalizedTargetLanguages = Array.from(new Set(
    (input.targetLanguages || [])
      .map((item) => normalizeLanguageCode(item))
      .filter((item): item is string => Boolean(item) && item !== normalizedSourceLanguage),
  ));
  const policies = (
    input.inputPolicy
    && typeof input.inputPolicy.params === 'object'
    && !Array.isArray(input.inputPolicy.params)
      ? input.inputPolicy.params
      : input.inputPolicy
  ) as Record<string, unknown> | undefined;

  for (const [fieldId, rawDefinition] of entries) {
    const definition = rawDefinition && typeof rawDefinition === 'object'
      ? rawDefinition as WorkflowRuntimeInputDefinition
      : {};
    const policy = policies?.[fieldId] && typeof policies[fieldId] === 'object'
      ? policies[fieldId] as WorkflowRuntimeInputDefinition
      : {};
    const renderPaths = normalizeRenderPath(definition.renderPath ?? policy.templateBinding);
    if (renderPaths.length === 0) {
      continue;
    }

    const type = inferFieldSpecType(definition);
    const fieldPolicy = inferFieldSpecPolicy(definition, type);
    const valueMode = inferValueMode(definition);
    const localizedVariants = Array.isArray(definition.localizedVariants)
      ? definition.localizedVariants.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const required = resolveRequired(definition, policy);

    templateFieldSpecs.push({
      fieldId,
      valueMode,
      type,
      ...(fieldPolicy ? { policy: fieldPolicy } : {}),
      description: typeof definition.description === 'string' ? definition.description.trim() : undefined,
      sourceLanguage: normalizeLanguageCode(definition.sourceLanguage) || normalizedSourceLanguage,
      targetLanguages: normalizedTargetLanguages,
      required,
    });

    renderPaths.forEach((variablePath, index) => {
      const language = valueMode === 'scalar'
        ? resolveBindingLanguage(
          variablePath,
          localizedVariants,
          index,
          normalizedSourceLanguage,
          normalizedTargetLanguages,
        )
        : undefined;
      const bindingKey = `${fieldId}::${variablePath}`;
      if (bindingKeys.has(bindingKey)) {
        return;
      }
      bindingKeys.add(bindingKey);
      bindings.push({
        fieldId,
        variablePath,
        valueSelector: valueMode === 'scalar'
          ? `${fieldId}.${inferSelectorLanguage(
            definition,
            variablePath,
            localizedVariants,
            index,
            normalizedSourceLanguage,
            normalizedTargetLanguages,
          )}`
          : `${fieldId}.value`,
        language,
        transform: inferTransform(type),
        required,
      });
      // #region debug-point E:signing-date-binding
      if (fieldId === 'contract.signingDate') {
        debugReport('E', 'runtime compat binding generated for signingDate', {
          fieldId,
          valueMode,
          variablePath,
          language: language || null,
          valueSelector: valueMode === 'scalar'
            ? `${fieldId}.${inferSelectorLanguage(
              definition,
              variablePath,
              localizedVariants,
              index,
              normalizedSourceLanguage,
              normalizedTargetLanguages,
            )}`
            : `${fieldId}.value`,
          localizedVariants,
          sourceLanguage: normalizedSourceLanguage,
          targetLanguages: normalizedTargetLanguages,
          type,
          required,
        });
      }
      // #endregion
    });
  }

  if (templateFieldSpecs.length === 0 || bindings.length === 0) {
    return undefined;
  }

  return {
    templateFieldSpecs,
    carboneBindingPlan: {
      templateId: input.templateId,
      version: 1,
      bindings,
    },
  };
}
