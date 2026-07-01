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
import { safeText, escapeRegExp } from './document-xml-parser';
import { parseAmount, parseDate, formatCurrency, formatDate } from './workflow-parser-format';
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
import { tryParseJsonObject } from './workflow-ai';

const logger = new Logger('WorkflowRenderHelper');
export function buildRenderTranslationCandidate(
  spec: WorkflowTemplateFieldSpec,
  value: Record<string, unknown>,
  sourceLanguage: string,
  targetLanguages: string[]
): WorkflowRenderTranslationCandidate | undefined {
  if (!isAutoTranslatableTextField(spec)) {
    return undefined;
  }

  const sourceText = safeText(
    readLocalizedFieldValue(value, sourceLanguage) ?? value.source ?? value.value
  );
  if (!sourceText || shouldSkipAutomaticTranslationText(sourceText)) {
    return undefined;
  }

  const pendingLanguages = Array.from(new Set(targetLanguages))
    .map((lang) => normalizeTranslationLanguage(lang))
    .filter(
      (lang): lang is string =>
        Boolean(lang) && lang !== normalizeTranslationLanguage(sourceLanguage)
    )
    .filter((lang) => !safeText(readLocalizedFieldValue(value, lang)));
  if (pendingLanguages.length === 0) {
    return undefined;
  }

  return {
    fieldId: spec.fieldId,
    sourceLanguage: normalizeTranslationLanguage(sourceLanguage),
    sourceText,
    pendingLanguages,
  };
}

export async function applyBatchRenderTranslations(
  candidates: WorkflowRenderTranslationCandidate[],
  fieldValueMap: Map<string, Record<string, unknown>>,
  sourceTrace: Record<string, Record<string, unknown>>,
  warnings: string[],
  needsReviewFields: string[]
): Promise<void> {
  if (candidates.length === 0) {
    return;
  }

  const batches = new Map<string, Record<string, string>>();
  for (const candidate of candidates) {
    for (const targetLanguage of candidate.pendingLanguages) {
      const batchKey = `${candidate.sourceLanguage}::${targetLanguage}`;
      const batch = batches.get(batchKey) || {};
      batch[candidate.fieldId] = candidate.sourceText;
      batches.set(batchKey, batch);
    }
  }

  for (const [batchKey, batch] of batches.entries()) {
    const [sourceLanguage, targetLanguage] = batchKey.split('::');
    const translated = await batchTranslateRenderFields(batch, sourceLanguage, targetLanguage);
    Object.entries(translated).forEach(([fieldId, translatedText]) => {
      const fieldValue = fieldValueMap.get(fieldId);
      if (!fieldValue || !translatedText.trim()) {
        return;
      }
      setLocalizedValue(fieldValue, targetLanguage, translatedText.trim());
      const trace = sourceTrace[fieldId] || {};
      const translatedTargets = Array.isArray(trace.translatedTargets)
        ? trace.translatedTargets.map((item) => String(item))
        : [];
      if (!translatedTargets.includes(targetLanguage)) {
        translatedTargets.push(targetLanguage);
      }
      trace.translatedTargets = translatedTargets;
      trace.translationProvider = 'ai_orchestrator';
      trace.translationMode = 'batch';
      if (trace.resolution === 'pending_translation') {
        trace.resolution = 'llm_translated';
      }
      sourceTrace[fieldId] = trace;
    });
  }

  for (const candidate of candidates) {
    const fieldValue = fieldValueMap.get(candidate.fieldId);
    if (!fieldValue) {
      continue;
    }
    const unresolvedTargets = candidate.pendingLanguages.filter((lang) => {
      const translatedText = safeText(readLocalizedFieldValue(fieldValue, lang));
      return !translatedText;
    });
    if (unresolvedTargets.length === 0) {
      continue;
    }
    warnings.push(`字段 ${candidate.fieldId} 自动翻译失败，目标语言待人工确认`);
    needsReviewFields.push(candidate.fieldId);
    const trace = sourceTrace[candidate.fieldId] || {};
    trace.pendingTranslations = unresolvedTargets;
    trace.translationFailed = true;
    sourceTrace[candidate.fieldId] = trace;
  }
}

