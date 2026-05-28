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
  draftInfo: { templateType: string; parameterCount: number; savedAt: string } | null;
  templateAssetDraftInfo?: unknown;
  latestBackendDraftInfo: { id: string; fileName: string; savedAt: string } | null;
  templateAssetNotice: { type: 'success' | 'error' | 'info'; message: string; lines?: string[] } | null;
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
  draftInfo,
  templateAssetDraftInfo: _templateAssetDraftInfo,
  latestBackendDraftInfo,
  templateAssetNotice,
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
  const formattedDraftTime = draftInfo?.savedAt
    ? new Date(draftInfo.savedAt).toLocaleString('zh-CN', {
      hour12: false,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '';
  const formattedLatestBackendDraftTime = latestBackendDraftInfo?.savedAt
    ? new Date(latestBackendDraftInfo.savedAt).toLocaleString('zh-CN', {
      hour12: false,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '';

  // 移除条件判断，使其始终显示
  // if (suggestions.length === 0 && !aiSkillGuide && !draftId && !templateAssetNotice) {
  //   return null;
  // }

  return (
    <div className="excel-understanding-card excel-analysis-card">
      <div 
        className="excel-understanding-header"
        onClick={() => setDraftWorkflowCollapsed((value) => !value)}
      >
        <div>
          <h3>模板资产准备</h3>
          <p>统一处理指南生成、模板验证和资产暂存，先把模板资产准备完整再进入后续发布。</p>
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
              {isSavingDraft ? '暂存中...' : '暂存模板资产'}
            </button>
            <button
              className="sheet-action-btn"
              onClick={handleLoadDraft}
              title="优先从本地最新暂存恢复模板资产，没有本地暂存时再尝试当前副本"
            >
              恢复最新暂存
            </button>
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

          {(draftId || draftInfo) && (
            <div className="draft-info">
              <span className="draft-badge">最新暂存</span>
              <span className="draft-details">
                {draftInfo?.templateType || 'unknown'} · {draftInfo?.parameterCount || suggestions.length || 0} 参数
                {formattedDraftTime ? ` · ${formattedDraftTime}` : ''}
                {draftId ? ` · ID: ${draftId.substring(0, 8)}...` : ''}
              </span>
            </div>
          )}

          {latestBackendDraftInfo && (
            <div className="draft-info">
              <span className="draft-badge">可载入模板</span>
              <span className="draft-details">
                {latestBackendDraftInfo.fileName}
                {formattedLatestBackendDraftTime ? ` · ${formattedLatestBackendDraftTime}` : ''}
                {latestBackendDraftInfo.id ? ` · ID: ${latestBackendDraftInfo.id.substring(0, 8)}...` : ''}
              </span>
            </div>
          )}

          {templateAssetNotice && (
            <div className={`workflow-status-message ${templateAssetNotice.type}`}>
              <div className="workflow-status-title">{templateAssetNotice.message}</div>
              {templateAssetNotice.lines && templateAssetNotice.lines.length > 0 && (
                <div className="workflow-status-lines">
                  {templateAssetNotice.lines.map((line, i) => <div key={i}>{line}</div>)}
                </div>
              )}
            </div>
          )}

          {aiSkillGuide && (
            <div className="ai-guide-preview">
              <div
                className="ai-guide-header"
                onClick={() => setGuidePreviewCollapsed((value) => !value)}
                style={{ cursor: 'pointer' }}
              >
                <span className="ai-guide-title">✅ 指南已生成</span>
                <div className="ai-guide-header-actions">
                  <span className="ai-guide-info">
                    {aiSkillGuide.parameters?.length || 0} 个参数
                  </span>
                  <span className="ai-guide-info">
                    {guidePreviewCollapsed ? '已折叠' : '已展开'}
                  </span>
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
