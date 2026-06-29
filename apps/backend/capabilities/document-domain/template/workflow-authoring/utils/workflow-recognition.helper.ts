import {
  WorkflowDocumentIR,
  WorkflowRecognizeContextAnalysis,
  WorkflowTemplateFieldSpec,
  WorkflowResolvedAssets,
  WorkflowAnalyzeFieldResult,
  WorkflowFieldCandidate,
  WorkflowRecognizeBlockResult,
  WorkflowRecognizeResult,
  WorkflowRecognitionBlockInput,
  WorkflowRecognitionAiSuggestion,
  WorkflowEnumItem,
  WorkflowTermAssets,
  WorkflowUnderstandResult,
} from './workflow-assets';
import {
  safeText,
  normalizeLookupText,
  inferRecognitionBlockTitle,
} from './workflow-parser-format';
import { inferSectionInfo } from './workflow-similarity';
import { extractSampleTextRich } from './workflow-xml-text';

export function computeCandidateGroupCompareStatus(
  candidates: WorkflowFieldCandidate[]
): 'aligned' | 'partial' | 'attention' {
  if (candidates.length === 0) {
    return 'attention';
  }
  const matchedCount = candidates.filter((candidate) =>
    Boolean(safeText(candidate.matchText))
  ).length;
  if (matchedCount === 0) {
    return 'attention';
  }
  return matchedCount === candidates.length ? 'aligned' : 'partial';
}

export function computeCandidateGroupCompareMode(
  candidates: WorkflowFieldCandidate[]
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
  return Math.max(...candidates.map((candidate) => Number(candidate.sectionMatchScore || 0)));
}

export function isCandidateMatchedToBlock(
  candidate: WorkflowFieldCandidate,
  blockId: string,
  templateText: string,
  sectionTitle: string
): boolean {
  if (candidate.sourceBlockId === blockId) {
    return true;
  }
  const normalizedTemplateText = normalizeLookupText(templateText);
  const normalizedAnchor = normalizeLookupText(candidate.anchorText);
  const normalizedSegment = normalizeLookupText(candidate.segmentText);
  const normalizedSectionTitle = normalizeLookupText(sectionTitle);
  const normalizedCandidateSection = normalizeLookupText(
    candidate.sectionTitle || candidate.sectionId
  );

  return Boolean(
    (normalizedAnchor && normalizedTemplateText.includes(normalizedAnchor)) ||
      (normalizedSegment && normalizedTemplateText.includes(normalizedSegment)) ||
      (normalizedCandidateSection &&
        normalizedSectionTitle &&
        normalizedCandidateSection === normalizedSectionTitle)
  );
}

export function extractBlockSampleExcerpt(
  sampleText: string,
  candidates: WorkflowFieldCandidate[],
  fallbackText: string
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

export function buildFallbackRecognitionBlockResult(
  block: WorkflowRecognitionBlockInput
): WorkflowRecognizeBlockResult {
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
      responseSummary:
        suggestionCount > 0
          ? `通过回退链路识别到 ${suggestionCount} 个字段`
          : '当前块未返回字段候选',
      cacheHit: false,
      fallbackReason,
      retryCount: 0,
    },
  };
}

export function buildAiEmptyFallbackRecognitionBlock(input: {
  fallbackResult: WorkflowRecognizeBlockResult;
  requestSummary: string;
  durationMs: number;
}): WorkflowRecognizeBlockResult {
  return {
    ...input.fallbackResult,
    durationMs: input.durationMs,
    contextAnalysis: {
      ...input.fallbackResult.contextAnalysis,
      requestSummary: input.requestSummary,
      responseSummary: 'AI 返回未形成可用字段，已回退到规则结果',
      errorMessage: 'AI 返回为空或无可接受字段',
    },
  };
}

