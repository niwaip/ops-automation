import { Logger } from '@nestjs/common';
import {
  WorkflowDocumentIR,
  WorkflowDocumentElement,
  WorkflowAnchor,
  WorkflowLanguageProfile,
  WorkflowTemplateFieldSpec,
  WorkflowFieldDictionaryEntry,
  WorkflowTermEntry,
  WorkflowEnumItem,
  WorkflowResolvedAssets,
  WorkflowTermAssets,
  WorkflowAnalyzeFieldResult,
  WorkflowCandidateLocation,
  WorkflowCandidateLanguageRelation,
  WorkflowFieldCandidate,
  WorkflowRecognizeBlockResult,
  WorkflowRecognitionBlockInput,
  WorkflowRecognitionAiSuggestion,
  WorkflowSourceBinding,
  GLOBAL_FIELD_DICTIONARY,
  GLOBAL_TERMBASE,
  TENANT_TERMBASE,
  GLOBAL_ENUM_MAPPINGS,
} from './workflow-assets';
import {
  safeText,
  normalizeLookupText,
  extractAnchorPrefix,
  inferRecognitionBlockTitle,
} from './workflow-parser-format';
import {
  inferSectionInfo,
} from './workflow-similarity';

const logger = new Logger('WorkflowDiscover');

export function resolveAssets(termAssets?: WorkflowTermAssets): WorkflowResolvedAssets {
  return {
    fieldDictionary: [
      ...(termAssets?.fieldDictionary || []),
      ...GLOBAL_FIELD_DICTIONARY,
    ],
    termbase: [
      ...(termAssets?.termbase || []),
      ...TENANT_TERMBASE,
      ...GLOBAL_TERMBASE,
    ],
    enumMappings: {
      ...GLOBAL_ENUM_MAPPINGS,
      ...(termAssets?.enumMappings || {}),
    },
  };
}

export function scopePriority(scope?: 'global' | 'tenant' | 'template'): number {
  if (scope === 'template') {
    return 3;
  }
  if (scope === 'tenant') {
    return 2;
  }
  return 1;
}

export function isAssetActive(status?: string): boolean {
  return status !== 'deprecated' && status !== 'draft';
}

export function findTermMatch(
  fieldId: string,
  text: string,
  assets: WorkflowResolvedAssets,
): WorkflowTermEntry | undefined {
  const normalized = normalizeLookupText(text);
  const matches = assets.termbase
    .filter((entry) =>
      isAssetActive(entry.status)
      && entry.applicableFieldIds.includes(fieldId)
    )
    .map((entry) => {
      const normalizedSource = normalizeLookupText(entry.normalizedSourceValue || entry.sourceValue);
      if (!normalizedSource) {
        return undefined;
      }
      if (!(normalized === normalizedSource || normalized.includes(normalizedSource))) {
        return undefined;
      }
      return {
        entry,
        normalizedSource,
      };
    })
    .filter(Boolean) as Array<{ entry: WorkflowTermEntry; normalizedSource: string }>;

  matches.sort((left, right) => {
    const scopeDelta = scopePriority(right.entry.scope) - scopePriority(left.entry.scope);
    if (scopeDelta !== 0) {
      return scopeDelta;
    }
    return right.normalizedSource.length - left.normalizedSource.length;
  });

  return matches[0]?.entry;
}

export function findEnumMatch(
  fieldId: string,
  sourceValue: string,
  assets: WorkflowResolvedAssets,
): WorkflowEnumItem | undefined {
  const items = assets.enumMappings[fieldId] || [];
  const normalized = normalizeLookupText(sourceValue);
  const matches = items
    .filter((item) => isAssetActive(item.status))
    .filter((item) =>
      item.aliases.some((alias) => normalizeLookupText(alias) === normalized)
      || Object.values(item.labels).some((label) => normalizeLookupText(label) === normalized)
    );

  matches.sort((left, right) => scopePriority(right.scope) - scopePriority(left.scope));
  return matches[0];
}

