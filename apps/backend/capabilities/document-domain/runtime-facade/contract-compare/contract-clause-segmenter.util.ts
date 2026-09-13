import type { ContractClauseNode } from './contract-compare.types';
import { buildDocumentBlocksFromText } from './contract-text-block-parser.util';

// Universal Legal Document Numbering Grammars (Language-neutral, structure-driven)
export const TIER1_CHAPTER_REGEX =
  /^\s*(?:第\s*[一二三四五六七八九十百千万\d]+\s*[编章节篇部]|[一二三四五六七八九十]+\s*[、\s]+\s*[^\n]{2,30}$|(?:CHAPTER|PART|TITLE|SECTION)\s+(?:[IVXLCDM\d]+|[A-Z]|\d+)\b)/i;

export const TIER2_ARTICLE_REGEX =
  /^\s*(?:第\s*[一二三四五六七八九十百千万\d]+\s*条|(?:ARTICLE|CLAUSE)\s+(?:[IVXLCDM\d]+|\d+)\b)/i;

export const ANNEX_BOUNDARY_REGEX =
  /^(?:附件|附录|付属文書|Exhibit|Schedule|Annex|Appendix)\s*[一二三四五六七八九十\d\w]*/i;

/**
 * Helper: strip markdown headers, bold/italic, and bullet markers to expose bare legal text
 */
