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

export const buildBrowserWorkerArtifactUrl = (artifactPath?: string): string | undefined =>
  buildBrowserWorkerArtifactUrlFromCore(runtimeConfig.recorderWsUrl, artifactPath);

export const getPhaseArtifactPreviewSrc = (
  artifact: ExecutionPhaseArtifactDto
): string | undefined => getPhaseArtifactPreviewSrcFromCore(runtimeConfig.recorderWsUrl, artifact);

export const extractWorkflowActivitySnapshotSources = (phase: ExecutionPhaseDto): string[] =>
  extractWorkflowActivitySnapshotSourcesFromCore(runtimeConfig.recorderWsUrl, phase);

export const extractPhaseStepImageSources = (
  step: ExecutionPhaseStepDto,
  artifacts: ExecutionPhaseArtifactDto[]
): string[] => extractPhaseStepImageSourcesFromCore(runtimeConfig.recorderWsUrl, step, artifacts);
