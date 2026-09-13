import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';
import * as JSZip from 'jszip';
import type { ContractClauseNode, DocumentBlock } from './contract-compare.types';
import { PdfContentExtractorService } from '../content-extraction/pdf-content-extractor.service';
import { buildDocumentBlocksFromText } from './contract-text-block-parser.util';

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(current, 'pnpm-lock.yaml')) || fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir;
}

const WORKSPACE_ROOT = process.env.PROJECT_ROOT || findWorkspaceRoot(process.cwd());

interface NumberingDefinitions {
  numToAbstract: Record<string, string>;
  abstractLevels: Record<string, Record<number, { numFmt: string; lvlText: string; start: number }>>;
}

@Injectable()
export class ContractAstParserService {
  private readonly logger = new Logger(ContractAstParserService.name);

  constructor(
    private readonly pdfExtractor: PdfContentExtractorService = new PdfContentExtractorService()
  ) {}

  // Universal Legal Document Numbering Grammars (Language-neutral, structure-driven)
  private readonly TIER1_CHAPTER_REGEX =
    /^\s*(?:第\s*[一二三四五六七八九十百千万\d]+\s*[编章节篇部]|[一二三四五六七八九十]+\s*[、\s]+\s*[^\n]{2,30}$|(?:CHAPTER|PART|TITLE|SECTION)\s+(?:[IVXLCDM\d]+|[A-Z]|\d+)\b)/i;

  private readonly TIER2_ARTICLE_REGEX =
    /^\s*(?:第\s*[一二三四五六七八九十百千万\d]+\s*条|(?:ARTICLE|CLAUSE)\s+(?:[IVXLCDM\d]+|\d+)\b)/i;

  private readonly ANNEX_BOUNDARY_REGEX =
    /^(?:附件|附录|付属文書|Exhibit|Schedule|Annex|Appendix)\s*[一二三四五六七八九十\d\w]*/i;

