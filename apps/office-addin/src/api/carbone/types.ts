import type { AISuggestion, TemplateConfig } from '../../app/store';
import type { DocumentIR } from '../../host/adapters/document-ir';

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

