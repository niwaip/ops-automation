import React from 'react';

interface VerifySaveSectionProps {
  aiSkillGuide: {
    id: string;
    parameters?: any[];
  } | null;
  aiGeneratedData: any;
  previewResult: { success: boolean; message: string; previewUrl?: string; downloadUrl?: string; generatedData?: any } | null;
  draftId: string | null;
  saveResult: { success: boolean; message: string } | null;
  verifySaveCollapsed: boolean;
  setVerifySaveCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isGeneratingParams: boolean;
  aiDescription: string;
  handleAiDescriptionChange: (value: string) => void;
  handleGenerateParameters: () => void;
  aiGenerateResult: { success: boolean; message: string } | null;
  isPreviewing: boolean;
  handlePreviewWithAIParams: () => void;
  previewInlineSupported: boolean;
  apiBaseUrl: string;
  getDownloadLabel: () => string;
  templateName: string;
  setTemplateName: (name: string) => void;
  selectedTemplateType: string;
  isSaving: boolean;
  handleSaveTemplateAndGuide: () => void;
}

export const VerifySaveSection: React.FC<VerifySaveSectionProps> = ({
  aiSkillGuide,
  aiGeneratedData,
  previewResult,
  draftId,
  saveResult,
  verifySaveCollapsed,
  setVerifySaveCollapsed,
  isGeneratingParams,
  aiDescription,
  handleAiDescriptionChange,
  handleGenerateParameters,
  aiGenerateResult,
  isPreviewing,
  handlePreviewWithAIParams,
  previewInlineSupported,
  apiBaseUrl,
  getDownloadLabel,
  templateName,
  setTemplateName,
  selectedTemplateType,
  isSaving,
  handleSaveTemplateAndGuide,
}) => {
  if (!aiSkillGuide && !aiGeneratedData && !previewResult && !draftId && !saveResult) {
    return null;
  }

  return (
    <div className="excel-understanding-card excel-analysis-card">
      <div 
        className="excel-understanding-header"
        onClick={() => setVerifySaveCollapsed((value) => !value)}
      >
        <div>
          <h3>验证保存</h3>
          <p>统一处理参数生成、预览验证和最终保存，使用草稿或 AI 参数完成端到端确认。</p>
        </div>
        <div className="excel-understanding-actions" onClick={(e) => e.stopPropagation()}>
          {/* 这里可以放动作按钮 */}
        </div>
      </div>

      {!verifySaveCollapsed && (
        <div className="workflow-card-body">
          {aiSkillGuide && (
            <div className="ai-params-section">
              <div className="ai-params-header">
                <span className="ai-params-title">AI 生成数据</span>
                <span className="ai-params-hint">可先输入业务描述生成数据，生成后可直接修改下方 JSON，再用当前内容预览。</span>
              </div>
              <div className="ai-params-buttons">
                <button
                  className="generate-params-btn"
                  onClick={handleGenerateParameters}
                  disabled={isGeneratingParams || !aiDescription.trim()}
                >
                  {isGeneratingParams ? '⏳ 生成中...' : '🤖 生成数据'}
                </button>
                <button
                  className="preview-ai-btn"
                  onClick={handlePreviewWithAIParams}
                  disabled={isPreviewing || isGeneratingParams || !aiSkillGuide || !aiDescription.trim()}
                >
                  {isPreviewing ? '⏳ 预览中...' : '👁️ 预览数据'}
                </button>
              </div>
              <textarea
                className="ai-description-input"
                placeholder="先输入业务描述点击“生成数据”，或直接粘贴/编辑 JSON 数据用于预览"
                value={aiDescription}
                onChange={(e) => handleAiDescriptionChange(e.target.value)}
                rows={8}
              />

              {aiGenerateResult && (
                <div className={`ai-generate-result ${aiGenerateResult.success ? 'success' : 'error'}`}>
                  {aiGenerateResult.message}
                </div>
              )}

              {aiGeneratedData && (
                <div className="ai-params-preview">
                  <div className="ai-params-preview-header">📊 AI 生成的数据值</div>
                  <pre className="ai-params-content">{JSON.stringify(aiGeneratedData, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

          {previewResult && (
            <div className={`preview-result ${previewResult.success ? 'success' : 'error'}`}>
              {previewResult.message}
              <div className="preview-links">
                {previewInlineSupported && previewResult.previewUrl && (
                  <a href={`${apiBaseUrl}${previewResult.previewUrl}`} target="_blank" rel="noopener noreferrer" className="preview-link">
                    👁️ 打开预览
                  </a>
                )}
                {previewResult.downloadUrl && (
                  <a href={`${apiBaseUrl}${previewResult.downloadUrl}`} target="_blank" rel="noopener noreferrer" className="preview-link download-link">
                    {getDownloadLabel()}
                  </a>
                )}
              </div>
              {previewResult.generatedData && (
                <div className="generated-data-preview">
                  <div className="generated-data-header">📊 模拟替换数据</div>
                  <pre className="generated-data-content">{JSON.stringify(previewResult.generatedData, null, 2)}</pre>
                </div>
              )}
            </div>
          )}

          {draftId && (
            <div className="template-name-input-container">
              <label className="template-name-label">模板名称:</label>
              <input
                type="text"
                className="template-name-input"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={`默认: ${selectedTemplateType}-template-${Date.now()}`}
                disabled={isSaving}
              />
            </div>
          )}

          <button
            className="final-save-btn"
            onClick={handleSaveTemplateAndGuide}
            disabled={isSaving || !draftId}
            title={!draftId ? '请先暂存副本' : '从副本正式保存'}
          >
            {isSaving ? '⏳ 保存中...' : '💾 保存模板'}
          </button>

          {saveResult && (
            <div className={`save-result ${saveResult.success ? 'success' : 'error'}`}>
              {saveResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
