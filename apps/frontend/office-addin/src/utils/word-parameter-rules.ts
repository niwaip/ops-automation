import { TemplateFieldCandidate } from '../api/carbone-api';
import { Anchor, DocumentElement, DocumentIR } from '../adapters/document-ir';

export type WordParameterRuleName = 'table' | 'underline' | 'colon';

export type WordDocumentParameterRuleProfile = {
  documentType: string;
  compareCandidateRules: WordParameterRuleName[];
  parameterCheckRules: WordParameterRuleName[];
};

export type WordGapParamMatch = {
  anchorText: string;
  start: number;
  end: number;
};

export type WordParagraphLike = {
  id?: string;
  index: number;
  text: string;
  format?: Record<string, unknown>;
};

export type WordUnderlineLike = {
  text: string;
  underlineType: string;
  paragraphIndex: number;
  paragraphText: string;
  position: {
    start: number;
    end: number;
  };
};

export type WordTableCellLike = {
  sourceBlockId?: string;
  tableIndex: number;
  rowIndex: number;
  cellIndex: number;
  text: string;
};

export type WordDetectedParam = {
  id: string;
  sourceType: 'underline' | 'label-only' | 'table-cell';
  paragraphIndex: number;
  start: number;
  end: number;
  rawText: string;
  underlineType: string;
  anchorText: string;
  localAnchorText?: string;
  parameterSlot?: string;
  paramName: string;
  paragraphText: string;
  sourceBlockId?: string;
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
  sampleValue?: string;
  sampleMatchText?: string;
  languageHint?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
};

type WordTableDetectionDebugEntry = {
  tableIndex: number;
  tableType: 'loop' | 'comparison' | 'unknown';
  reason: string;
  rowSummaries: string[];
  cellDiagnostics: string[];
  generatedParamCount: number;
};

type HeaderFieldSpec = {
  key: string;
  aliases: string[];
};

const DEFAULT_WORD_PARAMETER_RULE_PROFILE: WordDocumentParameterRuleProfile = {
  documentType: 'report',
  compareCandidateRules: [],
  parameterCheckRules: [],
};

const WORD_DOCUMENT_PARAMETER_RULE_PROFILES: Record<string, WordDocumentParameterRuleProfile> = {
  contract: {
    documentType: 'contract',
    compareCandidateRules: ['table', 'underline', 'colon'],
    parameterCheckRules: ['table', 'underline', 'colon'],
  },
  report: DEFAULT_WORD_PARAMETER_RULE_PROFILE,
};

const HEADER_FIELD_SPECS: HeaderFieldSpec[] = [
  { key: 'contractNo', aliases: ['合同编号', '合同号', '契約番号', '契約no', 'no.', 'contract no'] },
  { key: 'signingDate', aliases: ['签订日期', '签约日期', '締結日', '契約締結日', 'dated', 'date'] },
  { key: 'signingPlace', aliases: ['签订地点', '签约地点', '締結場所', '契約締結場所'] },
  { key: 'partyAName', aliases: ['委托方', '甲方', '委託者'] },
  { key: 'partyBName', aliases: ['受托方', '乙方', '受託者'] },
  { key: 'serviceName', aliases: ['服务名称', '服务内容', '服务项目', '服务项目名称', 'サービス名称', 'サービス名', '業務名称', '業務名'] },
  { key: 'projectName', aliases: ['项目名称', '项目', 'プロジェクト名', 'プロジェクト'] },
  { key: 'serviceLocation', aliases: ['服务地点', '服务地址', '履行地点', '系统设置场所', '系统设定场所', '系统安装场所', 'サービス場所', '履行場所', '技術サービスの場所', 'システム設置場所', 'システム設定場所', 'システム導入場所'] },
];

function getWordDocumentElements(documentIr: DocumentIR | Record<string, any> | null | undefined): DocumentElement[] {
  return Array.isArray(documentIr?.elements) ? documentIr.elements as DocumentElement[] : [];
}

function getWordDocumentAnchors(documentIr: DocumentIR | Record<string, any> | null | undefined): Anchor[] {
  return Array.isArray(documentIr?.anchors) ? documentIr.anchors as Anchor[] : [];
}

