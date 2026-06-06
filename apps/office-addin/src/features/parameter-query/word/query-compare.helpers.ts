import type { TemplateCompareResponse, TemplateFieldCandidate } from '../../../api/carbone-api';
import { extractWordParamName, resolveWordHeaderFieldKey } from '../../../host/office/word/parameter';

export type CompareUnderlineRangeLike = {
  text: string;
  underlineType: string;
  index: number;
  paragraphIndex: number;
  paragraphText: string;
  position: { start: number; end: number };
};

export type WordCandidateHintSummary = {
  fieldIdHint?: string;
  fieldTypeHint?: string;
  generationPolicyHint?: TemplateFieldCandidate['generationPolicyHint'];
  placeholderPattern: 'inline_ellipsis_gap' | 'underline_or_space_gap' | 'label_only_gap' | 'table_cell_gap';
  promptHint?: string;
};

const WORD_FIELD_HINT_MAP: Record<string, {
  fieldTypeHint: string;
  generationPolicyHint: NonNullable<TemplateFieldCandidate['generationPolicyHint']>;
}> = {
  contractNo: {
    fieldTypeHint: 'text',
    generationPolicyHint: 'llm_translate',
  },
  signingDate: {
    fieldTypeHint: 'date',
    generationPolicyHint: 'format_only',
  },
  signingPlace: {
    fieldTypeHint: 'geo_name',
    generationPolicyHint: 'llm_translate',
  },
  partyAName: {
    fieldTypeHint: 'legal_entity_name',
    generationPolicyHint: 'dictionary_first',
  },
  partyBName: {
    fieldTypeHint: 'legal_entity_name',
    generationPolicyHint: 'dictionary_first',
  },
  serviceName: {
    fieldTypeHint: 'service_name',
    generationPolicyHint: 'dictionary_first',
  },
  projectName: {
    fieldTypeHint: 'project_name',
    generationPolicyHint: 'dictionary_first',
  },
  serviceLocation: {
    fieldTypeHint: 'geo_name',
    generationPolicyHint: 'llm_translate',
  },
};

function normalizeWordHintText(...values: Array<unknown>): string {
  return values
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
}

export function getLanguageHintLabel(hint?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown'): string {
  switch (hint) {
    case 'zh':
      return '中文';
    case 'ja':
      return '日文';
    case 'en':
      return '英文';
    case 'mixed':
      return '混合';
    case 'unknown':
    default:
      return '未知';
  }
}

function isMachineGeneratedCompareFieldIdHint(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(String(value || '').trim());
}

function getCompareCandidateAnchorLabel(candidate: TemplateCompareResponse['candidateFields'][number]): string {
  return extractWordParamName(candidate.localAnchorText || candidate.anchorText || '').trim();
}

export function inferWordCandidateHints(candidate: Pick<TemplateFieldCandidate, 'anchorText' | 'segmentText' | 'sampleValue' | 'matchReason'>): WordCandidateHintSummary {
  const combinedText = normalizeWordHintText(
    candidate.anchorText,
    extractWordParamName(candidate.anchorText || ''),
    candidate.segmentText,
    candidate.sampleValue
  );
  const directFieldIdHint = resolveWordHeaderFieldKey(candidate.anchorText || '')
    || resolveWordHeaderFieldKey(extractWordParamName(candidate.anchorText || ''));
  const fieldIdHint = directFieldIdHint;
  const hintConfig = fieldIdHint ? WORD_FIELD_HINT_MAP[fieldIdHint] : undefined;
  const hasInlineEllipsis = /(?:\.{3,}|…+)/u.test(combinedText);
  const placeholderPattern = candidate.matchReason?.includes('表格规则')
    ? 'table_cell_gap'
    : candidate.matchReason?.includes('下划线规则')
      ? 'underline_or_space_gap'
      : hasInlineEllipsis
        ? 'inline_ellipsis_gap'
        : 'label_only_gap';
  const promptHint = hasInlineEllipsis
    ? '句内出现省略号、下划线或空格占位时，应优先根据占位前后文和样本值识别被替换的业务实体，不要把占位后的整段正文误当成参数值。'
    : undefined;

  return {
    fieldIdHint,
    fieldTypeHint: hintConfig?.fieldTypeHint,
    generationPolicyHint: hintConfig?.generationPolicyHint,
    placeholderPattern,
    promptHint,
  };
}

export function getCompareLanguageRelationLabel(candidate: TemplateCompareResponse['candidateFields'][number]): string {
  const relation = candidate.languageRelation;
  if (!relation) {
    return '未标注';
  }
  switch (relation.mode) {
    case 'adjacent_bilingual_block':
      return `${getLanguageHintLabel(relation.currentLanguageHint)} -> 邻近 ${getLanguageHintLabel(relation.peerLanguageHint)}`;
    case 'same_block_mixed_language':
      return '同块混合语言';
    case 'single_language':
      return `${getLanguageHintLabel(relation.currentLanguageHint)}单语`;
    case 'unknown':
    default:
      return '未知';
  }
}

