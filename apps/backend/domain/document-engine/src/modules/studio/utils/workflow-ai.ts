import {
  WorkflowDocumentIR,
  WorkflowFieldCandidate,
  WorkflowUnderstandResult,
} from './workflow-assets';

import {
  safeText,
} from './workflow-parser-format';

import { buildWorkflowUnderstandingPromptText } from '../template-workflow.prompt';

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

export function buildUnderstandingSectionSummaries(
  candidateFields: WorkflowFieldCandidate[],
): WorkflowUnderstandResult['summary']['sectionSummaries'] {
  const sectionMap = new Map<string, WorkflowUnderstandResult['summary']['sectionSummaries'][number]>();
  const sectionOrderMap = new Map<string, number>();

  for (const candidate of candidateFields) {
    const sectionId = safeText(candidate.sectionId || candidate.sectionTitle || candidate.sourceBlockId);
    const sectionTitle = safeText(candidate.sectionTitle || candidate.sectionId || candidate.sourceBlockId);
    if (!sectionId || !sectionTitle) {
      continue;
    }
    if (!sectionOrderMap.has(sectionId)) {
      sectionOrderMap.set(sectionId, sectionOrderMap.size);
    }
    const current = sectionMap.get(sectionId) || {
      sectionId,
      sectionTitle,
      sectionSummary: '',
      candidateCount: 0,
      matchedCandidateCount: 0,
      compareStatus: 'attention' as const,
      compareMode: candidate.compareMode || 'structure_only',
      looseMatchScore: Number(candidate.sectionMatchScore || 0),
      samplePreview: candidate.matchText || undefined,
    };
    current.candidateCount += 1;
    if (safeText(candidate.matchText)) {
      current.matchedCandidateCount += 1;
    }
    current.compareStatus = current.matchedCandidateCount === 0
      ? 'attention'
      : (current.matchedCandidateCount === current.candidateCount ? 'aligned' : 'partial');
    current.looseMatchScore = Math.max(current.looseMatchScore, Number(candidate.sectionMatchScore || 0));
    current.compareMode = computeCandidateGroupCompareMode([candidate, {
      ...candidate,
      compareMode: current.compareMode,
    }]);
    current.samplePreview = current.samplePreview || candidate.matchText || candidate.sampleValue || undefined;
    if (!current.sectionSummary) {
      current.sectionSummary = [
        `章节 ${sectionTitle}`,
        `候选 ${current.candidateCount} 个`,
        current.matchedCandidateCount > 0 ? `已命中 ${current.matchedCandidateCount} 个` : '当前未形成明确命中',
        current.samplePreview ? `示例: ${safeText(current.samplePreview).slice(0, 60)}` : '',
      ].filter(Boolean).join('，');
    }
    sectionMap.set(sectionId, current);
  }

  return Array.from(sectionMap.values())
    .sort((left, right) => (
      (sectionOrderMap.get(left.sectionId) ?? Number.MAX_SAFE_INTEGER)
        - (sectionOrderMap.get(right.sectionId) ?? Number.MAX_SAFE_INTEGER)
      || right.looseMatchScore - left.looseMatchScore
      || right.candidateCount - left.candidateCount
    ))
    .slice(0, 8);
}

export function buildWorkflowTemplateExcerpt(templateDocumentIr: WorkflowDocumentIR): string {
  const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];
  return elements
    .filter((element) => element.type === 'paragraph' || element.type === 'table' || element.type === 'cell')
    .map((element) => safeText(element.text))
    .filter(Boolean)
    .slice(0, 80)
    .join('\n');
}

export function buildWorkflowUnderstandingPrompt(input: {
  templateDocumentIr: WorkflowDocumentIR;
  sampleDocument?: { fileName?: string; contentBase64?: string };
  sampleText: string;
  sourceLanguage: string;
  targetLanguages: string[];
  fallbackSectionHints: string[];
  fallbackTerminologyCandidates: string[];
  fallbackLayoutFeatures: string[];
  fieldCandidateIds: string[];
  candidateFields: WorkflowFieldCandidate[];
}): string {
  return buildWorkflowUnderstandingPromptText({
    documentType: String(input.templateDocumentIr?.metadata?.documentType || 'word_document'),
    sourceLanguage: input.sourceLanguage,
    targetLanguages: input.targetLanguages,
    sampleFileName: safeText(input.sampleDocument?.fileName) || 'unknown',
    fallbackSectionHints: input.fallbackSectionHints,
    fallbackLayoutFeatures: input.fallbackLayoutFeatures,
    templateExcerpt: buildWorkflowTemplateExcerpt(input.templateDocumentIr),
    sampleText: input.sampleText,
  });
}

export function buildFallbackWorkflowUnderstandingSummaryText(input: {
  documentTitle?: string;
  sourceLanguage: string;
  targetLanguages: string[];
  paragraphCount: number;
  tableCount: number;
  sectionHints: string[];
  terminologyCandidates: string[];
  layoutFeatures: string[];
  fieldCandidateIds: string[];
  sampleFileName?: string;
}): string {
  const title = safeText(input.documentTitle) || '正式业务文档';
  const sectionText = input.sectionHints.length > 0
    ? input.sectionHints.slice(0, 4).join('、')
    : '未提取到明确章节';
  return [
    '## 文档类型与用途',
    `- 该文档可归纳为“${title}”这一类正式 Word 文档，主要用于承载业务约定、履约条件与权责边界。`,
    '',
    '## 核心业务实体',
    '- 文档通常围绕合同主体、服务提供方与服务接收方等核心角色展开，并描述主体之间的业务关系与责任分工。',
    '',
    '## 章节职责划分',
    `- 文档主要章节通常围绕 ${sectionText} 等内容展开，用于描述基础信息、服务范围、履约条款及其他约束条件。`,
  ].join('\n');
}

