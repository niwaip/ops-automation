import axios from 'axios';
import { CapabilityContractCatalogService } from '../src/modules/execution/plan-runtime/capability-contract-catalog.service';

jest.mock('axios');

const axiosGet = (axios as jest.Mocked<typeof axios>).get;

/**
 * Authoritative contract catalog — version-precise resolution (§9.3 / §6.4).
 *
 * The frozen plan must bind the contract of the EXACT immutable version the
 * node pins, never a silent fallback to the active version. Fix ③ (audit:
 * "冻结节点精确解析不可变版本 — 假冻结").
 */

const MANIFEST_V10 = {
  apiVersion: 'capability/v2',
  kind: 'BuiltinSkillManifest',
  spec: {
    definitionVersion: '1.0.0',
    contracts: {
      input: { schema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } },
      output: { schema: { type: 'object', properties: { v10: { type: 'string' } } } },
    },
  },
};

const MANIFEST_V11 = {
  ...MANIFEST_V10,
  spec: {
    ...MANIFEST_V10.spec,
    definitionVersion: '1.1.0',
    contracts: {
      input: { schema: { type: 'object', properties: { q2: { type: 'string' } } } },
      output: { schema: { type: 'object', properties: { v11: { type: 'string' } } } },
    },
  },
};

function makeClient(over: Record<string, any> = {}) {
  const builtinSkill = {
    id: 'skill-uuid',
    capabilityKey: 'news_skill',
    activeVersionId: 'ver-11', // active is 1.1.0 — must NOT leak into pinned resolution
  };
  const versions: Record<string, any> = {
    'ver-10': { id: 'ver-10', definitionVersion: '1.0.0', manifestJson: MANIFEST_V10 },
    'ver-11': { id: 'ver-11', definitionVersion: '1.1.0', manifestJson: MANIFEST_V11 },
  };
  const versionsById: Record<string, any> = { 'ver-10': versions['ver-10'], 'ver-11': versions['ver-11'] };
  const versionsByDefinition: Record<string, any> = {
    '1.0.0': versions['ver-10'],
    '1.1.0': versions['ver-11'],
  };
  const skillConfigs: any[] = [];
  const publishedReleases: Array<{ version: number; payload: Record<string, unknown>; uuid?: string }> = [];
  const snapshotsById: Record<string, any> = {};
  return {
    builtinSkill: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(where.capabilityKey === builtinSkill.capabilityKey ? builtinSkill : null)
      ),
    },
    builtinSkillVersion: {
      findUnique: jest.fn(({ where }: any) =>
        Promise.resolve(
          where.id
            ? versionsById[where.id] ?? null
            : versionsByDefinition[where.builtinSkillId_definitionVersion?.definitionVersion] ?? null
        )
      ),
    },
    skillConfig: {
      findFirst: jest.fn(() => Promise.resolve(skillConfigs[0] ?? null)),
    },
    capabilityRelease: {
      findFirst: jest.fn(({ where }: any) => {
        const release = publishedReleases.find(
          (r) =>
            (!where.publishedSkillId || where.publishedSkillId === 'cfg-id' || r.uuid === where.publishedSkillId) &&
            where.releaseVersion === r.version &&
            (where.archivedAt === undefined || where.archivedAt === null)
        );
        if (!release) return Promise.resolve(null);
        const snapshot = snapshotsById[`snap-${release.version}`];
        return Promise.resolve({
          currentSourceSnapshotId: snapshot ? snapshot.id : null,
        });
      }),
    },
    capabilitySourceSnapshot: {
      findUnique: jest.fn(({ where }: any) => Promise.resolve(snapshotsById[where.id] ?? null)),
    },
    __skillConfigs: skillConfigs,
    __setSkillConfig: (config: any) => {
      skillConfigs.length = 0;
      skillConfigs.push(config);
    },
    __setPublishedRelease: (version: number, payload: Record<string, unknown>) => {
      publishedReleases.push({ version, payload, uuid: 'cfg-id' });
      snapshotsById[`snap-${version}`] = {
        id: `snap-${version}`,
        sourcePayloadJson: payload,
      };
    },
    ...over,
  };
}

