import { Injectable } from '@nestjs/common';
import { LlmOperationError } from '../registry/errors';

export const BUDGET_EXCEEDED = 'BUDGET_EXCEEDED';

export const INPUT_TRUNCATION_NOTICE = '\n\n【输入内容过长，已按模型预算截断，仅保留前文部分】';

@Injectable()
export class BudgetEnforcerService {
  public preflightInput(input: Record<string, unknown>, maxInputTokens: number): void {
    const estimated = this.estimateTokens(input);
    if (estimated > maxInputTokens) {
      throw new LlmOperationError(
        BUDGET_EXCEEDED,
        `Input exceeds budget: estimated ${estimated} tokens > max ${maxInputTokens}`,
        { estimated, max: maxInputTokens },
      );
    }
  }

  /**
   * Applies the manifest's oversize policy to the input BEFORE preflight:
   * - 'reject' (default): input is returned unchanged; preflightInput then
   *   throws BUDGET_EXCEEDED for oversized inputs (fail-closed).
   * - 'truncate': the largest string field is shortened to fit the budget and
   *   a truncation notice is appended, so long-document operations degrade
   *   gracefully instead of failing the whole step.
   */
  public prepareInput(
    input: Record<string, unknown>,
    maxInputTokens: number,
    oversize: 'reject' | 'truncate' = 'reject',
  ): Record<string, unknown> {
    if (oversize !== 'truncate' || this.estimateTokens(input) <= maxInputTokens) {
      return input;
    }

    const prepared = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;

    // Trim array fields (e.g. items) when over budget
    for (const [key, value] of Object.entries(prepared)) {
      if (Array.isArray(value)) {
        while (value.length > 1 && this.estimateTokens(prepared) > maxInputTokens) {
          value.pop();
        }
      }
    }

    for (let pass = 0; pass < 5; pass++) {
      if (this.estimateTokens(prepared) <= maxInputTokens) {
        return prepared;
      }
      const largestKey = this.findLargestStringField(prepared);
      if (!largestKey) {
        // No string field to shrink — fall through and let preflight throw.
        return prepared;
      }
      const budgetChars = maxInputTokens * 4;
      const otherChars =
        JSON.stringify(prepared).length - String(prepared[largestKey]).length;
      const allowed = Math.max(0, budgetChars - otherChars - INPUT_TRUNCATION_NOTICE.length - 32);
      const current = String(prepared[largestKey]);
      prepared[largestKey] = current.slice(0, allowed) + INPUT_TRUNCATION_NOTICE;
    }

    return prepared;
  }

  private estimateTokens(input: Record<string, unknown>): number {
    return Math.ceil(JSON.stringify(input).length / 4);
  }

  private findLargestStringField(input: Record<string, unknown>): string | null {
    let largestKey: string | null = null;
    let largestLength = -1;
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string' && value.length > largestLength) {
        largestLength = value.length;
        largestKey = key;
      }
    }
    return largestKey;
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