import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import {
  BROWSER_RUN_OUTPUT_V2_SCHEMA_DIGEST,
  type BrowserArtifactRef,
  type BrowserOutputValue,
  type BrowserPageCapture,
  type BrowserRunOutputV2,
  type BrowserStepStatus,
  type BrowserStepSummary,
  validateBrowserRunOutputV2,
} from '@ops/backend-browser-execution-contract';
import { BrowserRuntimeMutableState } from '../capability-release-browser-runtime.types';

@Injectable()
export class BrowserRunOutputMaterializerService {
  materialize(input: {
    executionId: string;
    runtimeSessionId: string;
    backend: string;
    state: BrowserRuntimeMutableState;
    outputNames: string[];
  }): BrowserRunOutputV2 {
    const artifacts: BrowserArtifactRef[] = [];
    const pages: BrowserPageCapture[] = [];
    const steps: BrowserStepSummary[] = [];
    let latestPageId: string | undefined;
    const attempts = new Map<string, number>();

    for (const rawStep of input.state.stepResults) {
      const stepId = stringOr(rawStep.stepId, 'unknown_step');
      const attempt = numberOr(rawStep.attempt, (attempts.get(stepId) || 0) + 1);
      attempts.set(stepId, attempt);
      const status = resolveStepStatus(rawStep);
      const rawArtifacts = Array.isArray(rawStep.artifacts) ? rawStep.artifacts.filter(isRecord) : [];
      const stepArtifacts = rawArtifacts.map((artifact, index) => this.normalizeArtifact(artifact, input.executionId, stepId, attempt, index));
      artifacts.push(...stepArtifacts);
      const pageState = asRecord(rawStep.pageState);
      let pageId: string | undefined;
      if (pageState) {
        input.state.captureOrdinal += 1;
        pageId = this.pageId(input.executionId, stepId, attempt, input.state.captureOrdinal, pageState);
        latestPageId = pageId;
        for (const artifact of stepArtifacts) artifact.metadata = { ...(artifact.metadata || {}), pageId };
        pages.push({
          pageId,
          stepId,
          attempt,
          captureReason: status === 'recovered' ? 'step_recovered' : status === 'failed' ? 'step_failed' : 'step_completed',
          ...(stringOrUndefined(pageState.pageUrl) ? { url: stringOrUndefined(pageState.pageUrl) } : {}),
          ...(stringOrUndefined(pageState.pageTitle) ? { title: stringOrUndefined(pageState.pageTitle) } : {}),
          ...(stringOrUndefined(pageState.pageFingerprint) ? { fingerprint: stringOrUndefined(pageState.pageFingerprint) } : {}),
          ...(stringOrUndefined(pageState.readyState) ? { readyState: stringOrUndefined(pageState.readyState) } : {}),
          observedAt: stringOr(pageState.observedAt, new Date().toISOString()),
          artifactIds: stepArtifacts.map((artifact) => artifact.id),
        });
      }
      steps.push({
        stepId,
        ...(stringOrUndefined(rawStep.name) ? { name: stringOrUndefined(rawStep.name) } : {}),
        action: stringOr(rawStep.action, 'unknown'),
        status,
        attempt,
        ...(stringOrUndefined(rawStep.attemptedAt) ? { startedAt: stringOrUndefined(rawStep.attemptedAt) } : {}),
        ...(stringOrUndefined(rawStep.observedAt) ? { endedAt: stringOrUndefined(rawStep.observedAt) } : {}),
        ...(pageId ? { pageId } : {}),
        ...(stringOrUndefined(rawStep.outputVar) ? { outputVar: stringOrUndefined(rawStep.outputVar) } : {}),
        ...(status === 'failed' ? { error: { ...(stringOrUndefined(rawStep.errorCode) ? { code: stringOrUndefined(rawStep.errorCode) } : {}), ...(stringOrUndefined(rawStep.errorMessage) ? { message: stringOrUndefined(rawStep.errorMessage) } : {}) } } : {}),
        ...(Array.isArray(rawStep.warningCodes) ? { warnings: rawStep.warningCodes.filter((item): item is string => typeof item === 'string') } : {}),
        ...(isRecord(rawStep.meta) ? { metadata: rawStep.meta } : {}),
      });
    }
    const uniqueArtifacts = deduplicateArtifacts(artifacts);
    const outputs = this.materializeOutputs(input.outputNames, input.state, steps, latestPageId, pages, uniqueArtifacts);
    const warnings = [...input.state.warnings];
    for (const name of input.outputNames) {
      if (!outputs[name]) warnings.push({ code: 'DECLARED_OUTPUT_MISSING', message: `声明输出未在运行时产生: ${name}` });
    }
    const summary = {
      totalSteps: steps.length,
      completedSteps: steps.filter((step) => step.status === 'completed').length,
      recoveredSteps: steps.filter((step) => step.status === 'recovered').length,
      failedSteps: steps.filter((step) => step.status === 'failed').length,
      skippedSteps: steps.filter((step) => step.status === 'skipped').length,
    };
    const output: BrowserRunOutputV2 = {
      schemaVersion: 'browser-run-output/v2',
      run: {
        executionId: input.executionId,
        runtimeSessionId: input.runtimeSessionId,
        backend: input.backend,
        status: summary.failedSteps > 0 ? 'failed' : steps.some((step) => step.status === 'blocked') ? 'blocked' : steps.some((step) => step.status === 'takeover_required') ? 'takeover_required' : summary.recoveredSteps > 0 || warnings.length > 0 ? 'completed_with_warnings' : 'completed',
        startedAt: input.state.startedAt,
        endedAt: new Date().toISOString(),
        ...(latestPageId ? { finalPageId: latestPageId } : {}),
        contractDigest: BROWSER_RUN_OUTPUT_V2_SCHEMA_DIGEST,
      },
      summary,
      steps,
      pages,
      artifacts: uniqueArtifacts,
      outputs,
      warnings: deduplicateWarnings(warnings),
    };
    const validation = validateBrowserRunOutputV2(output);
    if (!validation.valid) {
      output.warnings.push({ code: 'BROWSER_RUN_OUTPUT_INVALID', message: validation.errors.join('; ') });
    }
    return output;
  }

