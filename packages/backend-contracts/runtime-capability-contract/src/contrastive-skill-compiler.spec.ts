import {
  matchDeterministicRoutingCapability,
  isGuideOrInquiryRequest,
} from './planning-contract';
import { ContrastiveSkillCompiler } from './contrastive-skill-compiler';

describe('ContrastiveSkillCompiler and Deterministic Disambiguation', () => {
  const sampleSkills = [
    {
      id: '19d7c3f6-18a2-424a-95b8-82856154daf1',
      name: '登录并且调用ai',
      description:
        '登录指定系统并调用悬浮AI助手进行智能问答。支持动态传入系统起始URL、登录用户名密码及自定义AI提问内容，自动化完成页面身份认证并在聊天框提交提问。',
      triggerKeywords: ['登录并且调用ai', '登录调用ai'],
      aliases: ['登录系统AI问答'],
      runtimeType: 'browser',
    },
    {
      id: 'procurement-contract-audit',
      name: '采购合同审查与合规诊断',
      description:
        '审查采购合同文档条款、合规性诊断并输出结构化审查报告与风险清单，自动化提取关键签约条款与违约赔偿责任。',
      triggerKeywords: ['合同审查', '合规诊断'],
      aliases: ['审查合同'],
      runtimeType: 'document',
    },
    {
      id: 'invoice-reimbursement-sync',
      name: '发票报销自动归集',
      description:
        '自动识别上传的增值税发票，提取金额、税号与开票方，同步至财务报销系统并创建审批待办。',
      triggerKeywords: ['发票报销', '发票归集'],
      aliases: ['报销发票'],
      runtimeType: 'api',
    },
  ];

  it('Case 1: Correctly identifies guide inquiry requests and distinguishes them from execution tasks', () => {
    expect(isGuideOrInquiryRequest('deepseek harness的安装方法')).toBe(true);
    expect(isGuideOrInquiryRequest('怎么安装 python 环境')).toBe(true);
    expect(isGuideOrInquiryRequest('Postgres 部署教程')).toBe(true);
    expect(isGuideOrInquiryRequest('系统架构与实现原理是什么')).toBe(true);

    // Non-guide execution tasks must return false
    expect(isGuideOrInquiryRequest('帮我审查这份采购合同')).toBe(false);
    expect(isGuideOrInquiryRequest('登录系统并向悬浮AI提问')).toBe(false);
    expect(isGuideOrInquiryRequest('归集本月发票并同步财务')).toBe(false);
  });

  it('Case 2: Offline contrastive compilation extracts distinctive positive anchors and negative boundary guards', () => {
    const compiled = ContrastiveSkillCompiler.compile(sampleSkills);

    expect(compiled.size).toBe(3);

    const loginSkill = compiled.get('19d7c3f6-18a2-424a-95b8-82856154daf1');
    expect(loginSkill).toBeDefined();
    expect(loginSkill?.skillName).toBe('登录并且调用ai');

    // Positive anchors must contain distinctive terms like "登录" and explicit aliases
    expect(loginSkill?.positiveSignals).toContain('登录并且调用ai');
    expect(loginSkill?.positiveSignals).toContain('登录系统AI问答');

    // Negative anchors must contain guide/installation patterns
    expect(loginSkill?.negativeSignals).toContain('安装方法');
    expect(loginSkill?.negativeSignals).toContain('安装教程');
    expect(loginSkill?.negativeSignals).toContain('怎么安装');

    // Peer skills' unique domain terms (e.g. contract / invoice terms) should be in negative anchors
    const hasContractBoundary = loginSkill?.negativeSignals.some((neg) =>
      neg.includes('合同') || neg.includes('采购') || neg.includes('审查')
    );
    expect(hasContractBoundary).toBe(true);
  });

  it('Case 3: Regression Case - "deepseek harness的安装方法" is rejected from false browser RPA execution', () => {
    const compiled = ContrastiveSkillCompiler.compile(sampleSkills);
    const capabilitiesWithCompiledProfiles = sampleSkills.map((skill) => {
      const profile = compiled.get(skill.id);
      return {
        id: skill.id,
        name: skill.name,
        aliases: profile?.positiveSignals || skill.aliases,
        triggerKeywords: skill.triggerKeywords,
        negativeKeywords: profile?.negativeSignals || [],
      };
    });

    const match = matchDeterministicRoutingCapability(
      'deepseek harness的安装方法',
      capabilitiesWithCompiledProfiles
    );

    // MUST be null! Safe rejection preventing allocation of browser worker!
    expect(match).toBeNull();
  });

  it('Case 4: Explicit business invocation cleanly short-circuits with 0.99 confidence', () => {
    const compiled = ContrastiveSkillCompiler.compile(sampleSkills);
    const capabilitiesWithCompiledProfiles = sampleSkills.map((skill) => {
      const profile = compiled.get(skill.id);
      return {
        id: skill.id,
        name: skill.name,
        aliases: profile?.positiveSignals || skill.aliases,
        triggerKeywords: skill.triggerKeywords,
        negativeKeywords: profile?.negativeSignals || [],
      };
    });

    // 1. Explicit login skill invocation
    const loginMatch = matchDeterministicRoutingCapability(
      '请使用登录系统AI问答协助输入',
      capabilitiesWithCompiledProfiles
    );
    expect(loginMatch).not.toBeNull();
    expect(loginMatch?.capability.id).toBe('19d7c3f6-18a2-424a-95b8-82856154daf1');
    expect(loginMatch?.confidence).toBe(0.99);

    // 2. Contract audit invocation
    const auditMatch = matchDeterministicRoutingCapability(
      '审查合同',
      capabilitiesWithCompiledProfiles
    );
    expect(auditMatch).not.toBeNull();
    expect(auditMatch?.capability.id).toBe('procurement-contract-audit');
    expect(auditMatch?.confidence).toBe(0.99);
  });

  it('Case 5: AI-assisted compilation gracefully merges AI signatures and falls back safely', async () => {
    const mockLlmCaller = jest.fn().mockResolvedValue(
      JSON.stringify({
        skills: [
          {
            id: '19d7c3f6-18a2-424a-95b8-82856154daf1',
            positive_signals: ['OA自动登录', '网页AI悬浮窗'],
            negative_signals: ['技术问答', '开源安装'],
          },
        ],
      })
    );

    const compiledWithAi = await ContrastiveSkillCompiler.compileWithAi(
      sampleSkills,
      mockLlmCaller
    );

    const loginSkill = compiledWithAi.get('19d7c3f6-18a2-424a-95b8-82856154daf1');
    expect(loginSkill?.positiveSignals).toContain('OA自动登录');
    expect(loginSkill?.negativeSignals).toContain('开源安装');
    expect(loginSkill?.negativeSignals).toContain('安装方法'); // Base guard preserved

    // Fallback test when LLM fails
    const failingLlmCaller = jest.fn().mockRejectedValue(new Error('LLM connection timeout'));
    const compiledFallback = await ContrastiveSkillCompiler.compileWithAi(
      sampleSkills,
      failingLlmCaller
    );
    expect(compiledFallback.size).toBe(3);
    expect(compiledFallback.get('19d7c3f6-18a2-424a-95b8-82856154daf1')).toBeDefined();
  });
});
