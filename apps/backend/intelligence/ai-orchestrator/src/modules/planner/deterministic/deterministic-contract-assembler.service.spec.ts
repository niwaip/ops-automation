import type { CompactCapabilityCardV1, RequiredUserInputV1 } from '@ops/backend-deterministic-plan';
import { DeterministicContractAssemblerService } from './deterministic-contract-assembler.service';

describe('DeterministicContractAssemblerService', () => {
  const card = {
    id: 'search',
    kind: 'skill',
    displayName: '网页搜索',
    summary: '搜索网页',
    goals: ['search'],
    inputs: { query: 'string' },
    outputs: { result: 'string' },
    category: 'workflow',
  } as CompactCapabilityCardV1;

  it('maps a required input by the exact topology ref without parsing underscores', () => {
    const assembler = new DeterministicContractAssemblerService();
    const requiredInput = {
      targetField: 'query',
      nodeId: 'phase_1',
      prompt: '请输入查询内容',
      missing: true,
    } as RequiredUserInputV1;

    const plan = assembler.assemblePlan(
      {
        schemaVersion: 'deterministic-topology/v1',
        objective: '搜索网页',
        matchDecision: 'matched',
        matchConfidence: 1,
        matchReason: 'matched',
        nodes: [{ ref: 'phase_1', capabilityKey: 's0', dependsOn: [] }],
        finalNodeRef: 'phase_1',
        finalOutputKind: 'value',
      },
      {
        nodeBindings: {
          phase_1: { query: { source: 'user_input', path: 'planInputs.phase_1.query' } },
        },
        planInputs: { phase_1: {} },
        requiredUserInputs: [requiredInput],
      },
      new Map([['s0', card]])
    );

    expect(plan.requiredUserInputs?.[0]?.nodeId).toBe('phase_1_网页搜索');
  });

  it('marks a branching topology as a DAG', () => {
    const assembler = new DeterministicContractAssemblerService();
    const plan = assembler.assemblePlan(
      {
        schemaVersion: 'deterministic-topology/v1',
        objective: '并行搜索',
        matchDecision: 'matched',
        matchConfidence: 1,
        matchReason: 'matched',
        nodes: [
          { ref: 'n1', capabilityKey: 's0', dependsOn: [] },
          { ref: 'n2', capabilityKey: 's0', dependsOn: [] },
        ],
        finalNodeRef: 'n2',
        finalOutputKind: 'value',
      },
      { nodeBindings: { n1: {}, n2: {} }, planInputs: { n1: {}, n2: {} }, requiredUserInputs: [] },
      new Map([['s0', card]])
    );

    expect(plan.planType).toBe('dag');
  });

  it('rejects a capability without an authoritative output contract', () => {
    const assembler = new DeterministicContractAssemblerService();
    const missingOutputCard = { ...card, outputs: {} };

    expect(() =>
      assembler.assemblePlan(
        {
          schemaVersion: 'deterministic-topology/v1',
          objective: '执行能力',
          matchDecision: 'matched',
          matchConfidence: 1,
          matchReason: 'matched',
          nodes: [{ ref: 'n1', capabilityKey: 's0', dependsOn: [] }],
          finalNodeRef: 'n1',
          finalOutputKind: 'value',
        },
        { nodeBindings: { n1: {} }, planInputs: { n1: {} }, requiredUserInputs: [] },
        new Map([['s0', missingOutputCard]])
      )
    ).toThrow(expect.objectContaining({ code: 'CAPABILITY_CONTRACT_MISSING' }));
  });
});
