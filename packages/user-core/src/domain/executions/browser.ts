import type { ExecutionPhaseDto } from '../../types/execution.types.js';
import { asRecord, tryParseJsonValue } from './common.js';

export interface BrowserExecutionStepResult {
  stepId?: string;
  name?: string;
  action?: string;
  target?: string | null;
  snapshotId?: string | null;
  output?: Record<string, unknown> | null;
}

export interface BrowserExecutionTraceViewModel {
  recorderSessionId?: string;
  exportArtifactId?: string;
  releaseId?: string;
  skillDraftId?: string;
  publishedSkillId?: string;
  runtimeExecutionId?: string;
}

export interface BrowserExecutionRuntimeEvidenceViewModel {
  currentStepId?: string;
  currentLoopIteration?: number;
  currentRiskLevel?: string;
  riskReason?: string;
  lastReadValue?: Record<string, unknown> | null;
  lastBranchDecision?: Record<string, unknown> | null;
  takeoverReason?: string;
}

export interface BrowserExecutionResultViewModel {
  runtimeSessionId?: string;
  backend?: string;
  stepResults: BrowserExecutionStepResult[];
  failedStep?: string;
  failedAction?: string;
  snapshotId?: string | null;
  executionPlanVersion?: string;
  degradedMode?: boolean;
  degradeReason?: string;
  trace?: BrowserExecutionTraceViewModel;
  runtimeEvidence?: BrowserExecutionRuntimeEvidenceViewModel;
}

export const extractBrowserExecutionResult = (
  value: unknown
): BrowserExecutionResultViewModel | null => {
  const parsed = tryParseJsonValue(value);
  const candidates = [
    asRecord(parsed),
    asRecord(asRecord(parsed)?.result),
    asRecord(asRecord(parsed)?.output),
  ].filter((item): item is Record<string, unknown> => Boolean(item));

  for (const candidate of candidates) {
    const rawStepResults = Array.isArray(candidate.stepResults)
      ? candidate.stepResults
      : Array.isArray(candidate.results)
        ? candidate.results
        : undefined;
    if (!Array.isArray(rawStepResults)) {
      continue;
    }

    const stepResults = rawStepResults
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      )
      .map((item) => ({
        stepId: typeof item.stepId === 'string' ? item.stepId : undefined,
        name:
          typeof item.name === 'string'
            ? item.name
            : typeof item.command === 'string'
              ? item.command
              : undefined,
        action:
          typeof item.action === 'string'
            ? item.action
            : typeof item.command === 'string'
              ? item.command
              : undefined,
        target: typeof item.target === 'string' ? item.target : null,
        snapshotId:
          typeof item.snapshotId === 'string'
            ? item.snapshotId
            : typeof asRecord(item.snapshot)?.id === 'string'
              ? (asRecord(item.snapshot)?.id as string)
              : null,
        output: asRecord(item.output) || item,
      }));
    const trace = asRecord(candidate.trace);
    const runtimeEvidence = asRecord(candidate.runtimeEvidence);

    return {
      runtimeSessionId:
        typeof candidate.runtimeSessionId === 'string' ? candidate.runtimeSessionId : undefined,
      backend: typeof candidate.backend === 'string' ? candidate.backend : undefined,
      stepResults,
      failedStep: typeof candidate.failedStep === 'string' ? candidate.failedStep : undefined,
      failedAction: typeof candidate.failedAction === 'string' ? candidate.failedAction : undefined,
      snapshotId: typeof candidate.snapshotId === 'string' ? candidate.snapshotId : null,
      executionPlanVersion:
        typeof candidate.executionPlanVersion === 'string'
          ? candidate.executionPlanVersion
          : undefined,
      degradedMode:
        typeof candidate.degradedMode === 'boolean' ? candidate.degradedMode : undefined,
      degradeReason:
        typeof candidate.degradeReason === 'string' ? candidate.degradeReason : undefined,
      trace: trace
        ? {
            recorderSessionId:
              typeof trace.recorderSessionId === 'string' ? trace.recorderSessionId : undefined,
            exportArtifactId:
              typeof trace.exportArtifactId === 'string' ? trace.exportArtifactId : undefined,
            releaseId: typeof trace.releaseId === 'string' ? trace.releaseId : undefined,
            skillDraftId: typeof trace.skillDraftId === 'string' ? trace.skillDraftId : undefined,
            publishedSkillId:
              typeof trace.publishedSkillId === 'string' ? trace.publishedSkillId : undefined,
            runtimeExecutionId:
              typeof trace.runtimeExecutionId === 'string' ? trace.runtimeExecutionId : undefined,
          }
        : undefined,
      runtimeEvidence: runtimeEvidence
        ? {
            currentStepId:
              typeof runtimeEvidence.currentStepId === 'string'
                ? runtimeEvidence.currentStepId
                : undefined,
            currentLoopIteration:
              typeof runtimeEvidence.currentLoopIteration === 'number'
                ? runtimeEvidence.currentLoopIteration
                : undefined,
            currentRiskLevel:
              typeof runtimeEvidence.currentRiskLevel === 'string'
                ? runtimeEvidence.currentRiskLevel
                : undefined,
            riskReason:
              typeof runtimeEvidence.riskReason === 'string'
                ? runtimeEvidence.riskReason
                : undefined,
            lastReadValue: asRecord(runtimeEvidence.lastReadValue),
            lastBranchDecision: asRecord(runtimeEvidence.lastBranchDecision),
            takeoverReason:
              typeof runtimeEvidence.takeoverReason === 'string'
                ? runtimeEvidence.takeoverReason
                : undefined,
          }
        : undefined,
    };
  }

  return null;
};

