import { CapabilityCandidateSelectorService } from './capability-candidate-selector.service';

describe('CapabilityCandidateSelectorService', () => {
  let service: CapabilityCandidateSelectorService;

  beforeEach(() => {
    service = new CapabilityCandidateSelectorService();
  });

  it('uses Platform publishedReleaseVersion as the executable Skill version', () => {
    const result = service.selectCandidates('搜索新闻并总结成 md 文件', [
      {
        id: 'skill-search',
        name: '搜索新闻',
        description: '搜索最新新闻',
        executionType: 'query',
        paramsSchema: {
          properties: {
            query: { type: 'string' },
            apiKey: { type: 'string' },
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
  });

  it('encodes enum and defaultValue into the inputs summary string for downstream enum validation', () => {
    const result = service.selectCandidates('搜索新闻', [
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

  it('omits defaultValue bracket when default is not part of enum', () => {
    const result = service.selectCandidates('搜索新闻', [
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

  it('skips skills whose published release is not executable', () => {
    const result = service.selectCandidates('生成文档', [
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
});
