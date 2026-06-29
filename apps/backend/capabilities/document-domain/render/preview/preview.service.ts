import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import * as fs from 'fs';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import * as path from 'path';
import { promisify } from 'util';
import * as XLSX from 'xlsx';
import {
  createPdfViewerHtml,
  getPreviewImageContentType,
  parsePptSlideXml,
  PreviewImage,
  wrapPreviewHtml,
} from './utils/preview-html.helper';

const execAsync = promisify(exec);

export interface PreviewResult {
  html: string;
  format: string;
  previewType: 'pdf' | 'html';
  pdfBase64?: string;
  images?: PreviewImage[];
}

@Injectable()
export class PreviewService {
  private libreOfficePath: string;
  private tmpDir: string;
  private readonly logger = new Logger(PreviewService.name);

  constructor() {
    this.libreOfficePath = process.env.LIBREOFFICE_PATH || 'soffice';
    this.tmpDir = process.env.TMP_DIR || '/tmp/carbone-preview';

    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  async generatePreview(filePath: string, format: string): Promise<PreviewResult> {
    try {
      const pdfResult = await this.convertToPdf(filePath, format);
      if (pdfResult) {
        return pdfResult;
      }
    } catch (error) {
      this.logger.warn(
        `PDF conversion failed, falling back to HTML: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const buffer = fs.readFileSync(filePath);
    switch (format) {
      case 'docx':
        return this.previewDocx(buffer);
      case 'xlsx':
        return this.previewXlsx(buffer);
      case 'pptx':
        return this.previewPptx(buffer);
      case 'html':
        return this.previewHtml(buffer);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private async convertToPdf(filePath: string, format: string): Promise<PreviewResult | null> {
    try {
      await execAsync(`${this.libreOfficePath} --version`);
    } catch {
      this.logger.warn('LibreOffice not available');
      return null;
    }

    const outputDir = path.join(this.tmpDir, `preview_${Date.now()}`);
    fs.mkdirSync(outputDir, { recursive: true });

    try {
      const cmd = `${this.libreOfficePath} --headless --convert-to pdf:writer_pdf_Export --outdir "${outputDir}" "${filePath}"`;
      await execAsync(cmd, { timeout: 60000, env: { ...process.env, LANG: 'zh_CN.UTF-8' } });

      const files = fs.readdirSync(outputDir);
      const pdfFile = files.find((file) => file.endsWith('.pdf'));

      if (!pdfFile) {
        throw new Error('PDF file not generated');
      }

      const pdfPath = path.join(outputDir, pdfFile);
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfBase64 = pdfBuffer.toString('base64');

      fs.rmSync(outputDir, { recursive: true, force: true });

      return {
        html: createPdfViewerHtml(pdfBase64),
        format,
        previewType: 'pdf',
        pdfBase64,
      };
    } catch (error) {
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  private async previewDocx(buffer: Buffer): Promise<PreviewResult> {
    try {
      const result = await mammoth.convertToHtml(
        { buffer },
        {
          styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Title'] => h1.title:fresh",
          ],
        }
      );

      const images: PreviewImage[] = [];
      const zip = await JSZip.loadAsync(buffer);
      const mediaFolder = zip.folder('word/media');
      if (mediaFolder) {
        const files = Object.keys(mediaFolder.files);
        for (const fileName of files) {
          if (fileName.startsWith('word/media/')) {
            const file = zip.file(fileName);
            if (file) {
              const imageData = await file.async('base64');
              const ext = path.extname(fileName).toLowerCase();
              images.push({
                id: fileName.replace('word/media/', ''),
                data: imageData,
                contentType: getPreviewImageContentType(ext),
              });
            }
          }
        }
      }

      let processedContent = result.value;
      for (const image of images) {
        processedContent = processedContent.replace(
          new RegExp(`<img[^>]*src="[^"]*${image.id}"[^>]*>`, 'g'),
          `<img src="data:${image.contentType};base64,${image.data}" style="max-width:100%;height:auto;" />`
        );
      }

      return {
        html: wrapPreviewHtml(processedContent, images),
        format: 'docx',
        previewType: 'html',
        images,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to preview Word document: ${message}`);
    }
  }

  private async previewXlsx(buffer: Buffer): Promise<PreviewResult> {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames;
      let htmlContent = '';

      if (sheetNames.length > 0) {
        const sheet = workbook.Sheets[sheetNames[0]];
        htmlContent = XLSX.utils.sheet_to_html(sheet, {
          editable: false,
          header: '',
          footer: '',
        });
      }

      const tabsHtml = sheetNames
        .map(
          (name, index) =>
            `<button class="sheet-tab ${index === 0 ? 'active' : ''}" data-sheet="${name}">${name}</button>`
        )
        .join('');

      return {
        html: wrapPreviewHtml(htmlContent, [], `<div class="sheet-tabs">${tabsHtml}</div>`),
        format: 'xlsx',
        previewType: 'html',
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to preview Excel document: ${message}`);
    }
  }

  private async previewPptx(buffer: Buffer): Promise<PreviewResult> {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const slides: string[] = [];
      const slideFiles = Object.keys(zip.files)
        .filter((name) => name.match(/ppt\/slides\/slide\d+\.xml$/))
        .sort();

      for (const slideFile of slideFiles) {
        const file = zip.file(slideFile);
        if (file) {
          const content = await file.async('text');
          slides.push(parsePptSlideXml(content));
        }
      }

      const slidesHtml = slides
        .map((slide, index) => `<div class="slide ${index === 0 ? 'active' : ''}">${slide}</div>`)
        .join('');

      const navHtml = slides
        .map(
          (_, index) =>
            `<button class="slide-nav ${index === 0 ? 'active' : ''}" data-slide="${index}">${index + 1}</button>`
        )
        .join('');

      return {
        html: wrapPreviewHtml(
          slidesHtml,
          [],
          `<div class="slide-nav-container">${navHtml}</div><div class="slides-container">${slidesHtml}</div>`
        ),
        format: 'pptx',
        previewType: 'html',
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to preview PowerPoint document: ${message}`);
    }
  }

  private async previewHtml(buffer: Buffer): Promise<PreviewResult> {
    return {
      html: buffer.toString('utf-8'),
      format: 'html',
      previewType: 'html',
    };
  }
}
