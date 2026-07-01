import React from 'react';
import {
  CheckOutlined,
  CloseOutlined,
  DownloadOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Space } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface SharedDisplayGroupItem {
  key: string;
  label: string;
}

export interface SharedDisplayGroup {
  label: string;
  items: SharedDisplayGroupItem[];
}

interface TaskOutcomeCardProps {
  executionStatus?: string | null;
  executionId?: string;
  executionStepCount?: number;
  downloadUrl?: string;
  temporalLink?: string;
  executionDetailLink?: string;
  browserExecutionMode: boolean;
  shouldShowTakeoverCard: boolean;
  shouldShowErrorCard: boolean;
  errorMessage?: string;
  failureReason?: string;
  finalResult?: string;
  hasBusinessResult?: boolean;
  shouldShowStructuredResult: boolean;
  structuredResultText?: string | null;
  waitingInputSummary?: string;
  isWaitingInput: boolean;
  isPendingApproval: boolean;
  showRunningState: boolean;
  summaryToDisplay?: string;
  waitingInputGroups: SharedDisplayGroup[];
  waitingInputItems: SharedDisplayGroupItem[];
  approvalAction: 'approve' | 'reject' | null;
  takeoverAction?: 'resume' | null;
  onApproveExecution: () => void;
  onRejectExecution: () => void;
  onResumeExecution?: () => void;
}

const getErrorPreview = (value?: string): string => {
  if (!value) {
    return '任务执行失败，请展开查看具体错误信息。';
  }

  const preview = value
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  return preview || '任务执行失败，请展开查看具体错误信息。';
};

