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
import { normalizeTabSeparatedTable } from '../lib/tableNormalizer';
import { HtmlPreviewBlock } from './HtmlPreviewBlock';

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
  pendingOutboundEffects?: Array<{
    effectId: string;
    capabilityKey: string;
    idempotencyKey: string;
    payloadHash: string;
    canonicalPayload?: Record<string, unknown> | null;
    stepId?: string;
  }>;
  onFetchPendingEffects?: (executionId: string) => Promise<Array<any>>;
  onApproveExecution: (effectId?: string, approvedPayloadHash?: string) => void;
  onRejectExecution: (effectId?: string) => void;
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

const renderMarkdownLink = ({
  href,
  children,
  onClick,
  ...props
}: React.ComponentPropsWithoutRef<'a'>) => {
  const isWorkspaceLink = Boolean(href?.includes('/workspaces') && href?.includes('fileId='));
  if (isWorkspaceLink) {
    return (
      <span
        role="button"
        tabIndex={0}
        style={{
          color: 'var(--primary-color, #1677ff)',
          textDecoration: 'underline',
          wordBreak: 'break-all',
          fontWeight: 500,
          cursor: 'pointer',
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const fileIdMatch = href?.match(/[?&]fileId=([^&]+)/);
          const wsMatch = href?.match(/[?&]workspaceId=([^&]+)/);
          const fileId = fileIdMatch ? decodeURIComponent(fileIdMatch[1]) : '';
          const workspaceId = wsMatch ? decodeURIComponent(wsMatch[1]) : undefined;
          if (fileId && typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('open-workspace-preview', {
                detail: {
                  fileId,
                  workspaceId,
                  fileName: typeof children === 'string' ? children : undefined,
                },
              })
            );
          }
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: 'var(--primary-color, #1677ff)',
        textDecoration: 'underline',
        wordBreak: 'break-all',
        fontWeight: 500,
      }}
      onClick={onClick}
      {...props}
    >
      {children}
    </a>
  );
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
  pendingOutboundEffects,
  onFetchPendingEffects,
  onApproveExecution,
  onRejectExecution,
}) => {
  const [internalEffects, setInternalEffects] = React.useState<TaskOutcomeCardProps['pendingOutboundEffects'] | null>(null);
  const [isLoadingEffects, setIsLoadingEffects] = React.useState<boolean>(false);

  React.useEffect(() => {
    let isCancelled = false;
    if (isPendingApproval && executionId && (!pendingOutboundEffects || pendingOutboundEffects.length === 0)) {
      setIsLoadingEffects(true);
      const fetchPromise = onFetchPendingEffects
        ? onFetchPendingEffects(executionId)
        : fetch(`/api/executions/${executionId}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => data?.pendingOutboundEffects || []);

      fetchPromise
        .then((effects) => {
          if (!isCancelled && Array.isArray(effects)) {
            setInternalEffects(effects);
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setInternalEffects([]);
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoadingEffects(false);
          }
        });
    } else {
      setIsLoadingEffects(false);
    }
    return () => {
      isCancelled = true;
    };
  }, [isPendingApproval, executionId, pendingOutboundEffects, onFetchPendingEffects]);

  const effectivePendingEffects =
    pendingOutboundEffects && pendingOutboundEffects.length > 0
      ? pendingOutboundEffects
      : internalEffects || [];

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
    const isPermissionError =
      /权限|申请授权|permission|forbidden/i.test(detailError) ||
      /权限|申请授权|permission|forbidden/i.test(previewError);

    return (
      <div className="chat-outcome-card error">
        <div className="chat-outcome-title">任务失败</div>
        {renderMeta()}
        <div className="chat-outcome-body">{previewError}</div>
        {isPermissionError ? (
          <div className="chat-outcome-actions" style={{ marginTop: 12 }}>
            <Button
              type="primary"
              size="small"
              icon={<ThunderboltOutlined />}
              href="/published-skills"
            >
              前往技能中心申请授权
            </Button>
          </div>
        ) : null}
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
        {normalizedSkillName &&
        !['result', 'results', 'generic', 'tool_execution', 'flow_execute', 'skill-match'].includes(
          normalizedSkillName.toLowerCase()
        ) ? (
          <div className="chat-outcome-overview-skill">
            <div className="chat-outcome-overview-label">技能</div>
            <div className="chat-outcome-overview-skill-pill">{normalizedSkillName}</div>
          </div>
        ) : null}

        <div className="chat-outcome-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }: { children?: React.ReactNode }) => (
                <div className="markdown-table-wrapper">
                  <table>{children}</table>
                </div>
              ),
              a: renderMarkdownLink,
              code: ({
                className,
                children,
                ...props
              }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) => {
                const match = /language-(\w+)/.exec(className || '');
                const codeText = String(children || '');
                if (
                  match &&
                  match[1] === 'html' &&
                  (codeText.includes('<!DOCTYPE html') ||
                    codeText.includes('<html') ||
                    codeText.includes('class="slide') ||
                    codeText.includes('presentation') ||
                    codeText.includes('guizang') ||
                    codeText.includes('diff-ins') ||
                    codeText.includes('diff-del'))
                ) {
                  return <HtmlPreviewBlock code={codeText.trim()} className={className} isStreaming={showRunningState} />;
                }

                return match ? (
                  <pre className={`code-block language-${match[1]}`}>
                    <code {...props}>{children}</code>
                  </pre>
                ) : (
                  <code className="inline-code" {...props}>
                    {children}
                  </code>
                );
              },
              img: ({ src, alt }: { src?: string; alt?: string }) => (
                <img
                  src={src}
                  alt={alt || ''}
                  className="chat-outcome-inline-img"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ),
            }}
          >
            {normalizeTabSeparatedTable(displaySuccessResult || '')}
          </ReactMarkdown>
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
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: renderMarkdownLink,
              code: ({
                className,
                children,
                ...props
              }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) => {
                const match = /language-(\w+)/.exec(className || '');
                const codeText = String(children || '');
                if (
                  match &&
                  match[1] === 'html' &&
                  (codeText.includes('<!DOCTYPE html') ||
                    codeText.includes('<html') ||
                    codeText.includes('class="slide') ||
                    codeText.includes('presentation') ||
                    codeText.includes('guizang') ||
                    codeText.includes('diff-ins') ||
                    codeText.includes('diff-del'))
                ) {
                  return <HtmlPreviewBlock code={codeText.trim()} className={className} isStreaming={showRunningState} />;
                }

                return match ? (
                  <pre className={`code-block language-${match[1]}`}>
                    <code {...props}>{children}</code>
                  </pre>
                ) : (
                  <code className="inline-code" {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {normalizeTabSeparatedTable(bodySummary)}
          </ReactMarkdown>
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
      {isPendingApproval && isLoadingEffects ? (
        <div
          className="chat-outcome-outbound-loading"
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 6,
            background: 'rgba(0, 0, 0, 0.02)',
            border: '1px dashed #d9d9d9',
            fontSize: 12,
            color: '#666',
          }}
        >
          <Space>
            <LoadingOutlined />
            <span>正在加载待审批外发操作详情...</span>
          </Space>
        </div>
      ) : null}
      {isPendingApproval && !isLoadingEffects && effectivePendingEffects.length > 0 ? (
        <div
          className="chat-outcome-outbound-preview"
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 6,
            background: 'rgba(0, 0, 0, 0.02)',
            border: '1px solid #d9d9d9',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            待审批外发操作 ({effectivePendingEffects.length})
          </div>
          {effectivePendingEffects.map((effect) => (
            <div key={effect.effectId} style={{ marginBottom: 8, fontSize: 12 }}>
              <div>
                <strong>能力: </strong>
                <code>{effect.capabilityKey}</code>
              </div>
              <div style={{ wordBreak: 'break-all', marginTop: 2 }}>
                <strong>载荷哈希: </strong>
                <code>{effect.payloadHash}</code>
              </div>
              {effect.canonicalPayload ? (
                <div style={{ marginTop: 4 }}>
                  <strong>请求载荷:</strong>
                  <pre
                    style={{
                      margin: '4px 0 0',
                      padding: 8,
                      background: '#f5f5f5',
                      borderRadius: 4,
                      maxHeight: 160,
                      overflow: 'auto',
                      fontSize: 11,
                    }}
                  >
                    {JSON.stringify(effect.canonicalPayload, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {isPendingApproval && executionId ? (
        <div className="chat-outcome-actions">
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            loading={approvalAction === 'approve'}
            disabled={isLoadingEffects}
            onClick={() => {
              const first = effectivePendingEffects[0];
              onApproveExecution(first?.effectId, first?.payloadHash);
            }}
          >
            批准
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            loading={approvalAction === 'reject'}
            disabled={isLoadingEffects}
            onClick={() => {
              const first = effectivePendingEffects[0];
              onRejectExecution(first?.effectId);
            }}
          >
            驳回
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default TaskOutcomeCard;
