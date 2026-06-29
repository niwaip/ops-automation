import { TemplateAssetManifest, RenderPlan } from '../../studio/studio.types';

export type Primitive = string | number | boolean | null;

export interface WorkflowDocumentIR {
  host?: string;
  metadata?: Record<string, unknown>;
  elements?: WorkflowDocumentElement[];
  anchors?: WorkflowAnchor[];
  stats?: Record<string, unknown>;
}

export interface WorkflowDocumentElement {
  id: string;
  type: string;
  text?: string;
  anchorIds?: string[];
  hostData?: Record<string, unknown>;
}

export interface WorkflowAnchor {
  id: string;
  type: string;
  text?: string;
  ref?: Record<string, unknown>;
}

export interface WorkflowLanguageProfile {
  sourceLanguage: string;
  targetLanguages: string[];
  documentMode: string;
}

export type WorkflowAssetScope = 'global' | 'tenant' | 'template';
export type WorkflowAssetStatus = 'draft' | 'reviewed' | 'approved' | 'active' | 'deprecated';

export interface WorkflowSourceBinding {
  blockId?: string;
  tokenId?: string;
  lang?: string;
  anchor?: {
    prefix?: string;
    suffix?: string;
  };
}

export interface WorkflowTemplateFieldSpec {
  fieldId: string;
  valueMode?: 'scalar' | 'object' | 'list';
  type: string;
  description?: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  policy?: 'dictionary_first' | 'enum_mapping' | 'format_only' | 'llm_translate';
  required?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
  sourceBindings?: WorkflowSourceBinding[];
  renderConfig?: {
    flattenForCarbone?: boolean;
    includeCanonicalValue?: boolean;
  };
  itemSchema?: string[];
}

export interface WorkflowFieldDictionaryEntry {
  aliases: string[];
  fieldId: string;
  type: string;
  description?: string;
  policy: WorkflowTemplateFieldSpec['policy'];
  riskLevel: NonNullable<WorkflowTemplateFieldSpec['riskLevel']>;
  required?: boolean;
  scope?: WorkflowAssetScope;
  status?: WorkflowAssetStatus;
  version?: number;
}

export interface WorkflowTermEntry {
  termId: string;
  applicableFieldIds: string[];
  sourceLanguage?: string;
  sourceValue: string;
  normalizedSourceValue?: string;
  translations: Record<string, string>;
  scope?: WorkflowAssetScope;
  status?: WorkflowAssetStatus;
  version?: number;
}

export interface WorkflowEnumItem {
  code: string;
  labels: Record<string, string>;
  aliases: string[];
  scope?: WorkflowAssetScope;
  status?: WorkflowAssetStatus;
  version?: number;
}

export interface WorkflowTermAssets {
  fieldDictionary?: WorkflowFieldDictionaryEntry[];
  termbase?: WorkflowTermEntry[];
  enumMappings?: Record<string, WorkflowEnumItem[]>;
}

export type WorkflowResolvedAssets = {
  fieldDictionary: WorkflowFieldDictionaryEntry[];
  termbase: WorkflowTermEntry[];
  enumMappings: Record<string, WorkflowEnumItem[]>;
};

export interface WorkflowBindingPlanBinding {
  fieldId: string;
  variablePath: string;
  valueSelector: string;
  language?: string;
  transform: string;
  required: boolean;
}

export interface WorkflowBindingPlan {
  templateId: string;
  version: number;
  bindings: WorkflowBindingPlanBinding[];
}

export interface WorkflowAnalyzeFieldResult extends WorkflowTemplateFieldSpec {
  sample?: Record<string, string>;
  termMatch?: {
    status: 'matched' | 'unmatched';
    termId?: string;
    scope?: 'global' | 'tenant' | 'template';
  };
  confidence: number;
  needsReview: boolean;
}

export interface WorkflowAnalyzeResult {
  analysisId: string;
  languageProfile: WorkflowLanguageProfile;
  fields: WorkflowAnalyzeFieldResult[];
  warnings: string[];
}