function toFiniteNumber(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncateWordRuleText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function normalizeAnchorCore(value: string): string {
  return normalizeWordLookupText(String(value || '').replace(/[：:]$/u, ''))
    .replace(/[，。、．,.・]/g, '');
}

function resolveHeaderFieldSpec(anchorText: string): HeaderFieldSpec | null {
  const normalizedAnchor = normalizeAnchorCore(anchorText);
  if (!normalizedAnchor) {
    return null;
  }

  return HEADER_FIELD_SPECS.find((spec) =>
    spec.aliases.some((alias) => normalizedAnchor.includes(normalizeWordLookupText(alias)))
  ) || null;
}

function resolveExactHeaderFieldSpec(anchorText: string): HeaderFieldSpec | null {
  const normalizedAnchor = normalizeAnchorCore(anchorText);
  if (!normalizedAnchor) {
    return null;
  }

  return HEADER_FIELD_SPECS.find((spec) =>
    spec.aliases.some((alias) => normalizedAnchor === normalizeWordLookupText(alias))
  ) || null;
}

export function resolveWordHeaderFieldKey(anchorText: string): string | undefined {
  if (!isExplicitWordParamLabelAnchor(anchorText)) {
    return undefined;
  }
  return resolveHeaderFieldSpec(anchorText)?.key;
}

export function getWordHeaderAliasCandidates(anchorText: string): string[] {
  const normalizedAnchor = safeWordRuleText(anchorText);
  if (!normalizedAnchor) {
    return [];
  }

  const trailingSeparatorMatch = normalizedAnchor.match(/[：:]$/u);
  const trailingSeparator = trailingSeparatorMatch?.[0] || '';
  const anchorCore = normalizedAnchor.replace(/[：:]$/u, '').trim();
  const spec = resolveHeaderFieldSpec(anchorCore || normalizedAnchor);
  const aliases = spec?.aliases || [];

  return Array.from(new Set(
    [anchorCore, ...aliases]
      .map((alias) => safeWordRuleText(alias))
      .filter(Boolean)
      .map((alias) => (trailingSeparator ? `${alias}${trailingSeparator}` : alias))
  ));
}

function buildWordAnchorCandidates(anchorText: string): string[] {
  const directAnchor = safeWordRuleText(anchorText).replace(/[：:]$/u, '');
  const spec = resolveWordAnchorAliasSpec(anchorText);
  const aliases = spec?.aliases || [];
  return Array.from(new Set([directAnchor, ...aliases].map((item) => safeWordRuleText(item)).filter(Boolean)));
}

function isExplicitWordParamLabelAnchor(anchorText: string): boolean {
  const normalizedAnchor = safeWordRuleText(anchorText);
  if (!normalizedAnchor) {
    return false;
  }
  if (/[：:]$/u.test(normalizedAnchor)) {
    return true;
  }
  if (resolveExactHeaderFieldSpec(normalizedAnchor)) {
    return true;
  }

  const displayAnchor = normalizedAnchor.replace(/[：:]$/u, '').trim();
  if (!displayAnchor || displayAnchor.length > 24) {
    return false;
  }
  if (/(?:\.{3,}|…+)/u.test(displayAnchor)) {
    return false;
  }
  if (/[，。；;、]/u.test(displayAnchor)) {
    return false;
  }

  return Boolean(resolveHeaderFieldSpec(displayAnchor));
}

function resolveWordAnchorAliasSpec(anchorText: string): HeaderFieldSpec | null {
  if (!isExplicitWordParamLabelAnchor(anchorText)) {
    return null;
  }
  return resolveHeaderFieldSpec(anchorText);
}

function isAttachmentHeading(text: string): boolean {
  return /^[\s　]*[【\[]?(?:附件|付属文書)(?:[一二三四五六七八九十百千万零两0-9０-９]+)?[】\]]?[\s　：:]*/u
    .test(String(text || '').trim());
}

function looksLikeSectionLeadSentence(text: string): boolean {
  const normalized = safeWordRuleText(text);
  if (!normalized || normalized.length > 80) {
    return false;
  }

  if (!/[：:]$/u.test(normalized)) {
    return false;
  }

  const displayText = normalized.replace(/[：:]$/u, '').trim();
  if (!displayText) {
    return false;
  }

  const hiraganaMatches = displayText.match(/[\u3040-\u309f]/gu) || [];
  const hasJapaneseSentenceStyle = hiraganaMatches.length >= 2 && displayText.length >= 10;
  const hasChineseLeadCue = /(?:如下|说明如下|约定如下|内容如下|条款如下|方式如下|时间如下|支付如下)$/u.test(displayText);

  return hasJapaneseSentenceStyle || hasChineseLeadCue;
}

function extractSampleValueFromMatchText(anchorText: string, matchText: string): string {
  const trimReferenceValue = (value: string): string => {
    let normalized = safeWordRuleText(value);
    if (!normalized) {
      return '';
    }

    normalized = normalized
      .replace(/[（(][^（）()]{0,40}[）)]/gu, '')
      .replace(/[，,]\s*(?:及其他|和其他|以及其他|及びその他|その他).*/u, '')
      .replace(/[、,，]\s*(?:詳(?:细|細)|详细|詳細).*/u, '')
      .trim();

    return normalized;
  };

  const snippet = safeWordRuleText(matchText);
  if (!snippet) {
    return '';
  }

  const anchorCandidates = buildWordAnchorCandidates(anchorText);
  for (const anchorCandidate of anchorCandidates) {
    const directMatch = snippet.match(new RegExp(`${escapeRegExp(anchorCandidate)}[：:]?\\s*([^\\n]{1,80})`, 'iu'));
    const directValue = trimReferenceValue(directMatch?.[1] || '');
    if (directValue) {
      return truncateWordRuleText(directValue, 80);
    }
  }

  const colonValue = trimReferenceValue(snippet.match(/[：:]\s*([^\n]{1,80})/u)?.[1] || '');
  if (colonValue) {
    return truncateWordRuleText(colonValue, 80);
  }

  return truncateWordRuleText(trimReferenceValue(snippet.split(/[。；;]/u)[0]?.trim() || ''), 80);
}

function extractSampleValueBetweenContext(
  sampleText: string,
  prefix: string,
  suffix: string,
): { sampleValue?: string; sampleMatchText?: string } {
  if (!prefix || !suffix) {
    return {};
  }

  const rawSampleText = String(sampleText || '');
  if (!rawSampleText.trim()) {
    return {};
  }

  const normalizedPrefix = safeWordRuleText(prefix);
  const normalizedSuffix = safeWordRuleText(suffix);
  if (!normalizedPrefix || !normalizedSuffix) {
    return {};
  }
  const stopCandidates = buildWordContextStopCandidates(normalizedSuffix);

  const lines = rawSampleText
    .split(/[\r\n]+/u)
    .map((line) => safeWordRuleText(line))
    .filter(Boolean)
    .slice(0, 400);

  for (const line of lines) {
    const betweenValue = extractWordValueBetweenPrefixAndStops(line, normalizedPrefix, stopCandidates);
    if (betweenValue) {
      return {
        sampleValue: truncateWordRuleText(betweenValue, 80),
        sampleMatchText: line,
      };
    }
  }

  const normalizedSampleText = safeWordRuleText(rawSampleText);
  const betweenValue = extractWordValueBetweenPrefixAndStops(normalizedSampleText, normalizedPrefix, stopCandidates);
  if (!betweenValue) {
    return {};
  }

  return {
    sampleValue: truncateWordRuleText(betweenValue, 80),
    sampleMatchText: normalizedSampleText,
  };
}

function buildWordContextStopCandidates(normalizedSuffix: string): string[] {
  const compactSuffix = normalizedSuffix.replace(/\s+/g, '');
  const candidates = new Set<string>();

  if (normalizedSuffix) {
    candidates.add(normalizedSuffix);
  }

  [6, 8, 10, 12, 16].forEach((length) => {
    const compactHead = compactSuffix.slice(0, length);
    if (compactHead.length >= 4) {
      candidates.add(compactHead);
    }
  });

  return Array.from(candidates).filter(Boolean);
}

function findEarliestWordStopIndex(text: string, searchStart: number, stopCandidates: string[]): number {
  const normalizedText = safeWordRuleText(text);
  const compactText = normalizedText.replace(/\s+/g, '');
  const compactPrefix = normalizedText.slice(0, searchStart).replace(/\s+/g, '');
  let earliestCompactIndex = -1;

  stopCandidates.forEach((candidate) => {
    const compactCandidate = candidate.replace(/\s+/g, '');
    if (!compactCandidate) {
      return;
    }
    const candidateIndex = compactText.indexOf(compactCandidate, compactPrefix.length);
    if (candidateIndex >= 0 && (earliestCompactIndex < 0 || candidateIndex < earliestCompactIndex)) {
      earliestCompactIndex = candidateIndex;
    }
  });

  if (earliestCompactIndex < 0) {
    return -1;
  }

  let compactCursor = 0;
  for (let index = 0; index < normalizedText.length; index += 1) {
    if (/\s/u.test(normalizedText[index])) {
      continue;
    }
    if (compactCursor === earliestCompactIndex) {
      return index;
    }
    compactCursor += 1;
  }

  return -1;
}

function extractWordValueBetweenPrefixAndStops(
  text: string,
  normalizedPrefix: string,
  stopCandidates: string[],
): string {
  const normalizedText = safeWordRuleText(text);
  if (!normalizedText || !normalizedPrefix || stopCandidates.length === 0) {
    return '';
  }

  const prefixIndex = normalizedText.indexOf(normalizedPrefix);
  if (prefixIndex < 0) {
    return '';
  }
  const valueStart = prefixIndex + normalizedPrefix.length;
  const stopIndex = findEarliestWordStopIndex(normalizedText, valueStart, stopCandidates);
  if (stopIndex <= valueStart) {
    return '';
  }

  return safeWordRuleText(normalizedText.slice(valueStart, stopIndex));
}

function trimWordSampleValueBySuffixHints(value: string, suffix: string): string {
  const normalizedValue = safeWordRuleText(value);
  const stopCandidates = buildWordContextStopCandidates(safeWordRuleText(suffix));
  const trimmedByStops = stopCandidates.reduce((current, candidate) => {
    const compactCandidate = candidate.replace(/\s+/g, '');
    const compactCurrent = current.replace(/\s+/g, '');
    if (!compactCandidate) {
      return current;
    }
    const candidateIndex = compactCurrent.indexOf(compactCandidate);
    if (candidateIndex <= 0) {
      return current;
    }

    let compactCursor = 0;
    for (let index = 0; index < current.length; index += 1) {
      if (/\s/u.test(current[index])) {
        continue;
      }
      if (compactCursor === candidateIndex) {
        return safeWordRuleText(current.slice(0, index));
      }
      compactCursor += 1;
    }
    return current;
  }, normalizedValue);

  return trimmedByStops;
}

function findSampleMatchForWordParam(
  sampleText: string,
  param: Pick<WordDetectedParam, 'anchorText' | 'paragraphText' | 'start' | 'end'>,
): { sampleValue?: string; sampleMatchText?: string } {
  const rawSampleText = String(sampleText || '');
  const normalizedSampleText = safeWordRuleText(rawSampleText);
  if (!normalizedSampleText) {
    return {};
  }

  const anchorCandidates = buildWordAnchorCandidates(param.anchorText);
  const normalizedAnchors = anchorCandidates.map((item) => normalizeWordLookupText(item)).filter(Boolean);
  const prefix = safeWordRuleText(param.paragraphText.slice(0, param.start)).slice(-32);
  const suffix = safeWordRuleText(param.paragraphText.slice(param.end)).slice(0, 32);

  const lines = rawSampleText
    .split(/[\r\n]+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 400);

  if (prefix && suffix) {
    const contextMatch = extractSampleValueBetweenContext(sampleText, prefix, suffix);
    if (contextMatch.sampleValue) {
      return contextMatch;
    }
  }

  if (normalizedAnchors.length > 0) {
    const anchorLine = lines.find((line) => {
      const normalizedLine = normalizeWordLookupText(line);
      return normalizedAnchors.some((anchor) => normalizedLine.includes(anchor));
    });
    if (anchorLine) {
      const sampleValue = extractSampleValueFromMatchText(param.anchorText, anchorLine);
      if (sampleValue) {
        return {
          sampleValue,
          sampleMatchText: anchorLine,
        };
      }
    }
  }

  if (prefix) {
    const prefixPattern = new RegExp(`${escapeRegExp(prefix)}\\s*(.{1,80})`, 'u');
    const matched = normalizedSampleText.match(prefixPattern);
    const afterPrefixValue = trimWordSampleValueBySuffixHints(
      safeWordRuleText(matched?.[1]).split(/[，。；\n]/u)[0]?.trim() || '',
      suffix
    );
    if (afterPrefixValue) {
      return {
        sampleValue: truncateWordRuleText(afterPrefixValue, 80),
        sampleMatchText: matched?.[0] || '',
      };
    }
  }

  return {};
}

function dedupeDetectedWordParams(params: WordDetectedParam[]): WordDetectedParam[] {
  const seenKeys = new Set<string>();
  return params.filter((param) => {
    const key = param.sourceType === 'table-cell'
      ? `${param.sourceType}|${param.tableIndex}|${param.rowIndex}|${param.cellIndex}|${
        param.underlineType === 'table-loop-column'
          ? `${param.id}|${param.languageHint || ''}`
          : normalizeWordLookupText(param.paramName)
      }`
      : `${param.sourceType}|${param.paragraphIndex}|${param.start}|${param.end}|${normalizeWordLookupText(param.paramName)}`;
    if (seenKeys.has(key)) {
      return false;
    }
    seenKeys.add(key);
    return true;
  });
}

function buildWordRuleCandidate(param: WordDetectedParam): TemplateFieldCandidate | null {
  if (param.sourceType === 'label-only' && param.start >= param.end) {
    return null;
  }

  if (param.sourceType === 'table-cell') {
    const isLoopTable = param.underlineType === 'table-loop-column';
    const isRightLabelFallback = param.underlineType === 'table-cell-right-label';
    const isTopLabelFallback = param.underlineType === 'table-cell-top-label';
    return {
      candidateId: `fe-word-${param.id}`,
      sourceBlockId: param.sourceBlockId || `word-cell-${param.tableIndex}-${param.rowIndex}-${param.cellIndex}`,
      anchorText: param.localAnchorText || param.anchorText,
      localAnchorText: param.localAnchorText,
      parameterSlot: param.parameterSlot,
      sampleValue: param.sampleValue || '',
      segmentText: param.paragraphText || `${param.anchorText}\t${param.rawText || '______________'}`,
      sectionId: `word-table-${param.tableIndex}`,
      sectionTitle: `表格 ${(param.tableIndex || 0) + 1}`,
      confidence: isLoopTable ? 0.88 : (isRightLabelFallback ? 0.72 : (isTopLabelFallback ? 0.8 : 0.84)),
      matchReason: isLoopTable
        ? '前端表格规则: 标准表格列标题'
        : (
          isRightLabelFallback
            ? '前端表格规则: 左侧缺失时取右侧标签'
            : (isTopLabelFallback ? '前端表格规则: 上方标题映射空白单元格' : '前端表格规则: 空白单元格优先取左侧标签')
        ),
      compareMode: 'structure_only',
      sectionMatchScore: 0,
      location: {
        blockType: 'cell',
        tableIndex: param.tableIndex,
        rowIndex: param.rowIndex,
        cellIndex: param.cellIndex,
      },
      languageRelation: param.languageHint
        ? {
            mode: 'single_language',
            currentLanguageHint: param.languageHint,
          }
        : undefined,
    };
  }

  return {
    candidateId: `fe-word-${param.id}`,
    sourceBlockId: param.sourceBlockId || `word-paragraph-${param.paragraphIndex}`,
    anchorText: param.localAnchorText || param.anchorText,
    localAnchorText: param.localAnchorText,
    parameterSlot: param.parameterSlot,
    sampleValue: param.sampleValue || '',
    segmentText: param.paragraphText || param.anchorText,
    sectionId: `word-paragraph-${param.paragraphIndex}`,
    sectionTitle: `段落 ${param.paragraphIndex + 1}`,
    confidence: param.sourceType === 'underline' ? 0.82 : 0.76,
    matchReason: param.sourceType === 'underline'
      ? '前端下划线规则: 下划线或空格占位'
      : '前端冒号规则: 冒号后空白占位',
    compareMode: 'structure_only',
    sectionMatchScore: 0,
    location: {
      blockType: 'paragraph',
      paragraphIndex: param.paragraphIndex,
      anchorStart: param.start,
      anchorEnd: param.end,
    },
  };
}

function detectWordParamsByRules(args: {
  ruleNames: WordParameterRuleName[];
  paragraphs: WordParagraphLike[];
  underlines: WordUnderlineLike[];
  tableCells: WordTableCellLike[];
  sampleText?: string;
  includeLabelOnly?: boolean;
}): WordDetectedParam[] {
  const {
    ruleNames,
    paragraphs,
    underlines,
    tableCells,
    sampleText = '',
    includeLabelOnly = true,
  } = args;
  const params: WordDetectedParam[] = [];
  const skipParagraphIndexes = collectWordTitleBlockParagraphIndexes(paragraphs, tableCells);

  if (ruleNames.includes('underline')) {
    params.push(...detectWordUnderlineParams(underlines, paragraphs, sampleText));
  }
  if (ruleNames.includes('table')) {
    params.push(...detectWordTableParams(tableCells, sampleText));
  }
  if (ruleNames.includes('colon')) {
    params.push(...detectWordColonParams(paragraphs, underlines, tableCells, {
      sampleText,
      includeLabelOnly,
      skipParagraphIndexes,
    }));
  }

  return dedupeDetectedWordParams(params);
}

export function getWordDocumentParameterRuleProfile(templateType: string): WordDocumentParameterRuleProfile {
  const matchedProfile = templateType ? WORD_DOCUMENT_PARAMETER_RULE_PROFILES[templateType] : undefined;
  if (matchedProfile) {
    return matchedProfile;
  }
  return {
    ...DEFAULT_WORD_PARAMETER_RULE_PROFILE,
    documentType: templateType || DEFAULT_WORD_PARAMETER_RULE_PROFILE.documentType,
  };
}

export function hasWordCompareCandidateRule(
  profile: WordDocumentParameterRuleProfile,
  ruleName: WordParameterRuleName,
): boolean {
  return profile.compareCandidateRules.includes(ruleName);
}

export function hasWordParameterCheckRule(
  profile: WordDocumentParameterRuleProfile,
  ruleName: WordParameterRuleName,
): boolean {
  return profile.parameterCheckRules.includes(ruleName);
}

export function safeWordRuleText(value: unknown): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitRawWordTableCellLines(text: string): string[] {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n+/u)
    .map((line) => safeWordRuleText(line))
    .filter(Boolean);
}

