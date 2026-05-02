import { Injectable, Logger } from '@nestjs/common';
import {
  DecideFailureRequest,
  DecideFailureResponse,
} from '../../interfaces';

/**
 * Retry Configuration
 */
interface RetryConfig {
  max_retries: number;
  delay_ms: number;
  exponential_backoff: boolean;
  max_delay_ms: number;
}

/**
 * Retry History Entry
 */
interface RetryHistoryEntry {
  session_id: string;
  step_id: string;
  retry_count: number;
  last_error: string;
  timestamp: Date;
}

/**
 * Retry Service
 * Manages retry logic and tracks retry history
 */
@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);
  private retryCounts: Map<string, number> = new Map();
  private retryHistory: RetryHistoryEntry[] = [];
  private defaultConfig: RetryConfig = {
    max_retries: 3,
    delay_ms: 1000,
    exponential_backoff: true,
    max_delay_ms: 30000,
  };

  /**
   * Get current retry count for a step
   */
  getRetryCount(sessionId: string, stepId: string): number {
    const key = `${sessionId}:${stepId}`;
    return this.retryCounts.get(key) || 0;
  }

  /**
   * Increment retry count for a step
   */
  incrementRetryCount(sessionId: string, stepId: string): number {
    const key = `${sessionId}:${stepId}`;
    const current = this.retryCounts.get(key) || 0;
    const newCount = current + 1;
    this.retryCounts.set(key, newCount);

    this.logger.debug(`Retry count for ${key}: ${newCount}`);
    return newCount;
  }

  /**
   * Clear retry count for a step
   */
  clearRetryCount(sessionId: string, stepId: string): void {
    const key = `${sessionId}:${stepId}`;
    this.retryCounts.delete(key);
  }

  /**
   * Clear all retry counts for a session
   */
  clearSessionRetries(sessionId: string): void {
    for (const [key] of this.retryCounts.entries()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.retryCounts.delete(key);
      }
    }
  }

  /**
   * Check if max retries exceeded
   */
  isMaxRetriesExceeded(sessionId: string, stepId: string, maxRetries?: number): boolean {
    const current = this.getRetryCount(sessionId, stepId);
    const limit = maxRetries || this.defaultConfig.max_retries;
    return current >= limit;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  calculateRetryDelay(retryCount: number, baseDelayMs?: number): number {
    const baseDelay = baseDelayMs || this.defaultConfig.delay_ms;

    if (this.defaultConfig.exponential_backoff) {
      const delay = baseDelay * Math.pow(2, retryCount);
      return Math.min(delay, this.defaultConfig.max_delay_ms);
    }

    return baseDelay;
  }

  /**
   * Record retry attempt
   */
  recordRetryAttempt(
    sessionId: string,
    stepId: string,
    error: string,
  ): void {
    const retryCount = this.getRetryCount(sessionId, stepId);

    this.retryHistory.push({
      session_id: sessionId,
      step_id: stepId,
      retry_count: retryCount,
      last_error: error,
      timestamp: new Date(),
    });
  }

  /**
   * Get retry history for a session
   */
  getRetryHistory(sessionId: string): RetryHistoryEntry[] {
    return this.retryHistory.filter((entry) => entry.session_id === sessionId);
  }

  /**
   * Get retry statistics
   */
  getRetryStatistics(): {
    totalRetries: number;
    successAfterRetry: number;
    maxRetriesReached: number;
  } {
    const totalRetries = this.retryHistory.length;
    const maxRetriesReached = this.retryHistory.filter(
      (entry) => entry.retry_count >= this.defaultConfig.max_retries,
    ).length;

    return {
      totalRetries,
      successAfterRetry: 0, // Would need to track success outcomes
      maxRetriesReached,
    };
  }

  /**
   * Should retry based on error type
   */
  shouldRetry(errorType: string): boolean {
    const retryableErrors = [
      'timeout',
      'network_error',
      'element_not_found',
      'stale_element',
      'page_load_failed',
      'temporary_error',
    ];

    return retryableErrors.some((e) =>
      errorType.toLowerCase().includes(e.toLowerCase()),
    );
  }

  /**
   * Determine retry strategy based on error and history
   */
  determineRetryStrategy(
    request: DecideFailureRequest,
    maxRetries?: number,
  ): DecideFailureResponse {
    const currentRetries = this.getRetryCount(request.session_id, request.step_id);
    const limit = maxRetries || this.defaultConfig.max_retries;

    // If max retries exceeded
    if (currentRetries >= limit) {
      return {
        decision: 'takeover',
        reason: `Max retries (${limit}) exceeded for step ${request.step_id}`,
      };
    }

    // Check if error is retryable
    if (this.shouldRetry(request.error_type)) {
      return {
        decision: 'retry',
        reason: `Error type "${request.error_type}" is retryable. Attempt ${currentRetries + 1}/${limit}`,
      };
    }

    // Non-retryable error - needs human intervention
    return {
      decision: 'takeover',
      reason: `Error type "${request.error_type}" requires human intervention`,
    };
  }

  /**
   * Update default configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryConfig {
    return this.defaultConfig;
  }
}