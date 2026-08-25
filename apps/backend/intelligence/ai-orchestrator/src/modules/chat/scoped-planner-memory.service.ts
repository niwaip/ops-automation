import { Injectable, Logger } from '@nestjs/common';
import { ControlPlaneClient } from '../../client/control-plane.client';

export interface ScopedPlannerMemoryContext {
  kind: string;
  memoryKey: string;
  value: unknown;
  version?: number;
}

interface StoredScopedMemory {
  scopeType?: unknown;
  scopeId?: unknown;
  kind?: unknown;
  memoryKey?: unknown;
  value?: unknown;
  version?: unknown;
}

const MAX_DEPTH = 3;
const MAX_COLLECTION_ITEMS = 12;
const MAX_STRING_LENGTH = 160;

@Injectable()
export class ScopedPlannerMemoryService {
  private readonly logger = new Logger(ScopedPlannerMemoryService.name);
  private readonly enabled = process.env.SCOPED_MEMORY_PROMPT_ENABLED === 'true';
  private readonly kind = process.env.SCOPED_MEMORY_PLANNER_KIND || 'planner_context';
  private readonly memoryKey = process.env.SCOPED_MEMORY_PLANNER_KEY || 'default';

  constructor(private readonly controlPlaneClient: ControlPlaneClient) {}

  async resolveForPlanning(options: {
    authToken?: string;
    user?: { userId: string; userRoles?: string[]; organizationId?: string };
  }): Promise<ScopedPlannerMemoryContext | undefined> {
    if (!this.enabled || !options.user?.userId) return undefined;

    try {
      const memory = await this.controlPlaneClient.resolveScopedMemory<StoredScopedMemory | null>(
        { kind: this.kind, memoryKey: this.memoryKey },
        options
      );
      if (
        !memory ||
        memory.scopeType !== 'user' ||
        memory.scopeId !== options.user.userId ||
        memory.kind !== this.kind ||
        memory.memoryKey !== this.memoryKey ||
        !Object.prototype.hasOwnProperty.call(memory, 'value')
      ) {
        return undefined;
      }

      return {
        kind: this.kind,
        memoryKey: this.memoryKey,
        value: sanitizeMemoryValue(memory.value),
        ...(typeof memory.version === 'number' ? { version: memory.version } : {}),
      };
    } catch (error) {
      this.logger.warn(
        `Scoped planner memory unavailable; continuing without it: ${error instanceof Error ? error.message : String(error)}`
      );
      return undefined;
    }
  }
}

function sanitizeMemoryValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_COLLECTION_ITEMS)
      .map((item) => sanitizeMemoryValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_COLLECTION_ITEMS)
        .map(([key, item]) => [key.slice(0, 64), sanitizeMemoryValue(item, depth + 1)])
    );
  }
  return String(value).slice(0, MAX_STRING_LENGTH);
}