const TaskOutcomeCard: React.FC<TaskOutcomeCardProps> = ({
  executionStatus,
  executionId,
  executionStepCount,
  downloadUrl,
  temporalLink,
  executionDetailLink,
  browserExecutionMode,
  shouldShowTakeoverCard,
  shouldShowErrorCard,
  errorMessage,
  failureReason,
  finalResult,
  hasBusinessResult,
  shouldShowStructuredResult,
  structuredResultText,
  waitingInputSummary,
  isWaitingInput,
  isPendingApproval,
  showRunningState,
  summaryToDisplay,
  waitingInputGroups,
  waitingInputItems,
  approvalAction,
  takeoverAction,
  onApproveExecution,
  onRejectExecution,
  onResumeExecution,
}) => {
  const showDownloadButton = Boolean(downloadUrl && !browserExecutionMode);
  const showDetailButton = Boolean(executionDetailLink || temporalLink);
  const bodySummary = summaryToDisplay;

  const renderResourceLinks = () => (
    <div className="chat-outcome-actions" style={{ marginTop: 12 }}>
      <Space size={12} wrap>
        {showDownloadButton && downloadUrl ? (
          <Button
            type="primary"
            ghost
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => window.open(downloadUrl, '_blank')}
          >
            下载生成的文档
          </Button>
        ) : null}
        {showDetailButton ? (
          <Button
            type="primary"
            ghost
            size="small"
            icon={<ThunderboltOutlined />}
            href={executionDetailLink || temporalLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            导航到详细页面
          </Button>
        ) : null}
      </Space>
    </div>
  );

  const renderMeta = () => (
    <div className="chat-outcome-meta">
      {executionStatus ? <span>状态：{executionStatus}</span> : null}
      {executionId ? <span>执行单 ID：{executionId}</span> : null}
      {executionStepCount !== undefined ? <span>执行步骤数：{executionStepCount}</span> : null}
    </div>
  );

  if (shouldShowTakeoverCard) {
    const detailError = errorMessage || failureReason || '任务正在等待人工处理';
    const previewError = getErrorPreview(detailError);
    return (
      <div className="chat-outcome-card waiting">
        <div className="chat-outcome-title">待人工处理</div>
        {renderMeta()}
        <div className="chat-outcome-body">{previewError}</div>
        {onResumeExecution ? (
          <div className="chat-outcome-actions" style={{ marginTop: 12 }}>
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              loading={takeoverAction === 'resume'}
              onClick={onResumeExecution}
            >
              同意并继续
            </Button>
          </div>
        ) : null}
        {downloadUrl || temporalLink || executionDetailLink ? renderResourceLinks() : null}
        {previewError !== detailError ? (
          <details className="chat-outcome-details">
            <summary>查看详细信息</summary>
            <pre className="chat-structured-result chat-error-details">{detailError}</pre>
          </details>
        ) : null}
      </div>
    );
  }

  if (shouldShowErrorCard) {
    const detailError = errorMessage || failureReason || '任务执行失败';
    const previewError = getErrorPreview(detailError);
    return (
      <div className="chat-outcome-card error">
        <div className="chat-outcome-title">任务失败</div>
        {renderMeta()}
        <div className="chat-outcome-body">{previewError}</div>
        {downloadUrl || temporalLink || executionDetailLink ? renderResourceLinks() : null}
        {previewError !== detailError ? (
          <details className="chat-outcome-details">
            <summary>查看详细错误</summary>
            <pre className="chat-structured-result chat-error-details">{detailError}</pre>
          </details>
        ) : null}
      </div>
    );
  }

  if (finalResult) {
    return (
      <div className="chat-outcome-card success">
        <div className="chat-outcome-title">{hasBusinessResult ? '任务结果' : '任务完成'}</div>
        {renderMeta()}
        <div className="chat-outcome-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalResult}</ReactMarkdown>
        </div>
        {downloadUrl || temporalLink ? renderResourceLinks() : null}
        {shouldShowStructuredResult && structuredResultText ? (
          <details className="chat-outcome-details">
            <summary>查看结构化结果</summary>
            <pre className="chat-structured-result">{structuredResultText}</pre>
          </details>
        ) : null}
      </div>
    );
  }

  if (showRunningState && !isWaitingInput && !isPendingApproval) {
    return null;
  }

  if (!waitingInputSummary && !bodySummary && !showRunningState) {
    return null;
  }

  return (
    <div className={`chat-outcome-card ${isWaitingInput || isPendingApproval ? 'waiting' : 'neutral'}`}>
      <div className={`chat-outcome-title ${showRunningState ? 'running' : ''}`}>
        {showRunningState ? <LoadingOutlined className="chat-running-icon" /> : null}
        {isWaitingInput
          ? '等待输入'
          : isPendingApproval
            ? '等待审批'
            : showRunningState
              ? executionId || executionStatus
                ? '执行中'
                : '规划中'
              : '任务状态'}
      </div>
      {renderMeta()}
      {bodySummary ? (
        <div className="chat-outcome-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodySummary}</ReactMarkdown>
        </div>
      ) : null}
      {downloadUrl || temporalLink ? renderResourceLinks() : null}
      {isWaitingInput && waitingInputItems.length > 0 ? (
        <div className="chat-outcome-body">
          <div>请补充以下信息：</div>
          {waitingInputGroups.length > 0 ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {waitingInputGroups.map((group) => (
                <div
                  key={group.label}
                  style={{
                    border: '1px solid var(--bg-secondary)',
                    borderRadius: 12,
                    padding: 12,
                    background: 'var(--bg-card)',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{group.label}</div>
                  <ul
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      columnGap: 16,
                      rowGap: 6,
                      paddingLeft: 20,
                      marginBottom: 0,
                    }}
                  >
                    {group.items.map((item) => (
                      <li key={item.key} style={{ minWidth: 0 }}>
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                columnGap: 16,
                rowGap: 6,
                paddingLeft: 20,
                marginBottom: 0,
              }}
            >
              {waitingInputItems.map((item) => (
                <li key={item.key} style={{ minWidth: 0 }}>
                  {item.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {isPendingApproval && executionId ? (
        <div className="chat-outcome-actions">
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            loading={approvalAction === 'approve'}
            onClick={onApproveExecution}
          >
            批准
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            loading={approvalAction === 'reject'}
            onClick={onRejectExecution}
          >
            驳回
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default TaskOutcomeCard;
