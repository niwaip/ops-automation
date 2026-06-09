import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BROWSER_ACTIONS,
  BROWSER_MESSAGES,
  BROWSER_RUNTIME,
} from './browser-execution-constants';
import { EXECUTION_STATUS, ExecutionStatus } from './contracts/execution-status';
import { ExecutionStepService } from './execution-step.service';
import { isTerminalExecutionStatus } from './execution-transition-policy';

interface AdvanceExecutionFlowHooks {
  completeActivePhasesOnExecutionSuccess: (
    executionId: string,
    runtimeSessionId: string,
  ) => Promise<void>;
  updateStatus: (executionId: string, newStatus: ExecutionStatus) => Promise<void>;
  closeRuntimeSessionQuietly: (
    runtimeSessionId: string,
    executionId: string,
    reason: string,
  ) => Promise<void>;
  extractStepUrl: (
    step: Record<string, unknown>,
    execution: Record<string, unknown>,
  ) => string | undefined;
  skipSingleStep: (
    stepId: string,
    executionId: string,
    reason: string,
  ) => Promise<void>;
  executeBrowserGotoStep: (
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
    url: string,
  ) => Promise<void>;
  enterWaitingInput: (
    execution: Record<string, unknown>,
    stepId: string,
  ) => Promise<void>;
  executeBrowserPhaseStep: (
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
  ) => Promise<void>;
  executeSystemSkillStep: (
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
  ) => Promise<void>;
}

@Injectable()
export class ExecutionFlowRunnerService {
  private readonly logger = new Logger(ExecutionFlowRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionStepService: ExecutionStepService,
  ) {}

  async advanceExecutionFlow(
    executionId: string,
    runtimeSessionId: string,
    hooks: AdvanceExecutionFlowHooks,
  ): Promise<void> {
    this.logger.log(`Advancing execution flow for ${executionId}`);

    for (let safety = 0; safety < 1000; safety++) {
      const execution = await this.prisma.execution.findUnique({
        where: { id: executionId },
      });

      if (!execution) {
        this.logger.error(`Execution ${executionId} not found during advanceExecutionFlow`);
        throw new NotFoundException(`Execution ${executionId} not found`);
      }

      if (isTerminalExecutionStatus(execution.status)) {
        this.logger.log(`Execution ${executionId} is in terminal status ${execution.status}; stopping flow`);
        return;
      }

      const nextStep = await this.executionStepService.findNextPendingStep(executionId);

      if (!nextStep) {
        this.logger.log(`No more pending steps for execution ${executionId}`);
        if (execution.status === EXECUTION_STATUS.RUNNING) {
          await hooks.completeActivePhasesOnExecutionSuccess(executionId, runtimeSessionId);
          await hooks.updateStatus(executionId, EXECUTION_STATUS.SUCCEEDED);
          this.logger.log(`Execution ${executionId} marked as succeeded`);
          await hooks.closeRuntimeSessionQuietly(runtimeSessionId, executionId, 'execution_succeeded');
        }
        return;
      }

      this.logger.log(`Next step for ${executionId}: ${nextStep.id} (type: ${nextStep.type}, action: ${nextStep.action})`);

      if (nextStep.type === BROWSER_RUNTIME.STEP_TYPE && nextStep.action === BROWSER_ACTIONS.GOTO) {
        const stepUrl = hooks.extractStepUrl(nextStep as Record<string, unknown>, execution as Record<string, unknown>);
        if (!stepUrl) {
          this.logger.warn(`Browser goto step ${nextStep.id} is missing target url; skipping`);
          await hooks.skipSingleStep(nextStep.id, executionId, BROWSER_MESSAGES.GOTO_MISSING_TARGET);
          continue;
        }

        await hooks.executeBrowserGotoStep(
          execution as Record<string, unknown>,
          runtimeSessionId,
          nextStep.id,
          stepUrl,
        );
        return;
      }

      if (nextStep.type === 'input_collection') {
        this.logger.log(`Entering waiting_input for execution ${executionId}, step ${nextStep.id}`);
        await hooks.enterWaitingInput(execution as Record<string, unknown>, nextStep.id);
        return;
      }

      if (nextStep.type === 'system' && nextStep.action === BROWSER_ACTIONS.EXECUTE_PHASE) {
        this.logger.log(`Executing browser phase step for execution ${executionId}, step ${nextStep.id}`);
        await hooks.executeBrowserPhaseStep(
          execution as Record<string, unknown>,
          runtimeSessionId,
          nextStep.id,
        );
        return;
      }

      if (nextStep.type === 'system') {
        this.logger.log(`Executing system step for execution ${executionId}, step ${nextStep.id} (action: ${nextStep.action})`);
        await hooks.executeSystemSkillStep(
          execution as Record<string, unknown>,
          runtimeSessionId,
          nextStep.id,
        );
        return;
      }

      const reason = `Planner step executor not implemented yet for type=${nextStep.type}, action=${nextStep.action || 'none'}`;
      this.logger.warn(`${reason} for step ${nextStep.id}; skipping`);
      await hooks.skipSingleStep(nextStep.id, executionId, reason);
    }
  }
}