export function tryParseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function parseWorkflowUnderstandingAiResponse(content: string): Record<string, unknown> | undefined {
  const direct = tryParseJsonObject(content);
  if (direct) {
    return direct;
  }

  const match = content.match(/\{[\s\S]*\}/);
  return match ? tryParseJsonObject(match[0]) : undefined;
}

export function normalizeWorkflowUnderstandingText(content: string): string | undefined {
  const normalized = safeText(
    String(content || '')
      .replace(/```text\s*/gi, '')
      .replace(/```markdown\s*/gi, '')
      .replace(/```\s*/g, '')
  );
  return normalized || undefined;
}

export function normalizeStringArray(value: unknown, limit: number): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = Array.from(new Set(
    value
      .map((item) => safeText(item))
      .filter(Boolean)
  )).slice(0, limit);

  return normalized.length > 0 ? normalized : undefined;
}

export async function generateUnderstandingSummaryWithAI(
  input: {
    templateDocumentIr: WorkflowDocumentIR;
    sampleDocument?: { fileName?: string; contentBase64?: string };
    sampleText: string;
    sourceLanguage: string;
    targetLanguages: string[];
    fallbackSectionHints: string[];
    fallbackTerminologyCandidates: string[];
    fallbackLayoutFeatures: string[];
    fieldCandidateIds: string[];
    candidateFields: WorkflowFieldCandidate[];
  },
  callWorkflowUnderstandingAI: (prompt: string) => Promise<string>,
): Promise<{
  summary: {
    documentTitle?: string;
    understandingSummaryText?: string;
    sectionHints: string[];
    sectionSummaries: WorkflowUnderstandResult['summary']['sectionSummaries'];
    terminologyCandidates: string[];
    layoutFeatures: string[];
    warnings: string[];
  };
  usedAI: boolean;
  aiServiceUrl?: string;
  promptRequestText?: string;
  rawAiResponse?: string;
}> {
  const promptRequestText = buildWorkflowUnderstandingPrompt(input);
  const fallbackSectionSummaries = buildUnderstandingSectionSummaries(input.candidateFields);

  try {
    const rawAiResponse = await callWorkflowUnderstandingAI(promptRequestText);
    const understandingSummaryText = normalizeWorkflowUnderstandingText(rawAiResponse);
    if (!understandingSummaryText) {
      return {
        summary: {
          understandingSummaryText: buildFallbackWorkflowUnderstandingSummaryText({
            documentTitle: safeText(input.sampleDocument?.fileName),
            sourceLanguage: input.sourceLanguage,
            targetLanguages: input.targetLanguages,
            paragraphCount: Number(input.templateDocumentIr.stats?.paragraphCount || 0),
            tableCount: Number(input.templateDocumentIr.stats?.tableCount || 0),
            sectionHints: input.fallbackSectionHints,
            terminologyCandidates: input.fallbackTerminologyCandidates,
            layoutFeatures: input.fallbackLayoutFeatures,
            fieldCandidateIds: input.fieldCandidateIds,
            sampleFileName: input.sampleDocument?.fileName,
          }),
          sectionHints: input.fallbackSectionHints,
          sectionSummaries: fallbackSectionSummaries,
          terminologyCandidates: input.fallbackTerminologyCandidates,
          layoutFeatures: input.fallbackLayoutFeatures,
          warnings: ['AI 整体理解返回无法解析，已回退到规则摘要'],
        },
        usedAI: false,
        promptRequestText,
        rawAiResponse,
      };
    }

    return {
      summary: {
        documentTitle:
          safeText(input.templateDocumentIr.metadata?.title)
          || safeText(input.sampleDocument?.fileName)
          || undefined,
        understandingSummaryText,
        sectionHints: input.fallbackSectionHints,
        sectionSummaries: fallbackSectionSummaries,
        terminologyCandidates: input.fallbackTerminologyCandidates,
        layoutFeatures: input.fallbackLayoutFeatures,
        warnings: [],
      },
      usedAI: true,
      promptRequestText,
      rawAiResponse,
    };
  } catch (error) {
    const actualErrorMessage = error instanceof Error ? error.message : 'unknown error';
    return {
      summary: {
        understandingSummaryText: buildFallbackWorkflowUnderstandingSummaryText({
          documentTitle: safeText(input.sampleDocument?.fileName),
          sourceLanguage: input.sourceLanguage,
          targetLanguages: input.targetLanguages,
          paragraphCount: Number(input.templateDocumentIr.stats?.paragraphCount || 0),
          tableCount: Number(input.templateDocumentIr.stats?.tableCount || 0),
          sectionHints: input.fallbackSectionHints,
          terminologyCandidates: input.fallbackTerminologyCandidates,
          layoutFeatures: input.fallbackLayoutFeatures,
          fieldCandidateIds: input.fieldCandidateIds,
          sampleFileName: input.sampleDocument?.fileName,
        }),
        sectionHints: input.fallbackSectionHints,
        sectionSummaries: fallbackSectionSummaries,
        terminologyCandidates: input.fallbackTerminologyCandidates,
        layoutFeatures: input.fallbackLayoutFeatures,
        warnings: ['AI 整体理解调用失败，已回退到规则摘要'],
      },
      usedAI: false,
      promptRequestText,
    };
  }
}
