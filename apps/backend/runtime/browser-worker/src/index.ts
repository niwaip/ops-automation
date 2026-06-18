/**
 * Browser Worker Service
 *
 * This service executes browser automation tasks with:
 * - noVNC web interface (port 8080)
 * - Chrome DevTools Protocol (CDP, port 9222)
 * - Profile mounting for persistent sessions
 * - Worker lifecycle management
 */

export const SERVICE_NAME = 'browser-worker';
export const SERVICE_PORT = process.env.PORT || 3002;

export * from './interfaces';
export * from './dto';
export * from './modules/worker';
export * from './modules/health';