function inferWordRuleTextLanguageHint(text: string): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' {
  const value = String(text || '').trim();
  if (!value) {
    return 'unknown';
  }

  const hasKana = /[\u3040-\u30ff]/u.test(value);
  const hasCjk = /[\u4e00-\u9fff]/u.test(value);
  const hasLatin = /[A-Za-z]/u.test(value);

  if (hasKana && hasCjk) {
    return 'ja';
  }
  if (hasKana) {
    return 'ja';
  }
  if (hasCjk && hasLatin) {
    return 'mixed';
  }
  if (hasCjk) {
    return 'zh';
  }
  if (hasLatin) {
    return 'en';
  }

  return 'unknown';
}

function inferWordLoopHeaderLineLanguageOrder<T extends WordTableCellLike>(headerRow: T[]): Array<'zh' | 'ja'> | null {
  let zhJaPairCount = 0;
  let jaZhPairCount = 0;
  const lineStats = new Map<number, { zh: number; ja: number }>();

  headerRow.forEach((cell) => {
    const lineHints = splitRawWordTableCellLines(cell.text).map((line) => inferWordRuleTextLanguageHint(line));
    if (lineHints[0] === 'zh' && lineHints[1] === 'ja') {
      zhJaPairCount += 1;
    } else if (lineHints[0] === 'ja' && lineHints[1] === 'zh') {
      jaZhPairCount += 1;
    }

    lineHints.forEach((hint, lineIndex) => {
      if (hint !== 'zh' && hint !== 'ja') {
        return;
      }
      const current = lineStats.get(lineIndex) || { zh: 0, ja: 0 };
      current[hint] += 1;
      lineStats.set(lineIndex, current);
    });
  });

  if (zhJaPairCount > jaZhPairCount) {
    return ['zh', 'ja'];
  }
  if (jaZhPairCount > zhJaPairCount) {
    return ['ja', 'zh'];
  }

  const firstLine = lineStats.get(0);
  const secondLine = lineStats.get(1);
  if (firstLine && secondLine) {
    const firstHint = firstLine.zh > firstLine.ja ? 'zh' : (firstLine.ja > firstLine.zh ? 'ja' : undefined);
    const secondHint = secondLine.zh > secondLine.ja ? 'zh' : (secondLine.ja > secondLine.zh ? 'ja' : undefined);
    if (firstHint && secondHint && firstHint !== secondHint) {
      return [firstHint, secondHint];
    }
  }

  return null;
}

