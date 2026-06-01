import { useEffect, useMemo } from 'react';
import { createHostAdapter } from '../../adapters';
import { useAppStore } from '../../taskpane/store';
import { useAIIdentifyPanel } from './useAIIdentifyPanel';
import { useParameterApply } from './useParameterApply';

export function useExcelIdentifyPanel() {
  const store = useAppStore();
  const {
    isAnalyzing,
    suggestions,
    analysisError,
    analysisErrorDetails,
    apiBaseUrl,
    excelSheetPairs,
    analysisExecutor,
    setAnalysisExecutor,
    analysisThinkingEnabled,
    setAnalysisThinkingEnabled,
    toggleExcelSheetPairCompare,
    removeExcelSheetPair,
    showDebugPanel,
    setShowDebugPanel,
  } = store;

  const hostAdapter = useMemo(() => createHostAdapter('excel'), []);
  const workflowState = useAIIdentifyPanel(hostAdapter, true);
  const applyState = useParameterApply(hostAdapter, true);

  const visibleExcelPairs = useMemo(
    () => excelSheetPairs.filter((pair) => !pair.hidden),
    [excelSheetPairs]
  );

  useEffect(() => {
    if (analysisExecutor !== 'chat') {
      setAnalysisExecutor('chat');
    }
  }, [analysisExecutor, setAnalysisExecutor]);

  const handleSetVisibleExcelPairsCompare = (compare: boolean) => {
    const visiblePairIds = new Set(visibleExcelPairs.map((pair) => pair.id));
    store.setExcelSheetPairs(
      excelSheetPairs.map((pair) => (
        visiblePairIds.has(pair.id)
          ? { ...pair, compare }
          : pair
      ))
    );
    store.addDebugLog('info', compare ? '已全选参考卡片组' : '已全部不选参考卡片组');
  };

  return {
    storeState: {
      isAnalyzing,
      suggestions,
      analysisError,
      analysisErrorDetails,
      apiBaseUrl,
      analysisThinkingEnabled,
      setAnalysisThinkingEnabled,
      toggleExcelSheetPairCompare,
      removeExcelSheetPair,
      showDebugPanel,
      setShowDebugPanel,
    },
    workflowState,
    applyState,
    visibleExcelPairs,
    handleSetVisibleExcelPairsCompare,
    getDownloadLabel: () => '📥 下载Excel',
  };
}
