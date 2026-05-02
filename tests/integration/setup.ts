/**
 * Integration Test Setup
 *
 * This file runs before each test file and sets up:
 * - Extended matchers
 * - Global test utilities
 * - Environment configuration validation
 */

import { expect, beforeAll, afterAll } from '@jest/globals';
import { SERVICE_CONFIG } from './config';

// Global test hooks
beforeAll(async () => {
  console.log('[Integration Setup] Service endpoints:');
  console.log(`  Auth: ${SERVICE_CONFIG.AUTH.baseUrl()}`);
  console.log(`  Session Broker: ${SERVICE_CONFIG.SESSION_BROKER.baseUrl()}`);
  console.log(`  Template: ${SERVICE_CONFIG.TEMPLATE.baseUrl()}`);
  console.log(`  AI Orchestrator: ${SERVICE_CONFIG.AI_ORCHESTRATOR.baseUrl()}`);
  console.log(`  Replay Engine: ${SERVICE_CONFIG.REPLAY_ENGINE.baseUrl()}`);
});

afterAll(async () => {
  console.log('[Integration Teardown] Test suite completed');
});

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

// Declare custom matchers for TypeScript
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidSessionState(): R;
      toBeValidTemplateStatus(): R;
    }
  }
}

// Re-export config for convenience
export * from './config';