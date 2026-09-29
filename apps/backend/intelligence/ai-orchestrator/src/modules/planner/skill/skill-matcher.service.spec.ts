import axios from 'axios';
import { SkillMatcherService } from './skill-matcher.service';

jest.mock('axios');

describe('SkillMatcherService deterministic explicit routing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('matches a distinctive Skill name before calling the LLM matcher', async () => {
    const service = new SkillMatcherService({} as any);
    const result = await service.matchSkill({
      userInput: '用 bark 推送',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'skill-bark',
          executableVersion: '2.1.0',
          skillName: 'Bark推送服务',
          description: '向用户设备推送消息',
          triggerKeywords: ['bark', '推送'],
          paramsSchema: {
            properties: {
              content: { type: 'string', description: '推送正文', required: true },
            },
            required: ['content'],
          },
        },
        {
          skillId: 'skill-email',
          skillName: '邮件推送服务',
          description: '发送邮件',
          triggerKeywords: ['邮件', '推送'],
          paramsSchema: { properties: {}, required: [] },
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        skillId: 'skill-bark',
        skillVersion: '2.1.0',
        confidence: 0.99,
        matchReason: 'deterministic_routing_signal',
      })
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('routes a subject phrase through the shared deterministic contract', async () => {
    const service = new SkillMatcherService({} as any);
    const result = await service.matchSkill({
      userInput: '上海的天气',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'weather',
          skillName: '天气查询',
          triggerKeywords: ['HTTP 请求'],
          paramsSchema: { properties: {}, required: [] },
        },
        {
          skillId: 'report',
          skillName: '报表查询',
          triggerKeywords: ['报表'],
          paramsSchema: { properties: {}, required: [] },
        },
      ],
    });

    expect(result?.skillId).toBe('weather');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('routes a generic retrieval request to web search when it is the visible search skill', async () => {
    const service = new SkillMatcherService({} as any);
    const result = await service.matchSkill({
      userInput: '检索 deepseek harness 的安装方法',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'platform.search.web',
          executableVersion: '1.0.0',
          skillName: '内置联网搜索',
          description: '检索公开互联网中的最新网页与新闻信息',
          triggerKeywords: ['联网搜索', '检索', '查找资料', '搜索资料'],
          paramsSchema: {
            properties: {
              query: { type: 'string', description: '检索词', required: true },
            },
            required: ['query'],
          },
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        skillId: 'platform.search.web',
        confidence: 0.99,
        matchReason: 'deterministic_routing_signal',
      })
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('routes a find-news request to the default web search skill', async () => {
    const service = new SkillMatcherService({} as any);
    const result = await service.matchSkill({
      userInput: '查找 openclaw 2 的新闻',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'platform.search.web',
          executableVersion: '1.0.3',
          skillName: '内置联网搜索',
          description: '检索公开互联网中的最新网页与新闻信息',
          triggerKeywords: ['联网搜索', '检索', '搜索', '查找', '查询', '新闻'],
          paramsSchema: {
            properties: {
              query: { type: 'string', description: '检索词', required: true },
            },
            required: ['query'],
          },
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        skillId: 'platform.search.web',
        confidence: 0.99,
        matchReason: 'deterministic_routing_signal',
      })
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('preserves provider unavailability as a retryable match outcome', async () => {
    const service = new SkillMatcherService({} as any);
    ((axios as any).isAxiosError as unknown as jest.Mock).mockReturnValueOnce(true);
    (axios.post as jest.Mock).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 503,
        data: { code: 'SKILL_MATCH_MODEL_UNAVAILABLE', retryable: true },
      },
    });

    await expect(
      service.matchSkillAttempt({
        userInput: '未知业务意图',
        userId: 'user-1',
        availableSkills: [
          {
            skillId: 'one',
            skillName: '合同生成',
            triggerKeywords: ['合同'],
            paramsSchema: { properties: {}, required: [] },
          },
        ],
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'unavailable',
        code: 'SKILL_MATCH_MODEL_UNAVAILABLE',
        retryable: true,
      })
    );
  });

  it('does not resolve an ambiguous generic keyword as an explicit Skill', async () => {
    const service = new SkillMatcherService({} as any);
    (axios.post as jest.Mock).mockResolvedValueOnce({ data: { match: null } });

    await service.matchSkill({
      userInput: '推送',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'skill-bark',
          skillName: 'Bark推送服务',
          triggerKeywords: ['推送'],
          paramsSchema: { properties: {}, required: [] },
        },
        {
          skillId: 'skill-email',
          skillName: '邮件推送服务',
          triggerKeywords: ['推送'],
          paramsSchema: { properties: {}, required: [] },
        },
      ],
    });

    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  it('forwards custom modelId to platform skills match endpoint when provided', async () => {
    const service = new SkillMatcherService({} as any);
    (axios.post as jest.Mock).mockResolvedValueOnce({ data: { match: null } });

    await service.matchSkill({
      userInput: '未知业务意图',
      userId: 'user-1',
      modelId: 'custom-selected-model',
      availableSkills: [
        {
          skillId: 'skill-1',
          skillName: '普通技能',
          triggerKeywords: ['普通'],
          paramsSchema: { properties: {}, required: [] },
        },
      ],
    });

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/skills/match'),
      expect.objectContaining({
        modelId: 'custom-selected-model',
      }),
      expect.any(Object)
    );
  });

  it('routes query to web search when web_search_enabled is set in context', async () => {
    const service = new SkillMatcherService({} as any);
    (axios.post as jest.Mock).mockResolvedValueOnce({ data: { match: null } });

    const result = await service.matchSkill({
      userInput: '今天的股市行情',
      userId: 'user-1',
      context: { web_search_enabled: true },
      availableSkills: [
        {
          skillId: 'platform.search.web',
          executableVersion: '1.0.3',
          skillName: '内置联网搜索',
          description: '检索公开互联网中的最新网页与新闻信息',
          triggerKeywords: ['联网搜索', '搜索'],
          paramsSchema: {
            properties: {
              query: { type: 'string', description: '检索词', required: true },
            },
            required: ['query'],
          },
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        skillId: 'platform.search.web',
        confidence: 0.95,
        matchReason: 'web_search_intent',
      })
    );
  });

  it('routes query to web search when generic search directive is present even without context flag', async () => {
    const service = new SkillMatcherService({} as any);
    (axios.post as jest.Mock).mockResolvedValueOnce({ data: { match: null } });

    const result = await service.matchSkill({
      userInput: '搜一下最新的科技进展',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'platform.search.web',
          executableVersion: '1.0.3',
          skillName: '内置联网搜索',
          description: '检索公开互联网中的最新网页与新闻信息',
          triggerKeywords: ['全网检索'],
          paramsSchema: {
            properties: {
              query: { type: 'string', description: '检索词', required: true },
            },
            required: ['query'],
          },
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        skillId: 'platform.search.web',
        confidence: 0.95,
        matchReason: 'web_search_intent',
      })
    );
  });

  it('prioritizes specific skill alias/trigger over generic web search keyword (regression: 登录调用ai vs 查询)', async () => {
    const service = new SkillMatcherService({} as any);
    const result = await service.matchSkill({
      userInput: '登录调用ai  查询deepseek harness的安装方法',
      userId: 'user-1',
      availableSkills: [
        {
          skillId: 'platform.search.web',
          executableVersion: '1.0.3',
          skillName: '内置联网搜索',
          description: '检索公开互联网中的最新网页与新闻信息',
          triggerKeywords: ['联网搜索', '检索', '搜索', '查找', '查询', '新闻'],
          paramsSchema: {
            properties: {
              query: { type: 'string', description: '检索词', required: true },
            },
            required: ['query'],
          },
        },
        {
          skillId: '19d7c3f6-18a2-424a-95b8-82856154daf1',
          executableVersion: '1.0.0',
          skillName: '登录并且调用ai',
          description: '登录指定系统并调用悬浮AI助手进行智能问答',
          triggerKeywords: ['登录并且调用ai', '登录调用ai', '登录并调用ai'],
          apiEndpoints: {
            runtimeMetadata: {
              routingAliases: ['登录并且调用ai', '登录调用ai', '登录并调用ai'],
            },
          },
          paramsSchema: {
            properties: {
              input6TextboxName: { type: 'string', description: '提问内容', required: true },
            },
            required: ['input6TextboxName'],
          },
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        skillId: '19d7c3f6-18a2-424a-95b8-82856154daf1',
        confidence: 0.99,
        matchReason: 'deterministic_routing_signal',
      })
    );
    expect(axios.post).not.toHaveBeenCalled();
  });

  describe('Contrastive Disambiguation & Guide Short-Circuit Regressions', () => {
    const loginSkill = {
      skillId: '19d7c3f6-18a2-424a-95b8-82856154daf1',
      executableVersion: '1.0.0',
      skillName: '登录并且调用ai',
      description: '登录指定系统并调用悬浮AI助手进行智能问答，支持输入用户名密码与提问内容',
      triggerKeywords: ['登录并且调用ai', '登录调用ai'],
      apiEndpoints: {
        runtimeMetadata: {
          routingAliases: ['登录并且调用ai', '登录调用ai', '登录系统AI问答'],
          negativeKeywords: ['安装方法', '安装教程', '怎么安装', '部署教程', '代码写法'],
        },
      },
      paramsSchema: {
        properties: {
          input6TextboxName: { type: 'string', description: '提问内容', required: true },
        },
        required: ['input6TextboxName'],
      },
    };

    const webSearchSkill = {
      skillId: 'platform.search.web',
      executableVersion: '1.0.0',
      skillName: '内置联网搜索',
      description: '检索公开互联网中的最新网页与新闻信息',
      triggerKeywords: ['联网搜索', '检索', '搜索', '查找资料'],
      paramsSchema: {
        properties: {
          query: { type: 'string', description: '检索词', required: true },
        },
        required: ['query'],
      },
    };

    it('Case 1: "deepseek harness的安装方法" is rejected without calling LLM and without allocating browser worker', async () => {
      const service = new SkillMatcherService({} as any);
      const result = await service.matchSkill({
        userInput: 'deepseek harness的安装方法',
        userId: 'user-1',
        availableSkills: [loginSkill as any],
      });

      // Must be null: does NOT match '登录并且调用ai', 0 LLM calls!
      expect(result).toBeNull();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('Case 2: "deepseek harness的安装方法" with web_search_enabled routes to web search rather than browser RPA', async () => {
      const service = new SkillMatcherService({} as any);
      const result = await service.matchSkill({
        userInput: 'deepseek harness的安装方法',
        userId: 'user-1',
        availableSkills: [loginSkill as any, webSearchSkill as any],
        context: { web_search_enabled: true },
      });

      expect(result).not.toBeNull();
      expect(result?.skillId).toBe('platform.search.web');
      expect(result?.matchReason).toBe('web_search_intent');
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('Case 2b: "deepseek harness的安装方法" is guide/inquiry and returns null to route to native LLM rather than execution skill ticket', async () => {
      const workspaceSkill = {
        skillId: 'platform.workspace.explorer',
        executableVersion: '1.0.0',
        skillName: '工作空间文档探索',
        displayName: '工作空间文档探索',
        description: '检索工作空间内部知识与文档',
        triggerKeywords: ['工作空间', '文档探索', '内部资料'],
        category: 'workspace',
        paramsSchema: {
          properties: {
            query: { type: 'string', description: '检索词', required: true },
          },
          required: ['query'],
        },
      };
      const service = new SkillMatcherService({} as any);
      const result = await service.matchSkill({
        userInput: 'deepseek harness的安装方法',
        userId: 'user-1',
        availableSkills: [loginSkill as any, workspaceSkill as any],
        context: { workspace_search_enabled: true },
      });

      // Guide/inquiry question must return null to fall through to native LLM with RAG
      expect(result).toBeNull();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('Case 2c: Explicit "探查工作空间" command routes to workspace knowledge exploration skill', async () => {
      const workspaceSkill = {
        skillId: 'platform.workspace.explorer',
        executableVersion: '1.0.0',
        skillName: '工作空间文档探索',
        displayName: '工作空间文档探索',
        description: '检索工作空间内部知识与文档',
        triggerKeywords: ['工作空间', '文档探索', '内部资料'],
        category: 'workspace',
        paramsSchema: {
          properties: {
            query: { type: 'string', description: '检索词', required: true },
          },
          required: ['query'],
        },
      };
      const service = new SkillMatcherService({} as any);
      const result = await service.matchSkill({
        userInput: '探查工作空间',
        userId: 'user-1',
        availableSkills: [loginSkill as any, workspaceSkill as any],
      });

      expect(result).not.toBeNull();
      expect(result?.skillId).toBe('platform.workspace.explorer');
      expect(result?.matchReason).toMatch(/workspace_knowledge_intent|deterministic_routing_signal/);
    });

    it('Case 3: Explicit positive anchor "登录系统AI问答" deterministically matches with 0.99 confidence', async () => {
      const service = new SkillMatcherService({} as any);
      const result = await service.matchSkill({
        userInput: '请打开登录系统AI问答协助输入',
        userId: 'user-1',
        availableSkills: [loginSkill as any, webSearchSkill as any],
      });

      expect(result).not.toBeNull();
      expect(result?.skillId).toBe('19d7c3f6-18a2-424a-95b8-82856154daf1');
      expect(result?.confidence).toBe(0.99);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('Case 4: Inspecting attachment with 1234 (1).docx does not corrupt userInput or hijack to workspace explorer', async () => {
      const service = new SkillMatcherService({} as any);

      const extractorSkill = {
        skillId: 'platform.document.pdf-content-extractor',
        executableVersion: '1.0.2',
        skillName: '内置文档内容提取',
        description: '从 PDF、PPTX、Word、Markdown 等文档中提取文本',
        triggerKeywords: ['查看附件内容', '提取文档内容', '查看文档'],
        paramsSchema: {
          properties: {
            fileBase64: { type: 'string', required: true },
          },
          required: ['fileBase64'],
        },
      };

      const workspaceSkill = {
        skillId: 'platform.workspace.explorer',
        executableVersion: '1.0.0',
        skillName: '内置工作空间文档探索',
        triggerKeywords: ['工作空间', '文档探索', '内部资料'],
        category: 'workspace',
        paramsSchema: {
          properties: {
            query: { type: 'string', required: true },
          },
          required: ['query'],
        },
      };

      const result = await service.matchSkill({
        userInput: '查看附件内容',
        userId: 'user-1',
        availableSkills: [extractorSkill as any, workspaceSkill as any],
        context: {
          workspace_search_enabled: false,
          workspaceSearch: false,
          files: [{ fileName: '1234 (1).docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
        },
      });

      // Must match document extractor, NEVER workspace explorer
      expect(result).not.toBeNull();
      expect(result?.skillId).toBe('platform.document.pdf-content-extractor');
      expect(result?.skillId).not.toBe('platform.workspace.explorer');
    });

    it('Case 4b: Model skill match receives clean userInput without (附件: ...) pollution', async () => {
      const service = new SkillMatcherService({} as any);
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { match: null } });

      const genericSkill = {
        skillId: 'platform.document.pdf-content-extractor',
        executableVersion: '1.0.2',
        skillName: '内置文档内容提取',
        triggerKeywords: ['完全不匹配的触发词'],
        paramsSchema: {
          properties: { fileBase64: { type: 'string', required: true } },
          required: ['fileBase64'],
        },
      };

      await service.matchSkill({
        userInput: '请帮我看一下',
        userId: 'user-1',
        availableSkills: [genericSkill as any],
        context: {
          workspace_search_enabled: false,
          workspaceSearch: false,
          files: [{ fileName: '1234 (1).docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
        },
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/skills/match'),
        expect.objectContaining({
          userInput: '请帮我看一下',
          context: expect.objectContaining({
            attachmentNames: '1234 (1).docx',
          }),
        }),
        expect.any(Object)
      );
    });

    it('Case 5: Knowledge base skill is not matched when workspaceSearch is disabled', async () => {
      const service = new SkillMatcherService({} as any);
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { match: null } });

      const workspaceSkill = {
        skillId: 'platform.workspace.explorer',
        executableVersion: '1.0.0',
        skillName: '内置工作空间文档探索',
        triggerKeywords: ['探查工作空间', '查看工作空间文件'],
        category: 'workspace',
        paramsSchema: {
          properties: {
            query: { type: 'string', required: true },
          },
          required: ['query'],
        },
      };

      const result = await service.matchSkill({
        userInput: '探查工作空间',
        userId: 'user-1',
        availableSkills: [workspaceSkill as any],
        context: {
          workspace_search_enabled: false,
          workspaceSearch: false,
        },
      });

      expect(result).toBeNull();
    });

    it('Case 6: does not hijack reminder intent to web search even when web_search_enabled is set in context', async () => {
      const service = new SkillMatcherService({} as any);
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { match: null } });

      const result = await service.matchSkill({
        userInput: '提醒今天晚上 9点钟 看电视',
        userId: 'user-1',
        availableSkills: [webSearchSkill as any],
        context: {
          web_search_enabled: true,
          webSearch: true,
        },
      });

      expect(result).toBeNull();
    });

    it('Case 7: does not hijack non-search creative writing request to web search when web_search_enabled is set in context', async () => {
      const service = new SkillMatcherService({} as any);
      (axios.post as jest.Mock).mockResolvedValueOnce({ data: { match: null } });

      const result = await service.matchSkill({
        userInput: '写一首赞美春天的现代诗',
        userId: 'user-1',
        availableSkills: [webSearchSkill as any],
        context: {
          web_search_enabled: true,
          webSearch: true,
        },
      });

      expect(result).toBeNull();
    });

    it('Case 8: matches reminder skill when reminder intent is provided, even with web_search_enabled', async () => {
      const service = new SkillMatcherService({} as any);
      const reminderSkill = {
        skillId: 'platform.notification.reminder',
        executableVersion: '1.2.0',
        skillName: '消息提醒数字员工',
        triggerKeywords: [
          '定期提醒',
          '运维点检提醒',
          '每天提醒我',
          '提醒我',
          '设置提醒',
          '提醒',
          '定时提醒',
          '创建提醒',
          '到点提醒',
          '消息提醒',
          '提醒事项',
        ],
        category: 'notification',
        paramsSchema: {
          properties: {
            title: { type: 'string', required: true },
            message: { type: 'string', required: true },
          },
          required: ['title', 'message'],
        },
      };

      const result = await service.matchSkill({
        userInput: '提醒今天晚上 9点钟 看电视',
        userId: 'user-1',
        availableSkills: [webSearchSkill as any, reminderSkill as any],
        context: {
          web_search_enabled: true,
          webSearch: true,
        },
      });

      expect(result).not.toBeNull();
      expect(result?.skillId).toBe('platform.notification.reminder');
    });
  });
});
