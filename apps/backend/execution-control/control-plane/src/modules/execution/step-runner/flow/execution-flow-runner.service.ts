import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BROWSER_ACTIONS, BROWSER_MESSAGES, BROWSER_RUNTIME } from '../browser/browser-execution-constants';
import { EXECUTION_STATUS, ExecutionStatus } from '../../contracts/execution-status';
import { ExecutionStepService } from '../steps/execution-step.service';
import { isTerminalExecutionStatus } from '../../state/execution-transition-policy';

export interface AdvanceExecutionFlowHooks {
  completeActivePhasesOnExecutionSuccess: (
    executionId: string,
    runtimeSessionId: string
  ) => Promise<void>;
  updateStatus: (executionId: string, newStatus: ExecutionStatus) => Promise<void>;
  closeRuntimeSessionQuietly: (
    runtimeSessionId: string,
    executionId: string,
    reason: string
  ) => Promise<void>;
  extractStepUrl: (
    step: Record<string, unknown>,
    execution: Record<string, unknown>
  ) => string | undefined;
  skipSingleStep: (stepId: string, executionId: string, reason: string) => Promise<void>;
  executeBrowserGotoStep: (
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string,
    url: string
  ) => Promise<void>;
  enterWaitingInput: (execution: Record<string, unknown>, stepId: string) => Promise<void>;
  executeBrowserPhaseStep: (
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string
  ) => Promise<void>;
  executeSystemSkillStep: (
    execution: Record<string, unknown>,
    runtimeSessionId: string,
    stepId: string
  ) => Promise<void>;
  readBrowserTextBySelector?: (
    runtimeSessionId: string,
    selector: string
  ) => Promise<string | undefined>;
}

interface LoopWorkflowState {
  loopId: string;
  status: 'running' | 'completed';
  currentIteration: number;
  maxIterations: number;
  lastDecision?: 'continue' | 'stop';
  lastEvaluatedAt?: string;
  stopReason?: string;
}

@Injectable()
export class ExecutionFlowRunnerService {
  private readonly logger = new Logger(ExecutionFlowRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionStepService: ExecutionStepService
  ) {}

  async advanceExecutionFlow(
    executionId: string,
    runtimeSessionId: string,
    hooks: AdvanceExecutionFlowHooks
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
        this.logger.log(
          `Execution ${executionId} is in terminal status ${execution.status}; stopping flow`
        );
        return;
      }

      const nextStep = await this.executionStepService.findNextPendingStep(executionId);

      if (!nextStep) {
        this.logger.log(`No more pending steps for execution ${executionId}`);
        if (!isTerminalExecutionStatus(execution.status)) {
          await hooks.completeActivePhasesOnExecutionSuccess(executionId, runtimeSessionId);
          await hooks.updateStatus(executionId, EXECUTION_STATUS.SUCCEEDED);
          this.logger.log(`Execution ${executionId} marked as succeeded`);
          await hooks.closeRuntimeSessionQuietly(
            runtimeSessionId,
            executionId,
            'execution_succeeded'
          );
        }
        return;
      }

      this.logger.log(
        `Next step for ${executionId}: ${nextStep.id} (type: ${nextStep.type}, action: ${nextStep.action})`
      );

      if (nextStep.type === BROWSER_RUNTIME.STEP_TYPE && nextStep.action === BROWSER_ACTIONS.GOTO) {
        const stepUrl = hooks.extractStepUrl(
          nextStep as Record<string, unknown>,
          execution as Record<string, unknown>
        );
        if (!stepUrl) {
          this.logger.warn(`Browser goto step ${nextStep.id} is missing target url; skipping`);
          await hooks.skipSingleStep(
            nextStep.id,
            executionId,
            BROWSER_MESSAGES.GOTO_MISSING_TARGET
          );
          continue;
        }

        await hooks.executeBrowserGotoStep(
          execution as Record<string, unknown>,
          runtimeSessionId,
          nextStep.id,
          stepUrl
        );
        return;
      }

      if (nextStep.type === 'input_collection') {
        this.logger.log(`Entering waiting_input for execution ${executionId}, step ${nextStep.id}`);
        await hooks.enterWaitingInput(execution as Record<string, unknown>, nextStep.id);
        return;
      }

