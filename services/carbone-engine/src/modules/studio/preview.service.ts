/**
 * Carbone Engine - Preview Service
 * 文档预览渲染服务，将Office文档转换为HTML以便在浏览器中显示
 */

import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export interface PreviewResult {
  html: string;
  format: string;
  images?: Array<{ id: string; data: string; contentType: string }>;
}

@Injectable()
export class PreviewService {
  /**
   * 根据格式生成预览HTML
   */
  async generatePreview(filePath: string, format: string): Promise<PreviewResult> {
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
   * Word文档预览 - 使用mammoth转换为HTML
   */
  private async previewDocx(buffer: Buffer): Promise<PreviewResult> {
    try {
      // mammoth接受Buffer直接传入
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

      // 包装HTML内容
      const html = this.wrapHtml(result.value, 'docx', images);

      return {
        html,
        format: 'docx',
        images
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to preview Word document: ${message}`);
    }
  }

  /**
   * Excel文档预览 - 转换为表格HTML
   */
  private async previewXlsx(buffer: Buffer): Promise<PreviewResult> {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      // 生成HTML表格
      let htmlContent = '';

      // 获取所有sheet名称
      const sheetNames = workbook.SheetNames;

      // 显示第一个sheet的内容
      if (sheetNames.length > 0) {
        const sheet = workbook.Sheets[sheetNames[0]];
        htmlContent = XLSX.utils.sheet_to_html(sheet, {
          editable: false,
          header: '',
          footer: ''
        });
      }

      // 添加sheet导航
      const tabsHtml = sheetNames.map((name, index) =>
        `<button class="sheet-tab ${index === 0 ? 'active' : ''}" data-sheet="${name}">${name}</button>`
      ).join('');

      const html = this.wrapHtml(htmlContent, 'xlsx', [], `
        <div class="sheet-tabs">${tabsHtml}</div>
        <div class="sheet-content" id="sheet-content"></div>
      `);

      return {
        html,
        format: 'xlsx'
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to preview Excel document: ${message}`);
    }
  }

  /**
   * PowerPoint预览 - 解析幻灯片内容
   */
  private async previewPptx(buffer: Buffer): Promise<PreviewResult> {
    try {
      const zip = await JSZip.loadAsync(buffer);

      // 获取幻灯片列表
      const slides: string[] = [];
      const slideFiles = Object.keys(zip.files)
        .filter(name => name.match(/ppt\/slides\/slide\d+\.xml$/))
        .sort();

      // 解析每个幻灯片
      for (const slideFile of slideFiles) {
        const file = zip.file(slideFile);
        if (file) {
          const content = await file.async('text');
          const slideHtml = this.parseSlideXml(content, zip);
          slides.push(slideHtml);
        }
      }

      // 生成幻灯片HTML
      const slidesHtml = slides.map((slide, index) => `
        <div class="slide ${index === 0 ? 'active' : ''}" data-slide="${index}">
          ${slide}
        </div>
      `).join('');

      // 添加幻灯片导航
      const navHtml = slides.map((_, index) =>
        `<button class="slide-nav ${index === 0 ? 'active' : ''}" data-slide="${index}">${index + 1}</button>`
      ).join('');

      const html = this.wrapHtml(slidesHtml, 'pptx', [], `
        <div class="slide-nav-container">${navHtml}</div>
        <div class="slides-container">${slidesHtml}</div>
      `);

      return {
        html,
        format: 'pptx'
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to preview PowerPoint document: ${message}`);
    }
  }

  /**
   * HTML文档预览
   */
  private async previewHtml(buffer: Buffer): Promise<PreviewResult> {
    const html = buffer.toString('utf-8');
    return {
      html,
      format: 'html'
    };
  }

  /**
   * 解析PPT幻灯片XML
   */
  private parseSlideXml(xmlContent: string, zip: JSZip): string {
    // 提取文本内容
    const textMatches = xmlContent.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const texts = textMatches.map(match => match.replace(/<a:t>|<\/a:t>/g, ''));

    // 提取图片引用
    const imageRefs: string[] = [];
    const picMatches = xmlContent.match(/<a:blip[^>]*r:embed="([^"]*)"[^>]*>/g) || [];
    for (const match of picMatches) {
      const embedId = match.match(/r:embed="([^"]*)"/)?.[1];
      if (embedId) {
        imageRefs.push(embedId);
      }
    }

    // 构建简单的幻灯片HTML
    let slideHtml = '<div class="slide-content">';

    if (texts.length > 0) {
      slideHtml += `<div class="slide-text"><p>${texts.join('</p><p>')}</p></div>`;
    }

    if (imageRefs.length > 0) {
      slideHtml += `<div class="slide-images">${imageRefs.length} images</div>`;
    }

    slideHtml += '</div>';

    return slideHtml;
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
    // 生成图片样式
    const imageStyles = images.map(img =>
      `.image-${img.id} { background-image: url('data:${img.contentType};base64,${img.data}'); }`
    ).join('\n');

    // 替换图片引用
    let processedContent = content;
    for (const img of images) {
      processedContent = processedContent.replace(
        new RegExp(`<img[^>]*src="[^"]*${img.id}"[^>]*>`, 'g'),
        `<div class="image-${img.id} embedded-image"></div>`
      );
    }

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
    h1, h2, h3 { margin: 20px 0 10px; }
    p { margin: 10px 0; line-height: 1.6; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    td, th { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f0f0f0; }
    tr:nth-child(even) { background: #fafafa; }

    /* Sheet tabs for Excel */
    .sheet-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .sheet-tab {
      padding: 8px 16px;
      background: #f0f0f0;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
    }
    .sheet-tab.active { background: #1890ff; color: white; border-color: #1890ff; }

    /* Slide navigation for PPT */
    .slide-nav-container { display: flex; gap: 8px; margin-bottom: 16px; justify-content: center; }
    .slide-nav {
      padding: 8px 16px;
      background: #f0f0f0;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
    }
    .slide-nav.active { background: #1890ff; color: white; border-color: #1890ff; }
    .slides-container { position: relative; }
    .slide { display: none; }
    .slide.active { display: block; }
    .slide-content {
      background: white;
      padding: 40px;
      min-height: 400px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    .slide-text p { font-size: 18px; margin: 10px 0; }

    /* Embedded images */
    .embedded-image {
      display: inline-block;
      max-width: 100%;
      height: auto;
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
    }

    /* Custom styles */
    ${imageStyles}
  </style>
</head>
<body>
  <div class="document-container">
    ${extraContent}
    ${processedContent}
  </div>
</body>
</html>`;
  }

  /**
   * 获取图片ContentType
   */
  private getImageContentType(ext: string): string {
    switch (ext) {
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.gif':
        return 'image/gif';
      case '.bmp':
        return 'image/bmp';
      default:
        return 'image/png';
    }
  }
}