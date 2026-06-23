import type {
  ExecutionPhaseArtifactDto,
  ExecutionPhaseDto,
  ExecutionPhaseStepDto,
} from '../../types/execution.types.js';
import { extractBrowserImageSources, extractBrowserImageSrc } from './browser.js';
import { asRecord } from './common.js';

export const getPhaseArtifactPayload = (
  artifact: ExecutionPhaseArtifactDto
): Record<string, unknown> | undefined => {
  if (
    !artifact.payload ||
    typeof artifact.payload !== 'object' ||
    Array.isArray(artifact.payload)
  ) {
    return undefined;
  }
  return artifact.payload;
};

export const getPhaseArtifactPath = (artifact: ExecutionPhaseArtifactDto): string | undefined => {
  const payload = getPhaseArtifactPayload(artifact);
  if (typeof payload?.snapshotPath === 'string' && payload.snapshotPath.trim()) {
    return payload.snapshotPath;
  }
  if (typeof payload?.artifactPath === 'string' && payload.artifactPath.trim()) {
    return payload.artifactPath;
  }
  return undefined;
};

const getBrowserWorkerBaseUrl = (recorderWsUrl?: string): string | undefined => {
  if (!recorderWsUrl) {
    return undefined;
  }
  try {
    const runtimeUrl = new URL(recorderWsUrl);
    runtimeUrl.protocol = runtimeUrl.protocol === 'wss:' ? 'https:' : 'http:';
    runtimeUrl.pathname = '';
    runtimeUrl.search = '';
    runtimeUrl.hash = '';
    return runtimeUrl.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
};

export const buildBrowserWorkerArtifactUrl = (
  recorderWsUrl: string | undefined,
  artifactPath?: string
): string | undefined => {
  if (!artifactPath) {
    return undefined;
  }
  const trimmedPath = artifactPath.trim();
  if (!trimmedPath) {
    return undefined;
  }
  if (/^https?:\/\//i.test(trimmedPath) || trimmedPath.startsWith('data:')) {
    return trimmedPath;
  }

  const fileName = trimmedPath.split('/').filter(Boolean).pop();
  const browserWorkerBaseUrl = getBrowserWorkerBaseUrl(recorderWsUrl);
  if (!fileName || !browserWorkerBaseUrl) {
    return undefined;
  }

  return `${browserWorkerBaseUrl}/browser/artifacts/${encodeURIComponent(fileName)}`;
};

export const getPhaseArtifactPreviewSrc = (
  recorderWsUrl: string | undefined,
  artifact: ExecutionPhaseArtifactDto
): string | undefined => {
  const payload = getPhaseArtifactPayload(artifact);
  const payloadImageSrc = extractBrowserImageSrc(payload);
  if (payloadImageSrc) {
    return payloadImageSrc;
  }

  const artifactPath = getPhaseArtifactPath(artifact);
  if (!artifactPath || !/\.(png|jpe?g|gif|webp)$/i.test(artifactPath)) {
    return undefined;
  }

  return buildBrowserWorkerArtifactUrl(recorderWsUrl, artifactPath);
};

export const extractWorkflowActivitySnapshotSources = (
  recorderWsUrl: string | undefined,
  phase: ExecutionPhaseDto
): string[] => {
  const unique = new Set<string>();

  (phase.artifacts || [])
    .filter((artifact) => artifact.artifactType === 'snapshot')
    .forEach((artifact) => {
      const src = getPhaseArtifactPreviewSrc(recorderWsUrl, artifact);
      if (src) {
        unique.add(src);
      }
    });

  return Array.from(unique);
};

export const extractPhaseStepUrl = (step: ExecutionPhaseStepDto): string | undefined => {
  const output = asRecord(step.output);
  const input = asRecord(step.input);
  const candidates = [
    output?.pageUrl,
    output?.url,
    input?.pageUrl,
    input?.url,
    input?.targetUrl,
    input?.href,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return undefined;
};

export const extractPhaseStepImageSources = (
  recorderWsUrl: string | undefined,
  step: ExecutionPhaseStepDto,
  artifacts: ExecutionPhaseArtifactDto[]
): string[] => {
  const found = new Set<string>(extractBrowserImageSources(step.output));
  const output = asRecord(step.output);
  const artifactRecord = asRecord(output?.artifact);
  const snapshotRecord = asRecord(output?.snapshot);
  const candidatePaths = [
    typeof artifactRecord?.path === 'string' ? artifactRecord.path : undefined,
    typeof snapshotRecord?.path === 'string' ? snapshotRecord.path : undefined,
  ];

  for (const path of candidatePaths) {
    const src = buildBrowserWorkerArtifactUrl(recorderWsUrl, path);
    if (src) {
      found.add(src);
    }
  }

  if (step.snapshotId) {
    const matchedArtifact = artifacts.find((artifact) => artifact.snapshotId === step.snapshotId);
    const artifactSrc = matchedArtifact
      ? getPhaseArtifactPreviewSrc(recorderWsUrl, matchedArtifact)
      : undefined;
    if (artifactSrc) {
      found.add(artifactSrc);
    }
  }

  return Array.from(found);
};

export const getVisiblePhaseSteps = (phase: ExecutionPhaseDto): ExecutionPhaseStepDto[] => {
  const steps = phase.steps || [];
  if (phase.status !== 'completed') {
    return steps;
  }

  const lastFailedIndex = steps.reduce(
    (index, step, currentIndex) => (step.status === 'failed' ? currentIndex : index),
    -1
  );

  if (lastFailedIndex < 0) {
    return steps;
  }

  const hasLaterCompletedStep = steps
    .slice(lastFailedIndex + 1)
    .some((step) => step.status === 'completed');
  if (!hasLaterCompletedStep) {
    return steps;
  }

  return steps.filter((step, index) => !(step.status === 'failed' && index <= lastFailedIndex));
};
