/**
 * Carbone Engine - Preview Service
 * 文档预览渲染服务，将Office文档转换为PDF/HTML以便在浏览器中显示
 */

import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

const execAsync = promisify(exec);

export interface PreviewResult {
  html: string;
  format: string;
  previewType: 'pdf' | 'html';
  pdfBase64?: string;
  images?: Array<{ id: string; data: string; contentType: string }>;
}

@Injectable()
export class PreviewService {
  private libreOfficePath: string;
  private tmpDir: string;

  constructor() {
    // LibreOffice路径配置
    this.libreOfficePath = process.env.LIBREOFFICE_PATH || 'soffice';
    this.tmpDir = process.env.TMP_DIR || '/tmp/carbone-preview';

    // 创建临时目录
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  /**
   * 根据格式生成预览
   */
  async generatePreview(filePath: string, format: string): Promise<PreviewResult> {
    // 尝试使用LibreOffice转换为PDF（最佳预览效果）
    try {
      const pdfResult = await this.convertToPdf(filePath, format);
      if (pdfResult) {
        return pdfResult;
      }
    } catch (error) {
      console.warn('PDF conversion failed, falling back to HTML:', error);
    }

    // 回退到HTML预览
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

  /**
   * 使用LibreOffice转换为PDF
   */
  private async convertToPdf(filePath: string, format: string): Promise<PreviewResult | null> {
    // 检查LibreOffice是否可用
    try {
      await execAsync(`${this.libreOfficePath} --version`);
    } catch {
      console.warn('LibreOffice not available');
      return null;
    }

    const outputDir = path.join(this.tmpDir, `preview_${Date.now()}`);
    fs.mkdirSync(outputDir, { recursive: true });

    try {
      // 使用LibreOffice转换，添加字体嵌入选项
      const cmd = `${this.libreOfficePath} --headless --convert-to pdf:writer_pdf_Export --outdir "${outputDir}" "${filePath}"`;
      await execAsync(cmd, { timeout: 60000, env: { ...process.env, LANG: 'zh_CN.UTF-8' } });

      // 查找生成的PDF文件
      const files = fs.readdirSync(outputDir);
      const pdfFile = files.find(f => f.endsWith('.pdf'));

      if (!pdfFile) {
        throw new Error('PDF file not generated');
      }

      const pdfPath = path.join(outputDir, pdfFile);
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfBase64 = pdfBuffer.toString('base64');

      // 清理临时文件
      fs.rmSync(outputDir, { recursive: true, force: true });

      // 返回PDF查看器HTML
      const html = this.createPdfViewerHtml(pdfBase64);

      return {
        html,
        format,
        previewType: 'pdf',
        pdfBase64
      };
    } catch (error) {
      // 清理临时文件
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  /**
   * 创建PDF查看器HTML（使用PDF.js）
   */
  private createPdfViewerHtml(pdfBase64: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>PDF Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #525659;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    #toolbar {
      background: #323639;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: white;
      font-size: 13px;
    }
    #toolbar button {
      background: #4a4a4a;
      border: none;
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    #toolbar button:hover { background: #5a5a5a; }
    #toolbar span { margin-left: auto; }
    #pdf-container {
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
      gap: 10px;
    }
    canvas {
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      max-width: 100%;
    }
    .loading {
      color: white;
      font-size: 16px;
      padding: 40px;
    }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
</head>
<body>
  <div id="toolbar">
    <button id="prev-page">Previous</button>
    <span id="page-info">Page 1 of 1</span>
    <button id="next-page">Next</button>
    <button id="zoom-out">Zoom -</button>
    <span id="zoom-level">100%</span>
    <button id="zoom-in">Zoom +</button>
  </div>
  <div id="pdf-container">
    <div class="loading">Loading PDF...</div>
  </div>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const pdfData = '${pdfBase64}';
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let scale = 1.0;

    const container = document.getElementById('pdf-container');
    const pageInfo = document.getElementById('page-info');
    const zoomLevel = document.getElementById('zoom-level');

    function renderPage(num) {
      pageRendering = true;
      pdfDoc.getPage(num).then(function(page) {
        const viewport = page.getViewport({ scale: scale });
        const canvas = document.createElement('canvas');
        canvas.id = 'pdf-canvas';
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
          // 启用字体渲染优化
          enableWebGL: false,
          renderInteractiveForms: true
        };

        page.render(renderContext).promise.then(function() {
          pageRendering = false;
          if (pageNumPending !== null) {
            renderPage(pageNumPending);
            pageNumPending = null;
          }
        });

        container.innerHTML = '';
        container.appendChild(canvas);
        pageInfo.textContent = 'Page ' + num + ' of ' + pdfDoc.numPages;
      }).catch(function(err) {
        console.error('Page render error:', err);
        container.innerHTML = '<div class="loading">Error rendering page</div>';
      });
    }

    function queueRenderPage(num) {
      if (pageRendering) {
        pageNumPending = num;
      } else {
        renderPage(num);
      }
    }

    function onPrevPage() {
      if (pageNum <= 1) return;
      pageNum--;
      queueRenderPage(pageNum);
    }

    function onNextPage() {
      if (pageNum >= pdfDoc.numPages) return;
      pageNum++;
      queueRenderPage(pageNum);
    }

    function onZoomIn() {
      scale = Math.min(scale + 0.25, 3);
      zoomLevel.textContent = Math.round(scale * 100) + '%';
      queueRenderPage(pageNum);
    }

    function onZoomOut() {
      scale = Math.max(scale - 0.25, 0.5);
      zoomLevel.textContent = Math.round(scale * 100) + '%';
      queueRenderPage(pageNum);
    }

    document.getElementById('prev-page').addEventListener('click', onPrevPage);
    document.getElementById('next-page').addEventListener('click', onNextPage);
    document.getElementById('zoom-in').addEventListener('click', onZoomIn);
    document.getElementById('zoom-out').addEventListener('click', onZoomOut);

    // Load PDF
    const binaryString = atob(pdfData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 配置PDF.js以支持中文字体
    pdfjsLib.getDocument({
      data: bytes,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
      disableFontFace: false,
      fontExtraMaxSize: 1024 * 1024 * 10
    }).promise.then(function(pdf) {
      pdfDoc = pdf;
      pageInfo.textContent = 'Page ' + pageNum + ' of ' + pdf.numPages;
      renderPage(pageNum);
    }).catch(function(error) {
      console.error('PDF load error:', error);
      container.innerHTML = '<div class="loading">Error loading PDF: ' + error.message + '</div>';
    });
  </script>
</body>
</html>`;
  }

  /**
   * Word文档预览 - 使用mammoth转换为HTML（回退方案）
   */
  private async previewDocx(buffer: Buffer): Promise<PreviewResult> {
    try {
      const result = await mammoth.convertToHtml({ buffer }, {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Title'] => h1.title:fresh",
        ]
      });

      // 提取图片
      const images: Array<{ id: string; data: string; contentType: string }> = [];
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
              const contentType = this.getImageContentType(ext);
              images.push({
                id: fileName.replace('word/media/', ''),
                data: imageData,
                contentType
              });
            }
          }
        }
      }

      // 替换图片引用
      let processedContent = result.value;
      for (const img of images) {
        processedContent = processedContent.replace(
          new RegExp(`<img[^>]*src="[^"]*${img.id}"[^>]*>`, 'g'),
          `<img src="data:${img.contentType};base64,${img.data}" style="max-width:100%;height:auto;" />`
        );
      }

