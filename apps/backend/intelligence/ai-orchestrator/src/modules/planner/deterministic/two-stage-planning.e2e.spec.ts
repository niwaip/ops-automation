import { MultiNodeParameterBinderService } from '../binding/multi-node-parameter-binder.service';
import { NodeOutputBindingResolverService } from '../binding/node-output-binding-resolver.service';
import { CapabilityCandidateSelectorService } from '../candidate-selection/capability-candidate-selector.service';
import { RoutingCapabilityCardProjector } from '../candidate-selection/routing-capability-card.projector';
import { DeterministicTopologyPlannerService } from '../topology/deterministic-topology-planner.service';
import { DeterministicTopologyValidatorService } from '../topology/deterministic-topology-validator.service';
import { DeterministicContractAssemblerService } from './deterministic-contract-assembler.service';
import { DeterministicPlanGeneratorService } from './deterministic-plan-generator.service';

describe('two-stage deterministic planning e2e', () => {
  it('plans search + summarize + Markdown artifact with canonical output fields', async () => {
    const topology = {
      schemaVersion: 'deterministic-topology/v1',
      objective: '查询 AI 新闻并总结',
      matchDecision: 'matched',
      matchConfidence: 0.98,
      matchReason: '搜索、总结和 Markdown 输出能力完整覆盖请求',
      nodes: [
        { ref: 'n1', capabilityKey: 's0', dependsOn: [] },
        { ref: 'n2', capabilityKey: 'o0', dependsOn: ['n1'] },
        { ref: 'n3', capabilityKey: 's1', dependsOn: ['n2'] },
      ],
      finalNodeRef: 'n3',
      finalOutputKind: 'artifact',
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
            version: '1.0.0',
            digest: 'operation-digest',
            contractDigest: 'contract-digest',
          },
          capabilityKind: 'llm_operation',
          displayName: '列表摘要',
          summary: '对搜索结果列表进行总结',
          goals: ['summarize_list'],
          inputSchema: {
            type: 'object',
            properties: { items: { type: 'array', description: '搜索结果列表' } },
            required: ['items'],
          },
          outputSchema: {
            type: 'object',
            properties: { markdown_content: { type: 'markdown_content' } },
          },
          runtime: { type: 'llm_operation' },
          lifecycle: { status: 'active' },
          governance: {},
        },
      ]),
    };
    const recognizer = {
      recognizeParams: jest.fn().mockResolvedValue({
        params: { query: 'AI新闻', topic: 'news' },
        confidence: 0.98,
        debug: {
          llmCalls: [{ stage: 'recognizer', label: '参数识别', modelId: 'model-1' }],
        },
      }),
    };

    const candidateSelector = new CapabilityCandidateSelectorService(operationProjector as any);
    const cardProjector = new RoutingCapabilityCardProjector();
    const topologyPlanner = new DeterministicTopologyPlannerService(modelService as any);
    const topologyValidator = new DeterministicTopologyValidatorService();
    const binder = new MultiNodeParameterBinderService(
      new NodeOutputBindingResolverService(),
      recognizer as any,
    );
    const assembler = new DeterministicContractAssemblerService();
    const generator = new DeterministicPlanGeneratorService(
      modelService as any,
      candidateSelector,
      undefined,
      binder,
      assembler,
      cardProjector,
      topologyPlanner,
      topologyValidator,
    );

    const plan = await generator.generatePlan({
      userRequest: '搜索 deekseek v4 flash 的新闻，并且进行总结，最后生成MD文件',
      availableSkills: [
        {
          id: 'web-search-workflow',
          name: 'WebSearchWorkflow',
          description: '搜索互联网并返回结构化结果，支持搜索分类和结果数量',
          executionType: 'flow',
          paramsSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '搜索关键词' },
              topic: {
                type: 'string',
                description: '搜索分类',
                enum: ['general', 'news', 'finance'],
                default: 'general',
              },
              maxResults: {
                type: 'number',
                description: '最大结果数',
                default: '5',
              },
            },
            required: ['query'],
          },
          outputSchema: {
            type: 'object',
            properties: { results: { valueType: 'news_item_list' } },
          },
          isPublished: true,
          publishedReleaseVersion: 1,
          publishedReleaseStatus: 'published',
          publishedDeploymentStatus: 'deployed',
        },
        {
          id: 'platform.document.markdown-artifact-writer',
          name: '内置 Markdown 文件生成',
          description: '将 Markdown 内容写入受控存储并返回 ArtifactRef 产物引用',
          executionType: 'artifact',
          supportsArtifact: true,
          paramsSchema: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              fileName: { type: 'string' },
            },
            required: ['content'],
          },
          outputSchema: {
            type: 'object',
            'x-primary-output': 'artifact',
            properties: {
              artifact: {
                type: 'object',
                'x-value-type': 'artifact_ref',
                properties: {
                  name: { type: 'string' },
                  url: { type: 'string' },
                  mimeType: { type: 'string' },
                },
              },
              artifacts: { type: 'array' },
            },
          },
          source: 'builtin_skill',
          publishedReleaseVersion: '1.0.2',
        },
      ],
    });

    expect(modelService.callModel).toHaveBeenCalledTimes(1);
    expect(modelService.callModel.mock.calls[0]?.[1]).toContain(
      '搜索互联网并返回结构化结果',
    );
    expect(recognizer.recognizeParams).toHaveBeenCalledTimes(2);
    expect(plan.plannerVersion).toBe('2.1.0-two-stage-llm');
    expect(plan.nodes).toHaveLength(3);
    expect((plan.nodes[0] as any).inputBindings).toEqual({
      query: { source: 'literal', value: 'AI新闻' },
      topic: { source: 'literal', value: 'news' },
      maxResults: { source: 'literal', value: 5 },
    });
    expect((plan.nodes[1] as any).inputBindings.items).toEqual(
      expect.objectContaining({ source: 'node_output', path: 'results' }),
    );
    expect((plan.nodes[2] as any).outputContract).toEqual({
      artifact: 'artifact_ref',
      artifacts: 'json',
    });
    expect(plan.finalOutputs[0]).toEqual(
      expect.objectContaining({
        fromNodeOutput: 'artifact',
        expectedType: 'artifact_ref',
        isArtifact: true,
      }),
    );
  });
});
