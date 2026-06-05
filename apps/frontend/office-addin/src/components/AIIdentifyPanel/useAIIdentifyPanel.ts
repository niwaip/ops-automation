import { useState, useEffect } from 'react';
import { useAppStore } from '../../taskpane/store';
import { carboneAPI } from '../../api/carbone-api';
import type {
  TemplateAnalyzeResponse,
  TemplateFieldSpec,
  TemplateWorkflowSummary,
  WorkflowTermAssets,
  TemplateRenderDataResponse,
} from '../../api/carbone-api';
import { exportTemplateSource } from '../../services/template-source-service';
import { analyzeDocumentWithAI } from '../../services/suggestion-service';
import { AnalysisSummary, buildAnalysisSummary, mergeExcelSuggestionsByPairResult } from '../AIIdentifyPanel.helpers';
import { ExcelAPI } from '../../utils/office/excel/api';
import { getDefaultTemplateFormatForHost, getHostScopedStorageKey } from '../../utils/host-storage';

const DRAFT_STORAGE_KEY_SUFFIX = 'ai-template-draft';
export function useAIIdentifyPanel(hostAdapter: any, isExcelMode: boolean) {
  const store = useAppStore();
  const {
    officeType,
    suggestions,
    setSuggestions,
    setAnalysisError,
    setAnalyzing,
    addDebugLog,
    apiBaseUrl,
    aiOrchestratorBaseUrl,
    analysisExecutor,
    analysisThinkingEnabled,
    aiOrchestratorAuthToken,
    excelWorkbookUnderstanding,
    templateConfig,
  } = store;
  const draftStorageKey = getHostScopedStorageKey(officeType, DRAFT_STORAGE_KEY_SUFFIX);
  const hostDocumentFormat = getDefaultTemplateFormatForHost(officeType);

  const [selectedTemplateType, setSelectedTemplateType] = useState('contract');
  const [useMultiStage, setUseMultiStage] = useState(true);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [analysisSummary, setAnalysisSummary] = useState<AnalysisSummary | null>(null);
  const [stagedSuggestions, setStagedSuggestions] = useState<typeof suggestions>([]);
  const [assetSourceLanguage, setAssetSourceLanguage] = useState('zh');
  const [assetTargetLanguages, setAssetTargetLanguages] = useState<string[]>([]);

  // Template Asset states
  const [aiSkillGuide, setAiSkillGuide] = useState<any>(null);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftInfo, setDraftInfo] = useState<{ templateType: string; parameterCount: number; savedAt: string } | null>(null);
  const [latestBackendDraftInfo, setLatestBackendDraftInfo] = useState<{
    id: string;
    fileName: string;
    savedAt: string;
  } | null>(null);
  const [templateAssetDraftInfo, setTemplateAssetDraftInfo] = useState<{
    fieldCount: number;
    status?: string;
    sourceLanguage?: string;
    targetLanguages?: string[];
    bindingPlanVersion?: number;
    fields: TemplateFieldSpec[];
    termAssets?: WorkflowTermAssets;
  } | null>(null);
  const [templateFieldSpecsDraft, setTemplateFieldSpecsDraft] = useState<TemplateFieldSpec[]>([]);
  const [templateTermAssetsDraft, setTemplateTermAssetsDraft] = useState<WorkflowTermAssets | null>(null);
  const [templateTermAssetsText, setTemplateTermAssetsText] = useState('');
  const [isSavingTemplateAssetManifest, setIsSavingTemplateAssetManifest] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [templateAssetNotice, setTemplateAssetNotice] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    lines?: string[];
  } | null>(null);

  // Verify and Save states
  const [aiDescription, setAiDescription] = useState('');
  const [aiGeneratedData, setAiGeneratedData] = useState<any>(null);
  const [isGeneratingParams, setIsGeneratingParams] = useState(false);
  const [aiGenerateResult, setAiGenerateResult] = useState<{ success: boolean; message: string } | null>(null);
  const [previewResult, setPreviewResult] = useState<{ success: boolean; message: string; previewUrl?: string; downloadUrl?: string; generatedData?: any } | null>(null);
  const [templateAssetRenderDiagnostics, setTemplateAssetRenderDiagnostics] = useState<TemplateRenderDataResponse | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [collapsedSuggestionGroups, setCollapsedSuggestionGroups] = useState<Record<string, boolean>>({});
  const [collapsedPairDetails, setCollapsedPairDetails] = useState<Record<string, boolean>>({});

  const resolveDraftParameterCount = (data: {
    suggestions?: unknown;
    parameterCount?: unknown;
    aiSkillGuide?: { parameters?: unknown } | null;
    variables?: unknown;
  }): number => {
    if (typeof data.parameterCount === 'number' && data.parameterCount > 0) {
      return data.parameterCount;
    }
    if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
      return data.suggestions.length;
    }
    const skillParameters = data.aiSkillGuide && Array.isArray(data.aiSkillGuide.parameters)
      ? data.aiSkillGuide.parameters
      : [];
    if (skillParameters.length > 0) {
      return skillParameters.length;
    }
    if (Array.isArray(data.variables) && data.variables.length > 0) {
      return data.variables.length;
    }
    return 0;
  };

  const applyDraftSnapshot = (
    data: any,
    options?: { logRestore?: boolean; restoreSuggestions?: boolean; restoreSkillGuide?: boolean }
  ) => {
    if (!data) {
      return;
    }

    if (data.draftId) {
      setDraftId(data.draftId);
    }
    if (data.templateType) {
      setSelectedTemplateType(data.templateType);
    }
    const shouldRestoreSuggestions = options?.restoreSuggestions !== false;
    if (shouldRestoreSuggestions && Array.isArray(data.suggestions)) {
      setSuggestions(data.suggestions);
      if (options?.logRestore !== false) {
        addDebugLog('info', '已从暂存副本恢复参数', `恢复 ${data.suggestions.length} 个参数，后续识别结果会与未覆盖的旧参数合并显示`);
      }
    }
    if (options?.restoreSkillGuide !== false && data.aiSkillGuide) {
      setAiSkillGuide(data.aiSkillGuide);
    }
    if (typeof data.aiDescription === 'string') {
      setAiDescription(data.aiDescription);
      try {
        setAiGeneratedData(JSON.parse(data.aiDescription));
      } catch {
        setAiGeneratedData(data.aiGeneratedData ?? null);
      }
    } else if (data.aiGeneratedData) {
      setAiGeneratedData(data.aiGeneratedData);
      setAiDescription(JSON.stringify(data.aiGeneratedData, null, 2));
    }
    if (typeof data.templateName === 'string') {
      setTemplateName(data.templateName);
    }
    if (data.draftId) {
      const parameterCount = resolveDraftParameterCount(data);
      setDraftInfo({
        templateType: data.templateType || 'unknown',
        parameterCount,
        savedAt: data.savedAt || '',
      });
    }
    const restoredTemplateAssetDraftInfo = data.templateAssetDraftInfo || data.workflowDraftInfo;
    if (restoredTemplateAssetDraftInfo) {
      setTemplateAssetDraftInfo(restoredTemplateAssetDraftInfo);
      setTemplateTermAssetsDraft(restoredTemplateAssetDraftInfo.termAssets || null);
      setTemplateTermAssetsText(
        restoredTemplateAssetDraftInfo.termAssets
          ? JSON.stringify(restoredTemplateAssetDraftInfo.termAssets, null, 2)
          : ''
      );
    }
  };

  const readDraftSnapshot = () => {
    const stagedData = localStorage.getItem(draftStorageKey);
    if (!stagedData) {
      return null;
    }
    try {
      return JSON.parse(stagedData);
    } catch {
      return null;
    }
  };

  const parseDraftSequence = (fileName?: string): number => {
    const match = String(fileName || '').trim().match(/^draft-(\d+)/i);
    return match ? Number(match[1]) : 0;
  };

  const findLatestBackendDraft = async () => {
    carboneAPI.setBaseUrl(apiBaseUrl);
    const response = await carboneAPI.getTemplates({ includeDrafts: true });
    const templates = Array.isArray(response?.templates) ? response.templates : [];
    const draftTemplates = templates.filter(
      (template) =>
        String(template.fileName || '').trim().toLowerCase().startsWith('draft-')
        && template.format === hostDocumentFormat
    );
    if (draftTemplates.length === 0) {
      return null;
    }
    return draftTemplates.sort((a, b) => {
      const seqDelta = parseDraftSequence(b.fileName) - parseDraftSequence(a.fileName);
      if (seqDelta !== 0) {
        return seqDelta;
      }
      const timeA = new Date(String(a.createdAt || a.uploadedAt || 0)).getTime() || 0;
      const timeB = new Date(String(b.createdAt || b.uploadedAt || 0)).getTime() || 0;
      return timeB - timeA;
    })[0];
  };

  const refreshLatestBackendDraftInfo = async () => {
    try {
      const latestBackendDraft = await findLatestBackendDraft();
      if (!latestBackendDraft?.id) {
        setLatestBackendDraftInfo(null);
        return;
      }
      setLatestBackendDraftInfo({
        id: latestBackendDraft.id,
        fileName: String(latestBackendDraft.fileName || `${latestBackendDraft.id}.${latestBackendDraft.format || hostDocumentFormat}`),
        savedAt: String(latestBackendDraft.createdAt || latestBackendDraft.uploadedAt || ''),
      });
    } catch {
      setLatestBackendDraftInfo(null);
    }
  };

  // Recover Draft
  useEffect(() => {
    const snapshot = readDraftSnapshot();
    if (snapshot?.draftId) {
      applyDraftSnapshot(snapshot, {
        logRestore: false,
        restoreSuggestions: false,
        restoreSkillGuide: false,
      });
    }
  }, []);

  useEffect(() => {
    refreshLatestBackendDraftInfo();
  }, [apiBaseUrl, hostDocumentFormat]);

  useEffect(() => {
    setTemplateFieldSpecsDraft(templateAssetDraftInfo?.fields || []);
    setTemplateTermAssetsDraft(templateAssetDraftInfo?.termAssets || null);
    setTemplateTermAssetsText(
      templateAssetDraftInfo?.termAssets
        ? JSON.stringify(templateAssetDraftInfo.termAssets, null, 2)
        : ''
    );
  }, [templateAssetDraftInfo]);

  useEffect(() => {
    if (!templateAssetDraftInfo) {
      return;
    }
    if (templateAssetDraftInfo.sourceLanguage) {
      setAssetSourceLanguage(normalizeLanguageCode(templateAssetDraftInfo.sourceLanguage));
    }
    setAssetTargetLanguages(
      Array.from(
        new Set((templateAssetDraftInfo.targetLanguages || []).map((lang) => normalizeLanguageCode(lang)).filter(Boolean))
      )
    );
  }, [templateAssetDraftInfo]);

  const loadTemplateSource = async () => {
    const source = await exportTemplateSource(hostAdapter);
    source.warnings?.forEach((warning: any) => addDebugLog('warn', '模板源导出提示', warning));
    return {
      documentContent: source.content,
      format: source.format,
    };
  };

  const normalizeLanguageCode = (language?: string): string => {
    const normalized = String(language || 'zh').trim().toLowerCase();
    if (!normalized) {
      return 'zh';
    }
    return normalized.split(/[-_]/)[0] || 'zh';
  };

  const getAssetTargetLanguages = (): string[] => assetTargetLanguages;

  const normalizeSuggestedFieldId = (suggestedName: string): string => {
    const normalized = String(suggestedName || '')
      .replace(/[{}]/g, '')
      .replace(/^[dct]\./, '')
      .replace(/\[(?:\d+)?\]/g, '')
      .replace(/^\.+|\.+$/g, '')
      .trim();
    if (!normalized) {
      return '';
    }

    const segments = normalized
      .split('.')
      .map((segment) => segment.replace(/[^A-Za-z0-9_]/g, ''))
      .filter(Boolean);
    if (segments.length === 0) {
      return '';
    }

    return segments
      .map((segment, index) => {
        if (index === 0) {
          return segment.charAt(0).toLowerCase() + segment.slice(1);
        }
        return segment.charAt(0).toUpperCase() + segment.slice(1);
      })
      .join('');
  };

  const inferFieldShape = (
    fieldId: string,
    suggestion: (typeof suggestions)[number]
  ): Pick<TemplateFieldSpec, 'type' | 'policy' | 'riskLevel' | 'required'> => {
    const keyword = [
      fieldId,
      suggestion.originalText,
      suggestion.elementPath,
      suggestion.details?.description,
      suggestion.details?.fieldType,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (/paymentmode|付款方式|支付方式/.test(keyword)) {
      return { type: 'enum', policy: 'enum_mapping', riskLevel: 'medium', required: true };
    }
    if (/bankaccount|银行账号|银行账户|account/.test(keyword)) {
      return { type: 'bank_account', policy: 'format_only', riskLevel: 'high', required: false };
    }
    if (/date|日期|签约日期|签订日期/.test(keyword)) {
      return { type: 'date', policy: 'format_only', riskLevel: 'high', required: false };
    }
    if (/amount|fee|price|total|金额|总额|总价|服务费/.test(keyword)) {
      return { type: 'currency_amount', policy: 'format_only', riskLevel: 'high', required: false };
    }
    if (/partya|partyb|company|entity|甲方|乙方|委托方|受托方/.test(keyword)) {
      return { type: 'legal_entity_name', policy: 'dictionary_first', riskLevel: 'high', required: true };
    }
    if (/projectname|项目名称|项目/.test(keyword)) {
      return { type: 'project_name', policy: 'dictionary_first', riskLevel: 'medium', required: true };
    }
    if (/location|place|地点|场所/.test(keyword)) {
      return { type: 'geo_name', policy: 'dictionary_first', riskLevel: 'medium', required: false };
    }
    if (/days|天数|期限/.test(keyword)) {
      return { type: 'number', policy: 'format_only', riskLevel: 'medium', required: false };
    }
    return { type: 'text', policy: 'llm_translate', riskLevel: 'medium', required: false };
  };

  const extractAnchorPrefix = (suggestion: (typeof suggestions)[number]): string => {
    const candidates = [
      suggestion.details?.beforeBlank,
      suggestion.context,
      suggestion.details?.context,
      suggestion.elementPath,
      suggestion.originalText,
    ]
      .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const matched = candidates.find((value) => /[:：]$/.test(value)) || candidates[0] || '';
    const prefixMatch = matched.match(/^(.{0,40}?[:：])/u);
    return prefixMatch?.[1] || matched.slice(0, 40);
  };

  const buildTemplateAssetSourceBindings = (suggestion: (typeof suggestions)[number]): NonNullable<TemplateFieldSpec['sourceBindings']> => {
    const sourceBinding: NonNullable<TemplateFieldSpec['sourceBindings']>[number] = {
      blockId: suggestion.id,
      lang: 'zh',
      anchor: {
        prefix: extractAnchorPrefix(suggestion),
        suffix: suggestion.details?.afterBlank || '',
      },
    };

    const wordAnchor = suggestion.details?.wordAnchor;
    if (wordAnchor?.type === 'content-control' && typeof wordAnchor.contentControlId === 'number') {
      sourceBinding.tokenId = `content-control-${wordAnchor.contentControlId}`;
    }
    if (
      wordAnchor?.type === 'table-cell'
      && typeof wordAnchor.tableIndex === 'number'
      && typeof wordAnchor.rowIndex === 'number'
      && typeof wordAnchor.cellIndex === 'number'
    ) {
      sourceBinding.blockId = `table-${wordAnchor.tableIndex}-row-${wordAnchor.rowIndex}-cell-${wordAnchor.cellIndex}`;
    }
    if (
      wordAnchor?.type === 'text-range'
      && typeof wordAnchor.paragraphIndex === 'number'
      && typeof wordAnchor.start === 'number'
      && typeof wordAnchor.end === 'number'
    ) {
      sourceBinding.blockId = `paragraph-${wordAnchor.paragraphIndex}`;
      sourceBinding.tokenId = `word-range-${wordAnchor.paragraphIndex}-${wordAnchor.start}-${wordAnchor.end}`;
    }

    const excelAnchor = suggestion.details?.excelAnchor;
    if (excelAnchor?.sheetName) {
      sourceBinding.blockId = excelAnchor.address
        ? `${excelAnchor.sheetName}!${excelAnchor.address}`
        : excelAnchor.sheetName;
    }

    return [sourceBinding];
  };

  const buildTemplateAssetFieldSpecs = (
    analyzedFields: TemplateAnalyzeResponse['fields'],
    sourceLanguage: string,
    targetLanguages: string[]
  ): TemplateFieldSpec[] => {
    const fieldMap = new Map<string, TemplateFieldSpec>();

    analyzedFields.forEach((field) => {
      fieldMap.set(field.fieldId, {
        fieldId: field.fieldId,
        valueMode: field.valueMode,
        type: field.type,
        sourceLanguage: field.sourceLanguage || sourceLanguage,
        targetLanguages: field.targetLanguages?.length ? field.targetLanguages : targetLanguages,
        policy: field.policy,
        required: field.required,
        riskLevel: field.riskLevel,
        sourceBindings: field.sourceBindings,
        renderConfig: field.renderConfig,
      });
    });

    suggestions
      .filter((suggestion) => suggestion.type === 'variable' && suggestion.applied !== false)
      .forEach((suggestion) => {
        const fieldId = normalizeSuggestedFieldId(suggestion.suggestedName);
        if (!fieldId) {
          return;
        }

        const inferredShape = inferFieldShape(fieldId, suggestion);
        const existing = fieldMap.get(fieldId);
        const nextSpec: TemplateFieldSpec = {
          fieldId,
          valueMode: existing?.valueMode || 'scalar',
          type: existing?.type || inferredShape.type,
          sourceLanguage: existing?.sourceLanguage || sourceLanguage,
          targetLanguages: Array.from(new Set([...(existing?.targetLanguages || []), ...targetLanguages])),
          policy: existing?.policy || inferredShape.policy,
          required: existing?.required ?? inferredShape.required,
          riskLevel: existing?.riskLevel || inferredShape.riskLevel,
          sourceBindings: [
            ...(existing?.sourceBindings || []),
            ...buildTemplateAssetSourceBindings(suggestion),
          ],
          renderConfig: existing?.renderConfig || {
            flattenForCarbone: true,
            includeCanonicalValue: false,
          },
        };
        fieldMap.set(fieldId, nextSpec);
      });

    return Array.from(fieldMap.values());
  };

  const prepareTemplateAssetDraftPayload = async (): Promise<{
    templateDocumentIr: Awaited<ReturnType<typeof hostAdapter.extractDocument>>;
    fieldSpecs: TemplateFieldSpec[];
    sourceLanguage: string;
    targetLanguages: string[];
    warnings: string[];
  }> => {
    const templateDocumentIr = await hostAdapter.extractDocument();
    const sourceLanguage = normalizeLanguageCode(
      assetSourceLanguage || (templateDocumentIr?.metadata?.language as string | undefined)
    );
    const targetLanguages = getAssetTargetLanguages();
    const effectiveTermAssets = getEffectiveTemplateTermAssets();

    let analyzeResponse: TemplateAnalyzeResponse = {
      analysisId: '',
      languageProfile: {
        sourceLanguage,
        targetLanguages,
        documentMode: targetLanguages.length > 0 ? 'single_or_bilingual' : 'single_language',
      },
      fields: [],
      warnings: [],
    };

    try {
      analyzeResponse = await carboneAPI.analyzeTemplateWorkflow({
        templateDocumentIr,
        sourceLanguage,
        targetLanguages,
        termAssets: effectiveTermAssets.value || undefined,
      });
    } catch (error: any) {
      addDebugLog('warn', '模板工作流分析失败，回退到前端映射', error?.message || '未知错误');
    }

    return {
      templateDocumentIr,
      fieldSpecs: buildTemplateAssetFieldSpecs(analyzeResponse.fields, sourceLanguage, targetLanguages),
      sourceLanguage,
      targetLanguages,
      warnings: analyzeResponse.warnings || [],
    };
  };

  const extractTemplateAssetDraftInfo = (workflow?: TemplateWorkflowSummary | null) => {
    const fields = Array.isArray(workflow?.templateFieldSpecs) ? workflow?.templateFieldSpecs : [];
    if (fields.length === 0) {
      return null;
    }

    return {
      fieldCount: fields.length,
      status: workflow?.status,
      sourceLanguage: workflow?.languageProfile?.sourceLanguage,
      targetLanguages: workflow?.languageProfile?.targetLanguages || [],
      bindingPlanVersion: workflow?.bindingPlanVersion,
      fields,
      termAssets: workflow?.termAssets,
    };
  };

  const parseTemplateTermAssetsText = (
    rawText: string
  ): { value: WorkflowTermAssets | null; error?: string } => {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) {
      return { value: null };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { value: null, error: '术语资产必须是 JSON 对象' };
      }
      return { value: parsed as WorkflowTermAssets };
    } catch (error: any) {
      return { value: null, error: `术语资产 JSON 解析失败: ${error?.message || '未知错误'}` };
    }
  };

  const getEffectiveTemplateTermAssets = (
    options?: { rawText?: string; fallbackToDraftState?: boolean }
  ): { value: WorkflowTermAssets | null; error?: string } => {
    const rawText = options?.rawText ?? templateTermAssetsText;
    const parsed = parseTemplateTermAssetsText(rawText);
    if (parsed.error) {
      return parsed;
    }
    if (parsed.value) {
      return parsed;
    }
    if (options?.fallbackToDraftState === false) {
      return { value: null };
    }
    return { value: templateTermAssetsDraft || templateAssetDraftInfo?.termAssets || null };
  };

  const buildTermAssetExample = (
    kind: 'fieldDictionary' | 'termbase' | 'enumMappings',
    targetFieldId?: string
  ): WorkflowTermAssets => {
    const current = getEffectiveTemplateTermAssets().value || {};
    const preferredField = targetFieldId
      ? templateFieldSpecsDraft.find((field) => field.fieldId === targetFieldId)
        || templateAssetDraftInfo?.fields.find((field) => field.fieldId === targetFieldId)
      : undefined;
    const dictionaryField = preferredField && preferredField.policy === 'dictionary_first'
      ? preferredField
      : templateFieldSpecsDraft.find((field) => field.policy === 'dictionary_first')
      || templateAssetDraftInfo?.fields.find((field) => field.policy === 'dictionary_first')
      || preferredField
      || templateFieldSpecsDraft[0]
      || templateAssetDraftInfo?.fields[0];
    const enumField = preferredField && preferredField.policy === 'enum_mapping'
      ? preferredField
      : templateFieldSpecsDraft.find((field) => field.policy === 'enum_mapping')
      || templateAssetDraftInfo?.fields.find((field) => field.policy === 'enum_mapping');
    const sourceLanguage = dictionaryField?.sourceLanguage
      || assetSourceLanguage
      || templateAssetDraftInfo?.sourceLanguage
      || 'zh';
    const targetLanguage = dictionaryField?.targetLanguages?.[0]
      || assetTargetLanguages[0]
      || templateAssetDraftInfo?.targetLanguages?.[0]
      || 'ja';

    if (kind === 'fieldDictionary') {
      const fieldId = dictionaryField?.fieldId || 'partyAName';
      const alias = dictionaryField?.sourceBindings?.[0]?.anchor?.prefix || '委托方';
      return {
        ...current,
        fieldDictionary: [
          ...(current.fieldDictionary || []),
          {
            aliases: [alias, alias.replace(/[:：]\s*$/u, '')].filter(Boolean),
            fieldId,
            type: dictionaryField?.type || 'legal_entity_name',
            policy: dictionaryField?.policy || 'dictionary_first',
            riskLevel: dictionaryField?.riskLevel || 'high',
            required: Boolean(dictionaryField?.required),
            scope: 'template',
            status: 'approved',
            version: 1,
          },
        ],
      };
    }

    if (kind === 'termbase') {
      const fieldId = dictionaryField?.fieldId || 'partyAName';
      const sourceValue = fieldId === 'projectName' ? '无线网络设备更新' : '广州日产通商贸易有限公司';
      const translatedValue = fieldId === 'projectName' ? 'テンプレート専用設備更新' : 'テンプレート専用会社名';
      return {
        ...current,
        termbase: [
          ...(current.termbase || []),
          {
            termId: `tb_tpl_${Date.now()}`,
            applicableFieldIds: [fieldId],
            sourceLanguage,
            sourceValue,
            normalizedSourceValue: sourceValue,
            translations: {
              [sourceLanguage]: sourceValue,
              [targetLanguage]: translatedValue,
            },
            scope: 'template',
            status: 'approved',
            version: 1,
          },
        ],
      };
    }

    const enumName = enumField?.fieldId || 'paymentMode';
    return {
      ...current,
      enumMappings: {
        ...(current.enumMappings || {}),
        [enumName]: [
          ...((current.enumMappings || {})[enumName] || []),
          {
            code: `${enumName}_template`,
            labels: {
              zh: '一次支付',
              ja: 'テンプレート一括払い',
            },
            aliases: ['一次支付', '一次付款'],
            scope: 'template',
            status: 'active',
            version: 1,
          },
        ],
      },
    };
  };

  const handleAppendTemplateTermAssetExample = (
    kind: 'fieldDictionary' | 'termbase' | 'enumMappings',
    targetFieldId?: string
  ) => {
    const nextValue = buildTermAssetExample(kind, targetFieldId);
    const nextText = JSON.stringify(nextValue, null, 2);
    setTemplateTermAssetsDraft(nextValue);
    setTemplateTermAssetsText(nextText);
    setTemplateAssetNotice({
      type: 'info',
      message: kind === 'fieldDictionary'
        ? `已追加字段词典示例项${targetFieldId ? `: ${targetFieldId}` : ''}`
        : kind === 'termbase'
          ? `已追加术语示例项${targetFieldId ? `: ${targetFieldId}` : ''}`
          : `已追加枚举映射示例项${targetFieldId ? `: ${targetFieldId}` : ''}`,
    });
  };

  const sanitizeTemplateFieldSpecs = (specs: TemplateFieldSpec[]): {
    specs: TemplateFieldSpec[];
    duplicateFieldIds: string[];
    emptyFieldCount: number;
  } => {
    const duplicateFieldIds = new Set<string>();
    const seen = new Set<string>();
    let emptyFieldCount = 0;

    const sanitized = specs
      .map((field) => ({
        ...field,
        fieldId: String(field.fieldId || '').trim(),
        sourceLanguage: normalizeLanguageCode(field.sourceLanguage),
        targetLanguages: Array.from(new Set((field.targetLanguages || []).map((lang) => normalizeLanguageCode(lang)).filter(Boolean))),
      }))
      .filter((field) => {
        if (!field.fieldId) {
          emptyFieldCount += 1;
          return false;
        }
        if (seen.has(field.fieldId)) {
          duplicateFieldIds.add(field.fieldId);
          return false;
        }
        seen.add(field.fieldId);
        return true;
      });

    return {
      specs: sanitized,
      duplicateFieldIds: Array.from(duplicateFieldIds),
      emptyFieldCount,
    };
  };

  const persistTemplateFieldSpecs = async (
    specs: TemplateFieldSpec[],
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    if (!draftId) {
      if (!options?.silent) {
        setTemplateAssetNotice({ type: 'error', message: '请先暂存副本后再保存字段定义' });
      }
      return false;
    }

    if (!Array.isArray(specs) || specs.length === 0) {
      if (!options?.silent) {
        setTemplateAssetNotice({ type: 'error', message: '当前没有可保存的字段定义' });
      }
      return false;
    }

    const sanitizedResult = sanitizeTemplateFieldSpecs(specs);
    if (sanitizedResult.emptyFieldCount > 0) {
      if (!options?.silent) {
        setTemplateAssetNotice({
          type: 'error',
          message: `存在 ${sanitizedResult.emptyFieldCount} 个空字段名，请先补全后再保存`,
        });
      }
      return false;
    }
    if (sanitizedResult.duplicateFieldIds.length > 0) {
      if (!options?.silent) {
        setTemplateAssetNotice({
          type: 'error',
          message: '字段定义中存在重复 fieldId',
          lines: sanitizedResult.duplicateFieldIds.map((fieldId) => `重复字段: ${fieldId}`),
        });
      }
      return false;
    }

    const parsedTermAssets = getEffectiveTemplateTermAssets({ fallbackToDraftState: false });
    if (parsedTermAssets.error) {
      if (!options?.silent) {
        setTemplateAssetNotice({
          type: 'error',
          message: parsedTermAssets.error,
        });
      }
      return false;
    }

    setIsSavingTemplateAssetManifest(true);
    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const templateDocumentIr = await hostAdapter.extractDocument();
      const sourceLanguage = normalizeLanguageCode(
        (templateDocumentIr?.metadata?.language as string | undefined)
          || templateAssetDraftInfo?.sourceLanguage
      );
      const targetLanguages = Array.from(new Set(specs.flatMap((field) => field.targetLanguages || [])));
      const saveResult = await carboneAPI.saveTemplateWorkflow({
        templateId: draftId,
        templateMeta: {
          templateName: templateName.trim() || `draft-${Date.now()}`,
          sourceLanguage,
          targetLanguages,
          documentMode: targetLanguages.length > 0 ? 'single_or_bilingual' : 'single_language',
          termAssets: parsedTermAssets.value || undefined,
        },
        templateDocumentIr,
        templateFieldSpecs: sanitizedResult.specs,
        saveMode: 'draft',
      });

      const nextTemplateAssetDraftInfo = {
        fieldCount: sanitizedResult.specs.length,
        status: saveResult.status,
        sourceLanguage,
        targetLanguages,
        bindingPlanVersion: saveResult.bindingPlanVersion,
        fields: sanitizedResult.specs,
        termAssets: parsedTermAssets.value || undefined,
      };
      setTemplateAssetDraftInfo(nextTemplateAssetDraftInfo);
      setTemplateFieldSpecsDraft(sanitizedResult.specs);
      setTemplateTermAssetsDraft(parsedTermAssets.value);

      const snapshot = readDraftSnapshot();
      if (snapshot?.draftId === draftId) {
        localStorage.setItem(draftStorageKey, JSON.stringify({
          ...snapshot,
          templateAssetDraftInfo: nextTemplateAssetDraftInfo,
          workflowDraftInfo: nextTemplateAssetDraftInfo,
        }));
      }

      if (!options?.silent) {
        setTemplateAssetNotice({
          type: 'success',
          message: '✅ 字段定义已保存到模板资产清单',
          lines: [
            `${sanitizedResult.specs.length} 个字段 · 状态 ${saveResult.status}`,
            `绑定计划版本 ${saveResult.bindingPlanVersion}`,
          ],
        });
      }
      return true;
    } catch (error: any) {
      if (!options?.silent) {
        setTemplateAssetNotice({
          type: 'error',
          message: `字段定义保存失败: ${error?.message || '未知错误'}`,
        });
      }
      return false;
    } finally {
      setIsSavingTemplateAssetManifest(false);
    }
  };

  const handleTemplateFieldSpecChange = (
    index: number,
    patch: Partial<TemplateFieldSpec>
  ) => {
    setTemplateFieldSpecsDraft((current) => current.map((field, fieldIndex) => (
      fieldIndex === index
        ? {
            ...field,
            ...patch,
          }
        : field
    )));
  };

  const handleTemplateFieldTargetLanguagesChange = (index: number, rawValue: string) => {
    const targetLanguages = rawValue
      .split(',')
      .map((item) => normalizeLanguageCode(item))
      .filter(Boolean);
    handleTemplateFieldSpecChange(index, {
      targetLanguages: Array.from(new Set(targetLanguages)),
    });
  };

  const handleSaveTemplateFieldSpecs = async () => {
    if (templateFieldSpecsDraft.length > 0) {
      await persistTemplateFieldSpecs(templateFieldSpecsDraft);
      return;
    }

    if (!draftId) {
      setTemplateAssetNotice({ type: 'error', message: '请先暂存模板资产后再保存字段定义' });
      return;
    }

    try {
      const workflowPayload = await prepareTemplateAssetDraftPayload();
      if (workflowPayload.fieldSpecs.length === 0) {
        setTemplateAssetNotice({
          type: 'error',
          message: '当前模板未识别到可保存的模板资产字段',
        });
        return;
      }
      setTemplateFieldSpecsDraft(workflowPayload.fieldSpecs);
      await persistTemplateFieldSpecs(workflowPayload.fieldSpecs);
    } catch (error: any) {
      setTemplateAssetNotice({
        type: 'error',
        message: `生成模板资产字段失败: ${error?.message || '未知错误'}`,
      });
    }
  };

  const handleResetTemplateFieldSpecs = () => {
    setTemplateFieldSpecsDraft(templateAssetDraftInfo?.fields || []);
    setTemplateTermAssetsDraft(templateAssetDraftInfo?.termAssets || null);
    setTemplateTermAssetsText(
      templateAssetDraftInfo?.termAssets
        ? JSON.stringify(templateAssetDraftInfo.termAssets, null, 2)
        : ''
    );
    setTemplateAssetNotice({
      type: 'info',
      message: '已恢复到最近一次保存的字段定义',
    });
  };

  const handleTemplateTermAssetsTextChange = (value: string) => {
    setTemplateTermAssetsText(value);
    const parsed = getEffectiveTemplateTermAssets({ rawText: value, fallbackToDraftState: false });
    if (!parsed.error) {
      setTemplateTermAssetsDraft(parsed.value);
    }
  };

  const handleTestConnection = async () => {
    addDebugLog('info', `测试后端连接`, `URL: ${apiBaseUrl}/health`);
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (response.ok) {
        const data = await response.json();
        addDebugLog('info', `连接成功`, JSON.stringify(data));
      } else {
        addDebugLog('error', `连接失败`, `状态码: ${response.status}`);
      }
    } catch (error: any) {
      addDebugLog('error', `连接失败`, error.message);
    }
  };

  const runAnalyze = async (
    targetPairId?: string,
    options?: {
      commitSuggestions?: boolean;
    }
  ) => {
    const commitSuggestions = options?.commitSuggestions ?? true;
    const effectiveTemplateType = isExcelMode ? 'contract' : selectedTemplateType;
    const effectiveUseMultiStage = isExcelMode ? false : useMultiStage;
    const effectiveAnalysisExecutor = isExcelMode ? 'chat' : analysisExecutor;
    const originalPairs = isExcelMode ? store.excelSheetPairs.map((pair) => ({ ...pair })) : null;

    setAnalyzing(true);
    setAnalysisError(null, undefined);
    setAnalysisSummary(null);

    if (targetPairId && isExcelMode && originalPairs) {
      store.setExcelSheetPairs(
        originalPairs.map((pair) => ({
          ...pair,
          compare: !pair.hidden && pair.id === targetPairId,
        }))
      );
      const scopedPair = originalPairs.find((pair) => pair.id === targetPairId);
      addDebugLog(
        'info',
        '开始局部对照组识别',
        `${scopedPair?.leftSheetName || '模板'} ↔ ${scopedPair?.rightSheetName || '数据'}`
      );
    }

    addDebugLog('info', `开始 AI 识别`, `模板类型: ${effectiveTemplateType}，执行器: ${effectiveAnalysisExecutor}${isExcelMode ? '（Excel 固定）' : ''}`);

    let retryCount = 0;
    const maxRetries = 1;

    try {
      while (retryCount <= maxRetries) {
        try {
          if (retryCount > 0) {
            addDebugLog('info', '开始自动重试参数分析', `这是第 ${retryCount} 次重试`);
          }

          const result = await analyzeDocumentWithAI(hostAdapter, {
            apiBaseUrl,
            templateType: effectiveTemplateType,
            useMultiStage: effectiveUseMultiStage,
            analysisExecutor: effectiveAnalysisExecutor,
            thinking: retryCount > 0 ? true : analysisThinkingEnabled,
            aiOrchestratorBaseUrl,
            aiOrchestratorAuthToken,
            skill: aiSkillGuide,
            excelGlobalUnderstandingCache: isExcelMode && excelWorkbookUnderstanding.summary
              ? {
                  summary: excelWorkbookUnderstanding.summary,
                  promptRequestText: excelWorkbookUnderstanding.promptRequestText,
                  promptDebugSummary: excelWorkbookUnderstanding.promptDebugSummary,
                  rawAiResponse: excelWorkbookUnderstanding.rawAiResponse,
                }
              : undefined,
          });

          const nextSummary = buildAnalysisSummary(result);
          setAnalysisSummary(nextSummary);

          const mergedSuggestions = isExcelMode
            ? mergeExcelSuggestionsByPairResult(suggestions, result.suggestions, nextSummary)
            : result.suggestions;

          if (commitSuggestions || isExcelMode) {
            setSuggestions(mergedSuggestions);
            setStagedSuggestions([]);
          } else {
            setStagedSuggestions(mergedSuggestions);
          }

          const pairPrompts = nextSummary.pairResults
            .filter(p => p.promptRequestText)
            .map(p => `【对照组: ${p.pairLabel}】\n${p.promptRequestText}`)
            .join('\n\n');
          const pairResponses = nextSummary.pairResults
            .filter(p => p.rawAiResponse)
            .map(p => `【对照组: ${p.pairLabel}】\n${p.rawAiResponse}`)
            .join('\n\n');

          const finalPrompt = pairPrompts || result.contextAnalysis?.promptRequestText || '未记录请求原文';
          const finalResponse = pairResponses || result.contextAnalysis?.rawAiResponse || '未记录原始返回';

          addDebugLog('info', 'AI 参数识别完成',
            `【识别摘要】\n识别到 ${mergedSuggestions.length} 个参数。\n\n【发送给 AI 的请求原文】\n${finalPrompt}\n\n【AI 原始返回】\n${finalResponse}`
          );

          const newCollapsed: Record<string, boolean> = {};
          mergedSuggestions.forEach((s: any) => {
            const groupName = isExcelMode
              ? s.details?.excelAnchor?.sheetName || s.details?.chapter || '未归属 Sheet'
              : s.details?.chapter || '正文';
            newCollapsed[groupName] = true;
          });
          setCollapsedSuggestionGroups(newCollapsed);

          const newCollapsedPairs: Record<string, boolean> = {};
          nextSummary.pairResults.forEach((pair: any) => {
            newCollapsedPairs[pair.pairIndex] = true;
          });
          setCollapsedPairDetails(newCollapsedPairs);

          const needsRetry = nextSummary.salvagedMalformedJson || mergedSuggestions.some((s: any) => {
            const normalizedName = String(s.suggestedName || '').replace(/[{}]/g, '').trim();
            return s.confidence < 0.8
              || /^(?:d\.)?(?:[A-Za-z_][A-Za-z0-9_]*\[\]\.)?(field\d*|textValue|textField\d*|value\d*|var\d*|param\d*|undefined|null|unknown)$/i.test(normalizedName);
          });
          if (needsRetry && retryCount < maxRetries) {
            retryCount++;
            continue;
          }

          break;
        } catch (error: any) {
          const errorMessage = error.message || 'AI 分析失败';
          const responseStatus = error?.response?.status;
          const responseData = error?.response?.data;
          const requestMethod = String(error?.config?.method || 'post').toUpperCase();
          const requestUrl = error?.config?.url || '';
          const backendMessage = typeof responseData === 'string'
            ? responseData
            : responseData?.message || responseData?.error || '';
          const serializedResponse = responseData
            ? (typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2))
            : '';

          const errorDetails = [
            responseStatus ? `状态码: ${responseStatus}` : null,
            requestUrl ? `请求: ${requestMethod} ${requestUrl}` : null,
            backendMessage ? `后端消息: ${backendMessage}` : null,
            serializedResponse ? `响应体:\n${serializedResponse}` : null,
            !responseStatus ? `请求配置错误: ${error.message}` : null,
          ]
            .filter(Boolean)
            .join('\n');

          addDebugLog('error', errorMessage, errorDetails);
          setAnalysisError(errorMessage, errorDetails);
          setShowErrorDetails(true);
          if (!commitSuggestions && !isExcelMode) {
            setStagedSuggestions([]);
          }
          break;
        }
      }
    } finally {
      if (targetPairId && isExcelMode && originalPairs) {
        store.setExcelSheetPairs(originalPairs);
      }
      setAnalyzing(false);
    }
  };

  const handleAnalyze = async (options?: { commitSuggestions?: boolean }) => {
    await runAnalyze(undefined, options);
  };

  const handleAnalyzePair = async (pairId: string) => {
    await runAnalyze(pairId);
  };

  const handleCommitStagedSuggestions = (): boolean => {
    if (stagedSuggestions.length === 0) {
      return false;
    }
    setSuggestions(stagedSuggestions);
    setStagedSuggestions([]);
    return true;
  };

  const handleClearStagedSuggestions = () => {
    setStagedSuggestions([]);
  };

  const handleSaveDraft = async () => {
    if (!aiSkillGuide) {
      setTemplateAssetNotice({ type: 'error', message: '请先生成模板指南' });
      return;
    }

    setIsSavingDraft(true);
    try {
      let nextSuggestions = suggestions;
      if (isExcelMode) {
        const workbookResult = await ExcelAPI.prepareWorkbookForDraft(store.excelSheetPairs);
        if (workbookResult.renamedSheets.length > 0) {
          const renameMap = new Map(workbookResult.renamedSheets.map((item) => [item.from, item.to]));
          nextSuggestions = suggestions.map((suggestion) => {
            const anchorSheetName = suggestion.details?.excelAnchor?.sheetName;
            const chapter = suggestion.details?.chapter;
            const renamedSheetName = (anchorSheetName && renameMap.get(anchorSheetName)) || (chapter && renameMap.get(chapter));
            if (!renamedSheetName) {
              return suggestion;
            }

            const nextElementPath = suggestion.elementPath.replace(/^[^!]+!/, `${renamedSheetName}!`);
            return {
              ...suggestion,
              elementPath: nextElementPath,
              details: {
                ...suggestion.details,
                chapter: renamedSheetName,
                excelAnchor: suggestion.details?.excelAnchor
                  ? { ...suggestion.details.excelAnchor, sheetName: renamedSheetName }
                  : suggestion.details?.excelAnchor,
              },
            };
          });
          setSuggestions(nextSuggestions);
        }

        store.setExcelSheetPairs(
          store.excelSheetPairs.map((pair) => {
            const renamedLeftSheet = pair.leftSheetName ? workbookResult.renamedSheets.find((item) => item.from === pair.leftSheetName)?.to : undefined;
            return workbookResult.deletedSheets.includes(pair.rightSheetName || '')
              ? {
                  ...pair,
                  compare: false,
                  leftSheetName: renamedLeftSheet || pair.leftSheetName,
                  rightSheetName: undefined,
                  rightSheetIndex: undefined,
                }
              : {
                  ...pair,
                  leftSheetName: renamedLeftSheet || pair.leftSheetName,
                };
          })
        );
        store.resetExcelWorkbookUnderstanding();
        addDebugLog(
          'info',
          '已整理 Excel 草稿工作簿',
          `删除数据 sheet ${workbookResult.deletedSheets.length} 个，重命名模板 sheet ${workbookResult.renamedSheets.length} 个，冻结公式 ${workbookResult.frozenFormulaCount} 处`
        );
      }

      const { documentContent, format } = await loadTemplateSource();
      carboneAPI.setBaseUrl(apiBaseUrl);

      const result = await carboneAPI.saveTemplateFull({
        documentContent,
        suggestions: nextSuggestions,
        templateConfig,
        skill: aiSkillGuide,
        format,
        templateName: `draft-${Date.now()}`
      });

      if (result.success) {
        setDraftId(result.templateId || null);
        const parameterCount = resolveDraftParameterCount({ suggestions: nextSuggestions, aiSkillGuide });
        const assetLines: string[] = [
          '当前暂存仅保存模板资产与可选指南，不会直接创建工作流。',
        ];

        setDraftInfo({
          templateType: selectedTemplateType,
          parameterCount,
          savedAt: new Date().toISOString()
        });
        setTemplateAssetNotice({
          type: 'success',
          message: `✅ 模板资产暂存成功！ID: ${result.templateId}`,
          lines: assetLines.length > 0 ? assetLines : undefined,
        });

        localStorage.setItem(draftStorageKey, JSON.stringify({
          draftId: result.templateId,
          officeType,
          documentFormat: hostDocumentFormat,
          templateType: selectedTemplateType,
          suggestions: nextSuggestions,
          aiSkillGuide,
          aiDescription,
          aiGeneratedData,
          templateAssetDraftInfo: undefined,
          workflowDraftInfo: undefined,
          templateName,
          savedAt: new Date().toISOString()
        }));
        setTemplateAssetDraftInfo(null);
        setTemplateFieldSpecsDraft([]);
        setTemplateTermAssetsDraft(null);
        setTemplateTermAssetsText('');
      } else {
        setTemplateAssetNotice({ type: 'error', message: `暂存失败: ${result.error || '未知错误'}` });
      }
      await refreshLatestBackendDraftInfo();
    } catch (error: any) {
      setTemplateAssetNotice({ type: 'error', message: `暂存失败: ${error.message}` });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleLoadDraft = async () => {
    try {
      const snapshot = readDraftSnapshot();
      let effectiveDraftId = draftId || snapshot?.draftId || null;
      if (!effectiveDraftId) {
        const latestBackendDraft = await findLatestBackendDraft();
        if (!latestBackendDraft?.id) {
          if (snapshot?.draftId) {
            const parameterCount = resolveDraftParameterCount(snapshot);
            applyDraftSnapshot(snapshot);
            setTemplateAssetNotice({
              type: 'success',
              message: '✅ 已从本地暂存恢复草稿',
              lines: [`${snapshot.templateType || selectedTemplateType} · ${parameterCount} 参数 · ID: ${String(snapshot.draftId).substring(0, 8)}...`],
            });
            return;
          }
          setTemplateAssetNotice({ type: 'info', message: '没有可恢复的本地最新草稿，后端也没有 draft-* 暂存副本' });
          return;
        }
        effectiveDraftId = latestBackendDraft.id;
      }

      carboneAPI.setBaseUrl(apiBaseUrl);
      const template = await carboneAPI.getTemplate(effectiveDraftId);
      const templateSuggestions = Array.isArray(template.suggestions) ? template.suggestions : [];
      const skill =
        template.skillId
          ? await carboneAPI.getSkill(template.skillId).catch(() => aiSkillGuide)
          : aiSkillGuide;

      const restoredDraft = {
        draftId: template.id,
        templateType: template.config?.templateType || selectedTemplateType,
        suggestions: templateSuggestions,
        aiSkillGuide: skill || aiSkillGuide,
        templateAssetDraftInfo: extractTemplateAssetDraftInfo(template.templateWorkflow),
        workflowDraftInfo: extractTemplateAssetDraftInfo(template.templateWorkflow),
        parameterCount: resolveDraftParameterCount({
          suggestions: templateSuggestions,
          aiSkillGuide: skill || aiSkillGuide,
          variables: template.variables,
        }),
        variables: template.variables,
        templateName: template.fileName?.replace(/\.[^.]+$/, '') || templateName,
        savedAt: new Date().toISOString(),
      };

      applyDraftSnapshot(restoredDraft);
      localStorage.setItem(draftStorageKey, JSON.stringify({
        ...restoredDraft,
        officeType,
        documentFormat: hostDocumentFormat,
      }));
      addDebugLog(
        'info',
        '已从后端恢复草稿',
        `draftId=${effectiveDraftId}，恢复 ${templateSuggestions.length} 个参数，优先级高于本地暂存`
      );
      setTemplateAssetNotice({
        type: 'success',
        message: draftId || snapshot?.draftId ? '✅ 已从后端恢复当前模板资产暂存' : '✅ 已从后端恢复最新模板资产暂存',
        lines: [`${restoredDraft.templateType} · ${restoredDraft.parameterCount} 参数 · ID: ${String(effectiveDraftId).substring(0, 8)}...`],
      });
      await refreshLatestBackendDraftInfo();
    } catch (error: any) {
      setTemplateAssetNotice({ type: 'error', message: `载入草稿失败: ${error.message || '未知错误'}` });
    }
  };

  const handleClearDraft = (options?: { silent?: boolean }) => {
    setDraftId(null);
    setDraftInfo(null);
    setTemplateAssetDraftInfo(null);
    setTemplateFieldSpecsDraft([]);
    setTemplateTermAssetsDraft(null);
    setTemplateTermAssetsText('');
    setTemplateAssetRenderDiagnostics(null);
    localStorage.removeItem(draftStorageKey);
    if (!options?.silent) {
      setTemplateAssetNotice({ type: 'info', message: '🗑️ 已清除暂存副本' });
    }
  };

  const handleVerifyTemplate = async () => {
    if (suggestions.length === 0) {
      setTemplateAssetNotice({ type: 'error', message: '请先进行AI识别或手动添加参数' });
      return;
    }

    setIsVerifying(true);
    try {
      carboneAPI.setBaseUrl(apiBaseUrl);

      const configToValidate = {
        templateType: selectedTemplateType,
        variables: suggestions.reduce((acc, s) => {
          const varPath = s.suggestedName.replace(/[{}]/g, '').replace(/^d\./, '');
          acc[varPath] = s.originalText || '';
          return acc;
        }, {} as Record<string, string>),
        loops: suggestions
          .filter((s: any) => s.details?.fieldType === 'loop')
          .map((s: any) => ({
            arrayPath: s.details?.arrayPath || '',
            startMarker: `{#${s.details?.arrayPath || ''}}`,
            endMarker: `{/${s.details?.arrayPath || ''}}`
          }))
      };

      const result = await carboneAPI.validateTemplate(JSON.stringify(configToValidate));

      if (result.valid) {
        setTemplateAssetNotice({
          type: 'success',
          message: '✅ 验证成功！模版配置有效',
          lines: result.warnings && result.warnings.length > 0 ? result.warnings : undefined,
        });
      } else {
        setTemplateAssetNotice({
          type: 'error',
          message: '❌ 验证失败',
          lines: result.errors,
        });
      }
    } catch (error: any) {
      setTemplateAssetNotice({ type: 'error', message: `验证失败: ${error.message}` });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleGenerateAISkillGuide = async () => {
    if (suggestions.length === 0) {
      return;
    }

    setIsGeneratingGuide(true);
    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const documentDescription =
        (isExcelMode
          ? excelWorkbookUnderstanding.summary || analysisSummary?.globalUnderstandingSummary
          : analysisSummary?.globalUnderstandingSummary || templateName.trim())
        || undefined;
      const requestSuggestions = suggestions.map((s) => ({ ...s, applied: true }));
      const suggestionNames = requestSuggestions
        .map((s) => String(s?.suggestedName || (s as any)?.details?.variableName || '').trim())
        .filter(Boolean);

      addDebugLog(
        'info',
        '开始生成 AI 指南',
        `draftId=${draftId || 'none'}，本次发送 ${requestSuggestions.length} 条 suggestions，名称=${suggestionNames.join(', ') || 'none'}`
      );

      const result = await carboneAPI.generateSkill({
        templateId: draftId || undefined,
        suggestions: requestSuggestions,
        templateConfig,
        templateType: selectedTemplateType,
        documentDescription,
      });

      if (result.success && result.skill) {
        const generatedParameterNames = Array.isArray(result.skill.parameters)
          ? result.skill.parameters
            .map((p: any) => String(p?.name || '').trim())
            .filter(Boolean)
          : [];
        addDebugLog(
          'info',
          'AI 指南生成完成',
          `返回 ${generatedParameterNames.length} 个 parameters，名称=${generatedParameterNames.join(', ') || 'none'}`
        );
        setAiSkillGuide(result.skill);
        setTemplateAssetNotice({
          type: 'success',
          message: '✅ 指南已生成',
          lines: [`包含 ${result.skill.parameters?.length || 0} 个参数`],
        });
      } else {
        addDebugLog('warn', 'AI 指南生成失败', result.error || '未知错误');
        setTemplateAssetNotice({ type: 'error', message: `生成模板指南失败: ${result.error || '未知错误'}` });
      }
    } catch (error: any) {
      addDebugLog('error', 'AI 指南生成异常', error.message || '未知错误');
      setTemplateAssetNotice({ type: 'error', message: `生成模板指南失败: ${error.message}` });
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  const handleGenerateParameters = async () => {
    if (!aiSkillGuide) {
      setAiGenerateResult({ success: false, message: '请先生成模板指南' });
      return;
    }

    const currentDescription = aiDescription;

    setIsGeneratingParams(true);
    setAiGenerateResult(null);
    setPreviewResult(null); // Clear old preview results when generating new parameters
    setAiGeneratedData(null); // Clear old generated data
    setTemplateAssetRenderDiagnostics(null);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      let previewTemplateId = draftId;
      if (!previewTemplateId) {
        const { documentContent, format } = await loadTemplateSource();
        const templateResult = await carboneAPI.generateTemplate({
          documentContent,
          suggestions: suggestions.map((s) => ({ ...s, applied: true })),
          templateConfig,
          format,
        });

        if (!templateResult.success || !templateResult.templateId) {
          setAiGenerateResult({ success: false, message: `生成失败: ${templateResult.error || '模板生成失败'}` });
          return;
        }

        previewTemplateId = templateResult.templateId;
      }

      const result = await carboneAPI.previewWithSkill({
        templateId: previewTemplateId,
        skill: aiSkillGuide,
      });

      if (result.success && result.generatedData) {
        setAiGeneratedData(result.generatedData);
        setTemplateAssetRenderDiagnostics(null);
        setAiDescription(JSON.stringify(result.generatedData, null, 2));
        setAiGenerateResult({
          success: true,
          message: currentDescription.trim() ? '✅ 数据生成成功！' : '✅ 默认实例参数生成成功！'
        });
        return;
      }

      if (result.debugLogs?.length) {
        addDebugLog('error', '生成参数失败调试信息', result.debugLogs.join('\n'));
      }
      setAiGenerateResult({ success: false, message: `生成失败: ${result.error || '未知错误'}` });
    } catch (error: any) {
      setAiGenerateResult({ success: false, message: `生成失败: ${error.message}` });
    } finally {
      setIsGeneratingParams(false);
    }
  };

  const handleAiDescriptionChange = (value: string) => {
    setAiDescription(value);
    try {
      const parsed = JSON.parse(value);
      setAiGeneratedData(parsed);
    } catch {
      setAiGeneratedData(null);
    }
  };

  const parsePreviewDataFromInput = (): { data?: any; error?: string } => {
    const raw = aiDescription.trim();
    if (!raw) return { error: '请先输入数据内容' };
    try {
      return { data: JSON.parse(raw) };
    } catch {
      return { error: '预览数据需要使用 JSON 格式。可先点“生成数据”，再按需修改后预览。' };
    }
  };

  const getPreviewSuccessMessage = (): string => {
    if (officeType === 'excel') {
      return '✅ 数据预览成功！请下载 Excel 查看结果（浏览器内联预览 XLSX 可能显示为空）';
    }
    return '✅ 数据预览成功！';
  };

  const handlePreviewWithAIParams = async () => {
    if (!aiSkillGuide) {
      setPreviewResult({ success: false, message: '请先生成模板指南' });
      return;
    }

    const { data: latestGeneratedData, error: previewDataError } = parsePreviewDataFromInput();
    if (!latestGeneratedData) {
      setPreviewResult({ success: false, message: previewDataError || '请先输入有效数据' });
      return;
    }

    setIsPreviewing(true);
    setPreviewResult(null);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);

      if (draftId) {
        const result = await carboneAPI.previewWithSkill({
          templateId: draftId,
          skill: aiSkillGuide,
          simulatedData: latestGeneratedData,
        });

        if (result.success) {
          setPreviewResult({
            success: true,
            message: `${getPreviewSuccessMessage()}（从副本）`,
            previewUrl: result.previewUrl,
            downloadUrl: result.downloadUrl,
            generatedData: latestGeneratedData
          });
        } else {
          setPreviewResult({ success: false, message: `预览失败: ${result.error || '未知错误'}` });
        }
        return;
      }

      const { documentContent, format } = await loadTemplateSource();
      const templateResult = await carboneAPI.generateTemplate({
        documentContent,
        suggestions: suggestions.map(s => ({ ...s, applied: true })),
        templateConfig,
        format,
      });

      if (!templateResult.success) {
        setPreviewResult({ success: false, message: `模板生成失败: ${templateResult.error}` });
        return;
      }

      const result = await carboneAPI.previewWithSkill({
        templateId: templateResult.templateId,
        skill: aiSkillGuide,
        simulatedData: latestGeneratedData,
      });

      if (result.success) {
        setPreviewResult({
          success: true,
          message: getPreviewSuccessMessage(),
          previewUrl: result.previewUrl,
          downloadUrl: result.downloadUrl,
          generatedData: latestGeneratedData
        });
      } else {
        setPreviewResult({ success: false, message: `预览失败: ${result.error || '未知错误'}` });
      }
    } catch (error: any) {
      setPreviewResult({ success: false, message: `预览失败: ${error.message}` });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSaveTemplateAndGuide = async () => {
    if (!aiSkillGuide) {
      setSaveResult({ success: false, message: '请先生成模板指南' });
      return;
    }

    if (!draftId) {
      setSaveResult({ success: false, message: '请先暂存副本' });
      return;
    }

    setIsSaving(true);
    setSaveResult(null);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const finalTemplateName = templateName.trim() || `${selectedTemplateType}-template-${Date.now()}`;
      const publishFieldSpecs = templateFieldSpecsDraft.length > 0
        ? templateFieldSpecsDraft
        : (templateAssetDraftInfo?.fields || []);
      const publishSourceLanguage = normalizeLanguageCode(assetSourceLanguage || templateAssetDraftInfo?.sourceLanguage);
      const publishTargetLanguages = Array.from(
        new Set(
          (assetTargetLanguages.length > 0 ? assetTargetLanguages : (templateAssetDraftInfo?.targetLanguages || []))
            .map((lang) => normalizeLanguageCode(lang))
            .filter(Boolean)
        )
      );
      
      const saveParams: any = {
        templateId: draftId,
        suggestions: suggestions,
        templateConfig,
        skill: aiSkillGuide,
        format: officeType === 'excel' ? 'xlsx' : officeType === 'ppt' ? 'pptx' : 'docx',
        templateName: finalTemplateName
      };

      if (publishFieldSpecs.length > 0) {
        saveParams.templateMeta = {
          templateName: finalTemplateName,
          sourceLanguage: publishSourceLanguage,
          targetLanguages: publishTargetLanguages,
          documentMode: publishTargetLanguages.length > 0 ? 'single_or_bilingual' : 'single_language',
          termAssets: templateTermAssetsDraft || templateAssetDraftInfo?.termAssets || undefined,
        };
        saveParams.templateFieldSpecs = publishFieldSpecs;
        saveParams.templateDocumentIr = await hostAdapter.extractDocument();
      }

      const result = await carboneAPI.saveTemplateFull(saveParams);

      if (result.success) {
        setSaveResult({
          success: true,
          message: `✅ 模板资产发布成功！模板ID: ${result.templateId || 'N/A'}, 指南ID: ${result.skillId || 'N/A'}`
        });
        handleClearDraft({ silent: true });
      } else {
        setSaveResult({ success: false, message: `保存失败: ${result.error || '未知错误'}` });
      }
    } catch (error: any) {
      setSaveResult({ success: false, message: `保存失败: ${error.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const togglePairDetailsCollapse = (pairIndex: number) => {
    setCollapsedPairDetails(current => ({
      ...current,
      [pairIndex]: current[pairIndex] === undefined ? false : !current[pairIndex]
    }));
  };

  const toggleSuggestionGroupCollapse = (groupName: string) => {
    setCollapsedSuggestionGroups((current) => ({
      ...current,
      [groupName]: !current[groupName],
    }));
  };

  return {
    selectedTemplateType,
    setSelectedTemplateType,
    useMultiStage,
    setUseMultiStage,
    showErrorDetails,
    setShowErrorDetails,
    analysisSummary,
    stagedSuggestions,
    assetSourceLanguage,
    setAssetSourceLanguage,
    assetTargetLanguages,
    setAssetTargetLanguages,
    handleAnalyze,
    handleCommitStagedSuggestions,
    handleClearStagedSuggestions,
    handleAnalyzePair,
    handleTestConnection,

    aiSkillGuide,
    isGeneratingGuide,
    isVerifying,
    draftId,
    draftInfo,
    latestBackendDraftInfo,
    templateAssetDraftInfo,
    templateFieldSpecsDraft,
    templateTermAssetsDraft,
    templateTermAssetsText,
    templateAssetRenderDiagnostics,
    isSavingTemplateAssetManifest,
    isSavingDraft,
    templateAssetNotice,
    handleGenerateAISkillGuide,
    handleVerifyTemplate,
    handleSaveDraft,
    handleLoadDraft,
    handleClearDraft,

    aiDescription,
    aiGeneratedData,
    isGeneratingParams,
    aiGenerateResult,
    previewResult,
    isPreviewing,
    templateName,
    setTemplateName,
    saveResult,
    isSaving,
    workflowSourceLanguage: assetSourceLanguage,
    setWorkflowSourceLanguage: setAssetSourceLanguage,
    workflowTargetLanguages: assetTargetLanguages,
    setWorkflowTargetLanguages: setAssetTargetLanguages,
    workflowDraftInfo: templateAssetDraftInfo,
    workflowFieldSpecsDraft: templateFieldSpecsDraft,
    workflowTermAssetsDraft: templateTermAssetsDraft,
    workflowTermAssetsText: templateTermAssetsText,
    workflowRenderDiagnostics: templateAssetRenderDiagnostics,
    isSavingWorkflowFieldSpecs: isSavingTemplateAssetManifest,
    draftWorkflowNotice: templateAssetNotice,
    handleWorkflowFieldSpecChange: handleTemplateFieldSpecChange,
    handleWorkflowFieldTargetLanguagesChange: handleTemplateFieldTargetLanguagesChange,
    handleWorkflowTermAssetsTextChange: handleTemplateTermAssetsTextChange,
    handleAppendWorkflowTermAssetExample: handleAppendTemplateTermAssetExample,
    handleSaveWorkflowFieldSpecs: handleSaveTemplateFieldSpecs,
    handleResetWorkflowFieldSpecs: handleResetTemplateFieldSpecs,
    handleAiDescriptionChange,
    handleGenerateParameters,
    handlePreviewWithAIParams,
    handleTemplateFieldSpecChange,
    handleTemplateFieldTargetLanguagesChange,
    handleTemplateTermAssetsTextChange,
    handleAppendTemplateTermAssetExample,
    handleSaveTemplateFieldSpecs,
    handleResetTemplateFieldSpecs,
    handleSaveTemplateAndGuide,

    collapsedSuggestionGroups,
    collapsedPairDetails,
    togglePairDetailsCollapse,
    toggleSuggestionGroupCollapse,
  };
}
