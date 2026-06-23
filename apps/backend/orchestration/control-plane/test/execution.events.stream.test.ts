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
          executionId,
          eventType: eventType as any,
          payload,
          timestamp: new Date().toISOString(),
        })
      ),
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
});
