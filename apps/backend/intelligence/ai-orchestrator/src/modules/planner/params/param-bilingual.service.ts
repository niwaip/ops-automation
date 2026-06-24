import { Injectable, Logger } from '@nestjs/common';
import { RecognizeParamsResponseDTO } from '../../../interfaces';
import { isPlaceholderTextValue } from '../../../common/placeholder-value';
import { ModelService } from '../../model/model.service';
import { SkillMatchResult } from '../../react-engine/interfaces';

@Injectable()
export class ParamBilingualService {
  private readonly logger = new Logger(ParamBilingualService.name);

  constructor(private readonly modelService: ModelService) {}

  identifyBilingualPairs(schema: SkillMatchResult['paramsSchema']): Array<{
    base: string;
    aKey: string;
    bKey: string;
    aLang: 'zh' | 'ja' | 'en';
    bLang: 'zh' | 'ja' | 'en';
  }> {
    const keys = Object.keys(schema.properties || {});
    const pairs: Array<{
      base: string;
      aKey: string;
      bKey: string;
      aLang: 'zh' | 'ja' | 'en';
      bLang: 'zh' | 'ja' | 'en';
    }> = [];
    const patterns: Array<{ aSuffix: string; aLang: 'zh'; bSuffix: string; bLang: 'ja' | 'en' }> = [
      { aSuffix: '_cn', aLang: 'zh', bSuffix: '_jp', bLang: 'ja' },
      { aSuffix: '_cn', aLang: 'zh', bSuffix: '_en', bLang: 'en' },
      { aSuffix: '_zh', aLang: 'zh', bSuffix: '_ja', bLang: 'ja' },
      { aSuffix: '_zh', aLang: 'zh', bSuffix: '_en', bLang: 'en' },
    ];
    const seen = new Set<string>();

    for (const key of keys) {
      for (const pattern of patterns) {
        if (!key.endsWith(pattern.aSuffix)) {
          continue;
        }
        const base = key.slice(0, -pattern.aSuffix.length);
        const bKey = `${base}${pattern.bSuffix}`;
        if (!keys.includes(bKey)) {
          continue;
        }
        const stableKey = [key, bKey].sort().join('::');
        if (seen.has(stableKey)) {
          continue;
        }
        seen.add(stableKey);
        pairs.push({ base, aKey: key, bKey, aLang: pattern.aLang, bLang: pattern.bLang });
      }
    }

    return pairs;
  }

