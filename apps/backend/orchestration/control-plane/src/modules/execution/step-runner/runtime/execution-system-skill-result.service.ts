import { Injectable, Optional } from '@nestjs/common';
import { EXECUTION_EVENT_TYPE } from '../../contracts/execution-event-type';
import { RuntimeStepInvokeResult } from '../../adapters/runtime-adapter.interface';
import { ExecutionPhaseSyncService } from '../../state/execution-phase-sync.service';
import {
  ExecutionStepPhaseMetadata,
} from '../browser/execution-browser-orchestration.service';
import { RuntimeResultInterpreter } from './runtime-result.interpreter';

type ExecutionEventType =
  (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE];

interface WorkflowActivityPhaseSyncBridge {
  syncWorkflowActivityPhasesAfterSkillResult: (
    executionId: string,
    runtimeSessionId: string,
    capabilityId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: ExecutionStepPhaseMetadata
  ) => Promise<void>;
  loadWorkflowActivityPhaseDefinitions?: (
    capabilityId: string,
    parentPhaseKey: string
  ) => Promise<unknown>;
}

export interface HandleSystemSkillStepResultHooks {
  emitEvent: (eventType: ExecutionEventType, payload: Record<string, unknown>) => Promise<void>;
  advanceExecutionFlow: () => Promise<void>;
  failExecution: (failureReason: string, failureCode: string) => Promise<void>;
  takeover: (reason: string) => Promise<void>;
  enterWaitingInput: (requiredInputs: unknown[], reason?: string) => Promise<void>;
  enterPendingApproval: (reason: string) => Promise<void>;
  loadWorkflowActivityPhaseDefinitions?: (
    capabilityId: string,
    parentPhaseKey: string
  ) => Promise<unknown>;
}

export interface HandleSystemSkillStepResultInput {
  executionId: string;
  runtimeSessionId: string;
  stepId: string;
  result: RuntimeStepInvokeResult;
  capabilityId: string;
  phaseMetadata?: ExecutionStepPhaseMetadata;
  step?: Record<string, unknown> | null;
}

@Injectable()
export class ExecutionSystemSkillResultService {
  constructor(
    @Optional()
    private readonly runtimeResultInterpreter: RuntimeResultInterpreter | undefined,
    private readonly executionPhaseSyncService: ExecutionPhaseSyncService
  ) {}

  async handleSystemSkillStepResult(
    input: HandleSystemSkillStepResultInput,
    hooks: HandleSystemSkillStepResultHooks
  ): Promise<void> {
    if (!this.runtimeResultInterpreter) {
      throw new Error('RuntimeResultInterpreter is not available');
    }

    await this.runtimeResultInterpreter.handleSkillRuntimeResult(
      {
        executionId: input.executionId,
        runtimeSessionId: input.runtimeSessionId,
        stepId: input.stepId,
        emitEvent: hooks.emitEvent,
        advanceExecutionFlow: hooks.advanceExecutionFlow,
        failExecution: hooks.failExecution,
        takeover: hooks.takeover,
        enterWaitingInput: hooks.enterWaitingInput,
        enterPendingApproval: hooks.enterPendingApproval,
      },
      input.result
    );

    await this.executionPhaseSyncService.syncPhaseAfterStepResult(
      input.executionId,
      input.runtimeSessionId,
      input.result,
      input.phaseMetadata,
      input.step
    );

    await this.syncWorkflowActivityPhasesAfterSkillResult(
      input.executionId,
      input.runtimeSessionId,
      input.capabilityId,
      input.result,
      input.phaseMetadata,
      hooks.loadWorkflowActivityPhaseDefinitions
    );
  }

  async syncWorkflowActivityPhasesAfterSkillResult(
    executionId: string,
    runtimeSessionId: string,
    capabilityId: string,
    result: RuntimeStepInvokeResult,
    phaseMetadata?: ExecutionStepPhaseMetadata,
    loadWorkflowActivityPhaseDefinitions?: (
      capabilityId: string,
      parentPhaseKey: string
    ) => Promise<unknown>
  ): Promise<void> {
    const phaseSyncService = this.executionPhaseSyncService as unknown as WorkflowActivityPhaseSyncBridge;
    const originalLoader = phaseSyncService.loadWorkflowActivityPhaseDefinitions;

    if (loadWorkflowActivityPhaseDefinitions) {
      phaseSyncService.loadWorkflowActivityPhaseDefinitions = loadWorkflowActivityPhaseDefinitions;
    }

    try {
      await phaseSyncService.syncWorkflowActivityPhasesAfterSkillResult(
        executionId,
        runtimeSessionId,
        capabilityId,
        result,
        phaseMetadata
      );
    } finally {
      if (loadWorkflowActivityPhaseDefinitions) {
        phaseSyncService.loadWorkflowActivityPhaseDefinitions = originalLoader;
      }
    }
  }
}
