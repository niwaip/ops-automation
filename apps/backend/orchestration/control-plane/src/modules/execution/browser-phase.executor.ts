import { Injectable } from '@nestjs/common';
import {
  BrowserPhaseRecoveryDecision,
  BrowserPhaseRecoveryPatch,
  BrowserPhaseRecoveryPlanner,
  BrowserPhaseRecoveryPolicy,
} from './browser-phase-recovery.planner';
import { BrowserRuntimeAdapter } from './browser-runtime.adapter';
import type { BrowserPhaseCheck } from './execution.dto';
import { ExecutionPhaseService } from './execution-phase.service';
import { RuntimeExecutionOrchestrator } from './runtime-execution.orchestrator';
import {
  PolicyContext,
  RuntimePhaseInvokeResult,
  RuntimeStepInvokeRequest,
  TraceContext,
} from './runtime-adapter.interface';
import { RECOVERY_ACTIONS, RECOVERY_MESSAGES } from './recovery-constants';
import {
  BROWSER_ACTIONS,
  BROWSER_ERROR_CODES,
  BROWSER_RUNTIME,
} from './browser-execution-constants';

export interface BrowserPhaseCommand {
  stepId: string;
  capabilityType: string;
  action: string;
  input: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface BrowserPhaseExecuteRequest {
  executionId: string;
  executionStepId?: string;
  phaseKey: string;
  phaseName: string;
  phaseType: string;
  runtimeSessionId?: string | null;
  skillId?: string | null;
  publishedSkillId?: string | null;
  runtimeType?: 'browser';
  policyContext?: PolicyContext;
  traceContext?: TraceContext;
  commands: BrowserPhaseCommand[];
  input?: Record<string, unknown>;
  precheck?: BrowserPhaseCheck;
  postcheck?: BrowserPhaseCheck;
  recoveryPolicy?: BrowserPhaseRecoveryPolicy;
}

@Injectable()
export class BrowserPhaseExecutor {
  // #region debug-point shared:phase-resume-no-effect
  private reportPhaseResumeDebug(
    hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E',
    msg: string,
    data: Record<string, unknown>,
    runId = 'pre-fix'
  ): void {
    const fs = require('fs') as typeof import('fs');
    const envPaths = [
      '/app/.dbg/phase-resume-no-effect.env',
      '/Users/chain/Documents/MyProject/ops-automation/.dbg/phase-resume-no-effect.env',
    ];
    let url = 'http://host.docker.internal:7777/event';
    let sessionId = 'phase-resume-no-effect';
    for (const envPath of envPaths) {
      try {
        const env = fs.readFileSync(envPath, 'utf8');
        url = env.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || url;
        sessionId = env.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
        break;
      } catch {}
    }
    const payload = {
      sessionId,
      runId,
      hypothesisId,
      location: 'browser-phase.executor',
      msg: `[DEBUG] ${msg}`,
      data,
      ts: Date.now(),
    };
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  }
  // #endregion

  constructor(
    private readonly browserPhaseRecoveryPlanner: BrowserPhaseRecoveryPlanner,
    private readonly browserRuntimeAdapter: BrowserRuntimeAdapter,
    private readonly executionPhaseService: ExecutionPhaseService,
    private readonly runtimeExecutionOrchestrator: RuntimeExecutionOrchestrator
  ) {}

