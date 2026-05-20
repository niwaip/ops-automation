import { BadRequestException } from '@nestjs/common';
import { RuntimeSessionService } from '../src/modules/runtime-session/runtime-session.service';

describe('RuntimeSessionService', () => {
  const createdAt = new Date('2026-05-16T00:00:00.000Z');
  const updatedAt = new Date('2026-05-16T00:00:01.000Z');

  const buildRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'runtime-session-1',
    executionId: 'execution-1',
    runtimeType: 'browser',
    workerId: null,
    profileId: 'user-1',
    state: 'allocating',
    controlMode: 'AGENT_RUNNING',
    connectionInfoJson: null,
    healthStatus: null,
    freezeReason: null,
    lastActivityAt: createdAt,
    createdAt,
    updatedAt,
    closedAt: null,
    ...overrides,
  });

  it('allocates the browser worker using runtimeSession.id and updates the session', async () => {
    const createRecord = buildRecord();
    const readyRecord = buildRecord({
      workerId: 'worker-1',
      state: 'ready',
      connectionInfoJson: { novnc: 'http://localhost:8080/vnc.html' },
      lastActivityAt: updatedAt,
    });

    const prisma = {
      runtimeSession: {
        create: jest.fn().mockResolvedValue(createRecord),
        update: jest.fn().mockResolvedValue(readyRecord),
        delete: jest.fn(),
      },
    };
    const allocationService = {
      allocateWorker: jest.fn().mockResolvedValue({
        worker_id: 'worker-1',
        endpoints: { novnc: 'http://localhost:8080/vnc.html' },
      }),
    };
    const freezeService = {
      syncRuntimeControlState: jest.fn().mockResolvedValue(undefined),
    };

    const service = new RuntimeSessionService(
      prisma as never,
      allocationService as never,
      freezeService as never,
    );

    const result = await service.create({
      executionId: 'execution-1',
      runtimeType: 'browser',
      userId: 'user-1',
    });

    expect(allocationService.allocateWorker).toHaveBeenCalledWith('runtime-session-1', 'user-1');
    expect(prisma.runtimeSession.update).toHaveBeenCalledWith({
      where: { id: 'runtime-session-1' },
      data: expect.objectContaining({
        workerId: 'worker-1',
        state: 'ready',
      }),
    });
    expect(freezeService.syncRuntimeControlState).toHaveBeenCalledWith(
      'runtime-session-1',
      'ready',
      'AGENT_RUNNING',
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'runtime-session-1',
        workerId: 'worker-1',
        state: 'ready',
      }),
    );
  });

  it('deletes the allocating session when worker allocation fails', async () => {
    const prisma = {
      runtimeSession: {
        create: jest.fn().mockResolvedValue(buildRecord()),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    };
    const allocationService = {
      allocateWorker: jest.fn().mockResolvedValue(null),
    };
    const freezeService = {
      syncRuntimeControlState: jest.fn(),
    };

    const service = new RuntimeSessionService(
      prisma as never,
      allocationService as never,
      freezeService as never,
    );

    await expect(
      service.create({
        executionId: 'execution-1',
        runtimeType: 'browser',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.runtimeSession.delete).toHaveBeenCalledWith({
      where: { id: 'runtime-session-1' },
    });
    expect(prisma.runtimeSession.update).not.toHaveBeenCalled();
    expect(freezeService.syncRuntimeControlState).not.toHaveBeenCalled();
  });
});
