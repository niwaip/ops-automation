import React from 'react';
import type {
  CompareCacheStatus,
  CompareCandidateSectionLike,
  CompareHeadingLanguage,
  CompareResultLike,
} from './query.types';

interface StepStatus {
  compare: boolean;
  recognition: boolean;
}

interface WordQuerySectionProps {
  stepCollapsed: boolean;
  onToggleStep: () => void;
  stepStatus: StepStatus;
  sampleUploaded: boolean;
  selectedTemplateType: string;
  effectiveCompareHeadingLanguages: CompareHeadingLanguage[];
  onChangeDocumentType: (templateType: 'contract' | 'report') => void;
  onToggleHeadingLanguage: (language: CompareHeadingLanguage) => void;
  isComparing: boolean;
  isHighlightingCandidates: boolean;
  isClearingHighlights: boolean;
  onStartCompare: () => void;
  onHighlightCompareCandidates: () => void;
  onClearCompareHighlights: () => void;
  compareResult: CompareResultLike | null;
  compareSummaryCollapsed: boolean;
  onToggleCompareSummary: () => void;
  compareSectionsCollapsed: boolean;
  onToggleCompareSections: () => void;
  compareCacheStatus: CompareCacheStatus;
  compareCacheUpdatedAt: number | null;
  selectedCompareSectionKeys: string[];
  compareCandidateSections: CompareCandidateSectionLike[];
  selectedCompareSections: Record<string, boolean>;
  collapsedCompareSections: Record<string, boolean>;
  analysisThinkingEnabled: boolean;
  onChangeAnalysisThinkingEnabled: (enabled: boolean) => void;
  recognitionBlocked: boolean;
  isRecognizing: boolean;
  isUnderstanding: boolean;
  recognitionReady: boolean;
  totalSuggestionCount: number;
  pendingSuggestionCount: number;
  derivedPrimaryChapterCount: number;
  onSelectAllCompareSections: (selected: boolean) => void;
  onToggleCompareSectionSelection: (sectionKey: string) => void;
  onToggleCompareSectionCollapse: (sectionKey: string) => void;
  onStartRecognition: () => void;
  onApplyAll: () => void;
  getCompareDocumentTypeLabel: (templateType: string) => string;
  getCompareHeadingLanguageSummary: (languages: CompareHeadingLanguage[]) => string;
  renderCompareSectionCandidates: (section: CompareCandidateSectionLike) => React.ReactNode;
  renderCompareSectionIdentifyResult: (section: CompareCandidateSectionLike) => React.ReactNode;
  emptyIdentifyStateSlot?: React.ReactNode;
  followupSlot?: React.ReactNode;
}

export const WordQuerySection: React.FC<WordQuerySectionProps> = ({
  stepCollapsed,
  onToggleStep,
  stepStatus,
  sampleUploaded,
  selectedTemplateType,
  effectiveCompareHeadingLanguages,
  onChangeDocumentType,
  onToggleHeadingLanguage,
  isComparing,
  isHighlightingCandidates,
  isClearingHighlights,
  onStartCompare,
  onHighlightCompareCandidates,
  onClearCompareHighlights,
  compareResult,
  compareSummaryCollapsed,
  onToggleCompareSummary,
  compareSectionsCollapsed,
  onToggleCompareSections,
  compareCacheStatus,
  compareCacheUpdatedAt,
  selectedCompareSectionKeys,
  compareCandidateSections,
  selectedCompareSections,
  collapsedCompareSections,
  analysisThinkingEnabled,
  onChangeAnalysisThinkingEnabled,
  recognitionBlocked,
  isRecognizing,
  isUnderstanding,
  recognitionReady,
  totalSuggestionCount,
  pendingSuggestionCount,
  derivedPrimaryChapterCount,
  onSelectAllCompareSections,
  onToggleCompareSectionSelection,
  onToggleCompareSectionCollapse,
  onStartRecognition,
  onApplyAll,
  getCompareDocumentTypeLabel,
  getCompareHeadingLanguageSummary,
  renderCompareSectionCandidates,
  renderCompareSectionIdentifyResult,
  emptyIdentifyStateSlot,
  followupSlot,
}) => (
  <section className={`word-step-card ${!sampleUploaded ? 'is-disabled' : ''}`}>
    <button
      type="button"
      className="word-step-card-header word-step-card-toggle"
      onClick={onToggleStep}
    >
      <div>
        <div className="word-step-card-index">步骤 2</div>
        <h3>参数查询、识别与验证</h3>
      </div>
      <div className="word-step-card-toggle-meta">
        {stepStatus.compare && <span className="word-step-status success">候选池已生成</span>}
        {stepStatus.recognition && <span className="word-step-status success">参数已识别</span>}
        <span>{stepCollapsed ? '展开' : '收起'}</span>
      </div>
    </button>

    {!stepCollapsed && (
      <>
        {!sampleUploaded && (
          <div className="word-step-placeholder">
            请先完成第一步上传参考示例文件，第二步才会解锁。
          </div>
        )}

        {sampleUploaded && (
          <>
            <div className="word-compare-toolbar-card">
              <div className="word-compare-toolbar-header">
                <div className="word-compare-toolbar-copy">
                  <div className="analysis-source-title">参数查询设置</div>
                  <div className="word-compare-toolbar-meta">
                    选择合同类型与标题语言，命中本地缓存时会自动回填候选章节。
                  </div>
                </div>
                <div className="excel-understanding-actions word-compare-toolbar-actions">
                  <button
                    className="sheet-action-btn sheet-action-btn-primary"
                    onClick={onStartCompare}
                    disabled={isComparing || !sampleUploaded}
                  >
                    {isComparing ? (
                      <span className="analyzing-indicator">
                        <span className="spinner"></span>
                        <span className="loading-text">查询</span>
                      </span>
                    ) : '查询'}
                  </button>
                  <button
                    type="button"
                    className="sheet-action-btn"
                    onClick={onHighlightCompareCandidates}
                    disabled={!compareResult || isComparing || isHighlightingCandidates}
                  >
                    {isHighlightingCandidates ? '高亮中...' : '高亮'}
                  </button>
                  <button
                    type="button"
                    className="sheet-action-btn"
                    onClick={onClearCompareHighlights}
                    disabled={isClearingHighlights}
                  >
                    {isClearingHighlights ? '清除中...' : '清除高亮'}
                  </button>
                </div>
              </div>
              <div className="word-understanding-config-grid word-understanding-config-grid-compact">
                <div className="template-type-selector word-compact-selector">
                  <label>类型</label>
                  <div className="word-language-mode-list">
                    <label className={`word-language-mode ${selectedTemplateType === 'contract' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="word-compare-document-type"
                        checked={selectedTemplateType === 'contract'}
                        onChange={() => onChangeDocumentType('contract')}
                      />
                      合同
                    </label>
                    <label className={`word-language-mode ${selectedTemplateType !== 'contract' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="word-compare-document-type"
                        checked={selectedTemplateType !== 'contract'}
                        onChange={() => onChangeDocumentType('report')}
                      />
                      其他
                    </label>
                  </div>
                </div>
                <div className="template-type-selector word-compact-selector">
                  <label>语言</label>
                  <div className="word-language-mode-list">
                    <label className={`word-language-mode ${effectiveCompareHeadingLanguages.includes('zh') ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={effectiveCompareHeadingLanguages.includes('zh')}
                        onChange={() => onToggleHeadingLanguage('zh')}
                      />
                      中文
                    </label>
                    <label className={`word-language-mode ${effectiveCompareHeadingLanguages.includes('ja') ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={effectiveCompareHeadingLanguages.includes('ja')}
                        onChange={() => onToggleHeadingLanguage('ja')}
                      />
                      日语
                    </label>
                    <label className={`word-language-mode ${effectiveCompareHeadingLanguages.includes('en') ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={effectiveCompareHeadingLanguages.includes('en')}
                        onChange={() => onToggleHeadingLanguage('en')}
                      />
                      英语
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {compareResult && (
              <>
                <div className="analysis-source-card analysis-source-card-compact word-compare-summary-card">
                  <div
                    className="excel-reference-card-group-header"
                    onClick={onToggleCompareSummary}
                    style={{ userSelect: 'none' }}
                  >
                    <div>
                      <div className="analysis-source-title">查询摘要</div>
                      <div className="excel-reference-card-group-meta">
                        本次共生成 {compareResult.compareSummary.candidateCount} 个候选字段，覆盖 {compareResult.compareSummary.sectionCount} 个章节区域。
                      </div>
                    </div>
                    <span className="analysis-source-badge source-ai">查询结果</span>
                  </div>
                  {!compareSummaryCollapsed && (
                    <>
                      <div className="word-summary-paragraph">
                        本次共生成 {compareResult.compareSummary.candidateCount} 个候选字段，覆盖 {compareResult.compareSummary.sectionCount} 个章节区域。
                      </div>
                      <div className="word-tag-list word-tag-list-compact">
                        <span className="word-tag">类型: {getCompareDocumentTypeLabel(selectedTemplateType)}</span>
                        <span className="word-tag">语言: {getCompareHeadingLanguageSummary(effectiveCompareHeadingLanguages)}</span>
                        {compareCacheStatus && (
                          <span className={`word-tag ${compareCacheStatus === 'hit' ? 'success' : ''}`}>
                            {compareCacheStatus === 'hit' ? '候选缓存命中' : '候选已缓存'}
                          </span>
                        )}
                        {compareCacheUpdatedAt && (
                          <span className="word-tag">缓存于 {new Date(compareCacheUpdatedAt).toLocaleString()}</span>
                        )}
                        <span className="word-tag">queryId: {compareResult.compareId}</span>
                        <span className="word-tag success">候选字段 {compareResult.compareSummary.candidateCount}</span>
                        <span className="word-tag">章节 {compareResult.compareSummary.sectionCount}</span>
                        {derivedPrimaryChapterCount > 0 && (
                          <span className="word-tag success">拆分章节 {derivedPrimaryChapterCount}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="analysis-source-card">
                  <div
                    className="excel-reference-card-group-header"
                    onClick={onToggleCompareSections}
                    style={{ userSelect: 'none' }}
                  >
                    <div>
                      <div className="analysis-source-title">候选章节</div>
                      <div className="excel-reference-card-group-meta">
                        {derivedPrimaryChapterCount > 0 ? '按章节候选参数' : '候选池预览'}
                        {compareCandidateSections.length > 0 ? ` · 已选章节 ${selectedCompareSectionKeys.length} / ${compareCandidateSections.length}` : ''}
                      </div>
                    </div>
                    <div className="excel-understanding-actions" onClick={(event) => event.stopPropagation()}>
                      {compareCandidateSections.length > 0 && (
                        <>
                          <button
                            type="button"
                            className="sheet-action-btn"
                            onClick={() => onSelectAllCompareSections(true)}
                          >
                            全选
                          </button>
                          <button
                            type="button"
                            className="sheet-action-btn"
                            onClick={() => onSelectAllCompareSections(false)}
                          >
                            清空
                          </button>
                          <label className="checkbox-label excel-analysis-chip">
                            <input
                              type="checkbox"
                              checked={analysisThinkingEnabled}
                              onChange={(event) => onChangeAnalysisThinkingEnabled(event.target.checked)}
                            />
                            <span>think</span>
                          </label>
                          <button
                            type="button"
                            className="sheet-action-btn sheet-action-btn-primary word-main-action-btn"
                            onClick={onStartRecognition}
                            disabled={recognitionBlocked || isRecognizing || isUnderstanding}
                          >
                            {isRecognizing ? '生成中...' : recognitionReady ? '重新生成参数' : '生成参数'}
                          </button>
                          <button
                            type="button"
                            className="sheet-action-btn"
                            onClick={onApplyAll}
                            disabled={totalSuggestionCount === 0}
                            title={pendingSuggestionCount > 0 ? '一键应用全部未应用的参数' : '当前无待应用参数，将重新应用全部参数'}
                          >
                            全部应用 {totalSuggestionCount > 0 ? `(${pendingSuggestionCount > 0 ? pendingSuggestionCount : totalSuggestionCount})` : ''}
                          </button>
                        </>
                      )}
                      <span className="analysis-source-badge source-ai">候选池</span>
                    </div>
                  </div>
                  {!compareSectionsCollapsed && (
                    <div className="analysis-pair-results">
                      <div className="word-compare-section-list">
                        {compareCandidateSections.map((section) => (
                          <div
                            key={section.sectionKey}
                            className={`word-compare-section-card ${(selectedCompareSections[section.sectionKey] ?? true) ? '' : 'is-unselected'}`}
                          >
                            <div
                              className="word-highlight-card-header"
                              style={{ gap: 12 }}
                            >
                              <div
                                className="word-highlight-field-title word-compare-section-title-row"
                                style={{ cursor: 'pointer', flex: 1 }}
                                onClick={() => onToggleCompareSectionCollapse(section.sectionKey)}
                              >
                                <label
                                  className="sheet-pair-checkbox word-compare-section-checkbox"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedCompareSections[section.sectionKey] ?? true}
                                    onChange={() => onToggleCompareSectionSelection(section.sectionKey)}
                                  />
                                </label>
                                <div className="word-compare-section-title-text">
                                  <strong>{section.sectionTitle}</strong>
                                  <span className="word-compare-section-count">候选 {section.candidates.length}</span>
                                </div>
                              </div>
                              <div className="analysis-pair-result-meta">
                                {section.isAttachment ? '附件 · ' : ''}
                                {selectedCompareSections[section.sectionKey] ?? true ? '已选 · ' : '未选 · '}
                                <button
                                  type="button"
                                  className="word-summary-collapse-btn"
                                  onClick={() => onToggleCompareSectionCollapse(section.sectionKey)}
                                >
                                  {collapsedCompareSections[section.sectionKey] ?? true ? '展开' : '收起'}
                                </button>
                              </div>
                            </div>
                            {!(collapsedCompareSections[section.sectionKey] ?? true) && renderCompareSectionCandidates(section)}
                            {(selectedCompareSections[section.sectionKey] ?? true) && renderCompareSectionIdentifyResult(section)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {compareResult.compareSummary.warnings.length > 0 && (
                    <div className="word-step-note warning">
                      {compareResult.compareSummary.warnings.join(' | ')}
                    </div>
                  )}
                </div>

                {emptyIdentifyStateSlot}
                {followupSlot}
              </>
            )}
          </>
        )}
      </>
    )}
  </section>
);
