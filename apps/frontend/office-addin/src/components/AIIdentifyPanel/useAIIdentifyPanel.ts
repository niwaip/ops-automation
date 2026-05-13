import { useState, useEffect } from 'react';
import { useAppStore } from '../../taskpane/store';
import { carboneAPI } from '../../api/carbone-api';
import { exportTemplateSource } from '../../services/template-source-service';
import { analyzeDocumentWithAI } from '../../services/suggestion-service';
import { AnalysisSummary, buildAnalysisSummary, mergeExcelSuggestionsByPairResult } from '../AIIdentifyPanel.helpers';

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

  const [selectedTemplateType, setSelectedTemplateType] = useState('contract');
  const [useMultiStage, setUseMultiStage] = useState(true);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [analysisSummary, setAnalysisSummary] = useState<AnalysisSummary | null>(null);

  // Workflow states
  const [aiSkillGuide, setAiSkillGuide] = useState<any>(null);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftInfo, setDraftInfo] = useState<{ templateType: string; parameterCount: number; savedAt: string } | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftWorkflowNotice, setDraftWorkflowNotice] = useState<{
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
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [collapsedSuggestionGroups, setCollapsedSuggestionGroups] = useState<Record<string, boolean>>({});
  const [collapsedPairDetails, setCollapsedPairDetails] = useState<Record<string, boolean>>({});

  // Recover Draft
  useEffect(() => {
    const stagedData = localStorage.getItem('ai-template-draft');
    if (stagedData) {
      try {
        const data = JSON.parse(stagedData);
        if (data.draftId) {
          setDraftId(data.draftId);
          setDraftInfo({
            templateType: data.templateType || 'unknown',
            parameterCount: data.suggestions?.length || 0,
            savedAt: data.savedAt || ''
          });
          if (data.suggestions && data.suggestions.length > 0) {
            setSuggestions(data.suggestions);
            addDebugLog('info', '已从暂存副本恢复参数', `恢复 ${data.suggestions.length} 个参数，后续识别结果会与未覆盖的旧参数合并显示`);
          }
          if (data.aiSkillGuide) {
            setAiSkillGuide(data.aiSkillGuide);
          }
          if (data.templateType) {
            setSelectedTemplateType(data.templateType);
          }
        }
      } catch {
        // ignore parse error
      }
    }
  }, []);

  const loadTemplateSource = async () => {
    const source = await exportTemplateSource(hostAdapter);
    source.warnings?.forEach((warning: any) => addDebugLog('warn', '模板源导出提示', warning));
    return {
      documentContent: source.content,
      format: source.format,
    };
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

  const handleAnalyze = async () => {
    const effectiveTemplateType = isExcelMode ? 'contract' : selectedTemplateType;
    const effectiveUseMultiStage = isExcelMode ? false : useMultiStage;
    const effectiveAnalysisExecutor = isExcelMode ? 'chat' : analysisExecutor;

    setAnalyzing(true);
    setAnalysisError(null, undefined);
    setAnalysisSummary(null);

    addDebugLog('info', `开始 AI 识别`, `模板类型: ${effectiveTemplateType}，执行器: ${effectiveAnalysisExecutor}${isExcelMode ? '（Excel 固定）' : ''}`);

    let retryCount = 0;
    const maxRetries = 1;

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

        setSuggestions(mergedSuggestions);

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

        const needsRetry = mergedSuggestions.some((s: any) => s.confidence < 0.8 || /^(field\d*|textValue|value\d*|var\d*|param\d*|undefined|null|unknown)$/i.test(s.suggestedName || ''));
        if (needsRetry && retryCount < maxRetries) {
          retryCount++;
          continue;
        }

        break;
      } catch (error: any) {
        const errorMessage = error.message || 'AI 分析失败';
        let errorDetails = '';
        if (error.response) {
          errorDetails = `状态码: ${error.response.status}\n`;
        } else {
          errorDetails = `请求配置错误: ${error.message}\n`;
        }
        addDebugLog('error', errorMessage, errorDetails);
        setAnalysisError(errorMessage, errorDetails);
        break;
      }
    }

    setAnalyzing(false);
  };

  const handleSaveDraft = async () => {
    if (!aiSkillGuide) {
      setDraftWorkflowNotice({ type: 'error', message: '请先生成AI指南' });
      return;
    }

    setIsSavingDraft(true);
    try {
      const { documentContent, format } = await loadTemplateSource();
      carboneAPI.setBaseUrl(apiBaseUrl);

      const result = await carboneAPI.saveTemplateFull({
        documentContent,
        suggestions,
        templateConfig,
        skill: aiSkillGuide,
        format,
        templateName: `draft-${Date.now()}`
      });

      if (result.success) {
        setDraftId(result.templateId || null);
        setDraftInfo({
          templateType: selectedTemplateType,
          parameterCount: suggestions.length,
          savedAt: new Date().toISOString()
        });
        setDraftWorkflowNotice({
          type: 'success',
          message: `✅ 副本已暂存！ID: ${result.templateId}`,
        });

        localStorage.setItem('ai-template-draft', JSON.stringify({
          draftId: result.templateId,
          templateType: selectedTemplateType,
          suggestions,
          aiSkillGuide,
          savedAt: new Date().toISOString()
        }));
      } else {
        setDraftWorkflowNotice({ type: 'error', message: `暂存失败: ${result.error || '未知错误'}` });
      }
    } catch (error: any) {
      setDraftWorkflowNotice({ type: 'error', message: `暂存失败: ${error.message}` });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleLoadDraft = async () => {
    if (!draftId) {
      setDraftWorkflowNotice({ type: 'info', message: '没有暂存副本可载入' });
      return;
    }
    setDraftWorkflowNotice({
      type: 'success',
      message: '✅ 副本已载入',
      lines: [`${draftInfo?.templateType || selectedTemplateType} · ${draftInfo?.parameterCount || 0} 参数 · ID: ${draftId.substring(0, 8)}...`],
    });
  };

  const handleClearDraft = (options?: { silent?: boolean }) => {
    setDraftId(null);
    setDraftInfo(null);
    localStorage.removeItem('ai-template-draft');
    if (!options?.silent) {
      setDraftWorkflowNotice({ type: 'info', message: '🗑️ 已清除暂存副本' });
    }
  };

  const handleVerifyTemplate = async () => {
    if (suggestions.length === 0) {
      setDraftWorkflowNotice({ type: 'error', message: '请先进行AI识别或手动添加参数' });
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
        setDraftWorkflowNotice({
          type: 'success',
          message: '✅ 验证成功！模版配置有效',
          lines: result.warnings && result.warnings.length > 0 ? result.warnings : undefined,
        });
      } else {
        setDraftWorkflowNotice({
          type: 'error',
          message: '❌ 验证失败',
          lines: result.errors,
        });
      }
    } catch (error: any) {
      setDraftWorkflowNotice({ type: 'error', message: `验证失败: ${error.message}` });
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

      const result = await carboneAPI.generateSkill({
        suggestions: suggestions.map(s => ({ ...s, applied: true })),
        templateConfig,
        templateType: selectedTemplateType,
        documentDescription,
      });

      if (result.success && result.skill) {
        setAiSkillGuide(result.skill);
        setDraftWorkflowNotice({
          type: 'success',
          message: '✅ 指南已生成',
          lines: [`包含 ${result.skill.parameters?.length || 0} 个参数`],
        });
      } else {
        setDraftWorkflowNotice({ type: 'error', message: `生成AI指南失败: ${result.error || '未知错误'}` });
      }
    } catch (error: any) {
      setDraftWorkflowNotice({ type: 'error', message: `生成AI指南失败: ${error.message}` });
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  const handleGenerateParameters = async () => {
    if (!aiDescription.trim()) {
      setAiGenerateResult({ success: false, message: '请输入描述内容' });
      return;
    }
    if (!aiSkillGuide) {
      setAiGenerateResult({ success: false, message: '请先生成AI指南' });
      return;
    }

    setIsGeneratingParams(true);
    setAiGenerateResult(null);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.generateParameters({
        description: aiDescription,
        skillId: aiSkillGuide.id,
        skill: aiSkillGuide,
      });

      if (result.success && result.generatedData) {
        setAiGeneratedData(result.generatedData);
        setAiDescription(JSON.stringify(result.generatedData, null, 2));
        setAiGenerateResult({
          success: true,
          message: '✅ 数据生成成功！'
        });
      } else {
        setAiGenerateResult({ success: false, message: `生成失败: ${result.error || '未知错误'}` });
      }
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
      setPreviewResult({ success: false, message: '请先生成AI指南' });
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
      setSaveResult({ success: false, message: '请先生成AI指南' });
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
      
      const saveParams: any = {
        templateId: draftId,
        suggestions: suggestions,
        templateConfig,
        skill: aiSkillGuide,
        format: officeType === 'excel' ? 'xlsx' : officeType === 'ppt' ? 'pptx' : 'docx',
        templateName: finalTemplateName
      };

      const result = await carboneAPI.saveTemplateFull(saveParams);

      if (result.success) {
        setSaveResult({
          success: true,
          message: `✅ 最终保存成功！模板ID: ${result.templateId || 'N/A'}, 指南ID: ${result.skillId || 'N/A'}`
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
    handleAnalyze,
    handleTestConnection,

    aiSkillGuide,
    isGeneratingGuide,
    isVerifying,
    draftId,
    isSavingDraft,
    draftWorkflowNotice,
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
    handleAiDescriptionChange,
    handleGenerateParameters,
    handlePreviewWithAIParams,
    handleSaveTemplateAndGuide,

    collapsedSuggestionGroups,
    collapsedPairDetails,
    togglePairDetailsCollapse,
    toggleSuggestionGroupCollapse,
  };
}