export function normalizeWordLookupText(value: string): string {
  return safeWordRuleText(value)
    .toLowerCase()
    .replace(/[（）()【】\[\]]/g, '')
    .replace(/\s+/g, '');
}

export function looksLikeWordHeaderTitle(text: string): boolean {
  const normalized = safeWordRuleText(text);
  if (!normalized) {
    return false;
  }

  const displayText = normalized.replace(/[：:]$/u, '').trim();
  if (!displayText || resolveHeaderFieldSpec(displayText)) {
    return false;
  }

  if (isAttachmentHeading(displayText)) {
    return true;
  }

  if (/^(?:[一二三四五六七八九十百千万零两]+|[0-9０-９]+)[、.)）．]\s*.+$/u.test(displayText)) {
    return true;
  }

  if (/^第[一二三四五六七八九十百千万零两0-9０-９]+[章节条編部節款項目](?:[\s　].*)?$/u.test(displayText)) {
    return true;
  }

  return /(?:合同|协议|契約|契约)$/u.test(displayText)
    && displayText.length <= 40
    && !/[，。,.;；]/u.test(displayText);
}

function looksLikeWordOrderedTitleLine(text: string): boolean {
  const normalized = safeWordRuleText(text);
  if (!normalized) {
    return false;
  }

  const displayText = normalized.replace(/[：:]$/u, '').trim();
  if (!displayText) {
    return false;
  }

  if (/^(?:[一二三四五六七八九十百千万零两]+|[0-9０-９]+)[、.)）．]\s*\S+/u.test(displayText)) {
    return true;
  }

  if (/^第[一二三四五六七八九十百千万零两0-9０-９]+[章节条編部節款項目](?:[\s　].*)?$/u.test(displayText)) {
    return true;
  }

  if (/^[0-9０-９]+(?:\.[0-9０-９]+){0,2}[.)）．]\s*\S+/u.test(displayText)) {
    return true;
  }

  return false;
}

export function extractWordParamName(anchorText: string): string {
  const normalizedAnchor = safeWordRuleText(anchorText);
  const colonMatch = normalizedAnchor.match(/([^：:]{1,40})[：:]$/u);
  if (colonMatch?.[1]) {
    return colonMatch[1].trim();
  }
  return normalizedAnchor || '未命名参数';
}

export function extractWordParamAnchorText(paragraphText: string, start: number, end: number): string {
  const prefix = safeWordRuleText(paragraphText.slice(Math.max(0, start - 32), start));
  const suffix = safeWordRuleText(paragraphText.slice(end, Math.min(paragraphText.length, end + 24)));
  const normalizedPrefix = safeWordRuleText(paragraphText.slice(0, start));
  const labelMatch = normalizedPrefix.match(/([^，。；;、\n]{1,40}[：:])\s*$/u);

  if (labelMatch?.[1]) {
    return labelMatch[1];
  }
  if (prefix && suffix) {
    return `${prefix} ... ${suffix}`.slice(0, 48);
  }
  if (prefix) {
    return prefix.slice(-24);
  }
  if (suffix) {
    return suffix.slice(0, 24);
  }
  return '未命名参数';
}

function isUsefulWordPromptAnchor(text: string): boolean {
  return /[A-Za-z\u3400-\u9FFF\u3040-\u30FF]/u.test(text);
}

function cleanWordPromptSideText(value: string, side: 'left' | 'right'): string {
  const normalized = safeWordRuleText(value);
  if (!normalized) {
    return '';
  }

  const chunks = normalized
    .split(/[，。；;、：:\n]/u)
    .map((item) => item.trim())
    .filter(Boolean);
  let nextValue = side === 'left'
    ? (chunks[chunks.length - 1] || normalized)
    : (chunks[0] || normalized);

  nextValue = nextValue
    .replace(/^[＋+\-−=,，、.。]+/u, '')
    .replace(/[＋+\-−=,，、.。]+$/u, '')
    .trim();

  return nextValue;
}

const WORD_PROMPT_LEFT_CONTEXT_LIMIT = 5;
const WORD_PROMPT_RIGHT_CONTEXT_LIMIT = 3;

function trimWordPromptContext(value: string, side: 'left' | 'right', maxLength: number): string {
  const normalized = safeWordRuleText(value);
  if (!normalized) {
    return '';
  }

  return side === 'left'
    ? normalized.slice(-maxLength)
    : normalized.slice(0, maxLength);
}

function isWordPromptTerminalBoundaryChar(char: string | undefined): boolean {
  return Boolean(char) && /[。！？.!?）)】\]]/u.test(String(char));
}

function findWordPromptBoundaryBefore(text: string, start: number, minStart = 0): number {
  for (let index = start - 1; index >= minStart; index -= 1) {
    if (/[，。；;、：:\n]/u.test(text[index])) {
      return index + 1;
    }
  }
  return minStart;
}

function findWordPromptBoundaryAfter(text: string, end: number, maxEnd = text.length): number {
  for (let index = end; index < maxEnd; index += 1) {
    if (/[，。；;、：:\n]/u.test(text[index])) {
      return index;
    }
  }
  return maxEnd;
}

export function buildWordParamPromptParts(args: {
  paragraphText: string;
  start: number;
  end: number;
  siblingRanges?: Array<{ start: number; end: number }>;
  fallbackAnchorText?: string;
}): { localAnchorText: string; parameterSlot?: string } {
  const paragraphText = String(args.paragraphText || '');
  const fallbackAnchorText = safeWordRuleText(args.fallbackAnchorText || '') || '未命名参数';
  if (!paragraphText || args.start < 0 || args.end < args.start) {
    return {
      localAnchorText: fallbackAnchorText,
      parameterSlot: fallbackAnchorText === '未命名参数' ? undefined : `[参数] ${fallbackAnchorText}`,
    };
  }

  const normalizedPrefix = safeWordRuleText(paragraphText.slice(0, args.start));
  const directLabelMatch = normalizedPrefix.match(/([^，。；;、\n]{1,40}[：:])\s*$/u);
  if (directLabelMatch?.[1]) {
    const directAnchorText = extractWordParamName(directLabelMatch[1]) || fallbackAnchorText;
    return {
      localAnchorText: directAnchorText,
      parameterSlot: directAnchorText ? `${directAnchorText}[参数]` : '[参数]',
    };
  }

  const siblingRanges = (args.siblingRanges || [])
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end))
    .sort((left, right) => left.start - right.start);
  const previousRange = [...siblingRanges]
    .filter((range) => range.end <= args.start)
    .sort((left, right) => right.end - left.end)[0];
  const nextRange = siblingRanges
    .filter((range) => range.start >= args.end)
    .sort((left, right) => left.start - right.start)[0];

  const hardWindowStart = previousRange?.end ?? 0;
  const hardWindowEnd = nextRange?.start ?? paragraphText.length;
  const localStart = findWordPromptBoundaryBefore(paragraphText, args.start, hardWindowStart);
  const localEnd = findWordPromptBoundaryAfter(paragraphText, args.end, hardWindowEnd);
  const beforeText = trimWordPromptContext(
    cleanWordPromptSideText(paragraphText.slice(localStart, args.start), 'left'),
    'left',
    WORD_PROMPT_LEFT_CONTEXT_LIMIT
  );
  let afterText = trimWordPromptContext(
    cleanWordPromptSideText(paragraphText.slice(args.end, localEnd), 'right'),
    'right',
    WORD_PROMPT_RIGHT_CONTEXT_LIMIT
  );
  if (!afterText && isWordPromptTerminalBoundaryChar(paragraphText[localEnd])) {
    afterText = paragraphText[localEnd];
  }

  const localAnchorText = isUsefulWordPromptAnchor(beforeText)
    ? beforeText
    : (isUsefulWordPromptAnchor(afterText) ? afterText : fallbackAnchorText);
  const parameterSlot = safeWordRuleText(`${beforeText}[参数]${afterText}`) || '[参数]';

  return {
    localAnchorText,
    parameterSlot,
  };
}

export function endsWithWordParamLabel(text: string): boolean {
  const normalized = safeWordRuleText(text);
  if (!normalized || normalized.length > 40) {
    return false;
  }
  if (!/[：:]$/u.test(normalized)) {
    return false;
  }
  if (looksLikeWordHeaderTitle(normalized)) {
    return false;
  }
  if (/^[第一二三四五六七八九十百千万零两0-9０-９]+[章节条款项目]/u.test(normalized)) {
    return false;
  }
  if (looksLikeSectionLeadSentence(normalized)) {
    return false;
  }
  return !/^[（(【\[][^：:\n]{1,40}[）)】\]][：:]$/u.test(normalized);
}