  async applyBilingualCompletionToRecognized(
    recognized: RecognizeParamsResponseDTO,
    schema: SkillMatchResult['paramsSchema']
  ): Promise<RecognizeParamsResponseDTO> {
    const bilingualPairs = this.identifyBilingualPairs(schema);
    if (bilingualPairs.length === 0) {
      return recognized;
    }

    const params: Record<string, unknown> = { ...(recognized.params || {}) };
    const fieldConfidences: Record<string, number> = {
      ...(recognized.field_confidences || {}),
    } as Record<string, number>;
    const translateBatches: Record<string, Record<string, string>> = {};

    const enqueueTranslate = (
      sourceLang: 'zh' | 'ja' | 'en',
      targetLang: 'zh' | 'ja' | 'en',
      targetKey: string,
      value: string
    ) => {
      const batchKey = `${sourceLang}::${targetLang}`;
      if (!translateBatches[batchKey]) {
        translateBatches[batchKey] = {};
      }
      translateBatches[batchKey][targetKey] = value;
    };

    for (const pair of bilingualPairs) {
      const prop = schema.properties[pair.aKey] || schema.properties[pair.bKey];
      const aValue = this.normalizeMeaningfulInputValue(params[pair.aKey]);
      const bValue = this.normalizeMeaningfulInputValue(params[pair.bKey]);

      const normalizedA = this.hasMeaningfulRequiredInputValue(aValue) ? aValue : undefined;
      const normalizedB = this.hasMeaningfulRequiredInputValue(bValue) ? bValue : undefined;

      if (normalizedA !== undefined && normalizedB === undefined) {
        if (prop?.type !== 'string') {
          params[pair.bKey] = normalizedA;
          if (
            typeof fieldConfidences[pair.aKey] === 'number' &&
            typeof fieldConfidences[pair.bKey] !== 'number'
          ) {
            fieldConfidences[pair.bKey] = Math.max(
              0,
              Math.min(1, fieldConfidences[pair.aKey] as number)
            );
          }
          continue;
        }
        if (
          typeof normalizedA === 'string' &&
          normalizedA.trim() &&
          !isPlaceholderTextValue(normalizedA)
        ) {
          enqueueTranslate(pair.aLang, pair.bLang, pair.bKey, normalizedA.trim());
          if (
            typeof fieldConfidences[pair.aKey] === 'number' &&
            typeof fieldConfidences[pair.bKey] !== 'number'
          ) {
            fieldConfidences[pair.bKey] = Math.max(
              0.8,
              Math.min(0.95, fieldConfidences[pair.aKey] as number)
            );
          }
        }
        continue;
      }

      if (normalizedB !== undefined && normalizedA === undefined) {
        if (prop?.type !== 'string') {
          params[pair.aKey] = normalizedB;
          if (
            typeof fieldConfidences[pair.bKey] === 'number' &&
            typeof fieldConfidences[pair.aKey] !== 'number'
          ) {
            fieldConfidences[pair.aKey] = Math.max(
              0,
              Math.min(1, fieldConfidences[pair.bKey] as number)
            );
          }
          continue;
        }
        if (
          typeof normalizedB === 'string' &&
          normalizedB.trim() &&
          !isPlaceholderTextValue(normalizedB)
        ) {
          enqueueTranslate(pair.bLang, pair.aLang, pair.aKey, normalizedB.trim());
          if (
            typeof fieldConfidences[pair.bKey] === 'number' &&
            typeof fieldConfidences[pair.aKey] !== 'number'
          ) {
            fieldConfidences[pair.aKey] = Math.max(
              0.8,
              Math.min(0.95, fieldConfidences[pair.bKey] as number)
            );
          }
        }
      }
    }

    for (const [batchKey, batch] of Object.entries(translateBatches)) {
      const [sourceLang, targetLang] = batchKey.split('::') as [
        'zh' | 'ja' | 'en',
        'zh' | 'ja' | 'en',
      ];
      if (Object.keys(batch).length === 0) continue;
      const translated = await this.batchTranslate(batch, sourceLang, targetLang);
      Object.assign(params, translated);
      for (const key of Object.keys(translated)) {
        if (typeof fieldConfidences[key] !== 'number') {
          fieldConfidences[key] = 0.85;
        }
      }
    }

    const nextFieldConfidences =
      Object.keys(fieldConfidences).length > 0 ? fieldConfidences : recognized.field_confidences;

    return {
      ...recognized,
      params,
      ...(nextFieldConfidences ? { field_confidences: nextFieldConfidences } : {}),
    };
  }

  async batchTranslate(
    data: Record<string, string>,
    sourceLang: 'zh' | 'ja' | 'en',
    targetLang: 'zh' | 'ja' | 'en'
  ): Promise<Record<string, string>> {
    const langNameMap: Record<'zh' | 'ja' | 'en', string> = {
      zh: '中文',
      ja: '日语',
      en: '英文',
    };
    const sourceName = langNameMap[sourceLang];
    const targetName = langNameMap[targetLang];
    const prompt = `你是一个专业的合同翻译助手。请将以下 JSON 对象中的值从${sourceName}翻译成${targetName}。
要求：
1. 保持 JSON 结构不变，只翻译值。
2. 翻译应准确、专业，符合法律/商务合同语境。
3. 直接返回翻译后的 JSON 对象，不要包含任何解释或代码块标签。
待翻译内容：
${JSON.stringify(data, null, 2)}`;

    try {
      const response = await this.modelService.callModel('default', prompt, 'auxiliary');
      const cleanContent = response.content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanContent);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string>;
      }
      return { ...data };
    } catch (error) {
      this.logger.warn(
        `Planner bilingual translation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { ...data };
    }
  }

  private hasMeaningfulRequiredInputValue(value: unknown): boolean {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 && !isPlaceholderTextValue(trimmed);
    }
    if (Array.isArray(value)) {
      return value.some((item) => this.hasMeaningfulRequiredInputValue(item));
    }
    if (typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some((item) =>
        this.hasMeaningfulRequiredInputValue(item)
      );
    }
    return true;
  }

  private normalizeMeaningfulInputValue(value: unknown): unknown {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 && !isPlaceholderTextValue(trimmed) ? trimmed : undefined;
    }
    if (Array.isArray(value)) {
      const normalized = value
        .map((item) => this.normalizeMeaningfulInputValue(item))
        .filter((item) => item !== undefined);
      return normalized.length > 0 ? normalized : undefined;
    }
    if (typeof value === 'object') {
      const normalizedEntries = Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, this.normalizeMeaningfulInputValue(item)] as const)
        .filter(([, item]) => item !== undefined);
      return normalizedEntries.length > 0 ? Object.fromEntries(normalizedEntries) : undefined;
    }
    return value;
  }
}
