import { ContractLintService } from '../../../registry-release/release-manager/src/validator/contract-lint.service';

describe('ContractLintService (Gate 0, §10.1)', () => {
  const service = new ContractLintService();

  const schema = (props: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
    type: 'object',
    additionalProperties: true,
    properties: props,
    ...over,
  });

  it('passes a clean object schema with required fields in properties', () => {
    const result = service.lintContract(
      schema({ x: { type: 'string' }, y: { type: 'number', default: 1 } }, { required: ['x'] })
    );
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects unsupported JSON Schema features (oneOf/anyOf/allOf)', () => {
    const result = service.lintContract(
      schema({ x: { oneOf: [{ type: 'string' }, { type: 'number' }] } })
    );
    expect(result.passed).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ rule: 'schema_unsupported_feature', path: '#.properties.x' })
    );
  });

  it('rejects required fields that do not exist in properties', () => {
    const result = service.lintContract(
      schema({ x: { type: 'string' } }, { required: ['x', 'ghost'] })
    );
    expect(result.passed).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ rule: 'required_not_in_properties', path: '#' })
    );
  });

  it('rejects default values that do not match the field type or enum', () => {
    const typeMismatch = service.lintContract(
      schema({ x: { type: 'number', default: 'not-a-number' } })
    );
    expect(typeMismatch.passed).toBe(false);
    expect(typeMismatch.errors).toContainEqual(
      expect.objectContaining({ rule: 'default_type_mismatch', path: '#.properties.x' })
    );

    const enumMismatch = service.lintContract(
      schema({ status: { type: 'string', enum: ['a', 'b'], default: 'c' } })
    );
    expect(enumMismatch.passed).toBe(false);
    expect(enumMismatch.errors).toContainEqual(
      expect.objectContaining({ rule: 'default_not_in_enum' })
    );
  });

  it('detects circular $ref chains', () => {
    const result = service.lintContract(
      schema(
        { node: { $ref: '#/$defs/node' } },
        {
          $defs: {
            node: { type: 'object', properties: { child: { $ref: '#/$defs/node' } } },
          },
        }
      )
    );
    expect(result.passed).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ rule: 'circular_ref' })
    );
  });

  it('rejects external $refs and unresolvable internal refs', () => {
    const external = service.lintContract(schema({ x: { $ref: 'https://example.com/schema' } }));
    expect(external.passed).toBe(false);
    expect(external.errors).toContainEqual(
      expect.objectContaining({ rule: 'external_ref_not_allowed' })
    );

    const unresolvable = service.lintContract(schema({ x: { $ref: '#/$defs/nope' } }));
    expect(unresolvable.passed).toBe(false);
    expect(unresolvable.errors).toContainEqual(
      expect.objectContaining({ rule: 'unresolved_ref' })
    );
  });

  it('flags dataPaths that are not reachable in the output schema', () => {
    const result = service.lintContract({
      type: 'object',
      properties: { results: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } } },
      dataPath: '$.results[].id',
      metadata: { dataPath: '$.results[].ghost' },
    });
    expect(result.passed).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ rule: 'data_path_not_reachable', path: '#.metadata.dataPath' })
    );
  });

  describe('runtime Envelope dataPaths (fix ⑥ — §7.1 prefix handling)', () => {
    const envelopeContract = {
      type: 'object',
      additionalProperties: true,
      properties: {
        items: {
          type: 'array',
          items: { type: 'object', properties: { id: { type: 'string' } } },
        },
      },
    };

    it('accepts the migration-phase envelope root $.result.businessData', () => {
      const result = service.lintContract({
        ...envelopeContract,
        contracts: { output: { dataPath: '$.result.businessData', schema: envelopeContract } },
      });
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts the target envelope root $.data', () => {
      const result = service.lintContract({ ...envelopeContract, dataPath: '$.data' });
      expect(result.passed).toBe(true);
    });

    it('accepts envelope paths whose remainder resolves inside the schema', () => {
      const result = service.lintContract({
        ...envelopeContract,
        contracts: { output: { dataPath: '$.result.businessData.items[].id', schema: envelopeContract } },
      });
      expect(result.passed).toBe(true);
    });

    it('rejects envelope paths whose remainder does not resolve', () => {
      const result = service.lintContract({
        ...envelopeContract,
        contracts: { output: { dataPath: '$.result.businessData.ghost[].id', schema: envelopeContract } },
      });
      expect(result.passed).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ rule: 'data_path_not_reachable', path: '#.contracts.output.dataPath' })
      );
    });
  });

  describe('contracts-wrapped schema traversal (fix ⑥)', () => {
    it('catches unsupported keywords hidden inside contracts.output.schema', () => {
      const result = service.lintContract({
        contracts: {
          output: { schema: { type: 'object', properties: { x: { oneOf: [{ type: 'string' }] } } } },
        },
      });
      expect(result.passed).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          rule: 'schema_unsupported_feature',
          path: '#.contracts.output.schema.properties.x',
        })
      );
    });

    it('checks required ⊆ properties inside manifest.spec.contracts.input.schema', () => {
      const result = service.lintContract({
        manifest: {
          spec: {
            contracts: {
              input: { schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a', 'ghost'] } },
            },
          },
        },
      });
      expect(result.passed).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ rule: 'required_not_in_properties', path: '#.manifest.spec.contracts.input.schema' })
      );
    });

    it('resolves $defs declared inside wrapped schemas', () => {
      const result = service.lintContract({
        contracts: {
          output: {
            schema: {
              type: 'object',
              properties: { node: { $ref: '#/$defs/node' } },
              $defs: { node: { type: 'object', properties: { id: { type: 'string' } } } },
            },
          },
        },
      });
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  it('treats non-object contracts as a hard failure', () => {
    expect(service.lintContract(null).passed).toBe(false);
    expect(service.lintContract('string').passed).toBe(false);
    expect(service.lintContract([1, 2]).passed).toBe(false);
  });

  it('produces a stable contract digest across runs and field ordering', () => {
    const a = schema({ x: { type: 'string' }, y: { type: 'number' } });
    const b = schema({ y: { type: 'number' }, x: { type: 'string' } });
    expect(service.lintContract(a).contractDigest).toBe(service.lintContract(b).contractDigest);
    expect(service.lintContract(a).contractDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('warns (but does not fail) when fixtures are declared without a negative case', () => {
    const result = service.lintContract(
      schema(
        { x: { type: 'string' } },
        {
          tests: { fixtures: [{ input: { x: 'ok' }, expectedOutput: { x: 'ok' } }] },
        }
      )
    );
    expect(result.passed).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ rule: 'fixture_missing_negative' })
    );
  });

  describe('fixture content conformance (§10.1: Fixture 是否符合输入或输出 Schema)', () => {
    const searchSchema = {
      type: 'object',
      additionalProperties: true,
      properties: {
        query: { type: 'string' },
        topic: { type: 'string', enum: ['news', 'finance'] },
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, title: { type: 'string' } },
            required: ['id'],
          },
        },
      },
      required: ['query'],
    };

    const fixturePayload = (fixtures: unknown[]) => ({
      contracts: {
        input: { schema: searchSchema },
        output: { schema: searchSchema },
      },
      fixtures,
    });

    it('rejects an input fixture that violates the input schema', () => {
      const result = service.lintContract(
        fixturePayload([{ name: 'bad-input', input: { query: 123 } }])
      );
      expect(result.passed).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ rule: 'fixture_input_violates_input_schema' })
      );
    });

    it('rejects an output fixture that violates the output schema', () => {
      const result = service.lintContract(
        fixturePayload([
          { name: 'bad-out', input: { query: 'a' }, expectedOutput: { query: 'a', topic: 'ghost' } },
        ])
      );
      expect(result.passed).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ rule: 'fixture_output_violates_output_schema' })
      );
    });

    it('rejects a negative fixture that actually conforms to the output schema', () => {
      const result = service.lintContract(
        fixturePayload([
          { name: 'not-negative', isNegativeFixture: true, expectedOutput: { query: 'a' } },
        ])
      );
      expect(result.passed).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ rule: 'negative_fixture_not_negative' })
      );
    });

    it('passes a negative fixture that genuinely violates the output schema', () => {
      const result = service.lintContract(
        fixturePayload([
          { name: 'neg', isNegativeFixture: true, expectedOutput: { topic: 'ghost' } },
        ])
      );
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('skips negative-fixture checks when the schema has no violable constraints', () => {
      const result = service.lintContract({
        contracts: { input: { schema: searchSchema }, output: { schema: { type: 'object' } } },
        fixtures: [{ name: 'neg', isNegativeFixture: true, expectedOutput: { anything: 1 } }],
      });
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts conforming input and output fixtures', () => {
      const result = service.lintContract(
        fixturePayload([
          {
            name: 'ok',
            input: { query: 'AI 新闻' },
            expectedOutput: { query: 'AI 新闻', topic: 'news', results: [{ id: '1', title: 't' }] },
          },
        ])
      );
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