export function findWordInlineGapParam(text: string): WordGapParamMatch | null {
  const matched = String(text || '').match(/^\s*((?:[^\s：:()（）]{1,20}(?:[（(][^）)]{1,20}[）)])?)[：:])([ 　\t]{2,})(\S.*)$/u);
  if (!matched) {
    return null;
  }

  const anchorText = safeWordRuleText(matched[1]);
  const suffixText = safeWordRuleText(matched[3]);
  if (!anchorText || !suffixText) {
    return null;
  }
  if (looksLikeWordHeaderTitle(anchorText)) {
    return null;
  }
  if (!resolveHeaderFieldSpec(anchorText) && !/[（(].+[）)]/u.test(suffixText)) {
    return null;
  }

  const sourceText = String(text || '');
  const start = sourceText.indexOf(matched[2], sourceText.indexOf(matched[1]) + matched[1].length);
  if (start < 0) {
    return null;
  }
  const end = start + matched[2].length;
  return {
    anchorText,
    start,
    end,
  };
}

export function findWordTerminalGapParam(text: string): WordGapParamMatch | null {
  const sourceText = String(text || '');
  const matched = sourceText.match(/^\s*((?:.{1,24})[：:])([ 　\t]{2,})$/u);
  if (!matched) {
    return null;
  }

  const anchorText = safeWordRuleText(matched[1]);
  if (!anchorText || looksLikeWordHeaderTitle(anchorText) || !resolveHeaderFieldSpec(anchorText)) {
    return null;
  }

  const start = sourceText.indexOf(matched[2], sourceText.indexOf(matched[1]) + matched[1].length);
  if (start < 0) {
    return null;
  }
  const end = start + matched[2].length;
  return { anchorText, start, end };
}

export function isBlankWordTableCellText(text: string): boolean {
  const normalized = String(text || '')
    .replace(/[\u00a0\s　]/gu, '')
    .replace(/[＿_]+/gu, '')
    .trim();
  return normalized.length === 0;
}

export function isLikelyWordTableLabel(text: string, maxLength = 48): boolean {
  const normalized = safeWordRuleText(text).replace(/[：:]$/u, '');
  if (!normalized) {
    return false;
  }
  if (normalized.length > maxLength) {
    return false;
  }
  if (isBlankWordTableCellText(normalized)) {
    return false;
  }
  if (/[。；;]/u.test(normalized)) {
    return false;
  }
  return true;
}

export function splitWordTableCellLines(text: string): string[] {
  return safeWordRuleText(text)
    .split(/\n+/u)
    .map((line) => safeWordRuleText(line))
    .filter(Boolean);
}

function splitWordParagraphLines(
  text: string,
): Array<{ text: string; start: number; end: number }> {
  const sourceText = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!sourceText) {
    return [];
  }

  const segments: Array<{ text: string; start: number; end: number }> = [];
  let cursor = 0;

  sourceText.split('\n').forEach((line) => {
    const lineStart = cursor;
    const lineEnd = lineStart + line.length;
    cursor = lineEnd + 1;

    const leadingWhitespace = line.match(/^\s*/u)?.[0].length || 0;
    const trimmedStart = Math.min(lineStart + leadingWhitespace, lineEnd);
    const trimmedText = sourceText.slice(trimmedStart, lineEnd).trim();
    if (!safeWordRuleText(trimmedText)) {
      return;
    }

    segments.push({
      // Preserve trailing blanks so terminal placeholders like "签订日期：    " can be detected.
      text: sourceText.slice(trimmedStart, lineEnd),
      start: trimmedStart,
      end: lineEnd,
    });
  });

  return segments;
}

function inferWordTitleBlockLanguage(text: string): 'zh' | 'ja' | 'other' {
  const normalized = safeWordRuleText(text);
  if (!normalized) {
    return 'other';
  }
  if (/[\u3040-\u30ff]/u.test(normalized)) {
    return 'ja';
  }
  if (/[\u3400-\u9fff]/u.test(normalized)) {
    return 'zh';
  }
  return 'other';
}

function looksLikeWordTitleBlockParagraph(text: string): boolean {
  const normalized = safeWordRuleText(text);
  if (!normalized || !/[：:]$/u.test(normalized)) {
    return false;
  }
  if (findWordInlineGapParam(normalized) || findWordTerminalGapParam(normalized)) {
    return false;
  }
  return normalized.length <= 120;
}

function collectWordTitleBlockParagraphIndexes(
  paragraphs: WordParagraphLike[],
  tableCells: WordTableCellLike[],
): Set<number> {
  const normalizedNonEmptyTableCellTexts = new Set(
    tableCells
      .map((cell) => safeWordRuleText(cell.text))
      .filter((text) => Boolean(text) && text.length <= 40)
      .map((text) => normalizeWordLookupText(text))
  );
  const eligibleParagraphs = paragraphs
    .filter((paragraph) => !isParagraphLikelyInsideWordTable(paragraph.text, tableCells))
    .filter((paragraph) => !normalizedNonEmptyTableCellTexts.has(normalizeWordLookupText(paragraph.text)))
    .filter((paragraph) => looksLikeWordTitleBlockParagraph(paragraph.text))
    .sort((left, right) => left.index - right.index);
  const skippedIndexes = new Set<number>();

  let blockStart = 0;
  while (blockStart < eligibleParagraphs.length) {
    const block: WordParagraphLike[] = [eligibleParagraphs[blockStart]];
    let cursor = blockStart + 1;
    while (
      cursor < eligibleParagraphs.length
      && eligibleParagraphs[cursor].index - eligibleParagraphs[cursor - 1].index <= 1
    ) {
      block.push(eligibleParagraphs[cursor]);
      cursor += 1;
    }

    const languageSet = new Set(block.map((paragraph) => inferWordTitleBlockLanguage(paragraph.text)));
    const hasBilingual = languageSet.has('zh') && languageSet.has('ja');
    const orderedCount = block.filter((paragraph) => looksLikeWordOrderedTitleLine(paragraph.text)).length;

    if (block.length >= 2 && hasBilingual && orderedCount >= 1) {
      block.forEach((paragraph) => skippedIndexes.add(paragraph.index));
    }

    blockStart = cursor;
  }

  return skippedIndexes;
}

function extractStandaloneHeaderLineValue(
  segments: Array<{ text: string; start: number; end: number }>,
  currentIndex: number,
): string | undefined {
  const nextSegment = segments[currentIndex + 1];
  if (!nextSegment) {
    return undefined;
  }

  if (resolveExactHeaderFieldSpec(nextSegment.text)) {
    return undefined;
  }

  const normalizedValue = safeWordRuleText(nextSegment.text.replace(/^[：:\s　]+/u, ''));
  if (!normalizedValue) {
    return undefined;
  }

  return truncateWordRuleText(normalizedValue, 80);
}

function shouldSkipOrderedBridgeLabelSegment(
  segments: Array<{ text: string; start: number; end: number }>,
  currentIndex: number,
): boolean {
  const currentText = safeWordRuleText(segments[currentIndex]?.text || '');
  if (!currentText || !/[：:]$/u.test(currentText)) {
    return false;
  }

  const previousText = safeWordRuleText(segments[currentIndex - 1]?.text || '');
  const nextText = safeWordRuleText(segments[currentIndex + 1]?.text || '');
  const previousOrdered = looksLikeWordOrderedTitleLine(previousText);
  const nextOrdered = looksLikeWordOrderedTitleLine(nextText);

  if (previousOrdered && nextOrdered) {
    return true;
  }

  const currentOrdered = looksLikeWordOrderedTitleLine(currentText);
  const previousPrevText = safeWordRuleText(segments[currentIndex - 2]?.text || '');
  const nextNextText = safeWordRuleText(segments[currentIndex + 2]?.text || '');

  if (
    currentOrdered
    && nextText
    && /[：:]$/u.test(nextText)
    && !looksLikeWordOrderedTitleLine(nextText)
    && looksLikeWordOrderedTitleLine(nextNextText)
  ) {
    return true;
  }

  if (
    currentOrdered
    && previousText
    && /[：:]$/u.test(previousText)
    && !looksLikeWordOrderedTitleLine(previousText)
    && looksLikeWordOrderedTitleLine(previousPrevText)
  ) {
    return true;
  }

  return false;
}

