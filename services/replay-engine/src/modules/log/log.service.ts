import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database';
import { StepLogEntry, StepResultType } from '../../interfaces';
import type { QueryResultRow } from 'pg';

/**
 * Log Service
 * Writes step execution logs to database
 */
@Injectable()
export class LogService {
  private readonly logger = new Logger(LogService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Create a new step log entry
   */
  async createLogEntry(entry: {
    id: string;
    session_id: string;
    step_id: string;
    step_index: number;
    action: string;
    locator_type?: string;
    locator_value?: string;
    locator_summary?: string;
    started_at: Date;
    result: StepResultType;
    retry_count: number;
    takeover_triggered: boolean;
    context?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.databaseService.insertStepLog({
        id: entry.id,
        session_id: entry.session_id,
        step_id: entry.step_id,
        step_index: entry.step_index,
        action: entry.action,
        locator_type: entry.locator_type,
        locator_value: entry.locator_value,
        locator_summary: entry.locator_summary,
        started_at: entry.started_at,
        result: entry.result,
        retry_count: entry.retry_count,
        takeover_triggered: entry.takeover_triggered,
        context: entry.context,
      });

      this.logger.debug(
        `Created log entry for step ${entry.step_id} in session ${entry.session_id}`,
      );
    } catch (error) {
      this.logger.error('Failed to create log entry:', error);
      // Don't throw - logging should not block execution
    }
  }

  /**
   * Update an existing step log entry
   */
  async updateLogEntry(
    id: string,
    updates: {
      completed_at?: Date;
      duration_ms?: number;
      result?: StepResultType;
      error_class?: string;
      error_message?: string;
      retry_count?: number;
      retry_reason?: string;
      takeover_triggered?: boolean;
      takeover_reason?: string;
      screenshot_ref?: string;
      trace_ref?: string;
    },
  ): Promise<void> {
    try {
      await this.databaseService.updateStepLog(id, updates);

      this.logger.debug(`Updated log entry ${id}`);
    } catch (error) {
      this.logger.error('Failed to update log entry:', error);
    }
  }

  /**
   * Get step logs for a session
   */
  async getStepLogs(sessionId: string): Promise<StepLogEntry[]> {
    try {
      const rows = await this.databaseService.getStepLogs(sessionId);
      return rows.map((row) => this.mapRowToEntry(row));
    } catch (error) {
      this.logger.error('Failed to get step logs:', error);
      return [];
    }
  }

  /**
   * Get the latest step log for a session
   */
  async getLatestStepLog(sessionId: string): Promise<StepLogEntry | null> {
    const logs = await this.getStepLogs(sessionId);
    return logs.length > 0 ? (logs[logs.length - 1] ?? null) : null;
  }

  /**
   * Get step logs by result type
   */
  async getStepLogsByResult(
    sessionId: string,
    result: StepResultType,
  ): Promise<StepLogEntry[]> {
    const logs = await this.getStepLogs(sessionId);
    return logs.filter((log) => log.result === result);
  }

  /**
   * Count failed steps in a session
   */
  async countFailedSteps(sessionId: string): Promise<number> {
    const logs = await this.getStepLogs(sessionId);
    return logs.filter((log) => log.result === 'failed').length;
  }

  /**
   * Check if takeover was triggered in a session
   */
  async hasTakeover(sessionId: string): Promise<boolean> {
    const logs = await this.getStepLogs(sessionId);
    return logs.some((log) => log.takeover_triggered);
  }

  /**
   * Get execution summary for a session
   */
  async getExecutionSummary(sessionId: string): Promise<{
    total_steps: number;
    successful_steps: number;
    failed_steps: number;
    retry_steps: number;
    takeover_triggered: boolean;
    total_duration_ms: number;
  }> {
    const logs = await this.getStepLogs(sessionId);

    return {
      total_steps: logs.length,
      successful_steps: logs.filter((l) => l.result === 'success').length,
      failed_steps: logs.filter((l) => l.result === 'failed').length,
      retry_steps: logs.filter((l) => l.result === 'retry').length,
      takeover_triggered: logs.some((l) => l.takeover_triggered),
      total_duration_ms: logs.reduce((sum, l) => sum + (l.duration_ms ?? 0), 0),
    };
  }

  /**
   * Map database row to StepLogEntry
   */
  private mapRowToEntry(row: QueryResultRow): StepLogEntry {
    return {
      id: row.id as string,
      session_id: row.session_id as string,
      step_id: row.step_id as string,
      step_index: row.step_index as number,
      action: row.action as StepLogEntry['action'],
      locator_type: row.locator_type as StepLogEntry['locator_type'],
      locator_value: row.locator_value as string | undefined,
      locator_summary: row.locator_summary as string | undefined,
      started_at: row.started_at as Date,
      completed_at: row.completed_at as Date | undefined,
      duration_ms: row.duration_ms as number | undefined,
      result: row.result as StepResultType,
      error_class: row.error_class as string | undefined,
      error_message: row.error_message as string | undefined,
      retry_count: row.retry_count as number,
      retry_reason: row.retry_reason as string | undefined,
      takeover_triggered: row.takeover_triggered as boolean,
      takeover_reason: row.takeover_reason as string | undefined,
      screenshot_ref: row.screenshot_ref as string | undefined,
      trace_ref: row.trace_ref as string | undefined,
      context: row.context as Record<string, unknown> ?? {},
    };
  }
}