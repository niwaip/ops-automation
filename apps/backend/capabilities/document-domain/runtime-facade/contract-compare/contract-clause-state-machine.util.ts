import type { ContractClauseNode, DocumentBlock, TableCellItem } from './contract-compare.types';
import { buildDocumentBlocksFromText } from './contract-text-block-parser.util';
import {
  ANNEX_BOUNDARY_REGEX,
  cleanMarkdownFormatting,
  TIER1_CHAPTER_REGEX,
  TIER2_ARTICLE_REGEX,
} from './contract-clause-segmenter.util';

/**
 * Universal Hierarchical Legal Document State Machine Parser
 * Resolves:
 * 1. Dropped/omitted container articles (e.g. "五、转委托", "七、保密条款")
 * 2. Unification of Level 2 Chinese articles (一、, 二、) and Level 3 numbered items (1., 2.)
 * 3. Prevention of runaway clause splitting on single-line properties (e.g. 1.交货地点：甲方指定)
 * 4. Automatic extraction and reconstruction of signatory & contact info into standard Table blocks
 * 5. Spatial isolation of standalone page numbers (e.g. "1", "2") preventing text contamination
 */

export interface ClauseStateMachineOptions {
  fileName?: string;
  isPdf?: boolean;
}

/**
 * Extract signatory and contact table from text lines if pattern matches
 */
export function extractSignatoryTableBlock(text: string): DocumentBlock | null {
  const clean = text.replace(/[\s\u3000]+/g, '');
  if (!clean.includes('法定代表人') && !clean.includes('授权代表')) return null;
  if (!clean.includes('甲方') && !clean.includes('乙方') && !clean.includes('委托方') && !clean.includes('受托方')) return null;

  // Check if inverted bottom-up text stream (e.g. from some PDF generators)
  const isInverted =
    /乙方[：:]?\s*\n[+\d]/.test(text) ||
    /(?:联系电话|传真|邮政编码)[：:]?\s*\n.*(?:甲方|乙方)/s.test(text);

  if (isInverted) {
    return parseInvertedSignatory(text);
  }
  return parseStandardSignatory(text);
}

function parseInvertedSignatory(text: string): DocumentBlock | null {
  const bIndex = text.indexOf('乙方');
  const partyBSection = bIndex !== -1 ? text.slice(0, bIndex + 30) : '';
  const partyASection = bIndex !== -1 ? text.slice(bIndex) : text;

  const ENTITY_REGEX = /([^\n]+(?:有限公司|有限责任公司|股份有限公司|股份公司|集团公司|合伙企业|企业|事务所|单位|中心))/;
  const partyBMatch = partyBSection.match(ENTITY_REGEX);
  const partyAMatch = partyASection.match(ENTITY_REGEX);

  const partyA = partyAMatch ? partyAMatch[1].trim() : '甲方';
  const partyB = partyBMatch ? partyBMatch[1].trim() : '乙方';

  const addrMatches = [...text.matchAll(/([^\n]+(?:路|街|道|号|大厦|楼|室|区|市|省)[^\n]*)/g)].map((m) => m[1].trim());
  const phones = [...text.matchAll(/(\+?\d{2,4}[-(]?\d{2,4}[-)]?\d{6,8}|\d{3,4}-\d{7,8})/g)].map((m) => m[1]);
  const postcodes = [...text.matchAll(/\b(20\d{4}|\d{6})\b/g)].map((m) => m[1]);

  return {
    id: 'blk-signatory-table',
    type: 'table',
    tableData: {
      headers: ['签署项目', `甲方: ${partyA}`, `乙方: ${partyB}`],
      rows: [
        ['法定代表人或授权代表', '（签字/盖章）', '（签字/盖章）'],
        ['联系地址', addrMatches[1] || addrMatches[0] || '', addrMatches[0] || ''],
        ['邮政编码', postcodes[1] || postcodes[0] || '', postcodes[0] || ''],
        ['联系电话', phones[1] || phones[0] || '', phones[0] || ''],
        ['传真', phones[1] || phones[0] || '', phones[0] || ''],
      ],
    },
  };
}

