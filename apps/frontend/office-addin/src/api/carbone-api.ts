/**
 * Office Addin - API 服务
 * 对接 Carbone Engine 的 AI 识别和模板生成 API
 */

import axios, { AxiosRequestConfig } from 'axios';
import { AISuggestion, TemplateConfig } from '../taskpane/store';
import { officeAddinRuntimeConfig } from '../config/runtime';
import { DocumentIR } from '../adapters/document-ir';

const LONG_RUNNING_WORKFLOW_TIMEOUT_MS = 360000;

// 获取 axios 配置（根据 URL 是否为 HTTPS）
// 注意：浏览器环境不需要 httpsAgent，浏览器会自动处理 TLS
function getAxiosConfig(_url: string, options: AxiosRequestConfig = {}): AxiosRequestConfig {
  const config: AxiosRequestConfig = { ...options };
  // 浏览器环境不需要 httpsAgent，浏览器有自己的证书处理机制
  // 如果需要忽略自签名证书，需要在浏览器中手动信任证书
  return config;
}

function isDraftDocumentTemplate(template: { fileName?: string }): boolean {
  const fileName = String(template.fileName || '').trim().toLowerCase();
  return fileName.startsWith('draft-');
}

function normalizeWorkflowLookupText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[（）()]/g, '')
    .replace(/\s+/g, '');
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
    skillId?: string;                   // AI Skill ID
    skill?: any;                        // AI Skill 对象
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
  hasValidFile?: boolean;
}

export interface TemplateFieldSpec {
  fieldId: string;
  valueMode?: 'scalar' | 'object' | 'list';
  type: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  policy?: 'dictionary_first' | 'enum_mapping' | 'format_only' | 'llm_translate';
  required?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
  sourceBindings?: Array<{
    blockId?: string;
    tokenId?: string;
    lang?: string;
    anchor?: {
      prefix?: string;
      suffix?: string;
    };
  }>;
  renderConfig?: {
    flattenForCarbone?: boolean;
    includeCanonicalValue?: boolean;
  };
}

export interface WorkflowFieldDictionaryEntry {
  aliases: string[];
  fieldId: string;
  type: string;
  policy?: TemplateFieldSpec['policy'];
  riskLevel?: TemplateFieldSpec['riskLevel'];
  required?: boolean;
  scope?: 'global' | 'tenant' | 'template';
  status?: 'draft' | 'reviewed' | 'approved' | 'active' | 'deprecated';
  version?: number;
}

export interface WorkflowTermEntry {
  termId: string;
  applicableFieldIds: string[];
  sourceLanguage?: string;
  sourceValue: string;
  normalizedSourceValue?: string;
  translations: Record<string, string>;
  scope?: 'global' | 'tenant' | 'template';
  status?: 'draft' | 'reviewed' | 'approved' | 'active' | 'deprecated';
  version?: number;
}

export interface WorkflowEnumItem {
  code: string;
  labels: Record<string, string>;
  aliases: string[];
  scope?: 'global' | 'tenant' | 'template';
  status?: 'draft' | 'reviewed' | 'approved' | 'active' | 'deprecated';
  version?: number;
}

export interface WorkflowTermAssets {
  fieldDictionary?: WorkflowFieldDictionaryEntry[];
  termbase?: WorkflowTermEntry[];
  enumMappings?: Record<string, WorkflowEnumItem[]>;
}

export interface TemplateFieldCandidate {
  candidateId: string;
  sourceBlockId: string;
  anchorText: string;
  localAnchorText?: string;
  parameterSlot?: string;
  sampleValue: string;
  segmentText: string;
  sectionId?: string;
  sectionTitle?: string;
  fieldTypeHint?: string;
  generationPolicyHint?: string;
  confidence: number;
  fieldIdHint?: string;
  matchText?: string;
  matchReason?: string;
  compareMode?: 'section_loose_compare' | 'global_probe_fallback' | 'structure_only';
  sectionMatchScore?: number;
  location?: {
    blockType?: string;
    paragraphIndex?: number;
    tableIndex?: number;
    rowIndex?: number;
    cellIndex?: number;
    contentControlId?: number;
    anchorStart?: number;
    anchorEnd?: number;
  };
  languageRelation?: {
    mode: 'single_language' | 'adjacent_bilingual_block' | 'same_block_mixed_language' | 'unknown';
    currentLanguageHint?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
    peerBlockId?: string;
    peerLanguageHint?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
    peerCandidateId?: string;
    pairOrdinal?: number;
  };
}

