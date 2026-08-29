import {
  ExecutionPhaseDto,
  ExecutionPhaseArtifactDto,
  ExecutionTakeoverRecordDto,
} from '@/api/execution';
import { replaceLocalhostWithCurrentHost } from '@/shared/lib/publicUrl';
import { EXECUTION_STATUS_COLORS } from '@/shared/lib/executionStatusMeta';
import {
  asRecord,
  tryParseJsonValue,
} from '@/features/executions/shared/common';
import {
  extractBrowserExecutionResult,
} from '@/features/executions/shared/browser';
import {
  extractWorkflowActivitySnapshotSources,
  extractPhaseStepImageSources,
  sortExecutionPhaseArtifactsByTime,
  sortExecutionPhaseStepsByTime,
} from '@/features/executions/shared/artifacts';

export const statusColors = EXECUTION_STATUS_COLORS;

export const fixLocalhostLink = (url?: string): string | undefined =>
  replaceLocalhostWithCurrentHost(url);

export const getRecoveryPatchSummary = (
  patch: unknown,
  isEnglish: boolean
): string | undefined => {
  const record = asRecord(tryParseJsonValue(patch));
  if (!record) {
    return undefined;
  }

  const type = typeof record.type === 'string' ? record.type : undefined;
  const selector = typeof record.selector === 'string' ? record.selector : undefined;
  const durationMs = typeof record.duration_ms === 'number' ? record.duration_ms : undefined;
  const note = typeof record.note === 'string' ? record.note : undefined;

  if (type === 'append_wait') {
    return isEnglish ? `Append wait ${durationMs ?? 0}ms` : `追加等待 ${durationMs ?? 0}ms`;
  }
  if (type === 'replace_selector') {
    return isEnglish ? `Replace selector: ${selector || '-'}` : `替换选择器: ${selector || '-'}`;
  }
  if (type === 'resolve_by_human') {
    return isEnglish
      ? `Resolved by human${note ? `: ${note}` : ''}`
      : `人工处理${note ? `: ${note}` : ''}`;
  }

  return type || undefined;
};

export const BROWSER_ACTIVITY_ACTIONS = new Set([
  'navigate',
  'click',
  'fill',
  'type',
  'press',
  'select',
  'hover',
  'scroll',
  'wait',
  'screenshot',
  'upload',
  'drag',
]);

export const getPhaseSteps = (phase?: ExecutionPhaseDto) =>
  sortExecutionPhaseStepsByTime(
    (Array.isArray(phase?.steps) ? phase.steps : []) as NonNullable<ExecutionPhaseDto['steps']>
  );

export const getPhaseArtifacts = (phase?: ExecutionPhaseDto) =>
  sortExecutionPhaseArtifactsByTime(
    (Array.isArray(phase?.artifacts) ? phase.artifacts : []) as ExecutionPhaseArtifactDto[]
  );

export const getPhaseTakeovers = (phase?: ExecutionPhaseDto) =>
  (Array.isArray(phase?.takeovers) ? phase.takeovers : []) as ExecutionTakeoverRecordDto[];

export const isBrowserWorkflowActivity = (phase: ExecutionPhaseDto): boolean => {
  const phaseType = typeof phase.phaseType === 'string' ? phase.phaseType.trim().toLowerCase() : '';
  if (
    phaseType === 'browser' ||
    phaseType === 'browser_recording' ||
    phaseType === 'browser_step'
  ) {
    return true;
  }
  if (phase.phaseType !== 'workflow_activity') {
    return false;
  }

  if (extractWorkflowActivitySnapshotSources(phase).length > 0) {
    return true;
  }

  if (extractBrowserExecutionResult(phase.output)) {
    return true;
  }

  return getPhaseSteps(phase).some((step) => {
    if (step.snapshotId) {
      return true;
    }

    if (extractPhaseStepImageSources(step, getPhaseArtifacts(phase)).length > 0) {
      return true;
    }

    const action = step.action?.trim().toLowerCase();
    return Boolean(action && BROWSER_ACTIVITY_ACTIONS.has(action));
  });
};

export const getPhaseLoopIteration = (phase?: ExecutionPhaseDto): number | undefined => {
  const phaseInput = asRecord(tryParseJsonValue(phase?.input));
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
  return undefined;
};

export const formatPhaseDisplayName = (
  phase: ExecutionPhaseDto,
  isEnglish: boolean,
  fallbackIndex?: number
): string => {
  const baseName =
    phase.phaseName || phase.phaseKey || `${isEnglish ? 'Step' : '步骤'} ${fallbackIndex ?? 0}`;
  const loopIteration = getPhaseLoopIteration(phase);
  return loopIteration
    ? `${baseName} · ${isEnglish ? `Loop ${loopIteration}` : `第 ${loopIteration} 轮`}`
    : baseName;
};

export const isExecutionPhaseLike = (value: unknown): value is ExecutionPhaseDto =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