function appendText(base: string, next: string): string {
  if (!base) return next;
  if (!next) return base;
  const lastChar = base.slice(-1);
  const firstChar = next[0];
  const isCjk =
    /[\u4e00-\u9fa5\u3040-\u30ff\u3000-\u303f\uff00-\uffef]/.test(lastChar) ||
    /[\u4e00-\u9fa5\u3040-\u30ff\u3000-\u303f\uff00-\uffef]/.test(firstChar);
  return isCjk ? base + next : `${base} ${next}`;
}

function parseDualColContinuation(line: string): [string, string] {
  const trimmed = line.trim();
  // 1. Column separation via multiple spaces (>= 2 spaces)
  const multiSpaceParts = trimmed.split(/\s{2,}/);
  if (multiSpaceParts.length >= 2) {
    return [multiSpaceParts[0].trim(), multiSpaceParts.slice(1).join(' ').trim()];
  }
  // 2. Tab
  const tabParts = trimmed.split('\t');
  if (tabParts.length >= 2) {
    return [tabParts[0].trim(), tabParts.slice(1).join(' ').trim()];
  }
  // 3. Fallback: single space
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx !== -1) {
    return [trimmed.slice(0, spaceIdx).trim(), trimmed.slice(spaceIdx + 1).trim()];
  }
  return [trimmed, ''];
}