  async execute(request: BrowserPhaseExecuteRequest): Promise<RuntimePhaseInvokeResult> {
    let phaseCommands = [...request.commands];
    const phaseRecordKey = this.resolvePhaseRecordKey(request.phaseKey, request.input);

    // Check for existing human intervention or recovery patch
    const existingPhase = await this.executionPhaseService.getByExecutionIdAndPhaseKey(
      request.executionId,
      phaseRecordKey
    );
    const existingDecision = this.readRecordValue(existingPhase?.recovery_decision_json as any);
    const existingPatch = this.readRecordValue(existingDecision?.patch);
    const shouldApplyExistingPatch = this.shouldApplyRecoveryPatchForRequest(
      existingPatch,
      request.input
    );
    // #region debug-point E:browser-phase-existing-decision
    this.reportPhaseResumeDebug('E', 'browser phase executor loaded existing recovery decision', {
      executionId: request.executionId,
      phaseKey: request.phaseKey,
      runtimeSessionId: request.runtimeSessionId || null,
      originalCommandStepIds: request.commands.map((command) => command.stepId),
      existingDecision: existingDecision || null,
      shouldApplyExistingPatch,
    });
    // #endregion
    if (existingPatch && shouldApplyExistingPatch) {
      phaseCommands = this.applyRecoveryPatch(
        phaseCommands,
        existingPatch as unknown as BrowserPhaseRecoveryPatch,
        request.executionStepId
      );
      // #region debug-point E:browser-phase-patch-applied
      this.reportPhaseResumeDebug('E', 'browser phase executor applied recovery patch', {
        executionId: request.executionId,
        phaseKey: request.phaseKey,
        patchType: existingPatch.type || null,
        patchedCommandStepIds: phaseCommands.map((command) => command.stepId),
      });
      // #endregion
    }

    const precheckMatched = await this.isCheckMatched(request.precheck, request.runtimeSessionId);
    if (
      precheckMatched ||
      (phaseCommands.length === 0 &&
        shouldApplyExistingPatch &&
        existingPatch?.type === 'resolve_by_human')
    ) {
      const isHumanResolved =
        phaseCommands.length === 0 &&
        shouldApplyExistingPatch &&
        existingPatch?.type === 'resolve_by_human';
      await this.executionPhaseService.markRunning(request.executionId, phaseRecordKey, {
        phaseName: request.phaseName,
        phaseType: request.phaseType,
        attempt: 1,
        runtimeSessionId: request.runtimeSessionId,
        input: request.input || null,
        precheck: request.precheck || null,
      });
      const shortCircuitResult: RuntimePhaseInvokeResult = {
        success: true,
        status: 'completed',
        stepResults: [],
        output: {
          shortCircuitedBy: precheckMatched ? 'precheck' : 'human_resolved',
          precheck: precheckMatched ? request.precheck : null,
          note: isHumanResolved ? existingPatch?.note : undefined,
        },
      };
      await this.executionPhaseService.markCompleted(request.executionId, phaseRecordKey, {
        phaseName: request.phaseName,
        phaseType: request.phaseType,
        attempt: 1,
        runtimeSessionId: request.runtimeSessionId,
        output: shortCircuitResult.output || null,
        postcheck: request.postcheck || null,
      });
      return shortCircuitResult;
    }

    const maxAttempts = Math.max(
      1,
      (request.recoveryPolicy?.maxAutoRetries || 0) +
        1 +
        (request.recoveryPolicy?.allowAiRecovery ? 1 : 0)
    );
    let attempt = 1;

    while (attempt <= maxAttempts) {
      await this.executionPhaseService.markRunning(request.executionId, phaseRecordKey, {
        phaseName: request.phaseName,
        phaseType: request.phaseType,
        attempt,
        runtimeSessionId: request.runtimeSessionId,
        input: request.input || null,
        precheck: request.precheck || null,
      });

      const phaseResult = await this.runtimeExecutionOrchestrator.executePhase({
        executionId: request.executionId,
        phaseKey: request.phaseKey,
        phaseName: request.phaseName,
        phaseType: request.phaseType,
        runtimeSessionId: request.runtimeSessionId,
        steps: this.buildStepRequests(request, phaseCommands),
        metadata: {
          input: request.input || null,
          precheck: request.precheck || null,
          postcheck: request.postcheck || null,
          recoveryPolicy: request.recoveryPolicy || null,
          attempt,
        },
      });

      const postcheckedResult = await this.applyPostcheck(
        phaseResult,
        request.postcheck,
        request.runtimeSessionId
      );
      const enrichedResult = await this.capturePhaseScreenshotIfPossible(
        request,
        postcheckedResult
      );
      if (enrichedResult.success) {
        await this.executionPhaseService.markCompleted(request.executionId, phaseRecordKey, {
          phaseName: request.phaseName,
          phaseType: request.phaseType,
          attempt,
          runtimeSessionId: request.runtimeSessionId,
          output: enrichedResult.output || { stepResults: enrichedResult.stepResults },
          postcheck: request.postcheck || null,
        });
        await this.persistPhaseSteps(
          request.executionId,
          phaseRecordKey,
          enrichedResult,
          phaseCommands
        );
        await this.persistPhaseArtifacts(request.executionId, phaseRecordKey, enrichedResult);
        return enrichedResult;
      }

      const recoveryDecision = await this.browserPhaseRecoveryPlanner.plan({
        executionId: request.executionId,
        phaseKey: request.phaseKey,
        phaseName: request.phaseName,
        phaseType: request.phaseType,
        attempt,
        commands: phaseCommands,
        result: enrichedResult,
        policy: request.recoveryPolicy,
      });
      if (recoveryDecision.action === RECOVERY_ACTIONS.RETRY_SAME_PHASE && attempt < maxAttempts) {
        attempt += 1;
        continue;
      }

      if (recoveryDecision.action === RECOVERY_ACTIONS.RETRY_WITH_PATCH && recoveryDecision.patch) {
        phaseCommands = this.applyRecoveryPatch(
          phaseCommands,
          recoveryDecision.patch,
          request.executionStepId
        );
        attempt += 1;
        continue;
      }

      if (recoveryDecision.action === RECOVERY_ACTIONS.TAKEOVER_REQUIRED) {
        await this.executionPhaseService.markWaitingTakeover(
          request.executionId,
          phaseRecordKey,
          {
            phaseName: request.phaseName,
            phaseType: request.phaseType,
            attempt,
            runtimeSessionId: request.runtimeSessionId,
            output: enrichedResult.output || { stepResults: enrichedResult.stepResults },
            postcheck: request.postcheck || null,
            recoveryDecision: this.serializeRecoveryDecision(recoveryDecision),
            errorCode: enrichedResult.errorCode || BROWSER_ERROR_CODES.PHASE_TAKEOVER_REQUIRED,
            errorMessage:
              enrichedResult.takeoverReason ||
              enrichedResult.errorMessage ||
              recoveryDecision.reason,
          }
        );
        await this.persistPhaseSteps(
          request.executionId,
          phaseRecordKey,
          enrichedResult,
          phaseCommands
        );
        await this.persistPhaseArtifacts(request.executionId, phaseRecordKey, enrichedResult);
        return {
          ...enrichedResult,
          status: 'takeover_required',
          requiresTakeover: true,
          takeoverReason: enrichedResult.takeoverReason || recoveryDecision.reason,
        };
      }

      await this.executionPhaseService.markFailed(request.executionId, phaseRecordKey, {
        phaseName: request.phaseName,
        phaseType: request.phaseType,
        attempt,
        runtimeSessionId: request.runtimeSessionId,
        output: enrichedResult.output || { stepResults: enrichedResult.stepResults },
        postcheck: request.postcheck || null,
        recoveryDecision: this.serializeRecoveryDecision(recoveryDecision),
        errorCode: enrichedResult.errorCode || BROWSER_ERROR_CODES.PHASE_EXECUTION_FAILED,
        errorMessage:
          enrichedResult.errorMessage ||
          recoveryDecision.reason ||
          RECOVERY_MESSAGES.BROWSER_FAILED,
      });
      await this.persistPhaseSteps(
        request.executionId,
        phaseRecordKey,
        enrichedResult,
        phaseCommands
      );
      await this.persistPhaseArtifacts(request.executionId, phaseRecordKey, enrichedResult);

      return enrichedResult;
    }

    return {
      success: false,
      status: 'failed',
      stepResults: [],
      errorCode: BROWSER_ERROR_CODES.PHASE_EXECUTION_FAILED,
      errorMessage: RECOVERY_MESSAGES.BROWSER_FAILED,
    };
  }

