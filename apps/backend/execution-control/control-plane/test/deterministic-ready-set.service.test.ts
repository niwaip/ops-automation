import { DeterministicReadySetService } from '../src/modules/execution/plan-runtime/deterministic-ready-set.service';

describe('DeterministicReadySetService terminal dependencies', () => {
  it('unblocks an explicit terminal report after a continue-policy browser failure', () => {
    const ready = new DeterministicReadySetService().compute([
      { id: 'browser', planNodeId: 'browser_recording', status: 'failed' },
      { id: 'report', planNodeId: 'report', status: 'pending', dependsOnJson: ['browser_recording'] },
    ], {
      nodes: [
        { nodeId: 'browser_recording', failurePolicy: 'continue' },
        { nodeId: 'report', failurePolicy: 'abort' },
      ],
    });
    expect(ready.map((step) => step.id)).toEqual(['report']);
  });
});
