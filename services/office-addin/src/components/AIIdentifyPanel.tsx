/**
 * AI 识别面板组件
 * 显示 AI 分析结果和建议，支持一键应用或部分应用
 * 包含详细错误显示和调试日志功能
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
    analysisErrorDetails,
    setAnalyzing,
    setSuggestions,
    setAnalysisError,
    applySuggestion,
    applyAllSuggestions,
    dismissSuggestion,
    templateConfig,
    apiBaseUrl,
    addDebugLog,
    showDebugPanel,
    setShowDebugPanel,
  } = useAppStore();

  const [selectedTemplateType, setSelectedTemplateType] = useState('report');
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  /**
   * 执行 AI 分析
   */
  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalysisError(null);

    addDebugLog('info', `开始 AI 分析`, `API: ${apiBaseUrl}, 模板类型: ${selectedTemplateType}`);

    try {
      // 获取文档内容
      let documentContent = '';
      let documentStructure: any = null;

      addDebugLog('debug', `获取文档内容`, `Office 类型: ${officeType}`);

      if (officeType === 'word') {
        documentContent = await OfficeHelper.Word.getDocumentContent();
        documentStructure = await OfficeHelper.Word.getDocumentStructure();
        addDebugLog('debug', `Word 文档内容获取成功`, `长度: ${documentContent.length}`);
      } else if (officeType === 'excel') {
        const sheetData = await OfficeHelper.Excel.getSheetData();
        documentContent = JSON.stringify(sheetData.values);
        documentStructure = { tables: [], paragraphs: [], images: [] };
        addDebugLog('debug', `Excel 数据获取成功`, `行数: ${sheetData.values?.length || 0}`);
      } else if (officeType === 'ppt') {
        const slidesContent = await OfficeHelper.PowerPoint.getSlidesContent();
        documentContent = JSON.stringify(slidesContent);
        documentStructure = { slides: slidesContent };
        addDebugLog('debug', `PPT 内容获取成功`, `幻灯片数: ${slidesContent?.length || 0}`);
      }

      // 调用 AI 识别 API（使用新的直接识别接口）
      addDebugLog('info', `调用 AI 识别 API`, `URL: ${apiBaseUrl}/studio/direct-ai-identify`);
      carboneAPI.setBaseUrl(apiBaseUrl);

      // 使用新的直接识别接口，无需上传模板
      const result = await carboneAPI.identifyDocumentDirect({
        documentContent,
        documentType: officeType === 'ppt' ? 'pptx' : officeType,
        templateType: selectedTemplateType,
        context: `这是一份${selectedTemplateType}类型的${officeType === 'word' ? 'Word文档' : officeType === 'excel' ? 'Excel表格' : 'PPT演示文稿'}，需要识别空白填充部分并生成模板变量`,
      });

      addDebugLog('info', `AI 分析成功`, `建议数: ${result.suggestions?.length || 0}`);
      setSuggestions(result.suggestions);
    } catch (error: any) {
      // 详细错误信息
      const errorMessage = error.message || 'AI 分析失败';
      let errorDetails = '';

      // 提取更多错误详情
      if (error.response) {
        errorDetails = `状态码: ${error.response.status}\n`;
        errorDetails += `响应数据: ${JSON.stringify(error.response.data, null, 2)}\n`;
        errorDetails += `请求URL: ${error.config?.url || apiBaseUrl}/studio/ai-identify`;
      } else if (error.request) {
        errorDetails = `请求未收到响应\n`;
        errorDetails += `可能原因:\n`;
        errorDetails += `1. 后端服务未启动 (${apiBaseUrl})\n`;
        errorDetails += `2. HTTPS 证书问题（Office 要求 HTTPS）\n`;
        errorDetails += `3. 网络连接问题\n`;
        errorDetails += `4. CORS 配置问题`;
      } else {
        errorDetails = `请求配置错误: ${error.message}\n`;
        errorDetails += `堆栈: ${error.stack || '无'}`;
      }

      addDebugLog('error', errorMessage, errorDetails);
      setAnalysisError(errorMessage, errorDetails);
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * 测试后端连接
   */
  const handleTestConnection = async () => {
    addDebugLog('info', `测试后端连接`, `URL: ${apiBaseUrl}/health`);
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (response.ok) {
        const data = await response.json();
        addDebugLog('info', `连接成功`, JSON.stringify(data));
      } else {
        addDebugLog('error', `连接失败`, `状态码: ${response.status}`);
      }
    } catch (error: any) {
      addDebugLog('error', `连接失败`, error.message);
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
      addDebugLog('info', `应用建议成功`, `${suggestion.originalText} → ${suggestion.suggestedName}`);
    } catch (error: any) {
      addDebugLog('error', '应用建议失败', error.message);
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
      addDebugLog('info', `批量应用完成`, `应用了 ${unapplied.length} 个建议`);
    } catch (error) {
      addDebugLog('error', '批量应用失败', error.message);
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

      {/* 测试连接按钮 */}
      <button
        className="test-connection-btn"
        onClick={handleTestConnection}
        disabled={isAnalyzing}
      >
        🔌 测试连接
      </button>

      {/* 调试面板开关 */}
      <button
        className="debug-toggle-btn"
        onClick={() => setShowDebugPanel(!showDebugPanel)}
      >
        {showDebugPanel ? '隐藏日志' : '显示日志'}
      </button>

      {/* 错误提示 - 改进的显示 */}
      {analysisError && (
        <div className="error-message-container">
          <div className="error-message" onClick={() => setShowErrorDetails(!showErrorDetails)}>
            <span className="error-icon">❌</span>
            <span className="error-text">{analysisError}</span>
            <span className="error-toggle">{showErrorDetails ? '▼' : '▶'}</span>
          </div>
          {showErrorDetails && analysisErrorDetails && (
            <div className="error-details">
              <pre>{analysisErrorDetails}</pre>
            </div>
          )}
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