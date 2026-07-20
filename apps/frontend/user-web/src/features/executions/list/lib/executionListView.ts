import type { ExecutionDto, ExecutionStatus } from '@/api/execution';

export const listStatusLabels: Partial<Record<ExecutionStatus, string>> = {
  running: '执行中',
  waiting_input: '补参',
  pending_approval: '审批',
  human_control: '接管',
  succeeded: '完成',
  failed: '失败',
  cancelled: '取消',
};

export const EXECUTION_STATUS_FILTER_OPTIONS: Array<{
  value?: ExecutionStatus;
  label: string;
}> = [
  { value: undefined, label: '全部状态' },
  { value: 'running', label: '执行中' },
  { value: 'waiting_input', label: '待补输入' },
  { value: 'pending_approval', label: '待审批' },
  { value: 'human_control', label: '人工接管' },
  { value: 'succeeded', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
];

export const getExecutionTime = (record: ExecutionDto): number => {
  const source = record.startedAt || record.createdAt;
  return source ? new Date(source).getTime() : 0;
};

const padTimePart = (value: number): string => String(value).padStart(2, '0');

export const formatCompactExecutionTime = (date?: string): string => {
  if (!date) {
    return '-';
  }

  const targetDate = new Date(date);
  if (Number.isNaN(targetDate.getTime())) {
    return '-';
  }

  const now = new Date();
  const timeLabel = `${padTimePart(targetDate.getHours())}:${padTimePart(targetDate.getMinutes())}`;

  if (
    targetDate.getFullYear() === now.getFullYear() &&
    targetDate.getMonth() === now.getMonth() &&
    targetDate.getDate() === now.getDate()
  ) {
    return timeLabel;
  }

  if (targetDate.getFullYear() === now.getFullYear()) {
    return `${padTimePart(targetDate.getMonth() + 1)}/${padTimePart(targetDate.getDate())} ${timeLabel}`;
  }

  return `${String(targetDate.getFullYear()).slice(-2)}/${padTimePart(targetDate.getMonth() + 1)}/${padTimePart(targetDate.getDate())}`;
};
