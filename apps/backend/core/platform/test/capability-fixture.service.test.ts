import { CapabilityFixtureService } from '../../../registry-release/release-manager/src/fixture/capability-fixture.service';

describe('CapabilityFixtureService (§10.3)', () => {
  const createService = (over: {
    fixtures?: Array<{ fixture_type: string; count: number }>;
  } = {}) => {
    const prisma = {
      $queryRawUnsafe: jest.fn(
        async (_sql: string, _releaseId: string): Promise<Array<{ fixture_type: string; count: number }>> =>
          over.fixtures ?? []
      ),
    };
    return new CapabilityFixtureService(prisma as never);
  };

  const fixtureSet = [
    { name: 'valid-input', input: { query: 'news' } },
    { name: 'valid-output', input: { query: 'news' }, expectedOutput: { results: [] } },
    { name: 'bad-output', input: { query: 'news' }, isNegativeFixture: true },
  ];

  it('stores fixtures and maps isNegative/expectedOutput to fixture types', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const service = new CapabilityFixtureService(prisma as never);
    await service.storeFixtures('release-1', fixtureSet, 'build-1');

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
    const types = (prisma.$queryRawUnsafe as jest.Mock).mock.calls.map(
      (call) => call[1] // releaseId
    );
    expect(types.every((t) => t === 'release-1')).toBe(true);

    // third fixture (negative) must map to fixture_type='negative'
    const thirdCallSql = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[2][0] as string;
    const thirdCallParams = (prisma.$queryRawUnsafe as jest.Mock).mock.calls[2];
    expect(thirdCallSql).toContain('capability_fixtures');
    expect(thirdCallParams[4]).toBe('negative');
  });

  it('computes a stable fixture digest independent of object key ordering', () => {
    const service = createService();
    // same content as fixtureSet, but object keys inserted in different order
    const reordered = fixtureSet.map((f) => ({
      input: { query: f.input.query },
      isNegativeFixture: f.isNegativeFixture,
      name: f.name,
      ...(f.expectedOutput ? { expectedOutput: f.expectedOutput } : {}),
    }));
    expect(service.computeFixtureDigest(fixtureSet)).toBe(
      service.computeFixtureDigest(reordered)
    );
    expect(service.computeFixtureDigest(fixtureSet)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('fails validation when a negative fixture is missing', async () => {
    const service = createService({
      fixtures: [
        { fixture_type: 'input', count: 1 },
        { fixture_type: 'output', count: 1 },
      ],
    });
    const result = await service.validateFixturesExist('release-1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.stringContaining('负例'));
  });

  it('passes validation when input + output + negative all exist', async () => {
    const service = createService({
      fixtures: [
        { fixture_type: 'input', count: 2 },
        { fixture_type: 'output', count: 1 },
        { fixture_type: 'negative', count: 1 },
      ],
    });
    const result = await service.validateFixturesExist('release-1');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('suggests a negative fixture that drops a required field', () => {
    const service = createService();
    const suggestion = service.generateNegativeFixtureSuggestion({
      type: 'object',
      required: ['query'],
      properties: { query: { type: 'string' } },
    });
    expect(suggestion.isNegativeFixture).toBe(true);
    expect(suggestion.input).toEqual({});
    expect(suggestion.expectedOutput).not.toHaveProperty('query');
    expect(suggestion.name).toContain('negative');
  });

  it('suggests a negative fixture with a wrong-typed value when nothing is required', () => {
    const service = createService();
    const suggestion = service.generateNegativeFixtureSuggestion({
      type: 'object',
      properties: { count: { type: 'number' } },
    });
    expect(suggestion.isNegativeFixture).toBe(true);
    expect(suggestion.input).toEqual({});
    expect(suggestion.expectedOutput).toEqual({ count: 'not-a-number' });
  });

  it('materializes input, runtime output and negative fixtures for the exact build', async () => {
    const queryRaw = jest.fn(async (sql: string, ..._args: unknown[]) => {
      if (sql.includes('GROUP BY fixture_type')) return [];
      if (sql.includes('FROM capability_validations')) {
        return [
          {
            input_snapshot_json: null,
            result_snapshot_json: {
              input: { query: 'AI news', apiKey: 'tvly-secret', max_results: '5' },
              result: {
                result: {
                  result: {
                    businessData: {
                      searchResults: [],
                      responseMetadata: { responseTime: 10 },
                    },
                  },
                },
              },
            },
          },
        ];
      }
      if (sql.includes('INSERT INTO capability_fixtures')) return [];
      return [];
    });
    const executeRaw = jest.fn().mockResolvedValue(1);
    const service = new CapabilityFixtureService({
      $queryRawUnsafe: queryRaw,
      $executeRawUnsafe: executeRaw,
    } as never);

    const result = await service.ensureFixturesForBuild({
      releaseId: 'release-1',
      buildId: 'build-1',
      draftPayload: {
        paramsSchema: {
          type: 'object',
          required: ['query', 'apiKey'],
          properties: {
            query: { type: 'string' },
            apiKey: { type: 'string' },
            max_results: { type: 'integer' },
          },
        },
        outputSchema: {
          type: 'object',
          required: ['searchResults', 'responseMetadata'],
          additionalProperties: false,
          properties: {
            searchResults: { type: 'array' },
            responseMetadata: { type: 'object' },
          },
        },
      },
    });

    expect(result).toEqual({ valid: true, created: true, errors: [] });
    expect(executeRaw).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM capability_fixtures'),
      'release-1',
      'build-1'
    );
    const inserts = queryRaw.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO capability_fixtures')
    );
    expect(inserts).toHaveLength(3);
    expect(inserts.map((call) => call[4])).toEqual(['input', 'output', 'negative']);
    expect(JSON.parse(String(inserts[0][5]))).toEqual({
      query: 'AI news',
      apiKey: 'fixture-api-key-redacted',
      max_results: 5,
    });
    expect(JSON.parse(String(inserts[2][6]))).not.toHaveProperty('searchResults');
  });

  it('does not persist fixtures when observed runtime output violates the draft contract', async () => {
    const queryRaw = jest.fn(async (sql: string, ..._args: unknown[]) => {
      if (sql.includes('GROUP BY fixture_type')) return [];
      if (sql.includes('FROM capability_validations')) {
        return [
          {
            input_snapshot_json: { query: 'AI news' },
            result_snapshot_json: {
              result: { result: { businessData: { searchResults: [] } } },
            },
          },
        ];
      }
      return [];
    });
    const executeRaw = jest.fn().mockResolvedValue(1);
    const service = new CapabilityFixtureService({
      $queryRawUnsafe: queryRaw,
      $executeRawUnsafe: executeRaw,
    } as never);

    const result = await service.ensureFixturesForBuild({
      releaseId: 'release-1',
      buildId: 'build-1',
      draftPayload: {
        paramsSchema: {
          type: 'object',
          required: ['query'],
          properties: { query: { type: 'string' } },
        },
        outputSchema: {
          type: 'object',
          required: ['searchResults', 'responseMetadata'],
          properties: {
            searchResults: { type: 'array' },
            responseMetadata: { type: 'object' },
          },
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('responseMetadata');
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('does not hide undeclared runtime output fields from a closed output contract', async () => {
    const queryRaw = jest.fn(async (sql: string, ..._args: unknown[]) => {
      if (sql.includes('GROUP BY fixture_type')) return [];
      if (sql.includes('FROM capability_validations')) {
        return [
          {
            input_snapshot_json: { query: 'AI news' },
            result_snapshot_json: {
              result: {
                result: {
                  businessData: {
                    searchResults: [],
                    responseTime: 10,
                  },
                },
              },
            },
          },
        ];
      }
      return [];
    });
    const executeRaw = jest.fn().mockResolvedValue(1);
    const service = new CapabilityFixtureService({
      $queryRawUnsafe: queryRaw,
      $executeRawUnsafe: executeRaw,
    } as never);

    const result = await service.ensureFixturesForBuild({
      releaseId: 'release-1',
      buildId: 'build-1',
      draftPayload: {
        paramsSchema: {
          type: 'object',
          required: ['query'],
          properties: { query: { type: 'string' } },
        },
        outputSchema: {
          type: 'object',
          required: ['searchResults'],
          additionalProperties: false,
          properties: { searchResults: { type: 'array' } },
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('additional properties');
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