export function matchFieldDictionary(
  text: string,
  assets: WorkflowResolvedAssets,
): WorkflowFieldDictionaryEntry | undefined {
  const normalized = normalizeLookupText(text);
  const matches = assets.fieldDictionary
    .filter((entry) => isAssetActive(entry.status))
    .map((entry) => {
      const matchedAlias = entry.aliases.find((alias) => {
        const normalizedAlias = normalizeLookupText(alias);
        return (
          normalizedAlias
          && (normalized === normalizedAlias
            || normalized.includes(normalizedAlias)
            || normalizedAlias.includes(normalized))
        );
      });
      if (!matchedAlias) {
        return undefined;
      }
      return {
        entry,
        aliasLength: matchedAlias.length,
      };
    })
    .filter(Boolean) as Array<{ entry: WorkflowFieldDictionaryEntry; aliasLength: number }>;

  matches.sort((left, right) => {
    const scopeDelta = scopePriority(right.entry.scope) - scopePriority(left.entry.scope);
    if (scopeDelta !== 0) {
      return scopeDelta;
    }
    return right.aliasLength - left.aliasLength;
  });

  return matches[0]?.entry;
}

export function computeCandidateGroupCompareStatus(
  candidates: WorkflowFieldCandidate[],
): 'aligned' | 'partial' | 'attention' {
  if (candidates.length === 0) {
    return 'attention';
  }
  const matchedCount = candidates.filter((candidate) => Boolean(safeText(candidate.matchText))).length;
  if (matchedCount === 0) {
    return 'attention';
  }
  return matchedCount === candidates.length ? 'aligned' : 'partial';
}

export function computeCandidateGroupCompareMode(
  candidates: WorkflowFieldCandidate[],
): 'section_loose_compare' | 'global_probe_fallback' | 'structure_only' {
  if (candidates.some((candidate) => candidate.compareMode === 'section_loose_compare')) {
    return 'section_loose_compare';
  }
  if (candidates.some((candidate) => candidate.compareMode === 'global_probe_fallback')) {
    return 'global_probe_fallback';
  }
  return 'structure_only';
}

export function computeCandidateGroupCompareScore(candidates: WorkflowFieldCandidate[]): number {
  if (candidates.length === 0) {
    return 0;
  }
  return Math.max(
    ...candidates.map((candidate) => Number(candidate.sectionMatchScore || 0)),
  );
}

export function isCandidateMatchedToBlock(
  candidate: WorkflowFieldCandidate,
  blockId: string,
  templateText: string,
  sectionTitle: string,
): boolean {
  if (candidate.sourceBlockId === blockId) {
    return true;
  }
  const normalizedTemplateText = normalizeLookupText(templateText);
  const normalizedAnchor = normalizeLookupText(candidate.anchorText);
  const normalizedSegment = normalizeLookupText(candidate.segmentText);
  const normalizedSectionTitle = normalizeLookupText(sectionTitle);
  const normalizedCandidateSection = normalizeLookupText(candidate.sectionTitle || candidate.sectionId);

  return Boolean(
    (normalizedAnchor && normalizedTemplateText.includes(normalizedAnchor))
    || (normalizedSegment && normalizedTemplateText.includes(normalizedSegment))
    || (normalizedCandidateSection && normalizedSectionTitle && normalizedCandidateSection === normalizedSectionTitle)
  );
}

export function extractBlockSampleExcerpt(
  sampleText: string,
  candidates: WorkflowFieldCandidate[],
  fallbackText: string,
): string {
  const normalizedSampleText = safeText(sampleText);
  if (!normalizedSampleText) {
    return '';
  }

  const probes = [
    ...candidates.map((candidate) => safeText(candidate.matchText)),
    ...candidates.map((candidate) => safeText(candidate.sampleValue)),
    ...candidates.map((candidate) => safeText(candidate.anchorText)),
    safeText(fallbackText).slice(0, 20),
  ].filter(Boolean);

  for (const probe of probes) {
    const index = normalizedSampleText.indexOf(probe);
    if (index >= 0) {
      const start = Math.max(0, index - 80);
      const end = Math.min(normalizedSampleText.length, index + probe.length + 160);
      return normalizedSampleText.slice(start, end);
    }
  }

  return normalizedSampleText.slice(0, 240);
}

