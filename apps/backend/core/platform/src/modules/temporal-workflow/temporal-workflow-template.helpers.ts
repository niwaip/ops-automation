import type {
  CarboneSkillMeta,
  CarboneTemplateMeta,
  WorkflowInputParamType,
} from './temporal-workflow.types';

type PickFirstNonEmptyString = (...values: unknown[]) => string | undefined;
type UniqueVariables = (variables: string[]) => string[];
type BuildWorkflowSemanticHint = (...values: unknown[]) => string;

export interface TemplateWorkflowParamSeed {
  key: string;
  required: boolean;
  type: WorkflowInputParamType;
  exampleValue?: string | number | boolean;
  description: string;
  displayName?: string;
  groupLabel?: string;
  localizedVariants?: string[];
  paramKind: 'scalar' | 'array';
  arrayPath?: string;
  fieldName?: string;
  renderPath?: string | string[];
}

export function buildTemplateWorkflowParamSeeds(args: {
  template: CarboneTemplateMeta;
  skill: CarboneSkillMeta | null;
  pickFirstNonEmptyString: PickFirstNonEmptyString;
  uniqueVariables: UniqueVariables;
  buildWorkflowSemanticHint: BuildWorkflowSemanticHint;
}): TemplateWorkflowParamSeed[] {
  const { template, skill, pickFirstNonEmptyString, uniqueVariables, buildWorkflowSemanticHint } =
    args;
  const skillParameters = Array.isArray(skill?.parameters) ? skill.parameters : [];
  const paramMap = new Map<string, TemplateWorkflowParamSeed>();
  const manifestBindings = Array.isArray(template.templateAssetManifest?.renderPlan?.bindings)
    ? template.templateAssetManifest?.renderPlan?.bindings
    : [];
  const skillParameterKeys = skillParameters
    .map((parameter) => normalizeTemplateWorkflowParamKey(String(parameter?.name || '').trim()))
    .filter(Boolean);
  const manifestFieldMap = new Map(
    Array.isArray(template.templateAssetManifest?.templateFieldSpecs)
      ? template.templateAssetManifest.templateFieldSpecs.map((field) => [field.fieldId, field])
      : []
  );
  const bilingualBaseKeyByVariant = buildBilingualBaseKeyMap([
    ...skillParameterKeys,
    ...manifestBindings.map((binding) => variableToKey(binding.variablePath)).filter(Boolean),
    ...uniqueVariables(template.variables || [])
      .map((variable) => variableToKey(variable))
      .filter(Boolean),
  ]);
  const suggestionMetaByKey = buildTemplateSuggestionMetaMap(
    template,
    bilingualBaseKeyByVariant,
    pickFirstNonEmptyString
  );
  const bindingFieldIdByKey = manifestBindings.reduce<Map<string, string>>((acc, binding) => {
    const bindingKey = variableToKey(binding.variablePath);
    const fieldId = String(binding.fieldId || '').trim();
    if (bindingKey && fieldId) {
      acc.set(bindingKey, fieldId);
    }
    return acc;
  }, new Map());
  const manifestRenderPathsByKey = manifestBindings.reduce<Map<string, string[]>>(
    (acc, binding) => {
      const rawBindingKey = normalizeTemplateWorkflowParamKey(
        normalizeTemplateWorkflowRenderPath(String(binding.variablePath || '')) || ''
      );
      const fieldId = normalizeTemplateWorkflowParamKey(String(binding.fieldId || '').trim());
      const key = fieldId || bilingualBaseKeyByVariant.get(rawBindingKey) || rawBindingKey;
      const renderPath = normalizeTemplateWorkflowRenderPath(String(binding.variablePath || ''));
      if (!key || !renderPath) {
        return acc;
      }
      const existing = acc.get(key) || [];
      if (!existing.includes(renderPath)) {
        acc.set(key, [...existing, renderPath]);
      }
      return acc;
    },
    new Map()
  );
  const variableRenderPathsByKey = uniqueVariables(template.variables || []).reduce<
    Map<string, string[]>
  >((acc, variable) => {
    const rawVariableKey = normalizeTemplateWorkflowParamKey(variableToKey(variable));
    const key = bilingualBaseKeyByVariant.get(rawVariableKey) || rawVariableKey;
    const renderPath = normalizeTemplateWorkflowRenderPath(variable);
    if (!key || !renderPath) {
      return acc;
    }
    const existing = acc.get(key) || [];
    if (!existing.includes(renderPath)) {
      acc.set(key, [...existing, renderPath]);
    }
    return acc;
  }, new Map());
  const resolvedRenderPathsByKey = new Map<string, string[]>();
  const appendRenderPaths = (key: string, renderPaths: string[]) => {
    const normalizedKey = normalizeTemplateWorkflowParamKey(key);
    if (!normalizedKey || !Array.isArray(renderPaths) || renderPaths.length === 0) {
      return;
    }
    const existing = resolvedRenderPathsByKey.get(normalizedKey) || [];
    const merged = Array.from(
      new Set([
        ...existing,
        ...renderPaths
          .map((item) => normalizeTemplateWorkflowRenderPath(item))
          .filter((item): item is string => Boolean(item)),
      ])
    );
    if (merged.length > 0) {
      resolvedRenderPathsByKey.set(normalizedKey, merged);
    }
  };
  variableRenderPathsByKey.forEach((renderPaths, key) => appendRenderPaths(key, renderPaths));
  manifestRenderPathsByKey.forEach((renderPaths, key) => appendRenderPaths(key, renderPaths));

  const suggestions = Array.isArray(template.suggestions) ? template.suggestions : [];
  const suggestionRenderPathsByKey = suggestions.reduce<Map<string, string[]>>(
    (acc, suggestion) => {
      const rawName = String(suggestion?.suggestedName || '').trim();
      const renderPath = normalizeTemplateWorkflowRenderPath(rawName);
      if (!renderPath) {
        return acc;
      }
      const rawKey = normalizeTemplateWorkflowParamKey(variableToKey(rawName));
      const key = bilingualBaseKeyByVariant.get(rawKey) || rawKey;
      if (!key) {
        return acc;
      }
      const existing = acc.get(key) || [];
      if (!existing.includes(renderPath)) {
        acc.set(key, [...existing, renderPath]);
      }
      return acc;
    },
    new Map()
  );
  suggestionRenderPathsByKey.forEach((renderPaths, key) => {
    if (!resolvedRenderPathsByKey.has(key)) {
      appendRenderPaths(key, renderPaths);
    }
  });

  for (const parameter of skillParameters) {
    const rawName = String(parameter?.name || '').trim();
    const rawKey = normalizeTemplateWorkflowParamKey(rawName);
    const key = bindingFieldIdByKey.get(rawKey) || bilingualBaseKeyByVariant.get(rawKey) || rawKey;
    if (!key) {
      continue;
    }
    const field = manifestFieldMap.get(key);
    const suggestionMeta = suggestionMetaByKey.get(key);
    const description = resolveTemplateWorkflowParamLabel(
      suggestionMeta?.description,
      field?.description,
      parameter?.usage,
      parameter?.displayName,
      `模板参数 ${key}`
    );
    const displayName = resolveTemplateWorkflowParamLabel(
      suggestionMeta?.displayName,
      field?.description,
      parameter?.displayName,
      parameter?.example,
      field?.description,
      key
    );

    const arrayMatch = key.match(/^(.+\[\])\.(.+)$/);
    const existing = paramMap.get(key);
    if (existing) {
      existing.required = existing.required || parameter?.required !== false;
      existing.displayName = pickFirstNonEmptyString(existing.displayName, displayName);
      existing.description =
        pickFirstNonEmptyString(existing.description, description) || existing.description;
      existing.groupLabel = pickFirstNonEmptyString(
        existing.groupLabel,
        suggestionMeta?.groupLabel,
        parameter?.groupLabel,
        parameter?.sheetName,
        parameter?.chapter,
        parameter?.section,
        parameter?.group
      );
      existing.localizedVariants = mergeLocalizedVariants(
        existing.localizedVariants,
        suggestionMeta?.localizedVariants
      );
      if (existing.exampleValue === undefined) {
        existing.exampleValue = normalizeWorkflowExampleValue(
          parameter?.example,
          parameter?.dataType,
          buildWorkflowSemanticHint
        );
      }
      if (!existing.renderPath) {
        existing.renderPath = normalizeWorkflowInputRenderPath(resolvedRenderPathsByKey.get(key));
      }
      continue;
    }

    paramMap.set(key, {
      key,
      required: parameter?.required !== false,
      type: normalizeWorkflowInputParamType(
        parameter?.dataType ?? field?.type,
        key,
        buildWorkflowSemanticHint
      ),
      exampleValue: normalizeWorkflowExampleValue(
        parameter?.example,
        parameter?.dataType,
        buildWorkflowSemanticHint
      ),
      description,
      displayName,
      groupLabel: pickFirstNonEmptyString(
        suggestionMeta?.groupLabel,
        parameter?.groupLabel,
        parameter?.sheetName,
        parameter?.chapter,
        parameter?.section,
        parameter?.group
      ),
      localizedVariants: suggestionMeta?.localizedVariants,
      paramKind: arrayMatch ? 'array' : 'scalar',
      arrayPath: arrayMatch?.[1],
      fieldName: field?.fieldId || arrayMatch?.[2] || key,
      renderPath: normalizeWorkflowInputRenderPath(resolvedRenderPathsByKey.get(key)),
    });
  }

  if (paramMap.size > 0) {
    return Array.from(paramMap.values());
  }
  if (manifestBindings.length > 0) {
    const seen = new Set<string>();
    return manifestBindings
      .filter((binding) => {
        const rawKey = variableToKey(binding.variablePath);
        const key =
          String(binding.fieldId || '').trim() || bilingualBaseKeyByVariant.get(rawKey) || rawKey;
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .map((binding) => {
        const rawKey = variableToKey(binding.variablePath);
        const key =
          String(binding.fieldId || '').trim() || bilingualBaseKeyByVariant.get(rawKey) || rawKey;
        const field = manifestFieldMap.get(binding.fieldId);
        const suggestionMeta = suggestionMetaByKey.get(key);
        return {
          key,
          required: binding.required !== false && field?.required !== false,
          type: normalizeWorkflowInputParamType(field?.type, key, buildWorkflowSemanticHint),
          description: resolveTemplateWorkflowParamLabel(
            suggestionMeta?.description,
            field?.description,
            `模板参数 ${key}`
          ),
          displayName: resolveTemplateWorkflowParamLabel(
            suggestionMeta?.displayName,
            field?.description,
            key
          ),
          localizedVariants: suggestionMeta?.localizedVariants,
          paramKind: 'scalar' as const,
          fieldName: field?.fieldId || key,
          renderPath: normalizeWorkflowInputRenderPath(resolvedRenderPathsByKey.get(key)),
        };
      });
  }

  const variables = uniqueVariables(template.variables || []).filter((variable) => {
    const key = variableToKey(variable);
    return !key.includes('{#') && !key.includes('{/');
  });

  const seen = new Set<string>();
  return variables.reduce<TemplateWorkflowParamSeed[]>((acc, variable) => {
    const rawKey = variableToKey(variable);
    const key = bilingualBaseKeyByVariant.get(rawKey) || rawKey;
    if (!key || seen.has(key)) {
      return acc;
    }
    seen.add(key);
    const suggestionMeta = suggestionMetaByKey.get(key);
    acc.push({
      key,
      required: true,
      type: 'string' as WorkflowInputParamType,
      description: resolveTemplateWorkflowParamLabel(
        suggestionMeta?.description,
        `模板参数 ${key}`
      ),
      displayName: resolveTemplateWorkflowParamLabel(suggestionMeta?.displayName, key),
      localizedVariants: suggestionMeta?.localizedVariants,
      paramKind: 'scalar' as const,
      fieldName: key,
      renderPath: normalizeWorkflowInputRenderPath(resolvedRenderPathsByKey.get(key)),
    });
    return acc;
  }, []);
}

export function resolveTemplateWorkflowTargetLanguages(
  template: CarboneTemplateMeta,
  paramSeeds: TemplateWorkflowParamSeed[]
): string[] {
  const manifestTargetLanguages = Array.isArray(
    template.templateAssetManifest?.languageProfile?.targetLanguages
  )
    ? template.templateAssetManifest.languageProfile.targetLanguages
        .map((item) => normalizeTemplateWorkflowLanguageCode(item))
        .filter((item): item is string => item === 'ja' || item === 'en')
    : [];
  if (manifestTargetLanguages.length > 0) {
    return Array.from(new Set(manifestTargetLanguages));
  }

  const detected = new Set<string>();
  const collectLanguage = (value: unknown) => {
    const normalized = normalizeTemplateWorkflowLanguageCode(value);
    if (normalized === 'ja' || normalized === 'en') {
      detected.add(normalized);
    }
  };
  const collectFromPath = (value: unknown) => {
    const variant = extractTemplateWorkflowLanguageVariant(String(value || ''));
    collectLanguage(variant);
  };

  for (const seed of paramSeeds) {
    for (const variant of seed.localizedVariants || []) {
      collectLanguage(variant);
    }
    if (typeof seed.renderPath === 'string') {
      collectFromPath(seed.renderPath);
    } else if (Array.isArray(seed.renderPath)) {
      for (const path of seed.renderPath) {
        collectFromPath(path);
      }
    }
  }

  for (const variable of template.variables || []) {
    collectFromPath(variableToKey(variable));
  }

  if (detected.has('ja')) {
    return ['ja'];
  }
  if (detected.has('en')) {
    return ['en'];
  }
  return [];
}

export function normalizeTemplateWorkflowRenderPath(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }

  const trimmed = path.trim();
  if (!trimmed) {
    return undefined;
  }

  const carboneBindingMatch = trimmed.match(/^\{#?d\.([^}:]+)(?::[^}]*)?\}$/);
  if (carboneBindingMatch?.[1]) {
    return carboneBindingMatch[1].trim();
  }

  return (
    trimmed
      .replace(/^d\./, '')
      .replace(/^data\./, '')
      .trim() || undefined
  );
}

export function normalizeWorkflowInputRenderPath(
  renderPath: string | string[] | undefined
): string | string[] | undefined {
  if (typeof renderPath === 'string') {
    const normalized = normalizeTemplateWorkflowRenderPath(renderPath);
    return normalized || undefined;
  }
  if (!Array.isArray(renderPath)) {
    return undefined;
  }
  const normalized = Array.from(
    new Set(
      renderPath
        .map((item) =>
          normalizeTemplateWorkflowRenderPath(typeof item === 'string' ? item : undefined)
        )
        .filter((item): item is string => Boolean(item))
    )
  );
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized.length === 1 ? normalized[0] : normalized;
}

export function resolveSingleWorkflowInputRenderPath(
  renderPath: string | string[] | undefined
): string | undefined {
  const normalized = normalizeWorkflowInputRenderPath(renderPath);
  return typeof normalized === 'string' ? normalized : undefined;
}

export function resolveDocumentWorkflowBindingPaths(
  templateBinding: unknown,
  renderPath: string | string[] | undefined,
  fallbackKey: string
): string[] {
  const normalizedTemplateBinding =
    typeof templateBinding === 'string'
      ? normalizeTemplateWorkflowRenderPath(templateBinding)
      : undefined;
  if (normalizedTemplateBinding) {
    return [normalizedTemplateBinding];
  }

  const normalizedRenderPath = normalizeWorkflowInputRenderPath(renderPath);
  if (typeof normalizedRenderPath === 'string') {
    return [normalizedRenderPath];
  }
  if (Array.isArray(normalizedRenderPath) && normalizedRenderPath.length > 0) {
    return normalizedRenderPath;
  }

  const fallbackPath = normalizeTemplateWorkflowRenderPath(fallbackKey) || fallbackKey.trim();
  return fallbackPath ? [fallbackPath] : [];
}

function buildTemplateSuggestionMetaMap(
  template: CarboneTemplateMeta,
  bilingualBaseKeyByVariant: Map<string, string>,
  pickFirstNonEmptyString: PickFirstNonEmptyString
): Map<
  string,
  {
    displayName?: string;
    description?: string;
    groupLabel?: string;
    localizedVariants?: string[];
  }
> {
  const suggestions = Array.isArray(template.suggestions) ? template.suggestions : [];
  const aggregated = new Map<
    string,
    {
      displayName?: string;
      description?: string;
      groupLabel?: string;
      localizedVariants: string[];
      hasBaseVariant: boolean;
      displayNamePriority: number;
      descriptionPriority: number;
    }
  >();

  suggestions.forEach((suggestion) => {
    const rawKey = normalizeTemplateWorkflowParamKey(String(suggestion?.suggestedName || ''));
    if (!rawKey) {
      return;
    }
    const key = bilingualBaseKeyByVariant.get(rawKey) || rawKey;
    const details = suggestion?.details || {};
    const variant = extractTemplateWorkflowLanguageVariant(rawKey);
    const priority = getTemplateWorkflowLanguageVariantPriority(variant);
    const nextDisplayName = resolveTemplateWorkflowParamLabel(
      details.description,
      suggestion?.originalText
    );
    const nextDescription = resolveTemplateWorkflowParamLabel(
      details.significance,
      details.description
    );
    const existing = aggregated.get(key) || {
      localizedVariants: [],
      hasBaseVariant: false,
      displayNamePriority: Number.POSITIVE_INFINITY,
      descriptionPriority: Number.POSITIVE_INFINITY,
    };

    if (nextDisplayName && (priority < existing.displayNamePriority || !existing.displayName)) {
      existing.displayName = nextDisplayName;
      existing.displayNamePriority = priority;
    }
    if (nextDescription && (priority < existing.descriptionPriority || !existing.description)) {
      existing.description = nextDescription;
      existing.descriptionPriority = priority;
    }
    existing.groupLabel = pickFirstNonEmptyString(
      existing.groupLabel,
      details.chapter,
      details.displayPosition,
      suggestion?.elementPath
    );
    if (variant && !existing.localizedVariants.includes(variant)) {
      existing.localizedVariants.push(variant);
      existing.localizedVariants.sort(
        (left, right) =>
          getTemplateWorkflowLanguageVariantPriority(left) -
          getTemplateWorkflowLanguageVariantPriority(right)
      );
    } else if (!variant) {
      existing.hasBaseVariant = true;
    }
    aggregated.set(key, existing);
  });

  return new Map(
    Array.from(aggregated.entries()).map(([key, value]) => [
      key,
      {
        displayName: value.displayName,
        description: value.description,
        groupLabel: value.groupLabel,
        localizedVariants: normalizeLocalizedVariantsForDisplay(
          value.localizedVariants,
          value.hasBaseVariant,
          template.templateAssetManifest?.languageProfile?.sourceLanguage
        ),
      },
    ])
  );
}

function extractTemplateWorkflowLanguageVariant(key: string): string | undefined {
  const match = String(key || '')
    .trim()
    .match(/(?:[_-])(cn|jp|zh|ja|en)$/iu);
  return match?.[1]?.toLowerCase();
}

function getTemplateWorkflowLanguageVariantPriority(variant?: string): number {
  const normalized = String(variant || '')
    .trim()
    .toLowerCase();
  if (normalized === 'cn' || normalized === 'zh') {
    return 0;
  }
  if (normalized === 'jp' || normalized === 'ja') {
    return 1;
  }
  if (normalized === 'en') {
    return 2;
  }
  return 3;
}

function mergeLocalizedVariants(current?: string[], incoming?: string[]): string[] | undefined {
  const merged = Array.from(new Set([...(current || []), ...(incoming || [])]))
    .filter(Boolean)
    .sort(
      (left, right) =>
        getTemplateWorkflowLanguageVariantPriority(left) -
        getTemplateWorkflowLanguageVariantPriority(right)
    );
  return merged.length > 0 ? merged : undefined;
}

function normalizeLocalizedVariantsForDisplay(
  localizedVariants: string[],
  hasBaseVariant: boolean,
  sourceLanguage?: string
): string[] | undefined {
  const normalized = Array.from(
    new Set(
      (localizedVariants || [])
        .map((item) =>
          String(item || '')
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    )
  );
  const normalizedSourceLanguage =
    normalizeTemplateWorkflowLanguageCode(sourceLanguage) ||
    (hasBaseVariant && normalized.length > 0 ? 'zh' : undefined);

  if (
    hasBaseVariant &&
    normalizedSourceLanguage &&
    !normalized.includes(normalizedSourceLanguage)
  ) {
    normalized.unshift(normalizedSourceLanguage);
  }

  const merged = Array.from(new Set(normalized)).sort(
    (left, right) =>
      getTemplateWorkflowLanguageVariantPriority(left) -
      getTemplateWorkflowLanguageVariantPriority(right)
  );
  return merged.length > 0 ? merged : undefined;
}

function normalizeTemplateWorkflowLanguageCode(value: unknown): string | undefined {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (
    normalized === 'cn' ||
    normalized === 'zh-cn' ||
    normalized === 'zh-hans' ||
    normalized === 'zh-hans-cn'
  ) {
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

export function resolveTemplateAssetRenderPlanVersion(
  templateAssetManifest?: CarboneTemplateMeta['templateAssetManifest']
): number | undefined {
  if (!templateAssetManifest) {
    return undefined;
  }
  return templateAssetManifest.renderPlanVersion || templateAssetManifest.renderPlan?.version || 1;
}

export function resolveTemplateAssetFieldCount(
  templateAssetManifest?: CarboneTemplateMeta['templateAssetManifest'],
  fallbackFieldCount = 0
): number {
  if (!templateAssetManifest) {
    return fallbackFieldCount;
  }
  return (
    templateAssetManifest.fieldCount ||
    templateAssetManifest.templateFieldSpecs?.length ||
    fallbackFieldCount
  );
}

export function resolveTemplateAssetSource(
  templateAssetManifest?: CarboneTemplateMeta['templateAssetManifest']
): string {
  return templateAssetManifest?.metadata?.source || 'unknown';
}

function normalizeTemplateWorkflowParamKey(name: string): string {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return '';
  }

  return trimmed
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .replace(/^#/, '')
    .replace(/^\//, '')
    .replace(/^d\./, '')
    .trim();
}

function resolveTemplateWorkflowParamLabel(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    const normalized = normalizeTemplateWorkflowParamLabel(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return '模板参数';
}

function normalizeTemplateWorkflowParamLabel(value: unknown): string | undefined {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^[A-Za-z0-9_.[\]-]+$/u.test(trimmed)) {
    return undefined;
  }

  const withoutLanguageMarker = trimmed
    .replace(/\s*[（(](?:中文|日文|日语|日语翻译|英文|英语|zh|ja|cn|jp|en)[）)]\s*$/iu, '')
    .replace(/[_-](?:zh|ja|cn|jp|en)$/iu, '')
    .trim();

  return withoutLanguageMarker || trimmed;
}

function buildBilingualBaseKeyMap(keys: string[]): Map<string, string> {
  const normalizedKeys = Array.from(
    new Set(keys.map((item) => String(item || '').trim()).filter(Boolean))
  );
  const keySet = new Set(normalizedKeys);
  const map = new Map<string, string>();
  const languageVariants = ['cn', 'jp', 'zh', 'ja', 'en'];

  normalizedKeys.forEach((key) => {
    const match = key.match(/^(.*?)([_-](?:cn|jp|zh|ja|en))$/iu);
    if (!match?.[1]) {
      return;
    }
    const baseKey = match[1];
    const hasSibling = languageVariants.some(
      (lang) => keySet.has(`${baseKey}_${lang}`) || keySet.has(`${baseKey}-${lang}`)
    );
    if (hasSibling) {
      map.set(key, baseKey);
    }
  });

  return map;
}

export function normalizeWorkflowInputParamType(
  dataType: unknown,
  fieldName: string,
  buildWorkflowSemanticHint: BuildWorkflowSemanticHint
): WorkflowInputParamType {
  const hint = buildWorkflowSemanticHint(dataType, fieldName);
  if (/\b(number|int|float|double|decimal|amount|price|count|qty|quantity|ratio)\b/.test(hint)) {
    return 'number';
  }
  if (/\b(bool|boolean|flag|enabled)\b|\bis\b/.test(hint)) {
    return 'boolean';
  }
  if (/\b(date|time|deadline|day)\b/.test(hint)) {
    return 'date';
  }
  return 'string';
}

function normalizeWorkflowExampleValue(
  value: unknown,
  dataType: unknown,
  buildWorkflowSemanticHint: BuildWorkflowSemanticHint
): string | number | boolean | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const type = normalizeWorkflowInputParamType(dataType, '', buildWorkflowSemanticHint);
    if (type === 'number' && /^-?\d+(\.\d+)?$/.test(trimmed.replace(/,/g, ''))) {
      return Number(trimmed.replace(/,/g, ''));
    }
    if (type === 'boolean') {
      if (/^(true|false)$/i.test(trimmed)) {
        return trimmed.toLowerCase() === 'true';
      }
      if (trimmed === '是') return true;
      if (trimmed === '否') return false;
    }
    return trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

function variableToKey(variable: string): string {
  return String(variable || '')
    .replace(/^\{d\./, '')
    .replace(/\}$/, '');
}

export function slugFromTemplate(templateId: string): string {
  return String(templateId || '')
    .replace(/-/g, '')
    .slice(0, 8);
}

export function stripTemplateExtension(fileName: string): string {
  return String(fileName || '').replace(/\.[^.]+$/, '');
}
