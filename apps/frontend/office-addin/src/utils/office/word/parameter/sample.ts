import {
  buildWordAnchorCandidates,
  isExplicitWordParamLabelAnchor,
} from './anchor';
import type { WordDetectedParam } from './types';
import {
  escapeRegExp,
  normalizeWordLookupText,
  safeWordRuleText,
  truncateWordRuleText,
} from '../shared/text';

export function normalizeWordSampleValue(value: string): string {
  return safeWordRuleText(value).replace(/^[：:\s　]+/u, '').trim();
}

function trimWordSampleValueByNextAnchor(value: string): string {
  const normalized = safeWordRuleText(value);
  if (!normalized) {
    return '';
  }

  const nextAnchorMatch = normalized.match(/^(.*?)(?=\s+[^\s：:，。；;、]{1,20}[：:])/u);
  return safeWordRuleText(nextAnchorMatch?.[1] || normalized);
}

function trimWordSampleValueByStatementCue(value: string): string {
  const normalized = safeWordRuleText(value);
  if (!normalized) {
    return '';
  }

  const matched = normalized.match(/^(\S{1,6})\s+(.{8,})$/u);
  if (!matched) {
    return normalized;
  }

  const firstToken = safeWordRuleText(matched[1]);
  const restText = safeWordRuleText(matched[2]);
  if (
    firstToken.length <= 4
    && /(?:本协议|双方|甲方|乙方|未尽事宜|协商|解决|签字|盖章)/u.test(restText)
  ) {
    return firstToken;
  }

  return normalized;
}

function isLikelyWordGrammarBoundaryToken(value: string): boolean {
  return /^(?:的|地|得|于|至|为|按|从|向|与|和|及|或|并|且|后|前|内|外)$/u.test(value);
}

export function extractSampleValueFromMatchText(anchorText: string, matchText: string): string {
  const trimReferenceValue = (value: string): string => {
    let normalized = normalizeWordSampleValue(value);
    if (!normalized) {
      return '';
    }

    normalized = normalized
      .replace(/^[：:，,；;、。.\-—]+/u, '')
      .replace(/[：:，,；;、。.\-—]+$/u, '')
      .replace(/[（(][^（）()]{0,40}[）)]/gu, '')
      .replace(/[，,]\s*(?:及其他|和其他|以及其他|及びその他|その他).*/u, '')
      .replace(/[、,，]\s*(?:詳(?:细|細)|详细|詳細).*/u, '')
      .replace(/[。；;].*$/u, '')
      .trim();

    return trimWordSampleValueByStatementCue(trimWordSampleValueByNextAnchor(normalized));
  };

  const snippet = safeWordRuleText(matchText);
  if (!snippet || !isExplicitWordParamLabelAnchor(anchorText)) {
    return '';
  }

  const anchorCandidates = buildWordAnchorCandidates(anchorText);
  let matchedExplicitAnchor = false;
  for (const anchorCandidate of anchorCandidates) {
    if (!snippet.startsWith(anchorCandidate)) {
      continue;
    }
    matchedExplicitAnchor = true;
    const directValue = trimReferenceValue(
      snippet
        .slice(anchorCandidate.length)
        .replace(/^[：:\s　]+/u, '')
    );
    if (directValue) {
      return truncateWordRuleText(directValue, 80);
    }
  }

  if (!matchedExplicitAnchor) {
    return '';
  }

  const colonValue = trimReferenceValue(snippet.match(/[：:]\s*([^\n]{1,80})/u)?.[1] || '');
  return colonValue ? truncateWordRuleText(colonValue, 80) : '';
}

export function extractWordTrailingUnitLabel(text: string): string {
  const normalized = safeWordRuleText(text);
  if (!normalized) {
    return '';
  }

  const match = normalized.match(/^(个工作日|工作日|日历日|自然日|个月|年|月|日|天|周|次|项|份|页|条|章|节|人|元|岁|号|期|%|％)/u);
  return match?.[1] || '';
}

