import { Injectable, Logger } from '@nestjs/common';
import {
  ExtractedCommentItem,
  DocxClauseItemContext,
  ParsedParagraph,
  ClauseBoundary,
} from './docx-comment.types';
import { unescapeXml, toChineseNumber, parseClauseNumber } from './docx-xml.util';

export interface CommentLocationResult {
  matchedPIdx: number;
  matchType: 'clause_scoped_anchor' | 'global_anchor' | 'clause_title' | 'clause_number' | 'clause_boundary' | 'ambiguous' | 'unresolved';
  matchedSnippet?: string;
}

@Injectable()
export class DocxClauseLocatorService {
  private readonly logger = new Logger(DocxClauseLocatorService.name);

  /**
   * 解析正文段落列表，完整解码 XML 实体，建立段落索引
   */
  public parseParagraphs(docXml: string): ParsedParagraph[] {
    const paragraphs: ParsedParagraph[] = [];
    const pRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
    let pm: RegExpExecArray | null;
    let pIdx = 0;

    while ((pm = pRegex.exec(docXml)) !== null) {
      const rawXml = pm[0];
      const pBody = pm[1];
      // 提取纯文本并完整解码 XML 实体（例如 &amp; 解码为 &，&lt; 解码为 <）
      const stripped = pBody.replace(/<[^>]+>/g, '');
      const cleanText = unescapeXml(stripped).replace(/\s+/g, ' ').trim();

      const { isHeading, headingTitle } = this.detectHeading(rawXml, cleanText, pIdx);

      paragraphs.push({
        pIdx,
        start: pm.index,
        length: rawXml.length,
        rawXml,
        cleanText,
        isHeading,
        headingTitle,
      });

      pIdx++;
    }

    return paragraphs;
  }

  /**
   * 启发式检测段落是否为条款大纲标题
   */
  private detectHeading(
    rawXml: string,
    cleanText: string,
    pIdx: number
  ): { isHeading: boolean; headingTitle?: string } {
    if (pIdx === 0 || !cleanText || cleanText.length < 2) {
      return { isHeading: false };
    }

    // 过滤当事人、签约、开户、盖章等落款行
    if (
      cleanText.includes('甲方：') ||
      cleanText.includes('乙方：') ||
      cleanText.includes('签字：') ||
      cleanText.includes('盖章：') ||
      cleanText.includes('法定代表人') ||
      cleanText.includes('开户银行')
    ) {
      return { isHeading: false };
    }

    const hasHeadingStyle = /w:pStyle\s+w:val="(?:Heading|Title|标题|heading)/i.test(rawXml);
    // 仅匹配一级条款序号：如 第一条、1.、1、一、，严禁将 1.1 / 1.2 等子项误判为一级条款
    const hasExplicitNumber = /^第[0-9一二三四五六七八九十百]+[条章]|^[0-9]{1,2}[、\s]|^[一二三四五六七八九十]{1,3}[、\s]/.test(cleanText);
    const isShortColonHeading = cleanText.length <= 25 && /[:：]$/.test(cleanText);
    const isShortBoldHeading = cleanText.length <= 30 && rawXml.includes('<w:b/>') && !/[,，。；;]/.test(cleanText);

    if (hasHeadingStyle || hasExplicitNumber || isShortColonHeading || isShortBoldHeading) {
      const headingTitle = cleanText
        .replace(/[:：]$/, '')
        .replace(/^第[0-9一二三四五六七八九十百]+[条章]\s*/, '')
        .replace(/^[0-9一二三四五六七八九十]+[、\.\s]*/, '')
        .trim();
      return { isHeading: true, headingTitle };
    }

    return { isHeading: false };
  }

  /**
   * 划分文档内部各条款的物理段落边界范围 [startPIdx, endPIdx]
   */
  public discoverClauseBoundaries(
    paragraphs: ParsedParagraph[],
    contextClauses?: DocxClauseItemContext[]
  ): ClauseBoundary[] {
    const boundaries: ClauseBoundary[] = [];
    const headingParagraphs = paragraphs.filter((p) => p.isHeading && p.pIdx > 0);

    for (let i = 0; i < headingParagraphs.length; i++) {
      const current = headingParagraphs[i];
      const next = headingParagraphs[i + 1];
      const startPIdx = current.pIdx;
      const endPIdx = next ? next.pIdx - 1 : paragraphs.length - 1;

      // 提取条款序号（如有，支持阿拉伯数字与中文大写数字）
      const numMatch = current.cleanText.match(/第([0-9一二三四五六七八九十百]+)[条章]/) ||
                       current.cleanText.match(/^([0-9]+)[、\.\s]/) ||
                       current.cleanText.match(/^([一二三四五六七八九十百]+)[、\.\s]/);
      const parsedNum = numMatch ? parseClauseNumber(numMatch[1]) : undefined;
      const clauseNum = parsedNum !== undefined ? String(parsedNum) : (numMatch ? numMatch[1] : undefined);

      boundaries.push({
        clauseIndex: i + 1,
        clauseNumber: clauseNum,
        clauseTitle: current.headingTitle || current.cleanText,
        startParagraphIndex: startPIdx,
        endParagraphIndex: endPIdx,
      });
    }

    return boundaries;
  }