export function buildFallbackRecognitionBlockResult(block: WorkflowRecognitionBlockInput): WorkflowRecognizeBlockResult {
  const suggestionCount = block.fallbackFields.length;
  const fallbackReason = suggestionCount > 0 ? 'rule_based_block_scan' : 'rule_based_empty';
  return {
    blockId: block.blockId,
    blockType: block.blockType,
    title: block.title,
    sectionTitle: block.sectionTitle,
    sourceExcerpt: block.templateText.slice(0, 120),
    suggestionCount,
    fieldIds: block.fallbackFields.map((field) => field.fieldId),
    aiCallSucceeded: false,
    resultStatus: suggestionCount > 0 ? 'fallback_success' : 'empty',
    warnings: suggestionCount > 0 ? [] : ['当前块未识别到字段候选'],
    retryCount: 0,
    durationMs: 0,
    fallbackReason,
    contextAnalysis: {
      requestSummary: `块 ${block.blockId} (${block.blockType}) 已进入识别队列`,
      responseSummary: suggestionCount > 0
        ? `通过回退链路识别到 ${suggestionCount} 个字段`
        : '当前块未返回字段候选',
      cacheHit: false,
      fallbackReason,
      retryCount: 0,
    },
  };
}

export function buildWorkflowRecognitionPrompt(input: {
  block: WorkflowRecognitionBlockInput;
  understandingSummary: string;
  sectionSummary: string;
  sourceLanguage: string;
  targetLanguages: string[];
  assets: WorkflowResolvedAssets;
  skill?: any;
}): string {
  const targetLanguageText = input.targetLanguages.length > 0
    ? input.targetLanguages.join(', ')
    : 'single_language';
  const candidateFieldsJson = JSON.stringify(input.block.candidates.slice(0, 8), null, 2);
  
  const skillParameters = input.skill?.parameters || [];
  const skillHints = Array.isArray(skillParameters) 
    ? skillParameters
        .map((p: any) => `- ${p.name}: ${p.usage || ''} | 类型: ${p.dataType || 'text'} | 提取提示: ${p.extractionHint || ''}`)
        .join('\n')
    : '';
  const skillDescription = input.skill?.templateDescription || '';

  const relatedFieldIds = new Set(
    input.block.candidates
      .map((candidate) => candidate.fieldIdHint)
      .filter((fieldId): fieldId is string => Boolean(fieldId))
  );
  const dictionaryHints = input.assets.fieldDictionary
    .filter((entry) => relatedFieldIds.size > 0 && relatedFieldIds.has(entry.fieldId))
    .slice(0, 10)
    .map((entry) => `${entry.fieldId}: ${entry.aliases.slice(0, 5).join(' / ')} | ${entry.type} | ${entry.policy}`)
    .join('\n');
  const termHints = input.assets.termbase
    .filter((entry) => entry.applicableFieldIds.some((fieldId) => relatedFieldIds.has(fieldId)))
    .slice(0, 8)
    .map((entry) => `${entry.termId}: ${entry.sourceValue} => ${Object.entries(entry.translations).map(([lang, value]) => `${lang}:${value}`).join(', ')}`)
    .join('\n');
  const enumHints = Array.from(relatedFieldIds)
    .flatMap((fieldId) =>
      (input.assets.enumMappings[fieldId] || []).map((item: WorkflowEnumItem) =>
        `${fieldId}: ${item.code} => ${Object.entries(item.labels).map(([lang, value]) => `${lang}:${value}`).join(', ')}`
      )
    )
    .slice(0, 8)
    .join('\n');
  const sectionCompareHints = input.block.candidates
    .map((candidate) => [
      `candidateId=${candidate.candidateId}`,
      `compareMode=${candidate.compareMode || 'structure_only'}`,
      `sectionMatchScore=${candidate.sectionMatchScore || 0}`,
      `fieldIdHint=${candidate.fieldIdHint || 'unknown'}`,
      `matchText=${safeText(candidate.matchText || candidate.segmentText) || 'none'}`,
    ].join(' | '))
    .filter(Boolean)
    .slice(0, 5)
    .join('\n');

  return `你是合同模板参数识别助手。请基于当前章节、当前块文本和待定参数候选列表，识别哪些候选应成为正式模板字段。

${skillDescription ? `【AI 指南：文档背景】\n${skillDescription}\n` : ''}

要求：
1. 仅处理当前块相关的候选，不要扩散到整篇文档。
2. 优先依据当前章节内的完整文本比较、块上下文和候选片段判断，不要把字段词典是否命中当作唯一依据。
3. 即使字段不在“字段词典提示”中，只要根据 templateText 和 sampleText 判断其具有明确 of 业务参数含义（如付款比例、验收天数、服务期限等），也必须将其识别为字段。
4. **特别注意**：参考下方的【AI 指南：参数情报】，如果候选文本符合指南中的描述和提取提示，请务必将其映射为指南中定义的参数名（name）。
5. 若候选只是固定正文，不要输出为字段。
6. 若证据不足，请保守返回 needsReview=true。
7. 必须返回 JSON 对象，不要 markdown，不要代码块。
8. suggestions、warnings 必须分别是数组。
9. 对于不在词典且不在 AI 指南中的新字段，请根据业务含义自拟一个简洁的 camelCase 风格的 fieldId。

返回格式：
{
  "summary": "1-2 句说明当前块识别结果",
  "suggestions": [
    {
      "candidateId": "fc_1",
      "fieldId": "partyAName",
      "fieldType": "legal_entity_name",
      "policy": "llm_translate",
      "riskLevel": "high",
      "confidence": 0.96,
      "needsReview": false,
      "accepted": true
    }
  ],
  "warnings": []
}

输入信息：
- sourceLanguage: ${input.sourceLanguage}
- targetLanguages: ${targetLanguageText}
- understandingSummary: ${input.understandingSummary}
- sectionTitle: ${input.block.sectionTitle}
- sectionSummary: ${input.sectionSummary}
- sectionCompareStatus: ${input.block.compareStatus}
- sectionCompareMode: ${input.block.compareMode}
- sectionMatchScore: ${input.block.sectionMatchScore}
- blockId: ${input.block.blockId}
- blockType: ${input.block.blockType}
- templateText: ${input.block.templateText || '无'}
- sampleText: ${input.block.sampleText || '无'}

${skillHints ? `【AI 指南：参数情报（优先参考）】\n${skillHints}\n` : ''}

【当前块候选】
${candidateFieldsJson || '[]'}

【章节全文宽松比较命中的相似片段】
${sectionCompareHints || '无'}

【字段词典提示（仅增强与兜底，不参与候选主筛选）】
${dictionaryHints || '无'}

【术语提示】
${termHints || '无'}

【枚举提示】
${enumHints || '无'}
`;
}

