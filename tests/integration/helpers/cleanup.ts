/**
 * Test Cleanup Helper
 *
 * Provides utilities for cleaning up test data after tests.
 * Ensures test isolation by removing created resources.
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import { DB_CONFIG } from '../config';

// Database connection pool
let pgPool: Pool | null = null;
let redisClient: Redis | null = null;

async function tableExists(tableName: string): Promise<boolean> {
  if (!pgPool) {
    throw new Error('Cleanup connections not initialized');
  }

  const result = await pgPool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists
    `,
    [tableName]
  );

  return result.rows[0]?.exists === true;
}

async function deleteIfTableExists(query: string, tableName: string, params: unknown[] = []): Promise<void> {
  if (!(await tableExists(tableName))) {
    return;
  }

  await pgPool!.query(query, params);
}

async function truncateIfTableExists(tableName: string): Promise<void> {
  if (!(await tableExists(tableName))) {
    return;
  }

  await pgPool!.query(`TRUNCATE TABLE ${tableName} CASCADE`);
}

/**
 * Initialize database connections for cleanup
 */
export async function initCleanupConnections(): Promise<void> {
  pgPool = new Pool({ connectionString: DB_CONFIG.DATABASE_URL });
  redisClient = new Redis(DB_CONFIG.REDIS_URL);
}

/**
 * Close database connections
 */
export async function closeCleanupConnections(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Clean up test data for a specific session
 */
export async function cleanupSession(sessionId: string): Promise<void> {
  if (!pgPool) {
    throw new Error('Cleanup connections not initialized');
  }

  // Delete step logs first (cascade)
  await deleteIfTableExists('DELETE FROM step_logs WHERE session_id = $1', 'step_logs', [sessionId]);

  // Delete session
  await deleteIfTableExists('DELETE FROM sessions WHERE id = $1', 'sessions', [sessionId]);

  // Clear Redis session data
  if (redisClient) {
    await redisClient.del(`session:${sessionId}`);
    await redisClient.del(`session:${sessionId}:lock`);
    await redisClient.del(`session:${sessionId}:state`);
  }
}

/**
 * Clean up test data for a specific template
 */
export async function cleanupTemplate(templateId: string): Promise<void> {
  if (!pgPool) {
    throw new Error('Cleanup connections not initialized');
  }

  await deleteIfTableExists('DELETE FROM templates WHERE id = $1', 'templates', [templateId]);
}

/**
 * Clean up test data for a specific user
 */
export async function cleanupUser(userId: string): Promise<void> {
  if (!pgPool) {
    throw new Error('Cleanup connections not initialized');
  }

  // Delete sessions first
  if (await tableExists('sessions')) {
    const sessions = await pgPool.query('SELECT id FROM sessions WHERE user_id = $1', [userId]);
    for (const session of sessions.rows) {
      await cleanupSession(session.id);
    }
  }

  // Delete user roles
  await deleteIfTableExists('DELETE FROM user_roles WHERE user_id = $1', 'user_roles', [userId]);

  // Delete user
  await deleteIfTableExists('DELETE FROM users WHERE id = $1', 'users', [userId]);
}

/**
 * Clean up test data for a specific AI agent
 */
export async function cleanupAIAgent(agentId: string): Promise<void> {
  if (!pgPool) {
    throw new Error('Cleanup connections not initialized');
  }

  await deleteIfTableExists('DELETE FROM ai_agents WHERE id = $1', 'ai_agents', [agentId]);
}

/**
 * Clean up test data for a specific AI model
 */
export async function cleanupAIModel(modelId: string): Promise<void> {
  if (!pgPool) {
    throw new Error('Cleanup connections not initialized');
  }

  // Delete agents first
  await deleteIfTableExists('DELETE FROM ai_agents WHERE model_id = $1', 'ai_agents', [modelId]);

  // Delete model
  await deleteIfTableExists('DELETE FROM ai_models WHERE id = $1', 'ai_models', [modelId]);
}

/**
 * Full cleanup - removes all test data
 */
export async function cleanupAllTestData(): Promise<void> {
  if (!pgPool) {
    throw new Error('Cleanup connections not initialized');
  }

  // Delete test sessions (those with test- prefix in worker_ref or error_message)
  if (await tableExists('sessions')) {
    const testSessions = await pgPool.query(
      "SELECT id FROM sessions WHERE worker_ref LIKE 'test-%' OR error_message LIKE 'test-%'"
    );
    for (const session of testSessions.rows) {
      await cleanupSession(session.id);
    }
  }

  // Delete test templates
  await deleteIfTableExists(
    "DELETE FROM templates WHERE name LIKE 'test-template-%'",
    'templates'
  );

  // Delete test users
  await deleteIfTableExists("DELETE FROM users WHERE username LIKE 'test-user-%'", 'users');

  // Delete test AI models
  await deleteIfTableExists("DELETE FROM ai_models WHERE name LIKE 'test-model-%'", 'ai_models');

  // Clear all test Redis keys
  if (redisClient) {
    const keys = await redisClient.keys('test:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }
}

/**
 * Reset database to clean state (for CI)
 */
export async function resetDatabase(): Promise<void> {
  if (!pgPool) {
    throw new Error('Cleanup connections not initialized');
  }

  // Truncate tables (except system data)
  await truncateIfTableExists('step_logs');
  await truncateIfTableExists('sessions');
  await truncateIfTableExists('templates');
  await truncateIfTableExists('user_roles');
  await truncateIfTableExists('users');
  await truncateIfTableExists('ai_agents');
  await truncateIfTableExists('ai_models');
  await truncateIfTableExists('roles');

  // Flush Redis
  if (redisClient) {
    await redisClient.flushdb();
  }
}
