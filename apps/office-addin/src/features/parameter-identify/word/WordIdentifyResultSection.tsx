import React from 'react';
import { AISuggestion } from '../../../app/store';
import { ManualAddParamForm } from '../shared/ManualAddParamForm';
import type { CompareCandidateSectionLike } from '../../parameter-query/word/query.types';

interface WordSectionGenerationResultLike {
  error?: {
    message?: string;
  };
  qualityIssues?: string[];
}

interface SuggestionGroupSummary {
  averageConfidence: number;
  pendingReviewCount: number;
  highRiskCount: number;
}

interface SuggestionDisplayGroup {
  key: string;
  type: 'pair' | 'single';
  suggestions: AISuggestion[];
  pairPath?: string;
}

interface WordIdentifyResultSectionProps {
  section: CompareCandidateSectionLike;
  sectionResult?: WordSectionGenerationResultLike;
  sectionSuggestions: AISuggestion[];
  sectionSuggestionGroups: SuggestionDisplayGroup[];
  recognitionReady: boolean;
  sectionCollapsed: boolean;
  onToggleCollapse: () => void;
  groupName: string;
  groupSummary: SuggestionGroupSummary | null;
  pendingCount: number;
  appliedCount: number;
  applyState: any;
  onApplyGroup: () => void;
  onReapplyGroup: () => void;
  renderSuggestionCard: (suggestion: AISuggestion) => React.ReactNode;
  formatConfidence: (confidence: number) => string;
}

export const WordIdentifyResultSection: React.FC<WordIdentifyResultSectionProps> = ({
  section,
  sectionResult,
  sectionSuggestions,
  sectionSuggestionGroups,
  recognitionReady,
  sectionCollapsed,
  onToggleCollapse,
  groupName,
  groupSummary,
  pendingCount,
  appliedCount,
  applyState,
  onApplyGroup,
  onReapplyGroup,
  renderSuggestionCard,
  formatConfidence,
}) => {
  if (!sectionResult && !recognitionReady) {
    return null;
  }

  return (
    <div className="analysis-source-card analysis-source-card-compact" style={{ marginTop: 12 }}>
      <button
        type="button"
        className="analysis-source-header word-summary-collapse-btn"
        style={{ width: '100%', border: 'none', background: 'transparent' }}
        onClick={onToggleCollapse}
      >
        <div className="analysis-source-title">生成参数</div>
        <div className="word-step-card-toggle-meta">
          <span className="analysis-source-badge source-ai">章节结果</span>
          <span>{sectionCollapsed ? '展开' : '收起'}</span>
        </div>
      </button>
      <div className="word-tag-list word-tag-list-compact">
        <span className="word-tag">章节 {section.sectionTitle}</span>
        <span className="word-tag">候选参数 {section.candidates.length}</span>
        {sectionResult && (
          <>
            <span
              className={`word-tag ${sectionResult.error ? 'risk-high' : sectionSuggestions.length > 0 ? 'success' : 'warning'}`}
            >
              生成参数 {sectionSuggestions.length}
            </span>
            {sectionResult.qualityIssues && sectionResult.qualityIssues.length > 0 && (
              <span className="word-tag warning">
                质量提示 {sectionResult.qualityIssues.length}
              </span>
            )}
          </>
        )}
        {groupSummary && (
          <>
            <span className="word-tag">
              平均置信度 {formatConfidence(groupSummary.averageConfidence)}
            </span>
            <span className="word-tag warning">待确认 {groupSummary.pendingReviewCount}</span>
            <span className="word-tag risk-high">高风险 {groupSummary.highRiskCount}</span>
          </>
        )}
      </div>
      {sectionResult?.error?.message && (
        <div className="word-status-summary-item warning">
          当前章节生成失败: {sectionResult.error.message}
        </div>
      )}
      {sectionResult?.qualityIssues &&
        sectionResult.qualityIssues.length > 0 &&
        !sectionResult.error?.message && (
          <div className="word-status-summary-item warning">
            {sectionResult.qualityIssues.join(' | ')}
          </div>
        )}
      {sectionCollapsed ? (
        <div className="word-step-placeholder">
          当前章节参数已折叠，点击“展开”查看生成参数与应用操作。
        </div>
      ) : !sectionResult ? (
        <div className="word-step-placeholder">
          点击“生成参数”后，这里会直接展示当前章节的生成参数值。
        </div>
      ) : sectionSuggestions.length === 0 ? (
        <div className="word-step-placeholder">当前章节还没有可展示的生成参数值。</div>
      ) : (
        <>
          <div className="excel-understanding-actions" style={{ margin: '12px 0' }}>
            <button
              className="sheet-action-btn"
              onClick={() =>
                applyState.setActiveManualAddGroup(
                  applyState.activeManualAddGroup === groupName ? null : groupName
                )
              }
            >
              {applyState.activeManualAddGroup === groupName ? '取消添加' : '添加参数'}
            </button>
            <button
              className="sheet-action-btn sheet-action-btn-primary"
              onClick={onApplyGroup}
              disabled={pendingCount === 0}
            >
              应用 ({pendingCount})
            </button>
            <button
              className="sheet-action-btn"
              onClick={onReapplyGroup}
              disabled={appliedCount === 0}
            >
              重新应用
            </button>
          </div>
          {applyState.activeManualAddGroup === groupName && (
            <ManualAddParamForm applyState={applyState} targetGroupName={groupName} />
          )}
          <div className="suggestion-list">
            {sectionSuggestionGroups.map((group) =>
              group.type === 'pair' ? (
                <div
                  key={group.key}
                  style={{
                    border: '1px dashed #cbd5e1',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 12,
                    background: '#f8fafc',
                  }}
                >
                  <div className="word-tag-list word-tag-list-compact" style={{ marginBottom: 12 }}>
                    <span className="word-tag">双语成对显示</span>
                    {group.pairPath && <span className="word-tag">{group.pairPath}</span>}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: 12,
                    }}
                  >
                    {group.suggestions.map((suggestion) => renderSuggestionCard(suggestion))}
                  </div>
                </div>
              ) : (
                <React.Fragment key={group.key}>
                  {renderSuggestionCard(group.suggestions[0])}
                </React.Fragment>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
};
