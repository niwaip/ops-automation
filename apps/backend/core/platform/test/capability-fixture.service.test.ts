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
    expect(suggestion.input).not.toHaveProperty('query');
    expect(suggestion.name).toContain('negative');
  });

  it('suggests a negative fixture with a wrong-typed value when nothing is required', () => {
    const service = createService();
    const suggestion = service.generateNegativeFixtureSuggestion({
      type: 'object',
      properties: { count: { type: 'number' } },
    });
    expect(suggestion.isNegativeFixture).toBe(true);
    expect(suggestion.input).toEqual({ count: 'not-a-number' });
  });
});
