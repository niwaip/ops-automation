/**
 * Global Teardown for Integration Tests
 *
 * Runs once after all tests:
 * - Clean up test data
 * - Close database connections
 */

import { closeCleanupConnections, cleanupAllTestData } from './cleanup';

export default async function globalTeardown(): Promise<void> {
  console.log('[Global Teardown] Starting cleanup...');

  // Clean up all test data
  try {
    await cleanupAllTestData();
    console.log('[Global Teardown] Test data cleaned up');
  } catch (error) {
    console.error('[Global Teardown] Failed to clean up test data:', error);
  }

  // Close cleanup connections
  await closeCleanupConnections();

  console.log('[Global Teardown] Teardown complete');
}