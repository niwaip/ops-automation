/**
 * ChatMessage
 * 单条消息渲染组件 - 支持Markdown渲染和思考折叠
 */

import React, { useMemo, useState } from 'react';
import { Avatar, Button, Modal, Space, Switch, Tag, Typography, message as antdMessage } from 'antd';
import { UserOutlined, RobotOutlined, FileTextOutlined, DownOutlined, RightOutlined, CopyOutlined, RedoOutlined, CheckOutlined, CloseOutlined, LoadingOutlined, EyeOutlined, DownloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from './types';
import { useAuthStore } from '../../store/authStore';
import './ChatMessage.css';

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingContent?: string;
  onRetry?: (messageId: string) => void;
  onApproveExecution?: (messageId: string, executionId: string) => Promise<void> | void;
  onRejectExecution?: (messageId: string, executionId: string) => Promise<void> | void;
}

// 解析消息内容，分离思考和最终回答
const parseMessageContent = (content: string): { thoughts: string[]; answer: string } => {
  const thoughts: string[] = [];
  let answer = content;

  // 匹配【思考】和【行动】标签
  const thoughtRegex = /【思考】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const actionRegex = /【行动】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const observationRegex = /【观察】([^\n]*(?:\n(?!【)[^\n]*)*)/g;
  const thinkTagRegex = /<think>([\s\S]*?)<\/think>/gi;

  // 提取所有思考内容
  let match;
  while ((match = thoughtRegex.exec(content)) !== null) {
    thoughts.push(`💭 思考: ${match[1].trim()}`);
  }
  while ((match = actionRegex.exec(content)) !== null) {
    thoughts.push(`🔧 行动: ${match[1].trim()}`);
  }
  while ((match = thinkTagRegex.exec(content)) !== null) {
    const thought = match[1].trim();
    if (thought) {
      thoughts.push(`💭 思考: ${thought}`);
    }
  }
  while ((match = observationRegex.exec(content)) !== null) {
    // 观察内容通常是模型回复，不作为思考过程
  }

  // 移除思考/行动/观察标签，保留最终回答
  answer = content
    .replace(thoughtRegex, '')
    .replace(actionRegex, '')
    .replace(observationRegex, '')
    .replace(thinkTagRegex, '')
    .replace(/❌ 错误: [^\n]+/g, '')  // 移除错误信息（如果有）
    .trim();

  // 如果answer为空但有observation内容，使用observation作为answer
  if (!answer) {
    const obsMatch = content.match(/【观察】([^\n]*(?:\n(?!【)[^\n]*)*)/);
    if (obsMatch) {
      answer = obsMatch[1].trim();
    }
  }

  return { thoughts, answer };
};

const formatExecutionStatus = (status?: string): string | null => {
  if (!status) return null;

  const statusMap: Record<string, string> = {
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
    waiting_input: '等待输入',
    running: '执行中',
    queued: '排队中',
    pending_approval: '待审批',
  };

  return statusMap[status] || status;
};

const toStructuredResultText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    return value.trim() || null;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

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

const fixLocalhostLink = (url?: string): string | undefined => {
  if (!url) return undefined;
  // 如果链接包含 localhost，且当前页面不在 localhost，则尝试替换为当前主机的 IP/域名
  if (url.includes('localhost') && window.location.hostname !== 'localhost') {
    return url.replace('localhost', window.location.hostname);
  }
  return url;
};

// 美化文本内容，处理连续换行
const beautifyText = (text: string, useDivider = true): string => {
  if (!text) return '';
  const normalized = text
    .replace(/\r\n/g, '\n') // 统一换行符
    .replace(/[ \t]+\n/g, '\n') // 去除行尾空格
    .replace(/\n\s*\n\s*\n+/g, useDivider ? '\n\n---\n\n' : '\n\n') // 将3个及以上的连续换行替换为分割线或双换行
    .replace(/^[\s\n]+|[\s\n]+$/g, ''); // 去除首尾空白
  return normalized;
};

const looksLikeVerboseExecutionContent = (text?: string): boolean => {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (raw.length > 600) return true;
  return /stepResults|### Ran Playwright code|snapshotId|stdout|executedCommands|任务已完成[,，]?\s*返回结果|```json/i.test(raw);
};

