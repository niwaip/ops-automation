import * as JSZip from 'jszip';
import type { ContractClauseNode, DocumentBlock } from './contract-compare.types';
import { cleanMarkdownFormatting } from './contract-clause-segmenter.util';

export interface NumberingDefinitions {
  numToAbstract: Record<string, string>;
  abstractLevels: Record<string, Record<number, { numFmt: string; lvlText: string; start: number }>>;
}

export function decodeXmlEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return isNaN(code) ? _ : String.fromCodePoint(code);
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return isNaN(code) ? _ : String.fromCodePoint(code);
    })
    .replace(/&nbsp;/g, '\u00A0')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function isLikelyClauseBody(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  // 1. Sentence ending punctuation (Japanese, Chinese, Western)
  if (/[。！？；\.]$/.test(t)) return true;

  // 2. Clause numbering / list marker prefix e.g. (1), 1., 一、, (一), 1)
  if (/^(?:\d+[\.、\)]|[（\(]\d+[）\)]|[一二三四五六七八九十]+[\.、\)]|[（\(][一二三四五六七八九十]+[）\)])/.test(t)) return true;

  // 3. Known contractual party subjects with topic or nominative particles:
  // e.g. 甲は, 乙は, 甲及び乙は, 買主は, 売主は, 当社は, 受託者は, 利用者は, 甲、乙は, 甲が, 乙が
  if (/^(?:[甲乙丙丁]|買主|売主|甲及び乙|甲および乙|甲、乙|当社|受託者|委託者|利用者|顧客|各当事者|当事者)(?:[はが]|において)/.test(t)) {
    return true;
  }

  // 4. Topic (は) or nominative (が) particle following any substantive noun:
  // Contract titles are noun phrases; sentences state topics (e.g. 報酬は, 代金は, 本契約は, 期間は, 費用は, 管轄は)
  if (/^[\u4e00-\u9fa5\u30a0-\u30ff\w]{1,10}[はが]\s*/u.test(t)) {
    return true;
  }

  // 5. Monetary amounts, rates, prices, percentages (both Kanji and Arabic numerals):
  // e.g. 十万円, 100000円, 50%, 月額, 日額, 年額, 総額, 金一封, 金100万円
  if (/(?:[\d0-9一二三四五六七八九十百千万億]+(?:円|ドル|元|万|%|％|割)|月額|日額|年額|総額|金[0-9一二三四五六七八九十百千万]+円?)/u.test(t)) {
    return true;
  }

  // 6. Timeframes, deadlines, periods:
  // e.g. 30日以内, 3か月間, 1年間, 15日前
  if (/(?:[\d0-9一二三四五六七八九十百千万]+(?:日|月|年|時間|週間)(?:以内|間|前|後)?)/u.test(t)) {
    return true;
  }

  // 7. Contractual operative conjugated verbs, obligations, conditions, and legal predicates:
  // e.g. 支払う, 支払わなければならない, 負う, 定める, 解除する, とする, てはならない, 請求できる, 効力を有する, 履行する
  if (/(?:支払[いうえお]|負[うい]|義務を|定[める]|解除[すで]|解約[すで]|通知[すで]|請求[すで]|履行[すで]|賠償[すで]|禁止[すで]|とする|てはならない|効力を有する)/u.test(t)) {
    return true;
  }

  return false;
}

