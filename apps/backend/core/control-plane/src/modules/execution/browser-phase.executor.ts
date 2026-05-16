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

export interface BrowserPhaseCommand {
  stepId: string;
  capabilityType: string;
  action: string;
  input: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface BrowserPhaseExecuteRequest {
  executionId: string;
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
  constructor(
    private readonly browserPhaseRecoveryPlanner: BrowserPhaseRecoveryPlanner,
    private readonly browserRuntimeAdapter: BrowserRuntimeAdapter,
    private readonly executionPhaseService: ExecutionPhaseService,
    private readonly runtimeExecutionOrchestrator: RuntimeExecutionOrchestrator,
  ) {}

  async execute(request: BrowserPhaseExecuteRequest): Promise<RuntimePhaseInvokeResult> {
    let phaseCommands = [...request.commands];

    // Check for existing human intervention or recovery patch
    const existingPhase = await this.executionPhaseService.getByExecutionIdAndPhaseKey(request.executionId, request.phaseKey);
    const existingDecision = existingPhase?.recovery_decision_json as any;
    if (existingDecision?.patch) {
      phaseCommands = this.applyRecoveryPatch(phaseCommands, existingDecision.patch);
    }

    const precheckMatched = await this.isCheckMatched(request.precheck, request.runtimeSessionId);
    if (precheckMatched || (phaseCommands.length === 0 && existingDecision?.patch?.type === 'resolve_by_human')) {
      const isHumanResolved = phaseCommands.length === 0 && existingDecision?.patch?.type === 'resolve_by_human';
      await this.executionPhaseService.markRunning(request.executionId, request.phaseKey, {
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
          note: isHumanResolved ? existingDecision?.patch?.note : undefined,
        },
      };
      await this.executionPhaseService.markCompleted(request.executionId, request.phaseKey, {
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
      (request.recoveryPolicy?.maxAutoRetries || 0) + 1 + (request.recoveryPolicy?.allowAiRecovery ? 1 : 0),
    );
    let attempt = 1;

    while (attempt <= maxAttempts) {
      await this.executionPhaseService.markRunning(request.executionId, request.phaseKey, {
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
        request.runtimeSessionId,
      );
      if (postcheckedResult.success) {
        await this.executionPhaseService.markCompleted(request.executionId, request.phaseKey, {
          phaseName: request.phaseName,
          phaseType: request.phaseType,
          attempt,
          runtimeSessionId: request.runtimeSessionId,
          output: postcheckedResult.output || { stepResults: postcheckedResult.stepResults },
          postcheck: request.postcheck || null,
        });
        await this.persistPhaseSteps(
          request.executionId,
          request.phaseKey,
          postcheckedResult,
        );
        await this.persistPhaseArtifacts(
          request.executionId,
          request.phaseKey,
          postcheckedResult,
        );
        return postcheckedResult;
      }

      const recoveryDecision = await this.browserPhaseRecoveryPlanner.plan({
        executionId: request.executionId,
        phaseKey: request.phaseKey,
        phaseName: request.phaseName,
        phaseType: request.phaseType,
        attempt,
        commands: phaseCommands,
        result: postcheckedResult,
        policy: request.recoveryPolicy,
      });
      if (recoveryDecision.action === 'retry_same_phase' && attempt < maxAttempts) {
        attempt += 1;
        continue;
      }

      if (recoveryDecision.action === 'retry_with_patch' && recoveryDecision.patch) {
        phaseCommands = this.applyRecoveryPatch(phaseCommands, recoveryDecision.patch);
        attempt += 1;
        continue;
      }

      if (recoveryDecision.action === 'takeover_required') {
        await this.executionPhaseService.markWaitingTakeover(request.executionId, request.phaseKey, {
          phaseName: request.phaseName,
          phaseType: request.phaseType,
          attempt,
          runtimeSessionId: request.runtimeSessionId,
          output: postcheckedResult.output || { stepResults: postcheckedResult.stepResults },
          postcheck: request.postcheck || null,
          recoveryDecision: this.serializeRecoveryDecision(recoveryDecision),
          errorCode: postcheckedResult.errorCode || 'PHASE_TAKEOVER_REQUIRED',
          errorMessage: postcheckedResult.takeoverReason || postcheckedResult.errorMessage || recoveryDecision.reason,
        });
        await this.persistPhaseSteps(
          request.executionId,
          request.phaseKey,
          postcheckedResult,
        );
        await this.persistPhaseArtifacts(
          request.executionId,
          request.phaseKey,
          postcheckedResult,
        );
        return {
          ...postcheckedResult,
          status: 'takeover_required',
          requiresTakeover: true,
          takeoverReason: postcheckedResult.takeoverReason || recoveryDecision.reason,
        };
      }

      await this.executionPhaseService.markFailed(request.executionId, request.phaseKey, {
        phaseName: request.phaseName,
        phaseType: request.phaseType,
        attempt,
        runtimeSessionId: request.runtimeSessionId,
        output: postcheckedResult.output || { stepResults: postcheckedResult.stepResults },
        postcheck: request.postcheck || null,
        recoveryDecision: this.serializeRecoveryDecision(recoveryDecision),
        errorCode: postcheckedResult.errorCode || 'PHASE_EXECUTION_FAILED',
        errorMessage: postcheckedResult.errorMessage || recoveryDecision.reason || 'Browser phase execution failed',
      });
      await this.persistPhaseSteps(
        request.executionId,
        request.phaseKey,
        postcheckedResult,
      );
      await this.persistPhaseArtifacts(
        request.executionId,
        request.phaseKey,
        postcheckedResult,
      );

      return postcheckedResult;
    }

    return {
      success: false,
      status: 'failed',
      stepResults: [],
      errorCode: 'PHASE_EXECUTION_FAILED',
      errorMessage: 'Browser phase execution failed',
    };
  }

  private buildStepRequests(
    request: BrowserPhaseExecuteRequest,
    commands: BrowserPhaseCommand[],
  ): RuntimeStepInvokeRequest[] {
    return commands.map((command, index) => ({
      requestId: `${request.executionId}:${request.phaseKey}:${index + 1}`,
      executionId: request.executionId,
      stepId: command.stepId,
      runtimeType: request.runtimeType || 'browser',
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

  private async persistPhaseSteps(
    executionId: string,
    phaseKey: string,
    result: RuntimePhaseInvokeResult,
  ): Promise<void> {
    const stepResults = Array.isArray(result.stepResults) ? result.stepResults : [];
    if (stepResults.length === 0) {
      return;
    }

    await this.executionPhaseService.replaceSteps(
      executionId,
      phaseKey,
      stepResults.map((step, index) => ({
        stepIndex: index + 1,
        stepId: step.rawResult?.stepId as string || null,
        action: step.rawResult?.action as string || 'unknown',
        status: step.status,
        input: step.rawResult?.input as Record<string, unknown> || null,
        output: step.output || step.rawResult?.output as Record<string, unknown> || null,
        errorMessage: step.errorMessage || null,
        errorCode: step.errorCode || null,
        snapshotId: step.snapshot?.id || null,
        startedAt: step.metrics?.durationMs ? new Date(Date.now() - step.metrics.durationMs) : null,
        endedAt: new Date(),
      })),
    );
  }

  private async persistPhaseArtifacts(
    executionId: string,
    phaseKey: string,
    result: RuntimePhaseInvokeResult,
  ): Promise<void> {
    const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
    await this.executionPhaseService.replaceArtifacts(
      executionId,
      phaseKey,
      artifacts.map((artifact) => ({
        artifactType: artifact.artifactType,
        snapshotId: artifact.snapshotId || null,
        pageUrl: artifact.pageUrl || null,
        pageFingerprint: artifact.pageFingerprint || null,
        payload: artifact.payload || null,
      })),
    );
  }

  private applyRecoveryPatch(
    commands: BrowserPhaseCommand[],
    patch: BrowserPhaseRecoveryPatch,
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
            capabilityType: 'browser.step',
            action: 'wait',
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
      const nextCommands: BrowserPhaseCommand[] = [];
      let foundFailed = false;
      for (const command of commands) {
        if (command.stepId === patch.failedStepId) {
          foundFailed = true;
          // Skip the failed step if resumeFromStepId is provided and it matches a later step
          if (!patch.resumeFromStepId || patch.resumeFromStepId === patch.failedStepId) {
            continue;
          }
        }
        if (foundFailed && patch.resumeFromStepId && command.stepId !== patch.resumeFromStepId && nextCommands.length === 0) {
          // Skip steps between failed and resume point
          continue;
        }
        nextCommands.push(command);
      }
      return nextCommands;
    }

    return commands;
  }

  private async isCheckMatched(
    check?: Record<string, unknown>,
    runtimeSessionId?: string | null,
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
        pageTitleIncludes: this.readStringValue(check.pageTitleIncludes || check.page_title_includes),
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
    runtimeSessionId?: string | null,
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
    },
  ): boolean {
    const expectedPageUrl = this.readStringValue(check.pageUrl || check.page_url);
    if (expectedPageUrl && pageState.pageUrl !== expectedPageUrl) {
      return false;
    }

    const expectedPageUrlIncludes = this.readStringValue(
      check.pageUrlIncludes || check.page_url_includes,
    );
    if (expectedPageUrlIncludes && !String(pageState.pageUrl || '').includes(expectedPageUrlIncludes)) {
      return false;
    }

    const expectedPageFingerprint = this.readStringValue(
      check.pageFingerprint || check.page_fingerprint,
    );
    if (expectedPageFingerprint && pageState.pageFingerprint !== expectedPageFingerprint) {
      return false;
    }

    const expectedReadyState = this.readStringValue(check.readyState || check.ready_state);
    if (expectedReadyState && pageState.readyState !== expectedReadyState) {
      return false;
    }

    return Boolean(
      expectedPageUrl ||
      expectedPageUrlIncludes ||
      expectedPageFingerprint ||
      expectedReadyState,
    );
  }

  private readStringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private serializeRecoveryDecision(
    decision: BrowserPhaseRecoveryDecision,
  ): Record<string, unknown> {
    return {
      action: decision.action,
      reason: decision.reason,
      patch: decision.patch || null,
    };
  }
}