  private materializeOutputs(outputNames: string[], state: BrowserRuntimeMutableState, steps: BrowserStepSummary[], latestPageId: string | undefined, pages: BrowserPageCapture[], artifacts: BrowserArtifactRef[]): Record<string, BrowserOutputValue> {
    const outputs: Record<string, BrowserOutputValue> = {};
    for (const name of outputNames) {
      const producer = [...steps].reverse().find((step) => step.outputVar === name);
      const value = state.variables[name] ?? this.systemOutput(name, latestPageId, pages, artifacts, steps);
      if (value === undefined) continue;
      outputs[name] = { value, ...(producer ? { producerStepId: producer.stepId } : {}), type: valueType(value) };
    }
    return outputs;
  }

  private systemOutput(name: string, latestPageId: string | undefined, pages: BrowserPageCapture[], artifacts: BrowserArtifactRef[], steps: BrowserStepSummary[]): unknown {
    if (name === 'pageState') return latestPageId ? pages.find((page) => page.pageId === latestPageId) : undefined;
    if (name === 'executionResult') return { summary: { totalSteps: steps.length }, finalPageId: latestPageId };
    if (name === 'snapshotArtifact') return artifacts[artifacts.length - 1];
    return undefined;
  }

  private normalizeArtifact(value: Record<string, unknown>, executionId: string, stepId: string, attempt: number, index: number): BrowserArtifactRef {
    const metadata = isRecord(value.metadata) ? { ...value.metadata } : {};
    const id = stringOr(value.id, createHash('sha256').update(`${executionId}|${stepId}|${attempt}|${stringOr(value.type, 'artifact')}|${index}`).digest('hex').slice(0, 32));
    return {
      id,
      type: stringOr(value.type, 'browser_artifact'),
      ...(stringOrUndefined(value.name) ? { name: stringOrUndefined(value.name) } : {}),
      ...(stringOrUndefined(value.url) ? { url: stringOrUndefined(value.url) } : {}),
      ...(stringOrUndefined(value.mimeType) ? { mimeType: stringOrUndefined(value.mimeType) } : {}),
      ...(typeof value.sizeBytes === 'number' ? { sizeBytes: value.sizeBytes } : {}),
      metadata,
    };
  }

  private pageId(executionId: string, stepId: string, attempt: number, ordinal: number, pageState: Record<string, unknown>): string {
    const fingerprint = stringOr(pageState.pageFingerprint, `${stringOr(pageState.pageUrl, '')}|${stringOr(pageState.pageTitle, '')}`);
    return `page_${createHash('sha256').update(`${executionId}|${stepId}|${attempt}|${ordinal}|${fingerprint}`).digest('hex').slice(0, 24)}`;
  }
}

function resolveStepStatus(value: Record<string, unknown>): BrowserStepStatus {
  if (value.recovered === true) return 'recovered';
  if (value.blocked === true) return 'blocked';
  if (value.takeover === true) return 'takeover_required';
  if (value.skipped === true) return 'skipped';
  if (value.success === false || value.errorCode || value.errorMessage || value.error) return 'failed';
  return 'completed';
}

function asRecord(value: unknown): Record<string, unknown> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stringOr(value: unknown, fallback: string): string { return typeof value === 'string' && value.trim() ? value : fallback; }
function stringOrUndefined(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined; }
function numberOr(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback; }
function valueType(value: unknown): BrowserOutputValue['type'] { if (value === null) return 'null'; if (Array.isArray(value)) return 'array'; if (typeof value === 'object') return 'object'; return ['string', 'number', 'boolean'].includes(typeof value) ? typeof value as BrowserOutputValue['type'] : 'unknown'; }
function deduplicateArtifacts(artifacts: BrowserArtifactRef[]): BrowserArtifactRef[] { const ids = new Set<string>(); return artifacts.filter((artifact) => ids.has(artifact.id) ? false : (ids.add(artifact.id), true)); }
function deduplicateWarnings(warnings: Array<{ code: string; message: string; stepId?: string }>) { const keys = new Set<string>(); return warnings.filter((warning) => { const key = `${warning.code}|${warning.stepId || ''}|${warning.message}`; return keys.has(key) ? false : (keys.add(key), true); }); }
