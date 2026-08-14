import { Injectable } from '@nestjs/common';
import { LlmOperationError } from '../registry/errors';

export const BUDGET_EXCEEDED = 'BUDGET_EXCEEDED';

@Injectable()
export class BudgetEnforcerService {
  public preflightInput(input: Record<string, unknown>, maxInputTokens: number): void {
    const estimated = Math.ceil(JSON.stringify(input).length / 4);
    if (estimated > maxInputTokens) {
      throw new LlmOperationError(
        BUDGET_EXCEEDED,
        `Input exceeds budget: estimated ${estimated} tokens > max ${maxInputTokens}`,
        { estimated, max: maxInputTokens },
      );
    }
  }

  public assertOutputWithinBudget(usage: { outputTokens?: number }, maxOutputTokens: number): void {
    const actual = usage.outputTokens;
    if (actual !== undefined && actual > maxOutputTokens) {
      throw new LlmOperationError(
        BUDGET_EXCEEDED,
        `Output exceeds budget: ${actual} tokens > max ${maxOutputTokens}`,
        { actual, max: maxOutputTokens },
      );
    }
  }

  public assertLatencyWithinBudget(latencyMs: number, timeoutMs: number): void {
    if (latencyMs > timeoutMs) {
      throw new LlmOperationError(
        BUDGET_EXCEEDED,
        `Latency exceeds budget: ${latencyMs}ms > timeout ${timeoutMs}ms`,
        { latencyMs, timeoutMs },
      );
    }
  }
}