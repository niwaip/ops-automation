/**
 * Replay Engine Service
 *
 * This service handles CDP-driven browser automation replay execution.
 */

export const SERVICE_NAME = 'replay-engine';

export * from './interfaces';
export * from './dto';
export * from './modules/cdp';
export * from './modules/executor';
export * from './modules/retry';
export * from './modules/log';
export * from './modules/ai-interaction';
export * from './modules/takeover';
export * from './prisma/prisma.module';
export * from './prisma/prisma.service';
