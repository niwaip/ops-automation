import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import { Parser } from './parser';
import { Builder } from './builder';
import { XmlPreprocessor } from './xml-preprocessor';
import { XlsxSharedStringsService } from './xlsx-shared-strings.service';
import { MediaReplacementService } from './media-replacement.service';
import { generateStudioRenderOutputFileName } from '../../render/resolved-render/utils/studio-render-controller.helper';

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
    await this.sanitizeOpenXmlPackage(zip, format);

    // Remove empty directory entries (e.g. 'word/', 'xl/') which cause Word OpenXML strict schema errors
    const fileKeys = Object.keys(zip.files);
    for (const key of fileKeys) {
      if ((zip.files[key] as any)?.dir || key.endsWith('/')) {
        delete zip.files[key];
      }
    }

    return zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  }

  /**
   * 清理 OpenXML 包中的开发态残留与冗余项（如 Word Add-in 任务窗格 WebExtension）
   */
  private async sanitizeOpenXmlPackage(zip: JSZip, format: TemplateFormat): Promise<void> {
    if (format !== 'docx' && format !== 'xlsx' && format !== 'pptx') {
      return;
    }

    const fileKeys = Object.keys(zip.files);
    const hasWebExtensions = fileKeys.some((k) => k.includes('webextension'));

    if (hasWebExtensions) {
      for (const key of fileKeys) {
        if (key.includes('webextension')) {
          delete zip.files[key];
        }
      }

      // 清理 _rels/.rels 中的 webextension 关系引用
      const rootRels = await this.getOptionalFileContent(zip, '_rels/.rels');
      if (rootRels) {
        const cleanedRootRels = rootRels.replace(
          /<Relationship[^>]+Type="[^"]*webextension[^"]*"[^>]*\/>\s*/gi,
          ''
        );
        this.setFileContent(zip, '_rels/.rels', cleanedRootRels);
      }

      // 清理 [Content_Types].xml 中的 webextension 覆盖声明
      const contentTypes = await this.getOptionalFileContent(zip, '[Content_Types].xml');
      if (contentTypes) {
        const cleanedContentTypes = contentTypes.replace(
          /<Override[^>]+PartName="[^"]*webextension[^"]*"[^>]*\/>\s*/gi,
          ''
        );
        this.setFileContent(zip, '[Content_Types].xml', cleanedContentTypes);
      }
    }
  }

  saveDocument(buffer: Buffer, outputPath: string): string {
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  }

  generateOutputFileName(
    templateName: string,
    format: string,
    data?: Record<string, any>
  ): string {
    return generateStudioRenderOutputFileName(templateName, format, data);
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

/**
 * 彻底清洗并规整 OpenXML 二进制包：剔除任务窗格 WebExtension、清除非法空目录条目，并使用标准 DEFLATE 压缩
 */
export async function sanitizeOpenXmlPackageBuffer(
  buffer: Buffer,
  format?: string
): Promise<Buffer> {
  const normFormat = format?.toLowerCase();
  if (normFormat && normFormat !== 'docx' && normFormat !== 'xlsx' && normFormat !== 'pptx') {
    return buffer;
  }

  // 必须是有效 ZIP 包（前4字节为 PK\x03\x04）
  if (!buffer || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return buffer;
  }

  try {
    const JSZip = require('jszip');
    const zip = new JSZip();
    await zip.loadAsync(buffer);

    const fileKeys = Object.keys(zip.files);
    const hasWebExtensions = fileKeys.some((k: string) => k.includes('webextension'));

    if (hasWebExtensions) {
      for (const key of fileKeys) {
        if (key.includes('webextension')) {
          delete zip.files[key];
        }
      }

      const rootRelsFile = zip.file('_rels/.rels');
      if (rootRelsFile) {
        const rootRels = await rootRelsFile.async('text');
        const cleanedRootRels = rootRels.replace(
          /<Relationship[^>]+Type="[^"]*webextension[^"]*"[^>]*\/>\s*/gi,
          ''
        );
        zip.file('_rels/.rels', cleanedRootRels);
      }

      const contentTypesFile = zip.file('[Content_Types].xml');
      if (contentTypesFile) {
        const contentTypes = await contentTypesFile.async('text');
        const cleanedContentTypes = contentTypes.replace(
          /<Override[^>]+PartName="[^"]*webextension[^"]*"[^>]*\/>\s*/gi,
          ''
        );
        zip.file('[Content_Types].xml', cleanedContentTypes);
      }
    }

    // 剔除空目录条目（如 'word/', 'xl/' 等），避免触发 Word 严格 XML 规范校验失败
    for (const key of Object.keys(zip.files)) {
      if ((zip.files[key] as any)?.dir || key.endsWith('/')) {
        delete zip.files[key];
      }
    }

    return await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  } catch (error) {
    console.warn('[sanitizeOpenXmlPackageBuffer] Failed to sanitize package buffer:', error);
    return buffer;
  }
}

