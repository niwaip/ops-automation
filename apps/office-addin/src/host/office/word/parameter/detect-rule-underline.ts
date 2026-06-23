import { extractWordParamAnchorText, extractWordParamName } from './anchor';
import { looksLikeWordHeaderTitle } from './heading-filter';
import { buildWordParamPromptParts } from './prompt';
import { findSampleMatchForWordParam } from './sample';
import type { WordDetectedParam, WordParagraphLike, WordUnderlineLike } from './types';
import { safeWordRuleText } from '../shared/text';

/**
 * Word 下划线参数识别规则。
 *
 * 当前规则要点：
 * 1. 输入以下划线采集阶段已确认的占位区为准，这里只负责补齐锚点与参数元数据。
 * 2. 优先从当前段落中，根据下划线起止位置提取本地 anchorText。
 * 3. 若当前段落无法提取有效锚点，则向前回看最多 3 个段落，优先复用“以冒号结尾的标签行”。
 * 4. 若前序段落更像标题而非标签，也会退化为“标题：”形式，保证参数仍有可读锚点。
 * 5. 最终结合同段 siblingRanges 生成 localAnchorText / parameterSlot，并附带 sample 匹配结果。
 */

export function detectWordUnderlineParams(
  underlines: WordUnderlineLike[],
  paragraphs: WordParagraphLike[] = [],
  sampleText = ''
): WordDetectedParam[] {
  const paragraphIdByIndex = new Map(
    paragraphs.map((paragraph) => [
      paragraph.index,
      paragraph.id || `word-paragraph-${paragraph.index}`,
    ])
  );
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
      if (looksLikeWordHeaderTitle(previousText, previousParagraph?.format)) {
        return `${previousText}：`;
      }
    }

    return directAnchorText;
  };

  return underlines.flatMap((underline) => {
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
    return [
      {
        ...param,
        ...findSampleMatchForWordParam(sampleText, param),
      },
    ];
  });
}
