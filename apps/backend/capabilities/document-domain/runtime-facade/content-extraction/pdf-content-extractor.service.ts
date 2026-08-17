import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import * as path from 'path';
import type {
  DocumentContentExtractionPage,
  DocumentContentExtractionResult,
  PdfContentExtractionInput,
} from './document-content-extraction.types';
import { ensurePdfJsTextRuntime } from './pdfjs-text-runtime.compat';

const PDF_SIGNATURE = '%PDF-';
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BASE64_LENGTH = Math.ceil(MAX_PDF_BYTES / 3) * 4;
const DEFAULT_MAX_PAGES = 50;
const HARD_MAX_PAGES = 100;
const DEFAULT_MAX_CHARACTERS = 200_000;
const HARD_MAX_CHARACTERS = 1_000_000;
const PDFJS_STANDARD_FONT_DATA_URL = `${path.dirname(
  require.resolve('pdfjs-dist/package.json')
)}/standard_fonts/`;

interface PdfJsTextItem {
  str?: unknown;
  hasEOL?: boolean;
}

interface PdfJsPage {
  getTextContent(options?: Record<string, unknown>): Promise<{ items: PdfJsTextItem[] }>;
  cleanup(): void;
}

interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfJsPage>;
  getMetadata(): Promise<{ info?: Record<string, unknown>; metadata?: { getAll(): unknown } }>;
  destroy(): Promise<void>;
}

interface PdfJsLoadingTask {
  promise: Promise<PdfJsDocument>;
  onPassword?: (updatePassword: (password: string) => void, reason: number) => void;
  destroy(): Promise<void>;
}

type PdfJsModule = {
  getDocument(options: Record<string, unknown>): PdfJsLoadingTask;
};

// TypeScript compiles this package as CommonJS while PDF.js ships as ESM.
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<PdfJsModule>;

@Injectable()
export class PdfContentExtractorService {
  async extract(input: PdfContentExtractionInput): Promise<DocumentContentExtractionResult> {
    const bytes = this.decodePdf(input.fileBase64);
    const maxPages = this.boundedInteger(
      input.maxPages,
      DEFAULT_MAX_PAGES,
      1,
      HARD_MAX_PAGES,
      'maxPages'
    );
    const maxCharacters = this.boundedInteger(
      input.maxCharacters,
      DEFAULT_MAX_CHARACTERS,
      1,
      HARD_MAX_CHARACTERS,
      'maxCharacters'
    );
    const includePages = input.includePages !== false;
    ensurePdfJsTextRuntime();
    const pdfjs = await importEsm('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      password: input.password || undefined,
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: false,
      stopAtErrors: false,
      standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL,
    });

    const passwordRejected = new Promise<never>((_, reject) => {
      loadingTask.onPassword = () => reject(new Error('PDF password required or incorrect'));
    });

    let document: PdfJsDocument | undefined;
    try {
      document = await Promise.race([loadingTask.promise, passwordRejected]);
      return await this.extractDocument(document, maxPages, maxCharacters, includePages);
    } catch (error) {
      throw this.mapPdfError(error);
    } finally {
      if (document) {
        await document.destroy().catch(() => undefined);
      } else {
        await loadingTask.destroy().catch(() => undefined);
      }
    }
  }

  private async extractDocument(
    document: PdfJsDocument,
    maxPages: number,
    maxCharacters: number,
    includePages: boolean
  ): Promise<DocumentContentExtractionResult> {
    const pages: DocumentContentExtractionPage[] = [];
    const textParts: string[] = [];
    const warnings: string[] = [];
    const pageLimit = Math.min(document.numPages, maxPages);
    let characterCount = 0;
    let truncated = document.numPages > pageLimit;

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      if (characterCount >= maxCharacters) {
        truncated = true;
        break;
      }
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent({ includeMarkedContent: false });
        const fullPageText = this.joinTextItems(content.items);
        const separatorLength = textParts.length > 0 ? 2 : 0;
        const remaining = maxCharacters - characterCount - separatorLength;
        if (remaining <= 0) {
          truncated = true;
          break;
        }
        const pageText = fullPageText.slice(0, remaining);
        if (pageText.length < fullPageText.length) truncated = true;
        characterCount += separatorLength + pageText.length;
        textParts.push(pageText);
        if (includePages) {
          pages.push({ pageNumber, text: pageText, characterCount: pageText.length });
        }
      } finally {
        page.cleanup();
      }
    }

    const text = textParts.join('\n\n').trim();
    if (!text) {
      warnings.push('PDF 未包含可提取的文本层；如为扫描件，请在后续 OCR Skill 中处理。');
    }
    if (document.numPages > maxPages) {
      warnings.push(`PDF 共 ${document.numPages} 页，本次按 maxPages=${maxPages} 截断。`);
    }
    if (truncated && characterCount >= maxCharacters) {
      warnings.push(`提取文本达到 maxCharacters=${maxCharacters} 限制。`);
    }

    return {
      text,
      pages,
      metadata: await this.extractMetadata(document),
      pageCount: document.numPages,
      extractedPageCount: textParts.length,
      characterCount: text.length,
      truncated,
      warnings,
      extraction: { format: 'pdf', method: 'embedded_text', ocrUsed: false },
    };
  }

  private decodePdf(value: unknown): Buffer {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('fileBase64 不能为空');
    }
    const normalized = value.trim().replace(/^data:application\/pdf;base64,/i, '');
    if (normalized.length > MAX_PDF_BASE64_LENGTH) {
      throw new PayloadTooLargeException(`PDF 文件不能超过 ${MAX_PDF_BYTES / 1024 / 1024}MB`);
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
      throw new BadRequestException('fileBase64 不是有效的 Base64 内容');
    }
    const bytes = Buffer.from(normalized, 'base64');
    if (bytes.length === 0 || bytes.toString('ascii', 0, PDF_SIGNATURE.length) !== PDF_SIGNATURE) {
      throw new BadRequestException('输入内容不是有效的 PDF 文件');
    }
    if (bytes.length > MAX_PDF_BYTES) {
      throw new PayloadTooLargeException(`PDF 文件不能超过 ${MAX_PDF_BYTES / 1024 / 1024}MB`);
    }
    return bytes;
  }

  private boundedInteger(
    value: unknown,
    fallback: number,
    minimum: number,
    maximum: number,
    field: string
  ): number {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
      throw new BadRequestException(`${field} 必须是 ${minimum}-${maximum} 之间的整数`);
    }
    return parsed;
  }

  private joinTextItems(items: PdfJsTextItem[]): string {
    let text = '';
    for (const item of items) {
      if (typeof item?.str !== 'string' || !item.str) continue;
      text += item.str;
      text += item.hasEOL ? '\n' : ' ';
    }
    return text
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private async extractMetadata(
    document: PdfJsDocument
  ): Promise<Record<string, string | number | boolean | null>> {
    try {
      const { info, metadata } = await document.getMetadata();
      const source = { ...(info || {}), ...this.asRecord(metadata?.getAll()) };
      const result: Record<string, string | number | boolean | null> = {};
      for (const [key, value] of Object.entries(source)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          result[key] = value;
        } else if (value === null) {
          result[key] = null;
        }
      }
      return result;
    } catch {
      return {};
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private mapPdfError(error: unknown): BadRequestException {
    const message = error instanceof Error ? error.message : String(error || 'PDF 解析失败');
    if (/password/i.test(message)) {
      return new BadRequestException('PDF 已加密或密码不正确');
    }
    return new BadRequestException(`PDF 解析失败: ${message}`);
  }
}
