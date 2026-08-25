import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionEventType } from '../contracts/execution-event-type';

export interface CreateExecutionEventOptions {
  runtimeSessionId?: string;
  stepId?: string;
  eventSource?: string;
}

export interface ExecutionStreamEventPayload {
  eventId: string;
  executionId: string;
  eventType: ExecutionEventType;
  payload: any;
  timestamp: string;
}

export interface ExecutionEventCursor {
  timestamp: string;
  eventId: string;
}

@Injectable()
export class ExecutionEventService {
  constructor(private readonly prisma: PrismaService) {}

  async createEvent(
    executionId: string,
    eventType: ExecutionEventType,
    payload: any,
    options: CreateExecutionEventOptions = {}
  ): Promise<ExecutionStreamEventPayload> {
    const event = await this.prisma.executionEvent.create({
      data: {
        executionId,
        runtimeSessionId: options.runtimeSessionId,
        stepId: options.stepId,
        eventType,
        eventSource: options.eventSource || 'control-plane',
        payloadJson: payload as never,
      },
    });

    return {
      // Prisma always returns the created row. The fallback keeps lightweight
      // persistence adapters/test doubles compatible without weakening the
      // durable replay path, which reads the authoritative database id.
      eventId: event?.id || `${executionId}:${eventType}:${Date.now()}`,
      executionId,
      eventType,
      payload,
      timestamp: event?.createdAt?.toISOString?.() || new Date().toISOString(),
    };
  }

  async listEventsAfter(
    executionId: string,
    cursor?: ExecutionEventCursor,
    limit = 100,
  ): Promise<ExecutionStreamEventPayload[]> {
    const rows = await this.prisma.executionEvent.findMany({
      where: {
        executionId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: new Date(cursor.timestamp) } },
                { createdAt: new Date(cursor.timestamp), id: { gt: cursor.eventId } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(Math.trunc(limit), 1), 500),
    });

    return rows.map((row) => ({
      eventId: row.id,
      executionId: row.executionId,
      eventType: row.eventType as ExecutionEventType,
      payload: row.payloadJson,
      timestamp: row.createdAt.toISOString(),
    }));
  }
}