export interface TemplateAnalyzeRequest {
  workflowId?: string;
  templateId?: string;
  skillId?: string;
  skill?: any;
  templateDocumentIr: DocumentIR;
  sampleDocument?: {
    fileName?: string;
    contentBase64?: string;
  };
  candidateFields?: TemplateFieldCandidate[];
  prefetchedUnderstanding?: TemplateUnderstandResponse;
  sourceLanguage?: string;
  targetLanguages?: string[];
  termAssets?: WorkflowTermAssets;
  options?: {
    enableTermMatch?: boolean;
    enableLayoutDetection?: boolean;
    templateType?: string;
    useMultiStage?: boolean;
    analysisExecutor?: 'studio' | 'chat';
    thinking?: boolean;
  };
}

export interface TemplateAnalyzeResponse {
  analysisId: string;
  languageProfile: {
    sourceLanguage: string;
    targetLanguages: string[];
    documentMode: string;
  };
  fields: Array<TemplateFieldSpec & {
    sample?: Record<string, string>;
    termMatch?: {
      status: 'matched' | 'unmatched';
      termId?: string;
      scope?: 'global' | 'tenant' | 'template';
    };
    confidence: number;
    needsReview: boolean;
  }>;
  warnings: string[];
}

export interface TemplateRecognizeBlockResult {
  blockId: string;
  blockType: string;
  title?: string;
  sectionTitle?: string;
  sourceExcerpt?: string;
  suggestionCount: number;
  fieldIds: string[];
  aiCallSucceeded: boolean;
  resultStatus: 'succeeded' | 'partial_success' | 'fallback_success' | 'failed' | 'empty';
  warnings: string[];
  retryCount: number;
  durationMs: number;
  errorCode?: string;
  fallbackReason?: string;
  contextAnalysis?: {
    requestSummary?: string;
    responseSummary?: string;
    cacheHit?: boolean;
    fallbackReason?: string;
    retryCount?: number;
    errorMessage?: string;
  };
}

export interface TemplateRecognizeContextAnalysis {
  requestedAI: boolean;
  usedAI: boolean;
  globalUnderstandingUsedAI?: boolean;
  resultSource?: 'ai' | 'rule_fallback' | 'ai+rule_fallback';
  resultStatus: 'succeeded' | 'partial_success' | 'fallback_success' | 'failed';
  requestTrace: {
    summary: string;
    sampleFileName?: string;
    blockCount: number;
    candidateFieldCount: number;
    requestCount?: number;
    promptTemplateVersion?: string;
    lastRequestSummary?: string;
  };
  responseTrace: {
    summary: string;
    mergedFieldCount: number;
    recognizedBlockCount: number;
    successBlockCount?: number;
    failedBlockCount?: number;
    lastResponseSummary?: string;
  };
  fallbackTrace: {
    usedFallback: boolean;
    reason?: string;
    fallbackBlockCount: number;
    fallbackLevel?: 'block' | 'task';
    fallbackBlockIds?: string[];
  };
  cacheTrace: {
    compareHit?: boolean;
    understandingHit?: boolean;
    recognitionHit: boolean;
  };
  debugArtifacts?: {
    promptRequestText?: string;
    rawAiResponse?: string;
  };
}

export interface TemplateRecognizeResponse extends TemplateAnalyzeResponse {
  blockResults: TemplateRecognizeBlockResult[];
  contextAnalysis: TemplateRecognizeContextAnalysis;
}

