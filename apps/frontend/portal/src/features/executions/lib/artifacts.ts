import type {
  ExecutionPhaseArtifactDto,
  ExecutionPhaseDto,
  ExecutionPhaseStepDto,
} from '@/api/execution';
import {
  buildBrowserWorkerArtifactUrl as buildBrowserWorkerArtifactUrlFromCore,
  extractPhaseStepImageSources as extractPhaseStepImageSourcesFromCore,
  extractPhaseStepUrl,
  extractWorkflowActivitySnapshotSources as extractWorkflowActivitySnapshotSourcesFromCore,
  getPhaseArtifactPath,
  getPhaseArtifactPayload,
  getPhaseArtifactPreviewSrc as getPhaseArtifactPreviewSrcFromCore,
  getVisiblePhaseSteps,
} from '@ops/user-core';
import { runtimeConfig } from '@/shared/config/runtime';

export { extractPhaseStepUrl, getPhaseArtifactPath, getPhaseArtifactPayload, getVisiblePhaseSteps };

const toTimeMs = (value?: string): number => {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const sortExecutionPhaseArtifactsByTime = (
  artifacts: ExecutionPhaseArtifactDto[]
): ExecutionPhaseArtifactDto[] =>
  [...artifacts].sort((left, right) => {
    const timeDelta = toTimeMs(left.createdAt) - toTimeMs(right.createdAt);
    if (timeDelta !== 0) {
      return timeDelta;
    }
    return left.id.localeCompare(right.id);
  });

export const sortExecutionPhaseStepsByTime = (
  steps: ExecutionPhaseStepDto[]
): ExecutionPhaseStepDto[] =>
  [...steps].sort((left, right) => {
    const leftTime = toTimeMs(left.startedAt || left.endedAt || left.createdAt);
    const rightTime = toTimeMs(right.startedAt || right.endedAt || right.createdAt);
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    if (left.stepIndex !== right.stepIndex) {
      return left.stepIndex - right.stepIndex;
    }
    return left.id.localeCompare(right.id);
  });

export const buildBrowserWorkerArtifactUrl = (artifactPath?: string): string | undefined =>
  buildBrowserWorkerArtifactUrlFromCore(runtimeConfig.recorderWsUrl, artifactPath);

export const getPhaseArtifactPreviewSrc = (
  artifact: ExecutionPhaseArtifactDto
): string | undefined => getPhaseArtifactPreviewSrcFromCore(runtimeConfig.recorderWsUrl, artifact);

export const extractWorkflowActivitySnapshotSources = (phase: ExecutionPhaseDto): string[] =>
  extractWorkflowActivitySnapshotSourcesFromCore(runtimeConfig.recorderWsUrl, {
    ...phase,
    artifacts: sortExecutionPhaseArtifactsByTime(phase.artifacts || []),
  });

export const extractPhaseStepImageSources = (
  step: ExecutionPhaseStepDto,
  artifacts: ExecutionPhaseArtifactDto[]
): string[] => extractPhaseStepImageSourcesFromCore(runtimeConfig.recorderWsUrl, step, artifacts);