export function shouldPreferWordTrailingUnitLabel(beforeText: string, afterText: string): boolean {
  const trailingUnit = extractWordTrailingUnitLabel(afterText);
  if (!trailingUnit) {
    return false;
  }

  if (/^(年|月|日)$/u.test(trailingUnit)) {
    return true;
  }

  const normalizedBefore = safeWordRuleText(beforeText).replace(/[：:]$/u, '');
  if (!normalizedBefore) {
    return true;
  }

  return normalizedBefore.length <= 4
    || /(?:起|止|至|于|自|从|到|按|第|订于|签订于|签约于|生效于)$/u.test(normalizedBefore);
}

export function extractWordUnitComponentFromSampleText(text: string, unitLabel: string): string {
  const normalized = safeWordRuleText(text);
  if (!normalized || !unitLabel) {
    return '';
  }

  const fullDateMatch = normalized.match(/([0-9０-９]{2,4})\s*年(?:\s*([0-9０-９]{1,2})\s*月(?:\s*([0-9０-９]{1,2})\s*日)?)?/u);
  if (fullDateMatch) {
    if (unitLabel === '年') {
      return fullDateMatch[1] || '';
    }
    if (unitLabel === '月') {
      return fullDateMatch[2] || '';
    }
    if (unitLabel === '日') {
      return fullDateMatch[3] || '';
    }
  }

  const numericWithUnitMatch = normalized.match(
    new RegExp(`([0-9０-９]+(?:\\.[0-9０-９]+)?)\\s*${escapeRegExp(unitLabel)}`, 'u')
  );
  return numericWithUnitMatch?.[1] || '';
}

