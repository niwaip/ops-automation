import { useState } from 'react';
import { analyzeDocumentWithAI } from '../services/index';
import { buildAnalysisSummary, mergeExcelSuggestionsByPairResult } from '../shared/AIIdentifyPanel.helpers';
import {
  buildCollapsedPairDetails,
  buildCollapsedSuggestionGroups,
  buildIdentifyDebugDetails,
  formatIdentifyError,
  shouldRetryIdentify,
} from '../shared/common/identify-workflow.shared';
import type {
  ExcelIdentifyWorkflowOptions,
  IdentifyWorkflowResult,
} from '../shared/common/identify-workflow.types';

export function useExcelIdentifyWorkflow({
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
  analysisThinkingEnabled,
  aiSkillGuide,
  excelSheetPairs,
  setExcelSheetPairs,
  excelWorkbookUnderstanding,
}: ExcelIdentifyWorkflowOptions): IdentifyWorkflowResult {
  const [analysisSummary, setAnalysisSummary] = useState<ReturnType<typeof buildAnalysisSummary> | null>(null);
  const [stagedSuggestions, setStagedSuggestions] = useState<typeof suggestions>([]);
  const [collapsedSuggestionGroups, setCollapsedSuggestionGroups] = useState<Record<string, boolean>>({});
  const [collapsedPairDetails, setCollapsedPairDetails] = useState<Record<string, boolean>>({});

  const runAnalyze = async (targetPairId?: string) => {
    const originalPairs = excelSheetPairs.map((pair) => ({ ...pair }));
    let retryCount = 0;
    const maxRetries = 1;

    setAnalyzing(true);
    setAnalysisError(null, undefined);
    setAnalysisSummary(null);

    if (targetPairId) {
      setExcelSheetPairs(
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

    addDebugLog('info', '开始 AI 识别', '模板类型: contract，执行器: chat（Excel 固定）');

    try {
      while (retryCount <= maxRetries) {
        try {
          if (retryCount > 0) {
            addDebugLog('info', '开始自动重试参数分析', `这是第 ${retryCount} 次重试`);
          }

          const result = await analyzeDocumentWithAI(hostAdapter, {
            apiBaseUrl,
            templateType: 'contract',
            useMultiStage: false,
            analysisExecutor: 'chat',
            thinking: retryCount > 0 ? true : analysisThinkingEnabled,
            aiOrchestratorBaseUrl,
            aiOrchestratorAuthToken,
            skill: aiSkillGuide,
            excelGlobalUnderstandingCache: excelWorkbookUnderstanding.summary
              ? {
                  summary: excelWorkbookUnderstanding.summary,
                  promptRequestText: excelWorkbookUnderstanding.promptRequestText,
                  promptDebugSummary: excelWorkbookUnderstanding.promptDebugSummary,
                  rawAiResponse: excelWorkbookUnderstanding.rawAiResponse,
                }
              : undefined,
          });

          const nextSummary = buildAnalysisSummary(result);
          const mergedSuggestions = mergeExcelSuggestionsByPairResult(suggestions, result.suggestions, nextSummary);

          setAnalysisSummary(nextSummary);
          setSuggestions(mergedSuggestions);
          setStagedSuggestions([]);
          setCollapsedSuggestionGroups(buildCollapsedSuggestionGroups(mergedSuggestions, 'excel'));
          setCollapsedPairDetails(buildCollapsedPairDetails(nextSummary));

          addDebugLog(
            'info',
            'AI 参数识别完成',
            buildIdentifyDebugDetails(nextSummary, result.contextAnalysis, mergedSuggestions.length)
          );

          if (shouldRetryIdentify(nextSummary, mergedSuggestions) && retryCount < maxRetries) {
            retryCount += 1;
            continue;
          }

          break;
        } catch (error: any) {
          const { errorMessage, errorDetails } = formatIdentifyError(error);
          addDebugLog('error', errorMessage, errorDetails);
          setAnalysisError(errorMessage, errorDetails);
          setShowErrorDetails(true);
          throw error;
        }
      }
    } finally {
      if (targetPairId) {
        setExcelSheetPairs(originalPairs);
      }
      setAnalyzing(false);
    }
  };

  const handleAnalyze = async () => {
    try {
      await runAnalyze();
    } catch {
      // Error state is already propagated to the store.
    }
  };

  const handleAnalyzePair = async (pairId: string) => {
    try {
      await runAnalyze(pairId);
    } catch {
      // Error state is already propagated to the store.
    }
  };

  const handleCommitStagedSuggestions = (): boolean => false;

  const handleClearStagedSuggestions = () => {
    setStagedSuggestions([]);
  };

  const togglePairDetailsCollapse = (pairIndex: number) => {
    setCollapsedPairDetails((current) => ({
      ...current,
      [pairIndex]: current[pairIndex] === undefined ? false : !current[pairIndex],
    }));
  };

  const toggleSuggestionGroupCollapse = (groupName: string) => {
    setCollapsedSuggestionGroups((current) => ({
      ...current,
      [groupName]: !current[groupName],
    }));
  };

  return {
    analysisSummary,
    stagedSuggestions,
    handleAnalyze,
    handleAnalyzePair,
    handleCommitStagedSuggestions,
    handleClearStagedSuggestions,
    collapsedSuggestionGroups,
    collapsedPairDetails,
    togglePairDetailsCollapse,
    toggleSuggestionGroupCollapse,
  };
}
