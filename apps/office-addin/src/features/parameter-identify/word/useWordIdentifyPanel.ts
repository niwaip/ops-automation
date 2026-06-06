import { useEffect, useMemo } from 'react';
import { createHostAdapter } from '../../../host/adapters';
import { useAppStore } from '../../../app/store';
import { useAIIdentifyPanel } from '../shared/useAIIdentifyPanel';
import { useParameterApply } from '../shared/useParameterApply';

export function useWordIdentifyPanel() {
  const store = useAppStore();
  const {
    isAnalyzing,
    suggestions,
    analysisError,
    analysisErrorDetails,
    debugLogs,
    apiBaseUrl,
    aiOrchestratorBaseUrl,
    aiOrchestratorAuthToken,
    analysisExecutor,
    setAnalysisExecutor,
    analysisThinkingEnabled,
    setAnalysisThinkingEnabled,
    addDebugLog,
    setSuggestions,
    setAnalysisError,
    setAnalyzing,
    showDebugPanel,
    setShowDebugPanel,
  } = store;

  const hostAdapter = useMemo(() => createHostAdapter('word'), []);
  const workflowState = useAIIdentifyPanel(hostAdapter, false);
  const applyState = useParameterApply(hostAdapter, false);

  useEffect(() => {
    if (analysisExecutor !== 'chat') {
      setAnalysisExecutor('chat');
    }
  }, [analysisExecutor, setAnalysisExecutor]);

  const analysisSourceLabelMap: Record<string, string> = {
    ai: 'AI',
    heuristic: '启发式',
    manual: '手动',
    'ai+heuristic': 'AI + 启发式',
    mixed: '混合',
    unknown: '未知',
  };

  const recentErrorLogs = useMemo(
    () =>
      debugLogs
        .filter((log) => {
          if (log.level !== 'error') return false;
          const text = `${log.message || ''}\n${log.details || ''}`.toLowerCase();
          return (
            text.includes('识别')
            || text.includes('分析')
            || text.includes('direct-ai-identify')
            || text.includes('status code 500')
            || text.includes('状态码')
          );
        })
        .slice(-3)
        .reverse(),
    [debugLogs]
  );

  return {
    storeState: {
      isAnalyzing,
      suggestions,
      analysisError,
      analysisErrorDetails,
      apiBaseUrl,
      aiOrchestratorBaseUrl,
      aiOrchestratorAuthToken,
      analysisExecutor,
      setAnalysisExecutor,
      analysisThinkingEnabled,
      setAnalysisThinkingEnabled,
      addDebugLog,
      setSuggestions,
      setAnalysisError,
      setAnalyzing,
      showDebugPanel,
      setShowDebugPanel,
    },
    workflowState,
    applyState,
    analysisSourceLabelMap,
    recentErrorLogs,
    previewInlineSupported: true,
    getDownloadLabel: () => '📥 下载Word',
  };
}
