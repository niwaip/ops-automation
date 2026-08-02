import { ERROR_CODES } from '@ops/backend-error-codes';
import {
  CandidateSchemaGeneratorService,
  CandidateSchemaResult,
} from '../src/modules/execution/backfill/candidate-schema-generator.service';

const propsOf = (result: CandidateSchemaResult) =>
  (result.candidateSchema.properties ?? {}) as Record<string, unknown>;

describe('CandidateSchemaGeneratorService (§17.2)', () => {
  const skillRow = (over: Record<string, unknown> = {}) => ({
    id: 'skill-1',
    name: 'my-custom-skill',
    outputSchema: {},
    candidateSchemaJson: null,
    candidateSchemaGeneratedAt: null,
    ...over,
  });

  const samples = (rows: Array<Record<string, unknown>>) =>
    rows.map((outputJson) => ({ outputJson }));

  const createService = (over: {
    builtin?: Record<string, unknown> | null;
    skill?: Record<string, unknown> | null;
    executionSamples?: Array<{ outputJson: Record<string, unknown> }>;
    updateImpl?: jest.Mock;
  } = {}) => {
    const prisma = {
      builtinSkill: {
        findUnique: jest.fn().mockResolvedValue(over.builtin ?? null),
      },
      skillConfig: {
        findFirst: jest.fn().mockResolvedValue(over.skill ?? null),
        findUnique: jest.fn().mockResolvedValue(over.skill ?? null),
        update: jest.fn().mockImplementation(over.updateImpl ?? (() => Promise.resolve({ id: 'skill-1' }))),
      },
      executionStep: {
        findMany: jest.fn().mockResolvedValue(over.executionSamples ?? []),
      },
    };
    return { service: new CandidateSchemaGeneratorService(prisma as never), prisma };
  };

  describe('generateCandidateSchema', () => {
    it('infers a candidate schema from 3+ succeeded samples and persists it', async () => {
      const { service, prisma } = createService({
        skill: skillRow(),
        executionSamples: samples([
          { result: 'https://a.example', count: 3 },
          { result: 'https://b.example', count: 4 },
          { result: 'https://c.example', count: 5 },
        ]),
      });

      const result = await service.generateCandidateSchema('my-custom-skill');

      expect(result.sampleCount).toBe(3);
      expect(result.candidateSchema).toEqual({
        type: 'object',
        additionalProperties: true,
        properties: {
          result: { type: 'string', format: 'uri' },
          count: { type: 'number' },
        },
        required: ['result', 'count'],
      });
      // both fields present in every sample → presence 1.0 → required
      expect(result.fieldStats.result.presence).toBe(1);
      expect(result.fieldStats.result.inferredType).toBe('string');
      expect(prisma.executionStep.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ capabilityId: 'my-custom-skill', status: 'succeeded' }),
        })
      );
      expect(prisma.skillConfig.update).toHaveBeenCalledWith({
        where: { id: 'skill-1' },
        data: expect.objectContaining({
          candidateSchemaJson: expect.objectContaining({ type: 'object' }),
          candidateSchemaGeneratedAt: expect.any(Date),
        }),
      });
    });

    it('marks only fields present in ≥80% of samples as required', async () => {
      const { service } = createService({
        skill: skillRow(),
        executionSamples: samples([
          { always: 'a', sometimes: 1 },
          { always: 'b' },
          { always: 'c', sometimes: 2 },
          { always: 'd' },
        ]),
      });

      const result = await service.generateCandidateSchema('my-custom-skill');

      expect(result.candidateSchema.required).toEqual(['always']);
      expect(result.fieldStats.sometimes.presence).toBe(0.5);
    });

    it('treats type-mixed fields as untyped (no inferredType, empty schema)', async () => {
      const { service } = createService({
        skill: skillRow(),
        executionSamples: samples([{ mixed: 1 }, { mixed: 'string' }, { mixed: true }]),
      });

      const result = await service.generateCandidateSchema('my-custom-skill');

      expect(propsOf(result).mixed).toEqual({});
      expect(result.fieldStats.mixed.inferredType).toBeUndefined();
    });

    it('recursively infers nested object fields', async () => {
      const { service } = createService({
        skill: skillRow(),
        executionSamples: samples([
          { meta: { a: 1 } },
          { meta: { a: 2 } },
          { meta: { a: 3 } },
        ]),
      });

      const result = await service.generateCandidateSchema('my-custom-skill');

      expect(propsOf(result).meta).toEqual({
        type: 'object',
        properties: { a: { type: 'number' } },
      });
    });

    it('rejects when fewer than minSamples succeeded samples exist', async () => {
      const { service } = createService({
        skill: skillRow(),
        executionSamples: samples([{ result: 'x' }]),
      });

      await expect(service.generateCandidateSchema('my-custom-skill')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: ERROR_CODES.INSUFFICIENT_SAMPLES_FOR_CANDIDATE_SCHEMA,
        }),
      });
    });

    it('honors an explicit minSamples override', async () => {
      const { service } = createService({
        skill: skillRow(),
        executionSamples: samples([{ result: 'only-one' }]),
      });

      const result = await service.generateCandidateSchema('my-custom-skill', 1);
      expect(result.sampleCount).toBe(1);
    });

    it('rejects builtin skills (manifest contracts are authoritative)', async () => {
      const { service } = createService({ builtin: { id: 'builtin-1' } });

      await expect(service.generateCandidateSchema('tavily_search')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: ERROR_CODES.CANDIDATE_SCHEMA_NOT_APPLICABLE,
        }),
      });
    });

    it('rejects skills that already have an authoritative output schema', async () => {
      const { service } = createService({
        skill: skillRow({ outputSchema: { type: 'object', properties: { x: { type: 'string' } } } }),
      });

      await expect(service.generateCandidateSchema('my-custom-skill')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: ERROR_CODES.CANDIDATE_SCHEMA_NOT_APPLICABLE,
        }),
      });
    });

    it('rejects unknown skills entirely', async () => {
      const { service } = createService({ skill: null });

      await expect(service.generateCandidateSchema('no-such-skill')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: ERROR_CODES.CANDIDATE_SCHEMA_NOT_APPLICABLE,
        }),
      });
    });
  });

  describe('acceptCandidateSchema', () => {
    it('copies the candidate schema into output_schema and clears candidate columns', async () => {
      const candidate = {
        type: 'object',
        additionalProperties: true,
        properties: { x: { type: 'string' } },
        required: ['x'],
      };
      const { service, prisma } = createService({
        skill: skillRow({ candidateSchemaJson: candidate }),
      });

      const schema = await service.acceptCandidateSchema('my-custom-skill');

      expect(schema).toEqual(candidate);
      expect(prisma.skillConfig.update).toHaveBeenCalledWith({
        where: { id: 'skill-1' },
        data: {
          outputSchema: candidate,
          candidateSchemaJson: null,
          candidateSchemaGeneratedAt: null,
        },
      });
    });

    it('rejects when no candidate schema exists', async () => {
      const { service } = createService({ skill: skillRow() });

      await expect(service.acceptCandidateSchema('my-custom-skill')).rejects.toMatchObject({
        response: expect.objectContaining({ code: ERROR_CODES.NO_CANDIDATE_SCHEMA }),
      });
    });

    it('rejects builtin skills on accept too', async () => {
      const { service } = createService({ builtin: { id: 'builtin-1' } });

      await expect(service.acceptCandidateSchema('tavily_search')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: ERROR_CODES.CANDIDATE_SCHEMA_NOT_APPLICABLE,
        }),
      });
    });

    it('refuses to overwrite an existing authoritative schema even with a candidate present', async () => {
      const { service } = createService({
        skill: skillRow({
          candidateSchemaJson: { type: 'object', properties: { x: { type: 'string' } } },
          outputSchema: { type: 'object', properties: { old: { type: 'string' } } },
        }),
      });

      await expect(service.acceptCandidateSchema('my-custom-skill')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: ERROR_CODES.CANDIDATE_SCHEMA_NOT_APPLICABLE,
        }),
      });
    });
  });
});