      const html = this.wrapHtml(processedContent, 'docx', images);

      return {
        html,
        format: 'docx',
        previewType: 'html',
        images
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to preview Word document: ${message}`);
    }
  }

  /**
   * Excel文档预览
   */
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
          footer: ''
        });
      }

      const tabsHtml = sheetNames.map((name, index) =>
        `<button class="sheet-tab ${index === 0 ? 'active' : ''}" data-sheet="${name}">${name}</button>`
      ).join('');

      const html = this.wrapHtml(htmlContent, 'xlsx', [], `<div class="sheet-tabs">${tabsHtml}</div>`);
      return { html, format: 'xlsx', previewType: 'html' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to preview Excel document: ${message}`);
    }
  }

  /**
   * PowerPoint预览
   */
  private async previewPptx(buffer: Buffer): Promise<PreviewResult> {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const slides: string[] = [];
      const slideFiles = Object.keys(zip.files)
        .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/))
        .sort();

      for (const slideFile of slideFiles) {
        const file = zip.file(slideFile);
        if (file) {
          const content = await file.async('text');
          const slideHtml = this.parseSlideXml(content);
          slides.push(slideHtml);
        }
      }

      const slidesHtml = slides.map((slide, index) =>
        `<div class="slide ${index === 0 ? 'active' : ''}">${slide}</div>`
      ).join('');

      const navHtml = slides.map((_, index) =>
        `<button class="slide-nav ${index === 0 ? 'active' : ''}" data-slide="${index}">${index + 1}</button>`
      ).join('');

      const html = this.wrapHtml(slidesHtml, 'pptx', [],
        `<div class="slide-nav-container">${navHtml}</div><div class="slides-container">${slidesHtml}</div>`);
      return { html, format: 'pptx', previewType: 'html' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to preview PowerPoint document: ${message}`);
    }
  }

  /**
   * HTML文档预览
   */
  private async previewHtml(buffer: Buffer): Promise<PreviewResult> {
    return {
      html: buffer.toString('utf-8'),
      format: 'html',
      previewType: 'html'
    };
  }

  /**
   * 解析PPT幻灯片XML
   */
  private parseSlideXml(xmlContent: string): string {
    const textMatches = xmlContent.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const texts = textMatches.map(match => match.replace(/<a:t>|<\/a:t>/g, ''));
    return `<div class="slide-content"><p>${texts.join('</p><p>')}</p></div>`;
  }

  /**
   * 包装HTML内容
   */
  private wrapHtml(
    content: string,
    format: string,
    images: Array<{ id: string; data: string; contentType: string }> = [],
    extraContent: string = ''
  ): string {
    const imageStyles = images.map(img =>
      `.image-${img.id} { background-image: url('data:${img.contentType};base64,${img.data}'); }`
    ).join('\n');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
      min-height: 100vh;
    }
    .document-container {
      background: white;
      max-width: 800px;
      margin: auto;
      padding: 40px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      min-height: 600px;
    }
    h1 { font-size: 24px; margin: 20px 0 10px; color: #1a1a1a; }
    h2 { font-size: 20px; margin: 18px 0 8px; color: #333; }
    h3 { font-size: 16px; margin: 14px 0 6px; color: #444; }
    p { margin: 10px 0; line-height: 1.8; color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    td, th { border: 1px solid #e0e0e0; padding: 10px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
    img { max-width: 100%; height: auto; }
    .sheet-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .sheet-tab {
      padding: 8px 16px;
      background: #f0f0f0;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
    }
    .sheet-tab.active { background: #1890ff; color: white; border-color: #1890ff; }
    .slide-nav-container { display: flex; gap: 8px; margin-bottom: 16px; justify-content: center; }
    .slide-nav { padding: 8px 16px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }
    .slide-nav.active { background: #1890ff; color: white; }
    .slide { display: none; }
    .slide.active { display: block; }
    .slide-content { padding: 40px; text-align: center; }
    .embedded-image { max-width: 100%; height: auto; }
    ${imageStyles}
  </style>
</head>
<body>
  <div class="document-container">
    ${extraContent}
    ${content}
  </div>
</body>
</html>`;
  }

  private getImageContentType(ext: string): string {
    const types: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp'
    };
    return types[ext] || 'image/png';
  }
}