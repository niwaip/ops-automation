import type {
  ExecutionDto,
  ExecutionPhaseDto,
  ExecutionStepDto,
} from '../../types/execution.types.js';
import {
  EXECUTION_STATUS_COLORS,
  EXECUTION_STATUS_LABELS_ZH,
} from '../../lib/execution-status-meta.js';

export interface ExecutionDetailStatusMeta {
  code: string;
  label: string;
  color?: string;
}

export interface ExecutionDetailSummaryRow {
  key: string;
  label: string;
  value: string;
  status?: ExecutionDetailStatusMeta;
}

export interface ExecutionDetailStepRow {
  id: string;
  stepIndex: number;
  stepIndexLabel: string;
  name: string;
  action: string;
  status: string;
}

export interface ExecutionDetailPhaseRow {
  id: string;
  phaseName: string;
  phaseType: string;
  status: string;
  attempt: number;
}

export interface ExecutionDetailActionButton {
  key: string;
  label: string;
  action: 'approve' | 'reject' | 'approve_and_continue' | 'release_human_control';
  type?: 'primary' | 'default';
  danger?: boolean;
}

export interface ExecutionDetailActionCard {
  key: 'pending_approval' | 'human_control';
  title: string;
  description: string;
  note?: string;
  buttons: ExecutionDetailActionButton[];
}

const asDisplayText = (value: unknown, fallback = '-'): string => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return String(value);
};

export const buildExecutionDetailStatusMeta = (
  execution: ExecutionDto
): ExecutionDetailStatusMeta => ({
  code: execution.status,
  label: EXECUTION_STATUS_LABELS_ZH[execution.status],
  color: EXECUTION_STATUS_COLORS[execution.status],
});

export const buildExecutionDetailSummaryRows = (
  execution: ExecutionDto
): ExecutionDetailSummaryRow[] => [
  { key: 'id', label: 'ID', value: execution.id },
  {
    key: 'status',
    label: '状态',
    value: EXECUTION_STATUS_LABELS_ZH[execution.status],
    status: buildExecutionDetailStatusMeta(execution),
  },
  { key: 'skill', label: '技能', value: execution.skillId },
  { key: 'runtime', label: '运行时', value: asDisplayText(execution.runtimeType) },
  { key: 'failure', label: '失败原因', value: asDisplayText(execution.failureReason) },
];

export const buildExecutionDetailStepRows = (
  steps?: ExecutionStepDto[]
): ExecutionDetailStepRow[] =>
  (steps || []).map((step) => ({
    id: step.id,
    stepIndex: step.stepIndex,
    stepIndexLabel: String(step.stepIndex + 1),
    name: step.name,
    action: asDisplayText(step.action),
    status: step.status,
  }));

export const buildExecutionDetailPhaseRows = (
  phases?: ExecutionPhaseDto[]
): ExecutionDetailPhaseRow[] =>
  (phases || []).map((phase) => ({
    id: phase.id,
    phaseName: phase.phaseName || phase.phaseKey,
    phaseType: phase.phaseType,
    status: phase.status,
    attempt: phase.attempt,
  }));

export const resolveExecutionInputPayload = (execution: ExecutionDto): Record<string, unknown> =>
  execution.input || execution.normalizedInput || {};

export const resolveExecutionResultPayload = (execution: ExecutionDto): Record<string, unknown> =>
  execution.resultJson || execution.result || {};

export const buildExecutionDetailActionCard = (
  execution: ExecutionDto
): ExecutionDetailActionCard | null => {
  if (execution.status === 'pending_approval') {
    return {
      key: 'pending_approval',
      title: '审批处理',
      description: '当前执行正在等待审批，你可以在确认信息无误后批准继续，或直接拒绝本次执行。',
      buttons: [
        {
          key: 'reject',
          label: '拒绝执行',
          action: 'reject',
          danger: true,
        },
        {
          key: 'approve',
          label: '批准并继续',
          action: 'approve',
          type: 'primary',
        },
      ],
    };
  }

  if (execution.status === 'human_control') {
    return {
      key: 'human_control',
      title: '人工介入',
      description: '当前执行处于人工接管状态。确认人工判断已经完成后，可以直接同意并继续后续动作。',
      note: execution.takeoverReason ? `介入原因：${execution.takeoverReason}` : undefined,
      buttons: [
        {
          key: 'approve-and-continue',
          label: '同意并继续',
          action: 'approve_and_continue',
          type: 'primary',
        },
        {
          key: 'release-human-control',
          label: '恢复自动执行',
          action: 'release_human_control',
          type: 'default',
        },
      ],
    };
  }

  return null;
};
