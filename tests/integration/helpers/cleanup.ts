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
  await pgPool.query('DELETE FROM step_logs WHERE session_id = $1', [sessionId]);

  // Delete session
  await pgPool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);

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

  await pgPool.query('DELETE FROM templates WHERE id = $1', [templateId]);
}

/**
 * Clean up test data for a specific user
 */
export async function cleanupUser(userId: string): Promise<void> {
  if (!pgPool) {
    throw new Error('Cleanup connections not initialized');
  }

  // Delete sessions first
  const sessions = await pgPool.query('SELECT id FROM sessions WHERE user_id = $1', [userId]);
  for (const session of sessions.rows) {
    await cleanupSession(session.id);
  }

  // Delete user roles
  await pgPool.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);

  // Delete user
  await pgPool.query('DELETE FROM users WHERE id = $1', [userId]);
}

/**
 * Clean up test data for a specific AI agent
 */
export async function cleanupAIAgent(agentId: string): Promise<void> {
  if (!pgPool) {
    throw new Error('Cleanup connections not initialized');
  }

  await pgPool.query('DELETE FROM ai_agents WHERE id = $1', [agentId]);
}

/**
 * Clean up test data for a specific AI model
 */
export async function cleanupAIModel(modelId: string): Promise<void> {
  if (!pgPool) {
    throw new Error('Cleanup connections not initialized');
  }

  // Delete agents first
  await pgPool.query('DELETE FROM ai_agents WHERE model_id = $1', [modelId]);

  // Delete model
  await pgPool.query('DELETE FROM ai_models WHERE id = $1', [modelId]);
}

/**
 * Full cleanup - removes all test data
 */
export async function cleanupAllTestData(): Promise<void> {
  if (!pgPool) {
    throw new Error('Cleanup connections not initialized');
  }

  // Delete test sessions (those with test- prefix in worker_ref or error_message)
  const testSessions = await pgPool.query(
    "SELECT id FROM sessions WHERE worker_ref LIKE 'test-%' OR error_message LIKE 'test-%'"
  );
  for (const session of testSessions.rows) {
    await cleanupSession(session.id);
  }

  // Delete test templates
  await pgPool.query(
    "DELETE FROM templates WHERE name LIKE 'test-template-%'"
  );

  // Delete test users
  await pgPool.query(
    "DELETE FROM users WHERE username LIKE 'test-user-%'"
  );

  // Delete test AI models
  await pgPool.query(
    "DELETE FROM ai_models WHERE name LIKE 'test-model-%'"
  );

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
  await pgPool.query('TRUNCATE TABLE step_logs CASCADE');
  await pgPool.query('TRUNCATE TABLE sessions CASCADE');
  await pgPool.query('TRUNCATE TABLE templates CASCADE');
  await pgPool.query('TRUNCATE TABLE user_roles CASCADE');
  await pgPool.query('TRUNCATE TABLE users CASCADE');
  await pgPool.query('TRUNCATE TABLE ai_agents CASCADE');
  await pgPool.query('TRUNCATE TABLE ai_models CASCADE');
  await pgPool.query('TRUNCATE TABLE roles CASCADE');

  // Flush Redis
  if (redisClient) {
    await redisClient.flushdb();
  }
}