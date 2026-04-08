/**
 * AI 识别面板组件
 * 显示 AI 分析结果和建议，支持一键应用或部分应用
 */

import React, { useState } from 'react';
import { useAppStore, AISuggestion } from '../taskpane/store';
import { carboneAPI } from '../api/carbone-api';
import { OfficeHelper } from '../utils/office-api';

interface Props {
  onApplyComplete?: () => void;
}

export const AIIdentifyPanel: React.FC<Props> = ({ onApplyComplete }) => {
  const {
    officeType,
    isAnalyzing,
    suggestions,
    analysisError,
    setAnalyzing,
    setSuggestions,
    setAnalysisError,
    applySuggestion,
    applyAllSuggestions,
    dismissSuggestion,
    templateConfig,
    apiBaseUrl,
  } = useAppStore();

  const [selectedTemplateType, setSelectedTemplateType] = useState('report');

  /**
   * 执行 AI 分析
   */
  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalysisError(null);

    try {
      // 获取文档内容
      let documentContent = '';
      let documentStructure: any = null;

      if (officeType === 'word') {
        documentContent = await OfficeHelper.Word.getDocumentContent();
        documentStructure = await OfficeHelper.Word.getDocumentStructure();
      } else if (officeType === 'excel') {
        const sheetData = await OfficeHelper.Excel.getSheetData();
        documentContent = JSON.stringify(sheetData.values);
        documentStructure = { tables: [], paragraphs: [], images: [] };
      } else if (officeType === 'ppt') {
        const slidesContent = await OfficeHelper.PowerPoint.getSlidesContent();
        documentContent = JSON.stringify(slidesContent);
        documentStructure = { slides: slidesContent };
      }

      // 调用 AI 识别 API
      carboneAPI.setBaseUrl(apiBaseUrl);
      const result = await carboneAPI.identifyDocument({
        documentContent,
        documentType: officeType === 'ppt' ? 'pptx' : officeType,
        templateType: selectedTemplateType,
      });

      setSuggestions(result.suggestions);
    } catch (error: any) {
      setAnalysisError(error.message || 'AI 分析失败，请检查后端服务是否启动');
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * 应用单个建议
   */
  const handleApplySingle = async (suggestion: AISuggestion) => {
    try {
      if (officeType === 'word') {
        await OfficeHelper.Word.replaceText(
          suggestion.originalText,
          suggestion.suggestedName
        );
      } else if (officeType === 'excel') {
        // Excel 需要找到对应单元格
        const selectedRange = await OfficeHelper.Excel.getSelectedRange();
        await OfficeHelper.Excel.insertMarkerInCell(
          selectedRange.address,
          suggestion.suggestedName
        );
      }
      applySuggestion(suggestion.id);
    } catch (error) {
      console.error('应用建议失败:', error);
    }
  };

  /**
   * 一键应用所有建议
   */
  const handleApplyAll = async () => {
    try {
      const unapplied = suggestions.filter((s) => !s.applied);

      for (const suggestion of unapplied) {
        await handleApplySingle(suggestion);
      }

      onApplyComplete?.();
    } catch (error) {
      console.error('批量应用失败:', error);
    }
  };

  /**
   * 按类型分组建议
   */
  const groupedSuggestions = suggestions.reduce((acc, suggestion) => {
    const type = suggestion.type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(suggestion);
    return acc;
  }, {} as Record<string, AISuggestion[]>);

  return (
    <div className="ai-identify-panel">
      {/* 模板类型选择 */}
      <div className="template-type-selector">
        <label>模板类型:</label>
        <select
          value={selectedTemplateType}
          onChange={(e) => setSelectedTemplateType(e.target.value)}
        >
          <option value="report">报告文档</option>
          <option value="invoice">发票/账单</option>
          <option value="certificate">证书/证明</option>
          <option value="contract">合同/协议</option>
          <option value="letter">信函/通知</option>
          <option value="custom">自定义</option>
        </select>
      </div>

      {/* 分析按钮 */}
      <button
        className="analyze-btn"
        onClick={handleAnalyze}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? '分析中...' : 'AI 智能识别'}
      </button>

      {/* 错误提示 */}
      {analysisError && (
        <div className="error-message">
          <span>❌ {analysisError}</span>
        </div>
      )}

      {/* 分析结果 */}
      {suggestions.length > 0 && (
        <div className="suggestions-container">
          {/* 一键应用按钮 */}
          <div className="apply-all-section">
            <button className="apply-all-btn" onClick={handleApplyAll}>
              ✅ 一键应用全部 ({suggestions.filter((s) => !s.applied).length})
            </button>
          </div>

          {/* 分组显示建议 */}
          {Object.entries(groupedSuggestions).map(([type, items]) => (
            <div key={type} className="suggestion-group">
              <h4 className="group-title">
                {type === 'variable' && '变量替换'}
                {type === 'loop' && '循环标记'}
                {type === 'format' && '格式化'}
                {type === 'image' && '图片处理'}
                {type === 'table' && '表格循环'}
                <span className="count">({items.length})</span>
              </h4>

              <div className="suggestion-list">
                {items.map((suggestion) => (
                  <SuggestionItem
                    key={suggestion.id}
                    suggestion={suggestion}
                    onApply={() => handleApplySingle(suggestion)}
                    onDismiss={() => dismissSuggestion(suggestion.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 单个建议项组件
 */
const SuggestionItem: React.FC<{
  suggestion: AISuggestion;
  onApply: () => void;
  onDismiss: () => void;
}> = ({ suggestion, onApply, onDismiss }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`suggestion-item ${suggestion.applied ? 'applied' : ''}`}>
      <div className="suggestion-header" onClick={() => setExpanded(!expanded)}>
        <div className="confidence-badge">
          {suggestion.confidence > 0.8 ? '🟢' : suggestion.confidence > 0.5 ? '🟡' : '🔴'}
          {Math.round(suggestion.confidence * 100)}%
        </div>

        <div className="suggestion-content">
          <span className="original">{suggestion.originalText}</span>
          <span className="arrow">→</span>
          <span className="suggested">{suggestion.suggestedName}</span>
        </div>

        {suggestion.applied && <span className="applied-badge">已应用</span>}
      </div>

      {expanded && (
        <div className="suggestion-details">
          <p>元素路径: {suggestion.elementPath}</p>
          {suggestion.details?.formatter && (
            <p>格式化器: {suggestion.details.formatter}</p>
          )}
          {suggestion.details?.loopType && (
            <p>循环类型: {suggestion.details.loopType}</p>
          )}

          {!suggestion.applied && (
            <div className="suggestion-actions">
              <button className="apply-btn" onClick={onApply}>
                应用
              </button>
              <button className="dismiss-btn" onClick={onDismiss}>
                忽略
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIIdentifyPanel;