/**
 * AI 识别面板组件
 * 显示 AI 分析结果和建议，支持一键应用或部分应用
 * 包含详细错误显示和调试日志功能
 */

import React, { useMemo, useEffect } from 'react';
import { useAppStore } from '../taskpane/store';
import { createHostAdapter } from '../adapters';

import { ExcelAnalysisCard } from './ExcelAnalysisCard';
import { AnalysisSourceCard } from './AnalysisSourceCard';
import { DraftWorkflowSection } from './AIIdentifyPanel/DraftWorkflowSection';
import { VerifySaveSection } from './AIIdentifyPanel/VerifySaveSection';
import { useAIIdentifyPanel } from './AIIdentifyPanel/useAIIdentifyPanel';
import { useParameterApply } from './AIIdentifyPanel/useParameterApply';

interface Props {
  onApplyComplete?: () => void;
}

export const AIIdentifyPanel: React.FC<Props> = ({ onApplyComplete }) => {
  const store = useAppStore();
  const {
    officeType,
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

  const hostAdapter = useMemo(() => createHostAdapter(officeType), [officeType]);
  const isExcelMode = officeType === 'excel';
  const previewInlineSupported = officeType === 'word';

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

  const {
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
    draftInfo,
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

    collapsedPairDetails,
    togglePairDetailsCollapse,
  } = useAIIdentifyPanel(hostAdapter, isExcelMode);

  const applyState = useParameterApply(hostAdapter, isExcelMode);

  const [excelAnalysisCollapsed, setExcelAnalysisCollapsed] = React.useState(false);
  const [excelReferenceCardsCollapsed, setExcelReferenceCardsCollapsed] = React.useState(false);
  const [draftWorkflowCollapsed, setDraftWorkflowCollapsed] = React.useState(false);
  const [guidePreviewCollapsed, setGuidePreviewCollapsed] = React.useState(true);
  const [verifySaveCollapsed, setVerifySaveCollapsed] = React.useState(false);

  const visibleExcelPairs = useMemo(
    () => excelSheetPairs.filter((pair) => !pair.hidden),
    [excelSheetPairs]
  );

  useEffect(() => {
    if (isExcelMode && analysisExecutor !== 'chat') {
      setAnalysisExecutor('chat');
    }
  }, [analysisExecutor, isExcelMode, setAnalysisExecutor]);

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
        <ExcelAnalysisCard
            analysisThinkingEnabled={analysisThinkingEnabled}
            setAnalysisThinkingEnabled={setAnalysisThinkingEnabled}
            isAnalyzing={isAnalyzing}
            onAnalyze={handleAnalyze}
            onAnalyzePair={handleAnalyzePair}
            excelAnalysisCollapsed={excelAnalysisCollapsed}
            setExcelAnalysisCollapsed={setExcelAnalysisCollapsed}
            visibleExcelPairs={visibleExcelPairs}
            excelReferenceCardsCollapsed={excelReferenceCardsCollapsed}
            setExcelReferenceCardsCollapsed={setExcelReferenceCardsCollapsed}
            onSetVisibleExcelPairsCompare={handleSetVisibleExcelPairsCompare}
            toggleExcelSheetPairCompare={toggleExcelSheetPairCompare}

            removeExcelSheetPair={removeExcelSheetPair}
            analysisSummary={analysisSummary}
            collapsedPairDetails={collapsedPairDetails}
            togglePairDetailsCollapse={togglePairDetailsCollapse}
            groupedSuggestions={applyState.groupedSuggestions}
            applyState={applyState}
            onApplyComplete={onApplyComplete}
          />
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

      {analysisSummary && !isExcelMode && (
        <AnalysisSourceCard
          analysisSummary={analysisSummary}
          isExcelMode={isExcelMode}
          analysisSourceLabelMap={analysisSourceLabelMap}
        />
      )}

      {/* 已经移除了 ParameterApplySection */}

      <DraftWorkflowSection
        suggestions={suggestions}
        isAnalyzing={isAnalyzing}
        aiSkillGuide={aiSkillGuide}
        draftId={draftId}
        draftInfo={draftInfo}
        draftWorkflowNotice={draftWorkflowNotice}
        isGeneratingGuide={isGeneratingGuide}
        isVerifying={isVerifying}
        isSavingDraft={isSavingDraft}
        draftWorkflowCollapsed={draftWorkflowCollapsed}
        guidePreviewCollapsed={guidePreviewCollapsed}
        setDraftWorkflowCollapsed={setDraftWorkflowCollapsed}
        setGuidePreviewCollapsed={setGuidePreviewCollapsed}
        handleGenerateAISkillGuide={handleGenerateAISkillGuide}
        handleVerifyTemplate={handleVerifyTemplate}
        handleSaveDraft={handleSaveDraft}
        handleLoadDraft={handleLoadDraft}
        handleClearDraft={handleClearDraft}
      />

      {(aiSkillGuide || aiGeneratedData || previewResult || draftId || saveResult) && (
        <VerifySaveSection
          aiSkillGuide={aiSkillGuide}
          aiGeneratedData={aiGeneratedData}
          previewResult={previewResult}
          draftId={draftId}
          saveResult={saveResult}
          verifySaveCollapsed={verifySaveCollapsed}
          setVerifySaveCollapsed={setVerifySaveCollapsed}
          isGeneratingParams={isGeneratingParams}
          aiDescription={aiDescription}
          handleAiDescriptionChange={handleAiDescriptionChange}
          handleGenerateParameters={handleGenerateParameters}
          aiGenerateResult={aiGenerateResult}
          isPreviewing={isPreviewing}
          handlePreviewWithAIParams={handlePreviewWithAIParams}
          previewInlineSupported={previewInlineSupported}
          apiBaseUrl={apiBaseUrl}
          getDownloadLabel={getDownloadLabel}
          templateName={templateName}
          setTemplateName={setTemplateName}
          selectedTemplateType={selectedTemplateType}
          isSaving={isSaving}
          handleSaveTemplateAndGuide={handleSaveTemplateAndGuide}
        />
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

export default AIIdentifyPanel;