export interface TemplateCompareResponse {
  workflowId: string;
  compareId: string;
  candidateFields: TemplateFieldCandidate[];
  compareSummary: {
    candidateCount: number;
    sectionCount: number;
    sections: Array<{
      sectionId: string;
      sectionTitle: string;
      candidateCount: number;
      matchedCandidateCount: number;
      unmatchedCandidateCount: number;
      highConfidenceCandidateCount: number;
      compareStatus: 'aligned' | 'partial' | 'attention';
      compareMode: 'section_loose_compare' | 'global_probe_fallback' | 'structure_only';
      looseMatchScore: number;
      topAnchors: string[];
      samplePreview?: string;
    }>;
    warnings: string[];
  };
  cacheStatus: {
    compareHit: boolean;
  };
}

export interface TemplateUnderstandResponse {
  analysisId: string;
  languageProfile: {
    sourceLanguage: string;
    targetLanguages: string[];
    documentMode: string;
  };
  summary: {
    documentTitle?: string;
    understandingSummaryText?: string;
    sampleFileName?: string;
    paragraphCount: number;
    tableCount: number;
    sectionHints: string[];
    terminologyCandidates: string[];
    fieldCandidateIds: string[];
    layoutFeatures: string[];
  };
  warnings: string[];
  contextAnalysis?: {
    usedAI: boolean;
    aiServiceUrl?: string;
    promptRequestText?: string;
    rawAiResponse?: string;
  };
}

export interface TemplateSaveRequest {
  templateId?: string;
  templateMeta?: {
    templateName?: string;
    sourceLanguage?: string;
    targetLanguages?: string[];
    documentMode?: string;
    termAssets?: WorkflowTermAssets;
  };
  templateDocumentIr: DocumentIR;
  templateFieldSpecs: TemplateFieldSpec[];
  saveMode?: 'draft_or_publish' | 'draft' | 'publish';
}

export interface TemplateSaveResponse {
  templateId: string;
  version: number;
  bindingPlanVersion: number;
  status: string;
  updatedAt: string;
}

export interface TemplateRenderDataRequest {
  templateId: string;
  userInput: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  userOverrides?: Record<string, unknown>;
  termAssets?: WorkflowTermAssets;
  thinking?: boolean;
}

export interface TemplateRenderDataResponse {
  data: Record<string, unknown>;
  sourceTrace: Record<string, unknown>;
  warnings: string[];
  missingFields: string[];
  needsReviewFields: string[];
}

export interface TemplateWorkflowSummary {
  workflowVersion?: string;
  templateFieldSpecs?: TemplateFieldSpec[];
  carboneBindingPlan?: {
    templateId?: string;
    version?: number;
    bindings?: Array<{
      fieldId: string;
      variablePath: string;
      valueSelector: string;
      language?: string;
      transform: string;
      required: boolean;
    }>;
  };
  languageProfile?: {
    sourceLanguage?: string;
    targetLanguages?: string[];
    documentMode?: string;
  };
  termAssets?: WorkflowTermAssets;
  status?: string;
  version?: number;
  bindingPlanVersion?: number;
}

export interface TemplateDetailResponse {
  id: string;
  fileName?: string;
  format: string;
  size?: number;
  config?: any;
  templateConfig?: any;
  templateWorkflow?: TemplateWorkflowSummary;
  templateAssetManifest?: TemplateAssetManifest; // 新增：模板资产清单
  suggestions?: any[];
  variables?: string[];
  skillId?: string;
}

/**
 * 渲染计划 (Render Plan)
 * 原 carboneBindingPlan 的更名与收敛版本
 */
export interface RenderPlan {
  templateId: string;
  version: number;
  bindings: Array<{
    fieldId: string;
    variablePath: string;
    valueSelector: string;
    language?: string;
    transform: string;
    required: boolean;
  }>;
}

/**
 * 模板资产清单 (Template Asset Manifest)
 * 包含模板的所有语义信息，可独立于数据库存在
 */
