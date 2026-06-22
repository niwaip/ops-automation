import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EXECUTION_EVENT_TYPE } from '../contracts/execution-event-type';
import { CreateExecutionEventOptions } from '../state/execution-event.service';
import { ExecutionFailureService } from '../recovery/execution-failure.service';
import { ExecutionPhaseSyncService } from '../state/execution-phase-sync.service';
import { ExecutionStepService } from './execution-step.service';
import type { BrowserPhaseCheck } from '../state/execution.dto';
import { RuntimePhaseInvokeResult, RuntimeStepInvokeResult } from '../adapters/runtime-adapter.interface';
import { RuntimeExecutionOrchestrator } from './runtime-execution.orchestrator';
import { RuntimeResultInterpreter } from './runtime-result.interpreter';
import { RuntimeStepRequestFactory } from './runtime-step-request.factory';
import type { BrowserPhaseCommand } from './browser-phase.types';
import {
  BROWSER_ACTIONS,
  BROWSER_ERROR_CODES,
  BROWSER_MESSAGES,
  BROWSER_RUNTIME,
} from './browser-execution-constants';
import { RECOVERY_MESSAGES } from '../recovery/recovery-constants';
import type { BrowserPhaseRecoveryPolicy } from '../recovery/browser-phase-recovery.planner';

export interface ExecutionStepPhaseMetadata {
  phaseKey: string;
  phaseName: string;
  phaseType: string;
}

export interface ExecutionStepBrowserPhaseConfig {
  commands: BrowserPhaseCommand[];
  precheck?: BrowserPhaseCheck;
  postcheck?: BrowserPhaseCheck;
  recoveryPolicy?: BrowserPhaseRecoveryPolicy;
}

interface ExecutionBrowserFailureHooks {
  emitEvent: (
    executionId: string,
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  updateStatus: (id: string, newStatus: string) => Promise<void>;
  closeRuntimeSessionQuietly: (
    runtimeSessionId: string,
    executionId: string,
    reason: string
  ) => Promise<void>;
}

interface ExecutionBrowserOrchestrationHooks {
  emitEvent: (
    executionId: string,
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: unknown,
    options?: CreateExecutionEventOptions
  ) => Promise<void>;
  advanceExecutionFlow: (executionId: string, runtimeSessionId: string) => Promise<void>;
  enterRuntimeWaitingInput: (
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    requiredInputs: unknown[],
    reason?: string
  ) => Promise<void>;
  enterPendingApprovalFromRuntimeStep: (executionId: string, reason: string) => Promise<void>;
  failExecutionFromRuntimeStep: (input: {
    executionId: string;
    stepId: string;
    failureReason: string;
    failureCode: string;
    runtimeSessionId?: string;
  }) => Promise<void>;
  syncPhaseAfterStepResult: (
    executionId: string,
    runtimeSessionId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null
  ) => Promise<void>;
  takeover: (executionId: string, reason: string) => Promise<void>;
  failureHooks: ExecutionBrowserFailureHooks;
}

@Injectable()
export class ExecutionBrowserOrchestrationService {
  private readonly logger = new Logger(ExecutionBrowserOrchestrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionStepService: ExecutionStepService,
    private readonly executionPhaseSyncService: ExecutionPhaseSyncService,
    private readonly executionFailureService: ExecutionFailureService,
    private readonly runtimeExecutionOrchestrator: RuntimeExecutionOrchestrator,
    private readonly runtimeResultInterpreter: RuntimeResultInterpreter,
    private readonly runtimeStepRequestFactory: RuntimeStepRequestFactory
  ) {}

