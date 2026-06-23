const EXECUTION_STATUS = {
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
};

const EXECUTION_STATUS_VALUES = Object.values(EXECUTION_STATUS);

const TERMINAL_EXECUTION_STATUSES = [
  EXECUTION_STATUS.SUCCEEDED,
  EXECUTION_STATUS.FAILED,
  EXECUTION_STATUS.CANCELLED,
  EXECUTION_STATUS.ROLLED_BACK,
];

const EXECUTION_STEP_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  WAITING_INPUT: 'waiting_input',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

const EXECUTION_STEP_STATUS_VALUES = Object.values(EXECUTION_STEP_STATUS);

const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  NOT_REQUIRED: 'not_required',
};

const APPROVAL_STATUS_VALUES = Object.values(APPROVAL_STATUS);

const EXECUTION_EVENT_TYPE = {
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
  RUNTIME_SKIPPED: 'runtime.skipped',
  RUNTIME_ALLOCATED: 'runtime.allocated',
  STEP_CREATED: 'step.created',
  STEP_STARTED: 'step.started',
  STEP_SUCCEEDED: 'step.succeeded',
  STEP_FAILED: 'step.failed',
  STEP_WAITING_INPUT: 'step.waiting_input',
  STEP_SKIPPED: 'step.skipped',
  STEPS_SKIPPED: 'steps.skipped',
};

const EXECUTION_EVENT_TYPE_VALUES = Object.values(EXECUTION_EVENT_TYPE);

const isTerminalExecutionStatus = (status) => TERMINAL_EXECUTION_STATUSES.includes(status);

module.exports = {
  APPROVAL_STATUS,
  APPROVAL_STATUS_VALUES,
  EXECUTION_EVENT_TYPE,
  EXECUTION_EVENT_TYPE_VALUES,
  EXECUTION_STATUS,
  EXECUTION_STATUS_VALUES,
  EXECUTION_STEP_STATUS,
  EXECUTION_STEP_STATUS_VALUES,
  TERMINAL_EXECUTION_STATUSES,
  isTerminalExecutionStatus,
};
