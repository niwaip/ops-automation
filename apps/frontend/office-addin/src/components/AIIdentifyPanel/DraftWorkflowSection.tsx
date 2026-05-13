import React from 'react';
import { AISuggestion } from '../../taskpane/store';

interface DraftWorkflowSectionProps {
  suggestions: AISuggestion[];
  isAnalyzing: boolean;
  aiSkillGuide: {
    id: string;
    parameters?: any[];
    skillGuideMarkdown?: string;
  } | null;
  draftId: string | null;
  draftWorkflowNotice: { type: 'success' | 'error' | 'info'; message: string; lines?: string[] } | null;
  isGeneratingGuide: boolean;
  isVerifying: boolean;
  isSavingDraft: boolean;
  draftWorkflowCollapsed: boolean;
  guidePreviewCollapsed: boolean;
  setDraftWorkflowCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  setGuidePreviewCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  handleGenerateAISkillGuide: () => void;
  handleVerifyTemplate: () => void;
  handleSaveDraft: () => void;
  handleLoadDraft: () => void;
  handleClearDraft: () => void;
}

export const DraftWorkflowSection: React.FC<DraftWorkflowSectionProps> = ({
  suggestions,
  isAnalyzing,
  aiSkillGuide,
  draftId,
  draftWorkflowNotice,
  isGeneratingGuide,
  isVerifying,
  isSavingDraft,
  draftWorkflowCollapsed,
  guidePreviewCollapsed,
  setDraftWorkflowCollapsed,
  setGuidePreviewCollapsed,
  handleGenerateAISkillGuide,
  handleVerifyTemplate,
  handleSaveDraft,
  handleLoadDraft,
  handleClearDraft,
}) => {
  if (suggestions.length === 0 && !aiSkillGuide && !draftId && !draftWorkflowNotice) {
    return null;
  }

  return (
    <div className="excel-understanding-card excel-analysis-card">
      <div 
        className="excel-understanding-header"
        onClick={() => setDraftWorkflowCollapsed((value) => !value)}
      >
        <div>
          <h3>制作草稿</h3>
          <p>统一处理指南生成、模板验证和副本暂存，先把草稿准备完整再进入后续验证保存。</p>
        </div>
        <div className="excel-understanding-actions" onClick={(e) => e.stopPropagation()}>
          {/* 这里可以放动作按钮 */}
        </div>
      </div>

      {!draftWorkflowCollapsed && (
        <div className="workflow-card-body">
          <div className="draft-buttons-group">
            <button
              className="sheet-action-btn sheet-action-btn-primary"
              onClick={handleGenerateAISkillGuide}
              disabled={isAnalyzing || isGeneratingGuide || suggestions.length === 0}
            >
              {isGeneratingGuide ? '生成中...' : '生成指南'}
            </button>
            <button
              className="sheet-action-btn"
              onClick={handleVerifyTemplate}
              disabled={isAnalyzing || isVerifying || suggestions.length === 0}
            >
              {isVerifying ? '验证中...' : '验证模板'}
            </button>
            <button
              className="sheet-action-btn"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || !aiSkillGuide}
            >
              {isSavingDraft ? '暂存中...' : '暂存草稿'}
            </button>
            {draftId && (
              <button
                className="sheet-action-btn"
                onClick={handleLoadDraft}
                title="恢复当前暂存副本信息"
              >
                载入草稿
              </button>
            )}
            {draftId && (
              <button
                className="sheet-action-btn sheet-pair-danger-btn"
                onClick={() => handleClearDraft()}
                title="清除暂存副本"
              >
                清除
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
  );
};
