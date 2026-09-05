import { CompletionClaimSynthesizerService } from '../src/modules/execution/plan-runtime/completion-claim-synthesizer.service';

describe('CompletionClaimSynthesizerService', () => {
  const prisma = {
    executionCompletionClaim: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    executionArtifact: { findFirst: jest.fn() },
  } as any;
  const service = new CompletionClaimSynthesizerService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('synthesizes a schema-backed claim only for meaningful contract output', async () => {
    const claims = await service.synthesizeForStep({
      executionId: 'e1',
      step: { id: 's1', planNodeId: 'n1', outputSchemaJson: { type: 'object' } },
      output: { text: '正文' },
      plan: {
        completionClaims: [
          { claim: 'webpage_content_extracted', producerNodeId: 'n1', evidenceType: 'schema' },
        ],
      },
    });

    expect(claims).toEqual(['webpage_content_extracted']);
    expect(prisma.executionCompletionClaim.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not synthesize provider success without an authoritative receipt', async () => {
    const claims = await service.synthesizeForStep({
      executionId: 'e1',
      step: { id: 's1', planNodeId: 'n1' },
      output: { status: 'ok' },
      plan: {
        completionClaims: [
          { claim: 'message_delivered', producerNodeId: 'n1', evidenceType: 'provider_receipt' },
        ],
      },
    });

    expect(claims).toEqual([]);
    expect(prisma.executionCompletionClaim.upsert).not.toHaveBeenCalled();
  });

  it('reports required claims missing at terminal validation', async () => {
    prisma.executionCompletionClaim.findMany.mockResolvedValue([]);
    await expect(
      service.assertRequiredClaims('e1', {
        completionClaims: [
          { claim: 'summary_generated', producerNodeId: 'n2', evidenceType: 'schema' },
        ],
      }),
    ).resolves.toEqual({ satisfied: false, missing: ['summary_generated'] });
  });
});
