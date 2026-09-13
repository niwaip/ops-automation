import * as JSZip from 'jszip';
import type { ContractClauseNode, DocumentBlock } from './contract-compare.types';

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

      const runRegex = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
      let rM: RegExpExecArray | null;
      let pText = '';
      let pHtml = '';
      let hasUnderline = false;
      let boldCount = 0;
      let totalRuns = 0;

      while ((rM = runRegex.exec(inner)) !== null) {
        const runBody = rM[1];
        const isRunBold = /<w:b(\/|\s[^>]*\/|\s+w:val="(?!0|false|none)[^"]*")>/.test(runBody);
        const isRunUnderline = /<w:u\s+w:val="(?!none)[^"]*"/.test(runBody);
        if (isRunUnderline) hasUnderline = true;

        const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
        let tM: RegExpExecArray | null;
        let runText = '';
        while ((tM = tRegex.exec(runBody)) !== null) {
          runText += decodeXmlEntities(tM[1]);
        }

        if (runText) {
          totalRuns++;
          pText += runText;
          const safe = escapeHtml(runText);
          if (isRunBold) {
            boldCount++;
            pHtml += `<strong>${safe}</strong>`;
          } else {
            pHtml += safe;
          }
        }
      }

      const trimmedText = pText.trim();
      if (trimmedText) {
        const isBold = totalRuns > 0 && boldCount >= totalRuns * 0.8;
        const fullText = prefix ? `${prefix}${trimmedText}` : trimmedText;
        const fullHtml = prefix ? `<strong>${escapeHtml(prefix)}</strong>${pHtml.trim()}` : pHtml.trim();
        const isJp = /[\u3040-\u309F\u30A0-\u30FF]/.test(trimmedText);

        rawElements.push({
          type: 'p',
          text: trimmedText,
          fullText,
          html: fullHtml,
          hasUnderline,
          prefix: prefix ? prefix.trim() : undefined,
          jc,
          ilvl,
          numId,
          isBold,
          isJp,
        });
      }
    }
  }

  // Group rawElements into DocumentBlocks and ContractClauseNodes
  const clauses: ContractClauseNode[] = [];
  let currentClause: ContractClauseNode | null = null;
  let clauseIndex = 0;

  const pushNewClause = (title: string, clauseNum: string, level: number) => {
    if (currentClause && (currentClause.content.trim() || (currentClause.blocks && currentClause.blocks.length > 0))) {
      currentClause.content = currentClause.content.trim();
      clauses.push(currentClause);
    }
    currentClause = {
      id: `clause-${clauseIndex++}`,
      clauseNumber: clauseNum,
      title,
      content: '',
      blocks: [],
      level,
    };
  };

  const articleRegex = /^\s*(?:第\s*[一二三四五六七八九十百千万\d]+\s*条|(?:ARTICLE|CLAUSE)\s+(?:[IVXLCDM\d]+|\d+)\b)/i;
  const annexRegex = /^(?:附件|附录|付属文書|Exhibit|Schedule|Annex|Appendix)\s*[一二三四五六七八九十\d\w]*/i;

  let blockIdx = 1;

  for (let i = 0; i < rawElements.length; i++) {
    const el = rawElements[i];
    const nextEl = rawElements[i + 1];

    if (el.type === 'table') {
      if (!currentClause) pushNewClause('合同引言与主体信息', '前言', 2);
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
    const cleanText = el.fullText;
    const isAnnex = annexRegex.test(cleanText) && cleanText.length < 40;
    const isArticle = articleRegex.test(cleanText) || (el.prefix && /^\d+(\.\d+)*\s*$/.test(el.prefix) && el.isBold && cleanText.length < 60);

    if (isAnnex) {
      pushNewClause(cleanText, '附件', 1);
      currentClause!.blocks!.push({
        id: `blk-${blockIdx++}`,
        type: 'heading',
        primaryText: cleanText,
        primaryHtml: el.html,
        isBold: true,
      });
      currentClause!.content += cleanText;
      continue;
    }

    if (isArticle) {
      let title = cleanText;
      let num = `第 ${clauseIndex} 条`;
      const match = cleanText.match(articleRegex);
      if (match) {
        num = match[0].trim();
        title = cleanText.slice(match[0].length).trim() || num;
      }
      pushNewClause(title, num, 2);
      currentClause!.blocks!.push({
        id: `blk-${blockIdx++}`,
        type: 'heading',
        primaryText: cleanText,
        primaryHtml: el.html,
        isBold: true,
      });
      currentClause!.content += cleanText;
      continue;
    }

    // Bilingual Pair Detection (e.g. Chinese line immediately followed by Japanese line)
    if (!el.isJp && nextEl && nextEl.type === 'p' && nextEl.isJp && !articleRegex.test(nextEl.fullText)) {
      if (!currentClause) pushNewClause('合同引言与主体信息', '前言', 2);
      currentClause!.blocks!.push({
        id: `blk-${blockIdx++}`,
        type: 'bilingual_pair',
        primaryText: el.fullText,
        secondaryText: nextEl.fullText,
        primaryHtml: el.html,
        secondaryHtml: nextEl.html,
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
      primaryText: el.fullText,
      primaryHtml: el.html,
      prefix: el.prefix,
      isBold: el.isBold,
      hasUnderline: el.hasUnderline,
      alignment: (el.jc as any) || 'left',
    });
    currentClause!.content += (currentClause!.content ? '\n' : '') + el.fullText;
  }

  if (currentClause) {
    const finalClause = currentClause as ContractClauseNode;
    if (finalClause.content.trim() || (finalClause.blocks && finalClause.blocks.length > 0)) {
      finalClause.content = finalClause.content.trim();
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
    if (idx === 0) c.clauseNumber = '前言';
    else if (c.title.includes('附件') || c.title.includes('付属文書')) c.clauseNumber = '附件';
    else c.clauseNumber = `第 ${idx} 条`;
  });

  return clauses;
}
