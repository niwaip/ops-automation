import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExecutionStateService } from '../src/modules/execution/execution-state.service';

describe('ExecutionStateService', () => {
  const createService = () => {
    const prisma = {
      execution: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const executionEventService = {
      createEvent: jest.fn(),
    };

    const service = new ExecutionStateService(prisma as never, executionEventService as never);

    return { service, prisma, executionEventService };
  };

  it('updates execution status and emits a status_changed event', async () => {
    const { service, prisma, executionEventService } = createService();

    prisma.execution.findUnique.mockResolvedValue({
      id: 'execution-1',
      status: 'queued',
      startedAt: null,
      endedAt: null,
    });
    prisma.execution.update.mockResolvedValue(undefined);
    executionEventService.createEvent.mockResolvedValue({
      executionId: 'execution-1',
      eventType: 'execution.status_changed',
      payload: { oldStatus: 'queued', newStatus: 'running' },
      timestamp: '2026-05-01T00:00:00.000Z',
    });

    const event = await service.updateStatus('execution-1', 'running');

    expect(prisma.execution.update).toHaveBeenCalledWith({
      where: { id: 'execution-1' },
      data: {
        status: 'running',
        startedAt: expect.any(Date),
        endedAt: null,
      },
    });
    expect(executionEventService.createEvent).toHaveBeenCalledWith(
      'execution-1',
      'execution.status_changed',
      {
        oldStatus: 'queued',
        newStatus: 'running',
      }
    );
    expect(event.eventType).toBe('execution.status_changed');
  });

  it('rejects invalid status transitions', async () => {
    const { service, prisma } = createService();

    prisma.execution.findUnique.mockResolvedValue({
      id: 'execution-2',
      status: 'succeeded',
      startedAt: new Date(),
      endedAt: new Date(),
    });

    await expect(service.updateStatus('execution-2', 'running')).rejects.toThrow(
      BadRequestException
    );
    await expect(service.updateStatus('execution-2', 'running')).rejects.toThrow(
      'Invalid transition from succeeded to running'
    );
  });

  it('throws when execution does not exist', async () => {
    const { service, prisma } = createService();

    prisma.execution.findUnique.mockResolvedValue(null);

    await expect(service.updateStatus('missing', 'running')).rejects.toThrow(NotFoundException);
    await expect(service.updateStatus('missing', 'running')).rejects.toThrow(
      'Execution missing not found'
    );
  });
});
