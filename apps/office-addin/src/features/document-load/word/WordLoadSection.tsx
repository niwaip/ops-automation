import React from 'react';
import { SampleDocumentUploadPanel } from '../shared/SampleDocumentUploadPanel';

type SampleUploadState = {
  uploaded: boolean;
  revision: number;
  fileName?: string;
  fileSize?: number;
  fileBase64?: string;
};

interface WordLoadSectionProps {
  stepCollapsed: boolean;
  onToggleStep: () => void;
  sampleUploadState: SampleUploadState;
  uploadStatusLabel: string;
  uploadStatusTone?: 'default' | 'success';
  understandingActionHint: string;
  understandingStatusLabel: string;
  understandingStatusTone: string;
  understandingCacheTimeText: string;
  understandingCacheDescription: string;
  isUnderstanding: boolean;
  understandingSummaryCollapsed: boolean;
  understandingSummaryText: string;
  hasDisplayedUnderstandingSummary: boolean;
  onToggleUnderstandingSummary: () => void;
  onStartUnderstanding: () => void;
  onUploadStateChange: (nextState: SampleUploadState) => void;
}

export const WordLoadSection: React.FC<WordLoadSectionProps> = ({
  stepCollapsed,
  onToggleStep,
  sampleUploadState,
  uploadStatusLabel,
  uploadStatusTone,
  understandingActionHint,
  understandingStatusLabel,
  understandingStatusTone,
  understandingCacheTimeText,
  understandingCacheDescription,
  isUnderstanding,
  understandingSummaryCollapsed,
  understandingSummaryText,
  hasDisplayedUnderstandingSummary,
  onToggleUnderstandingSummary,
  onStartUnderstanding,
  onUploadStateChange,
}) => (
  <section className="word-step-card">
    <button
      type="button"
      className="word-step-card-header word-step-card-toggle"
      onClick={onToggleStep}
    >
      <div>
        <div className="word-step-card-index">步骤 1</div>
        <h3>上传参考示例文件</h3>
      </div>
      <div className="word-step-card-toggle-meta">
        <span>{stepCollapsed ? '展开' : '收起'}</span>
      </div>
    </button>
    {!stepCollapsed && (
      <div className="word-sample-upload-section">
        <SampleDocumentUploadPanel
          currentUploadState={sampleUploadState}
          uploadStatusLabel={uploadStatusLabel}
          uploadStatusTone={uploadStatusTone}
          uploadActionSlot={(
            <div className="word-understanding-inline-actions">
              <div className="word-understanding-inline-header">
                <div className="word-understanding-inline-copy">
                  <div className="word-understanding-inline-title">全文理解</div>
                  <div className="word-understanding-inline-description">{understandingActionHint}</div>
                </div>
                <span className={`word-tag ${understandingStatusTone || ''}`}>{understandingStatusLabel}</span>
              </div>
              <div className="word-understanding-inline-toolbar">
                <button
                  type="button"
                  className="sheet-action-btn sheet-action-btn-primary"
                  onClick={onStartUnderstanding}
                  disabled={isUnderstanding || uploadStatusLabel !== '已上传'}
                >
                  {isUnderstanding
                    ? '理解中...'
                    : hasDisplayedUnderstandingSummary
                      ? '重新理解全文'
                      : '理解全文'}
                </button>
                {understandingCacheTimeText && (
                  <span className="word-tag">缓存于 {understandingCacheTimeText}</span>
                )}
              </div>
              <div className="word-understanding-inline-footnote">{understandingCacheDescription}</div>
            </div>
          )}
          onUploadStateChange={onUploadStateChange}
        />
        {hasDisplayedUnderstandingSummary && (
          <div className="word-sample-understanding-summary">
            <button
              type="button"
              className="word-summary-collapse-btn"
              onClick={onToggleUnderstandingSummary}
            >
              <span>全文理解摘要</span>
              <span>{understandingSummaryCollapsed ? '展开' : '收起'}</span>
            </button>
            {!understandingSummaryCollapsed && (
              <div className="word-sample-understanding-summary-text">
                {understandingSummaryText}
              </div>
            )}
          </div>
        )}
      </div>
    )}
  </section>
);
