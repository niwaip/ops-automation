import { Injectable, Logger } from '@nestjs/common';
import { Prisma, StepResult as PrismaStepResult } from '@prisma/client';
import { StepLogEntry, StepResultType } from '../../interfaces';
import { PrismaService } from '../../prisma/prisma.service';

type StepLogRecord = {
  id: string;
  sessionId: string;
  stepId: string;
  stepIndex: number;
  action: string;
  locatorType: string | null;
  locatorValue: string | null;
  locatorSummary: string | null;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  result: string;
  errorClass: string | null;
  errorMessage: string | null;
  retryCount: number;
  retryReason: string | null;
  takeoverTriggered: boolean;
  takeoverReason: string | null;
  screenshotRef: string | null;
  traceRef: string | null;
  context: unknown;
};

/**
 * Log Service
 * Writes step execution logs to database
 */
@Injectable()
export class LogService {
  private readonly logger = new Logger(LogService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      await this.prisma.stepLog.create({
        data: {
          id: entry.id,
          sessionId: entry.session_id,
          stepId: entry.step_id,
          stepIndex: entry.step_index,
          action: entry.action,
          locatorType: entry.locator_type ?? null,
          locatorValue: entry.locator_value ?? null,
          locatorSummary: entry.locator_summary ?? null,
          startedAt: entry.started_at,
          result: entry.result as PrismaStepResult,
          retryCount: entry.retry_count,
          takeoverTriggered: entry.takeover_triggered,
          context: (entry.context ?? {}) as Prisma.InputJsonValue,
        } satisfies Prisma.StepLogUncheckedCreateInput,
      });

      this.logger.debug(
        `Created log entry for step ${entry.step_id} in session ${entry.session_id}`
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
    }
  ): Promise<void> {
    try {
      const data: Prisma.StepLogUpdateInput = {};

      if (updates.completed_at !== undefined) {
        data.completedAt = updates.completed_at;
      }
      if (updates.duration_ms !== undefined) {
        data.durationMs = updates.duration_ms;
      }
      if (updates.result !== undefined) {
        data.result = updates.result as PrismaStepResult;
      }
      if (updates.error_class !== undefined) {
        data.errorClass = updates.error_class;
      }
      if (updates.error_message !== undefined) {
        data.errorMessage = updates.error_message;
      }
      if (updates.retry_count !== undefined) {
        data.retryCount = updates.retry_count;
      }
      if (updates.retry_reason !== undefined) {
        data.retryReason = updates.retry_reason;
      }
      if (updates.takeover_triggered !== undefined) {
        data.takeoverTriggered = updates.takeover_triggered;
      }
      if (updates.takeover_reason !== undefined) {
        data.takeoverReason = updates.takeover_reason;
      }
      if (updates.screenshot_ref !== undefined) {
        data.screenshotRef = updates.screenshot_ref;
      }
      if (updates.trace_ref !== undefined) {
        data.traceRef = updates.trace_ref;
      }

      if (Object.keys(data).length === 0) {
        return;
      }

      await this.prisma.stepLog.update({
        where: { id },
        data,
      });

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
      const rows = await this.prisma.stepLog.findMany({
        where: { sessionId },
        orderBy: { stepIndex: 'asc' },
      });
      return rows.map((row: StepLogRecord) => this.mapRowToEntry(row));
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
  async getStepLogsByResult(sessionId: string, result: StepResultType): Promise<StepLogEntry[]> {
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
  private mapRowToEntry(row: StepLogRecord): StepLogEntry {
    return {
      id: row.id as string,
      session_id: row.sessionId as string,
      step_id: row.stepId as string,
      step_index: row.stepIndex as number,
      action: row.action as StepLogEntry['action'],
      locator_type: (row.locatorType ?? undefined) as StepLogEntry['locator_type'],
      locator_value: row.locatorValue ?? undefined,
      locator_summary: row.locatorSummary ?? undefined,
      started_at: row.startedAt as Date,
      completed_at: row.completedAt ?? undefined,
      duration_ms: row.durationMs ?? undefined,
      result: row.result as StepResultType,
      error_class: row.errorClass ?? undefined,
      error_message: row.errorMessage ?? undefined,
      retry_count: row.retryCount as number,
      retry_reason: row.retryReason ?? undefined,
      takeover_triggered: row.takeoverTriggered as boolean,
      takeover_reason: row.takeoverReason ?? undefined,
      screenshot_ref: row.screenshotRef ?? undefined,
      trace_ref: row.traceRef ?? undefined,
      context: (row.context as Record<string, unknown> | null) ?? {},
    };
  }
}