      if (nextStep.type === 'system' && nextStep.action === BROWSER_ACTIONS.EXECUTE_PHASE) {
        this.logger.log(
          `Executing browser phase step for execution ${executionId}, step ${nextStep.id}`
        );
        await hooks.executeBrowserPhaseStep(
          execution as Record<string, unknown>,
          runtimeSessionId,
          nextStep.id
        );
        return;
      }

      if (nextStep.type === 'system') {
        if (nextStep.action === 'finish') {
          this.logger.log(
            `Finish step ${nextStep.id} for execution ${executionId}; completing execution`
          );
          await hooks.completeActivePhasesOnExecutionSuccess(executionId, runtimeSessionId);
          await hooks.updateStatus(executionId, EXECUTION_STATUS.SUCCEEDED);
          await hooks.closeRuntimeSessionQuietly(
            runtimeSessionId,
            executionId,
            'execution_finished'
          );
          return;
        }

        this.logger.log(
          `Executing system step for execution ${executionId}, step ${nextStep.id} (action: ${nextStep.action})`
        );
        await hooks.executeSystemSkillStep(
          execution as Record<string, unknown>,
          runtimeSessionId,
          nextStep.id
        );
        return;
      }

      if (nextStep.type === 'loop_control') {
        await this.handleLoopControlStep(
          execution as Record<string, unknown>,
          nextStep as Record<string, unknown>,
          runtimeSessionId,
          hooks
        );
        continue;
      }