export async function parseNumberingDefinitions(zip: any): Promise<NumberingDefinitions> {
  const numFile = zip.file('word/numbering.xml');
  if (!numFile) return { numToAbstract: {}, abstractLevels: {} };
  const numXml = await numFile.async('string');

  const numToAbstract: Record<string, string> = {};
  const numRegex = /<w:num\s+w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId\s+w:val="(\d+)"/g;
  let nM: RegExpExecArray | null;
  while ((nM = numRegex.exec(numXml)) !== null) {
    numToAbstract[nM[1]] = nM[2];
  }

  const abstractLevels: Record<string, Record<number, { numFmt: string; lvlText: string; start: number }>> = {};
  const absRegex = /<w:abstractNum\s+w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g;
  let aM: RegExpExecArray | null;
  while ((aM = absRegex.exec(numXml)) !== null) {
    const absId = aM[1];
    abstractLevels[absId] = {};
    const lvlRegex = /<w:lvl\s+w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g;
    let lM: RegExpExecArray | null;
    while ((lM = lvlRegex.exec(aM[2])) !== null) {
      const ilvl = parseInt(lM[1], 10);
      const lvlBody = lM[2];
      const fmtMatch = lvlBody.match(/<w:numFmt\s+w:val="([^"]+)"/);
      const txtMatch = lvlBody.match(/<w:lvlText\s+w:val="([^"]+)"/);
      const startMatch = lvlBody.match(/<w:start\s+w:val="(\d+)"/);
      abstractLevels[absId][ilvl] = {
        numFmt: fmtMatch ? fmtMatch[1] : 'decimal',
        lvlText: txtMatch ? txtMatch[1] : `%${ilvl + 1}.`,
        start: startMatch ? parseInt(startMatch[1], 10) : 1,
      };
    }
  }
  return { numToAbstract, abstractLevels };
}

export function formatNumber(counter: number, fmt: string): string {
  if (fmt === 'chineseCountingThousand' || fmt === 'chineseCounting') {
    const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
    if (counter < digits.length) return digits[counter];
  }
  return String(counter);
}

export function resolveNumberingPrefix(
  numCounters: Record<string, number[]>,
  numId: string,
  ilvl: number,
  numDefs: NumberingDefinitions
): string {
  if (!numCounters[numId]) numCounters[numId] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  numCounters[numId][ilvl]++;
  for (let l = ilvl + 1; l < 9; l++) numCounters[numId][l] = 0;

  const absId = numDefs.numToAbstract?.[numId];
  const lvlDef = absId ? numDefs.abstractLevels?.[absId]?.[ilvl] : null;

  if (lvlDef && lvlDef.lvlText) {
    let res = lvlDef.lvlText;
    for (let k = 0; k <= ilvl; k++) {
      const kVal = numCounters[numId][k] || 1;
      const kDef = numDefs.abstractLevels?.[absId]?.[k];
      const formatted = formatNumber(kVal, kDef?.numFmt || 'decimal');
      res = res.replace(`%${k + 1}`, formatted);
    }
    return res.trim() + ' ';
  }

  if (ilvl === 0) return `${numCounters[numId][0]}. `;
  if (ilvl === 1) return `${numCounters[numId][0]}.${numCounters[numId][1]} `;
  return `${numCounters[numId][0]}.${numCounters[numId][1]}.${numCounters[numId][2]} `;
}

/**
 * High-fidelity OpenXML parser: extracts native Word paragraph typography, bold, numbering,
 * tables, and creates structured DocumentBlocks (bilingual_pair, key_value_grid, table, paragraph).
 */
