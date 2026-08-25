import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(ExecutionStreamService.name);
  private readonly eventSubject = new Subject<ExecutionStreamEventPayload>();

  constructor(private readonly executionEventService: ExecutionEventService) {}

  subscribeToEvents(executionId: string, callback: (event: ExecutionStreamEventPayload) => void) {
    return this.eventSubject.pipe(filter((event) => event.executionId === executionId)).subscribe(callback);
  }

  /**
   * Cross-process stream backed by the append-only execution_events table.
   * The cursor makes reconnect/replay deterministic; polling avoids relying on
   * process-local Subjects when API and dispatcher run in separate containers.
   */
  subscribeToDurableEvents(
    executionId: string,
    callback: (event: ExecutionStreamEventPayload) => void | false,
    pollIntervalMs = 500,
  ): { unsubscribe: () => void } {
    let active = true;
    let timer: NodeJS.Timeout | undefined;
    let cursor: { timestamp: string; eventId: string } | undefined;

    const schedule = () => {
      if (!active) return;
      timer = setTimeout(pump, pollIntervalMs);
    };
    const pump = async (): Promise<void> => {
      if (!active) return;
      try {
        const events = await this.executionEventService.listEventsAfter(
          executionId,
          cursor,
          100,
        );
        for (const event of events) {
          cursor = { timestamp: event.timestamp, eventId: event.eventId };
          if (callback(event) === false) {
            active = false;
            return;
          }
        }
        if (events.length === 100) {
          void pump();
          return;
        }
      } catch (error: any) {
        this.logger.warn(
          `Unable to poll persisted events for execution ${executionId}: ${error?.message || String(error)}`,
        );
      }
      schedule();
    };

    void pump();
    return {
      unsubscribe: () => {
        active = false;
        if (timer) clearTimeout(timer);
      },
    };
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
