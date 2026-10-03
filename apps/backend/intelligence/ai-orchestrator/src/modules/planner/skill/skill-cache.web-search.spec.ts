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

  it('compiles contrastive positive and negative signals onto user skills automatically', async () => {
    mockedGet.mockImplementation((url: string) => {
      if (url.endsWith('/internal/builtin-skills/catalog')) {
        return Promise.resolve({ data: { capabilities: [] } });
      }
      if (url.endsWith('/skills')) {
        return Promise.resolve({
          data: {
            skills: [
              {
                id: 'skill-login',
                name: '登录并且调用ai',
                description: '登录指定的业务系统并调用智能AI问答助手完成业务流',
                triggerKeywords: ['登录', '调用ai'],
              },
              {
                id: 'skill-kb',
                name: '知识库检索',
                description: '在企业专属知识库中检索业务问答文档与规范',
                triggerKeywords: ['知识库', '检索'],
              },
            ],
          },
        });
      }
      return Promise.reject(new Error(`unexpected URL: ${url}`));
    });

    const skills = await new SkillCacheService().loadAvailableSkills(
      'Bearer user-token',
      'trace-contrastive',
      undefined,
      false
    );

    expect(skills.length).toBe(2);
    const loginSkill = skills.find((s) => s.skillId === 'skill-login')!;
    const kbSkill = skills.find((s) => s.skillId === 'skill-kb')!;

    expect(loginSkill).toBeDefined();
    expect(kbSkill).toBeDefined();

    const loginMeta = loginSkill.apiEndpoints?.runtimeMetadata as any;
    const kbMeta = kbSkill.apiEndpoints?.runtimeMetadata as any;

    expect(loginMeta.routingAliases).toContain('登录');
    expect(loginMeta.negativeKeywords).toContain('安装方法');
    expect(loginMeta.negativeKeywords).toContain('知识库');

    expect(kbMeta.routingAliases).toContain('知识库');
    expect(kbMeta.negativeKeywords).toContain('安装方法');
    expect(kbMeta.negativeKeywords).toContain('登录');
  });

  it('strictly isolates cache and contrastive compilation across employees with different permissions', async () => {
    mockedGet.mockImplementation((url: string, config?: any) => {
      if (url.endsWith('/internal/builtin-skills/catalog')) {
        return Promise.resolve({ data: { capabilities: [] } });
      }
      if (url.endsWith('/skills')) {
        const userId = config?.headers?.['x-user-id'];
        if (userId === 'user-alice') {
          return Promise.resolve({
            data: {
              skills: [
                {
                  id: 'skill-login',
                  name: '登录并且调用ai',
                  description: '运维登录',
                  triggerKeywords: ['登录'],
                },
              ],
            },
          });
        }
        if (userId === 'user-bob') {
          return Promise.resolve({
            data: {
              skills: [
                {
                  id: 'skill-salary',
                  name: '查询员工薪资',
                  description: 'HR薪资',
                  triggerKeywords: ['薪资'],
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: { skills: [] } });
      }
      return Promise.reject(new Error(`unexpected URL: ${url}`));
    });

    const cacheService = new SkillCacheService();

    // 1. Alice loads skills: only sees skill-login
    const aliceSkills = await cacheService.loadAvailableSkills(
      'Bearer shared-token',
      'trace-alice',
      undefined,
      false,
      'user-alice'
    );
    expect(aliceSkills.length).toBe(1);
    expect(aliceSkills[0]?.skillId).toBe('skill-login');

    // 2. Bob loads skills: only sees skill-salary
    const bobSkills = await cacheService.loadAvailableSkills(
      'Bearer shared-token',
      'trace-bob',
      undefined,
      false,
      'user-bob'
    );
    expect(bobSkills.length).toBe(1);
    expect(bobSkills[0]?.skillId).toBe('skill-salary');

    // 3. Alice loads skills again from cache: still only sees skill-login
    const aliceCached = await cacheService.loadAvailableSkills(
      'Bearer shared-token',
      'trace-alice-2',
      undefined,
      false,
      'user-alice'
    );
    expect(aliceCached.length).toBe(1);
    expect(aliceCached[0]?.skillId).toBe('skill-login');
  });
});
