import { DeterministicReadySetService } from '../src/modules/execution/plan-runtime/deterministic-ready-set.service';

describe('DeterministicReadySetService', () => {
  const service = new DeterministicReadySetService();

  it('returns only nodes whose dependencies succeeded', () => {
    const steps = [
      { id: 's1', planNodeId: 'n1', status: 'succeeded', dependsOnJson: [] },
      { id: 's2', planNodeId: 'n2', status: 'pending', dependsOnJson: ['n1'] },
      { id: 's3', planNodeId: 'n3', status: 'pending', dependsOnJson: ['n9'] },
    ];
    expect(service.compute(steps).map((step) => step.id)).toEqual(['s2']);
  });

  it('reclaims an expired lease but not an active lease', () => {
    const now = new Date('2026-08-24T10:00:00Z');
    const steps = [
      { id: 'expired', status: 'running', leaseExpiresAt: new Date('2026-08-24T09:59:00Z') },
      { id: 'active', status: 'running', leaseExpiresAt: new Date('2026-08-24T10:01:00Z') },
    ];
    expect(service.compute(steps, undefined, now).map((step) => step.id)).toEqual(['expired']);
  });

  it('parallelizes only read-only nodes with distinct idempotency scopes', () => {
    const ready = [
      { id: 's1', planNodeId: 'n1', status: 'pending', idempotencyKey: 'one' },
      { id: 's2', planNodeId: 'n2', status: 'pending', idempotencyKey: 'two' },
      { id: 's3', planNodeId: 'n3', status: 'pending', idempotencyKey: 'three' },
    ];
    const plan = {
      nodes: [
        { nodeId: 'n1', sideEffectClass: 'read' },
        { nodeId: 'n2', sideEffectClass: 'none' },
        { nodeId: 'n3', sideEffectClass: 'external_write' },
      ],
    };
    expect(service.selectSafeParallelBatch(ready, plan).map((step) => step.id)).toEqual([
      's1',
      's2',
    ]);
  });

  it('falls back to one node when metadata is insufficient', () => {
    const ready = [
      { id: 's1', planNodeId: 'n1', status: 'pending' },
      { id: 's2', planNodeId: 'n2', status: 'pending' },
    ];
    expect(service.selectSafeParallelBatch(ready, { nodes: [] })).toEqual([ready[0]]);
  });
});