export function buildRecognitionBlocks(
  templateDocumentIr: WorkflowDocumentIR,
  candidateFields: WorkflowFieldCandidate[],
  fields: WorkflowAnalyzeFieldResult[],
  sampleText: string,
): WorkflowRecognitionBlockInput[] {
  const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];
  const blockElements = elements.filter((element) =>
    ['paragraph', 'table', 'cell'].includes(String(element.type || ''))
    && Boolean(safeText(element.text))
  );

  if (blockElements.length === 0) {
    return fields.map((field, index) => {
      const sourceBinding = field.sourceBindings?.[0];
      const blockId = safeText(sourceBinding?.blockId) || `field-block-${index + 1}`;
      const templateText = safeText(sourceBinding?.anchor?.prefix || field.fieldId);
      return {
        blockId,
        blockType: 'synthetic',
        title: templateText || field.fieldId,
        sectionId: blockId,
        sectionTitle: templateText || field.fieldId,
        templateText,
        sampleText: extractBlockSampleExcerpt(sampleText, [], templateText),
        candidates: candidateFields.filter((candidate) => candidate.fieldIdHint === field.fieldId),
        fallbackFields: [field],
        compareStatus: 'attention',
        compareMode: 'structure_only',
        sectionMatchScore: 0,
      };
    });
  }

  return blockElements.map((element) => {
    const templateText = safeText(element.text);
    const sectionInfo = inferSectionInfo(elements, element.id, templateText);
    const relatedCandidates = candidateFields.filter((candidate) =>
      isCandidateMatchedToBlock(candidate, element.id, templateText, sectionInfo.sectionTitle)
    );
    const fallbackFields = fields.filter((field) =>
      relatedCandidates.some((candidate) => candidate.fieldIdHint && candidate.fieldIdHint === field.fieldId)
    );
    const compareStatus = computeCandidateGroupCompareStatus(relatedCandidates);
    const compareMode = computeCandidateGroupCompareMode(relatedCandidates);
    const sectionMatchScore = computeCandidateGroupCompareScore(relatedCandidates);

    return {
      blockId: element.id,
      blockType: String(element.type || 'paragraph'),
      title: inferRecognitionBlockTitle(templateText, String(element.type || 'paragraph')),
      sectionId: sectionInfo.sectionId,
      sectionTitle: sectionInfo.sectionTitle,
      templateText,
      sampleText: extractBlockSampleExcerpt(sampleText, relatedCandidates, templateText),
      candidates: relatedCandidates,
      fallbackFields,
      compareStatus,
      compareMode,
      sectionMatchScore,
    };
  });
}