describe('CapabilityContractCatalogService (fix ③ — version-precise resolution)', () => {
  const service = new CapabilityContractCatalogService();

  beforeEach(() => {
    axiosGet.mockReset();
    axiosGet.mockResolvedValue({
      data: {
        operationId: 'summarize_text',
        promptTemplateId: 'summarize_text:1',
        version: '1',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        outputSchema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
      },
    } as any);
  });

  describe('builtin skill — strict version resolution (§9.3)', () => {
    it('resolves the pinned immutable version, NOT the active version', async () => {
      const client = makeClient();
      const contract = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'news_skill',
        skillVersion: '1.0.0',
      });

      expect(contract.outputSchema).toEqual({
        type: 'object',
        properties: { v10: { type: 'string' } },
      });
      // The active version 1.1.0 contract must NOT leak in
      expect(contract.outputSchema).not.toHaveProperty('properties.v11');
      expect(contract.inputSchema).toEqual(
        expect.objectContaining({ properties: expect.objectContaining({ q: { type: 'string' } }) })
      );
      // Lookup went through the composite key, not activeVersionId
      expect(client.builtinSkillVersion.findUnique).toHaveBeenCalledWith({
        where: {
          builtinSkillId_definitionVersion: { builtinSkillId: 'skill-uuid', definitionVersion: '1.0.0' },
        },
      });
    });

    it('rejects a pinned version that no longer exists (fail-closed, no active fallback)', async () => {
      const client = makeClient();
      await expect(
        service.resolveContract(client, {
          nodeId: 'n1',
          kind: 'skill',
          skillId: 'news_skill',
          skillVersion: '9.9.9',
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CAPABILITY_CONTRACT_NOT_FOUND',
          details: expect.objectContaining({
            reason: expect.stringContaining("version '9.9.9' does not exist"),
          }),
        }),
      });
    });

    it('resolves the active version when the node pins nothing (unpinned = latest)', async () => {
      const client = makeClient();
      const contract = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'news_skill',
      });

      expect(contract.outputSchema).toEqual({
        type: 'object',
        properties: { v11: { type: 'string' } },
      });
    });

    it('passes contractCompatibility from the resolved version manifest', async () => {
      const client = makeClient();
      const contract = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'news_skill',
        skillVersion: '1.0.0',
      });
      expect(contract.contractCompatibility).toBe('backward');
    });
  });

  describe('custom skill (SkillConfig) — input schema from paramsSchema', () => {
    const configWith = (paramsSchema: unknown, outputSchema: unknown) => ({
      id: 'cfg-id',
      name: 'custom_skill',
      paramsSchema,
      outputSchema,
    });

    it('derives the input contract from paramsSchema properties + required', async () => {
      const client = makeClient();
      client.__setSkillConfig(
        configWith(
          {
            properties: {
              topic: { type: 'string', description: '主题', required: true },
              count: { type: 'number', default: 5 },
              when: { type: 'date', description: '日期' },
            },
            required: ['topic'],
          },
          { type: 'object', properties: { result: { type: 'string' } } }
        )
      );

      const contract = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'custom_skill',
      });

      expect(contract.inputSchema).toEqual({
        type: 'object',
        properties: {
          topic: { type: 'string', description: '主题' },
          count: { type: 'number', default: 5 },
          when: { type: 'string', description: '日期' }, // date → string
        },
        required: ['topic'],
      });
      expect(contract.outputSchema).toEqual({ type: 'object', properties: { result: { type: 'string' } } });
    });

    it('preserves enum / defaultValue / array items / object properties constraints (fix ②)', async () => {
      const client = makeClient();
      client.__setSkillConfig(
        configWith(
          {
            properties: {
              topic: { type: 'string', enum: ['general', 'news', 'finance'], defaultValue: 'general' },
              tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
              meta: {
                type: 'object',
                properties: { source: { type: 'string' } },
                additionalProperties: false,
              },
              score: { type: 'number', minimum: 0, maximum: 100 },
            },
          },
          { type: 'object', properties: { result: { type: 'string' } } }
        )
      );

      const contract = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'custom_skill',
      });

      expect(contract.inputSchema).toEqual({
        type: 'object',
        properties: {
          topic: { type: 'string', enum: ['general', 'news', 'finance'], default: 'general' },
          tags: { type: 'array', items: { type: 'string' }, minItems: 1 },
          meta: {
            type: 'object',
            properties: { source: { type: 'string' } },
            additionalProperties: false,
          },
          score: { type: 'number', minimum: 0, maximum: 100 },
        },
      });
      // additionalProperties omitted at top level (JSON Schema default true) — never forced in
      expect(contract.inputSchema).not.toHaveProperty('additionalProperties');
    });

    it('preserves closed-object additionalProperties:false at top level', async () => {
      const client = makeClient();
      client.__setSkillConfig(
        configWith(
          {
            properties: { a: { type: 'string' } },
            additionalProperties: false,
          },
          { type: 'object', properties: { result: { type: 'string' } } }
        )
      );

      const contract = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'custom_skill',
      });

      expect(contract.inputSchema?.additionalProperties).toBe(false);
    });

    it('merges per-field required into the object-level required list', async () => {
      const client = makeClient();
      client.__setSkillConfig(
        configWith(
          {
            properties: {
              a: { type: 'string', required: true },
              b: { type: 'string' },
            },
          },
          { type: 'object', properties: {} }
        )
      );
      const contract = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'custom_skill',
      });
      expect(contract.inputSchema?.required).toEqual(['a']);
    });

    it('pinned custom skill binds the EXACT release snapshot contract, never the live config (§9.3)', async () => {
      const client = makeClient();
      // Live config carries a DIFFERENT schema — it must not leak into a pinned resolution.
      client.__setSkillConfig(
        configWith(
          { properties: { liveOnly: { type: 'string' } } },
          { type: 'object', properties: { live: { type: 'string' } } }
        )
      );
      client.__setPublishedRelease(7, {
        paramsSchema: {
          properties: {
            topic: { type: 'string', enum: ['general', 'news', 'finance'], defaultValue: 'general' },
          },
          required: ['topic'],
        },
        outputSchema: { type: 'object', properties: { released: { type: 'string' } } },
      });

      const contract = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'custom_skill',
        skillVersion: '7',
      });

      expect(contract.outputSchema).toEqual({ type: 'object', properties: { released: { type: 'string' } } });
      expect(contract.outputSchema).not.toHaveProperty('properties.live');
      expect(contract.inputSchema).toEqual({
        type: 'object',
        properties: {
          topic: { type: 'string', enum: ['general', 'news', 'finance'], default: 'general' },
        },
        required: ['topic'],
      });
      expect(contract.sourceType).toBe('published_skill');
    });

    it('rejects a pinned custom-skill version that does not exist in capability_releases (fail-closed)', async () => {
      const client = makeClient();
      client.__setSkillConfig(
        configWith({ properties: { a: { type: 'string' } } }, { type: 'object', properties: {} })
      );
      await expect(
        service.resolveContract(client, {
          nodeId: 'n1',
          kind: 'skill',
          skillId: 'custom_skill',
          skillVersion: '99',
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CAPABILITY_CONTRACT_NOT_FOUND',
          details: expect.objectContaining({
            reason: expect.stringContaining("version '99' does not exist in capability_releases"),
          }),
        }),
      });
    });

    it('rejects a pinned release whose snapshot carries no output schema (schema-less, P0 §15.1)', async () => {
      const client = makeClient();
      // A live config exists with a schema — it must NOT substitute for the schema-less release.
      client.__setSkillConfig(
        configWith({ properties: { a: { type: 'string' } } }, { type: 'object', properties: { live: { type: 'string' } } })
      );
      client.__setPublishedRelease(3, { paramsSchema: { properties: { a: { type: 'string' } } } });
      await expect(
        service.resolveContract(client, {
          nodeId: 'n1',
          kind: 'skill',
          skillId: 'custom_skill',
          skillVersion: '3',
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CAPABILITY_CONTRACT_NOT_FOUND',
          details: expect.objectContaining({
            reason: expect.stringContaining("version '3' carries no output schema"),
          }),
        }),
      });
    });

    it('derives a lenient output schema from legacy temporal WorkflowDsl.outputParams (no outputSchema)', async () => {
      const client = makeClient();
      client.__setSkillConfig(configWith({ properties: {} }, null));
      // The real 网页信息检索 release shape: snapshot carries workflowDsl +
      // paramsSchema, but NO declarative outputSchema (design doc §3.2).
      client.__setPublishedRelease(3, {
        paramsSchema: {
          properties: { query: { type: 'string' }, topic: { type: 'string', enum: ['general', 'news', 'finance'] } },
          required: ['query'],
        },
        workflowDsl: {
          name: '网页信息检索',
          outputParams: {
            searchResults: { sourceStep: 'step_2', description: '搜索结果数组，包含 url、title、content、score 字段' },
            responseMetadata: { sourceStep: 'step_2', description: '响应元数据，包含查询参数和响应时间' },
          },
        },
      });

      const contract = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'custom_skill',
        skillVersion: '3',
      });

      expect(contract.outputSchema).toEqual({
        type: 'object',
        properties: {
          searchResults: { description: '搜索结果数组，包含 url、title、content、score 字段' },
          responseMetadata: { description: '响应元数据，包含查询参数和响应时间' },
        },
        required: ['searchResults', 'responseMetadata'],
        additionalProperties: true,
      });
      // The declared output fields must be the ONLY required fields — no invented types.
      expect(contract.outputSchema?.required).toEqual(['searchResults', 'responseMetadata']);
      // Input contract still comes from paramsSchema (enum preserved).
      expect(contract.inputSchema).toEqual(
        expect.objectContaining({
          required: ['query'],
          properties: expect.objectContaining({
            topic: expect.objectContaining({ enum: ['general', 'news', 'finance'] }),
          }),
        })
      );
      expect(contract.sourceType).toBe('published_skill');
    });

    it('derives a lenient output schema from top-level outputParams (recorder-style payload)', async () => {
      const client = makeClient();
      client.__setSkillConfig(configWith({ properties: {} }, null));
      client.__setPublishedRelease(4, {
        outputParams: { result: { description: '转换后的结果对象' } },
      });

      const contract = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'custom_skill',
        skillVersion: '4',
      });

      expect(contract.outputSchema).toEqual({
        type: 'object',
        properties: { result: { description: '转换后的结果对象' } },
        required: ['result'],
        additionalProperties: true,
      });
    });

    it('derives from apiEndpoints.runtimeMetadata.outputParams when nested (legacy recorder metadata)', async () => {
      const client = makeClient();
      client.__setSkillConfig(configWith({ properties: {} }, null));
      client.__setPublishedRelease(5, {
        apiEndpoints: {
          runtimeMetadata: {
            runtimeType: 'document_markdown_writer',
            outputParams: { artifact: { description: 'artifact_ref' } },
          },
        },
      });

      const contract = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'custom_skill',
        skillVersion: '5',
      });

      expect(contract.outputSchema).toEqual({
        type: 'object',
        properties: { artifact: { description: 'artifact_ref' } },
        required: ['artifact'],
        additionalProperties: true,
      });
    });

    it('still rejects a release with an EMPTY outputParams (no fields to bind, P0 §15.1)', async () => {
      const client = makeClient();
      client.__setSkillConfig(
        configWith({ properties: { a: { type: 'string' } } }, { type: 'object', properties: { live: { type: 'string' } } })
      );
      client.__setPublishedRelease(6, { paramsSchema: { properties: { a: { type: 'string' } } }, workflowDsl: { outputParams: {} } });
      await expect(
        service.resolveContract(client, {
          nodeId: 'n1',
          kind: 'skill',
          skillId: 'custom_skill',
          skillVersion: '6',
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'CAPABILITY_CONTRACT_NOT_FOUND',
          details: expect.objectContaining({
            reason: expect.stringContaining("version '6' carries no output schema"),
          }),
        }),
      });
    });

    it('returns null input schema when paramsSchema is empty or malformed (fail-open)', async () => {
      const client = makeClient();
      client.__setSkillConfig(
        configWith({ properties: {}, required: [] }, { type: 'object', properties: { result: { type: 'string' } } })
      );
      const empty = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'custom_skill',
      });
      expect(empty.inputSchema).toBeNull();

      client.__setSkillConfig(configWith(null, { type: 'object', properties: { result: { type: 'string' } } }));
      const malformed = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'custom_skill',
      });
      expect(malformed.inputSchema).toBeNull();
    });

    it('ignores required fields not present in properties', async () => {
      const client = makeClient();
      client.__setSkillConfig(
        configWith(
          { properties: { a: { type: 'string' } }, required: ['a', 'ghost'] },
          { type: 'object', properties: {} }
        )
      );
      const contract = await service.resolveContract(client, {
        nodeId: 'n1',
        kind: 'skill',
        skillId: 'custom_skill',
      });
      expect(contract.inputSchema?.required).toEqual(['a']);
    });
  });

  describe('computeContractDigest — shared contract-envelope semantics (fix ④)', () => {
    const inputSchema = { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] };
    const outputSchema = { type: 'object', properties: { data: { type: 'string' } } };
    const node = (over: Record<string, unknown> = {}) => ({
      kind: 'skill',
      nodeId: 'n1',
      skillId: 'tavily_search',
      skillVersion: '1.2.0',
      ...over,
    });

    it('is stable across schema property insertion order', () => {
      const a = service.computeContractDigest(
        node(),
        { inputSchema, outputSchema: { type: 'object', properties: { x: { type: 'string' }, y: { type: 'number' } } }, sourceType: 'builtin_skill' }
      );
      const b = service.computeContractDigest(
        node(),
        { inputSchema, outputSchema: { type: 'object', properties: { y: { type: 'number' }, x: { type: 'string' } } }, sourceType: 'builtin_skill' }
      );
      expect(a).toBe(b);
      expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it('changes when the INPUT contract changes (the old output-only digest could not)', () => {
      const withQ = service.computeContractDigest(node(), { inputSchema, outputSchema, sourceType: 'builtin_skill' });
      const withoutQ = service.computeContractDigest(
        node(),
        { inputSchema: { type: 'object', properties: {} }, outputSchema, sourceType: 'builtin_skill' }
      );
      expect(withoutQ).not.toBe(withQ);
    });

    it('changes when the output contract changes', () => {
      const v1 = service.computeContractDigest(node(), { inputSchema, outputSchema, sourceType: 'builtin_skill' });
      const v2 = service.computeContractDigest(
        node(),
        { inputSchema, outputSchema: { type: 'object', properties: { data: { type: 'number' } } }, sourceType: 'builtin_skill' }
      );
      expect(v2).not.toBe(v1);
    });

    it('changes when the pinned version changes', () => {
      const v120 = service.computeContractDigest(node(), { inputSchema, outputSchema, sourceType: 'builtin_skill' });
      const v130 = service.computeContractDigest(
        node({ skillVersion: '1.3.0' }),
        { inputSchema, outputSchema, sourceType: 'builtin_skill' }
      );
      expect(v130).not.toBe(v120);
    });

    it('mirrors the shared package function for an identical envelope (semantic alignment)', async () => {
      const { computeContractDigest: sharedDigest } = await import('@ops/backend-runtime-capability-contract');
      const digest = service.computeContractDigest(
        node({ skillVersion: '1.2.0', skillId: 'tavily_search' }),
        { inputSchema, outputSchema, sourceType: 'builtin_skill' }
      );
      const expected = sharedDigest({
        apiVersion: 'ops-automation/v2',
        kind: 'Capability',
        metadata: { id: 'tavily_search', version: '1.2.0', sourceType: 'builtin_skill' },
        contracts: { input: { schema: inputSchema }, output: { schema: outputSchema } },
        runtime: { type: 'builtin_handler' },
      } as any);
      expect(digest).toBe(expected);
    });

    it('covers llm_operation nodes with their registry metadata', () => {
      const digest = service.computeContractDigest(
        { kind: 'llm_operation', nodeId: 'op1', operationId: 'summarize_text', promptTemplateVersion: '3' },
        { inputSchema: null, outputSchema, sourceType: 'llm_operation' }
      );
      expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(digest).not.toBe(
        service.computeContractDigest(
          { kind: 'llm_operation', nodeId: 'op1', operationId: 'summarize_text', promptTemplateVersion: '4' },
          { inputSchema: null, outputSchema, sourceType: 'llm_operation' }
        )
      );
    });

    it('normalizes custom_skill to published_skill in digest envelope', () => {
      const customDigest = service.computeContractDigest(
        node(),
        { inputSchema, outputSchema, sourceType: 'custom_skill' as any }
      );
      const publishedDigest = service.computeContractDigest(
        node(),
        { inputSchema, outputSchema, sourceType: 'published_skill' }
      );
      expect(customDigest).toBe(publishedDigest);
    });
  });

  describe('llm_operation — new catalog endpoint with digest validation', () => {
    const opNode = (over: Record<string, unknown> = {}) => ({
      nodeId: 'op1',
      kind: 'llm_operation',
      operationId: 'summarize_text',
      promptTemplateId: 'summarize_text:1',
      promptTemplateVersion: '1',
      ...over,
    });

    beforeEach(() => {
      axiosGet.mockReset();
      axiosGet.mockResolvedValue({
        data: {
          capabilityRef: {
            id: 'summarize_text',
            version: '1',
            digest: 'sha256:abc123def456',
          },
          inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
          outputSchema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
        },
      } as any);
    });

    it('calls the new catalog endpoint /ai/internal/operations/catalog/:operationId', async () => {
      await service.resolveContract({} as any, opNode());
      expect(axiosGet).toHaveBeenCalledWith(
        expect.stringContaining('/ai/internal/operations/catalog/'),
        expect.any(Object)
      );
    });

    it('returns llm_operation sourceType and schemas from catalog', async () => {
      const contract = await service.resolveContract({} as any, opNode());
      expect(contract.sourceType).toBe('llm_operation');
      expect(contract.outputSchema).toEqual(
        expect.objectContaining({ properties: expect.objectContaining({ summary: { type: 'string' } }) })
      );
      expect(contract.inputSchema).toEqual(
        expect.objectContaining({ properties: expect.objectContaining({ text: { type: 'string' } }) })
      );
    });

    it('ignores planner-authored operationDigest and returns catalog authority', async () => {
      const contract = await service.resolveContract(
        {} as any,
        opNode({ operationDigest: 'sha256:different' }),
      );
      expect(contract.capabilityRef).toEqual({
        id: 'summarize_text',
        version: '1',
        digest: 'sha256:abc123def456',
      });
    });

    it('accepts when operationDigest pin matches catalog digest', async () => {
      const contract = await service.resolveContract({} as any, opNode({ operationDigest: 'sha256:abc123def456' }));
      expect(contract.outputSchema).not.toBeNull();
    });

    it('accepts legacy promptTemplateVersion pin matching catalog version', async () => {
      const contract = await service.resolveContract({} as any, opNode({ promptTemplateVersion: '1' }));
      expect(contract.outputSchema).not.toBeNull();
    });

    it('ignores legacy planner version and returns the activated catalog version', async () => {
      const contract = await service.resolveContract(
        {} as any,
        opNode({ promptTemplateVersion: '2' }),
      );
      expect(contract.capabilityRef?.version).toBe('1');
    });
  });
});
