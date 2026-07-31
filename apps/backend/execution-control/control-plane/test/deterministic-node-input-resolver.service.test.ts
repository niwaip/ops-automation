import { DeterministicNodeInputResolverService } from '../src/modules/execution/plan-runtime/deterministic-node-input-resolver.service';

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
    resolver = new DeterministicNodeInputResolverService(prismaMock as any);
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
});
