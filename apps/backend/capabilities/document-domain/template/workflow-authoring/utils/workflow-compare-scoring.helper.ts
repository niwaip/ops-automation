import { WorkflowAnalyzeFieldResult, WorkflowFieldDictionaryEntry } from './workflow-assets';
import {
  safeText,
  escapeRegExp,
  extractPlaceholderSampleValue,
  isLikelySectionHeading,
} from './document-xml-parser';
import { hasCompareFieldShape } from './workflow-parser-format';
import { isCompactCompareBlock, isLikelyNarrativeCompareText, scoreLooseTextMatch } from './workflow-similarity';
import { normalizeConfidence } from './workflow-discover';

export function shouldCreateCompareCandidate(
  templateText: string,
  anchorText: string,
  matchText: string,
  matchedField?: WorkflowAnalyzeFieldResult,
  dictionaryHint?: WorkflowFieldDictionaryEntry
): boolean {
  const normalizedTemplateText = safeText(templateText);
  const hasCompareShape = hasCompareFieldShape(normalizedTemplateText);
  const compactCompareBlock = isCompactCompareBlock(normalizedTemplateText);
  const likelyNarrative = isLikelyNarrativeCompareText(normalizedTemplateText);

  if (isLikelySectionHeading(normalizedTemplateText) && !matchedField && !dictionaryHint) {
    return false;
  }
  if (matchedField) {
    return true;
  }

  if (!hasCompareShape) {
    return Boolean(dictionaryHint && compactCompareBlock && !likelyNarrative);
  }

  if (!compactCompareBlock || likelyNarrative) {
    return false;
  }

  if (matchText) {
    return true;
  }

  if (dictionaryHint) {
    return true;
  }

  return Boolean(safeText(anchorText));
}

export function describeCompareCandidateReason(
  matchText: string,
  matchedField?: WorkflowAnalyzeFieldResult,
  dictionaryHint?: WorkflowFieldDictionaryEntry,
  matchedInSection = false
): string {
  if (matchText && matchedField) {
    return matchedInSection ? '章节文本宽松命中 + 规则候选关联' : '全文宽松命中 + 规则候选关联';
  }
  if (matchText && dictionaryHint) {
    return matchedInSection ? '章节文本宽松命中 + 词典辅助提示' : '全文宽松命中 + 词典辅助提示';
  }
  if (matchText) {
    return matchedInSection ? '章节文本宽松命中' : '全文宽松命中';
  }
  if (matchedField) {
    return '规则候选关联';
  }
  if (dictionaryHint) {
    return '词典提示兜底';
  }
  return '结构特征兜底';
}

export function buildCandidateSampleValue(
  anchorText: string,
  templateText: string,
  matchText: string,
  matchedField: WorkflowAnalyzeFieldResult | undefined,
  sourceLanguage: string
): string {
  const snippet = safeText(matchText).replace(/\s+/g, ' ').trim();
  if (!snippet) {
    const fieldSample = safeText(
      matchedField?.sample?.[sourceLanguage] || matchedField?.sample?.zh
    );
    return fieldSample;
  }
  const placeholderValue = extractPlaceholderSampleValue(templateText, snippet);
  if (placeholderValue) {
    return placeholderValue.slice(0, 80);
  }
  const normalizedAnchor = safeText(anchorText).replace(/[：:]$/u, '');
  if (normalizedAnchor) {
    const directMatch = snippet.match(
      new RegExp(`${escapeRegExp(normalizedAnchor)}[：:]?\\s*([^\\n]{1,80})`, 'u')
    );
    const directValue = safeText(directMatch?.[1]);
    if (directValue) {
      return directValue.slice(0, 80);
    }
  }
  const colonValue = safeText(snippet.match(/[：:]\s*([^\n]{1,80})/u)?.[1]);
  if (colonValue) {
    return colonValue.slice(0, 80);
  }
  return snippet
    .split(/[。；;]/u)[0]
    .slice(0, 80)
    .trim();
}

export function computeCompareCandidateConfidence(
  matchText: string,
  matchedField?: WorkflowAnalyzeFieldResult,
  dictionaryHint?: WorkflowFieldDictionaryEntry
): number {
  const normalizedMatchText = safeText(matchText);
  const looseMatchScore = normalizedMatchText
    ? scoreLooseTextMatch(
        normalizedMatchText,
        [
          safeText(matchedField?.fieldId),
          safeText(matchedField?.sample?.zh),
          safeText(dictionaryHint?.fieldId),
          safeText(dictionaryHint?.description),
        ].filter(Boolean)
      )
    : 0;

  let confidence = normalizedMatchText ? 0.46 : 0.24;
  if (normalizedMatchText) {
    confidence += Math.min(0.18, looseMatchScore * 0.18);
  }
  if (matchedField) {
    confidence += 0.26;
    confidence = Math.max(confidence, normalizeConfidence(matchedField.confidence, confidence));
  }
  if (dictionaryHint) {
    confidence += matchedField ? 0.08 : 0.18;
  }
  if (normalizedMatchText && matchedField && dictionaryHint) {
    confidence += 0.04;
  }

  return normalizeConfidence(confidence, 0.72);
}
