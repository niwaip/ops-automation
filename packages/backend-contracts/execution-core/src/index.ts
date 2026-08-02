export const EXECUTION_STATUS = {
  DRAFT: 'draft',
  QUEUED: 'queued',
  RUNNING: 'running',
  WAITING_INPUT: 'waiting_input',
  PENDING_APPROVAL: 'pending_approval',
  HUMAN_CONTROL: 'human_control',
  PAUSED: 'paused',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  ROLLED_BACK: 'rolled_back',
} as const;

export type ExecutionStatus =
  (typeof EXECUTION_STATUS)[keyof typeof EXECUTION_STATUS];

export const EXECUTION_STATUS_VALUES = Object.values(EXECUTION_STATUS);

export const TERMINAL_EXECUTION_STATUSES: ExecutionStatus[] = [
  EXECUTION_STATUS.SUCCEEDED,
  EXECUTION_STATUS.FAILED,
  EXECUTION_STATUS.CANCELLED,
  EXECUTION_STATUS.ROLLED_BACK,
];

export const EXECUTION_STEP_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  WAITING_INPUT: 'waiting_input',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  SKIPPED: 'skipped',
} as const;

export type ExecutionStepStatus =
  (typeof EXECUTION_STEP_STATUS)[keyof typeof EXECUTION_STEP_STATUS];

export const EXECUTION_STEP_STATUS_VALUES = Object.values(EXECUTION_STEP_STATUS);

export const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  NOT_REQUIRED: 'not_required',
} as const;

export type ApprovalStatus =
  (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

export const APPROVAL_STATUS_VALUES = Object.values(APPROVAL_STATUS);

export const EXECUTION_EVENT_TYPE = {
  EXECUTION_CREATED: 'execution.created',
  EXECUTION_PLAN_GENERATED: 'execution.plan.generated',
  EXECUTION_STEPS_PLANNED: 'execution.steps.planned',
  EXECUTION_STATUS_CHANGED: 'execution.status_changed',
  EXECUTION_TAKEOVER_REQUESTED: 'execution.takeover_requested',
  EXECUTION_RESUMED: 'execution.resumed',
  EXECUTION_APPROVED: 'execution.approved',
  EXECUTION_REJECTED: 'execution.rejected',
  EXECUTION_INPUT_SUBMITTED: 'execution.input_submitted',
  EXECUTION_PARTIAL_INPUT_SUBMITTED: 'execution.partial_input_submitted',
  EXECUTION_CANCELLED: 'execution.cancelled',
  EXECUTION_LEGACY_GRACE_REJECTED: 'execution.legacy_grace.rejected',
  RUNTIME_SKIPPED: 'runtime.skipped',
  RUNTIME_ALLOCATED: 'runtime.allocated',
  STEP_CREATED: 'step.created',
  STEP_STARTED: 'step.started',
  STEP_SUCCEEDED: 'step.succeeded',
  STEP_FAILED: 'step.failed',
  STEP_WAITING_INPUT: 'step.waiting_input',
  STEP_SKIPPED: 'step.skipped',
  STEPS_SKIPPED: 'steps.skipped',
} as const;

export type ExecutionEventType =
  (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE];

export const EXECUTION_EVENT_TYPE_VALUES = Object.values(EXECUTION_EVENT_TYPE);

export function isTerminalExecutionStatus(
  status: string,
): status is ExecutionStatus {
  return TERMINAL_EXECUTION_STATUSES.includes(status as ExecutionStatus);
}

export type ExecutionSemanticMode = 'field_level' | 'complex_document';

export interface ExecutionSemanticGroup {
  key: string;
  label: string;
  kind: 'field' | 'array_group';
  blocking: boolean;
  required: boolean;
  fieldNames: string[];
  missingFieldNames: string[];
  description?: string;
}

export interface ExecutionSemantic {
  enabled: boolean;
  mode: ExecutionSemanticMode;
  previewReady: boolean;
  finalReady: boolean;
  fallbackToFieldLevel: boolean;
  summary?: string;
  groupedMissing: ExecutionSemanticGroup[];
  complexity?: {
    category: 'simple' | 'complex_document';
    totalFields: number;
    requiredFields: number;
    missingFields: number;
    arrayGroups: number;
    reasonCodes: string[];
  };
}
