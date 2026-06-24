import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../prisma';
import { RECOVERY_MESSAGES } from '../../recovery/recovery-constants';
import { BROWSER_ERROR_CODES, BROWSER_MESSAGES } from '../browser/browser-execution-constants';
import { PrismaService } from '../../../prisma/prisma.service';
import { EXECUTION_EVENT_TYPE } from '../../contracts/execution-event-type';
import { ExecutionStepService } from '../steps/execution-step.service';
import { RuntimeStepInvokeResult } from '../../adapters/runtime-adapter.interface';

interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

interface CapabilityRuntimeExecuteResult {
  releaseId: string;
  capabilityId: string;
  capabilityVersion?: string | null;
  publishedSkillId: string;
  runtime: string;
  fn?: string;
  taskQueue?: string;
  success: boolean;
  output?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  usage?: LLMUsage;
  logs: string[];
  error?: string | null;
}

interface RuntimeResultInterpreterContext {
  executionId: string;
  runtimeSessionId: string;
  stepId: string;
  emitEvent: (
    eventType: (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE],
    payload: Record<string, unknown>
  ) => Promise<void>;
  advanceExecutionFlow: () => Promise<void>;
  failExecution: (failureReason: string, failureCode: string) => Promise<void>;
  takeover?: (reason: string) => Promise<void>;
  enterWaitingInput?: (requiredInputs: unknown[], reason?: string) => Promise<void>;
  enterPendingApproval?: (reason: string) => Promise<void>;
}