export const hasBrowserAuditEvidence = (
  result: BrowserExecutionResultViewModel | null | undefined
): boolean =>
  Boolean(
    result &&
    (result.executionPlanVersion ||
      result.degradedMode !== undefined ||
      result.degradeReason ||
      result.runtimeEvidence?.currentStepId ||
      result.runtimeEvidence?.currentLoopIteration !== undefined ||
      result.runtimeEvidence?.currentRiskLevel ||
      result.runtimeEvidence?.riskReason ||
      result.runtimeEvidence?.takeoverReason ||
      result.runtimeEvidence?.lastReadValue ||
      result.runtimeEvidence?.lastBranchDecision ||
      result.trace?.recorderSessionId ||
      result.trace?.exportArtifactId ||
      result.trace?.releaseId ||
      result.trace?.skillDraftId ||
      result.trace?.publishedSkillId ||
      result.trace?.runtimeExecutionId)
  );

export const hasBrowserExecutionEvidence = (input: {
  runtimeType?: string;
  runtimeSessionId?: string;
  browserExecutionResult?: BrowserExecutionResultViewModel | null;
  phases?: Array<Pick<ExecutionPhaseDto, 'runtimeSessionId' | 'output'>>;
}): boolean => {
  if (input.browserExecutionResult) {
    return true;
  }

  const normalizedRuntimeType =
    typeof input.runtimeType === 'string' ? input.runtimeType.trim().toLowerCase() : '';
  if (normalizedRuntimeType !== 'browser') {
    return false;
  }

  if (typeof input.runtimeSessionId === 'string' && input.runtimeSessionId.trim().length > 0) {
    return true;
  }

  return (input.phases || []).some((phase) => {
    if (typeof phase.runtimeSessionId === 'string' && phase.runtimeSessionId.trim().length > 0) {
      return true;
    }
    return Boolean(extractBrowserExecutionResult(phase.output));
  });
};

