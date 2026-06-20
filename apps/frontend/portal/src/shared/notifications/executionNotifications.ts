import type { ExecutionDto, ExecutionStatus } from '@/api/execution';
import type {
  AppNotification,
  NotificationCategory,
  NotificationSeverity,
} from '@/shared/notifications/types';

export const RELEVANT_EXECUTION_STATUSES = new Set<ExecutionStatus>([
  'waiting_input',
  'pending_approval',
  'human_control',
  'succeeded',
  'failed',
  'cancelled',
]);

const resolveNotificationCategory = (status: ExecutionStatus): NotificationCategory => {
  switch (status) {
    case 'succeeded':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'waiting_input':
      return 'waiting_input';
    case 'pending_approval':
      return 'pending_approval';
    case 'human_control':
      return 'human_control';
    default:
      return 'status_update';
  }
};

const resolveNotificationSeverity = (status: ExecutionStatus): NotificationSeverity => {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
    case 'human_control':
      return 'error';
    case 'cancelled':
    case 'waiting_input':
    case 'pending_approval':
      return 'warning';
    default:
      return 'info';
  }
};

const resolveExecutionTimestamp = (execution: ExecutionDto) =>
  execution.endedAt || execution.updatedAt || execution.startedAt || execution.createdAt;

export const toExecutionNotification = (execution: ExecutionDto): AppNotification | null => {
  if (!RELEVANT_EXECUTION_STATUSES.has(execution.status)) {
    return null;
  }

  return {
    id: `execution:${execution.id}`,
    dedupeKey: `execution:${execution.id}`,
    source: 'execution',
    sourceId: execution.id,
    sourceName: execution.skillId,
    severity: resolveNotificationSeverity(execution.status),
    category: resolveNotificationCategory(execution.status),
    status: execution.status,
    stateKey: execution.status,
    timestamp: resolveExecutionTimestamp(execution),
    unread: false,
    requiresAction: ['waiting_input', 'pending_approval', 'human_control'].includes(
      execution.status
    ),
    actionUrl: `/executions?executionId=${encodeURIComponent(execution.id)}`,
    metadata: {
      executionId: execution.id,
      skillId: execution.skillId,
      failureReason: execution.failureReason,
      takeoverReason: execution.takeoverReason,
      approvalStatus: execution.approvalStatus,
    },
  };
};

export const toExecutionNotifications = (executions: ExecutionDto[]): AppNotification[] =>
  executions
    .map((execution) => toExecutionNotification(execution))
    .filter((notification): notification is AppNotification => Boolean(notification));