export interface TemplateAssetManifest {
  assetVersion: string; // 清单结构版本，例如 "1.0"
  templateId: string;
  fileName: string;
  format: string;
  fieldCount: number;
  templateFieldSpecs: TemplateFieldSpec[];
  languageProfile: {
    sourceLanguage: string;
    targetLanguages: string[];
    documentMode: string;
  };
  renderPlan: RenderPlan;
  renderPlanVersion: number;
  termAssets?: WorkflowTermAssets;
  metadata: {
    generatedAt: string;
    source: string;          // 例如 "office-addin"
    addinVersion?: string;
  };
}

/**
 * 模板资产导出负载
 */
export interface TemplateAssetExportPayload {
  templateId: string;
  includeBinary: boolean;
}

/**
 * 模板资产导入负载
 */
export interface TemplateAssetImportPayload {
  manifest: TemplateAssetManifest;
  templateBinary?: string; // Base64
}

class CarboneAPI {
  private baseUrl: string;

  constructor(baseUrl: string = officeAddinRuntimeConfig.apiBaseUrl) {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  private buildUnderstandFallbackFromAnalyze(
    request: TemplateAnalyzeRequest,
    analyzeResult: TemplateAnalyzeResponse
  ): TemplateUnderstandResponse {
    return {
      analysisId: analyzeResult.analysisId,
      languageProfile: analyzeResult.languageProfile,
      summary: {
        documentTitle: request.templateDocumentIr?.metadata?.title || request.sampleDocument?.fileName,
        understandingSummaryText: undefined,
        sampleFileName: request.sampleDocument?.fileName,
        paragraphCount: request.templateDocumentIr?.stats?.paragraphCount
          || request.templateDocumentIr?.elements?.filter((element) => element?.type === 'paragraph').length
          || 0,
        tableCount: request.templateDocumentIr?.stats?.tableCount
          || request.templateDocumentIr?.elements?.filter((element) => element?.type === 'table').length
          || 0,
        sectionHints: [],
        terminologyCandidates: analyzeResult.fields
          .filter((field) => field.termMatch?.status === 'matched')
          .map((field) => field.fieldId)
          .slice(0, 8),
        fieldCandidateIds: request.candidateFields?.length
          ? request.candidateFields.map((field) => field.fieldIdHint || field.candidateId)
          : analyzeResult.fields.map((field) => field.fieldId),
        layoutFeatures: analyzeResult.languageProfile.documentMode
          ? [analyzeResult.languageProfile.documentMode]
          : [],
      },
      warnings: [
        '当前后端未开放 understand 接口，已自动降级为 analyze 结果生成整体理解摘要。',
        ...(analyzeResult.warnings || []),
      ],
    };
  }

  private buildRecognizeFallbackFromAnalyze(
    request: TemplateAnalyzeRequest,
    analyzeResult: TemplateAnalyzeResponse
  ): TemplateRecognizeResponse {
    const elements = Array.isArray(request.templateDocumentIr?.elements)
      ? request.templateDocumentIr.elements
      : [];
    const blockResults = elements
      .filter((element) => ['paragraph', 'table', 'cell'].includes(String(element?.type || '')))
      .map((element) => {
        const blockId = String(element?.id || '');
        const normalizedExcerpt = normalizeWorkflowLookupText(element?.text);
        const matchedFields = analyzeResult.fields.filter((field) =>
          (field.sourceBindings || []).some((binding) => {
            if (String(binding.blockId || '') === blockId) {
              return true;
            }
            const anchorPrefix = normalizeWorkflowLookupText(binding.anchor?.prefix);
            return Boolean(anchorPrefix) && normalizedExcerpt.includes(anchorPrefix);
          })
        );
        return {
          blockId,
          blockType: String(element?.type || 'paragraph'),
          title: String(element?.text || '').trim().slice(0, 24) || blockId,
          sectionTitle: String(element?.text || '').trim().slice(0, 24) || blockId,
          sourceExcerpt: String(element?.text || '').trim().slice(0, 120),
          suggestionCount: matchedFields.length,
          fieldIds: matchedFields.map((field) => field.fieldId),
          aiCallSucceeded: false,
          resultStatus: matchedFields.length > 0 ? 'fallback_success' : 'empty',
          warnings: matchedFields.length > 0 ? [] : ['当前块未识别到字段候选'],
          retryCount: 0,
          durationMs: 0,
          fallbackReason: matchedFields.length > 0 ? 'rule_based_block_scan' : undefined,
          contextAnalysis: {
            requestSummary: `块 ${blockId || 'unknown'} 已进入识别队列`,
            responseSummary: matchedFields.length > 0
              ? `通过回退链路识别到 ${matchedFields.length} 个字段`
              : '当前块未返回字段候选',
            cacheHit: false,
            fallbackReason: matchedFields.length > 0 ? 'rule_based_block_scan' : undefined,
            retryCount: 0,
          },
        } as TemplateRecognizeBlockResult;
      });

    return {
      ...analyzeResult,
      blockResults,
      contextAnalysis: {
        requestedAI: true,
        usedAI: false,
        resultStatus: analyzeResult.fields.length > 0 ? 'fallback_success' : 'succeeded',
        requestTrace: {
          summary: '当前后端未开放 recognize 接口，已自动降级为 analyze 结果构造块级识别视图。',
          sampleFileName: request.sampleDocument?.fileName,
          blockCount: blockResults.length,
          candidateFieldCount: analyzeResult.fields.length,
        },
        responseTrace: {
          summary: analyzeResult.fields.length > 0
            ? `已合并 ${analyzeResult.fields.length} 个字段候选`
            : '当前未返回字段候选',
          mergedFieldCount: analyzeResult.fields.length,
          recognizedBlockCount: blockResults.filter((block) => block.suggestionCount > 0).length,
        },
        fallbackTrace: {
          usedFallback: true,
          reason: 'recognize 接口不可用，前端已回退到 analyze 结果',
          fallbackBlockCount: blockResults.filter((block) => block.resultStatus === 'fallback_success').length,
        },
        cacheTrace: {
          recognitionHit: false,
        },
      },
    };
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
      templateType: request.templateType || 'report',
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
    downloadUrl?: string;
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
   * AI生成参数数据
   * 根据用户描述和Skill Guide生成具体的参数值
   */
  async generateParameters(request: {
    description: string;  // 用户描述/元数据内容
    skill?: any;
    skillId?: string;
    thinking?: boolean;
  }): Promise<{
    success: boolean;
    generatedData?: any;
    error?: string;
    debugInfo?: {
      rawAiResponse?: string;
      cleanedAiResponse?: string;
      extractedJson?: string;
      parseError?: string;
      upstreamError?: string;
    };
  }> {
    const response = await axios.post(
      `${this.baseUrl}/studio/generate-parameters`,
      request,
      getAxiosConfig(this.baseUrl, { timeout: 360000 })  // 6分钟超时，AI生成可能需要较长时间
    );
    return response.data;
  }

  async analyzeTemplateWorkflow(request: TemplateAnalyzeRequest): Promise<TemplateAnalyzeResponse> {
    const response = await axios.post(
      `${this.baseUrl}/studio/template/analyze`,
      request,
      getAxiosConfig(this.baseUrl, { timeout: 60000 })
    );
    return response.data;
  }

  async compareTemplateWorkflow(request: TemplateAnalyzeRequest): Promise<TemplateCompareResponse> {
    const response = await axios.post(
      `${this.baseUrl}/studio/template/compare`,
      request,
      getAxiosConfig(this.baseUrl, { timeout: 60000 })
    );
    return response.data;
  }

  async understandTemplateWorkflow(request: TemplateAnalyzeRequest): Promise<TemplateUnderstandResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/studio/template/understand`,
        request,
        getAxiosConfig(this.baseUrl, { timeout: LONG_RUNNING_WORKFLOW_TIMEOUT_MS })
      );
      return response.data;
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        throw error;
      }

      const analyzeResult = await this.analyzeTemplateWorkflow(request);
      return this.buildUnderstandFallbackFromAnalyze(request, analyzeResult);
    }
  }

  async recognizeTemplateWorkflow(request: TemplateAnalyzeRequest): Promise<TemplateRecognizeResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/studio/template/recognize`,
        request,
        getAxiosConfig(this.baseUrl, { timeout: LONG_RUNNING_WORKFLOW_TIMEOUT_MS })
      );
      return response.data;
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        throw error;
      }
      const analyzeResult = await this.analyzeTemplateWorkflow(request);
      return this.buildRecognizeFallbackFromAnalyze(request, analyzeResult);
    }
  }

  /**
   * 保存模板资产清单
   * 兼容期内仍复用旧接口名，语义已收敛为字段定义 + renderPlan 资产保存。
   */
  async saveTemplateWorkflow(request: TemplateSaveRequest): Promise<TemplateSaveResponse> {
    const response = await axios.post(
      `${this.baseUrl}/studio/template/save`,
      request,
      getAxiosConfig(this.baseUrl, { timeout: 60000 })
    );
    return response.data;
  }

  async generateTemplateRenderData(request: TemplateRenderDataRequest): Promise<TemplateRenderDataResponse> {
    const response = await axios.post(
      `${this.baseUrl}/studio/template/render-data`,
      request,
      getAxiosConfig(this.baseUrl, { timeout: 60000 })
    );
    return response.data;
  }

  /**
   * 保存完整模板资产（包含模板文件，以及可选 AI Guide / Skill）
   * 支持复用已有模版ID（从预览生成的模版）。
   */
  async saveTemplateFull(request: {
    templateId?: string;  // 复用已有模版ID
    documentContent?: string;  // 如果使用已有模版ID，可以不传
    suggestions: AISuggestion[];
    templateConfig?: TemplateConfig;
    templateMeta?: {
      templateName?: string;
      sourceLanguage?: string;
      targetLanguages?: string[];
      documentMode?: string;
      termAssets?: WorkflowTermAssets;
    };
    templateDocumentIr?: DocumentIR;
    templateFieldSpecs?: TemplateFieldSpec[];
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

  /**
   * 获取模板列表
   */
  async getTemplates(options?: { includeDrafts?: boolean }): Promise<{
    templates: Array<{
      id: string;
      fileName?: string;
      format: string;
      size?: number;
      createdAt?: string;
      uploadedAt?: string;
      config?: any;
      suggestions?: any[];
    }>;
  }> {
    const response = await axios.get(
      `${this.baseUrl}/studio/templates`,
      getAxiosConfig(this.baseUrl)
    );
    const includeDrafts = options?.includeDrafts === true;
    return {
      ...response.data,
      templates: includeDrafts
        ? (response.data.templates || [])
        : (response.data.templates || []).filter((template: { fileName?: string }) => !isDraftDocumentTemplate(template)),
    };
  }

  /**
   * 获取模板详情
   */
  async getTemplate(templateId: string): Promise<TemplateDetailResponse> {
    const response = await axios.get(
      `${this.baseUrl}/studio/templates/${templateId}`,
      getAxiosConfig(this.baseUrl)
    );
    const templateWorkflow = response.data?.templateWorkflow || response.data?.templateConfig?.templateWorkflow;
    return {
      ...response.data,
      templateWorkflow,
    };
  }

  /**
   * 下载模板文件
   */
  getTemplateDownloadUrl(templateId: string): string {
    return `${this.baseUrl}/studio/download-template/${templateId}`;
  }

  /**
   * 获取AI Skill详情
   */
  async getSkill(skillId: string): Promise<{
    id: string;
    templateType?: string;
    parameters?: Array<{
      name: string;
      usage: string;
      dataType: string;
      extractionHint: string;
      example: string;
    }>;
    parameterization?: any;
    createdAt?: string;
  }> {
    const response = await axios.get(
      `${this.baseUrl}/studio/skill/${skillId}`,
      getAxiosConfig(this.baseUrl)
    );
    return response.data;
  }

  /**
   * 获取Skill下载URL
   */
  getSkillDownloadUrl(skillId: string): string {
    return `${this.baseUrl}/studio/download-skill/${skillId}`;
  }
}

export const carboneAPI = new CarboneAPI();
