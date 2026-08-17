import type { AppNotification, ChatMessage } from '@ops/user-core';
import type { MessageInstance } from 'antd/es/message/interface';
import { notificationStore } from '@/adapters/notifications/notificationStore';
import {
  resolveMessageExecutionId,
  resolveMessageTaskStatus,
  terminalExecutionStatuses,
  terminalTaskStatuses,
} from './taskStatus';

interface NotifyTaskTerminalStateOptions {
  message: ChatMessage;
  notifiedTaskStateKeys: Set<string>;
  toast: MessageInstance;
}

export const notifyTaskTerminalState = ({
  message,
  notifiedTaskStateKeys,
  toast,
}: NotifyTaskTerminalStateOptions): void => {
  if (message.metadata?.mode !== 'task') {
    return;
  }

  const taskStatus = resolveMessageTaskStatus(message);
  if (!taskStatus || !terminalTaskStatuses.has(taskStatus)) {
    return;
  }

  const executionId = resolveMessageExecutionId(message);
  const executionStatus = message.metadata?.executionStatus?.trim();
  if (executionId && (!executionStatus || !terminalExecutionStatuses.has(executionStatus))) {
    return;
  }
  const dedupeBase = executionId || message.id;
  const dedupeKey = `${dedupeBase}:${taskStatus}`;
  if (notifiedTaskStateKeys.has(dedupeKey)) {
    return;
  }
  notifiedTaskStateKeys.add(dedupeKey);

  const summary =
    message.metadata?.finalSummary?.trim() ||
    message.metadata?.normalizedResult?.summary?.trim() ||
    message.metadata?.resultTitle?.trim() ||
    message.metadata?.finalResult?.trim() ||
    message.metadata?.failureReason?.trim() ||
    message.metadata?.errorMessage?.trim();

  const maybeUpsertNotification = (
    category: AppNotification['category'],
    severity: AppNotification['severity'],
    requiresAction: boolean
  ) => {
    if (!executionId) {
      return;
    }

    const timestamp = new Date().toISOString();
    notificationStore.getState().upsertNotification({
      id: `chat-task-${executionId}-${taskStatus}`,
      dedupeKey: `execution:${executionId}:${taskStatus}`,
      source: 'execution',
      sourceId: executionId,
      severity,
      category,
      status: taskStatus,
      stateKey: `${taskStatus}:${summary || timestamp}`,
      timestamp,
      unread: true,
      requiresAction,
      actionUrl: `/executions/${executionId}`,
      metadata: {
        executionId,
        resultTitle: message.metadata?.resultTitle,
        resultSummary:
          message.metadata?.finalSummary || message.metadata?.normalizedResult?.summary,
        takeoverReason:
          message.metadata?.finalSummary ||
          message.metadata?.failureReason ||
          message.metadata?.errorMessage,
        failureReason: message.metadata?.failureReason || message.metadata?.errorMessage,
        downloadUrl: message.metadata?.downloadUrl,
      },
    });
  };

  switch (taskStatus) {
    case 'completed':
      void toast.success('任务已完成');
      maybeUpsertNotification('completed', 'success', false);
      break;
    case 'failed':
      void toast.error(summary ? `任务执行失败：${summary}` : '任务执行失败');
      maybeUpsertNotification('failed', 'error', true);
      break;
    case 'waiting_input':
      void toast.warning('任务需要补充输入');
      maybeUpsertNotification('waiting_input', 'warning', true);
      break;
    case 'pending_approval':
      void toast.warning('任务等待你审批处理');
      maybeUpsertNotification('pending_approval', 'warning', true);
      break;
    case 'human_control':
      void toast.warning(summary || '任务需要人工介入处理');
      maybeUpsertNotification('human_control', 'warning', true);
      break;
    default:
      break;
  }
};
