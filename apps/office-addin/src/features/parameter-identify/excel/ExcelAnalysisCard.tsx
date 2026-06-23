import React from 'react';
import { type ExcelSheetPairState } from '../../../app/store';
import { AISuggestionItem } from '../../../shared/ui/AISuggestionItem';
import { ManualAddParamForm } from '../shared/ManualAddParamForm';
import type { AnalysisSummary } from '../shared/AIIdentifyPanel.helpers';

export const ExcelAnalysisCard: React.FC<{
  analysisThinkingEnabled: boolean;
  setAnalysisThinkingEnabled: (enabled: boolean) => void;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onAnalyzePair: (pairId: string) => void;
  excelAnalysisCollapsed: boolean;
  setExcelAnalysisCollapsed: (updater: (value: boolean) => boolean) => void;
  visibleExcelPairs: ExcelSheetPairState[];
  excelReferenceCardsCollapsed: boolean;
  setExcelReferenceCardsCollapsed: (updater: (value: boolean) => boolean) => void;
  onSetVisibleExcelPairsCompare: (compare: boolean) => void;
  toggleExcelSheetPairCompare: (id: string) => void;
  removeExcelSheetPair: (id: string) => void;
  analysisSummary: AnalysisSummary | null;
  collapsedPairDetails: Record<string, boolean>;
  togglePairDetailsCollapse: (pairIndex: number) => void;
  groupedSuggestions: Record<string, any[]>;
  applyState: any;
  onApplyComplete?: () => void;
}> = ({
  analysisThinkingEnabled,
  setAnalysisThinkingEnabled,
  isAnalyzing,
  onAnalyze,
  onAnalyzePair,
  excelAnalysisCollapsed,
  setExcelAnalysisCollapsed,
  visibleExcelPairs,
  excelReferenceCardsCollapsed,
  setExcelReferenceCardsCollapsed,
  onSetVisibleExcelPairsCompare,
  toggleExcelSheetPairCompare,
  removeExcelSheetPair,
  analysisSummary,
  groupedSuggestions,
  applyState,
  onApplyComplete,
}) => {
  return (
    <div className="excel-understanding-card excel-analysis-card">
      <div
        className="excel-understanding-header"
        onClick={() => setExcelAnalysisCollapsed((value) => !value)}
      >
        <div>
          <h3>参数识别</h3>
          <p>基于已勾选的对照组执行参数分析，输出变量与循环建议。</p>
        </div>
        <div className="excel-understanding-actions" onClick={(e) => e.stopPropagation()}>
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
            onClick={onAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <span className="analyzing-indicator">
                <span className="spinner"></span>
                <span className="loading-text">识别中...</span>
              </span>
            ) : (
              '识别'
            )}
          </button>

          <div
            className="header-actions"
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', gap: '8px' }}
          >
            <button
              className="apply-all-btn"
              onClick={(e) => {
                e.stopPropagation();
                void applyState.handleApplyAll(onApplyComplete);
              }}
              disabled={
                !applyState.suggestions ||
                applyState.suggestions.filter((s: any) => !s.applied).length === 0
              }
            >
              应用 (
              {applyState.suggestions
                ? applyState.suggestions.filter((s: any) => !s.applied).length
                : 0}
              )
            </button>
            <button
              className="apply-all-btn"
              onClick={(e) => {
                e.stopPropagation();
                void applyState.handleReapplyAll(onApplyComplete);
              }}
              disabled={
                !applyState.suggestions ||
                applyState.suggestions.filter((s: any) => s.applied).length === 0
              }
              style={{ backgroundColor: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db' }}
              title="重新应用所有已应用的参数"
            >
              重新应用
            </button>
          </div>
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
            <div
              className="excel-reference-card-group-header"
              onClick={() => setExcelReferenceCardsCollapsed((value) => !value)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <div>
                <div className="analysis-source-title">参考卡片组</div>
                <div className="excel-reference-card-group-meta">
                  共 {visibleExcelPairs.length} 组，参与比较{' '}
                  {visibleExcelPairs.filter((pair) => pair.compare).length} 组
                </div>
              </div>
              <div className="excel-understanding-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="sheet-action-btn"
                  onClick={() => onSetVisibleExcelPairsCompare(true)}
                  disabled={visibleExcelPairs.length === 0}
                >
                  全选
                </button>
                <button
                  className="sheet-action-btn"
                  onClick={() => onSetVisibleExcelPairsCompare(false)}
                  disabled={visibleExcelPairs.length === 0}
                >
                  清除
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
                  visibleExcelPairs.map((pair) => {
                    const pairAnalysis = analysisSummary?.pairResults.find(
                      (result) => result.pairIndex === pair.pairIndex
                    );
                    const sheetKey = pair.leftSheetName || '未归属 Sheet';

                    return (
                      <div
                        key={pair.id}
                        className={`sheet-pair-card excel-reference-card ${pair.compare ? '' : 'sheet-pair-card--skipped'}`}
                      >
                        <div
                          className="sheet-pair-card-header"
                          style={{ marginBottom: pairAnalysis ? '8px' : '0' }}
                        >
                          <div className="sheet-pair-card-title">
                            <label
                              className="sheet-pair-checkbox"
                              style={{ margin: 0, display: 'flex' }}
                            >
                              <input
                                type="checkbox"
                                checked={pair.compare}
                                onChange={() => toggleExcelSheetPairCompare(pair.id)}
                              />
                            </label>
                            <span className="sheet-pair-badge">对照组 {pair.pairIndex + 1}</span>
                            <span>{pair.leftSheetName || '缺少模板 sheet'}</span>
                            <span>↔</span>
                            <span>{pair.rightSheetName || '缺少数据 sheet'}</span>
                            {!pair.rightSheetName && (
                              <span
                                className="analysis-pair-result-badge neutral"
                                style={{ marginLeft: '8px' }}
                              >
                                草稿态
                              </span>
                            )}
                          </div>
                          <div className="sheet-pair-actions">
                            <button
                              className="sheet-action-btn"
                              onClick={() => onAnalyzePair(pair.id)}
                              disabled={isAnalyzing}
                            >
                              识别
                            </button>
                            <button
                              className="sheet-pair-danger-btn"
                              onClick={() => removeExcelSheetPair(pair.id)}
                            >
                              删除
                            </button>
                          </div>
                        </div>

                        {pairAnalysis && (
                          <div className="analysis-pair-result-card" style={{ marginTop: '8px' }}>
                            {(() => {
                              const pairStatus = !pairAnalysis.aiCallSucceeded
                                ? { label: 'AI 未返回', className: 'fallback' }
                                : pairAnalysis.suggestionCount > 0
                                  ? { label: 'AI 成功', className: 'success' }
                                  : { label: 'AI 成功但无建议', className: 'neutral' };
                              return (
                                <div className="analysis-pair-result-header">
                                  <div>
                                    <span
                                      className="analysis-pair-result-name"
                                      style={{ fontWeight: 600 }}
                                    >
                                      分析结果
                                    </span>
                                    <span
                                      className={`analysis-pair-result-badge ${pairStatus.className}`}
                                      style={{ marginLeft: '8px' }}
                                    >
                                      {pairStatus.label}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="analysis-pair-result-meta">
                              候选差异 {pairAnalysis.candidateCount} · 建议{' '}
                              {pairAnalysis.suggestionCount} ·{' '}
                              {pairAnalysis.loopDetected ? '含循环区域' : '单值为主'}
                            </div>
                            {pairAnalysis.error && (
                              <div className="analysis-pair-result-error">
                                失败原因: {pairAnalysis.error.message || '未知错误'}
                                {pairAnalysis.error.reason ? ` · ${pairAnalysis.error.reason}` : ''}
                                {pairAnalysis.error.status
                                  ? ` · HTTP ${pairAnalysis.error.status}`
                                  : ''}
                                {pairAnalysis.error.url ? ` · ${pairAnalysis.error.url}` : ''}
                              </div>
                            )}
                          </div>
                        )}

                        {groupedSuggestions &&
                          groupedSuggestions[sheetKey] &&
                          groupedSuggestions[sheetKey].length > 0 && (
                            <div
                              className="suggestion-group chapter-group"
                              style={{ marginTop: '16px' }}
                            >
                              <h4
                                className="group-title chapter-title"
                                onClick={() => applyState.toggleSuggestionGroupCollapse(sheetKey)}
                                style={{
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                  margin: 0,
                                  padding: '8px 12px',
                                  background: '#f8fafc',
                                  borderRadius: '6px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span className="chapter-icon">
                                    {applyState.getGroupIcon(sheetKey)}
                                  </span>
                                  <span className="chapter-name">{sheetKey}</span>
                                  <span className="count">
                                    ({groupedSuggestions[sheetKey].length})
                                  </span>
                                </div>
                                <div
                                  className="excel-understanding-actions"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ display: 'flex', gap: '6px' }}
                                >
                                  <button
                                    className="sheet-action-btn"
                                    onClick={() => onAnalyzePair(pair.id)}
                                    disabled={isAnalyzing}
                                  >
                                    重新识别
                                  </button>
                                  <button
                                    className="sheet-action-btn"
                                    onClick={() =>
                                      applyState.setActiveManualAddGroup(
                                        applyState.activeManualAddGroup === sheetKey
                                          ? null
                                          : sheetKey
                                      )
                                    }
                                  >
                                    {applyState.activeManualAddGroup === sheetKey
                                      ? '取消添加'
                                      : '添加参数'}
                                  </button>
                                  <button
                                    className="sheet-action-btn sheet-action-btn-primary"
                                    onClick={() => {
                                      void applyState.handleApplyGroup(sheetKey, onApplyComplete);
                                    }}
                                    disabled={
                                      groupedSuggestions[sheetKey].filter((s: any) => !s.applied)
                                        .length === 0
                                    }
                                  >
                                    应用 (
                                    {
                                      groupedSuggestions[sheetKey].filter((s: any) => !s.applied)
                                        .length
                                    }
                                    )
                                  </button>
                                  <button
                                    className="sheet-action-btn sheet-action-btn-primary"
                                    onClick={() => {
                                      void applyState.handleReapplyGroup(sheetKey, onApplyComplete);
                                    }}
                                    disabled={
                                      groupedSuggestions[sheetKey].filter((s: any) => s.applied)
                                        .length === 0
                                    }
                                    style={{
                                      backgroundColor: '#f3f4f6',
                                      color: '#4b5563',
                                      border: '1px solid #d1d5db',
                                    }}
                                    title="重新应用当前表已应用的参数"
                                  >
                                    重新应用
                                  </button>
                                </div>
                              </h4>

                              {!applyState.collapsedSuggestionGroups[sheetKey] && (
                                <div className="suggestion-list" style={{ marginTop: '8px' }}>
                                  {applyState.activeManualAddGroup === sheetKey && (
                                    <ManualAddParamForm
                                      applyState={applyState}
                                      targetGroupName={sheetKey}
                                    />
                                  )}
                                  {groupedSuggestions[sheetKey].map((suggestion: any) => (
                                    <AISuggestionItem
                                      key={suggestion.id}
                                      suggestion={suggestion}
                                      onApply={() => {
                                        void applyState.handleApplySingle(
                                          suggestion,
                                          onApplyComplete
                                        );
                                      }}
                                      onDismiss={() => applyState.dismissSuggestion(suggestion.id)}
                                      onUpdateName={(newName: string) =>
                                        applyState.updateSuggestionName(suggestion.id, newName)
                                      }
                                      onUpdateDetails={(details: any) =>
                                        applyState.updateSuggestionDetails(suggestion.id, details)
                                      }
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
