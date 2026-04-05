/**
 * Carbone Engine - File Handler
 * 处理Office Open XML文件的ZIP结构
 */

import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import { Parser, ParsedTemplate } from './parser';
import { Builder, BuildResult } from './builder';
import { XmlPreprocessor } from './xml-preprocessor';

export interface TemplateInfo {
  format: 'docx' | 'xlsx' | 'pptx' | 'html';
  fileName: string;
  size: number;
  variables: string[];
  loops: Array<{ arrayPath: string }>;
}

export interface OfficeDocumentStructure {
  contentTypes: string;
  mainDocument: string;
  worksheets?: string[];
  slides?: string[];
  styles?: string;
  headers?: string[];
  footers?: string[];
}

export class FileHandler {
  private parser: Parser;
  private builder: Builder;
  private preprocessor: XmlPreprocessor;

  constructor() {
    this.parser = new Parser();
    this.builder = new Builder();
    this.preprocessor = new XmlPreprocessor();
  }

  /**
   * 根据文件扩展名确定文档格式
   */
  getFormat(fileName: string): 'docx' | 'xlsx' | 'pptx' | 'html' {
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

  /**
   * 获取Office文档的主XML文件路径
   */
  getMainDocumentPath(format: string): string {
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

  /**
   * 加载ZIP文件并解析结构
   */
  async loadZip(filePath: string): Promise<JSZip> {
    const buffer = fs.readFileSync(filePath);
    const zip = new JSZip();
    return zip.loadAsync(buffer);
  }

  /**
   * 从buffer加载ZIP
   */
  async loadZipFromBuffer(buffer: Buffer): Promise<JSZip> {
    const zip = new JSZip();
    return zip.loadAsync(buffer);
  }

  /**
   * 获取ZIP中的特定文件内容
   */
  async getFileContent(zip: JSZip, filePath: string): Promise<string> {
    const file = zip.file(filePath);
    if (!file) {
      throw new Error(`File not found in ZIP: ${filePath}`);
    }
    return file.async('text');
  }

  /**
   * 设置ZIP中的文件内容
   */
  setFileContent(zip: JSZip, filePath: string, content: string): void {
    zip.file(filePath, content);
  }

  /**
   * 解析模板文件，提取变量信息
   */
  async parseTemplate(filePath: string): Promise<TemplateInfo> {
    const format = this.getFormat(filePath);
    const zip = await this.loadZip(filePath);
    const fileName = path.basename(filePath);
    const size = fs.statSync(filePath).size;

    // 获取主文档内容
    const mainDocPath = this.getMainDocumentPath(format);
    const mainXml = await this.getFileContent(zip, mainDocPath);

    // 解析变量和循环
    const parsed = this.parser.parse(mainXml);

    return {
      format,
      fileName,
      size,
      variables: parsed.variables,
      loops: parsed.loops.map(l => ({ arrayPath: l.arrayPath }))
    };
  }

  /**
   * 解析模板buffer
   */
  async parseTemplateBuffer(buffer: Buffer, fileName: string): Promise<TemplateInfo> {
    const format = this.getFormat(fileName);
    const zip = await this.loadZipFromBuffer(buffer);

    const mainDocPath = this.getMainDocumentPath(format);
    const mainXml = await this.getFileContent(zip, mainDocPath);

    const parsed = this.parser.parse(mainXml);

    return {
      format,
      fileName,
      size: buffer.length,
      variables: parsed.variables,
      loops: parsed.loops.map(l => ({ arrayPath: l.arrayPath }))
    };
  }

  /**
   * 渲染模板并生成文档
   */
  async renderTemplate(
    templateBuffer: Buffer,
    data: any,
    fileName: string
  ): Promise<Buffer> {
    const format = this.getFormat(fileName);
    const zip = await this.loadZipFromBuffer(templateBuffer);

    // 获取所有需要处理的XML文件
    const xmlFiles = this.getXmlFilesToProcess(zip, format);

    for (const xmlPath of xmlFiles) {
      const xml = await this.getFileContent(zip, xmlPath);

      // 预处理XML（扁平化被拆分的文本节点）
      const { xml: processedXml, issues } = this.preprocessor.process(xml);

      // 记录预处理问题（如果有）
      if (issues.length > 0) {
        console.warn(`Preprocessing issues in ${xmlPath}:`, issues);
      }

      const result = this.builder.buildXML(processedXml, data);
      this.setFileContent(zip, xmlPath, result.xml);
    }

    // 处理sharedStrings（Excel特有）
    if (format === 'xlsx') {
      await this.processSharedStrings(zip, data);
    }

    // 处理图片替换
    await this.processMediaFiles(zip, data, format);

    // 生成输出ZIP
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  /**
   * 获取需要处理的XML文件列表
   */
  private getXmlFilesToProcess(zip: JSZip, format: string): string[] {
    const files: string[] = [];

    switch (format) {
      case 'docx':
        files.push('word/document.xml');

        // 处理headers和footers
        const headerFiles = zip.file(/word\/header\d+\.xml/);
        const footerFiles = zip.file(/word\/footer\d+\.xml/);
        headerFiles.forEach(f => files.push(f.name));
        footerFiles.forEach(f => files.push(f.name));

        // 处理脚注和尾注
        const footnotesFile = zip.file('word/footnotes.xml');
        const endnotesFile = zip.file('word/endnotes.xml');
        if (footnotesFile) files.push('word/footnotes.xml');
        if (endnotesFile) files.push('word/endnotes.xml');

        // 处理批注
        const commentsFile = zip.file('word/comments.xml');
        if (commentsFile) files.push('word/comments.xml');

        // 处理图表数据
        const chartFiles = zip.file(/word\/charts\/chart\d+\.xml/);
        chartFiles.forEach(f => files.push(f.name));

        // 处理文本框和其他drawing元素
        const drawingFiles = zip.file(/word\/drawings\/drawing\d+\.xml/);
        drawingFiles.forEach(f => files.push(f.name));
        break;

      case 'xlsx':
        // 处理所有工作表
        const sheetFiles = zip.file(/xl\/worksheets\/sheet\d+\.xml/);
        sheetFiles.forEach(f => files.push(f.name));

        // 处理图表
        const xlsxChartFiles = zip.file(/xl\/charts\/chart\d+\.xml/);
        xlsxChartFiles.forEach(f => files.push(f.name));
        break;

      case 'pptx':
        // 处理所有幻灯片
        const slideFiles = zip.file(/ppt\/slides\/slide\d+\.xml/);
        slideFiles.forEach(f => files.push(f.name));

        // 处理幻灯片布局
        const slideLayoutFiles = zip.file(/ppt\/slideLayouts\/slideLayout\d+\.xml/);
        slideLayoutFiles.forEach(f => files.push(f.name));

        // 处理图表
        const pptxChartFiles = zip.file(/ppt\/charts\/chart\d+\.xml/);
        pptxChartFiles.forEach(f => files.push(f.name));
        break;

      case 'html':
        // HTML直接处理整个文件
        const htmlFile = zip.file(/\.html$/);
        if (htmlFile.length > 0) {
          files.push(htmlFile[0].name);
        }
        break;
    }

    return files;
  }

  /**
   * 处理Excel的sharedStrings.xml
   */
  private async processSharedStrings(zip: JSZip, data: any): Promise<void> {
    const sharedStringsPath = 'xl/sharedStrings.xml';
    const sharedStringsFile = zip.file(sharedStringsPath);

    if (sharedStringsFile) {
      const xml = await sharedStringsFile.async('text');
      const { xml: processedXml } = this.preprocessor.process(xml);
      const result = this.builder.buildXML(processedXml, data);
      this.setFileContent(zip, sharedStringsPath, result.xml);
    }
  }

  /**
   * 处理媒体文件（图片替换）
   * 支持通过数据中的图片URL或Base64数据替换模板中的图片
   */
  private async processMediaFiles(zip: JSZip, data: any, format: string): Promise<void> {
    // 检查数据中是否有图片数据
    if (!data.images && !data.d?.images && !data.screenshots && !data.d?.screenshots) {
      return;
    }

    const imagesData = data.images || data.d?.images || data.screenshots || data.d?.screenshots || [];
    if (!Array.isArray(imagesData) || imagesData.length === 0) {
      return;
    }

    // 获取媒体文件夹中的图片列表
    const mediaPath = format === 'docx' ? 'word/media' :
                      format === 'xlsx' ? 'xl/media' :
                      format === 'pptx' ? 'ppt/media' : null;

    if (!mediaPath) return;

    const mediaFiles = zip.file(new RegExp(mediaPath.replace('/', '\\/') + '\\/image\\d+\\.[a-z]+'));

    // 替换图片
    for (let i = 0; i < Math.min(imagesData.length, mediaFiles.length); i++) {
      const imageData = imagesData[i];
      const mediaFile = mediaFiles[i];

      if (!imageData || !mediaFile) continue;

      try {
        // 支持URL或Base64数据
        if (imageData.url) {
          // 从URL获取图片
          const response = await fetch(imageData.url);
          const buffer = await response.arrayBuffer();
          zip.file(mediaFile.name, Buffer.from(buffer));
        } else if (imageData.base64) {
          // 从Base64数据创建图片
          const buffer = Buffer.from(imageData.base64, 'base64');
          zip.file(mediaFile.name, buffer);
        } else if (imageData.path) {
          // 从本地文件路径读取
          const buffer = fs.readFileSync(imageData.path);
          zip.file(mediaFile.name, buffer);
        }
      } catch (error) {
        console.warn(`Failed to replace image ${mediaFile.name}:`, error);
      }
    }
  }

  /**
   * 保存生成的文档到文件
   */
  saveDocument(buffer: Buffer, outputPath: string): string {
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  }

  /**
   * 生成唯一文件名
   */
  generateOutputFileName(templateName: string, format: string): string {
    const baseName = templateName.replace(/\.[^/.]+$/, '');
    return `${baseName}_${Date.now()}.${format}`;
  }
}