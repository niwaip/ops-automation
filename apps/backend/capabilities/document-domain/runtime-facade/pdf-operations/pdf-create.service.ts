import { BadRequestException, Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PdfArtifactStorageService } from './pdf-artifact-storage.service';
import { containsCjkText, resolveCjkPdfFont, type ResolvedPdfFont } from './pdf-font-resolver';
import type { PdfContentBlock, PdfCreateInput, PdfOperationOutput } from './pdf-operation.types';
import { computePdfRequestDigest, stablePdfRequestJson } from './pdf-request-digest';

const MAX_CONTENT_BLOCKS = 200;
const MAX_CONTENT_CHARACTERS = 200_000;
const MAX_TABLE_ROWS = 500;
const MAX_TABLE_COLUMNS = 20;

interface GeneratedPdf {
  bytes: Buffer;
  pageCount: number;
}

@Injectable()
export class PdfCreateService {
  constructor(private readonly storage: PdfArtifactStorageService) {}

  async create(input: PdfCreateInput, idempotencyKey: string): Promise<PdfOperationOutput> {
    const normalized = this.validateAndNormalize(input);
    const generated = await this.generate(normalized);
    const requestDigest = computePdfRequestDigest([
      'pdf-create-v1',
      stablePdfRequestJson(normalized),
    ]);
    const stored = await this.storage.store({
      bytes: generated.bytes,
      fileName: normalized.fileName || 'document.pdf',
      idempotencyKey,
      requestDigest,
      metadata: {
        operation: 'create',
        pageCount: generated.pageCount,
        pageNumbers: normalized.pageNumbers,
      },
    });
    return {
      operation: 'create',
      artifact: stored.artifact,
      artifacts: [stored.artifact],
      pageCount: generated.pageCount,
    };
  }

  private validateAndNormalize(input: PdfCreateInput): Required<Pick<PdfCreateInput, 'content' | 'pageNumbers'>> &
    Pick<PdfCreateInput, 'fileName' | 'title'> {
    let rawContentList: unknown[] = [];
    if (typeof (input as any)?.content === 'string') {
      const trimmed = (input as any).content.trim();
      rawContentList = trimmed ? [{ type: 'paragraph', text: trimmed }] : [];
    } else if (Array.isArray(input?.content)) {
      rawContentList = input.content;
    }

    if (rawContentList.length === 0) {
      throw new BadRequestException('content must contain at least one PDF block');
    }
    if (rawContentList.length > MAX_CONTENT_BLOCKS) {
      throw new BadRequestException(`content cannot contain more than ${MAX_CONTENT_BLOCKS} blocks`);
    }
    if (input.title !== undefined && typeof input.title !== 'string') {
      throw new BadRequestException('title must be a string');
    }
    if (input.fileName !== undefined && typeof input.fileName !== 'string') {
      throw new BadRequestException('fileName must be a string');
    }
    if (input.pageNumbers !== undefined && typeof input.pageNumbers !== 'boolean') {
      throw new BadRequestException('pageNumbers must be a boolean');
    }
    if ((input.title?.length || 0) > 500) {
      throw new BadRequestException('title cannot exceed 500 characters');
    }
    if ((input.fileName?.length || 0) > 120) {
      throw new BadRequestException('fileName cannot exceed 120 characters');
    }

    let characterCount = input.title?.length || 0;
    const content = rawContentList.map((rawBlock, index) => {
      let block: PdfContentBlock;
      if (typeof rawBlock === 'string') {
        block = { type: 'paragraph', text: rawBlock };
      } else if (rawBlock && typeof rawBlock === 'object') {
        block = rawBlock as PdfContentBlock;
      } else {
        throw new BadRequestException(`content[${index}] must be an object`);
      }

      const supported = ['heading', 'h2', 'h3', 'paragraph', 'table', 'list', 'code'];
      if (!supported.includes(block.type)) {
        throw new BadRequestException(`content[${index}].type is not supported`);
      }
      if (block.text !== undefined && typeof block.text !== 'string') {
        throw new BadRequestException(`content[${index}].text must be a string`);
      }
      characterCount += block.text?.length || 0;

      if (block.type === 'list') {
        if (!Array.isArray(block.items) || block.items.some((item) => typeof item !== 'string')) {
          throw new BadRequestException(`content[${index}].items must be an array of strings`);
        }
        if (block.ordered !== undefined && typeof block.ordered !== 'boolean') {
          throw new BadRequestException(`content[${index}].ordered must be a boolean`);
        }
        characterCount += block.items.reduce((sum, item) => sum + item.length, 0);
      }
      if (block.type === 'table') {
        const headers = block.headers || [];
        const rows = block.rows || [];
        if (!Array.isArray(headers) || !Array.isArray(rows)) {
          throw new BadRequestException(`content[${index}] table headers and rows must be arrays`);
        }
        if (headers.some((header) => typeof header !== 'string')) {
          throw new BadRequestException(`content[${index}].headers must contain only strings`);
        }
        if (rows.length > MAX_TABLE_ROWS) {
          throw new BadRequestException(
            `content[${index}] table cannot exceed ${MAX_TABLE_ROWS} rows`
          );
        }
        for (const row of rows) {
          if (!Array.isArray(row) || row.length > MAX_TABLE_COLUMNS) {
            throw new BadRequestException(`content[${index}] contains an invalid table row`);
          }
        }
        const columnCount = Math.max(headers.length, ...rows.map((row) => row.length), 0);
        if (columnCount < 1 || columnCount > MAX_TABLE_COLUMNS) {
          throw new BadRequestException(
            `content[${index}] table must contain 1-${MAX_TABLE_COLUMNS} columns`
          );
        }
        characterCount += headers.reduce((sum, cell) => sum + String(cell).length, 0);
        for (const row of rows) {
          characterCount += row.reduce<number>(
            (sum, cell) => sum + String(cell ?? '').length,
            0
          );
        }
      }
      return block;
    });

    if (characterCount > MAX_CONTENT_CHARACTERS) {
      throw new BadRequestException(
        `PDF content exceeds the ${MAX_CONTENT_CHARACTERS}-character limit`
      );
    }
    return {
      content,
      pageNumbers: input.pageNumbers !== false,
      fileName: input.fileName,
      title: input.title,
    };
  }