function parseStandardSignatory(text: string): DocumentBlock | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const FIELD_START_REGEX =
    /^(?:甲\s*方|乙\s*方|委托方|受托方|采购方|供货方|买方|卖方|发包方|承包方|法\s*定\s*代\s*表|联\s*系\s*地\s*址|地\s*址|邮\s*政\s*编\s*码|联\s*系\s*电\s*话|电\s*话|传\s*真|开\s*户\s*行|账\s*号|签\s*字|盖\s*章)/;

  let partyA = '甲方';
  let partyB = '乙方';
  let addrA = '', addrB = '';
  let zipA = '', zipB = '';
  let telA = '', telB = '';
  let faxA = '', faxB = '';
  let unconsumedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cleanL = line.replace(/[\s\u3000]+/g, '');

    // 1. Dual Party Names on same line: e.g. "甲方：上海立山... 乙方：富士通..."
    const dualPartyMatch = line.match(
      /(?:^|\s)(?:甲\s*方|委托方|采购方|买方|发包方|甲方名称)[：:]\s*(.*?)\s*(?:乙\s*方|受托方|供货方|卖方|承包方|乙方名称)[：:]\s*(.*)$/
    );
    if (dualPartyMatch) {
      partyA = dualPartyMatch[1].trim();
      partyB = dualPartyMatch[2].trim();
      unconsumedLines = [];
      while (i + 1 < lines.length && !FIELD_START_REGEX.test(lines[i + 1])) {
        const nextLine = lines[i + 1];
        const [contA, contB] = parseDualColContinuation(nextLine);
        if (contA) {
          partyA = partyA.endsWith('有限公') && contA === '司' ? partyA + '司' : `${partyA}${contA}`;
        }
        if (contB) {
          partyB = partyB.endsWith('有限公') && contB === '司' ? partyB + '司' : `${partyB}${contB}`;
        }
        i++;
      }
      continue;
    }

    // Single Party A on line
    if (
      cleanL.startsWith('甲方：') ||
      cleanL.startsWith('甲方:') ||
      cleanL.startsWith('委托方：') ||
      cleanL.startsWith('委托方:')
    ) {
      partyA = line.replace(/^(?:甲\s*方|委托方|采购方|买方)[：:]\s*/, '').trim();
      unconsumedLines = [];
      while (i + 1 < lines.length && !FIELD_START_REGEX.test(lines[i + 1])) {
        partyA += lines[i + 1].trim();
        i++;
      }
      continue;
    }

    // Single Party B on line
    if (
      cleanL.startsWith('乙方：') ||
      cleanL.startsWith('乙方:') ||
      cleanL.startsWith('受托方：') ||
      cleanL.startsWith('受托方:')
    ) {
      partyB = line.replace(/^(?:乙\s*方|受托方|供货方|卖方)[：:]\s*/, '').trim();
      unconsumedLines = [];
      while (i + 1 < lines.length && !FIELD_START_REGEX.test(lines[i + 1])) {
        partyB += lines[i + 1].trim();
        i++;
      }
      continue;
    }

    // 2. Addresses
    if (cleanL.includes('联系地址') || cleanL.includes('地址')) {
      const parts = line.split(/(?:联系地址|地址)[：:]\s*/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        addrA = parts[0];
        addrB = parts[1];
      } else if (parts.length === 1) {
        if (!addrA) {
          addrA = parts[0];
        } else {
          addrB = parts[0];
        }
      } else {
        // Label line had no values (e.g. "联系地址：  联系地址：")
        // Check if immediately preceding unconsumed line was an address prefix:
        if (unconsumedLines.length > 0) {
          const prev = unconsumedLines.pop()!;
          const [prevA, prevB] = parseDualColContinuation(prev);
          addrA = prevA;
          addrB = prevB;
        }
      }

      // Consume continuation lines following 联系地址
      while (i + 1 < lines.length && !FIELD_START_REGEX.test(lines[i + 1])) {
        const nextLine = lines[i + 1];
        const [contA, contB] = parseDualColContinuation(nextLine);
        if (contA) {
          addrA = appendText(addrA, contA);
        }
        if (contB) {
          addrB = appendText(addrB, contB);
        }
        i++;
      }
      unconsumedLines = [];
      continue;
    }

    // 3. Zipcode
    if (cleanL.includes('邮政编码')) {
      const parts = line.split(/邮政编码[：:]\s*/).map((p) => p.replace(/\s+/g, '').trim());
      const nonEmpties = parts.filter(Boolean);
      if (parts.length > 2) {
        zipA = parts[1] || '';
        zipB = parts[2] || nonEmpties[0] || '';
      } else {
        zipA = nonEmpties[0] || '';
        zipB = nonEmpties[1] || '';
      }
      unconsumedLines = [];
      continue;
    }

    // 4. Telephone
    if (cleanL.includes('联系电话') || cleanL.includes('电话')) {
      const parts = line.split(/(?:联系电话|电话)[：:]\s*/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        telA = parts[0];
        telB = parts[1];
      } else if (parts.length === 1) {
        if (!telA) telA = parts[0];
        else telB = parts[0];
      }
      unconsumedLines = [];
      continue;
    }

    // 5. Fax
    if (cleanL.includes('传真')) {
      const parts = line.split(/传真[：:]\s*/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        faxA = parts[0];
        faxB = parts[1];
      } else if (parts.length === 1) {
        if (!faxA) faxA = parts[0];
        else faxB = parts[0];
      }
      unconsumedLines = [];
      continue;
    }

    // Fallback unconsumed line (e.g. line 3 address top half between 授权代表 and 联系地址)
    if (FIELD_START_REGEX.test(line)) {
      unconsumedLines = [];
    } else {
      unconsumedLines.push(line);
    }
  }

  // Clean trailing punctuation or leading duplicates
  const cleanPartyA = partyA ? `甲方: ${partyA.replace(/^(?:甲\s*方|委托方)[：:\s]*/, '')}` : '甲方信息';
  const cleanPartyB = partyB ? `乙方: ${partyB.replace(/^(?:乙\s*方|受托方)[：:\s]*/, '')}` : '乙方信息';

  return {
    id: 'blk-signatory-table',
    type: 'table',
    tableData: {
      headers: ['签署项目', cleanPartyA, cleanPartyB],
      rows: [
        ['法定代表人或授权代表', '（签字/盖章）', '（签字/盖章）'],
        ['联系地址', addrA, addrB],
        ['邮政编码', zipA, zipB],
        ['联系电话', telA, telB],
        ['传真', faxA, faxB],
      ],
    },
  };
}

/**
 * Filter isolated page numbers and artifacts from extracted page text
 */
export function sanitizeDocumentLines(text: string): string[] {
  const rawLines = text.split(/\r?\n/);
  return rawLines
    .map((l) => l.trim())
    .filter((l) => {
      if (l.length === 0) return false;
      // Strip page boundaries
      if (/^--- PAGE \d+ ---$/i.test(l)) return false;
      // Strip standalone page numbers: e.g. "1", "2", "3", "4"
      if (/^\d{1,3}$/.test(l)) return false;
      // Strip standard page footers: e.g. "- 1 -", "第 1 页", "Page 1 of 5"
      if (/^[-—]\s*\d{1,3}\s*[-—]$/.test(l) || /^第\s*\d{1,3}\s*页(?:\s*[/共]\s*\d{1,3}\s*页)?$/i.test(l)) {
        return false;
      }
      return true;
    });
}

