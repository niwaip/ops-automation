import {
  ExecutionEventService,
  ExecutionStreamEventPayload,
} from '../src/modules/execution/state/execution-event.service';
import { EXECUTION_EVENT_TYPE } from '../src/modules/execution';
import { ExecutionStreamService } from '../src/modules/execution/lifecycle/execution-stream.service';

describe('ExecutionStreamService', () => {
  it('filters subscription by executionId and emits events with typed eventType', async () => {
    const mockedEventService = {
      createEvent: jest.fn(
        async (
          executionId: string,
          eventType: string,
          payload: any
        ): Promise<ExecutionStreamEventPayload> => ({
          eventId: `${executionId}-${eventType}`,
          executionId,
          eventType: eventType as any,
          payload,
          timestamp: new Date().toISOString(),
        })
      ),
      listEventsAfter: jest.fn(),
    } as unknown as ExecutionEventService;

    const service = new ExecutionStreamService(mockedEventService);
    const received: ExecutionStreamEventPayload[] = [];

    const sub = service.subscribeToEvents('execution-1', (event) => {
      received.push(event);
    });

    await service.createEvent('execution-2', EXECUTION_EVENT_TYPE.EXECUTION_CREATED, {
      ok: false,
    });
    await service.createEvent('execution-1', EXECUTION_EVENT_TYPE.EXECUTION_CREATED, {
      ok: true,
    });

    sub.unsubscribe();

    expect(received).toHaveLength(1);
    expect(received[0].executionId).toBe('execution-1');
    expect(received[0].eventType).toBe(EXECUTION_EVENT_TYPE.EXECUTION_CREATED);
    expect(received[0].payload).toEqual({ ok: true });
  });

  it('delivers terminal events persisted by another process', async () => {
    const terminalEvent: ExecutionStreamEventPayload = {
      eventId: 'event-terminal',
      executionId: 'execution-1',
      eventType: EXECUTION_EVENT_TYPE.EXECUTION_STATUS_CHANGED,
      payload: { newStatus: 'succeeded' },
      timestamp: '2026-08-25T10:00:00.000Z',
    };
    const eventService = {
      createEvent: jest.fn(),
      listEventsAfter: jest.fn().mockResolvedValueOnce([terminalEvent]),
    } as unknown as ExecutionEventService;
    const service = new ExecutionStreamService(eventService);
    const received: ExecutionStreamEventPayload[] = [];

    const subscription = service.subscribeToDurableEvents(
      'execution-1',
      (event) => {
        received.push(event);
        return false;
      },
      1,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    subscription.unsubscribe();

    expect(received).toEqual([terminalEvent]);
  });
});
