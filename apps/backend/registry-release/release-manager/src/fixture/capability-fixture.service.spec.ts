import { CapabilityFixtureService } from './capability-fixture.service';

describe('CapabilityFixtureService', () => {
  let service: CapabilityFixtureService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    service = new CapabilityFixtureService(mockPrisma);
  });

  describe('reconcileOutputSchemaWithEvidence', () => {
    it('reconciles 2D array schema to 1D string array when runtime evidence is a flat string array', () => {
      const outputSchema = {
        type: 'object',
        properties: {
          messageIds: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'object' },
            },
            description: '已成功写入 GTD 收件箱的邮件 messageId 列表',
          },
        },
      };

      const expectedOutput = {
        messageIds: ['mail_sample_001'],
      };

      const draftPayload = {
        outputSchema: { ...outputSchema },
      };

      const reconciled = (service as any).reconcileOutputSchemaWithEvidence(
        outputSchema,
        expectedOutput,
        draftPayload
      );

      expect(reconciled.properties.messageIds.items).toEqual({ type: 'string' });
      expect((draftPayload.outputSchema as any).properties.messageIds.items).toEqual({
        type: 'string',
      });
    });

    it('leaves valid non-nested schemas unchanged', () => {
      const outputSchema = {
        type: 'object',
        properties: {
          inboxItems: {
            type: 'array',
            items: { type: 'object' },
          },
          markedReadCount: {
            type: 'integer',
          },
        },
      };

      const expectedOutput = {
        inboxItems: [{ id: '1' }],
        markedReadCount: 1,
      };

      const reconciled = (service as any).reconcileOutputSchemaWithEvidence(
        outputSchema,
        expectedOutput
      );

      expect(reconciled).toEqual(outputSchema);
    });
  });
});
