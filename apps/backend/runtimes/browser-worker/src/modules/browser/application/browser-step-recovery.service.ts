import { Injectable } from '@nestjs/common';
import { ExecuteStepDto, ExecuteStepResultDto } from '../../../dto/worker.dto';

const RECOVERABLE_NAVIGATION_ACTIONS = new Set(['goto', 'navigate']);
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 750;

@Injectable()
export class BrowserStepRecoveryService {
  resolveMaxAttempts(dto: ExecuteStepDto): number {
    if (!this.requestsMainContent(dto) || !RECOVERABLE_NAVIGATION_ACTIONS.has(dto.action)) {
      return 1;
    }
    const configured = this.readiness(dto).maxAttempts;
    return this.clampInteger(configured, 1, 3, DEFAULT_MAX_ATTEMPTS);
  }

  shouldRetry(dto: ExecuteStepDto, result: ExecuteStepResultDto, attempt: number): boolean {
    return (
      attempt < this.resolveMaxAttempts(dto) &&
      result.success === false &&
      result.errorCode === 'CONTENT_NOT_READY'
    );
  }

  async waitBeforeRetry(dto: ExecuteStepDto): Promise<void> {
    const configured = this.readiness(dto).retryDelayMs;
    const delayMs = this.clampInteger(configured, 0, 5000, DEFAULT_RETRY_DELAY_MS);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  withRecoveryEvidence(result: ExecuteStepResultDto, attempts: number): ExecuteStepResultDto {
    if (attempts <= 1) return result;
    return {
      ...result,
      output: {
        ...(result.output || {}),
        recovery: {
          strategy: 'repeat_navigation',
          attempts,
          recovered: result.success,
        },
      },
    };
  }

  private requestsMainContent(dto: ExecuteStepDto): boolean {
    const capture = this.asRecord(this.asRecord(dto.captureProfile).capture);
    return capture.mainContent === true;
  }

  private readiness(dto: ExecuteStepDto): Record<string, unknown> {
    return this.asRecord(this.asRecord(dto.captureProfile).readiness);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private clampInteger(value: unknown, min: number, max: number, fallback: number): number {
    return Number.isInteger(value) ? Math.min(max, Math.max(min, Number(value))) : fallback;
  }
}