export const sanitizeBrowserOutputForDisplay = (value: unknown): unknown => {
  if (typeof value === 'string') {
    if (value.length > 400 && /^[A-Za-z0-9+/=]+$/.test(value)) {
      return `[omitted large base64 string, length=${value.length}]`;
    }
    return value.length > 1200 ? `${value.slice(0, 1200)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeBrowserOutputForDisplay(item));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, current]) => {
        if (key.toLowerCase().includes('base64') && typeof current === 'string') {
          acc[key] = `[omitted base64 payload, length=${current.length}]`;
          return acc;
        }
        acc[key] = sanitizeBrowserOutputForDisplay(current);
        return acc;
      },
      {}
    );
  }
  return value;
};

export const parseBrowserStdoutResult = (stdout: string | undefined): unknown => {
  if (!stdout) {
    return undefined;
  }
  const marker = '### Result';
  const codeMarker = '### Ran Playwright code';
  const startIndex = stdout.indexOf(marker);
  if (startIndex < 0) {
    return undefined;
  }

  const contentStart = startIndex + marker.length;
  const codeIndex = stdout.indexOf(codeMarker, contentStart);
  const rawResult = stdout.slice(contentStart, codeIndex >= 0 ? codeIndex : undefined).trim();
  if (!rawResult) {
    return undefined;
  }

  try {
    return JSON.parse(rawResult);
  } catch {
    return rawResult;
  }
};

const isLikelyImageUrl = (value: string) =>
  /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(value);

const isLikelyBase64ImagePayload = (value: string) =>
  value.length > 200 && /^[A-Za-z0-9+/=]+$/.test(value);

export const extractBrowserImageSrc = (value: unknown, hint?: string): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('data:image/')) {
      return trimmed;
    }
    if (isLikelyImageUrl(trimmed)) {
      return trimmed;
    }
    if (
      hint &&
      /(screenshot|image|img|base64)/i.test(hint) &&
      isLikelyBase64ImagePayload(trimmed)
    ) {
      return `data:image/png;base64,${trimmed}`;
    }
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractBrowserImageSrc(item, hint);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  if (value && typeof value === 'object') {
    for (const [key, current] of Object.entries(value as Record<string, unknown>)) {
      const found = extractBrowserImageSrc(current, key);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
};

export const extractBrowserImageSources = (value: unknown, hint?: string): string[] => {
  const found = new Set<string>();

  const visit = (current: unknown, currentHint?: string) => {
    const single = extractBrowserImageSrc(current, currentHint);
    if (single) {
      found.add(single);
    }

    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, currentHint));
      return;
    }

    if (current && typeof current === 'object') {
      Object.entries(current as Record<string, unknown>).forEach(([key, item]) => {
        visit(item, key);
      });
    }
  };

  visit(value, hint);
  return Array.from(found);
};

export const buildBrowserOutputDisplay = (output: Record<string, unknown> | null | undefined) => {
  if (!output) {
    return {
      summary: undefined as unknown,
      imageSrc: undefined as string | undefined,
      imageSources: [] as string[],
      details: undefined as unknown,
      status: undefined as string | undefined,
      command: undefined as string | undefined,
    };
  }

  const sanitized = asRecord(sanitizeBrowserOutputForDisplay(output)) || {};
  const status = typeof sanitized.status === 'string' ? sanitized.status : undefined;
  const command = typeof sanitized.command === 'string' ? sanitized.command : undefined;
  const data = asRecord(sanitized.data);
  const stdout = typeof sanitized.stdout === 'string' ? sanitized.stdout : undefined;
  const stderr =
    typeof sanitized.stderr === 'string' && sanitized.stderr.trim() ? sanitized.stderr : undefined;
  const parsedStdoutResult = parseBrowserStdoutResult(stdout);
  const imageSrc = extractBrowserImageSrc(output);
  const imageSources = extractBrowserImageSources(output);
  const summary = data ||
    parsedStdoutResult || {
      ...(status ? { status } : {}),
      ...(command ? { command } : {}),
    };

  return {
    summary,
    imageSrc,
    imageSources,
    details: {
      ...(status ? { status } : {}),
      ...(command ? { command } : {}),
      ...(data ? { data } : {}),
      ...(!data && parsedStdoutResult !== undefined ? { result: parsedStdoutResult } : {}),
      ...(stderr ? { stderr } : {}),
    },
    status,
    command,
  };
};
