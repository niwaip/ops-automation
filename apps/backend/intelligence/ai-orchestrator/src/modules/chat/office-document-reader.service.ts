import { Injectable, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';
import * as xlsx from 'xlsx';
import JSZip from 'jszip';
import * as zlib from 'zlib';

export interface OfficeExtractionResult {
  format: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'text' | 'unknown';
  text: string;
  characterCount: number;
  truncated: boolean;
  pageOrSheetCount?: number;
  images?: Array<{ mimeType: string; base64: string }>;
  isScannedOrImagePdf?: boolean;
  error?: string;
}

const DEFAULT_MAX_CHARS = 30000;

function ensurePdfJsRuntime(): void {
  if (!globalThis.DOMMatrix) {
    class DomMatrixPolyfill {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      constructor(init?: ArrayLike<number>) {
        if (!init || init.length < 6) return;
        const arr = Array.from(init);
        this.a = typeof arr[0] === 'number' ? arr[0] : 1;
        this.b = typeof arr[1] === 'number' ? arr[1] : 0;
        this.c = typeof arr[2] === 'number' ? arr[2] : 0;
        this.d = typeof arr[3] === 'number' ? arr[3] : 1;
        this.e = typeof arr[4] === 'number' ? arr[4] : 0;
        this.f = typeof arr[5] === 'number' ? arr[5] : 0;
      }
    }
    globalThis.DOMMatrix = DomMatrixPolyfill as unknown as typeof DOMMatrix;
  }
}

const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<any>;

/**
 * Read-only Office & PDF document text extractor migrated from personal-sandbox-runner.
 * Strictly read-only, zero disk side-effects, zero mutations.
 */
@Injectable()
export class OfficeDocumentReaderService {
  private readonly logger = new Logger(OfficeDocumentReaderService.name);

  /**
   * Check if the given file is a supported Office or PDF document format.
   */
  supports(fileName: string, mimeType?: string): boolean {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const normMime = (mimeType || '').toLowerCase();
    return (
      [
        'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'pdf',
        'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'yaml', 'yml', 'xml',
      ].includes(ext) ||
      normMime.includes('wordprocessingml') ||
      normMime.includes('spreadsheetml') ||
      normMime.includes('presentationml') ||
      normMime.includes('excel') ||
      normMime === 'application/vnd.ms-excel' ||
      normMime === 'application/pdf' ||
      normMime.startsWith('text/') ||
      normMime === 'application/json'
    );
  }

  /**
   * Extract text from document buffer.
   */
  async extractText(
    buffer: Buffer,
    fileName: string,
    mimeType?: string,
    maxChars: number = DEFAULT_MAX_CHARS
  ): Promise<OfficeExtractionResult> {
    if (!buffer || buffer.length === 0) {
      return { format: 'unknown', text: '', characterCount: 0, truncated: false };
    }

    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const normMime = (mimeType || '').toLowerCase();

    // 1. Word (.docx, .doc)
    if (ext === 'docx' || normMime.includes('wordprocessingml') || ext === 'doc') {
      return this.extractDocx(buffer, maxChars);
    }

    // 2. Excel (.xlsx, .xls)
    if (
      ext === 'xlsx' ||
      ext === 'xls' ||
      normMime.includes('spreadsheetml') ||
      normMime.includes('excel') ||
      normMime === 'application/vnd.ms-excel'
    ) {
      return this.extractXlsx(buffer, maxChars);
    }

    // 3. PowerPoint (.pptx, .ppt)
    if (ext === 'pptx' || normMime.includes('presentationml') || ext === 'ppt') {
      return this.extractPptx(buffer, maxChars);
    }

    // 4. PDF (.pdf)
    if (ext === 'pdf' || normMime === 'application/pdf') {
      return this.extractPdf(buffer, maxChars);
    }

    // 5. Plain text formats (.txt, .md, .csv, .json, .log, etc.)
    if (
      [
        'txt',
        'md',
        'markdown',
        'json',
        'csv',
        'tsv',
        'yaml',
        'yml',
        'xml',
        'html',
        'log',
        'py',
        'js',
        'ts',
        'sql',
      ].includes(ext) ||
      normMime.startsWith('text/')
    ) {
      return this.extractPlainText(buffer, maxChars);
    }

    return {
      format: 'unknown',
      text: '',
      characterCount: 0,
      truncated: false,
    };
  }

  /**
   * DOCX extraction via mammoth + XML fallback
   */
  private async extractDocx(buffer: Buffer, maxChars: number): Promise<OfficeExtractionResult> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const rawText = (result?.value || '').trim();
      if (rawText) {
        return this.formatResult('docx', rawText, maxChars);
      }
    } catch (err: any) {
      this.logger.debug(`Mammoth extraction failed: ${err?.message}, attempting zip xml fallback`);
    }

    try {
      const zip = await JSZip.loadAsync(buffer);
      const docXmlFile = zip.file('word/document.xml');
      if (docXmlFile) {
        const xml = await docXmlFile.async('text');
        const pMatches = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
        const paragraphs: string[] = [];
        for (const pXml of pMatches) {
          const tMatches = pXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
          const pText = tMatches
            .map((t) => t.replace(/<[^>]+>/g, '').trim())
            .filter(Boolean)
            .join('');
          if (pText) {
            paragraphs.push(pText);
          }
        }
        const rawText = paragraphs.join('\n');
        return this.formatResult('docx', rawText, maxChars);
      }
    } catch (err: any) {
      this.logger.warn(`DOCX zip xml fallback failed: ${err?.message}`);
    }

    return { format: 'docx', text: '', characterCount: 0, truncated: false };
  }

  /**
   * XLSX extraction via xlsx (SheetJS)
   */
  private async extractXlsx(buffer: Buffer, maxChars: number): Promise<OfficeExtractionResult> {
    try {
      const wb = xlsx.read(buffer, { type: 'buffer' });
      const sheetTexts: string[] = [];
      const sheetNames = (wb.SheetNames || []).slice(0, 5);
      for (const sheetName of sheetNames) {
        const sheet = wb.Sheets[sheetName];
        if (!sheet) continue;
        const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
        if (csv) {
          sheetTexts.push(`【工作表: ${sheetName}】\n${csv}`);
        }
      }
      const rawText = sheetTexts.join('\n\n');
      return this.formatResult('xlsx', rawText, maxChars, sheetNames.length);
    } catch (err: any) {
      this.logger.warn(`XLSX extraction failed: ${err?.message}`);
      return { format: 'xlsx', text: '', characterCount: 0, truncated: false, error: err?.message };
    }
  }

  /**
   * PPTX extraction via JSZip (parsing ppt/slides/slide*.xml)
   */
  private async extractPptx(buffer: Buffer, maxChars: number): Promise<OfficeExtractionResult> {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const slideNames = Object.keys(zip.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
          const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
          return numA - numB;
        });

      const slideTexts: string[] = [];
      let slideIndex = 0;
      for (const slideName of slideNames) {
        slideIndex++;
        if (!slideName) continue;
        const entry = zip.file(slideName);
        if (!entry) continue;
        const xml = await (entry as any).async('text');
        const matches = (xml as string).match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
        const textParts = matches
          .map((m: string) => this.decodeXmlEntities(m.replace(/<[^>]+>/g, '').trim()))
          .filter(Boolean);
        const slideContent = textParts.join(' ');
        if (slideContent) {
          slideTexts.push(`[幻灯片 ${slideIndex}]\n${slideContent}`);
        }
      }
      const rawText = slideTexts.join('\n\n');
      return this.formatResult('pptx', rawText, maxChars, slideNames.length);
    } catch (err: any) {
      this.logger.warn(`PPTX extraction failed: ${err?.message}`);
      return { format: 'pptx', text: '', characterCount: 0, truncated: false, error: err?.message };
    }
  }

  /**
   * PDF extraction via pdfjs-dist
   */
  private async extractPdf(buffer: Buffer, maxChars: number): Promise<OfficeExtractionResult> {
    try {
      ensurePdfJsRuntime();
      const pdfjs = await importEsm('pdfjs-dist/legacy/build/pdf.mjs');
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        disableFontFace: true,
        isEvalSupported: false,
        useSystemFonts: false,
        stopAtErrors: false,
      });

      const doc = await loadingTask.promise;
      try {
        const numPages = Math.min(doc.numPages, 30);
        const pageTexts: string[] = [];
        for (let i = 1; i <= numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          page.cleanup();
          const text = (content.items || [])
            .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
            .join(' ')
            .trim();
          if (text) {
            pageTexts.push(`[第 ${i} 页]\n${text}`);
          }
        }
        const rawText = pageTexts.join('\n\n');
        let images: Array<{ mimeType: string; base64: string }> | undefined;
        let isScannedOrImagePdf = false;

        // If text is empty or very short, attempt to extract embedded images (e.g. scanned PDF contracts/documents)
        if (rawText.length < 50) {
          const extractedImages = this.extractPdfImages(buffer, 10);
          if (extractedImages.length > 0) {
            images = extractedImages;
            isScannedOrImagePdf = true;
          }
        }

        const res = this.formatResult('pdf', rawText, maxChars, doc.numPages);
        res.images = images;
        res.isScannedOrImagePdf = isScannedOrImagePdf;
        return res;
      } finally {
        await doc.destroy().catch(() => undefined);
      }
    } catch (err: any) {
      this.logger.warn(`PDF extraction failed: ${err?.message}`);
      const fallbackImages = this.extractPdfImages(buffer, 10);
      if (fallbackImages.length > 0) {
        return {
          format: 'pdf',
          text: '',
          characterCount: 0,
          truncated: false,
          images: fallbackImages,
          isScannedOrImagePdf: true,
        };
      }
      return { format: 'pdf', text: '', characterCount: 0, truncated: false, error: err?.message };
    }
  }

  /**
   * Extract embedded images (e.g. JPEG) from PDF streams for scanned document support.
   */
  public extractPdfImages(
    pdfBuf: Buffer,
    maxImages: number = 10
  ): Array<{ mimeType: string; base64: string }> {
    const images: Array<{ mimeType: string; base64: string }> = [];
    if (!pdfBuf || pdfBuf.length === 0) return images;

    const str = pdfBuf.toString('latin1');
    const streamRegex = /<<[\s\S]*?\/Subtype\s*\/Image[\s\S]*?>>\s*stream[\r\n]+/g;
    let match: RegExpExecArray | null;

    while ((match = streamRegex.exec(str)) !== null && images.length < maxImages) {
      const dictStr = match[0];
      const streamStart = match.index + match[0].length;
      const endStreamIdx = str.indexOf('endstream', streamStart);
      if (endStreamIdx === -1) continue;
      let streamBuf = pdfBuf.subarray(streamStart, endStreamIdx);
      while (
        streamBuf.length &&
        (streamBuf[streamBuf.length - 1] === 0x0a || streamBuf[streamBuf.length - 1] === 0x0d)
      ) {
        streamBuf = streamBuf.subarray(0, streamBuf.length - 1);
      }

      if (dictStr.includes('/DCTDecode')) {
        if (dictStr.includes('/FlateDecode')) {
          try {
            streamBuf = zlib.inflateSync(streamBuf);
          } catch {
            try {
              streamBuf = zlib.unzipSync(streamBuf);
            } catch {
              continue;
            }
          }
        }
        if (streamBuf.length >= 4 && streamBuf[0] === 0xff && streamBuf[1] === 0xd8) {
          images.push({
            mimeType: 'image/jpeg',
            base64: streamBuf.toString('base64'),
          });
        }
      }
    }

    if (images.length === 0) {
      let offset = 0;
      while (offset < pdfBuf.length && images.length < maxImages) {
        const soi = pdfBuf.indexOf(Buffer.from([0xff, 0xd8, 0xff]), offset);
        if (soi === -1) break;
        const eoi = pdfBuf.indexOf(Buffer.from([0xff, 0xd9]), soi + 3);
        if (eoi !== -1 && eoi - soi > 1024) {
          const jpegBuf = pdfBuf.subarray(soi, eoi + 2);
          images.push({
            mimeType: 'image/jpeg',
            base64: jpegBuf.toString('base64'),
          });
          offset = eoi + 2;
        } else {
          offset = soi + 3;
        }
      }
    }

    return images;
  }

  private extractPlainText(buffer: Buffer, maxChars: number): OfficeExtractionResult {
    const rawText = buffer.toString('utf-8').trim();
    return this.formatResult('text', rawText, maxChars);
  }

  private formatResult(
    format: OfficeExtractionResult['format'],
    rawText: string,
    maxChars: number,
    pageOrSheetCount?: number
  ): OfficeExtractionResult {
    const totalChars = rawText.length;
    const truncated = totalChars > maxChars;
    const text = truncated ? rawText.slice(0, maxChars) : rawText;
    return {
      format,
      text,
      characterCount: totalChars,
      truncated,
      pageOrSheetCount,
    };
  }

  private decodeXmlEntities(val: string): string {
    return val
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }
}
