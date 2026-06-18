/**
 * Global Setup for Integration Tests
 *
 * Runs once before all tests:
 * - Initialize database connections
 * - Seed test data
 * - Verify services are running
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import { DB_CONFIG, SERVICE_CONFIG } from '../config';
import { initCleanupConnections } from './cleanup';

async function checkServiceHealth(name: string, baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, { method: 'GET' });
    return response.ok;
  } catch {
    console.warn(`[Global Setup] ${name} not reachable at ${baseUrl}`);
    return false;
  }
}

export default async function globalSetup(): Promise<void> {
  console.log('[Global Setup] Starting integration test setup...');

  // Initialize cleanup connections
  await initCleanupConnections();

  // Check PostgreSQL connection
  const pgPool = new Pool({ connectionString: DB_CONFIG.DATABASE_URL });
  try {
    await pgPool.query('SELECT 1');
    console.log('[Global Setup] PostgreSQL connection successful');
  } catch (error) {
    console.error('[Global Setup] PostgreSQL connection failed:', error);
    throw error;
  }
  await pgPool.end();

  // Check Redis connection
  const redisClient = new Redis(DB_CONFIG.REDIS_URL);
  try {
    await redisClient.ping();
    console.log('[Global Setup] Redis connection successful');
  } catch (error) {
    console.error('[Global Setup] Redis connection failed:', error);
    throw error;
  }
  await redisClient.quit();

  // Check service health (optional in CI)
  const services = [
    { name: 'Auth', baseUrl: SERVICE_CONFIG.AUTH.baseUrl() },
    { name: 'Session Broker', baseUrl: SERVICE_CONFIG.SESSION_BROKER.baseUrl() },
    { name: 'Browser Template', baseUrl: SERVICE_CONFIG.BROWSER_TEMPLATE.baseUrl() },
    { name: 'AI Orchestrator', baseUrl: SERVICE_CONFIG.AI_ORCHESTRATOR.baseUrl() },
    { name: 'Replay Engine', baseUrl: SERVICE_CONFIG.REPLAY_ENGINE.baseUrl() },
  ];

  let allHealthy = true;
  for (const service of services) {
    const healthy = await checkServiceHealth(service.name, service.baseUrl);
    if (!healthy) {
      allHealthy = false;
    }
  }

  // In CI mode, we might skip health checks if services are mocked
  if (!allHealthy && process.env.SKIP_SERVICE_HEALTH_CHECK !== 'true') {
    console.warn('[Global Setup] Some services are not healthy. Tests may fail.');
  }

  console.log('[Global Setup] Setup complete');
}