export function parseWorkflowRecognitionAiResponse(content: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export function normalizeWorkflowRecognitionSuggestions(value: unknown): WorkflowRecognitionAiSuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as WorkflowRecognitionAiSuggestion);
}

export function shouldAcceptWorkflowSuggestion(suggestion: WorkflowRecognitionAiSuggestion): boolean {
  if (suggestion.accepted === false || suggestion.shouldCreateField === false || suggestion.isField === false) {
    return false;
  }
  return Boolean(
    safeText(suggestion.fieldId)
    || safeText(suggestion.candidateId)
    || safeText(suggestion.anchorText)
  );
}

export function normalizeWorkflowFieldId(value: string): string {
  const raw = safeText(value)
    .replace(/^[dD]\./, '')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!raw) {
    return '';
  }
  const camel = raw
    .split('_')
    .filter(Boolean)
    .map((segment, index) => {
      if (index === 0) {
        return segment.charAt(0).toLowerCase() + segment.slice(1);
      }
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join('');
  return camel || raw;
}

export function resolveTemplateFieldLanguage(fieldId: string): string | undefined {
  const normalized = safeText(fieldId);
  if (!normalized) {
    return undefined;
  }

  const underscoreMatch = normalized.match(/(?:^|_)(cn|zh|jp|ja)$/i);
  if (underscoreMatch) {
    return mapTemplateLanguageSuffix(underscoreMatch[1]);
  }

  const camelMatch = normalized.match(/(Cn|Zh|Jp|Ja)$/);
  if (camelMatch) {
    return mapTemplateLanguageSuffix(camelMatch[1]);
  }

  return undefined;
}

export function mapTemplateLanguageSuffix(suffix: string): string | undefined {
  switch (suffix.toLowerCase()) {
    case 'cn':
    case 'zh':
      return 'zh';
    case 'jp':
    case 'ja':
      return 'ja';
    default:
      return undefined;
  }
}

export function inferPolicyFromType(fieldType: string): WorkflowTemplateFieldSpec['policy'] {
  if (fieldType === 'enum') {
    return 'enum_mapping';
  }
  if (['currency_amount', 'date', 'number', 'bank_account'].includes(fieldType)) {
    return 'format_only';
  }
  if (['legal_entity_name', 'project_name'].includes(fieldType)) {
    return 'dictionary_first';
  }
  return 'llm_translate';
}

export function normalizeWorkflowPolicy(value: unknown): NonNullable<WorkflowTemplateFieldSpec['policy']> {
  if (value === 'dictionary_first' || value === 'enum_mapping' || value === 'format_only') {
    return value;
  }
  return 'llm_translate';
}

export function inferRiskLevelFromType(fieldType: string): WorkflowTemplateFieldSpec['riskLevel'] {
  if (['currency_amount', 'date', 'bank_account', 'legal_entity_name'].includes(fieldType)) {
    return 'high';
  }
  if (['enum', 'project_name', 'number', 'geo_name'].includes(fieldType)) {
    return 'medium';
  }
  return 'low';
}

export function normalizeConfidence(value: unknown, fallback = 0.72): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric > 1 && numeric <= 100) {
      return Math.max(0, Math.min(1, numeric / 100));
    }
    return Math.max(0, Math.min(1, numeric));
  }
  return Math.max(0, Math.min(1, fallback));
}