export function buildWordContextStopCandidates(normalizedSuffix: string): string[] {
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

  const lexicalTokens = normalizedSuffix
    .split(/[\s，。；;、：:（）()【】\[\]“”"'‘’]+/u)
    .map((token) => safeWordRuleText(token))
    .filter(Boolean);
  lexicalTokens.slice(0, 3).forEach((token, index) => {
    if (token.length >= 2 || isLikelyWordGrammarBoundaryToken(token)) {
      candidates.add(token);
    }
    const nextToken = lexicalTokens[index + 1];
    if (
      nextToken
      && (isLikelyWordGrammarBoundaryToken(token) || isLikelyWordGrammarBoundaryToken(nextToken))
    ) {
      candidates.add(`${token}${nextToken}`);
    }
  });

  return Array.from(candidates).filter(Boolean);
}

function buildWordRepeatedAnchorStopCandidates(anchorCandidates: string[]): string[] {
  return Array.from(new Set(
    anchorCandidates
      .map((candidate) => safeWordRuleText(candidate))
      .filter(Boolean)
      .flatMap((candidate) => {
        const normalizedCandidate = candidate.replace(/[：:]$/u, '').trim();
        if (!normalizedCandidate) {
          return [];
        }
        return [
          normalizedCandidate,
          `${normalizedCandidate}：`,
          `${normalizedCandidate}:`,
        ];
      })
  ));
}

export function findEarliestWordStopIndex(text: string, searchStart: number, stopCandidates: string[]): number {
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

export function extractWordValueBetweenPrefixAndStops(
  text: string,
  normalizedPrefix: string,
  stopCandidates: string[],
): string {
  const normalizedText = safeWordRuleText(text);
  if (!normalizedText || !normalizedPrefix || stopCandidates.length === 0) {
    return '';
  }

  const matches: string[] = [];
  let searchFrom = 0;
  while (searchFrom < normalizedText.length) {
    const prefixIndex = normalizedText.indexOf(normalizedPrefix, searchFrom);
    if (prefixIndex < 0) {
      break;
    }
    const valueStart = prefixIndex + normalizedPrefix.length;
    const stopIndex = findEarliestWordStopIndex(normalizedText, valueStart, stopCandidates);
    if (stopIndex > valueStart) {
      const value = safeWordRuleText(normalizedText.slice(valueStart, stopIndex));
      if (value) {
        matches.push(value);
      }
    }
    searchFrom = prefixIndex + Math.max(normalizedPrefix.length, 1);
  }

  return matches.length === 0
    ? ''
    : [...matches].sort((left, right) => left.length - right.length)[0];
}

export function extractSampleValueBetweenContext(
  sampleText: string,
  prefix: string,
  suffix: string,
  extraStopCandidates: string[] = [],
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
  const stopCandidates = Array.from(new Set([
    ...buildWordContextStopCandidates(normalizedSuffix),
    ...extraStopCandidates.map((candidate) => safeWordRuleText(candidate)).filter(Boolean),
  ]));

  const lines = rawSampleText
    .split(/[\r\n]+/u)
    .map((line) => safeWordRuleText(line))
    .filter(Boolean)
    .slice(0, 400);

  for (const line of lines) {
    const betweenValue = extractWordValueBetweenPrefixAndStops(line, normalizedPrefix, stopCandidates);
    if (betweenValue) {
      return {
        sampleValue: truncateWordRuleText(normalizeWordSampleValue(betweenValue), 80),
        sampleMatchText: line,
      };
    }
  }

  const normalizedSampleText = safeWordRuleText(rawSampleText);
  const betweenValue = extractWordValueBetweenPrefixAndStops(normalizedSampleText, normalizedPrefix, stopCandidates);
  return betweenValue
    ? {
        sampleValue: truncateWordRuleText(normalizeWordSampleValue(betweenValue), 80),
        sampleMatchText: normalizedSampleText,
      }
    : {};
}

export function trimWordSampleValueBySuffixHints(value: string, suffix: string): string {
  const normalizedValue = safeWordRuleText(value);
  const stopCandidates = buildWordContextStopCandidates(safeWordRuleText(suffix));
  return stopCandidates.reduce((current, candidate) => {
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
}

export function resolveWordSampleContext(param: Pick<WordDetectedParam, 'paragraphText' | 'start' | 'end' | 'parameterSlot'>): {
  prefix: string;
  suffix: string;
} {
  const paragraphPrefix = safeWordRuleText(param.paragraphText.slice(0, param.start)).slice(-32);
  const paragraphSuffix = safeWordRuleText(param.paragraphText.slice(param.end)).slice(0, 32);
  const slotValue = safeWordRuleText(param.parameterSlot || '');
  if (!slotValue || !slotValue.includes('[参数]')) {
    return {
      prefix: paragraphPrefix,
      suffix: paragraphSuffix,
    };
  }

  const [slotPrefixRaw, slotSuffixRaw] = slotValue.split('[参数]');
  const slotPrefix = safeWordRuleText(slotPrefixRaw || '').slice(-24);
  const slotSuffix = safeWordRuleText(slotSuffixRaw || '').slice(0, 24);
  return {
    prefix: slotPrefix || paragraphPrefix,
    suffix: slotSuffix || paragraphSuffix,
  };
}

export function buildWordCompactTextMap(text: string): {
  compactText: string;
  originalIndexes: number[];
  normalizedText: string;
} {
  const normalizedText = safeWordRuleText(text);
  const originalIndexes: number[] = [];
  let compactText = '';

  for (let index = 0; index < normalizedText.length; index += 1) {
    if (/\s/u.test(normalizedText[index])) {
      continue;
    }
    compactText += normalizedText[index];
    originalIndexes.push(index);
  }

  return {
    compactText,
    originalIndexes,
    normalizedText,
  };
}

export function buildWordLcsMatrix(left: string, right: string): number[][] {
  const matrix = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      if (left[leftIndex - 1] === right[rightIndex - 1]) {
        matrix[leftIndex][rightIndex] = matrix[leftIndex - 1][rightIndex - 1] + 1;
      } else {
        matrix[leftIndex][rightIndex] = Math.max(matrix[leftIndex - 1][rightIndex], matrix[leftIndex][rightIndex - 1]);
      }
    }
  }

  return matrix;
}

export function extractWordValueByParagraphDiff(
  paragraphText: string,
  start: number,
  end: number,
  sampleLine: string,
): string {
  const templateText = String(paragraphText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!templateText || start < 0 || end < start) {
    return '';
  }

  const templatePrefixCompactLength = buildWordCompactTextMap(templateText.slice(0, start)).compactText.length;
  const templateMap = buildWordCompactTextMap(templateText);
  const sampleMap = buildWordCompactTextMap(sampleLine);
  if (!templateMap.compactText || !sampleMap.compactText) {
    return '';
  }

  const lcsMatrix = buildWordLcsMatrix(templateMap.compactText, sampleMap.compactText);
  const matchedTemplateToSample = new Array<number>(templateMap.compactText.length).fill(-1);
  let templateCursor = templateMap.compactText.length;
  let sampleCursor = sampleMap.compactText.length;

  while (templateCursor > 0 && sampleCursor > 0) {
    if (templateMap.compactText[templateCursor - 1] === sampleMap.compactText[sampleCursor - 1]) {
      matchedTemplateToSample[templateCursor - 1] = sampleCursor - 1;
      templateCursor -= 1;
      sampleCursor -= 1;
      continue;
    }
    if (lcsMatrix[templateCursor - 1][sampleCursor] >= lcsMatrix[templateCursor][sampleCursor - 1]) {
      templateCursor -= 1;
    } else {
      sampleCursor -= 1;
    }
  }

  const leftBoundarySampleIndex = templatePrefixCompactLength > 0
    ? matchedTemplateToSample[templatePrefixCompactLength - 1]
    : -1;
  const rightBoundarySampleIndex = templatePrefixCompactLength < matchedTemplateToSample.length
    ? matchedTemplateToSample[templatePrefixCompactLength]
    : sampleMap.compactText.length;

  if (rightBoundarySampleIndex < 0) {
    return '';
  }

  const compactStart = leftBoundarySampleIndex >= 0 ? leftBoundarySampleIndex + 1 : 0;
  const compactEnd = rightBoundarySampleIndex;
  if (compactEnd <= compactStart) {
    return '';
  }

  const originalStart = sampleMap.originalIndexes[compactStart];
  const originalEnd = sampleMap.originalIndexes[compactEnd - 1];
  if (!Number.isFinite(originalStart) || !Number.isFinite(originalEnd)) {
    return '';
  }

  return safeWordRuleText(sampleMap.normalizedText.slice(originalStart, originalEnd + 1));
}

export function selectBestWordParagraphDiffCandidate(sampleText: string, paragraphText: string): string {
  const templateCompact = buildWordCompactTextMap(paragraphText).compactText;
  if (!templateCompact) {
    return '';
  }

  const candidates = Array.from(new Set(
    String(sampleText || '')
      .split(/[\r\n]+/u)
      .map((line) => safeWordRuleText(line))
      .filter(Boolean)
      .concat(safeWordRuleText(sampleText))
  )).slice(0, 400);

  let bestCandidate = '';
  let bestScore = 0;
  candidates.forEach((candidate) => {
    const candidateCompact = buildWordCompactTextMap(candidate).compactText;
    if (!candidateCompact) {
      return;
    }
    const lcsLength = buildWordLcsMatrix(templateCompact, candidateCompact)[templateCompact.length][candidateCompact.length];
    const similarity = lcsLength / Math.max(templateCompact.length, 1);
    const lengthPenalty = Math.abs(candidateCompact.length - templateCompact.length) / Math.max(templateCompact.length, 1);
    const score = similarity - (lengthPenalty * 0.08);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  });

  return bestScore >= 0.55 ? bestCandidate : '';
}

export function findSampleMatchForWordParam(
  sampleText: string,
  param: Pick<WordDetectedParam, 'anchorText' | 'paragraphText' | 'start' | 'end' | 'sourceType' | 'parameterSlot'>,
): { sampleValue?: string; sampleMatchText?: string } {
  const rawSampleText = String(sampleText || '');
  const normalizedSampleText = safeWordRuleText(rawSampleText);
  if (!normalizedSampleText) {
    return {};
  }

  const anchorCandidates = buildWordAnchorCandidates(param.anchorText);
  const normalizedAnchors = anchorCandidates.map((item) => normalizeWordLookupText(item)).filter(Boolean);
  const { prefix, suffix } = resolveWordSampleContext(param);
  const trailingUnitLabel = extractWordTrailingUnitLabel(param.paragraphText.slice(param.end, param.end + 16));
  const strictUnderlineValue = param.sourceType === 'underline';
  const explicitLabelAnchor = isExplicitWordParamLabelAnchor(param.anchorText);
  const repeatedAnchorStopCandidates = explicitLabelAnchor
    ? buildWordRepeatedAnchorStopCandidates(anchorCandidates)
    : [];

  if (strictUnderlineValue) {
    const diffCandidate = selectBestWordParagraphDiffCandidate(rawSampleText, param.paragraphText);
    if (diffCandidate) {
      const diffValue = extractWordValueByParagraphDiff(param.paragraphText, param.start, param.end, diffCandidate);
      if (diffValue) {
        const refinedUnitValue = trailingUnitLabel
          ? extractWordUnitComponentFromSampleText(diffCandidate, trailingUnitLabel)
          : '';
        return {
          sampleValue: truncateWordRuleText(normalizeWordSampleValue(refinedUnitValue || diffValue), 80),
          sampleMatchText: diffCandidate,
        };
      }
    }
  }

  const lines = rawSampleText
    .split(/[\r\n]+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 400);

  if (prefix && suffix) {
    const contextMatch = extractSampleValueBetweenContext(
      sampleText,
      prefix,
      suffix,
      repeatedAnchorStopCandidates,
    );
    if (contextMatch.sampleValue) {
      const refinedUnitValue = trailingUnitLabel
        ? extractWordUnitComponentFromSampleText(contextMatch.sampleMatchText || contextMatch.sampleValue, trailingUnitLabel)
        : '';
      return refinedUnitValue
        ? {
            ...contextMatch,
            sampleValue: truncateWordRuleText(normalizeWordSampleValue(refinedUnitValue), 80),
          }
        : contextMatch;
    }
  }

  if (strictUnderlineValue) {
    if (prefix && (!suffix || explicitLabelAnchor)) {
      const prefixPattern = new RegExp(`${escapeRegExp(prefix)}\\s*(.{1,80})`, 'u');
      const matched = normalizedSampleText.match(prefixPattern);
      const afterPrefixValue = trimWordSampleValueBySuffixHints(
        safeWordRuleText(matched?.[1]).split(/[，。；\n]/u)[0]?.trim() || '',
        suffix
      );
      if (afterPrefixValue) {
        const refinedUnitValue = trailingUnitLabel
          ? extractWordUnitComponentFromSampleText(afterPrefixValue, trailingUnitLabel)
          : '';
        return {
          sampleValue: truncateWordRuleText(normalizeWordSampleValue(refinedUnitValue || afterPrefixValue), 80),
          sampleMatchText: matched?.[0] || '',
        };
      }
    }

    return {};
  }

  if (normalizedAnchors.length > 0) {
    const anchorLine = lines.find((line) => {
      const normalizedLine = normalizeWordLookupText(line);
      return normalizedAnchors.some((anchor) => normalizedLine.includes(anchor));
    });
    if (anchorLine) {
      const unitSampleValue = trailingUnitLabel
        ? extractWordUnitComponentFromSampleText(anchorLine, trailingUnitLabel)
        : '';
      if (unitSampleValue) {
        return {
          sampleValue: truncateWordRuleText(normalizeWordSampleValue(unitSampleValue), 80),
          sampleMatchText: anchorLine,
        };
      }
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
      const refinedUnitValue = trailingUnitLabel
        ? extractWordUnitComponentFromSampleText(afterPrefixValue, trailingUnitLabel)
        : '';
      return {
        sampleValue: truncateWordRuleText(normalizeWordSampleValue(refinedUnitValue || afterPrefixValue), 80),
        sampleMatchText: matched?.[0] || '',
      };
    }
  }

  return {};
}