export function buildWordTableRows<T extends WordTableCellLike>(
  tableCells: T[],
): Array<{ tableIndex: number; rows: T[][] }> {
  const rowsByTable = new Map<number, Map<number, T[]>>();

  tableCells.forEach((cell) => {
    const rowMap = rowsByTable.get(cell.tableIndex) || new Map<number, T[]>();
    const rowCells = rowMap.get(cell.rowIndex) || [];
    rowCells.push(cell);
    rowMap.set(cell.rowIndex, rowCells);
    rowsByTable.set(cell.tableIndex, rowMap);
  });

  return Array.from(rowsByTable.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([tableIndex, rowMap]) => ({
      tableIndex,
      rows: Array.from(rowMap.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([, rowCells]) => [...rowCells].sort((left, right) => left.cellIndex - right.cellIndex)),
    }));
}

function isLikelyWordLoopHeaderRow<T extends WordTableCellLike>(row: T[]): boolean {
  const headerTexts = row.map((cell) => safeWordRuleText(cell.text)).filter(Boolean);
  return headerTexts.length >= 2 && headerTexts.every((text) => isLikelyWordTableLabel(text));
}

function countWordNonEmptyCellsAcrossHeader<T extends WordTableCellLike>(row: T[], headerRow: T[]): number {
  return headerRow.reduce((count, headerCell) => {
    const currentCell = row.find((cell) => cell.cellIndex === headerCell.cellIndex);
    return count + (!isBlankWordTableCellText(currentCell?.text || '') ? 1 : 0);
  }, 0);
}

function countWordBlankCellsAcrossHeader<T extends WordTableCellLike>(row: T[], headerRow: T[]): number {
  return headerRow.reduce((count, headerCell) => {
    const currentCell = row.find((cell) => cell.cellIndex === headerCell.cellIndex);
    return count + (isBlankWordTableCellText(currentCell?.text || '') ? 1 : 0);
  }, 0);
}

function isLikelyWordLoopDataRow<T extends WordTableCellLike>(row: T[], headerRow: T[]): boolean {
  const requiredNonEmptyCount = Math.max(2, Math.ceil(headerRow.length * 0.5));
  return countWordNonEmptyCellsAcrossHeader(row, headerRow) >= requiredNonEmptyCount;
}

function isLikelyWordLoopTemplateRow<T extends WordTableCellLike>(row: T[], headerRow: T[]): boolean {
  const requiredBlankCount = Math.max(2, Math.ceil(headerRow.length * 0.5));
  return countWordBlankCellsAcrossHeader(row, headerRow) >= requiredBlankCount;
}

export function isStandardWordLoopTableRows<T extends WordTableCellLike>(rows: T[][]): boolean {
  if (rows.length < 2) {
    return false;
  }

  const headerRow = rows[0] || [];
  if (!isLikelyWordLoopHeaderRow(headerRow)) {
    return false;
  }

  return rows.slice(1).some((row) =>
    isLikelyWordLoopDataRow(row, headerRow) || isLikelyWordLoopTemplateRow(row, headerRow)
  );
}

function splitWordTableParamLabels(text: string): string[] {
  const rawText = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!rawText.trim()) {
    return [];
  }

  const lineParts = rawText
    .split(/\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const baseParts = lineParts.length > 0 ? lineParts : [rawText];

  const normalizedParts = baseParts.flatMap((part) => {
    const safePart = safeWordRuleText(part);
    if (!safePart) {
      return [];
    }
    if (/[\/／|｜]/u.test(safePart)) {
      const splitParts = safePart.split(/[\/／|｜]/u).map((item) => safeWordRuleText(item)).filter(Boolean);
      if (splitParts.length >= 2) {
        return splitParts;
      }
    }
    return [safePart];
  });

  const labels = normalizedParts
    .map((part) => part.replace(/[：:]$/u, '').trim())
    .filter((part) => isLikelyWordTableLabel(part));

  // Preserve duplicated labels when they come from separate lines, because
  // they can represent bilingual parallel headers with identical wording.
  if (baseParts.length >= 2) {
    return labels;
  }

  return labels.filter((part, index, array) => array.indexOf(part) === index);
}

function findNearestWordTableLeftLabelCell<T extends WordTableCellLike>(row: T[], cellIndex: number): T | undefined {
  return [...row]
    .filter((item) => item.cellIndex < cellIndex && isLikelyWordTableLabel(item.text, 32))
    .sort((left, right) => right.cellIndex - left.cellIndex)[0];
}

function pushDetectedWordTableParam(
  params: WordDetectedParam[],
  sampleText: string,
  param: WordDetectedParam
): void {
  params.push({
    ...param,
    ...findSampleMatchForWordParam(sampleText, param),
  });
}

function pushWordLoopTemplateParams<T extends WordTableCellLike>(
  params: WordDetectedParam[],
  sampleText: string,
  tableIndex: number,
  headerRow: T[]
): void {
  const headerLineLanguageOrder = inferWordLoopHeaderLineLanguageOrder(headerRow);
  headerRow.forEach((cell) => {
    const labels = splitWordTableParamLabels(cell.text);
    const rawLines = splitRawWordTableCellLines(cell.text);
    labels.forEach((anchorText, labelIndex) => {
      const directLineHint = inferWordRuleTextLanguageHint(rawLines[labelIndex] || '');
      const fallbackLineHint = headerLineLanguageOrder?.[labelIndex];
      const languageHint = (
        directLineHint === 'zh' || directLineHint === 'ja'
          ? directLineHint
          : fallbackLineHint
      );
      const param: WordDetectedParam = {
        id: `table-loop-${tableIndex}-${cell.rowIndex}-${cell.cellIndex}-${labelIndex}`,
        sourceType: 'table-cell',
        paragraphIndex: -1,
        start: 0,
        end: 0,
        rawText: cell.text || '',
        underlineType: 'table-loop-column',
        anchorText,
        localAnchorText: anchorText,
        parameterSlot: `${anchorText}[参数]`,
        paramName: extractWordParamName(anchorText),
        paragraphText: `${anchorText}\t${cell.text || ''}`,
        sourceBlockId: cell.sourceBlockId,
        tableIndex,
        rowIndex: cell.rowIndex,
        cellIndex: cell.cellIndex,
        languageHint,
      };
      pushDetectedWordTableParam(params, sampleText, param);
    });
  });
}

function summarizeWordTableRow<T extends WordTableCellLike>(row: T[]): string {
  return row
    .map((cell) => `[${cell.cellIndex}] ${safeWordRuleText(cell.text) || '(blank)'}`)
    .join(' | ');
}

function countWordFilledHeaderCells<T extends WordTableCellLike>(row: T[], headerRow: T[]): number {
  return headerRow.reduce((count, headerCell) => {
    const currentCell = row.find((cell) => cell.cellIndex === headerCell.cellIndex);
    return count + (isBlankWordTableCellText(currentCell?.text || '') ? 0 : 1);
  }, 0);
}