export function buildRecognizedFieldFromSuggestion(
  suggestion: WorkflowRecognitionAiSuggestion,
  block: WorkflowRecognitionBlockInput,
  sourceLanguage: string,
  targetLanguages: string[],
  assets: WorkflowResolvedAssets,
): WorkflowAnalyzeFieldResult | undefined {
  const matchedCandidate = block.candidates.find((candidate) =>
    candidate.candidateId === suggestion.candidateId
    || (suggestion.fieldId && candidate.fieldIdHint === suggestion.fieldId)
    || (suggestion.anchorText && normalizeLookupText(candidate.anchorText) === normalizeLookupText(suggestion.anchorText))
  );
  const fieldId = normalizeWorkflowFieldId(
    suggestion.fieldId
    || matchedCandidate?.fieldIdHint
    || matchedCandidate?.anchorText
    || matchedCandidate?.candidateId
    || ''
  );
  if (!fieldId) {
    return undefined;
  }

  const fieldType = safeText(suggestion.fieldType || suggestion.type || matchedCandidate?.fieldTypeHint || 'text');
  const policy = normalizeWorkflowPolicy(
    suggestion.policy
    || matchedCandidate?.generationPolicyHint
    || inferPolicyFromType(fieldType)
  );
  const riskLevel = suggestion.riskLevel || inferRiskLevelFromType(fieldType);
  const sourceValue = safeText(matchedCandidate?.sampleValue);
  const termMatch = policy === 'dictionary_first' && sourceValue
    ? findTermMatch(fieldId, sourceValue, assets)
    : undefined;
  const sourceBinding: WorkflowSourceBinding = {
    blockId: block.blockId,
    lang: sourceLanguage,
    anchor: {
      prefix: matchedCandidate?.anchorText || extractAnchorPrefix(block.templateText),
      suffix: '',
    },
  };

  return {
    fieldId,
    valueMode: 'scalar',
    type: fieldType,
    description: matchedCandidate?.description || suggestion.description,
    sourceLanguage,
    targetLanguages,
    policy,
    required: ['high', 'medium'].includes(riskLevel || '') || Boolean(matchedCandidate?.fieldIdHint),
    riskLevel,
    sourceBindings: [sourceBinding],
    renderConfig: {
      flattenForCarbone: true,
      includeCanonicalValue: false,
    },
    sample: sourceValue ? { [sourceLanguage]: sourceValue } : undefined,
    termMatch: termMatch
      ? {
        status: 'matched',
        termId: termMatch.termId,
        scope: termMatch.scope,
      }
      : {
        status: 'unmatched',
      },
    confidence: normalizeConfidence(suggestion.confidence, matchedCandidate?.confidence),
    needsReview: suggestion.needsReview ?? normalizeConfidence(suggestion.confidence, matchedCandidate?.confidence) < 0.8,
  };
}

export function mergeRecognizedField(
  target: Map<string, WorkflowAnalyzeFieldResult>,
  field: WorkflowAnalyzeFieldResult,
): void {
  const existing = target.get(field.fieldId);
  if (!existing) {
    target.set(field.fieldId, field);
    return;
  }

  const shouldReplace = field.confidence > existing.confidence
    || (existing.needsReview && !field.needsReview)
    || (existing.termMatch?.status !== 'matched' && field.termMatch?.status === 'matched');
  if (shouldReplace) {
    target.set(field.fieldId, field);
  }
}