  private buildStepRequests(
    request: BrowserPhaseExecuteRequest,
    commands: BrowserPhaseCommand[]
  ): RuntimeStepInvokeRequest[] {
    return commands.map((command, index) => ({
      requestId: `${request.executionId}:${request.phaseKey}:${index + 1}`,
      executionId: request.executionId,
      stepId: command.stepId,
      runtimeType: request.runtimeType || BROWSER_RUNTIME.TYPE,
      runtimeSessionId: request.runtimeSessionId,
      skillId: request.skillId || null,
      publishedSkillId: request.publishedSkillId || null,
      capabilityType: command.capabilityType,
      action: command.action,
      input: command.input,
      policyContext: request.policyContext,
      traceContext: request.traceContext,
      metadata: {
        phaseKey: request.phaseKey,
        phaseName: request.phaseName,
        phaseType: request.phaseType,
        ...(command.metadata || {}),
      },
    }));
  }

  private resolvePhaseRecordKey(
    phaseKey: string,
    input?: Record<string, unknown> | null
  ): string {
    const loopIteration = this.readPositiveIntegerValue(input?.loopIteration);
    return loopIteration ? `${phaseKey}__loop_${loopIteration}` : phaseKey;
  }

  private async persistPhaseSteps(
    executionId: string,
    phaseKey: string,
    result: RuntimePhaseInvokeResult,
    commands: BrowserPhaseCommand[]
  ): Promise<void> {
    const stepResults = Array.isArray(result.stepResults) ? result.stepResults : [];
    if (stepResults.length === 0) {
      return;
    }

    await this.executionPhaseService.appendSteps(
      executionId,
      phaseKey,
      stepResults.map((step, index) => {
        const command = commands[index];
        return {
          stepIndex: index + 1,
          stepId: (step.rawResult?.stepId as string) || command?.stepId || null,
          action: (step.rawResult?.action as string) || command?.action || 'unknown',
          status: step.status,
          input: (step.rawResult?.input as Record<string, unknown>) || command?.input || null,
          output: step.output || (step.rawResult?.output as Record<string, unknown>) || null,
          errorMessage: step.errorMessage || null,
          errorCode: step.errorCode || null,
          snapshotId: step.snapshot?.id || null,
          startedAt: step.metrics?.durationMs
            ? new Date(Date.now() - step.metrics.durationMs)
            : null,
          endedAt: new Date(),
        };
      })
    );
  }

