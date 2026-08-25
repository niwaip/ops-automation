import { DeterministicRecipeMatcherService } from './deterministic-recipe-matcher.service';
import { DeterministicRecipeTopologyBuilderService } from './deterministic-recipe-topology-builder.service';
import { NodeOutputBindingResolverService } from '../binding/node-output-binding-resolver.service';
import { MultiNodeParameterBinderService } from '../binding/multi-node-parameter-binder.service';
import { DeterministicContractAssemblerService } from '../deterministic/deterministic-contract-assembler.service';
import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';

describe('Two-Stage Deterministic Recipe & Binding Pipeline (Phase 1 & Phase 2)', () => {
  const matcher = new DeterministicRecipeMatcherService();
  const topologyBuilder = new DeterministicRecipeTopologyBuilderService();
  const outputResolver = new NodeOutputBindingResolverService();
  const recognizer = {
    recognizeParams: jest.fn(async ({ template_id }: { template_id: string }) => ({
      params:
        template_id === 'Web Search'
          ? { query: '最新 AI 新闻', topic: 'news' }
          : template_id === 'Markdown Writer'
            ? { fileName: 'ai-news.md' }
            : {},
      confidence: 0.95,
    })),
  } as any;
  const binder = new MultiNodeParameterBinderService(outputResolver, recognizer);
  const contractAssembler = new DeterministicContractAssemblerService();

  beforeEach(() => {
    recognizer.recognizeParams
      .mockReset()
      .mockImplementation(async ({ template_id }: { template_id: string }) => ({
        params:
          template_id === 'Web Search'
            ? { query: '最新 AI 新闻', topic: 'news' }
            : template_id === 'Markdown Writer'
              ? { fileName: 'ai-news.md' }
              : {},
        confidence: 0.95,
      }));
  });

  const mockSkillCards: CompactCapabilityCardV1[] = [
    {
      id: 'platform.document.pdf-content-extractor',
      kind: 'skill',
      displayName: 'PDF Content Extractor',
      summary: '提取 PDF 文本内容',
      goals: ['pdf', 'extract'],
      inputs: {
        fileBase64: 'string',
        fileName: 'string',
      },
      outputs: {
        text: 'string',
      },
      primaryOutput: 'text',
      category: 'workflow',
      supportsArtifactOutput: false,
      publishedSkillId: 'platform.document.pdf-content-extractor',
      executableVersion: '1.0.0',
      _rawInputSchema: {
        required: ['fileBase64'],
        properties: {
          fileBase64: { type: 'string' },
          fileName: { type: 'string' },
        },
      },
    } as any,
    {
      id: 'platform.web_search',
      kind: 'skill',
      displayName: 'Web Search',
      summary: '网页搜索技能',
      goals: ['workflow', 'Web Search'],
      inputs: {
        query: 'string',
        topic: 'string',
      },
      outputs: {
        searchResults: 'news_item_list',
      },
      category: 'workflow',
      supportsArtifactOutput: false,
      publishedSkillId: 'platform.web_search',
      executableVersion: '1.0.0',
    },
    {
      id: 'platform.markdown_writer',
      kind: 'skill',
      displayName: 'Markdown Writer',
      summary: '生成 Markdown 文件',
      goals: ['artifact', 'Markdown Writer'],
      inputs: {
        content: 'string',
        fileName: 'string',
      },
      outputs: {
        artifact_ref: 'artifact_ref',
      },
      category: 'artifact',
      supportsArtifactOutput: true,
      publishedSkillId: 'platform.markdown_writer',
      executableVersion: '1.0.0',
    },
  ];

  const mockLlmOpCards: CompactCapabilityCardV1[] = [
    {
      id: 'summarize_list',
      kind: 'llm_operation',
      displayName: 'Summarize List',
      summary: '列表文本总结',
      goals: ['llm_operation'],
      inputs: {
        items: 'news_item_list',
      },
      outputs: {
        summary: 'markdown_content',
      },
      executableVersion: '1.0.0',
      operationDigest: 'sha256:summarize-list-operation',
      contractDigest: 'sha256:summarize-list-contract',
    },
    {
      id: 'summarize_text',
      kind: 'llm_operation',
      displayName: 'Summarize Text',
      summary: '文本总结',
      goals: ['llm_operation'],
      inputs: {
        text: 'string',
      },
      outputs: {
        summary: 'markdown_content',
      },
      executableVersion: '1.0.0',
      operationDigest: 'sha256:summarize-text-operation',
      contractDigest: 'sha256:summarize-text-contract',
    },
    {
      id: 'transform_text',
      kind: 'llm_operation',
      displayName: '标准 LLM 文本变换',
      summary: '基于给定内容执行建议、分析、翻译或改写',
      goals: ['transform_text', 'grounded_advice'],
      inputs: {
        content: 'string',
        instruction: 'string',
      },
      outputs: {
        content: 'string',
      },
      executableVersion: '1.0.17',
      operationDigest: 'sha256:transform-text-operation',
      contractDigest: 'sha256:transform-text-contract',
      _rawInputSchema: {
        required: ['content', 'instruction'],
        properties: {
          content: { type: 'string', 'x-ops-input-role': 'content' },
          instruction: { type: 'string', 'x-ops-input-role': 'instruction' },
        },
      },
    } as any,
  ];

  const capabilityMap = new Map<string, CompactCapabilityCardV1>();
  for (const card of [...mockSkillCards, ...mockLlmOpCards]) {
    capabilityMap.set(card.id, card);
    if (card.publishedSkillId) capabilityMap.set(card.publishedSkillId, card);
  }

  it('builds and binds a legacy recipe topology through the LLM parameter recognizer', async () => {
    const userRequest = '搜索最新 AI 新闻，总结并输出 ai-news.md';
    const matched = matcher.matchRecipe(userRequest, mockSkillCards, mockLlmOpCards);

    expect(matched).not.toBeNull();
    expect(matched?.recipeName).toBe('search_summarize_write_markdown');

    const topology = topologyBuilder.buildTopologyFromRecipe(
      matched!,
      mockSkillCards,
      mockLlmOpCards
    );
    expect(topology).not.toBeNull();
    expect(topology?.nodes).toHaveLength(3);
    expect(topology?.finalNodeRef).toBe('n3');

    const bindingResult = await binder.bindParameters(userRequest, topology!.nodes, capabilityMap);
    expect(bindingResult.requiredUserInputs).toHaveLength(0);
    expect(bindingResult.planInputs.n1?.query).toBe('最新 AI 新闻');
    expect(bindingResult.planInputs.n3?.fileName).toBe('ai-news.md');

    // Auto-binding check: searchResults -> items -> summary -> content
    expect(bindingResult.nodeBindings.n2?.items).toEqual({
      source: 'node_output',
      nodeId: 'n1',
      path: 'searchResults',
    });
    expect(bindingResult.nodeBindings.n3?.content).toEqual({
      source: 'node_output',
      nodeId: 'n2',
      path: 'summary',
    });

    const planDraft = contractAssembler.assemblePlan(topology!, bindingResult, capabilityMap);
    expect(planDraft.nodes).toHaveLength(3);
    expect(planDraft.planType).toBe('sequential');
    expect(planDraft.finalOutputs[0]?.isArtifact).toBe(true);
    expect(planDraft.finalOutputs[0]?.expectedType).toBe('artifact_ref');
  });

  it('uses a deterministic transform recipe for advice grounded in the previous result', async () => {
    const userRequest = '给出穿衣建议';
    const matched = matcher.matchRecipe(userRequest, mockSkillCards, mockLlmOpCards, {
      hasPreviousResult: true,
    });

    expect(matched?.recipeName).toBe('grounded_text_transform');
    const topology = topologyBuilder.buildTopologyFromRecipe(
      matched!,
      mockSkillCards,
      mockLlmOpCards
    );
    expect(topology?.nodes).toEqual([
      { ref: 'n1', capabilityKey: 'transform_text', dependsOn: [] },
    ]);

    const bindingResult = await binder.bindParameters(
      userRequest,
      topology!.nodes,
      capabilityMap,
      undefined,
      {
        previousResultRef: { executionId: 'weather-execution-1' },
        previousResultData: { summary: '上海 31°C，体感 36°C，局部阵雨' },
      }
    );

    expect(bindingResult.planInputs.n1).toEqual({
      content: '上海 31°C，体感 36°C，局部阵雨',
      instruction: '给出穿衣建议',
    });
    expect(bindingResult.requiredUserInputs).toHaveLength(0);
    expect(recognizer.recognizeParams).not.toHaveBeenCalled();
  });

  it('builds PDF extraction followed by text summarization with system-provided bytes', async () => {
    const userRequest = '总结pdf';
    const matched = matcher.matchRecipe(userRequest, mockSkillCards, mockLlmOpCards);
    expect(matched?.recipeName).toBe('document_extract_then_summarize');

    const topology = topologyBuilder.buildTopologyFromRecipe(
      matched!,
      mockSkillCards,
      mockLlmOpCards
    );
    const bindingResult = await binder.bindParameters(
      userRequest,
      topology!.nodes,
      capabilityMap,
      undefined,
      { fileBase64: 'JVBERg==', fileName: 'source.pdf' }
    );

    expect(bindingResult.nodeBindings.n1?.fileBase64).toEqual({
      source: 'user_input',
      path: 'fileBase64',
    });
    expect(bindingResult.nodeBindings.n2?.text).toEqual({
      source: 'node_output',
      nodeId: 'n1',
      path: 'text',
    });
    expect(bindingResult.requiredUserInputs).toHaveLength(0);
  });

  it('treats an uploaded PDF filename as a request to extract its content', () => {
    const matched = matcher.matchRecipe(
      '1.pdf\n[系统上下文：用户已上传 PDF 附件，需要提取 PDF 内容]',
      mockSkillCards,
      mockLlmOpCards
    );
    const topology = topologyBuilder.buildTopologyFromRecipe(
      matched!,
      mockSkillCards,
      mockLlmOpCards
    );

    expect(matched?.recipeName).toBe('document_extract');
    expect(topology?.nodes).toHaveLength(1);
    expect(topology?.nodes[0]?.capabilityKey).toBe('platform.document.pdf-content-extractor');
  });

  it('generates requiredUserInputs when search query is missing', async () => {
    const userRequest = '帮我总结，并输出 report.md'; // missing search query
    const matched = matcher.matchRecipe(userRequest, mockSkillCards, mockLlmOpCards);

    expect(matched?.recipeName).toBe('summarize_then_write_markdown');

    const topology = topologyBuilder.buildTopologyFromRecipe(
      matched!,
      mockSkillCards,
      mockLlmOpCards
    );
    recognizer.recognizeParams.mockImplementationOnce(async () => ({
      params: {},
      confidence: 0.2,
    }));
    recognizer.recognizeParams.mockImplementationOnce(async () => ({
      params: { fileName: 'report.md' },
      confidence: 0.95,
    }));
    const bindingResult = await binder.bindParameters(userRequest, topology!.nodes, capabilityMap);

    expect(bindingResult.nodeBindings.n2?.content).toEqual({
      source: 'node_output',
      nodeId: 'n1',
      path: 'summary',
    });
    expect(bindingResult.planInputs.n2?.fileName).toBe('report.md');
  });
});
