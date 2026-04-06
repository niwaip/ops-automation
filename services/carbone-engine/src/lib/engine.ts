/**
 * Carbone Engine - Main Engine Service
 * 核心引擎服务，整合所有模块
 */

import { Parser, ParsedTemplate } from './parser';
import { Builder, BuildOptions, BuildResult } from './builder';
import { FormatterPipeline } from './formatters';
import { FileHandler, TemplateInfo } from './file';

export interface RenderOptions extends BuildOptions {
  outputFormat?: 'docx' | 'xlsx' | 'pptx' | 'pdf' | 'html';
}

export interface PreviewOptions {
  sampleData?: boolean;
  maxRows?: number;
}

export class CarboneEngine {
  private parser: Parser;
  private builder: Builder;
  private formatterPipeline: FormatterPipeline;
  private fileHandler: FileHandler;

  constructor() {
    this.parser = new Parser();
    this.builder = new Builder();
    this.formatterPipeline = new FormatterPipeline();
    this.fileHandler = new FileHandler();
  }

  /**
   * 解析模板文件
   */
  async parseTemplate(filePath: string): Promise<TemplateInfo> {
    return this.fileHandler.parseTemplate(filePath);
  }

  /**
   * 解析模板buffer
   */
  async parseTemplateBuffer(buffer: Buffer, fileName: string): Promise<TemplateInfo> {
    return this.fileHandler.parseTemplateBuffer(buffer, fileName);
  }

  /**
   * 渲染模板生成文档
   */
  async render(
    templateBuffer: Buffer,
    data: any,
    fileName: string,
    options: RenderOptions = {}
  ): Promise<Buffer> {
    return this.fileHandler.renderTemplate(templateBuffer, data, fileName);
  }

  /**
   * 使用示例数据预览模板
   */
  async preview(
    templateBuffer: Buffer,
    fileName: string,
    options: PreviewOptions = {}
  ): Promise<{ buffer: Buffer; sampleData: any }> {
    const info = await this.fileHandler.parseTemplateBuffer(templateBuffer, fileName);

    // 生成示例数据
    const sampleData = this.generateSampleData(info, options.maxRows || 3);

    const buffer = await this.fileHandler.renderTemplate(templateBuffer, sampleData, fileName);

    return { buffer, sampleData };
  }

  /**
   * 根据模板变量生成示例数据
   */
  /**
   * 根据模板变量生成示例数据（公共方法）
   */
  generateSampleData(info: TemplateInfo, maxRows: number): any {
    const data: any = {};

    // 生成简单变量示例
    for (const variable of info.variables) {
      const cleanPath = variable.replace(/^d\./, '');
      const parts = cleanPath.split('.');

      // 构建嵌套结构
      let current = data;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }

      // 设置示例值
      const lastPart = parts[parts.length - 1];
      current[lastPart] = this.generateSampleValue(lastPart);
    }

    // 生成数组数据示例
    for (const loop of info.loops) {
      const arrayPath = loop.arrayPath.replace(/^d\./, '');
      const parts = arrayPath.split('.');
      const arrayName = parts[parts.length - 1];

      // 构建数组路径
      let current = data;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part]) {
          current[part] = {};
        }
        current = current[part];
      }

      // 创建示例数组
      current[arrayName] = [];
      for (let i = 0; i < maxRows; i++) {
        current[arrayName].push({
          id: i + 1,
          name: `Item ${i + 1}`,
          value: Math.floor(Math.random() * 1000),
          date: new Date().toISOString()
        });
      }
    }

    return data;
  }

  /**
   * 根据变量名生成示例值
   */
  private generateSampleValue(varName: string): any {
    const lowerName = varName.toLowerCase();

    if (lowerName.includes('date') || lowerName.includes('time')) {
      return new Date().toISOString();
    }
    if (lowerName.includes('price') || lowerName.includes('amount') || lowerName.includes('cost')) {
      return Math.floor(Math.random() * 1000) + 0.99;
    }
    if (lowerName.includes('count') || lowerName.includes('total') || lowerName.includes('qty')) {
      return Math.floor(Math.random() * 100);
    }
    if (lowerName.includes('id') || lowerName.includes('code')) {
      return `${varName.toUpperCase()}-${Math.floor(Math.random() * 10000)}`;
    }
    if (lowerName.includes('email')) {
      return 'sample@example.com';
    }
    if (lowerName.includes('phone') || lowerName.includes('tel')) {
      return '+1-234-567-8900';
    }
    if (lowerName.includes('name') || lowerName.includes('title')) {
      return `Sample ${varName}`;
    }
    if (lowerName.includes('desc') || lowerName.includes('content') || lowerName.includes('text')) {
      return 'This is sample content for preview.';
    }
    if (lowerName.includes('bool') || lowerName.includes('active') || lowerName.includes('enabled')) {
      return true;
    }

    return `{{${varName}}}`;
  }

  /**
   * 验证数据是否满足模板要求
   */
  validateData(templateInfo: TemplateInfo, data: any): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const variable of templateInfo.variables) {
      const value = this.builder.evaluatePath(variable, data);
      if (value === undefined || value === null) {
        missing.push(variable);
      }
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * 注册自定义格式化器
   */
  registerFormatter(name: string, fn: (value: any, ...params: any[]) => any): void {
    this.formatterPipeline.register(name, fn);
  }

  /**
   * 获取可用的格式化器列表
   */
  getAvailableFormatters(): string[] {
    return this.formatterPipeline.getAvailableFormatters();
  }
}