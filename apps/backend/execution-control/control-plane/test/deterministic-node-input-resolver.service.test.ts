import { DeterministicNodeInputResolverService } from '../src/modules/execution/plan-runtime/deterministic-node-input-resolver.service';
import { ERROR_CODES } from '@ops/backend-error-codes';

describe('DeterministicNodeInputResolverService', () => {
  let resolver: DeterministicNodeInputResolverService;
  let prismaMock: {
    executionStep: { findMany: jest.Mock };
    $queryRawUnsafe: jest.Mock;
  };

  beforeEach(() => {
    prismaMock = {
      executionStep: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    resolver = new DeterministicNodeInputResolverService(prismaMock as any, {} as any, {} as any);
  });

  const mockSchemaRow = (fields: Record<string, any> | null) => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
      {
        source_type: 'temporal_workflow',
        params_schema_json: fields ? JSON.stringify(fields) : null,
        workflow_dsl_json: null,
        input_params_json: null,
      },
    ]);
  };

  it('replaces an illegal enum value with the schema default when default is a valid enum member', async () => {
    mockSchemaRow({
      topic: { type: 'string', enum: ['general', 'news', 'finance'], defaultValue: 'general' },
    });

    const resolved = await resolver.resolveInputs(
      'exec-1',
      {
        topic: { source: 'literal', value: 'AI' },
        query: { source: 'literal', value: '最新的人工智能新闻' },
      },
      {},
      'tavily_search',
    );

    expect(resolved.topic).toBe('general');
    expect(resolved.query).toBe('最新的人工智能新闻');
  });

  it('drops an illegal enum value when no valid default is available', async () => {
    mockSchemaRow({
      topic: { type: 'string', enum: ['general', 'news', 'finance'] },
    });

    const resolved = await resolver.resolveInputs(
      'exec-1',
      { topic: { source: 'literal', value: 'AI' } },
      {},
      'tavily_search',
    );

    expect(resolved.topic).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(resolved, 'topic')).toBe(false);
  });

  it('drops an illegal enum value when the default itself violates the enum', async () => {
    mockSchemaRow({
      topic: { type: 'string', enum: ['general', 'news', 'finance'], defaultValue: 'invalid-default' },
    });

    const resolved = await resolver.resolveInputs(
      'exec-1',
      { topic: { source: 'literal', value: 'AI' } },
      {},
      'tavily_search',
    );

    expect(resolved.topic).toBeUndefined();
  });

  it('keeps a legal enum value untouched', async () => {
    mockSchemaRow({
      topic: { type: 'string', enum: ['general', 'news', 'finance'], defaultValue: 'general' },
    });

    const resolved = await resolver.resolveInputs(
      'exec-1',
      { topic: { source: 'literal', value: 'news' } },
      {},
      'tavily_search',
    );

    expect(resolved.topic).toBe('news');
  });

  it('normalizes messy enum arrays with whitespace and duplicates before validating', async () => {
    mockSchemaRow({
      topic: {
        type: 'string',
        enum: ['general', ' news ', 'finance', 'general'],
        defaultValue: 'general',
      },
    });

    const resolved = await resolver.resolveInputs(
      'exec-1',
      { topic: { source: 'literal', value: 'AI' } },
      {},
      'tavily_search',
    );

    expect(resolved.topic).toBe('general');
  });

  it('handles multiple enum fields independently', async () => {
    mockSchemaRow({
      topic: { type: 'string', enum: ['general', 'news', 'finance'], defaultValue: 'general' },
      region: { type: 'string', enum: ['cn', 'us', 'global'] },
      format: { type: 'string', enum: ['json', 'markdown'], defaultValue: 'json' },
    });

    const resolved = await resolver.resolveInputs(
      'exec-1',
      {
        topic: { source: 'literal', value: 'AI' },
        region: { source: 'literal', value: 'mars' },
        format: { source: 'literal', value: 'markdown' },
      },
      {},
      'tavily_search',
    );

    expect(resolved.topic).toBe('general');
    expect(Object.prototype.hasOwnProperty.call(resolved, 'region')).toBe(false);
    expect(resolved.format).toBe('markdown');
  });

  it('leaves resolvedInput untouched when schema load fails', async () => {
    prismaMock.$queryRawUnsafe.mockRejectedValueOnce(new Error('db connection lost'));

    const resolved = await resolver.resolveInputs(
      'exec-1',
      { topic: { source: 'literal', value: 'AI' }, query: { source: 'literal', value: 'q' } },
      {},
      'tavily_search',
    );

    expect(resolved.topic).toBe('AI');
    expect(resolved.query).toBe('q');
  });

  it('leaves resolvedInput untouched when capabilityId is not provided', async () => {
    const resolved = await resolver.resolveInputs(
      'exec-1',
      { topic: { source: 'literal', value: 'AI' } },
      {},
    );

    expect(resolved.topic).toBe('AI');
    expect(prismaMock.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('leaves resolvedInput untouched when no schema row is found', async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([]);

    const resolved = await resolver.resolveInputs(
      'exec-1',
      { topic: { source: 'literal', value: 'AI' } },
      {},
      'tavily_search',
    );

    expect(resolved.topic).toBe('AI');
  });

  it('falls back to temporal workflow inputParams when paramsSchema is absent', async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([
      {
        source_type: 'temporal_workflow',
        params_schema_json: null,
        workflow_dsl_json: null,
        input_params_json: JSON.stringify({
          topic: { type: 'string', enum: ['general', 'news', 'finance'], defaultValue: 'general' },
        }),
      },
    ]);

    const resolved = await resolver.resolveInputs(
      'exec-1',
      { topic: { source: 'literal', value: 'AI' } },
      {},
      'tavily_search',
    );

    expect(resolved.topic).toBe('general');
  });

  it('resolves literal and node_output bindings as before when schema has no enum', async () => {
    mockSchemaRow({
      query: { type: 'string' },
    });

    const resolved = await resolver.resolveInputs(
      'exec-1',
      { query: { source: 'literal', value: 'AI 新闻' } },
      {},
      'tavily_search',
    );

    expect(resolved.query).toBe('AI 新闻');
  });

  it('deterministically extracts the only nested array from a generic JSON output', async () => {
    prismaMock.executionStep.findMany.mockResolvedValueOnce([
      {
        planNodeId: 'hotboard',
        status: 'succeeded',
        outputJson: {
          result: {
            businessData: {
              result: { type: 'weibo', list: [{ title: '热点一' }, { title: '热点二' }] },
            },
          },
        },
      },
    ]);

    const resolved = await resolver.resolveInputs(
      'exec-1',
      {
        items: {
          source: 'node_output',
          nodeId: 'hotboard',
          path: 'result',
          expectedType: 'news_item_list',
          transform: 'extract_unique_array',
        },
      },
    );

    expect(resolved.items).toEqual([{ title: '热点一' }, { title: '热点二' }]);
  });

  it('rejects an ambiguous generic JSON output instead of guessing an array path', async () => {
    prismaMock.executionStep.findMany.mockResolvedValueOnce([
      {
        planNodeId: 'multi-list',
        status: 'succeeded',
        outputJson: { result: { list: [1], related: [2] } },
      },
    ]);

    await expect(
      resolver.resolveInputs('exec-1', {
        items: {
          source: 'node_output',
          nodeId: 'multi-list',
          path: 'result',
          transform: 'extract_unique_array',
        },
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INPUT_SCHEMA_VIOLATION,
      message: expect.stringContaining('found multiple arrays'),
    });
  });

  describe('§9.2 source distinction — user input is never rewritten', () => {
    it('throws INPUT_SCHEMA_VIOLATION for an illegal enum value from user input (rule 4)', async () => {
      mockSchemaRow({
        topic: { type: 'string', enum: ['general', 'news', 'finance'], defaultValue: 'general' },
      });

      await expect(
        resolver.resolveInputs(
          'exec-1',
          { topic: { source: 'user_input', path: 'topic' } },
          { topic: '最新的AI新闻' },
          'tavily_search',
        ),
      ).rejects.toMatchObject({
        code: 'INPUT_SCHEMA_VIOLATION',
        message: expect.stringContaining("field 'topic'"),
      });
    });

    it('keeps a legal enum value from user input untouched', async () => {
      mockSchemaRow({
        topic: { type: 'string', enum: ['general', 'news', 'finance'], defaultValue: 'general' },
      });

      const resolved = await resolver.resolveInputs(
        'exec-1',
        { topic: { source: 'user_input', path: 'topic' } },
        { topic: 'finance' },
        'tavily_search',
      );

      expect(resolved.topic).toBe('finance');
    });

    it('does not treat an absent user input value as a violation (required is the validator\u2019s job)', async () => {
      mockSchemaRow({
        topic: { type: 'string', enum: ['general', 'news', 'finance'], defaultValue: 'general' },
      });

      const resolved = await resolver.resolveInputs(
        'exec-1',
        { topic: { source: 'user_input', path: 'missing' } },
        {},
        'tavily_search',
      );

      expect(resolved.topic).toBeUndefined();
    });

    it('never rewrites node_output data that does not match the enum', async () => {
      mockSchemaRow({
        topic: { type: 'string', enum: ['general', 'news', 'finance'], defaultValue: 'general' },
      });
      prismaMock.executionStep.findMany.mockResolvedValueOnce([
        {
          planNodeId: 'upstream-node',
          status: 'succeeded',
          outputJson: { result: { topic: '自定义内容' } },
        },
      ]);

      const resolved = await resolver.resolveInputs(
        'exec-1',
        { topic: { source: 'node_output', nodeId: 'upstream-node', path: 'result.topic' } },
        {},
        'tavily_search',
      );

      // Data passes through untouched; schema conformance is the contract validator's call.
      expect(resolved.topic).toBe('自定义内容');
    });

    it('still degrades planner literal bindings to the default (rule 2)', async () => {
      mockSchemaRow({
        topic: { type: 'string', enum: ['general', 'news', 'finance'], defaultValue: 'general' },
      });

      const resolved = await resolver.resolveInputs(
        'exec-1',
        { topic: { source: 'literal', value: 'AI' } },
        {},
        'tavily_search',
      );

      expect(resolved.topic).toBe('general');
    });
  });
});
