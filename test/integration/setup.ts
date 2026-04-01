/**
 * Integration Test Setup
 *
 * This file runs before each test file and sets up:
 * - Extended matchers
 * - Global test utilities
 * - Environment configuration validation
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
    baseUrl: () => `http://${SERVICE_CONFIG.SESSION_BROKER.host}:${SERVICE_CONFIG.SESSION_BROKER.port}`,
  },
  TEMPLATE: {
    host: process.env.TEMPLATE_HOST || 'localhost',
    port: parseInt(process.env.TEMPLATE_PORT || '3004', 10),
    baseUrl: () => `http://${SERVICE_CONFIG.TEMPLATE.host}:${SERVICE_CONFIG.TEMPLATE.port}`,
  },
  AI_ORCHESTRATOR: {
    host: process.env.AI_ORCHESTRATOR_HOST || 'localhost',
    port: parseInt(process.env.AI_ORCHESTRATOR_PORT || '3000', 10),
    baseUrl: () => `http://${SERVICE_CONFIG.AI_ORCHESTRATOR.host}:${SERVICE_CONFIG.AI_ORCHESTRATOR.port}`,
  },
  REPLAY_ENGINE: {
    host: process.env.REPLAY_ENGINE_HOST || 'localhost',
    port: parseInt(process.env.REPLAY_ENGINE_PORT || '3005', 10),
    baseUrl: () => `http://${SERVICE_CONFIG.REPLAY_ENGINE.host}:${SERVICE_CONFIG.REPLAY_ENGINE.port}`,
  },
};

// Database configuration
export const DB_CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://ops:ops_secret@localhost:5432/ops',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
};

// Test timeout settings
export const TEST_TIMEOUTS = {
  SHORT: 5000,
  MEDIUM: 15000,
  LONG: 30000,
  E2E: 60000,
};

// Global test hooks
beforeAll(async () => {
  // Validate environment configuration
  console.log('[Integration Setup] Service endpoints:');
  console.log(`  Auth: ${SERVICE_CONFIG.AUTH.baseUrl()}`);
  console.log(`  Session Broker: ${SERVICE_CONFIG.SESSION_BROKER.baseUrl()}`);
  console.log(`  Template: ${SERVICE_CONFIG.TEMPLATE.baseUrl()}`);
  console.log(`  AI Orchestrator: ${SERVICE_CONFIG.AI_ORCHESTRATOR.baseUrl()}`);
  console.log(`  Replay Engine: ${SERVICE_CONFIG.REPLAY_ENGINE.baseUrl()}`);
});

afterAll(async () => {
  // Cleanup global resources
  console.log('[Integration Teardown] Test suite completed');
});

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidSessionState(): R;
      toBeValidTemplateStatus(): R;
    }
  }
}

// Custom matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid UUID`
          : `expected ${received} to be a valid UUID`,
    };
  },
  toBeValidSessionState(received: string) {
    const validStates = ['IDLE', 'RUNNING', 'HUMAN_CONTROL', 'CLOSED', 'ERROR'];
    const pass = validStates.includes(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid session state`
          : `expected ${received} to be one of: ${validStates.join(', ')}`,
    };
  },
  toBeValidTemplateStatus(received: string) {
    const validStatuses = ['DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED', 'REVOKED'];
    const pass = validStatuses.includes(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid template status`
          : `expected ${received} to be one of: ${validStatuses.join(', ')}`,
    };
  },
});

// Export for use in tests
export function generateTestUserId(): string {
  return `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateTestTemplateName(): string {
  return `test-template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}