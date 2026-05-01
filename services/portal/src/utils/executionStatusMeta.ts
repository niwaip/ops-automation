import type { ExecutionStatus } from '../api/execution';

export type ExecutionStatusTagColor =
  | 'default'
  | 'processing'
  | 'warning'
  | 'error'
  | 'success';

export const EXECUTION_STATUS_COLORS: Record<ExecutionStatus, ExecutionStatusTagColor> = {
  draft: 'default',
  queued: 'default',
  running: 'processing',
  waiting_input: 'warning',
  pending_approval: 'warning',
  human_control: 'error',
  paused: 'default',
  succeeded: 'success',
  failed: 'error',
  cancelled: 'default',
  rolled_back: 'default',
};

export const EXECUTION_STATUS_LABELS_ZH: Record<ExecutionStatus, string> = {
  draft: '草稿',
  queued: '排队中',
  running: '执行中',
  waiting_input: '待补输入',
  pending_approval: '待审批',
  human_control: '人工接管',
  paused: '已暂停',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  rolled_back: '已回滚',
};

export const EXECUTION_STATUS_LABELS_EN: Record<ExecutionStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  running: 'Running',
  waiting_input: 'Waiting Input',
  pending_approval: 'Pending Approval',
  human_control: 'Human Control',
  paused: 'Paused',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  rolled_back: 'Rolled Back',
};

export const EXECUTION_ACTIVE_POLLING_STATUSES: ExecutionStatus[] = [
  'running',
  'queued',
  'waiting_input',
  'pending_approval',
  'human_control',
];

export const EXECUTION_WAITING_STATUSES: ExecutionStatus[] = [
  'waiting_input',
  'pending_approval',
];

export const EXECUTION_FINISHED_STATUSES: ExecutionStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
  'rolled_back',
];

export const EXECUTION_STATUS_VALUES: ExecutionStatus[] = [
  'draft',
  'queued',
  'running',
  'waiting_input',
  'pending_approval',
  'human_control',
  'paused',
  'succeeded',
  'failed',
  'cancelled',
  'rolled_back',
];

export const EXECUTION_STATUS_OPTIONS_ZH = EXECUTION_STATUS_VALUES.map((status) => ({
  value: status,
  label: EXECUTION_STATUS_LABELS_ZH[status],
}));

export const buildExecutionStatusLabels = (
  overrides?: Partial<Record<ExecutionStatus, string>>,
): Record<ExecutionStatus, string> => ({
  ...EXECUTION_STATUS_LABELS_ZH,
  ...overrides,
});
