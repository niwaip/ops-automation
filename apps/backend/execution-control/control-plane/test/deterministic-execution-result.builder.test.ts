import { buildDeterministicExecutionResult } from '../src/modules/execution/plan-runtime/deterministic-execution-result.builder';

describe('buildDeterministicExecutionResult', () => {
  it('persists the canonical result.businessData envelope', () => {
    const finalOutputs = [
      {
        targetField: 'result',
        fromNodeId: 'n2',
        fromNodeOutput: 'summary',
        expectedType: 'string',
        isArtifact: false,
        value: 'PDF summary',
      },
    ];

    const result = buildDeterministicExecutionResult({
      executionId: 'exec-1',
      plan: { objective: '总结内容' } as any,
      finalOutputs,
      artifacts: [],
      finishedAt: new Date('2026-08-13T10:00:00.000Z'),
    });

    expect(result).toMatchObject({
      execution: {
        executionId: 'exec-1',
        status: 'success',
        finishedAt: '2026-08-13T10:00:00.000Z',
      },
      result: {
        resultType: 'deterministic_plan',
        title: '总结内容',
        summary: 'PDF summary',
        businessData: { finalOutputs },
      },
      artifacts: [],
      presentation: { chatSummary: 'PDF summary' },
    });
  });
});