  async bootstrapBrowserExecution(
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    hooks: ExecutionBrowserOrchestrationHooks
  ): Promise<void> {
    if (execution.runtimeType !== BROWSER_RUNTIME.TYPE) {
      await hooks.advanceExecutionFlow(execution.id as string, runtimeSessionId);
      return;
    }

    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    const input = execution.inputJson as Record<string, unknown> | undefined;
    const plannerMode =
      typeof normalizedInput?.plannerMode === 'string' && normalizedInput.plannerMode.trim()
        ? normalizedInput.plannerMode.trim()
        : undefined;

    if (plannerMode === 'skill') {
      this.logger.log(
        `Execution ${String(execution.id)} uses plannerMode=skill; skipping runtime bootstrap goto step`
      );
      await hooks.advanceExecutionFlow(execution.id as string, runtimeSessionId);
      return;
    }

    const url =
      typeof normalizedInput?.url === 'string'
        ? normalizedInput.url
        : typeof input?.url === 'string'
          ? input.url
          : undefined;
    if (!url) {
      this.logger.warn(
        `Execution ${String(execution.id)} has no browser bootstrap url; skipping auto step`
      );
      await hooks.advanceExecutionFlow(execution.id as string, runtimeSessionId);
      return;
    }

    let step = await this.executionStepService.findPendingBrowserGotoStep(execution.id as string);
    let createdStep = false;

    if (!step) {
      step = await this.executionStepService.createBootstrapGotoStep({
        executionId: execution.id as string,
        stepIndex: 1,
        url,
      });
      createdStep = true;
    }

    await this.executionStepService.setCurrentStep(execution.id as string, step.id);

    if (createdStep) {
      await hooks.emitEvent(execution.id as string, EXECUTION_EVENT_TYPE.STEP_CREATED, {
        runtimeSessionId,
        stepId: step.id,
        action: BROWSER_ACTIONS.GOTO,
        url,
      });
    }

    await hooks.emitEvent(execution.id as string, EXECUTION_EVENT_TYPE.STEP_STARTED, {
      runtimeSessionId,
      stepId: step.id,
      action: BROWSER_ACTIONS.GOTO,
      url,
    });

    await this.executionStepService.startStep(step.id);

    const result = await this.runtimeExecutionOrchestrator.executeStep(
      this.runtimeStepRequestFactory.buildBrowserGotoRequest({
        execution,
        stepId: step.id,
        runtimeSessionId,
        url,
        executionMode: 'bootstrap',
      })
    );

    await this.handleBrowserStepResult(
      execution.id as string,
      runtimeSessionId,
      step.id,
      result,
      hooks
    );
  }

  async handleBrowserStepResult(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimeStepInvokeResult,
    hooks: ExecutionBrowserOrchestrationHooks,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    step?: Record<string, unknown> | null
  ): Promise<void> {
    await this.runtimeResultInterpreter.handleBrowserStepResult(
      {
        executionId,
        runtimeSessionId,
        stepId,
        emitEvent: (eventType, payload) =>
          hooks.emitEvent(executionId, eventType, payload, {
            runtimeSessionId,
            stepId,
          }),
        advanceExecutionFlow: () => hooks.advanceExecutionFlow(executionId, runtimeSessionId),
        failExecution: (failureReason, failureCode) =>
          hooks.failExecutionFromRuntimeStep({
            executionId,
            stepId,
            failureReason,
            failureCode,
            runtimeSessionId,
          }),
        enterWaitingInput: (requiredInputs, reason) =>
          hooks.enterRuntimeWaitingInput(
            executionId,
            runtimeSessionId,
            stepId,
            requiredInputs,
            reason
          ),
        enterPendingApproval: (reason) =>
          hooks.enterPendingApprovalFromRuntimeStep(executionId, reason),
        takeover: (reason) => hooks.takeover(executionId, reason).then(() => undefined),
      },
      result
    );
    await hooks.syncPhaseAfterStepResult(
      executionId,
      runtimeSessionId,
      result,
      phaseMetadata,
      step
    );
  }