export function buildAnalyzeFieldResult(
  dictionaryMatch: WorkflowFieldDictionaryEntry,
  languageProfile: WorkflowLanguageProfile,
  sourceBinding: WorkflowSourceBinding,
  normalizedSampleText: string,
  assets: WorkflowResolvedAssets,
): WorkflowAnalyzeFieldResult {
  const termMatch = findTermMatch(dictionaryMatch.fieldId, normalizedSampleText, assets);
  const sample = termMatch
    ? {
        [languageProfile.sourceLanguage]: termMatch.sourceValue,
        ...termMatch.translations,
      }
    : undefined;

  return {
    fieldId: dictionaryMatch.fieldId,
    valueMode: 'scalar',
    type: dictionaryMatch.type,
    description: dictionaryMatch.description,
    sourceLanguage: languageProfile.sourceLanguage,
    targetLanguages: languageProfile.targetLanguages,
    policy: dictionaryMatch.policy,
    required: dictionaryMatch.required ?? false,
    riskLevel: dictionaryMatch.riskLevel,
    sourceBindings: [sourceBinding],
    renderConfig: {
      flattenForCarbone: true,
      includeCanonicalValue: false,
    },
    sample,
    termMatch: termMatch
      ? {
          status: 'matched',
          termId: termMatch.termId,
          scope: termMatch.scope,
        }
      : {
          status: 'unmatched',
        },
    confidence: termMatch ? 0.96 : 0.78,
    needsReview: !termMatch && dictionaryMatch.policy === 'dictionary_first',
  };
}

export function discoverFields(
  templateDocumentIr: WorkflowDocumentIR,
  languageProfile: WorkflowLanguageProfile,
  normalizedSampleText: string,
  assets: WorkflowResolvedAssets,
): WorkflowAnalyzeFieldResult[] {
  const candidates = new Map<string, WorkflowAnalyzeFieldResult>();
  const anchors = Array.isArray(templateDocumentIr.anchors) ? templateDocumentIr.anchors : [];
  const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];

  for (const anchor of anchors) {
    const anchorParagraphText = safeText(anchor.ref?.paragraphText);
    const anchorContext = [
      safeText(anchor.text),
      anchorParagraphText,
      safeText(anchor.ref?.title),
    ].filter(Boolean).join(' ');
    const dictionaryMatch = matchFieldDictionary(anchorContext, assets);
    if (!dictionaryMatch) {
      continue;
    }
    const existing = candidates.get(dictionaryMatch.fieldId);
    if (existing) {
      continue;
    }
    const matchedElement = elements.find((element) =>
      normalizeLookupText(element.text) === normalizeLookupText(anchorParagraphText)
    );
    candidates.set(dictionaryMatch.fieldId, buildAnalyzeFieldResult(
      dictionaryMatch,
      languageProfile,
      {
        blockId: matchedElement?.id || String(anchor.id || ''),
        lang: languageProfile.sourceLanguage,
        anchor: {
          prefix: extractAnchorPrefix(anchorParagraphText || anchorContext),
          suffix: '',
        },
      },
      normalizedSampleText,
      assets,
    ));
  }

  // Fallback scan for missing high risk fields
  for (const dictionaryMatch of assets.fieldDictionary) {
    if (dictionaryMatch.riskLevel === 'high') {
      const existing = candidates.get(dictionaryMatch.fieldId);
      if (existing) {
        continue;
      }
      const matchedElement = elements.find((element) => {
        const text = safeText(element.text);
        return dictionaryMatch.aliases.some((alias) =>
          normalizeLookupText(text).includes(normalizeLookupText(alias))
        );
      });
      if (matchedElement) {
        candidates.set(dictionaryMatch.fieldId, buildAnalyzeFieldResult(
          dictionaryMatch,
          languageProfile,
          {
            blockId: matchedElement.id,
            lang: languageProfile.sourceLanguage,
            anchor: {
              prefix: extractAnchorPrefix(safeText(matchedElement.text)),
              suffix: '',
            },
          },
          normalizedSampleText,
          assets,
        ));
      }
    }
  }

  return Array.from(candidates.values());
}

