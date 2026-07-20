import type {
  ExecutionPhaseArtifactDto,
  ExecutionPhaseDto,
  ExecutionTakeoverRecordDto,
} from '@/api/execution';
import { extractBrowserExecutionResult } from '@/features/executions/shared/lib/browser';
import {
  extractPhaseStepImageSources,
  extractWorkflowActivitySnapshotSources,
  sortExecutionPhaseArtifactsByTime,
  sortExecutionPhaseStepsByTime,
} from '@/features/executions/shared/lib/artifacts';
import { replaceLocalhostWithCurrentHost } from '@/shared/utils/publicUrl';

const BROWSER_ACTIVITY_ACTIONS = new Set([
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

export const fixLocalhostLink = (url?: string): string | undefined =>
  replaceLocalhostWithCurrentHost(url);

export const isExecutionPhaseLike = (value: unknown): value is ExecutionPhaseDto =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

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
