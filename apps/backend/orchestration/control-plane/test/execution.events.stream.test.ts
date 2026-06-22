import {
  ExecutionEventService,
  ExecutionStreamEventPayload,
} from '../src/modules/execution/state/execution-event.service';
import { EXECUTION_EVENT_TYPE } from '../src/modules/execution';
import { ExecutionService } from '../src/modules/execution/execution.service';

describe('ExecutionService event stream', () => {
  it('filters subscription by executionId and emits events with typed eventType', async () => {
    const prisma = {
      executionEvent: { create: jest.fn() },
    };

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

    const service = new ExecutionService(prisma as never, mockedEventService);
    const received: ExecutionStreamEventPayload[] = [];

    const sub = service.subscribeToEvents('execution-1', (event) => {
      received.push(event);
    });

    await (service as any).createEvent('execution-2', EXECUTION_EVENT_TYPE.EXECUTION_CREATED, {
      ok: false,
    });
    await (service as any).createEvent('execution-1', EXECUTION_EVENT_TYPE.EXECUTION_CREATED, {
      ok: true,
    });

    sub.unsubscribe();

    expect(received).toHaveLength(1);
    expect(received[0].executionId).toBe('execution-1');
    expect(received[0].eventType).toBe(EXECUTION_EVENT_TYPE.EXECUTION_CREATED);
    expect(received[0].payload).toEqual({ ok: true });
  });
});