export function formatCompareLocation(candidate: TemplateCompareResponse['candidateFields'][number]): string {
  const location = candidate.location;
  if (!location) {
    return '未标注';
  }
  const parts = [
    location.blockType ? `块:${location.blockType}` : '',
    location.paragraphIndex !== undefined ? `段落#${location.paragraphIndex}` : '',
    location.tableIndex !== undefined ? `表#${location.tableIndex}` : '',
    location.rowIndex !== undefined ? `行#${location.rowIndex}` : '',
    location.cellIndex !== undefined ? `列#${location.cellIndex}` : '',
    location.contentControlId !== undefined ? `控件#${location.contentControlId}` : '',
    location.anchorStart !== undefined && location.anchorEnd !== undefined
      ? `锚点${location.anchorStart}-${location.anchorEnd}`
      : '',
  ].filter(Boolean);
  return parts.join(' | ') || '未标注';
}

export function getCompareCandidateDisplayName(candidate: TemplateCompareResponse['candidateFields'][number]): string {
  const fieldIdHint = String(candidate.fieldIdHint || '').trim();
  const anchorLabel = getCompareCandidateAnchorLabel(candidate);

  if (fieldIdHint && (!anchorLabel || !isMachineGeneratedCompareFieldIdHint(fieldIdHint))) {
    return fieldIdHint;
  }

  return anchorLabel
    || fieldIdHint
    || candidate.anchorText
    || '候选字段';
}

export function buildCompareDebugText(
  result: TemplateCompareResponse,
  debugContext?: {
    underlineCount?: number;
    underlineCharCount?: number;
    underlineSpaceCount?: number;
    tableCellCount?: number;
    paragraphCount?: number;
    underlines?: CompareUnderlineRangeLike[];
  }
): string {
  const buildUnderlineSnippet = (underline: CompareUnderlineRangeLike): string => {
    const sourceText = underline.paragraphText || '';
    if (!sourceText) {
      return '无上下文';
    }
    const snippetStart = Math.max(0, underline.position.start - 12);
    const snippetEnd = Math.min(sourceText.length, underline.position.end + 12);
    return sourceText.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim() || '无上下文';
  };

  const buildUnderlineDiagnostics = (): string => {
    const underlines = debugContext?.underlines || [];
    if (underlines.length === 0) {
      return '本次未记录原始下划线锚点。';
    }

    const candidateLines = underlines.slice(0, 30).map((underline, index) => {
      const matchedCandidates = result.candidateFields.filter((candidate) => {
        const paragraphIndex = candidate.location?.paragraphIndex;
        const anchorStart = candidate.location?.anchorStart;
        const anchorEnd = candidate.location?.anchorEnd;
        if (
          paragraphIndex !== underline.paragraphIndex
          || typeof anchorStart !== 'number'
          || typeof anchorEnd !== 'number'
        ) {
          return false;
        }
        return Math.max(anchorStart, underline.position.start) <= Math.min(anchorEnd, underline.position.end);
      });

      const location = `段落#${underline.paragraphIndex} | 锚点${underline.position.start}-${underline.position.end}`;
      const underlineMeta = `${underline.underlineType || 'unknown'} | ${JSON.stringify(underline.text)}`;
      const snippet = buildUnderlineSnippet(underline);
      if (matchedCandidates.length === 0) {
        return `${index + 1}. ${location} | ${underlineMeta} | 未进入候选池 | 片段: ${snippet}`;
      }

      return `${index + 1}. ${location} | ${underlineMeta} | 命中候选: ${matchedCandidates
        .map((candidate) => `${getCompareCandidateDisplayName(candidate)}(${formatCompareLocation(candidate)})`)
        .join(' ; ')} | 片段: ${snippet}`;
    });

    const unmatchedCount = underlines.filter((underline) => !result.candidateFields.some((candidate) => {
      const paragraphIndex = candidate.location?.paragraphIndex;
      const anchorStart = candidate.location?.anchorStart;
      const anchorEnd = candidate.location?.anchorEnd;
      if (
        paragraphIndex !== underline.paragraphIndex
        || typeof anchorStart !== 'number'
        || typeof anchorEnd !== 'number'
      ) {
        return false;
      }
      return Math.max(anchorStart, underline.position.start) <= Math.min(anchorEnd, underline.position.end);
    })).length;

    return [
      `共记录 ${underlines.length} 个 underline 锚点，其中未进入候选池 ${unmatchedCount} 个。`,
      ...candidateLines,
      underlines.length > 30 ? `... 其余 ${underlines.length - 30} 个锚点已省略` : undefined,
    ].filter(Boolean).join('\n');
  };

  const buildSampleValueDiagnostics = (): string => {
    if (result.candidateFields.length === 0) {
      return '本次没有候选参数。';
    }

    return result.candidateFields
      .slice(0, 20)
      .map((candidate, index) => [
        `${index + 1}. ${getCompareCandidateDisplayName(candidate)}`,
        `锚点: ${candidate.anchorText || '无锚点'}`,
        `参考值: ${candidate.sampleValue || '待补参考值'}`,
        `参考片段: ${candidate.matchText || candidate.segmentText || '无参考片段'}`,
        `位置: ${formatCompareLocation(candidate)}`,
      ].join(' | '))
      .join('\n');
  };

  return [
    '【参数查询结果】',
    `workflowId: ${result.workflowId}`,
    `compareId: ${result.compareId}`,
    `候选字段: ${result.compareSummary.candidateCount}`,
    `章节数: ${result.compareSummary.sectionCount}`,
    debugContext ? `下划线锚点: ${debugContext.underlineCount || 0}（字符 ${debugContext.underlineCharCount || 0} / 空格 ${debugContext.underlineSpaceCount || 0}）` : undefined,
    debugContext ? `段落数: ${debugContext.paragraphCount || 0} | 表格单元格数: ${debugContext.tableCellCount || 0}` : undefined,
    '',
    '【候选池预览】',
    result.candidateFields
      .slice(0, 10)
      .map((candidate) =>
        `${candidate.candidateId} | ${candidate.fieldIdHint || inferWordCandidateHints(candidate).fieldIdHint || 'unknown'} | ${candidate.fieldTypeHint || inferWordCandidateHints(candidate).fieldTypeHint || 'text'} | ${candidate.anchorText || '无锚点'} | ${candidate.sampleValue || '无样本值'} | ${formatCompareLocation(candidate)} | ${getCompareLanguageRelationLabel(candidate)} | ${candidate.matchReason || '无命中说明'}`
      )
      .join('\n') || '无',
    '',
    '【查询诊断】',
    debugContext
      ? '下划线锚点已进入前端规则检测；若候选数明显少于下划线锚点数，通常是空格区域未通过 underline 校验、冒号规则被同段下划线抑制，或同位置候选被去重。'
      : '缓存结果未附带本次查询的原始下划线统计。',
    '',
    '【下划线锚点对照】',
    buildUnderlineDiagnostics(),
    '',
    '【参考值提取预览】',
    buildSampleValueDiagnostics(),
  ].join('\n');
}