  /**
   * Helper: strip markdown headers, bold/italic, and bullet markers to expose bare legal text
   */
  public cleanMarkdownFormatting(text: string): string {
    if (!text) return '';
    return text
      .replace(/^#{1,6}\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/^[\*\-]\s+/, '')
      .trim();
  }

  /**
   * Main entry: parse input (base64, file or text) to structured Clause AST Nodes
   */
  public async parseToAst(input: {
    base64?: string;
    fileName?: string;
    text?: string;
  }): Promise<ContractClauseNode[]> {
    // 1. Authoritative binary base64 takes precedence over text (e.g. uploaded docx/doc/pdf)
    if (input.base64 && input.base64.trim()) {
      const buffer = Buffer.from(input.base64, 'base64');
      const isDocx =
        input.fileName?.toLowerCase().endsWith('.docx') ||
        (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b); // PK zip magic header
      const isPdf =
        input.fileName?.toLowerCase().endsWith('.pdf') ||
        (buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46); // %PDF

      if (isDocx) {
        try {
          const openXmlClauses = await this.parseDocxOpenXml(buffer);
          if (openXmlClauses && openXmlClauses.length > 0) {
            return openXmlClauses;
          }
        } catch (err) {
          this.logger.warn(`OpenXML direct parsing failed, falling back to Mammoth: ${(err as Error).message}`);
        }

        try {
          const { value: html } = await mammoth.convertToHtml({ buffer });
          return this.parseHtmlToClauses(html);
        } catch (err) {
          this.logger.warn(`Mammoth docx html extraction failed, falling back to raw text: ${(err as Error).message}`);
          try {
            const raw = await mammoth.extractRawText({ buffer });
            return this.parseTextToClauses(raw.value || '');
          } catch {
            return this.parseTextToClauses(buffer.toString('utf8'));
          }
        }
      } else if (isPdf) {
        try {
          const extraction = await this.pdfExtractor.extract({
            fileBase64: input.base64,
            fileName: input.fileName || 'contract.pdf',
          });
          if (extraction?.text && extraction.text.trim()) {
            return this.parseTextToClauses(extraction.text);
          }
        } catch (err) {
          this.logger.warn(`PDF extraction failed: ${(err as Error).message}`);
        }
        return [];
      } else {
        return this.parseTextToClauses(buffer.toString('utf8'));
      }
    } else if (input.text && input.text.trim()) {
      const trimmed = input.text.trim();
      const isFileNameCandidate =
        trimmed.length < 150 &&
        !trimmed.includes('\n') &&
        (trimmed === input.fileName || /\.(docx?|pdf|txt|md)$/i.test(trimmed));

      if (isFileNameCandidate) {
        const resolvedPath = this.resolveFileOnDisk(trimmed);
        if (resolvedPath && fs.existsSync(resolvedPath)) {
          try {
            const buffer = await fs.promises.readFile(resolvedPath);
            const isDocx =
              resolvedPath.toLowerCase().endsWith('.docx') ||
              (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b);
            const isPdf =
              resolvedPath.toLowerCase().endsWith('.pdf') ||
              (buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46);
            if (isDocx) {
              try {
                const openXmlClauses = await this.parseDocxOpenXml(buffer);
                if (openXmlClauses && openXmlClauses.length > 0) {
                  return openXmlClauses;
                }
              } catch (err) {
                this.logger.warn(`OpenXML direct parsing failed for ${resolvedPath}: ${(err as Error).message}`);
              }
              const { value: html } = await mammoth.convertToHtml({ buffer });
              return this.parseHtmlToClauses(html);
            } else if (isPdf) {
              try {
                const extraction = await this.pdfExtractor.extract({
                  fileBase64: buffer.toString('base64'),
                  fileName: path.basename(resolvedPath),
                });
                if (extraction?.text && extraction.text.trim()) {
                  return this.parseTextToClauses(extraction.text);
                }
              } catch (err) {
                this.logger.warn(`PDF candidate extraction failed for ${resolvedPath}: ${(err as Error).message}`);
              }
              return [];
            } else {
              return this.parseTextToClauses(buffer.toString('utf8'));
            }
          } catch (err) {
            this.logger.warn(`Failed reading candidate file ${resolvedPath}: ${(err as Error).message}`);
          }
        }
      }

      return this.parseTextToClauses(trimmed);
    }

    return [];
  }

  /**
   * Helper: try to locate a file on disk by name or relative path
   */
  private resolveFileOnDisk(filename: string): string | null {
    const outputsDir =
      process.env.OUTPUTS_DIR ||
      path.resolve(WORKSPACE_ROOT, 'apps', 'backend', 'var', 'outputs', 'document-engine');
    const searchCandidates = [
      path.resolve(process.cwd(), filename),
      path.resolve(WORKSPACE_ROOT, filename),
      path.resolve(outputsDir, filename),
      path.resolve(outputsDir, `${filename}.docx`),
      path.resolve(outputsDir, `${filename}.pdf`),
      path.resolve(outputsDir, 'renders', filename),
      path.resolve(outputsDir, 'renders', `${filename}.docx`),
      path.resolve(WORKSPACE_ROOT, 'tests', 'contract', filename),
      path.resolve(WORKSPACE_ROOT, 'apps', 'backend', 'intelligence', 'ai-orchestrator', 'data', 'storage', 'uploads', filename),
    ];

    for (const candidate of searchCandidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    if (fs.existsSync(outputsDir)) {
      try {
        const files = fs.readdirSync(outputsDir);
        const match = files.find((f) => f.includes(filename) || f.endsWith(`-${filename}`));
        if (match) {
          return path.join(outputsDir, match);
        }
      } catch {
        // ignore
      }
    }

    // Check uploads dir for prefix matching (e.g. file-xxxx-contract_v1_baseline.docx)
    const uploadsDir = path.resolve(WORKSPACE_ROOT, 'apps', 'backend', 'intelligence', 'ai-orchestrator', 'data', 'storage', 'uploads');
    if (fs.existsSync(uploadsDir)) {
      try {
        const files = fs.readdirSync(uploadsDir);
        const match = files.find((f) => f.endsWith(`-${filename}`) || f === filename);
        if (match) {
          return path.join(uploadsDir, match);
        }
      } catch {
        // ignore
      }
    }

    return null;
  }

  /**
   * Industry-standard DOM-aware parser: converts Mammoth HTML into a faithful Legal Clause AST
   * Preserves tables as atomic blocks and respects native heading/list hierarchy.
   */
  public parseHtmlToClauses(html: string): ContractClauseNode[] {
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
      this.TIER2_ARTICLE_REGEX.test(this.cleanMarkdownFormatting(it.text))
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
      const isAnnexNumber = this.ANNEX_BOUNDARY_REGEX.test(it.text) && it.text.length < 30;
      const isConsecutiveAnnexRef =
        isAnnexNumber &&
        ((next && this.ANNEX_BOUNDARY_REGEX.test(next.text)) ||
          (next2 && this.ANNEX_BOUNDARY_REGEX.test(next2.text)));

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
      const isTier1 = this.TIER1_CHAPTER_REGEX.test(it.text);
      if (isTier1) {
        const chNum = it.text.split(/\s+/)[0];
        currentDivisionNum = chNum;
        currentDivisionTitle = it.text;
        pushClause(it.text, chNum, 1, chNum, it.text);
        continue;
      }

      // 4. Tier 2 Article / Clause detection
      const cleanItText = this.cleanMarkdownFormatting(it.text);
      const isNumberedArticle = hasFormalArticles
        ? this.TIER2_ARTICLE_REGEX.test(cleanItText)
        : this.TIER2_ARTICLE_REGEX.test(cleanItText) ||
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
   * Parse structured contract text into hierarchical Clause Nodes with Chapter awareness
   */
  public parseTextToClauses(text: string): ContractClauseNode[] {
    const rawLines = text.split(/\r?\n/);
    const lines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return [];

    const hasFormalArticles = lines.some((l) =>
      this.TIER2_ARTICLE_REGEX.test(this.cleanMarkdownFormatting(l))
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

      // Normalize markdown heading and formatting
      let cleanLine = this.cleanMarkdownFormatting(line);

      // Annex / Division
      const isAnnex = this.ANNEX_BOUNDARY_REGEX.test(cleanLine) && cleanLine.length < 30;
      if (isAnnex) {
        const annexNum = cleanLine.replace(/[:：\s]+$/, '');
        let annexTitle = annexNum;
        const cleanNext = this.cleanMarkdownFormatting(nextLine);
        if (cleanNext && cleanNext.length < 35 && !this.TIER2_ARTICLE_REGEX.test(cleanNext)) {
          annexTitle += ' ' + cleanNext.replace(/[:：\s]+$/, '');
          i++;
        }
        currentDivisionNum = annexNum;
        currentDivisionTitle = annexTitle;
        pushClause(annexTitle, annexNum, 1, annexNum, annexTitle);
        continue;
      }

      // Tier 1 Chapter
      const isTier1 = this.TIER1_CHAPTER_REGEX.test(cleanLine);
      if (isTier1) {
        const chNum = cleanLine.split(/\s+/)[0];
        currentDivisionNum = chNum;
        currentDivisionTitle = cleanLine;
        continue;
      }

      // Tier 2 Article
      const isNumberedArticle = hasFormalArticles
        ? this.TIER2_ARTICLE_REGEX.test(cleanLine)
        : this.TIER2_ARTICLE_REGEX.test(cleanLine) ||
          (/^\s*(?:\d+(\.\d+)+)[\.、\s]+[^\d\s]/i.test(cleanLine) &&
            cleanLine.length < 45 &&
            !/[。！？；]$/.test(cleanLine));

      if (isNumberedArticle) {
        if (currentDivisionNum === '前言') {
          currentDivisionNum = '正文';
          currentDivisionTitle = '合同正文条款';
        }
        let heading = cleanLine.replace(/[:：\s]+$/, '');
        const cleanNext = this.cleanMarkdownFormatting(nextLine);
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
      return this.fallbackParagraphChunking(text);
    }

    return clauses;
  }

  /**
   * Fallback chunking: group into substantial logical blocks instead of single-line fragments
   */
  private fallbackParagraphChunking(text: string): ContractClauseNode[] {
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

  private async parseNumberingDefinitions(zip: any): Promise<NumberingDefinitions> {
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

  private formatNumber(counter: number, fmt: string): string {
    if (fmt === 'chineseCountingThousand' || fmt === 'chineseCounting') {
      const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
      if (counter < digits.length) return digits[counter];
    }
    return String(counter);
  }

  private resolveNumberingPrefix(
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
        const formatted = this.formatNumber(kVal, kDef?.numFmt || 'decimal');
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
  public async parseDocxOpenXml(buffer: Buffer): Promise<ContractClauseNode[]> {
    const zip = await JSZip.loadAsync(buffer);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) return [];

    const docXml = await docXmlFile.async('string');
    const bodyMatch = docXml.match(/<w:body>([\s\S]*?)<\/w:body>/);
    if (!bodyMatch) return [];

    const numDefs = await this.parseNumberingDefinitions(zip);
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
              cellText += this.decodeXmlEntities(tM[1]);
            }
            cells.push(cellText.trim());
          }
          if (cells.some((c) => c.length > 0)) rows.push(cells);
        }
        if (rows.length > 0) {
          rawElements.push({ type: 'table', text: '[表格数据]', fullText: '[表格数据]', rows });
        }
      } else {
        const rRegex = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
        let rM: RegExpExecArray | null;
        let text = '';
        let html = '';
        let hasUnderline = false;
        let hasBold = false;

        while ((rM = rRegex.exec(inner)) !== null) {
          const rInner = rM[1];
          const isU = /<w:u(?:\s|\/|>)/.test(rInner);
          const isB = /<w:b(?:\s|\/|>)/.test(rInner);
          const hasTab = /<w:tab(?:\s|\/|>)/.test(rInner);
          const hasBr = /<w:br(?:\s|\/|>)/.test(rInner);
          const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
          let tM: RegExpExecArray | null;
          let rText = '';
          while ((tM = tRegex.exec(rInner)) !== null) {
            rText += this.decodeXmlEntities(tM[1]);
          }

          if (hasTab) {
            text += '    ';
            html += '&nbsp;&nbsp;&nbsp;&nbsp;';
          }
          if (hasBr) {
            text += '\n';
            html += '<br/>';
          }

          if (!rText) continue;

          text += rText;
          if (isU) hasUnderline = true;
          if (isB) hasBold = true;

          const escaped = this.escapeHtml(rText);
          if (isU) {
            const isBlankOnly = /^[_—\s\u00A0]+$/.test(rText) || rText.trim().length === 0;
            const isSigningContext = /签字|盖章|签署|署名|代表/i.test(inner);
            if (isBlankOnly && isSigningContext) {
              // 签署落款栏空白横线：渲染为规整的签字下划线，避免误判为待填写风险空白
              html += `<span class="contract-sign-underline inline-block min-w-[80px] border-b border-slate-700 mx-1 select-none">&nbsp;</span>`;
            } else if (isBlankOnly) {
              html += `<span class="contract-unfilled-blank border-b-2 border-dashed border-red-400 bg-red-50/70 text-red-600 px-1.5 py-0.2 rounded text-[10px] font-mono select-none" title="⚠️ 空白待填项（尚未填写）">[待填写空白]</span>`;
            } else {
              html += `<span class="contract-fill-in underline underline-offset-4 decoration-blue-600 decoration-2 font-medium text-slate-900 bg-blue-50/60 px-1 py-0.2 rounded-xs" title="用户填写项/自定义参数">${escaped}</span>`;
            }
          } else if (isB) {
            html += `<strong>${escaped}</strong>`;
          } else {
            html += escaped;
          }
        }

        // Fallback if no <w:r> found
        if (!text) {
          const tRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
          let tM: RegExpExecArray | null;
          while ((tM = tRegex.exec(inner)) !== null) {
            text += this.decodeXmlEntities(tM[1]);
          }
          html = this.escapeHtml(text);
        }

        text = text.trim();
        if (!text) continue;

        const jcMatch = inner.match(/<w:jc\s+w:val="([^"]+)"/);
        const numMatch = inner.match(/<w:numPr>[\s\S]*?<w:ilvl\s+w:val="(\d+)"[\s\S]*?<w:numId\s+w:val="(\d+)"/);
        let prefix = '';
        let ilvl: number | undefined = undefined;
        let numId: string | undefined = undefined;
        if (numMatch) {
          ilvl = parseInt(numMatch[1], 10);
          numId = numMatch[2];
          prefix = this.resolveNumberingPrefix(numCounters, numId, ilvl, numDefs);
        }

        const isBold = hasBold || /<w:b(?:\s|\/|>)/.test(inner);
        const isJp = /[\u3040-\u309F\u30A0-\u30FF]/.test(text);

        rawElements.push({
          type: 'p',
          text,
          fullText: prefix ? prefix + text : text,
          html: html || this.escapeHtml(text),
          hasUnderline,
          prefix: prefix || undefined,
          jc: jcMatch ? jcMatch[1] : undefined,
          ilvl,
          numId,
          isBold,
          isJp,
        });
      }
    }

    if (rawElements.length === 0) return [];

    // Pre-merge broken sentence wraps in same language
    const normalizedElements: RawOpenXmlElement[] = [];
    for (let i = 0; i < rawElements.length; i++) {
      const el = rawElements[i];
      if (el.type === 'p') {
        const prev = normalizedElements[normalizedElements.length - 1];
        if (
          prev &&
          prev.type === 'p' &&
          prev.isJp === el.isJp &&
          !prev.isBold &&
          !el.isBold &&
          prev.ilvl === undefined &&
          el.ilvl === undefined
        ) {
          const prevClean = this.cleanMarkdownFormatting(prev.text);
          const elClean = this.cleanMarkdownFormatting(el.text);
          const isPrevHeadingOrSeparator =
            this.TIER1_CHAPTER_REGEX.test(prevClean) ||
            this.TIER2_ARTICLE_REGEX.test(prevClean) ||
            this.ANNEX_BOUNDARY_REGEX.test(prevClean) ||
            /^[-—_*]{3,}$/.test(prev.text.trim()) ||
            prevClean.endsWith('：') ||
            prevClean.endsWith(':');
          const isElHeadingOrSeparator =
            this.TIER1_CHAPTER_REGEX.test(elClean) ||
            this.TIER2_ARTICLE_REGEX.test(elClean) ||
            this.ANNEX_BOUNDARY_REGEX.test(elClean) ||
            /^[-—_*]{3,}$/.test(el.text.trim());

          const isSigningOrPartyLine = (t: string) =>
            /^(?:甲方|乙方|丙方|地址|签字|盖章|签署|法定代表人|授权代表|签约时间|签订日期|日期)[:：]/.test(t.trim());
          const isPartyOrSigningRow = isSigningOrPartyLine(prevClean) || isSigningOrPartyLine(elClean);

          if (isPartyOrSigningRow) {
            // 签署主体与签署落款栏按行独立呈现，不作为正文断句拼接合并
          } else if (
            !isPrevHeadingOrSeparator &&
            !isElHeadingOrSeparator &&
            !/[。！？；:：\.\?!]$/.test(prev.text) &&
            prev.text.length < 150
          ) {
            prev.text += el.text;
            prev.fullText += el.text;
            prev.html = (prev.html || '') + (el.html || '');
            prev.hasUnderline = prev.hasUnderline || el.hasUnderline;
            continue;
          }
        }
      }
      normalizedElements.push(el);
    }

    // Step 2: Clause boundary and DocumentBlock creation
    const rawClauses: ContractClauseNode[] = [];
    let curClause: ContractClauseNode | null = null;
    let clauseCounter = 0;
    let currentChapterNumber = '前言';
    let currentChapterTitle = '合同引言与签约主体';

    const createClause = (
      title: string,
      cNum: string,
      level: number,
      chNum?: string,
      chTitle?: string
    ) => {
      if (curClause && (curClause.content.trim() || (curClause.blocks && curClause.blocks.length > 0))) {
        rawClauses.push(curClause);
      }
      curClause = {
        id: `clause-${clauseCounter++}`,
        clauseNumber: cNum,
        title,
        content: '',
        blocks: [],
        level,
        chapterNumber: chNum || currentChapterNumber,
        chapterTitle: chTitle || currentChapterTitle,
      };
    };

    createClause('合同引言与主体信息', '前言', 2, '前言', '合同引言与签约主体');

    for (let i = 0; i < normalizedElements.length; i++) {
      const el = normalizedElements[i];
      const next = normalizedElements[i + 1];

      const cleanFullText = this.cleanMarkdownFormatting(el.fullText);
      const cleanElText = this.cleanMarkdownFormatting(el.text);

      // 1. Check Tier 1 Chapter Heading: e.g. "第一章 总则", "CHAPTER 1", "一、 合作内容"
      const isTier1 =
        el.type === 'p' &&
        (el.ilvl === undefined || el.ilvl === 0) &&
        !el.prefix &&
        (this.TIER1_CHAPTER_REGEX.test(el.fullText.trim()) || this.TIER1_CHAPTER_REGEX.test(cleanFullText)) &&
        cleanFullText.length < 40 &&
        !/[。！？；:：]$/.test(cleanElText);

      if (isTier1) {
        const chNum = cleanFullText.split(/[\s、\.:：]+/)[0];
        let chTitle = cleanFullText;
        if (
          next &&
          next.type === 'p' &&
          (next.isBold || next.jc === 'center') &&
          next.text.length < 35 &&
          !this.TIER2_ARTICLE_REGEX.test(this.cleanMarkdownFormatting(next.fullText))
        ) {
          chTitle += ' ' + this.cleanMarkdownFormatting(next.text.trim());
          i++;
        }
        currentChapterNumber = chNum;
        currentChapterTitle = chTitle;
        continue;
      }

      // 2. Check Annex Boundary (must be top-level, standalone, not a sub-item like 11.4.1)
      const isAnnex =
        el.type === 'p' &&
        (el.ilvl === undefined || el.ilvl === 0) &&
        !el.prefix &&
        !/^\s*(?:\d+(\.\d+)+|[（\(]\d+[）\)])/.test(cleanFullText) &&
        (this.ANNEX_BOUNDARY_REGEX.test(el.fullText.trim()) || this.ANNEX_BOUNDARY_REGEX.test(cleanFullText)) &&
        cleanFullText.length < 25 &&
        !/[:：]$/.test(cleanElText);

      if (isAnnex) {
        let title = cleanFullText;
        if (next && next.type === 'p' && (next.isBold || next.jc === 'center' || next.isJp)) {
          title += ' ' + this.cleanMarkdownFormatting(next.text.trim());
          i++;
        }
        currentChapterNumber = '附件';
        currentChapterTitle = title;
        createClause(title, '附件', 1, '附件', title);
        continue;
      }

      // Check Clause Header
      // 1. Level 0 heading in Word list: ilvl === 0 AND (ends with colon OR isBold OR text.length < 35 && !endsWith period)
      const isLevel0Header =
        el.ilvl === 0 &&
        (cleanElText.endsWith('：') ||
          cleanElText.endsWith(':') ||
          (el.isBold && cleanElText.length < 40 && !/[。！？；]$/.test(cleanElText)) ||
          (cleanElText.length < 30 && !/[。！？；]$/.test(cleanElText) && (next && (next.ilvl === 1 || next.isBold || next.isJp))));

      // 2. Formal article: 第X条, ARTICLE X
      const isArticle =
        this.TIER2_ARTICLE_REGEX.test(el.fullText) ||
        this.TIER2_ARTICLE_REGEX.test(el.text) ||
        this.TIER2_ARTICLE_REGEX.test(cleanFullText) ||
        this.TIER2_ARTICLE_REGEX.test(cleanElText) ||
        /^[一二三四五六七八九十]+[、\.\s]/.test(cleanFullText);

      // 3. Bold short section heading ending with colon
      const isBoldColonHeader =
        el.isBold &&
        cleanElText.length < 35 &&
        (cleanElText.endsWith('：') || cleanElText.endsWith(':')) &&
        !el.isJp;

      if (isLevel0Header || isArticle || isBoldColonHeader) {
        let title = cleanFullText.replace(/[:：\s]+$/, '');
        if (
          next &&
          next.type === 'p' &&
          next.isBold &&
          next.text.length < 40 &&
          (next.isJp || next.text.endsWith('：') || next.text.endsWith(':'))
        ) {
          title += ' / ' + this.cleanMarkdownFormatting(next.text.replace(/[:：\s]+$/, ''));
          i++;
        }

        const matchArt = title.match(
          /^\s*(第[一二三四五六七八九十百千万\d]+条|(?:ARTICLE|CLAUSE)\s+(?:[IVXLCDM\d]+|\d+)\b)\s*(.*)$/i
        );
        let cNum = el.prefix ? el.prefix.trim() : `第 ${clauseCounter} 条`;
        let cleanTitle = title;
        if (matchArt) {
          cNum = matchArt[1].trim();
          cleanTitle = matchArt[2]?.trim() || matchArt[1].trim();
        }

        if (currentChapterNumber === '前言') {
          currentChapterNumber = '正文';
          currentChapterTitle = '合同正文条款';
        }

        createClause(cleanTitle, cNum, 2, currentChapterNumber, currentChapterTitle);
        continue;
      }

      if (!curClause) {
        createClause('合同引言与主体信息', '前言', 2, '前言', '合同引言与签约主体');
      }

      // 1. Table Block
      if (el.type === 'table' && el.rows) {
        curClause!.blocks!.push({
          id: `blk-${curClause!.blocks!.length}`,
          type: 'table',
          tableData: { rows: el.rows },
        });
        curClause!.content += '\n[表格数据]';
        continue;
      }

      // 2. Metadata Key-Value in Clause 0
      if (
        clauseCounter === 1 &&
        /^(签订日期|締結日|签订地点|締結地|合同编号|契約番号|委托方|委託者|受托方|受託者)[:：]/.test(el.text)
      ) {
        const parts = el.text.split(/[:：]/);
        const k = parts[0].trim();
        const v = parts.slice(1).join(':').trim();
        curClause!.blocks!.push({
          id: `blk-${curClause!.blocks!.length}`,
          type: 'key_value_grid',
          metadata: [{ key: k, value: v }],
        });
        curClause!.content += `\n${el.text}`;
        continue;
      }

      // 3. Bilingual Pair Block
      if (
        next &&
        next.type === 'p' &&
        !el.isJp &&
        next.isJp &&
        Math.abs(el.text.length - next.text.length) < 300
      ) {
        const pfxMatch = el.text.match(/^(\d+(\.\d+)*[\.、\s]+)/);
        const prefix = pfxMatch ? pfxMatch[1].trim() : undefined;
        const cleanPrimary = pfxMatch ? el.text.slice(pfxMatch[0].length).trim() : el.text;

        let cleanPrimaryHtml = el.html || this.escapeHtml(cleanPrimary);
        if (pfxMatch && cleanPrimaryHtml.startsWith(pfxMatch[0])) {
          cleanPrimaryHtml = cleanPrimaryHtml.slice(pfxMatch[0].length).trim();
        }

        const nextPfxMatch = next.text.match(/^(\d+(\.\d+)*[\.、\s]+)/);
        const cleanSecondary = nextPfxMatch ? next.text.slice(nextPfxMatch[0].length).trim() : next.text;

        let cleanSecondaryHtml = next.html || this.escapeHtml(cleanSecondary);
        if (nextPfxMatch && cleanSecondaryHtml.startsWith(nextPfxMatch[0])) {
          cleanSecondaryHtml = cleanSecondaryHtml.slice(nextPfxMatch[0].length).trim();
        }

        curClause!.blocks!.push({
          id: `blk-${curClause!.blocks!.length}`,
          type: 'bilingual_pair',
          primaryText: cleanPrimary,
          secondaryText: cleanSecondary,
          primaryHtml: cleanPrimaryHtml,
          secondaryHtml: cleanSecondaryHtml,
          hasUnderline: el.hasUnderline || next.hasUnderline,
          primaryLang: 'zh',
          secondaryLang: 'ja',
          prefix,
          isBold: el.isBold,
        });
        curClause!.content += `\n${el.text}\n${next.text}`;
        i++;
        continue;
      }

      // 4. List Item Block (for ilvl > 0 sub-clauses e.g. 1.1, 2.1, 3.1.1 or numbered items)
      if (el.ilvl !== undefined && el.ilvl > 0) {
        curClause!.blocks!.push({
          id: `blk-${curClause!.blocks!.length}`,
          type: 'list_item',
          primaryText: el.text,
          primaryHtml: el.html || this.escapeHtml(el.text),
          hasUnderline: el.hasUnderline,
          prefix: el.prefix ? el.prefix.trim() : undefined,
          isBold: el.isBold,
        });
        curClause!.content += `\n${el.fullText}`;
        continue;
      }

      const manualListMatch = el.text.match(/^(\d+(\.\d+)+|[（\(]\d+[）\)])\s*/);
      if (manualListMatch) {
        let cleanListHtml = el.html || this.escapeHtml(el.text);
        if (cleanListHtml.startsWith(manualListMatch[0])) {
          cleanListHtml = cleanListHtml.slice(manualListMatch[0].length).trim();
        }
        curClause!.blocks!.push({
          id: `blk-${curClause!.blocks!.length}`,
          type: 'list_item',
          primaryText: el.text.slice(manualListMatch[0].length).trim(),
          primaryHtml: cleanListHtml,
          hasUnderline: el.hasUnderline,
          prefix: manualListMatch[1].trim(),
          isBold: el.isBold,
        });
        curClause!.content += `\n${el.fullText}`;
        continue;
      }

      // 5. Default Paragraph / Heading Block
      const isCenteredHeading = el.jc === 'center' || (el.isBold && el.text.length < 30 && !/[。！？]$/.test(el.text));
      curClause!.blocks!.push({
        id: `blk-${curClause!.blocks!.length}`,
        type: isCenteredHeading ? 'heading' : 'paragraph',
        primaryText: el.text,
        primaryHtml: el.html || this.escapeHtml(el.text),
        hasUnderline: el.hasUnderline,
        prefix: el.prefix ? el.prefix.trim() : undefined,
        isBold: el.isBold,
        alignment: (el.jc as any) || 'left',
      });
      curClause!.content += `\n${el.fullText}`;
    }

    const finalCurClause = curClause as ContractClauseNode | null;
    if (finalCurClause && (finalCurClause.content.trim() || (finalCurClause.blocks && finalCurClause.blocks.length > 0))) {
      rawClauses.push(finalCurClause);
    }

    // Merge empty placeholder clauses (e.g. 其他约定事项 having only 9 chars before 合同附则)
    const finalClauses: ContractClauseNode[] = [];
    for (let i = 0; i < rawClauses.length; i++) {
      const c = rawClauses[i];
      const next = rawClauses[i + 1];

      if (c.content.trim().length <= 20 && next && c.id !== 'clause-0') {
        next.title = `${c.title} 及 ${next.title}`;
        next.blocks = [...(c.blocks || []), ...(next.blocks || [])];
        next.content = `${c.content}\n${next.content}`.trim();
        continue;
      }

      if ((!c.blocks || c.blocks.length === 0) && c.content.trim().length === 0) {
        continue;
      }

      finalClauses.push(c);
    }

    // Consolidate adjacent metadata key-value blocks in Clause 0 into single grid
    if (finalClauses[0] && finalClauses[0].blocks) {
      const consolidatedBlocks: DocumentBlock[] = [];
      let pendingMeta: Array<{ key: string; value: string }> = [];

      for (const b of finalClauses[0].blocks) {
        if (b.type === 'key_value_grid' && b.metadata && b.metadata.length > 0) {
          pendingMeta.push(...b.metadata);
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
      finalClauses[0].blocks = consolidatedBlocks;
    }

    // Re-index
    finalClauses.forEach((c, idx) => {
      c.id = `clause-${idx}`;
      if (idx === 0) c.clauseNumber = '前言';
      else if (c.title.includes('附件') || c.title.includes('付属文書')) c.clauseNumber = '附件';
      else c.clauseNumber = `第 ${idx} 条`;
    });

    return finalClauses;
  }

  private decodeXmlEntities(text: string): string {
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

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