export interface WorkflowCandidateLocation {
  blockType?: string;
  paragraphIndex?: number;
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
  contentControlId?: number;
  anchorStart?: number;
  anchorEnd?: number;
}

export interface WorkflowCandidateLanguageRelation {
  mode: 'single_language' | 'adjacent_bilingual_block' | 'same_block_mixed_language' | 'unknown';
  currentLanguageHint?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
  peerBlockId?: string;
  peerLanguageHint?: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown';
}

export interface WorkflowFieldCandidate {
  candidateId: string;
  sourceBlockId: string;
  anchorText: string;
  sampleValue: string;
  segmentText: string;
  description?: string;
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
  location?: WorkflowCandidateLocation;
  languageRelation?: WorkflowCandidateLanguageRelation;
}

export interface WorkflowCompareResult {
  workflowId: string;
  compareId: string;
  candidateFields: WorkflowFieldCandidate[];
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

export interface WorkflowRecognizeBlockResult {
  blockId: string;
  blockType: string;
  title?: string;
  sectionTitle?: string;
  sectionSummary?: string;
  sectionCompareStatus?: 'aligned' | 'partial' | 'attention';
  sectionCompareMode?: 'section_loose_compare' | 'global_probe_fallback' | 'structure_only';
  sectionMatchScore?: number;
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

export interface WorkflowRecognizeContextAnalysis {
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

export interface WorkflowRecognizeResult extends WorkflowAnalyzeResult {
  blockResults: WorkflowRecognizeBlockResult[];
  contextAnalysis: WorkflowRecognizeContextAnalysis;
}

export interface WorkflowRecognitionBlockInput {
  blockId: string;
  blockType: string;
  title: string;
  sectionId: string;
  sectionTitle: string;
  templateText: string;
  sampleText: string;
  candidates: WorkflowFieldCandidate[];
  fallbackFields: WorkflowAnalyzeFieldResult[];
  compareStatus: 'aligned' | 'partial' | 'attention';
  compareMode: 'section_loose_compare' | 'global_probe_fallback' | 'structure_only';
  sectionMatchScore: number;
  sectionSummary?: string;
}

export interface WorkflowCompareSectionContext {
  sectionId: string;
  sectionTitle: string;
  templateText: string;
  sampleText: string;
  samplePreview?: string;
  sampleMatchScore: number;
  compareMode: 'section_loose_compare' | 'global_probe_fallback' | 'structure_only';
}

export interface WorkflowCompareCandidateBuildResult {
  candidates: WorkflowFieldCandidate[];
  sectionContexts: WorkflowCompareSectionContext[];
  warnings: string[];
}

export interface WorkflowRecognitionAiSuggestion {
  candidateId?: string;
  fieldId?: string;
  fieldType?: string;
  description?: string;
  type?: string;
  policy?: WorkflowTemplateFieldSpec['policy'];
  riskLevel?: WorkflowTemplateFieldSpec['riskLevel'];
  confidence?: number;
  needsReview?: boolean;
  anchorText?: string;
  accepted?: boolean;
  shouldCreateField?: boolean;
  isField?: boolean;
}

export interface WorkflowUnderstandResult {
  analysisId: string;
  languageProfile: WorkflowLanguageProfile;
  summary: {
    documentTitle?: string;
    understandingSummaryText?: string;
    sampleFileName?: string;
    paragraphCount: number;
    tableCount: number;
    sectionHints: string[];
    sectionSummaries: Array<{
      sectionId: string;
      sectionTitle: string;
      sectionSummary: string;
      candidateCount: number;
      matchedCandidateCount: number;
      compareStatus: 'aligned' | 'partial' | 'attention';
      compareMode: 'section_loose_compare' | 'global_probe_fallback' | 'structure_only';
      looseMatchScore: number;
      samplePreview?: string;
    }>;
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

export interface WorkflowSaveMeta {
  templateName?: string;
  sourceLanguage?: string;
  targetLanguages?: string[];
  documentMode?: string;
  termAssets?: WorkflowTermAssets;
  addinVersion?: string;
}

export interface WorkflowSaveResult {
  templateId: string;
  version: number;
  bindingPlanVersion: number;
  status: 'draft' | 'ready' | 'published';
  updatedAt: string;
  carboneBindingPlan: WorkflowBindingPlan;
  renderPlan?: RenderPlan;
  templateAssetManifest?: TemplateAssetManifest;
}

export interface WorkflowRenderResult {
  data: Record<
    string,
    Primitive | Primitive[] | Record<string, unknown> | Array<Record<string, unknown>>
  >;
  sourceTrace: Record<string, Record<string, unknown>>;
  warnings: string[];
  missingFields: string[];
  needsReviewFields: string[];
}

export interface WorkflowRenderTranslationCandidate {
  fieldId: string;
  sourceLanguage: string;
  sourceText: string;
  pendingLanguages: string[];
}

export const GLOBAL_FIELD_DICTIONARY: WorkflowFieldDictionaryEntry[] = [
  {
    aliases: ['委托方', '甲方', '买方', 'entrusting party', 'buyer', '委託者'],
    fieldId: 'partyAName',
    type: 'legal_entity_name',
    description: '委托方（甲方）名称',
    policy: 'dictionary_first',
    riskLevel: 'high',
    required: true,
    scope: 'global',
    status: 'active',
    version: 1,
  },
  {
    aliases: ['受托方', '乙方', '卖方', 'seller', '受託者'],
    fieldId: 'partyBName',
    type: 'legal_entity_name',
    description: '受托方（乙方）名称',
    policy: 'dictionary_first',
    riskLevel: 'high',
    required: true,
    scope: 'global',
    status: 'active',
    version: 1,
  },
  {
    aliases: ['项目名称', '项目', 'project name', '件名'],
    fieldId: 'projectName',
    type: 'project_name',
    description: '项目名称',
    policy: 'dictionary_first',
    riskLevel: 'medium',
    required: true,
    scope: 'global',
    status: 'active',
    version: 1,
  },
  {
    aliases: ['服务地点', '服务场所', '交货地点', 'delivery place', 'service location', '場所'],
    fieldId: 'serviceLocation',
    type: 'geo_name',
    description: '服务地点/履行地点',
    policy: 'dictionary_first',
    riskLevel: 'medium',
    scope: 'global',
    status: 'active',
    version: 1,
  },
  {
    aliases: ['交货地点', 'delivery place'],
    fieldId: 'deliveryLocation',
    type: 'geo_name',
    description: '交货地点',
    policy: 'dictionary_first',
    riskLevel: 'medium',
    scope: 'global',
    status: 'active',
    version: 1,
  },
  {
    aliases: ['技术服务费总额', '服务费总额', '合同总额', '总金额', '总价', 'amount'],
    fieldId: 'serviceFeeTotal',
    type: 'currency_amount',
    description: '技术服务费总额（含税）',
    policy: 'format_only',
    riskLevel: 'high',
    required: true,
    scope: 'global',
    status: 'active',
    version: 1,
  },
  {
    aliases: ['付款方式', '支付方式', 'payment mode', 'payment method'],
    fieldId: 'paymentMode',
    type: 'enum',
    description: '付款方式',
    policy: 'enum_mapping',
    riskLevel: 'medium',
    required: true,
    scope: 'global',
    status: 'active',
    version: 1,
  },
  {
    aliases: ['银行账号', '银行账户', 'bank account', 'account no'],
    fieldId: 'bankAccount',
    type: 'bank_account',
    description: '银行账号',
    policy: 'format_only',
    riskLevel: 'high',
    scope: 'global',
    status: 'active',
    version: 1,
  },
  {
    aliases: ['签订日期', '签约日期', 'dated', 'date'],
    fieldId: 'signingDate',
    type: 'date',
    description: '合同签订日期',
    policy: 'format_only',
    riskLevel: 'high',
    scope: 'global',
    status: 'active',
    version: 1,
  },
  {
    aliases: ['验收期限', '验收天数', 'acceptance days'],
    fieldId: 'acceptanceDays',
    type: 'number',
    description: '甲方验收时间限制天数',
    policy: 'format_only',
    riskLevel: 'medium',
    scope: 'global',
    status: 'active',
    version: 1,
  },
  {
    aliases: ['付款期限', '付款截止天数', 'payment deadline'],
    fieldId: 'paymentDeadlineDays',
    type: 'number',
    description: '首次付款截止天数',
    policy: 'format_only',
    riskLevel: 'medium',
    scope: 'global',
    status: 'active',
    version: 1,
  },
  {
    aliases: ['服务内容', '服务范围', 'scope of service'],
    fieldId: 'serviceScopeSummary',
    type: 'text',
    description: '技术服务内容概要',
    policy: 'llm_translate',
    riskLevel: 'medium',
    scope: 'global',
    status: 'active',
    version: 1,
  },
];

export const GLOBAL_TERMBASE: WorkflowTermEntry[] = [
  {
    termId: 'tb_g_1001',
    applicableFieldIds: ['projectName'],
    sourceLanguage: 'zh',
    sourceValue: '无线网络设备更新',
    normalizedSourceValue: '无线网络设备更新',
    translations: {
      zh: '无线网络设备更新',
      ja: '無線設備更新',
      en: 'Wireless Equipment Refresh',
    },
    scope: 'global',
    status: 'active',
    version: 1,
  },
];

export const TENANT_TERMBASE: WorkflowTermEntry[] = [
  {
    termId: 'tb_1001',
    applicableFieldIds: ['partyAName', 'partyBName'],
    sourceLanguage: 'zh',
    sourceValue: '广州日产通商贸易有限公司',
    normalizedSourceValue: '广州日产通商贸易有限公司',
    translations: {
      zh: '广州日产通商贸易有限公司',
      ja: '広州日産通商貿易有限公司',
      en: 'Guangzhou Nissan Trading Co., Ltd.',
    },
    scope: 'tenant',
    status: 'approved',
    version: 5,
  },
  {
    termId: 'tb_1002',
    applicableFieldIds: ['projectName'],
    sourceLanguage: 'zh',
    sourceValue: '无线网络设备更新',
    normalizedSourceValue: '无线网络设备更新',
    translations: {
      zh: '无线网络设备更新',
      ja: '無線ネットワーク設備更新',
      en: 'Wireless Network Equipment Upgrade',
    },
    scope: 'tenant',
    status: 'approved',
    version: 5,
  },
];

export const GLOBAL_ENUM_MAPPINGS: Record<string, WorkflowEnumItem[]> = {
  paymentMode: [
    {
      code: 'one_time',
      labels: {
        zh: '一次支付',
        ja: '一回払い',
        en: 'one-time payment',
      },
      aliases: ['一次支付', '一次付款', '一次性支付', '一次'],
      scope: 'global',
      status: 'active',
      version: 1,
    },
    {
      code: 'installment',
      labels: {
        zh: '分期支付',
        ja: '分割払い',
        en: 'installment payment',
      },
      aliases: ['分期支付', '分期付款', '分期', '分次支付'],
      scope: 'global',
      status: 'active',
      version: 1,
    },
  ],
};

export function resolveDocumentMode(
  targetLanguages?: string[],
  explicitDocumentMode?: string
): string {
  if (typeof explicitDocumentMode === 'string' && explicitDocumentMode.trim()) {
    return explicitDocumentMode;
  }
  const TEMPLATE_DOCUMENT_MODE_BILINGUAL = 'bilingual';
  const TEMPLATE_DOCUMENT_MODE_SINGLE_LANGUAGE = 'single_language';
  return Array.isArray(targetLanguages) && targetLanguages.length > 0
    ? TEMPLATE_DOCUMENT_MODE_BILINGUAL
    : TEMPLATE_DOCUMENT_MODE_SINGLE_LANGUAGE;
}
