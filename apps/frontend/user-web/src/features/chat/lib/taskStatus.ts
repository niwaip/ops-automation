import type { ChatMessage } from '@ops/user-core';
import { resolveTaskParts } from '@chat-web/lib/contentParts';

export type ChatTaskStatus = NonNullable<NonNullable<ChatMessage['metadata']>['taskStatus']>;

export const terminalTaskStatuses = new Set<ChatTaskStatus>([
  'completed',
  'waiting_input',
  'pending_approval',
  'human_control',
  'failed',
]);

export const terminalExecutionStatuses = new Set([
  'succeeded',
  'completed',
  'failed',
  'cancelled',
  'rolled_back',
  'waiting_input',
  'pending_approval',
  'human_control',
]);

export const getMessageStatusLabel = (status?: ChatTaskStatus): string | null => {
  switch (status) {
    case 'waiting_input':
      return '待补输入';
    case 'pending_approval':
      return '待审批';
    case 'human_control':
      return '人工处理';
    case 'running':
      return '进行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    default:
      return null;
  }
};

export const getStatusTagColor = (status?: ChatTaskStatus): string | undefined => {
  switch (status) {
    case 'waiting_input':
    case 'pending_approval':
      return 'warning';
    case 'human_control':
      return 'gold';
    case 'running':
      return 'processing';
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    default:
      return undefined;
  }
};

export const normalizeTaskStatus = (value?: string): ChatTaskStatus | undefined => {
  switch (value) {
    case 'waiting_input':
    case 'pending_approval':
    case 'human_control':
    case 'running':
    case 'completed':
    case 'failed':
      return value;
    default:
      return undefined;
  }
};

export const hasTerminalTaskOutcome = (message: ChatMessage): boolean => {
  if (message.role !== 'assistant' || message.metadata?.mode !== 'task' || message.isStreaming) {
    return false;
  }

  const executionStatus = message.metadata?.executionStatus?.trim();
  if (executionStatus && !terminalExecutionStatuses.has(executionStatus)) {
    return false;
  }

  const normalizedResult = message.metadata?.normalizedResult;
  return Boolean(
    message.metadata?.taskStatus === 'completed' ||
      message.metadata?.taskStatus === 'failed' ||
      message.metadata?.finalResult?.trim() ||
      message.metadata?.errorMessage?.trim() ||
      message.metadata?.failureReason?.trim() ||
      message.metadata?.hasBusinessResult ||
      normalizedResult?.structuredData ||
      normalizedResult?.summary?.trim() ||
      normalizedResult?.detailText?.trim() ||
      message.metadata?.finalResultData ||
      message.metadata?.missingInputs?.length ||
      /任务完成/.test(message.content)
  );
};

export const resolveMessageTaskStatus = (message: ChatMessage): ChatTaskStatus | undefined => {
  const metadataStatus = message.metadata?.taskStatus;
  const partsStatus = normalizeTaskStatus(resolveTaskParts(message.contentParts).taskStatus);
  const terminalStatus = [metadataStatus, partsStatus].find(
    (status): status is ChatTaskStatus => Boolean(status && status !== 'running')
  );

  if (terminalStatus) {
    return terminalStatus;
  }

  if (hasTerminalTaskOutcome(message)) {
    const executionStatus = message.metadata?.executionStatus?.trim();
    if (
      executionStatus === 'failed' ||
      executionStatus === 'cancelled' ||
      executionStatus === 'rolled_back' ||
      message.metadata?.errorMessage ||
      message.metadata?.failureReason
    ) {
      return 'failed';
    }
    if (
      executionStatus === 'waiting_input' ||
      executionStatus === 'pending_approval' ||
      executionStatus === 'human_control'
    ) {
      return executionStatus as ChatTaskStatus;
    }
    return 'completed';
  }

  return metadataStatus || partsStatus;
};

export const getLatestWaitingInputExecutionId = (
  messages: ChatMessage[]
): string | undefined => {
  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  for (let index = assistantMessages.length - 1; index >= 0; index -= 1) {
    const message = assistantMessages[index];
    if (resolveMessageTaskStatus(message) !== 'waiting_input') {
      continue;
    }
    const executionId =
      message.metadata?.executionId || resolveTaskParts(message.contentParts).executionId;
    if (executionId) {
      return executionId;
    }
  }
  return undefined;
};
