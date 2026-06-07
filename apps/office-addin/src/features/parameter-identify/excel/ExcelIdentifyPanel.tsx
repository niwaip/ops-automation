import React, { useState } from 'react';
import { ExcelAnalysisCard } from './ExcelAnalysisCard';
import { DraftWorkflowSection } from '../../draft/shared';
import { VerifySaveSection } from '../../publish/shared';
import { useExcelIdentifyPanel } from './useExcelIdentifyPanel';

interface Props {
  onApplyComplete?: () => void;
}

export const ExcelIdentifyPanel: React.FC<Props> = ({ onApplyComplete }) => {
  const {
    storeState,
    workflowState,
    applyState,
    visibleExcelPairs,
    handleSetVisibleExcelPairsCompare,
    getDownloadLabel,
  } = useExcelIdentifyPanel();

  const {
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
  } = storeState;

  const {
    showErrorDetails,
    setShowErrorDetails,
    analysisSummary,
    handleAnalyze,
    handleAnalyzePair,
    aiSkillGuide,
    isGeneratingGuide,
    isVerifying,
    draftId,
    draftInfo,
    latestBackendDraftInfo,
    templateAssetDraftInfo,
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
    handleAiDescriptionChange,
    handleGenerateParameters,
    handlePreviewWithAIParams,
    handleSaveTemplateAndGuide,
    collapsedPairDetails,
    togglePairDetailsCollapse,
  } = workflowState;

  const [excelAnalysisCollapsed, setExcelAnalysisCollapsed] = useState(false);
  const [excelReferenceCardsCollapsed, setExcelReferenceCardsCollapsed] = useState(false);
  const [draftWorkflowCollapsed, setDraftWorkflowCollapsed] = useState(false);
  const [guidePreviewCollapsed, setGuidePreviewCollapsed] = useState(true);
  const [verifySaveCollapsed, setVerifySaveCollapsed] = useState(false);

  return (
    <div className="ai-identify-panel excel-identify-panel">
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

      <DraftWorkflowSection
        suggestions={suggestions}
        isAnalyzing={isAnalyzing}
        aiSkillGuide={aiSkillGuide}
        draftId={draftId}
        draftInfo={draftInfo}
        latestBackendDraftInfo={latestBackendDraftInfo}
        templateAssetDraftInfo={templateAssetDraftInfo}
        templateAssetNotice={templateAssetNotice}
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
          suggestions={suggestions}
          aiSkillGuide={aiSkillGuide}
          aiGeneratedData={aiGeneratedData}
          previewResult={previewResult}
          draftId={draftId}
          saveResult={saveResult}
          verifySaveCollapsed={verifySaveCollapsed}
          setVerifySaveCollapsed={setVerifySaveCollapsed}
          isGeneratingParams={isGeneratingParams}
          analysisThinkingEnabled={analysisThinkingEnabled}
          setAnalysisThinkingEnabled={setAnalysisThinkingEnabled}
          aiDescription={aiDescription}
          handleAiDescriptionChange={handleAiDescriptionChange}
          handleGenerateParameters={handleGenerateParameters}
          aiGenerateResult={aiGenerateResult}
          isPreviewing={isPreviewing}
          handlePreviewWithAIParams={handlePreviewWithAIParams}
          previewInlineSupported={false}
          apiBaseUrl={apiBaseUrl}
          getDownloadLabel={getDownloadLabel}
          templateName={templateName}
          setTemplateName={setTemplateName}
          selectedTemplateType="contract"
          isSaving={isSaving}
          handleSaveTemplateAndGuide={handleSaveTemplateAndGuide}
        />
      )}

      <button
        className="debug-toggle-btn"
        onClick={() => setShowDebugPanel(!showDebugPanel)}
      >
        {showDebugPanel ? '隐藏日志' : '显示日志'}
      </button>

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

export default ExcelIdentifyPanel;