export function cleanMarkdownFormatting(text: string): string {
  if (!text) return '';
  return text
    .replace(/^#{1,6}\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/^[\*\-]\s+/, '')
    .trim();
}

/**
 * Parse structured HTML into hierarchical Clause Nodes.
 * Preserves tables as atomic blocks and respects native heading/list hierarchy.
 */
export function parseHtmlToClauses(html: string): ContractClauseNode[] {
  const tagRegex = /<(p|ol|ul|table|h[1-6])[\s>][\s\S]*?<\/\1>/gi;
  const rawBlocks = html.match(tagRegex) || [];

  const items = rawBlocks
    .map((b) => {
      const isTable = b.startsWith('<table');
      const isList = b.startsWith('<ol') || b.startsWith('<ul');
      const isHeadingTag = /^<h[1-6]/i.test(b);
      const hasStrong = /<strong>/i.test(b);
      let text = b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const mdMatch = text.match(/^#{1,6}\s+(.*)$/);
      const isMdHeading = !!mdMatch;
      if (mdMatch) text = mdMatch[1].trim();
      return { isTable, isList, isHeadingTag, hasStrong, isMdHeading, text, rawHtml: b };
    })
    .filter((it) => it.text.length > 0 || it.isTable);

  if (items.length === 0) return [];

  const hasFormalArticles = items.some((it) =>
    TIER2_ARTICLE_REGEX.test(cleanMarkdownFormatting(it.text))
  );

  const clauses: ContractClauseNode[] = [];
  let currentClause: ContractClauseNode | null = null;
  let currentDivisionNum = '正文';
  let currentDivisionTitle = '合同正文条款';
  let clauseIndex = 1;

  const pushClause = (
    title: string,
    clauseNum: string,
    level: number,
    chNum?: string,
    chTitle?: string
  ) => {
    if (currentClause && currentClause.content.trim()) {
      currentClause.content = currentClause.content.trim();
      clauses.push(currentClause);
    }
    currentClause = {
      id: `clause-${clauseIndex++}`,
      clauseNumber: clauseNum,
      title,
      content: '',
      level,
      chapterNumber: chNum || currentDivisionNum,
      chapterTitle: chTitle || currentDivisionTitle,
    };
  };

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const next = items[i + 1];
    const next2 = items[i + 2];

    // 1. Tables are atomic tabular data (signatory matrices, pricing tables, etc.)
    if (it.isTable) {
      if (!currentClause) {
        pushClause('合同引言与主体信息', '前言', 2);
      }
      currentClause!.content += (currentClause!.content ? '\n\n' : '') + it.text;
      continue;
    }

    // 2. Annex / Division boundary detection
    const isAnnexNumber = ANNEX_BOUNDARY_REGEX.test(it.text) && it.text.length < 30;
    const isConsecutiveAnnexRef =
      isAnnexNumber &&
      ((next && ANNEX_BOUNDARY_REGEX.test(next.text)) ||
        (next2 && ANNEX_BOUNDARY_REGEX.test(next2.text)));

    if (
      isAnnexNumber &&
      !isConsecutiveAnnexRef &&
      (it.hasStrong || (next && (next.hasStrong || next.isHeadingTag || next.isList)))
    ) {
      const annexNum = it.text.replace(/[:：\s]+$/, '');
      let annexTitle = annexNum;
      if (next && next.text.length < 35 && !next.isTable) {
        annexTitle += ' ' + next.text.replace(/[:：\s]+$/, '');
        i++;
        if (next2 && next2.text.length < 35 && (next2.hasStrong || next2.isHeadingTag)) {
          annexTitle += ' ' + next2.text.replace(/[:：\s]+$/, '');
          i++;
        }
      }
      currentDivisionNum = annexNum;
      currentDivisionTitle = annexTitle;
      pushClause(annexTitle, annexNum, 1, annexNum, annexTitle);
      continue;
    }

    // 3. Tier 1 Chapter boundary: e.g. "第一章 总则", "CHAPTER 1"
    const isTier1 = TIER1_CHAPTER_REGEX.test(it.text);
    if (isTier1) {
      const chNum = it.text.split(/\s+/)[0];
      currentDivisionNum = chNum;
      currentDivisionTitle = it.text;
      pushClause(it.text, chNum, 1, chNum, it.text);
      continue;
    }

    // 4. Tier 2 Article / Clause detection
    const cleanItText = cleanMarkdownFormatting(it.text);
    const isNumberedArticle = hasFormalArticles
      ? TIER2_ARTICLE_REGEX.test(cleanItText)
      : TIER2_ARTICLE_REGEX.test(cleanItText) ||
        (/^\s*(?:\d+(\.\d+)+)[\.、\s]+[^\d\s]/i.test(cleanItText) &&
          cleanItText.length < 45 &&
          !/[。！？；]$/.test(cleanItText));

    const isStrongNumberedList =
      it.isList &&
      it.hasStrong &&
      it.text.length < 50 &&
      (it.text.endsWith('：') || it.text.endsWith(':') || it.text.length < 25);
    const isAnnexNumberedItem = currentDivisionNum !== '正文' && it.isList && it.text.length < 40;
    const isHeadingTag = it.isHeadingTag || (it.isMdHeading && !hasFormalArticles);

    if (isNumberedArticle || isStrongNumberedList || isAnnexNumberedItem || isHeadingTag) {
      let heading = it.text.replace(/[:：\s]+$/, '');

      // Language-agnostic bilingual pairing (short heading followed immediately by translation line)
      if (
        next &&
        !next.isTable &&
        next.text.length < 45 &&
        !/^\d+(\.\d+)/.test(next.text) &&
        (next.text.endsWith('：') ||
          next.text.endsWith(':') ||
          next.hasStrong ||
          next.isHeadingTag ||
          next.isList)
      ) {
        heading += ' / ' + next.text.replace(/[:：\s]+$/, '');
        i++;
      }

      const matchArt = heading.match(
        /^\s*(第[一二三四五六七八九十百千万\d]+条|(?:ARTICLE|CLAUSE)\s+(?:[IVXLCDM\d]+|\d+)\b)\s*(.*)$/i
      );
      let cNum = `第 ${clauseIndex} 条`;
      let cleanTitle = heading;

      if (matchArt) {
        cNum = matchArt[1].trim();
        cleanTitle = matchArt[2]?.trim() || matchArt[1].trim();
      }

      pushClause(cleanTitle, cNum, 2);
    } else {
      if (!currentClause) {
        pushClause('合同引言与主体信息', '前言', 2);
      }
      currentClause!.content += (currentClause!.content ? '\n' : '') + it.text;
    }
  }

  const finalHtmlClause = currentClause as ContractClauseNode | null;
  if (finalHtmlClause && finalHtmlClause.content.trim()) {
    finalHtmlClause.content = finalHtmlClause.content.trim();
    clauses.push(finalHtmlClause);
  }

  return clauses;
}

/**
 * Fallback chunking: group into substantial logical blocks instead of single-line fragments
 */
export function fallbackParagraphChunking(text: string): ContractClauseNode[] {
  const rawParagraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const mergedBlocks: string[] = [];
  let currentBlock = '';

  for (const p of rawParagraphs) {
    if (!currentBlock) {
      currentBlock = p;
    } else if (currentBlock.length < 250 || p.length < 80) {
      currentBlock += '\n\n' + p;
    } else {
      mergedBlocks.push(currentBlock);
      currentBlock = p;
    }
  }
  if (currentBlock) {
    mergedBlocks.push(currentBlock);
  }

  return mergedBlocks.map((p, idx) => {
    const firstLine = p.split('\n')[0].slice(0, 35);
    return {
      id: `clause-${idx + 1}`,
      clauseNumber: `条款 ${idx + 1}`,
      title: firstLine,
      content: p,
      level: 2,
    };
  });
}

/**
 * Parse structured contract text into hierarchical Clause Nodes with Chapter awareness
 */
export function parseTextToClauses(text: string): ContractClauseNode[] {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const hasFormalArticles = lines.some((l) =>
    TIER2_ARTICLE_REGEX.test(cleanMarkdownFormatting(l))
  );

  const clauses: ContractClauseNode[] = [];
  let currentClause: ContractClauseNode | null = null;
  let clauseIndex = 0;
  let currentDivisionNum = '前言';
  let currentDivisionTitle = '合同引言与签约主体';

  const pushClause = (
    title: string,
    clauseNum: string,
    level: number,
    chNum?: string,
    chTitle?: string
  ) => {
    if (currentClause && (currentClause.content.trim() || (currentClause.blocks && currentClause.blocks.length > 0))) {
      const isPreamble = currentClause.clauseNumber === '前言' || currentClause.id === 'clause-0';
      const parsed = buildDocumentBlocksFromText(currentClause.content, isPreamble);
      currentClause.content = parsed.content || currentClause.content.trim();
      currentClause.blocks = parsed.blocks;
      clauses.push(currentClause);
    }
    currentClause = {
      id: `clause-${clauseIndex++}`,
      clauseNumber: clauseNum,
      title,
      content: '',
      blocks: [],
      level,
      chapterNumber: chNum || currentDivisionNum,
      chapterTitle: chTitle || currentDivisionTitle,
    };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';

    let cleanLine = cleanMarkdownFormatting(line);

    // Annex / Division
    const isAnnex = ANNEX_BOUNDARY_REGEX.test(cleanLine) && cleanLine.length < 30;
    if (isAnnex) {
      const annexNum = cleanLine.replace(/[:：\s]+$/, '');
      let annexTitle = annexNum;
      const cleanNext = cleanMarkdownFormatting(nextLine);
      if (cleanNext && cleanNext.length < 35 && !TIER2_ARTICLE_REGEX.test(cleanNext)) {
        annexTitle += ' ' + cleanNext.replace(/[:：\s]+$/, '');
        i++;
      }
      currentDivisionNum = annexNum;
      currentDivisionTitle = annexTitle;
      pushClause(annexTitle, annexNum, 1, annexNum, annexTitle);
      continue;
    }

    // Tier 1 Chapter
    const isTier1 = TIER1_CHAPTER_REGEX.test(cleanLine);
    if (isTier1) {
      const chNum = cleanLine.split(/\s+/)[0];
      currentDivisionNum = chNum;
      currentDivisionTitle = cleanLine;
      continue;
    }

    // Tier 2 Article
    const isNumberedArticle = hasFormalArticles
      ? TIER2_ARTICLE_REGEX.test(cleanLine)
      : TIER2_ARTICLE_REGEX.test(cleanLine) ||
        (/^\s*(?:\d+(\.\d+)+)[\.、\s]+[^\d\s]/i.test(cleanLine) &&
          cleanLine.length < 45 &&
          !/[。！？；]$/.test(cleanLine));

    if (isNumberedArticle) {
      if (currentDivisionNum === '前言') {
        currentDivisionNum = '正文';
        currentDivisionTitle = '合同正文条款';
      }
      let heading = cleanLine.replace(/[:：\s]+$/, '');
      const cleanNext = cleanMarkdownFormatting(nextLine);
      if (
        cleanNext &&
        cleanNext.length < 40 &&
        !/^\d+(\.\d+)/.test(cleanNext) &&
        (cleanNext.endsWith('：') || cleanNext.endsWith(':'))
      ) {
        heading += ' / ' + cleanNext.replace(/[:：\s]+$/, '');
        i++;
      }

      const matchArt = heading.match(
        /^\s*(第\s*[一二三四五六七八九十百千万\d]+\s*条|(?:ARTICLE|CLAUSE)\s+(?:[IVXLCDM\d]+|\d+)\b)\s*(.*)$/i
      );
      let cNum = `第 ${clauseIndex} 条`;
      let cleanTitle = heading;

      if (matchArt) {
        cNum = matchArt[1].replace(/\s+/g, '');
        cleanTitle = matchArt[2]?.trim() || matchArt[1].trim();
      }

      pushClause(cleanTitle, cNum, 2, currentDivisionNum, currentDivisionTitle);
    } else {
      if (!currentClause) {
        pushClause('合同引言与主体信息', '前言', 2, '前言', '合同引言与签约主体');
      }
      currentClause!.content += (currentClause!.content ? '\n' : '') + line;
    }
  }

  const finalTextClause = currentClause as ContractClauseNode | null;
  if (finalTextClause && (finalTextClause.content.trim() || (finalTextClause.blocks && finalTextClause.blocks.length > 0))) {
    const isPreamble = finalTextClause.clauseNumber === '前言' || finalTextClause.id === 'clause-0';
    const parsed = buildDocumentBlocksFromText(finalTextClause.content, isPreamble);
    finalTextClause.content = parsed.content || finalTextClause.content.trim();
    finalTextClause.blocks = parsed.blocks;
    clauses.push(finalTextClause);
  }

  // Fallback: If no clauses detected at all, do chunking
  if (clauses.length <= 1 && text.length > 300) {
    return fallbackParagraphChunking(text);
  }

  return clauses;
}
