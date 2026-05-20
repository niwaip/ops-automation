import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { getBrowserWorkerUrl } from '../../config/service-endpoints';
import {
  buildRuntimeAdapterRouteKey,
  RuntimeAdapter,
  RuntimeStepInvokeRequest,
  RuntimeStepInvokeResult,
} from './runtime-adapter.interface';
import {
  BROWSER_RUNTIME,
  BROWSER_SESSION_PREFERENCES,
  BROWSER_WORKER_ENDPOINTS,
} from './browser-execution-constants';

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
  pageState?: {
    runtimeSessionId: string;
    pageUrl?: string;
    pageTitle?: string;
    pageFingerprint?: string;
    readyState?: string;
    observedAt?: string;
  };
  errorCode?: string;
  errorMessage?: string;
  shouldTakeover: boolean;
  takeoverReason?: string;
}

interface BrowserSessionPreferencesPayload {
  mode?: 'interactive' | 'agent';
  enableCodegen?: boolean;
  headless?: boolean;
}

interface BrowserPageStateResponse {
  runtimeSessionId: string;
  pageUrl?: string;
  pageTitle?: string;
  pageFingerprint?: string;
  readyState?: string;
  observedAt?: string;
}

interface BrowserPageAssertionResponse {
  matched: boolean;
  pageState: BrowserPageStateResponse;
  details?: Record<string, unknown>;
}

@Injectable()
export class BrowserRuntimeAdapter implements RuntimeAdapter {
  readonly runtimeType = BROWSER_RUNTIME.TYPE;
  readonly routeKeys = [buildRuntimeAdapterRouteKey(BROWSER_RUNTIME.TYPE, BROWSER_RUNTIME.CAPABILITY_TYPE)] as const;
  private readonly browserWorkerUrl = getBrowserWorkerUrl();

  supports(request: RuntimeStepInvokeRequest): boolean {
    return request.runtimeType === BROWSER_RUNTIME.TYPE
      && request.capabilityType === BROWSER_RUNTIME.CAPABILITY_TYPE;
  }

  private resolveSessionPreferences(
    _request?: RuntimeStepInvokeRequest,
  ): BrowserSessionPreferencesPayload {
    return { ...BROWSER_SESSION_PREFERENCES };
  }

  async initializeSession(runtimeSessionId: string): Promise<void> {
    await axios.post<{ success: boolean; message: string }>(
      `${this.browserWorkerUrl}${BROWSER_WORKER_ENDPOINTS.INIT}`,
      {
        runtimeSessionId,
        sessionPreferences: this.resolveSessionPreferences(),
      },
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
      `${this.browserWorkerUrl}${BROWSER_WORKER_ENDPOINTS.EXECUTE_STEP}`,
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
      output: {
        ...(legacyResult.output || {}),
        pageUrl: legacyResult.pageState?.pageUrl || legacyResult.output?.pageUrl || null,
        pageTitle: legacyResult.pageState?.pageTitle || legacyResult.output?.pageTitle || null,
        pageFingerprint: legacyResult.pageState?.pageFingerprint || legacyResult.output?.pageFingerprint || null,
      },
      errorCode: legacyResult.errorCode,
      errorMessage: legacyResult.errorMessage,
      requiresTakeover,
      takeoverReason: legacyResult.takeoverReason,
      snapshot: legacyResult.snapshotId
        ? {
            id: legacyResult.snapshotId,
            type: 'browser',
            url: legacyResult.pageState?.pageUrl || undefined,
            metadata: legacyResult.pageState
              ? {
                  pageTitle: legacyResult.pageState.pageTitle || null,
                  pageFingerprint: legacyResult.pageState.pageFingerprint || null,
                  readyState: legacyResult.pageState.readyState || null,
                  observedAt: legacyResult.pageState.observedAt || null,
                }
              : undefined,
          }
        : null,
      rawResult: legacyResult as unknown as Record<string, unknown>,
    };
  }

  async inspectState(input: {
    runtimeSessionId: string;
    backend?: 'cli' | 'chrome-devtools';
  }): Promise<BrowserPageStateResponse> {
    const response = await axios.post<BrowserPageStateResponse>(
      `${this.browserWorkerUrl}${BROWSER_WORKER_ENDPOINTS.INSPECT_STATE}`,
      {
        runtimeSessionId: input.runtimeSessionId,
        backend: input.backend || BROWSER_RUNTIME.DEFAULT_BACKEND,
      },
    );
    return response.data;
  }

  async assertState(input: {
    runtimeSessionId: string;
    backend?: 'cli' | 'chrome-devtools';
    pageUrl?: string;
    pageUrlIncludes?: string;
    pageTitle?: string;
    pageTitleIncludes?: string;
    pageFingerprint?: string;
    readyState?: string;
    selectorExists?: string;
    textIncludes?: string;
  }): Promise<BrowserPageAssertionResponse> {
    const response = await axios.post<BrowserPageAssertionResponse>(
      `${this.browserWorkerUrl}${BROWSER_WORKER_ENDPOINTS.ASSERT_STATE}`,
      {
        runtimeSessionId: input.runtimeSessionId,
        backend: input.backend || BROWSER_RUNTIME.DEFAULT_BACKEND,
        pageUrl: input.pageUrl,
        pageUrlIncludes: input.pageUrlIncludes,
        pageTitle: input.pageTitle,
        pageTitleIncludes: input.pageTitleIncludes,
        pageFingerprint: input.pageFingerprint,
        readyState: input.readyState,
        selectorExists: input.selectorExists,
        textIncludes: input.textIncludes,
      },
    );
    return response.data;
  }
}
