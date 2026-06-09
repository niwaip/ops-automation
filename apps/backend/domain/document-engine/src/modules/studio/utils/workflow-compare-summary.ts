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
  WorkflowAnalyzeFieldResult,
  WorkflowCandidateLocation,
  WorkflowCandidateLanguageRelation,
  WorkflowFieldCandidate,
  WorkflowCompareResult,
  WorkflowCompareSectionContext,
  WorkflowCompareCandidateBuildResult,
} from './workflow-assets';

import {
  safeText,
  escapeRegExp,
  numberOrUndefined,
  getElementHostData,
  isLikelyDocumentTitle,
  isLikelySectionHeading,
  isBlankTableTemplateCell,
  splitTableCellLines,
  extractPlaceholderSampleValue,
  extractSampleTableMatrices,
  classifyTemplateTableStructure,
  findNearestLeftTableLabel,
  findNearestRightTableLabel,
  extractTableCellCompareAnchors,
  extractTableCellSampleValueByAnchor,
} from './document-xml-parser';

import {
  normalizeLookupText,
  detectTextLanguageHint,
  isConcreteLanguageHint,
  hasCompareFieldShape,
  extractAnchorPrefix,
  inferRecognitionBlockTitle,
} from './workflow-parser-format';

import {
  splitSampleTextIntoChunks,
  buildTextCompareInputs,
  findBestSectionSampleChunk,
  findDirectCompareMatch,
  extractCompareLabels,
  extractLooseCandidateContext,
  shouldIncludeSectionCompareProbe,
  isCompactCompareBlock,
  isLikelyNarrativeCompareText,
  shouldKeepCompareCandidateUnnamed,
  inferSectionInfo,
  scoreLooseTextMatch,
} from './workflow-similarity';

import {
  extractSampleTextRich,
} from './workflow-xml-text';

import {
  normalizeConfidence,
  findTermMatch,
} from './workflow-discover';

export function getCompareSectionPriority(status: 'aligned' | 'partial' | 'attention'): number {
  switch (status) {
    case 'attention':
      return 3;
    case 'partial':
      return 2;
    case 'aligned':
    default:
      return 1;
  }
}

export function buildCompareSectionContexts(
  elements: WorkflowDocumentElement[],
  sampleText: string,
): WorkflowCompareSectionContext[] {
  const blockElements = elements.filter((element) =>
    ['paragraph', 'table', 'cell'].includes(String(element.type || '')) &&
    Boolean(safeText(element.text))
  );
  if (blockElements.length === 0) {
    return [];
  }

  const sectionMap = new Map<string, {
    sectionId: string;
    sectionTitle: string;
    templateSegments: string[];
    anchorTexts: string[];
  }>();

  for (const element of blockElements) {
    const templateText = safeText(element.text);
    const sectionInfo = inferSectionInfo(elements, element.id, templateText);
    const current = sectionMap.get(sectionInfo.sectionId) || {
      sectionId: sectionInfo.sectionId,
      sectionTitle: sectionInfo.sectionTitle,
      templateSegments: [],
      anchorTexts: [],
    };
    if (templateText && current.templateSegments.length < 6 && shouldIncludeSectionCompareProbe(templateText)) {
      current.templateSegments.push(templateText);
    }
    const anchorText = extractAnchorPrefix(
      templateText.replace(/^[\s_＿\-—.·]+/u, '').trim()
    );
    if (anchorText && current.anchorTexts.length < 4 && !current.anchorTexts.includes(anchorText)) {
      current.anchorTexts.push(anchorText);
    }
    sectionMap.set(sectionInfo.sectionId, current);
  }

  const sampleChunks = splitSampleTextIntoChunks(sampleText);
  return Array.from(sectionMap.values()).map((section) => {
    // We need findBestSectionSampleChunk function which is re-exported from similarity.
    // However, it has its own logic that uses scoreLooseTextMatch etc.
    const sampleChunksList = sampleChunks;
    let bestChunk = '';
    let bestScore = 0;

    for (const chunk of sampleChunksList) {
      const probes = [
        section.sectionTitle,
        ...section.anchorTexts,
        ...section.templateSegments.slice(0, 3).map((segment) => segment.slice(0, 80)),
      ].filter(Boolean) as string[];

      const score = scoreLooseTextMatch(chunk, probes);
      if (score > bestScore) {
        bestScore = score;
        bestChunk = chunk;
      }
    }

    const templateText = section.templateSegments.join('\n').slice(0, 800);
    const samplePreview = safeText(bestChunk).slice(0, 120) || undefined;
    return {
      sectionId: section.sectionId,
      sectionTitle: section.sectionTitle,
      templateText,
      sampleText: bestChunk,
      samplePreview,
      sampleMatchScore: bestScore,
      compareMode: bestScore >= 8
        ? 'section_loose_compare'
        : (sampleChunksList.length > 0 ? 'global_probe_fallback' : 'structure_only'),
    };
  });
}

