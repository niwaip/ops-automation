import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import { DeterministicTopologyValidatorService } from './deterministic-topology-validator.service';

describe('DeterministicTopologyValidatorService', () => {
  const operationCard = {
    id: 'summarize_list',
    kind: 'llm_operation',
    displayName: '列表摘要',
  } as CompactCapabilityCardV1;
  const topology = {
    schemaVersion: 'deterministic-topology/v1',
    objective: '总结上一次结果',
    matchDecision: 'matched',
    matchConfidence: 0.95,
    matchReason: '已有可信输入且列表摘要能力覆盖目标',
    nodes: [{ ref: 'n1', capabilityKey: 'o0', dependsOn: [] }],
    finalNodeRef: 'n1',
    finalOutputKind: 'value',
  };

  it('accepts an operation-only topology in an explicitly allowed planning context', () => {
    const result = new DeterministicTopologyValidatorService().validateTopology(
      topology,
      new Map([['o0', operationCard]]),
      [],
      { allowOperationOnly: true },
    );

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects an operation-only topology when its planning context does not allow one', () => {
    const result = new DeterministicTopologyValidatorService().validateTopology(
      topology,
      new Map([['o0', operationCard]]),
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Operation-only topology is not allowed in this planning context',
    );
  });

  it('rejects a topology with more than three LLM transformations', () => {
    const result = new DeterministicTopologyValidatorService().validateTopology(
      {
        ...topology,
        nodes: [
          { ref: 'n1', capabilityKey: 'o0', dependsOn: [] },
          { ref: 'n2', capabilityKey: 'o0', dependsOn: ['n1'] },
          { ref: 'n3', capabilityKey: 'o0', dependsOn: ['n2'] },
          { ref: 'n4', capabilityKey: 'o0', dependsOn: ['n3'] },
        ],
        finalNodeRef: 'n4',
      },
      new Map([['o0', operationCard]]),
      [],
      { allowOperationOnly: true },
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('LLM operation node count exceeds maximum 3 (got 4)');
  });
});
