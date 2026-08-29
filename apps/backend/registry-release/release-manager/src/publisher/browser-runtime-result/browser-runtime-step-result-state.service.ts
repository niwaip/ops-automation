import { Injectable } from '@nestjs/common';
import { BrowserRecordingRuntimeStep } from '../../compiler/browser-recording-runtime.types';
import { BrowserRuntimeMutableState } from '../capability-release-browser-runtime.types';

@Injectable()
export class BrowserRuntimeStepResultStateService {
  nextAttempt(state: BrowserRuntimeMutableState, stepId: string): number {
    const attempt = (state.attemptByStepId[stepId] || 0) + 1;
    state.attemptByStepId[stepId] = attempt;
    return attempt;
  }

  recordWorkerResult(input: {
    state: BrowserRuntimeMutableState;
    step: Pick<BrowserRecordingRuntimeStep, 'id' | 'name' | 'action' | 'target' | 'outputVar'>;
    attempt: number;
    result: Record<string, unknown>;
    recovered?: boolean;
    metadata?: Record<string, unknown>;
  }): void {
    const pageState = asRecord(input.result.pageState);
    const output = asRecord(input.result.output) || {};
    const contentCandidate = asRecord(output.contentCandidate);
    if (contentCandidate) (input.state.contentCandidates ||= []).push({ ...contentCandidate, sourceStepId: input.step.id });
    delete output.contentCandidate;
    if (typeof pageState?.pageUrl === 'string') input.state.currentPageUrl = pageState.pageUrl;
    input.state.stepResults.push({
      stepId: input.step.id,
      name: input.step.name,
      action: input.step.action,
      target: input.step.target || null,
      attempt: input.attempt,
      success: input.recovered ? true : input.result.success === true,
      ...(input.recovered ? { recovered: true } : {}),
      ...(input.result.snapshotId ? { snapshotId: input.result.snapshotId } : {}),
      output,
      ...(input.step.outputVar ? { outputVar: input.step.outputVar } : {}),
      ...(pageState ? { pageState } : {}),
      ...(Array.isArray(input.result.artifacts) ? { artifacts: input.result.artifacts } : {}),
      ...(typeof input.result.errorCode === 'string' ? { errorCode: input.result.errorCode } : {}),
      ...(typeof input.result.errorMessage === 'string' ? { errorMessage: input.result.errorMessage } : {}),
      ...(typeof input.result.attemptedAt === 'string' ? { attemptedAt: input.result.attemptedAt } : {}),
      ...(typeof input.result.observedAt === 'string' ? { observedAt: input.result.observedAt } : {}),
      ...(Array.isArray(input.result.warningCodes) ? { warningCodes: input.result.warningCodes } : {}),
      ...(input.metadata ? { meta: input.metadata } : {}),
    });
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
