/**
 * Office Addin - API 服务
 * 对接 Carbone Engine 的 AI 识别和模板生成 API
 */

import axios from 'axios';
import { AISuggestion, TemplateConfig } from '../taskpane/store';

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

/**
 * 直接AI识别请求 - 用于Office插件直接提交文档内容
 */
export interface DirectAIIdentifyRequest {
  documentContent: string;           // 文档文本内容（从Office获取）
  documentType: 'docx' | 'xlsx' | 'pptx' | 'text';  // 文档类型
  templateType?: string;              // 模板类型：report, invoice, contract, certificate 等
  context?: string;                   // 上下文信息（如文档用途描述）
  customRules?: Array<{               // 自定义识别规则
    pattern: string;
    targetPath: string;
    description?: string;
  }>;
}

export interface AIIdentifyResponse {
  suggestions: AISuggestion[];
  documentStructure?: DocumentStructure;
  templateConfig?: any;
  confidence: number;
  documentStats?: {
    totalElements: number;
    tables: number;
    images: number;
    potentialLoops: number;
  };
  contextAnalysis?: {
    detectedTemplateType: string;
    userIntent: string;
  };
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

  constructor(baseUrl: string = 'https://localhost:3443') {
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
   * 直接AI识别文档内容（新接口）- 用于Office插件
   * 无需上传模板，直接对从Office获取的文档内容进行AI识别
   * 识别需要填充的空白部分，生成模板变量建议
   */
  async identifyDocumentDirect(request: DirectAIIdentifyRequest): Promise<AIIdentifyResponse> {
    const response = await axios.post(
      `${this.baseUrl}/studio/direct-ai-identify`,
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