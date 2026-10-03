import React from 'react';
import {
  CheckOutlined,
  CloseOutlined,
  DownloadOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  LoadingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, Space } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { normalizeTabSeparatedTable } from '../lib/tableNormalizer';
import { HtmlPreviewBlock } from './HtmlPreviewBlock';
import { MarkdownPreviewBlock } from './MarkdownPreviewBlock';

export interface SharedDisplayGroupItem {
  key: string;
  label: string;
}

export interface SharedDisplayGroup {
  label: string;
  items: SharedDisplayGroupItem[];
}

export interface TaskOutcomeArtifactItem {
  name?: string;
  label?: string;
  url?: string;
  downloadUrl?: string;
  mimeType?: string;
  sizeBytes?: number | string;
  type?: string;
  artifactType?: string;
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
  artifacts?: TaskOutcomeArtifactItem[];
}

const isHtmlPreviewBlock = (className?: string, codeText?: string) => {
  const match = /language-(\w+)/.exec(className || '');
  if (!match || match[1] !== 'html' || !codeText) return false;
  return (
    codeText.includes('<!DOCTYPE html') ||
    codeText.includes('<html') ||
    codeText.includes('class="slide') ||
    codeText.includes('presentation') ||
    codeText.includes('guizang') ||
    codeText.includes('diff-ins') ||
    codeText.includes('diff-del')
  );
};

/**
 * Generic schema violation message humanizer for raw technical error strings.
 * Translates standard Ajv keywords and technical prefixes into friendly descriptions
 * without any domain-specific hardcoding.
 */
export const humanizeRawSchemaError = (raw?: string): string | null => {
  if (!raw) return null;
  const match = /(?:Node\s+'(?<nodeId>[^']+)'\s+failed:\s+)?(?<codeType>INPUT_SCHEMA_VIOLATION|OUTPUT_SCHEMA_VIOLATION)(?:\s+for\s+node\s+'(?<nodeId2>[^']+)')?:\s*(?<details>.*)$/s.exec(raw);
  if (!match || !match.groups) {
    return null;
  }
  const isInput = match.groups.codeType === 'INPUT_SCHEMA_VIOLATION';
  const nodeName = match.groups.nodeId || match.groups.nodeId2;
  const rawDetails = match.groups.details || '';

  // Extract common Ajv violations generically
  // e.g. "/ (required): must have required property 'fieldName'"
  const requiredMatch = /\/?\s*\(?required\)?:\s*must have required property\s*'([^']+)'/i.exec(rawDetails);
  if (requiredMatch) {
    const field = requiredMatch[1];
    return `${isInput ? '输入参数校验未通过' : '输出结果校验未通过'}：缺少必填参数【${field}】。`;
  }

  // e.g. "/fieldName (type): must be string"
  const typeMatch = /\/?([a-zA-Z0-9_.-]+)\s*\(?type\)?:\s*must be\s*([a-zA-Z0-9_]+)/i.exec(rawDetails);
  if (typeMatch) {
    return `${isInput ? '输入参数' : '输出结果'}【${typeMatch[1]}】类型错误，期望类型为 ${typeMatch[2]}。`;
  }

  // e.g. "/fieldName (enum): must be equal to one of the allowed values"
  const enumMatch = /\/?([a-zA-Z0-9_.-]+)\s*\(?enum\)?:\s*must be equal to one of the allowed values/i.exec(rawDetails);
  if (enumMatch) {
    return `${isInput ? '输入参数' : '输出结果'}【${enumMatch[1]}】取值不在允许范围内。`;
  }

  return `${isInput ? '输入契约校验未通过' : '输出契约校验未通过'}${nodeName ? `（节点 ${nodeName}）` : ''}。`;
};