  private async generate(input: {
    content: PdfContentBlock[];
    pageNumbers: boolean;
    fileName?: string;
    title?: string;
  }): Promise<GeneratedPdf> {
    const allText = this.collectText(input.title, input.content);
    const cjkFont = containsCjkText(allText) ? resolveCjkPdfFont() : undefined;
    if (containsCjkText(allText) && !cjkFont) {
      throw new BadRequestException(
        'CJK text requires a supported system font; install Noto Sans CJK in the document runtime'
      );
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
      info: {
        Title: input.title || input.fileName || 'Generated PDF',
        Author: 'Ops Automation',
        Creator: 'Ops Automation PDF Atomic Capability',
        CreationDate: new Date(0),
        ModDate: new Date(0),
      },
    });
    const chunks: Buffer[] = [];
    const completion = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    try {
      this.applyBodyFont(doc, cjkFont);
      if (input.title) {
        this.applyHeadingFont(doc, cjkFont);
        doc.fontSize(20).text(input.title, { align: 'center' });
        this.applyBodyFont(doc, cjkFont);
        doc.moveDown(1.25);
      }

      for (const block of input.content) {
        this.drawBlock(doc, block, cjkFont);
      }

      const range = doc.bufferedPageRange();
      if (input.pageNumbers) {
        for (let index = 0; index < range.count; index += 1) {
          doc.switchToPage(range.start + index);
          this.applyBodyFont(doc, cjkFont);
          const label = containsCjkText(allText)
            ? `第 ${index + 1} 页 / 共 ${range.count} 页`
            : `Page ${index + 1} of ${range.count}`;
          doc.fontSize(8).text(
            label,
            doc.page.margins.left,
            doc.page.height - doc.page.margins.bottom - 15,
            {
              width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
              align: 'center',
              lineBreak: false,
            }
          );
        }
      }
      doc.end();
      return { bytes: await completion, pageCount: range.count };
    } catch (error) {
      doc.end();
      await completion.catch(() => undefined);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `Unable to generate PDF: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private drawBlock(
    doc: PDFKit.PDFDocument,
    block: PdfContentBlock,
    cjkFont?: ResolvedPdfFont
  ): void {
    switch (block.type) {
      case 'heading':
        this.drawHeading(doc, block.text || '', 16, 0.5, cjkFont);
        break;
      case 'h2':
        this.drawHeading(doc, block.text || '', 14, 0.35, cjkFont);
        break;
      case 'h3':
        this.drawHeading(doc, block.text || '', 12, 0.25, cjkFont);
        break;
      case 'paragraph':
        this.applyBodyFont(doc, cjkFont);
        doc.fontSize(10).text(block.text || '', { align: 'justify' }).moveDown(0.5);
        break;
      case 'code':
        if (cjkFont && containsCjkText(block.text || '')) this.applyBodyFont(doc, cjkFont);
        else doc.font('Courier');
        doc.fontSize(8).text(block.text || '').moveDown(0.35);
        this.applyBodyFont(doc, cjkFont);
        break;
      case 'list':
        this.drawList(doc, block, cjkFont);
        break;
      case 'table':
        this.drawTable(doc, block, cjkFont);
        break;
    }
  }

  private drawHeading(
    doc: PDFKit.PDFDocument,
    text: string,
    size: number,
    spacing: number,
    cjkFont?: ResolvedPdfFont
  ): void {
    doc.moveDown(spacing);
    this.applyHeadingFont(doc, cjkFont);
    doc.fontSize(size).text(text);
    this.applyBodyFont(doc, cjkFont);
    doc.moveDown(spacing);
  }

  private drawList(
    doc: PDFKit.PDFDocument,
    block: PdfContentBlock,
    cjkFont?: ResolvedPdfFont
  ): void {
    this.applyBodyFont(doc, cjkFont);
    const items = block.items || [];
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    doc.fontSize(10);
    items.forEach((item, index) => {
      const y = doc.y;
      doc.text(block.ordered ? `${index + 1}.` : '•', left + 4, y, { lineBreak: false });
      doc.text(item, left + 22, y, { width: width - 22 });
    });
    doc.moveDown(0.5);
  }

  private drawTable(
    doc: PDFKit.PDFDocument,
    block: PdfContentBlock,
    cjkFont?: ResolvedPdfFont
  ): void {
    const rows: Array<Array<string | number | boolean | null>> = block.headers?.length
      ? [block.headers, ...(block.rows || [])]
      : block.rows || [];
    if (rows.length === 0) return;
    const columnCount = Math.max(...rows.map((row) => row.length));
    const left = doc.page.margins.left;
    const usableWidth = doc.page.width - left - doc.page.margins.right;
    const columnWidth = usableWidth / columnCount;
    this.applyBodyFont(doc, cjkFont);

    rows.forEach((row, rowIndex) => {
      const texts = Array.from({ length: columnCount }, (_, index) => String(row[index] ?? ''));
      const rowHeight = Math.max(
        20,
        ...texts.map((text) => Math.min(90, doc.heightOfString(text, { width: columnWidth - 8 }) + 8))
      );
      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        this.applyBodyFont(doc, cjkFont);
      }
      const y = doc.y;
      if (rowIndex === 0 && block.headers?.length) {
        doc.save().fillColor('#E8EEF7').rect(left, y, usableWidth, rowHeight).fill().restore();
        this.applyHeadingFont(doc, cjkFont);
      }
      texts.forEach((text, columnIndex) => {
        const x = left + columnIndex * columnWidth;
        doc
          .lineWidth(0.5)
          .strokeColor('#9AA4B2')
          .rect(x, y, columnWidth, rowHeight)
          .stroke();
        doc.fillColor('#111827').fontSize(9).text(text, x + 4, y + 4, {
          width: columnWidth - 8,
          height: rowHeight - 8,
          ellipsis: true,
        });
      });
      this.applyBodyFont(doc, cjkFont);
      doc.y = y + rowHeight;
    });
    doc.moveDown(0.5);
  }

  private applyBodyFont(doc: PDFKit.PDFDocument, font?: ResolvedPdfFont): void {
    if (font?.familyName) doc.font(font.path, font.familyName);
    else if (font) doc.font(font.path);
    else doc.font('Helvetica');
  }

  private applyHeadingFont(doc: PDFKit.PDFDocument, font?: ResolvedPdfFont): void {
    if (font?.familyName) doc.font(font.path, font.familyName);
    else if (font) doc.font(font.path);
    else doc.font('Helvetica-Bold');
  }

  private collectText(title: string | undefined, blocks: PdfContentBlock[]): string {
    const values: string[] = [title || ''];
    for (const block of blocks) {
      values.push(block.text || '');
      values.push(...(block.headers || []));
      values.push(...(block.items || []));
      for (const row of block.rows || []) values.push(...row.map((cell) => String(cell ?? '')));
    }
    return values.join('\n');
  }
}
