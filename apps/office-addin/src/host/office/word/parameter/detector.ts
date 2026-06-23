import { TemplateFieldCandidate } from '../../../../api/carbone-api';
import { buildWordParameterDetectionDebugText as buildWordParameterDetectionDebugTextImpl } from './debug';
import {
  collectWordParagraphs,
  collectWordTableCells,
  collectWordUnderlines,
  isParagraphLikelyInsideWordTable,
} from './collect';
import { buildWordRuleCandidate } from './candidates';
import { analyzeWordTableParams, detectWordParamsByRules } from './detect-rule-registry';
import {
  DEFAULT_WORD_PARAMETER_RULE_PROFILE,
  WORD_DOCUMENT_PARAMETER_RULE_PROFILES,
  WordDocumentParameterRuleProfile,
  WordParameterRuleName,
} from './profiles';
import {
  endsWithWordParamLabel,
  extractRepeatedWordTrailingLabels,
  findWordInlineGapParam,
  findWordTerminalGapParam,
} from './detect-rule-colon';
import type {
  WordDetectedParam,
  WordParagraphLike,
  WordTableCellLike,
  WordUnderlineLike,
} from './types';

export function getWordDocumentParameterRuleProfile(
  templateType: string
): WordDocumentParameterRuleProfile {
  const matchedProfile = templateType
    ? WORD_DOCUMENT_PARAMETER_RULE_PROFILES[templateType]
    : undefined;
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
  ruleName: WordParameterRuleName
): boolean {
  return profile.compareCandidateRules.includes(ruleName);
}

export function hasWordParameterCheckRule(
  profile: WordDocumentParameterRuleProfile,
  ruleName: WordParameterRuleName
): boolean {
  return profile.parameterCheckRules.includes(ruleName);
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

export function buildWordParameterDetectionDebugText(args: {
  templateType: string;
  paragraphs: WordParagraphLike[];
  underlines: WordUnderlineLike[];
  tableCells: WordTableCellLike[];
  sampleText?: string;
  includeLabelOnly?: boolean;
  keywordFilters?: string[];
  maxParagraphs?: number;
}): string {
  return buildWordParameterDetectionDebugTextImpl(args, {
    getWordDocumentParameterRuleProfile,
    detectWordParamsByRules,
    findWordInlineGapParam,
    findWordTerminalGapParam,
    extractRepeatedWordTrailingLabels,
    endsWithWordParamLabel,
    isParagraphLikelyInsideWordTable,
  });
}

export function buildWordCompareCandidates(
  documentIr: Record<string, any> | null | undefined,
  templateType: string
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
  documentIr: Record<string, any> | null | undefined
): TemplateFieldCandidate[] {
  const tableParams = analyzeWordTableParams(collectWordTableCells(documentIr)).params;
  return tableParams
    .map((param) => buildWordRuleCandidate(param))
    .filter((candidate): candidate is TemplateFieldCandidate => Boolean(candidate));
}
