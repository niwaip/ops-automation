interface TaskActionMetadataPatch {
  taskStatus: 'running' | 'failed';
  executionId: string;
  executionStatus: string;
  finalSummary?: string;
  errorMessage?: string;
  finalResult?: string;
  finalResultData?: undefined;
  missingInputs?: undefined;
}

interface ApprovalTransitionParams {
  executionId: string;
  executionStatus: string;
  mode?: 'chat' | 'task';
  approvedSummary?: string;
  runningSummary?: string;
}

interface AssistantDraftMessageMeta {
  mode: 'chat' | 'task';
  taskStatus: 'running';
  executionId: string;
  executionStatus: string;
  finalSummary: string;
  finalResult?: string;
  finalResultData?: undefined;
  errorMessage?: string;
}

export const buildApprovedTaskPatch = ({
  executionId,
  executionStatus,
  approvedSummary = '审批已通过，任务继续执行中。',
}: ApprovalTransitionParams): TaskActionMetadataPatch => ({
  taskStatus: 'running',
  executionId,
  executionStatus,
  finalSummary: approvedSummary,
  errorMessage: '',
  finalResult: '',
  finalResultData: undefined,
  missingInputs: undefined,
});

export const buildRejectedTaskPatch = ({
  executionId,
  executionStatus,
}: ApprovalTransitionParams): TaskActionMetadataPatch => ({
  taskStatus: 'failed',
  executionId,
  executionStatus,
  finalSummary: '',
  errorMessage: '审批已驳回，任务不会继续执行。',
  finalResult: '',
  finalResultData: undefined,
  missingInputs: undefined,
});

export const buildApprovedAssistantDraftMeta = ({
  executionId,
  executionStatus,
  mode = 'task',
  runningSummary = '已批准，正在继续执行...',
}: ApprovalTransitionParams): AssistantDraftMessageMeta => ({
  mode,
  taskStatus: 'running',
  executionId,
  executionStatus,
  finalSummary: runningSummary,
  finalResult: '',
  finalResultData: undefined,
  errorMessage: '',
});

export const buildSubmittedInputTaskPatch = ({
  executionId,
  executionStatus,
  approvedSummary = '输入已提交，任务继续执行中。',
}: ApprovalTransitionParams): TaskActionMetadataPatch => ({
  taskStatus: 'running',
  executionId,
  executionStatus,
  finalSummary: approvedSummary,
  errorMessage: '',
  finalResult: '',
  finalResultData: undefined,
  missingInputs: undefined,
});

export const buildResumedHumanControlTaskPatch = ({
  executionId,
  executionStatus,
  approvedSummary = '已同意人工处理结果，任务继续执行中。',
}: ApprovalTransitionParams): TaskActionMetadataPatch => ({
  taskStatus: 'running',
  executionId,
  executionStatus,
  finalSummary: approvedSummary,
  errorMessage: '',
  finalResult: '',
  finalResultData: undefined,
  missingInputs: undefined,
});
