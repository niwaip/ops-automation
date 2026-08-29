import { CapabilityReleaseTemporalSchemaService } from '../../../registry-release/release-manager/src/compiler/capability-release-temporal-schema.service';
import { CapabilityReleasePublishValidatorService } from '../../../registry-release/release-manager/src/validator/capability-release-publish-validator.service';
import { ContractLintService } from '../../../registry-release/release-manager/src/validator/contract-lint.service';
import { SchemaCompatibilityService } from '../../../registry-release/release-manager/src/validator/schema-compatibility.service';

describe('Capability publish contract authority', () => {
  const oldSchema = {
    type: 'object',
    properties: { result: { type: 'object' } },
    required: ['result'],
    additionalProperties: false,
  };

  const createService = () => {
    const skillService = {
      validateSkillToolsPayload: jest.fn().mockResolvedValue({
        isValid: true,
        declaredTools: [],
        inferredTools: [],
        effectiveTools: [],
        missingTools: [],
        disabledTools: [],
        forbiddenSkillTools: [],
        undeclaredFlowTools: [],
        messages: [],
      }),
    };
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ output_schema: oldSchema }]),
    };
    const temporalSchemaService = new CapabilityReleaseTemporalSchemaService();
    const service = new CapabilityReleasePublishValidatorService(
      skillService as any,
      prisma as any,
      {} as any,
      {} as any,
      temporalSchemaService,
      new SchemaCompatibilityService(),
      new ContractLintService()
    );
    return { service, prisma };
  };

  const release = {
    id: 'release-1',
    sourceType: 'temporal_workflow',
    sourceId: '223f38cb-ed7f-4651-b5fd-d2a341213948',
    sourceName: '查询全网热榜',
  } as any;

  const snapshot = {
    sourcePayload: {
      outputParams: {
        result: {
          description: '完整响应；弱声明没有显式类型',
        },
      },
    },
  } as any;

  it('compares the normalized publish artifact instead of weak snapshot inference', async () => {
    const { service, prisma } = createService();
    const draft = {
      name: '查询全网热榜',
      tools: [],
      executionFlowTemplateIds: [],
      draftPayload: {
        name: '查询全网热榜',
        tools: [],
        outputSchema: oldSchema,
      },
    } as any;

    const result = await service.validatePublishDraft(release, draft, snapshot);

    expect(result.blocker).toBeUndefined();
    expect(result.compatibility).toEqual(
      expect.objectContaining({ compatible: true, classification: 'identical' })
    );
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('JOIN skill_configs sc ON sc.id = cr.published_skill_id'),
      'temporal_workflow',
      '223f38cb-ed7f-4651-b5fd-d2a341213948',
      'release-1'
    );
  });

  it('still blocks a real breaking change in the normalized publish artifact', async () => {
    const { service } = createService();
    const draft = {
      name: '查询全网热榜',
      tools: [],
      executionFlowTemplateIds: [],
      draftPayload: {
        name: '查询全网热榜',
        tools: [],
        outputSchema: {
          type: 'object',
          properties: { result: { type: 'string' } },
          additionalProperties: false,
        },
      },
    } as any;

    const result = await service.validatePublishDraft(release, draft, snapshot);

    expect(result.blocker).toEqual(
      expect.objectContaining({
        code: 'schema_breaking_change',
        details: expect.objectContaining({
          compatibility: expect.objectContaining({ compatible: false }),
        }),
      })
    );
  });

  it('allows temporal workflow publication with workflow-scoped parameters and defaults', async () => {
    const { service, prisma } = createService();
    const draft = {
      name: '查询全网热榜',
      tools: [],
      executionFlowTemplateIds: [],
      draftPayload: {
        name: '查询全网热榜',
        tools: [],
        outputSchema: oldSchema,
      },
    } as any;
    const credentialSnapshot = {
      sourcePayload: {
        ...snapshot.sourcePayload,
        paramsSchema: {
          properties: {
            apiKey: { default: 'user-workflow-key', description: 'Tavily API key' },
          },
        },
      },
    } as any;

    const result = await service.validatePublishDraft(release, draft, credentialSnapshot);

    expect(result.blocker).toBeUndefined();
  });
});