export function buildAiErrorFallbackRecognitionBlock(input: {
  fallbackResult: WorkflowRecognizeBlockResult;
  requestSummary: string;
  errorMessage: string;
}): WorkflowRecognizeBlockResult {
  return {
    ...input.fallbackResult,
    durationMs: 0,
    errorCode: 'ai_call_failed',
    contextAnalysis: {
      ...input.fallbackResult.contextAnalysis,
      requestSummary: input.requestSummary,
      responseSummary: 'AI 调用失败，已回退到规则结果',
      errorMessage: input.errorMessage,
    },
  };
}

export function mergeWorkflowRecognizedFields(
  mergedFields: Map<string, WorkflowAnalyzeFieldResult>,
  fields: WorkflowAnalyzeFieldResult[],
  mergeRecognizedField: (
    mergedFields: Map<string, WorkflowAnalyzeFieldResult>,
    field: WorkflowAnalyzeFieldResult
  ) => void
): void {
  for (const field of fields) {
    mergeRecognizedField(mergedFields, field);
  }
}

export function appendFallbackRecognitionBlock(input: {
  fallbackBlock: WorkflowRecognizeBlockResult;
  fallbackBlockIds: string[];
  blockResults: WorkflowRecognizeBlockResult[];
}): void {
  if (input.fallbackBlock.resultStatus === 'fallback_success') {
    input.fallbackBlockIds.push(input.fallbackBlock.blockId);
  }
  input.blockResults.push(input.fallbackBlock);
}

export function buildWorkflowRecognizeResultMeta(input: {
  analyzeWarnings: string[];
  compareCandidateWarnings?: string[];
  recognizedFields: WorkflowAnalyzeFieldResult[];
  blockResults: WorkflowRecognizeBlockResult[];
  requestedAI: boolean;
  usedAI: boolean;
  globalUnderstandingUsedAI: boolean;
  sampleFileName?: string;
  candidateFieldCount: number;
  requestCount: number;
  lastRequestSummary?: string;
  lastResponseSummary?: string;
  aiSuccessBlockCount: number;
  fallbackBlockIds: string[];
  understandingHit: boolean;
  lastPromptRequestText?: string;
  understandingPromptRequestText?: string;
  lastRawAiResponse?: string;
  understandingRawAiResponse?: string;
}): Pick<WorkflowRecognizeResult, 'warnings' | 'contextAnalysis'> {
  const recognizedBlockCount = input.blockResults.filter((block) => block.suggestionCount > 0).length;
  const fallbackBlockCount = input.blockResults.filter(
    (block) => block.resultStatus === 'fallback_success'
  ).length;
  const failedBlockCount = input.blockResults.filter((block) => block.resultStatus === 'failed').length;
  const resultStatus: WorkflowRecognizeContextAnalysis['resultStatus'] = input.usedAI
    ? fallbackBlockCount > 0
      ? 'partial_success'
      : 'succeeded'
    : input.recognizedFields.length > 0
      ? 'fallback_success'
      : 'failed';
  const resultSource: WorkflowRecognizeContextAnalysis['resultSource'] = input.usedAI
    ? fallbackBlockCount > 0
      ? 'ai+rule_fallback'
      : 'ai'
    : 'rule_fallback';

  return {
    warnings: Array.from(
      new Set([...input.analyzeWarnings, ...(input.compareCandidateWarnings || [])])
    ),
    contextAnalysis: {
      requestedAI: input.requestedAI,
      usedAI: input.usedAI,
      globalUnderstandingUsedAI: input.globalUnderstandingUsedAI,
      resultSource,
      resultStatus,
      requestTrace: {
        summary: input.usedAI
          ? `已对 ${input.requestCount} 个块发起 AI 识别请求，并在服务端完成结果合并`
          : `基于 ${input.blockResults.length} 个文档块执行模板字段识别，当前回退到结构锚点与词典规则链路`,
        sampleFileName: input.sampleFileName,
        blockCount: input.blockResults.length,
        candidateFieldCount: input.candidateFieldCount,
        requestCount: input.requestCount,
        promptTemplateVersion: input.usedAI ? 'word-recognize-v1' : undefined,
        lastRequestSummary: input.lastRequestSummary || undefined,
      },
      responseTrace: {
        summary:
          input.recognizedFields.length > 0
            ? `已合并 ${input.recognizedFields.length} 个字段候选，命中 ${recognizedBlockCount} 个块`
            : '已完成块级扫描，但当前未返回字段候选',
        mergedFieldCount: input.recognizedFields.length,
        recognizedBlockCount,
        successBlockCount: input.aiSuccessBlockCount,
        failedBlockCount,
        lastResponseSummary: input.lastResponseSummary || undefined,
      },
      fallbackTrace: {
        usedFallback: input.fallbackBlockIds.length > 0 || !input.usedAI,
        reason: input.usedAI
          ? input.fallbackBlockIds.length > 0
            ? '部分块 AI 结果为空或失败，已降级回退'
            : undefined
          : '当前请求未提供可用于块级 AI 识别的样本文档，已回退到规则链路',
        fallbackBlockCount,
        fallbackLevel: input.fallbackBlockIds.length > 0 ? 'block' : 'task',
        fallbackBlockIds:
          input.fallbackBlockIds.length > 0 ? Array.from(new Set(input.fallbackBlockIds)) : undefined,
      },
      cacheTrace: {
        compareHit: false,
        understandingHit: input.understandingHit,
        recognitionHit: false,
      },
      debugArtifacts: {
        promptRequestText: input.lastPromptRequestText || input.understandingPromptRequestText,
        rawAiResponse: input.lastRawAiResponse || input.understandingRawAiResponse,
      },
    },
  };
}

