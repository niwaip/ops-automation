import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionEventType } from './contracts/execution-event-type';

export interface CreateExecutionEventOptions {
  runtimeSessionId?: string;
  stepId?: string;
  eventSource?: string;
}

export interface ExecutionStreamEventPayload {
  executionId: string;
  eventType: ExecutionEventType;
  payload: any;
  timestamp: string;
}

@Injectable()
export class ExecutionEventService {
  constructor(private readonly prisma: PrismaService) {}

  async createEvent(
    executionId: string,
    eventType: ExecutionEventType,
    payload: any,
    options: CreateExecutionEventOptions = {},
  ): Promise<ExecutionStreamEventPayload> {
    const timestamp = new Date().toISOString();

    await this.prisma.executionEvent.create({
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
      executionId,
      eventType,
      payload,
      timestamp,
    };
  }
}
