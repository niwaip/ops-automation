/**
 * ChatMessage
 * 单条消息渲染组件 - 支持Markdown渲染和思考折叠
 */

import React, { useMemo, useState } from 'react';
import { Avatar, Button, Space, Switch, Tag, message as antdMessage } from 'antd';
import { UserOutlined, RobotOutlined, FileTextOutlined, DownOutlined, RightOutlined, CopyOutlined, RedoOutlined, CheckOutlined, CloseOutlined, LoadingOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from './types';
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

  // 提取所有思考内容
  let match;
  while ((match = thoughtRegex.exec(content)) !== null) {
    thoughts.push(`💭 思考: ${match[1].trim()}`);
  }
  while ((match = actionRegex.exec(content)) !== null) {
    thoughts.push(`🔧 行动: ${match[1].trim()}`);
  }
  while ((match = observationRegex.exec(content)) !== null) {
    // 观察内容通常是模型回复，不作为思考过程
  }

  // 移除思考/行动/观察标签，保留最终回答
  answer = content
    .replace(thoughtRegex, '')
    .replace(actionRegex, '')
    .replace(observationRegex, '')
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

const ChatMessageComponent: React.FC<ChatMessageProps> = ({
  message,
  isStreaming,
  streamingContent,
  onRetry,
  onApproveExecution,
  onRejectExecution,
}) => {
  const [thoughtsExpanded, setThoughtsExpanded] = useState(true); // 默认展开思考内容
  const [taskCompleted, setTaskCompleted] = useState(true);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | null>(null);
  const isUser = message.role === 'user';
  const rawContent = isStreaming && streamingContent ? streamingContent : message.content;
  const isWaitingInput = message.metadata?.taskStatus === 'waiting_input';
  const isPendingApproval = message.metadata?.taskStatus === 'pending_approval';
  const finalResult = message.metadata?.finalResult?.trim();
  const finalResultData = message.metadata?.finalResultData;
  const finalSummary = message.metadata?.finalSummary?.trim();
  const errorMessage = message.metadata?.errorMessage?.trim();
  const errorPreview = getErrorPreview(errorMessage);
  const hasBusinessResult = message.metadata?.hasBusinessResult;
  const executionId = message.metadata?.executionId;
  const executionStatus = formatExecutionStatus(message.metadata?.executionStatus);
  const isRunning = message.metadata?.taskStatus === 'running';
  const showRunningState = isRunning || (Boolean(isStreaming) && !isWaitingInput && !isPendingApproval && !errorMessage);
  const missingInputs = (message.metadata?.missingInputs || []).filter((item) => item?.missing !== false);
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

  // 解析内容
  const { thoughts, answer } = parseMessageContent(rawContent);
  const answerWithoutTaskCheckbox = useMemo(
    () => {
      const cleaned = answer.replace(/\n?- \[x\]\s*任务完成（可改为未完成）\s*$/m, '').trim();
      return fixLocalhostLink(cleaned) || '';
    },
    [answer],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(answerWithoutTaskCheckbox || rawContent);
      antdMessage.success('已复制');
    } catch {
      antdMessage.error('复制失败');
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
    const downloadUrl = fixLocalhostLink(message.metadata?.downloadUrl);
    if (!downloadUrl) return null;

    return (
      <div className="chat-message-download">
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
          点击下载文档
        </a>
      </div>
    );
  };

  // 渲染思考过程（可折叠）
  const renderThoughts = () => {
    if (thoughts.length === 0 || isUser) return null;

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
              <div key={idx} className="chat-thought-step">{thought}</div>
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

    if (!answerWithoutTaskCheckbox) {
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
          {answerWithoutTaskCheckbox}
        </ReactMarkdown>
        {isStreaming && <span className="streaming-indicator">...</span>}
      </div>
    );
  };

  const renderOutcomeCard = () => {
    if (isUser) return null;

    if (errorMessage) {
      return (
        <div className="chat-outcome-card error">
          <div className="chat-outcome-title">任务失败</div>
          <div className="chat-outcome-meta">
            {executionStatus && <span>状态：{executionStatus}</span>}
            {executionId && <span>执行单 ID：{executionId}</span>}
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
      const fixedFinalResult = fixLocalhostLink(finalResult);
      return (
        <div className="chat-outcome-card success">
          <div className="chat-outcome-title">{hasBusinessResult ? '任务结果' : '任务完成'}</div>
          <div className="chat-outcome-meta">
            {executionStatus && <span>状态：{executionStatus}</span>}
            {executionId && <span>执行单 ID：{executionId}</span>}
          </div>
          <div className="chat-outcome-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {fixedFinalResult || ''}
            </ReactMarkdown>
          </div>
          {shouldShowStructuredResult && (
            <details className="chat-outcome-details">
              <summary>查看结构化结果</summary>
              <pre className="chat-structured-result">{structuredResultText}</pre>
            </details>
          )}
        </div>
      );
    }

    if (finalSummary) {
      return (
        <div className={`chat-outcome-card ${isWaitingInput || isPendingApproval ? 'waiting' : 'neutral'}`}>
          <div className={`chat-outcome-title ${showRunningState ? 'running' : ''}`}>
            {showRunningState && <LoadingOutlined className="chat-running-icon" />}
            {isWaitingInput ? '等待输入' : isPendingApproval ? '等待审批' : showRunningState ? '执行中' : '任务状态'}
          </div>
          <div className="chat-outcome-meta">
            {executionStatus && <span>状态：{executionStatus}</span>}
            {executionId && <span>执行单 ID：{executionId}</span>}
          </div>
          <div className="chat-outcome-body">{finalSummary}</div>
          {isWaitingInput && missingInputs.length > 0 && (
            <div className="chat-outcome-body">
              <div>请补充以下参数：</div>
              <ul>
                {missingInputs.map((item, index) => (
                  <li key={`${item.name || 'missing'}-${index}`}>
                    {item.name || '未命名参数'}
                    {item.description ? `：${item.description}` : ''}
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

  return (
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
          {renderFiles()}
          {renderDownloadLink()}
        </div>

        <div className={`chat-message-meta ${isUser ? 'user' : 'assistant'}`}>
          {!isUser && (
            <div className="chat-message-actions">
              <Space size={8}>
                <Button size="small" type="text" icon={<CopyOutlined />} onClick={handleCopy}>
                  复制
                </Button>
                {onRetry && (
                  <Button size="small" type="text" icon={<RedoOutlined />} onClick={() => onRetry(message.id)}>
                    重试
                  </Button>
                )}
                {(answer.includes('任务完成') || message.metadata?.taskStatus === 'completed') && (
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
  );
};

export default ChatMessageComponent;
