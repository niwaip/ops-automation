import React, { useEffect, useMemo, useState } from 'react';
import {
  TemplateFieldSpec,
  TemplateRenderDataResponse,
  WorkflowTermAssets,
} from '../../api/carbone-api';
import { AISuggestion } from '../../taskpane/store';

interface VerifySaveSectionProps {
  suggestions: AISuggestion[];
  aiSkillGuide: {
    id: string;
    parameters?: any[];
  } | null;
  aiGeneratedData: any;
  previewResult: { success: boolean; message: string; previewUrl?: string; downloadUrl?: string; generatedData?: any } | null;
  draftId: string | null;
  workflowDraftInfo: {
    fieldCount: number;
    status?: string;
    sourceLanguage?: string;
    targetLanguages?: string[];
    bindingPlanVersion?: number;
    fields: TemplateFieldSpec[];
    termAssets?: WorkflowTermAssets;
  } | null;
  workflowFieldSpecsDraft?: TemplateFieldSpec[];
  workflowTermAssetsText: string;
  workflowRenderDiagnostics: TemplateRenderDataResponse | null;
  isSavingWorkflowFieldSpecs?: boolean;
  saveResult: { success: boolean; message: string } | null;
  verifySaveCollapsed: boolean;
  setVerifySaveCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isGeneratingParams: boolean;
  analysisThinkingEnabled: boolean;
  setAnalysisThinkingEnabled: (enabled: boolean) => void;
  aiDescription: string;
  handleAiDescriptionChange: (value: string) => void;
  handleGenerateParameters: () => void;
  aiGenerateResult: { success: boolean; message: string } | null;
  isPreviewing: boolean;
  handlePreviewWithAIParams: () => void;
  handleWorkflowFieldSpecChange?: (index: number, patch: Partial<TemplateFieldSpec>) => void;
  handleWorkflowFieldTargetLanguagesChange?: (index: number, values: string[]) => void;
  handleWorkflowTermAssetsTextChange: (value: string) => void;
  handleAppendWorkflowTermAssetExample: (
    kind: 'fieldDictionary' | 'termbase' | 'enumMappings',
    targetFieldId?: string
  ) => void;
  handleSaveWorkflowFieldSpecs?: () => void;
  handleResetWorkflowFieldSpecs?: () => void;
  previewInlineSupported: boolean;
  apiBaseUrl: string;
  getDownloadLabel: () => string;
  templateName: string;
  setTemplateName: (name: string) => void;
  selectedTemplateType: string;
  isSaving: boolean;
  handleSaveTemplateAndGuide: () => void;
}

const normalizeGeneratedFieldPath = (rawPath: string): string => String(rawPath || '')
  .replace(/[{}]/g, '')
  .replace(/^[dct]\./, '')
  .replace(/\[(?:\d+)?\]/g, '')
  .replace(/^\.+|\.+$/g, '')
  .trim();

const getSectionName = (suggestion: AISuggestion): string => (
  suggestion.details?.excelAnchor?.sheetName
  || suggestion.details?.chapter
  || '未归类章节'
);

const getValueAtPath = (data: unknown, path: string): unknown => {
  if (!path || !data || typeof data !== 'object') {
    return undefined;
  }

  const segments = path.split('.').filter(Boolean);
  let current: unknown = data;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in (current as Record<string, unknown>))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
};

