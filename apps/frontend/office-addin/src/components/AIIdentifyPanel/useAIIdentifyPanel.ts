import { useState, useEffect } from 'react';
import { useAppStore } from '../../taskpane/store';
import { carboneAPI } from '../../api/carbone-api';
import { exportTemplateSource } from '../../services/template-source-service';
import { analyzeDocumentWithAI } from '../../services/suggestion-service';
import { AnalysisSummary, buildAnalysisSummary, mergeExcelSuggestionsByPairResult } from '../AIIdentifyPanel.helpers';
import { OfficeHelper } from '../../utils/office-api';

const DRAFT_STORAGE_KEY = 'ai-template-draft';

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

  const applyDraftSnapshot = (data: any, options?: { logRestore?: boolean }) => {
    if (!data) {
      return;
    }

    if (data.draftId) {
      setDraftId(data.draftId);
    }
    if (data.templateType) {
      setSelectedTemplateType(data.templateType);
    }
    if (Array.isArray(data.suggestions)) {
      setSuggestions(data.suggestions);
      if (options?.logRestore !== false) {
        addDebugLog('info', '已从暂存副本恢复参数', `恢复 ${data.suggestions.length} 个参数，后续识别结果会与未覆盖的旧参数合并显示`);
      }
    }
    if (data.aiSkillGuide) {
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
      setDraftInfo({
        templateType: data.templateType || 'unknown',
        parameterCount: Array.isArray(data.suggestions) ? data.suggestions.length : 0,
        savedAt: data.savedAt || '',
      });
    }
  };

  const readDraftSnapshot = () => {
    const stagedData = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!stagedData) {
      return null;
    }
    try {
      return JSON.parse(stagedData);
    } catch {
      return null;
    }
  };

  // Recover Draft
  useEffect(() => {
    const snapshot = readDraftSnapshot();
    if (snapshot?.draftId) {
      applyDraftSnapshot(snapshot);
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

  const runAnalyze = async (targetPairId?: string) => {
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
    } finally {
      if (targetPairId && isExcelMode && originalPairs) {
        store.setExcelSheetPairs(originalPairs);
      }
      setAnalyzing(false);
    }
  };

  const handleAnalyze = async () => {
    await runAnalyze();
  };

  const handleAnalyzePair = async (pairId: string) => {
    await runAnalyze(pairId);
  };

  const handleSaveDraft = async () => {
    if (!aiSkillGuide) {
      setDraftWorkflowNotice({ type: 'error', message: '请先生成AI指南' });
      return;
    }

    setIsSavingDraft(true);
    try {
      let nextSuggestions = suggestions;
      if (isExcelMode) {
        const workbookResult = await OfficeHelper.Excel.prepareWorkbookForDraft(store.excelSheetPairs);
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
        setDraftInfo({
          templateType: selectedTemplateType,
          parameterCount: suggestions.length,
          savedAt: new Date().toISOString()
        });
        setDraftWorkflowNotice({
          type: 'success',
          message: `✅ 副本已暂存！ID: ${result.templateId}`,
        });

        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
          draftId: result.templateId,
          templateType: selectedTemplateType,
          suggestions: nextSuggestions,
          aiSkillGuide,
          aiDescription,
          aiGeneratedData,
          templateName,
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

    try {
      const snapshot = readDraftSnapshot();
      if (snapshot?.draftId === draftId) {
        applyDraftSnapshot(snapshot);
        setDraftWorkflowNotice({
          type: 'success',
          message: '✅ 已从本地暂存恢复草稿',
          lines: [`${snapshot.templateType || selectedTemplateType} · ${snapshot.suggestions?.length || 0} 参数 · ID: ${draftId.substring(0, 8)}...`],
        });
        return;
      }

      carboneAPI.setBaseUrl(apiBaseUrl);
      const template = await carboneAPI.getTemplate(draftId);
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
        templateName: template.fileName?.replace(/\.[^.]+$/, '') || templateName,
        savedAt: draftInfo?.savedAt || new Date().toISOString(),
      };

      applyDraftSnapshot(restoredDraft);
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(restoredDraft));
      setDraftWorkflowNotice({
        type: 'success',
        message: '✅ 已从后端恢复草稿',
        lines: [`${restoredDraft.templateType} · ${templateSuggestions.length} 参数 · ID: ${draftId.substring(0, 8)}...`],
      });
    } catch (error: any) {
      setDraftWorkflowNotice({ type: 'error', message: `载入草稿失败: ${error.message || '未知错误'}` });
    }
  };

  const handleClearDraft = (options?: { silent?: boolean }) => {
    setDraftId(null);
    setDraftInfo(null);
    localStorage.removeItem(DRAFT_STORAGE_KEY);
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
    if (!aiSkillGuide) {
      setAiGenerateResult({ success: false, message: '请先生成AI指南' });
      return;
    }

    setIsGeneratingParams(true);
    setAiGenerateResult(null);
    setPreviewResult(null); // Clear old preview results when generating new parameters
    setAiGeneratedData(null); // Clear old generated data
    setAiDescription(''); // Clear old description

    try {
      const effectiveDescription = aiDescription.trim() || '请基于当前 Skill Guide 生成一份默认实例参数，要求字段完整、值合理、可直接用于预览。';
      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.generateParameters({
        description: effectiveDescription,
        skillId: aiSkillGuide.id,
        skill: aiSkillGuide,
      });

      if (result.success && result.generatedData) {
        setAiGeneratedData(result.generatedData);
        setAiDescription(JSON.stringify(result.generatedData, null, 2));
        setAiGenerateResult({
          success: true,
          message: aiDescription.trim() ? '✅ 数据生成成功！' : '✅ 默认实例参数生成成功！'
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
    handleAnalyzePair,
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