  async handleBrowserPhaseStepResult(
    executionId: string,
    runtimeSessionId: string,
    stepId: string,
    result: RuntimePhaseInvokeResult,
    hooks: ExecutionBrowserOrchestrationHooks
  ): Promise<void> {
    const phaseOutput = {
      status: result.status,
      output: result.output || null,
      stepResults: result.stepResults,
      failedStepId: result.failedStepId || null,
      failedAction: result.failedAction || null,
      snapshotId: result.snapshotId || null,
      pageUrl: result.pageUrl || null,
      pageFingerprint: result.pageFingerprint || null,
      artifacts: result.artifacts || [],
      retryable: result.retryable || false,
      requiresTakeover: result.requiresTakeover || false,
      takeoverReason: result.takeoverReason || null,
    };

    if (result.status === 'waiting') {
      const requiredInputs = this.extractRequiredInputsFromPhaseOutput(result.output);
      await this.executionStepService.markStepWaiting(stepId, {
        requiredInputs,
        outputJson: phaseOutput,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
      await hooks.enterRuntimeWaitingInput(
        executionId,
        runtimeSessionId,
        stepId,
        requiredInputs,
        result.errorMessage
      );
      return;
    }

    if (result.status === 'blocked') {
      await hooks.enterPendingApprovalFromRuntimeStep(
        executionId,
        result.errorMessage || BROWSER_MESSAGES.PHASE_BLOCKED
      );
      return;
    }

    await this.executionStepService.finishRuntimeStep(stepId, {
      success: result.success,
      outputJson: phaseOutput,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      snapshotId: result.snapshotId || undefined,
      takeoverTriggered: Boolean(result.requiresTakeover || result.status === 'takeover_required'),
    });

    await hooks.emitEvent(
      executionId,
      result.success ? EXECUTION_EVENT_TYPE.STEP_SUCCEEDED : EXECUTION_EVENT_TYPE.STEP_FAILED,
      {
        runtimeSessionId,
        stepId,
        result: result.output || phaseOutput,
        error: result.errorMessage,
        errorCode: result.errorCode,
        phaseStatus: result.status,
        failedStepId: result.failedStepId,
        failedAction: result.failedAction,
        shouldTakeover: result.requiresTakeover || result.status === 'takeover_required',
      },
      {
        runtimeSessionId,
        stepId,
      }
    );

    if (result.status === 'takeover_required' || result.requiresTakeover) {
      await hooks.takeover(
        executionId,
        result.takeoverReason || result.errorMessage || RECOVERY_MESSAGES.BROWSER_PHASE_TAKEOVER
      );
      return;
    }

    if (result.success) {
      await this.persistBrowserPhaseSuccess(executionId, runtimeSessionId, phaseOutput);
      await hooks.advanceExecutionFlow(executionId, runtimeSessionId);
      return;
    }

    await hooks.failExecutionFromRuntimeStep({
      executionId,
      stepId,
      failureReason: result.errorMessage || RECOVERY_MESSAGES.BROWSER_FAILED,
      failureCode: result.errorCode || BROWSER_ERROR_CODES.PHASE_RUNTIME_FAILED,
      runtimeSessionId,
    });
  }

  extractStepBrowserPhaseConfig(
    step?: Record<string, unknown> | null
  ): ExecutionStepBrowserPhaseConfig | undefined {
    if (!step) {
      return undefined;
    }

    const targetJson = this.readJsonRecord(step.targetJson);
    const inputJson = this.readJsonRecord(step.inputJson);
    const commands = this.extractBrowserPhaseCommands(
      targetJson?.commands || inputJson?.commands,
      typeof step.id === 'string' ? step.id : 'browser_phase_step'
    );

    if (commands.length === 0) {
      return undefined;
    }

    return {
      commands,
      precheck: this.extractBrowserPhaseCheck(targetJson?.precheck || inputJson?.precheck),
      postcheck: this.extractBrowserPhaseCheck(targetJson?.postcheck || inputJson?.postcheck),
      recoveryPolicy: this.extractBrowserPhaseRecoveryPolicy(
        targetJson?.recoveryPolicy ||
          targetJson?.recovery_policy ||
          inputJson?.recoveryPolicy ||
          inputJson?.recovery_policy
      ),
    };
  }

  extractBrowserPhaseInput(
    step?: Record<string, unknown> | null
  ): Record<string, unknown> | undefined {
    const inputJson = this.readJsonRecord(step?.inputJson);
    if (!inputJson) {
      return undefined;
    }

    const { commands, precheck, postcheck, recoveryPolicy, recovery_policy, ...phaseInput } =
      inputJson;
    return phaseInput;
  }

  buildBrowserPhasePolicyContext(execution: Record<string, unknown>):
    | {
        riskLevel?: 'L0' | 'L1' | 'L2' | 'L3';
        requiresApproval?: boolean;
      }
    | undefined {
    const riskLevel =
      typeof execution.riskLevel === 'string' &&
      ['L0', 'L1', 'L2', 'L3'].includes(execution.riskLevel)
        ? (execution.riskLevel as 'L0' | 'L1' | 'L2' | 'L3')
        : undefined;
    const requiresApproval =
      typeof execution.requiresApproval === 'boolean' ? execution.requiresApproval : undefined;

    if (riskLevel === undefined && requiresApproval === undefined) {
      return undefined;
    }

    return {
      ...(riskLevel ? { riskLevel } : {}),
      ...(requiresApproval !== undefined ? { requiresApproval } : {}),
    };
  }

  buildBrowserPhaseTraceContext(execution: Record<string, unknown>):
    | {
        userId?: string;
        actorType?: 'system';
        sourceService?: string;
      }
    | undefined {
    const userId =
      typeof execution.createdBy === 'string' && execution.createdBy.trim().length > 0
        ? execution.createdBy
        : undefined;
    if (!userId) {
      return undefined;
    }

    return {
      userId,
      actorType: 'system',
      sourceService: 'control-plane',
    };
  }

  extractStepPhaseMetadata(
    step?: Record<string, unknown> | null
  ): ExecutionStepPhaseMetadata | undefined {
    if (!step) {
      return undefined;
    }

    const targetJson = step.targetJson as Record<string, unknown> | undefined;
    const inputJson = step.inputJson as Record<string, unknown> | undefined;
    const phaseKey =
      typeof targetJson?.phaseKey === 'string'
        ? targetJson.phaseKey
        : typeof targetJson?.phase_key === 'string'
          ? targetJson.phase_key
          : typeof inputJson?.phaseKey === 'string'
            ? inputJson.phaseKey
            : typeof inputJson?.phase_key === 'string'
              ? inputJson.phase_key
              : undefined;
    const phaseName =
      typeof targetJson?.phaseName === 'string'
        ? targetJson.phaseName
        : typeof targetJson?.phase_name === 'string'
          ? targetJson.phase_name
          : typeof inputJson?.phaseName === 'string'
            ? inputJson.phaseName
            : typeof inputJson?.phase_name === 'string'
              ? inputJson.phase_name
              : undefined;
    const phaseType =
      typeof targetJson?.phaseType === 'string'
        ? targetJson.phaseType
        : typeof targetJson?.phase_type === 'string'
          ? targetJson.phase_type
          : typeof inputJson?.phaseType === 'string'
            ? inputJson.phaseType
            : typeof inputJson?.phase_type === 'string'
              ? inputJson.phase_type
              : undefined;

    if (!phaseKey || !phaseName || !phaseType) {
      return undefined;
    }

    return { phaseKey, phaseName, phaseType };
  }

  extractStepUrl(
    step: Record<string, unknown>,
    execution: Record<string, unknown>
  ): string | undefined {
    const target = step.targetJson as Record<string, unknown> | undefined;
    const input = step.inputJson as Record<string, unknown> | undefined;
    const normalizedInput = execution.normalizedInputJson as Record<string, unknown> | undefined;
    const rawInput = execution.inputJson as Record<string, unknown> | undefined;

    if (typeof target?.url === 'string' && target.url.trim()) {
      return target.url;
    }
    if (typeof input?.url === 'string' && input.url.trim()) {
      return input.url;
    }
    if (typeof normalizedInput?.url === 'string' && normalizedInput.url.trim()) {
      return normalizedInput.url;
    }
    if (typeof rawInput?.url === 'string' && rawInput.url.trim()) {
      return rawInput.url;
    }

    return undefined;
  }

  private extractBrowserPhaseCommands(value: unknown, stepIdPrefix: string): BrowserPhaseCommand[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(
        (command): command is Record<string, unknown> =>
          Boolean(command) &&
          typeof command === 'object' &&
          !Array.isArray(command) &&
          typeof command.action === 'string' &&
          command.action.trim().length > 0
      )
      .map((command, index) => ({
        stepId:
          typeof command.stepId === 'string' && command.stepId.trim().length > 0
            ? command.stepId.trim()
            : typeof command.step_id === 'string' && command.step_id.trim().length > 0
              ? command.step_id.trim()
              : `${stepIdPrefix}__command_${index + 1}`,
        capabilityType:
          typeof command.capabilityType === 'string' && command.capabilityType.trim().length > 0
            ? command.capabilityType.trim().replace(/_/g, '.')
            : typeof command.capability_type === 'string' &&
                command.capability_type.trim().length > 0
              ? command.capability_type.trim().replace(/_/g, '.')
              : BROWSER_RUNTIME.CAPABILITY_TYPE,
        action: (command.action as string).trim(),
        input: this.readJsonRecord(command.input) || {},
        metadata: this.readJsonRecord(command.metadata),
      }));
  }

  private extractBrowserPhaseCheck(value: unknown): BrowserPhaseCheck | undefined {
    const record = this.readJsonRecord(value);
    return record as BrowserPhaseCheck | undefined;
  }

  private extractBrowserPhaseRecoveryPolicy(
    value: unknown
  ): BrowserPhaseRecoveryPolicy | undefined {
    const record = this.readJsonRecord(value);
    if (!record) {
      return undefined;
    }

    const policy: BrowserPhaseRecoveryPolicy = {
      ...(typeof record.maxAutoRetries === 'number'
        ? { maxAutoRetries: record.maxAutoRetries }
        : typeof record.max_auto_retries === 'number'
          ? { maxAutoRetries: record.max_auto_retries }
          : {}),
      ...(typeof record.allowAiRecovery === 'boolean'
        ? { allowAiRecovery: record.allowAiRecovery }
        : typeof record.allow_ai_recovery === 'boolean'
          ? { allowAiRecovery: record.allow_ai_recovery }
          : {}),
      ...(typeof record.allowHumanTakeover === 'boolean'
        ? { allowHumanTakeover: record.allowHumanTakeover }
        : typeof record.allow_human_takeover === 'boolean'
          ? { allowHumanTakeover: record.allow_human_takeover }
          : {}),
      ...(typeof record.modelId === 'string' && record.modelId.trim().length > 0
        ? { modelId: record.modelId.trim() }
        : typeof record.model_id === 'string' && record.model_id.trim().length > 0
          ? { modelId: record.model_id.trim() }
          : {}),
    };

    return Object.keys(policy).length > 0 ? policy : undefined;
  }

  private extractRequiredInputsFromPhaseOutput(output?: Record<string, unknown>): unknown[] {
    if (Array.isArray(output?.requiredInputs)) {
      return output.requiredInputs;
    }
    if (Array.isArray(output?.required_inputs)) {
      return output.required_inputs;
    }
    return [];
  }

  private readJsonRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private async persistBrowserPhaseSuccess(
    executionId: string,
    runtimeSessionId: string,
    phaseOutput: Record<string, unknown>
  ): Promise<void> {
    const canReadExecution = typeof this.prisma?.execution?.findUnique === 'function';
    const canUpdateExecution = typeof this.prisma?.execution?.update === 'function';
    if (!canReadExecution || !canUpdateExecution) {
      return;
    }

    const currentExecution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: { resultJson: true, normalizedInputJson: true },
    });

    const currentResult = this.readJsonRecord(currentExecution?.resultJson) || {};
    const currentNormalized = this.readJsonRecord(currentExecution?.normalizedInputJson) || {};
    const phaseVariables = this.extractBrowserPhaseVariables(phaseOutput);
    const persistedBrowserPhaseVariables = {
      ...(this.readJsonRecord(currentNormalized.browserPhaseVariables) || {}),
      ...phaseVariables,
    };
    const browserResult = {
      ...currentResult,
      ...phaseOutput,
      runtimeSessionId,
      backend: typeof currentResult.backend === 'string' ? currentResult.backend : 'browser',
      ...(Object.keys(persistedBrowserPhaseVariables).length > 0
        ? { browserPhaseVariables: persistedBrowserPhaseVariables }
        : {}),
    };

    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        resultJson: this.asJsonValue(browserResult),
        normalizedInputJson: this.asJsonValue({
          ...currentNormalized,
          ...(Object.keys(persistedBrowserPhaseVariables).length > 0
            ? { browserPhaseVariables: persistedBrowserPhaseVariables }
            : {}),
        }),
      },
    });
  }

  private extractBrowserPhaseVariables(phaseOutput: Record<string, unknown>): Record<string, unknown> {
    const output = this.readJsonRecord(phaseOutput.output);
    const phaseVariables = this.readJsonRecord(output?.phaseVariables);
    return phaseVariables || {};
  }

  private asJsonValue(value: unknown): Prisma.JsonValue {
    return value as Prisma.JsonValue;
  }
}