  private async persistPhaseArtifacts(
    executionId: string,
    phaseKey: string,
    result: RuntimePhaseInvokeResult
  ): Promise<void> {
    const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
    await this.executionPhaseService.appendArtifacts(
      executionId,
      phaseKey,
      artifacts.map((artifact) => ({
        artifactType: artifact.artifactType,
        snapshotId: artifact.snapshotId || null,
        pageUrl: artifact.pageUrl || null,
        pageFingerprint: artifact.pageFingerprint || null,
        payload: artifact.payload || null,
      }))
    );
  }

  private applyRecoveryPatch(
    commands: BrowserPhaseCommand[],
    patch: BrowserPhaseRecoveryPatch,
    executionStepId?: string
  ): BrowserPhaseCommand[] {
    if (patch.type === 'replace_selector') {
      return commands.map((command) => {
        if (command.stepId !== patch.failedStepId) {
          return command;
        }
        const nextInput = {
          ...command.input,
          selector: patch.selector,
          target: patch.selector,
        };
        return {
          ...command,
          input: nextInput,
          metadata: {
            ...(command.metadata || {}),
            recoveryPatch: {
              type: patch.type,
              note: patch.note || null,
            },
          },
        };
      });
    }

    if (patch.type === 'append_wait') {
      const nextCommands: BrowserPhaseCommand[] = [];
      for (const command of commands) {
        if (command.stepId === patch.failedStepId) {
          nextCommands.push({
            stepId: `${patch.failedStepId}__recovery_wait`,
            capabilityType: BROWSER_RUNTIME.CAPABILITY_TYPE,
            action: BROWSER_ACTIONS.WAIT,
            input: {
              duration: patch.durationMs || 1000,
            },
            metadata: {
              recoveryPatch: {
                type: patch.type,
                note: patch.note || null,
              },
            },
          });
        }
        nextCommands.push(command);
      }
      return nextCommands;
    }

    if (patch.type === 'replace_input_value' && patch.inputValues) {
      return commands.map((command) => {
        if (command.stepId !== patch.failedStepId) {
          return command;
        }
        return {
          ...command,
          input: {
            ...command.input,
            ...patch.inputValues,
          },
          metadata: {
            ...(command.metadata || {}),
            recoveryPatch: {
              type: patch.type,
              note: patch.note || null,
            },
          },
        };
      });
    }

    if (patch.type === 'resolve_by_human') {
      const failedIndex = commands.findIndex((command) => command.stepId === patch.failedStepId);
      if (failedIndex < 0) {
        if (executionStepId && patch.failedStepId === executionStepId) {
          return [];
        }
        return commands;
      }

      if (!patch.resumeFromStepId || patch.resumeFromStepId === patch.failedStepId) {
        return commands.filter((_, index) => index !== failedIndex);
      }

      const resumeIndex = commands.findIndex(
        (command, index) => index > failedIndex && command.stepId === patch.resumeFromStepId
      );
      if (resumeIndex < 0) {
        return commands.filter((_, index) => index !== failedIndex);
      }

      return commands.filter((_, index) => index < failedIndex || index >= resumeIndex);
    }

    return commands;
  }

