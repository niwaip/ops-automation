import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getDatabaseUrl } from '../../config/service-endpoints';

/**
 * Database Service
 * PostgreSQL connection for step_logs and execution tracking
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;

  async onModuleInit() {
    const databaseUrl = getDatabaseUrl();
    this.logger.log(`Connecting to database: ${databaseUrl}`);

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    try {
      const client = await this.pool.connect();
      this.logger.log('Database connection established');
      client.release();
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('Database connection pool closed');
    }
  }

  /**
   * Get a client from the pool
   */
  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }
    return this.pool.connect();
  }

  /**
   * Execute a query
   */
  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }
    return this.pool.query<T>(sql, params);
  }

  /**
   * Execute a query with a client (for transactions)
   */
  async queryWithClient<T extends QueryResultRow = QueryResultRow>(client: PoolClient, sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    return client.query<T>(sql, params);
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(client: PoolClient): Promise<void> {
    await client.query('BEGIN');
  }

  /**
   * Commit a transaction
   */
  async commitTransaction(client: PoolClient): Promise<void> {
    await client.query('COMMIT');
  }

  /**
   * Rollback a transaction
   */
  async rollbackTransaction(client: PoolClient): Promise<void> {
    await client.query('ROLLBACK');
  }

  /**
   * Insert a step log entry
   */
  async insertStepLog(entry: {
    id: string;
    session_id: string;
    step_id: string;
    step_index: number;
    action: string;
    locator_type?: string;
    locator_value?: string;
    locator_summary?: string;
    started_at: Date;
    completed_at?: Date;
    duration_ms?: number;
    result: string;
    error_class?: string;
    error_message?: string;
    retry_count: number;
    retry_reason?: string;
    takeover_triggered: boolean;
    takeover_reason?: string;
    screenshot_ref?: string;
    trace_ref?: string;
    context?: Record<string, unknown>;
  }): Promise<void> {
    const sql = `
      INSERT INTO step_logs (
        id, session_id, step_id, step_index, action,
        locator_type, locator_value, locator_summary,
        started_at, completed_at, duration_ms, result,
        error_class, error_message,
        retry_count, retry_reason,
        takeover_triggered, takeover_reason,
        screenshot_ref, trace_ref, context
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14,
        $15, $16,
        $17, $18,
        $19, $20, $21
      )
    `;

    await this.query(sql, [
      entry.id,
      entry.session_id,
      entry.step_id,
      entry.step_index,
      entry.action,
      entry.locator_type,
      entry.locator_value,
      entry.locator_summary,
      entry.started_at,
      entry.completed_at,
      entry.duration_ms,
      entry.result,
      entry.error_class,
      entry.error_message,
      entry.retry_count,
      entry.retry_reason,
      entry.takeover_triggered,
      entry.takeover_reason,
      entry.screenshot_ref,
      entry.trace_ref,
      JSON.stringify(entry.context ?? {}),
    ]);
  }

  /**
   * Update a step log entry
   */
  async updateStepLog(
    id: string,
    updates: {
      completed_at?: Date;
      duration_ms?: number;
      result?: string;
      error_class?: string;
      error_message?: string;
      retry_count?: number;
      retry_reason?: string;
      takeover_triggered?: boolean;
      takeover_reason?: string;
      screenshot_ref?: string;
    },
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) {
      return;
    }

    values.push(id);
    const sql = `UPDATE step_logs SET ${fields.join(', ')} WHERE id = $${paramIndex}`;
    await this.query(sql, values);
  }

  /**
   * Get step logs for a session
   */
  async getStepLogs(sessionId: string): Promise<QueryResultRow[]> {
    const sql = `
      SELECT * FROM step_logs
      WHERE session_id = $1
      ORDER BY step_index ASC
    `;
    const result = await this.query(sql, [sessionId]);
    return result.rows;
  }

  /**
   * Create an execution record in Redis (via Session Broker)
   * Note: This is a placeholder - actual implementation uses Session Broker API
   */
  async createExecutionRecord(_executionId: string, sessionId: string, templateId: string): Promise<void> {
    // Store execution state locally for tracking
    const sql = `
      INSERT INTO sessions (id, template_id, state, created_at)
      VALUES ($1, $2, 'RUNNING', NOW())
      ON CONFLICT (id) DO UPDATE SET state = 'RUNNING'
    `;
    await this.query(sql, [sessionId, templateId]);
  }
}
