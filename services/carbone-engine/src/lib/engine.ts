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
   * 根据模版配置生成示例数据（使用真实的配置映射）
   * @param config 模版配置
   * @param rowCount 数据行数
   * @param useRealisticData 是否使用真实感数据（用于验证渲染效果）
   */
  generateSampleDataFromConfig(config: any, rowCount: number = 5, useRealisticData: boolean = true): any {
    const data: any = {};
    const timestamp = Date.now(); // 用于生成唯一标识

    // 生成变量映射数据
    if (config.variableMappings && Array.isArray(config.variableMappings)) {
      for (const mapping of config.variableMappings) {
        const path = mapping.path.replace(/^d\./, '');
        const parts = path.split('.');

        // 构建嵌套结构
        let current = data;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }

        // 设置示例值（优先使用sampleValue，否则根据类型生成）
        const lastPart = parts[parts.length - 1];
        if (mapping.sampleValue) {
          current[lastPart] = mapping.sampleValue;
        } else {
          current[lastPart] = this.generateSampleValueByType(mapping.type, lastPart);
        }
      }
    }

    // 生成表格循环数据
    if (config.tableLoops && Array.isArray(config.tableLoops)) {
      for (const tableLoop of config.tableLoops) {
        const arrayPath = tableLoop.arrayPath.replace(/^d\./, '');
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

        // 创建示例数组（使用列映射生成数据）
        const dataRowCount = tableLoop.dataRowCount || rowCount;
        current[arrayName] = [];

        for (let i = 0; i < dataRowCount; i++) {
          const row: any = {};

          // 根据列映射生成数据
          if (tableLoop.columnMappings && Array.isArray(tableLoop.columnMappings)) {
            for (const colMapping of tableLoop.columnMappings) {
              // 从变量路径提取字段名 (如 d.steps[].action -> action)
              const varPath = colMapping.variablePath;
              const fieldMatch = varPath.match(/\[\]\.(\w+)$/);
              const fieldName = fieldMatch ? fieldMatch[1] : colMapping.headerName.toLowerCase();

              // 生成每行不同的数据（忽略sampleValue，使用动态生成）
              // sampleValue仅作为类型参考，实际数据应该每行不同
              row[fieldName] = this.generateSampleValueByType('text', fieldName, i, useRealisticData);
            }
          }

          // 添加默认字段如果没有列映射
          if (!tableLoop.columnMappings || tableLoop.columnMappings.length === 0) {
            row.id = i + 1;
            row.name = `Item ${i + 1}`;
            row.value = `Value ${i + 1}`;
          }

          current[arrayName].push(row);
        }
      }
    }

    // 生成组合变量数据（如步骤截图）
    if (config.combinedVariables && Array.isArray(config.combinedVariables)) {
      for (const combined of config.combinedVariables) {
        if (combined.type === 'step-screenshot') {
          const arrayPath = combined.imagePath.match(/^d\.(\w+)\[\d+\]/);
          if (arrayPath) {
            const tableName = arrayPath[1];

            // 确保数组存在
            if (!data[tableName]) {
              data[tableName] = [];
            }

            // 确保步骤有截图字段
            const stepIndex = combined.stepNumber - 1;
            while (data[tableName].length <= stepIndex) {
              data[tableName].push({
                step: data[tableName].length + 1,
                action: '点击按钮',
                result: '成功',
                status: 'completed'
              });
            }

            // 设置截图（使用占位符图片URL）
            data[tableName][stepIndex].screenshot = `https://via.placeholder.com/500x350?text=Step+${combined.stepNumber}+Screenshot`;
          }
        }
      }
    }

    // 如果没有配置数据，使用默认示例数据
    if (Object.keys(data).length === 0) {
      data.summary = '本次自动化任务共执行 8 个步骤，耗时 120 秒，全部成功。';
      data.analysis = '基于提供的执行上下文日志，系统运行稳定，无异常报错。';
      data.date = new Date().toLocaleString('zh-CN');
    }

    return data;
  }

  /**
   * 根据类型生成示例值
   * @param type 数据类型
   * @param varName 变量名
   * @param index 索引
   * @param useRealisticData 是否使用真实感数据
   */
  private generateSampleValueByType(type: string, varName: string, index?: number, useRealisticData: boolean = true): any {
    const lowerName = varName.toLowerCase();
    const timestamp = Date.now();

    if (type === 'date' || lowerName.includes('date') || lowerName.includes('time')) {
      return new Date().toLocaleString('zh-CN');
    }
    if (type === 'number' || lowerName.includes('count') || lowerName.includes('total')) {
      return index !== undefined ? index + 1 : Math.floor(Math.random() * 100);
    }
    if (type === 'image') {
      return 'https://via.placeholder.com/500x350?text=Sample+Image';
    }
    if (lowerName.includes('step') || lowerName.includes('序号')) {
      return index !== undefined ? index + 1 : 1;
    }
    if (lowerName.includes('action') || lowerName.includes('操作') || lowerName.includes('步骤')) {
      // 使用真实感数据，生成更具区分度的操作描述
      if (useRealisticData) {
        const actions = [
          '用户登录系统',
          '查询数据列表',
          '点击提交按钮',
          '上传附件文件',
          '导出报表文档',
          '发送通知邮件',
          '删除临时文件',
          '刷新页面数据'
        ];
        return index !== undefined ? actions[index % actions.length] : '点击按钮';
      }
      return index !== undefined ? `步骤 ${index + 1} 操作` : '点击按钮';
    }
    if (lowerName.includes('result') || lowerName.includes('结果')) {
      // 使用真实感数据
      if (useRealisticData) {
        const results = [
          '执行成功',
          '数据已保存',
          '操作完成',
          '请求已发送',
          '文件已生成',
          '邮件已发送',
          '清理完成',
          '数据已更新'
        ];
        return index !== undefined ? results[index % results.length] : '成功';
      }
      return '成功';
    }
    if (lowerName.includes('status') || lowerName.includes('状态')) {
      return 'completed';
    }
    if (lowerName.includes('success') || lowerName.includes('成功')) {
      return '成功';
    }
    if (lowerName.includes('fail') || lowerName.includes('失败')) {
      return '无';
    }

    // 默认返回带有时间戳的示例数据，便于区分
    if (useRealisticData) {
      return index !== undefined ? `测试数据_${timestamp}_${index + 1}` : `测试值_${timestamp}`;
    }
    return index !== undefined ? `示例数据 ${index + 1}` : `示例 ${varName}`;
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