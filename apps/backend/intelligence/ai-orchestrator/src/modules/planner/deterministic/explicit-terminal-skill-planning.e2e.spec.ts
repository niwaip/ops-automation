import { MultiNodeParameterBinderService } from '../binding/multi-node-parameter-binder.service';
import { NodeOutputBindingResolverService } from '../binding/node-output-binding-resolver.service';
import { CapabilityCandidateSelectorService } from '../candidate-selection/capability-candidate-selector.service';
import { RoutingCapabilityCardProjector } from '../candidate-selection/routing-capability-card.projector';
import { LlmOperationCatalogProjector } from '../../llm-operation/llm-operation-catalog.projector';
import { ModelService } from '../../model/model.service';
import { RecognizerService } from '../../recognizer/recognizer.service';
import { DeterministicRecipeMatcherService } from '../topology/deterministic-recipe-matcher.service';
import { DeterministicRecipeTopologyBuilderService } from '../topology/deterministic-recipe-topology-builder.service';
import { DeterministicTopologyPlannerService } from '../topology/deterministic-topology-planner.service';
import { DeterministicTopologyValidatorService } from '../topology/deterministic-topology-validator.service';
import { ExplicitSkillIntentService } from '../topology/explicit-skill-intent.service';
import { DeterministicContractAssemblerService } from './deterministic-contract-assembler.service';
import { DeterministicPlanGeneratorService } from './deterministic-plan-generator.service';

describe('explicit terminal Skill planning e2e', () => {
  it('falls through the two-step recipe and plans search, summarize, then Bark push', async () => {
    const topology = {
      schemaVersion: 'deterministic-topology/v1',
      objective: '查询微博热点、总结并通过 Bark 推送',
      matchDecision: 'matched',
      matchConfidence: 0.99,
      matchReason: '三个节点完整覆盖搜索、总结和 Bark 推送目标',
      nodes: [
        { ref: 'n1', capabilityKey: 's0', dependsOn: [] },
        { ref: 'n2', capabilityKey: 'o0', dependsOn: ['n1'] },
        { ref: 'n3', capabilityKey: 's1', dependsOn: ['n2'] },
      ],
      finalNodeRef: 'n3',
      finalOutputKind: 'value',
    };
    const modelService = {
      getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'model-1', name: 'test-model' }),
      callModel: jest.fn().mockResolvedValue({ content: JSON.stringify(topology) }),
    };
    const operationProjector = {
      projectAll: jest.fn().mockResolvedValue([
        {
          capabilityRef: {
            id: 'summarize_list',
            version: '1.0.8',
            digest: 'operation-digest',
            contractDigest: 'contract-digest',
          },
          capabilityKind: 'llm_operation',
          displayName: '列表摘要',
          summary: '将搜索结果总结为 Markdown',
          goals: ['summarize_list'],
          inputSchema: {
            type: 'object',
            properties: { items: { type: 'array' } },
            required: ['items'],
          },
          outputSchema: {
            type: 'object',
            properties: { markdown_content: { type: 'string' } },
            required: ['markdown_content'],
          },
          runtime: { type: 'llm_operation' },
          lifecycle: { status: 'active' },
          governance: {},
        },
      ]),
    };
    const recognizer = {
      recognizeParams: jest.fn().mockImplementation(({ template_id }: { template_id: string }) =>
        Promise.resolve({
          params: template_id.includes('WebSearch') ? { query: '微博热点' } : {},
          confidence: 0.98,
        }),
      ),
    };
    const candidateSelector = new CapabilityCandidateSelectorService(
      operationProjector as unknown as LlmOperationCatalogProjector,
    );
    const generator = new DeterministicPlanGeneratorService(
      modelService as unknown as ModelService,
      candidateSelector,
      undefined,
      new MultiNodeParameterBinderService(
        new NodeOutputBindingResolverService(),
        recognizer as unknown as RecognizerService,
      ),
      new DeterministicContractAssemblerService(),
      new RoutingCapabilityCardProjector(),
      new DeterministicTopologyPlannerService(modelService as unknown as ModelService),
      new DeterministicTopologyValidatorService(),
      new DeterministicRecipeMatcherService(),
      new DeterministicRecipeTopologyBuilderService(),
      new ExplicitSkillIntentService(),
    );

    const plan = await generator.generatePlan({
      userRequest: '查询微博热点，并且进行总结，最后用 Bark 进行推送',
      availableSkills: [
        {
          id: 'web-search',
          name: 'WebSearchWorkflow',
          description: '搜索互联网并返回结构化结果',
          executionType: 'flow',
          paramsSchema: {
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
          outputSchema: { properties: { results: { valueType: 'news_item_list' } } },
          isPublished: true,
          publishedReleaseVersion: 1,
          publishedReleaseStatus: 'published',
          publishedDeploymentStatus: 'deployed',
        },
        {
          id: 'bark-push',
          name: 'Bark推送服务',
          description: '将内容通过 Bark 服务推送到用户设备',
          executionType: 'flow',
          paramsSchema: {
            properties: {
              content: { type: 'string' },
              deviceKey: { type: 'string', default: 'configured-device-key' },
            },
            required: ['content'],
          },
          outputSchema: {
            properties: {
              code: { type: 'integer' },
              message: { type: 'string' },
            },
          },
          isPublished: true,
          publishedReleaseVersion: 1,
          publishedReleaseStatus: 'published',
          publishedDeploymentStatus: 'deployed',
        },
      ],
    });

    expect(modelService.callModel).toHaveBeenCalledTimes(1);
    expect(plan.nodes).toHaveLength(3);
    expect(plan.nodes[2]).toMatchObject({
      kind: 'skill',
      skillId: 'bark-push',
      dependsOn: [expect.stringContaining('n2')],
      inputBindings: {
        content: { source: 'node_output', path: 'markdown_content' },
        deviceKey: { source: 'literal', value: 'configured-device-key' },
      },
    });
    expect(plan.finalOutputs).toEqual([
      expect.objectContaining({ targetField: 'code', fromNodeOutput: 'code' }),
      expect.objectContaining({ targetField: 'message', fromNodeOutput: 'message' }),
    ]);
    expect(
      (plan as typeof plan & { promptDebug: { systemPrompt: string } }).promptDebug.systemPrompt,
    ).toBe('Two-Stage LLM Topology Planner');
  });
});