  private shouldApplyRecoveryPatchForRequest(
    patch: Record<string, unknown> | undefined,
    input?: Record<string, unknown>
  ): boolean {
    if (!patch) {
      return false;
    }
    if (patch.type !== 'resolve_by_human') {
      return true;
    }
    const requestLoopIteration = this.readPositiveIntegerValue(input?.loopIteration);
    if (!requestLoopIteration) {
      return true;
    }
    const patchLoopIteration = this.readPositiveIntegerValue(patch.loopIteration);
    if (!patchLoopIteration) {
      return false;
    }
    return patchLoopIteration === requestLoopIteration;
  }

  private async isCheckMatched(
    check?: Record<string, unknown>,
    runtimeSessionId?: string | null
  ): Promise<boolean> {
    if (!check) {
      return false;
    }
    if (typeof check.matched === 'boolean') {
      return check.matched;
    }
    if (typeof check.ok === 'boolean') {
      return check.ok;
    }
    if (typeof check.satisfied === 'boolean') {
      return check.satisfied;
    }
    if (runtimeSessionId && this.requiresBrowserAssertion(check)) {
      const result = await this.browserRuntimeAdapter.assertState({
        runtimeSessionId,
        backend: 'cli',
        pageUrl: this.readStringValue(check.pageUrl || check.page_url),
        pageUrlIncludes: this.readStringValue(check.pageUrlIncludes || check.page_url_includes),
        pageTitle: this.readStringValue(check.pageTitle || check.page_title),
        pageTitleIncludes: this.readStringValue(
          check.pageTitleIncludes || check.page_title_includes
        ),
        pageFingerprint: this.readStringValue(check.pageFingerprint || check.page_fingerprint),
        readyState: this.readStringValue(check.readyState || check.ready_state),
        selectorExists: this.readStringValue(check.selectorExists || check.selector_exists),
        textIncludes: this.readStringValue(check.textIncludes || check.text_includes),
      });
      return result.matched;
    }
    if (!runtimeSessionId || !this.requiresPageStateCheck(check)) {
      return false;
    }
    const pageState = await this.browserRuntimeAdapter.inspectState({
      runtimeSessionId,
      backend: 'cli',
    });
    return this.matchesPageStateCheck(check, pageState);
  }

  private async applyPostcheck(
    result: RuntimePhaseInvokeResult,
    postcheck?: Record<string, unknown>,
    runtimeSessionId?: string | null
  ): Promise<RuntimePhaseInvokeResult> {
    if (!result.success || !postcheck) {
      return result;
    }
    if (await this.isCheckMatched(postcheck, runtimeSessionId)) {
      return result;
    }
    if ('matched' in postcheck || 'ok' in postcheck || 'satisfied' in postcheck) {
      return {
        ...result,
        success: false,
        status: 'failed',
        retryable: false,
        errorCode: result.errorCode || 'PHASE_POSTCHECK_FAILED',
        errorMessage: result.errorMessage || 'Browser phase postcheck did not pass',
      };
    }
    return result;
  }

