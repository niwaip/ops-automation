/**
 * 模板配置面板组件
 * 选择模板类型、输出格式、参数配置
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../../app/store';
import { carboneAPI } from '../../../api/carbone-api';
import { createHostAdapter } from '../../../host/adapters';
import { exportTemplateSource } from '../../../shared/services/template-source.service';
import {
  FORMATTER_OPTIONS,
  TEMPLATE_TYPE_OPTIONS,
  getTemplateTypeIcon,
  type FormatterOption,
  type TemplateTypeOption,
} from './TemplateConfigPanel.constants';
import { TemplateManager } from './TemplateManager';
import { useTemplateAssetManager } from './useTemplateWorkflow';
import { getHostScopedStorageKey } from '../../../shared/utils/host-storage';
import {
  getOfficeUploadConfig,
  isValidOfficeUpload,
  readFileAsBase64,
} from '../../../shared/utils/office-file-upload';

// #region debug-point shared:upload-render-loop-reporter
const UPLOAD_RENDER_LOOP_DEBUG_URL = 'http://127.0.0.1:7777/event';
const reportUploadRenderLoop = (
  hypothesisId: 'D' | 'E',
  location: string,
  msg: string,
  data: Record<string, unknown>
) => {
  void fetch(UPLOAD_RENDER_LOOP_DEBUG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'upload-render-loop',
      runId: 'pre-fix',
      hypothesisId,
      location,
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    }),
  }).catch(() => {});
};
// #endregion

export const TemplateConfigPanel: React.FC = () => {
  const { officeType, templateConfig, setTemplateConfig, suggestions, apiBaseUrl, addDebugLog } =
    useAppStore();

  const hostAdapter = useMemo(() => createHostAdapter(officeType), [officeType]);
  const lastTemplateDownloadUrl = localStorage.getItem(
    getHostScopedStorageKey(officeType, 'lastTemplateDownloadUrl')
  );

  const [templateTypeOptions, setTemplateTypeOptions] =
    useState<TemplateTypeOption[]>(TEMPLATE_TYPE_OPTIONS);
  const [formatterOptions, setFormatterOptions] = useState<FormatterOption[]>(FORMATTER_OPTIONS);

  const [templateName, setTemplateName] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string>('');
  const uploadInputId = `${officeType}-template-upload-input`;

  const uploadConfig = useMemo(
    () =>
      getOfficeUploadConfig(
        officeType === 'excel' ? 'excel' : officeType === 'ppt' ? 'ppt' : 'word'
      ),
    [officeType]
  );

  const loadTemplateSource = async () => {
    const source = await exportTemplateSource(hostAdapter);
    source.warnings?.forEach((warning: string) => addDebugLog('warn', '模板源导出提示', warning));

    return {
      documentContent: source.content,
      format: source.format,
      isBinaryFile: source.isBinaryFile,
    };
  };

  const {
    validationErrors,
    validationWarnings,
    previewData,
    loadingStates,
    statusMessage,
    currentStep,
    generatedSkill,
    skillPreviewResult,
    setLoadingStates,
    setStatusMessage,
    updatePreviewData,
    handleValidate,
    handleGenerateSkill,
    handleSkillPreview,
    handleFullSave,
    handlePreviewWithUploadedFile,
    handleSaveWithUploadedFile,
    handlePreview,
    handleGenerateTemplate,
  } = useTemplateAssetManager({
    apiBaseUrl,
    officeType,
    templateConfig,
    suggestions,
    templateName,
    uploadedFile,
    uploadedFileBase64,
    addDebugLog,
    loadTemplateSource,
  });

  /**
   * 处理文档文件上传
   */
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    // #region debug-point D:upload-handler-start
    reportUploadRenderLoop(
      'D',
      'TemplateConfigPanel:handleFileUpload:start',
      'upload handler started',
      {
        fileName: file.name,
        fileSize: file.size,
      }
    );
    // #endregion

    setLoadingStates((prev) => ({ ...prev, upload: true }));
    setStatusMessage('正在读取上传的文档...');

    try {
      if (!isValidOfficeUpload(file, uploadConfig)) {
        setStatusMessage(uploadConfig.invalidMessage);
        setLoadingStates((prev) => ({ ...prev, upload: false }));
        return;
      }

      const base64 = await readFileAsBase64(file);

      setUploadedFile(file);
      setUploadedFileBase64(base64);
      setStatusMessage(`文档已上传: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      // #region debug-point D:upload-handler-success
      reportUploadRenderLoop(
        'D',
        'TemplateConfigPanel:handleFileUpload:success',
        'upload handler completed',
        {
          fileName: file.name,
          fileSize: file.size,
          base64Length: base64.length,
        }
      );
      // #endregion
      setLoadingStates((prev) => ({ ...prev, upload: false }));
      console.log('文件上传成功，base64长度:', base64.length);
    } catch (error: any) {
      // #region debug-point E:upload-handler-error
      reportUploadRenderLoop(
        'E',
        'TemplateConfigPanel:handleFileUpload:error',
        'upload handler failed',
        {
          message: error?.message || 'unknown-error',
        }
      );
      // #endregion
      console.error('文件上传失败:', error);
      setStatusMessage(`文件上传失败: ${error.message}`);
      setLoadingStates((prev) => ({ ...prev, upload: false }));
    }
  };

  useEffect(() => {
    updatePreviewData();
  }, [templateConfig.templateType, suggestions]);

  useEffect(() => {
    carboneAPI.setBaseUrl(apiBaseUrl);
    carboneAPI
      .getTemplateTypes()
      .then((types) => {
        if (Array.isArray(types) && types.length > 0) {
          const mapped = types.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            icon: getTemplateTypeIcon(t.id),
          })) as TemplateTypeOption[];
          setTemplateTypeOptions(mapped);
        }
      })
      .catch(() => {
        setTemplateTypeOptions(TEMPLATE_TYPE_OPTIONS);
      });

    carboneAPI
      .getFormatters()
      .then((fmts) => {
        if (Array.isArray(fmts) && fmts.length > 0) {
          setFormatterOptions(fmts as FormatterOption[]);
        }
      })
      .catch(() => {
        setFormatterOptions(FORMATTER_OPTIONS);
      });
  }, [apiBaseUrl]);

  return (
    <div className="template-config-panel">
      <div className="workflow-steps">
        <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>
          <span className="step-num">1</span>
          <span className="step-text">验证模板</span>
        </div>
        <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
          <span className="step-num">2</span>
          <span className="step-text">生成模板指南</span>
        </div>
        <div className={`step ${currentStep >= 3 ? 'active' : ''}`}>
          <span className="step-num">3</span>
          <span className="step-text">预览模板资产</span>
        </div>
        <div className={`step ${currentStep >= 4 ? 'active' : ''}`}>
          <span className="step-num">4</span>
          <span className="step-text">发布模板资产</span>
        </div>
      </div>

      <div className="config-section">
        <h3>模板名称</h3>
        <input
          type="text"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          placeholder="输入模板名称（可选）"
          className="template-name-input"
        />
      </div>

      <div className="config-section">
        <h3>{uploadConfig.title}</h3>
        <p className="config-section-hint">{uploadConfig.hint}</p>
        <div className="template-upload-action-row">
          <input
            id={uploadInputId}
            type="file"
            accept={uploadConfig.accept}
            onChange={handleFileUpload}
          />
        </div>
        {uploadedFile && (
          <div
            style={{
              marginTop: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              fontSize: '12px',
              color: '#475569',
            }}
          >
            <div style={{ fontWeight: 600, color: '#0f172a' }}>已上传参考示例文件</div>
            <div style={{ marginTop: '4px', wordBreak: 'break-all' }}>{uploadedFile.name}</div>
            <div style={{ marginTop: '4px' }}>{(uploadedFile.size / 1024).toFixed(1)} KB</div>
          </div>
        )}
        <div className="quick-actions" style={{ marginTop: '10px' }}>
          <button
            className="preview-btn"
            onClick={handlePreviewWithUploadedFile}
            disabled={loadingStates.skillPreview || !uploadedFileBase64 || !generatedSkill}
          >
            {loadingStates.skillPreview ? '预览中...' : '上传文件预览'}
          </button>
          <button
            className="generate-btn"
            onClick={handleSaveWithUploadedFile}
            disabled={loadingStates.fullSave || !uploadedFileBase64 || !generatedSkill}
          >
            {loadingStates.fullSave ? '保存中...' : '上传文件保存'}
          </button>
        </div>
      </div>

      <div className="config-section">
        <h3>模板类型</h3>
        <div className="template-type-grid">
          {templateTypeOptions.map((type) => (
            <div
              key={type.id}
              className={`type-card ${templateConfig.templateType === type.id ? 'selected' : ''}`}
              onClick={() => setTemplateConfig({ templateType: type.id })}
            >
              <span className="icon">{type.icon}</span>
              <span className="name">{type.name}</span>
              <span className="desc">{type.description}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="config-section">
        <h3>输出格式</h3>
        <select
          value={templateConfig.formatType}
          onChange={(e) => setTemplateConfig({ formatType: e.target.value as any })}
        >
          <option value="docx">DOCX (Word文档)</option>
          <option value="xlsx">XLSX (Excel表格)</option>
          <option value="pptx">PPTX (PowerPoint)</option>
          <option value="pdf">PDF (PDF文档)</option>
        </select>
      </div>

      <div className="config-section">
        <h3>常用格式化器</h3>
        <div className="formatter-list">
          {formatterOptions.map((fmt) => (
            <div key={fmt.name} className="formatter-item">
              <code className="syntax">{fmt.syntax}</code>
              <span className="desc">{fmt.description}</span>
              <code className="example">{fmt.example}</code>
            </div>
          ))}
        </div>
      </div>

      <div className="config-section">
        <h3>变量映射 ({suggestions.filter((s) => s.applied).length} 个已应用)</h3>
        <div className="variable-list">
          {suggestions
            .filter((s) => s.applied)
            .map((s) => (
              <div key={s.id} className="variable-item">
                <span className="original">{s.originalText}</span>
                <span className="arrow">→</span>
                <span className="mapped">{s.suggestedName}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="config-section workflow-actions">
        <button
          className={`workflow-btn ${currentStep === 1 ? 'current' : ''}`}
          onClick={handleValidate}
          disabled={loadingStates.validate}
        >
          {loadingStates.validate ? '验证中...' : '1. 验证模板'}
        </button>

        <button
          className={`workflow-btn ${currentStep === 2 ? 'current' : ''}`}
          onClick={handleGenerateSkill}
          disabled={loadingStates.skillGenerate || currentStep < 2}
        >
          {loadingStates.skillGenerate ? '生成中...' : '2. 生成模板指南'}
        </button>

        <button
          className={`workflow-btn ${currentStep === 3 ? 'current' : ''}`}
          onClick={handleSkillPreview}
          disabled={loadingStates.skillPreview || currentStep < 3 || !generatedSkill}
        >
          {loadingStates.skillPreview ? '预览中...' : '3. 预览模板资产'}
        </button>

        <button
          className={`workflow-btn save-btn ${currentStep === 4 ? 'current' : ''}`}
          onClick={handleFullSave}
          disabled={loadingStates.fullSave || currentStep < 4}
        >
          {loadingStates.fullSave ? '发布中...' : '4. 发布模板资产'}
        </button>
      </div>

      <div className="config-section quick-actions">
        <button className="preview-btn" onClick={handlePreview} disabled={loadingStates.preview}>
          {loadingStates.preview ? '预览中...' : '快速预览'}
        </button>
        <button
          className="generate-btn"
          onClick={handleGenerateTemplate}
          disabled={loadingStates.generate}
        >
          {loadingStates.generate ? '生成中...' : '快速生成'}
        </button>
      </div>

      {statusMessage && (
        <div className="status-message-section">
          <div className="status-message">{statusMessage}</div>
          {/* 预览文档下载 */}
          {skillPreviewResult?.downloadUrl && (
            <button
              className="download-btn preview-download"
              onClick={() => {
                window.open(`${apiBaseUrl}${skillPreviewResult.downloadUrl}`, '_blank');
              }}
            >
              下载预览文档
            </button>
          )}
          {/* 模板文件下载 */}
          {lastTemplateDownloadUrl && (
            <button
              className="download-btn"
              onClick={() => {
                window.open(`${apiBaseUrl}${lastTemplateDownloadUrl}`, '_blank');
              }}
            >
              下载模板
            </button>
          )}
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="validation-errors">
          <h4>验证错误:</h4>
          {validationErrors.map((err, idx) => (
            <div key={idx} className="error-item">
              ❌ {err}
            </div>
          ))}
        </div>
      )}

      {validationWarnings.length > 0 && (
        <div className="validation-warnings">
          <h4>验证警告:</h4>
          {validationWarnings.map((warn, idx) => (
            <div key={idx} className="warning-item">
              ⚠️ {warn}
            </div>
          ))}
        </div>
      )}

      <div className="config-section preview-data">
        <h3>预览数据示例</h3>
        <pre>{JSON.stringify(previewData, null, 2)}</pre>
      </div>

      <TemplateManager />
    </div>
  );
};

export default TemplateConfigPanel;