export function rebuildCompareSummary(
  currentSummary: TemplateCompareResponse['compareSummary'],
  candidateFields: TemplateFieldCandidate[],
): TemplateCompareResponse['compareSummary'] {
  const sectionOrder = new Map(currentSummary.sections.map((section, index) => [section.sectionId, index]));
  const sectionMap = new Map<string, TemplateCompareResponse['compareSummary']['sections'][number]>();

  candidateFields.forEach((candidate) => {
    const sectionId = candidate.sectionId || `__ungrouped__${candidate.sourceBlockId}`;
    const sectionTitle = candidate.sectionTitle || '未归类章节';
    const currentSection = sectionMap.get(sectionId) || {
      sectionId,
      sectionTitle,
      candidateCount: 0,
      matchedCandidateCount: 0,
      unmatchedCandidateCount: 0,
      highConfidenceCandidateCount: 0,
      compareStatus: 'attention' as const,
      compareMode: 'structure_only' as const,
      looseMatchScore: 0,
      topAnchors: [],
      samplePreview: undefined,
    };

    currentSection.candidateCount += 1;
    if (candidate.matchText) {
      currentSection.matchedCandidateCount += 1;
      currentSection.samplePreview = currentSection.samplePreview || candidate.matchText;
    } else {
      currentSection.unmatchedCandidateCount += 1;
    }
    if ((candidate.confidence || 0) >= 0.85) {
      currentSection.highConfidenceCandidateCount += 1;
    }
    if (candidate.compareMode === 'section_loose_compare') {
      currentSection.compareMode = 'section_loose_compare';
    } else if (
      candidate.compareMode === 'global_probe_fallback'
      && currentSection.compareMode !== 'section_loose_compare'
    ) {
      currentSection.compareMode = 'global_probe_fallback';
    }
    currentSection.looseMatchScore = Math.max(currentSection.looseMatchScore, candidate.sectionMatchScore || 0);
    if (candidate.anchorText && !currentSection.topAnchors.includes(candidate.anchorText)) {
      currentSection.topAnchors = [...currentSection.topAnchors, candidate.anchorText].slice(0, 5);
    }
    sectionMap.set(sectionId, currentSection);
  });

  const sections: TemplateCompareResponse['compareSummary']['sections'] = Array.from(sectionMap.values())
    .map((section) => {
      const compareStatus: TemplateCompareResponse['compareSummary']['sections'][number]['compareStatus'] = section.matchedCandidateCount === 0
        ? 'attention'
        : (section.matchedCandidateCount === section.candidateCount ? 'aligned' : 'partial');
      return {
        ...section,
        compareStatus,
      };
    })
    .sort((left, right) => {
      const leftOrder = sectionOrder.get(left.sectionId);
      const rightOrder = sectionOrder.get(right.sectionId);
      if (leftOrder !== undefined && rightOrder !== undefined) {
        return leftOrder - rightOrder;
      }
      if (leftOrder !== undefined) {
        return -1;
      }
      if (rightOrder !== undefined) {
        return 1;
      }
      return left.sectionTitle.localeCompare(right.sectionTitle, 'zh-Hans-CN');
    });

  return {
    ...currentSummary,
    candidateCount: candidateFields.length,
    sectionCount: sections.length,
    sections,
  };
}
