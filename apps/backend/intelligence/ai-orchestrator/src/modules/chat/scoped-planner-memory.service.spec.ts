import { ControlPlaneClient } from '../../client/control-plane.client';
import { ScopedPlannerMemoryService } from './scoped-planner-memory.service';

describe('ScopedPlannerMemoryService', () => {
  const originalFlag = process.env.SCOPED_MEMORY_PROMPT_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.SCOPED_MEMORY_PROMPT_ENABLED;
    else process.env.SCOPED_MEMORY_PROMPT_ENABLED = originalFlag;
    jest.restoreAllMocks();
  });

  it('does not fetch memory while the feature flag is disabled', async () => {
    delete process.env.SCOPED_MEMORY_PROMPT_ENABLED;
    const client = { resolveScopedMemory: jest.fn() };
    const service = new ScopedPlannerMemoryService(client as unknown as ControlPlaneClient);

    await expect(
      service.resolveForPlanning({ user: { userId: 'user-1', userRoles: ['employee'] } })
    ).resolves.toBeUndefined();
    expect(client.resolveScopedMemory).not.toHaveBeenCalled();
  });

  it('uses only the resolved caller user scope and bounds prompt content', async () => {
    process.env.SCOPED_MEMORY_PROMPT_ENABLED = 'true';
    const client = {
      resolveScopedMemory: jest.fn().mockResolvedValue({
        scopeType: 'user',
        scopeId: 'user-1',
        kind: 'planner_context',
        memoryKey: 'default',
        version: 3,
        value: {
          preferredFormat: 'table',
          oversized: 'x'.repeat(300),
          nested: { a: { b: { c: { d: 'hidden beyond bounded depth' } } } },
        },
      }),
    };
    const service = new ScopedPlannerMemoryService(client as unknown as ControlPlaneClient);

    await expect(
      service.resolveForPlanning({
        authToken: 'Bearer token',
        user: { userId: 'user-1', userRoles: ['employee'] },
      })
    ).resolves.toEqual({
      kind: 'planner_context',
      memoryKey: 'default',
      version: 3,
      value: {
        preferredFormat: 'table',
        oversized: 'x'.repeat(160),
        nested: { a: { b: '[truncated]' } },
      },
    });
    expect(client.resolveScopedMemory).toHaveBeenCalledWith(
      { kind: 'planner_context', memoryKey: 'default' },
      { authToken: 'Bearer token', user: { userId: 'user-1', userRoles: ['employee'] } }
    );
  });

  it('does not accept a response whose scope does not belong to the caller', async () => {
    process.env.SCOPED_MEMORY_PROMPT_ENABLED = 'true';
    const client = {
      resolveScopedMemory: jest.fn().mockResolvedValue({
        scopeType: 'organization',
        scopeId: 'org-1',
        kind: 'planner_context',
        memoryKey: 'default',
        value: { shouldNot: 'reach prompt' },
      }),
    };
    const service = new ScopedPlannerMemoryService(client as unknown as ControlPlaneClient);

    await expect(
      service.resolveForPlanning({ user: { userId: 'user-1' } })
    ).resolves.toBeUndefined();
  });
});
