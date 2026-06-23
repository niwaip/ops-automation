import { useCallback, useState } from 'react';
import { useAppStore } from '../../../app/store';
import { carboneAPI } from '../../../api/carbone-api';
import type {
  TemplateFieldSpec,
  TemplateWorkflowSummary,
  WorkflowTermAssets,
  TemplateRenderDataResponse,
} from '../../../api/carbone-api';
import { exportTemplateSource } from '../../../shared/services/template-source.service';
import type { AnalysisSummary } from './AIIdentifyPanel.helpers';
import { ExcelAPI } from '../../../host/office/excel/api';
import {
  getDefaultTemplateFormatForHost,
  getHostScopedStorageKey,
} from '../../../shared/utils/host-storage';
import { useIdentifyDraft } from './common/useIdentifyDraft';
import { useSkillPreviewWorkflow } from './common/useSkillPreviewWorkflow';
import { useTemplateAssetDraft } from './common/useTemplateAssetDraft';
import type { TemplateAssetNotice } from './common/identify-panel.types';
import { useWordIdentifyWorkflow } from '../word/useWordIdentifyWorkflow';
import { useExcelIdentifyWorkflow } from '../excel/useExcelIdentifyWorkflow';

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
  const [assetSourceLanguage, setAssetSourceLanguage] = useState('zh');
  const [assetTargetLanguages, setAssetTargetLanguages] = useState<string[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [aiSkillGuide, setAiSkillGuide] = useState<any>(null);
  const [aiDescription, setAiDescription] = useState('');
  const [aiGeneratedData, setAiGeneratedData] = useState<any>(null);
  const [templateName, setTemplateName] = useState('');

  const [templateFieldSpecsDraft, setTemplateFieldSpecsDraft] = useState<TemplateFieldSpec[]>([]);
  const [templateTermAssetsDraft, setTemplateTermAssetsDraft] = useState<WorkflowTermAssets | null>(
    null
  );
  const [templateTermAssetsText, setTemplateTermAssetsText] = useState('');
  const [isSavingTemplateAssetManifest, setIsSavingTemplateAssetManifest] = useState(false);
  const [templateAssetNotice, setTemplateAssetNotice] = useState<TemplateAssetNotice | null>(null);
  const [templateAssetRenderDiagnostics, setTemplateAssetRenderDiagnostics] =
    useState<TemplateRenderDataResponse | null>(null);

  const loadTemplateSource = async () => {
    const source = await exportTemplateSource(hostAdapter);
    source.warnings?.forEach((warning: any) => addDebugLog('warn', '模板源导出提示', warning));
    return {
      documentContent: source.content,
      format: source.format,
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

  const {
    draftId,
    draftInfo,
    latestBackendDraftInfo,
    templateAssetDraftInfo,
    setTemplateAssetDraftInfo,
    isSavingDraft,
    handleSaveDraft,
    handleLoadDraft,
    handleClearDraft,
  } = useIdentifyDraft({
    apiBaseUrl,
    officeType,
    draftStorageKey,
    hostDocumentFormat,
    selectedTemplateType,
    setSelectedTemplateType,
    suggestions,
    setSuggestions,
    aiSkillGuide,
    setAiSkillGuide,
    aiDescription,
    setAiDescription,
    aiGeneratedData,
    setAiGeneratedData,
    templateName,
    setTemplateName,
    templateConfig,
    addDebugLog,
    loadTemplateSource,
    isExcelMode,
    excelDraftRuntime: isExcelMode
      ? {
          sheetPairs: store.excelSheetPairs,
          setSheetPairs: store.setExcelSheetPairs,
          resetWorkbookUnderstanding: store.resetExcelWorkbookUnderstanding,
          prepareWorkbookForDraft: () => ExcelAPI.prepareWorkbookForDraft(store.excelSheetPairs),
        }
      : undefined,
    setTemplateFieldSpecsDraft,
    setTemplateTermAssetsDraft,
    setTemplateTermAssetsText,
    setTemplateAssetRenderDiagnostics,
    setTemplateAssetNotice,
    extractTemplateAssetDraftInfo,
  });

  const normalizeLanguageCode = useCallback((language?: string): string => {
    const normalized = String(language || 'zh')
      .trim()
      .toLowerCase();
    if (!normalized) {
      return 'zh';
    }
    return normalized.split(/[-_]/)[0] || 'zh';
  }, []);

  const {
    handleTemplateFieldSpecChange,
    handleTemplateFieldTargetLanguagesChange,
    handleTemplateTermAssetsTextChange,
    handleAppendTemplateTermAssetExample,
    handleSaveTemplateFieldSpecs,
    handleResetTemplateFieldSpecs,
  } = useTemplateAssetDraft({
    apiBaseUrl,
    draftId,
    draftStorageKey,
    suggestions,
    templateName,
    assetSourceLanguage,
    setAssetSourceLanguage,
    assetTargetLanguages,
    setAssetTargetLanguages,
    templateAssetDraftInfo,
    setTemplateAssetDraftInfo,
    templateFieldSpecsDraft,
    setTemplateFieldSpecsDraft,
    templateTermAssetsDraft,
    setTemplateTermAssetsDraft,
    templateTermAssetsText,
    setTemplateTermAssetsText,
    setIsSavingTemplateAssetManifest,
    setTemplateAssetNotice,
    addDebugLog,
    normalizeLanguageCode,
    extractDocument: () => hostAdapter.extractDocument(),
  });

  const wordIdentifyWorkflow = useWordIdentifyWorkflow({
    hostAdapter,
    suggestions,
    setSuggestions,
    setAnalysisError,
    setShowErrorDetails,
    setAnalyzing,
    addDebugLog,
    apiBaseUrl,
    aiOrchestratorBaseUrl,
    aiOrchestratorAuthToken,
    analysisExecutor,
    analysisThinkingEnabled,
    aiSkillGuide,
    selectedTemplateType,
    useMultiStage,
  });

  const excelIdentifyWorkflow = useExcelIdentifyWorkflow({
    hostAdapter,
    suggestions,
    setSuggestions,
    setAnalysisError,
    setShowErrorDetails,
    setAnalyzing,
    addDebugLog,
    apiBaseUrl,
    aiOrchestratorBaseUrl,
    aiOrchestratorAuthToken,
    analysisExecutor,
    analysisThinkingEnabled,
    aiSkillGuide,
    selectedTemplateType,
    useMultiStage,
    excelSheetPairs: store.excelSheetPairs,
    setExcelSheetPairs: store.setExcelSheetPairs,
    excelWorkbookUnderstanding,
  });

  const identifyWorkflow = isExcelMode ? excelIdentifyWorkflow : wordIdentifyWorkflow;
  const analysisSummary: AnalysisSummary | null = identifyWorkflow.analysisSummary;
  const {
    stagedSuggestions,
    handleAnalyze,
    handleAnalyzePair,
    handleCommitStagedSuggestions,
    handleClearStagedSuggestions,
    collapsedSuggestionGroups,
    collapsedPairDetails,
    togglePairDetailsCollapse,
    toggleSuggestionGroupCollapse,
  } = identifyWorkflow;

  const {
    isGeneratingGuide,
    isGeneratingParams,
    aiGenerateResult,
    previewResult,
    isPreviewing,
    saveResult,
    isSaving,
    handleGenerateAISkillGuide,
    handleGenerateParameters,
    handleAiDescriptionChange,
    handlePreviewWithAIParams,
    handleSaveTemplateAndGuide,
  } = useSkillPreviewWorkflow({
    apiBaseUrl,
    officeType,
    isExcelMode,
    suggestions,
    draftId,
    aiSkillGuide,
    setAiSkillGuide,
    aiDescription,
    setAiDescription,
    aiGeneratedData,
    setAiGeneratedData,
    templateName,
    setTemplateName,
    templateConfig,
    selectedTemplateType,
    excelWorkbookSummary: excelWorkbookUnderstanding.summary || undefined,
    globalUnderstandingSummary: analysisSummary?.globalUnderstandingSummary,
    templateAssetDraftInfo,
    templateFieldSpecsDraft,
    templateTermAssetsDraft,
    assetSourceLanguage,
    assetTargetLanguages,
    addDebugLog,
    setTemplateAssetNotice,
    setTemplateAssetRenderDiagnostics,
    loadTemplateSource,
    normalizeLanguageCode,
    extractDocument: () => hostAdapter.extractDocument(),
    clearDraftSilently: () => handleClearDraft({ silent: true }),
  });

  const handleTestConnection = async () => {
    addDebugLog('info', '测试后端连接', `URL: ${apiBaseUrl}/health`);
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (response.ok) {
        const data = await response.json();
        addDebugLog('info', '连接成功', JSON.stringify(data));
      } else {
        addDebugLog('error', '连接失败', `状态码: ${response.status}`);
      }
    } catch (error: any) {
      addDebugLog('error', '连接失败', error.message);
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
        variables: suggestions.reduce(
          (acc, suggestion) => {
            const varPath = suggestion.suggestedName.replace(/[{}]/g, '').replace(/^d\./, '');
            acc[varPath] = suggestion.originalText || '';
            return acc;
          },
          {} as Record<string, string>
        ),
        loops: suggestions
          .filter((suggestion: any) => suggestion.details?.fieldType === 'loop')
          .map((suggestion: any) => ({
            arrayPath: suggestion.details?.arrayPath || '',
            startMarker: `{#${suggestion.details?.arrayPath || ''}}`,
            endMarker: `{/${suggestion.details?.arrayPath || ''}}`,
          })),
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