export function buildCompareSummary(
  candidateFields: WorkflowFieldCandidate[],
  warnings: string[],
  sectionContexts: WorkflowCompareSectionContext[] = [],
): WorkflowCompareResult['compareSummary'] {
  const sectionMap = new Map<string, {
    sectionId: string;
    sectionTitle: string;
    candidateCount: number;
    matchedCandidateCount: number;
    unmatchedCandidateCount: number;
    highConfidenceCandidateCount: number;
    compareStatus: 'aligned' | 'partial' | 'attention';
    compareMode: 'section_loose_compare' | 'global_probe_fallback' | 'structure_only';
    looseMatchScore: number;
    topAnchors: string[];
    samplePreview?: string;
  }>();
  const sectionContextMap = new Map(sectionContexts.map((section) => [section.sectionId, section]));
  const sectionOrderMap = new Map(sectionContexts.map((section, index) => [section.sectionId, index]));

  for (const sectionContext of sectionContexts) {
    sectionMap.set(sectionContext.sectionId, {
      sectionId: sectionContext.sectionId,
      sectionTitle: sectionContext.sectionTitle,
      candidateCount: 0,
      matchedCandidateCount: 0,
      unmatchedCandidateCount: 0,
      highConfidenceCandidateCount: 0,
      compareStatus: 'attention',
      compareMode: sectionContext.compareMode,
      looseMatchScore: sectionContext.sampleMatchScore,
      topAnchors: [],
      samplePreview: sectionContext.samplePreview,
    });
  }

  for (const candidate of candidateFields) {
    const sectionId = safeText(candidate.sectionId || candidate.sectionTitle || candidate.sourceBlockId);
    const sectionTitle = safeText(candidate.sectionTitle || candidate.sectionId || candidate.sourceBlockId);
    if (!sectionId || !sectionTitle) {
      continue;
    }
    const sectionContext = sectionContextMap.get(sectionId);
    const current = sectionMap.get(sectionId) || {
      sectionId,
      sectionTitle,
      candidateCount: 0,
      matchedCandidateCount: 0,
      unmatchedCandidateCount: 0,
      highConfidenceCandidateCount: 0,
      compareStatus: 'attention' as const,
      compareMode: sectionContext?.compareMode || 'structure_only',
      looseMatchScore: sectionContext?.sampleMatchScore || 0,
      topAnchors: [],
      samplePreview: sectionContext?.samplePreview,
    };
    current.candidateCount += 1;
    if (safeText(candidate.matchText)) {
      current.matchedCandidateCount += 1;
      if (!current.samplePreview) {
        current.samplePreview = safeText(candidate.matchText).slice(0, 120);
      }
    }
    if (candidate.confidence >= 0.8) {
      current.highConfidenceCandidateCount += 1;
    }
    const anchorText = safeText(candidate.anchorText);
    if (anchorText && !current.topAnchors.includes(anchorText) && current.topAnchors.length < 3) {
      current.topAnchors.push(anchorText);
    }
    current.unmatchedCandidateCount = Math.max(0, current.candidateCount - current.matchedCandidateCount);
    current.compareStatus = current.matchedCandidateCount === 0
      ? 'attention'
      : (current.unmatchedCandidateCount === 0 ? 'aligned' : 'partial');
    sectionMap.set(sectionId, current);
  }

  const sections = Array.from(sectionMap.values())
    .sort((left, right) => (
      (sectionOrderMap.get(left.sectionId) ?? Number.MAX_SAFE_INTEGER)
        - (sectionOrderMap.get(right.sectionId) ?? Number.MAX_SAFE_INTEGER)
      || getCompareSectionPriority(right.compareStatus) - getCompareSectionPriority(left.compareStatus)
      || right.looseMatchScore - left.looseMatchScore
      || right.candidateCount - left.candidateCount
      || right.matchedCandidateCount - left.matchedCandidateCount
      || left.sectionTitle.localeCompare(right.sectionTitle, 'zh-Hans-CN')
    ))
    .slice(0, 8);

  return {
    candidateCount: candidateFields.length,
    sectionCount: sectionMap.size,
    sections,
    warnings: Array.from(new Set([
      ...warnings,
      ...sections
        .filter((section) => section.candidateCount === 0 && section.looseMatchScore >= 8)
        .slice(0, 3)
        .map((section) => `章节 ${section.sectionTitle} 已命中样本文本，但当前未形成候选字段，请人工关注。`),
      ...(sections.length > 0 && sections.every((section) => section.compareStatus === 'attention')
        ? ['当前模板对比未形成明确章节命中，后续识别将更多依赖 AI 与规则回退。']
        : []),
    ])),
  };
}
