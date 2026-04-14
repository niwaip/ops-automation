/**
 * 模板配置面板组件
 * 选择模板类型、输出格式、参数配置
 */

import React, { useState, useEffect } from 'react';
import { useAppStore, TemplateConfig } from '../taskpane/store';
import { carboneAPI } from '../api/carbone-api';
import { OfficeHelper } from '../utils/office-api';

interface TemplateTypeOption {
  id: string;
  name: string;
  description: string;
  icon: string;
}

interface FormatterOption {
  name: string;
  syntax: string;
  description: string;
  example: string;
}

export const TemplateConfigPanel: React.FC = () => {
  const {
    officeType,
    templateConfig,
    setTemplateConfig,
    suggestions,
    apiBaseUrl,
  } = useAppStore();

  const [templateTypes, setTemplateTypes] = useState<TemplateTypeOption[]>([
    { id: 'report', name: '报告文档', description: '业务报告、分析报告等', icon: '📄' },
    { id: 'invoice', name: '发票账单', description: '发票、收据、账单等', icon: '🧾' },
    { id: 'certificate', name: '证书证明', description: '证书、证明、执照等', icon: '📜' },
    { id: 'contract', name: '合同协议', description: '合同、协议、备忘录等', icon: '📋' },
    { id: 'letter', name: '信函通知', description: '信函、通知、公告等', icon: '📨' },
  ]);

  const [formatters, setFormatters] = useState<FormatterOption[]>([
    { name: 'formatDate', syntax: ':formatDate(YYYY-MM-DD)', description: '日期格式化', example: '{d.date:formatDate(YYYY-MM-DD)}' },
    { name: 'formatNumber', syntax: ':formatNumber(#,##0.00)', description: '数字格式化', example: '{d.amount:formatNumber(#,##0.00)}' },
    { name: 'upper', syntax: ':upper', description: '转大写', example: '{d.name:upper}' },
    { name: 'lower', syntax: ':lower', description: '转小写', example: '{d.code:lower}' },
    { name: 'convCurrency', syntax: ':convCurrency(USD)', description: '货币转换', example: '{d.price:convCurrency(USD)}' },
  ]);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<Record<string, any>>({});
  const [loadingStates, setLoadingStates] = useState({
    validate: false,
    preview: false,
    generate: false,
    skillGenerate: false,
    skillPreview: false,
    fullSave: false,
  });
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<number>(1); // 1:验证, 2:生成Skill, 3:预览验证, 4:保存
  const [generatedSkill, setGeneratedSkill] = useState<any>(null);
  const [skillPreviewResult, setSkillPreviewResult] = useState<any>(null);
  const [templateName, setTemplateName] = useState<string>('');

  /**
   * 生成预览数据
   */
  const generatePreviewData = () => {
    const data: Record<string, any> = {
      title: '示例标题',
      date: new Date().toISOString().split('T')[0],
      content: '示例内容文本',
    };

    // 根据建议生成预览数据
    for (const suggestion of suggestions) {
      if (suggestion.type === 'loop' && suggestion.details?.arrayPath) {
        const path = suggestion.details.arrayPath.replace('d.', '');
        data[path] = [
          { name: '项目1', value: 100 },
          { name: '项目2', value: 200 },
          { name: '项目3', value: 300 },
        ];
      }
    }

    // 根据模板类型补充数据
    switch (templateConfig.templateType) {
      case 'invoice':
        data.invoiceNumber = 'INV-2024-001';
        data.customer = '客户名称';
        data.items = [{ product: '产品A', quantity: 10, price: 100 }];
        data.total = 1000;
        break;
      case 'certificate':
        data.recipient = '持证人';
        data.issueDate = new Date().toISOString().split('T')[0];
        data.expiryDate = '2025-12-31';
        break;
      case 'contract':
        data.partyA = '甲方名称';
        data.partyB = '乙方名称';
        data.contractNumber = 'CON-2024-001';
        break;
    }

    setPreviewData(data);
  };

  /**
   * 步骤1：验证模板
   */
  const handleValidate = async () => {
    setLoadingStates(prev => ({ ...prev, validate: true }));
    setStatusMessage('正在验证模板配置...');
    setValidationErrors([]);
    setValidationWarnings([]);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.validateTemplate(
        JSON.stringify(templateConfig)
      );
      setValidationErrors(result.errors || []);
      setValidationWarnings(result.warnings || []);

      if (result.valid) {
        setStatusMessage('验证通过，可继续生成AI指南');
        setCurrentStep(2); // 验证成功后进入步骤2
      } else {
        setStatusMessage('验证失败，请检查错误');
      }
    } catch (error: any) {
      console.error('验证失败:', error);
      setValidationErrors([error.message || '验证请求失败']);
      setStatusMessage('验证请求失败');
    } finally {
      setLoadingStates(prev => ({ ...prev, validate: false }));
    }
  };

  /**
   * 预览渲染
   */
  const handlePreview = async () => {
    setLoadingStates(prev => ({ ...prev, preview: true }));
    setStatusMessage('正在生成预览...');

    try {
      // 获取当前文档内容
      let documentContent = '';
      let format = 'docx';

      if (officeType === 'word') {
        documentContent = await OfficeHelper.Word.getDocumentContent();
        format = 'docx';
      } else if (officeType === 'excel') {
        const sheetData = await OfficeHelper.Excel.getSheetData();
        documentContent = JSON.stringify(sheetData.values);
        format = 'xlsx';
      }

      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.previewRenderContent(
        documentContent,
        templateConfig,
        format
      );

      if (result.success && result.previewUrl) {
        setStatusMessage('预览生成成功！');
        setPreviewData(result.sampleData || {});
        // 可选：打开预览链接
        console.log('预览链接:', result.previewUrl);
      } else {
        setStatusMessage(`预览失败: ${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('预览失败:', error);
      setStatusMessage(`预览失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingStates(prev => ({ ...prev, preview: false }));
    }
  };

  /**
   * 生成最终模板
   */
  const handleGenerateTemplate = async () => {
    setLoadingStates(prev => ({ ...prev, generate: true }));
    setStatusMessage('正在生成模板...');

    try {
      let documentContent = '';
      let format = 'docx';

      if (officeType === 'word') {
        documentContent = await OfficeHelper.Word.getDocumentContent();
        format = 'docx';
      } else if (officeType === 'excel') {
        const sheetData = await OfficeHelper.Excel.getSheetData();
        documentContent = JSON.stringify(sheetData.values);
        format = 'xlsx';
      }

      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.generateTemplate({
        documentContent,
        suggestions: suggestions.filter((s) => s.applied),
        templateConfig,
        format,
      });

      if (result.success) {
        setStatusMessage(`模板生成成功！模板ID: ${result.templateId || '未知'}`);
        // 保存模板ID供后续使用
        if (result.templateId) {
          localStorage.setItem('lastTemplateId', result.templateId);
          localStorage.setItem('lastTemplateDownloadUrl', result.downloadUrl || '');
        }
        console.log('生成的模板:', result);
      } else {
        setValidationErrors(result.validationErrors || []);
        setStatusMessage(`模板生成失败: ${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('生成模板失败:', error);
      setStatusMessage(`生成模板失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingStates(prev => ({ ...prev, generate: false }));
    }
  };

  /**
   * 步骤2：生成AI使用指南Skill
   */
  const handleGenerateSkill = async () => {
    // 检查是否有已应用的变量
    const appliedSuggestions = suggestions.filter(s => s.applied);
    if (appliedSuggestions.length === 0) {
      setStatusMessage('请先在AI识别面板中应用建议，再生成AI指南');
      setValidationErrors(['当前没有已应用的变量。请返回AI识别面板，点击"应用全部"或逐个应用建议后再继续。']);
      return;
    }

    setLoadingStates(prev => ({ ...prev, skillGenerate: true }));
    setStatusMessage(`正在生成AI使用指南（${appliedSuggestions.length}个变量）...`);

    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.generateSkill({
        suggestions: appliedSuggestions,
        templateConfig,
        templateType: templateConfig.templateType || 'custom',
        documentDescription: templateName || `${templateConfig.templateType || '自定义'}模板`,
      });

      if (result.success && result.skill) {
        setGeneratedSkill(result.skill);
        setCurrentStep(3);
        setStatusMessage(`AI指南生成成功！包含 ${result.skill.parameters?.length || 0} 个变量`);
        localStorage.setItem('lastSkillId', result.skillId || '');
        console.log('生成的Skill:', result.skill);
      } else {
        setStatusMessage(`AI指南生成失败: ${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('生成AI指南失败:', error);
      setStatusMessage(`生成AI指南失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingStates(prev => ({ ...prev, skillGenerate: false }));
    }
  };

  /**
   * 步骤3：使用Skill进行参数化预览验证
   */
  const handleSkillPreview = async () => {
    if (!generatedSkill) {
      setStatusMessage('请先生成AI指南');
      return;
    }

    setLoadingStates(prev => ({ ...prev, skillPreview: true }));
    setStatusMessage('正在使用AI指南进行预览验证...');

    try {
      let documentContent = '';
      let format = 'docx';

      if (officeType === 'word') {
        // 使用base64获取实际docx文件
        try {
          documentContent = 'base64:' + await OfficeHelper.Word.getDocumentFileBase64();
        } catch (e) {
          // 如果getFileAsync不支持，使用纯文本（可能会有格式问题）
          console.warn('getFileAsync不支持，使用纯文本');
          documentContent = await OfficeHelper.Word.getDocumentContent();
        }
        format = 'docx';
      } else if (officeType === 'excel') {
        const sheetData = await OfficeHelper.Excel.getSheetData();
        documentContent = JSON.stringify(sheetData.values);
        format = 'xlsx';
      }

      carboneAPI.setBaseUrl(apiBaseUrl);

      // 先生成模板
      const templateResult = await carboneAPI.generateTemplate({
        documentContent,
        suggestions: suggestions.filter(s => s.applied),
        templateConfig,
        format,
      });

      if (!templateResult.success) {
        setStatusMessage(`模板生成失败: ${templateResult.error}`);
        return;
      }

      // 使用skill预览
      const result = await carboneAPI.previewWithSkill({
        templateId: templateResult.templateId,
        skill: generatedSkill,
      });

      if (result.success) {
        setSkillPreviewResult(result);
        setCurrentStep(4);
        setStatusMessage(`预览验证成功！可查看模拟数据效果`);
        setPreviewData(result.generatedData || {});
        console.log('预览结果:', result);
      } else {
        setStatusMessage(`预览验证失败: ${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('预览验证失败:', error);
      setStatusMessage(`预览验证失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingStates(prev => ({ ...prev, skillPreview: false }));
    }
  };

  /**
   * 步骤4：保存完整模板（包含模板文件和Skill）
   */
  const handleFullSave = async () => {
    if (!generatedSkill) {
      setStatusMessage('请先完成AI指南生成和预览验证');
      return;
    }

    setLoadingStates(prev => ({ ...prev, fullSave: true }));
    setStatusMessage('正在保存完整模板...');

    try {
      let documentContent = '';
      let format = 'docx';

      if (officeType === 'word') {
        // 使用base64获取实际docx文件
        try {
          documentContent = 'base64:' + await OfficeHelper.Word.getDocumentFileBase64();
        } catch (e) {
          console.warn('getFileAsync不支持，使用纯文本');
          documentContent = await OfficeHelper.Word.getDocumentContent();
        }
        format = 'docx';
      } else if (officeType === 'excel') {
        const sheetData = await OfficeHelper.Excel.getSheetData();
        documentContent = JSON.stringify(sheetData.values);
        format = 'xlsx';
      }

      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.saveTemplateFull({
        documentContent,
        suggestions: suggestions.filter(s => s.applied),
        templateConfig,
        skill: generatedSkill,
        format,
        templateName: templateName || `template_${Date.now()}`,
      });

      if (result.success) {
        setStatusMessage(`完整模板保存成功！模板ID: ${result.templateId}`);
        localStorage.setItem('lastTemplateId', result.templateId || '');
        localStorage.setItem('lastTemplateDownloadUrl', result.downloadUrl || '');
        localStorage.setItem('lastSkillId', result.skillId || '');
        console.log('保存结果:', result);
      } else {
        setStatusMessage(`保存失败: ${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      console.error('保存完整模板失败:', error);
      setStatusMessage(`保存失败: ${error.message || '未知错误'}`);
    } finally {
      setLoadingStates(prev => ({ ...prev, fullSave: false }));
    }
  };

  useEffect(() => {
    generatePreviewData();
  }, [templateConfig.templateType, suggestions]);

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

      {/* 模板类型选择 */}
      <div className="config-section">
        <h3>模板类型</h3>
        <div className="template-type-grid">
          {templateTypes.map((type) => (
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
          {formatters.map((fmt) => (
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
          {localStorage.getItem('lastTemplateDownloadUrl') && (
            <button
              className="download-btn"
              onClick={() => {
                const url = localStorage.getItem('lastTemplateDownloadUrl') || '';
                const baseUrl = apiBaseUrl || 'https://localhost:3443';
                window.open(`${baseUrl}${url}`, '_blank');
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
    </div>
  );
};

export default TemplateConfigPanel;