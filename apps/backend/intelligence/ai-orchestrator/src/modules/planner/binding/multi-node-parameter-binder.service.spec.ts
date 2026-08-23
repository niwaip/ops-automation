import type { CompactCapabilityCardV1 } from '@ops/backend-deterministic-plan';
import { NodeOutputBindingResolverService } from './node-output-binding-resolver.service';
import { MultiNodeParameterBinderService } from './multi-node-parameter-binder.service';

describe('MultiNodeParameterBinderService', () => {
  const searchCard = {
    id: 'web-search',
    kind: 'skill',
    displayName: 'WebSearchWorkflow',
    summary: '搜索互联网并返回结构化结果，支持搜索分类和结果数量。',
    goals: ['web_search'],
    inputs: {
      query: 'string',
      topic: 'string[enum=general,news,finance][default=general]',
      maxResults: 'number',
    },
    outputs: { results: 'news_item_list' },
    publishedSkillId: 'published-web-search',
    executableVersion: '1',
    _rawInputSchema: {
      required: ['query'],
      defaults: { topic: 'general', maxResults: '5' },
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        topic: {
          type: 'string',
          description: '搜索分类',
          enum: ['general', 'news', 'finance'],
        },
        maxResults: { type: 'number', description: '最大结果数' },
      },
    },
  } as unknown as CompactCapabilityCardV1;

  it('uses LLM-recognized values and coerces the authoritative numeric default', async () => {
    const recognizer = {
      recognizeParams: jest.fn().mockResolvedValue({
        params: { query: 'AI新闻', topic: 'news' },
        confidence: 0.98,
        debug: { llmCalls: [{ stage: 'recognizer', label: '参数识别' }] },
      }),
    };
    const binder = new MultiNodeParameterBinderService(
      new NodeOutputBindingResolverService(),
      recognizer as any,
    );
    const capabilityMap = new Map([['s0', searchCard]]);

    const result = await binder.bindParameters(
      '查询 AI新闻，并且进行总结',
      [{ ref: 'n1', capabilityKey: 's0', dependsOn: [] }],
      capabilityMap,
    );

    expect(recognizer.recognizeParams).toHaveBeenCalledWith(
      expect.objectContaining({
        template_id: 'WebSearchWorkflow',
        fallbackMode: 'none',
        postProcessMode: 'schema_only',
        context: expect.objectContaining({
          skill_name: 'WebSearchWorkflow',
          skill_description: searchCard.summary,
        }),
      }),
    );
    expect(result.planInputs.n1).toEqual({
      query: 'AI新闻',
      topic: 'news',
      maxResults: 5,
    });
    expect(typeof result.planInputs.n1?.maxResults).toBe('number');
    expect(result.requiredUserInputs).toHaveLength(0);
    expect(result.llmCalls).toHaveLength(1);
  });

  it('keeps selected-capability LLM parameters authoritative for multi-node skills', async () => {
    const hotboardCard = {
      id: 'hotboard',
      kind: 'skill',
      displayName: '查询全网热榜',
      summary: '按平台查询实时热点榜单。',
      goals: ['hotboard'],
      inputs: {
        type: 'string',
        limit: 'integer[default=10]',
        keyword: 'string',
      },
      outputs: { result: 'object' },
      publishedSkillId: 'published-hotboard',
      executableVersion: '1',
      _rawInputSchema: {
        required: ['type'],
        defaults: { limit: 10 },
        properties: {
          type: { type: 'string', description: '热榜平台，微博对应 weibo' },
          limit: { type: 'integer', description: '返回条数' },
          keyword: { type: 'string', description: '可选关键词过滤' },
        },
      },
    } as unknown as CompactCapabilityCardV1;
    const recognizer = {
      recognizeParams: jest.fn().mockResolvedValue({
        params: { type: 'weibo' },
        confidence: 0.99,
      }),
    };
    const binder = new MultiNodeParameterBinderService(
      new NodeOutputBindingResolverService(),
      recognizer as any,
    );

    const result = await binder.bindParameters(
      '查询微博热点，并且进行总结',
      [{ ref: 'n1', capabilityKey: 'hotboard', dependsOn: [] }],
      new Map([['hotboard', hotboardCard]]),
    );

    expect(recognizer.recognizeParams).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackMode: 'none',
        postProcessMode: 'schema_only',
      }),
    );
    expect(result.planInputs.n1).toEqual({ type: 'weibo', limit: 10 });
    expect(result.nodeBindings.n1).toEqual({
      type: { source: 'literal', value: 'weibo' },
      limit: { source: 'literal', value: 10 },
    });
    expect(result.planInputs.n1).not.toHaveProperty('keyword');
    expect(result.requiredUserInputs).toHaveLength(0);
  });

  it('does not fall back to regex extraction when the LLM recognizer is unavailable', async () => {
    const binder = new MultiNodeParameterBinderService(new NodeOutputBindingResolverService());
    const capabilityMap = new Map([['s0', searchCard]]);

    const result = await binder.bindParameters(
      '查询 AI新闻',
      [{ ref: 'n1', capabilityKey: 's0', dependsOn: [] }],
      capabilityMap,
    );

    expect(result.planInputs.n1).toEqual({ topic: 'general', maxResults: 5 });
    expect(result.requiredUserInputs).toEqual([
      expect.objectContaining({ targetField: 'query', missing: true }),
    ]);
    expect(result.nodeBindings.n1?.query).toEqual({
      source: 'user_input',
      path: 'planInputs.n1.query',
    });
    expect(result.notes?.[0]).toContain('no fixed-rule extraction');
  });

  it('declares a deterministic array adapter for a single generic JSON output', async () => {
    const summarizeCard = {
      id: 'summarize_list',
      kind: 'llm_operation',
      displayName: '列表摘要',
      summary: '总结列表',
      goals: ['summarize'],
      inputs: { items: 'array' },
      outputs: { markdown_content: 'markdown_content' },
      _rawInputSchema: {
        required: ['items'],
        properties: { items: { type: 'array' } },
      },
    } as unknown as CompactCapabilityCardV1;
    const genericJsonCard = {
      id: 'generic-json',
      kind: 'skill',
      displayName: '通用查询',
      summary: '返回包含列表的 JSON 结果',
      goals: ['query'],
      inputs: {},
      outputs: { result: 'json' },
    } as unknown as CompactCapabilityCardV1;
    const binder = new MultiNodeParameterBinderService(
      new NodeOutputBindingResolverService(),
    );

    const result = await binder.bindParameters(
      '查询并总结',
      [
        { ref: 'n1', capabilityKey: 'query', dependsOn: [] },
        { ref: 'n2', capabilityKey: 'summary', dependsOn: ['n1'] },
      ],
      new Map([
        ['query', genericJsonCard],
        ['summary', summarizeCard],
      ]),
    );

    expect(result.nodeBindings.n2?.items).toEqual({
      source: 'node_output',
      nodeId: 'n1',
      path: 'result',
      expectedType: 'news_item_list',
      transform: 'extract_unique_array',
    });
  });

  it('binds a root LLM Operation from the previous structured execution snapshot', async () => {
    const summarizeCard = {
      id: 'summarize_list',
      kind: 'llm_operation',
      displayName: '列表摘要',
      summary: '总结列表',
      goals: ['summarize'],
      inputs: { items: 'array' },
      outputs: { markdown_content: 'markdown_content' },
      _rawInputSchema: {
        required: ['items'],
        properties: { items: { type: 'array' } },
      },
    } as unknown as CompactCapabilityCardV1;
    const recognizer = { recognizeParams: jest.fn() };
    const binder = new MultiNodeParameterBinderService(
      new NodeOutputBindingResolverService(),
      recognizer as any,
    );

    const result = await binder.bindParameters(
      '进行总结',
      [{ ref: 'n1', capabilityKey: 'summary', dependsOn: [] }],
      new Map([['summary', summarizeCard]]),
      undefined,
      {
        previousResultRef: { executionId: 'execution-search-1' },
        previousResultData: {
          searchResults: [
            { title: '安装方法 A', content: '步骤一' },
            { title: '安装方法 B', content: '步骤二' },
          ],
        },
      },
    );

    expect(result.nodeBindings.n1?.items).toEqual({
      source: 'literal',
      value: [
        { title: '安装方法 A', content: '步骤一' },
        { title: '安装方法 B', content: '步骤二' },
      ],
    });
    expect(result.requiredUserInputs).toHaveLength(0);
    expect(recognizer.recognizeParams).not.toHaveBeenCalled();
    expect(result.notes).toEqual([
      expect.stringContaining('execution-search-1'),
    ]);
  });

  it('keeps prior content, current instruction, and configuration parameters separated', async () => {
    const transformCard = {
      id: 'transform_text',
      kind: 'llm_operation',
      displayName: '文本处理',
      summary: '翻译、改写和格式化文本',
      goals: ['transform_text', 'translate'],
      inputs: {
        content: 'string',
        instruction: 'string',
      },
      outputs: { content: 'string' },
      _rawInputSchema: {
        required: ['content', 'instruction'],
        properties: {
          content: { type: 'string', 'x-ops-input-role': 'content' },
          instruction: { type: 'string', 'x-ops-input-role': 'instruction' },
        },
      },
    } as unknown as CompactCapabilityCardV1;
    const recognizer = {
      recognizeParams: jest.fn(),
    };
    const binder = new MultiNodeParameterBinderService(
      new NodeOutputBindingResolverService(),
      recognizer as any,
    );

    const result = await binder.bindParameters(
      '翻译成日语',
      [{ ref: 'n1', capabilityKey: 'transform', dependsOn: [] }],
      new Map([['transform', transformCard]]),
      undefined,
      {
        previousResultRef: { executionId: 'execution-summary-1' },
        previousResultData: { summary: '上一轮需要翻译的正文' },
        previousResultText: '{"summary":"上一轮需要翻译的正文"}',
      },
    );

    expect(result.planInputs.n1).toEqual({
      content: '上一轮需要翻译的正文',
      instruction: '翻译成日语',
    });
    expect(recognizer.recognizeParams).not.toHaveBeenCalled();
    expect(result.requiredUserInputs).toHaveLength(0);
  });

  it('rejects an LLM-recognized configuration value that violates string length', async () => {
    const transformCard = {
      id: 'transform_text',
      kind: 'llm_operation',
      displayName: '文本处理',
      summary: '翻译文本',
      goals: ['translate'],
      inputs: {
        content: 'string',
        instruction: 'string',
        target_language: 'string',
      },
      outputs: { content: 'string' },
      _rawInputSchema: {
        required: ['content', 'instruction'],
        properties: {
          content: { type: 'string', 'x-ops-input-role': 'content' },
          instruction: { type: 'string', 'x-ops-input-role': 'instruction' },
          target_language: {
            type: 'string',
            maxLength: 80,
            'x-ops-input-role': 'configuration',
          },
        },
      },
    } as unknown as CompactCapabilityCardV1;
    const recognizer = {
      recognizeParams: jest.fn().mockResolvedValue({
        params: { target_language: '上一轮正文'.repeat(100) },
        confidence: 0.2,
      }),
    };
    const binder = new MultiNodeParameterBinderService(
      new NodeOutputBindingResolverService(),
      recognizer as any,
    );

    const result = await binder.bindParameters(
      '翻译成日语',
      [{ ref: 'n1', capabilityKey: 'transform', dependsOn: [] }],
      new Map([['transform', transformCard]]),
      undefined,
      { previousResultText: '需要翻译的正文' },
    );

    expect(result.planInputs.n1).toEqual({
      content: '需要翻译的正文',
      instruction: '翻译成日语',
    });
    expect(result.requiredUserInputs).toHaveLength(0);
  });

  const markdownWriterCard = {
    id: 'md-writer',
    kind: 'skill',
    displayName: 'Markdown 文件生成',
    summary: '把内容写为 Markdown 文件产物。',
    goals: ['markdown_artifact'],
    inputs: {
      content: 'string',
      fileName: 'string',
    },
    outputs: { artifact: 'artifact_ref' },
    publishedSkillId: 'published-md-writer',
    executableVersion: '1',
    _rawInputSchema: {
      required: ['content'],
      defaults: { fileName: 'output.md' },
      properties: {
        content: { type: 'string', description: '要写入的 Markdown 内容' },
        fileName: { type: 'string', description: '文件名' },
      },
    },
  } as unknown as CompactCapabilityCardV1;

  it('binds a content-type required param from the previous session result', async () => {
    const recognizer = {
      recognizeParams: jest.fn().mockResolvedValue({ params: {}, confidence: 1 }),
    };
    const binder = new MultiNodeParameterBinderService(
      new NodeOutputBindingResolverService(),
      recognizer as any,
    );

    const previousResultText = '# 上一次任务的总结\n\n这是上次输出全文。';
    const result = await binder.bindParameters(
      '输出到md文件',
      [{ ref: 'n1', capabilityKey: 'md-writer', dependsOn: [] }],
      new Map([['md-writer', markdownWriterCard]]),
      undefined,
      { previousResultText, previousResultTitle: '分析和总结内容' },
    );

    expect(result.planInputs.n1?.content).toBe(previousResultText);
    expect(result.nodeBindings.n1?.content).toEqual({
      source: 'literal',
      value: previousResultText,
    });
    expect(result.requiredUserInputs).toHaveLength(0);
    expect(result.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("参数 'n1.content' 未在请求中提供，已自动使用会话中上一次任务的输出作为输入。"),
      ]),
    );
  });

  it('keeps the content param in requiredUserInputs when no previous result exists', async () => {
    const recognizer = {
      recognizeParams: jest.fn().mockResolvedValue({ params: {}, confidence: 1 }),
    };
    const binder = new MultiNodeParameterBinderService(
      new NodeOutputBindingResolverService(),
      recognizer as any,
    );

    const result = await binder.bindParameters(
      '输出到md文件',
      [{ ref: 'n1', capabilityKey: 'md-writer', dependsOn: [] }],
      new Map([['md-writer', markdownWriterCard]]),
      undefined,
      {},
    );

    expect(result.planInputs.n1).not.toHaveProperty('content');
    expect(result.requiredUserInputs).toHaveLength(1);
    expect(result.requiredUserInputs[0]!.targetField).toBe('content');
    expect(result.requiredUserInputs[0]!.missing).toBe(true);
    expect(result.nodeBindings.n1?.content).toEqual({
      source: 'user_input',
      path: 'planInputs.n1.content',
    });
  });

  it('does not bind non-content params from the previous session result', async () => {
    const queryCard = {
      ...searchCard,
      id: 'search-2',
      _rawInputSchema: {
        required: ['query'],
        defaults: {},
        properties: {
          query: { type: 'string', description: '搜索关键词' },
        },
      },
      inputs: { query: 'string' },
    } as unknown as CompactCapabilityCardV1;
    const recognizer = {
      recognizeParams: jest.fn().mockResolvedValue({ params: {}, confidence: 1 }),
    };
    const binder = new MultiNodeParameterBinderService(
      new NodeOutputBindingResolverService(),
      recognizer as any,
    );

    const result = await binder.bindParameters(
      '搜索一下',
      [{ ref: 'n1', capabilityKey: 'search-2', dependsOn: [] }],
      new Map([['search-2', queryCard]]),
      undefined,
      { previousResultText: '上一次输出' },
    );

    expect(result.planInputs.n1).not.toHaveProperty('query');
    expect(result.requiredUserInputs).toHaveLength(1);
    expect(result.requiredUserInputs[0]!.targetField).toBe('query');
  });

  it('exposes the previous result text in the recognizer context', async () => {
    const recognizer = {
      recognizeParams: jest.fn().mockResolvedValue({ params: {}, confidence: 1 }),
    };
    const binder = new MultiNodeParameterBinderService(
      new NodeOutputBindingResolverService(),
      recognizer as any,
    );

    await binder.bindParameters(
      '输出到md文件',
      [{ ref: 'n1', capabilityKey: 'md-writer', dependsOn: [] }],
      new Map([['md-writer', markdownWriterCard]]),
      undefined,
      { previousResultText: '# 上次输出' },
    );

    expect(recognizer.recognizeParams).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          previous_result_text: '# 上次输出',
        }),
      }),
    );
  });
});
