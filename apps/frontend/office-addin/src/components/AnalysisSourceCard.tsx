import React from 'react';
import { AnalysisSummary } from './AIIdentifyPanel.helpers';

export const AnalysisSourceCard: React.FC<{
  analysisSummary: AnalysisSummary;
  isExcelMode: boolean;
  analysisSourceLabelMap: Record<string, string>;
}> = ({
  analysisSummary,
  isExcelMode,
  analysisSourceLabelMap,
}) => {
  return (
    <div className={`analysis-source-card ${isExcelMode ? 'analysis-source-card-compact' : ''}`}>
      <div className="analysis-source-header">
        <span className="analysis-source-title">{isExcelMode ? '参数识别结果' : '分析来源'}</span>
        <span className={`analysis-source-badge source-${analysisSummary.resultSource}`}>
          {analysisSourceLabelMap[analysisSummary.resultSource] || analysisSummary.resultSource}
        </span>
      </div>
      <div className="analysis-source-grid">
        <div className="analysis-source-item">
          <span className="analysis-source-label">是否实际发起 AI 调用</span>
          <span className="analysis-source-value">
            {analysisSummary.requestedAI ? '是' : '否'}
            {analysisSummary.requestMode !== 'unknown' ? ` · ${analysisSummary.requestMode}` : ''}
          </span>
        </div>
        
        <div className="analysis-source-item">
          <span className="analysis-source-label">生成结果数</span>
          <span className="analysis-source-value">
            {Object.entries(analysisSummary.sourceCounts)
              .map(([source, count]) => `${analysisSourceLabelMap[source] || source} ${count}`)
              .join('，') || '0'}
          </span>
        </div>

        <div className="analysis-source-item">
          <span className="analysis-source-label">候选参数数</span>
          <span className="analysis-source-value">
            {analysisSummary.pairResults.reduce((acc, pair) => acc + pair.candidateCount, 0)}
          </span>
        </div>

        {analysisSummary.salvagedMalformedJson && (
          <div className="analysis-source-item">
            <span className="analysis-source-label">返回修复状态</span>
            <span className="analysis-source-value">AI 原始返回存在格式问题，已自动修复</span>
          </div>
        )}
      </div>
    </div>
  );
};

