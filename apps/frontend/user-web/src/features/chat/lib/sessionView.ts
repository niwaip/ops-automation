import type { ChatMessage, ChatSession } from '@ops/user-core';

export const formatRelativeTime = (value?: string): string => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const summarizeSessionTitle = (message: string): string => {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '新对话';
  }
  return normalized.slice(0, 24);
};

export const getSessionPreview = (messages: ChatMessage[] | undefined): string => {
  const latestMessage = messages?.[messages.length - 1];
  if (!latestMessage) {
    return '开始一个新任务或发起一次提问';
  }
  const preview =
    latestMessage.metadata?.finalSummary ||
    latestMessage.metadata?.finalResult ||
    latestMessage.content;
  return (preview || '查看历史消息').replace(/\s+/g, ' ').slice(0, 42);
};

export const getSessionSortTime = (session: ChatSession): number => {
  const updatedAt = new Date(session.updatedAt).getTime();
  if (!Number.isNaN(updatedAt)) {
    return updatedAt;
  }
  return new Date(session.createdAt).getTime() || 0;
};

export const isSameSession = (
  left: ChatSession | null | undefined,
  right: ChatSession | null | undefined
): boolean => {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.id === right.id &&
    left.title === right.title &&
    left.modelId === right.modelId &&
    left.status === right.status &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
};