  private async capturePhaseScreenshotIfPossible(
    request: BrowserPhaseExecuteRequest,
    result: RuntimePhaseInvokeResult
  ): Promise<RuntimePhaseInvokeResult> {
    if (!request.runtimeSessionId) {
      return result;
    }

    try {
      const screenshotResult = await this.browserRuntimeAdapter.invokeStep({
        requestId: `${request.executionId}:${request.phaseKey}:phase-screenshot`,
        executionId: request.executionId,
        stepId: `${request.phaseKey}__phase_screenshot`,
        runtimeType: request.runtimeType || BROWSER_RUNTIME.TYPE,
        runtimeSessionId: request.runtimeSessionId,
        skillId: request.skillId || null,
        publishedSkillId: request.publishedSkillId || null,
        capabilityType: BROWSER_RUNTIME.CAPABILITY_TYPE,
        action: BROWSER_ACTIONS.SCREENSHOT,
        input: {
          args: {},
        },
        policyContext: request.policyContext,
        traceContext: request.traceContext,
        metadata: {
          phaseKey: request.phaseKey,
          phaseName: request.phaseName,
          phaseType: request.phaseType,
          diagnostic: 'phase_capture',
        },
      });

      if (!screenshotResult.success) {
        return result;
      }

      return {
        ...result,
        snapshotId: result.snapshotId || screenshotResult.snapshot?.id || null,
        artifacts: [
          ...(Array.isArray(result.artifacts) ? result.artifacts : []),
          ...(screenshotResult.artifacts || []).map((artifact) => ({
            artifactType: artifact.type,
            snapshotId: artifact.id || null,
            pageUrl: artifact.url || null,
            pageFingerprint: null,
            payload: artifact.metadata || null,
          })),
        ],
      };
    } catch {
      return result;
    }
  }

  private requiresPageStateCheck(check: Record<string, unknown>): boolean {
    return [
      'pageUrl',
      'page_url',
      'pageUrlIncludes',
      'page_url_includes',
      'pageFingerprint',
      'page_fingerprint',
      'readyState',
      'ready_state',
    ].some((key) => key in check);
  }

  private requiresBrowserAssertion(check: Record<string, unknown>): boolean {
    return [
      'pageUrl',
      'page_url',
      'pageUrlIncludes',
      'page_url_includes',
      'pageTitle',
      'page_title',
      'pageTitleIncludes',
      'page_title_includes',
      'pageFingerprint',
      'page_fingerprint',
      'readyState',
      'ready_state',
      'selectorExists',
      'selector_exists',
      'textIncludes',
      'text_includes',
    ].some((key) => key in check);
  }

  private matchesPageStateCheck(
    check: Record<string, unknown>,
    pageState: {
      pageUrl?: string;
      pageFingerprint?: string;
      readyState?: string;
    }
  ): boolean {
    const expectedPageUrl = this.readStringValue(check.pageUrl || check.page_url);
    if (expectedPageUrl && pageState.pageUrl !== expectedPageUrl) {
      return false;
    }

    const expectedPageUrlIncludes = this.readStringValue(
      check.pageUrlIncludes || check.page_url_includes
    );
    if (
      expectedPageUrlIncludes &&
      !String(pageState.pageUrl || '').includes(expectedPageUrlIncludes)
    ) {
      return false;
    }

    const expectedPageFingerprint = this.readStringValue(
      check.pageFingerprint || check.page_fingerprint
    );
    if (expectedPageFingerprint && pageState.pageFingerprint !== expectedPageFingerprint) {
      return false;
    }

    const expectedReadyState = this.readStringValue(check.readyState || check.ready_state);
    if (expectedReadyState && pageState.readyState !== expectedReadyState) {
      return false;
    }

    return Boolean(
      expectedPageUrl || expectedPageUrlIncludes || expectedPageFingerprint || expectedReadyState
    );
  }

  private readStringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private readPositiveIntegerValue(value: unknown): number | undefined {
    const normalized =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim().length > 0
          ? Number(value)
          : NaN;
    return Number.isInteger(normalized) && normalized > 0 ? normalized : undefined;
  }

  private readRecordValue(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {}
    }
    return undefined;
  }

  private serializeRecoveryDecision(
    decision: BrowserPhaseRecoveryDecision
  ): Record<string, unknown> {
    return {
      action: decision.action,
      reason: decision.reason,
      patch: decision.patch || null,
    };
  }
}
