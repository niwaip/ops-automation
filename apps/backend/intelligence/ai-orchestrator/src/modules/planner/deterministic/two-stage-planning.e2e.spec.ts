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

  it('plans web extraction + summarize + auto-inserted format_document_blocks + pdf-create', async () => {
    const topology = {
      schemaVersion: 'deterministic-topology/v1',
      objective: '打开网页获取正文，总结后生成 PDF',
      matchDecision: 'matched',
      matchConfidence: 0.95,
      matchReason: '打开网页、文本摘要和 PDF 生成',
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
            id: 'summarize_text',
            version: '1.0.0',
            digest: 'summarize-digest',
            contractDigest: 'summarize-contract',
          },
          capabilityKind: 'llm_operation',
          displayName: '文本摘要',
          summary: '对长文本进行摘要总结',
          goals: ['summarize_text'],
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
          outputSchema: {
            type: 'object',
            properties: { summary: { type: 'string' } },
          },
          runtime: { type: 'llm_operation' },
          lifecycle: { status: 'active' },
          governance: {},
        },
        {
          capabilityRef: {
            id: 'format_document_blocks',
            version: '1.0.0',
            digest: 'format-digest',
            contractDigest: 'format-contract',
          },
          capabilityKind: 'llm_operation',
          displayName: '文档块排版与格式化',
          summary: '将文本排版为标准结构化文档块',
          goals: ['format_document_blocks'],
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
          outputSchema: {
            type: 'object',
            properties: {
              content: { type: 'array' },
              title: { type: 'string' },
              pageNumbers: { type: 'boolean' },
            },
          },
          runtime: { type: 'llm_operation' },
          lifecycle: { status: 'active' },
          governance: {},
        },
      ]),
    };
    const recognizer = {
      recognizeParams: jest.fn().mockResolvedValue({
        params: { startUrl: 'https://example.com' },
        confidence: 0.95,
        debug: { llmCalls: [] },
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
      userRequest: '打开网页，总结后生成 PDF',
      availableSkills: [
        {
          id: 'browser-extract-workflow',
          name: '打开网页获取正文',
          description: '访问指定 URL 并提取网页主体正文',
          executionType: 'flow',
          paramsSchema: {
            type: 'object',
            properties: {
              startUrl: { type: 'string', description: '网页地址' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
          },
          source: 'builtin_skill',
          publishedReleaseVersion: '1.0.0',
        },
        {
          id: 'platform.document.pdf-create',
          name: '内置 PDF 简单生成',
          description: '从结构化内容块生成 PDF 文件',
          executionType: 'flow',
          supportsArtifact: true,
          paramsSchema: {
            type: 'object',
            properties: {
              content: { type: 'array' },
              title: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              artifact: {
                type: 'object',
                'x-value-type': 'artifact_ref',
              },
            },
          },
          source: 'builtin_skill',
          publishedReleaseVersion: '1.0.0',
        },
      ],
    });

    // 验证 auto-insertion 机制自动将 3 节点拓扑扩展为了包含 format_document_blocks 的 4 节点拓扑
    expect(plan.nodes).toHaveLength(4);
    expect((plan.nodes[0] as any).nodeId).toContain('打开网页获取正文');
    expect((plan.nodes[1] as any).operationId).toBe('summarize_text');
    expect((plan.nodes[2] as any).operationId).toBe('format_document_blocks');
    expect((plan.nodes[3] as any).skillId).toBe('platform.document.pdf-create');

    // 验证绑定关系
    expect((plan.nodes[2] as any).inputBindings.text).toEqual(
      expect.objectContaining({ source: 'node_output', path: 'summary' }),
    );
    expect((plan.nodes[3] as any).inputBindings.content).toEqual(
      expect.objectContaining({ source: 'node_output', path: 'content' }),
    );
  });

  it('plans pdf-split when user requests to split an uploaded PDF', async () => {
    const topology = {
      schemaVersion: 'deterministic-topology/v1',
      objective: '拆分上传的 PDF 文件',
      matchDecision: 'matched',
      matchConfidence: 0.98,
      matchReason: '内置 PDF 拆页能力精准匹配拆分需求',
      nodes: [
        { ref: 'n1', capabilityKey: 's0', dependsOn: [] },
      ],
      finalNodeRef: 'n1',
      finalOutputKind: 'artifact',
    };
    const modelService = {
      getPreferredDefaultModel: jest.fn().mockReturnValue({ id: 'model-1', name: 'test-model' }),
      callModel: jest.fn().mockResolvedValue({ content: JSON.stringify(topology) }),
    };
    const operationProjector = {
      projectAll: jest.fn().mockResolvedValue([]),
    };
    const recognizer = {
      recognizeParams: jest.fn().mockResolvedValue({
        params: { pages: '1-5,6-11' },
        confidence: 0.95,
        debug: { llmCalls: [] },
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
      userRequest: '拆分这个pdf为两部分\n[系统上下文：用户已上传 PDF 附件]',
      systemInputs: {
        fileName: 'mineru2html.pdf',
        fileBase64: 'JVBERi0xLjQK...',
      },
      availableSkills: [
        {
          id: 'platform.document.pdf-split',
          name: '内置 PDF 拆页',
          description: '将 PDF 全量拆页或按 1,3,5-7 页码规格抽取为独立 PDF 产物',
          executionType: 'flow',
          supportsArtifact: true,
          paramsSchema: {
            type: 'object',
            required: ['fileBase64'],
            properties: {
              fileBase64: { type: 'string' },
              fileName: { type: 'string' },
              pages: { type: 'string' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              artifact: {
                type: 'object',
                'x-value-type': 'artifact_ref',
              },
              artifacts: { type: 'array' },
            },
          },
          source: 'builtin_skill',
          publishedReleaseVersion: '1.0.0',
        },
      ],
    });

    expect(plan.nodes).toHaveLength(1);
    expect((plan.nodes[0] as any).skillId).toBe('platform.document.pdf-split');
    expect((plan.nodes[0] as any).inputBindings.fileBase64).toEqual({
      source: 'user_input',
      path: 'fileBase64',
    });
    expect((plan.nodes[0] as any).inputBindings.pages).toEqual({
      source: 'literal',
      value: '1-5,6-11',
    });
    expect(plan.finalOutputs[0]?.isArtifact).toBe(true);
  });
});