function analyzeWordTableParams(
  tableCells: WordTableCellLike[],
  sampleText = '',
  includeDebug = false
): { params: WordDetectedParam[]; debugEntries: WordTableDetectionDebugEntry[] } {
  const params: WordDetectedParam[] = [];
  const debugEntries: WordTableDetectionDebugEntry[] = [];
  const tableRows = buildWordTableRows(tableCells);

  tableRows.forEach(({ tableIndex, rows }) => {
    const rowSummaries = includeDebug
      ? rows.map((row, rowIndex) => `row ${rowIndex}: ${summarizeWordTableRow(row)}`)
      : [];
    const cellDiagnostics: string[] = [];
    const paramsBeforeTable = params.length;

    if (rows.length === 0) {
      debugEntries.push({
        tableIndex,
        tableType: 'unknown',
        reason: '表格没有可用单元格',
        rowSummaries,
        cellDiagnostics,
        generatedParamCount: 0,
      });
      return;
    }

    const headerRow = rows[0] || [];
    const headerIsLoopLike = isLikelyWordLoopHeaderRow(headerRow);
    const firstDataRow = rows[1] || [];
    const firstDataFilledCount = countWordFilledHeaderCells(firstDataRow, headerRow);
    const firstDataBlankCount = countWordBlankCellsAcrossHeader(firstDataRow, headerRow);
    const comparisonParams: WordDetectedParam[] = [];

    if (includeDebug) {
      cellDiagnostics.push(
        `table type check: headerIsLoopLike=${headerIsLoopLike ? 'yes' : 'no'} ; secondRowFilled=${firstDataFilledCount}/${headerRow.length || 0} ; secondRowBlank=${firstDataBlankCount}/${headerRow.length || 0}`
      );
    }

    rows.forEach((row, rowIndex) => {
      row.forEach((cell) => {
        const cellText = safeWordRuleText(cell.text);
        if (!isBlankWordTableCellText(cell.text)) {
          if (includeDebug) {
            cellDiagnostics.push(`row ${rowIndex} col ${cell.cellIndex}: 非空单元格 ${JSON.stringify(cellText)} -> 跳过`);
          }
          return;
        }

        const leftLabelCell = findNearestWordTableLeftLabelCell(row, cell.cellIndex);
        if (!leftLabelCell) {
          if (includeDebug) {
            cellDiagnostics.push(`row ${rowIndex} col ${cell.cellIndex}: 空白，但左侧未找到标签 -> 跳过`);
          }
          return;
        }

        const labels = splitWordTableParamLabels(leftLabelCell.text);
        if (labels.length === 0) {
          if (includeDebug) {
            cellDiagnostics.push(
              `row ${rowIndex} col ${cell.cellIndex}: 左侧 ${JSON.stringify(leftLabelCell.text)} 未拆出有效参数名 -> 跳过`
            );
          }
          return;
        }

        if (includeDebug) {
          cellDiagnostics.push(
            `row ${rowIndex} col ${cell.cellIndex}: 空白，左侧 ${JSON.stringify(leftLabelCell.text)} -> 参数 ${labels.join(' / ')}`
          );
        }

        const rawLines = splitRawWordTableCellLines(leftLabelCell.text);
        labels.forEach((title, titleIndex) => {
          const directLineHint = inferWordRuleTextLanguageHint(rawLines[titleIndex] || '');
          const languageHint = (
            directLineHint === 'zh' || directLineHint === 'ja'
              ? directLineHint
              : rawLines.length === labels.length && labels.length === 2
                ? (titleIndex === 0 ? 'zh' : 'ja')
                : undefined
          );
          const param: WordDetectedParam = {
            id: `table-cell-${tableIndex}-${cell.rowIndex}-${cell.cellIndex}-${titleIndex}`,
            sourceType: 'table-cell',
            paragraphIndex: -1,
            start: 0,
            end: 0,
            rawText: cell.text || '',
            underlineType: 'table-cell-empty',
            anchorText: title,
            localAnchorText: title,
            parameterSlot: `${title}[参数]`,
            paramName: extractWordParamName(title),
            paragraphText: `${title}\t${cell.text || ''}`,
            sourceBlockId: cell.sourceBlockId,
            tableIndex,
            rowIndex: cell.rowIndex,
            cellIndex: cell.cellIndex,
            languageHint,
          };
          comparisonParams.push({
            ...param,
            ...findSampleMatchForWordParam(sampleText, param),
          });
        });
      });
    });

    const dedupedComparisonParams = dedupeDetectedWordParams(comparisonParams);
    if (dedupedComparisonParams.length > 0) {
      params.push(...dedupedComparisonParams);
      debugEntries.push({
        tableIndex,
        tableType: 'comparison',
        reason: '命中了左右对照表规则，只对空白单元格查找左侧标签',
        rowSummaries,
        cellDiagnostics,
        generatedParamCount: dedupedComparisonParams.length,
      });
      return;
    }

    const loopMatched = headerIsLoopLike
      && (
        isLikelyWordLoopDataRow(firstDataRow, headerRow)
        || isLikelyWordLoopTemplateRow(firstDataRow, headerRow)
      );
    if (loopMatched) {
      pushWordLoopTemplateParams(params, sampleText, tableIndex, headerRow);
      if (includeDebug) {
        headerRow.forEach((cell) => {
          const labels = splitWordTableParamLabels(cell.text);
          cellDiagnostics.push(
            `header cell c${cell.cellIndex}: ${JSON.stringify(cell.text)} -> ${labels.length > 0 ? labels.join(' / ') : '未拆出参数'}`
          );
        });
      }
      debugEntries.push({
        tableIndex,
        tableType: 'loop',
        reason: `未命中对照表规则，且首行像参数标签；第二行满足循环特征（filled=${firstDataFilledCount}/${headerRow.length || 0}, blank=${firstDataBlankCount}/${headerRow.length || 0}）`,
        rowSummaries,
        cellDiagnostics,
        generatedParamCount: params.length - paramsBeforeTable,
      });
      return;
    }

    debugEntries.push({
      tableIndex,
      tableType: 'unknown',
      reason: '未命中左右对照表规则，也未满足循环表特征',
      rowSummaries,
      cellDiagnostics,
      generatedParamCount: 0,
    });
  });

  return {
    params: dedupeDetectedWordParams(params),
    debugEntries,
  };
}

export function collectWordParagraphs(
  documentIr: DocumentIR | Record<string, any> | null | undefined,
): WordParagraphLike[] {
  const paragraphs = getWordDocumentElements(documentIr)
    .filter((element) => element.type === 'paragraph')
    .reduce<WordParagraphLike[]>((result, element) => {
      const paragraphIndex = toFiniteNumber(element.hostData?.index);
      if (paragraphIndex === null) {
        return result;
      }
      result.push({
        id: element.id,
        index: paragraphIndex,
        text: String(element.text || ''),
        format: typeof element.hostData?.format === 'object'
          ? element.hostData.format as Record<string, unknown>
          : undefined,
      });
      return result;
    }, []);

  return paragraphs.sort((left, right) => left.index - right.index);
}

export function collectWordUnderlines(
  documentIr: DocumentIR | Record<string, any> | null | undefined,
): WordUnderlineLike[] {
  const underlines = getWordDocumentAnchors(documentIr)
    .filter((anchor) => anchor.type === 'word-range')
    .reduce<WordUnderlineLike[]>((result, anchor) => {
      const paragraphIndex = toFiniteNumber(anchor.ref?.paragraphIndex);
      const start = toFiniteNumber(anchor.ref?.start);
      const end = toFiniteNumber(anchor.ref?.end);
      if (paragraphIndex === null || start === null || end === null) {
        return result;
      }
      result.push({
        text: String(anchor.text || ''),
        underlineType: String(anchor.ref?.underlineType || ''),
        paragraphIndex,
        paragraphText: String(anchor.ref?.paragraphText || ''),
        position: { start, end },
      });
      return result;
    }, []);

  return underlines.sort((left, right) =>
    left.paragraphIndex - right.paragraphIndex
    || left.position.start - right.position.start
  );
}

export function collectWordTableCells(
  documentIr: DocumentIR | Record<string, any> | null | undefined,
): WordTableCellLike[] {
  const tableCells = getWordDocumentElements(documentIr)
    .filter((element) => element.type === 'cell')
    .reduce<WordTableCellLike[]>((result, element) => {
      const tableIndex = toFiniteNumber(element.hostData?.tableIndex);
      const rowIndex = toFiniteNumber(element.hostData?.rowIndex);
      const cellIndex = toFiniteNumber(element.hostData?.cellIndex);
      if (tableIndex === null || rowIndex === null || cellIndex === null) {
        return result;
      }
      result.push({
        sourceBlockId: element.id,
        text: safeWordRuleText(element.text),
        tableIndex,
        rowIndex,
        cellIndex,
      });
      return result;
    }, []);

  return tableCells.sort((left, right) =>
    left.tableIndex - right.tableIndex
    || left.rowIndex - right.rowIndex
    || left.cellIndex - right.cellIndex
  );
}

export function isParagraphLikelyInsideWordTable(
  paragraphText: string,
  tableCells: WordTableCellLike[],
): boolean {
  const normalizedParagraph = normalizeWordLookupText(paragraphText);
  if (!normalizedParagraph || normalizedParagraph.length > 48) {
    return false;
  }

  const normalizedTableTexts = tableCells
    .map((cell) => normalizeWordLookupText(String(cell.text || '')))
    .filter(Boolean);

  return normalizedTableTexts.some((cellText) =>
    cellText === normalizedParagraph
    || cellText.includes(normalizedParagraph)
    || normalizedParagraph.includes(cellText)
  );
}

