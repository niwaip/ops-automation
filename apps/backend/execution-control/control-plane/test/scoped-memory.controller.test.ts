import { UnauthorizedException } from '@nestjs/common';
import { ScopedMemoryController } from '../src/modules/experience-learning/scoped-memory.controller';

describe('ScopedMemoryController', () => {
  it('resolves planner memory using only the authenticated user scope', async () => {
    const scopedMemory = {
      resolveTrustedScope: jest.fn().mockResolvedValue({ userId: 'user-1' }),
      resolve: jest.fn().mockResolvedValue({ scopeType: 'user' }),
    };
    const controller = new ScopedMemoryController(scopedMemory as any);

    await expect(
      controller.resolve(
        { kind: 'planner_context', memoryKey: 'default' },
        { user: { id: 'user-1', username: 'user-1', role: 'employee' } } as any
      )
    ).resolves.toEqual({ scopeType: 'user' });
    expect(scopedMemory.resolveTrustedScope).toHaveBeenCalledWith({
      userId: 'user-1',
      activeOrganizationId: undefined,
    });
    expect(scopedMemory.resolve).toHaveBeenCalledWith(
      { userId: 'user-1' },
      'planner_context',
      'default'
    );
  });

  it('rejects requests without an authenticated user', async () => {
    const controller = new ScopedMemoryController({ resolve: jest.fn() } as any);
    await expect(
      controller.resolve({ kind: 'planner_context', memoryKey: 'default' }, {} as any)
    ).rejects.toThrow(UnauthorizedException);
  });

  it('upserts only an explicit memory scoped to the authenticated user', async () => {
    const scopedMemory = { upsert: jest.fn().mockResolvedValue({ version: 1 }) };
    const controller = new ScopedMemoryController(scopedMemory as any);

    await expect(
      controller.upsertOwn(
        { kind: 'planner_context', memoryKey: 'default', value: { preferredFormat: 'table' } },
        { user: { id: 'user-1', username: 'user-1', role: 'employee' } } as any
      )
    ).resolves.toEqual({ version: 1 });
    expect(scopedMemory.upsert).toHaveBeenCalledWith({
      scopeType: 'user',
      scopeId: 'user-1',
      kind: 'planner_context',
      memoryKey: 'default',
      value: { preferredFormat: 'table' },
      source: 'explicit',
    });
  });
});
