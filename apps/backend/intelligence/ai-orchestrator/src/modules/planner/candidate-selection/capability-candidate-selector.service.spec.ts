import { CapabilityCandidateSelectorService } from './capability-candidate-selector.service';
import { LlmOperationCatalogProjector } from '../../llm-operation/llm-operation-catalog.projector';
import type { LlmOperationCatalogProjection } from '../../llm-operation/llm-operation-catalog.projector';

describe('CapabilityCandidateSelectorService', () => {
  let service: CapabilityCandidateSelectorService;
  let mockProjector: jest.Mocked<LlmOperationCatalogProjector>;

  const createMockProjection = (id: string, displayName: string): LlmOperationCatalogProjection => ({
    capabilityRef: {
      id,
      version: '1.0.0',
      digest: 'test-digest',
      contractDigest: 'test-contract-digest',
    },
    capabilityKind: 'llm_operation',
    displayName,
    summary: `Summary for ${displayName}`,
    goals: [`goal_${id}`],
    inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { output: { type: 'string' } } },
    runtime: { type: 'llm_operation' },
    lifecycle: { status: 'active' },
    governance: {},
  });

  beforeEach(() => {
    mockProjector = {
      projectAll: jest.fn(),
      projectOne: jest.fn(),
    } as any;

    service = new CapabilityCandidateSelectorService(mockProjector);
  });

  it('uses Platform publishedReleaseVersion as the executable Skill version', async () => {
    const result = await service.selectCandidates('搜索新闻并总结成 md 文件', [
      {
        id: 'skill-search',
        name: '搜索新闻',
        description: '搜索最新新闻',
        executionType: 'query',
        paramsSchema: {
          properties: {
            query: { type: 'string' },
            apiKey: { type: 'string', default: 'must-not-leak' },
          },
        },
        outputParams: { properties: { results: { valueType: 'news_item_list' } } },
        isPublished: true,
        publishedReleaseVersion: 7,
        publishedReleaseStatus: 'published',
        publishedDeploymentStatus: 'deployed',
      },
    ]);

    expect(result.skillCards).toHaveLength(1);
    expect(result.skillCards[0]).toMatchObject({
      id: 'skill-search',
      publishedSkillId: 'skill-search',
      executableVersion: '7',
      category: 'api',
    });
    expect(result.skillCards[0]!.inputs).toEqual({ query: 'string' });
    expect(JSON.stringify(result.skillCards[0])).not.toContain('must-not-leak');
  });

  it('keeps valid candidates in catalog order instead of applying keyword intent rules', async () => {
    const skills = ['alpha', 'web-search', 'omega'].map((id) => ({
      id,
      name: id,
      description: id === 'web-search' ? '搜索互联网' : '其他能力',
      executionType: 'query',
      paramsSchema: { properties: { query: { type: 'string' } } },
      outputSchema: { properties: { result: { type: 'string' } } },
      isPublished: true,
      publishedReleaseVersion: 1,
      publishedReleaseStatus: 'published',
      publishedDeploymentStatus: 'deployed',
    }));

    const result = await service.selectCandidates('搜索新闻', skills);

    expect(result.skillCards.map((card) => card.id)).toEqual([
      'alpha',
      'web-search',
      'omega',
    ]);
  });

  it('keeps an explicitly requested user capability when the 12-card cap is active', async () => {
    const skills = Array.from({ length: 13 }, (_, index) => ({
      id: index === 12 ? 'bark-push' : `generic-${index}`,
      name: index === 12 ? 'Bark推送服务' : `通用能力 ${index}`,
      description: index === 12 ? '通过 Bark 将内容推送到设备' : '通用处理能力',
      executionType: 'flow',
      paramsSchema: { properties: { content: { type: 'string' } } },
      outputSchema: { properties: { result: { type: 'string' } } },
      isPublished: true,
      publishedReleaseVersion: 1,
      publishedReleaseStatus: 'published',
      publishedDeploymentStatus: 'deployed',
    }));

    const result = await service.selectCandidates('总结后最后用 Bark 进行推送', skills);

    expect(result.skillCards).toHaveLength(12);
    expect(result.skillCards[0]?.id).toBe('bark-push');
  });

  it('encodes enum and defaultValue into the inputs summary string for downstream enum validation', async () => {
    const result = await service.selectCandidates('搜索新闻', [
      {
        id: 'skill-search',
        name: '搜索新闻',
        description: '搜索最新新闻',
        executionType: 'query',
        paramsSchema: {
          properties: {
            query: { type: 'string' },
            topic: {
              type: 'string',
              enum: ['general', 'news', 'finance'],
              default: 'general',
            },
          },
        },
        outputParams: { properties: { results: { valueType: 'news_item_list' } } },
        isPublished: true,
        publishedReleaseVersion: 1,
        publishedReleaseStatus: 'published',
        publishedDeploymentStatus: 'deployed',
      },
    ]);

    // 无 enum 的参数仍返纯 type string（向后兼容）
    expect(result.skillCards[0]!.inputs.query).toBe('string');
    // 带 enum 的参数编码成 'type[enum=...][default=...]'
    expect(result.skillCards[0]!.inputs.topic).toBe(
      'string[enum=general,news,finance][default=general]'
    );
  });

  it('omits defaultValue bracket when default is not part of enum', async () => {
    const result = await service.selectCandidates('搜索新闻', [
      {
        id: 'skill-search-bad-default',
        name: '搜索新闻',
        description: '搜索最新新闻',
        executionType: 'query',
        paramsSchema: {
          properties: {
            topic: {
              type: 'string',
              enum: ['general', 'news', 'finance'],
              default: 'invalid_default',
            },
          },
        },
        outputParams: { properties: { results: { valueType: 'news_item_list' } } },
        isPublished: true,
        publishedReleaseVersion: 1,
        publishedReleaseStatus: 'published',
        publishedDeploymentStatus: 'deployed',
      },
    ]);

    expect(result.skillCards[0]!.inputs.topic).toBe(
      'string[enum=general,news,finance]'
    );
  });

  describe('decodeSchemaSummaryEnum', () => {
    it('decodes enum and defaultValue from encoded summary string', () => {
      const decoded = CapabilityCandidateSelectorService.decodeSchemaSummaryEnum(
        'string[enum=general,news,finance][default=general]'
      );
      expect(decoded.enumValues).toEqual(['general', 'news', 'finance']);
      expect(decoded.defaultValue).toBe('general');
    });

    it('returns empty when summary has no enum bracket', () => {
      const decoded = CapabilityCandidateSelectorService.decodeSchemaSummaryEnum('string');
      expect(decoded.enumValues).toBeUndefined();
      expect(decoded.defaultValue).toBeUndefined();
    });

    it('parses numeric enum values as numbers', () => {
      const decoded = CapabilityCandidateSelectorService.decodeSchemaSummaryEnum(
        'number[enum=1,2,3][default=1]'
      );
      expect(decoded.enumValues).toEqual([1, 2, 3]);
      expect(decoded.defaultValue).toBe(1);
    });

    it('returns empty for non-string input', () => {
      const decoded = CapabilityCandidateSelectorService.decodeSchemaSummaryEnum(undefined as any);
      expect(decoded.enumValues).toBeUndefined();
    });
  });

  it('skips skills whose published release is not executable', async () => {
    const result = await service.selectCandidates('生成文档', [
      {
        id: 'draft-skill',
        name: '未部署能力',
        executionType: 'flow',
        publishedReleaseVersion: 1,
        publishedReleaseStatus: 'draft',
        publishedDeploymentStatus: 'pending',
      },
    ]);

    expect(result.skillCards).toHaveLength(0);
  });

  it('excludes custom skills WITHOUT an authoritative output schema (P0 §15.1)', async () => {
    const result = await service.selectCandidates('搜索新闻', [
      {
        id: 'schema-less-skill',
        name: '无 Schema 能力',
        description: '缺少输出 Schema 的自定义能力',
        executionType: 'query',
        paramsSchema: { properties: { query: { type: 'string' } } },
        isPublished: true,
        publishedReleaseVersion: 2,
        publishedReleaseStatus: 'published',
        publishedDeploymentStatus: 'deployed',
        // no outputSchema, no outputParams, no runtimeMetadata.outputParams
      },
    ]);

    expect(result.skillCards).toHaveLength(0);
  });

  it('accepts custom skills carrying the authoritative outputSchema from the enriched DTO', async () => {
    const result = await service.selectCandidates('搜索新闻', [
      {
        id: 'schema-full-skill',
        name: '有 Schema 能力',
        description: '携带权威输出 Schema',
        executionType: 'query',
        paramsSchema: { properties: { query: { type: 'string' } } },
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          properties: { results: { type: 'array' } },
        },
        isPublished: true,
        publishedReleaseVersion: 3,
        publishedReleaseStatus: 'published',
        publishedDeploymentStatus: 'deployed',
      },
    ]);

    expect(result.skillCards).toHaveLength(1);
    // The authoritative DTO schema is preferred over legacy projections
    expect(result.skillCards[0]!.outputs).toEqual({
      results: 'news_item_list',
    });
  });

  it('keeps builtin skills without a local output schema (catalog resolves at freeze)', async () => {
    const result = await service.selectCandidates('生成文档', [
      {
        id: 'platform.document.markdown-artifact-writer',
        name: '文档写入',
        description: 'builtin 能力',
        executionType: 'flow',
        isPublished: true,
        publishedReleaseVersion: 1,
        publishedReleaseStatus: 'published',
        publishedDeploymentStatus: 'deployed',
      },
    ]);

    expect(result.skillCards).toHaveLength(1);
  });

  it('keeps physical artifact fields separate from their semantic type', async () => {
    const result = await service.selectCandidates('生成 Markdown 文件', [
      {
        id: 'platform.document.markdown-artifact-writer',
        name: '内置 Markdown 文件生成',
        description: '生成可下载文件',
        executionType: 'artifact',
        source: 'builtin_skill',
        paramsSchema: { properties: { content: { type: 'string' } } },
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
      },
    ]);

    expect(result.skillCards[0]).toMatchObject({
      outputs: { artifact: 'artifact_ref', artifacts: 'json' },
      primaryOutput: 'artifact',
      supportsArtifactOutput: true,
    });
  });

  it('recognizes legacy ArtifactRef object shape without converting its field name', async () => {
    const result = await service.selectCandidates('生成文件', [
      {
        id: 'legacy-artifact-writer',
        name: 'Legacy Artifact Writer',
        description: '旧版但具备标准 ArtifactRef 结构',
        executionType: 'artifact',
        source: 'builtin_skill',
        outputSchema: {
          type: 'object',
          properties: {
            download: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                url: { type: 'string' },
                mimeType: { type: 'string' },
              },
            },
          },
        },
      },
    ]);

    expect(result.skillCards[0]!.outputs).toEqual({ download: 'artifact_ref' });
    expect(result.skillCards[0]!.supportsArtifactOutput).toBe(true);
  });

  it('does not turn JSON Schema keywords into phantom output fields', async () => {
    const result = await service.selectCandidates('空输出测试', [
      {
        id: 'empty-output-builtin',
        name: 'Empty Output',
        source: 'builtin_skill',
        outputSchema: {
          type: 'object',
          required: [],
          additionalProperties: false,
        },
      },
    ]);

    expect(result.skillCards[0]!.outputs).toEqual({});
  });

  describe('LLM Operation Cards from Catalog Projector', () => {
    it('should return the four active system LLM Operation cards from projector', async () => {
      const projections: LlmOperationCatalogProjection[] = [
        createMockProjection('extract_structured_fields', '结构化字段提取'),
        createMockProjection('summarize_list', '列表摘要'),
        createMockProjection('summarize_text', '文本摘要'),
        createMockProjection('transform_text', '文本处理'),
      ];

      mockProjector.projectAll.mockResolvedValue(projections);

      const result = await service.selectCandidates('test request', []);

      expect(result.llmOperationCards).toHaveLength(4);
      expect(result.skillCards).toHaveLength(0);
    });

    it('should map projection fields to card fields correctly', async () => {
      const projection = createMockProjection('test_operation', 'Test Operation');
      mockProjector.projectAll.mockResolvedValue([projection]);

      const result = await service.selectCandidates('test request', []);

      expect(result.llmOperationCards).toHaveLength(1);
      const card = result.llmOperationCards[0];

      expect(card!.id).toBe('test_operation');
      expect(card!.kind).toBe('llm_operation');
      expect(card!.displayName).toBe('Test Operation');
      expect(card!.summary).toBe('Summary for Test Operation');
      expect(card!.goals).toEqual(['goal_test_operation']);
      expect(card).toMatchObject({
        executableVersion: '1.0.0',
        operationDigest: 'test-digest',
        contractDigest: 'test-contract-digest',
      });
    });

    it('should return empty array when projector throws error', async () => {
      const error = new Error('Projector error');
      mockProjector.projectAll.mockImplementation(() => {
        throw error;
      });

      const result = await service.selectCandidates('test request', []);

      expect(result.llmOperationCards).toEqual([]);
    });

    it('should return empty array when projector is not available', async () => {
      const serviceWithoutProjector = new CapabilityCandidateSelectorService(undefined as any);

      const result = await serviceWithoutProjector.selectCandidates('test request', []);

      expect(result.llmOperationCards).toEqual([]);
    });

    it('should extract input and output schema from projection', async () => {
      const projection: LlmOperationCatalogProjection = {
        capabilityRef: {
          id: 'test_op',
          version: '1.0.0',
          digest: 'digest',
          contractDigest: 'contract-digest',
        },
        capabilityKind: 'llm_operation',
        displayName: 'Test',
        summary: 'Test summary',
        goals: ['test'],
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            count: { type: 'number' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            result: { type: 'string' },
          },
        },
        runtime: { type: 'llm_operation' },
        lifecycle: { status: 'active' },
        governance: {},
      };

      mockProjector.projectAll.mockResolvedValue([projection]);

      const result = await service.selectCandidates('test request', []);

      expect(result.llmOperationCards).toHaveLength(1);
      const card = result.llmOperationCards[0];

      expect(card!.inputs).toHaveProperty('text');
      expect(card!.inputs).toHaveProperty('count');
      expect(card!.outputs).toHaveProperty('result');
    });

    it('preserves deterministic LLM input roles and schema constraints', async () => {
      const projection = createMockProjection('transform_text', '文本处理');
      projection.inputSchema = {
        type: 'object',
        required: ['content', 'instruction'],
        properties: {
          content: { type: 'string', 'x-ops-input-role': 'content' },
          instruction: {
            type: 'string',
            maxLength: 2000,
            'x-ops-input-role': 'instruction',
          },
        },
      };
      mockProjector.projectAll.mockResolvedValue([projection]);

      const result = await service.selectCandidates('翻译成日语', []);
      const rawSchema = (result.llmOperationCards[0] as any)?._rawInputSchema;

      expect(rawSchema.properties).toEqual({
        content: { type: 'string', 'x-ops-input-role': 'content' },
        instruction: {
          type: 'string',
          maxLength: 2000,
          'x-ops-input-role': 'instruction',
        },
      });
    });

    it('should handle null schemas gracefully', async () => {
      const projection: LlmOperationCatalogProjection = {
        capabilityRef: {
          id: 'test_op',
          version: '1.0.0',
          digest: 'digest',
          contractDigest: 'contract-digest',
        },
        capabilityKind: 'llm_operation',
        displayName: 'Test',
        summary: 'Test summary',
        goals: ['test'],
        inputSchema: null,
        outputSchema: null,
        runtime: { type: 'llm_operation' },
        lifecycle: { status: 'active' },
        governance: {},
      };

      mockProjector.projectAll.mockResolvedValue([projection]);

      const result = await service.selectCandidates('test request', []);

      expect(result.llmOperationCards).toHaveLength(1);
      const card = result.llmOperationCards[0];

      expect(card!.inputs).toEqual({});
      expect(card!.outputs).toEqual({});
    });

    it('should return 0 skill cards and 6 llm operation cards when availableSkills is empty', async () => {
      const projections: LlmOperationCatalogProjection[] = [
        createMockProjection('op1', 'Op 1'),
        createMockProjection('op2', 'Op 2'),
        createMockProjection('op3', 'Op 3'),
        createMockProjection('op4', 'Op 4'),
        createMockProjection('op5', 'Op 5'),
        createMockProjection('op6', 'Op 6'),
      ];

      mockProjector.projectAll.mockResolvedValue(projections);

      const result = await service.selectCandidates('test request', []);

      expect(result.skillCards).toHaveLength(0);
      expect(result.llmOperationCards).toHaveLength(6);
    });

    it('should process skill cards independently of llm operation cards', async () => {
      const projection = createMockProjection('test_op', 'Test Op');
      mockProjector.projectAll.mockResolvedValue([projection]);

      const availableSkills = [
        {
          id: 'skill1',
          skillId: 'skill1',
          skillName: 'Skill 1',
          description: 'Test skill',
          outputSchema: { result: 'string' },
          isPublished: true,
          publishedReleaseStatus: 'published',
          publishedDeploymentStatus: 'deployed',
        },
      ];

      const result = await service.selectCandidates('test request', availableSkills);

      expect(result.skillCards).toHaveLength(1);
      expect(result.llmOperationCards).toHaveLength(1);
    });
  });
});