  /**
   * 标准多层精确定位引擎：条款作用域划词 -> 全局划词消歧 -> 动态条款标题 -> 通用编号 -> 标记未定位
   */
  public locateComment(
    comment: ExtractedCommentItem,
    paragraphs: ParsedParagraph[],
    boundaries: ClauseBoundary[],
    contextClauses?: DocxClauseItemContext[],
    parentParagraphIndex?: number
  ): CommentLocationResult {
    // 0. 若存在父批注物理段落，回复批注直接继承父批注段落位置，保证对话流上下文绝对严格对齐
    if (parentParagraphIndex !== undefined && parentParagraphIndex >= 0 && parentParagraphIndex < paragraphs.length) {
      return {
        matchedPIdx: parentParagraphIndex,
        matchType: 'clause_scoped_anchor',
        matchedSnippet: comment.anchorText ? this.cleanAnchorText(comment.anchorText) : undefined,
      };
    }

    // 1. 尝试找到目标条款边界
    const targetBoundary = this.resolveTargetBoundary(comment, boundaries, contextClauses);

    // 2. 阶段 1：条款作用域划词匹配（Clause-Scoped Anchor Matching）
    if (comment.anchorText && comment.anchorText.trim().length >= 3) {
      const cleanAnchor = this.cleanAnchorText(comment.anchorText);

      if (cleanAnchor.length >= 3) {
        // 如果明确归属某个条款，只在该条款的段落区间内搜索，杜绝跨条款误匹配
        if (targetBoundary) {
          const matchedInBoundary: number[] = [];
          for (let pIdx = targetBoundary.startParagraphIndex; pIdx <= targetBoundary.endParagraphIndex; pIdx++) {
            const p = paragraphs[pIdx];
            if (p && this.matchesSnippet(p.cleanText, cleanAnchor)) {
              matchedInBoundary.push(p.pIdx);
            }
          }

          if (matchedInBoundary.length === 1) {
            return {
              matchedPIdx: matchedInBoundary[0],
              matchType: 'clause_scoped_anchor',
              matchedSnippet: cleanAnchor,
            };
          } else if (matchedInBoundary.length > 1) {
            // 同一条款内存在多处完全相同的重复引用且缺乏上下文，严禁武断挂在第一个，标记为歧义
            return {
              matchedPIdx: -1,
              matchType: 'ambiguous',
            };
          }
          // 条款内部未能匹配划词时，直接转入条款标题/编号兜底，严禁跨出本条款范围误匹配外部条款
        } else {
          // 阶段 2：全局划词匹配（仅在未指定任何目标条款时生效）与严格唯一性消歧
          const matchedIndices: number[] = [];
          for (const p of paragraphs) {
            if (p.pIdx === 0) continue;
            if (this.matchesSnippet(p.cleanText, cleanAnchor)) {
              matchedIndices.push(p.pIdx);
            }
          }

          if (matchedIndices.length === 1) {
            return {
              matchedPIdx: matchedIndices[0],
              matchType: 'global_anchor',
              matchedSnippet: cleanAnchor,
            };
          } else if (matchedIndices.length > 1) {
            // 若全局存在多个完全相同的重复引用且缺乏上下文，严禁武断挂在第一个，标记为歧义
            return {
              matchedPIdx: -1,
              matchType: 'ambiguous',
            };
          }
        }
      }
    }

    // 3. 阶段 3：动态条款标题匹配（Clause Title Matching）
    const effectiveTitle = this.resolveEffectiveTitle(comment, targetBoundary, contextClauses);
    if (effectiveTitle && effectiveTitle.length >= 2) {
      const cleanTitle = effectiveTitle
        .replace(/[\[\]]/g, '')
        .replace(/条款\s*#?\d+/gi, '')
        .replace(/^[0-9一二三四五六七八九十]+[、\.\s]*/, '')
        .trim();

      if (cleanTitle.length >= 2) {
        // 优先匹配条款小标题段落（独立短行或以标题开头）
        for (const p of paragraphs) {
          if (p.pIdx === 0) continue;
          if (
            p.cleanText.startsWith(cleanTitle) ||
            (p.cleanText.includes(cleanTitle) && p.cleanText.length < 40)
          ) {
            return {
              matchedPIdx: p.pIdx,
              matchType: 'clause_title',
              matchedSnippet: cleanTitle,
            };
          }
        }

        // 次选：包含该标题的正文段落
        for (const p of paragraphs) {
          if (p.pIdx === 0) continue;
          if (p.cleanText.includes(cleanTitle)) {
            return {
              matchedPIdx: p.pIdx,
              matchType: 'clause_title',
              matchedSnippet: cleanTitle,
            };
          }
        }
      }
    }

    // 4. 阶段 4：标准法律条款编号模式匹配（Legal Numbering Matching）
    const clauseNum = this.resolveClauseNumber(comment, targetBoundary, contextClauses);
    if (clauseNum !== undefined) {
      const cn = toChineseNumber(clauseNum);
      const numPatterns = [
        `第${clauseNum}条`,
        `第${cn}条`,
        `${clauseNum}.`,
        `${clauseNum}、`,
        `${cn}、`,
      ];
      for (const pat of numPatterns) {
        const found = paragraphs.find(
          (p) =>
            p.pIdx > 0 &&
            (p.cleanText.startsWith(pat) || (p.cleanText.includes(pat) && p.cleanText.length < 50))
        );
        if (found) {
          return {
            matchedPIdx: found.pIdx,
            matchType: 'clause_number',
            matchedSnippet: pat,
          };
        }
      }
    }

    // 5. 阶段 5：目标条款起始段落匹配（Clause Boundary Start）
    if (targetBoundary && targetBoundary.startParagraphIndex > 0) {
      return {
        matchedPIdx: targetBoundary.startParagraphIndex,
        matchType: 'clause_boundary',
      };
    }

    // 6. 严禁静默挂在第 0 段大标题或第 1 段无关正文：明确标记为未定位
    return {
      matchedPIdx: -1,
      matchType: 'unresolved',
    };
  }

  private cleanAnchorText(raw: string): string {
    return unescapeXml(raw)
      .replace(/^[\d\.\s、#\-\(\)（）一二三四五六七八九十第条]+/, '')
      .replace(/[\s\r\n“”"''《》,，。；;：:]/g, '')
      .trim();
  }

  private matchesSnippet(pCleanText: string, snippet: string): boolean {
    const normP = pCleanText.replace(/[\s\r\n“”"''《》,，。；;：:]/g, '');
    return normP.includes(snippet);
  }

  private resolveTargetBoundary(
    comment: ExtractedCommentItem,
    boundaries: ClauseBoundary[],
    contextClauses?: DocxClauseItemContext[]
  ): ClauseBoundary | undefined {
    // 优先依据 clauseTitle 匹配
    if (comment.clauseTitle) {
      const cTitle = comment.clauseTitle.trim();
      const b = boundaries.find(
        (bound) => bound.clauseTitle && (bound.clauseTitle.includes(cTitle) || cTitle.includes(bound.clauseTitle))
      );
      if (b) return b;
    }

    // 次选依据 context.clauses 获取的条款名匹配
    const cIndex = comment.clauseIndex !== undefined ? comment.clauseIndex : (comment.clauseId ? parseInt(comment.clauseId, 10) : undefined);
    if (cIndex !== undefined && contextClauses) {
      const ctxClause = contextClauses.find((c) => c.clauseIndex === cIndex || String(c.clauseIndex) === String(cIndex));
      if (ctxClause?.title) {
        const b = boundaries.find(
          (bound) => bound.clauseTitle && (bound.clauseTitle.includes(ctxClause.title!) || ctxClause.title!.includes(bound.clauseTitle))
        );
        if (b) return b;
      }
    }

    // 依据条目编号匹配（支持中文数字如“第二条”和阿拉伯数字）
    if (comment.clauseNumber) {
      const parsedNum = parseClauseNumber(comment.clauseNumber);
      const numStr = parsedNum !== undefined ? String(parsedNum) : comment.clauseNumber.trim();
      if (numStr) {
        const b = boundaries.find((bound) => bound.clauseNumber === numStr || String(bound.clauseIndex) === numStr);
        if (b) return b;
      }
    }

    return undefined;
  }

  private resolveEffectiveTitle(
    comment: ExtractedCommentItem,
    boundary?: ClauseBoundary,
    contextClauses?: DocxClauseItemContext[]
  ): string | undefined {
    if (comment.clauseTitle) return comment.clauseTitle;
    if (boundary?.clauseTitle) return boundary.clauseTitle;

    const cIndex = comment.clauseIndex !== undefined ? comment.clauseIndex : (comment.clauseId ? parseInt(comment.clauseId, 10) : undefined);
    if (cIndex !== undefined && contextClauses) {
      const ctx = contextClauses.find((c) => c.clauseIndex === cIndex || String(c.clauseIndex) === String(cIndex));
      if (ctx?.title) return ctx.title;
    }

    return undefined;
  }

  private resolveClauseNumber(
    comment: ExtractedCommentItem,
    boundary?: ClauseBoundary,
    contextClauses?: DocxClauseItemContext[]
  ): number | undefined {
    if (comment.clauseNumber) {
      const num = parseClauseNumber(comment.clauseNumber);
      if (num !== undefined) return num;
    }

    const cIndex = comment.clauseIndex !== undefined ? comment.clauseIndex : (comment.clauseId ? parseInt(comment.clauseId, 10) : undefined);
    if (cIndex !== undefined && contextClauses) {
      const ctx = contextClauses.find((c) => c.clauseIndex === cIndex || String(c.clauseIndex) === String(cIndex));
      if (ctx?.clauseNumber) {
        const num = parseClauseNumber(ctx.clauseNumber);
        if (num !== undefined) return num;
      }
    }

    if (boundary?.clauseNumber) {
      const num = parseClauseNumber(boundary.clauseNumber);
      if (num !== undefined) return num;
    }

    return undefined;
  }
}
