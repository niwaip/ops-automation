/**
 * Office Addin - API 服务
 * 对接 Carbone Engine 的 AI 识别和模板生成 API
 */

import axios from 'axios';
import { AISuggestion, TemplateConfig } from './store';

export interface DocumentStructure {
  elements: Array<{
    type: string;
    content: string;
    index: number;
    path?: string;
  }>;
  tables?: Array<{
    rows: number;
    cols: number;
    headerRow?: string[];
    startIndex: number;
  }>;
  images?: Array<{
    index: number;
    altText?: string;
  }>;
}

export interface AIIdentifyRequest {
  documentContent: string;
  documentType: 'docx' | 'xlsx' | 'pptx';
  templateType?: string;
  customRules?: Array<{
    pattern: string;
    targetPath: string;
  }>;
}

export interface AIIdentifyResponse {
  suggestions: AISuggestion[];
  documentStructure: DocumentStructure;
  confidence: number;
}

export interface GenerateTemplateRequest {
  documentContent: string;
  suggestions: AISuggestion[];
  templateConfig: TemplateConfig;
}

export interface GenerateTemplateResponse {
  success: boolean;
  generatedTemplate: string;
  previewData?: Record<string, any>;
  validationErrors?: string[];
}

class CarboneAPI {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3100') {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  /**
   * 解析模板变量 (使用官方 Carbone)
   */
  async parseTemplate(templateContent: string): Promise<{
    variables: Array<{
      marker: string;
      path: string;
      formatter: string | null;
      isArray: boolean;
    }>;
    totalMarkers: number;
  }> {
    const response = await axios.post(
      `${this.baseUrl}/parse`,
      { template: templateContent },
      { timeout: 30000 }
    );
    return response.data;
  }

  /**
   * 渲染模板 (使用官方 Carbone)
   */
  async renderTemplate(
    templateContent: string,
    data: Record<string, any>,
    options?: { convertTo?: string }
  ): Promise<{ result: string; format: string }> {
    const response = await axios.post(
      `${this.baseUrl}/render`,
      {
        template: templateContent,
        data,
        options: options || {}
      },
      { timeout: 60000 }
    );
    return response.data;
  }

  /**
   * AI 识别文档结构
   */
  async identifyDocument(request: AIIdentifyRequest): Promise<AIIdentifyResponse> {
    const response = await axios.post(
      `${this.baseUrl}/studio/ai-identify`,
      request,
      { timeout: 60000 }
    );
    return response.data;
  }

  /**
   * 生成模板语法
   */
  async generateTemplate(request: GenerateTemplateRequest): Promise<GenerateTemplateResponse> {
    const response = await axios.post(
      `${this.baseUrl}/studio/generate`,
      request,
      { timeout: 30000 }
    );
    return response.data;
  }

  /**
   * 验证模板语法
   */
  async validateTemplate(templateContent: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const response = await axios.post(
      `${this.baseUrl}/studio/validate`,
      { template: templateContent }
    );
    return response.data;
  }

  /**
   * 预览渲染
   */
  async previewRender(
    template: string,
    data: Record<string, any>
  ): Promise<{ preview: string; format: string }> {
    const response = await axios.post(
      `${this.baseUrl}/studio/preview`,
      { template, data }
    );
    return response.data;
  }

  /**
   * 获取模板类型列表
   */
  async getTemplateTypes(): Promise<Array<{ id: string; name: string; description: string }>> {
    const response = await axios.get(`${this.baseUrl}/studio/template-types`);
    return response.data;
  }

  /**
   * 获取格式化器列表
   */
  async getFormatters(): Promise<Array<{
    name: string;
    syntax: string;
    description: string;
    example: string;
  }>> {
    const response = await axios.get(`${this.baseUrl}/studio/formatters`);
    return response.data;
  }
}

export const carboneAPI = new CarboneAPI();