/**
 * Parse contract text into hierarchical clause nodes using a robust legal grammar state machine
 */
export function parseContractTextWithStateMachine(
  text: string,
  options?: ClauseStateMachineOptions
): ContractClauseNode[] {
  const lines = sanitizeDocumentLines(text);
  if (lines.length === 0) return [];

  const clauses: ContractClauseNode[] = [];
  let currentClause: ContractClauseNode | null = null;
  let clauseIndex = 0;
  let currentDivisionNum = '前言';
  let currentDivisionTitle = '合同引言与签约主体';

  // Check if document has Chinese article numbering (一、 二、 ...)
  const hasChineseArticles = lines.some((l) =>
    /^\s*[一二三四五六七八九十百]+[、\s]/.test(cleanMarkdownFormatting(l))
  );

  const commitCurrentClause = () => {
    if (!currentClause) return;

    // Retain title as content if content is completely empty
    if (!currentClause.content.trim() && currentClause.title.trim()) {
      currentClause.content = currentClause.title.trim();
    }

    const isPreamble = currentClause.clauseNumber === '前言' || currentClause.chapterNumber === '前言';

    // Check if this clause contains signatory information at the end or as a whole
    const sigIndex = currentClause.content.search(/(?:^|\n)\s*(?:甲\s*方|委托方|受托方)[：:\s]/);
    if (sigIndex !== -1) {
      const precedingText = currentClause.content.slice(0, sigIndex).trim();
      const signatoryText = currentClause.content.slice(sigIndex).trim();
      const signatoryTable = extractSignatoryTableBlock(signatoryText);
      if (signatoryTable) {
        if (precedingText) {
          const parsed = buildDocumentBlocksFromText(precedingText, isPreamble);
          currentClause.content = parsed.content || precedingText;
          currentClause.blocks = parsed.blocks;
          clauses.push(currentClause);

          clauses.push({
            id: `clause-${clauseIndex++}`,
            clauseNumber: '落款',
            title: '双方签署与联系信息',
            chapterNumber: '落款',
            chapterTitle: '合同签署与联系信息',
            level: 2,
            content: `| 签署项目 | 甲方信息 | 乙方信息 |\n| --- | --- | --- |\n${(
              signatoryTable.tableData?.rows || []
            )
              .map((r) => `| ${r.map((c) => (typeof c === 'string' ? c : c?.text || '')).join(' | ')} |`)
              .join('\n')}`,
            blocks: [signatoryTable],
          });
          currentClause = null;
          return;
        } else {
          currentClause.clauseNumber = '落款';
          currentClause.title = '双方签署与联系信息';
          currentClause.chapterNumber = '落款';
          currentClause.chapterTitle = '合同签署与联系信息';
          currentClause.blocks = [signatoryTable];
          currentClause.content = `| 签署项目 | 甲方信息 | 乙方信息 |\n| --- | --- | --- |\n${(
            signatoryTable.tableData?.rows || []
          )
            .map((r) => `| ${r.map((c) => (typeof c === 'string' ? c : c?.text || '')).join(' | ')} |`)
            .join('\n')}`;
          clauses.push(currentClause);
          currentClause = null;
          return;
        }
      }
    }

    // Direct whole-clause signatory check (if sigIndex wasn't matched above)
    const wholeSignatoryTable = extractSignatoryTableBlock(currentClause.content);
    if (wholeSignatoryTable) {
      currentClause.clauseNumber = '落款';
      currentClause.title = '双方签署与联系信息';
      currentClause.chapterNumber = '落款';
      currentClause.chapterTitle = '合同签署与联系信息';
      currentClause.blocks = [wholeSignatoryTable];
      currentClause.content = `| 签署项目 | 甲方信息 | 乙方信息 |\n| --- | --- | --- |\n${(
        wholeSignatoryTable.tableData?.rows || []
      )
        .map((r) => `| ${r.map((c) => (typeof c === 'string' ? c : c?.text || '')).join(' | ')} |`)
        .join('\n')}`;
      clauses.push(currentClause);
      currentClause = null;
      return;
    }

    const parsed = buildDocumentBlocksFromText(currentClause.content, isPreamble);
    currentClause.content = parsed.content || currentClause.content.trim();
    currentClause.blocks = parsed.blocks;

    clauses.push(currentClause);
    currentClause = null;
  };

  const startNewClause = (
    title: string,
    clauseNum: string,
    level: number,
    chNum?: string,
    chTitle?: string
  ) => {
    commitCurrentClause();
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
    const cleanLine = cleanMarkdownFormatting(line);

    // 1. Annex / Division Detection (e.g. 附件一：反腐败规定, 附件二：规格书)
    const isAnnex = ANNEX_BOUNDARY_REGEX.test(cleanLine) && cleanLine.length < 35;
    if (isAnnex) {
      const annexNum = cleanLine.replace(/[:：\s]+$/, '');
      let annexTitle = annexNum;
      const nextLine = lines[i + 1];
      if (nextLine) {
        const cleanNext = cleanMarkdownFormatting(nextLine);
        if (cleanNext && cleanNext.length < 35 && !TIER2_ARTICLE_REGEX.test(cleanNext) && !/^\d+[.、]/.test(cleanNext)) {
          annexTitle += ' ' + cleanNext.replace(/[:：\s]+$/, '');
          i++;
        }
      }
      currentDivisionNum = annexNum;
      currentDivisionTitle = annexTitle;
      startNewClause(annexTitle, annexNum, 1, annexNum, annexTitle);
      continue;
    }

    // 2. Tier 1 Chapter Detection (e.g. 第一章 总则, CHAPTER 1)
    if (TIER1_CHAPTER_REGEX.test(cleanLine)) {
      const chNum = cleanLine.split(/\s+/)[0];
      currentDivisionNum = chNum;
      currentDivisionTitle = cleanLine;
      startNewClause(cleanLine, chNum, 1, chNum, cleanLine);
      continue;
    }

    // 3. Main Article (Tier 2) Detection
    // When hasChineseArticles is true: ONLY Chinese numbered articles (一、 二、) or formal "第X条" are main articles!
    const isChineseMainArticle = /^\s*([一二三四五六七八九十百]+)[、\s]+(.*)$/.test(cleanLine);
    const isFormalArticle = TIER2_ARTICLE_REGEX.test(cleanLine);

    const isMainArticle = hasChineseArticles
      ? isChineseMainArticle || isFormalArticle
      : isFormalArticle ||
        (/^\s*(?:\d+)[.、\s]+(?!\d)/i.test(cleanLine) &&
          cleanLine.length < 50 &&
          !/[。！？；]$/.test(cleanLine));

    if (isMainArticle) {
      if (currentDivisionNum === '前言') {
        currentDivisionNum = '正文';
        currentDivisionTitle = '合同正文条款';
      }

      let heading = cleanLine.replace(/[:：\s]+$/, '');
      const matchChinese = heading.match(/^\s*([一二三四五六七八九十百]+[、\s]+)(.*)$/);
      const matchArt = heading.match(
        /^\s*(第\s*[一二三四五六七八九十百千万\d]+\s*条|(?:ARTICLE|CLAUSE)\s+(?:[IVXLCDM\d]+|\d+)\b)\s*(.*)$/i
      );
      const matchNum = heading.match(/^\s*(\d+[.、\s]+(?!\d))\s*(.*)$/);

      let cNum = `第 ${clauseIndex} 条`;
      let cleanTitle = heading;

      if (matchChinese) {
        cNum = matchChinese[1].trim();
        cleanTitle = matchChinese[2]?.trim().replace(/^[:：\s]+|[:：\s]+$/g, '') || heading;
      } else if (matchArt) {
        cNum = matchArt[1].replace(/\s+/g, '');
        cleanTitle = matchArt[2]?.trim().replace(/^[:：\s]+|[:：\s]+$/g, '') || matchArt[1].trim();
      } else if (matchNum) {
        cNum = matchNum[1].trim();
        cleanTitle = matchNum[2]?.trim().replace(/^[:：\s]+|[:：\s]+$/g, '') || heading;
      }

      startNewClause(cleanTitle, cNum, 2, currentDivisionNum, currentDivisionTitle);
      continue;
    }

    // 4. Content lines (including sub-items: 1. 2., paragraphs, date lines, etc.)
    if (!currentClause) {
      startNewClause('合同引言与主体信息', '前言', 2, '前言', '合同引言与签约主体');
    }
    currentClause!.content += (currentClause!.content ? '\n' : '') + line;
  }

  commitCurrentClause();
  return clauses;
}
