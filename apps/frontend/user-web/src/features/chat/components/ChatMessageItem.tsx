import { ClockCircleOutlined, LoadingOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import { App, Avatar, List, Typography } from 'antd';
import type { ChatMessage } from '@ops/user-core';
import SharedChatMessageActions from '@chat-web/components/ChatMessageActions';
import SharedContentPartsRenderer from '@chat-web/components/ContentPartsRenderer';
import SharedMessageContentRenderer from '@chat-web/components/MessageContentRenderer';
import SharedThoughtProcessPanel from '@chat-web/components/ThoughtProcessPanel';
import { copyTextToClipboard } from '../../../adapters/platform/browserClipboard';
import { dedupeThoughtTexts, normalizeComparableMessageText } from '../lib/messageState';
import { parseMessageContent, summarizeThoughts } from '../lib/messageContent';
import { formatMessageTimestamp } from '../lib/messageDisplay';
import {
  getMessageStatusLabel,
  getStatusTagColor,
  resolveMessageExecutionId,
  resolveMessageTaskStatus,
} from '../lib/taskStatus';
import { toStructuredResultText } from '../lib/messageDisplay';
import { resolveTaskParts } from '@chat-web/lib/contentParts';
import {
  hasTaskOutcomeContent,
  TaskOutcomeBlock,
  TaskProgressBlock,
} from './TaskMessageBlocks';
import { SaveWorkflowAction } from './workflow-save/SaveWorkflowAction';
import styles from '../pages/ChatPage.module.css';

interface ChatMessageItemProps {
  message: ChatMessage;
  actionLoadingByMessage: Record<string, 'approve' | 'reject' | undefined>;
  expandedThought: boolean;
  onToggleThought: (messageId: string) => void;
  onApproveExecution: (messageId: string, executionId: string) => void;
  onRejectExecution: (messageId: string, executionId: string) => void;
  onRetry?: (message: ChatMessage) => void;
}

export function ChatMessageItem({
  message,
  actionLoadingByMessage,
  expandedThought,
  onToggleThought,
  onApproveExecution,
  onRejectExecution,
  onRetry,
}: ChatMessageItemProps) {
  const { message: toast } = App.useApp();
  const resolvedTaskStatus = resolveMessageTaskStatus(message);
  const statusLabel = getMessageStatusLabel(resolvedTaskStatus);
  const statusColor = getStatusTagColor(resolvedTaskStatus);
  const hasTaskCard = hasTaskOutcomeContent(message);
  const parsedContent = parseMessageContent(message.content);
  const plainContent = (message.role === 'assistant' ? parsedContent.answer : message.content).trim();
  const hasRenderableContentParts = Boolean(
    message.contentParts?.some((part) =>
      ['text', 'markdown', 'structured_result', 'deeplink', 'file_ref'].includes(part.type)
    )
  );
  const taskParts = resolveTaskParts(message.contentParts);
  const executionId = resolveMessageExecutionId(message);
  const structuredResult = toStructuredResultText(
    message.metadata?.normalizedResult?.structuredData ??
      message.metadata?.finalResultData ??
      taskParts.structuredResultData
  );

  const taskSummaryCandidates = [
    message.metadata?.finalSummary?.trim(),
    message.metadata?.normalizedResult?.summary?.trim(),
    message.metadata?.resultTitle?.trim(),
    message.metadata?.finalResult?.trim(),
    message.metadata?.errorMessage?.trim(),
    message.metadata?.failureReason?.trim(),
    structuredResult?.trim(),
  ].filter((item): item is string => Boolean(item));
  const contentThoughtLogs = message.role === 'assistant' ? parsedContent.thoughts : [];
  const persistedThoughtLogs = message.metadata?.thoughtLogsSnapshot || [];
  const progressThoughtLogs = (message.metadata?.progressLogs || [])
    .filter((log) => log.stage === 'thought')
    .map((log) => log.text.trim())
    .filter(Boolean);
  const thoughtLogs = dedupeThoughtTexts([
    ...persistedThoughtLogs,
    ...progressThoughtLogs,
    ...contentThoughtLogs,
  ]);
  const hasProgressLogs = Boolean(message.metadata?.progressLogs?.length);
  const showThoughtLogs = Boolean(
    message.role === 'assistant' &&
      message.metadata?.showThinking !== false &&
      thoughtLogs.length > 0
  );
  const thoughtSummary = summarizeThoughts(thoughtLogs);
  const shouldPinCollapsedThoughts =
    showThoughtLogs && !message.isStreaming && !expandedThought && hasTaskCard;
  const shouldPinFinishedTaskThoughts =
    showThoughtLogs && !message.isStreaming && hasTaskCard && message.metadata?.mode === 'task';
  const thoughtPanel = showThoughtLogs ? (
    <SharedThoughtProcessPanel
      thoughts={thoughtLogs}
      expanded={expandedThought}
      collapsedSummary={thoughtSummary}
      preserveSummaryWhenCollapsed={!message.isStreaming}
      onToggle={() => onToggleThought(message.id)}
    />
  ) : null;
  const hasDuplicatedTaskSummary = Boolean(
    message.metadata?.mode === 'task' &&
      hasTaskCard &&
      plainContent &&
      taskSummaryCandidates.some(
        (item) =>
          normalizeComparableMessageText(plainContent) === normalizeComparableMessageText(item)
      )
  );
  const isToolExecutionTask = Boolean(
    message.metadata?.mode === 'task' &&
      hasTaskCard &&
      (message.metadata?.skillUsed === 'tool_execution' ||
        message.metadata?.skillUsed === 'flow_execute' ||
        message.metadata?.skillUsed === 'skill-match')
  );

  const shouldShowMessageContent = Boolean(
    (hasRenderableContentParts ||
      (plainContent &&
        !hasDuplicatedTaskSummary &&
        plainContent !== message.metadata?.finalResult?.trim() &&
        plainContent !== message.metadata?.errorMessage?.trim())) &&
      !(message.metadata?.mode === 'task' && hasProgressLogs) &&
      !(isToolExecutionTask && !hasRenderableContentParts)
  );
  const usage = message.metadata?.usage;
  const rateLimit = message.metadata?.rateLimit;
  const showMessageActions = message.role === 'assistant';

  const handleCopyMessage = async () => {
    const copyTarget = [
      message.metadata?.finalSummary,
      message.metadata?.finalResult,
      plainContent,
      message.metadata?.failureReason,
      message.metadata?.errorMessage,
    ].find((item) => typeof item === 'string' && item.trim());
    if (!copyTarget) {
      return;
    }
    try {
      await copyTextToClipboard(copyTarget);
      void toast.success('消息已复制');
    } catch {
      void toast.error('复制失败');
    }
  };

  const isTaskMessage =
    message.role === 'assistant' &&
    (message.metadata?.mode === 'task' || hasTaskCard || hasProgressLogs);

  return (
    <List.Item key={message.id} className={`${styles['user-chat-message-row']} ${styles[`role-${message.role}`] || ''}`}>
      <div className={`${styles['user-chat-message-stack']} ${styles[`role-${message.role}`] || ''} ${isTaskMessage ? styles['has-task-block'] : ''}`}>
        <div className={`${styles['user-chat-message-bubble']} ${styles[`role-${message.role}`] || ''}`}>
          {shouldPinCollapsedThoughts || shouldPinFinishedTaskThoughts ? thoughtPanel : null}
          {hasTaskCard ? (
            <TaskOutcomeBlock
              message={message}
              actionLoadingByMessage={actionLoadingByMessage}
              onApproveExecution={onApproveExecution}
              onRejectExecution={onRejectExecution}
            />
          ) : null}
          <TaskProgressBlock message={message} />
          {!(shouldPinCollapsedThoughts || shouldPinFinishedTaskThoughts) ? thoughtPanel : null}
          {shouldShowMessageContent ? (
            <div className={styles['user-chat-message-content']}>
              {hasRenderableContentParts ? (
                <SharedContentPartsRenderer
                  parts={message.contentParts}
                  isStreaming={Boolean(message.isStreaming)}
                  renderStructuredResult={message.metadata?.mode !== 'task'}
                  renderDeeplink={message.metadata?.mode !== 'task'}
                />
              ) : (
                <SharedMessageContentRenderer
                  content={plainContent}
                  mode={message.role === 'assistant' ? 'markdown' : 'plain'}
                  isStreaming={Boolean(message.isStreaming)}
                />
              )}
            </div>
          ) : null}
        </div>
        <div className={`${styles['user-chat-message-footer']} ${styles[`role-${message.role}`] || ''}`}>
          <div className={`${styles['user-chat-message-meta']} ${styles[`role-${message.role}`] || ''}`}>
            <span className={`${styles['user-chat-message-meta-item']} ${styles['user-chat-message-meta-identity']}`}>
              <Avatar
                icon={message.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                className={`${styles['user-chat-message-avatar']} ${styles.inline} ${styles[message.role] || ''}`}
              />
              <span className={styles['user-chat-message-meta-time']}>
                <ClockCircleOutlined />
                <span>{formatMessageTimestamp(message.timestamp)}</span>
              </span>
            </span>
            {message.isStreaming ? (
              <span className={`${styles['user-chat-message-meta-item']} ${styles['user-chat-message-meta-status']} ${styles['status-processing']}`}>
                <LoadingOutlined spin />
                <span>生成中</span>
              </span>
            ) : null}
            {statusLabel && statusColor && !(message.isStreaming && statusLabel === '进行中') ? (
              <span
                className={`${styles['user-chat-message-meta-item']} ${styles['user-chat-message-meta-status']} ${styles[`status-${statusColor}`] || ''}`}
              >
                <span className={styles['user-chat-message-status-dot']} />
                <span>{statusLabel}</span>
              </span>
            ) : null}
          </div>
          {showMessageActions ? (
            <div className={styles['user-chat-message-actions']}>
              <SharedChatMessageActions
                usage={usage}
                onCopy={() => {
                  void handleCopyMessage();
                }}
                onRetry={onRetry ? () => onRetry(message) : undefined}
                extraContent={
                  <>
                    {!message.isStreaming && resolvedTaskStatus === 'completed' && executionId ? (
                      <SaveWorkflowAction executionId={executionId} />
                    ) : null}
                    {rateLimit?.requests_remaining !== undefined ? (
                      <Typography.Text type="secondary" className={styles['user-chat-usage-text']}>
                        请求剩余: {rateLimit.requests_remaining}
                      </Typography.Text>
                    ) : null}
                    {rateLimit?.tokens_remaining !== undefined ? (
                      <Typography.Text type="secondary" className={styles['user-chat-usage-text']}>
                        Token 剩余: {rateLimit.tokens_remaining}
                      </Typography.Text>
                    ) : null}
                  </>
                }
              />
            </div>
          ) : null}
        </div>
      </div>
    </List.Item>
  );
}