const compactExecutionText = (text?: string): string => {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (looksLikeVerboseExecutionContent(raw)) {
    return '浏览器执行已完成，详细信息请通过下方链接查看。';
  }
  return raw;
};

const getExecutionStepCount = (value: unknown): number | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const candidates = [obj.stepResults, obj.executedCommands, obj.results, obj.steps];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate.length;
    }
  }
  return undefined;
};

const isBrowserExecutionResult = (
  executionId: string | undefined,
  answerText: string,
  finalResultData: unknown,
): boolean => {
  if (!executionId) {
    return false;
  }
  if (looksLikeVerboseExecutionContent(answerText)) {
    return true;
  }
  return getExecutionStepCount(finalResultData) !== undefined;
};

const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message,
  isStreaming,
  streamingContent,
  onRetry,
  onApproveExecution,
  onRejectExecution,
}) => {
  const { Text, Paragraph } = Typography;
  const [thoughtsExpanded, setThoughtsExpanded] = useState(true); // 默认展开思考内容
  const [taskCompleted, setTaskCompleted] = useState(true);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | null>(null);
  const [promptViewerOpen, setPromptViewerOpen] = useState(false);
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const isUser = message.role === 'user';
  const isTaskMode = message.metadata?.mode === 'task';
  const rawContent = isStreaming && streamingContent ? streamingContent : message.content;
  const isWaitingInput = isTaskMode && message.metadata?.taskStatus === 'waiting_input';
  const isPendingApproval = isTaskMode && message.metadata?.taskStatus === 'pending_approval';
  const finalResult = message.metadata?.finalResult?.trim();
  const finalResultData = message.metadata?.finalResultData;
  const finalSummary = message.metadata?.finalSummary?.trim();
  const errorMessage = message.metadata?.errorMessage?.trim();
  const errorPreview = getErrorPreview(errorMessage);
  const hasBusinessResult = message.metadata?.hasBusinessResult;
  const executionId = message.metadata?.executionId;
  const executionStatus = formatExecutionStatus(message.metadata?.executionStatus);
  const usage = message.metadata?.usage;
  const promptDebug = message.metadata?.promptDebug;
  const showThinking = message.metadata?.showThinking !== false;
  const isRunning = isTaskMode && message.metadata?.taskStatus === 'running';
  const showRunningState = isTaskMode && (isRunning || (Boolean(isStreaming) && !isWaitingInput && !isPendingApproval && !errorMessage));
  const missingInputs = (message.metadata?.missingInputs || []).filter((item) => item?.missing !== false);
  const waitingInputLabels = useMemo(
    () => missingInputs
      .map((item) => (item?.description || item?.name || '').trim())
      .filter(Boolean),
    [missingInputs],
  );
  const waitingInputSummary = useMemo(
    () => {
      if (!isWaitingInput || waitingInputLabels.length === 0) {
        return finalSummary;
      }
      return '还需要你补充以下信息后，任务才能继续执行。';
    },
    [finalSummary, isWaitingInput, waitingInputLabels],
  );
  const structuredResultText = useMemo(
    () => toStructuredResultText(finalResultData),
    [finalResultData],
  );
  const shouldShowStructuredResult = Boolean(
    structuredResultText &&
    finalResultData &&
    typeof finalResultData !== 'string' &&
    structuredResultText !== finalResult,
  );
  const canViewPrompt = Boolean(
    !isUser
    && isAdmin
    && promptDebug
    && (promptDebug.systemPrompt || promptDebug.userPrompt),
  );
  const hasDetailedLlmCalls = Boolean(promptDebug?.llmCalls?.length);
  const combinedPromptText = useMemo(
    () => {
      if (!promptDebug) {
        return '';
      }
      return [
        '## Debug Source',
        promptDebug.debugSource || '',
        '',
        '## System Prompt',
        promptDebug.systemPrompt || '',
        '',
        '## User Prompt',
        promptDebug.userPrompt || '',
        '',
        '## Notes',
        (promptDebug.notes || []).join('\n'),
        '',
        '## LLM Request Messages',
        JSON.stringify(promptDebug.llmRequestMessages || [], null, 2),
        '',
        '## LLM Raw Response',
        promptDebug.llmResponseText || '',
        '',
        '## LLM Calls',
        JSON.stringify(promptDebug.llmCalls || [], null, 2),
      ].join('\n');
    },
    [promptDebug],
  );

  // 解析内容
  const { thoughts, answer } = parseMessageContent(rawContent);
  const answerWithoutTaskCheckbox = useMemo(
    () => {
      const cleaned = answer.replace(/\n?- \[x\]\s*任务完成（可改为未完成）\s*$/m, '').trim();
      return beautifyText(fixLocalhostLink(cleaned) || '');
    },
    [answer],
  );
  const hasExecutionContext = Boolean(
    message.metadata?.executionId
    || message.metadata?.executionStatus
    || message.metadata?.temporalLink
    || message.metadata?.taskStatus,
  );
  const compactAnswer = useMemo(
    () => (
      hasExecutionContext
        ? compactExecutionText(answerWithoutTaskCheckbox)
        : answerWithoutTaskCheckbox
    ),
    [hasExecutionContext, answerWithoutTaskCheckbox],
  );
  const executionStepCount = useMemo(
    () => getExecutionStepCount(finalResultData),
    [finalResultData],
  );
  const browserExecutionMode = useMemo(
    () => isBrowserExecutionResult(executionId, answerWithoutTaskCheckbox, finalResultData),
    [executionId, answerWithoutTaskCheckbox, finalResultData],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(answerWithoutTaskCheckbox || rawContent);
      antdMessage.success('已复制');
    } catch {
      antdMessage.error('复制失败');
    }
  };

  const handleCopyPrompt = async () => {
    if (!combinedPromptText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(combinedPromptText);
      antdMessage.success('Prompt 已复制');
    } catch {
      antdMessage.error('Prompt 复制失败');
    }
  };

  const handleApproveExecution = async () => {
    if (!executionId || !onApproveExecution) return;

    try {
      setApprovalAction('approve');
      await onApproveExecution(message.id, executionId);
    } finally {
      setApprovalAction(null);
    }
  };

  const handleRejectExecution = async () => {
    if (!executionId || !onRejectExecution) return;

    try {
      setApprovalAction('reject');
      await onRejectExecution(message.id, executionId);
    } finally {
      setApprovalAction(null);
    }
  };

  // 渲染文件附件
  const renderFiles = () => {
    if (!message.metadata?.files?.length) return null;

    return (
      <div className="chat-message-files">
        {message.metadata.files.map((fileName, idx) => (
          <div key={idx} className="chat-message-file">
            <FileTextOutlined />
            <span>{fileName}</span>
          </div>
        ))}
      </div>
    );
  };

  // 渲染下载链接
  const renderDownloadLink = () => {
    return null; // 已集成到 renderOutcomeCard 中
  };

  // 渲染用量统计
  const renderUsage = () => {
    if (!usage) return null;
    const { prompt_tokens = 0, completion_tokens = 0, total_tokens = 0, completion_tokens_details } = usage;
    if (total_tokens === 0) return null;
    
    const reasoning_tokens = completion_tokens_details?.reasoning_tokens;
    return (
      <div className="chat-message-usage">
        <Space size={4} split={<span className="chat-usage-divider">/</span>}>
          <span className="chat-usage-item">
            <span className="chat-usage-label">Tokens:</span>
            <span className="chat-usage-value">{total_tokens}</span>
          </span>
          <span className="chat-usage-detail">
            输入:{prompt_tokens} 输出:{completion_tokens}{reasoning_tokens ? ` (含推理:${reasoning_tokens})` : ''}
          </span>
        </Space>
      </div>
    );
  };

  // 渲染思考过程（可折叠）
  const renderThoughts = () => {
    if (!showThinking || thoughts.length === 0 || isUser) return null;

    return (
      <div className="chat-thoughts-wrapper">
        <div
          className="chat-thoughts-header"
          onClick={() => setThoughtsExpanded(!thoughtsExpanded)}
        >
          {thoughtsExpanded ? <DownOutlined /> : <RightOutlined />}
          <span className="chat-thoughts-title">
            {thoughtsExpanded ? '隐藏思考过程' : '查看思考过程'}
          </span>
          <span className="chat-thoughts-count">({thoughts.length} 步)</span>
        </div>
        {thoughtsExpanded && (
          <div className="chat-thoughts-content">
            {thoughts.map((thought, idx) => (
              <div key={idx} className="chat-thought-step">{beautifyText(thought, false)}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // 渲染Markdown内容
  const renderContent = () => {
    if (isUser) {
      return <div className="chat-message-plain">{answerWithoutTaskCheckbox}</div>;
    }

    if (isWaitingInput && missingInputs.length > 0) {
      return null;
    }

    if (!compactAnswer) {
      return null;
    }

    return (
      <div className="chat-message-markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // 自定义代码块样式
            code: ({ className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || '');
              return match ? (
                <pre className={`code-block language-${match[1]}`}>
                  <code {...props}>{children}</code>
                </pre>
              ) : (
                <code className="inline-code" {...props}>{children}</code>
              );
            },
            // 自定义表格样式
            table: ({ children }) => (
              <div className="markdown-table-wrapper">
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {compactAnswer}
        </ReactMarkdown>
        {isStreaming && <span className="streaming-indicator">...</span>}
      </div>
    );
  };

  const renderOutcomeCard = () => {
    if (isUser) return null;

    const downloadUrl = fixLocalhostLink(message.metadata?.downloadUrl);
    const temporalLink = fixLocalhostLink(message.metadata?.temporalLink);
    const executionDetailLink = executionId ? `/executions/${executionId}` : undefined;
    const showDownloadButton = Boolean(downloadUrl && !browserExecutionMode);
    const showDetailButton = Boolean(executionDetailLink || temporalLink);
    const renderResourceLinks = () => (
      <div className="chat-outcome-actions" style={{ marginTop: 12 }}>
        <Space size={12} wrap>
          {showDownloadButton && downloadUrl && (
            <Button
              type="primary"
              ghost
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => window.open(downloadUrl, '_blank')}
            >
              下载生成的文档
            </Button>
          )}
          {showDetailButton && (
            <Button
              type="primary"
              ghost
              size="small"
              icon={<ThunderboltOutlined />}
              onClick={() => window.open(executionDetailLink || temporalLink, '_blank')}
            >
              导航到详细页面
            </Button>
          )}
        </Space>
        {temporalLink && (
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">Temporal URL：</Text>
            <Typography.Link href={temporalLink} target="_blank" rel="noopener noreferrer" copyable>
              {temporalLink}
            </Typography.Link>
          </div>
        )}
      </div>
    );

    if (errorMessage) {
      return (
        <div className="chat-outcome-card error">
          <div className="chat-outcome-title">任务失败</div>
          <div className="chat-outcome-meta">
            {executionStatus && <span>状态：{executionStatus}</span>}
            {executionId && <span>执行单 ID：{executionId}</span>}
            {executionStepCount !== undefined && <span>执行步骤数：{executionStepCount}</span>}
          </div>
          <div className="chat-outcome-body">{errorPreview}</div>
          <details className="chat-outcome-details">
            <summary>查看详细错误</summary>
            <pre className="chat-structured-result chat-error-details">{errorMessage}</pre>
          </details>
        </div>
      );
    }

    if (finalResult) {
      const fixedFinalResult = compactExecutionText(beautifyText(fixLocalhostLink(finalResult) || ''));
      return (
        <div className="chat-outcome-card success">
          <div className="chat-outcome-title">{hasBusinessResult ? '任务结果' : '任务完成'}</div>
          <div className="chat-outcome-meta">
            {executionStatus && <span>状态：{executionStatus}</span>}
            {executionId && <span>执行单 ID：{executionId}</span>}
            {executionStepCount !== undefined && <span>执行步骤数：{executionStepCount}</span>}
          </div>
          <div className="chat-outcome-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {fixedFinalResult}
            </ReactMarkdown>
          </div>
          {(downloadUrl || temporalLink) && renderResourceLinks()}
          {shouldShowStructuredResult && (
            <details className="chat-outcome-details">
              <summary>查看结构化结果</summary>
              <pre className="chat-structured-result">{structuredResultText}</pre>
            </details>
          )}
        </div>
      );
    }

    if (finalSummary || waitingInputSummary) {
      const summaryToDisplay = beautifyText(waitingInputSummary || finalSummary || '');
      return (
        <div className={`chat-outcome-card ${isWaitingInput || isPendingApproval ? 'waiting' : 'neutral'}`}>
          <div className={`chat-outcome-title ${showRunningState ? 'running' : ''}`}>
            {showRunningState && <LoadingOutlined className="chat-running-icon" />}
            {isWaitingInput ? '等待输入' : isPendingApproval ? '等待审批' : showRunningState ? '执行中' : '任务状态'}
          </div>
          <div className="chat-outcome-meta">
            {executionStatus && <span>状态：{executionStatus}</span>}
            {executionId && <span>执行单 ID：{executionId}</span>}
            {executionStepCount !== undefined && <span>执行步骤数：{executionStepCount}</span>}
          </div>
          <div className="chat-outcome-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {summaryToDisplay}
            </ReactMarkdown>
          </div>
          {(downloadUrl || temporalLink) && renderResourceLinks()}
          {isWaitingInput && missingInputs.length > 0 && (
            <div className="chat-outcome-body">
              <div>请补充以下信息：</div>
              <ul style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                columnGap: 16,
                rowGap: 6,
                paddingLeft: 20,
                marginBottom: 0,
              }}>
                {missingInputs.map((item, index) => (
                  <li key={`${item.name || 'missing'}-${index}`} style={{ minWidth: 0 }}>
                    {item.description || item.name || '未命名信息'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isPendingApproval && executionId && (
            <div className="chat-outcome-actions">
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                loading={approvalAction === 'approve'}
                onClick={handleApproveExecution}
              >
                批准
              </Button>
              <Button
                danger
                size="small"
                icon={<CloseOutlined />}
                loading={approvalAction === 'reject'}
                onClick={handleRejectExecution}
              >
                驳回
              </Button>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const renderPromptDebugModal = () => {
    if (!promptDebug) {
      return null;
    }

    return (
      <Modal
        title="本轮 Prompt"
        open={promptViewerOpen}
        onCancel={() => setPromptViewerOpen(false)}
        width={960}
        destroyOnHidden
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyPrompt}>
            复制 Prompt
          </Button>,
          <Button key="close" type="primary" onClick={() => setPromptViewerOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <div className="chat-prompt-viewer">
          <Paragraph type="secondary" className="chat-prompt-viewer-hint">
            仅管理员可见，用于查看当前这轮发送给模型的完整 Prompt。
          </Paragraph>
          <div className="chat-prompt-meta-row">
            <Text strong>Debug Source</Text>
            <div className="chat-prompt-tag-list">
              <Tag>{promptDebug.debugSource || 'unknown'}</Tag>
              {promptDebug.modelId ? <Tag>{promptDebug.modelId}</Tag> : null}
            </div>
          </div>
          {(promptDebug.notes || []).length ? (
            <div className="chat-prompt-section">
              <div className="chat-prompt-section-title">Notes</div>
              <pre className="chat-prompt-pre">{(promptDebug.notes || []).join('\n')}</pre>
            </div>
          ) : null}
          <div className="chat-prompt-meta-row">
            <Text strong>System Sections</Text>
            <div className="chat-prompt-tag-list">
              {(promptDebug.systemPromptSectionKeys || []).length ? (
                promptDebug.systemPromptSectionKeys?.map((key) => (
                  <Tag key={`system-${key}`}>{key}</Tag>
                ))
              ) : (
                <Text type="secondary">无</Text>
              )}
            </div>
          </div>
          <div className="chat-prompt-meta-row">
            <Text strong>User Sections</Text>
            <div className="chat-prompt-tag-list">
              {(promptDebug.userPromptSectionKeys || []).length ? (
                promptDebug.userPromptSectionKeys?.map((key) => (
                  <Tag key={`user-${key}`}>{key}</Tag>
                ))
              ) : (
                <Text type="secondary">无</Text>
              )}
            </div>
          </div>
          <div className="chat-prompt-section">
            <div className="chat-prompt-section-title">System Prompt</div>
            <pre className="chat-prompt-pre">{promptDebug.systemPrompt}</pre>
          </div>
          <div className="chat-prompt-section">
            <div className="chat-prompt-section-title">User Prompt</div>
            <pre className="chat-prompt-pre">{promptDebug.userPrompt}</pre>
          </div>
          {!hasDetailedLlmCalls ? (
            <>
              <div className="chat-prompt-section">
                <div className="chat-prompt-section-title">LLM Request Messages</div>
                <pre className="chat-prompt-pre">{JSON.stringify(promptDebug.llmRequestMessages || [], null, 2)}</pre>
              </div>
              <div className="chat-prompt-section">
                <div className="chat-prompt-section-title">LLM Raw Response</div>
                <pre className="chat-prompt-pre">
                  {promptDebug.llmResponseText || '当前仅记录了 Prompt，尚未保存模型原始回复。'}
                </pre>
              </div>
            </>
          ) : null}
          {(promptDebug.llmCalls || []).map((call, index) => (
            <div className="chat-prompt-section" key={`${call.stage}-${index}`}>
              <div className="chat-prompt-section-title">{`LLM Call ${index + 1}: ${call.label}`}</div>
              <pre className="chat-prompt-pre">{JSON.stringify(call.requestMessages || [], null, 2)}</pre>
              <pre className="chat-prompt-pre">{call.responseText || call.note || '当前调用还没有保存 response。'}</pre>
            </div>
          ))}
        </div>
      </Modal>
    );
  };

  return (
    <>
      <div className={`chat-message ${isUser ? 'user' : 'assistant'}`}>
        {!isUser && (
          <Avatar
            icon={<RobotOutlined />}
            className="chat-message-avatar assistant"
          />
        )}

        <div className={`chat-message-stack ${isUser ? 'user' : 'assistant'}`}>
          <div className={`chat-message-content ${isUser ? 'user' : 'assistant'}`}>
            {renderThoughts()}
            {isWaitingInput && (
              <Tag color="gold" className="chat-waiting-tag">
                等待你输入
              </Tag>
            )}
            {showRunningState && (
              <Tag color="processing" className="chat-running-tag">
                <LoadingOutlined className="chat-running-icon" />
                执行中
              </Tag>
            )}
            {isPendingApproval && (
              <Tag color="orange" className="chat-waiting-tag">
                等待你审批
              </Tag>
            )}
            {renderOutcomeCard()}
            {renderContent()}
            {renderDownloadLink()}
            {renderFiles()}
          </div>

          <div className={`chat-message-meta ${isUser ? 'user' : 'assistant'}`}>
            {!isUser && (
              <div className="chat-message-actions">
                <Space size={12}>
                  {renderUsage()}
                  <div className="chat-action-buttons">
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={handleCopy}
                      className="chat-action-btn"
                    >
                      复制
                    </Button>
                    {canViewPrompt && (
                      <Button
                        size="small"
                        type="text"
                        icon={<EyeOutlined />}
                        onClick={() => setPromptViewerOpen(true)}
                        className="chat-action-btn"
                      >
                        查看 Prompt
                      </Button>
                    )}
                    {onRetry && (
                      <Button
                        size="small"
                        type="text"
                        icon={<RedoOutlined />}
                        onClick={() => onRetry(message.id)}
                        className="chat-action-btn"
                      >
                        重试
                      </Button>
                    )}
                  </div>
                  {isTaskMode && (answer.includes('任务完成') || message.metadata?.taskStatus === 'completed') && (
                    <div className="chat-task-switch">
                      <span>任务完成</span>
                      <Switch
                        size="small"
                        checked={taskCompleted}
                        onChange={setTaskCompleted}
                        checkedChildren="是"
                        unCheckedChildren="否"
                      />
                    </div>
                  )}
                </Space>
              </div>
            )}

            <div className="chat-message-time">
              {message.timestamp.toLocaleTimeString()}
            </div>
          </div>
        </div>

        {isUser && (
          <Avatar
            icon={<UserOutlined />}
            className="chat-message-avatar user"
          />
        )}
      </div>
      {renderPromptDebugModal()}
    </>
  );
};

export default ChatMessageComponent;
