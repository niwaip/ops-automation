import { SkillContrastiveCompilerService } from './skill-contrastive-compiler.service';
import { SkillConfigDto } from './interfaces';

describe('SkillContrastiveCompilerService', () => {
  let service: SkillContrastiveCompilerService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      skillConfig: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new SkillContrastiveCompilerService(mockPrisma);
  });

  const mockSkills: SkillConfigDto[] = [
    {
      id: 'skill-login-ai',
      name: '登录并且调用ai',
      description: '登录指定的业务系统并调用智能AI问答助手完成业务流',
      triggerKeywords: ['登录', '调用ai'],
      paramsSchema: { properties: {}, required: [] },
      executionFlowTemplateIds: [],
      executionFlow: [],
      tools: ['browser_action'],
      effectiveTools: ['browser_action'],
      isActive: true,
      isPublished: true,
      apiEndpoints: {
        runtimeMetadata: {
          routingAliases: ['登录AI'],
        },
      },
    },
    {
      id: 'skill-kb-search',
      name: '知识库检索',
      description: '在企业专属知识库中检索业务问答文档与规范',
      triggerKeywords: ['知识库', '文档检索'],
      paramsSchema: { properties: {}, required: [] },
      executionFlowTemplateIds: [],
      executionFlow: [],
      tools: ['kb_tool'],
      effectiveTools: ['kb_tool'],
      isActive: true,
      isPublished: true,
      apiEndpoints: {
        runtimeMetadata: {
          routingAliases: ['文档检索'],
        },
      },
    },
  ];

  it('compiles contrastive positive and negative signals across user skills', async () => {
    const profiles = await service.compileSkills(mockSkills);

    const loginProfile = profiles.get('skill-login-ai')!;
    const kbProfile = profiles.get('skill-kb-search')!;

    expect(loginProfile).toBeDefined();
    expect(kbProfile).toBeDefined();

    // Positive signals should capture unique actions
    expect(loginProfile.positiveSignals).toContain('登录');
    expect(kbProfile.positiveSignals).toContain('知识库');

    // Negative signals should include guide/installation defense
    expect(loginProfile.negativeSignals).toContain('安装方法');
    expect(loginProfile.negativeSignals).toContain('使用教程');
    expect(kbProfile.negativeSignals).toContain('安装方法');

    // Peer collision protection
    expect(loginProfile.negativeSignals).toEqual(
      expect.arrayContaining(['知识库', '文档检索'])
    );
    expect(kbProfile.negativeSignals).toEqual(
      expect.arrayContaining(['登录', '调用ai'])
    );
  });

  it('persists compiled profiles into skill_configs table', async () => {
    mockPrisma.skillConfig.findUnique.mockImplementation(({ where }: any) => {
      const skill = mockSkills.find((s) => s.id === where.id);
      return Promise.resolve(skill ? { id: skill.id, apiEndpoints: skill.apiEndpoints } : null);
    });

    mockPrisma.skillConfig.update.mockResolvedValue({});

    const profiles = await service.compileSkills(mockSkills);
    await service.persistCompiledProfiles(profiles);

    expect(mockPrisma.skillConfig.update).toHaveBeenCalledTimes(2);

    const updateCallForLogin = mockPrisma.skillConfig.update.mock.calls.find(
      (call: any) => call[0].where.id === 'skill-login-ai'
    );
    expect(updateCallForLogin).toBeDefined();
    const updatedMetadata = updateCallForLogin[0].data.apiEndpoints.runtimeMetadata;
    expect(updatedMetadata.routingAliases).toContain('登录');
    expect(updatedMetadata.negativeKeywords).toContain('安装方法');
  });

  it('gracefully falls back to deterministic profiles when AI compilation fails', async () => {
    // When useAi is true but endpoint is not reachable, fallback is seamless
    const profiles = await service.compileSkills(mockSkills, { useAi: true });
    expect(profiles.size).toBe(2);
    expect(profiles.get('skill-login-ai')?.positiveSignals).toContain('登录');
  });
});
