/**
 * Test Configuration
 *
 * Shared configuration for integration tests.
 * This file has no Jest dependencies and can be safely imported anywhere.
 */

// Service endpoint configuration
export const SERVICE_CONFIG = {
  AUTH: {
    host: process.env.AUTH_HOST || 'localhost',
    port: parseInt(process.env.AUTH_PORT || '3001', 10),
    baseUrl: () => `http://${SERVICE_CONFIG.AUTH.host}:${SERVICE_CONFIG.AUTH.port}`,
  },
  SESSION_BROKER: {
    host: process.env.SESSION_BROKER_HOST || 'localhost',
    port: parseInt(process.env.SESSION_BROKER_PORT || '3002', 10),
    baseUrl: () =>
      `http://${SERVICE_CONFIG.SESSION_BROKER.host}:${SERVICE_CONFIG.SESSION_BROKER.port}`,
  },
  BROWSER_TEMPLATE: {
    host: process.env.BROWSER_TEMPLATE_HOST || 'localhost',
    port: parseInt(process.env.BROWSER_TEMPLATE_PORT || '3005', 10),
    baseUrl: () =>
      `http://${SERVICE_CONFIG.BROWSER_TEMPLATE.host}:${SERVICE_CONFIG.BROWSER_TEMPLATE.port}`,
  },
  AI_ORCHESTRATOR: {
    host: process.env.AI_ORCHESTRATOR_HOST || 'localhost',
    port: parseInt(process.env.AI_ORCHESTRATOR_PORT || '3007', 10),
    baseUrl: () =>
      `http://${SERVICE_CONFIG.AI_ORCHESTRATOR.host}:${SERVICE_CONFIG.AI_ORCHESTRATOR.port}`,
  },
  REPLAY_ENGINE: {
    host: process.env.REPLAY_ENGINE_HOST || 'localhost',
    port: parseInt(process.env.REPLAY_ENGINE_PORT || '3006', 10),
    baseUrl: () =>
      `http://${SERVICE_CONFIG.REPLAY_ENGINE.host}:${SERVICE_CONFIG.REPLAY_ENGINE.port}`,
  },
};

// Database configuration
export const DB_CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://ops:ops_secret@localhost:5432/ops',
  REDIS_URL:
    process.env.REDIS_URL ||
    `redis://:${process.env.REDIS_PASSWORD || 'redis_secret'}@localhost:${process.env.REDIS_PORT || '6379'}`,
};

// Test timeout settings
export const TEST_TIMEOUTS = {
  SHORT: 5000,
  MEDIUM: 15000,
  LONG: 30000,
  E2E: 60000,
};

// Utility functions
export function generateTestUserId(): string {
  return `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateTestTemplateName(): string {
  return `test-template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