export const getErrorPreview = (value?: string): string => {
  if (!value) {
    return '任务执行失败，请展开查看具体错误信息。';
  }

  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const reasonLine = lines.find((line) => /^原因[:：]\s*\S/.test(line));
  const rawCandidate = reasonLine
    ? reasonLine.replace(/^原因[:：]\s*/, '')
    : lines.find(
        (line) =>
          !/^(?:❌\s*)?任务执行失败[。！!]?$/.test(line) &&
          !/^状态[:：]/.test(line) &&
          !/^执行单\s*ID[:：]/i.test(line)
      ) || lines[0] || '任务执行失败，请展开查看具体错误信息。';

  // If candidate contains technical prefix or separator, strip [技术细节] suffix for preview
  const techDetailIdx = rawCandidate.indexOf('[技术细节]');
  const cleanCandidate = techDetailIdx > 0 ? rawCandidate.slice(0, techDetailIdx).trim() : rawCandidate;

  // Generic schema violation humanizer fallback for unformatted raw strings
  const humanized = humanizeRawSchemaError(cleanCandidate);
  if (humanized) {
    return humanized;
  }

  return cleanCandidate;
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
  artifacts,
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

  const htmlArtifact = React.useMemo(() => {
    if (!artifacts || !Array.isArray(artifacts) || artifacts.length === 0) return null;
    return (
      artifacts.find((art) => {
        const name = (art.name || art.label || '').toLowerCase();
        const url = (art.url || art.downloadUrl || '').toLowerCase();
        const mime = (art.mimeType || '').toLowerCase();
        return mime.includes('text/html') || name.endsWith('.html') || url.includes('.html');
      }) || null
    );
  }, [artifacts]);

  const mdArtifact = React.useMemo(() => {
    if (!artifacts || !Array.isArray(artifacts) || artifacts.length === 0) return null;
    return (
      artifacts.find((art) => {
        const name = (art.name || art.label || '').toLowerCase();
        const url = (art.url || art.downloadUrl || '').toLowerCase();
        const mime = (art.mimeType || '').toLowerCase();
        return mime.includes('markdown') || name.endsWith('.md') || url.includes('.md');
      }) || null
    );
  }, [artifacts]);

  const urlArtifacts = React.useMemo(() => {
    if (!artifacts || !Array.isArray(artifacts) || artifacts.length === 0) return [];
    return artifacts.filter((art) => {
      const type = (art.type || art.artifactType || '').toLowerCase();
      const url = art.url || art.downloadUrl;
      return (
        (type === 'url' || type === 'link' || type === 'search_result') &&
        typeof url === 'string' &&
        /^https?:\/\//i.test(url)
      );
    });
  }, [artifacts]);

  const showDownloadButton = Boolean(downloadUrl && !browserExecutionMode);
  const showDetailButton = Boolean(executionDetailLink || temporalLink);
  const normalizedSkillName = skillName?.trim();

  const isUuid = React.useCallback((val?: string) => {
    return (
      typeof val === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim())
    );
  }, []);

  const sanitizeInlineDownloadLines = React.useCallback((text?: string): string => {
    if (!text) return '';
    const lines = text.split('\n');
    const filtered = lines.filter((line) => {
      const trimmed = line.trim();
      return (
        !/^[•\*\-\s]*\*{0,2}(?:下载链接|文件下载|结果下载|产物下载)\*{0,2}[:：]/i.test(trimmed) &&
        !/^[•\*\-\s]*\[(?:点击下载|下载文件|下载文档|下载产物).*\]\(.+\)\s*$/i.test(trimmed)
      );
    });
    return filtered.join('\n');
  }, []);

  const rawSuccessResult = finalResult?.trim() || getStructuredResultPreview(structuredResultText);
  const displaySuccessResult = React.useMemo(() => {
    if (!rawSuccessResult) return '';
    if (showDownloadButton || downloadUrl) {
      return sanitizeInlineDownloadLines(rawSuccessResult);
    }
    return rawSuccessResult;
  }, [rawSuccessResult, showDownloadButton, downloadUrl, sanitizeInlineDownloadLines]);

  const hasInlineHtmlFence = React.useMemo(() => {
    if (!displaySuccessResult) return false;
    return /```html[\s\S]*?```/i.test(displaySuccessResult);
  }, [displaySuccessResult]);
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
    const isInputViolation =
      /INPUT_SCHEMA_VIOLATION|输入参数校验未通过|缺少必填参数/i.test(detailError) ||
      /INPUT_SCHEMA_VIOLATION|输入参数校验未通过|缺少必填参数/i.test(previewError);

    return (
      <div className="chat-outcome-card error">
        <div className="chat-outcome-title">任务失败</div>
        {renderMeta()}
        <div className="chat-outcome-body">{previewError}</div>
        {isInputViolation ? (
          <div
            className="chat-outcome-input-violation-tip"
            style={{
              marginTop: 10,
              padding: '8px 12px',
              borderRadius: 6,
              background: 'rgba(250, 173, 20, 0.08)',
              border: '1px solid rgba(250, 173, 20, 0.25)',
              fontSize: 12,
              color: 'var(--text-secondary, #64748b)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <InfoCircleOutlined style={{ color: '#faad14', flexShrink: 0 }} />
            <span>提示：任务执行缺少必要的前置输入参数，请检查输入配置或补充所需参数。</span>
          </div>
        ) : null}
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
            <summary>查看详细错误与技术追踪</summary>
            <pre className="chat-structured-result chat-error-details">{detailError}</pre>
          </details>
        ) : null}
      </div>
    );
  }

  const hasCompletedArtifact = Boolean(
    (executionStatus === '已完成' ||
      executionStatus === 'completed' ||
      executionStatus === 'succeeded' ||
      !showRunningState) &&
      (htmlArtifact || mdArtifact)
  );

  if (displaySuccessResult || hasCompletedArtifact) {
    return (
      <div className="chat-outcome-card success">
        <div className="chat-outcome-header">
          <div className="chat-outcome-title" style={{ marginBottom: 0 }}>
            {hasBusinessResult ? '任务结果' : '任务完成'}
          </div>
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
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                lineHeight: 1,
              }}
            >
              详细
            </Button>
          ) : null}
        </div>
        {renderMeta()}
        {normalizedSkillName &&
        !isUuid(normalizedSkillName) &&
        !['result', 'results', 'generic', 'tool_execution', 'flow_execute', 'skill-match'].includes(
          normalizedSkillName.toLowerCase()
        ) ? (
          <div className="chat-outcome-overview-skill">
            <div className="chat-outcome-overview-label">技能</div>
            <div className="chat-outcome-overview-skill-pill">{normalizedSkillName}</div>
          </div>
        ) : null}

        {displaySuccessResult ? (
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
                pre: ({ children, className: preClassName, ...props }: React.ComponentPropsWithoutRef<'pre'>) => {
                  const childElement = React.isValidElement(children) ? children : null;
                  const childProps = childElement ? (childElement.props as { className?: string; children?: React.ReactNode }) : null;
                  const codeClassName = childProps?.className || '';
                  const codeText = Array.isArray(childProps?.children)
                    ? childProps.children.join('')
                    : String(childProps?.children || '');

                  if (isHtmlPreviewBlock(codeClassName, codeText)) {
                    return <>{children}</>;
                  }

                  const mergedClass = ['code-block', preClassName, codeClassName].filter(Boolean).join(' ');
                  return (
                    <pre className={mergedClass} {...props}>
                      {children}
                    </pre>
                  );
                },
                code: ({
                  className,
                  children,
                  ...props
                }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) => {
                  const codeText = Array.isArray(children) ? children.join('') : String(children || '');
                  if (isHtmlPreviewBlock(className, codeText)) {
                    return <HtmlPreviewBlock code={codeText.trim()} className={className} isStreaming={showRunningState} />;
                  }

                  return (
                    <code className={className || 'inline-code'} {...props}>
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
        ) : null}

        {/* HTML 产物在线交互预览卡片（当 artifacts 中存在 HTML 且正文中未内联 ```html 代码块时） */}
        {htmlArtifact && !hasInlineHtmlFence ? (
          <HtmlPreviewBlock
            srcUrl={htmlArtifact.url || htmlArtifact.downloadUrl}
            defaultTitle={htmlArtifact.name || htmlArtifact.label}
            sizeBytes={htmlArtifact.sizeBytes}
            defaultExpanded={false}
            isStreaming={showRunningState}
          />
        ) : null}

        {/* Markdown 产物在线阅读卡片（借鉴个人沙箱交互：富文本排版、复制全文、全屏阅读、本地导出） */}
        {mdArtifact ? (
          <MarkdownPreviewBlock
            srcUrl={mdArtifact.url || mdArtifact.downloadUrl}
            fileName={mdArtifact.name || mdArtifact.label}
            sizeBytes={mdArtifact.sizeBytes}
            defaultExpanded={false}
            isStreaming={showRunningState}
          />
        ) : null}
        {/* Web 搜索参考来源卡片 */}
        {urlArtifacts.length > 0 ? (
          <div className="chat-outcome-references" style={{ marginTop: 12 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary, #64748b)',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <GlobalOutlined />
              <span>参考来源 ({urlArtifacts.length})：</span>
            </div>
            <Space wrap size={[6, 6]}>
              {urlArtifacts.map((art, idx) => {
                const targetUrl = art.url || art.downloadUrl || '#';
                const label =
                  art.name ||
                  art.label ||
                  (() => {
                    try {
                      return new URL(targetUrl).hostname;
                    } catch {
                      return `来源 ${idx + 1}`;
                    }
                  })();
                return (
                  <Button
                    key={idx}
                    size="small"
                    type="default"
                    icon={<LinkOutlined />}
                    href={targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chat-outcome-ref-link"
                    style={{
                      fontSize: 12,
                      borderRadius: 6,
                      maxWidth: 320,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={label}
                  >
                    {label}
                  </Button>
                );
              })}
            </Space>
          </div>
        ) : null}

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
              pre: ({ children, className: preClassName, ...props }: React.ComponentPropsWithoutRef<'pre'>) => {
                const childElement = React.isValidElement(children) ? children : null;
                const childProps = childElement ? (childElement.props as { className?: string; children?: React.ReactNode }) : null;
                const codeClassName = childProps?.className || '';
                const codeText = Array.isArray(childProps?.children)
                  ? childProps.children.join('')
                  : String(childProps?.children || '');

                if (isHtmlPreviewBlock(codeClassName, codeText)) {
                  return <>{children}</>;
                }

                const mergedClass = ['code-block', preClassName, codeClassName].filter(Boolean).join(' ');
                return (
                  <pre className={mergedClass} {...props}>
                    {children}
                  </pre>
                );
              },
              code: ({
                className,
                children,
                ...props
              }: React.ComponentPropsWithoutRef<'code'> & { className?: string }) => {
                const codeText = Array.isArray(children) ? children.join('') : String(children || '');
                if (isHtmlPreviewBlock(className, codeText)) {
                  return <HtmlPreviewBlock code={codeText.trim()} className={className} isStreaming={showRunningState} />;
                }

                return (
                  <code className={className || 'inline-code'} {...props}>
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