export function detectWordUnderlineParams(
  underlines: WordUnderlineLike[],
  paragraphs: WordParagraphLike[] = [],
  sampleText = '',
): WordDetectedParam[] {
  const paragraphIdByIndex = new Map(paragraphs.map((paragraph) => [paragraph.index, paragraph.id || `word-paragraph-${paragraph.index}`]));
  const paragraphByIndex = new Map(paragraphs.map((paragraph) => [paragraph.index, paragraph]));

  const resolveUnderlineAnchorText = (underline: WordUnderlineLike): string => {
    const directAnchorText = extractWordParamAnchorText(
      underline.paragraphText,
      underline.position.start,
      underline.position.end
    );
    if (directAnchorText && directAnchorText !== '未命名参数') {
      return directAnchorText;
    }

    for (let offset = 1; offset <= 3; offset += 1) {
      const previousParagraph = paragraphByIndex.get(underline.paragraphIndex - offset);
      const previousText = safeWordRuleText(previousParagraph?.text || '');
      if (!previousText) {
        continue;
      }
      if (/[：:]$/u.test(previousText)) {
        return previousText;
      }
      if (looksLikeWordHeaderTitle(previousText)) {
        return `${previousText}：`;
      }
    }

    return directAnchorText;
  };

  return underlines.map((underline) => {
    const anchorText = resolveUnderlineAnchorText(underline);
    const promptParts = buildWordParamPromptParts({
      paragraphText: underline.paragraphText,
      start: underline.position.start,
      end: underline.position.end,
      siblingRanges: underlines
        .filter((item) => item.paragraphIndex === underline.paragraphIndex)
        .map((item) => ({
          start: item.position.start,
          end: item.position.end,
        })),
      fallbackAnchorText: anchorText,
    });
    const param: WordDetectedParam = {
      id: `underline-${underline.paragraphIndex}-${underline.position.start}-${underline.position.end}`,
      sourceType: 'underline',
      paragraphIndex: underline.paragraphIndex,
      start: underline.position.start,
      end: underline.position.end,
      rawText: underline.text,
      underlineType: underline.underlineType,
      anchorText,
      localAnchorText: promptParts.localAnchorText,
      parameterSlot: promptParts.parameterSlot,
      paramName: extractWordParamName(anchorText),
      paragraphText: underline.paragraphText,
      sourceBlockId: paragraphIdByIndex.get(underline.paragraphIndex),
    };
    return {
      ...param,
      ...findSampleMatchForWordParam(sampleText, param),
    };
  });
}

export function detectWordTableParams(
  tableCells: WordTableCellLike[],
  sampleText = '',
): WordDetectedParam[] {
  return analyzeWordTableParams(tableCells, sampleText, false).params;
}

export function detectWordColonParams(
  paragraphs: WordParagraphLike[],
  underlines: WordUnderlineLike[],
  tableCells: WordTableCellLike[],
  options?: {
    sampleText?: string;
    includeLabelOnly?: boolean;
    skipParagraphIndexes?: Set<number>;
  },
): WordDetectedParam[] {
  const sampleText = options?.sampleText || '';
  const includeLabelOnly = options?.includeLabelOnly ?? true;
  const skipParagraphIndexes = options?.skipParagraphIndexes || new Set<number>();
  const paragraphIdByIndex = new Map(paragraphs.map((paragraph) => [paragraph.index, paragraph.id || `word-paragraph-${paragraph.index}`]));
  const normalizedNonEmptyTableCellTexts = new Set(
    tableCells
      .map((cell) => safeWordRuleText(cell.text))
      .filter((text) => Boolean(text) && text.length <= 40)
      .map((text) => normalizeWordLookupText(text))
  );

  const params: WordDetectedParam[] = [];
  paragraphs.forEach((paragraph) => {
    if (skipParagraphIndexes.has(paragraph.index)) {
      return;
    }
    if (isParagraphLikelyInsideWordTable(paragraph.text, tableCells)) {
      return;
    }
    if (normalizedNonEmptyTableCellTexts.has(normalizeWordLookupText(paragraph.text))) {
      return;
    }
    const lineSegments = splitWordParagraphLines(paragraph.text);
    const targetSegments = lineSegments.length > 0
      ? lineSegments
      : [{ text: paragraph.text, start: 0, end: paragraph.text.length }];

    targetSegments.forEach((segment, segmentIndex) => {
      const inlineGapParam = findWordInlineGapParam(segment.text);
      const terminalGapParam = findWordTerminalGapParam(segment.text);
      const isTrailingLabel = includeLabelOnly && endsWithWordParamLabel(segment.text);
      const exactHeaderFieldSpec = resolveExactHeaderFieldSpec(segment.text);
      const standaloneHeaderValue = exactHeaderFieldSpec
        ? extractStandaloneHeaderLineValue(targetSegments, segmentIndex)
        : undefined;
      const isStandaloneHeaderLabel = includeLabelOnly && Boolean(exactHeaderFieldSpec);
      const detectedGapParam = inlineGapParam || terminalGapParam;

      if (!detectedGapParam && !isTrailingLabel && !isStandaloneHeaderLabel) {
        return;
      }

      if (
        (isTrailingLabel || isStandaloneHeaderLabel)
        && shouldSkipOrderedBridgeLabelSegment(targetSegments, segmentIndex)
      ) {
        return;
      }

      const anchorText = detectedGapParam?.anchorText || safeWordRuleText(segment.text);
      const paramName = extractWordParamName(anchorText);
      const hasUnderlineSibling = underlines.some((underline) =>
        underline.paragraphIndex === paragraph.index
        && extractWordParamName(
          extractWordParamAnchorText(
            underline.paragraphText,
            underline.position.start,
            underline.position.end
          )
        ) === paramName
      );

      if (hasUnderlineSibling) {
        return;
      }

      const start = detectedGapParam ? segment.start + detectedGapParam.start : segment.end;
      const end = detectedGapParam ? segment.start + detectedGapParam.end : segment.end;
      const param: WordDetectedParam = {
        id: detectedGapParam
          ? `label-gap-${paragraph.index}-${segmentIndex}-${start}-${end}`
          : `label-only-${paragraph.index}-${segmentIndex}`,
        sourceType: 'label-only',
        paragraphIndex: paragraph.index,
        start,
        end,
        rawText: detectedGapParam ? segment.text.slice(detectedGapParam.start, detectedGapParam.end) : '',
        underlineType: detectedGapParam ? 'label-gap' : (isStandaloneHeaderLabel ? 'header-label-only' : 'label-only'),
        anchorText,
        localAnchorText: anchorText,
        parameterSlot: detectedGapParam
          ? buildWordParamPromptParts({
              paragraphText: segment.text,
              start: detectedGapParam.start,
              end: detectedGapParam.end,
              fallbackAnchorText: anchorText,
            }).parameterSlot
          : `${anchorText}[参数]`,
        paramName,
        paragraphText: standaloneHeaderValue ? `${segment.text}\n${standaloneHeaderValue}` : segment.text,
        sourceBlockId: paragraphIdByIndex.get(paragraph.index),
      };
      const sampleMatch = findSampleMatchForWordParam(sampleText, param);
      params.push({
        ...param,
        ...sampleMatch,
        sampleValue: sampleMatch.sampleValue || standaloneHeaderValue,
      });
    });
  });

  return dedupeDetectedWordParams(params);
}

export function detectWordParameterChecks(args: {
  templateType: string;
  paragraphs: WordParagraphLike[];
  underlines: WordUnderlineLike[];
  tableCells: WordTableCellLike[];
  sampleText?: string;
  includeLabelOnly?: boolean;
}): WordDetectedParam[] {
  const ruleProfile = getWordDocumentParameterRuleProfile(args.templateType);
  return detectWordParamsByRules({
    ruleNames: ruleProfile.parameterCheckRules,
    paragraphs: args.paragraphs,
    underlines: args.underlines,
    tableCells: args.tableCells,
    sampleText: args.sampleText,
    includeLabelOnly: args.includeLabelOnly,
  });
}

export function buildWordCompareCandidates(
  documentIr: DocumentIR | Record<string, any> | null | undefined,
  templateType: string,
): TemplateFieldCandidate[] {
  const ruleProfile = getWordDocumentParameterRuleProfile(templateType);
  if (ruleProfile.compareCandidateRules.length === 0) {
    return [];
  }

  const paragraphs = collectWordParagraphs(documentIr);
  const underlines = collectWordUnderlines(documentIr);
  const tableCells = collectWordTableCells(documentIr);
  const params = detectWordParamsByRules({
    ruleNames: ruleProfile.compareCandidateRules,
    paragraphs,
    underlines,
    tableCells,
    includeLabelOnly: false,
  });

  return params
    .map((param) => buildWordRuleCandidate(param))
    .filter((candidate): candidate is TemplateFieldCandidate => Boolean(candidate));
}

export function buildWordTableCompareCandidates(
  documentIr: DocumentIR | Record<string, any> | null | undefined,
): TemplateFieldCandidate[] {
  const tableParams = detectWordTableParams(collectWordTableCells(documentIr));
  return tableParams
    .map((param) => buildWordRuleCandidate(param))
    .filter((candidate): candidate is TemplateFieldCandidate => Boolean(candidate));
}
