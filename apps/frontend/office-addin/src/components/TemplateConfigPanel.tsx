/**
 * 模板配置面板组件
 * 选择模板类型、输出格式、参数配置
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../taskpane/store';
import { carboneAPI } from '../api/carbone-api';
import { createHostAdapter } from '../adapters';
import { exportTemplateSource } from '../services/template-source-service';
import { FORMATTER_OPTIONS, TEMPLATE_TYPE_OPTIONS, getTemplateTypeIcon, type FormatterOption, type TemplateTypeOption } from './TemplateConfigPanel.constants';
import { TemplateManager } from './TemplateManager';
import { useTemplateWorkflow } from './useTemplateWorkflow';

export const TemplateConfigPanel: React.FC = () => {
  const {
    officeType,
    templateConfig,
    setTemplateConfig,
    suggestions,
    apiBaseUrl,
    addDebugLog,
  } = useAppStore();

  const hostAdapter = useMemo(() => createHostAdapter(officeType), [officeType]);

  const [templateTypeOptions, setTemplateTypeOptions] = useState<TemplateTypeOption[]>(TEMPLATE_TYPE_OPTIONS);
  const [formatterOptions, setFormatterOptions] = useState<FormatterOption[]>(FORMATTER_OPTIONS);
  
  const [templateName, setTemplateName] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string>('');

  const loadTemplateSource = async () => {
    const source = await exportTemplateSource(hostAdapter);
    source.warnings?.forEach((warning) => addDebugLog('warn', '模板源导出提示', warning));

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
  } = useTemplateWorkflow({
    apiBaseUrl,
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

    setLoadingStates(prev => ({ ...prev, upload: true }));
    setStatusMessage('正在读取上传的文档...');

    try {
      // 检查文件类型
      const validExtensions = ['.docx', '.xlsx', '.pptx'];
      const fileName = file.name.toLowerCase();
      const isValid = validExtensions.some(ext => fileName.endsWith(ext));
      if (!isValid) {
        setStatusMessage('请上传有效的Office文档文件（.docx, .xlsx, .pptx）');
        setLoadingStates(prev => ({ ...prev, upload: false }));
        return;
      }

      // 读取文件为base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (arrayBuffer) {
          // 将ArrayBuffer转换为base64
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          setUploadedFile(file);
          setUploadedFileBase64(base64);
          setStatusMessage(`文档已上传: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
          setLoadingStates(prev => ({ ...prev, upload: false }));
          console.log('文件上传成功，base64长度:', base64.length);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error: any) {
      console.error('文件上传失败:', error);
      setStatusMessage(`文件上传失败: ${error.message}`);
      setLoadingStates(prev => ({ ...prev, upload: false }));
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
      {/* 步骤流程指示器 */}
      <div className="workflow-steps">
        <div className={`step ${currentStep >= 1 ? 'active' : ''}`}>
          <span className="step-num">1</span>
          <span className="step-text">验证模板</span>
        </div>
        <div className={`step ${currentStep >= 2 ? 'active' : ''}`}>
          <span className="step-num">2</span>
          <span className="step-text">生成AI指南</span>
        </div>
        <div className={`step ${currentStep >= 3 ? 'active' : ''}`}>
          <span className="step-num">3</span>
          <span className="step-text">预览验证</span>
        </div>
        <div className={`step ${currentStep >= 4 ? 'active' : ''}`}>
          <span className="step-num">4</span>
          <span className="step-text">保存模板</span>
        </div>
      </div>

      {/* 模板名称输入 */}
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
        <h3>文件上传预览</h3>
        <input
          type="file"
          accept=".docx,.xlsx,.pptx"
          onChange={handleFileUpload}
        />
        {uploadedFile && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
            已上传: {uploadedFile.name}
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

      {/* 模板类型选择 */}
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

      {/* 输出格式 */}
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

      {/* 格式化器参考 */}
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

      {/* 变量映射 */}
      <div className="config-section">
        <h3>变量映射 ({suggestions.filter((s) => s.applied).length} 个已应用)</h3>
        <div className="variable-list">
          {suggestions.filter((s) => s.applied).map((s) => (
            <div key={s.id} className="variable-item">
              <span className="original">{s.originalText}</span>
              <span className="arrow">→</span>
              <span className="mapped">{s.suggestedName}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 流程操作按钮 */}
      <div className="config-section workflow-actions">
        {/* 步骤1: 验证模板 */}
        <button
          className={`workflow-btn ${currentStep === 1 ? 'current' : ''}`}
          onClick={handleValidate}
          disabled={loadingStates.validate}
        >
          {loadingStates.validate ? '验证中...' : '1. 验证模板'}
        </button>

        {/* 步骤2: 生成AI指南 */}
        <button
          className={`workflow-btn ${currentStep === 2 ? 'current' : ''}`}
          onClick={handleGenerateSkill}
          disabled={loadingStates.skillGenerate || currentStep < 2}
        >
          {loadingStates.skillGenerate ? '生成中...' : '2. 生成AI指南'}
        </button>

        {/* 步骤3: 预览验证 */}
        <button
          className={`workflow-btn ${currentStep === 3 ? 'current' : ''}`}
          onClick={handleSkillPreview}
          disabled={loadingStates.skillPreview || currentStep < 3 || !generatedSkill}
        >
          {loadingStates.skillPreview ? '预览中...' : '3. 预览验证'}
        </button>

        {/* 步骤4: 保存完整模板 */}
        <button
          className={`workflow-btn save-btn ${currentStep === 4 ? 'current' : ''}`}
          onClick={handleFullSave}
          disabled={loadingStates.fullSave || currentStep < 4}
        >
          {loadingStates.fullSave ? '保存中...' : '4. 保存模板'}
        </button>
      </div>

      {/* 快捷操作（原有功能保留） */}
      <div className="config-section quick-actions">
        <button
          className="preview-btn"
          onClick={handlePreview}
          disabled={loadingStates.preview}
        >
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

      {/* 状态消息 */}
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
          {localStorage.getItem('lastTemplateDownloadUrl') && (
            <button
              className="download-btn"
              onClick={() => {
                const url = localStorage.getItem('lastTemplateDownloadUrl') || '';
                window.open(`${apiBaseUrl}${url}`, '_blank');
              }}
            >
              下载模板
            </button>
          )}
        </div>
      )}

      {/* 验证错误 */}
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

      {/* 验证警告 */}
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

      {/* 预览数据 */}
      <div className="config-section preview-data">
        <h3>预览数据示例</h3>
        <pre>{JSON.stringify(previewData, null, 2)}</pre>
      </div>

      {/* 模板管理区域 */}
      <TemplateManager />
    </div>
  );
};

export default TemplateConfigPanel;
