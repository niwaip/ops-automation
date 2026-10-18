import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { ChatUploadedFileDTO } from './chat.dto';
import { OfficeDocumentReaderService } from './office-document-reader.service';

export interface DocumentProbeResult {
  fileName: string;
  mimeType?: string;
  docCategory: 'contract' | 'document' | 'spreadsheet' | 'presentation' | 'other';
  docType: string;
  docTypeName: string;
  docTitle?: string;
  confidence?: number;
  source?: 'document_probe';
  summaryPreview: string;
  characterCount: number;
  parties?: {
    partyA?: string;
    partyB?: string;
  };
  matchedEntity?: {
    party: 'party_a' | 'party_b';
    entityName: string;
    inferredPosition?: 'buyer' | 'seller';
  };
}

const MAX_SNIPPET_CHARS = 2500;

@Injectable()
export class DocumentProberService {
  private readonly logger = new Logger(DocumentProberService.name);
  private readonly officeReader: OfficeDocumentReaderService;

  constructor(@Optional() officeReader?: OfficeDocumentReaderService) {
    this.officeReader = officeReader || new OfficeDocumentReaderService();
  }

  /**
   * Probe and extract intelligence from uploaded files (read-only, side-effect free).
   */
  async probeFiles(files?: ChatUploadedFileDTO[]): Promise<DocumentProbeResult[]> {
    if (!files || files.length === 0) {
      return [];
    }

    const results: DocumentProbeResult[] = [];
    for (const file of files) {
      try {
        const probed = await this.probeSingleFile(file);
        if (probed) {
          results.push(probed);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to probe document ${file?.fileName}: ${err?.message}`);
      }
    }
    return results;
  }

  /**
   * Probe a single uploaded file.
   */
  async probeSingleFile(file: ChatUploadedFileDTO): Promise<DocumentProbeResult | null> {
    if (!file) return null;
    const fileName = (file.fileName || 'unnamed_file').trim();
    const mimeType = (file.mimeType || '').toLowerCase();

    let extractedText = (file.extractedText || '').trim();

    // If text was not yet extracted, attempt lightweight extraction
    if (!extractedText) {
      const buffer = this.resolveFileBuffer(file);
      if (buffer && buffer.length > 0) {
        extractedText = await this.extractTextFromBuffer(buffer, fileName, mimeType);
        if (extractedText) {
          // Hydrate onto the file object so subsequent execution stages don't re-parse
          file.extractedText = extractedText;
        }
      }
    }

    const snippet = extractedText.slice(0, MAX_SNIPPET_CHARS).trim();
    const docTitle = this.extractTitle(fileName, snippet);
    const classification = this.classifyDocument(fileName, snippet, docTitle);
    const parties = classification.docCategory === 'contract' ? this.extractParties(snippet) : undefined;

    let matchedEntity:
      | { party: 'party_a' | 'party_b'; entityName: string; inferredPosition?: 'buyer' | 'seller' }
      | undefined;
    if (parties) {
      const enterpriseAliases = [
        '富士通',
        '富士通（中国）',
        '富士通信息',
        'Fujitsu',
        'Fujitsu China',
        '富士通株式会社',
      ];
      if (parties.partyB && enterpriseAliases.some((alias) => parties.partyB!.includes(alias))) {
        matchedEntity = {
          party: 'party_b',
          entityName: parties.partyB,
          inferredPosition: 'seller',
        };
      } else if (parties.partyA && enterpriseAliases.some((alias) => parties.partyA!.includes(alias))) {
        matchedEntity = {
          party: 'party_a',
          entityName: parties.partyA,
          inferredPosition: 'buyer',
        };
      }
    }

    return {
      fileName,
      mimeType,
      docCategory: classification.docCategory,
      docType: classification.docType,
      docTypeName: classification.docTypeName,
      docTitle,
      confidence: classification.confidence || 0.8,
      source: 'document_probe',
      summaryPreview: snippet,
      characterCount: extractedText.length,
      parties,
      matchedEntity,
    };
  }

  /**
   * Format probe results into an informative system prompt block for planners.
   */
  formatProbedContext(probedDocs: DocumentProbeResult[]): string {
    if (!probedDocs || probedDocs.length === 0) return '';

    const lines: string[] = ['[系统上下文：已完成用户附件文档轻量预处理与特征分析]'];
    for (const doc of probedDocs) {
      lines.push(`- 附件文档：${doc.fileName}`);
      lines.push(`  - 识别类型：${doc.docTypeName} (${doc.docType})`);
      if (doc.docTitle) {
        lines.push(`  - 文档标题：《${doc.docTitle}》`);
      }
      if (doc.parties && (doc.parties.partyA || doc.parties.partyB)) {
        const partyInfo = [
          doc.parties.partyA ? `甲方: ${doc.parties.partyA}` : '',
          doc.parties.partyB ? `乙方: ${doc.parties.partyB}` : '',
        ]
          .filter(Boolean)
          .join('；');
        lines.push(`  - 识别签约主体：${partyInfo}`);
        if (doc.matchedEntity) {
          lines.push(
            `  - 我方法人主体自动匹配：识别到 ${doc.matchedEntity.party === 'party_a' ? '甲方' : '乙方'} 为我方法人主体「${doc.matchedEntity.entityName}」，已自动对齐审查立场为 ${doc.matchedEntity.inferredPosition === 'seller' ? '乙方/受托方(seller)' : '甲方/委托采购方(buyer)'}`
          );
        }
      }
      const digest = crypto
        .createHash('sha256')
        .update(doc.summaryPreview || '')
        .digest('hex');
      lines.push(
        `  - 文档特征摘要：字符数 ${doc.characterCount}，正文哈希 sha256:${digest.slice(0, 16)}`
      );
    }
    return lines.join('\n');
  }

  private resolveFileBuffer(file: ChatUploadedFileDTO): Buffer | null {
    if (file.content) {
      try {
        return Buffer.from(file.content, 'base64');
      } catch {
        // ignore
      }
    }
    if (file.filePath && fs.existsSync(file.filePath)) {
      try {
        return fs.readFileSync(file.filePath);
      } catch {
        // ignore
      }
    }
    const candidateDirs = [
      process.env.CHAT_UPLOAD_STORAGE_ROOT,
      process.env.WORKSPACE_STORAGE_ROOT ? path.join(process.env.WORKSPACE_STORAGE_ROOT, 'uploads') : '',
      '/workspace/data/storage/uploads',
      path.join(process.cwd(), 'data/storage/uploads'),
      '/tmp/ops-chat-uploads',
    ].filter(Boolean) as string[];

    if (file.fileId) {
      for (const dir of candidateDirs) {
        if (!fs.existsSync(dir)) continue;
        const directPath = path.join(dir, file.fileId);
        if (fs.existsSync(directPath)) {
          try {
            return fs.readFileSync(directPath);
          } catch {
            // ignore
          }
        }
        const metaPath = path.join(dir, `${file.fileId}.meta.json`);
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            if (meta.filePath && fs.existsSync(meta.filePath)) {
              return fs.readFileSync(meta.filePath);
            }
          } catch {
            // ignore
          }
        }
      }
    }
    return null;
  }

  private async extractTextFromBuffer(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
    const result = await this.officeReader.extractText(buffer, fileName, mimeType, 30000);
    if (!result.text && result.images && result.images.length > 0) {
      return `[扫描版/图片型文档，共包含 ${result.images.length} 页图片]`;
    }
    return result.text || '';
  }

  private classifyDocument(
    fileName: string,
    snippet: string,
    docTitle?: string
  ): { docCategory: DocumentProbeResult['docCategory']; docType: string; docTypeName: string; confidence?: number } {
    const combined = `${fileName} ${snippet}`.toLowerCase();
    const titleCandidates = `${fileName} ${docTitle || ''}`.toLowerCase();

    // 1. High-priority Title/Filename matching (prevents embedded clauses like "保密条款" from skewing whole-doc classification)
    if (
      /(?:保密协议|保密合同|保密承诺|秘密保持|守秘義務|機密保持|non-disclosure|nda|confidentiality)/i.test(
        titleCandidates
      )
    ) {
      return {
        docCategory: 'contract',
        docType: 'contract.nda',
        docTypeName: '保密协议',
        confidence: 0.95,
      };
    }
    if (
      /(?:软件开发|技术开发|系统开发|委托开发|软件实施|系统集成|技术服务|开发委託|ソフトウェア開発|it服务|运维服务)/i.test(
        titleCandidates
      )
    ) {
      return {
        docCategory: 'contract',
        docType: 'contract.software_development',
        docTypeName: '软件技术开发合同',
        confidence: 0.95,
      };
    }
    if (/(?:采购|供货|买卖|货物买卖|采购协议|设备买卖|供销|売買|調達)/i.test(titleCandidates)) {
      return {
        docCategory: 'contract',
        docType: 'contract.procurement',
        docTypeName: '采购合同',
        confidence: 0.95,
      };
    }
    if (/(?:租赁|租房|房屋出租|场地租赁|出租|承租|賃貸借|リース)/i.test(titleCandidates)) {
      return {
        docCategory: 'contract',
        docType: 'contract.lease',
        docTypeName: '房屋场地租赁合同',
        confidence: 0.95,
      };
    }
    if (/(?:劳动合同|雇佣|劳务合同|聘用协议|劳动聘用|离职|竞业限制|雇用|労働)/i.test(titleCandidates)) {
      return {
        docCategory: 'contract',
        docType: 'contract.employment',
        docTypeName: '劳动聘用合同',
        confidence: 0.95,
      };
    }

    // 2. Full content contract detection
    const isContract =
      /(?:合同|协议|agreement|contract|nda|条款|履约|违约责任|买卖|租赁|委托|契約)/i.test(combined);

    if (isContract) {
      // Strip disclaimer/negative phrases that mention procurement/investment in negative context
      // e.g. "本协议不构成采购、投资或知识产权转让承诺", "本契約は調達を義務付けるものではない"
      const cleanedCombined = combined
        .replace(/(?:不构成|不作为|不承诺|不得解释为|不代表|并非|不具有|未承诺)[^。\n;；]*(?:采购|买卖|投资|供货|調達|売買)/gi, '')
        .replace(/(?:采购|买卖|投资|供货|調達|売買)[^。\n;；]*(?:不构成|不作为|不承诺|不得解释为|不代表|并非|を義務付けるものではない|の義務を負わない)/gi, '');

      // Check NDA first if text has explicit NDA contract declaration and lacks substantive commercial transaction terms
      const hasNdaDeclaration = /(?:保密协议|保密合同|保密承诺书|秘密保持契約|守秘義務契約|機密保持契約|non-disclosure\s*agreement|\bnda\b)/i.test(cleanedCombined);
      const hasSubstantiveProcurement = /(?:采购标的|交货期限|交货地点|验收标准|付款批次|货物交付|納品期限|検収条件|検収期間|検収基準)/i.test(cleanedCombined);
      const hasSubstantiveSoftwareDev = /(?:技术指标|代码交付|开发阶段|需求规格|源代码|ソフトウェア仕様|納入成果物)/i.test(cleanedCombined);

      if (hasNdaDeclaration && !hasSubstantiveProcurement && !hasSubstantiveSoftwareDev) {
        return {
          docCategory: 'contract',
          docType: 'contract.nda',
          docTypeName: '保密协议',
          confidence: 0.9,
        };
      }

      if (
        /(?:软件开发|技术开发|系统开发|委托开发|软件实施|系统集成|技术服务|开发委託|ソフトウェア開発)/i.test(
          cleanedCombined
        )
      ) {
        return {
          docCategory: 'contract',
          docType: 'contract.software_development',
          docTypeName: '软件技术开发合同',
          confidence: 0.85,
        };
      }

      if (/(?:采购|供货|买卖|货物买卖|采购协议|设备买卖|供销|売買|調達)/i.test(cleanedCombined)) {
        return {
          docCategory: 'contract',
          docType: 'contract.procurement',
          docTypeName: '采购合同',
          confidence: 0.85,
        };
      }

      if (/(?:租赁|租房|房屋出租|场地租赁|出租方|承租方|賃貸借|リース)/i.test(cleanedCombined)) {
        return {
          docCategory: 'contract',
          docType: 'contract.lease',
          docTypeName: '房屋场地租赁合同',
          confidence: 0.85,
        };
      }

      if (/(?:劳动合同|雇佣|劳务合同|聘用协议|劳动聘用|离职|竞业限制|雇用|労働)/i.test(cleanedCombined)) {
        return {
          docCategory: 'contract',
          docType: 'contract.employment',
          docTypeName: '劳动聘用合同',
          confidence: 0.85,
        };
      }

      if (hasNdaDeclaration) {
        return {
          docCategory: 'contract',
          docType: 'contract.nda',
          docTypeName: '保密协议',
          confidence: 0.8,
        };
      }

      return {
        docCategory: 'contract',
        docType: 'contract.general',
        docTypeName: '通用合同协议',
        confidence: 0.6,
      };
    }

    // 2. Spreadsheet
    if (/(?:\.xlsx?|\.csv)$/i.test(fileName) || /(?:报表|统计表|明细表|对账单)/i.test(combined)) {
      return {
        docCategory: 'spreadsheet',
        docType: 'spreadsheet.general',
        docTypeName: '表格数据文件',
      };
    }

    // 3. Presentation
    if (/(?:\.pptx?)$/i.test(fileName) || /(?:演示文稿|幻灯片|ppt)/i.test(combined)) {
      return {
        docCategory: 'presentation',
        docType: 'presentation.general',
        docTypeName: '演示文稿',
      };
    }

    // 4. Report
    if (/(?:报告|总结|汇报|调研|方案|规划)/i.test(combined)) {
      return {
        docCategory: 'document',
        docType: 'document.report',
        docTypeName: '报告方案文档',
      };
    }

    return {
      docCategory: 'document',
      docType: 'document.general',
      docTypeName: '通用办公文档',
    };
  }

  private extractParties(snippet: string): { partyA?: string; partyB?: string } {
    if (!snippet) return {};

    const partyARegex =
      /(?:甲方(?:（[^）]+）)?|发包方|委托方|采购方|出租方|雇主|披露方|委託者|発注者|貸主)[：:\s]+([^\n\r\t,，。；;]{2,40})/;
    const partyBRegex =
      /(?:乙方(?:（[^）]+）)?|承包方|受托方|供货方|承租方|员工|劳动者|接收方|受託者|受注者|借主)[：:\s]+([^\n\r\t,，。；;]{2,40})/;

    const matchA = snippet.match(partyARegex);
    const matchB = snippet.match(partyBRegex);

    let rawA = matchA && matchA[1] ? matchA[1].trim() : undefined;
    let rawB = matchB && matchB[1] ? matchB[1].trim() : undefined;

    if (rawA) {
      rawA = rawA.split(/(?:\t|\s{2,}|(?:乙方|承包方|受托方|供货方|承租方|员工|劳动者|接收方)[：:\s])/)[0]?.trim();
    }
    if (rawB) {
      rawB = rawB.split(/(?:\t|\s{2,}|(?:甲方|发包方|委托方|采购方|出租方|雇主|披露方)[：:\s])/)[0]?.trim();
    }

    return {
      partyA: rawA || undefined,
      partyB: rawB || undefined,
    };
  }

  private isLikelyPageOrHeaderNoise(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return true;
    // Pure numbers (e.g. "1", "2")
    if (/^\d+$/.test(trimmed)) return true;
    // Pagination patterns: [第 1 页], 第1页, Page 1, 1/5, --- 1 ---, [ 1 ]
    if (/^\[?\s*(?:第\s*\d+\s*[页頁]|page\s*\d+|\d+\s*[\/／]\s*\d+|-+\s*\d+\s*-+)\s*\]?$/i.test(trimmed)) return true;
    if (/^\[?\s*\d+\s*\]?$/.test(trimmed)) return true;
    // Common header labels / metadata: 合同编号, 密级, 内部文件, 签订日期 etc.
    if (/^(?:合同编号|契約番号|项目编号|文档编号|file\s*no|contract\s*no)[：:\s]/i.test(trimmed)) return true;
    if (/^(?:密级|保密级别|保密等级|秘密区分|内部资料|内部文件|绝密|机密|秘密)[：:\s]/i.test(trimmed)) return true;
    if (/^(?:签订日期|締結日|签署日期)[：:\s]/i.test(trimmed)) return true;
    return false;
  }

  private extractTitle(fileName: string, snippet: string): string {
    // 1. If snippet has a prominent 《...》 title in the first 300 chars
    const bookTitleMatch = snippet.slice(0, 300).match(/《([^》]{2,40})》/);
    if (bookTitleMatch && bookTitleMatch[1]) {
      return bookTitleMatch[1].trim();
    }

    // 2. Filter out page markers and header noise
    const lines = snippet
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !this.isLikelyPageOrHeaderNoise(l));

    // Check first 6 candidate lines
    const candidates = lines.slice(0, 6);
    // Prioritize candidate line that explicitly contains contract/document title keywords
    const contractTitleLine = candidates.find(
      (l) =>
        l.length >= 2 &&
        l.length <= 40 &&
        !/[。；;！!？?]/.test(l) &&
        /(?:合同|协议|契约|契約|agreement|nda|承诺书|覚書|memorandum|规范|报告|方案)/i.test(l)
    );
    if (contractTitleLine) {
      return contractTitleLine;
    }

    // Otherwise, first non-noise candidate line if short and title-like (not a sentence or party definition)
    const firstValid = candidates.find(
      (l) =>
        l.length >= 2 &&
        l.length <= 35 &&
        !/[。；;！!？?]/.test(l) &&
        !/^(?:甲方|乙方|丙方|委託者|受託者|采购方|供货方|出租方|承租方)[：:\s]/.test(l)
    );
    if (firstValid) {
      return firstValid;
    }

    // Fall back to clean filename
    return path.basename(fileName, path.extname(fileName)).replace(/[_\-\s]+/g, ' ').trim();
  }
}
