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
  skillName?: string;
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
  takeoverAction?: string | null;
  onApproveExecution: () => void;
  onRejectExecution: () => void;
  onResumeExecution?: () => void;
}

export const getErrorPreview = (value?: string): string => {
  if (!value) {
    return '任务执行失败，请展开查看具体错误信息。';
  }

  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const reasonLine = lines.find((line) => /^原因[:：]\s*\S/.test(line));
  if (reasonLine) {
    return reasonLine.replace(/^原因[:：]\s*/, '');
  }

  const preview = lines.find(
    (line) =>
      !/^(?:❌\s*)?任务执行失败[。！!]?$/.test(line) &&
      !/^状态[:：]/.test(line) &&
      !/^执行单\s*ID[:：]/i.test(line)
  );

  return preview || lines[0] || '任务执行失败，请展开查看具体错误信息。';
};

const getStructuredResultPreview = (value?: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as {
      result?: unknown;
      output?: {
        result?: unknown;
      };
    };

    if (typeof parsed.result === 'string' && parsed.result.trim().length > 0) {
      return parsed.result.trim();
    }

    if (typeof parsed.output?.result === 'string' && parsed.output.result.trim().length > 0) {
      return parsed.output.result.trim();
    }
  } catch {
    return undefined;
  }

  return undefined;
};

const TaskOutcomeCard: React.FC<TaskOutcomeCardProps> = ({
  executionStatus,
  executionId,
  executionStepCount,
  skillName,
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
  onApproveExecution,
  onRejectExecution,
}) => {
  const showDownloadButton = Boolean(downloadUrl && !browserExecutionMode);
  const showDetailButton = Boolean(executionDetailLink || temporalLink);
  const normalizedSkillName = skillName?.trim();
  const displaySuccessResult = finalResult?.trim() || getStructuredResultPreview(structuredResultText);
  const sanitizeWaitingInputSummary = (summary?: string): string | undefined => {
    if (!summary) {
      return undefined;
    }

    const filteredLines = summary
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter(
        (line) =>
          !/^状态[:：]/.test(line) &&
          !/^执行单 ID[:：]/.test(line) &&
          !/^请补充以下信息[:：]?$/.test(line) &&
          !/^请补充[:：]/.test(line) &&
          !/^补充后我就继续处理。?$/.test(line) &&
          !/^还需要补充[:：]/.test(line) &&
          !/^缺少业务组[:：]/.test(line) &&
          !/^仍缺少业务组[:：]/.test(line) &&
          !/^字段兜底[:：]/.test(line) &&
          !/^缺少参数[:：]/.test(line) &&
          !/^待补字段[:：]?$/.test(line)
      );

    if (filteredLines.length === 0) {
      return undefined;
    }

    return filteredLines.join('\n\n');
  };
  const bodySummary =
    isWaitingInput && waitingInputItems.length > 0
      ? sanitizeWaitingInputSummary(waitingInputSummary || summaryToDisplay)
      : waitingInputSummary || summaryToDisplay;

  const renderResourceLinks = ({
    detailButtonText = '查看执行详情',
    showDetailAction = true,
  }: {
    detailButtonText?: string;
    showDetailAction?: boolean;
  } = {}) => (
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
        {showDetailAction && showDetailButton ? (
          <Button
            type="primary"
            ghost
            size="small"
            icon={<ThunderboltOutlined />}
            href={executionDetailLink || temporalLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            {detailButtonText}
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
    const detailError = summaryToDisplay || errorMessage || failureReason || '任务正在等待人工处理';
    const previewError = getErrorPreview(detailError);
    return (
      <div className="chat-outcome-card waiting">
        <div className="chat-outcome-title">待人工处理</div>
        {renderMeta()}
        <div className="chat-outcome-body">{previewError}</div>
        {showDetailButton ? (
          <div className="chat-outcome-actions" style={{ marginTop: 12 }}>
            <Button
              type="primary"
              size="small"
              icon={<ThunderboltOutlined />}
              href={executionDetailLink || temporalLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              到执行页处理
            </Button>
          </div>
        ) : null}
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

  if (displaySuccessResult) {
    return (
      <div className="chat-outcome-card success">
        <div className="chat-outcome-header">
          <div className="chat-outcome-title">{hasBusinessResult ? '任务结果' : '任务完成'}</div>
          {showDetailButton ? (
            <Button
              type="primary"
              ghost
              size="small"
              icon={<ThunderboltOutlined />}
              href={executionDetailLink || temporalLink}
              target="_blank"
              rel="noopener noreferrer"
              className="chat-outcome-detail-button"
            >
              详细
            </Button>
          ) : null}
        </div>
        {renderMeta()}
        {normalizedSkillName ? (
          <div className="chat-outcome-overview-skill">
            <div className="chat-outcome-overview-label">技能</div>
            <div className="chat-outcome-overview-skill-pill">{normalizedSkillName}</div>
          </div>
        ) : null}
        <div className="chat-outcome-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{displaySuccessResult}</ReactMarkdown>
        </div>
        {showDownloadButton ? renderResourceLinks({ showDetailAction: false }) : null}
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
        <div className="chat-outcome-input-panel">
          <div className="chat-outcome-input-heading">请补充以下信息</div>
          {waitingInputGroups.length > 0 ? (
            <div className="chat-outcome-input-groups">
              {waitingInputGroups.map((group: SharedDisplayGroup) => (
                <div key={group.label} className="chat-outcome-input-group">
                  <div className="chat-outcome-input-group-title">{group.label}</div>
                  <ul className="chat-outcome-input-list">
                    {group.items.map((item: SharedDisplayGroupItem) => (
                      <li key={item.key}>
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className="chat-outcome-input-list">
              {waitingInputItems.map((item: SharedDisplayGroupItem) => (
                <li key={item.key}>
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
