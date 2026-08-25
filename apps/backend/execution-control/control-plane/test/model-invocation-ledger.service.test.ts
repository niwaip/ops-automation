import { ModelInvocationLedgerService } from '../src/modules/experience-learning/model-invocation-ledger.service';

describe('ModelInvocationLedgerService', () => {
  const input = {
    executionId: '11111111-1111-4111-8111-111111111111',
    purpose: 'topology' as const,
    provider: 'openai',
    modelId: 'model-1',
    promptTemplateVersion: 'topology/v1',
    promptTemplateDigest: 'a'.repeat(64),
    systemPromptDigest: 'b'.repeat(64),
    generationParameters: { temperature: 0 },
    inputRefs: [{ type: 'request', digest: 'c'.repeat(64) }],
    inputTokens: 100,
    outputTokens: 20,
    cachedTokens: 80,
  };

  it('stores prompt snapshot and usage in one transaction', async () => {
    const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const service = new ModelInvocationLedgerService(prisma as any);
    const result = await service.record('22222222-2222-4222-8222-222222222222', input);
    expect(result).toEqual({
      id: expect.any(String),
      promptSnapshotId: expect.any(String),
    });
    expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('checks ownership before returning the execution ledger', async () => {
    const prisma = {
      execution: { findUnique: jest.fn().mockResolvedValue({ createdBy: 'user-1' }) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ purpose: 'topology' }]),
    };
    const service = new ModelInvocationLedgerService(prisma as any);
    await expect(service.listForExecution(input.executionId, { id: 'user-1' })).resolves.toEqual([
      { purpose: 'topology' },
    ]);
  });

  it('attaches only owner and trace-correlated pre-execution calls', async () => {
    const tx = { $executeRawUnsafe: jest.fn().mockResolvedValue(2) };
    const prisma = {
      execution: { findFirst: jest.fn().mockResolvedValue({ id: input.executionId }) },
      $transaction: jest.fn((fn) => fn(tx)),
    };
    const service = new ModelInvocationLedgerService(prisma as any);
    await expect(service.attachTrace('user-1', 'trace-1', input.executionId)).resolves.toEqual({
      attached: 2,
    });
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('execution_id IS NULL'),
      input.executionId,
      'user-1',
      'trace-1'
    );
  });
});
