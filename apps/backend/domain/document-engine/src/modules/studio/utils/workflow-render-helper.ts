import { Logger } from '@nestjs/common';
import axios from 'axios';
import { getAiOrchestratorUrl } from '../../../config/service-endpoints';
import {
  WorkflowTemplateFieldSpec,
  WorkflowResolvedAssets,
  WorkflowRenderTranslationCandidate,
  WorkflowTermAssets,
  Primitive,
  WorkflowBindingPlan,
  WorkflowBindingPlanBinding,
} from './workflow-assets';
import {
  safeText,
  escapeRegExp,
} from './document-xml-parser';
import {
  parseAmount,
  parseDate,
  formatCurrency,
  formatDate,
} from './workflow-parser-format';
import {
  normalizeTableListRows,
  resolveTabularRowWidth,
  shouldMergeBilingualTabularRows,
  mergeTabularCellText,
  resolveListColumnKeys,
} from './workflow-table-normalizer';
import {
  findTermMatch,
  findEnumMatch,
  resolveAssets,
  resolveTemplateFieldLanguage,
} from './workflow-discover';
import {
  tryParseJsonObject,
} from './workflow-ai';

import {
  readLocalizedFieldValue,
  setLocalizedValue,
  getLanguageAliases,
} from './workflow-translation-helper';
import {
  extractFieldValue,
  parseListValueFromText,
} from './workflow-input-helper';

const logger = new Logger('WorkflowRenderHelper');

// #region debug-point A:render-helper
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
      location: 'workflow-render-helper.ts',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};
// #endregion

function collectLocalizedOverrideFromSiblingKeys(
  userOverrides: Record<string, unknown> | undefined,
  fieldId: string,
  sourceLanguage: string,
  targetLanguages: string[],
): Record<string, unknown> | undefined {
  if (!userOverrides || typeof userOverrides !== 'object') {
    return undefined;
  }

  const languages = Array.from(new Set([sourceLanguage, ...targetLanguages]));
  const localizedOverride: Record<string, unknown> = {};

  for (const language of languages) {
    for (const alias of getLanguageAliases(language)) {
      const siblingKey = `${fieldId}_${alias}`;
      if (userOverrides[siblingKey] !== undefined) {
        localizedOverride[alias] = userOverrides[siblingKey];
      }
    }
  }

  return Object.keys(localizedOverride).length > 0 ? localizedOverride : undefined;
}