      const reason = `Planner step executor not implemented yet for type=${nextStep.type}, action=${nextStep.action || 'none'}`;
      this.logger.warn(`${reason} for step ${nextStep.id}; skipping`);
      await hooks.skipSingleStep(nextStep.id, executionId, reason);
    }
  }

  private async handleLoopControlStep(
    execution: Record<string, unknown>,
    step: Record<string, unknown>,
    runtimeSessionId: string,
    hooks: AdvanceExecutionFlowHooks
  ): Promise<void> {
    const executionId = execution.id as string;
    const stepId = step.id as string;
    const target = this.readRecord(step.targetJson, step.target_json) || {};
    const input = this.readRecord(step.inputJson, step.input_json) || {};
    const action = this.readNonEmptyString(
      target.loopControlAction,
      input.loopControlAction,
      step.action
    );
    const loopId = this.readNonEmptyString(target.loopId, input.loopId);
    const normalizedInput = this.readRecord(execution.normalizedInputJson) || {};
    const loopWorkflow = this.readRecord(normalizedInput.loopWorkflow);

    await this.executionStepService.setCurrentStep(executionId, stepId);
    await this.executionStepService.startStep(stepId, {
      targetJson: target,
      inputJson: input,
    });

    if (!action || !loopId || !loopWorkflow) {
      await this.executionStepService.finishControlStep(stepId, {
        success: false,
        errorCode: 'LOOP_CONTROL_CONTEXT_MISSING',
        errorMessage: 'Loop control context missing',
      });
      return;
    }

    const currentState = this.readRecord(normalizedInput.loopWorkflowState) || {};
    if (action === 'loop_init') {
      const nextState: LoopWorkflowState = {
        loopId,
        status: 'running',
        currentIteration: this.readPositiveInteger(currentState.currentIteration) || 1,
        maxIterations:
          this.readPositiveInteger(currentState.maxIterations, loopWorkflow.maxIterations) || 100,
        lastEvaluatedAt: new Date().toISOString(),
      };
      await this.persistLoopWorkflowState(executionId, normalizedInput, nextState);
      await this.executionStepService.finishControlStep(stepId, {
        outputJson: {
          controlAction: action,
          loopState: nextState,
          runtimeSessionId,
        },
      });
      return;
    }

    if (action === 'loop_eval_after_iteration') {
      const currentIteration = this.readPositiveInteger(currentState.currentIteration) || 1;
      const maxIterations =
        this.readPositiveInteger(currentState.maxIterations, loopWorkflow.maxIterations) || 100;
      const evaluation = await this.evaluateLoopStopCondition(executionId, loopId, currentIteration, {
        stopWhen: this.readRecord(target.loopStopCondition, input.loopStopCondition, loopWorkflow.stopWhen),
        maxIterations,
        runtimeSessionId,
        hooks,
      });

      if (evaluation.shouldStop || currentIteration >= maxIterations) {
        const nextState: LoopWorkflowState = {
          loopId,
          status: 'completed',
          currentIteration,
          maxIterations,
          lastDecision: 'stop',
          lastEvaluatedAt: new Date().toISOString(),
          stopReason:
            evaluation.reason || (currentIteration >= maxIterations ? 'max_iterations_reached' : 'condition_matched'),
        };
        await this.persistLoopWorkflowState(executionId, normalizedInput, nextState);
        await this.executionStepService.finishControlStep(stepId, {
          outputJson: {
            controlAction: action,
            loopState: nextState,
            evaluation,
            runtimeSessionId,
          },
        });
        return;
      }

      const nextIteration = currentIteration + 1;
      const insertedSteps = await this.buildNextIterationSteps(executionId, loopId, nextIteration, step);
      if (insertedSteps.length > 0) {
        await this.executionStepService.insertPlannedStepsAfterStep({
          executionId,
          afterStepId: stepId,
          steps: insertedSteps,
        });
      }

      const nextState: LoopWorkflowState = {
        loopId,
        status: 'running',
        currentIteration: nextIteration,
        maxIterations,
        lastDecision: 'continue',
        lastEvaluatedAt: new Date().toISOString(),
      };
      await this.persistLoopWorkflowState(executionId, normalizedInput, nextState);
      await this.executionStepService.finishControlStep(stepId, {
        outputJson: {
          controlAction: action,
          loopState: nextState,
          evaluation,
          insertedStepCount: insertedSteps.length,
          runtimeSessionId,
        },
      });
      return;
    }

    await this.executionStepService.finishControlStep(stepId, {
      outputJson: {
        controlAction: action,
        ignored: true,
      },
    });
  }

  private async buildNextIterationSteps(
    executionId: string,
    loopId: string,
    nextIteration: number,
    evaluationStep: Record<string, unknown>
  ): Promise<Array<Record<string, unknown>>> {
    const steps = await this.executionStepService.listByExecutionId(executionId);
    const templateSteps = steps
      .filter((item) => {
        const target = this.readRecord(item.targetJson) || {};
        return (
          this.readNonEmptyString(target.loopId) === loopId &&
          this.readNonEmptyString(target.loopSegment) === 'iteration' &&
          target.loopTemplate === true
        );
      })
      .sort((a, b) => (a.stepIndex as number) - (b.stepIndex as number));

    if (templateSteps.length === 0) {
      return [];
    }

    const clonedSteps: Array<Record<string, unknown>> = templateSteps.map((templateStep) => {
      const target = this.readRecord(templateStep.targetJson) || {};
      const input = this.readRecord(templateStep.inputJson) || {};
      return {
        name: String(templateStep.name || ''),
        type: String(templateStep.type || ''),
        status: 'pending',
        action: templateStep.action ? String(templateStep.action) : null,
        targetJson: {
          ...target,
          loopIteration: nextIteration,
          loopTemplate: false,
        },
        inputJson: {
          ...input,
          loopIteration: nextIteration,
          loopTemplate: false,
        },
      };
    });

    const evaluationTarget = this.readRecord(evaluationStep.targetJson) || {};
    const evaluationInput = this.readRecord(evaluationStep.inputJson) || {};
    clonedSteps.push({
      name: String(evaluationStep.name || ''),
      type: String(evaluationStep.type || ''),
      status: 'pending',
      action: evaluationStep.action ? String(evaluationStep.action) : null,
      targetJson: {
        ...evaluationTarget,
        loopIteration: nextIteration,
        loopTemplate: false,
      },
      inputJson: {
        ...evaluationInput,
        loopIteration: nextIteration,
        loopTemplate: false,
      },
    });

    return clonedSteps;
  }

  private async evaluateLoopStopCondition(
    executionId: string,
    loopId: string,
    currentIteration: number,
    input: {
      stopWhen?: Record<string, unknown>;
      maxIterations: number;
      runtimeSessionId: string;
      hooks: AdvanceExecutionFlowHooks;
    }
  ): Promise<{ shouldStop: boolean; reason?: string; value?: string }> {
    const steps = await this.executionStepService.listByExecutionId(executionId);
    const iterationSteps = steps
      .filter((item) => {
        const target = this.readRecord(item.targetJson) || {};
        return (
          this.readNonEmptyString(target.loopId) === loopId &&
          this.readNonEmptyString(target.loopSegment) === 'iteration' &&
          this.readPositiveInteger(target.loopIteration) === currentIteration
        );
      })
      .sort((a, b) => (a.stepIndex as number) - (b.stepIndex as number));
    const runtimeReadValue = await this.readLoopComparableValueFromRuntime(
      input.stopWhen,
      input.runtimeSessionId,
      input.hooks
    );
    const value = runtimeReadValue ?? this.extractLoopComparableValue(iterationSteps);
    const conditionFn = this.readNonEmptyString(input.stopWhen?.conditionFn);
    const shouldStop = this.evaluateLoopConditionExpression(conditionFn, value);

    return {
      shouldStop,
      ...(shouldStop ? { reason: 'condition_matched' } : {}),
      ...(value !== undefined ? { value } : {}),
    };
  }

  private extractLoopComparableValue(steps: Array<Record<string, unknown>>): string | undefined {
    const candidates = [...steps].reverse();
    for (const step of candidates) {
      const output = this.readRecord(step.outputJson, step.output_json);
      const value = this.readNonEmptyString(
        output?.data && this.readRecord(output.data)?.text,
        output?.text,
        output?.value,
        output?.result && this.readRecord(output.result)?.text,
        output?.result &&
          this.readRecord(output.result)?.data &&
          this.readRecord(this.readRecord(output.result)?.data)?.text
      );
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  private async readLoopComparableValueFromRuntime(
    stopWhen: Record<string, unknown> | undefined,
    runtimeSessionId: string,
    hooks: AdvanceExecutionFlowHooks
  ): Promise<string | undefined> {
    const readConfig = this.readRecord(stopWhen?.read);
    const readType = this.readNonEmptyString(readConfig?.type)?.toLowerCase();
    const locator = this.readRecord(readConfig?.locator);
    const selector = this.readNonEmptyString(locator?.value);
    if (readType !== 'text' || !selector || !hooks.readBrowserTextBySelector) {
      return undefined;
    }
    return hooks.readBrowserTextBySelector(runtimeSessionId, selector);
  }

  private evaluateLoopConditionExpression(
    conditionFn: string | undefined,
    value: string | undefined
  ): boolean {
    if (!conditionFn) {
      return false;
    }

    try {
      const evaluator = new Function(
        'value',
        `const fn = (value) => (${conditionFn}); return fn(value);`
      ) as (input: unknown) => unknown;
      return Boolean(evaluator(value));
    } catch {
      // Fall through to the legacy matcher for backward compatibility.
    }

    const equalsMatch = conditionFn.match(/^value\s*===\s*["'](.+)["']$/);
    if (equalsMatch) {
      return (value || '') === equalsMatch[1];
    }

    const notEqualsMatch = conditionFn.match(/^value\s*!==\s*["'](.+)["']$/);
    if (notEqualsMatch) {
      return (value || '') !== notEqualsMatch[1];
    }

    const includesMatch = conditionFn.match(/^value\.includes\(\s*["'](.+)["']\s*\)$/);
    if (includesMatch) {
      return (value || '').includes(includesMatch[1]);
    }

    const notIncludesMatch = conditionFn.match(/^!value\.includes\(\s*["'](.+)["']\s*\)$/);
    if (notIncludesMatch) {
      return !(value || '').includes(notIncludesMatch[1]);
    }

    const numericMatch = conditionFn.match(/^Number\(value\)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
    if (numericMatch) {
      const actual = Number(value);
      const expected = Number(numericMatch[2]);
      if (Number.isNaN(actual)) {
        return false;
      }
      switch (numericMatch[1]) {
        case '>':
          return actual > expected;
        case '>=':
          return actual >= expected;
        case '<':
          return actual < expected;
        case '<=':
          return actual <= expected;
        default:
          return false;
      }
    }

    const normalized = String(value || '').trim();
    return normalized.length === 0;
  }

  private async persistLoopWorkflowState(
    executionId: string,
    normalizedInput: Record<string, unknown>,
    loopWorkflowState: LoopWorkflowState
  ): Promise<void> {
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        normalizedInputJson: {
          ...(normalizedInput || {}),
          loopWorkflowState,
        } as any,
      },
    });
  }

  private readRecord(...values: unknown[]): Record<string, unknown> | undefined {
    for (const value of values) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    }
    return undefined;
  }

  private readNonEmptyString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private readPositiveInteger(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.trunc(value);
      }
    }
    return undefined;
  }
}
