import {
  EXECUTION_STATUS_LABELS_EN,
  EXECUTION_STATUS_LABELS_ZH,
  EXECUTION_STATUS_VALUES,
} from '../../lib/execution-status-meta.js';
import type { AppNotification, NotificationSeverity } from '../../types/notification.types.js';
import type { ExecutionStatus } from '../../types/execution.types.js';

export interface NotificationContent {
  title: string;
  description: string;
  actionText: string;
  fullMarkdown?: string;
}

export const isExecutionStatusValue = (value?: string): value is ExecutionStatus =>
  typeof value === 'string' && EXECUTION_STATUS_VALUES.includes(value as ExecutionStatus);

/**
 * 清洗 Markdown 标记与代码符号，提取自然纯文本摘要
 */
export const cleanNotificationSummary = (raw?: string): string => {
  if (!raw || typeof raw !== 'string') {
    return '';
  }
  return raw
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

export const getNotificationSeverityTagColor = (
  severity: NotificationSeverity
): 'success' | 'error' | 'warning' | 'processing' => {
  switch (severity) {
    case 'success':
      return 'success';
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    default:
      return 'processing';
  }
};

export const getNotificationSeverityText = (
  severity: NotificationSeverity,
  language: 'zh-CN' | 'en-US' | 'ja-JP'
): string => {
  const isEnglish = language === 'en-US';
  switch (severity) {
    case 'success':
      return isEnglish ? 'Completed' : '已完成';
    case 'error':
      return isEnglish ? 'Attention' : '需处理';
    case 'warning':
      return isEnglish ? 'Pending' : '待处理';
    default:
      return isEnglish ? 'Info' : '通知';
  }
};

export const buildNotificationContent = (
  item: AppNotification,
  language: 'zh-CN' | 'en-US' | 'ja-JP'
): NotificationContent => {
  const isEnglish = language === 'en-US';
  const statusLabels = isEnglish ? EXECUTION_STATUS_LABELS_EN : EXECUTION_STATUS_LABELS_ZH;
  const failureReason =
    typeof item.metadata?.failureReason === 'string' ? item.metadata.failureReason : undefined;
  const takeoverReason =
    typeof item.metadata?.takeoverReason === 'string' ? item.metadata.takeoverReason : undefined;
  const approvalStatus =
    typeof item.metadata?.approvalStatus === 'string' ? item.metadata.approvalStatus : undefined;
  const resultTitle =
    typeof item.metadata?.resultTitle === 'string' ? item.metadata.resultTitle : undefined;
  const resultSummary =
    typeof item.metadata?.resultSummary === 'string' ? item.metadata.resultSummary : undefined;
  const explicitTitle =
    typeof item.metadata?.title === 'string' && item.metadata.title.trim()
      ? item.metadata.title.trim()
      : resultTitle?.trim();

  const rawBusinessSummary = [resultTitle, resultSummary]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(isEnglish ? ' - ' : '：');
  const descRaw = explicitTitle && resultSummary ? resultSummary : (rawBusinessSummary || resultSummary);
  const cleanedBusinessSummary = cleanNotificationSummary(descRaw);

  if (item.source === 'reminder') {
    return {
      title: explicitTitle || (isEnglish ? 'Reminder' : '定期提醒'),
      description: cleanNotificationSummary(resultSummary) || '',
      actionText: isEnglish ? 'View reminder' : '查看提醒',
      fullMarkdown: resultSummary || undefined,
    };
  }

  if (item.source === 'coordination') {
    const isApproval = item.metadata?.taskType === 'approval';
    const sender =
      typeof item.metadata?.sender === 'string' && item.metadata.sender.trim()
        ? item.metadata.sender.trim()
        : (item.sourceName || '');
    const customTitle =
      explicitTitle ||
      (isEnglish
        ? isApproval ? 'Approval Request' : 'Coordination Task'
        : isApproval ? `收到来自 @${sender || '同事'} 的审批承认请求` : `收到来自 @${sender || '同事'} 的协同任务`);
    const taskTitle = resultTitle?.trim() || '';
    const taskSummary = resultSummary?.trim() || '';

    let descText = '';
    if (taskTitle && taskSummary) {
      if (taskTitle === taskSummary || taskTitle.includes(taskSummary)) {
        descText = taskTitle;
      } else if (taskSummary.includes(taskTitle)) {
        descText = taskSummary;
      } else {
        descText = `${taskTitle}：${taskSummary}`;
      }
    } else {
      descText = taskTitle || taskSummary;
    }

    const description = descText
      ? cleanNotificationSummary(descText)
      : isEnglish
        ? `You received a coordination task${sender ? ` from @${sender}` : ''}. Please check in Inbox.`
        : `您收到一条来自 ${sender ? `@${sender} 的` : ''}协同任务，请在 GTD 收集箱查看处理。`;

    return {
      title: customTitle,
      description,
      actionText: isEnglish ? 'Go to Inbox' : '前往收集箱',
      fullMarkdown: rawBusinessSummary || resultSummary || undefined,
    };
  }

  switch (item.category) {
    case 'completed':
      return {
        title: explicitTitle || (isEnglish ? 'Task Completed' : '任务已完成'),
        description:
          cleanedBusinessSummary ||
          (isEnglish ? 'Task completed successfully.' : '任务已顺利执行完成。'),
        actionText: isEnglish ? 'View Details' : '查看详情',
        fullMarkdown: rawBusinessSummary || resultSummary || undefined,
      };
    case 'failed':
      return {
        title: explicitTitle || (isEnglish ? 'Task Failed' : '任务执行失败'),
        description:
          cleanNotificationSummary(failureReason ? (isEnglish ? failureReason : `失败原因：${failureReason}`) : cleanedBusinessSummary) ||
          (isEnglish ? 'Task failed and needs attention.' : '任务执行失败，请检查详情。'),
        actionText: isEnglish ? 'View Details' : '查看详情',
        fullMarkdown: failureReason || rawBusinessSummary || resultSummary || undefined,
      };
    case 'cancelled':
      return {
        title: explicitTitle || (isEnglish ? 'Task Interrupted' : '任务已中断'),
        description: isEnglish
          ? 'Task execution was cancelled.'
          : '任务执行已被取消或中断。',
        actionText: isEnglish ? 'View Details' : '查看详情',
      };
    case 'human_control':
      return {
        title: explicitTitle || (isEnglish ? 'Manual Intervention Required' : '需要人工介入'),
        description:
          cleanNotificationSummary(takeoverReason ? `介入原因：${takeoverReason}` : cleanedBusinessSummary) ||
          (isEnglish ? 'Waiting for manual takeover.' : '任务已暂停，正在等待人工接管。'),
        actionText: isEnglish ? 'Open Execution' : '查看详情',
        fullMarkdown: takeoverReason || rawBusinessSummary || resultSummary || undefined,
      };
    case 'waiting_input':
      return {
        title: explicitTitle || (isEnglish ? 'Input Required' : '需要补充输入'),
        description:
          cleanedBusinessSummary
            ? (isEnglish ? `Context: ${cleanedBusinessSummary}` : `上下文：${cleanedBusinessSummary}`)
            : (isEnglish ? 'Waiting for additional input to continue.' : '任务正在等待补充输入以继续执行。'),
        actionText: isEnglish ? 'Open Execution' : '查看详情',
        fullMarkdown: rawBusinessSummary || resultSummary || undefined,
      };
    case 'pending_approval':
      return {
        title: explicitTitle || (isEnglish ? 'Approval Required' : '需要审批处理'),
        description: approvalStatus
          ? (isEnglish ? `Approval status: ${approvalStatus}.` : `当前审批状态：${approvalStatus}`)
          : (isEnglish ? 'Waiting for approval confirmation.' : '任务正在等待审批确认。'),
        actionText: isEnglish ? 'Open Execution' : '查看详情',
        fullMarkdown: rawBusinessSummary || resultSummary || undefined,
      };
    default:
      return {
        title: explicitTitle || (isExecutionStatusValue(item.status)
          ? statusLabels[item.status]
          : isEnglish
            ? 'Status Updated'
            : '状态已更新'),
        description:
          cleanedBusinessSummary ||
          (isEnglish ? 'Task status has been updated.' : '任务有新的状态变更。'),
        actionText: isEnglish ? 'View Details' : '查看详情',
        fullMarkdown: rawBusinessSummary || resultSummary || undefined,
      };
  }
};
