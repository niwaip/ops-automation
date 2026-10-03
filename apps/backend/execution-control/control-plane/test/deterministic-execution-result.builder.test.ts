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

  it('filters out raw DOM dump noise from mock ERP and falls back to objective', () => {
    const rawErpNoise = `0\n\n4\n\n24.3%\n\n### ショートカット & 操作ガイド\n\n1. 左メニューまたは下のリンクから 「案件承認管理」 に移動してください。\n\n案件コード | 案件名 | 顧客名 | 受注金額 | 毛利率 | ステータス | 操作\n案件データが見つかりません\n\n### 自動承認フィルター設定`;

    const finalOutputs = [
      {
        targetField: 'result',
        fromNodeId: 'n1',
        fromNodeOutput: 'text',
        expectedType: 'string',
        isArtifact: false,
        value: rawErpNoise,
      },
    ];

    const result = buildDeterministicExecutionResult({
      executionId: 'exec-2',
      plan: { objective: '自动审批案件并在低毛利时转人工处理' } as any,
      finalOutputs,
      artifacts: [],
    });

    expect(result.result).toMatchObject({
      title: '自动审批案件并在低毛利时转人工处理',
      summary: '已完成执行：“自动审批案件并在低毛利时转人工处理”',
    });
    expect((result as any).presentation?.chatSummary).toBe('已完成执行：“自动审批案件并在低毛利时转人工处理”');
    expect((result as any).presentation?.chatSummary).not.toContain('ショートカット & 操作ガイド');
  });
});