@Injectable()
export class RuntimeResultInterpreter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionStepService: ExecutionStepService
  ) {}

  async handleBrowserStepResult(
    context: RuntimeResultInterpreterContext,
    result: RuntimeStepInvokeResult
  ): Promise<void> {
    if (result.status === 'waiting') {
      const requiredInputs = this.extractRequiredInputs(result.output);
      await this.executionStepService.markStepWaiting(context.stepId, {
        requiredInputs,
        outputJson: result.output,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
      if (context.enterWaitingInput) {
        await context.enterWaitingInput(requiredInputs, result.errorMessage);
        return;
      }
      await context.failExecution(
        result.errorMessage || BROWSER_MESSAGES.STEP_WAITING_UNHANDLED,
        result.errorCode || BROWSER_ERROR_CODES.STEP_WAITING_UNHANDLED
      );
      return;
    }

    if (result.status === 'blocked') {
      if (context.enterPendingApproval) {
        await context.enterPendingApproval(result.errorMessage || BROWSER_MESSAGES.STEP_BLOCKED);
        return;
      }
      await context.failExecution(
        result.errorMessage || BROWSER_MESSAGES.STEP_BLOCKED,
        result.errorCode || BROWSER_ERROR_CODES.STEP_BLOCKED
      );
      return;
    }

    await this.executionStepService.finishBrowserStep(context.stepId, {
      success: result.success,
      output: result.output,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      snapshotId: result.snapshot?.id,
      shouldTakeover: Boolean(result.requiresTakeover),
    });

    await context.emitEvent(
      result.success ? EXECUTION_EVENT_TYPE.STEP_SUCCEEDED : EXECUTION_EVENT_TYPE.STEP_FAILED,
      {
        runtimeSessionId: context.runtimeSessionId,
        stepId: context.stepId,
        snapshotId: result.snapshot?.id,
        errorCode: result.errorCode,
        shouldTakeover: result.requiresTakeover,
      }
    );

    if (result.status === 'takeover_required' || result.requiresTakeover) {
      if (context.takeover) {
        await context.takeover(result.takeoverReason || RECOVERY_MESSAGES.BROWSER_TAKEOVER);
      }
      return;
    }

    if (result.success) {
      await context.advanceExecutionFlow();
      return;
    }

    await context.failExecution(
      result.errorMessage || BROWSER_MESSAGES.STEP_FAILED,
      result.errorCode || BROWSER_ERROR_CODES.STEP_FAILED
    );
  }

  async handleSkillRuntimeResult(
    context: RuntimeResultInterpreterContext,
    result: RuntimeStepInvokeResult
  ): Promise<void> {
    if (result.status === 'waiting') {
      const requiredInputs = this.extractRequiredInputs(result.output);
      await this.executionStepService.markStepWaiting(context.stepId, {
        requiredInputs,
        outputJson: result.output,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
      if (context.enterWaitingInput) {
        await context.enterWaitingInput(requiredInputs, result.errorMessage);
        return;
      }
      await context.failExecution(
        result.errorMessage || 'Skill runtime entered waiting state without handling',
        result.errorCode || 'CAPABILITY_RUNTIME_WAITING_UNHANDLED'
      );
      return;
    }

    if (result.status === 'blocked') {
      if (context.enterPendingApproval) {
        await context.enterPendingApproval(
          result.errorMessage || 'Skill runtime blocked by runtime policy'
        );
        return;
      }
      await context.failExecution(
        result.errorMessage || 'Skill runtime blocked by runtime policy',
        result.errorCode || 'CAPABILITY_RUNTIME_BLOCKED'
      );
      return;
    }

    const rawResult = (result.rawResult || {}) as Partial<CapabilityRuntimeExecuteResult>;
    const output = result.output || null;

    await this.executionStepService.finishSystemSkillStep(context.stepId, {
      success: result.success,
      runtime: typeof rawResult.runtime === 'string' ? rawResult.runtime : 'capability_runtime',
      releaseId: typeof rawResult.releaseId === 'string' ? rawResult.releaseId : '',
      capabilityId: typeof rawResult.capabilityId === 'string' ? rawResult.capabilityId : '',
      capabilityVersion:
        typeof rawResult.capabilityVersion === 'string' ? rawResult.capabilityVersion : null,
      publishedSkillId:
        typeof rawResult.publishedSkillId === 'string' ? rawResult.publishedSkillId : '',
      result: output,
      output,
      logs: Array.isArray(rawResult.logs) ? rawResult.logs.map((item) => String(item)) : [],
      error: result.errorMessage || null,
    });

    await context.emitEvent(
      result.success ? EXECUTION_EVENT_TYPE.STEP_SUCCEEDED : EXECUTION_EVENT_TYPE.STEP_FAILED,
      {
        runtimeSessionId: context.runtimeSessionId,
        stepId: context.stepId,
        result: output,
        error: result.errorMessage,
        shouldTakeover: Boolean(result.requiresTakeover || result.status === 'takeover_required'),
      }
    );

    if (result.status === 'takeover_required' || result.requiresTakeover) {
      if (context.takeover) {
        await context.takeover(
          result.takeoverReason || result.errorMessage || RECOVERY_MESSAGES.SKILL_TAKEOVER
        );
        return;
      }
      await context.failExecution(
        result.errorMessage || RECOVERY_MESSAGES.SKILL_TAKEOVER_UNHANDLED,
        result.errorCode || 'CAPABILITY_RUNTIME_TAKEOVER_UNHANDLED'
      );
      return;
    }

    if (result.success) {
      await this.persistSkillRuntimeSuccess(context.executionId, output, rawResult.usage);
      await context.advanceExecutionFlow();
      return;
    }

    await context.failExecution(
      result.errorMessage || 'Capability runtime execution failed',
      result.errorCode || 'CAPABILITY_RUNTIME_FAILED'
    );
  }

  private async persistSkillRuntimeSuccess(
    executionId: string,
    output: Record<string, unknown> | null,
    usage?: LLMUsage
  ): Promise<void> {
    const currentExecution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: { normalizedInputJson: true },
    });

    const normalizedInput = currentExecution?.normalizedInputJson as
      | Record<string, unknown>
      | undefined;
    const currentUsage = normalizedInput?.__usage as unknown as LLMUsage | undefined;
    const totalUsage = this.sumUsage(currentUsage, usage);

    const updatedNormalizedInput = {
      ...(normalizedInput || {}),
      ...(totalUsage ? { __usage: totalUsage } : {}),
    };

    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        resultJson: this.asJsonValue(output),
        normalizedInputJson: this.asJsonValue(updatedNormalizedInput),
      },
    });
  }

  private sumUsage(...usages: (LLMUsage | undefined)[]): LLMUsage | undefined {
    const validUsages = usages.filter(
      (u): u is LLMUsage => !!u && (u.total_tokens > 0 || u.prompt_tokens > 0)
    );
    if (validUsages.length === 0) {
      return undefined;
    }

    const result: LLMUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      completion_tokens_details: {
        reasoning_tokens: 0,
      },
    };

    for (const usage of validUsages) {
      result.prompt_tokens += usage.prompt_tokens || 0;
      result.completion_tokens += usage.completion_tokens || 0;
      result.total_tokens += usage.total_tokens || 0;
      if (usage.completion_tokens_details?.reasoning_tokens) {
        if (!result.completion_tokens_details) {
          result.completion_tokens_details = { reasoning_tokens: 0 };
        }
        result.completion_tokens_details.reasoning_tokens =
          (result.completion_tokens_details.reasoning_tokens || 0) +
          usage.completion_tokens_details.reasoning_tokens;
      }
    }

    return result;
  }

  private asJsonValue(value: unknown): Prisma.JsonValue {
    return value as Prisma.JsonValue;
  }

  private extractRequiredInputs(output?: Record<string, unknown>): unknown[] {
    return Array.isArray(output?.requiredInputs) ? (output.requiredInputs as unknown[]) : [];
  }
}