export function resolveFieldValue(
  spec: WorkflowTemplateFieldSpec,
  userInput: string,
  sourceLanguage: string,
  targetLanguages: string[],
  userOverrides?: Record<string, unknown>,
  assets?: WorkflowResolvedAssets,
): {
  value: Record<string, unknown>;
  sourceTrace: Record<string, unknown>;
  warnings: string[];
  missingFields: string[];
  needsReviewFields: string[];
} {
  const warnings: string[] = [];
  const missingFields: string[] = [];
  const needsReviewFields: string[] = [];
  const targetLangs = Array.from(new Set([...(spec.targetLanguages || []), ...targetLanguages]));
  const overrideValue = userOverrides?.[spec.fieldId]
    ?? collectLocalizedOverrideFromSiblingKeys(userOverrides, spec.fieldId, sourceLanguage, targetLangs);
  const sourceValue = extractFieldValue(spec.fieldId, userInput, overrideValue);
  const valueMode = spec.valueMode || 'scalar';

  const resolvedValue: Record<string, unknown> = {};
  const sourceTrace: Record<string, unknown> = {};

  if (valueMode === 'list') {
    if (Array.isArray(overrideValue)) {
      resolvedValue.value = normalizeTableListRows(
        overrideValue,
        spec,
        sourceLanguage,
        targetLangs,
      );
      sourceTrace.resolution = 'structured_override';
      sourceTrace.valueMode = 'list';
    } else {
      const parsedListValue = parseListValueFromText(
        typeof overrideValue === 'string' ? overrideValue : userInput,
        spec,
      );
      if (parsedListValue && parsedListValue.length > 0) {
        resolvedValue.value = normalizeTableListRows(
          parsedListValue,
          spec,
          sourceLanguage,
          targetLangs,
        );
        sourceTrace.resolution = 'tabular_text_parse';
        sourceTrace.valueMode = 'list';
        sourceTrace.rowCount = parsedListValue.length;
      } else {
        if (overrideValue !== undefined) {
          warnings.push(`字段 ${spec.fieldId} 需要数组输入`);
          needsReviewFields.push(spec.fieldId);
        }
        if (spec.required) {
          missingFields.push(spec.fieldId);
        }
        sourceTrace.resolution = 'missing';
        sourceTrace.valueMode = 'list';
      }
    }
    return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
  }

  if (valueMode === 'object') {
    if (overrideValue && typeof overrideValue === 'object' && !Array.isArray(overrideValue)) {
      resolvedValue.value = overrideValue;
      sourceTrace.resolution = 'structured_override';
      sourceTrace.valueMode = 'object';
    } else {
      if (overrideValue !== undefined) {
        warnings.push(`字段 ${spec.fieldId} 需要对象输入`);
        needsReviewFields.push(spec.fieldId);
      }
      if (spec.required) {
        missingFields.push(spec.fieldId);
      }
      sourceTrace.resolution = 'missing';
      sourceTrace.valueMode = 'object';
    }
    return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
  }

  if ((sourceValue === undefined || sourceValue === null || sourceValue === '') && spec.required) {
    missingFields.push(spec.fieldId);
  }

  if (overrideValue && typeof overrideValue === 'object' && !Array.isArray(overrideValue)) {
    const localizedOverride = overrideValue as Record<string, unknown>;
    const localizedKeys = Array.from(new Set([
      'source',
      'value',
      ...getLanguageAliases(sourceLanguage),
      ...targetLangs.flatMap((lang) => getLanguageAliases(lang)),
    ]));
    const hasLocalizedValue = localizedKeys.some((key) => localizedOverride[key] !== undefined);
    if (hasLocalizedValue) {
      const sourceText = safeText(
        readLocalizedFieldValue(localizedOverride, sourceLanguage)
        ?? localizedOverride.source
        ?? localizedOverride.value,
      );
      if (localizedOverride.source !== undefined || sourceText) {
        resolvedValue.source = safeText(localizedOverride.source) || sourceText;
      }
      if (localizedOverride.value !== undefined) {
        resolvedValue.value = localizedOverride.value;
      }
      if (readLocalizedFieldValue(localizedOverride, sourceLanguage) !== undefined || sourceText) {
        setLocalizedValue(resolvedValue, sourceLanguage, sourceText);
      }
      for (const lang of targetLangs) {
        const langText = safeText(readLocalizedFieldValue(localizedOverride, lang));
        setLocalizedValue(
          resolvedValue,
          lang,
          langText || (lang === sourceLanguage ? sourceText : ''),
        );
      }
      sourceTrace.resolution = 'localized_override';
      sourceTrace.valueMode = 'scalar';
      return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
    }
  }

  if (spec.policy === 'dictionary_first') {
    const normalizedSource = safeText(sourceValue);
    const termMatch = normalizedSource
      ? findTermMatch(spec.fieldId, normalizedSource, assets || resolveAssets())
      : undefined;
    if (termMatch) {
      resolvedValue.source = termMatch.sourceValue;
      resolvedValue[sourceLanguage] = termMatch.translations[sourceLanguage] || termMatch.sourceValue;
      for (const lang of targetLangs) {
        resolvedValue[lang] = termMatch.translations[lang];
      }
      sourceTrace.resolution = 'dictionary_hit';
      sourceTrace.termId = termMatch.termId;
      sourceTrace.scope = termMatch.scope || 'global';
      sourceTrace.termVersion = termMatch.version;
      sourceTrace.pendingTranslations = targetLangs.filter((lang) => !termMatch.translations[lang]);
    } else {
      resolvedValue.source = normalizedSource || '';
      resolvedValue[sourceLanguage] = normalizedSource || '';
      for (const lang of targetLangs) {
        resolvedValue[lang] = lang === sourceLanguage ? normalizedSource || '' : '';
      }
      if (normalizedSource) {
        warnings.push(`字段 ${spec.fieldId} 未命中术语库`);
        needsReviewFields.push(spec.fieldId);
      }
      sourceTrace.resolution = normalizedSource ? 'dictionary_miss' : 'missing';
    }
    return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
  }

  if (spec.policy === 'enum_mapping') {
    const matchedEnum = findEnumMatch(
      spec.fieldId,
      safeText(sourceValue),
      assets || resolveAssets(),
    );
    if (matchedEnum) {
      resolvedValue.code = matchedEnum.code;
      for (const lang of Array.from(new Set([sourceLanguage, ...targetLangs]))) {
        resolvedValue[lang] = matchedEnum.labels[lang] || matchedEnum.labels.zh;
      }
      sourceTrace.resolution = 'enum_hit';
      sourceTrace.enumName = spec.fieldId;
      sourceTrace.code = matchedEnum.code;
      sourceTrace.scope = matchedEnum.scope || 'global';
      sourceTrace.enumVersion = matchedEnum.version;
    } else {
      if (spec.required) {
        missingFields.push(spec.fieldId);
      }
      warnings.push(`字段 ${spec.fieldId} 未命中枚举表`);
      needsReviewFields.push(spec.fieldId);
      sourceTrace.resolution = 'enum_miss';
    }
    return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
  }

  if (spec.policy === 'format_only') {
    if (spec.type === 'currency_amount') {
      const amount = parseAmount(sourceValue);
      if (amount === undefined) {
        if (spec.required) {
          missingFields.push(spec.fieldId);
        }
        sourceTrace.resolution = 'missing';
        return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
      }
      resolvedValue.value = amount;
      resolvedValue.currency = 'CNY';
      resolvedValue.zh = formatCurrency(amount, 'zh');
      for (const lang of targetLangs) {
        resolvedValue[lang] = formatCurrency(amount, lang);
      }
      sourceTrace.resolution = 'format_rule';
      sourceTrace.rule = 'fmt_amount_cny_v1';
      return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
    }

    if (spec.type === 'date') {
      const normalizedDate = parseDate(sourceValue);
      // #region debug-point A:signing-date-resolve
      if (spec.fieldId === 'contract.signingDate') {
        debugReport('A', 'resolving signingDate field value', {
          fieldId: spec.fieldId,
          sourceValue: sourceValue === undefined ? null : sourceValue,
          normalizedDate: normalizedDate || null,
          overrideType: overrideValue === undefined ? 'undefined' : Array.isArray(overrideValue) ? 'array' : typeof overrideValue,
          sourceLanguage,
          targetLanguages: targetLangs,
          policy: spec.policy || null,
          type: spec.type || null,
        });
      }
      // #endregion
      if (!normalizedDate) {
        if (spec.required) {
          missingFields.push(spec.fieldId);
        }
        sourceTrace.resolution = 'missing';
        return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
      }
      resolvedValue.value = normalizedDate;
      resolvedValue.zh = formatDate(normalizedDate, 'zh');
      for (const lang of targetLangs) {
        resolvedValue[lang] = formatDate(normalizedDate, lang);
      }
      // #region debug-point A:signing-date-resolve-result
      if (spec.fieldId === 'contract.signingDate') {
        debugReport('A', 'resolved signingDate localized value', {
          fieldId: spec.fieldId,
          resolvedValue,
          sourceTrace: {
            resolution: 'format_rule',
            rule: 'fmt_date_v1',
          },
        });
      }
      // #endregion
      sourceTrace.resolution = 'format_rule';
      sourceTrace.rule = 'fmt_date_v1';
      return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
    }

    const textValue = safeText(sourceValue);
    if (textValue) {
      resolvedValue[sourceLanguage] = textValue;
      for (const lang of targetLangs) {
        resolvedValue[lang] = textValue;
      }
      sourceTrace.resolution = 'copy';
    } else {
      sourceTrace.resolution = 'missing';
    }
    return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
  }

  const textValue = safeText(sourceValue);
  resolvedValue[sourceLanguage] = textValue;
  for (const lang of targetLangs) {
    resolvedValue[lang] = lang === sourceLanguage ? textValue : '';
  }
  if (textValue && targetLangs.some((lang) => lang !== sourceLanguage)) {
    sourceTrace.resolution = 'pending_translation';
    sourceTrace.pendingTranslations = targetLangs.filter((lang) => lang !== sourceLanguage);
  } else {
    sourceTrace.resolution = textValue ? 'copy' : 'missing';
  }

  return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
}


