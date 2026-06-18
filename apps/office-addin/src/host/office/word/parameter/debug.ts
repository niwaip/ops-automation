import type {
  WordDetectedParam,
  WordGapParamMatch,
  WordParagraphLike,
  WordTableCellLike,
  WordUnderlineLike,
} from './types';
import { resolveExactHeaderFieldSpec } from './anchor';
import { collectWordTitleBlockParagraphIndexes, inspectWordHeaderTitle } from './heading-filter';
import { WordDocumentParameterRuleProfile } from './profiles';
import { normalizeWordLookupText, safeWordRuleText } from '../shared/text';

export function truncateWordDebugText(value: string, maxLength = 72): string {
  const normalized = safeWordRuleText(value);
  if (!normalized) {
    return '';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export function formatWordDebugBoolean(value: boolean): string {
  return value ? 'yes' : 'no';
}

export function formatWordDebugList(values: string[], maxItems = 3): string {
  const normalized = values.map((value) => truncateWordDebugText(value, 24)).filter(Boolean);
  if (normalized.length === 0) {
    return '-';
  }
  if (normalized.length <= maxItems) {
    return normalized.join(' / ');
  }
  return `${normalized.slice(0, maxItems).join(' / ')} / +${normalized.length - maxItems}`;
}

function normalizeWordDebugKeyword(value: string): string {
  return normalizeWordLookupText(String(value || ''));
}

function buildWordDebugKeywordSet(keywords: string[]): string[] {
  return Array.from(
    new Set(keywords.map((keyword) => normalizeWordDebugKeyword(keyword)).filter(Boolean))
  );
}

export function buildWordKeywordFocusedDebugExcerpt(args: {
  title: string;
  text: string;
  keywords?: string[];
  contextLineCount?: number;
  maxBlocks?: number;
}): string {
  const { title, text, keywords = [], contextLineCount = 2, maxBlocks = 4 } = args;
  const sourceText = String(text || '').trim();
  if (!sourceText) {
    return `${title}\n无日志内容`;
  }

  const normalizedKeywords = buildWordDebugKeywordSet(keywords);
  if (normalizedKeywords.length === 0) {
    return sourceText;
  }

  const lines = sourceText.split(/\r?\n/u);
  const matchedLineIndexes = lines
    .map((line, index) => ({
      index,
      normalizedLine: normalizeWordDebugKeyword(line),
    }))
    .filter(({ normalizedLine }) =>
      normalizedKeywords.some((keyword) => normalizedLine.includes(keyword))
    )
    .map(({ index }) => index);

  if (matchedLineIndexes.length === 0) {
    return [
      title,
      `关键字: ${keywords.join(' / ')}`,
      '未命中关键字，保留原始日志首段供排查：',
      ...lines.slice(0, Math.min(lines.length, 12)),
    ].join('\n');
  }

  const blocks: Array<{ start: number; end: number }> = [];
  matchedLineIndexes.forEach((lineIndex) => {
    const start = Math.max(0, lineIndex - contextLineCount);
    const end = Math.min(lines.length - 1, lineIndex + contextLineCount);
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && start <= lastBlock.end + 1) {
      lastBlock.end = Math.max(lastBlock.end, end);
      return;
    }
    blocks.push({ start, end });
  });

  const visibleBlocks = blocks.slice(0, Math.max(maxBlocks, 1));
  const excerptLines = visibleBlocks.flatMap((block, index) => {
    const blockLines = lines.slice(block.start, block.end + 1);
    return index < visibleBlocks.length - 1 ? [...blockLines, '...'] : blockLines;
  });

  return [
    title,
    `关键字: ${keywords.join(' / ')}`,
    `命中行数: ${matchedLineIndexes.length} | 片段数: ${blocks.length}`,
    ...excerptLines,
    blocks.length > visibleBlocks.length
      ? `... 其余 ${blocks.length - visibleBlocks.length} 个片段已省略`
      : undefined,
  ]
    .filter(Boolean)
    .join('\n');
}

type BuildWordParameterDetectionDebugTextDependencies = {
  getWordDocumentParameterRuleProfile: (templateType: string) => WordDocumentParameterRuleProfile;
  detectWordParamsByRules: (args: {
    ruleNames: WordDocumentParameterRuleProfile['parameterCheckRules'];
    paragraphs: WordParagraphLike[];
    underlines: WordUnderlineLike[];
    tableCells: WordTableCellLike[];
    sampleText?: string;
    includeLabelOnly?: boolean;
  }) => WordDetectedParam[];
  findWordInlineGapParam: (text: string) => WordGapParamMatch | null;
  findWordTerminalGapParam: (text: string) => WordGapParamMatch | null;
  extractRepeatedWordTrailingLabels: (
    text: string
  ) => Array<{ anchorText: string; start: number; end: number }>;
  endsWithWordParamLabel: (text: string) => boolean;
  isParagraphLikelyInsideWordTable: (
    paragraphText: string,
    tableCells: WordTableCellLike[]
  ) => boolean;
};

export function buildWordParameterDetectionDebugText(
  args: {
    templateType: string;
    paragraphs: WordParagraphLike[];
    underlines: WordUnderlineLike[];
    tableCells: WordTableCellLike[];
    sampleText?: string;
    includeLabelOnly?: boolean;
    keywordFilters?: string[];
    maxParagraphs?: number;
  },
  deps: BuildWordParameterDetectionDebugTextDependencies
): string {
  const {
    templateType,
    paragraphs,
    underlines,
    tableCells,
    sampleText = '',
    includeLabelOnly = true,
    keywordFilters = [],
    maxParagraphs = 40,
  } = args;
  const normalizedKeywordFilters = buildWordDebugKeywordSet(keywordFilters);
  const ruleProfile = deps.getWordDocumentParameterRuleProfile(templateType);
  const skipParagraphIndexes = collectWordTitleBlockParagraphIndexes(paragraphs, tableCells, {
    findWordInlineGapParam: deps.findWordInlineGapParam,
    findWordTerminalGapParam: deps.findWordTerminalGapParam,
    isParagraphLikelyInsideWordTable: deps.isParagraphLikelyInsideWordTable,
  });
  const detectedParams = deps.detectWordParamsByRules({
    ruleNames: ruleProfile.parameterCheckRules,
    paragraphs,
    underlines,
    tableCells,
    sampleText,
    includeLabelOnly,
  });
  const candidatesByParagraph = new Map<number, WordDetectedParam[]>();
  detectedParams.forEach((param) => {
    const current = candidatesByParagraph.get(param.paragraphIndex) || [];
    current.push(param);
    candidatesByParagraph.set(param.paragraphIndex, current);
  });
  const underlinesByParagraph = new Map<number, WordUnderlineLike[]>();
  underlines.forEach((underline) => {
    const current = underlinesByParagraph.get(underline.paragraphIndex) || [];
    current.push(underline);
    underlinesByParagraph.set(underline.paragraphIndex, current);
  });
  const normalizedNonEmptyTableCellTexts = new Set(
    tableCells
      .map((cell) => safeWordRuleText(cell.text))
      .filter((text) => Boolean(text) && text.length <= 40)
      .map((text) => normalizeWordLookupText(text))
  );

  const paragraphReports = paragraphs
    .filter((paragraph) => safeWordRuleText(paragraph.text))
    .sort((left, right) => left.index - right.index)
    .map((paragraph) => {
      const inlineGap = deps.findWordInlineGapParam(paragraph.text);
      const terminalGap = deps.findWordTerminalGapParam(paragraph.text);
      const repeatedLabels = includeLabelOnly
        ? deps.extractRepeatedWordTrailingLabels(paragraph.text)
        : [];
      const trailingLabel = includeLabelOnly && deps.endsWithWordParamLabel(paragraph.text);
      const exactHeaderFieldSpec = resolveExactHeaderFieldSpec(paragraph.text);
      const paragraphUnderlines = underlinesByParagraph.get(paragraph.index) || [];
      const headerInspection = inspectWordHeaderTitle(paragraph.text, paragraph.format, {
        paragraphs,
        paragraphIndex: paragraph.index,
        underlineCount: paragraphUnderlines.length,
        repeatedLabelCount: repeatedLabels.length,
        hasInlineGap: Boolean(inlineGap),
        hasTerminalGap: Boolean(terminalGap),
        underlinesByParagraph,
      });
      const paragraphCandidates = candidatesByParagraph.get(paragraph.index) || [];
      const insideTable = deps.isParagraphLikelyInsideWordTable(paragraph.text, tableCells);
      const duplicatedFromTableCell = normalizedNonEmptyTableCellTexts.has(
        normalizeWordLookupText(paragraph.text)
      );
      const shouldHighlight =
        headerInspection.matched ||
        paragraphCandidates.length > 0 ||
        paragraphUnderlines.length > 0 ||
        Boolean(inlineGap || terminalGap || trailingLabel || exactHeaderFieldSpec) ||
        repeatedLabels.length > 0 ||
        skipParagraphIndexes.has(paragraph.index);

      return {
        shouldHighlight,
        keywordMatched:
          normalizedKeywordFilters.length > 0
            ? normalizedKeywordFilters.some((keyword) =>
                normalizeWordLookupText(paragraph.text).includes(keyword)
              )
            : false,
        lines: [
          `段落#${paragraph.index} | ${JSON.stringify(truncateWordDebugText(paragraph.text, 90))}`,
          `  样式: styleBuiltIn=${JSON.stringify(String(paragraph.format?.styleBuiltIn || ''))} | style=${JSON.stringify(String(paragraph.format?.style || ''))} | fontSize=${String(paragraph.format?.fontSize || '')} | bold=${formatWordDebugBoolean(Boolean(paragraph.format?.isBold))} | isTitle=${formatWordDebugBoolean(Boolean(paragraph.format?.isTitle))} | align=${String(paragraph.format?.alignment || '') || '-'}`,
          `  标题判断: ${headerInspection.matched ? 'heading' : 'not_heading'} | reason=${headerInspection.reason} | display=${JSON.stringify(headerInspection.displayText)}`,
          `  规则命中: inlineGap=${inlineGap ? inlineGap.anchorText : '-'} | terminalGap=${terminalGap ? terminalGap.anchorText : '-'} | trailingLabel=${formatWordDebugBoolean(trailingLabel)} | exactHeaderField=${exactHeaderFieldSpec?.key || '-'} | repeatedLabels=${formatWordDebugList(repeatedLabels.map((item) => item.anchorText))}`,
          `  过滤状态: skipTitleBlock=${formatWordDebugBoolean(skipParagraphIndexes.has(paragraph.index))} | insideTable=${formatWordDebugBoolean(insideTable)} | duplicatedTableCell=${formatWordDebugBoolean(duplicatedFromTableCell)} | underlineCount=${paragraphUnderlines.length}`,
          `  最终结果: candidates=${paragraphCandidates.length} | anchors=${formatWordDebugList(paragraphCandidates.map((item) => item.anchorText))}`,
        ].join('\n'),
      };
    });

  const highlightedReports = paragraphReports.filter((item) => item.shouldHighlight);
  const keywordMatchedReports = paragraphReports.filter((item) => item.keywordMatched);
  const activeReports =
    keywordMatchedReports.length > 0
      ? keywordMatchedReports
      : highlightedReports.length > 0
        ? highlightedReports
        : paragraphReports;
  const visibleReports = activeReports.slice(0, maxParagraphs).map((item) => item.lines);

  return [
    '【逐段参数识别诊断】',
    `模板类型: ${templateType || 'unknown'}`,
    `规则: compare=${ruleProfile.compareCandidateRules.join(',') || '-'} | parameter=${ruleProfile.parameterCheckRules.join(',') || '-'}`,
    normalizedKeywordFilters.length > 0
      ? `关键字过滤: ${keywordFilters.join(' / ')} | 命中段落数: ${keywordMatchedReports.length}`
      : undefined,
    `段落数: ${paragraphs.length} | 下划线数: ${underlines.length} | 表格单元格数: ${tableCells.length} | 标题块跳过段落数: ${skipParagraphIndexes.size}`,
    `最终参数候选数: ${detectedParams.length}`,
    '',
    ...visibleReports,
    activeReports.length > maxParagraphs
      ? `... 其余 ${activeReports.length - maxParagraphs} 个诊断段落已省略`
      : paragraphReports.length > visibleReports.length
        ? `... 未展示的普通段落 ${paragraphReports.length - visibleReports.length} 个`
        : undefined,
  ]
    .filter(Boolean)
    .join('\n');
}
