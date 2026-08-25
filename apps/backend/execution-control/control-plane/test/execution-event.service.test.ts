import { ExecutionEventService } from '../src/modules/execution/state/execution-event.service';
import { EXECUTION_EVENT_TYPE } from '../src/modules/execution';

describe('ExecutionEventService', () => {
  const createService = () => {
    const prisma = {
      executionEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const service = new ExecutionEventService(prisma as never);
    return { service, prisma };
  };

  it('persists an execution event with default source and returns a stream payload', async () => {
    const { service, prisma } = createService();
    prisma.executionEvent.create.mockResolvedValue({
      id: 'event-1',
      createdAt: new Date('2026-08-25T10:00:00.000Z'),
    });

    const payload = { hello: 'world' };
    const event = await service.createEvent(
      'execution-1',
      EXECUTION_EVENT_TYPE.EXECUTION_CREATED,
      payload
    );

    expect(prisma.executionEvent.create).toHaveBeenCalledWith({
      data: {
        executionId: 'execution-1',
        runtimeSessionId: undefined,
        stepId: undefined,
        eventType: EXECUTION_EVENT_TYPE.EXECUTION_CREATED,
        eventSource: 'control-plane',
        payloadJson: payload,
      },
    });
    expect(event.executionId).toBe('execution-1');
    expect(event.eventId).toBe('event-1');
    expect(event.eventType).toBe(EXECUTION_EVENT_TYPE.EXECUTION_CREATED);
    expect(event.payload).toBe(payload);
    expect(typeof event.timestamp).toBe('string');
  });

  it('persists optional runtimeSessionId, stepId, and custom event source', async () => {
    const { service, prisma } = createService();
    prisma.executionEvent.create.mockResolvedValue({
      id: 'event-2',
      createdAt: new Date('2026-08-25T10:00:00.000Z'),
    });

    await service.createEvent(
      'execution-2',
      EXECUTION_EVENT_TYPE.STEP_STARTED,
      { action: 'goto' },
      {
        runtimeSessionId: 'runtime-1',
        stepId: 'step-1',
        eventSource: 'planner',
      }
    );

    expect(prisma.executionEvent.create).toHaveBeenCalledWith({
      data: {
        executionId: 'execution-2',
        runtimeSessionId: 'runtime-1',
        stepId: 'step-1',
        eventType: EXECUTION_EVENT_TYPE.STEP_STARTED,
        eventSource: 'planner',
        payloadJson: { action: 'goto' },
      },
    });
  });

  it('replays persisted events after a stable timestamp/id cursor', async () => {
    const { service, prisma } = createService();
    prisma.executionEvent.findMany.mockResolvedValue([
      {
        id: 'event-2',
        executionId: 'execution-1',
        eventType: EXECUTION_EVENT_TYPE.EXECUTION_STATUS_CHANGED,
        payloadJson: { newStatus: 'succeeded' },
        createdAt: new Date('2026-08-25T10:00:01.000Z'),
      },
    ]);

    const events = await service.listEventsAfter('execution-1', {
      timestamp: '2026-08-25T10:00:00.000Z',
      eventId: 'event-1',
    });

    expect(prisma.executionEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ executionId: 'execution-1' }),
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(events[0]).toEqual(
      expect.objectContaining({ eventId: 'event-2', payload: { newStatus: 'succeeded' } }),
    );
  });
});
