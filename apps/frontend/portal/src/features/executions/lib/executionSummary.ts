import type { ExecutionPhaseDto, ExecutionPhaseStepDto } from '@/api/execution';
import { asRecord, tryParseJsonValue } from '@/features/executions/lib/common';

export interface ExecutionLoopSummary {
  totalItems: number;
  autoApprovedCount: number;
  manualHandledCount: number;
  hasManualHandling: boolean;
  summaryText?: string;
}

const getLoopIteration = (phase: ExecutionPhaseDto): number | undefined => {
  const phaseInput = asRecord(tryParseJsonValue(phase.input));
  const value = phaseInput?.loopIteration;
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const keyMatch = typeof phase.phaseKey === 'string' ? phase.phaseKey.match(/__loop_(\d+)$/i) : null;
  if (keyMatch) {
    const parsed = Number(keyMatch[1]);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
};

const hasManualSignal = (phase: ExecutionPhaseDto, steps: ExecutionPhaseStepDto[]): boolean => {
  const recoveryDecision = asRecord(tryParseJsonValue(phase.recoveryDecision));
  const hasTakeoverRecord = Array.isArray(phase.takeovers) && phase.takeovers.length > 0;
  const hasTakeoverStep = steps.some(
    (step) => ['takeover_required', 'blocked', 'waiting_takeover'].includes(step.status)
  );
  return (
    hasTakeoverRecord ||
    Boolean(recoveryDecision) ||
    ['waiting_takeover', 'resumable'].includes(phase.status) ||
    hasTakeoverStep
  );
};

const hasApprovalSignal = (phase: ExecutionPhaseDto): boolean => {
  const phaseName = `${phase.phaseName || ''} ${phase.phaseKey || ''}`;
  return /承认|approve/i.test(phaseName);
};

export const buildExecutionLoopSummary = (
  phases: ExecutionPhaseDto[],
  isEnglish: boolean
): ExecutionLoopSummary | null => {
  const loopMap = new Map<
    number,
    {
      hasManual: boolean;
      hasApproval: boolean;
    }
  >();

  phases.forEach((phase) => {
    const loopIteration = getLoopIteration(phase);
    if (!loopIteration) {
      return;
    }

    const steps = Array.isArray(phase.steps) ? phase.steps : [];
    const current = loopMap.get(loopIteration) || {
      hasManual: false,
      hasApproval: false,
    };
    current.hasManual = current.hasManual || hasManualSignal(phase, steps);
    current.hasApproval = current.hasApproval || (hasApprovalSignal(phase) && phase.status === 'completed');
    loopMap.set(loopIteration, current);
  });

  if (loopMap.size === 0) {
    return null;
  }

  const totalItems = loopMap.size;
  let manualHandledCount = 0;
  let autoApprovedCount = 0;

  loopMap.forEach((value) => {
    if (value.hasManual) {
      manualHandledCount += 1;
      return;
    }
    if (value.hasApproval) {
      autoApprovedCount += 1;
    }
  });

  const hasManualHandling = manualHandledCount > 0;
  let summaryText: string | undefined;

  if (hasManualHandling) {
    summaryText = isEnglish
      ? `Processed ${totalItems} items, with ${autoApprovedCount} auto-approved and ${manualHandledCount} requiring manual handling.`
      : `共处理 ${totalItems} 条数据，其中 ${autoApprovedCount} 条自动承认，${manualHandledCount} 条需要人工处理。`;
  } else if (autoApprovedCount > 0) {
    summaryText = isEnglish
      ? `Processed ${totalItems} items and auto-approved all eligible items.`
      : `共处理 ${totalItems} 条数据，全部由系统自动承认。`;
  } else {
    summaryText = isEnglish
      ? `Processed ${totalItems} items.`
      : `共处理 ${totalItems} 条数据。`;
  }

  return {
    totalItems,
    autoApprovedCount,
    manualHandledCount,
    hasManualHandling,
    summaryText,
  };
};
