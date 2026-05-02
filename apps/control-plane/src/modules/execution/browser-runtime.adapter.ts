import { Injectable } from '@nestjs/common';
import axios from 'axios';
import {
  buildRuntimeAdapterRouteKey,
  RuntimeAdapter,
  RuntimeStepInvokeRequest,
  RuntimeStepInvokeResult,
} from './runtime-adapter.interface';

interface LegacyBrowserExecuteStepRequest {
  executionId: string;
  runtimeSessionId: string;
  stepId: string;
  action: string;
  target?: string;
  args?: Record<string, unknown>;
}

interface LegacyBrowserExecuteStepResult {
  success: boolean;
  snapshotId?: string;
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  shouldTakeover: boolean;
  takeoverReason?: string;
}

@Injectable()
export class BrowserRuntimeAdapter implements RuntimeAdapter {
  readonly runtimeType = 'browser' as const;
  readonly routeKeys = [buildRuntimeAdapterRouteKey('browser', 'browser.step')] as const;
  private readonly browserWorkerUrl =
    process.env.BROWSER_WORKER_URL || 'http://ops-browser-worker:3004';

  supports(request: RuntimeStepInvokeRequest): boolean {
    return request.runtimeType === 'browser' && request.capabilityType === 'browser.step';
  }

  async initializeSession(_runtimeSessionId: string): Promise<void> {
    await axios.post<{ success: boolean; message: string }>(
      `${this.browserWorkerUrl}/browser/init`,
      {},
    );
  }

  async invokeStep(request: RuntimeStepInvokeRequest): Promise<RuntimeStepInvokeResult> {
    const payload: LegacyBrowserExecuteStepRequest = {
      executionId: request.executionId,
      runtimeSessionId: request.runtimeSessionId || '',
      stepId: request.stepId,
      action: request.action,
      target: typeof request.input.target === 'string' ? request.input.target : undefined,
      args:
        request.input.args && typeof request.input.args === 'object'
          ? (request.input.args as Record<string, unknown>)
          : undefined,
    };

    const response = await axios.post<LegacyBrowserExecuteStepResult>(
      `${this.browserWorkerUrl}/browser/execute-step`,
      payload,
    );

    const legacyResult = response.data;
    const requiresTakeover = Boolean(legacyResult.shouldTakeover);

    return {
      success: legacyResult.success,
      status: requiresTakeover
        ? 'takeover_required'
        : legacyResult.success
          ? 'completed'
          : 'failed',
      output: legacyResult.output,
      errorCode: legacyResult.errorCode,
      errorMessage: legacyResult.errorMessage,
      requiresTakeover,
      takeoverReason: legacyResult.takeoverReason,
      snapshot: legacyResult.snapshotId
        ? {
            id: legacyResult.snapshotId,
            type: 'browser',
          }
        : null,
      rawResult: legacyResult as unknown as Record<string, unknown>,
    };
  }
}
