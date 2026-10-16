import { ChatCapabilityInquiryService } from './chat-capability-inquiry.service';
import { RoutingPolicyService } from '../planner/routing/routing-policy.service';

describe('ChatCapabilityInquiryService', () => {
  let service: ChatCapabilityInquiryService;
  let mockSkillCacheService: any;
  let mockControlPlaneClient: any;

  beforeEach(() => {
    mockSkillCacheService = {
      loadAvailableSkills: jest.fn().mockResolvedValue([
        {
          id: 'platform.document.contract-reviewer',
          skillName: '合同文档智能审查与合规诊断',
          description: '审查单份合同条款风险',
          category: 'document',
        },
        {
          id: 'platform.email.send',
          skillName: '内置邮件发送',
          description: '发送邮件至指定收件人',
          category: 'email',
        },
      ]),
    };

    mockControlPlaneClient = {
      listSavedSkills: jest.fn().mockResolvedValue({
        skills: [
          {
            id: 'wf-1',
            name: '查询微博热点并Bark推送',
            description: '自动爬取热搜并推送到手机',
          },
        ],
      }),
    };

    service = new ChatCapabilityInquiryService(
      new RoutingPolicyService(),
      mockSkillCacheService,
      mockControlPlaneClient
    );
  });

  describe('isCapabilityInquiry', () => {
    it('correctly detects capability inquiry expressions', () => {
      expect(service.isCapabilityInquiry('你有什么能力')).toBe(true);
      expect(service.isCapabilityInquiry('你具备什么能力')).toBe(true);
      expect(service.isCapabilityInquiry('你能做什么')).toBe(true);
      expect(service.isCapabilityInquiry('系统skills')).toBe(true);
      expect(service.isCapabilityInquiry('支持哪些技能')).toBe(true);
      expect(service.isCapabilityInquiry('系统有哪些功能')).toBe(true);
      expect(service.isCapabilityInquiry('[系统上下文：无附件] 你有什么能力')).toBe(true);
    });

    it('returns false for actual execution or domain requests', () => {
      expect(service.isCapabilityInquiry('发一封邮件给李四')).toBe(false);
      expect(service.isCapabilityInquiry('审查这份租房合同')).toBe(false);
      expect(service.isCapabilityInquiry('总结一下刚刚的内容')).toBe(false);
      expect(service.isCapabilityInquiry('')).toBe(false);
      expect(service.isCapabilityInquiry(undefined as any)).toBe(false);
    });
  });

  describe('loadEffectiveCapabilities', () => {
    it('dynamically aggregates builtin skills and user saved workflows', async () => {
      const result = await service.loadEffectiveCapabilities({
        authToken: 'Bearer test',
        traceId: 'trace-1',
        userId: 'user-1',
      });

      expect(mockSkillCacheService.loadAvailableSkills).toHaveBeenCalledWith(
        'Bearer test',
        'trace-1',
        undefined,
        true,
        'user-1',
        true
      );
      expect(mockControlPlaneClient.listSavedSkills).toHaveBeenCalled();
      expect(result.builtinSkills).toHaveLength(2);
      expect(result.savedWorkflows).toHaveLength(1);
    });

    it('gracefully degrades when one of the sub-services fails', async () => {
      mockSkillCacheService.loadAvailableSkills.mockRejectedValue(new Error('Network error'));
      const result = await service.loadEffectiveCapabilities({
        authToken: 'Bearer test',
      });

      expect(result.builtinSkills).toEqual([]);
      expect(result.savedWorkflows).toHaveLength(1);
    });
  });

  describe('buildSkillsCatalogPrompt', () => {
    it('formats skills dynamically by category without hardcoding', () => {
      const builtin = [
        {
          id: 'cap-doc',
          skillName: '合同文档智能审查与合规诊断',
          description: '条款风险合规审查',
          category: 'document',
        },
      ];
      const saved = [
        {
          id: 'wf-1',
          name: '微博热点监控流',
          description: '抓取热点并推送',
        },
      ];

      const catalog = service.buildSkillsCatalogPrompt(builtin as any, saved as any);

      expect(catalog).toContain('【平台当前启用的系统内置自动化技能清单】：');
      expect(catalog).toContain('■ 分类: [document]');
      expect(catalog).toContain('【合同文档智能审查与合规诊断】: 条款风险合规审查');
      expect(catalog).toContain('【当前用户/租户已沉淀的快捷工作流】：');
      expect(catalog).toContain('【微博热点监控流】: 抓取热点并推送');
    });

    it('handles empty lists gracefully', () => {
      const catalog = service.buildSkillsCatalogPrompt([], []);
      expect(catalog).toContain('当前未检索到活跃的内置技能');
    });
  });

  describe('buildCapabilityInquirySystemPrompt', () => {
    it('embeds dynamic catalog and clear presentation constraints', () => {
      const prompt = service.buildCapabilityInquirySystemPrompt('TEST_CATALOG_CONTENT');
      expect(prompt).toContain('TEST_CATALOG_CONTENT');
      expect(prompt).toContain('严禁忽略平台真实能力而仅作空泛通用的AI回答');
      expect(prompt).toContain('ops-automation 平台的受控工作模式');
    });
  });
});
