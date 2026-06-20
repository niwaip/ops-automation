import { useState } from 'react';
import { analyzeDocumentWithAI } from '../services/index';
import { buildAnalysisSummary } from '../shared/AIIdentifyPanel.helpers';
import {
  buildCollapsedPairDetails,
  buildCollapsedSuggestionGroups,
  buildIdentifyDebugDetails,
  formatIdentifyError,
  shouldRetryIdentify,
} from '../shared/common/identify-workflow.shared';
import type {
  IdentifyWorkflowResult,
  WordIdentifyWorkflowOptions,
} from '../shared/common/identify-workflow.types';

export function useWordIdentifyWorkflow({
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
}: WordIdentifyWorkflowOptions): IdentifyWorkflowResult {
  const [analysisSummary, setAnalysisSummary] = useState<ReturnType<
    typeof buildAnalysisSummary
  > | null>(null);
  const [stagedSuggestions, setStagedSuggestions] = useState<typeof suggestions>([]);
  const [collapsedSuggestionGroups, setCollapsedSuggestionGroups] = useState<
    Record<string, boolean>
  >({});
  const [collapsedPairDetails, setCollapsedPairDetails] = useState<Record<string, boolean>>({});

  const runAnalyze = async (options?: { commitSuggestions?: boolean }) => {
    const commitSuggestions = options?.commitSuggestions ?? true;
    let retryCount = 0;
    const maxRetries = 1;

    setAnalyzing(true);
    setAnalysisError(null, undefined);
    setAnalysisSummary(null);

    addDebugLog(
      'info',
      '开始 AI 识别',
      `模板类型: ${selectedTemplateType}，执行器: ${analysisExecutor}`
    );

    try {
      while (retryCount <= maxRetries) {
        try {
          if (retryCount > 0) {
            addDebugLog('info', '开始自动重试参数分析', `这是第 ${retryCount} 次重试`);
          }

          const result = await analyzeDocumentWithAI(hostAdapter, {
            apiBaseUrl,
            templateType: selectedTemplateType,
            useMultiStage,
            analysisExecutor,
            thinking: retryCount > 0 ? true : analysisThinkingEnabled,
            aiOrchestratorBaseUrl,
            aiOrchestratorAuthToken,
            skill: aiSkillGuide,
          });

          const nextSummary = buildAnalysisSummary(result);
          const nextSuggestions = result.suggestions;

          setAnalysisSummary(nextSummary);
          setCollapsedSuggestionGroups(buildCollapsedSuggestionGroups(nextSuggestions, 'word'));
          setCollapsedPairDetails(buildCollapsedPairDetails(nextSummary));

          if (commitSuggestions) {
            setSuggestions(nextSuggestions);
            setStagedSuggestions([]);
          } else {
            setStagedSuggestions(nextSuggestions);
          }

          addDebugLog(
            'info',
            'AI 参数识别完成',
            buildIdentifyDebugDetails(nextSummary, result.contextAnalysis, nextSuggestions.length)
          );

          if (shouldRetryIdentify(nextSummary, nextSuggestions) && retryCount < maxRetries) {
            retryCount += 1;
            continue;
          }

          break;
        } catch (error: any) {
          const { errorMessage, errorDetails } = formatIdentifyError(error);
          addDebugLog('error', errorMessage, errorDetails);
          setAnalysisError(errorMessage, errorDetails);
          setShowErrorDetails(true);
          if (!commitSuggestions) {
            setStagedSuggestions([]);
          }
          throw error;
        }
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyze = async (options?: { commitSuggestions?: boolean }) => {
    try {
      await runAnalyze(options);
    } catch {
      // Error state is already propagated to the store.
    }
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
    handleAnalyzePair: async () => {},
    handleCommitStagedSuggestions,
    handleClearStagedSuggestions,
    collapsedSuggestionGroups,
    collapsedPairDetails,
    togglePairDetailsCollapse,
    toggleSuggestionGroupCollapse,
  };
}
