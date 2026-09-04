import axios from 'axios';
import { SkillCacheService } from './skill-cache.service';

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const mockedGet = axios.get as jest.Mock;

const catalogResponse = {
  data: {
    capabilities: [
      {
        capabilityRef: {
          source: 'builtin_skill',
          id: 'platform.search.web',
          version: '1.0.0',
        },
        displayName: '内置联网搜索',
        description: '搜索公开互联网',
        runtimeType: 'workflow',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: '搜索词' } },
          required: ['query'],
        },
        outputSchema: { type: 'object' },
        runtimeHints: { triggerKeywords: ['联网搜索'] },
      },
    ],
  },
};

describe('SkillCacheService web search visibility', () => {
  beforeEach(() => {
    mockedGet.mockImplementation((url: string) => {
      if (url.endsWith('/internal/builtin-skills/catalog')) {
        return Promise.resolve(catalogResponse);
      }
      if (url.endsWith('/skills')) return Promise.resolve({ data: { skills: [] } });
      return Promise.reject(new Error(`unexpected URL: ${url}`));
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('hides the built-in search skill when networking is disabled', async () => {
    const skills = await new SkillCacheService().loadAvailableSkills(
      'Bearer test',
      'trace-1',
      undefined,
      false
    );

    expect(skills.some((skill) => skill.skillId === 'platform.search.web')).toBe(false);
  });

  it('exposes the built-in search skill when networking is enabled', async () => {
    const skills = await new SkillCacheService().loadAvailableSkills(
      'Bearer test',
      'trace-1',
      undefined,
      true
    );

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: 'platform.search.web',
          skillName: '内置联网搜索',
        }),
      ])
    );
  });
});
