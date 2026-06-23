export declare const EXECUTION_STATUS: {
  readonly DRAFT: 'draft';
  readonly QUEUED: 'queued';
  readonly RUNNING: 'running';
  readonly WAITING_INPUT: 'waiting_input';
  readonly PENDING_APPROVAL: 'pending_approval';
  readonly HUMAN_CONTROL: 'human_control';
  readonly PAUSED: 'paused';
  readonly SUCCEEDED: 'succeeded';
  readonly FAILED: 'failed';
  readonly CANCELLED: 'cancelled';
  readonly ROLLED_BACK: 'rolled_back';
};

export type ExecutionStatus = (typeof EXECUTION_STATUS)[keyof typeof EXECUTION_STATUS];

export declare const EXECUTION_STATUS_VALUES: ExecutionStatus[];
export declare const TERMINAL_EXECUTION_STATUSES: ExecutionStatus[];

export declare const EXECUTION_STEP_STATUS: {
  readonly PENDING: 'pending';
  readonly RUNNING: 'running';
  readonly WAITING_INPUT: 'waiting_input';
  readonly SUCCEEDED: 'succeeded';
  readonly FAILED: 'failed';
  readonly SKIPPED: 'skipped';
};

export type ExecutionStepStatus =
  (typeof EXECUTION_STEP_STATUS)[keyof typeof EXECUTION_STEP_STATUS];

export declare const EXECUTION_STEP_STATUS_VALUES: ExecutionStepStatus[];

export declare const APPROVAL_STATUS: {
  readonly PENDING: 'pending';
  readonly APPROVED: 'approved';
  readonly REJECTED: 'rejected';
  readonly NOT_REQUIRED: 'not_required';
};

export type ApprovalStatus = (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

export declare const APPROVAL_STATUS_VALUES: ApprovalStatus[];

export declare const EXECUTION_EVENT_TYPE: {
  readonly EXECUTION_CREATED: 'execution.created';
  readonly EXECUTION_PLAN_GENERATED: 'execution.plan.generated';
  readonly EXECUTION_STEPS_PLANNED: 'execution.steps.planned';
  readonly EXECUTION_STATUS_CHANGED: 'execution.status_changed';
  readonly EXECUTION_TAKEOVER_REQUESTED: 'execution.takeover_requested';
  readonly EXECUTION_RESUMED: 'execution.resumed';
  readonly EXECUTION_APPROVED: 'execution.approved';
  readonly EXECUTION_REJECTED: 'execution.rejected';
  readonly EXECUTION_INPUT_SUBMITTED: 'execution.input_submitted';
  readonly EXECUTION_PARTIAL_INPUT_SUBMITTED: 'execution.partial_input_submitted';
  readonly EXECUTION_CANCELLED: 'execution.cancelled';
  readonly RUNTIME_SKIPPED: 'runtime.skipped';
  readonly RUNTIME_ALLOCATED: 'runtime.allocated';
  readonly STEP_CREATED: 'step.created';
  readonly STEP_STARTED: 'step.started';
  readonly STEP_SUCCEEDED: 'step.succeeded';
  readonly STEP_FAILED: 'step.failed';
  readonly STEP_WAITING_INPUT: 'step.waiting_input';
  readonly STEP_SKIPPED: 'step.skipped';
  readonly STEPS_SKIPPED: 'steps.skipped';
};

export type ExecutionEventType = (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE];

export declare const EXECUTION_EVENT_TYPE_VALUES: ExecutionEventType[];

export declare function isTerminalExecutionStatus(status: string): status is ExecutionStatus;

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