export function buildRecognitionBlockResults(
  templateDocumentIr: WorkflowDocumentIR,
  fields: WorkflowAnalyzeFieldResult[],
): WorkflowRecognizeBlockResult[] {
  const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];
  const assets = resolveAssets();
  const blockCandidates = elements.filter((element) =>
    ['paragraph', 'table', 'cell'].includes(String(element.type || ''))
    && Boolean(safeText(element.text))
  );
  const blocks = blockCandidates.map((element) => {
    const sourceExcerpt = safeText(element.text).slice(0, 120);
    const normalizedExcerpt = normalizeLookupText(sourceExcerpt);
    let matchedFields = fields.filter((field) =>
      (field.sourceBindings || []).some((binding) => {
        const bindingBlockId = safeText(binding.blockId);
        if (bindingBlockId && bindingBlockId === element.id) {
          return true;
        }
        const anchorPrefix = normalizeLookupText(binding.anchor?.prefix);
        return Boolean(anchorPrefix) && normalizedExcerpt.includes(anchorPrefix);
      })
    );
    if (matchedFields.length === 0) {
      const dictionaryMatch = matchFieldDictionary(sourceExcerpt, assets);
      if (dictionaryMatch) {
        matchedFields = fields.filter((field) => field.fieldId === dictionaryMatch.fieldId);
      }
    }
    const fallbackReason = matchedFields.length > 0 ? 'rule_based_block_scan' : undefined;
    const resultStatus: WorkflowRecognizeBlockResult['resultStatus'] = matchedFields.length > 0
      ? 'fallback_success'
      : 'empty';

    return {
      blockId: element.id,
      blockType: String(element.type || 'paragraph'),
      title: inferRecognitionBlockTitle(sourceExcerpt, String(element.type || 'paragraph')),
      sectionTitle: inferRecognitionBlockTitle(sourceExcerpt, String(element.type || 'paragraph')),
      sourceExcerpt,
      suggestionCount: matchedFields.length,
      fieldIds: matchedFields.map((field) => field.fieldId),
      aiCallSucceeded: false,
      resultStatus,
      warnings: matchedFields.length > 0 ? [] : ['当前块未识别到字段候选'],
      retryCount: 0,
      durationMs: 0,
      fallbackReason,
      contextAnalysis: {
        requestSummary: `块 ${element.id} (${String(element.type || 'paragraph')}) 已进入识别队列`,
        responseSummary: matchedFields.length > 0
          ? `通过回退链路识别到 ${matchedFields.length} 个字段`
          : '当前块未返回字段候选',
        cacheHit: false,
        fallbackReason,
        retryCount: 0,
      },
    };
  });

  if (blocks.length > 0) {
    return blocks;
  }

  return fields.map((field, index) => {
    const sourceBinding = field.sourceBindings?.[0];
    const sourceExcerpt = safeText(sourceBinding?.anchor?.prefix || field.fieldId);
    return {
      blockId: sourceBinding?.blockId || `field-block-${index + 1}`,
      blockType: 'synthetic',
      title: sourceExcerpt || field.fieldId,
      sectionTitle: sourceExcerpt || field.fieldId,
      sourceExcerpt,
      suggestionCount: 1,
      fieldIds: [field.fieldId],
      aiCallSucceeded: false,
      resultStatus: 'fallback_success',
      warnings: [],
      retryCount: 0,
      durationMs: 0,
      fallbackReason: 'rule_based_field_mapping',
      contextAnalysis: {
        requestSummary: `字段 ${field.fieldId} 通过回退映射生成 synthetic block`,
        responseSummary: '已生成块级占位结果，便于前端展示字段来源',
        cacheHit: false,
        fallbackReason: 'rule_based_field_mapping',
        retryCount: 0,
      },
    };
  });
}
