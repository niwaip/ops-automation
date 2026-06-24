import { Injectable } from '@nestjs/common';
import { Subject, filter } from 'rxjs';
import { EXECUTION_EVENT_TYPE } from '../contracts/execution-event-type';
import {
  CreateExecutionEventOptions,
  ExecutionEventService,
  ExecutionStreamEventPayload,
} from '../state/execution-event.service';

type ExecutionEventType = (typeof EXECUTION_EVENT_TYPE)[keyof typeof EXECUTION_EVENT_TYPE];

@Injectable()
export class ExecutionStreamService {
  private readonly eventSubject = new Subject<ExecutionStreamEventPayload>();

  constructor(private readonly executionEventService: ExecutionEventService) {}

  subscribeToEvents(executionId: string, callback: (event: ExecutionStreamEventPayload) => void) {
    return this.eventSubject.pipe(filter((event) => event.executionId === executionId)).subscribe(callback);
  }

  async createEvent(
    executionId: string,
    eventType: ExecutionEventType,
    payload: unknown,
    options: CreateExecutionEventOptions = {}
  ): Promise<void> {
    const event = await this.executionEventService.createEvent(executionId, eventType, payload, options);
    this.publishEvent(event);
  }

  publishEvent(event: ExecutionStreamEventPayload): void {
    this.eventSubject.next(event);
  }
}
