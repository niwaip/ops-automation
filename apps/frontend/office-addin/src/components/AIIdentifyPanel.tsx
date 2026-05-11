/**
 * AI 识别面板组件
 * 显示 AI 分析结果和建议，支持一键应用或部分应用
 * 包含详细错误显示和调试日志功能
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, AISuggestion } from '../taskpane/store';
import { carboneAPI } from '../api/carbone-api';
import { createHostAdapter } from '../adapters';
import { analyzeDocumentWithAI } from '../services/suggestion-service';
import { exportTemplateSource } from '../services/template-source-service';

interface Props {
  onApplyComplete?: () => void;
}

interface AnalysisSummary {
  requestedAI: boolean;
  aiCallSucceeded: boolean;
  usedAI: boolean;
  usedCachedGlobalUnderstanding?: boolean;
  salvagedMalformedJson?: boolean;
  requestMode: string;
  resultSource: string;
  analysisExecutor: string;
  requestedAnalysisExecutor: string;
  analysisExecutorFallbackReason?: string;
  supportsThinking: boolean;
  fallback?: string;
  aiServiceUrl?: string;
  sourceCounts: Record<string, number>;
  descriptionOrigin?: string;
  pipeline?: string;
  globalUnderstandingSummary?: string;
  promptDebugSummary?: string;
  promptRequestText?: string;
  rawAiResponse?: string;
  globalUnderstandingError?: {
    message?: string;
    reason?: string;
    url?: string;
    status?: number;
  };
  pairResults: Array<{
    pairIndex: number;
    pairLabel: string;
    aiCallSucceeded: boolean;
    candidateCount: number;
    loopDetected: boolean;
    suggestionCount: number;
    promptDebugSummary?: string;
    promptRequestText?: string;
    rawAiResponse?: string;
    error?: {
      message?: string;
      reason?: string;
      url?: string;
      status?: number;
    };
  }>;
}

function inferSourceCounts(suggestions: AISuggestion[]): Record<string, number> {
  return suggestions.reduce<Record<string, number>>((counts, suggestion) => {
    const source = suggestion.details?.source || 'unknown';
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});
}

function buildAnalysisSummary(result: Awaited<ReturnType<typeof analyzeDocumentWithAI>>): AnalysisSummary {
  const contextAnalysis = result.contextAnalysis || {};
  const sourceCounts =
    (contextAnalysis.sourceCounts as Record<string, number> | undefined) ||
    inferSourceCounts(result.suggestions);

  return {
    requestedAI: Boolean(contextAnalysis.requestedAI ?? true),
    aiCallSucceeded: Boolean(contextAnalysis.aiCallSucceeded ?? true),
    usedAI: Boolean(contextAnalysis.usedAI ?? true),
    usedCachedGlobalUnderstanding: Boolean(contextAnalysis.usedCachedGlobalUnderstanding ?? false),
    salvagedMalformedJson: Boolean(contextAnalysis.salvagedMalformedJson ?? false),
    requestMode: String(contextAnalysis.requestMode || 'unknown'),
    resultSource: String(contextAnalysis.resultSource || 'unknown'),
    analysisExecutor: String(contextAnalysis.analysisExecutor || 'studio'),
    requestedAnalysisExecutor: String(contextAnalysis.requestedAnalysisExecutor || contextAnalysis.analysisExecutor || 'studio'),
    analysisExecutorFallbackReason: contextAnalysis.analysisExecutorFallbackReason
      ? String(contextAnalysis.analysisExecutorFallbackReason)
      : undefined,
    supportsThinking: Boolean(contextAnalysis.supportsThinking ?? false),
    fallback: contextAnalysis.fallback ? String(contextAnalysis.fallback) : undefined,
    aiServiceUrl: contextAnalysis.aiServiceUrl ? String(contextAnalysis.aiServiceUrl) : undefined,
    sourceCounts,
    descriptionOrigin: contextAnalysis.descriptionOrigin
      ? String(contextAnalysis.descriptionOrigin)
      : undefined,
    pipeline: contextAnalysis.pipeline ? String(contextAnalysis.pipeline) : undefined,
    globalUnderstandingSummary: contextAnalysis.globalUnderstandingSummary
      ? String(contextAnalysis.globalUnderstandingSummary)
      : undefined,
    promptDebugSummary: contextAnalysis.promptDebugSummary
      ? String(contextAnalysis.promptDebugSummary)
      : undefined,
    promptRequestText: contextAnalysis.promptRequestText
      ? String(contextAnalysis.promptRequestText)
      : undefined,
    rawAiResponse: contextAnalysis.rawAiResponse
      ? String(contextAnalysis.rawAiResponse)
      : undefined,
    globalUnderstandingError:
      contextAnalysis.globalUnderstandingError && typeof contextAnalysis.globalUnderstandingError === 'object'
        ? {
            message: (contextAnalysis.globalUnderstandingError as Record<string, unknown>).message
              ? String((contextAnalysis.globalUnderstandingError as Record<string, unknown>).message)
              : undefined,
            reason: (contextAnalysis.globalUnderstandingError as Record<string, unknown>).reason
              ? String((contextAnalysis.globalUnderstandingError as Record<string, unknown>).reason)
              : undefined,
            url: (contextAnalysis.globalUnderstandingError as Record<string, unknown>).url
              ? String((contextAnalysis.globalUnderstandingError as Record<string, unknown>).url)
              : undefined,
            status: (contextAnalysis.globalUnderstandingError as Record<string, unknown>).status
              ? Number((contextAnalysis.globalUnderstandingError as Record<string, unknown>).status)
              : undefined,
          }
        : undefined,
    pairResults: Array.isArray(contextAnalysis.pairResults)
      ? (contextAnalysis.pairResults as Array<Record<string, unknown>>).map((pair) => ({
          pairIndex: Number(pair.pairIndex ?? -1),
          pairLabel: String(pair.pairLabel || ''),
          aiCallSucceeded: Boolean(pair.aiCallSucceeded),
          candidateCount: Number(pair.candidateCount ?? 0),
          loopDetected: Boolean(pair.loopDetected),
          suggestionCount: Number(pair.suggestionCount ?? 0),
          promptDebugSummary: pair.promptDebugSummary ? String(pair.promptDebugSummary) : undefined,
          promptRequestText: pair.promptRequestText ? String(pair.promptRequestText) : undefined,
          rawAiResponse: pair.rawAiResponse ? String(pair.rawAiResponse) : undefined,
          error:
            pair.error && typeof pair.error === 'object'
              ? {
                  message: (pair.error as Record<string, unknown>).message
                    ? String((pair.error as Record<string, unknown>).message)
                    : undefined,
                  reason: (pair.error as Record<string, unknown>).reason
                    ? String((pair.error as Record<string, unknown>).reason)
                    : undefined,
                  url: (pair.error as Record<string, unknown>).url
                    ? String((pair.error as Record<string, unknown>).url)
                    : undefined,
                  status: (pair.error as Record<string, unknown>).status
                    ? Number((pair.error as Record<string, unknown>).status)
                    : undefined,
                }
              : undefined,
        }))
      : [],
  };
}

function getExcelSuggestionSheetNames(suggestion: AISuggestion): string[] {
  const names = new Set<string>();
  const anchorSheetName = suggestion.details?.excelAnchor?.sheetName?.trim();
  if (anchorSheetName) {
    names.add(anchorSheetName);
  }

  const chapter = suggestion.details?.chapter?.trim();
  if (chapter) {
    names.add(chapter);
  }

  const displayPosition = suggestion.details?.displayPosition || suggestion.elementPath || '';
  const match = displayPosition.match(/^(.+?)![A-Z]+\d+(?::[A-Z]+\d+)?$/i);
  if (match?.[1]) {
    names.add(match[1].trim());
  }

  return Array.from(names);
}

function suggestionBelongsToExcelPair(suggestion: AISuggestion, pair: AnalysisSummary['pairResults'][number]): boolean {
  const anchorPairIndex = suggestion.details?.excelAnchor?.pairIndex;
  if (typeof anchorPairIndex === 'number') {
    return anchorPairIndex === pair.pairIndex;
  }

  const sheetNames = getExcelSuggestionSheetNames(suggestion);
  if (sheetNames.length === 0) {
    return false;
  }

  const pairSheetNames = pair.pairLabel
    .split('↔')
    .map((value) => value.trim())
    .filter(Boolean);

  return sheetNames.some((sheetName) => pairSheetNames.includes(sheetName));
}

function collectProcessedExcelSheetNames(
  summary: AnalysisSummary,
  nextSuggestions: AISuggestion[]
): string[] {
  const names = new Set<string>();

  summary.pairResults
    .filter((pair) => pair.pairIndex >= 0)
    .forEach((pair) => {
      pair.pairLabel
        .split('↔')
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((sheetName) => names.add(sheetName));
    });

  nextSuggestions.forEach((suggestion) => {
    getExcelSuggestionSheetNames(suggestion).forEach((sheetName) => names.add(sheetName));
  });

  return Array.from(names);
}

function mergeExcelSuggestionsByPairResult(
  previousSuggestions: AISuggestion[],
  nextSuggestions: AISuggestion[],
  summary: AnalysisSummary
): AISuggestion[] {
  if (summary.pairResults.length === 0) {
    return nextSuggestions;
  }

  const processedPairs = summary.pairResults.filter((pair) => pair.pairIndex >= 0);
  const processedSheetNames = collectProcessedExcelSheetNames(summary, nextSuggestions);
  const preservedSuggestions = previousSuggestions.filter(
    (suggestion) => {
      if (processedPairs.some((pair) => suggestionBelongsToExcelPair(suggestion, pair))) {
        return false;
      }
      const suggestionSheetNames = getExcelSuggestionSheetNames(suggestion);
      if (suggestionSheetNames.some((sheetName) => processedSheetNames.includes(sheetName))) {
        return false;
      }
      return true;
    }
  );

  return [...preservedSuggestions, ...nextSuggestions];
}

function countPreservedExcelSuggestions(
  previousSuggestions: AISuggestion[],
  summary: AnalysisSummary
): number {
  if (summary.pairResults.length === 0) {
    return 0;
  }

  const processedPairs = summary.pairResults.filter((pair) => pair.pairIndex >= 0);
  const processedSheetNames = collectProcessedExcelSheetNames(summary, []);
  return previousSuggestions.filter(
    (suggestion) => {
      if (processedPairs.some((pair) => suggestionBelongsToExcelPair(suggestion, pair))) {
        return false;
      }
      const suggestionSheetNames = getExcelSuggestionSheetNames(suggestion);
      if (suggestionSheetNames.some((sheetName) => processedSheetNames.includes(sheetName))) {
        return false;
      }
      return true;
    }
  ).length;
}

export const AIIdentifyPanel: React.FC<Props> = ({ onApplyComplete }) => {
  const {
    officeType,
    isAnalyzing,
    suggestions,
    analysisError,
    analysisErrorDetails,
    setAnalyzing,
    setSuggestions,
    setAnalysisError,
    applySuggestion,
    dismissSuggestion,
    updateSuggestionName,
    updateSuggestionDetails,
    templateConfig,
    apiBaseUrl,
    aiOrchestratorBaseUrl,
    excelSheetPairs,
    excelWorkbookUnderstanding,
    analysisExecutor,
    setAnalysisExecutor,
    analysisThinkingEnabled,
    setAnalysisThinkingEnabled,
    aiOrchestratorAuthToken,
    addDebugLog,
    setExcelSheetPairs,
    toggleExcelSheetPairCompare,
    removeExcelSheetPair,
    showDebugPanel,
    setShowDebugPanel,
  } = useAppStore();

  const hostAdapter = useMemo(() => createHostAdapter(officeType), [officeType]);
  const isExcelMode = officeType === 'excel';
  const previewInlineSupported = officeType === 'word';

  const getPreviewSuccessMessage = (): string => {
    if (officeType === 'excel') {
      return '✅ 数据预览成功！请下载 Excel 查看结果（浏览器内联预览 XLSX 可能显示为空）';
    }

    return '✅ 数据预览成功！';
  };

  const getDownloadLabel = (): string => {
    switch (officeType) {
      case 'excel':
        return '📥 下载Excel';
      case 'ppt':
        return '📥 下载PPT';
      default:
        return '📥 下载Word';
    }
  };

  const [selectedTemplateType, setSelectedTemplateType] = useState('contract');  // 默认合同类型
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [showPreview, setShowPreview] = useState(false);  // 预览模式
  const [previewContent, setPreviewContent] = useState<string>('');  // 预览内容
  const [previewAction, setPreviewAction] = useState<'apply' | 'reapply'>('apply');
  const [useMultiStage, setUseMultiStage] = useState(true);  // 是否使用多阶段处理
  const [showManualAdd, setShowManualAdd] = useState(false);  // 显示手动添加参数界面
  const [manualParamName, setManualParamName] = useState('d.');  // 手动添加的参数名
  const [manualFormatter, setManualFormatter] = useState('');  // 手动添加的格式化器
  const [selectedContent, setSelectedContent] = useState('');  // 当前选中的文档内容
  const [collapsed, setCollapsed] = useState(false);  // 参数列表是否收起
  const [manualLoopMode, setManualLoopMode] = useState(false);  // 手动添加的循环模式
  const [manualArrayPath, setManualArrayPath] = useState('');  // 循环模式的数组路径
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);  // AI生成变量名状态
  const [manualSignificance, setManualSignificance] = useState('');  // 用途说明

  // 验证模版状态
  const [isVerifying, setIsVerifying] = useState(false);

  // AI指南状态
  const [aiSkillGuide, setAiSkillGuide] = useState<any>(null);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);

  // 保存状态
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 预览模版状态
  const [previewResult, setPreviewResult] = useState<{ success: boolean; message: string; previewUrl?: string; downloadUrl?: string; generatedData?: any } | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // AI生成参数状态
  const [aiDescription, setAiDescription] = useState('');  // 当前输入框内容（可用于描述生成，也可直接编辑JSON数据）
  const [aiGeneratedData, setAiGeneratedData] = useState<any>(null);  // AI生成的参数数据
  const [isGeneratingParams, setIsGeneratingParams] = useState(false);  // 正在生成
  const [aiGenerateResult, setAiGenerateResult] = useState<{ success: boolean; message: string } | null>(null);

  // 暂存副本状态（保存到后端的完整副本）
  const [draftId, setDraftId] = useState<string | null>(null);  // 暂存副本ID
  const [draftInfo, setDraftInfo] = useState<{ templateType: string; parameterCount: number; savedAt: string } | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftWorkflowNotice, setDraftWorkflowNotice] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    lines?: string[];
  } | null>(null);

  // 模板名称输入
  const [templateName, setTemplateName] = useState('');  // 用户输入的模板名称
  const [analysisSummary, setAnalysisSummary] = useState<AnalysisSummary | null>(null);
  const [supportsSuggestionPreview, setSupportsSuggestionPreview] = useState(!isExcelMode);
  const [excelAnalysisCollapsed, setExcelAnalysisCollapsed] = useState(false);
  const [excelReferenceCardsCollapsed, setExcelReferenceCardsCollapsed] = useState(false);
  const [draftWorkflowCollapsed, setDraftWorkflowCollapsed] = useState(false);
  const [guidePreviewCollapsed, setGuidePreviewCollapsed] = useState(false);
  const [verifySaveCollapsed, setVerifySaveCollapsed] = useState(false);
  const [collapsedSuggestionGroups, setCollapsedSuggestionGroups] = useState<Record<string, boolean>>({});
  const visibleExcelPairs = useMemo(
    () => excelSheetPairs.filter((pair) => !pair.hidden),
    [excelSheetPairs]
  );

  useEffect(() => {
    if (isExcelMode && analysisExecutor !== 'chat') {
      setAnalysisExecutor('chat');
    }
  }, [analysisExecutor, isExcelMode, setAnalysisExecutor]);

  useEffect(() => {
    let disposed = false;

    hostAdapter
      .getCapabilities()
      .then((capabilities) => {
        if (!disposed) {
          setSupportsSuggestionPreview(Boolean(capabilities.canPreviewSuggestion));
        }
      })
      .catch(() => {
        if (!disposed) {
          setSupportsSuggestionPreview(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [hostAdapter]);

  // 检查是否有暂存副本（从localStorage恢复draftId）
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
          // 同时恢复suggestions和aiSkillGuide
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
        // 忽略解析错误
      }
    }
  }, []);

  const loadTemplateSource = async () => {
    const source = await exportTemplateSource(hostAdapter);
    source.warnings?.forEach((warning) => addDebugLog('warn', '模板源导出提示', warning));

    return {
      documentContent: source.content,
      format: source.format,
    };
  };

  const suggestVariableNameFromText = (text: string): string => {
    const normalized = text.trim();
    if (!normalized) {
      return 'd.textValue';
    }

    if (normalized.includes('甲方')) return 'd.partyA.name';
    if (normalized.includes('乙方')) return 'd.partyB.name';
    if (normalized.includes('日期') || normalized.includes('时间')) return 'd.date';
    if (normalized.includes('金额') || normalized.includes('价款')) return 'd.amount';
    if (normalized.includes('地址')) return 'd.address';
    if (normalized.includes('电话')) return 'd.phone';
    if (normalized.includes('邮箱')) return 'd.email';
    if (normalized.includes('公司')) return 'd.company.name';
    if (normalized.includes('名称') || normalized.includes('姓名')) return 'd.name';

    const asciiWords = normalized.match(/[A-Za-z0-9]+/g);
    if (asciiWords && asciiWords.length > 0) {
      return `d.${asciiWords.join('_').toLowerCase()}`;
    }

    return 'd.textValue';
  };

  // 暂存副本（保存完整docx到后端）
  const handleSaveDraft = async () => {
    if (!aiSkillGuide) {
      setDraftWorkflowNotice({ type: 'error', message: '请先生成AI指南' });
      return;
    }

    setIsSavingDraft(true);
    addDebugLog('info', `暂存副本`, `参数数量: ${suggestions.length}`);

    try {
      const { documentContent, format } = await loadTemplateSource();

      carboneAPI.setBaseUrl(apiBaseUrl);

      const result = await carboneAPI.saveTemplateFull({
        documentContent,
        suggestions: suggestions,
        templateConfig,
        skill: aiSkillGuide,
        format,
        templateName: `draft-${Date.now()}`  // 暂存副本用临时名称
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
        addDebugLog('info', `✅ 副本暂存成功`, `ID: ${result.templateId}`);

        // 保存到localStorage方便下次载入
        localStorage.setItem('ai-template-draft', JSON.stringify({
          draftId: result.templateId,
          templateType: selectedTemplateType,
          suggestions,
          aiSkillGuide,
          savedAt: new Date().toISOString()
        }));
      } else {
        setDraftWorkflowNotice({ type: 'error', message: `暂存失败: ${result.error || '未知错误'}` });
        addDebugLog('error', `暂存失败`, result.error || '未知错误');
      }
    } catch (error: any) {
      setDraftWorkflowNotice({ type: 'error', message: `暂存失败: ${error.message}` });
      addDebugLog('error', `暂存失败`, error.message);
    } finally {
      setIsSavingDraft(false);
    }
  };

  // 载入暂存副本
  const handleLoadDraft = async () => {
    if (!draftId) {
      addDebugLog('warn', '没有暂存副本可载入');
      setDraftWorkflowNotice({ type: 'info', message: '没有暂存副本可载入' });
      return;
    }

    addDebugLog('info', `载入暂存副本`, `ID: ${draftId}`);
    // localStorage的数据已在useEffect中恢复，这里只需要提示
    addDebugLog('info', `✅ 副本已载入`, `${draftInfo?.parameterCount || 0} 个参数`);
    setDraftWorkflowNotice({
      type: 'success',
      message: '✅ 副本已载入',
      lines: [`${draftInfo?.templateType || selectedTemplateType} · ${draftInfo?.parameterCount || 0} 参数 · ID: ${draftId.substring(0, 8)}...`],
    });
  };

  // 清除暂存副本
  const handleClearDraft = (options?: { silent?: boolean }) => {
    setDraftId(null);
    setDraftInfo(null);
    localStorage.removeItem('ai-template-draft');
    addDebugLog('info', `清除暂存副本`);
    if (!options?.silent) {
      setDraftWorkflowNotice({ type: 'info', message: '🗑️ 已清除暂存副本' });
    }
  };

  /**
   * 执行 AI 分析（使用多阶段处理流程）
   */
  const handleAnalyze = async () => {
    const effectiveTemplateType = isExcelMode ? 'contract' : selectedTemplateType;
    const effectiveUseMultiStage = isExcelMode ? false : useMultiStage;
    const effectiveAnalysisExecutor = isExcelMode ? 'chat' : analysisExecutor;

    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisSummary(null);

    addDebugLog(
      'info',
      `开始 AI 识别`,
      `模板类型: ${effectiveTemplateType}，执行器: ${effectiveAnalysisExecutor}${isExcelMode ? '（Excel 固定）' : ''}`
    );

    try {
      addDebugLog('debug', `获取文档内容`, `Office 类型: ${officeType}`);

      if (effectiveUseMultiStage) {
        // 当前后端仍是 HTTP 同步返回，这里保留前端进度占位。
        addDebugLog('info', `调用多阶段处理API`, `等待后端返回实际处理流程类型...`);

        const updateProgress = (stageName: string, progress: number, message: string, section?: string) => {
          addDebugLog('debug', `进度更新`, `${stageName}: ${progress}% - ${message}${section ? ` (${section})` : ''}`);
        };

        updateProgress('处理中', 50, '⏳ 正在处理文档...');

        const result = await analyzeDocumentWithAI(hostAdapter, {
          apiBaseUrl,
          templateType: effectiveTemplateType,
          useMultiStage: true,
          analysisExecutor: effectiveAnalysisExecutor,
          thinking: analysisThinkingEnabled,
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

        const flowType = String(result.contextAnalysis?.flowType || 'unknown');
        const flowTypeDisplay = flowType === 'quick' ? '快速识别（有下划线位置）' :
                                flowType === 'multi-stage' ? '多阶段处理（文档理解→分段参数化→整合确认）' :
                                '未知流程';

        updateProgress('完成', 100, '✅ 处理完成！');

        addDebugLog('info', `处理完成，实际流程: ${flowTypeDisplay}`,
          `识别到 ${result.suggestions.length || 0} 个参数，模板类型: ${result.templateConfig?.templateType || effectiveTemplateType}`);

        const nextSummary = buildAnalysisSummary(result);
        setAnalysisSummary(nextSummary);
        addDebugLog(
          'info',
          '分析来源',
          `请求模式: ${nextSummary.requestMode}, AI调用成功: ${nextSummary.aiCallSucceeded ? '是' : '否'}, 结果来源: ${nextSummary.resultSource}`
        );
        if (nextSummary.promptRequestText && !(isExcelMode && nextSummary.usedCachedGlobalUnderstanding)) {
          addDebugLog('debug', '全局发送给 AI 的请求原文', nextSummary.promptRequestText);
        }
        if (nextSummary.rawAiResponse && !(isExcelMode && nextSummary.usedCachedGlobalUnderstanding)) {
          addDebugLog('debug', '全局 AI 原始返回', nextSummary.rawAiResponse);
        }
        nextSummary.pairResults.forEach((pair) => {
          if (pair.promptRequestText) {
            addDebugLog('debug', `对照组 ${pair.pairIndex + 1} 发送给 AI 的请求原文`, pair.promptRequestText);
          }
          if (pair.rawAiResponse) {
            addDebugLog('debug', `对照组 ${pair.pairIndex + 1} AI 原始返回`, pair.rawAiResponse);
          }
        });
        const mergedSuggestions = isExcelMode
          ? mergeExcelSuggestionsByPairResult(suggestions, result.suggestions, nextSummary)
          : result.suggestions;
        const preservedCount = isExcelMode
          ? countPreservedExcelSuggestions(suggestions, nextSummary)
          : 0;
        addDebugLog(
          'info',
          'AI 分析成功',
          isExcelMode
            ? `本次返回 ${result.suggestions.length || 0} 个参数，保留旧参数 ${preservedCount} 个，当前总数 ${mergedSuggestions.length} 个`
            : `识别到 ${result.suggestions.length || 0} 个参数`
        );
        const failedPairs = nextSummary.pairResults.filter((pair) => !pair.aiCallSucceeded);
        failedPairs.forEach((pair) => {
          addDebugLog('warn', `已清理失败对照组的旧参数`, `${pair.pairLabel}`);
        });
        setSuggestions(mergedSuggestions);
      } else {
        addDebugLog('info', `调用原有 API`, `URL: ${apiBaseUrl}/studio/direct-ai-identify`);

        const result = await analyzeDocumentWithAI(hostAdapter, {
          apiBaseUrl,
          templateType: effectiveTemplateType,
          useMultiStage: false,
          analysisExecutor: effectiveAnalysisExecutor,
          thinking: analysisThinkingEnabled,
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

        const usedAI = Boolean(result.contextAnalysis?.usedAI);
        const aiServiceUrl = String(result.contextAnalysis?.aiServiceUrl || '未配置');

        addDebugLog('info', `识别方式: ${usedAI ? '🤖 AI智能识别' : '📋 规则匹配'}`,
          usedAI ? `AI服务地址: ${aiServiceUrl}` : `AI服务不可用(${aiServiceUrl})，使用规则后备方案`);

        const nextSummary = buildAnalysisSummary(result);
        setAnalysisSummary(nextSummary);
        addDebugLog(
          'info',
          '分析来源',
          `请求模式: ${nextSummary.requestMode}, AI调用成功: ${nextSummary.aiCallSucceeded ? '是' : '否'}, 结果来源: ${nextSummary.resultSource}`
        );
        if (nextSummary.promptRequestText && !(isExcelMode && nextSummary.usedCachedGlobalUnderstanding)) {
          addDebugLog('debug', '全局发送给 AI 的请求原文', nextSummary.promptRequestText);
        }
        if (nextSummary.rawAiResponse && !(isExcelMode && nextSummary.usedCachedGlobalUnderstanding)) {
          addDebugLog('debug', '全局 AI 原始返回', nextSummary.rawAiResponse);
        }
        nextSummary.pairResults.forEach((pair) => {
          if (pair.promptRequestText) {
            addDebugLog('debug', `对照组 ${pair.pairIndex + 1} 发送给 AI 的请求原文`, pair.promptRequestText);
          }
          if (pair.rawAiResponse) {
            addDebugLog('debug', `对照组 ${pair.pairIndex + 1} AI 原始返回`, pair.rawAiResponse);
          }
        });
        const mergedSuggestions = isExcelMode
          ? mergeExcelSuggestionsByPairResult(suggestions, result.suggestions, nextSummary)
          : result.suggestions;
        const preservedCount = isExcelMode
          ? countPreservedExcelSuggestions(suggestions, nextSummary)
          : 0;
        addDebugLog(
          'info',
          'AI 分析成功',
          isExcelMode
            ? `本次返回 ${result.suggestions.length || 0} 个参数，保留旧参数 ${preservedCount} 个，当前总数 ${mergedSuggestions.length} 个`
            : `识别到 ${result.suggestions.length || 0} 个空白填充项`
        );
        const failedPairs = nextSummary.pairResults.filter((pair) => !pair.aiCallSucceeded);
        failedPairs.forEach((pair) => {
          addDebugLog('warn', `已清理失败对照组的旧参数`, `${pair.pairLabel}`);
        });
        setSuggestions(mergedSuggestions);
      }
    } catch (error: any) {
      // 详细错误信息
      const errorMessage = error.message || 'AI 分析失败';
      let errorDetails = '';

      if (error.response) {
        errorDetails = `状态码: ${error.response.status}\n`;
        errorDetails += `响应数据: ${JSON.stringify(error.response.data, null, 2)}\n`;
        errorDetails += `请求URL: ${error.config?.url || apiBaseUrl}`;
      } else if (error.request) {
        errorDetails = `请求未收到响应\n`;
        errorDetails += `可能原因:\n`;
        errorDetails += `1. 后端服务未启动 (${apiBaseUrl})\n`;
        errorDetails += `2. HTTPS 证书问题（Office 要求 HTTPS）\n`;
        errorDetails += `3. 网络连接问题\n`;
        errorDetails += `4. CORS 配置问题`;
      } else {
        errorDetails = `请求配置错误: ${error.message}\n`;
        errorDetails += `堆栈: ${error.stack || '无'}`;
      }

      addDebugLog('error', errorMessage, errorDetails);
      setAnalysisError(errorMessage, errorDetails);
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * 测试后端连接
   */
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

  /**
   * AI生成数据
   * 根据用户描述和Skill Guide生成具体的数据值
   */
  const generateParametersData = async (options?: { source?: 'generate' | 'preview' }): Promise<any | null> => {
    if (!aiDescription.trim()) {
      setAiGenerateResult({ success: false, message: '请输入描述内容' });
      return null;
    }

    if (!aiSkillGuide) {
      setAiGenerateResult({ success: false, message: '请先生成AI指南' });
      return null;
    }

    setIsGeneratingParams(true);
    if (options?.source !== 'preview') {
      setAiGenerateResult(null);
    }
    addDebugLog('info', `AI生成数据`, `描述: ${aiDescription.substring(0, 50)}...`);

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
        addDebugLog('info', `✅ 数据生成成功`, JSON.stringify(result.generatedData, null, 2));
        return result.generatedData;
      } else {
        setAiGenerateResult({ success: false, message: `生成失败: ${result.error || '未知错误'}` });
        addDebugLog('error', `生成失败`, result.error || '未知错误');
        return null;
      }
    } catch (error: any) {
      setAiGenerateResult({ success: false, message: `生成失败: ${error.message}` });
      addDebugLog('error', `生成失败`, error.message);
      return null;
    } finally {
      setIsGeneratingParams(false);
    }
  };

  const handleGenerateParameters = async () => {
    await generateParametersData({ source: 'generate' });
  };

  const parsePreviewDataFromInput = (): { data?: any; error?: string } => {
    const raw = aiDescription.trim();
    if (!raw) {
      return { error: '请先输入数据内容' };
    }

    try {
      return { data: JSON.parse(raw) };
    } catch {
      return { error: '预览数据需要使用 JSON 格式。可先点“生成数据”，再按需修改后预览。' };
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

  /**
   * 使用AI生成的数据进行预览验证
   */
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
      addDebugLog('info', `使用AI数据预览`, `数据: ${JSON.stringify(latestGeneratedData, null, 2).substring(0, 100)}...`);

      // 如果有暂存副本ID，直接从副本预览
      if (draftId) {
        addDebugLog('info', `从副本预览`, `ID: ${draftId}`);
        const result = await carboneAPI.previewWithSkill({
          templateId: draftId,
          skill: aiSkillGuide,
          simulatedData: latestGeneratedData,  // 使用AI生成的参数
        });

        if (result.success) {
          setPreviewResult({
            success: true,
            message: `${getPreviewSuccessMessage()}（从副本）`,
            previewUrl: result.previewUrl,
            downloadUrl: result.downloadUrl,
            generatedData: latestGeneratedData
          });
          addDebugLog('info', `✅ 预览成功`, `下载链接: ${result.downloadUrl}`);
        } else {
          setPreviewResult({ success: false, message: `预览失败: ${result.error || '未知错误'}` });
          addDebugLog('error', `预览失败`, result.error || '未知错误');
        }
        return;
      }

      // 没有副本ID，需要重新获取文档并生成模版
      addDebugLog('info', `重新生成模版预览`, `参数数量: ${suggestions.length}`);

      const { documentContent, format } = await loadTemplateSource();

      // 先生成模板
      const templateResult = await carboneAPI.generateTemplate({
        documentContent,
        suggestions: suggestions.map(s => ({ ...s, applied: true })),
        templateConfig,
        format,
      });

      if (!templateResult.success) {
        setPreviewResult({ success: false, message: `模板生成失败: ${templateResult.error}` });
        addDebugLog('error', `模板生成失败`, templateResult.error || '未知错误');
        return;
      }

      addDebugLog('info', `模版已生成`, `ID: ${templateResult.templateId}`);

      // 使用AI生成的参数预览
      const result = await carboneAPI.previewWithSkill({
        templateId: templateResult.templateId,
        skill: aiSkillGuide,
        simulatedData: latestGeneratedData,  // 使用AI生成的参数
      });

      if (result.success) {
        setPreviewResult({
          success: true,
          message: getPreviewSuccessMessage(),
          previewUrl: result.previewUrl,
          downloadUrl: result.downloadUrl,
          generatedData: latestGeneratedData
        });
        addDebugLog('info', `✅ 预览成功`, `下载链接: ${result.downloadUrl}`);
      } else {
        setPreviewResult({ success: false, message: `预览失败: ${result.error || '未知错误'}` });
        addDebugLog('error', `预览失败`, result.error || '未知错误');
      }
    } catch (error: any) {
      setPreviewResult({ success: false, message: `预览失败: ${error.message}` });
      addDebugLog('error', `预览失败`, error.message);
    } finally {
      setIsPreviewing(false);
    }
  };

  /**
   * 验证模版配置（使用模版配置页的逻辑）
   */
  const handleVerifyTemplate = async () => {
    if (suggestions.length === 0) {
      setDraftWorkflowNotice({ type: 'error', message: '请先进行AI识别或手动添加参数' });
      return;
    }

    setIsVerifying(true);
    addDebugLog('info', `验证模版配置`, `参数数量: ${suggestions.length}`);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);

      // 构建模版配置（与模版配置页一致）
      const configToValidate = {
        templateType: selectedTemplateType,
        variables: suggestions.reduce((acc, s) => {
          // 从 suggestedName 提取变量路径（去掉 {} 包装）
          const varPath = s.suggestedName.replace(/[{}]/g, '').replace(/^d\./, '');
          acc[varPath] = s.originalText || '';
          return acc;
        }, {} as Record<string, string>),
        loops: suggestions
          .filter(s => s.details?.fieldType === 'loop')
          .map(s => ({
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
        addDebugLog('info', `✅ 验证成功`, `模版配置有效`);
        if (result.warnings && result.warnings.length > 0) {
          addDebugLog('warn', `⚠️ 警告`, result.warnings.join('\n'));
        }
      } else {
        setDraftWorkflowNotice({
          type: 'error',
          message: '❌ 验证失败',
          lines: result.errors,
        });
        addDebugLog('error', `❌ 验证失败`, result.errors?.join('\n') || '未知错误');
      }
    } catch (error: any) {
      setDraftWorkflowNotice({ type: 'error', message: `验证失败: ${error.message}` });
      addDebugLog('error', `验证失败`, error.message);
    } finally {
      setIsVerifying(false);
    }
  };

  /**
   * 生成AI Skill Guide
   */
  const handleGenerateAISkillGuide = async () => {
    if (suggestions.length === 0) {
      addDebugLog('warn', '请先进行AI识别或手动添加参数');
      return;
    }

    setIsGeneratingGuide(true);
    addDebugLog('info', `生成AI Skill Guide`, `参数数量: ${suggestions.length}`);

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
        addDebugLog('info', `✅ AI指南生成成功`, `包含 ${result.skill.parameters?.length || 0} 个参数`);
      } else {
        setDraftWorkflowNotice({ type: 'error', message: `生成AI指南失败: ${result.error || '未知错误'}` });
        addDebugLog('error', `生成AI指南失败`, result.error || '未知错误');
      }
    } catch (error: any) {
      setDraftWorkflowNotice({ type: 'error', message: `生成AI指南失败: ${error.message}` });
      addDebugLog('error', `生成AI指南失败`, error.message);
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  /**
   * 保存模版和AI指南
   */
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
    addDebugLog('info', `最终保存模版`, `从副本ID: ${draftId}`);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);

      // 从副本正式命名保存
      // 使用用户输入的名称，如果未输入则使用默认名称
      const finalTemplateName = templateName.trim() || `${selectedTemplateType}-template-${Date.now()}`;
      const saveParams: any = {
        templateId: draftId,  // 复用副本ID
        suggestions: suggestions,
        templateConfig,
        skill: aiSkillGuide,
        format: officeType === 'excel' ? 'xlsx' : officeType === 'ppt' ? 'pptx' : 'docx',  // 添加format参数
        templateName: finalTemplateName  // 用户命名或默认命名
      };

      addDebugLog('info', `从副本正式保存`, `副本ID: ${draftId}, 名称: ${finalTemplateName}`);

      const result = await carboneAPI.saveTemplateFull(saveParams);

      if (result.success) {
        setSaveResult({
          success: true,
          message: `✅ 最终保存成功！模板ID: ${result.templateId || 'N/A'}, 指南ID: ${result.skillId || 'N/A'}`
        });
        addDebugLog('info', `✅ 最终保存成功`, `模板ID: ${result.templateId}, 指南ID: ${result.skillId}`);
        // 保存成功后清除暂存副本
        handleClearDraft({ silent: true });
      } else {
        setSaveResult({ success: false, message: `保存失败: ${result.error || '未知错误'}` });
        addDebugLog('error', `保存失败`, result.error || '未知错误');
      }
    } catch (error: any) {
      setSaveResult({ success: false, message: `保存失败: ${error.message}` });
      addDebugLog('error', `保存失败`, error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const applySuggestionToDocument = async (suggestion: AISuggestion): Promise<boolean> => {
    try {
      const capabilities = await hostAdapter.getCapabilities();
      if (!capabilities.canApplySuggestion) {
        addDebugLog('warn', '当前宿主暂不支持应用建议', capabilities.warnings.join('\n'));
        return false;
      }

      await hostAdapter.applySuggestion(suggestion);
      applySuggestion(suggestion.id);
      addDebugLog('info', `应用建议成功`, `${suggestion.originalText} → ${suggestion.suggestedName}`);
      onApplyComplete?.();
      return true;
    } catch (error: any) {
      addDebugLog('error', '应用建议失败', error.message);
      return false;
    }
  };

  /**
   * 应用单个建议
   * 使用underlineInfo精确位置进行替换（参考测试下划线逻辑）
   */
  const handleApplySingle = async (suggestion: AISuggestion) => {
    await applySuggestionToDocument(suggestion);
  };

  /**
   * 生成预览摘要
   */
  const generatePreviewSummary = (items: AISuggestion[], actionLabel: string): string => {
    const lines = items.map((s, i) => {
      return `${i + 1}. "${s.originalText}" → ${s.suggestedName}`;
    });

    return `即将${actionLabel} ${items.length} 个替换:\n\n${lines.join('\n')}`;
  };

  const applySuggestionBatch = async (
    items: AISuggestion[],
    mode: 'apply' | 'reapply'
  ) => {
    if (items.length === 0) {
      addDebugLog('info', mode === 'apply' ? '没有待应用参数' : '没有可重新应用的参数');
      setShowPreview(false);
      setPreviewContent('');
      setPreviewAction('apply');
      return;
    }

    const actionLabel = mode === 'apply' ? '应用' : '重新应用';

    if (supportsSuggestionPreview && (!showPreview || previewAction !== mode)) {
      setPreviewAction(mode);
      setPreviewContent(generatePreviewSummary(items, actionLabel));
      setShowPreview(true);
      return;
    }

    let successCount = 0;
    for (const suggestion of items) {
      const applied = await applySuggestionToDocument(suggestion);
      if (applied) {
        successCount += 1;
      }
    }

    setShowPreview(false);
    setPreviewContent('');
    setPreviewAction('apply');
    setCollapsed(true);
    addDebugLog('info', `${actionLabel}完成`, `成功${actionLabel}了 ${successCount} / ${items.length} 个建议`);
  };

  /**
   * 应用尚未应用的建议（带预览确认）
   */
  const handleApplyAll = async () => {
    try {
      const unapplied = suggestions.filter((s) => !s.applied);
      await applySuggestionBatch(unapplied, 'apply');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      addDebugLog('error', '批量应用失败', message);
    }
  };

  /**
   * 按全部参数重新应用一遍（带预览确认）
   */
  const handleReapplyAll = async () => {
    try {
      await applySuggestionBatch(suggestions, 'reapply');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      addDebugLog('error', '重新应用失败', message);
    }
  };

  /**
   * 取消预览
   */
  const handleCancelPreview = () => {
    setShowPreview(false);
    setPreviewContent('');
    setPreviewAction('apply');
  };

  /**
   * 手动添加参数
   */
  /**
   * 获取当前选中的文档内容（参考ManualSelector）
   */
  const handleGetSelection = async () => {
    try {
      const selection = await hostAdapter.extractSelection();
      if (!selection || !selection.text) {
        addDebugLog('warn', `获取选中内容失败`, '当前宿主未返回可用选区');
        return;
      }

      setSelectedContent(selection.text);
      addDebugLog('info', `获取选中内容`, `内容: ${selection.text.substring(0, 50)}...`);
    } catch (error: any) {
      addDebugLog('error', `获取选中内容失败`, error.message);
    }
  };

  /**
   * 生成手动标记（参考ManualSelector，支持循环模式）
   */
  const generateManualMarker = (): string => {
    let marker = `{${manualParamName}`;
    if (manualFormatter) {
      marker += `:${manualFormatter}`;
    }
    marker += '}';

    // 循环模式包装
    if (manualLoopMode && manualArrayPath) {
      marker = `{#${manualArrayPath}}${marker}{/${manualArrayPath}}`;
    }
    return marker;
  };

  /**
   * AI生成变量名（基于选中内容的语义）
   */
  const handleAIGenerateVariableName = async () => {
    if (!selectedContent) {
      addDebugLog('warn', '请先获取选中内容');
      return;
    }

    setIsGeneratingAI(true);
    try {
      const variableName = suggestVariableNameFromText(selectedContent);
      setManualParamName(variableName);
      addDebugLog('info', `AI生成变量名`, `${variableName}`);
    } catch (error: any) {
      addDebugLog('error', `AI生成失败`, error.message);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  /**
   * 手动添加参数并添加到参数一览（不是直接插入文档）
   */
  const handleManualAddParam = async () => {
    if (!manualParamName || manualParamName.trim() === '') {
      addDebugLog('warn', '请输入参数名称');
      return;
    }

    const marker = generateManualMarker();

    // 创建新的建议，格式与AI识别结果一致
    const newSuggestion: AISuggestion = {
      id: `manual-${Date.now()}`,
      type: manualLoopMode ? 'loop' : 'variable',
      elementPath: selectedContent ? `【${selectedContent.substring(0, 30)}...】` : '手动添加',
      suggestedName: marker,
      originalText: selectedContent || '手动添加的参数',
      confidence: 1.0,
      applied: false,
      context: selectedContent || '用户手动添加',
      details: {
        source: 'manual',
        description: manualSignificance || '用户手动补充的参数说明',
        chapter: '手动添加',
        significance: manualSignificance || '用户自定义参数',
        displayPosition: selectedContent ? `【${selectedContent.substring(0, 30)}...】` : '手动添加',
        context: selectedContent || '',
        fieldType: manualLoopMode ? 'loop' : 'text',
        formatter: manualFormatter,
        arrayPath: manualLoopMode ? manualArrayPath : undefined,
        beforeBlank: selectedContent ? selectedContent.substring(0, 15) : '',
        afterBlank: selectedContent ? selectedContent.substring(Math.max(0, selectedContent.length - 15)) : '',
      }
    };

    // 添加到建议列表
    setSuggestions([...suggestions, newSuggestion]);
    addDebugLog('info', `手动添加参数到列表`, `参数名: ${marker}`);

    // 重置状态并关闭表单
    setShowManualAdd(false);
    setSelectedContent('');
    setManualParamName('d.');
    setManualFormatter('');
    setManualLoopMode(false);
    setManualArrayPath('');
    setManualSignificance('');

    // 展开参数列表显示新添加的项
    setCollapsed(false);
  };

  /**
   * 收起/展开参数列表
   */
  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  const handleClearSuggestions = () => {
    setSuggestions([]);
    addDebugLog('info', '已清除参数列表');
  };

  const handleSetVisibleExcelPairsCompare = (compare: boolean) => {
    const visiblePairIds = new Set(visibleExcelPairs.map((pair) => pair.id));
    setExcelSheetPairs(
      excelSheetPairs.map((pair) => (
        visiblePairIds.has(pair.id)
          ? { ...pair, compare }
          : pair
      ))
    );
    addDebugLog('info', compare ? '已全选参考卡片组' : '已全部不选参考卡片组');
  };

  /**
   * 获取建议所属分组
   */
  const getSuggestionGroupName = (suggestion: AISuggestion): string => {
    if (isExcelMode) {
      return suggestion.details?.excelAnchor?.sheetName
        || suggestion.details?.chapter
        || '未归属 Sheet';
    }

    return suggestion.details?.chapter || '正文';
  };

  const groupSuggestions = (): Record<string, AISuggestion[]> => {
    const grouped: Record<string, AISuggestion[]> = {};

    for (const suggestion of suggestions) {
      const groupName = getSuggestionGroupName(suggestion);
      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }
      grouped[groupName].push(suggestion);
    }

    if (isExcelMode) {
      const sortedKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
      const sortedGrouped: Record<string, AISuggestion[]> = {};
      for (const key of sortedKeys) {
        sortedGrouped[key] = grouped[key];
      }
      return sortedGrouped;
    }

    // 按章节顺序排序（头部、第一条、第二条...、正文）
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      // 头部放第一位
      if (a === '头部' || a.startsWith('正文')) return -1;
      if (b === '头部' || b.startsWith('正文')) return 1;
      // 按章节编号排序
      const aNum = a.match(/第(\d+)/)?.[1] || '999';
      const bNum = b.match(/第(\d+)/)?.[1] || '999';
      return parseInt(aNum) - parseInt(bNum);
    });

    const sortedGrouped: Record<string, AISuggestion[]> = {};
    for (const key of sortedKeys) {
      sortedGrouped[key] = grouped[key];
    }

    return sortedGrouped;
  };

  const groupedSuggestions = groupSuggestions();

  const toggleSuggestionGroupCollapse = (groupName: string) => {
    setCollapsedSuggestionGroups((current) => ({
      ...current,
      [groupName]: !current[groupName],
    }));
  };

  /**
   * 获取分组图标
   */
  const getGroupIcon = (groupName: string): string => {
    if (isExcelMode) return '📊';
    if (groupName === '头部') return '📋';
    if (groupName.includes('第一条') || groupName.includes('第一条')) return '📝';
    if (groupName.includes('第二条')) return '📝';
    if (groupName.includes('第三条')) return '📝';
    if (groupName === '正文') return '📄';
    return '📑';
  };

  const analysisSourceLabelMap: Record<string, string> = {
    ai: 'AI',
    heuristic: '启发式',
    manual: '手动',
    'ai+heuristic': 'AI + 启发式',
    mixed: '混合',
    unknown: '未知',
  };

  return (
    <div className="ai-identify-panel">
      {!isExcelMode && (
        <div className="template-type-selector">
          <label>模板类型:</label>
          <select
            value={selectedTemplateType}
            onChange={(e) => setSelectedTemplateType(e.target.value)}
          >
            <option value="report">报告文档</option>
            <option value="invoice">发票/账单</option>
            <option value="certificate">证书/证明</option>
            <option value="contract">合同/协议</option>
            <option value="letter">信函/通知</option>
            <option value="custom">自定义</option>
          </select>
        </div>
      )}

      {!isExcelMode && (
        <div className="template-type-selector">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={useMultiStage}
              onChange={(e) => setUseMultiStage(e.target.checked)}
            />
            启用多阶段识别
          </label>
          <button className="debug-toggle-btn" onClick={handleTestConnection}>
            测试后端连接
          </button>
        </div>
      )}

      {isExcelMode ? (
        <div className="excel-understanding-card excel-analysis-card">
          <div className="excel-understanding-header">
            <div>
              <h3>参数识别</h3>
              <p>基于已勾选的对照组执行参数分析，输出变量与循环建议。</p>
            </div>
            <div className="excel-understanding-actions">
              <label className="checkbox-label excel-analysis-chip">
                <input
                  type="checkbox"
                  checked={analysisThinkingEnabled}
                  onChange={(e) => setAnalysisThinkingEnabled(e.target.checked)}
                />
                <span>think</span>
              </label>
              <button
                className="sheet-action-btn sheet-action-btn-primary analyze-btn-compact"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <span className="analyzing-indicator">
                    <span className="spinner"></span>
                    <span className="loading-text">识别中...</span>
                  </span>
                ) : '参数识别'}
              </button>
              <button
                className="sheet-action-btn"
                onClick={() => setExcelAnalysisCollapsed((value) => !value)}
              >
                {excelAnalysisCollapsed ? '展开' : '折叠'}
              </button>
            </div>
          </div>

          {!excelAnalysisCollapsed && (
            <>
              <div className="analysis-executor-selector excel-analysis-controls">
                <span className="analysis-executor-hint">
                  只分析下表中勾选的对照组；如第一步已有结果，将直接复用本地缓存的全局理解。
                </span>
              </div>

              <div className="excel-reference-card-group">
                <div className="excel-reference-card-group-header">
                  <div>
                    <div className="analysis-source-title">参考卡片组</div>
                    <div className="excel-reference-card-group-meta">
                      共 {visibleExcelPairs.length} 组，参与比较 {visibleExcelPairs.filter((pair) => pair.compare).length} 组
                    </div>
                  </div>
                  <div className="excel-understanding-actions">
                    <button
                      className="sheet-action-btn"
                      onClick={() => handleSetVisibleExcelPairsCompare(true)}
                      disabled={visibleExcelPairs.length === 0}
                    >
                      全选
                    </button>
                    <button
                      className="sheet-action-btn"
                      onClick={() => handleSetVisibleExcelPairsCompare(false)}
                      disabled={visibleExcelPairs.length === 0}
                    >
                      全部不选
                    </button>
                    <button
                      className="sheet-action-btn"
                      onClick={() => setExcelReferenceCardsCollapsed((value) => !value)}
                    >
                      {excelReferenceCardsCollapsed ? '展开' : '折叠'}
                    </button>
                  </div>
                </div>

                {!excelReferenceCardsCollapsed && (
                  <div className="sheet-pair-list excel-reference-card-list">
                    {visibleExcelPairs.length === 0 ? (
                      <div className="sheet-pair-empty-state">
                        当前没有可用的参考卡片，请先回到第一步生成或恢复对照组。
                      </div>
                    ) : (
                      visibleExcelPairs.map((pair) => (
                        <div
                          key={pair.id}
                          className={`sheet-pair-card excel-reference-card ${pair.compare ? '' : 'sheet-pair-card--skipped'}`}
                        >
                          <div className="sheet-pair-card-header">
                            <div className="sheet-pair-card-title">
                              <span className="sheet-pair-badge">对照组 {pair.pairIndex + 1}</span>
                              <span>{pair.leftSheetName || '缺少模板 sheet'}</span>
                              <span>↔</span>
                              <span>{pair.rightSheetName || '缺少数据 sheet'}</span>
                            </div>
                            <div className="sheet-pair-actions">
                              <label className="sheet-pair-checkbox">
                                <input
                                  type="checkbox"
                                  checked={pair.compare}
                                  onChange={() => toggleExcelSheetPairCompare(pair.id)}
                                />
                                <span>比较</span>
                              </label>
                              <button
                                className="sheet-pair-danger-btn"
                                onClick={() => removeExcelSheetPair(pair.id)}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                          <div className="excel-reference-card-meta">
                            <span>模板 sheet: {pair.leftSheetName || '未配置'}</span>
                            <span>数据 sheet: {pair.rightSheetName || '未配置'}</span>
                            <span>{pair.compare ? '状态: 参与比较' : '状态: 已跳过'}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="template-type-selector analysis-executor-selector">
            <label>分析执行器:</label>
            <select
              value={analysisExecutor}
              onChange={(e) => setAnalysisExecutor(e.target.value as 'studio' | 'chat')}
            >
              <option value="studio">studio</option>
              <option value="chat">chat</option>
            </select>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={analysisThinkingEnabled}
                onChange={(e) => setAnalysisThinkingEnabled(e.target.checked)}
              />
              think
            </label>
            <span className="analysis-executor-hint">
              当前仅支持 studio 与 chat + thinking，不走 task/react
            </span>
          </div>

          <button
            className="analyze-btn"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <span className="analyzing-indicator">
                <span className="spinner"></span>
                <span className="loading-text">正在处理...</span>
              </span>
            ) : 'AI 智能识别'}
          </button>
        </>
      )}

      {analysisSummary && (
        <div className={`analysis-source-card ${isExcelMode ? 'analysis-source-card-compact' : ''}`}>
          <div className="analysis-source-header">
            <span className="analysis-source-title">{isExcelMode ? '参数识别结果' : '分析来源'}</span>
            <span className={`analysis-source-badge source-${analysisSummary.resultSource}`}>
              {analysisSourceLabelMap[analysisSummary.resultSource] || analysisSummary.resultSource}
            </span>
          </div>
          <div className="analysis-source-grid">
            <div className="analysis-source-item">
              <span className="analysis-source-label">是否实际发起 AI 调用</span>
              <span className="analysis-source-value">
                {analysisSummary.requestedAI ? '是' : '否'}
                {analysisSummary.requestMode !== 'unknown' ? ` · ${analysisSummary.requestMode}` : ''}
              </span>
            </div>
            {!isExcelMode && (
              <div className="analysis-source-item">
                <span className="analysis-source-label">分析执行器</span>
                <span className="analysis-source-value">
                  请求 {analysisSummary.requestedAnalysisExecutor}，实际 {analysisSummary.analysisExecutor}
                  {analysisSummary.supportsThinking ? ' · 支持 thinking' : ' · 暂不支持 thinking'}
                </span>
              </div>
            )}
            <div className="analysis-source-item">
              <span className="analysis-source-label">AI 接口调用结果</span>
              <span className="analysis-source-value">
                {analysisSummary.aiCallSucceeded ? '调用成功' : '调用失败'}
                {analysisSummary.fallback
                  ? ` · 已回退 ${analysisSummary.fallback === 'excel-heuristic-no-ai-suggestions' ? 'excel-heuristic（AI 无建议）' : analysisSummary.fallback}`
                  : ''}
              </span>
            </div>
            {isExcelMode && analysisSummary.usedCachedGlobalUnderstanding && (
              <div className="analysis-source-item">
                <span className="analysis-source-label">全局理解来源</span>
                <span className="analysis-source-value">已复用第一步缓存结果，第二步未再次调用全文理解</span>
              </div>
            )}
            {analysisSummary.salvagedMalformedJson && (
              <div className="analysis-source-item">
                <span className="analysis-source-label">返回修复状态</span>
                <span className="analysis-source-value">AI 原始返回存在格式问题，当前结果由解析器兜底恢复</span>
              </div>
            )}
            <div className="analysis-source-item">
              <span className="analysis-source-label">当前结果组成</span>
              <span className="analysis-source-value">
                {Object.entries(analysisSummary.sourceCounts)
                  .map(([source, count]) => `${analysisSourceLabelMap[source] || source} ${count}`)
                  .join('，') || '无'}
              </span>
            </div>
            <div className="analysis-source-item">
              <span className="analysis-source-label">描述文本来源</span>
              <span className="analysis-source-value">
                {analysisSummary.descriptionOrigin || '未返回额外说明'}
              </span>
            </div>
            {!isExcelMode && analysisSummary.analysisExecutorFallbackReason && (
              <div className="analysis-source-item">
                <span className="analysis-source-label">执行器回退原因</span>
                <span className="analysis-source-value">
                  {analysisSummary.analysisExecutorFallbackReason}
                </span>
              </div>
            )}
            {analysisSummary.pipeline && (
              <div className="analysis-source-item">
                <span className="analysis-source-label">当前分析链路</span>
                <span className="analysis-source-value">
                  {analysisSummary.pipeline}
                </span>
              </div>
            )}
            {analysisSummary.globalUnderstandingSummary && !isExcelMode && (
              <div className="analysis-source-item analysis-source-item-block">
                <span className="analysis-source-label">全局真实数据理解</span>
                <pre className="analysis-source-debug">{analysisSummary.globalUnderstandingSummary}</pre>
              </div>
            )}
            {analysisSummary.globalUnderstandingError && (
              <div className="analysis-source-item analysis-source-item-block">
                <span className="analysis-source-label">全局理解失败原因</span>
                <span className="analysis-source-value">
                  {analysisSummary.globalUnderstandingError.message || '未知错误'}
                  {analysisSummary.globalUnderstandingError.reason
                    ? ` · ${analysisSummary.globalUnderstandingError.reason}`
                    : ''}
                  {analysisSummary.globalUnderstandingError.status
                    ? ` · HTTP ${analysisSummary.globalUnderstandingError.status}`
                    : ''}
                  {analysisSummary.globalUnderstandingError.url
                    ? ` · ${analysisSummary.globalUnderstandingError.url}`
                    : ''}
                </span>
              </div>
            )}
            {analysisSummary.promptRequestText && (
              <div className="analysis-source-item analysis-source-item-block">
                <span className="analysis-source-label">全局理解请求原文</span>
                <pre className="analysis-source-debug">{analysisSummary.promptRequestText}</pre>
              </div>
            )}
            {analysisSummary.rawAiResponse && (
              <div className="analysis-source-item analysis-source-item-block">
                <span className="analysis-source-label">全局 AI 原始返回</span>
                <pre className="analysis-source-debug">{analysisSummary.rawAiResponse}</pre>
              </div>
            )}
          </div>
          {analysisSummary.pairResults.length > 0 && (
            <div className="analysis-pair-results">
              <div className="analysis-pair-results-title">对照组分析结果</div>
              <div className="analysis-pair-results-list">
                {analysisSummary.pairResults.map((pair) => (
                  <div key={`${pair.pairIndex}-${pair.pairLabel}`} className="analysis-pair-result-card">
                    {(() => {
                      const pairStatus = !pair.aiCallSucceeded
                        ? { label: 'AI 未返回', className: 'fallback' }
                        : pair.suggestionCount > 0
                          ? { label: 'AI 成功', className: 'success' }
                          : { label: 'AI 成功但无建议', className: 'neutral' };
                      return (
                    <div className="analysis-pair-result-header">
                      <span className="analysis-pair-result-name">
                        对照组 {pair.pairIndex + 1} · {pair.pairLabel}
                      </span>
                      <span className={`analysis-pair-result-badge ${pairStatus.className}`}>
                        {pairStatus.label}
                      </span>
                    </div>
                      );
                    })()}
                    <div className="analysis-pair-result-meta">
                      候选差异 {pair.candidateCount} · 建议 {pair.suggestionCount} · {pair.loopDetected ? '含循环区域' : '单值为主'}
                    </div>
                    {pair.error && (
                      <div className="analysis-pair-result-error">
                        失败原因: {pair.error.message || '未知错误'}
                        {pair.error.reason ? ` · ${pair.error.reason}` : ''}
                        {pair.error.status ? ` · HTTP ${pair.error.status}` : ''}
                        {pair.error.url ? ` · ${pair.error.url}` : ''}
                      </div>
                    )}
                    {pair.promptRequestText && (
                      <div className="analysis-pair-debug-block">
                        <span className="analysis-source-label">参数分析请求原文</span>
                        <pre className="analysis-source-debug analysis-pair-debug">{pair.promptRequestText}</pre>
                      </div>
                    )}
                    {pair.rawAiResponse && (
                      <div className="analysis-pair-debug-block">
                        <span className="analysis-source-label">参数分析原始返回</span>
                        <pre className="analysis-source-debug analysis-pair-debug">{pair.rawAiResponse}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 参数应用 */}
      {(!isAnalyzing || suggestions.length > 0) && (
        <div className="suggestions-container excel-understanding-card excel-analysis-card">
          <div className="excel-understanding-header">
            <div>
              <h3>参数应用</h3>
              <p>管理参数列表并执行写回，可应用新增参数、重新应用全部参数，或手动补充参数。</p>
            </div>
            <div className="excel-understanding-actions">
              <button className="sheet-action-btn" onClick={toggleCollapse}>
                {collapsed ? '展开' : '折叠'}
              </button>
            </div>
          </div>

          {!collapsed && (
            <>
              {/* 预览确认面板 */}
              {supportsSuggestionPreview && showPreview && (
                <div className="preview-confirm-panel">
                  <h4>📋 替换预览</h4>
                  <pre className="preview-content">{previewContent}</pre>
                  <div className="preview-actions">
                    <button
                      className="confirm-btn"
                      onClick={previewAction === 'reapply' ? handleReapplyAll : handleApplyAll}
                    >
                      {previewAction === 'reapply' ? '确认重新应用' : '确认应用'}
                    </button>
                    <button className="cancel-btn" onClick={handleCancelPreview}>
                      ❌ 取消
                    </button>
                  </div>
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="apply-all-section">
                  <div className="apply-all-actions">
                    <button
                      className="apply-all-btn"
                      onClick={handleApplyAll}
                      disabled={suggestions.filter((s) => !s.applied).length === 0}
                    >
                      {supportsSuggestionPreview && showPreview && previewAction === 'apply'
                        ? '✅ 确认应用'
                        : '✅ 应用'} ({suggestions.filter((s) => !s.applied).length})
                    </button>
                    <button
                      className="apply-all-btn"
                      onClick={handleReapplyAll}
                      disabled={suggestions.length === 0}
                    >
                      {supportsSuggestionPreview && showPreview && previewAction === 'reapply'
                        ? '✅ 确认重新应用'
                        : '🔁 重新应用'} ({suggestions.length})
                    </button>
                    <button className="clear-params-btn" onClick={handleClearSuggestions}>
                      清除参数
                    </button>
                  </div>
                </div>
              )}

              <div className="workflow-card-section">
                <div className="workflow-card-section-header">
                  <div className="analysis-source-title">手动添加参数</div>
                  {!showManualAdd ? (
                    <button
                      className="sheet-action-btn sheet-action-btn-primary"
                      onClick={() => setShowManualAdd(true)}
                    >
                      添加参数
                    </button>
                  ) : null}
                </div>

                {!showManualAdd ? (
                  <div className="workflow-card-hint">可基于当前选中内容补充参数，并直接加入参数列表。</div>
                ) : (
                  <div className="manual-add-form expanded">
                    <div className="selection-section">
                      <button className="get-selection-btn" onClick={handleGetSelection}>
                        📍 获取当前选中内容
                      </button>
                      {selectedContent && (
                        <div className="selected-preview">
                          <span className="selected-text">已选: "{selectedContent.substring(0, 30)}..."</span>
                        </div>
                      )}
                    </div>

                    <div className="variable-config">
                      <div className="input-group">
                        <label>变量名:</label>
                        <div className="input-with-btn">
                          <input
                            type="text"
                            className="manual-param-input"
                            value={manualParamName}
                            onChange={(e) => setManualParamName(e.target.value)}
                            placeholder="d.fieldName"
                            autoFocus
                          />
                          <button
                            className="ai-generate-btn"
                            onClick={handleAIGenerateVariableName}
                            disabled={isGeneratingAI || !selectedContent}
                          >
                            {isGeneratingAI ? '⏳' : '🤖'}
                          </button>
                        </div>
                      </div>

                      <div className="input-group">
                        <label>格式化器:</label>
                        <select value={manualFormatter} onChange={(e) => setManualFormatter(e.target.value)}>
                          <option value="">无格式化</option>
                          <option value="formatDate(YYYY-MM-DD)">日期 YYYY-MM-DD</option>
                          <option value="formatDate(YYYY/MM/DD)">日期 YYYY/MM/DD</option>
                          <option value="formatNumber(#,##0.00)">数字 #,##0.00</option>
                          <option value="upper">大写</option>
                          <option value="lower">小写</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label>用途说明:</label>
                        <input
                          type="text"
                          value={manualSignificance}
                          onChange={(e) => setManualSignificance(e.target.value)}
                          placeholder="如：合同甲方名称、发票金额"
                        />
                      </div>

                      <div className="loop-config">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={manualLoopMode}
                            onChange={(e) => setManualLoopMode(e.target.checked)}
                          />
                          启用循环模式
                        </label>

                        {manualLoopMode && (
                          <div className="input-group">
                            <label>数组路径:</label>
                            <input
                              type="text"
                              value={manualArrayPath}
                              onChange={(e) => setManualArrayPath(e.target.value)}
                              placeholder="d.items"
                            />
                            <small>将包装为 {'{#d.array}...{/d.array}'}</small>
                          </div>
                        )}
                      </div>
                    </div>

                    {manualParamName && (
                      <div className="marker-preview">
                        <code>{generateManualMarker()}</code>
                      </div>
                    )}

                    <div className="manual-actions">
                      <button className="confirm-add-btn" onClick={handleManualAddParam}>
                        ✅ 添加到列表
                      </button>
                      <button
                        className="cancel-add-btn"
                        onClick={() => {
                          setShowManualAdd(false);
                          setSelectedContent('');
                          setManualParamName('d.');
                          setManualFormatter('');
                          setManualLoopMode(false);
                          setManualArrayPath('');
                          setManualSignificance('');
                        }}
                      >
                        ❌ 取消
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {suggestions.length > 0 && Object.entries(groupedSuggestions).map(([groupName, items]) => (
                <div key={groupName} className="suggestion-group chapter-group">
                  <h4 className="group-title chapter-title">
                    <span className="chapter-icon">{getGroupIcon(groupName)}</span>
                    <span className="chapter-name">{groupName}</span>
                    <span className="count">({items.length})</span>
                    <button
                      className="sheet-action-btn"
                      onClick={() => toggleSuggestionGroupCollapse(groupName)}
                    >
                      {collapsedSuggestionGroups[groupName] ? '展开' : '折叠'}
                    </button>
                  </h4>

                  {!collapsedSuggestionGroups[groupName] && (
                    <div className="suggestion-list">
                      {items.map((suggestion) => (
                        <SuggestionItem
                          key={suggestion.id}
                          suggestion={suggestion}
                          onApply={() => handleApplySingle(suggestion)}
                          onDismiss={() => dismissSuggestion(suggestion.id)}
                          onUpdateName={(newName) => updateSuggestionName(suggestion.id, newName)}
                          onUpdateDetails={(details) => updateSuggestionDetails(suggestion.id, details)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {(suggestions.length > 0 || aiSkillGuide || draftId || draftWorkflowNotice) && (
        <div className="excel-understanding-card excel-analysis-card">
          <div className="excel-understanding-header">
            <div>
              <h3>制作草稿</h3>
              <p>统一处理指南生成、模板验证和副本暂存，先把草稿准备完整再进入后续验证保存。</p>
            </div>
            <div className="excel-understanding-actions">
              <button className="sheet-action-btn" onClick={() => setDraftWorkflowCollapsed((value) => !value)}>
                {draftWorkflowCollapsed ? '展开' : '折叠'}
              </button>
            </div>
          </div>

          {!draftWorkflowCollapsed && (
          <div className="workflow-card-body">
            <div className="draft-buttons-group">
              <button
                className="generate-guide-btn"
                onClick={handleGenerateAISkillGuide}
                disabled={isAnalyzing || isGeneratingGuide || suggestions.length === 0}
              >
                {isGeneratingGuide ? '⏳ 生成中...' : '📋 生成指南'}
              </button>
              <button
                className="verify-template-btn"
                onClick={handleVerifyTemplate}
                disabled={isAnalyzing || isVerifying || suggestions.length === 0}
              >
                {isVerifying ? '⏳ 验证中...' : '🔍 验证'}
              </button>
              <button
                className="save-draft-btn"
                onClick={handleSaveDraft}
                disabled={isSavingDraft || !aiSkillGuide}
              >
                {isSavingDraft ? '⏳ 暂存中...' : '📦 暂存'}
              </button>
              {draftId && (
                <button
                  className="save-draft-btn"
                  onClick={handleLoadDraft}
                  title="恢复当前暂存副本信息"
                >
                  ♻️ 载入
                </button>
              )}
              {draftId && (
                <button
                  className="clear-draft-btn"
                  onClick={() => handleClearDraft()}
                  title="清除暂存副本"
                >
                  🗑️ 清除
                </button>
              )}
            </div>

            {draftWorkflowNotice && (
              <div className={`workflow-status-message ${draftWorkflowNotice.type}`}>
                <div className="workflow-status-title">{draftWorkflowNotice.message}</div>
                {draftWorkflowNotice.lines && draftWorkflowNotice.lines.length > 0 && (
                  <div className="workflow-status-lines">
                    {draftWorkflowNotice.lines.map((line, i) => <div key={i}>{line}</div>)}
                  </div>
                )}
              </div>
            )}

            {aiSkillGuide && (
              <div className="ai-guide-preview">
                <div className="ai-guide-header">
                  <span className="ai-guide-title">✅ 指南已生成</span>
                  <div className="ai-guide-header-actions">
                    <span className="ai-guide-info">
                      {aiSkillGuide.parameters?.length || 0} 个参数
                    </span>
                    <button className="sheet-action-btn" onClick={() => setGuidePreviewCollapsed((value) => !value)}>
                      {guidePreviewCollapsed ? '展开' : '折叠'}
                    </button>
                  </div>
                </div>
                {!guidePreviewCollapsed && aiSkillGuide.skillGuideMarkdown && (
                  <div className="ai-guide-summary">
                    <div className="ai-guide-section-title">完整 Skill Guide</div>
                    <pre>{aiSkillGuide.skillGuideMarkdown}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {(aiSkillGuide || aiGeneratedData || previewResult || draftId || saveResult) && (
        <div className="excel-understanding-card excel-analysis-card">
          <div className="excel-understanding-header">
            <div>
              <h3>验证保存</h3>
              <p>统一处理参数生成、预览验证和最终保存，使用草稿或 AI 参数完成端到端确认。</p>
            </div>
            <div className="excel-understanding-actions">
              <button className="sheet-action-btn" onClick={() => setVerifySaveCollapsed((value) => !value)}>
                {verifySaveCollapsed ? '展开' : '折叠'}
              </button>
            </div>
          </div>

          {!verifySaveCollapsed && (
          <div className="workflow-card-body">
            {aiSkillGuide && (
              <div className="ai-params-section">
                <div className="ai-params-header">
                  <span className="ai-params-title">AI 生成数据</span>
                  <span className="ai-params-hint">可先输入业务描述生成数据，生成后可直接修改下方 JSON，再用当前内容预览。</span>
                </div>
                <div className="ai-params-buttons">
                  <button
                    className="generate-params-btn"
                    onClick={handleGenerateParameters}
                    disabled={isGeneratingParams || !aiDescription.trim()}
                  >
                    {isGeneratingParams ? '⏳ 生成中...' : '🤖 生成数据'}
                  </button>
                  <button
                    className="preview-ai-btn"
                    onClick={handlePreviewWithAIParams}
                    disabled={isPreviewing || isGeneratingParams || !aiSkillGuide || !aiDescription.trim()}
                  >
                    {isPreviewing ? '⏳ 预览中...' : '👁️ 预览数据'}
                  </button>
                </div>
                <textarea
                  className="ai-description-input"
                  placeholder="先输入业务描述点击“生成数据”，或直接粘贴/编辑 JSON 数据用于预览"
                  value={aiDescription}
                  onChange={(e) => handleAiDescriptionChange(e.target.value)}
                  rows={8}
                />

                {aiGenerateResult && (
                  <div className={`ai-generate-result ${aiGenerateResult.success ? 'success' : 'error'}`}>
                    {aiGenerateResult.message}
                  </div>
                )}

                {aiGeneratedData && (
                  <div className="ai-params-preview">
                    <div className="ai-params-preview-header">📊 AI 生成的数据值</div>
                    <pre className="ai-params-content">{JSON.stringify(aiGeneratedData, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}

            {previewResult && (
              <div className={`preview-result ${previewResult.success ? 'success' : 'error'}`}>
                {previewResult.message}
                <div className="preview-links">
                  {previewInlineSupported && previewResult.previewUrl && (
                    <a href={`${apiBaseUrl}${previewResult.previewUrl}`} target="_blank" rel="noopener noreferrer" className="preview-link">
                      👁️ 打开预览
                    </a>
                  )}
                  {previewResult.downloadUrl && (
                    <a href={`${apiBaseUrl}${previewResult.downloadUrl}`} target="_blank" rel="noopener noreferrer" className="preview-link download-link">
                      {getDownloadLabel()}
                    </a>
                  )}
                </div>
                {previewResult.generatedData && (
                  <div className="generated-data-preview">
                    <div className="generated-data-header">📊 模拟替换数据</div>
                    <pre className="generated-data-content">{JSON.stringify(previewResult.generatedData, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}

            {draftId && (
              <div className="template-name-input-container">
                <label className="template-name-label">模板名称:</label>
                <input
                  type="text"
                  className="template-name-input"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={`默认: ${selectedTemplateType}-template-${Date.now()}`}
                  disabled={isSaving}
                />
              </div>
            )}

            <button
              className="final-save-btn"
              onClick={handleSaveTemplateAndGuide}
              disabled={isSaving || !draftId}
              title={!draftId ? '请先暂存副本' : '从副本正式保存'}
            >
              {isSaving ? '⏳ 保存中...' : '💾 保存模板'}
            </button>

            {saveResult && (
              <div className={`save-result ${saveResult.success ? 'success' : 'error'}`}>
                {saveResult.message}
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* 调试面板开关 */}
      <button
        className="debug-toggle-btn"
        onClick={() => setShowDebugPanel(!showDebugPanel)}
      >
        {showDebugPanel ? '隐藏日志' : '显示日志'}
      </button>

      {/* 错误提示 - 改进的显示 */}
      {analysisError && (
        <div className="error-message-container">
          <div className="error-message" onClick={() => setShowErrorDetails(!showErrorDetails)}>
            <span className="error-icon">❌</span>
            <span className="error-text">{analysisError}</span>
            <span className="error-toggle">{showErrorDetails ? '▼' : '▶'}</span>
          </div>
          {showErrorDetails && analysisErrorDetails && (
            <div className="error-details">
              <pre>{analysisErrorDetails}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * 单个建议项组件
 */
const SuggestionItem: React.FC<{
  suggestion: AISuggestion;
  onApply: () => void;
  onDismiss: () => void;
  onUpdateName?: (newName: string) => void;
  onUpdateDetails?: (details: Partial<NonNullable<AISuggestion['details']>>) => void;
}> = ({ suggestion, onApply, onDismiss, onUpdateName, onUpdateDetails }) => {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(suggestion.suggestedName);
  const [editDescription, setEditDescription] = useState(suggestion.details?.description || '');
  const [editSignificance, setEditSignificance] = useState(suggestion.details?.significance || '');
  const [editFieldType, setEditFieldType] = useState(suggestion.details?.fieldType || 'text');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setEditValue(suggestion.suggestedName);
    setEditDescription(suggestion.details?.description || '');
    setEditSignificance(suggestion.details?.significance || '');
    setEditFieldType(suggestion.details?.fieldType || 'text');
  }, [suggestion]);

  // 获取位置信息（使用格式化的显示位置）
  const getPositionInfo = (suggestion: AISuggestion): string => {
    // 优先使用displayPosition
    if (suggestion.details?.displayPosition) {
      return suggestion.details.displayPosition;
    }
    // 使用elementPath作为格式化位置
    if (suggestion.elementPath && suggestion.elementPath.startsWith('【')) {
      return suggestion.elementPath;
    }
    // 兼容旧格式
    if (suggestion.elementPath?.startsWith('position:')) {
      const pos = suggestion.elementPath.replace('position:', '');
      return `文档位置 ${pos}`;
    }
    // 使用beforeBlank和afterBlank构建
    if (suggestion.details?.beforeBlank || suggestion.details?.afterBlank) {
      return `【${suggestion.details.beforeBlank || ''} _____ ${suggestion.details.afterBlank || ''}】`;
    }
    return suggestion.originalText || '未知位置';
  };

  // 处理编辑确认
  const handleEditConfirm = () => {
    if (editValue !== suggestion.suggestedName && onUpdateName) {
      onUpdateName(editValue);
    }
    if (onUpdateDetails) {
      onUpdateDetails({
        description: editDescription,
        significance: editSignificance,
        fieldType: editFieldType,
      });
    }
    setIsEditing(false);
  };

  // 处理编辑取消
  const handleEditCancel = () => {
    setEditValue(suggestion.suggestedName);
    setEditDescription(suggestion.details?.description || '');
    setEditSignificance(suggestion.details?.significance || '');
    setEditFieldType(suggestion.details?.fieldType || 'text');
    setIsEditing(false);
  };

  const enterEditMode = () => {
    setExpanded(true);
    setIsEditing(true);
  };

  const handleCardBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!isEditing) {
      return;
    }
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && containerRef.current?.contains(nextTarget)) {
      return;
    }
    handleEditConfirm();
  };

  const sourceLabelMap: Record<string, string> = {
    ai: 'AI',
    heuristic: '启发式',
    manual: '手动',
    'ai+heuristic': 'AI+启发式',
  };

  return (
    <div
      ref={containerRef}
      className={`suggestion-item ${suggestion.applied ? 'applied' : ''}`}
      onBlurCapture={handleCardBlur}
    >
      <div className="suggestion-header" onClick={() => setExpanded(!expanded)}>
        <div className="confidence-badge">
          {suggestion.confidence > 0.8 ? '🟢' : suggestion.confidence > 0.5 ? '🟡' : '🔴'}
          {Math.round(suggestion.confidence * 100)}%
        </div>

        <div className="suggestion-content" onDoubleClick={(event) => {
          event.stopPropagation();
          enterEditMode();
        }}>
          <span className="original">{suggestion.originalText}</span>
          <span className="arrow">→</span>
          {isEditing ? (
            <input
              type="text"
              className="edit-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleEditConfirm();
                } else if (e.key === 'Escape') {
                  handleEditCancel();
                }
              }}
              autoFocus
            />
          ) : (
            <span className="suggested">{suggestion.suggestedName}</span>
          )}
        </div>

        {suggestion.applied && <span className="applied-badge">已应用</span>}
        <button
          className="dismiss-btn"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
        >
          删除
        </button>
      </div>

      {/* 显示原文位置（格式化显示） */}
      <div className="suggestion-context">
        <span className="context-label">原文位置:</span>
        <span className="context-text position-format">{getPositionInfo(suggestion)}</span>
      </div>

      <div className="suggestion-meta-row">
        <span className={`suggestion-source-badge source-${suggestion.details?.source || 'heuristic'}`}>
          来源: {sourceLabelMap[suggestion.details?.source || 'heuristic'] || '未知'}
        </span>
        <span className="suggestion-field-type">
          类型: {suggestion.details?.fieldType || 'text'}
        </span>
      </div>

      {suggestion.details?.description && (
        <div className="suggestion-description">
          <span className="description-label">参数描述:</span>
          <span className="description-text">{suggestion.details.description}</span>
        </div>
      )}

      {/* 显示项目意义 */}
      {suggestion.details?.significance && (
        <div className="suggestion-significance">
          <span className="significance-label">用途说明:</span>
          <span className="significance-text">{suggestion.details.significance}</span>
        </div>
      )}

      {/* 显示上下文内容 */}
      {suggestion.details?.context && (
        <div className="context-snippet">
          <span className="snippet-label">上下文:</span>
          <span className="snippet-text">...{suggestion.details.context}...</span>
        </div>
      )}

      {expanded && (
        <div className="suggestion-details">
          <p>变量路径: <code>{suggestion.suggestedName}</code></p>
          <p>原始文本: <code>{suggestion.originalText}</code></p>
          <p>建议来源: <code>{sourceLabelMap[suggestion.details?.source || 'heuristic'] || '未知'}</code></p>
          {suggestion.details?.formatter && (
            <p>建议格式化器: <code>{suggestion.details.formatter}</code></p>
          )}

          <div className="suggestion-actions">
            {!isEditing ? (
              <>
                {!suggestion.applied && (
                  <button className="apply-btn" onClick={onApply}>
                    ✅ 应用
                  </button>
                )}
              </>
            ) : (
              <>
                <input
                  type="text"
                  className="edit-input"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="参数描述"
                />
                <input
                  type="text"
                  className="edit-input"
                  value={editSignificance}
                  onChange={(e) => setEditSignificance(e.target.value)}
                  placeholder="用途说明"
                />
                <select
                  className="edit-input"
                  value={editFieldType}
                  onChange={(e) => setEditFieldType(e.target.value)}
                >
                  <option value="text">text</option>
                  <option value="number">number</option>
                  <option value="date">date</option>
                  <option value="boolean">boolean</option>
                  <option value="percent">percent</option>
                  <option value="formula">formula</option>
                  <option value="loop">loop</option>
                </select>
                <button className="confirm-btn" onClick={handleEditConfirm}>
                  保存
                </button>
                <button className="cancel-btn" onClick={handleEditCancel}>
                  取消
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIIdentifyPanel;
