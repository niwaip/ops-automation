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
    return payload.snapshotPath.trim();
  }
  if (typeof payload?.artifactPath === 'string' && payload.artifactPath.trim()) {
    return payload.artifactPath.trim();
  }
  if (typeof payload?.path === 'string' && payload.path.trim()) {
    return payload.path.trim();
  }
  const output = asRecord(payload?.output);
  if (typeof output?.screenshotPath === 'string' && output.screenshotPath.trim()) {
    return output.screenshotPath.trim();
  }
  const data = asRecord(output?.data);
  if (typeof data?.screenshotPath === 'string' && data.screenshotPath.trim()) {
    return data.screenshotPath.trim();
  }
  if (typeof data?.path === 'string' && data.path.trim()) {
    return data.path.trim();
  }
  const snapshot = asRecord(output?.snapshot);
  if (typeof snapshot?.path === 'string' && snapshot.path.trim()) {
    return snapshot.path.trim();
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
  if (trimmedPath.startsWith('data:')) {
    return trimmedPath;
  }

  // Preserve external full URLs that are not browser-worker artifacts
  if (
    /^https?:\/\//i.test(trimmedPath) &&
    !/\/artifacts\//i.test(trimmedPath) &&
    !/:(3004|9222)/.test(trimmedPath)
  ) {
    return trimmedPath;
  }

  const fileName = trimmedPath.split('/').filter(Boolean).pop();
  if (!fileName) {
    return undefined;
  }

  if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
    return `/api/browser-runtime/artifacts/${encodeURIComponent(fileName)}`;
  }

  // Non-browser fallback (SSR/testing/node scripts)
  const browserWorkerBaseUrl = getBrowserWorkerBaseUrl(recorderWsUrl);
  if (!browserWorkerBaseUrl) {
    return `/api/browser-runtime/artifacts/${encodeURIComponent(fileName)}`;
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
  const seenSnapshots = new Set<string>();
  const results: string[] = [];

  for (const artifact of phase.artifacts || []) {
    if (
      artifact.artifactType !== 'snapshot' &&
      artifact.artifactType !== 'browser_page_screenshot'
    ) {
      continue;
    }
    const snapshotKey = artifact.snapshotId || artifact.id;
    if (snapshotKey && seenSnapshots.has(snapshotKey)) {
      continue;
    }
    const src = getPhaseArtifactPreviewSrc(recorderWsUrl, artifact);
    if (src) {
      if (snapshotKey) {
        seenSnapshots.add(snapshotKey);
      }
      if (!results.includes(src)) {
        results.push(src);
      }
    }
  }

  return results;
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
  const dataRecord = asRecord(output?.data);
  const candidatePaths = [
    typeof artifactRecord?.path === 'string' ? artifactRecord.path : undefined,
    typeof snapshotRecord?.path === 'string' ? snapshotRecord.path : undefined,
    typeof dataRecord?.screenshotPath === 'string' ? dataRecord.screenshotPath : undefined,
    typeof dataRecord?.path === 'string' ? dataRecord.path : undefined,
    typeof output?.screenshotPath === 'string' ? output.screenshotPath : undefined,
  ];

  // Only resolve candidate artifact paths if inline image is not already present
  if (found.size === 0) {
    for (const path of candidatePaths) {
      if (path) {
        const src = buildBrowserWorkerArtifactUrl(recorderWsUrl, path);
        if (src) {
          found.add(src);
          break;
        }
      }
    }
  }

  if (step.snapshotId && found.size === 0) {
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