export async function batchTranslateRenderFields(
  batch: Record<string, string>,
  sourceLanguage: string,
  targetLanguage: string,
  retryCount = 0
): Promise<Record<string, string>> {
  if (Object.keys(batch).length === 0) {
    return {};
  }

  const aiOrchestratorUrl = getAiOrchestratorUrl();
  const aiModelId = process.env.AI_MODEL_ID || 'default';
  const maxRetries = 2;
  const sourceName = getTranslationLanguageName(sourceLanguage);
  const targetName = getTranslationLanguageName(targetLanguage);
  const prompt = [
    `你是一个专业的商务文档翻译助手。请将以下 JSON 对象中的值从${sourceName}翻译成${targetName}。`,
    '要求：',
    '1. 保持 JSON 结构和 key 完全不变，只翻译字符串值。',
    '2. 术语、公司名、项目名采用正式商务表达。',
    '3. 如果值本身是数字、日期、金额或无需翻译的符号，请保持原样。',
    '4. 直接返回 JSON 对象，不要包含解释、代码块或额外文本。',
    '待翻译内容：',
    JSON.stringify(batch, null, 2),
  ].join('\n');

  try {
    const response = await axios.post<{ response?: string }>(
      `${aiOrchestratorUrl}/ai/models/${aiModelId}/test`,
      { prompt },
      { timeout: 180000 }
    );
    const content = String(response.data?.response || '')
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const parsed = tryParseJsonObject(content);
    if (!parsed) {
      throw new Error('AI 翻译结果不是有效 JSON');
    }
    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
      const translatedText = safeText(value);
      if (translatedText) {
        acc[key] = translatedText;
      }
      return acc;
    }, {});
  } catch (error) {
    if (retryCount < maxRetries) {
      return batchTranslateRenderFields(batch, sourceLanguage, targetLanguage, retryCount + 1);
    }
    logger.warn(
      `批量翻译失败 (${sourceLanguage} -> ${targetLanguage}): ${error instanceof Error ? error.message : String(error)}`
    );
    return {};
  }
}

export function isAutoTranslatableTextField(spec: WorkflowTemplateFieldSpec): boolean {
  if ((spec.valueMode || 'scalar') !== 'scalar') {
    return false;
  }
  if (spec.policy === 'enum_mapping') {
    return false;
  }
  const normalizedType = String(spec.type || '')
    .trim()
    .toLowerCase();
  return !['number', 'boolean', 'date', 'currency_amount', 'bank_account', 'table_row'].includes(
    normalizedType
  );
}

export function shouldSkipAutomaticTranslationText(value: string): boolean {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return true;
  }
  if (/^(true|false|yes|no|是|否)$/iu.test(normalized)) {
    return true;
  }
  if (/^-?[\d,.]+%?$/u.test(normalized)) {
    return true;
  }
  if (/^[¥￥$€]?\s*[\d,.]+(?:元|円|日元|人民币|人民元|CNY|JPY|USD|EUR)?$/iu.test(normalized)) {
    return true;
  }
  if (/^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?$/u.test(normalized)) {
    return true;
  }
  return false;
}

export function applyLocalizedLanguageAliases(
  value: Record<string, unknown>,
  sourceLanguage: string,
  targetLanguages: string[]
): void {
  const languages = Array.from(new Set([sourceLanguage, ...targetLanguages]));
  for (const language of languages) {
    const localizedValue = readLocalizedFieldValue(value, language);
    if (localizedValue !== undefined) {
      setLocalizedValue(value, language, localizedValue);
    }
  }
}

export function readLocalizedFieldValue(value: Record<string, unknown>, language: string): unknown {
  for (const candidate of getLanguageAliases(language)) {
    if (value[candidate] !== undefined) {
      return value[candidate];
    }
  }
  return undefined;
}

export function setLocalizedValue(
  target: Record<string, unknown>,
  language: string,
  value: unknown
): void {
  for (const candidate of getLanguageAliases(language)) {
    target[candidate] = value;
  }
}

export function getLanguageAliases(language: string): string[] {
  const normalized = normalizeTranslationLanguage(language);
  switch (normalized) {
    case 'zh':
      return ['zh', 'cn'];
    case 'ja':
      return ['ja', 'jp'];
    case 'en':
      return ['en'];
    default:
      return normalized ? [normalized] : [];
  }
}

export function normalizeTranslationLanguage(language: string | undefined): string {
  const normalized = String(language || '')
    .trim()
    .toLowerCase();
  if (normalized === 'cn') return 'zh';
  if (normalized === 'jp') return 'ja';
  return normalized;
}

export function getTranslationLanguageName(language: string): string {
  switch (normalizeTranslationLanguage(language)) {
    case 'zh':
      return '中文';
    case 'ja':
      return '日语';
    case 'en':
      return '英文';
    default:
      return language || '目标语言';
  }
}
