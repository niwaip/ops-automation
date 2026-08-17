import { NotFoundException } from '@nestjs/common';
import { computePlanHash, type DeterministicPlanDraftV1 } from '@ops/backend-deterministic-plan';
import { SavedSkillService } from '../src/modules/saved-skill/saved-skill.service';

const plan: DeterministicPlanDraftV1 = {
  schemaVersion: 'deterministic-plan/v1',
  plannerVersion: '1',
  catalogVersion: '1',
  planType: 'sequential',
  objective: '查询微博热点并总结',
  originalRequest: '查看微博热点，并且进行总结',
  status: 'frozen',
  nodes: [
    {
      nodeId: 'search',
      sequence: 1,
      kind: 'skill',
      title: '查询热点',
      dependsOn: [],
      inputBindings: {
        query: { source: 'literal', value: '微博热点' },
      },
      outputContract: { items: 'news_item_list' },
      failurePolicy: 'abort',
      skillId: 'weibo-search',
      skillVersion: '1',
      runtimeType: 'api',
    },
    {
      nodeId: 'summary',
      sequence: 2,
      kind: 'skill',
      title: '总结热点',
      dependsOn: ['search'],
      inputBindings: {
        items: { source: 'node_output', nodeId: 'search', path: 'items' },
      },
      outputContract: { summary: 'string' },
      failurePolicy: 'abort',
      skillId: 'summary',
      skillVersion: '1',
      runtimeType: 'api',
    },
  ],
  finalOutputs: [
    {
      targetField: 'summary',
      fromNodeId: 'summary',
      fromNodeOutput: 'summary',
      expectedType: 'string',
    },
  ],
  requiredUserInputs: [],
};

describe('SavedSkillService eligibility', () => {
  const createService = (execution: Record<string, unknown> | null) => {
    const prisma = {
      execution: { findFirst: jest.fn().mockResolvedValue(execution) },
      executionPlan: {
        findUnique: jest.fn().mockResolvedValue({
          schemaVersion: plan.schemaVersion,
          status: 'frozen',
          objective: plan.objective,
          planJson: plan,
          planHash: computePlanHash(plan),
        }),
      },
      executionStep: {
        findMany: jest.fn().mockResolvedValue([
          { planNodeId: 'search', status: 'succeeded' },
          { planNodeId: 'summary', status: 'succeeded' },
        ]),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    } as any;
    return new SavedSkillService(prisma, { review: jest.fn() } as any);
  };

  it('accepts an owned, successful, frozen multi-step execution', async () => {
    const service = createService({
      id: 'execution-1',
      status: 'succeeded',
      executionMode: 'deterministic_plan',
      normalizedInputJson: {
        prompt: '查看微博热点，并且进行总结',
        previousResultText: '上一次运行结果',
        previousResultTitle: '上一次运行标题',
      },
      inputJson: {},
      resultJson: { summary: 'ok' },
    });

    await expect(service.getEligibility('owner-1', 'execution-1')).resolves.toEqual(
      expect.objectContaining({
        eligible: true,
        executionId: 'execution-1',
        stepCount: 2,
        suggestedName: plan.objective,
        fixedInput: {},
        frozenStepInputs: [
          {
            nodeId: 'search',
            sequence: 1,
            title: '查询热点',
            parameters: { query: '微博热点' },
          },
        ],
      })
    );
  });

  it('does not reveal another user execution', async () => {
    const service = createService(null);

    await expect(service.getEligibility('owner-2', 'execution-1')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('returns an editable runtime schema derived from frozen node parameters', async () => {
    const now = new Date('2026-08-17T00:00:00.000Z');
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          id: 'saved-1',
          ownerUserId: 'owner-1',
          name: '微博热点总结',
          description: null,
          visibility: 'private',
          status: 'active',
          version: 1,
          sourceExecutionId: 'execution-1',
          planSnapshotJson: plan,
          fixedInputJson: {},
          planHash: computePlanHash(plan),
          inputHash: 'input-hash',
          aiReviewJson: {
            decision: 'pass',
            summary: '通过',
            planChanged: false,
            reviewedAt: now.toISOString(),
            issues: [],
          },
          createdAt: now,
          updatedAt: now,
        },
      ]),
    } as any;
    const service = new SavedSkillService(prisma, { review: jest.fn() } as any);

    const result = await service.list('owner-1');
    const schema = result.skills[0].paramsSchema as {
      properties: Record<string, Record<string, unknown>>;
    };

    expect(schema.properties.query).toEqual(
      expect.objectContaining({
        type: 'string',
        default: '微博热点',
        'x-workflow-binding-source': 'literal',
      })
    );
    expect(schema.properties.query.readOnly).toBeUndefined();
  });
});
