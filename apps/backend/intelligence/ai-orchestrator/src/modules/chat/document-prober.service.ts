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
  summaryPreview: string;
  characterCount: number;
  parties?: {
    partyA?: string;
    partyB?: string;
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
    const classification = this.classifyDocument(fileName, snippet);
    const parties = classification.docCategory === 'contract' ? this.extractParties(snippet) : undefined;
    const docTitle = this.extractTitle(fileName, snippet);

    return {
      fileName,
      mimeType,
      docCategory: classification.docCategory,
      docType: classification.docType,
      docTypeName: classification.docTypeName,
      docTitle,
      summaryPreview: snippet,
      characterCount: extractedText.length,
      parties,
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
    snippet: string
  ): { docCategory: DocumentProbeResult['docCategory']; docType: string; docTypeName: string } {
    const combined = `${fileName} ${snippet}`.toLowerCase();

    // 1. Contract category
    const isContract =
      /(?:合同|协议|agreement|contract|nda|条款|履约|违约责任|买卖|租赁|委托)/i.test(combined);

    if (isContract) {
      // NDA / 保密
      if (
        /(?:保密|秘密|保密协议|保密合同|商业秘密|保密条款|non-disclosure|nda|confidentiality)/i.test(
          combined
        )
      ) {
        return {
          docCategory: 'contract',
          docType: 'contract.nda',
          docTypeName: '保密协议',
        };
      }

      // Procurement / 采购 / 买卖
      if (/(?:采购|供货|买卖|货物买卖|采购协议|设备买卖|供销)/i.test(combined)) {
        return {
          docCategory: 'contract',
          docType: 'contract.procurement',
          docTypeName: '采购合同',
        };
      }

      // Software / 技术开发
      if (
        /(?:软件开发|技术开发|系统开发|委托开发|软件实施|系统集成|技术服务)/i.test(combined)
      ) {
        return {
          docCategory: 'contract',
          docType: 'contract.software_development',
          docTypeName: '软件技术开发合同',
        };
      }

      // Employment / 劳动雇佣
      if (/(?:劳动合同|雇佣|劳务合同|聘用协议|劳动聘用|离职|竞业限制)/i.test(combined)) {
        return {
          docCategory: 'contract',
          docType: 'contract.employment',
          docTypeName: '劳动聘用合同',
        };
      }

      // Lease / 租赁
      if (/(?:租赁|租房|房屋出租|场地租赁|出租方|承租方)/i.test(combined)) {
        return {
          docCategory: 'contract',
          docType: 'contract.lease',
          docTypeName: '房屋场地租赁合同',
        };
      }

      return {
        docCategory: 'contract',
        docType: 'contract.general',
        docTypeName: '通用合同协议',
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

    const partyARegex = /(?:甲方(?:（[^）]+）)?|发包方|委托方|采购方|出租方|雇主|披露方)[：:\s]+([^\n\r\t,，。；;]{2,40})/;
    const partyBRegex = /(?:乙方(?:（[^）]+）)?|承包方|受托方|供货方|承租方|员工|劳动者|接收方)[：:\s]+([^\n\r\t,，。；;]{2,40})/;

    const matchA = snippet.match(partyARegex);
    const matchB = snippet.match(partyBRegex);

    let rawA = matchA && matchA[1] ? matchA[1].trim() : undefined;
    let rawB = matchB && matchB[1] ? matchB[1].trim() : undefined;

    if (rawA) {
      rawA = rawA.split(/(?:\t|\s{2,}|(?:乙方|承包方|受托方|供货方|承租方|员工|劳动者|接收方)[：:\s])/)[0].trim();
    }
    if (rawB) {
      rawB = rawB.split(/(?:\t|\s{2,}|(?:甲方|发包方|委托方|采购方|出租方|雇主|披露方)[：:\s])/)[0].trim();
    }

    return {
      partyA: rawA || undefined,
      partyB: rawB || undefined,
    };
  }

  private extractTitle(fileName: string, snippet: string): string {
    // If snippet has a prominent 《...》 title in the first 200 chars
    const bookTitleMatch = snippet.slice(0, 200).match(/《([^》]{2,40})》/);
    if (bookTitleMatch && bookTitleMatch[1]) {
      return bookTitleMatch[1].trim();
    }

    // First non-empty line if short and title-like
    const lines = snippet
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines[0] && lines[0].length >= 3 && lines[0].length <= 35 && !/[。；;！!？?]/.test(lines[0])) {
      return lines[0];
    }

    // Fall back to clean filename
    return path.basename(fileName, path.extname(fileName)).replace(/[_\-\s]+/g, ' ').trim();
  }
}