export async function parseDocxOpenXml(buffer: Buffer): Promise<ContractClauseNode[]> {
  const zip = await JSZip.loadAsync(buffer);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) return [];

  const docXml = await docXmlFile.async('string');
  const bodyMatch = docXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
  if (!bodyMatch) return [];

  const numDefs = await parseNumberingDefinitions(zip);
  const numCounters: Record<string, number[]> = {};

  const bodyXml = bodyMatch[1];
  const elementRegex = /<(w:p|w:tbl)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let elMatch: RegExpExecArray | null;

  interface RawOpenXmlElement {
    type: 'p' | 'table';
    text: string;
    fullText: string;
    bodyHtml?: string;
    html?: string;
    hasUnderline?: boolean;
    prefix?: string;
    rows?: string[][];
    jc?: string;
    ilvl?: number;
    numId?: string;
    isBold?: boolean;
    isJp?: boolean;
  }

  const rawElements: RawOpenXmlElement[] = [];

  while ((elMatch = elementRegex.exec(bodyXml)) !== null) {
    const tag = elMatch[1];
    const inner = elMatch[2];

    if (tag === 'w:tbl') {
      const rowRegex = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g;
      let rM: RegExpExecArray | null;
      const rows: string[][] = [];
      while ((rM = rowRegex.exec(inner)) !== null) {
        const cellRegex = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g;
        let cM: RegExpExecArray | null;
        const cells: string[] = [];
        while ((cM = cellRegex.exec(rM[1])) !== null) {
          const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
          let tM: RegExpExecArray | null;
          let cellText = '';
          while ((tM = tRegex.exec(cM[1])) !== null) {
            cellText += decodeXmlEntities(tM[1]);
          }
          cells.push(cellText.trim());
        }
        if (cells.some((c) => c.length > 0)) {
          rows.push(cells);
        }
      }
      if (rows.length > 0) {
        rawElements.push({
          type: 'table',
          text: rows.map((r) => r.join(' | ')).join('\n'),
          fullText: rows.map((r) => r.join(' | ')).join('\n'),
          rows,
        });
      }
    } else if (tag === 'w:p') {
      const jcMatch = inner.match(/<w:jc\s+w:val="([^"]+)"/);
      const jc = jcMatch ? jcMatch[1] : undefined;

      const numIdMatch = inner.match(/<w:numId\s+w:val="([^"]+)"/);
      const ilvlMatch = inner.match(/<w:ilvl\s+w:val="([^"]+)"/);
      const numId = numIdMatch ? numIdMatch[1] : undefined;
      const ilvl = ilvlMatch ? parseInt(ilvlMatch[1], 10) : 0;

      let prefix = '';
      if (numId && numId !== '0') {
        prefix = resolveNumberingPrefix(numCounters, numId, ilvl, numDefs);
      }

      interface ParagraphSegment {
        text: string;
        html: string;
        boldCount: number;
        totalRuns: number;
        hasUnderline: boolean;
      }

      const segments: ParagraphSegment[] = [];
      let currentSeg: ParagraphSegment = {
        text: '',
        html: '',
        boldCount: 0,
        totalRuns: 0,
        hasUnderline: false,
      };

      const tokenRegex = /(<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>|<w:br(?:\s[^>]*)?\/?>|<w:cr(?:\s[^>]*)?\/?>)/g;
      let tM: RegExpExecArray | null;

      while ((tM = tokenRegex.exec(inner)) !== null) {
        if (tM[0].startsWith('<w:br') || tM[0].startsWith('<w:cr')) {
          segments.push(currentSeg);
          currentSeg = {
            text: '',
            html: '',
            boldCount: 0,
            totalRuns: 0,
            hasUnderline: false,
          };
          continue;
        }

        const runBody = tM[2];
        const isRunBold = /<w:b(\/|\s[^>]*\/|\s+w:val="(?!0|false|none)[^"]*")>/.test(runBody);
        const isRunUnderline = /<w:u\s+w:val="(?!none)[^"]*"/.test(runBody);
        if (isRunUnderline) currentSeg.hasUnderline = true;

        const innerTokenRegex = /(<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br(?:\s[^>]*)?\/?>|<w:cr(?:\s[^>]*)?\/?>)/g;
        let itM: RegExpExecArray | null;

        while ((itM = innerTokenRegex.exec(runBody)) !== null) {
          if (itM[0].startsWith('<w:br') || itM[0].startsWith('<w:cr')) {
            segments.push(currentSeg);
            currentSeg = {
              text: '',
              html: '',
              boldCount: 0,
              totalRuns: 0,
              hasUnderline: false,
            };
            continue;
          }

          const rawRunText = itM[2];
          const runText = decodeXmlEntities(rawRunText);
          if (runText) {
            currentSeg.totalRuns++;
            currentSeg.text += runText;
            const safe = escapeHtml(runText);
            if (isRunBold) {
              currentSeg.boldCount++;
              currentSeg.html += `<strong>${safe}</strong>`;
            } else {
              currentSeg.html += safe;
            }
          }
        }
      }
      segments.push(currentSeg);

      segments.forEach((seg, sIdx) => {
        const trimmedText = seg.text.trim();
        if (!trimmedText) return;

        const segPrefix = sIdx === 0 ? prefix : '';
        const isBold = seg.totalRuns > 0 && seg.boldCount >= seg.totalRuns * 0.8;
        const fullText = segPrefix ? `${segPrefix}${trimmedText}` : trimmedText;
        const bodyHtml = seg.html.trim();
        const fullHtml = segPrefix ? `<strong>${escapeHtml(segPrefix)}</strong>${bodyHtml}` : bodyHtml;
        const hasJpChars = /[\u3040-\u309F\u30A0-\u30FF]/.test(trimmedText);
        const hasChineseChars = /[\u4e00-\u9fa5]/.test(trimmedText);
        const hasEnOrWestern = !hasChineseChars && /[a-zA-Z]{2,}/.test(trimmedText);
        const isJp = hasJpChars || hasEnOrWestern;

        rawElements.push({
          type: 'p',
          text: trimmedText,
          fullText,
          bodyHtml,
          html: fullHtml,
          hasUnderline: seg.hasUnderline,
          prefix: segPrefix ? segPrefix.trim() : undefined,
          jc,
          ilvl,
          numId: sIdx === 0 ? numId : undefined,
          isBold,
          isJp,
        });
      });
    }
  }

  // Group rawElements into DocumentBlocks and ContractClauseNodes
  const clauses: ContractClauseNode[] = [];
  let currentClause: ContractClauseNode | null = null;
  let clauseIndex = 0;
  let currentChapterNum = '前言';
  let currentChapterTitle = '合同引言与签约主体';

  const pushNewClause = (
    title: string,
    clauseNum: string,
    level: number,
    chNum?: string,
    chTitle?: string
  ) => {
    if (currentClause) {
      if (currentClause.content.trim()) {
        currentClause.content = currentClause.content.trim();
        clauses.push(currentClause);
      } else if (currentClause.titleJa?.trim()) {
        currentClause.content = currentClause.title.trim()
          ? `${currentClause.title.trim()}\n${currentClause.titleJa.trim()}`
          : currentClause.titleJa.trim();
        clauses.push(currentClause);
      } else if (currentClause.title.trim()) {
        currentClause.content = currentClause.title.trim();
        clauses.push(currentClause);
      }
    }
    currentClause = {
      id: `clause-${clauseIndex++}`,
      clauseNumber: clauseNum,
      title,
      content: '',
      blocks: [],
      level,
      chapterNumber: chNum || currentChapterNum,
      chapterTitle: chTitle || currentChapterTitle,
    };
  };

  const articleRegex =
    /^\s*(?:(?:第\s*[一二三四五六七八九十百千万\d]+\s*条)|(?:(?:ARTICLE|CLAUSE)\s+(?:[IVXLCDM\d]+|\d+)\b)|(?:[一二三四五六七八九十百]+[、\s]+)|(?:\d+[.、\s]+(?!\d)))/i;
  const annexRegex = /^(?:附件|附录|付属文書|Exhibit|Schedule|Annex|Appendix)\s*[一二三四五六七八九十\d\w]*/i;
  const chapterRegex =
    /^\s*(?:第\s*[一二三四五六七八九十百千万\d]+\s*[编章节篇部]|(?:CHAPTER|PART|TITLE|SECTION)\s+(?:[IVXLCDM\d]+|[A-Z]|\d+)\b)/i;

  const hasFormalArticles = rawElements.some((el) => {
    if (el.type !== 'p') return false;
    const c = cleanMarkdownFormatting(el.fullText || el.text);
    const isFormalStart =
      /^\s*(?:第\s*[一二三四五六七八九十百千万\d]+\s*条|(?:ARTICLE|CLAUSE)\s+(?:[IVXLCDM\d]+|\d+)\b)/i.test(c);
    return isFormalStart || (articleRegex.test(c) && !/[。！？；]$/.test(c));
  });

  let blockIdx = 1;

  for (let i = 0; i < rawElements.length; i++) {
    const el = rawElements[i];
    const nextEl = rawElements[i + 1];

    if (el.type === 'table') {
      if (!currentClause) pushNewClause('合同引言与主体信息', '前言', 2, '前言', '合同引言与签约主体');
      const isGrid = el.rows && el.rows.every((r) => r.length === 2);
      if (isGrid && el.rows) {
        currentClause!.blocks!.push({
          id: `blk-${blockIdx++}`,
          type: 'key_value_grid',
          metadata: el.rows.map((r) => ({ key: r[0], value: r[1] })),
        });
      } else {
        currentClause!.blocks!.push({
          id: `blk-${blockIdx++}`,
          type: 'table',
          tableData: {
            headers: el.rows && el.rows.length > 0 ? el.rows[0] : [],
            rows: el.rows && el.rows.length > 1 ? el.rows.slice(1) : [],
          },
        });
      }
      currentClause!.content += (currentClause!.content ? '\n\n' : '') + el.text;
      continue;
    }

    // Paragraph
    const cleanText = cleanMarkdownFormatting(el.fullText).trim();
    const isAnnex = annexRegex.test(cleanText) && cleanText.length < 40;
    const isChapter = chapterRegex.test(cleanText) && cleanText.length < 50 && !/[。！？；]$/.test(cleanText);

    // Only top level in Word numbering (ilvl === 0) or unnumbered article headings qualify
    const isFormalArticleStart =
      /^\s*(?:第\s*[一二三四五六七八九十百千万\d]+\s*条|(?:ARTICLE|CLAUSE)\s+(?:[IVXLCDM\d]+|\d+)\b)/i.test(cleanText);
    const isTopLevelNumbered =
      Boolean(el.numId) && el.ilvl === 0 && cleanText.length < 60 && !/[。！？；]$/.test(cleanText);
    const matchesArticleText =
      !el.numId &&
      (isFormalArticleStart || (articleRegex.test(cleanText) && cleanText.length < 60 && !/[。！？；]$/.test(cleanText)));
    const isArticle = !isAnnex && !isChapter && (isTopLevelNumbered || matchesArticleText);

    if (isAnnex) {
      currentChapterNum = '附件';
      currentChapterTitle = cleanText;
      let annexSecondaryText: string | undefined;
      let annexSecondaryHtml: string | undefined;
      if (
        !el.isJp &&
        nextEl &&
        nextEl.type === 'p' &&
        nextEl.isJp &&
        nextEl.fullText.length <= 40 &&
        !annexRegex.test(nextEl.fullText) &&
        !isLikelyClauseBody(nextEl.fullText)
      ) {
        annexSecondaryText = nextEl.fullText;
        annexSecondaryHtml = nextEl.html;
        i++;
      }
      pushNewClause(cleanText, '附件', 1, currentChapterNum, currentChapterTitle);
      if (annexSecondaryText) {
        currentClause!.titleJa = annexSecondaryText.replace(/^[:：\s]+|[:：\s]+$/g, '');
      }
      currentClause!.blocks!.push({
        id: `blk-${blockIdx++}`,
        type: 'heading',
        primaryText: cleanText,
        primaryHtml: el.html,
        secondaryText: annexSecondaryText,
        secondaryHtml: annexSecondaryHtml,
        isBold: true,
      });
      currentClause!.content += cleanText + (annexSecondaryText ? `\n${annexSecondaryText}` : '');
      continue;
    }

    if (isChapter) {
      currentChapterNum = cleanText.split(/\s+/)[0];
      currentChapterTitle = cleanText;
      let chapterSecondaryText: string | undefined;
      let chapterSecondaryHtml: string | undefined;
      if (
        !el.isJp &&
        nextEl &&
        nextEl.type === 'p' &&
        nextEl.isJp &&
        nextEl.fullText.length <= 40 &&
        !chapterRegex.test(nextEl.fullText) &&
        !isLikelyClauseBody(nextEl.fullText)
      ) {
        chapterSecondaryText = nextEl.fullText;
        chapterSecondaryHtml = nextEl.html;
        i++;
      }
      if (!hasFormalArticles) {
        pushNewClause(cleanText, currentChapterNum, 1, currentChapterNum, currentChapterTitle);
        if (chapterSecondaryText) {
          currentClause!.titleJa = chapterSecondaryText.replace(/^[:：\s]+|[:：\s]+$/g, '');
        }
        currentClause!.blocks!.push({
          id: `blk-${blockIdx++}`,
          type: 'heading',
          primaryText: cleanText,
          primaryHtml: el.html,
          secondaryText: chapterSecondaryText,
          secondaryHtml: chapterSecondaryHtml,
          isBold: true,
        });
        currentClause!.content += cleanText + (chapterSecondaryText ? `\n${chapterSecondaryText}` : '');
      }
      continue;
    }

    if (isArticle) {
      let title = cleanText;
      let num = '';
      let inlineBodyText: string | undefined;
      const matchFormal = cleanText.match(
        /^\s*(第\s*[一二三四五六七八九十百千万\d]+\s*条|(?:ARTICLE|CLAUSE)\s+(?:[IVXLCDM\d]+|\d+)\b)\s*(.*)$/i
      );
      const matchNum = cleanText.match(
        /^\s*(\d+[.、\s]+(?!\d)|[一二三四五六七八九十百]+[、\s]+)\s*(.*)$/
      );
      if (matchFormal) {
        num = matchFormal[1].trim();
        const afterNum = matchFormal[2]?.trim() || '';
        const splitColon = afterNum.match(/^(\[[^\]]+\]\s*)?([^:：\n]{1,40}[:：])\s*([\s\S]+)$/);
        if (splitColon) {
          title = ((splitColon[1] || '') + splitColon[2]).trim().replace(/^[:：\s]+|[:：\s]+$/g, '');
          inlineBodyText = splitColon[3].trim();
        } else if (afterNum.length > 50 && /[。！？；]$/.test(afterNum)) {
          const firstSentence = afterNum.match(/^(\[[^\]]+\]\s*)?([^。！？；\n]{1,40}[。！？；\s])\s*([\s\S]+)$/);
          if (firstSentence) {
            title = ((firstSentence[1] || '') + firstSentence[2]).trim().replace(/^[:：\s]+|[:：\s]+$/g, '');
            inlineBodyText = firstSentence[3].trim();
          } else {
            title = afterNum.replace(/^[:：\s]+|[:：\s]+$/g, '') || num;
          }
        } else {
          title = afterNum.replace(/^[:：\s]+|[:：\s]+$/g, '') || num;
        }
      } else if (matchNum) {
        num = matchNum[1].trim();
        title = matchNum[2]?.trim().replace(/^[:：\s]+|[:：\s]+$/g, '') || cleanText;
      } else if (el.prefix) {
        num = el.prefix.trim();
        title = el.text.trim().replace(/^[:：\s]+|[:：\s]+$/g, '') || cleanText;
      } else {
        num = `第 ${clauseIndex} 条`;
        title = cleanText;
      }

      if (currentChapterNum === '前言') {
        currentChapterNum = '正文';
        currentChapterTitle = '合同正文条款';
      }

      let headingSecondaryText: string | undefined;
      let headingSecondaryHtml: string | undefined;
      if (
        !el.isJp &&
        nextEl &&
        nextEl.type === 'p' &&
        nextEl.isJp &&
        nextEl.fullText.length <= 40 &&
        !articleRegex.test(nextEl.fullText) &&
        !isLikelyClauseBody(nextEl.fullText)
      ) {
        headingSecondaryText = nextEl.fullText;
        headingSecondaryHtml = nextEl.html;
        i++; // Consume paired Japanese heading so it is not emitted as a standalone 15px paragraph
      }

      pushNewClause(title, num, 2, currentChapterNum, currentChapterTitle);
      if (headingSecondaryText) {
        currentClause!.titleJa = headingSecondaryText.replace(/^[:：\s]+|[:：\s]+$/g, '');
      }
      currentClause!.blocks!.push({
        id: `blk-${blockIdx++}`,
        type: 'heading',
        primaryText: title,
        primaryHtml: el.html,
        secondaryText: headingSecondaryText,
        secondaryHtml: headingSecondaryHtml,
        isBold: true,
      });
      if (inlineBodyText) {
        currentClause!.blocks!.push({
          id: `blk-${blockIdx++}`,
          type: 'paragraph',
          primaryText: inlineBodyText,
          primaryHtml: escapeHtml(inlineBodyText),
        });
        currentClause!.content += inlineBodyText;
      }
      continue;
    }

    // Bilingual Pair Detection (e.g. Chinese line immediately followed by Japanese line)
    if (!el.isJp && nextEl && nextEl.type === 'p' && nextEl.isJp && !articleRegex.test(nextEl.fullText)) {
      if (!currentClause) pushNewClause('合同引言与主体信息', '前言', 2);
      currentClause!.blocks!.push({
        id: `blk-${blockIdx++}`,
        type: 'bilingual_pair',
        primaryText: el.prefix ? el.text : el.fullText,
        secondaryText: nextEl.prefix ? nextEl.text : nextEl.fullText,
        primaryHtml: el.prefix ? (el.bodyHtml || el.html) : el.html,
        secondaryHtml: nextEl.prefix ? (nextEl.bodyHtml || nextEl.html) : nextEl.html,
        primaryLang: 'zh',
        secondaryLang: 'ja',
        prefix: el.prefix,
        isBold: el.isBold,
        hasUnderline: el.hasUnderline || nextEl.hasUnderline,
      });
      currentClause!.content += (currentClause!.content ? '\n' : '') + `${el.fullText}\n${nextEl.fullText}`;
      i++; // Skip paired Japanese line
      continue;
    }

    // Regular paragraph block
    if (!currentClause) pushNewClause('合同引言与主体信息', '前言', 2);
    currentClause!.blocks!.push({
      id: `blk-${blockIdx++}`,
      type: el.prefix ? 'list_item' : 'paragraph',
      primaryText: el.prefix ? el.text : el.fullText,
      primaryHtml: el.prefix ? (el.bodyHtml || el.html) : el.html,
      prefix: el.prefix,
      isBold: el.isBold,
      hasUnderline: el.hasUnderline,
      alignment: (el.jc as any) || 'left',
    });
    currentClause!.content += (currentClause!.content ? '\n' : '') + el.fullText;
  }

  if (currentClause) {
    const finalClause = currentClause as ContractClauseNode;
    if (finalClause.content.trim()) {
      finalClause.content = finalClause.content.trim();
      clauses.push(finalClause);
    } else if (finalClause.titleJa?.trim()) {
      finalClause.content = finalClause.title.trim()
        ? `${finalClause.title.trim()}\n${finalClause.titleJa.trim()}`
        : finalClause.titleJa.trim();
      clauses.push(finalClause);
    } else if (finalClause.title.trim()) {
      finalClause.content = finalClause.title.trim();
      clauses.push(finalClause);
    }
  }

  // Pre-process preamble metadata consolidating consecutive signature / subject info
  if (clauses.length > 0 && clauses[0].blocks && clauses[0].blocks.length > 0) {
    const consolidatedBlocks: DocumentBlock[] = [];
    let pendingMeta: Array<{ key: string; value: string }> = [];

    for (const b of clauses[0].blocks) {
      if (b.type === 'paragraph' && b.primaryText && /^[甲乙丙丁]方\s*[:：]/.test(b.primaryText)) {
        const parts = b.primaryText.split(/[:：]/);
        pendingMeta.push({ key: parts[0].trim(), value: parts.slice(1).join(':').trim() });
      } else {
        if (pendingMeta.length > 0) {
          consolidatedBlocks.push({
            id: `blk-meta-grid`,
            type: 'key_value_grid',
            metadata: pendingMeta,
          });
          pendingMeta = [];
        }
        consolidatedBlocks.push(b);
      }
    }
    if (pendingMeta.length > 0) {
      consolidatedBlocks.push({
        id: `blk-meta-grid`,
        type: 'key_value_grid',
        metadata: pendingMeta,
      });
    }
    clauses[0].blocks = consolidatedBlocks;
  }

  // Re-index clauses
  clauses.forEach((c, idx) => {
    c.id = `clause-${idx}`;
    if (idx === 0) {
      c.clauseNumber = c.clauseNumber || '前言';
      c.chapterNumber = c.chapterNumber || '前言';
      c.chapterTitle = c.chapterTitle || '合同引言与签约主体';
    } else if (c.title.includes('附件') || c.title.includes('付属文書') || c.clauseNumber?.includes('附件')) {
      c.clauseNumber = '附件';
      c.chapterNumber = c.chapterNumber || '附件';
      c.chapterTitle = c.chapterTitle || '合同附件与补充协议';
    } else {
      if (!c.clauseNumber) {
        c.clauseNumber = `第 ${idx} 条`;
      }
      c.chapterNumber = c.chapterNumber || '正文';
      c.chapterTitle = c.chapterTitle || '合同正文条款';
    }
  });

  // Extract Word comments if available and bind to clauses
  try {
    const { parseDocxComments, bindCommentsToClauses } = await import('./docx-comment-parser.util');
    const comments = await parseDocxComments(zip, docXml);
    if (comments && comments.length > 0) {
      bindCommentsToClauses(comments, clauses);
      (clauses as any).comments = comments;
    }
  } catch {
    // Non-blocking: graceful fallback if comments extraction fails
  }

  return clauses;
}
