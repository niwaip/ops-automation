import type { ChatMessage, ChatSession } from '@ops/user-core';

export interface SessionChannelMeta {
  key: 'local' | 'wechat' | 'dingtalk' | 'feishu' | 'channel';
  label: string;
  badgeText: string;
  color: string;
  bgColor: string;
  borderColor: string;
  isExternalChannel: boolean;
}

export const resolveSessionChannel = (
  session: ChatSession | null | undefined
): SessionChannelMeta => {
  if (!session) {
    return {
      key: 'local',
      label: '本地会话',
      badgeText: '网页',
      color: '#2563EB',
      bgColor: 'rgba(37, 99, 235, 0.08)',
      borderColor: 'rgba(37, 99, 235, 0.22)',
      isExternalChannel: false,
    };
  }

  const rawChannel = (session.channel || '').toLowerCase().trim();
  const id = session.id || '';

  if (rawChannel === 'wechat' || id.startsWith('wechat:')) {
    return {
      key: 'wechat',
      label: '微信互动',
      badgeText: '微信',
      color: '#07C160',
      bgColor: 'rgba(7, 193, 96, 0.1)',
      borderColor: 'rgba(7, 193, 96, 0.28)',
      isExternalChannel: true,
    };
  }

  if (rawChannel === 'dingtalk' || id.startsWith('dingtalk:')) {
    return {
      key: 'dingtalk',
      label: '钉钉互动',
      badgeText: '钉钉',
      color: '#007FFF',
      bgColor: 'rgba(0, 127, 255, 0.1)',
      borderColor: 'rgba(0, 127, 255, 0.28)',
      isExternalChannel: true,
    };
  }

  if (
    rawChannel === 'feishu' ||
    rawChannel === 'lark' ||
    id.startsWith('feishu:') ||
    id.startsWith('lark:')
  ) {
    return {
      key: 'feishu',
      label: '飞书互动',
      badgeText: '飞书',
      color: '#00D6B9',
      bgColor: 'rgba(0, 214, 185, 0.1)',
      borderColor: 'rgba(0, 214, 185, 0.28)',
      isExternalChannel: true,
    };
  }

  return {
    key: 'local',
    label: '本地网页',
    badgeText: '网页',
    color: '#2563EB',
    bgColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: 'rgba(37, 99, 235, 0.22)',
    isExternalChannel: false,
  };
};

export const formatRelativeTime = (value?: string): string => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMinutes < 1) {
    return '刚刚';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }
  if (diffHours < 24 && now.getDate() === date.getDate()) {
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `今天 ${hours}:${mins}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    yesterday.getDate() === date.getDate() &&
    yesterday.getMonth() === date.getMonth() &&
    yesterday.getFullYear() === date.getFullYear()
  ) {
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `昨天 ${hours}:${mins}`;
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