export * from './workflow-translation-helper';
export {
  readSelector,
  extractFieldValue,
  parseListValueFromText,
} from './workflow-input-helper';

export function listBindingVariablePaths(
  binding: WorkflowBindingPlanBinding,
): string[] {
  const variablePath = safeText(binding.variablePath);
  if (!variablePath) {
    return [];
  }

  const language = safeText(binding.language);
  if (!language) {
    return [variablePath];
  }

  const aliases = getLanguageAliases(language);
  if (aliases.length <= 1) {
    return [variablePath];
  }

  const canonicalSuffix = `_${aliases[0]}`;
  if (!variablePath.endsWith(canonicalSuffix)) {
    return [variablePath];
  }

  const basePath = variablePath.slice(0, -canonicalSuffix.length);
  return [
    variablePath,
    ...aliases
      .slice(1)
      .map((alias) => `${basePath}_${alias}`),
  ];
}

export function compileBindingPlan(
  templateId: string,
  version: number,
  templateFieldSpecs: WorkflowTemplateFieldSpec[],
  sourceLanguage = 'zh',
  targetLanguages: string[] = [],
): WorkflowBindingPlan {
  const bindings: WorkflowBindingPlanBinding[] = [];
  const seen = new Set<string>();

  for (const spec of templateFieldSpecs) {
    const valueMode = spec.valueMode || 'scalar';
    if (valueMode === 'list' || valueMode === 'object') {
      const variablePath = spec.fieldId;
      if (!seen.has(variablePath)) {
        seen.add(variablePath);
        bindings.push({
          fieldId: spec.fieldId,
          variablePath,
          valueSelector: `${spec.fieldId}.value`,
          transform: 'identity',
          required: Boolean(spec.required),
        });
      }
      continue;
    }

    if (valueMode !== 'scalar') {
      continue;
    }

    const explicitFieldLanguage = resolveTemplateFieldLanguage(spec.fieldId);
    if (explicitFieldLanguage) {
      const variablePath = spec.fieldId;
      if (!seen.has(variablePath)) {
        seen.add(variablePath);
        bindings.push({
          fieldId: spec.fieldId,
          variablePath,
          valueSelector: `${spec.fieldId}.${explicitFieldLanguage}`,
          language: explicitFieldLanguage,
          transform: inferTransform(spec),
          required: Boolean(spec.required),
        });
      }
      continue;
    }

    const languages = Array.from(new Set([
      spec.sourceLanguage || sourceLanguage,
      ...(spec.targetLanguages || []),
      ...targetLanguages,
    ]));

    for (const lang of languages) {
      const variablePath = `${spec.fieldId}_${lang}`;
      if (seen.has(variablePath)) {
        continue;
      }
      seen.add(variablePath);
      bindings.push({
        fieldId: spec.fieldId,
        variablePath,
        valueSelector: `${spec.fieldId}.${lang}`,
        language: lang,
        transform: inferTransform(spec),
        required: Boolean(spec.required),
      });
    }

    if (spec.policy === 'enum_mapping') {
      const codePath = `${spec.fieldId}_code`;
      if (!seen.has(codePath)) {
        seen.add(codePath);
        bindings.push({
          fieldId: spec.fieldId,
          variablePath: codePath,
          valueSelector: `${spec.fieldId}.code`,
          transform: 'identity',
          required: false,
        });
      }
    }
  }

  return {
    templateId,
    version,
    bindings,
  };
}

export function inferTransform(spec: WorkflowTemplateFieldSpec): string {
  if (spec.type === 'currency_amount') {
    return 'currency_format';
  }
  if (spec.type === 'date') {
    return 'date_format';
  }
  return 'identity';
}
