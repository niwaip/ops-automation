import { dedupeDetectedWordParams } from './candidates';
import { detectWordColonParams } from './detect-rule-colon';
import { analyzeWordTableParams, detectWordTableParams } from './detect-rule-table';
import { detectWordUnderlineParams } from './detect-rule-underline';
import type {
  WordDetectedParam,
  WordParagraphLike,
  WordTableCellLike,
  WordUnderlineLike,
} from './types';

/**
 * Word 参数识别规则注册表。
 *
 * 当前职责要点：
 * 1. 统一注册 underline / table / colon 三类参数识别规则。
 * 2. 按调用方指定的 ruleNames 顺序执行对应规则处理器。
 * 3. 将 paragraphs / underlines / tableCells / sampleText 等上下文透传给各规则。
 * 4. 对冒号规则额外透传 includeLabelOnly，用于控制是否保留仅标签候选。
 * 5. 汇总所有规则产出的参数候选后，统一走 dedupeDetectedWordParams 去重。
 */

type DetectWordRuleExecutionArgs = {
  paragraphs: WordParagraphLike[];
  underlines: WordUnderlineLike[];
  tableCells: WordTableCellLike[];
  sampleText?: string;
  includeLabelOnly?: boolean;
};

type WordParameterRuleHandler = (args: DetectWordRuleExecutionArgs) => WordDetectedParam[];

export const WORD_PARAMETER_RULE_HANDLERS = {
  underline: ({ underlines, paragraphs, sampleText = '' }) =>
    detectWordUnderlineParams(underlines, paragraphs, sampleText),
  table: ({ tableCells, sampleText = '' }) => detectWordTableParams(tableCells, sampleText),
  colon: ({ paragraphs, underlines, tableCells, sampleText = '', includeLabelOnly = true }) =>
    detectWordColonParams(paragraphs, underlines, tableCells, {
      sampleText,
      includeLabelOnly,
    }),
} satisfies Record<string, WordParameterRuleHandler>;

export type WordParameterRuleName = keyof typeof WORD_PARAMETER_RULE_HANDLERS;

export type DetectWordParamsByRulesArgs = DetectWordRuleExecutionArgs & {
  ruleNames: WordParameterRuleName[];
};

export const WORD_PARAMETER_RULE_NAMES = Object.freeze(
  Object.keys(WORD_PARAMETER_RULE_HANDLERS) as WordParameterRuleName[]
);

export function detectWordParamsByRules(args: DetectWordParamsByRulesArgs): WordDetectedParam[] {
  const params = args.ruleNames.flatMap(
    (ruleName) => WORD_PARAMETER_RULE_HANDLERS[ruleName]?.(args) || []
  );
  return dedupeDetectedWordParams(params);
}

export { analyzeWordTableParams };
