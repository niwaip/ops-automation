import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import { Parser } from './parser';
import { Builder } from './builder';
import { XmlPreprocessor } from './xml-preprocessor';
import { XlsxSharedStringsService } from './xlsx-shared-strings.service';
import { MediaReplacementService } from './media-replacement.service';

export interface TemplateInfo {
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  fileName: string;
  size: number;
  variables: string[];
  loops: Array<{ arrayPath: string }>;
}

type TemplateFormat = TemplateInfo['format'];

export class FileHandler {
  private readonly parser: Parser;
  private readonly builder: Builder;
  private readonly preprocessor: XmlPreprocessor;
  private readonly sharedStringsService: XlsxSharedStringsService;
  private readonly mediaReplacementService: MediaReplacementService;

  constructor() {
    this.parser = new Parser();
    this.builder = new Builder();
    this.preprocessor = new XmlPreprocessor();
    this.sharedStringsService = new XlsxSharedStringsService(this.builder, this.preprocessor);
    this.mediaReplacementService = new MediaReplacementService();
  }

  getFormat(fileName: string): TemplateFormat {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case '.docx':
        return 'docx';
      case '.xlsx':
        return 'xlsx';
      case '.pptx':
        return 'pptx';
      case '.html':
      case '.htm':
        return 'html';
      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  }

  getMainDocumentPath(format: TemplateFormat): string {
    switch (format) {
      case 'docx':
        return 'word/document.xml';
      case 'xlsx':
        return 'xl/worksheets/sheet1.xml';
      case 'pptx':
        return 'ppt/slides/slide1.xml';
      default:
        return '';
    }
  }

  async loadZip(filePath: string): Promise<JSZip> {
    const buffer = fs.readFileSync(filePath);
    return this.loadZipFromBuffer(buffer);
  }

  async loadZipFromBuffer(buffer: Buffer): Promise<JSZip> {
    const zip = new JSZip();
    return zip.loadAsync(buffer);
  }

  async getFileContent(zip: JSZip, filePath: string): Promise<string> {
    const file = zip.file(filePath);
    if (!file) {
      throw new Error(`File not found in ZIP: ${filePath}`);
    }
    return file.async('text');
  }

  async getOptionalFileContent(zip: JSZip, filePath: string): Promise<string | null> {
    const file = zip.file(filePath);
    if (!file) {
      return null;
    }
    return file.async('text');
  }

  setFileContent(zip: JSZip, filePath: string, content: string): void {
    zip.file(filePath, content);
  }

  async parseTemplate(filePath: string): Promise<TemplateInfo> {
    const format = this.getFormat(filePath);
    const zip = await this.loadZip(filePath);
    const fileName = path.basename(filePath);
    const size = fs.statSync(filePath).size;
    return this.parseTemplateInfo(zip, format, fileName, size);
  }

  async parseTemplateBuffer(buffer: Buffer, fileName: string): Promise<TemplateInfo> {
    const format = this.getFormat(fileName);
    const zip = await this.loadZipFromBuffer(buffer);
    return this.parseTemplateInfo(zip, format, fileName, buffer.length);
  }

  async renderTemplate(templateBuffer: Buffer, data: any, fileName: string): Promise<Buffer> {
    const format = this.getFormat(fileName);
    const zip = await this.loadZipFromBuffer(templateBuffer);
    const originalSharedStringsXml =
      format === 'xlsx' ? await this.getOptionalFileContent(zip, 'xl/sharedStrings.xml') : null;

    for (const xmlPath of this.getXmlFilesToProcess(zip, format)) {
      const xml = await this.getFileContent(zip, xmlPath);
      const { xml: processedXml, issues } = this.preprocessor.process(xml);

      if (issues.length > 0) {
        console.warn(`Preprocessing issues in ${xmlPath}:`, issues);
      }

      const result = this.builder.buildXML(processedXml, data);
      this.setFileContent(zip, xmlPath, result.xml);
    }

    if (format === 'xlsx') {
      await this.sharedStringsService.processSharedStrings(zip, data);
      if (originalSharedStringsXml) {
        await this.sharedStringsService.expandSharedStringLoopRows(
          zip,
          data,
          originalSharedStringsXml
        );
      }
    }

    await this.mediaReplacementService.processMediaFiles(zip, data, format);
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  saveDocument(buffer: Buffer, outputPath: string): string {
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  }

  generateOutputFileName(templateName: string, format: string): string {
    const baseName = templateName.replace(/\.[^/.]+$/, '');
    return `${baseName}_${Date.now()}.${format}`;
  }

  private async parseTemplateInfo(
    zip: JSZip,
    format: TemplateFormat,
    fileName: string,
    size: number
  ): Promise<TemplateInfo> {
    const mainDocPath = this.getMainDocumentPath(format);
    const mainXml = await this.getFileContent(zip, mainDocPath);
    const parsed = this.parser.parse(mainXml);

    return {
      format,
      fileName,
      size,
      variables: parsed.variables,
      loops: parsed.loops.map((loop) => ({ arrayPath: loop.arrayPath })),
    };
  }

  private getXmlFilesToProcess(zip: JSZip, format: TemplateFormat): string[] {
    const files: string[] = [];

    switch (format) {
      case 'docx': {
        files.push('word/document.xml');

        const headerFiles = zip.file(/word\/header\d+\.xml/);
        const footerFiles = zip.file(/word\/footer\d+\.xml/);
        headerFiles.forEach((file) => files.push(file.name));
        footerFiles.forEach((file) => files.push(file.name));

        if (zip.file('word/footnotes.xml')) {
          files.push('word/footnotes.xml');
        }
        if (zip.file('word/endnotes.xml')) {
          files.push('word/endnotes.xml');
        }
        if (zip.file('word/comments.xml')) {
          files.push('word/comments.xml');
        }

        const chartFiles = zip.file(/word\/charts\/chart\d+\.xml/);
        const drawingFiles = zip.file(/word\/drawings\/drawing\d+\.xml/);
        chartFiles.forEach((file) => files.push(file.name));
        drawingFiles.forEach((file) => files.push(file.name));
        break;
      }

      case 'xlsx': {
        zip.file(/xl\/worksheets\/sheet\d+\.xml/).forEach((file) => files.push(file.name));
        zip.file(/xl\/charts\/chart\d+\.xml/).forEach((file) => files.push(file.name));
        break;
      }

      case 'pptx': {
        zip.file(/ppt\/slides\/slide\d+\.xml/).forEach((file) => files.push(file.name));
        zip.file(/ppt\/slideLayouts\/slideLayout\d+\.xml/).forEach((file) => files.push(file.name));
        zip.file(/ppt\/charts\/chart\d+\.xml/).forEach((file) => files.push(file.name));
        break;
      }

      case 'html': {
        const htmlFiles = zip.file(/\.html$/);
        if (htmlFiles.length > 0) {
          files.push(htmlFiles[0].name);
        }
        break;
      }
    }

    return files;
  }
}
