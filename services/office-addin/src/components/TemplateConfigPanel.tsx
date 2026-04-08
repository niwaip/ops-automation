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
  const [previewData, setPreviewData] = useState<Record<string, any>>({});

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
   * 验证模板
   */
  const handleValidate = async () => {
    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.validateTemplate(
        JSON.stringify(templateConfig)
      );
      setValidationErrors(result.errors);
    } catch (error) {
      console.error('验证失败:', error);
    }
  };

  /**
   * 预览渲染
   */
  const handlePreview = async () => {
    try {
      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.previewRender(
        JSON.stringify(templateConfig),
        previewData
      );
      console.log('预览结果:', result);
    } catch (error) {
      console.error('预览失败:', error);
    }
  };

  /**
   * 生成最终模板
   */
  const handleGenerateTemplate = async () => {
    try {
      let documentContent = '';

      if (officeType === 'word') {
        documentContent = await OfficeHelper.Word.getDocumentContent();
      } else if (officeType === 'excel') {
        const sheetData = await OfficeHelper.Excel.getSheetData();
        documentContent = JSON.stringify(sheetData.values);
      }

      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.generateTemplate({
        documentContent,
        suggestions: suggestions.filter((s) => s.applied),
        templateConfig,
      });

      if (result.success) {
        alert('模板生成成功！');
        console.log('生成的模板:', result.generatedTemplate);
      } else {
        setValidationErrors(result.validationErrors || []);
      }
    } catch (error) {
      console.error('生成模板失败:', error);
    }
  };

  useEffect(() => {
    generatePreviewData();
  }, [templateConfig.templateType, suggestions]);

  return (
    <div className="template-config-panel">
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

      {/* 验证和预览 */}
      <div className="config-section actions">
        <button className="validate-btn" onClick={handleValidate}>
          验证格式
        </button>
        <button className="preview-btn" onClick={handlePreview}>
          预览效果
        </button>
        <button className="generate-btn" onClick={handleGenerateTemplate}>
          生成模板
        </button>
      </div>

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

      {/* 预览数据 */}
      <div className="config-section preview-data">
        <h3>预览数据示例</h3>
        <pre>{JSON.stringify(previewData, null, 2)}</pre>
      </div>
    </div>
  );
};

export default TemplateConfigPanel;