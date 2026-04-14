/**
 * Office Addin - API 服务
 * 对接 Carbone Engine 的 AI 识别和模板生成 API
 */

import axios, { AxiosRequestConfig } from 'axios';
import { AISuggestion, TemplateConfig } from '../taskpane/store';

// 获取 axios 配置（根据 URL 是否为 HTTPS）
// 注意：浏览器环境不需要 httpsAgent，浏览器会自动处理 TLS
function getAxiosConfig(url: string, options: AxiosRequestConfig = {}): AxiosRequestConfig {
  const config: AxiosRequestConfig = { ...options };
  // 浏览器环境不需要 httpsAgent，浏览器有自己的证书处理机制
  // 如果需要忽略自签名证书，需要在浏览器中手动信任证书
  return config;
}

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

  /**
   * 多阶段处理进度信息
   */
  export interface ProcessingProgressInfo {
    type: 'progress' | 'result' | 'error';
    stage?: string;       // 处理阶段
    stageName?: string;   // 阶段名称（中文）
    progress?: number;    // 进度百分比
    message?: string;     // 进度消息
    currentSection?: string;  // 当前处理章节
    data?: AIIdentifyResponse;  // 最终结果
    error?: string;       // 错误信息
  }

export interface AIIdentifyResponse {
  suggestions: AISuggestion[];
  rawSuggestions?: any[];  // 原始建议数据，包含详细信息
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
    usedAI?: boolean;  // 是否使用了AI分析
    aiServiceUrl?: string;  // AI服务地址
  };
}

export interface GenerateTemplateRequest {
  documentContent: string;
  suggestions: AISuggestion[];
  templateConfig: TemplateConfig;
  format?: string;
}

export interface GenerateTemplateResponse {
  success: boolean;
  generatedTemplate?: string;
  templateId?: string;
  downloadUrl?: string;
  previewData?: Record<string, any>;
  validationErrors?: string[];
  error?: string;
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
      getAxiosConfig(this.baseUrl, { timeout: 30000 })
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
      getAxiosConfig(this.baseUrl, { timeout: 60000 })
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
      getAxiosConfig(this.baseUrl, { timeout: 360000 })  // 6分钟超时，AI分析可能需要较长时间
    );
    return response.data;
  }

  /**
   * 多阶段AI识别文档内容（新接口）- 使用三阶段处理流程
   * 阶段1: 文档理解 - AI分析文档整体结构
   * 阶段2: 分段参数化 - 对每个章节进行语义识别
   * 阶段3: 整合确认 - 对所有结果进行整合确认
   */
  async identifyDocumentMultiStage(request: DirectAIIdentifyRequest): Promise<AIIdentifyResponse> {
    const response = await axios.post(
      `${this.baseUrl}/studio/direct-ai-identify-multistage`,
      request,
      getAxiosConfig(this.baseUrl, { timeout: 360000 })  // 6分钟超时
    );
    return response.data;
  }

  /**
   * 多阶段AI识别 - SSE实时进度版本
   * 使用Server-Sent Events实时推送处理进度
   * 返回EventSource对象，前端可通过onmessage接收进度和结果
   */
  identifyDocumentWithProgress(
    request: DirectAIIdentifyRequest,
    onProgress: (progress: ProcessingProgressInfo) => void,
    onResult: (result: AIIdentifyResponse) => void,
    onError: (error: string) => void
  ): void {
    // 构建URL参数（GET请求用于SSE）
    const params = new URLSearchParams({
      documentContent: request.documentContent,
      documentType: request.documentType,
      templateType: request.templateType || 'contract',
      context: request.context || ''
    });

    const url = `${this.baseUrl}/studio/direct-ai-identify-progress?${params.toString()}`;

    // 创建EventSource连接
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data: ProcessingProgressInfo = JSON.parse(event.data);

        if (data.type === 'progress') {
          onProgress(data);
        } else if (data.type === 'result') {
          onResult(data.data!);
          eventSource.close();
        } else if (data.type === 'error') {
          onError(data.error || 'Unknown error');
          eventSource.close();
        }
      } catch (err) {
        console.error('Failed to parse SSE data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      onError('Connection error');
      eventSource.close();
    };
  }

  /**
   * 生成模板语法
   */
  async generateTemplate(request: GenerateTemplateRequest): Promise<GenerateTemplateResponse> {
    const response = await axios.post(
      `${this.baseUrl}/studio/generate`,
      request,
      getAxiosConfig(this.baseUrl, { timeout: 30000 })
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
      `${this.baseUrl}/studio/validate-content`,
      { template: templateContent },
      getAxiosConfig(this.baseUrl)
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
      { template, data },
      getAxiosConfig(this.baseUrl)
    );
    return response.data;
  }

  /**
   * 预览模板内容（无需保存模板ID）
   * 接收已替换变量的文档内容，生成预览
   */
  async previewRenderContent(
    documentContent: string,
    templateConfig: any,
    format: string = 'docx'
  ): Promise<{
    success: boolean;
    previewUrl?: string;
    sampleData?: any;
    error?: string;
  }> {
    const response = await axios.post(
      `${this.baseUrl}/studio/preview-content`,
      { documentContent, templateConfig, format },
      getAxiosConfig(this.baseUrl, { timeout: 60000 })
    );
    return response.data;
  }

  /**
   * 获取模板类型列表
   */
  async getTemplateTypes(): Promise<Array<{ id: string; name: string; description: string }>> {
    const response = await axios.get(
      `${this.baseUrl}/studio/template-types`,
      getAxiosConfig(this.baseUrl)
    );
    return response.data;
  }

  /**
   * 生成AI使用指南Skill
   */
  async generateSkill(request: {
    templateId?: string;
    suggestions: AISuggestion[];
    templateConfig?: TemplateConfig;
    templateType?: string;
    documentDescription?: string;
  }): Promise<{
    success: boolean;
    skill?: any;
    skillId?: string;
    error?: string;
  }> {
    const response = await axios.post(
      `${this.baseUrl}/studio/generate-skill`,
      request,
      getAxiosConfig(this.baseUrl, { timeout: 60000 })
    );
    return response.data;
  }

  /**
   * 使用AI Skill进行参数化预览
   */
  async previewWithSkill(request: {
    templateId?: string;
    skillId?: string;
    skill?: any;
    simulatedData?: any;
  }): Promise<{
    success: boolean;
    previewUrl?: string;
    generatedData?: any;
    skillUsed?: any;
    error?: string;
  }> {
    const response = await axios.post(
      `${this.baseUrl}/studio/preview-with-skill`,
      request,
      getAxiosConfig(this.baseUrl, { timeout: 60000 })
    );
    return response.data;
  }

  /**
   * 保存完整模板（包含模板文件和AI Skill）
   */
  async saveTemplateFull(request: {
    documentContent: string;
    suggestions: AISuggestion[];
    templateConfig?: TemplateConfig;
    skill?: any;
    skillId?: string;
    format?: string;
    templateName?: string;
  }): Promise<{
    success: boolean;
    templateId?: string;
    skillId?: string;
    downloadUrl?: string;
    skillDownloadUrl?: string;
    error?: string;
  }> {
    const response = await axios.post(
      `${this.baseUrl}/studio/save-template-full`,
      request,
      getAxiosConfig(this.baseUrl, { timeout: 60000 })
    );
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
    const response = await axios.get(
      `${this.baseUrl}/studio/formatters`,
      getAxiosConfig(this.baseUrl)
    );
    return response.data;
  }
}

export const carboneAPI = new CarboneAPI();