export async function prepareWorkflowRecognitionContext(input: {
  templateDocumentIr: WorkflowDocumentIR;
  sampleDocument?: { fileName?: string; contentBase64?: string };
  effectiveSourceLanguage: string;
  effectiveTargetLanguages: string[];
  termAssets?: WorkflowTermAssets;
  compareCandidates: WorkflowFieldCandidate[];
  analyzeFields: WorkflowAnalyzeFieldResult[];
  prefetchedUnderstanding?: WorkflowUnderstandResult;
  understandTemplate: (
    templateDocumentIr: WorkflowDocumentIR,
    sampleDocument: { fileName?: string; contentBase64?: string } | undefined,
    sourceLanguage?: string,
    targetLanguages?: string[],
    termAssets?: WorkflowTermAssets,
    candidateFields?: WorkflowFieldCandidate[]
  ) => Promise<WorkflowUnderstandResult>;
}): Promise<{
  shouldAttemptAI: boolean;
  reusedUnderstanding?: WorkflowUnderstandResult;
  understandingResult?: WorkflowUnderstandResult;
  sampleText: string;
  blockInputs: WorkflowRecognitionBlockInput[];
}> {
  const shouldAttemptAI =
    Boolean(input.sampleDocument?.contentBase64) && input.compareCandidates.length > 0;
  const reusedUnderstanding =
    input.prefetchedUnderstanding &&
    input.prefetchedUnderstanding.languageProfile?.sourceLanguage === input.effectiveSourceLanguage &&
    JSON.stringify(input.prefetchedUnderstanding.languageProfile?.targetLanguages || []) ===
      JSON.stringify(input.effectiveTargetLanguages)
      ? input.prefetchedUnderstanding
      : undefined;
  const understandingResult =
    reusedUnderstanding ||
    (shouldAttemptAI
      ? await input.understandTemplate(
          input.templateDocumentIr,
          input.sampleDocument,
          input.effectiveSourceLanguage,
          input.effectiveTargetLanguages,
          input.termAssets,
          input.compareCandidates
        )
      : undefined);
  const sampleText = shouldAttemptAI
    ? await extractSampleTextRich(input.sampleDocument?.contentBase64, [])
    : '';

  return {
    shouldAttemptAI,
    reusedUnderstanding,
    understandingResult,
    sampleText,
    blockInputs: buildRecognitionBlocks(
      input.templateDocumentIr,
      input.compareCandidates,
      input.analyzeFields,
      sampleText
    ),
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
  const targetLanguageText =
    input.targetLanguages.length > 0 ? input.targetLanguages.join(', ') : 'single_language';
  const candidateFieldsJson = JSON.stringify(input.block.candidates.slice(0, 8), null, 2);

  const skillParameters = input.skill?.parameters || [];
  const skillHints = Array.isArray(skillParameters)
    ? skillParameters
        .map(
          (p: any) =>
            `- ${p.name}: ${p.usage || ''} | 类型: ${p.dataType || 'text'} | 提取提示: ${p.extractionHint || ''}`
        )
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
    .map(
      (entry) =>
        `${entry.fieldId}: ${entry.aliases.slice(0, 5).join(' / ')} | ${entry.type} | ${entry.policy}`
    )
    .join('\n');
  const termHints = input.assets.termbase
    .filter((entry) => entry.applicableFieldIds.some((fieldId) => relatedFieldIds.has(fieldId)))
    .slice(0, 8)
    .map(
      (entry) =>
        `${entry.termId}: ${entry.sourceValue} => ${Object.entries(entry.translations)
          .map(([lang, value]) => `${lang}:${value}`)
          .join(', ')}`
    )
    .join('\n');
  const enumHints = Array.from(relatedFieldIds)
    .flatMap((fieldId) =>
      (input.assets.enumMappings[fieldId] || []).map(
        (item: WorkflowEnumItem) =>
          `${fieldId}: ${item.code} => ${Object.entries(item.labels)
            .map(([lang, value]) => `${lang}:${value}`)
            .join(', ')}`
      )
    )
    .slice(0, 8)
    .join('\n');
  const sectionCompareHints = input.block.candidates
    .map((candidate) =>
      [
        `candidateId=${candidate.candidateId}`,
        `compareMode=${candidate.compareMode || 'structure_only'}`,
        `sectionMatchScore=${candidate.sectionMatchScore || 0}`,
        `fieldIdHint=${candidate.fieldIdHint || 'unknown'}`,
        `matchText=${safeText(candidate.matchText || candidate.segmentText) || 'none'}`,
      ].join(' | ')
    )
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
  sampleText: string
): WorkflowRecognitionBlockInput[] {
  const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];
  const blockElements = elements.filter(
    (element) =>
      ['paragraph', 'table', 'cell'].includes(String(element.type || '')) &&
      Boolean(safeText(element.text))
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
      relatedCandidates.some(
        (candidate) => candidate.fieldIdHint && candidate.fieldIdHint === field.fieldId
      )
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

export function parseWorkflowRecognitionAiResponse(
  content: string
): Record<string, unknown> | undefined {
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

export function normalizeWorkflowRecognitionSuggestions(
  value: unknown
): WorkflowRecognitionAiSuggestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as WorkflowRecognitionAiSuggestion);
}

export function shouldAcceptWorkflowSuggestion(
  suggestion: WorkflowRecognitionAiSuggestion
): boolean {
  if (
    suggestion.accepted === false ||
    suggestion.shouldCreateField === false ||
    suggestion.isField === false
  ) {
    return false;
  }
  return Boolean(
    safeText(suggestion.fieldId) ||
      safeText(suggestion.candidateId) ||
      safeText(suggestion.anchorText)
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

export function normalizeWorkflowPolicy(
  value: unknown
): NonNullable<WorkflowTemplateFieldSpec['policy']> {
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

export function mergeRecognizedField(
  target: Map<string, WorkflowAnalyzeFieldResult>,
  field: WorkflowAnalyzeFieldResult
): void {
  const existing = target.get(field.fieldId);
  if (!existing) {
    target.set(field.fieldId, field);
    return;
  }

  const shouldReplace =
    field.confidence > existing.confidence ||
    (existing.needsReview && !field.needsReview) ||
    (existing.termMatch?.status !== 'matched' && field.termMatch?.status === 'matched');
  if (shouldReplace) {
    target.set(field.fieldId, field);
  }
}