export const VerifySaveSection: React.FC<VerifySaveSectionProps> = ({
  suggestions,
  aiSkillGuide,
  aiGeneratedData,
  previewResult,
  draftId,
  workflowDraftInfo,
  workflowTermAssetsText,
  workflowRenderDiagnostics,
  saveResult,
  verifySaveCollapsed,
  setVerifySaveCollapsed,
  isGeneratingParams,
  analysisThinkingEnabled,
  setAnalysisThinkingEnabled,
  aiDescription,
  handleAiDescriptionChange,
  handleGenerateParameters,
  aiGenerateResult,
  isPreviewing,
  handlePreviewWithAIParams,
  handleWorkflowTermAssetsTextChange,
  handleAppendWorkflowTermAssetExample,
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

  const workflowSourceTraceEntries = Object.entries(workflowRenderDiagnostics?.sourceTrace || {});
  const termAssetsSummary = workflowDraftInfo?.termAssets
    ? [
        `字段词典 ${(workflowDraftInfo.termAssets.fieldDictionary || []).length}`,
        `术语 ${(workflowDraftInfo.termAssets.termbase || []).length}`,
        `枚举 ${(Object.keys(workflowDraftInfo.termAssets.enumMappings || {})).length}`,
      ].join(' · ')
    : '未配置模板级术语资产';
  const generatedDataSectionPreviews = useMemo(() => {
    if (!aiGeneratedData || typeof aiGeneratedData !== 'object' || Array.isArray(aiGeneratedData)) {
      return [];
    }

    const sectionSuggestions = suggestions.reduce((groups, suggestion) => {
      const sectionName = getSectionName(suggestion);
      if (!groups.has(sectionName)) {
        groups.set(sectionName, []);
      }
      groups.get(sectionName)!.push(suggestion);
      return groups;
    }, new Map<string, AISuggestion[]>());

    return Array.from(sectionSuggestions.entries())
      .map(([sectionName, groupedSuggestions]) => {
        const sectionData: Record<string, unknown> = {};
        const addedKeys = new Set<string>();

        groupedSuggestions.forEach((suggestion) => {
          const normalizedPath = normalizeGeneratedFieldPath(suggestion.suggestedName);
          if (!normalizedPath) {
            return;
          }

          const exactValue = getValueAtPath(aiGeneratedData, normalizedPath);
          if (exactValue !== undefined) {
            sectionData[normalizedPath] = exactValue;
            addedKeys.add(normalizedPath);
            return;
          }

          const rootKey = normalizedPath.split('.')[0];
          if (
            rootKey
            && !addedKeys.has(rootKey)
            && rootKey in (aiGeneratedData as Record<string, unknown>)
          ) {
            sectionData[rootKey] = (aiGeneratedData as Record<string, unknown>)[rootKey];
            addedKeys.add(rootKey);
          }
        });

        return {
          sectionName,
          suggestionCount: groupedSuggestions.length,
          fieldCount: Object.keys(sectionData).length,
          data: sectionData,
        };
      })
      .filter((section) => section.fieldCount > 0);
  }, [aiGeneratedData, suggestions]);
  const [collapsedGeneratedSections, setCollapsedGeneratedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (generatedDataSectionPreviews.length === 0) {
      setCollapsedGeneratedSections({});
      return;
    }

    setCollapsedGeneratedSections((current) => generatedDataSectionPreviews.reduce((next, section) => {
      next[section.sectionName] = current[section.sectionName] ?? false;
      return next;
    }, {} as Record<string, boolean>));
  }, [generatedDataSectionPreviews]);

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
                <label className="checkbox-label excel-analysis-chip">
                  <input
                    type="checkbox"
                    checked={analysisThinkingEnabled}
                    onChange={(e) => setAnalysisThinkingEnabled(e.target.checked)}
                  />
                  <span>think</span>
                </label>
                <button
                  className="generate-params-btn"
                  onClick={handleGenerateParameters}
                  disabled={isGeneratingParams}
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
                placeholder="可先输入业务描述点击“生成数据”，也可以留空直接生成默认实例参数；生成后可继续编辑下方 JSON 用于预览"
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
                  {generatedDataSectionPreviews.length > 0 && (
                    <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                      {generatedDataSectionPreviews.map((section) => {
                        const isCollapsed = collapsedGeneratedSections[section.sectionName] ?? false;
                        return (
                          <div
                            key={section.sectionName}
                            style={{
                              border: '1px solid #d9d9d9',
                              borderRadius: 8,
                              background: '#fff',
                              overflow: 'hidden',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setCollapsedGeneratedSections((current) => ({
                                ...current,
                                [section.sectionName]: !isCollapsed,
                              }))}
                              style={{
                                width: '100%',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                                border: 'none',
                                background: '#f8fafc',
                                padding: '10px 12px',
                                cursor: 'pointer',
                                textAlign: 'left',
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>{section.sectionName}</span>
                              <span className="ai-params-hint">
                                {section.suggestionCount} 参数 · {section.fieldCount} 字段 · {isCollapsed ? '展开' : '收起'}
                              </span>
                            </button>
                            {!isCollapsed && (
                              <pre className="ai-params-content" style={{ margin: 0 }}>
                                {JSON.stringify(section.data, null, 2)}
                              </pre>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {generatedDataSectionPreviews.length > 0 && (
                    <div className="ai-params-hint" style={{ marginBottom: 8 }}>
                      完整 JSON
                    </div>
                  )}
                  <pre className="ai-params-content">{JSON.stringify(aiGeneratedData, null, 2)}</pre>
                </div>
              )}

              {workflowRenderDiagnostics && (
                <div className="ai-params-preview">
                  <div className="ai-params-preview-header">🧭 渲染诊断</div>
                  {(workflowRenderDiagnostics.warnings.length > 0
                    || workflowRenderDiagnostics.missingFields.length > 0
                    || workflowRenderDiagnostics.needsReviewFields.length > 0) && (
                    <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                      {workflowRenderDiagnostics.warnings.length > 0 && (
                        <div className="ai-params-hint">警告: {workflowRenderDiagnostics.warnings.join(' | ')}</div>
                      )}
                      {workflowRenderDiagnostics.missingFields.length > 0 && (
                        <div className="ai-params-hint">缺失字段: {workflowRenderDiagnostics.missingFields.join(', ')}</div>
                      )}
                      {workflowRenderDiagnostics.needsReviewFields.length > 0 && (
                        <div className="ai-params-hint">待确认字段: {workflowRenderDiagnostics.needsReviewFields.join(', ')}</div>
                      )}
                    </div>
                  )}
                  {workflowSourceTraceEntries.length > 0 && (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {workflowSourceTraceEntries.map(([fieldId, trace]) => (
                        <div
                          key={fieldId}
                          style={{
                            border: '1px solid #d9d9d9',
                            borderRadius: 8,
                            padding: 10,
                            background: '#fff',
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: 6 }}>{fieldId}</div>
                          <pre className="ai-params-content" style={{ margin: 0 }}>
                            {JSON.stringify(trace, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
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
            <div className="ai-params-preview">
              <div
                className="ai-params-preview-header"
                style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
              >
                <span>
                  🗂️ 模板级术语资产
                  <span className="ai-params-hint" style={{ marginLeft: 8 }}>
                    {termAssetsSummary}
                  </span>
                </span>
                <div className="ai-params-buttons">
                  <button
                    className="sheet-action-btn"
                    type="button"
                    onClick={() => handleAppendWorkflowTermAssetExample('fieldDictionary')}
                  >
                    添加字段词典示例
                  </button>
                  <button
                    className="sheet-action-btn"
                    type="button"
                    onClick={() => handleAppendWorkflowTermAssetExample('termbase')}
                  >
                    添加术语示例
                  </button>
                  <button
                    className="sheet-action-btn"
                    type="button"
                    onClick={() => handleAppendWorkflowTermAssetExample('enumMappings')}
                  >
                    添加枚举示例
                  </button>
                </div>
              </div>
              <div className="ai-params-hint" style={{ marginBottom: 8 }}>
                填写 `fieldDictionary`、`termbase`、`enumMappings` 的 JSON；保存工作流后写入模板草稿，生成数据时也优先使用这里的模板级覆盖。
              </div>
              <textarea
                className="ai-description-input"
                placeholder={'{\n  "termbase": [],\n  "enumMappings": {}\n}'}
                value={workflowTermAssetsText}
                onChange={(e) => handleWorkflowTermAssetsTextChange(e.target.value)}
                rows={12}
              />
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
