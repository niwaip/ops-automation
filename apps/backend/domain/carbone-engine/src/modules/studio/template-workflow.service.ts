import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import JSZip from 'jszip';
import { getAiOrchestratorUrl } from '../../config/service-endpoints';
import { buildWorkflowUnderstandingPromptText } from './template-workflow.prompt';

type Primitive = string | number | boolean | null;

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

type WorkflowResolvedAssets = {
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

interface WorkflowRecognitionBlockInput {
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

interface WorkflowCompareSectionContext {
  sectionId: string;
  sectionTitle: string;
  templateText: string;
  sampleText: string;
  samplePreview?: string;
  sampleMatchScore: number;
  compareMode: 'section_loose_compare' | 'global_probe_fallback' | 'structure_only';
}

interface WorkflowCompareCandidateBuildResult {
  candidates: WorkflowFieldCandidate[];
  sectionContexts: WorkflowCompareSectionContext[];
  warnings: string[];
}

interface WorkflowRecognitionAiSuggestion {
  candidateId?: string;
  fieldId?: string;
  fieldType?: string;
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
}

export interface WorkflowSaveResult {
  templateId: string;
  version: number;
  bindingPlanVersion: number;
  status: 'draft' | 'ready' | 'published';
  updatedAt: string;
  carboneBindingPlan: WorkflowBindingPlan;
}

export interface WorkflowRenderResult {
  data: Record<string, Primitive | Primitive[] | Record<string, unknown> | Array<Record<string, unknown>>>;
  sourceTrace: Record<string, Record<string, unknown>>;
  warnings: string[];
  missingFields: string[];
  needsReviewFields: string[];
}

const GLOBAL_FIELD_DICTIONARY: WorkflowFieldDictionaryEntry[] = [
  {
    aliases: ['委托方', '甲方', '买方', 'entrusting party', 'buyer', '委託者'],
    fieldId: 'partyAName',
    type: 'legal_entity_name',
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
    policy: 'llm_translate',
    riskLevel: 'medium',
    scope: 'global',
    status: 'active',
    version: 1,
  },
];

const GLOBAL_TERMBASE: WorkflowTermEntry[] = [
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

const TENANT_TERMBASE: WorkflowTermEntry[] = [
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

const GLOBAL_ENUM_MAPPINGS: Record<string, WorkflowEnumItem[]> = {
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

@Injectable()
export class TemplateWorkflowService {
  private readonly logger = new Logger(TemplateWorkflowService.name);

  async understandTemplate(
    templateDocumentIr: WorkflowDocumentIR,
    sampleDocument: { fileName?: string; contentBase64?: string } | undefined,
    sourceLanguage = 'zh',
    targetLanguages: string[] = [],
    termAssets?: WorkflowTermAssets,
    candidateFields?: WorkflowFieldCandidate[],
  ): Promise<WorkflowUnderstandResult> {
    const assets = this.resolveAssets(termAssets);
    const analyzeResult = this.analyzeTemplate(
      templateDocumentIr,
      sampleDocument,
      sourceLanguage,
      targetLanguages,
      termAssets,
    );
    const compareCandidateBuildResult = candidateFields && candidateFields.length > 0
      ? undefined
      : await this.buildCompareCandidates(templateDocumentIr, analyzeResult.fields, sampleDocument, sourceLanguage, assets);
    const compareCandidates = candidateFields && candidateFields.length > 0
      ? candidateFields
      : compareCandidateBuildResult?.candidates || [];
    const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];
    const paragraphElements = elements.filter((element) => element.type === 'paragraph');
    const tableElements = elements.filter((element) => element.type === 'table');
    const sectionHints = this.buildFallbackSectionHints(elements);
    const fallbackTerminologyCandidates = Array.from(new Set(
      compareCandidates
        .flatMap((candidate) => [
          this.safeText(candidate.sampleValue),
          this.safeText(candidate.anchorText),
          this.safeText(candidate.sectionTitle),
        ])
        .filter((text) => Boolean(text) && text.length <= 40)
    )).slice(0, 8);
    const fallbackLayoutFeatures = [
      paragraphElements.length > 0 ? `paragraphs:${paragraphElements.length}` : '',
      tableElements.length > 0 ? `tables:${tableElements.length}` : '',
      targetLanguages.length > 0 ? `targets:${targetLanguages.join(',')}` : 'single_language',
      sampleDocument?.contentBase64 ? 'sample_attached' : 'template_only',
    ].filter(Boolean);
    const sampleText = await this.extractSampleTextRich(sampleDocument?.contentBase64, analyzeResult.warnings);
    const understandingContext = await this.generateUnderstandingSummaryWithAI({
      templateDocumentIr,
      sampleDocument,
      sampleText,
      sourceLanguage,
      targetLanguages,
      fallbackSectionHints: sectionHints,
      fallbackTerminologyCandidates,
      fallbackLayoutFeatures,
      fieldCandidateIds: compareCandidates.map((candidate) => candidate.fieldIdHint || candidate.candidateId),
      candidateFields: compareCandidates,
    });

    return {
      analysisId: analyzeResult.analysisId,
      languageProfile: analyzeResult.languageProfile,
      summary: {
        documentTitle:
          this.safeText(understandingContext.summary.documentTitle)
          || this.safeText(templateDocumentIr.metadata?.title)
          || undefined,
        understandingSummaryText:
          this.safeText(understandingContext.summary.understandingSummaryText)
          || this.buildFallbackWorkflowUnderstandingSummaryText({
            documentTitle:
              this.safeText(understandingContext.summary.documentTitle)
              || this.safeText(templateDocumentIr.metadata?.title)
              || this.safeText(sampleDocument?.fileName),
            sourceLanguage,
            targetLanguages,
            paragraphCount: paragraphElements.length,
            tableCount: tableElements.length,
            sectionHints: understandingContext.summary.sectionHints,
            terminologyCandidates: understandingContext.summary.terminologyCandidates,
            layoutFeatures: understandingContext.summary.layoutFeatures,
            fieldCandidateIds: analyzeResult.fields.map((field) => field.fieldId),
            sampleFileName: sampleDocument?.fileName,
          }),
        sampleFileName: sampleDocument?.fileName,
        paragraphCount: paragraphElements.length,
        tableCount: tableElements.length,
        sectionHints: understandingContext.summary.sectionHints,
        sectionSummaries: understandingContext.summary.sectionSummaries,
        terminologyCandidates: understandingContext.summary.terminologyCandidates,
        fieldCandidateIds: compareCandidates.map((candidate) => candidate.fieldIdHint || candidate.candidateId),
        layoutFeatures: understandingContext.summary.layoutFeatures,
      },
      warnings: Array.from(new Set([
        ...analyzeResult.warnings,
        ...(compareCandidateBuildResult?.warnings || []),
        ...understandingContext.summary.warnings,
      ])),
      contextAnalysis: {
        usedAI: understandingContext.usedAI,
        aiServiceUrl: understandingContext.aiServiceUrl,
        promptRequestText: understandingContext.promptRequestText,
        rawAiResponse: understandingContext.rawAiResponse,
      },
    };
  }

  async compareTemplate(
    templateDocumentIr: WorkflowDocumentIR,
    sampleDocument: { fileName?: string; contentBase64?: string } | undefined,
    sourceLanguage = 'zh',
    targetLanguages: string[] = [],
    termAssets?: WorkflowTermAssets,
    workflowId?: string,
  ): Promise<WorkflowCompareResult> {
    const assets = this.resolveAssets(termAssets);
    const analyzeResult = this.analyzeTemplate(
      templateDocumentIr,
      sampleDocument,
      sourceLanguage,
      targetLanguages,
      termAssets,
    );
    const compareCandidateBuildResult = await this.buildCompareCandidates(
      templateDocumentIr,
      analyzeResult.fields,
      sampleDocument,
      sourceLanguage,
      assets,
    );
    const compareSummary = this.buildCompareSummary(
      compareCandidateBuildResult.candidates,
      Array.from(new Set([...analyzeResult.warnings, ...compareCandidateBuildResult.warnings])),
      compareCandidateBuildResult.sectionContexts,
    );

    return {
      workflowId: workflowId || `wf_${Date.now()}`,
      compareId: `cmp_${Date.now()}`,
      candidateFields: compareCandidateBuildResult.candidates,
      compareSummary,
      cacheStatus: {
        compareHit: false,
      },
    };
  }

  analyzeTemplate(
    templateDocumentIr: WorkflowDocumentIR,
    sampleDocument: { fileName?: string; contentBase64?: string } | undefined,
    sourceLanguage = 'zh',
    targetLanguages: string[] = [],
    termAssets?: WorkflowTermAssets,
  ): WorkflowAnalyzeResult {
    const warnings: string[] = [];
    const languageProfile = this.buildLanguageProfile(sourceLanguage, targetLanguages);
    const normalizedSampleText = this.extractSampleText(sampleDocument?.contentBase64, warnings);
    const fields = this.discoverFields(
      templateDocumentIr,
      languageProfile,
      normalizedSampleText,
      this.resolveAssets(termAssets),
    );

    return {
      analysisId: `ana_${Date.now()}`,
      languageProfile,
      fields,
      warnings,
    };
  }

  async recognizeTemplate(
    templateDocumentIr: WorkflowDocumentIR,
    sampleDocument: { fileName?: string; contentBase64?: string } | undefined,
    sourceLanguage = 'zh',
    targetLanguages: string[] = [],
    termAssets?: WorkflowTermAssets,
    candidateFields?: WorkflowFieldCandidate[],
    prefetchedUnderstanding?: WorkflowUnderstandResult,
  ): Promise<WorkflowRecognizeResult> {
    const assets = this.resolveAssets(termAssets);
    const analyzeResult = this.analyzeTemplate(
      templateDocumentIr,
      sampleDocument,
      sourceLanguage,
      targetLanguages,
      termAssets,
    );
    const compareCandidateBuildResult = candidateFields && candidateFields.length > 0
      ? undefined
      : await this.buildCompareCandidates(templateDocumentIr, analyzeResult.fields, sampleDocument, sourceLanguage, assets);
    const compareCandidates = candidateFields && candidateFields.length > 0
      ? candidateFields
      : compareCandidateBuildResult?.candidates || [];
    const shouldAttemptAI = Boolean(sampleDocument?.contentBase64) && compareCandidates.length > 0;
    const reusedUnderstanding = prefetchedUnderstanding
      && prefetchedUnderstanding.languageProfile?.sourceLanguage === sourceLanguage
      && JSON.stringify(prefetchedUnderstanding.languageProfile?.targetLanguages || []) === JSON.stringify(targetLanguages)
      ? prefetchedUnderstanding
      : undefined;
    const understandingResult = reusedUnderstanding || (
      shouldAttemptAI
        ? await this.understandTemplate(
        templateDocumentIr,
        sampleDocument,
        sourceLanguage,
        targetLanguages,
        termAssets,
        compareCandidates,
      )
        : undefined
    );
    const sampleText = shouldAttemptAI
      ? await this.extractSampleTextRich(sampleDocument?.contentBase64, [])
      : '';
    const blockInputs = this.buildRecognitionBlocks(
      templateDocumentIr,
      compareCandidates,
      analyzeResult.fields,
      sampleText,
    );
    const mergedFields = new Map<string, WorkflowAnalyzeFieldResult>();
    const blockResults: WorkflowRecognizeBlockResult[] = [];
    let usedAI = false;
    let requestCount = 0;
    let lastPromptRequestText = '';
    let lastRawAiResponse = '';
    let lastRequestSummary = '';
    let lastResponseSummary = '';
    let aiSuccessBlockCount = 0;
    const fallbackBlockIds: string[] = [];

    for (const block of blockInputs) {
      const fallbackResult = this.buildFallbackRecognitionBlockResult(block);

      if (!shouldAttemptAI || block.candidates.length === 0) {
        if (fallbackResult.resultStatus === 'fallback_success') {
          fallbackBlockIds.push(block.blockId);
        }
        blockResults.push(fallbackResult);
        for (const field of block.fallbackFields) {
          this.mergeRecognizedField(mergedFields, field);
        }
        continue;
      }

      const promptRequestText = this.buildWorkflowRecognitionPrompt({
        block,
        understandingSummary: understandingResult?.summary.understandingSummaryText
          || understandingResult?.summary.documentTitle
          || '暂无整体理解摘要',
        sectionSummary: block.sectionTitle,
        sourceLanguage,
        targetLanguages,
        assets,
      });
      requestCount += 1;
      lastPromptRequestText = promptRequestText;
      lastRequestSummary = `当前块 ${block.blockId} (${block.sectionTitle || block.title})，候选数 ${block.candidates.length}`;

      try {
        const startedAt = Date.now();
        const rawAiResponse = await this.callWorkflowRecognitionAI(promptRequestText);
        const durationMs = Date.now() - startedAt;
        lastRawAiResponse = rawAiResponse;
        const parsed = this.parseWorkflowRecognitionAiResponse(rawAiResponse);
        const suggestions = this.normalizeWorkflowRecognitionSuggestions(parsed?.suggestions || parsed?.fields);
        const aiFields = suggestions
          .filter((suggestion) => this.shouldAcceptWorkflowSuggestion(suggestion))
          .map((suggestion) =>
            this.buildRecognizedFieldFromSuggestion(
              suggestion,
              block,
              sourceLanguage,
              targetLanguages,
              assets,
            )
          )
          .filter(Boolean) as WorkflowAnalyzeFieldResult[];

        if (aiFields.length === 0) {
          const fallbackBlock = {
            ...fallbackResult,
            durationMs,
            contextAnalysis: {
              ...fallbackResult.contextAnalysis,
              requestSummary: lastRequestSummary,
              responseSummary: 'AI 返回未形成可用字段，已回退到规则结果',
              errorMessage: 'AI 返回为空或无可接受字段',
            },
          };
          fallbackBlockIds.push(block.blockId);
          blockResults.push(fallbackBlock);
          for (const field of block.fallbackFields) {
            this.mergeRecognizedField(mergedFields, field);
          }
          lastResponseSummary = fallbackBlock.contextAnalysis?.responseSummary || '';
          continue;
        }

        usedAI = true;
        aiSuccessBlockCount += 1;
        for (const field of aiFields) {
          this.mergeRecognizedField(mergedFields, field);
        }
        const warnings = this.normalizeStringArray(parsed?.warnings, 6) || [];
        const responseSummary = this.safeText(parsed?.summary) || `AI 返回 ${aiFields.length} 个字段建议`;
        lastResponseSummary = responseSummary;
        blockResults.push({
          blockId: block.blockId,
          blockType: block.blockType,
          title: block.title,
          sectionTitle: block.sectionTitle,
          sourceExcerpt: block.templateText.slice(0, 120),
          suggestionCount: aiFields.length,
          fieldIds: aiFields.map((field) => field.fieldId),
          aiCallSucceeded: true,
          resultStatus: block.fallbackFields.length > aiFields.length ? 'partial_success' : 'succeeded',
          warnings,
          retryCount: 0,
          durationMs,
          contextAnalysis: {
            requestSummary: lastRequestSummary,
            responseSummary,
            cacheHit: false,
            retryCount: 0,
          },
        });
      } catch (error) {
        const durationMs = 0;
        const errorMessage = error instanceof Error ? error.message : 'unknown error';
        const fallbackBlock = {
          ...fallbackResult,
          durationMs,
          errorCode: 'ai_call_failed',
          contextAnalysis: {
            ...fallbackResult.contextAnalysis,
            requestSummary: lastRequestSummary,
            responseSummary: 'AI 调用失败，已回退到规则结果',
            errorMessage,
          },
        };
        fallbackBlockIds.push(block.blockId);
        blockResults.push(fallbackBlock);
        for (const field of block.fallbackFields) {
          this.mergeRecognizedField(mergedFields, field);
        }
        lastResponseSummary = fallbackBlock.contextAnalysis?.responseSummary || '';
      }
    }

    if (blockResults.length === 0) {
      for (const fallbackBlock of this.buildRecognitionBlockResults(templateDocumentIr, analyzeResult.fields)) {
        if (fallbackBlock.resultStatus === 'fallback_success') {
          fallbackBlockIds.push(fallbackBlock.blockId);
        }
        blockResults.push(fallbackBlock);
      }
      for (const field of analyzeResult.fields) {
        this.mergeRecognizedField(mergedFields, field);
      }
    }

    if (mergedFields.size === 0) {
      for (const field of analyzeResult.fields) {
        this.mergeRecognizedField(mergedFields, field);
      }
    }

    const recognizedFields = Array.from(mergedFields.values());
    const recognizedBlockCount = blockResults.filter((block) => block.suggestionCount > 0).length;
    const fallbackBlockCount = blockResults.filter((block) => block.resultStatus === 'fallback_success').length;
    const failedBlockCount = blockResults.filter((block) => block.resultStatus === 'failed').length;
    const resultStatus: WorkflowRecognizeContextAnalysis['resultStatus'] = usedAI
      ? (fallbackBlockCount > 0 ? 'partial_success' : 'succeeded')
      : (recognizedFields.length > 0 ? 'fallback_success' : 'failed');
    const resultSource: WorkflowRecognizeContextAnalysis['resultSource'] = usedAI
      ? (fallbackBlockCount > 0 ? 'ai+rule_fallback' : 'ai')
      : 'rule_fallback';

    return {
      ...analyzeResult,
      fields: recognizedFields,
      blockResults,
      warnings: Array.from(new Set([
        ...analyzeResult.warnings,
        ...(compareCandidateBuildResult?.warnings || []),
      ])),
      contextAnalysis: {
        requestedAI: shouldAttemptAI,
        usedAI,
        globalUnderstandingUsedAI: understandingResult?.contextAnalysis?.usedAI || false,
        resultSource,
        resultStatus,
        requestTrace: {
          summary: usedAI
            ? `已对 ${requestCount} 个块发起 AI 识别请求，并在服务端完成结果合并`
            : `基于 ${blockResults.length} 个文档块执行模板字段识别，当前回退到结构锚点与词典规则链路`,
          sampleFileName: sampleDocument?.fileName,
          blockCount: blockResults.length,
          candidateFieldCount: compareCandidates.length,
          requestCount,
          promptTemplateVersion: usedAI ? 'word-recognize-v1' : undefined,
          lastRequestSummary: lastRequestSummary || undefined,
        },
        responseTrace: {
          summary: recognizedFields.length > 0
            ? `已合并 ${recognizedFields.length} 个字段候选，命中 ${recognizedBlockCount} 个块`
            : '已完成块级扫描，但当前未返回字段候选',
          mergedFieldCount: recognizedFields.length,
          recognizedBlockCount,
          successBlockCount: aiSuccessBlockCount,
          failedBlockCount,
          lastResponseSummary: lastResponseSummary || undefined,
        },
        fallbackTrace: {
          usedFallback: fallbackBlockIds.length > 0 || !usedAI,
          reason: usedAI
            ? (fallbackBlockIds.length > 0 ? '部分块 AI 结果为空或失败，已降级回退' : undefined)
            : '当前请求未提供可用于块级 AI 识别的样本文档，已回退到规则链路',
          fallbackBlockCount,
          fallbackLevel: fallbackBlockIds.length > 0 ? 'block' : 'task',
          fallbackBlockIds: fallbackBlockIds.length > 0 ? Array.from(new Set(fallbackBlockIds)) : undefined,
        },
        cacheTrace: {
          compareHit: false,
          understandingHit: Boolean(reusedUnderstanding),
          recognitionHit: false,
        },
        debugArtifacts: {
          promptRequestText: lastPromptRequestText || understandingResult?.contextAnalysis?.promptRequestText,
          rawAiResponse: lastRawAiResponse || understandingResult?.contextAnalysis?.rawAiResponse,
        },
      },
    };
  }

  private buildRecognitionBlocks(
    templateDocumentIr: WorkflowDocumentIR,
    candidateFields: WorkflowFieldCandidate[],
    fields: WorkflowAnalyzeFieldResult[],
    sampleText: string,
  ): WorkflowRecognitionBlockInput[] {
    const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];
    const blockElements = elements.filter((element) =>
      ['paragraph', 'table', 'cell'].includes(String(element.type || ''))
      && Boolean(this.safeText(element.text))
    );

    if (blockElements.length === 0) {
      return fields.map((field, index) => {
        const sourceBinding = field.sourceBindings?.[0];
        const blockId = this.safeText(sourceBinding?.blockId) || `field-block-${index + 1}`;
        const templateText = this.safeText(sourceBinding?.anchor?.prefix || field.fieldId);
        return {
          blockId,
          blockType: 'synthetic',
          title: templateText || field.fieldId,
          sectionId: blockId,
          sectionTitle: templateText || field.fieldId,
          templateText,
          sampleText: this.extractBlockSampleExcerpt(sampleText, [], templateText),
          candidates: candidateFields.filter((candidate) => candidate.fieldIdHint === field.fieldId),
          fallbackFields: [field],
          compareStatus: 'attention',
          compareMode: 'structure_only',
          sectionMatchScore: 0,
        };
      });
    }

    return blockElements.map((element) => {
      const templateText = this.safeText(element.text);
      const sectionInfo = this.inferSectionInfo(elements, element.id, templateText);
      const relatedCandidates = candidateFields.filter((candidate) =>
        this.isCandidateMatchedToBlock(candidate, element.id, templateText, sectionInfo.sectionTitle)
      );
      const fallbackFields = fields.filter((field) =>
        relatedCandidates.some((candidate) => candidate.fieldIdHint && candidate.fieldIdHint === field.fieldId)
      );
      const compareStatus = this.computeCandidateGroupCompareStatus(relatedCandidates);
      const compareMode = this.computeCandidateGroupCompareMode(relatedCandidates);
      const sectionMatchScore = this.computeCandidateGroupCompareScore(relatedCandidates);

      return {
        blockId: element.id,
        blockType: String(element.type || 'paragraph'),
        title: this.inferRecognitionBlockTitle(templateText, String(element.type || 'paragraph')),
        sectionId: sectionInfo.sectionId,
        sectionTitle: sectionInfo.sectionTitle,
        templateText,
        sampleText: this.extractBlockSampleExcerpt(sampleText, relatedCandidates, templateText),
        candidates: relatedCandidates,
        fallbackFields,
        compareStatus,
        compareMode,
        sectionMatchScore,
      };
    });
  }

  private computeCandidateGroupCompareStatus(
    candidates: WorkflowFieldCandidate[],
  ): 'aligned' | 'partial' | 'attention' {
    if (candidates.length === 0) {
      return 'attention';
    }
    const matchedCount = candidates.filter((candidate) => Boolean(this.safeText(candidate.matchText))).length;
    if (matchedCount === 0) {
      return 'attention';
    }
    return matchedCount === candidates.length ? 'aligned' : 'partial';
  }

  private computeCandidateGroupCompareMode(
    candidates: WorkflowFieldCandidate[],
  ): 'section_loose_compare' | 'global_probe_fallback' | 'structure_only' {
    if (candidates.some((candidate) => candidate.compareMode === 'section_loose_compare')) {
      return 'section_loose_compare';
    }
    if (candidates.some((candidate) => candidate.compareMode === 'global_probe_fallback')) {
      return 'global_probe_fallback';
    }
    return 'structure_only';
  }

  private computeCandidateGroupCompareScore(candidates: WorkflowFieldCandidate[]): number {
    if (candidates.length === 0) {
      return 0;
    }
    return Math.max(
      ...candidates.map((candidate) => Number(candidate.sectionMatchScore || 0)),
    );
  }

  private isCandidateMatchedToBlock(
    candidate: WorkflowFieldCandidate,
    blockId: string,
    templateText: string,
    sectionTitle: string,
  ): boolean {
    if (candidate.sourceBlockId === blockId) {
      return true;
    }
    const normalizedTemplateText = this.normalizeLookupText(templateText);
    const normalizedAnchor = this.normalizeLookupText(candidate.anchorText);
    const normalizedSegment = this.normalizeLookupText(candidate.segmentText);
    const normalizedSectionTitle = this.normalizeLookupText(sectionTitle);
    const normalizedCandidateSection = this.normalizeLookupText(candidate.sectionTitle || candidate.sectionId);

    return Boolean(
      (normalizedAnchor && normalizedTemplateText.includes(normalizedAnchor))
      || (normalizedSegment && normalizedTemplateText.includes(normalizedSegment))
      || (normalizedCandidateSection && normalizedSectionTitle && normalizedCandidateSection === normalizedSectionTitle)
    );
  }

  private extractBlockSampleExcerpt(
    sampleText: string,
    candidates: WorkflowFieldCandidate[],
    fallbackText: string,
  ): string {
    const normalizedSampleText = this.safeText(sampleText);
    if (!normalizedSampleText) {
      return '';
    }

    const probes = [
      ...candidates.map((candidate) => this.safeText(candidate.matchText)),
      ...candidates.map((candidate) => this.safeText(candidate.sampleValue)),
      ...candidates.map((candidate) => this.safeText(candidate.anchorText)),
      this.safeText(fallbackText).slice(0, 20),
    ].filter(Boolean);

    for (const probe of probes) {
      const index = normalizedSampleText.indexOf(probe);
      if (index >= 0) {
        const start = Math.max(0, index - 80);
        const end = Math.min(normalizedSampleText.length, index + probe.length + 160);
        return normalizedSampleText.slice(start, end);
      }
    }

    return normalizedSampleText.slice(0, 240);
  }

  private buildFallbackRecognitionBlockResult(block: WorkflowRecognitionBlockInput): WorkflowRecognizeBlockResult {
    const suggestionCount = block.fallbackFields.length;
    const fallbackReason = suggestionCount > 0 ? 'rule_based_block_scan' : 'rule_based_empty';
    return {
      blockId: block.blockId,
      blockType: block.blockType,
      title: block.title,
      sectionTitle: block.sectionTitle,
      sourceExcerpt: block.templateText.slice(0, 120),
      suggestionCount,
      fieldIds: block.fallbackFields.map((field) => field.fieldId),
      aiCallSucceeded: false,
      resultStatus: suggestionCount > 0 ? 'fallback_success' : 'empty',
      warnings: suggestionCount > 0 ? [] : ['当前块未识别到字段候选'],
      retryCount: 0,
      durationMs: 0,
      fallbackReason,
      contextAnalysis: {
        requestSummary: `块 ${block.blockId} (${block.blockType}) 已进入识别队列`,
        responseSummary: suggestionCount > 0
          ? `通过回退链路识别到 ${suggestionCount} 个字段`
          : '当前块未返回字段候选',
        cacheHit: false,
        fallbackReason,
        retryCount: 0,
      },
    };
  }

  private buildWorkflowRecognitionPrompt(input: {
    block: WorkflowRecognitionBlockInput;
    understandingSummary: string;
    sectionSummary: string;
    sourceLanguage: string;
    targetLanguages: string[];
    assets: WorkflowResolvedAssets;
  }): string {
    const targetLanguageText = input.targetLanguages.length > 0
      ? input.targetLanguages.join(', ')
      : 'single_language';
    const candidateFieldsJson = JSON.stringify(input.block.candidates.slice(0, 8), null, 2);
    const relatedFieldIds = new Set(
      input.block.candidates
        .map((candidate) => candidate.fieldIdHint)
        .filter((fieldId): fieldId is string => Boolean(fieldId))
    );
    const dictionaryHints = input.assets.fieldDictionary
      .filter((entry) => relatedFieldIds.size > 0 && relatedFieldIds.has(entry.fieldId))
      .slice(0, 10)
      .map((entry) => `${entry.fieldId}: ${entry.aliases.slice(0, 5).join(' / ')} | ${entry.type} | ${entry.policy}`)
      .join('\n');
    const termHints = input.assets.termbase
      .filter((entry) => entry.applicableFieldIds.some((fieldId) => relatedFieldIds.has(fieldId)))
      .slice(0, 8)
      .map((entry) => `${entry.termId}: ${entry.sourceValue} => ${Object.entries(entry.translations).map(([lang, value]) => `${lang}:${value}`).join(', ')}`)
      .join('\n');
    const enumHints = Array.from(relatedFieldIds)
      .flatMap((fieldId) =>
        (input.assets.enumMappings[fieldId] || []).map((item: WorkflowEnumItem) =>
          `${fieldId}: ${item.code} => ${Object.entries(item.labels).map(([lang, value]) => `${lang}:${value}`).join(', ')}`
        )
      )
      .slice(0, 8)
      .join('\n');
    const sectionCompareHints = input.block.candidates
      .map((candidate) => [
        `candidateId=${candidate.candidateId}`,
        `compareMode=${candidate.compareMode || 'structure_only'}`,
        `sectionMatchScore=${candidate.sectionMatchScore || 0}`,
        `fieldIdHint=${candidate.fieldIdHint || 'unknown'}`,
        `matchText=${this.safeText(candidate.matchText || candidate.segmentText) || 'none'}`,
      ].join(' | '))
      .filter(Boolean)
      .slice(0, 5)
      .join('\n');

    return `你是合同模板参数识别助手。请基于当前章节、当前块文本和待定参数候选列表，识别哪些候选应成为正式模板字段。

要求：
1. 仅处理当前块相关的候选，不要扩散到整篇文档。
2. 优先依据当前章节内的完整文本比较、块上下文和候选片段判断，不要把字段词典是否命中当作唯一依据。
3. 若候选只是固定正文，不要输出为字段。
4. 若证据不足，请保守返回 needsReview=true。
5. 必须返回 JSON 对象，不要 markdown，不要代码块。
6. suggestions、warnings 必须分别是数组。

返回格式：
{
  "summary": "1-2 句说明当前块识别结果",
  "suggestions": [
    {
      "candidateId": "fc_1",
      "fieldId": "partyAName",
      "fieldType": "legal_entity_name",
      "policy": "llm_translate",
      "riskLevel": "high",
      "confidence": 0.96,
      "needsReview": false,
      "accepted": true
    }
  ],
  "warnings": []
}

输入信息：
- sourceLanguage: ${input.sourceLanguage}
- targetLanguages: ${targetLanguageText}
- understandingSummary: ${input.understandingSummary}
- sectionTitle: ${input.block.sectionTitle}
- sectionSummary: ${input.sectionSummary}
- sectionCompareStatus: ${input.block.compareStatus}
- sectionCompareMode: ${input.block.compareMode}
- sectionMatchScore: ${input.block.sectionMatchScore}
- blockId: ${input.block.blockId}
- blockType: ${input.block.blockType}
- templateText: ${input.block.templateText || '无'}
- sampleText: ${input.block.sampleText || '无'}

【当前块候选】
${candidateFieldsJson || '[]'}

【章节全文宽松比较命中的相似片段】
${sectionCompareHints || '无'}

【字段词典提示（仅增强与兜底，不参与候选主筛选）】
${dictionaryHints || '无'}

【术语提示】
${termHints || '无'}

【枚举提示】
${enumHints || '无'}
`;
  }

  private async callWorkflowRecognitionAI(prompt: string, retryCount = 0): Promise<string> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const aiModelId = process.env.AI_MODEL_ID || 'default';
    const maxRetries = 2;
    const actualPrompt = retryCount > 0
      ? `${prompt}\n\n【重要】请只返回 JSON 对象，不要 markdown，不要解释文字。`
      : prompt;

    try {
      const response = await axios.post<{ response?: string }>(
        `${aiOrchestratorUrl}/ai/models/${aiModelId}/test`,
        { prompt: actualPrompt },
        { timeout: 180000 },
      );
      const content = String(response.data?.response || '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      if (content) {
        return content;
      }

      if (retryCount < maxRetries) {
        return this.callWorkflowRecognitionAI(prompt, retryCount + 1);
      }

      throw new Error('AI 返回为空');
    } catch (error) {
      if (retryCount < maxRetries) {
        return this.callWorkflowRecognitionAI(prompt, retryCount + 1);
      }
      throw error;
    }
  }

  private parseWorkflowRecognitionAiResponse(content: string): Record<string, unknown> | undefined {
    return this.parseWorkflowUnderstandingAiResponse(content);
  }

  private normalizeWorkflowRecognitionSuggestions(value: unknown): WorkflowRecognitionAiSuggestion[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item) => item && typeof item === 'object')
      .map((item) => item as WorkflowRecognitionAiSuggestion);
  }

  private shouldAcceptWorkflowSuggestion(suggestion: WorkflowRecognitionAiSuggestion): boolean {
    if (suggestion.accepted === false || suggestion.shouldCreateField === false || suggestion.isField === false) {
      return false;
    }
    return Boolean(
      this.safeText(suggestion.fieldId)
      || this.safeText(suggestion.candidateId)
      || this.safeText(suggestion.anchorText)
    );
  }

  private buildRecognizedFieldFromSuggestion(
    suggestion: WorkflowRecognitionAiSuggestion,
    block: WorkflowRecognitionBlockInput,
    sourceLanguage: string,
    targetLanguages: string[],
    assets: WorkflowResolvedAssets,
  ): WorkflowAnalyzeFieldResult | undefined {
    const matchedCandidate = block.candidates.find((candidate) =>
      candidate.candidateId === suggestion.candidateId
      || (suggestion.fieldId && candidate.fieldIdHint === suggestion.fieldId)
      || (suggestion.anchorText && this.normalizeLookupText(candidate.anchorText) === this.normalizeLookupText(suggestion.anchorText))
    );
    const fieldId = this.normalizeWorkflowFieldId(
      suggestion.fieldId
      || matchedCandidate?.fieldIdHint
      || matchedCandidate?.anchorText
      || matchedCandidate?.candidateId
      || ''
    );
    if (!fieldId) {
      return undefined;
    }

    const fieldType = this.safeText(suggestion.fieldType || suggestion.type || matchedCandidate?.fieldTypeHint || 'text');
    const policy = this.normalizeWorkflowPolicy(
      suggestion.policy
      || matchedCandidate?.generationPolicyHint
      || this.inferPolicyFromType(fieldType)
    );
    const riskLevel = suggestion.riskLevel || this.inferRiskLevelFromType(fieldType);
    const sourceValue = this.safeText(matchedCandidate?.sampleValue);
    const termMatch = policy === 'dictionary_first' && sourceValue
      ? this.findTermMatch(fieldId, sourceValue, assets)
      : undefined;
    const sourceBinding: WorkflowSourceBinding = {
      blockId: block.blockId,
      lang: sourceLanguage,
      anchor: {
        prefix: matchedCandidate?.anchorText || this.extractAnchorPrefix(block.templateText),
        suffix: '',
      },
    };

    return {
      fieldId,
      valueMode: 'scalar',
      type: fieldType,
      sourceLanguage,
      targetLanguages,
      policy,
      required: ['high', 'medium'].includes(riskLevel || '') || Boolean(matchedCandidate?.fieldIdHint),
      riskLevel,
      sourceBindings: [sourceBinding],
      renderConfig: {
        flattenForCarbone: true,
        includeCanonicalValue: false,
      },
      sample: sourceValue ? { [sourceLanguage]: sourceValue } : undefined,
      termMatch: termMatch
        ? {
          status: 'matched',
          termId: termMatch.termId,
          scope: termMatch.scope,
        }
        : {
          status: 'unmatched',
        },
      confidence: this.normalizeConfidence(suggestion.confidence, matchedCandidate?.confidence),
      needsReview: suggestion.needsReview ?? this.normalizeConfidence(suggestion.confidence, matchedCandidate?.confidence) < 0.8,
    };
  }

  private mergeRecognizedField(
    target: Map<string, WorkflowAnalyzeFieldResult>,
    field: WorkflowAnalyzeFieldResult,
  ): void {
    const existing = target.get(field.fieldId);
    if (!existing) {
      target.set(field.fieldId, field);
      return;
    }

    const shouldReplace = field.confidence > existing.confidence
      || (existing.needsReview && !field.needsReview)
      || (existing.termMatch?.status !== 'matched' && field.termMatch?.status === 'matched');
    if (shouldReplace) {
      target.set(field.fieldId, field);
    }
  }

  private normalizeWorkflowFieldId(value: string): string {
    const raw = this.safeText(value)
      .replace(/^[dD]\./, '')
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!raw) {
      return '';
    }
    const camel = raw
      .split('_')
      .filter(Boolean)
      .map((segment, index) => {
        if (index === 0) {
          return segment.charAt(0).toLowerCase() + segment.slice(1);
        }
        return segment.charAt(0).toUpperCase() + segment.slice(1);
      })
      .join('');
    return camel || raw;
  }

  private inferPolicyFromType(fieldType: string): WorkflowTemplateFieldSpec['policy'] {
    if (fieldType === 'enum') {
      return 'enum_mapping';
    }
    if (['currency_amount', 'date', 'number', 'bank_account'].includes(fieldType)) {
      return 'format_only';
    }
    if (['legal_entity_name', 'project_name'].includes(fieldType)) {
      return 'dictionary_first';
    }
    return 'llm_translate';
  }

  private normalizeWorkflowPolicy(value: unknown): NonNullable<WorkflowTemplateFieldSpec['policy']> {
    if (value === 'dictionary_first' || value === 'enum_mapping' || value === 'format_only') {
      return value;
    }
    return 'llm_translate';
  }

  private inferRiskLevelFromType(fieldType: string): WorkflowTemplateFieldSpec['riskLevel'] {
    if (['currency_amount', 'date', 'bank_account', 'legal_entity_name'].includes(fieldType)) {
      return 'high';
    }
    if (['enum', 'project_name', 'number', 'geo_name'].includes(fieldType)) {
      return 'medium';
    }
    return 'low';
  }

  private normalizeConfidence(value: unknown, fallback = 0.72): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(numeric)) {
      if (numeric > 1 && numeric <= 100) {
        return Math.max(0, Math.min(1, numeric / 100));
      }
      return Math.max(0, Math.min(1, numeric));
    }
    return Math.max(0, Math.min(1, fallback));
  }

  compileAndPersistTemplate(
    templateId: string,
    templateMeta: WorkflowSaveMeta | undefined,
    templateFieldSpecs: WorkflowTemplateFieldSpec[],
    saveMode: 'draft_or_publish' | 'draft' | 'publish' | undefined,
  ): WorkflowSaveResult {
    const version = 1;
    const carboneBindingPlan = this.compileBindingPlan(
      templateId,
      version,
      templateFieldSpecs,
      templateMeta?.sourceLanguage || 'zh',
      templateMeta?.targetLanguages || [],
    );
    const status = saveMode === 'publish' ? 'published' : carboneBindingPlan.bindings.length > 0 ? 'ready' : 'draft';

    return {
      templateId,
      version,
      bindingPlanVersion: version,
      status,
      updatedAt: new Date().toISOString(),
      carboneBindingPlan,
    };
  }

  renderData(
    userInput: string,
    templateFieldSpecs: WorkflowTemplateFieldSpec[],
    carboneBindingPlan: WorkflowBindingPlan | undefined,
    sourceLanguage = 'zh',
    targetLanguages: string[] = [],
    userOverrides?: Record<string, unknown>,
    termAssets?: WorkflowTermAssets,
  ): WorkflowRenderResult {
    const warnings: string[] = [];
    const missingFields: string[] = [];
    const needsReviewFields: string[] = [];
    const sourceTrace: Record<string, Record<string, unknown>> = {};
    const fieldValueMap = new Map<string, Record<string, unknown>>();
    const assets = this.resolveAssets(termAssets);

    for (const spec of templateFieldSpecs) {
      const fieldResult = this.resolveFieldValue(
        spec,
        userInput,
        sourceLanguage,
        targetLanguages,
        userOverrides,
        assets,
      );
      fieldValueMap.set(spec.fieldId, fieldResult.value);
      sourceTrace[spec.fieldId] = fieldResult.sourceTrace;
      warnings.push(...fieldResult.warnings);
      missingFields.push(...fieldResult.missingFields);
      needsReviewFields.push(...fieldResult.needsReviewFields);
    }

    const bindings = carboneBindingPlan?.bindings || this.compileBindingPlan(
      'ad_hoc',
      1,
      templateFieldSpecs,
      sourceLanguage,
      targetLanguages,
    ).bindings;

    const data: WorkflowRenderResult['data'] = {};
    for (const binding of bindings) {
      const fieldValue = fieldValueMap.get(binding.fieldId);
      if (!fieldValue) {
        continue;
      }
      const selected = this.readSelector(fieldValue, binding.valueSelector);
      if (selected === undefined) {
        continue;
      }
      data[binding.variablePath] = selected as Primitive;
    }

    return {
      data,
      sourceTrace,
      warnings: Array.from(new Set(warnings)),
      missingFields: Array.from(new Set(missingFields)),
      needsReviewFields: Array.from(new Set(needsReviewFields)),
    };
  }

  private discoverFields(
    templateDocumentIr: WorkflowDocumentIR,
    languageProfile: WorkflowLanguageProfile,
    normalizedSampleText: string,
    assets: WorkflowResolvedAssets,
  ): WorkflowAnalyzeFieldResult[] {
    const candidates = new Map<string, WorkflowAnalyzeFieldResult>();
    const anchors = Array.isArray(templateDocumentIr.anchors) ? templateDocumentIr.anchors : [];
    const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];

    for (const anchor of anchors) {
      const anchorParagraphText = this.safeText(anchor.ref?.paragraphText);
      const anchorContext = [
        this.safeText(anchor.text),
        anchorParagraphText,
        this.safeText(anchor.ref?.title),
      ].filter(Boolean).join(' ');
      const dictionaryMatch = this.matchFieldDictionary(anchorContext, assets);
      if (!dictionaryMatch) {
        continue;
      }
      const existing = candidates.get(dictionaryMatch.fieldId);
      if (existing) {
        continue;
      }
      const matchedElement = elements.find((element) =>
        this.normalizeLookupText(element.text) === this.normalizeLookupText(anchorParagraphText)
      );
      candidates.set(dictionaryMatch.fieldId, this.buildAnalyzeFieldResult(
        dictionaryMatch,
        languageProfile,
        {
          blockId: matchedElement?.id || String(anchor.id || ''),
          lang: languageProfile.sourceLanguage,
          anchor: {
            prefix: this.extractAnchorPrefix(anchorParagraphText || anchorContext),
            suffix: '',
          },
        },
        normalizedSampleText,
        assets,
      ));
    }

    for (const element of elements) {
      const elementText = this.safeText(element.text);
      if (!elementText) {
        continue;
      }
      const dictionaryMatch = this.matchFieldDictionary(elementText, assets);
      if (!dictionaryMatch || candidates.has(dictionaryMatch.fieldId)) {
        continue;
      }
      candidates.set(dictionaryMatch.fieldId, this.buildAnalyzeFieldResult(
        dictionaryMatch,
        languageProfile,
        {
          blockId: element.id,
          lang: languageProfile.sourceLanguage,
          anchor: {
            prefix: this.extractAnchorPrefix(elementText),
            suffix: '',
          },
        },
        normalizedSampleText,
        assets,
      ));
    }

    return Array.from(candidates.values());
  }

  private buildAnalyzeFieldResult(
    dictionaryMatch: WorkflowFieldDictionaryEntry,
    languageProfile: WorkflowLanguageProfile,
    sourceBinding: WorkflowSourceBinding,
    normalizedSampleText: string,
    assets: WorkflowResolvedAssets,
  ): WorkflowAnalyzeFieldResult {
    const termMatch = this.findTermMatch(dictionaryMatch.fieldId, normalizedSampleText, assets);
    const sample = termMatch
      ? {
          [languageProfile.sourceLanguage]: termMatch.sourceValue,
          ...termMatch.translations,
        }
      : undefined;

    return {
      fieldId: dictionaryMatch.fieldId,
      valueMode: 'scalar',
      type: dictionaryMatch.type,
      sourceLanguage: languageProfile.sourceLanguage,
      targetLanguages: languageProfile.targetLanguages,
      policy: dictionaryMatch.policy,
      required: dictionaryMatch.required ?? false,
      riskLevel: dictionaryMatch.riskLevel,
      sourceBindings: [sourceBinding],
      renderConfig: {
        flattenForCarbone: true,
        includeCanonicalValue: false,
      },
      sample,
      termMatch: termMatch
        ? {
            status: 'matched',
            termId: termMatch.termId,
            scope: termMatch.scope,
          }
        : {
            status: 'unmatched',
          },
      confidence: termMatch ? 0.96 : 0.78,
      needsReview: !termMatch && dictionaryMatch.policy === 'dictionary_first',
    };
  }

  private buildRecognitionBlockResults(
    templateDocumentIr: WorkflowDocumentIR,
    fields: WorkflowAnalyzeFieldResult[],
  ): WorkflowRecognizeBlockResult[] {
    const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];
    const assets = this.resolveAssets();
    const blockCandidates = elements.filter((element) =>
      ['paragraph', 'table', 'cell'].includes(String(element.type || ''))
      && Boolean(this.safeText(element.text))
    );
    const blocks = blockCandidates.map((element) => {
      const sourceExcerpt = this.safeText(element.text).slice(0, 120);
      const normalizedExcerpt = this.normalizeLookupText(sourceExcerpt);
      let matchedFields = fields.filter((field) =>
        (field.sourceBindings || []).some((binding) => {
          const bindingBlockId = this.safeText(binding.blockId);
          if (bindingBlockId && bindingBlockId === element.id) {
            return true;
          }
          const anchorPrefix = this.normalizeLookupText(binding.anchor?.prefix);
          return Boolean(anchorPrefix) && normalizedExcerpt.includes(anchorPrefix);
        })
      );
      if (matchedFields.length === 0) {
        const dictionaryMatch = this.matchFieldDictionary(sourceExcerpt, assets);
        if (dictionaryMatch) {
          matchedFields = fields.filter((field) => field.fieldId === dictionaryMatch.fieldId);
        }
      }
      const fallbackReason = matchedFields.length > 0 ? 'rule_based_block_scan' : undefined;
      const resultStatus: WorkflowRecognizeBlockResult['resultStatus'] = matchedFields.length > 0
        ? 'fallback_success'
        : 'empty';

      return {
        blockId: element.id,
        blockType: String(element.type || 'paragraph'),
        title: this.inferRecognitionBlockTitle(sourceExcerpt, String(element.type || 'paragraph')),
        sectionTitle: this.inferRecognitionBlockTitle(sourceExcerpt, String(element.type || 'paragraph')),
        sourceExcerpt,
        suggestionCount: matchedFields.length,
        fieldIds: matchedFields.map((field) => field.fieldId),
        aiCallSucceeded: false,
        resultStatus,
        warnings: matchedFields.length > 0 ? [] : ['当前块未识别到字段候选'],
        retryCount: 0,
        durationMs: 0,
        fallbackReason,
        contextAnalysis: {
          requestSummary: `块 ${element.id} (${String(element.type || 'paragraph')}) 已进入识别队列`,
          responseSummary: matchedFields.length > 0
            ? `通过回退链路识别到 ${matchedFields.length} 个字段`
            : '当前块未返回字段候选',
          cacheHit: false,
          fallbackReason,
          retryCount: 0,
        },
      };
    });

    if (blocks.length > 0) {
      return blocks;
    }

    return fields.map((field, index) => {
      const sourceBinding = field.sourceBindings?.[0];
      const sourceExcerpt = this.safeText(sourceBinding?.anchor?.prefix || field.fieldId);
      return {
        blockId: sourceBinding?.blockId || `field-block-${index + 1}`,
        blockType: 'synthetic',
        title: sourceExcerpt || field.fieldId,
        sectionTitle: sourceExcerpt || field.fieldId,
        sourceExcerpt,
        suggestionCount: 1,
        fieldIds: [field.fieldId],
        aiCallSucceeded: false,
        resultStatus: 'fallback_success',
        warnings: [],
        retryCount: 0,
        durationMs: 0,
        fallbackReason: 'rule_based_field_mapping',
        contextAnalysis: {
          requestSummary: `字段 ${field.fieldId} 通过回退映射生成 synthetic block`,
          responseSummary: '已生成块级占位结果，便于前端展示字段来源',
          cacheHit: false,
          fallbackReason: 'rule_based_field_mapping',
          retryCount: 0,
        },
      };
    });
  }

  private async buildCompareCandidates(
    templateDocumentIr: WorkflowDocumentIR,
    fields: WorkflowAnalyzeFieldResult[],
    sampleDocument: { fileName?: string; contentBase64?: string } | undefined,
    sourceLanguage: string,
    assets: WorkflowResolvedAssets,
  ): Promise<WorkflowCompareCandidateBuildResult> {
    const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];
    const anchors = Array.isArray(templateDocumentIr.anchors) ? templateDocumentIr.anchors : [];
    const warnings: string[] = [];
    const sampleText = await this.extractSampleTextRich(sampleDocument?.contentBase64, warnings);
    const sectionContexts = this.buildCompareSectionContexts(elements, sampleText);
    const sectionContextMap = new Map(sectionContexts.map((section) => [section.sectionId, section]));
    const templateTableMatrices = this.buildTemplateTableMatrices(elements);
    const sampleTableMatrices = await this.extractSampleTableMatrices(sampleDocument?.contentBase64);
    const shortTableCellTexts = new Set(
      elements
        .filter((element) => this.safeText(element.type) === 'cell')
        .map((element) => this.safeText(element.text))
        .filter((text) => Boolean(text) && text.length <= 40)
        .map((text) => this.normalizeLookupText(text))
    );
    const blockElements = elements.filter((element) =>
      ['paragraph', 'table', 'cell'].includes(String(element.type || ''))
      && Boolean(this.safeText(element.text))
    );
    const candidates: WorkflowFieldCandidate[] = [];
    const seenKeys = new Set<string>();

    for (const element of blockElements) {
      const templateText = this.safeText(element.text);
      if (
        this.safeText(element.type) === 'paragraph'
        && templateText.length <= 40
        && shortTableCellTexts.has(this.normalizeLookupText(templateText))
      ) {
        continue;
      }
      const sectionInfo = this.inferSectionInfo(elements, element.id, templateText);
      const sectionContext = sectionContextMap.get(sectionInfo.sectionId);
      const matchedField = fields.find((field) =>
        (field.sourceBindings || []).some((binding) => this.safeText(binding.blockId) === element.id)
      );
      const scopedSampleText = this.safeText(sectionContext?.sampleText) || sampleText;
      const tableCompareInputs = this.buildTableCompareInputs(
        element,
        templateTableMatrices,
        sampleTableMatrices,
      );
      if (tableCompareInputs?.skip) {
        continue;
      }
      const languageRelation = this.buildCompareCandidateLanguageRelation(
        elements,
        element,
        sectionInfo.sectionId,
      );
      const compareInputs: Array<{
        compareSegment: string;
        anchorText?: string;
        sampleValue?: string;
        matchText?: string;
        probeTexts?: string[];
        dictionaryText?: string;
        dedupeHint?: string;
      }> = tableCompareInputs?.inputs?.length
        ? tableCompareInputs.inputs
        : this.buildTextCompareInputs(
            elements,
            sectionInfo.sectionId,
            templateText,
            languageRelation,
          );

      for (const compareInput of compareInputs) {
        const compareSegment = compareInput.compareSegment;
        if (
          element.id === sectionInfo.sectionId
          && this.isLikelySectionHeading(compareSegment)
        ) {
          continue;
        }
        const anchorText = this.safeText(compareInput.anchorText) || this.extractAnchorPrefix(
          compareSegment.replace(/^[\s_＿\-—.·]+/u, '').trim()
        );
        const dictionaryHint = this.matchFieldDictionary(
          this.safeText(compareInput.dictionaryText) || anchorText || templateText,
          assets,
        );
        const compactCompareBlock = this.isCompactCompareBlock(compareSegment);
        const keepUnnamedCandidate = this.shouldKeepCompareCandidateUnnamed(compareSegment);
        const compareLabels = this.extractCompareLabels(compareSegment);
        const includeSectionTitleProbe = !(
          languageRelation?.mode === 'adjacent_bilingual_block'
          && compareLabels.length < 2
          && this.hasCompareFieldShape(compareSegment)
        );
        const probeTexts = [
          ...(includeSectionTitleProbe ? [sectionInfo.sectionTitle] : []),
          anchorText,
          ...(compareInput.probeTexts || []),
          matchedField?.fieldId,
          ...(compactCompareBlock ? [compareSegment.slice(0, 64)] : []),
        ];
        const directMatchText = this.safeText(compareInput.matchText)
          || this.findDirectCompareMatch(scopedSampleText, compareSegment, anchorText)
          || this.findDirectCompareMatch(sampleText, compareSegment, anchorText);
        const matchText = this.safeText(compareInput.matchText)
          || directMatchText
          || this.extractLooseCandidateContext(scopedSampleText, probeTexts)
          || this.extractLooseCandidateContext(sampleText, probeTexts);

        if (!this.shouldCreateCompareCandidate(compareSegment, anchorText, matchText, matchedField, dictionaryHint)) {
          continue;
        }

        const fieldIdHint = keepUnnamedCandidate ? undefined : (matchedField?.fieldId || dictionaryHint?.fieldId);
        const fieldTypeHint = keepUnnamedCandidate ? undefined : (matchedField?.type || dictionaryHint?.type);
        const generationPolicyHint = keepUnnamedCandidate
          ? 'section_text_compare_first'
          : (matchedField?.policy || dictionaryHint?.policy || 'section_text_compare_first');
        const sampleValue = this.safeText(compareInput.sampleValue) || this.buildCandidateSampleValue(
          anchorText,
          compareSegment,
          matchText,
          matchedField,
          sourceLanguage,
        );
        const segmentText = compareSegment.slice(0, 240) || [anchorText, sampleValue].filter(Boolean).join('');
        const dedupeKey = [
          this.normalizeLookupText(sectionInfo.sectionTitle),
          this.normalizeLookupText(anchorText),
          this.normalizeLookupText(sampleValue),
          this.normalizeLookupText(segmentText.slice(0, 64)),
          this.safeText(compareInput.dedupeHint),
        ].join('|');
        if (seenKeys.has(dedupeKey)) {
          continue;
        }
        seenKeys.add(dedupeKey);

        candidates.push({
          candidateId: `fc_${candidates.length + 1}`,
          sourceBlockId: element.id,
          anchorText: anchorText || this.inferRecognitionBlockTitle(compareSegment, String(element.type || 'paragraph')),
          sampleValue,
          segmentText,
          sectionId: sectionInfo.sectionId,
          sectionTitle: sectionInfo.sectionTitle,
          fieldTypeHint,
          generationPolicyHint,
          confidence: this.computeCompareCandidateConfidence(
            matchText,
            keepUnnamedCandidate ? undefined : matchedField,
            dictionaryHint,
          ),
          fieldIdHint,
          matchText: matchText || undefined,
          matchReason: this.describeCompareCandidateReason(
            matchText,
            keepUnnamedCandidate ? undefined : matchedField,
            dictionaryHint,
            Boolean(this.safeText(sectionContext?.sampleText)),
          ),
          compareMode: sectionContext?.compareMode || 'structure_only',
          sectionMatchScore: sectionContext?.sampleMatchScore || 0,
          location: this.buildCompareCandidateLocation(element, anchors),
          languageRelation,
        });
      }
    }

    if (candidates.length > 0) {
      return {
        candidates,
        sectionContexts,
        warnings,
      };
    }

    return {
      candidates: fields.map((field, index) => {
      const sourceBinding = field.sourceBindings?.[0];
      const sourceBlockId = this.safeText(sourceBinding?.blockId) || `block-${index + 1}`;
      const sourceElement = elements.find((element) => element.id === sourceBlockId);
      const sectionInfo = this.inferSectionInfo(elements, sourceBlockId, sourceElement?.text || sourceBinding?.anchor?.prefix || field.fieldId);
      const normalizedSegmentText = this.safeText(sourceElement?.text)
        || this.safeText(sourceBinding?.anchor?.prefix)
        || field.fieldId;
      const anchorText = this.extractAnchorPrefix(
        normalizedSegmentText.replace(/^[\s_＿\-—.·]+/u, '').trim()
      ) || field.fieldId;
      const sampleValue = this.safeText(
        field.sample?.[sourceLanguage]
        || field.sample?.zh
        || this.extractFieldValue(field.fieldId, sampleText, undefined)
      );
      const segmentText = normalizedSegmentText || [anchorText, sampleValue].filter(Boolean).join('');

      return {
        candidateId: `fc_${index + 1}`,
        sourceBlockId,
        anchorText,
        sampleValue,
        segmentText,
        sectionId: sectionInfo.sectionId,
        sectionTitle: sectionInfo.sectionTitle,
        fieldTypeHint: field.type,
        generationPolicyHint: field.policy || 'rule_fallback',
        confidence: field.confidence,
        fieldIdHint: field.fieldId,
        location: sourceElement ? this.buildCompareCandidateLocation(sourceElement, anchors) : undefined,
        languageRelation: sourceElement
          ? this.buildCompareCandidateLanguageRelation(elements, sourceElement, sectionInfo.sectionId)
          : undefined,
      };
      }),
      sectionContexts,
      warnings,
    };
  }

  private buildTemplateTableMatrices(
    elements: WorkflowDocumentElement[],
  ): Map<number, string[][]> {
    const tableMap = new Map<number, string[][]>();

    for (const element of elements) {
      if (this.safeText(element.type) !== 'cell') {
        continue;
      }
      const hostData = this.getElementHostData(element);
      const tableIndex = this.numberOrUndefined(hostData.tableIndex);
      const rowIndex = this.numberOrUndefined(hostData.rowIndex);
      const cellIndex = this.numberOrUndefined(hostData.cellIndex);
      if (tableIndex === undefined || rowIndex === undefined || cellIndex === undefined) {
        continue;
      }
      const table = tableMap.get(tableIndex) || [];
      const row = table[rowIndex] || [];
      row[cellIndex] = this.safeText(element.text);
      table[rowIndex] = row;
      tableMap.set(tableIndex, table);
    }

    for (const element of elements) {
      if (this.safeText(element.type) !== 'table') {
        continue;
      }
      const hostData = this.getElementHostData(element);
      const tableIndex = this.numberOrUndefined(hostData.index ?? hostData.tableIndex);
      if (tableIndex === undefined || tableMap.has(tableIndex)) {
        continue;
      }
      const content = hostData.content;
      if (!Array.isArray(content)) {
        continue;
      }
      const rows = content
        .map((row) => Array.isArray(row) ? row.map((cell) => this.safeText(cell)) : [])
        .filter((row) => row.length > 0);
      if (rows.length > 0) {
        tableMap.set(tableIndex, rows);
      }
    }

    return tableMap;
  }

  private buildSampleTableMatrices(sampleText: string): string[][][] {
    const lines = String(sampleText || '')
      .split(/\r?\n/u)
      .map((line) => line.replace(/^\s+|\s+$/gu, ''));
    const tables: string[][][] = [];
    let currentTable: string[][] = [];

    for (const line of lines) {
      if (!line) {
        if (currentTable.length > 0) {
          tables.push(currentTable);
          currentTable = [];
        }
        continue;
      }
      if (!line.includes('\t')) {
        if (currentTable.length > 0) {
          tables.push(currentTable);
          currentTable = [];
        }
        continue;
      }
      const row = line
        .split('\t')
        .map((cell) => this.safeText(cell));
      if (row.some(Boolean)) {
        currentTable.push(row);
      }
    }

    if (currentTable.length > 0) {
      tables.push(currentTable);
    }

    return tables;
  }

  private async extractSampleTableMatrices(contentBase64: string | undefined): Promise<string[][][]> {
    if (!contentBase64) {
      return [];
    }

    try {
      const base64 = contentBase64.replace(/^base64:/, '');
      const buffer = Buffer.from(base64, 'base64');
      const header = buffer.subarray(0, 2).toString('utf-8');

      if (header === 'PK') {
        const zip = await JSZip.loadAsync(buffer);
        const documentFile = zip.file('word/document.xml');
        if (documentFile) {
          const xml = await documentFile.async('text');
          return this.extractTableMatricesFromWordXml(xml);
        }
      }

      const text = buffer.toString('utf-8');
      if (text.includes('<w:t')) {
        return this.extractTableMatricesFromWordXml(text);
      }

      return this.buildSampleTableMatrices(text);
    } catch {
      return [];
    }
  }

  private extractTableMatricesFromWordXml(xml: string): string[][][] {
    const tables: string[][][] = [];
    const tableMatches = xml.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/gu) || [];

    for (const tableXml of tableMatches) {
      const rows: string[][] = [];
      const rowMatches = tableXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/gu) || [];
      for (const rowXml of rowMatches) {
        const cells: string[] = [];
        const cellMatches = rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/gu) || [];
        for (const cellXml of cellMatches) {
          const cellText = this.extractWordTableCellText(cellXml);
          cells.push(cellText);
        }
        if (cells.some(Boolean)) {
          rows.push(cells);
        }
      }
      if (rows.length > 0) {
        tables.push(rows);
      }
    }

    return tables;
  }

  private buildTableCompareInputs(
    element: WorkflowDocumentElement,
    templateTableMatrices: Map<number, string[][]>,
    sampleTableMatrices: string[][][],
  ): {
    skip: boolean;
    inputs: Array<{
      compareSegment: string;
      anchorText?: string;
      sampleValue?: string;
      matchText?: string;
      probeTexts?: string[];
      dictionaryText?: string;
      dedupeHint?: string;
    }>;
  } | null {
    if (this.safeText(element.type) !== 'cell') {
      return null;
    }

    const hostData = this.getElementHostData(element);
    const tableIndex = this.numberOrUndefined(hostData.tableIndex);
    const rowIndex = this.numberOrUndefined(hostData.rowIndex);
    const cellIndex = this.numberOrUndefined(hostData.cellIndex);
    if (tableIndex === undefined || rowIndex === undefined || cellIndex === undefined) {
      return null;
    }

    const templateTable = templateTableMatrices.get(tableIndex);
    if (!templateTable || templateTable.length === 0) {
      return null;
    }

    const row = templateTable[rowIndex] || [];
    const currentText = this.safeText(row[cellIndex] ?? element.text);
    const sampleTable = sampleTableMatrices[tableIndex] || [];
    const sampleRow = sampleTable[rowIndex] || [];
    const sampleCellValue = this.safeText(sampleRow[cellIndex]);
    const sampleRowText = sampleRow.filter(Boolean).join('\t');
    const rowText = row.filter(Boolean).join('\t');
    const tableStructure = this.classifyTemplateTableStructure(templateTable);

    if (tableStructure.kind === 'standard_loop') {
      if (rowIndex === 0 || rowIndex !== tableStructure.templateRowIndex) {
        return { skip: true, inputs: [] };
      }
      const headerLabel = this.safeText(tableStructure.headerRow[cellIndex]);
      if (!headerLabel || !this.isBlankTableTemplateCell(currentText)) {
        return { skip: true, inputs: [] };
      }
      const headerAnchors = this.extractTableCellCompareAnchors(headerLabel);
      const effectiveAnchors = headerAnchors.length > 0 ? headerAnchors : [headerLabel];
      return {
        skip: false,
        inputs: effectiveAnchors.map((anchorText, anchorIndex) => ({
          compareSegment: `${anchorText}\t${currentText || '______________'}`,
          anchorText,
          sampleValue: this.extractTableCellSampleValueByAnchor(sampleCellValue, effectiveAnchors, anchorIndex),
          matchText: sampleRowText || undefined,
          probeTexts: [anchorText, headerLabel, rowText, tableStructure.headerRow.filter(Boolean).join('\t')],
          dictionaryText: anchorText,
          dedupeHint: `standard-loop:${tableIndex}:${rowIndex}:${cellIndex}:${anchorIndex}`,
        })),
      };
    }

    if (rowIndex === 0 && this.isLikelyTableHeaderRow(row)) {
      return { skip: true, inputs: [] };
    }

    if (!this.isBlankTableTemplateCell(currentText)) {
      return { skip: true, inputs: [] };
    }

    const inlineCellInputs = this.buildMultiAnchorTableCellCompareInputs(
      currentText,
      sampleCellValue,
      rowText,
      sampleRowText,
    );
    if (inlineCellInputs.length > 0) {
      return {
        skip: false,
        inputs: inlineCellInputs,
      };
    }

    const leftLabel = this.findNearestLeftTableLabel(row, cellIndex);
    if (leftLabel) {
      return {
        skip: false,
        inputs: [
          {
            compareSegment: `${leftLabel}\t${currentText || '______________'}`,
            anchorText: leftLabel,
            sampleValue: sampleCellValue,
            matchText: sampleRowText || undefined,
            probeTexts: [leftLabel, rowText],
            dictionaryText: leftLabel,
          },
        ],
      };
    }

    const rightLabelCell = this.findNearestRightTableLabel(row, cellIndex);
    if (rightLabelCell) {
      const multiAnchorInputs = this.buildMultiAnchorTableCellCompareInputs(
        rightLabelCell.text,
        sampleCellValue,
        rowText,
        sampleRowText,
      );
      if (multiAnchorInputs.length > 0) {
        return {
          skip: false,
          inputs: multiAnchorInputs.map((input) => ({
            ...input,
            compareSegment: `${input.anchorText || rightLabelCell.text}\t${currentText || '______________'}`,
          })),
        };
      }

      const titleLines = this.splitTableCellLines(rightLabelCell.text);
      const sampleLines = this.splitTableCellLines(sampleCellValue);
      return {
        skip: false,
        inputs: titleLines.map((title, index) => ({
          compareSegment: `${title}\t${currentText || '______________'}`,
          anchorText: title,
          sampleValue: sampleLines[index] || sampleLines[0] || sampleCellValue,
          matchText: sampleRowText || undefined,
          probeTexts: [title, rightLabelCell.text, rowText],
          dictionaryText: title,
          dedupeHint: `right-label:${tableIndex}:${rowIndex}:${cellIndex}:${rightLabelCell.cellIndex}:${index}`,
        })),
      };
    }

    return null;
  }

  private buildMultiAnchorTableCellCompareInputs(
    templateCellText: string,
    sampleCellValue: string,
    rowText: string,
    sampleRowText: string,
  ): Array<{
    compareSegment: string;
    anchorText?: string;
    sampleValue?: string;
    matchText?: string;
    probeTexts?: string[];
    dictionaryText?: string;
    dedupeHint?: string;
  }> {
    const anchors = this.extractTableCellCompareAnchors(templateCellText);
    if (anchors.length < 2) {
      return [];
    }

    return anchors.map((anchor, index) => ({
      compareSegment: `${anchor}\t${templateCellText || '______________'}`,
      anchorText: anchor,
      sampleValue: this.extractTableCellSampleValueByAnchor(sampleCellValue, anchors, index),
      matchText: sampleRowText || undefined,
      probeTexts: [anchor, templateCellText, rowText],
      dictionaryText: anchor,
      dedupeHint: `multi-anchor:${index}`,
    }));
  }

  private extractWordTableCellText(cellXml: string): string {
    return cellXml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:br\/>/g, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^\S\r\n\t]+/g, ' ')
      .split(/\n+/u)
      .map((line) => this.safeText(line))
      .filter(Boolean)
      .join('\n');
  }

  private classifyTemplateTableStructure(
    templateTable: string[][],
  ): { kind: 'standard_loop'; templateRowIndex: number; headerRow: string[] } | { kind: 'generic' } {
    if (this.isStandardLoopTable(templateTable)) {
      return {
        kind: 'standard_loop',
        templateRowIndex: 1,
        headerRow: templateTable[0] || [],
      };
    }
    return { kind: 'generic' };
  }

  private isStandardLoopTable(templateTable: string[][]): boolean {
    if (templateTable.length < 2) {
      return false;
    }
    const headerRow = templateTable[0] || [];
    if (headerRow.length < 2) {
      return false;
    }
    const normalizedHeaders = headerRow.map((cell) => this.safeText(cell));
    if (normalizedHeaders.some((cell) => !cell) || !this.isLikelyTableHeaderRow(normalizedHeaders)) {
      return false;
    }

    return templateTable.slice(1).every((row) => {
      const width = Math.max(headerRow.length, row.length);
      if (width === 0) {
        return false;
      }
      for (let index = 0; index < width; index += 1) {
        if (!this.isBlankTableTemplateCell(row[index])) {
          return false;
        }
      }
      return true;
    });
  }

  private isBlankTableTemplateCell(text: string | undefined): boolean {
    const normalizedText = this.safeText(text);
    return !normalizedText || this.hasBlankPlaceholder(normalizedText);
  }

  private findNearestLeftTableLabel(row: string[], cellIndex: number): string {
    return row
      .slice(0, cellIndex)
      .map((cell) => this.safeText(cell))
      .reverse()
      .find((cell) => this.isLikelyTableLabel(cell)) || '';
  }

  private findNearestRightTableLabel(
    row: string[],
    cellIndex: number,
  ): { text: string; cellIndex: number } | undefined {
    for (let index = cellIndex + 1; index < row.length; index += 1) {
      const text = this.safeText(row[index]);
      if (!text) {
        continue;
      }
      return { text, cellIndex: index };
    }
    return undefined;
  }

  private splitTableCellLines(text: string): string[] {
    const normalizedText = this.safeText(text);
    if (!normalizedText) {
      return [];
    }
    return normalizedText
      .split(/\r?\n/u)
      .map((line) => this.safeText(line))
      .filter(Boolean);
  }

  private extractTableCellCompareAnchors(text: string): string[] {
    const labels = this.extractCompareLabels(text);
    if (labels.length >= 2) {
      return labels;
    }

    const lines = this.splitTableCellLines(text);
    if (lines.length >= 2) {
      return lines;
    }

    return [];
  }

  private extractTableCellSampleValueByAnchor(
    sampleCellText: string,
    anchors: string[],
    anchorIndex: number,
  ): string {
    const normalizedSampleText = this.safeText(sampleCellText);
    if (!normalizedSampleText) {
      return '';
    }

    const sampleLines = this.splitTableCellLines(normalizedSampleText);
    if (sampleLines.length === anchors.length && sampleLines.length > 1) {
      const pairedLine = sampleLines[anchorIndex] || '';
      for (const anchorPattern of Array.from(new Set([
        this.escapeRegExp(this.safeText(anchors[anchorIndex])),
        this.escapeRegExp(this.safeText(anchors[anchorIndex]).replace(/[：:]$/u, '').trim()),
      ].filter(Boolean)))) {
        const matched = pairedLine.match(new RegExp(`^${anchorPattern}[：:]?\\s*(.*)$`, 'u'));
        const value = this.safeText(matched?.[1]);
        if (value) {
          return value;
        }
      }
      return pairedLine;
    }

    const anchor = this.safeText(anchors[anchorIndex]);
    if (!anchor) {
      return sampleLines[anchorIndex] || sampleLines[0] || normalizedSampleText;
    }

    const nextAnchors = anchors
      .slice(anchorIndex + 1)
      .map((item) => this.safeText(item))
      .filter(Boolean)
      .map((item) => this.escapeRegExp(item));
    const suffixPattern = nextAnchors.length > 0
      ? `(?=${nextAnchors.join('|')})`
      : '$';
    const anchorPatterns = Array.from(new Set([
      this.escapeRegExp(anchor),
      this.escapeRegExp(anchor.replace(/[：:]$/u, '').trim()),
    ].filter(Boolean)));

    for (const anchorPattern of anchorPatterns) {
      const matcher = new RegExp(`${anchorPattern}[：:]?\\s*(.{1,160}?)\\s*${suffixPattern}`, 'u');
      const matched = normalizedSampleText.match(matcher);
      const value = this.safeText(matched?.[1]);
      if (value) {
        return value;
      }
    }

    return sampleLines[anchorIndex] || sampleLines[0] || normalizedSampleText;
  }

  private shouldCreateCompareCandidate(
    templateText: string,
    anchorText: string,
    matchText: string,
    matchedField?: WorkflowAnalyzeFieldResult,
    dictionaryHint?: WorkflowFieldDictionaryEntry,
  ): boolean {
    const normalizedTemplateText = this.safeText(templateText);
    const hasCompareShape = this.hasCompareFieldShape(normalizedTemplateText);
    const compactCompareBlock = this.isCompactCompareBlock(normalizedTemplateText);
    const likelyNarrative = this.isLikelyNarrativeCompareText(normalizedTemplateText);

    if (this.isLikelySectionHeading(normalizedTemplateText) && !matchedField && !dictionaryHint) {
      return false;
    }
    if (matchedField) {
      return true;
    }

    if (!hasCompareShape) {
      return Boolean(dictionaryHint && compactCompareBlock && !likelyNarrative);
    }

    if (!compactCompareBlock || likelyNarrative) {
      return false;
    }

    if (matchText) {
      return true;
    }

    if (dictionaryHint) {
      return true;
    }

    return Boolean(this.safeText(anchorText));
  }

  private describeCompareCandidateReason(
    matchText: string,
    matchedField?: WorkflowAnalyzeFieldResult,
    dictionaryHint?: WorkflowFieldDictionaryEntry,
    matchedInSection = false,
  ): string {
    if (matchText && matchedField) {
      return matchedInSection
        ? '章节文本宽松命中 + 规则候选关联'
        : '全文宽松命中 + 规则候选关联';
    }
    if (matchText && dictionaryHint) {
      return matchedInSection
        ? '章节文本宽松命中 + 词典辅助提示'
        : '全文宽松命中 + 词典辅助提示';
    }
    if (matchText) {
      return matchedInSection ? '章节文本宽松命中' : '全文宽松命中';
    }
    if (matchedField) {
      return '规则候选关联';
    }
    if (dictionaryHint) {
      return '词典提示兜底';
    }
    return '结构特征兜底';
  }

  private buildCandidateSampleValue(
    anchorText: string,
    templateText: string,
    matchText: string,
    matchedField: WorkflowAnalyzeFieldResult | undefined,
    sourceLanguage: string,
  ): string {
    const snippet = this.safeText(matchText).replace(/\s+/g, ' ').trim();
    if (!snippet) {
      const fieldSample = this.safeText(
        matchedField?.sample?.[sourceLanguage]
        || matchedField?.sample?.zh
      );
      return fieldSample;
    }
    const placeholderValue = this.extractPlaceholderSampleValue(templateText, snippet);
    if (placeholderValue) {
      return placeholderValue.slice(0, 80);
    }
    const normalizedAnchor = this.safeText(anchorText).replace(/[：:]$/u, '');
    if (normalizedAnchor) {
      const directMatch = snippet.match(new RegExp(`${this.escapeRegExp(normalizedAnchor)}[：:]?\\s*([^\\n]{1,80})`, 'u'));
      const directValue = this.safeText(directMatch?.[1]);
      if (directValue) {
        return directValue.slice(0, 80);
      }
    }
    const colonValue = this.safeText(snippet.match(/[：:]\s*([^\n]{1,80})/u)?.[1]);
    if (colonValue) {
      return colonValue.slice(0, 80);
    }
    return snippet.split(/[。；;]/u)[0].slice(0, 80).trim();
  }

  private computeCompareCandidateConfidence(
    matchText: string,
    matchedField?: WorkflowAnalyzeFieldResult,
    dictionaryHint?: WorkflowFieldDictionaryEntry,
  ): number {
    if (matchedField?.confidence) {
      return this.normalizeConfidence(matchedField.confidence, 0.86);
    }
    if (matchText && dictionaryHint) {
      return 0.76;
    }
    if (matchText) {
      return 0.74;
    }
    if (dictionaryHint) {
      return 0.68;
    }
    return 0.58;
  }

  private buildCompareSummary(
    candidateFields: WorkflowFieldCandidate[],
    warnings: string[],
    sectionContexts: WorkflowCompareSectionContext[] = [],
  ): WorkflowCompareResult['compareSummary'] {
    const sectionMap = new Map<string, {
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
    }>();
    const sectionContextMap = new Map(sectionContexts.map((section) => [section.sectionId, section]));
    const sectionOrderMap = new Map(sectionContexts.map((section, index) => [section.sectionId, index]));

    for (const sectionContext of sectionContexts) {
      sectionMap.set(sectionContext.sectionId, {
        sectionId: sectionContext.sectionId,
        sectionTitle: sectionContext.sectionTitle,
        candidateCount: 0,
        matchedCandidateCount: 0,
        unmatchedCandidateCount: 0,
        highConfidenceCandidateCount: 0,
        compareStatus: 'attention',
        compareMode: sectionContext.compareMode,
        looseMatchScore: sectionContext.sampleMatchScore,
        topAnchors: [],
        samplePreview: sectionContext.samplePreview,
      });
    }

    for (const candidate of candidateFields) {
      const sectionId = this.safeText(candidate.sectionId || candidate.sectionTitle || candidate.sourceBlockId);
      const sectionTitle = this.safeText(candidate.sectionTitle || candidate.sectionId || candidate.sourceBlockId);
      if (!sectionId || !sectionTitle) {
        continue;
      }
      const sectionContext = sectionContextMap.get(sectionId);
      const current = sectionMap.get(sectionId) || {
        sectionId,
        sectionTitle,
        candidateCount: 0,
        matchedCandidateCount: 0,
        unmatchedCandidateCount: 0,
        highConfidenceCandidateCount: 0,
        compareStatus: 'attention' as const,
        compareMode: sectionContext?.compareMode || 'structure_only',
        looseMatchScore: sectionContext?.sampleMatchScore || 0,
        topAnchors: [],
        samplePreview: sectionContext?.samplePreview,
      };
      current.candidateCount += 1;
      if (this.safeText(candidate.matchText)) {
        current.matchedCandidateCount += 1;
        if (!current.samplePreview) {
          current.samplePreview = this.safeText(candidate.matchText).slice(0, 120);
        }
      }
      if (candidate.confidence >= 0.8) {
        current.highConfidenceCandidateCount += 1;
      }
      const anchorText = this.safeText(candidate.anchorText);
      if (anchorText && !current.topAnchors.includes(anchorText) && current.topAnchors.length < 3) {
        current.topAnchors.push(anchorText);
      }
      current.unmatchedCandidateCount = Math.max(0, current.candidateCount - current.matchedCandidateCount);
      current.compareStatus = current.matchedCandidateCount === 0
        ? 'attention'
        : (current.unmatchedCandidateCount === 0 ? 'aligned' : 'partial');
      sectionMap.set(sectionId, current);
    }

    const sections = Array.from(sectionMap.values())
      .sort((left, right) => (
        (sectionOrderMap.get(left.sectionId) ?? Number.MAX_SAFE_INTEGER)
          - (sectionOrderMap.get(right.sectionId) ?? Number.MAX_SAFE_INTEGER)
        || this.getCompareSectionPriority(right.compareStatus) - this.getCompareSectionPriority(left.compareStatus)
        || right.looseMatchScore - left.looseMatchScore
        || right.candidateCount - left.candidateCount
        || right.matchedCandidateCount - left.matchedCandidateCount
        || left.sectionTitle.localeCompare(right.sectionTitle, 'zh-Hans-CN')
      ))
      .slice(0, 8);

    return {
      candidateCount: candidateFields.length,
      sectionCount: sectionMap.size,
      sections,
      warnings: Array.from(new Set([
        ...warnings,
        ...sections
          .filter((section) => section.candidateCount === 0 && section.looseMatchScore >= 8)
          .slice(0, 3)
          .map((section) => `章节 ${section.sectionTitle} 已命中样本文本，但当前未形成候选字段，请人工关注。`),
        ...(sections.length > 0 && sections.every((section) => section.compareStatus === 'attention')
          ? ['当前模板对比未形成明确章节命中，后续识别将更多依赖 AI 与规则回退。']
          : []),
      ])),
    };
  }

  private buildUnderstandingSectionSummaries(
    candidateFields: WorkflowFieldCandidate[],
  ): WorkflowUnderstandResult['summary']['sectionSummaries'] {
    const sectionMap = new Map<string, WorkflowUnderstandResult['summary']['sectionSummaries'][number]>();
    const sectionOrderMap = new Map<string, number>();

    for (const candidate of candidateFields) {
      const sectionId = this.safeText(candidate.sectionId || candidate.sectionTitle || candidate.sourceBlockId);
      const sectionTitle = this.safeText(candidate.sectionTitle || candidate.sectionId || candidate.sourceBlockId);
      if (!sectionId || !sectionTitle) {
        continue;
      }
      if (!sectionOrderMap.has(sectionId)) {
        sectionOrderMap.set(sectionId, sectionOrderMap.size);
      }
      const current = sectionMap.get(sectionId) || {
        sectionId,
        sectionTitle,
        sectionSummary: '',
        candidateCount: 0,
        matchedCandidateCount: 0,
        compareStatus: 'attention' as const,
        compareMode: candidate.compareMode || 'structure_only',
        looseMatchScore: Number(candidate.sectionMatchScore || 0),
        samplePreview: candidate.matchText || undefined,
      };
      current.candidateCount += 1;
      if (this.safeText(candidate.matchText)) {
        current.matchedCandidateCount += 1;
      }
      current.compareStatus = current.matchedCandidateCount === 0
        ? 'attention'
        : (current.matchedCandidateCount === current.candidateCount ? 'aligned' : 'partial');
      current.looseMatchScore = Math.max(current.looseMatchScore, Number(candidate.sectionMatchScore || 0));
      current.compareMode = this.computeCandidateGroupCompareMode([candidate, {
        ...candidate,
        compareMode: current.compareMode,
      }]);
      current.samplePreview = current.samplePreview || candidate.matchText || candidate.sampleValue || undefined;
      if (!current.sectionSummary) {
        current.sectionSummary = [
          `章节 ${sectionTitle}`,
          `候选 ${current.candidateCount} 个`,
          current.matchedCandidateCount > 0 ? `已命中 ${current.matchedCandidateCount} 个` : '当前未形成明确命中',
          current.samplePreview ? `示例: ${this.safeText(current.samplePreview).slice(0, 60)}` : '',
        ].filter(Boolean).join('，');
      }
      sectionMap.set(sectionId, current);
    }

    return Array.from(sectionMap.values())
      .sort((left, right) => (
        (sectionOrderMap.get(left.sectionId) ?? Number.MAX_SAFE_INTEGER)
          - (sectionOrderMap.get(right.sectionId) ?? Number.MAX_SAFE_INTEGER)
        || right.looseMatchScore - left.looseMatchScore
        || right.candidateCount - left.candidateCount
      ))
      .slice(0, 8);
  }

  private getCompareSectionPriority(status: 'aligned' | 'partial' | 'attention'): number {
    switch (status) {
      case 'attention':
        return 3;
      case 'partial':
        return 2;
      case 'aligned':
      default:
        return 1;
    }
  }

  private buildCompareSectionContexts(
    elements: WorkflowDocumentElement[],
    sampleText: string,
  ): WorkflowCompareSectionContext[] {
    const blockElements = elements.filter((element) =>
      ['paragraph', 'table', 'cell'].includes(String(element.type || ''))
      && Boolean(this.safeText(element.text))
    );
    if (blockElements.length === 0) {
      return [];
    }

    const sectionMap = new Map<string, {
      sectionId: string;
      sectionTitle: string;
      templateSegments: string[];
      anchorTexts: string[];
    }>();

    for (const element of blockElements) {
      const templateText = this.safeText(element.text);
      const sectionInfo = this.inferSectionInfo(elements, element.id, templateText);
      const current = sectionMap.get(sectionInfo.sectionId) || {
        sectionId: sectionInfo.sectionId,
        sectionTitle: sectionInfo.sectionTitle,
        templateSegments: [],
        anchorTexts: [],
      };
      if (templateText && current.templateSegments.length < 6 && this.shouldIncludeSectionCompareProbe(templateText)) {
        current.templateSegments.push(templateText);
      }
      const anchorText = this.extractAnchorPrefix(
        templateText.replace(/^[\s_＿\-—.·]+/u, '').trim()
      );
      if (anchorText && current.anchorTexts.length < 4 && !current.anchorTexts.includes(anchorText)) {
        current.anchorTexts.push(anchorText);
      }
      sectionMap.set(sectionInfo.sectionId, current);
    }

    const sampleChunks = this.splitSampleTextIntoChunks(sampleText);
    return Array.from(sectionMap.values()).map((section) => {
      const bestMatch = this.findBestSectionSampleChunk(sampleChunks, [
        section.sectionTitle,
        ...section.anchorTexts,
        ...section.templateSegments.slice(0, 3).map((segment) => segment.slice(0, 80)),
      ]);
      const templateText = section.templateSegments.join('\n').slice(0, 800);
      const samplePreview = this.safeText(bestMatch.chunk).slice(0, 120) || undefined;
      return {
        sectionId: section.sectionId,
        sectionTitle: section.sectionTitle,
        templateText,
        sampleText: bestMatch.chunk,
        samplePreview,
        sampleMatchScore: bestMatch.score,
        compareMode: bestMatch.score >= 8
          ? 'section_loose_compare'
          : (sampleChunks.length > 0 ? 'global_probe_fallback' : 'structure_only'),
      };
    });
  }

  private splitSampleTextIntoChunks(sampleText: string): string[] {
    const normalizedSampleText = this.safeText(sampleText);
    if (!normalizedSampleText) {
      return [];
    }

    const paragraphChunks = normalizedSampleText
      .split(/\n\s*\n+/u)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    const lines = normalizedSampleText
      .split(/[\r\n]+/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 160);

    const lineWindows: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const window = lines.slice(index, index + 4).join('\n').trim();
      if (window) {
        lineWindows.push(window);
      }
    }

    return Array.from(new Set([...paragraphChunks, ...lineWindows])).slice(0, 240);
  }

  private buildFallbackSectionHints(elements: WorkflowDocumentElement[]): string[] {
    const headingHints = elements
      .filter((element) => ['paragraph', 'table', 'cell'].includes(String(element.type || '')))
      .filter((element) => this.isLikelySectionHeading(this.safeText(element.text), element))
      .map((element) => this.safeText(element.text))
      .slice(0, 6);
    if (headingHints.length > 0) {
      return headingHints;
    }
    return elements
      .filter((element) => element.type === 'paragraph')
      .map((element) => this.safeText(element.text))
      .filter((text) => Boolean(text) && text.length <= 40)
      .slice(0, 6);
  }

  private splitTemplateTextIntoCompareSegments(templateText: string): string[] {
    const normalizedTemplateText = this.safeText(templateText);
    if (!normalizedTemplateText) {
      return [];
    }

    const lineSegments = normalizedTemplateText
      .split(/[\r\n]+/u)
      .map((segment) => segment.trim())
      .filter(Boolean);

    const sentenceGroups = lineSegments.flatMap((segment) => {
      if (!this.hasCompareFieldShape(segment)) {
        return [segment];
      }

      const splitSentences = segment
        .split(/[。；]/u)
        .map((item) => item.trim())
        .filter(Boolean);
      const compareSentences = splitSentences.filter((item) => this.hasCompareFieldShape(item));
      const compareLabelCount = this.extractCompareLabels(segment).length;
      const hasMultipleCompareUnits = compareLabelCount >= 2
        || (segment.match(/[_＿]{2,}|\(\s*\)|（\s*）/gu) || []).length >= 2;

      if (hasMultipleCompareUnits || compareSentences.length <= 1) {
        return [segment];
      }

      return compareSentences;
    });

    return Array.from(new Set(sentenceGroups)).slice(0, 8);
  }

  private buildTextCompareInputs(
    elements: WorkflowDocumentElement[],
    sectionId: string,
    templateText: string,
    languageRelation?: WorkflowCandidateLanguageRelation,
  ): Array<{
    compareSegment: string;
    anchorText?: string;
    sampleValue?: string;
    matchText?: string;
    probeTexts?: string[];
    dictionaryText?: string;
  }> {
    const compareSegments = this.splitTemplateTextIntoCompareSegments(templateText);
    const bilingualPeerText = this.findAdjacentBilingualPeerText(elements, sectionId, languageRelation);
    const bilingualPeerLabels = this.extractCompareLabels(bilingualPeerText);

    return compareSegments.map((compareSegment) => {
      const labels = this.extractCompareLabels(compareSegment);
      const hasMultipleLabels = labels.length >= 2;
      const comparePeerLabels = hasMultipleLabels ? bilingualPeerLabels : [];
      const comparePeerText = hasMultipleLabels ? bilingualPeerText : '';
      return {
        compareSegment,
        anchorText: labels[0] || this.extractAnchorPrefix(compareSegment.replace(/^[\s_＿\-—.·]+/u, '').trim()),
        probeTexts: [
          ...labels,
          ...comparePeerLabels,
          compareSegment,
          comparePeerText,
        ].filter((value): value is string => Boolean(this.safeText(value))),
        dictionaryText: hasMultipleLabels ? '' : (labels[0] || compareSegment),
      };
    });
  }

  private findBestSectionSampleChunk(
    sampleChunks: string[],
    probes: Array<string | undefined>,
  ): { chunk: string; score: number } {
    if (sampleChunks.length === 0) {
      return { chunk: '', score: 0 };
    }

    const effectiveProbes = Array.from(new Set(
      probes
        .map((probe) => this.safeText(probe))
        .filter((probe) => probe.length >= 2)
    ));
    if (effectiveProbes.length === 0) {
      return { chunk: '', score: 0 };
    }

    let bestChunk = '';
    let bestScore = 0;
    for (const chunk of sampleChunks) {
      const score = this.scoreLooseTextMatch(chunk, effectiveProbes);
      if (score > bestScore) {
        bestScore = score;
        bestChunk = chunk;
      }
    }

    return {
      chunk: bestChunk,
      score: bestScore,
    };
  }

  private findDirectCompareMatch(sampleText: string, templateText: string, anchorText: string): string {
    const normalizedSampleText = this.safeText(sampleText);
    if (!normalizedSampleText) {
      return '';
    }

    const lines = normalizedSampleText
      .split(/[\r\n]+/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 400);

    const normalizedAnchor = this.normalizeLookupText(anchorText.replace(/[：:]$/u, ''));
    if (normalizedAnchor) {
      const anchorLine = lines.find((line) => this.normalizeLookupText(line).includes(normalizedAnchor));
      if (anchorLine) {
        return anchorLine;
      }
    }

    const placeholderMatcher = this.extractPlaceholderMatcher(templateText);
    if (placeholderMatcher) {
      const alignedLine = lines.find((line) => {
        const normalizedLine = this.normalizeLookupText(line);
        return (
          (!placeholderMatcher.prefix || normalizedLine.includes(this.normalizeLookupText(placeholderMatcher.prefix)))
          && (!placeholderMatcher.suffix || normalizedLine.includes(this.normalizeLookupText(placeholderMatcher.suffix)))
        );
      });
      if (alignedLine) {
        return alignedLine;
      }
    }

    return '';
  }

  private extractCompareLabels(text: string): string[] {
    const normalizedText = this.safeText(text);
    if (!normalizedText) {
      return [];
    }

    return Array.from(new Set(
      Array.from(normalizedText.matchAll(/([^，,。；;\n\t]{1,24}[:：])/gu))
        .map((match) => this.safeText(match[1]))
        .filter((label) => Boolean(label) && !this.hasBlankPlaceholder(label))
    )).slice(0, 6);
  }

  private findAdjacentBilingualPeerText(
    elements: WorkflowDocumentElement[],
    sectionId: string,
    languageRelation?: WorkflowCandidateLanguageRelation,
  ): string {
    if (languageRelation?.mode !== 'adjacent_bilingual_block' || !languageRelation.peerBlockId) {
      return '';
    }

    const peerElement = elements.find((item) => item.id === languageRelation.peerBlockId);
    if (!peerElement) {
      return '';
    }

    const peerSectionId = this.inferSectionInfo(elements, peerElement.id, this.safeText(peerElement.text)).sectionId;
    if (peerSectionId !== sectionId) {
      return '';
    }

    return this.safeText(peerElement.text);
  }

  private extractLooseCandidateContext(sampleText: string, probes: Array<string | undefined>): string {
    const normalizedSampleText = this.safeText(sampleText);
    if (!normalizedSampleText) {
      return '';
    }

    const effectiveProbes = Array.from(new Set(
      probes
        .map((probe) => this.safeText(probe))
        .filter((probe) => probe.length >= 2)
        .flatMap((probe) => {
          const variants = [probe];
          if (probe.length > 24) {
            variants.push(probe.slice(0, 24));
          }
          if (probe.length > 12) {
            variants.push(probe.slice(0, 12));
          }
          return variants;
        })
    ));
    if (effectiveProbes.length === 0) {
      return '';
    }

    const chunks = normalizedSampleText
      .split(/[\r\n]+|[。；;]/u)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .slice(0, 400);

    let bestChunk = '';
    let bestScore = 0;
    for (const chunk of chunks) {
      const score = this.scoreLooseTextMatch(chunk, effectiveProbes);
      if (score > bestScore) {
        bestScore = score;
        bestChunk = chunk;
      }
    }

    return bestScore >= 10 ? bestChunk.slice(0, 240) : '';
  }

  private scoreLooseTextMatch(chunk: string, probes: string[]): number {
    const normalizedChunk = this.normalizeLookupText(chunk);
    if (!normalizedChunk) {
      return 0;
    }

    let score = 0;
    for (const probe of probes) {
      const normalizedProbe = this.normalizeLookupText(probe);
      if (!normalizedProbe) {
        continue;
      }
      if (normalizedChunk.includes(normalizedProbe)) {
        score += Math.min(24, normalizedProbe.length) + 6;
        continue;
      }
      const overlap = this.computeLooseBigramOverlap(normalizedChunk, normalizedProbe);
      if (overlap > 0) {
        score += overlap * 2;
      }
    }
    return score;
  }

  private computeLooseBigramOverlap(left: string, right: string): number {
    if (left.length < 2 || right.length < 2) {
      return 0;
    }
    const leftBigrams = new Set<string>();
    for (let index = 0; index < left.length - 1; index += 1) {
      leftBigrams.add(left.slice(index, index + 2));
    }
    let overlap = 0;
    const seen = new Set<string>();
    for (let index = 0; index < right.length - 1; index += 1) {
      const gram = right.slice(index, index + 2);
      if (seen.has(gram)) {
        continue;
      }
      seen.add(gram);
      if (leftBigrams.has(gram)) {
        overlap += 1;
      }
    }
    return overlap;
  }

  private shouldIncludeSectionCompareProbe(text: string): boolean {
    const normalizedText = this.safeText(text);
    if (!normalizedText) {
      return false;
    }
    if (this.isLikelySectionHeading(normalizedText)) {
      return true;
    }
    if (this.hasCompareFieldShape(normalizedText)) {
      return this.isCompactCompareBlock(normalizedText);
    }
    return normalizedText.length <= 28;
  }

  private isCompactCompareBlock(text: string): boolean {
    const normalizedText = this.safeText(text);
    if (!normalizedText) {
      return false;
    }
    const lineCount = normalizedText.split(/\n+/u).filter(Boolean).length;
    if (lineCount > 2) {
      return false;
    }
    if (normalizedText.length > 72 && !this.hasBlankPlaceholder(normalizedText)) {
      return false;
    }
    return true;
  }

  private isLikelyNarrativeCompareText(text: string): boolean {
    const normalizedText = this.safeText(text);
    if (!normalizedText) {
      return false;
    }
    if (this.hasBlankPlaceholder(normalizedText) || /【|】|\(\s*\)|（\s*）/u.test(normalizedText)) {
      return false;
    }
    const sentencePunctuationCount = (normalizedText.match(/[，,。；;]/gu) || []).length;
    if (normalizedText.length >= 44 && sentencePunctuationCount >= 2) {
      return true;
    }
    if (normalizedText.length >= 88) {
      return true;
    }
    return false;
  }

  private shouldKeepCompareCandidateUnnamed(text: string): boolean {
    const normalizedText = this.safeText(text);
    if (!normalizedText) {
      return false;
    }
    if (this.extractCompareLabels(normalizedText).length >= 2) {
      return true;
    }
    return this.hasBlankPlaceholder(normalizedText)
      && !/[:：]/u.test(normalizedText)
      && normalizedText.length >= 24;
  }

  private isLikelyTableHeaderRow(row: string[]): boolean {
    const cells = row
      .map((cell) => this.safeText(cell))
      .filter(Boolean);
    if (cells.length < 2) {
      return false;
    }
    return cells.every((cell) =>
      this.isLikelyTableLabel(cell)
      && !/[:：]/u.test(cell)
      && !this.hasBlankPlaceholder(cell)
    );
  }

  private isLikelyTableLabel(text: string): boolean {
    const normalizedText = this.safeText(text).replace(/[：:]$/u, '');
    if (!normalizedText) {
      return false;
    }
    if (normalizedText.length > 32) {
      return false;
    }
    if (this.hasBlankPlaceholder(normalizedText) || this.isLikelySectionHeading(normalizedText)) {
      return false;
    }
    if (/[。；;]/u.test(normalizedText)) {
      return false;
    }
    return true;
  }

  private buildCompareCandidateLocation(
    element: WorkflowDocumentElement,
    anchors: WorkflowAnchor[],
  ): WorkflowCandidateLocation | undefined {
    const hostData = element.hostData && typeof element.hostData === 'object'
      ? element.hostData as Record<string, unknown>
      : {};
    const anchor = this.resolveCandidateAnchor(element, anchors);
    const anchorRef = anchor?.ref && typeof anchor.ref === 'object'
      ? anchor.ref as Record<string, unknown>
      : {};
    const location: WorkflowCandidateLocation = {
      blockType: this.safeText(element.type) || undefined,
      paragraphIndex: this.numberOrUndefined(hostData.index ?? anchorRef.paragraphIndex),
      tableIndex: this.numberOrUndefined(hostData.tableIndex ?? anchorRef.tableIndex),
      rowIndex: this.numberOrUndefined(hostData.rowIndex ?? anchorRef.rowIndex),
      cellIndex: this.numberOrUndefined(hostData.cellIndex ?? anchorRef.cellIndex),
      contentControlId: this.numberOrUndefined(hostData.id ?? anchorRef.id),
      anchorStart: this.numberOrUndefined(anchorRef.start),
      anchorEnd: this.numberOrUndefined(anchorRef.end),
    };

    return Object.values(location).some((value) => value !== undefined) ? location : undefined;
  }

  private resolveCandidateAnchor(
    element: WorkflowDocumentElement,
    anchors: WorkflowAnchor[],
  ): WorkflowAnchor | undefined {
    const anchorIds = Array.isArray(element.anchorIds) ? element.anchorIds : [];
    for (const anchorId of anchorIds) {
      const matchedAnchor = anchors.find((anchor) => anchor.id === anchorId);
      if (matchedAnchor) {
        return matchedAnchor;
      }
    }

    const hostData = element.hostData && typeof element.hostData === 'object'
      ? element.hostData as Record<string, unknown>
      : {};
    const normalizedText = this.normalizeLookupText(this.safeText(element.text));
    if (!normalizedText) {
      return undefined;
    }

    return anchors.find((anchor) => {
      const ref = anchor.ref && typeof anchor.ref === 'object'
        ? anchor.ref as Record<string, unknown>
        : {};
      const anchorParagraphText = this.normalizeLookupText(this.safeText(ref.paragraphText));
      if (anchorParagraphText && anchorParagraphText === normalizedText) {
        return true;
      }
      const sameTableCell = this.numberOrUndefined(ref.tableIndex) === this.numberOrUndefined(hostData.tableIndex)
        && this.numberOrUndefined(ref.rowIndex) === this.numberOrUndefined(hostData.rowIndex)
        && this.numberOrUndefined(ref.cellIndex) === this.numberOrUndefined(hostData.cellIndex)
        && this.numberOrUndefined(ref.tableIndex) !== undefined;
      return sameTableCell;
    });
  }

  private buildCompareCandidateLanguageRelation(
    elements: WorkflowDocumentElement[],
    element: WorkflowDocumentElement,
    sectionId: string,
  ): WorkflowCandidateLanguageRelation | undefined {
    const currentLanguageHint = this.detectTextLanguageHint(this.safeText(element.text));
    if (currentLanguageHint === 'mixed') {
      return {
        mode: 'same_block_mixed_language',
        currentLanguageHint,
      };
    }

    const currentIndex = elements.findIndex((item) => item.id === element.id);
    if (currentIndex >= 0) {
      const nearbyBlocks = [elements[currentIndex - 1], elements[currentIndex + 1]]
        .filter((item): item is WorkflowDocumentElement => Boolean(item))
        .filter((item) => ['paragraph', 'table', 'cell'].includes(String(item.type || '')))
        .filter((item) => this.inferSectionInfo(elements, item.id, this.safeText(item.text)).sectionId === sectionId);

      for (const nearbyBlock of nearbyBlocks) {
        const peerLanguageHint = this.detectTextLanguageHint(this.safeText(nearbyBlock.text));
        if (
          this.isConcreteLanguageHint(currentLanguageHint)
          && this.isConcreteLanguageHint(peerLanguageHint)
          && currentLanguageHint !== peerLanguageHint
        ) {
          return {
            mode: 'adjacent_bilingual_block',
            currentLanguageHint,
            peerBlockId: nearbyBlock.id,
            peerLanguageHint,
          };
        }
      }
    }

    if (this.isConcreteLanguageHint(currentLanguageHint)) {
      return {
        mode: 'single_language',
        currentLanguageHint,
      };
    }

    return {
      mode: 'unknown',
      currentLanguageHint,
    };
  }

  private detectTextLanguageHint(
    text: string,
  ): 'zh' | 'ja' | 'en' | 'mixed' | 'unknown' {
    const normalizedText = this.safeText(text)
      .replace(/[_＿\-—.·:：|/\\()[\]{}<>\d\s]+/gu, '')
      .trim();
    if (!normalizedText) {
      return 'unknown';
    }

    const hanCount = (normalizedText.match(/\p{Script=Han}/gu) || []).length;
    const hiraganaCount = (normalizedText.match(/\p{Script=Hiragana}/gu) || []).length;
    const katakanaCount = (normalizedText.match(/\p{Script=Katakana}/gu) || []).length;
    const latinCount = (normalizedText.match(/[A-Za-z]/g) || []).length;
    const kanaCount = hiraganaCount + katakanaCount;
    const hasHan = hanCount > 0;
    const hasKana = kanaCount > 0;
    const hasLatin = latinCount > 0;

    if (hasKana) {
      return 'ja';
    }
    if (hasHan && !hasLatin) {
      return 'zh';
    }
    if (hasLatin && !hasHan) {
      return 'en';
    }
    if ((hasHan && hasLatin) || (hasHan && hasKana) || (hasKana && hasLatin)) {
      return 'mixed';
    }
    return 'unknown';
  }

  private isConcreteLanguageHint(
    hint: 'zh' | 'ja' | 'en' | 'mixed' | 'unknown',
  ): hint is 'zh' | 'ja' | 'en' {
    return hint === 'zh' || hint === 'ja' || hint === 'en';
  }

  private inferSectionInfo(
    elements: WorkflowDocumentElement[],
    sourceBlockId: string,
    fallbackText: string,
  ): { sectionId: string; sectionTitle: string } {
    const currentIndex = elements.findIndex((element) => element.id === sourceBlockId);
    const fallbackTitle = this.inferRecognitionBlockTitle(this.safeText(fallbackText), 'section');
    if (currentIndex < 0) {
      return {
        sectionId: sourceBlockId || fallbackTitle,
        sectionTitle: fallbackTitle,
      };
    }

    for (let index = currentIndex; index >= 0; index -= 1) {
      const currentElement = elements[index];
      const text = this.safeText(currentElement?.text);
      if (!text) {
        continue;
      }
      if (this.isLikelySectionHeading(text, currentElement)) {
        return {
          sectionId: currentElement.id,
          sectionTitle: this.inferRecognitionBlockTitle(text, currentElement.type),
        };
      }
    }

    return {
      sectionId: sourceBlockId,
      sectionTitle: fallbackTitle,
    };
  }

  private getElementFormat(element?: WorkflowDocumentElement): {
    fontSize?: number;
    isBold?: boolean;
    alignment?: string;
    isTitle?: boolean;
  } {
    const format = element?.hostData?.format;
    if (!format || typeof format !== 'object') {
      return {};
    }
    return format as {
      fontSize?: number;
      isBold?: boolean;
      alignment?: string;
      isTitle?: boolean;
    };
  }

  private isLikelyDocumentTitle(text: string, element?: WorkflowDocumentElement): boolean {
    const normalizedText = this.safeText(text);
    if (!normalizedText || this.hasBlankPlaceholder(normalizedText)) {
      return false;
    }

    const format = this.getElementFormat(element);
    const looksLikeContractTitle = /合同|协议|契約|契约/u.test(normalizedText)
      && !/[:：，。,.;；]/u.test(normalizedText)
      && normalizedText.length <= 40;
    const looksLikeStyledTitle = (format.isTitle || format.alignment === 'center')
      && !/[:：]/u.test(normalizedText)
      && normalizedText.length <= 40;

    return looksLikeContractTitle || looksLikeStyledTitle;
  }

  private isLikelySectionHeading(text: string, element?: WorkflowDocumentElement): boolean {
    const normalizedText = this.safeText(text);
    if (!normalizedText) {
      return false;
    }
    if (this.hasBlankPlaceholder(normalizedText)) {
      return false;
    }
    if (this.isLikelyDocumentTitle(normalizedText, element)) {
      return true;
    }
    if (/^[一二三四五六七八九十百]+、/u.test(normalizedText)) {
      return true;
    }
    if (/^[(（]?[一二三四五六七八九十百0-9]+[)）][^。\n]{0,40}$/u.test(normalizedText)) {
      return true;
    }
    if (/^[0-9]+[、.．]/u.test(normalizedText)) {
      return true;
    }
    if (/^第[一二三四五六七八九十0-9]+[章节条]/u.test(normalizedText)) {
      return true;
    }
    if (/[:：]|[_＿]{2,}|【|】|\(\s*\)|（\s*）/u.test(normalizedText)) {
      return false;
    }
    const format = this.getElementFormat(element);
    if ((format.isBold || (format.fontSize || 0) >= 14) && normalizedText.length <= 32) {
      return true;
    }
    return false;
  }

  private hasCompareFieldShape(text: string): boolean {
    return /[:：]|【|】|\(\s*\)|（\s*）/u.test(this.safeText(text))
      || this.hasBlankPlaceholder(text);
  }

  private resolveFieldValue(
    spec: WorkflowTemplateFieldSpec,
    userInput: string,
    sourceLanguage: string,
    targetLanguages: string[],
    userOverrides?: Record<string, unknown>,
    assets?: WorkflowResolvedAssets,
  ): {
    value: Record<string, unknown>;
    sourceTrace: Record<string, unknown>;
    warnings: string[];
    missingFields: string[];
    needsReviewFields: string[];
  } {
    const warnings: string[] = [];
    const missingFields: string[] = [];
    const needsReviewFields: string[] = [];
    const targetLangs = Array.from(new Set([...(spec.targetLanguages || []), ...targetLanguages]));
    const overrideValue = userOverrides?.[spec.fieldId];
    const sourceValue = this.extractFieldValue(spec.fieldId, userInput, overrideValue);
    const valueMode = spec.valueMode || 'scalar';

    const resolvedValue: Record<string, unknown> = {};
    const sourceTrace: Record<string, unknown> = {};

    if (valueMode === 'list') {
      if (Array.isArray(overrideValue)) {
        resolvedValue.value = this.normalizeTableListRows(
          overrideValue,
          spec,
          sourceLanguage,
          targetLangs,
        );
        sourceTrace.resolution = 'structured_override';
        sourceTrace.valueMode = 'list';
      } else {
        const parsedListValue = this.parseListValueFromText(
          typeof overrideValue === 'string' ? overrideValue : userInput,
          spec,
        );
        if (parsedListValue && parsedListValue.length > 0) {
          resolvedValue.value = this.normalizeTableListRows(
            parsedListValue,
            spec,
            sourceLanguage,
            targetLangs,
          );
          sourceTrace.resolution = 'tabular_text_parse';
          sourceTrace.valueMode = 'list';
          sourceTrace.rowCount = parsedListValue.length;
        } else {
          if (overrideValue !== undefined) {
            warnings.push(`字段 ${spec.fieldId} 需要数组输入`);
            needsReviewFields.push(spec.fieldId);
          }
          if (spec.required) {
            missingFields.push(spec.fieldId);
          }
          sourceTrace.resolution = 'missing';
          sourceTrace.valueMode = 'list';
        }
      }
      return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
    }

    if (valueMode === 'object') {
      if (overrideValue && typeof overrideValue === 'object' && !Array.isArray(overrideValue)) {
        resolvedValue.value = overrideValue;
        sourceTrace.resolution = 'structured_override';
        sourceTrace.valueMode = 'object';
      } else {
        if (overrideValue !== undefined) {
          warnings.push(`字段 ${spec.fieldId} 需要对象输入`);
          needsReviewFields.push(spec.fieldId);
        }
        if (spec.required) {
          missingFields.push(spec.fieldId);
        }
        sourceTrace.resolution = 'missing';
        sourceTrace.valueMode = 'object';
      }
      return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
    }

    if ((sourceValue === undefined || sourceValue === null || sourceValue === '') && spec.required) {
      missingFields.push(spec.fieldId);
    }

    if (spec.policy === 'dictionary_first') {
      const normalizedSource = this.safeText(sourceValue);
      const termMatch = normalizedSource
        ? this.findTermMatch(spec.fieldId, normalizedSource, assets || this.resolveAssets())
        : undefined;
      if (termMatch) {
        resolvedValue.source = termMatch.sourceValue;
        resolvedValue[sourceLanguage] = termMatch.translations[sourceLanguage] || termMatch.sourceValue;
        for (const lang of targetLangs) {
          resolvedValue[lang] = termMatch.translations[lang];
          if (!termMatch.translations[lang]) {
            needsReviewFields.push(spec.fieldId);
          }
        }
        sourceTrace.resolution = 'dictionary_hit';
        sourceTrace.termId = termMatch.termId;
        sourceTrace.scope = termMatch.scope || 'global';
        sourceTrace.termVersion = termMatch.version;
      } else {
        resolvedValue.source = normalizedSource || '';
        resolvedValue[sourceLanguage] = normalizedSource || '';
        for (const lang of targetLangs) {
          resolvedValue[lang] = lang === sourceLanguage ? normalizedSource || '' : '';
        }
        if (normalizedSource) {
          warnings.push(`字段 ${spec.fieldId} 未命中术语库`);
          needsReviewFields.push(spec.fieldId);
        }
        sourceTrace.resolution = normalizedSource ? 'dictionary_miss' : 'missing';
      }
      return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
    }

    if (spec.policy === 'enum_mapping') {
      const matchedEnum = this.findEnumMatch(
        spec.fieldId,
        this.safeText(sourceValue),
        assets || this.resolveAssets(),
      );
      if (matchedEnum) {
        resolvedValue.code = matchedEnum.code;
        for (const lang of Array.from(new Set([sourceLanguage, ...targetLangs]))) {
          resolvedValue[lang] = matchedEnum.labels[lang] || matchedEnum.labels.zh;
        }
        sourceTrace.resolution = 'enum_hit';
        sourceTrace.enumName = spec.fieldId;
        sourceTrace.code = matchedEnum.code;
        sourceTrace.scope = matchedEnum.scope || 'global';
        sourceTrace.enumVersion = matchedEnum.version;
      } else {
        if (spec.required) {
          missingFields.push(spec.fieldId);
        }
        warnings.push(`字段 ${spec.fieldId} 未命中枚举表`);
        needsReviewFields.push(spec.fieldId);
        sourceTrace.resolution = 'enum_miss';
      }
      return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
    }

    if (spec.policy === 'format_only') {
      if (spec.type === 'currency_amount') {
        const amount = this.parseAmount(sourceValue);
        if (amount === undefined) {
          if (spec.required) {
            missingFields.push(spec.fieldId);
          }
          sourceTrace.resolution = 'missing';
          return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
        }
        resolvedValue.value = amount;
        resolvedValue.currency = 'CNY';
        resolvedValue.zh = this.formatCurrency(amount, 'zh');
        for (const lang of targetLangs) {
          resolvedValue[lang] = this.formatCurrency(amount, lang);
        }
        sourceTrace.resolution = 'format_rule';
        sourceTrace.rule = 'fmt_amount_cny_v1';
        return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
      }

      if (spec.type === 'date') {
        const normalizedDate = this.parseDate(sourceValue);
        if (!normalizedDate) {
          if (spec.required) {
            missingFields.push(spec.fieldId);
          }
          sourceTrace.resolution = 'missing';
          return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
        }
        resolvedValue.value = normalizedDate;
        resolvedValue.zh = this.formatDate(normalizedDate, 'zh');
        for (const lang of targetLangs) {
          resolvedValue[lang] = this.formatDate(normalizedDate, lang);
        }
        sourceTrace.resolution = 'format_rule';
        sourceTrace.rule = 'fmt_date_v1';
        return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
      }

      const textValue = this.safeText(sourceValue);
      if (textValue) {
        resolvedValue[sourceLanguage] = textValue;
        for (const lang of targetLangs) {
          resolvedValue[lang] = textValue;
        }
        sourceTrace.resolution = 'copy';
      } else {
        sourceTrace.resolution = 'missing';
      }
      return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
    }

    const textValue = this.safeText(sourceValue);
    resolvedValue[sourceLanguage] = textValue;
    for (const lang of targetLangs) {
      resolvedValue[lang] = lang === sourceLanguage ? textValue : '';
    }
    if (textValue && targetLangs.some((lang) => lang !== sourceLanguage)) {
      warnings.push(`字段 ${spec.fieldId} 暂未启用自动翻译，目标语言待人工确认`);
      needsReviewFields.push(spec.fieldId);
      sourceTrace.resolution = 'pending_generation';
    } else {
      sourceTrace.resolution = textValue ? 'copy' : 'missing';
    }

    return { value: resolvedValue, sourceTrace, warnings, missingFields, needsReviewFields };
  }

  compileBindingPlan(
    templateId: string,
    version: number,
    templateFieldSpecs: WorkflowTemplateFieldSpec[],
    sourceLanguage = 'zh',
    targetLanguages: string[] = [],
  ): WorkflowBindingPlan {
    const bindings: WorkflowBindingPlanBinding[] = [];
    const seen = new Set<string>();

    for (const spec of templateFieldSpecs) {
      const valueMode = spec.valueMode || 'scalar';
      if (valueMode === 'list' || valueMode === 'object') {
        const variablePath = spec.fieldId;
        if (!seen.has(variablePath)) {
          seen.add(variablePath);
          bindings.push({
            fieldId: spec.fieldId,
            variablePath,
            valueSelector: `${spec.fieldId}.value`,
            transform: 'identity',
            required: Boolean(spec.required),
          });
        }
        continue;
      }

      if (valueMode !== 'scalar') {
        continue;
      }

      const languages = Array.from(new Set([
        spec.sourceLanguage || sourceLanguage,
        ...(spec.targetLanguages || []),
        ...targetLanguages,
      ]));

      for (const lang of languages) {
        const variablePath = `${spec.fieldId}_${lang}`;
        if (seen.has(variablePath)) {
          continue;
        }
        seen.add(variablePath);
        bindings.push({
          fieldId: spec.fieldId,
          variablePath,
          valueSelector: `${spec.fieldId}.${lang}`,
          language: lang,
          transform: this.inferTransform(spec),
          required: Boolean(spec.required),
        });
      }

      if (spec.policy === 'enum_mapping') {
        const codePath = `${spec.fieldId}_code`;
        if (!seen.has(codePath)) {
          seen.add(codePath);
          bindings.push({
            fieldId: spec.fieldId,
            variablePath: codePath,
            valueSelector: `${spec.fieldId}.code`,
            transform: 'identity',
            required: false,
          });
        }
      }
    }

    return {
      templateId,
      version,
      bindings,
    };
  }

  private inferTransform(spec: WorkflowTemplateFieldSpec): string {
    if (spec.type === 'currency_amount') {
      return 'currency_format';
    }
    if (spec.type === 'date') {
      return 'date_format';
    }
    return 'identity';
  }

  private buildLanguageProfile(sourceLanguage: string, targetLanguages: string[]): WorkflowLanguageProfile {
    return {
      sourceLanguage,
      targetLanguages: Array.from(new Set(targetLanguages.filter(Boolean))),
      documentMode: targetLanguages.length > 0 ? 'single_or_bilingual' : 'single_language',
    };
  }

  private resolveAssets(termAssets?: WorkflowTermAssets): WorkflowResolvedAssets {
    const fieldDictionary = [
      ...(termAssets?.fieldDictionary || []),
      ...GLOBAL_FIELD_DICTIONARY,
    ];
    const termbase = [
      ...(termAssets?.termbase || []),
      ...TENANT_TERMBASE,
      ...GLOBAL_TERMBASE,
    ];

    const enumMappings: Record<string, WorkflowEnumItem[]> = {};
    const enumKeys = new Set<string>([
      ...Object.keys(GLOBAL_ENUM_MAPPINGS),
      ...Object.keys(termAssets?.enumMappings || {}),
    ]);
    for (const enumKey of enumKeys) {
      enumMappings[enumKey] = [
        ...((termAssets?.enumMappings || {})[enumKey] || []),
        ...(GLOBAL_ENUM_MAPPINGS[enumKey] || []),
      ];
    }

    return {
      fieldDictionary,
      termbase,
      enumMappings,
    };
  }

  private matchFieldDictionary(
    text: string,
    assets: WorkflowResolvedAssets,
  ): WorkflowFieldDictionaryEntry | undefined {
    const normalized = this.normalizeLookupText(text);
    const matches = assets.fieldDictionary
      .filter((entry) => this.isAssetActive(entry.status))
      .map((entry) => {
        const matchedAlias = entry.aliases.find((alias) =>
          normalized.includes(this.normalizeLookupText(alias))
        );
        return matchedAlias
          ? {
              entry,
              matchedAlias,
            }
          : undefined;
      })
      .filter(Boolean) as Array<{ entry: WorkflowFieldDictionaryEntry; matchedAlias: string }>;

    matches.sort((left, right) => {
      const scopeDelta = this.scopePriority(right.entry.scope) - this.scopePriority(left.entry.scope);
      if (scopeDelta !== 0) {
        return scopeDelta;
      }
      return right.matchedAlias.length - left.matchedAlias.length;
    });

    return matches[0]?.entry;
  }

  private extractSampleText(contentBase64: string | undefined, warnings: string[]): string {
    if (!contentBase64) {
      return '';
    }
    try {
      const base64 = contentBase64.replace(/^base64:/, '');
      const buffer = Buffer.from(base64, 'base64');
      const text = buffer.toString('utf-8');
      if (text.includes('<w:t')) {
        return text;
      }
      return text;
    } catch {
      warnings.push('样本文档解析失败，已回退为仅基于模板结构分析');
      return '';
    }
  }

  private async extractSampleTextRich(
    contentBase64: string | undefined,
    warnings: string[],
  ): Promise<string> {
    if (!contentBase64) {
      return '';
    }

    try {
      const base64 = contentBase64.replace(/^base64:/, '');
      const buffer = Buffer.from(base64, 'base64');
      const header = buffer.subarray(0, 2).toString('utf-8');

      if (header === 'PK') {
        const zip = await JSZip.loadAsync(buffer);
        const documentFile = zip.file('word/document.xml');
        if (documentFile) {
          const xml = await documentFile.async('text');
          const extracted = this.extractReadableTextFromWordXml(xml);
          if (extracted) {
            return extracted;
          }
        }
      }

      const text = buffer.toString('utf-8');
      if (text.includes('<w:t')) {
        return this.extractReadableTextFromWordXml(text);
      }

      return this.normalizePlainText(text);
    } catch (error) {
      this.logger.warn(`样本文本提取失败: ${error instanceof Error ? error.message : 'unknown error'}`);
      warnings.push('样本文本提取失败，已退化为仅基于模板内容');
      return '';
    }
  }

  private extractReadableTextFromWordXml(xml: string): string {
    return this.normalizePlainText(
      xml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<\/w:tr>/g, '\n')
        .replace(/<\/w:tc>/g, '\t')
        .replace(/<w:tab\/>/g, '\t')
        .replace(/<w:br\/>/g, '\n')
        .replace(/<[^>]+>/g, ' ')
    );
  }

  private normalizePlainText(value: string): string {
    return value
      .replace(/[^\S\r\n\t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private async generateUnderstandingSummaryWithAI(input: {
    templateDocumentIr: WorkflowDocumentIR;
    sampleDocument?: { fileName?: string; contentBase64?: string };
    sampleText: string;
    sourceLanguage: string;
    targetLanguages: string[];
    fallbackSectionHints: string[];
    fallbackTerminologyCandidates: string[];
    fallbackLayoutFeatures: string[];
    fieldCandidateIds: string[];
    candidateFields: WorkflowFieldCandidate[];
  }): Promise<{
    summary: {
      documentTitle?: string;
      understandingSummaryText?: string;
      sectionHints: string[];
      sectionSummaries: WorkflowUnderstandResult['summary']['sectionSummaries'];
      terminologyCandidates: string[];
      layoutFeatures: string[];
      warnings: string[];
    };
    usedAI: boolean;
    aiServiceUrl?: string;
    promptRequestText?: string;
    rawAiResponse?: string;
  }> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const promptRequestText = this.buildWorkflowUnderstandingPrompt(input);
    const fallbackSectionSummaries = this.buildUnderstandingSectionSummaries(input.candidateFields);

    try {
      const rawAiResponse = await this.callWorkflowUnderstandingAI(promptRequestText);
      const understandingSummaryText = this.normalizeWorkflowUnderstandingText(rawAiResponse);
      if (!understandingSummaryText) {
        return {
          summary: {
            understandingSummaryText: this.buildFallbackWorkflowUnderstandingSummaryText({
              documentTitle: this.safeText(input.sampleDocument?.fileName),
              sourceLanguage: input.sourceLanguage,
              targetLanguages: input.targetLanguages,
              paragraphCount: Number(input.templateDocumentIr.stats?.paragraphCount || 0),
              tableCount: Number(input.templateDocumentIr.stats?.tableCount || 0),
              sectionHints: input.fallbackSectionHints,
              terminologyCandidates: input.fallbackTerminologyCandidates,
              layoutFeatures: input.fallbackLayoutFeatures,
              fieldCandidateIds: input.fieldCandidateIds,
              sampleFileName: input.sampleDocument?.fileName,
            }),
            sectionHints: input.fallbackSectionHints,
            sectionSummaries: fallbackSectionSummaries,
            terminologyCandidates: input.fallbackTerminologyCandidates,
            layoutFeatures: input.fallbackLayoutFeatures,
            warnings: ['AI 整体理解返回无法解析，已回退到规则摘要'],
          },
          usedAI: false,
          aiServiceUrl: aiOrchestratorUrl,
          promptRequestText,
          rawAiResponse,
        };
      }

      return {
        summary: {
          documentTitle:
            this.safeText(input.templateDocumentIr.metadata?.title)
            || this.safeText(input.sampleDocument?.fileName)
            || undefined,
          understandingSummaryText,
          sectionHints: input.fallbackSectionHints,
          sectionSummaries: fallbackSectionSummaries,
          terminologyCandidates: input.fallbackTerminologyCandidates,
          layoutFeatures: input.fallbackLayoutFeatures,
          warnings: [],
        },
        usedAI: true,
        aiServiceUrl: aiOrchestratorUrl,
        promptRequestText,
        rawAiResponse,
      };
    } catch (error) {
      this.logger.warn(`AI 整体理解调用失败: ${error instanceof Error ? error.message : 'unknown error'}`);
      return {
        summary: {
          understandingSummaryText: this.buildFallbackWorkflowUnderstandingSummaryText({
            documentTitle: this.safeText(input.sampleDocument?.fileName),
            sourceLanguage: input.sourceLanguage,
            targetLanguages: input.targetLanguages,
            paragraphCount: Number(input.templateDocumentIr.stats?.paragraphCount || 0),
            tableCount: Number(input.templateDocumentIr.stats?.tableCount || 0),
            sectionHints: input.fallbackSectionHints,
            terminologyCandidates: input.fallbackTerminologyCandidates,
            layoutFeatures: input.fallbackLayoutFeatures,
            fieldCandidateIds: input.fieldCandidateIds,
            sampleFileName: input.sampleDocument?.fileName,
          }),
          sectionHints: input.fallbackSectionHints,
          sectionSummaries: fallbackSectionSummaries,
          terminologyCandidates: input.fallbackTerminologyCandidates,
          layoutFeatures: input.fallbackLayoutFeatures,
          warnings: ['AI 整体理解调用失败，已回退到规则摘要'],
        },
        usedAI: false,
        aiServiceUrl: aiOrchestratorUrl,
        promptRequestText,
      };
    }
  }

  private buildWorkflowUnderstandingPrompt(input: {
    templateDocumentIr: WorkflowDocumentIR;
    sampleDocument?: { fileName?: string; contentBase64?: string };
    sampleText: string;
    sourceLanguage: string;
    targetLanguages: string[];
    fallbackSectionHints: string[];
    fallbackTerminologyCandidates: string[];
    fallbackLayoutFeatures: string[];
    fieldCandidateIds: string[];
    candidateFields: WorkflowFieldCandidate[];
  }): string {
    return buildWorkflowUnderstandingPromptText({
      documentType: String(input.templateDocumentIr?.metadata?.documentType || 'word_document'),
      sourceLanguage: input.sourceLanguage,
      targetLanguages: input.targetLanguages,
      sampleFileName: this.safeText(input.sampleDocument?.fileName) || 'unknown',
      fallbackSectionHints: input.fallbackSectionHints,
      fallbackLayoutFeatures: input.fallbackLayoutFeatures,
      templateExcerpt: this.buildWorkflowTemplateExcerpt(input.templateDocumentIr),
      sampleText: input.sampleText,
    });
  }

  private buildFallbackWorkflowUnderstandingSummaryText(input: {
    documentTitle?: string;
    sourceLanguage: string;
    targetLanguages: string[];
    paragraphCount: number;
    tableCount: number;
    sectionHints: string[];
    terminologyCandidates: string[];
    layoutFeatures: string[];
    fieldCandidateIds: string[];
    sampleFileName?: string;
  }): string {
    const title = this.safeText(input.documentTitle) || '正式业务文档';
    const sectionText = input.sectionHints.length > 0
      ? input.sectionHints.slice(0, 4).join('、')
      : '未提取到明确章节';
    return [
      '## 文档类型与用途',
      `- 该文档可归纳为“${title}”这一类正式 Word 文档，主要用于承载业务约定、履约条件与权责边界。`,
      '',
      '## 核心业务实体',
      '- 文档通常围绕合同主体、服务提供方与服务接收方等核心角色展开，并描述主体之间的业务关系与责任分工。',
      '',
      '## 章节职责划分',
      `- 文档主要章节通常围绕 ${sectionText} 等内容展开，用于描述基础信息、服务范围、履约条款及其他约束条件。`,
    ].join('\n');
  }

  private buildWorkflowTemplateExcerpt(templateDocumentIr: WorkflowDocumentIR): string {
    const elements = Array.isArray(templateDocumentIr.elements) ? templateDocumentIr.elements : [];
    return elements
      .filter((element) => element.type === 'paragraph' || element.type === 'table' || element.type === 'cell')
      .map((element) => this.safeText(element.text))
      .filter(Boolean)
      .slice(0, 80)
      .join('\n');
  }

  private async callWorkflowUnderstandingAI(prompt: string, retryCount = 0): Promise<string> {
    const aiOrchestratorUrl = getAiOrchestratorUrl();
    const aiModelId = process.env.AI_MODEL_ID || 'default';
    const maxRetries = 2;
    const actualPrompt = retryCount > 0
      ? `${prompt}\n\n【重要】请只返回 JSON 对象，不要 markdown，不要解释文字。`
      : prompt;

    try {
      const response = await axios.post<{ response?: string }>(
        `${aiOrchestratorUrl}/ai/models/${aiModelId}/test`,
        { prompt: actualPrompt },
        { timeout: 180000 },
      );
      const content = String(response.data?.response || '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

      if (content) {
        return content;
      }

      if (retryCount < maxRetries) {
        return this.callWorkflowUnderstandingAI(prompt, retryCount + 1);
      }

      throw new Error('AI 返回为空');
    } catch (error) {
      if (retryCount < maxRetries) {
        return this.callWorkflowUnderstandingAI(prompt, retryCount + 1);
      }
      throw error;
    }
  }

  private parseWorkflowUnderstandingAiResponse(content: string): Record<string, unknown> | undefined {
    const direct = this.tryParseJsonObject(content);
    if (direct) {
      return direct;
    }

    const match = content.match(/\{[\s\S]*\}/);
    return match ? this.tryParseJsonObject(match[0]) : undefined;
  }

  private normalizeWorkflowUnderstandingText(content: string): string | undefined {
    const normalized = this.safeText(
      String(content || '')
        .replace(/```text\s*/gi, '')
        .replace(/```markdown\s*/gi, '')
        .replace(/```\s*/g, '')
    );
    return normalized || undefined;
  }

  private tryParseJsonObject(value: string): Record<string, unknown> | undefined {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }

  private normalizeStringArray(value: unknown, limit: number): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const normalized = Array.from(new Set(
      value
        .map((item) => this.safeText(item))
        .filter(Boolean)
    )).slice(0, limit);

    return normalized.length > 0 ? normalized : undefined;
  }

  private findTermMatch(
    fieldId: string,
    text: string,
    assets: WorkflowResolvedAssets,
  ): WorkflowTermEntry | undefined {
    const normalized = this.normalizeLookupText(text);
    const matches = assets.termbase
      .filter((entry) =>
        this.isAssetActive(entry.status)
        && entry.applicableFieldIds.includes(fieldId)
      )
      .map((entry) => {
        const normalizedSource = this.normalizeLookupText(entry.normalizedSourceValue || entry.sourceValue);
        if (!normalizedSource) {
          return undefined;
        }
        if (!(normalized === normalizedSource || normalized.includes(normalizedSource))) {
          return undefined;
        }
        return {
          entry,
          normalizedSource,
        };
      })
      .filter(Boolean) as Array<{ entry: WorkflowTermEntry; normalizedSource: string }>;

    matches.sort((left, right) => {
      const scopeDelta = this.scopePriority(right.entry.scope) - this.scopePriority(left.entry.scope);
      if (scopeDelta !== 0) {
        return scopeDelta;
      }
      return right.normalizedSource.length - left.normalizedSource.length;
    });

    return matches[0]?.entry;
  }

  private findEnumMatch(
    fieldId: string,
    sourceValue: string,
    assets: WorkflowResolvedAssets,
  ): WorkflowEnumItem | undefined {
    const items = assets.enumMappings[fieldId] || [];
    const normalized = this.normalizeLookupText(sourceValue);
    const matches = items
      .filter((item) => this.isAssetActive(item.status))
      .filter((item) =>
        item.aliases.some((alias) => this.normalizeLookupText(alias) === normalized)
        || Object.values(item.labels).some((label) => this.normalizeLookupText(label) === normalized)
      );

    matches.sort((left, right) => this.scopePriority(right.scope) - this.scopePriority(left.scope));
    return matches[0];
  }

  private normalizeLookupText(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[（）()]/g, '')
      .replace(/\s+/g, '');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private scopePriority(scope?: WorkflowAssetScope): number {
    if (scope === 'template') {
      return 3;
    }
    if (scope === 'tenant') {
      return 2;
    }
    return 1;
  }

  private isAssetActive(status?: WorkflowAssetStatus): boolean {
    return status !== 'deprecated' && status !== 'draft';
  }

  private readSelector(value: Record<string, unknown>, selector: string): unknown {
    const normalized = selector.replace(/^\w+\./, '');
    const segments = normalized.split('.');
    let current: unknown = value;
    for (const segment of segments) {
      if (!current || typeof current !== 'object' || !(segment in (current as Record<string, unknown>))) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  private extractFieldValue(fieldId: string, userInput: string, overrideValue: unknown): unknown {
    if (overrideValue !== undefined) {
      return overrideValue;
    }

    const normalizedInput = userInput.trim();
    const matchValue = (patterns: RegExp[]): string | undefined => {
      for (const pattern of patterns) {
        const match = normalizedInput.match(pattern);
        const value = match?.[1]?.trim();
        if (value) {
          return value;
        }
      }
      return undefined;
    };

    switch (fieldId) {
      case 'partyAName':
        return matchValue([
          /甲方(?:是|为)?([^，。；]+)/u,
          /委托方[:：]?\s*([^，。；]+)/u,
        ]);
      case 'partyBName':
        return matchValue([
          /乙方(?:是|为)?([^，。；]+)/u,
          /受托方[:：]?\s*([^，。；]+)/u,
        ]);
      case 'projectName':
        return matchValue([
          /项目(?:名称)?(?:是|为)?([^，。；]+)/u,
          /件名[:：]?\s*([^，。；]+)/u,
        ]);
      case 'serviceLocation':
      case 'deliveryLocation':
        return matchValue([
          /(?:服务|交付|签订)地点(?:是|为)?([^，。；]+)/u,
          /地点[:：]?\s*([^，。；]+)/u,
        ]);
      case 'serviceFeeTotal':
        return matchValue([
          /(?:技术服务费总额|服务费总额|合同总额|总金额|总价)(?:为|是)?([^，。；]+)/u,
          /(人民币[\d,]+(?:\.\d+)?元?)/u,
        ]);
      case 'paymentMode':
        return matchValue([
          /(一次支付|一次付款|一次性支付|一次|分期支付|分期付款|分期|分次支付)/u,
        ]);
      case 'bankAccount':
        return matchValue([
          /(?:银行账号|银行账户)(?:为|是)?([0-9]{8,})/u,
          /\b([0-9]{8,})\b/u,
        ]);
      case 'signingDate':
        return matchValue([
          /(?:签订日期|签约日期)(?:为|是)?([0-9]{4}[年/-][0-9]{1,2}[月/-][0-9]{1,2}日?)/u,
        ]);
      case 'acceptanceDays':
        return matchValue([
          /验收(?:期限|天数)?(?:为|是)?([0-9]+)\s*天/u,
        ]);
      case 'paymentDeadlineDays':
        return matchValue([
          /付款(?:期限|截止天数)?(?:为|是)?([0-9]+)\s*(?:天|工作日)/u,
        ]);
      case 'serviceScopeSummary':
        return matchValue([
          /(?:服务内容|服务范围)(?:是|为)?([^。；]+)/u,
        ]);
      default:
        return undefined;
    }
  }

  private parseListValueFromText(
    rawInput: string,
    spec: WorkflowTemplateFieldSpec,
  ): Array<Record<string, unknown>> | undefined {
    const normalizedInput = typeof rawInput === 'string' ? rawInput.replace(/\r/g, '') : '';
    if (!normalizedInput || !normalizedInput.includes('\t')) {
      return undefined;
    }

    const lines = normalizedInput
      .split('\n')
      .map((line) => line.replace(/^[ \f\v]+|[ \f\v]+$/g, ''))
      .filter((line) => line.trim().length > 0)
      .map((line) => line.split('\t').map((cell) => cell.trim()));

    if (lines.length < 2) {
      return undefined;
    }

    const expectedWidth = this.resolveTabularRowWidth(lines, spec.itemSchema);
    if (!expectedWidth || expectedWidth < 2) {
      return undefined;
    }

    const candidateRows = lines.filter((row) => row.length === expectedWidth);
    if (candidateRows.length < 2) {
      return undefined;
    }

    const logicalRows: string[][] = [];
    for (let index = 0; index < candidateRows.length; index += 1) {
      const currentRow = candidateRows[index];
      const nextRow = candidateRows[index + 1];
      if (nextRow && this.shouldMergeBilingualTabularRows(currentRow, nextRow, expectedWidth)) {
        logicalRows.push(currentRow.map((cell, cellIndex) =>
          this.mergeTabularCellText(cell, nextRow[cellIndex]),
        ));
        index += 1;
        continue;
      }
      logicalRows.push(currentRow);
    }

    if (logicalRows.length < 2) {
      return undefined;
    }

    const headerRow = logicalRows[0];
    const dataRows = logicalRows
      .slice(1)
      .filter((row) => row.some((cell) => this.safeText(cell)));

    if (dataRows.length === 0) {
      return undefined;
    }

    const columnKeys = this.resolveListColumnKeys(headerRow, spec.itemSchema, expectedWidth);
    const items = dataRows.map((row) => {
      const item: Record<string, unknown> = {};
      for (let index = 0; index < expectedWidth; index += 1) {
        const key = columnKeys[index];
        if (!key) {
          continue;
        }
        item[key] = this.safeText(row[index]);
      }
      return item;
    });
    if (spec.type === 'table_row') {
      this.logger.log(
        `[table-data] parsed field=${spec.fieldId} rows=${items.length} width=${expectedWidth}`,
      );
    }
    return items;
  }

  private resolveTabularRowWidth(lines: string[][], itemSchema?: string[]): number | undefined {
    if (Array.isArray(itemSchema) && itemSchema.length >= 2) {
      return itemSchema.length;
    }

    const counts = new Map<number, number>();
    for (const row of lines) {
      if (row.length < 2) {
        continue;
      }
      counts.set(row.length, (counts.get(row.length) || 0) + 1);
    }

    let selectedWidth: number | undefined;
    let selectedCount = 0;
    for (const [width, count] of counts.entries()) {
      if (count > selectedCount) {
        selectedWidth = width;
        selectedCount = count;
      }
    }
    return selectedWidth;
  }

  private shouldMergeBilingualTabularRows(
    currentRow: string[],
    nextRow: string[],
    expectedWidth: number,
  ): boolean {
    if (currentRow.length !== expectedWidth || nextRow.length !== expectedWidth) {
      return false;
    }

    const currentHint = this.detectTextLanguageHint(currentRow.join(' '));
    const nextHint = this.detectTextLanguageHint(nextRow.join(' '));
    if (
      this.isConcreteLanguageHint(currentHint)
      && this.isConcreteLanguageHint(nextHint)
      && currentHint !== nextHint
    ) {
      return true;
    }

    return currentRow.some((cell, index) => {
      const currentText = this.safeText(cell);
      const nextText = this.safeText(nextRow[index]);
      if (!currentText || !nextText || currentText === nextText) {
        return false;
      }
      const currentCellHint = this.detectTextLanguageHint(currentText);
      const nextCellHint = this.detectTextLanguageHint(nextText);
      return this.isConcreteLanguageHint(currentCellHint)
        && this.isConcreteLanguageHint(nextCellHint)
        && currentCellHint !== nextCellHint;
    });
  }

  private mergeTabularCellText(primary: string, secondary: string): string {
    const first = this.safeText(primary);
    const second = this.safeText(secondary);
    if (!first) {
      return second;
    }
    if (!second || first === second) {
      return first;
    }
    return `${first}\n${second}`;
  }

  private resolveListColumnKeys(
    headerRow: string[],
    itemSchema: string[] | undefined,
    expectedWidth: number,
  ): string[] {
    if (Array.isArray(itemSchema) && itemSchema.length === expectedWidth) {
      return itemSchema;
    }

    return headerRow.map((header, index) => {
      const normalizedHeader = this.normalizeLookupText(this.safeText(header));
      if (/项目|件名|project/u.test(normalizedHeader)) {
        return 'projectName';
      }
      if (/品名|服务|名称|item|service/u.test(normalizedHeader)) {
        return 'itemName';
      }
      if (/数量|qty|quantity/u.test(normalizedHeader)) {
        return 'quantity';
      }
      if (/维护费|メンテ|金额|费用|price|fee|amount/u.test(normalizedHeader)) {
        return 'maintenanceFee';
      }
      return `column${index + 1}`;
    });
  }

  private normalizeTableListRows(
    rows: Array<Record<string, unknown>>,
    spec: WorkflowTemplateFieldSpec,
    sourceLanguage: string,
    targetLanguages: string[],
  ): Array<Record<string, unknown>> {
    if (spec.type !== 'table_row' || !Array.isArray(rows) || rows.length === 0) {
      return rows;
    }

    const preferredLanguages = this.resolveTableRowLanguages(spec, sourceLanguage, targetLanguages);
    const hasExplicitAliases = rows.some((row) =>
      Object.keys(row || {}).some((key) => Boolean(this.extractTableFieldBaseKey(key, preferredLanguages))),
    );
    const hasMultilineCells = rows.some((row) =>
      Object.values(row || {}).some((value) => this.splitTableCellLines(this.safeText(value)).length >= 2),
    );
    const shouldExpand = hasExplicitAliases || (preferredLanguages.length >= 2 && hasMultilineCells);
    if (!shouldExpand) {
      return rows;
    }

    const normalizedRows = rows.map((row) => this.normalizeTableListRow(row, spec, preferredLanguages));
    const expandedRows = normalizedRows.filter((row, index) =>
      JSON.stringify(row) !== JSON.stringify(rows[index])
    ).length;

    if (expandedRows > 0) {
      this.logger.log(
        `[table-data] normalized field=${spec.fieldId} rows=${rows.length} expandedRows=${expandedRows} languages=${preferredLanguages.join(',') || 'auto'}`,
      );
      this.logger.debug(
        `[table-data] normalized field=${spec.fieldId} sampleKeys=${Object.keys(normalizedRows[0] || {}).join(',')}`,
      );
    }

    return normalizedRows;
  }

  private normalizeTableListRow(
    row: Record<string, unknown>,
    spec: WorkflowTemplateFieldSpec,
    preferredLanguages: string[],
  ): Record<string, unknown> {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return row;
    }

    const normalizedRow: Record<string, unknown> = { ...row };
    const rowKeys = Object.keys(normalizedRow);
    const rowHasMultilingualSignal = rowKeys.some((key) =>
      Boolean(this.extractTableFieldBaseKey(key, preferredLanguages)),
    ) || Object.values(normalizedRow).some((value) =>
      this.splitTableCellLines(this.safeText(value)).length >= 2,
    );
    const baseKeys = new Set<string>(
      rowKeys.map((key) => this.extractTableFieldBaseKey(key, preferredLanguages) || key),
    );

    for (const itemKey of spec.itemSchema || []) {
      baseKeys.add(this.extractTableFieldBaseKey(itemKey, preferredLanguages) || itemKey);
    }

    for (const baseKey of baseKeys) {
      const aliasMap = this.resolveTableCellAliasMap(
        normalizedRow,
        baseKey,
        preferredLanguages,
        rowHasMultilingualSignal,
      );
      for (const [lang, value] of aliasMap.entries()) {
        const languageKey = `${baseKey}_${lang}`;
        if (normalizedRow[languageKey] === undefined && value !== undefined) {
          normalizedRow[languageKey] = value;
        }
      }

      if (normalizedRow[baseKey] === undefined) {
        const mergedValue = this.mergeTableLanguageValues(aliasMap, preferredLanguages);
        if (mergedValue !== undefined) {
          normalizedRow[baseKey] = mergedValue;
        }
      }
    }

    return normalizedRow;
  }

  private resolveTableRowLanguages(
    spec: WorkflowTemplateFieldSpec,
    sourceLanguage: string,
    targetLanguages: string[],
  ): string[] {
    return Array.from(
      new Set([
        spec.sourceLanguage || sourceLanguage,
        ...(spec.targetLanguages || []),
        ...targetLanguages,
      ].filter(Boolean)),
    );
  }

  private extractTableFieldBaseKey(key: string, preferredLanguages: string[]): string | undefined {
    const match = key.match(/^(.+)_([a-z]{2,5})$/iu);
    if (!match) {
      return undefined;
    }

    const suffix = match[2].toLowerCase();
    if (preferredLanguages.includes(suffix) || ['zh', 'ja', 'en'].includes(suffix)) {
      return match[1];
    }
    return undefined;
  }

  private resolveTableCellAliasMap(
    row: Record<string, unknown>,
    baseKey: string,
    preferredLanguages: string[],
    rowHasMultilingualSignal: boolean,
  ): Map<string, string> {
    const aliasMap = new Map<string, string>();
    const baseValue = this.safeText(row[baseKey]);

    for (const [key, rawValue] of Object.entries(row)) {
      const suffix = this.extractTableLanguageSuffix(key, baseKey);
      const normalizedValue = this.safeText(rawValue);
      if (!suffix || !normalizedValue) {
        continue;
      }
      aliasMap.set(suffix, normalizedValue);
    }

    if (!baseValue) {
      if (rowHasMultilingualSignal && preferredLanguages.length >= 2 && baseKey in row) {
        for (const language of preferredLanguages) {
          if (!aliasMap.has(language)) {
            aliasMap.set(language, '');
          }
        }
      }
      return aliasMap;
    }

    if (preferredLanguages.length === 0 && aliasMap.size === 0) {
      return aliasMap;
    }

    const lines = this.splitTableCellLines(baseValue);
    if (lines.length >= 2 && preferredLanguages.length >= 2) {
      const orderedLanguages = this.orderTableLanguagesForCell(lines, preferredLanguages);
      for (let index = 0; index < orderedLanguages.length && index < lines.length; index += 1) {
        const language = orderedLanguages[index];
        if (!aliasMap.has(language)) {
          aliasMap.set(language, lines[index]);
        }
      }
      return aliasMap;
    }

    if (lines.length === 1 && preferredLanguages.length >= 1) {
      const [line] = lines;
      const hint = this.detectTextLanguageHint(line);
      if (this.isLanguageNeutralTableValue(line)) {
        for (const language of preferredLanguages) {
          if (!aliasMap.has(language)) {
            aliasMap.set(language, line);
          }
        }
      } else if (this.isConcreteLanguageHint(hint)) {
        if (!aliasMap.has(hint)) {
          aliasMap.set(hint, line);
        }
      } else {
        for (const language of preferredLanguages) {
          if (!aliasMap.has(language)) {
            aliasMap.set(language, line);
          }
        }
      }
    }

    return aliasMap;
  }

  private extractTableLanguageSuffix(key: string, baseKey: string): string | undefined {
    const match = key.match(/^(.+)_([a-z]{2,5})$/iu);
    if (!match || match[1] !== baseKey) {
      return undefined;
    }
    return match[2].toLowerCase();
  }

  private orderTableLanguagesForCell(lines: string[], preferredLanguages: string[]): string[] {
    const detectedLanguages = lines
      .map((line) => this.detectTextLanguageHint(line))
      .filter((hint): hint is 'zh' | 'ja' | 'en' => this.isConcreteLanguageHint(hint));

    if (
      detectedLanguages.length === lines.length
      && new Set(detectedLanguages).size === detectedLanguages.length
    ) {
      return detectedLanguages;
    }

    return preferredLanguages.slice(0, lines.length);
  }

  private mergeTableLanguageValues(
    aliasMap: Map<string, string>,
    preferredLanguages: string[],
  ): string | undefined {
    const orderedValues = preferredLanguages
      .map((language) => this.safeText(aliasMap.get(language)))
      .filter(Boolean);
    const fallbackValues = Array.from(aliasMap.values()).filter((value) =>
      !orderedValues.includes(value),
    );
    const values = [...orderedValues, ...fallbackValues];
    if (values.length === 0) {
      return undefined;
    }
    if (values.every((value) => value === values[0])) {
      return values[0];
    }
    return values.join('\n');
  }

  private isLanguageNeutralTableValue(value: string): boolean {
    const normalizedValue = this.safeText(value);
    if (!normalizedValue) {
      return false;
    }
    return /^[¥$€￥0-9,.\-/%() \t年月日天工作日元円个次份]*$/u.test(normalizedValue);
  }

  private parseAmount(value: unknown): number | undefined {
    const normalized = this.safeText(value).replace(/[^\d.,-]/g, '');
    if (!normalized) {
      return undefined;
    }
    const numeric = Number(normalized.replace(/,/g, ''));
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  private parseDate(value: unknown): string | undefined {
    const normalized = this.safeText(value)
      .replace(/年/g, '-')
      .replace(/月/g, '-')
      .replace(/日/g, '')
      .replace(/\//g, '-');
    if (!normalized) {
      return undefined;
    }
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return undefined;
    }
    return date.toISOString().slice(0, 10);
  }

  private formatCurrency(amount: number, language: string): string {
    const formatted = amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    if (language === 'ja') {
      return `人民元${formatted}元`;
    }
    if (language === 'en') {
      return `CNY ${formatted}`;
    }
    return `人民币${formatted}元`;
  }

  private formatDate(isoDate: string, language: string): string {
    const [year, month, day] = isoDate.split('-');
    if (language === 'en') {
      const date = new Date(isoDate);
      return date.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
    return `${year}年${month}月${day}日`;
  }

  private extractAnchorPrefix(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const match = normalized.match(/^(.+?[:：])/u);
    if (match?.[1]) {
      return match[1];
    }
    const placeholderMatcher = this.extractPlaceholderMatcher(normalized);
    if (placeholderMatcher?.prefix) {
      const prefix = placeholderMatcher.prefix.replace(/[：:]$/u, '').trim();
      const suffix = placeholderMatcher.suffix.trim();
      if (prefix && suffix) {
        return `${prefix} ... ${suffix.slice(0, 16)}`.slice(0, 32);
      }
      if (prefix) {
        return prefix.slice(0, 24);
      }
    }
    return normalized.slice(0, 20);
  }

  private hasBlankPlaceholder(text: string): boolean {
    const normalized = this.safeText(text);
    return /[_＿]{2,}|\s{4,}/u.test(normalized);
  }

  private extractPlaceholderMatcher(text: string): { prefix: string; suffix: string } | undefined {
    const normalized = this.safeText(text);
    if (!normalized) {
      return undefined;
    }
    const match = normalized.match(/^(.*?)(?:[_＿]{2,}|\s{4,})(.*)$/u);
    if (!match) {
      return undefined;
    }
    return {
      prefix: this.safeText(match[1]).slice(-32),
      suffix: this.safeText(match[2]).slice(0, 32),
    };
  }

  private extractPlaceholderSampleValue(templateText: string, sampleText: string): string {
    const matcher = this.extractPlaceholderMatcher(templateText);
    const normalizedSampleText = this.safeText(sampleText);
    if (!matcher || !normalizedSampleText) {
      return '';
    }

    if (matcher.prefix && matcher.suffix) {
      const pattern = new RegExp(
        `${this.escapeRegExp(matcher.prefix)}\\s*(.{1,80}?)\\s*${this.escapeRegExp(matcher.suffix)}`,
        'u',
      );
      const matched = normalizedSampleText.match(pattern);
      const value = this.safeText(matched?.[1]);
      if (value) {
        return value;
      }
    }

    if (matcher.prefix) {
      const pattern = new RegExp(`${this.escapeRegExp(matcher.prefix)}\\s*(.{1,80})`, 'u');
      const matched = normalizedSampleText.match(pattern);
      const value = this.safeText(matched?.[1])
        .split(/[，。；\n]/u)[0]
        ?.trim();
      if (value) {
        return value;
      }
    }

    return '';
  }

  private inferRecognitionBlockTitle(text: string, blockType: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return blockType;
    }
    if (normalized.length <= 24) {
      return normalized;
    }
    return `${normalized.slice(0, 24)}...`;
  }

  private numberOrUndefined(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  private getElementHostData(element: WorkflowDocumentElement): Record<string, unknown> {
    return element.hostData && typeof element.hostData === 'object'
      ? element.hostData as Record<string, unknown>
      : {};
  }

  private safeText(value: unknown): string {
    return String(value ?? '').trim();
  }
}
