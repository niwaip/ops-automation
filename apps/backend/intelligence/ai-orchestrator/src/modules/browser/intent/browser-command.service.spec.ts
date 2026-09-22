import { createService } from './browser-command.test-helper';

describe('BrowserCommandService', () => {
  it('parses password-only login follow-up without inventing username', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '密码是 W#bo0hS8&uDm3I 然后 log on',
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      {
        tool: 'fill',
        params: {
          selector: '密码',
          value: 'W#bo0hS8&uDm3I',
        },
        description: '填写密码',
      },
      {
        tool: 'click',
        params: {
          text: 'Log On',
        },
        description: '点击Log On',
        locator: {
          strategy: 'text',
          value: 'Log On',
          generatedBy: 'fallback',
          confidence: 0.4,
          matchedCandidateId: undefined,
          resolutionMode: 'text-fallback',
        },
      },
    ]);
  });

  it('parses otp-only login follow-up as a focused verification step', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '验证码是 123456 提交',
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector: '验证码',
            value: '123456',
          },
          description: '填写验证码',
        },
        {
          tool: 'click',
          params: {
            text: '提交',
          },
          description: '点击提交',
          locator: {
            strategy: 'text',
            value: '提交',
            generatedBy: 'fallback',
            confidence: 0.4,
            matchedCandidateId: undefined,
            resolutionMode: 'text-fallback',
          },
        },
      ],
      explanation: '将依次填写验证码，点击 提交',
    });
  });

  it('parses explicit username and password login in declared order', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '用户名是 demo@example.com 密码是 pass123 登录',
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      {
        tool: 'fill',
        params: {
          selector: '用户名',
          value: 'demo@example.com',
        },
        description: '填写用户名',
      },
      {
        tool: 'fill',
        params: {
          selector: '密码',
          value: 'pass123',
        },
        description: '填写密码',
      },
      {
        tool: 'click',
        params: {
          text: '登录',
        },
        description: '点击登录',
        locator: {
          strategy: 'text',
          value: '登录',
          generatedBy: 'fallback',
          confidence: 0.4,
          matchedCandidateId: undefined,
          resolutionMode: 'text-fallback',
        },
      },
    ]);
  });

  it('resolves login submit against observed candidates before falling back to raw text', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '输入用户名 124 密码 345 然后点击登录',
      context: {
        availableCandidates: [
          {
            candidateId: 'action_1',
            kind: 'action',
            label: 'ログイン',
            summary:
              'candidateId=action_1 | kind=action | ref=e-login | role=button | label=ログイン',
            source: 'probe',
            ref: 'e-login',
            role: 'button',
            preferredLocator: { type: 'ref', value: 'e-login' },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      {
        tool: 'fill',
        params: {
          selector: '用户名',
          value: '124',
        },
        description: '填写用户名',
      },
      {
        tool: 'fill',
        params: {
          selector: '密码',
          value: '345',
        },
        description: '填写密码',
      },
      {
        tool: 'click',
        params: {
          target: 'e-login',
        },
        description: '点击登录',
        locator: {
          strategy: 'ref',
          value: 'e-login',
          generatedBy: 'candidate-first',
          confidence: 0.98,
          matchedCandidateId: 'action_1',
          resolutionMode: 'preferred-locator',
        },
      },
    ]);
  });

  it('bypasses local rule parsers when forceAI is enabled for recovery parsing', async () => {
    const service = createService({
      listModels: jest.fn().mockResolvedValue([{ id: 'model-1', status: 'active' }]),
      callModel: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          analysis: '上一步登录点击失败，当前候选里有更强的 ref 目标',
          steps: [
            {
              action: 'click',
              params: { candidateId: 'action_1' },
              description: '点击登录按钮',
            },
          ],
          explanation: '基于当前候选点击登录',
        }),
      }),
    });

    const result = await service.parseCommand({
      input: '输入用户名 124 密码 345 然后点击登录',
      context: {
        forceAI: true,
        lastFailureContext: {
          lastAction: { action: 'click', params: { text: '登录' } },
          errorMessage: 'Text click failed to find element: 登录',
          errorType: 'element_not_found',
          retryable: true,
        },
        availableCandidates: [
          {
            candidateId: 'action_1',
            kind: 'action',
            label: 'ログイン',
            summary:
              'candidateId=action_1 | kind=action | ref=e-login | role=button | label=ログイン',
            source: 'probe',
            ref: 'e-login',
            role: 'button',
            preferredLocator: { type: 'ref', value: 'e-login' },
          },
        ],
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'click',
          params: { target: 'e-login' },
          description: '点击登录按钮',
          locator: {
            strategy: 'ref',
            value: 'e-login',
            generatedBy: 'candidate-first',
            confidence: 0.98,
            matchedCandidateId: 'action_1',
            resolutionMode: 'preferred-locator',
          },
        },
      ],
      explanation: '基于当前候选点击登录',
    });
  });

  it('resolves Chinese login intent to English Sign In candidate without locale hardcode in command', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '输入用户名 demo@example.com 密码 345 然后点击登录',
      context: {
        availableCandidates: [
          {
            candidateId: 'action_signin',
            kind: 'action',
            label: 'Sign In',
            summary:
              'candidateId=action_signin | kind=action | ref=e-signin | role=button | label=Sign In',
            source: 'probe',
            ref: 'e-signin',
            role: 'button',
            preferredLocator: { type: 'ref', value: 'e-signin' },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      {
        tool: 'fill',
        params: {
          selector: '用户名',
          value: 'demo@example.com',
        },
        description: '填写用户名',
      },
      {
        tool: 'fill',
        params: {
          selector: '密码',
          value: '345',
        },
        description: '填写密码',
      },
      {
        tool: 'click',
        params: {
          target: 'e-signin',
        },
        description: '点击登录',
        locator: {
          strategy: 'ref',
          value: 'e-signin',
          generatedBy: 'candidate-first',
          confidence: 0.98,
          matchedCandidateId: 'action_signin',
          resolutionMode: 'preferred-locator',
        },
      },
    ]);
  });

  it('resolves Chinese login intent to branded platform login candidate', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '用户名是 demo@example.com 密码是 pass123 登录',
      context: {
        availableCandidates: [
          {
            candidateId: 'action_platform_login',
            kind: 'action',
            label: '平台登录',
            summary:
              'candidateId=action_platform_login | kind=action | ref=e-platform-login | role=link | label=平台登录',
            source: 'probe',
            ref: 'e-platform-login',
            role: 'link',
            preferredLocator: { type: 'ref', value: 'e-platform-login' },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      {
        tool: 'fill',
        params: {
          selector: '用户名',
          value: 'demo@example.com',
        },
        description: '填写用户名',
      },
      {
        tool: 'fill',
        params: {
          selector: '密码',
          value: 'pass123',
        },
        description: '填写密码',
      },
      {
        tool: 'click',
        params: {
          target: 'e-platform-login',
        },
        description: '点击登录',
        locator: {
          strategy: 'ref',
          value: 'e-platform-login',
          generatedBy: 'candidate-first',
          confidence: 0.98,
          matchedCandidateId: 'action_platform_login',
          resolutionMode: 'preferred-locator',
        },
      },
    ]);
  });

  it('consumes runtime LOGIN profile rules without changing deterministic execution order', async () => {
    const createHitLog = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'runtime-rule-set-1',
          version: '2026.06.21',
          status: 'ACTIVE',
          rules: [
            {
              id: 'login-runtime-1',
              category: 'LOGIN',
              priority: 100,
              outputs: {
                profile_type: 'login_terms',
                credential_intent_terms: ['工号', '口令'],
                username_terms: ['工号'],
                password_terms: ['口令'],
                submit_intent_terms: ['继续登录'],
                submit_labels: ['继续登录'],
              },
            },
          ],
        }),
        createHitLog,
      },
    });

    const result = await service.parseCommand({
      input: '工号是 u001 口令是 pass123 继续登录',
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector: '用户名',
            value: 'u001',
          },
          description: '填写用户名',
        },
        {
          tool: 'fill',
          params: {
            selector: '密码',
            value: 'pass123',
          },
          description: '填写密码',
        },
        {
          tool: 'click',
          params: {
            text: '继续登录',
          },
          description: '点击继续登录',
          locator: {
            strategy: 'text',
            value: '继续登录',
            generatedBy: 'fallback',
            confidence: 0.4,
            matchedCandidateId: undefined,
            resolutionMode: 'text-fallback',
          },
        },
      ],
      explanation: '将依次填写用户名和密码，点击 继续登录',
      parserMetadata: {
        login: {
          status: 'success',
          reason: undefined,
          filledFields: ['username', 'password'],
          missingFields: [],
          nextStepHint: undefined,
          matchedRuntimeRuleIds: ['login-runtime-1'],
          usedRuntimeProfile: true,
        },
      },
    });
    expect(createHitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        normalized_semantic: expect.objectContaining({
          parser_source: 'login-profile',
          effective_login_profile_version: '2026.06.21',
          filled_fields: ['username', 'password'],
        }),
      })
    );
  });

  it('picks up a newly published login profile on the very next request without recreating the service', async () => {
    const createHitLog = jest.fn().mockResolvedValue(undefined);
    const createErrorLog = jest.fn().mockResolvedValue(undefined);
    const resolveRuntimeRuleSet = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        rule_set_id: 'runtime-rule-set-next-request',
        version: '2026.06.22',
        status: 'ACTIVE',
        rules: [
          {
            id: 'login-runtime-next-request',
            category: 'LOGIN',
            priority: 100,
            outputs: {
              profile_type: 'login_terms',
              credential_intent_terms: ['工号', '口令'],
              username_terms: ['工号'],
              password_terms: ['口令'],
              submit_intent_terms: ['继续登录'],
              submit_labels: ['继续登录'],
            },
          },
        ],
      });
    const service = createService({
      modelOverrides: {
        listModels: jest.fn().mockResolvedValue([{ id: 'model-1', status: 'active' }]),
        callModel: jest.fn().mockRejectedValue(new Error('planner unavailable')),
      },
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet,
        createHitLog,
        createErrorLog,
      },
    });

    const firstResult = await service.parseCommand({
      input: '工号是 u001 口令是 s3curE 继续登录',
    });

    expect(firstResult).toEqual({
      success: false,
      commands: [],
      explanation: 'AI 解析失败: planner unavailable',
      parserMetadata: {
        login: {
          status: 'profile_miss',
          reason: 'login-ai-fallback-failed',
          triggerReason: 'login-profile-miss',
          fallbackUsed: true,
        },
      },
    });

    const secondResult = await service.parseCommand({
      input: '工号是 u001 口令是 s3curE 继续登录',
    });

    expect(secondResult).toEqual({
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector: '用户名',
            value: 'u001',
          },
          description: '填写用户名',
        },
        {
          tool: 'fill',
          params: {
            selector: '密码',
            value: 's3curE',
          },
          description: '填写密码',
        },
        {
          tool: 'click',
          params: {
            text: '继续登录',
          },
          description: '点击继续登录',
          locator: {
            strategy: 'text',
            value: '继续登录',
            generatedBy: 'fallback',
            confidence: 0.4,
            matchedCandidateId: undefined,
            resolutionMode: 'text-fallback',
          },
        },
      ],
      explanation: '将依次填写用户名和密码，点击 继续登录',
      parserMetadata: {
        login: {
          status: 'success',
          reason: undefined,
          filledFields: ['username', 'password'],
          missingFields: [],
          nextStepHint: undefined,
          matchedRuntimeRuleIds: ['login-runtime-next-request'],
          usedRuntimeProfile: true,
        },
      },
    });

    expect(resolveRuntimeRuleSet).toHaveBeenCalledTimes(2);
    expect(createHitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        normalized_semantic: expect.objectContaining({
          parser_source: 'login-profile',
          effective_login_profile_version: '2026.06.22',
          filled_fields: ['username', 'password'],
        }),
      })
    );
  });

  it('returns partial for next-step login flows instead of forcing a full credential submission', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '用户名是 demo@example.com 密码是 pass123 next',
      context: {
        availableInputs: ['用户名'],
        availableButtons: ['Next'],
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector: '用户名',
            value: 'demo@example.com',
          },
          description: '填写用户名',
        },
        {
          tool: 'click',
          params: {
            target: 'text="Next"',
          },
          description: '点击Next',
          locator: {
            strategy: 'text',
            value: 'Next',
            generatedBy: 'candidate-first',
            confidence: 0.88,
            matchedCandidateId: 'candidate_1',
            resolutionMode: 'text-fallback',
          },
        },
      ],
      explanation: '将依次填写用户名，点击 Next',
      parserMetadata: {
        login: {
          status: 'partial',
          reason: 'login-partial-step',
          filledFields: ['username'],
          missingFields: [],
          nextStepHint: '当前页面疑似只展示部分登录步骤，请等待下一步页面后继续补全剩余字段',
          matchedRuntimeRuleIds: [],
          usedRuntimeProfile: false,
        },
      },
    });
  });

  it('treats email plus next as a valid SSO first step', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '邮箱是 demo@example.com next',
      context: {
        availableInputs: ['email'],
        availableButtons: ['Next'],
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector: '用户名',
            value: 'demo@example.com',
          },
          description: '填写用户名',
        },
        {
          tool: 'click',
          params: {
            target: 'text="Next"',
          },
          description: '点击Next',
          locator: {
            strategy: 'text',
            value: 'Next',
            generatedBy: 'candidate-first',
            confidence: 0.88,
            matchedCandidateId: 'candidate_1',
            resolutionMode: 'text-fallback',
          },
        },
      ],
      explanation: '将依次填写用户名，点击 Next',
      parserMetadata: undefined,
    });
  });

  it('returns explicit takeover_required when context shows unsupported login challenge', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '请帮我登录',
      context: {
        availableButtons: ['扫码登录'],
      },
    });

    expect(result).toEqual({
      success: false,
      commands: [],
      explanation: '当前页面包含不受支持的认证挑战，请切换为人工接管或改用受支持的登录方式',
      parserMetadata: {
        login: {
          status: 'takeover_required',
          reason: 'login-unsupported-auth-challenge',
          filledFields: [],
          matchedRuntimeRuleIds: [],
          usedRuntimeProfile: false,
        },
      },
    });
  });

  it('returns takeover_required when passkey challenge is present', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '请帮我登录',
      context: {
        availableButtons: ['Use Passkey'],
      },
    });

    expect(result).toEqual({
      success: false,
      commands: [],
      explanation: '当前页面包含不受支持的认证挑战，请切换为人工接管或改用受支持的登录方式',
      parserMetadata: {
        login: {
          status: 'takeover_required',
          reason: 'login-unsupported-auth-challenge',
          filledFields: [],
          matchedRuntimeRuleIds: [],
          usedRuntimeProfile: false,
        },
      },
    });
  });

  it('uses login-specific AI fallback when login intent is clear but local profile cannot extract fields', async () => {
    const createHitLog = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      modelOverrides: {
        listModels: jest.fn().mockResolvedValue([{ id: 'model-1', status: 'active' }]),
        callModel: jest.fn().mockResolvedValue({
          content: JSON.stringify({
            analysis: '当前页面存在明确的登录入口，但用户未提供可直接抽取的字段值',
            steps: [
              {
                action: 'click',
                params: { rawTarget: '登录', roleHint: 'button', semanticHint: 'submit' },
                description: '点击登录',
              },
            ],
            explanation: '先点击当前页面的登录入口',
          }),
        }),
      },
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'runtime-rule-set-login-fallback',
          version: '2026.06.21',
          status: 'ACTIVE',
          rules: [],
        }),
        createHitLog,
      },
    });

    const result = await service.parseCommand({
      input: '请帮我登录这个系统',
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'click',
          params: {
            text: '登录',
          },
          description: '点击登录',
          locator: {
            strategy: 'text',
            value: '登录',
            generatedBy: 'fallback',
            confidence: 0.4,
            matchedCandidateId: undefined,
            resolutionMode: 'text-fallback',
          },
        },
      ],
      explanation: '先点击当前页面的登录入口',
      parserMetadata: {
        login: {
          status: 'success',
          reason: 'login-ai-fallback-used',
          triggerReason: 'login-profile-miss',
          fallbackUsed: true,
        },
      },
    });
    expect(createHitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        used_ai_fallback: true,
        normalized_semantic: expect.objectContaining({
          parser_source: 'login-ai-plan',
          parser_metadata: {
            login: {
              status: 'success',
              reason: 'login-ai-fallback-used',
              triggerReason: 'login-profile-miss',
              fallbackUsed: true,
            },
          },
        }),
      })
    );
  });

  it('records login-ai-fallback-failed metadata when login fallback and final AI parsing both fail', async () => {
    const createErrorLog = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      modelOverrides: {
        listModels: jest.fn().mockResolvedValue([{ id: 'model-1', status: 'active' }]),
        callModel: jest.fn().mockRejectedValue(new Error('planner unavailable')),
      },
      browserSemanticsOverrides: {
        createErrorLog,
      },
    });

    const result = await service.parseCommand({
      input: '请帮我登录这个系统',
    });

    expect(result).toEqual({
      success: false,
      commands: [],
      explanation: 'AI 解析失败: planner unavailable',
      parserMetadata: {
        login: {
          status: 'profile_miss',
          reason: 'login-ai-fallback-failed',
          triggerReason: 'login-profile-miss',
          fallbackUsed: true,
        },
      },
    });
    expect(createErrorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        normalized_semantic: expect.objectContaining({
          parser_metadata: {
            login: {
              status: 'profile_miss',
              reason: 'login-ai-fallback-failed',
              triggerReason: 'login-profile-miss',
              fallbackUsed: true,
            },
          },
        }),
      })
    );
  });

  it('parses navigation target from runtime navigation profile before AI fallback', async () => {
    const createHitLog = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'runtime-rule-set-navigation',
          version: '2026.06.21',
          status: 'ACTIVE',
          rules: [
            {
              id: 'nav-runtime-approvals',
              category: 'NAVIGATION',
              priority: 120,
              outputs: {
                profile_type: 'navigation_target',
                target_terms: ['审批中心', '审批页面'],
                destination_path: '/#approvals',
                intent_terms: ['打开'],
              },
            },
          ],
        }),
        createHitLog,
      },
    });

    const result = await service.parseCommand({
      input: '打开审批中心',
      context: {
        currentPageUrl: 'http://192.168.100.143/#dashboard',
        pageType: 'workspace',
        traceId: 'trace-nav-profile',
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'navigate',
          params: {
            url: 'http://192.168.100.143/#approvals',
          },
          description: '导航到 审批中心',
        },
      ],
      explanation: '将导航到 http://192.168.100.143/#approvals',
      parserMetadata: {
        navigation: {
          status: 'success',
          reason: 'navigation-runtime-path',
          resolvedTarget: '审批中心',
          resolvedUrl: 'http://192.168.100.143/#approvals',
          usedRuntimeProfile: true,
          matchedRuntimeRuleIds: ['nav-runtime-approvals'],
        },
      },
    });
    expect(createHitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        matched_rule_ids: ['nav-runtime-approvals'],
        normalized_semantic: expect.objectContaining({
          parser_source: 'navigation-profile',
          effective_navigation_profile_version: '2026.06.21',
          parser_metadata: {
            navigation: {
              status: 'success',
              reason: 'navigation-runtime-path',
              resolvedTarget: '审批中心',
              resolvedUrl: 'http://192.168.100.143/#approvals',
              usedRuntimeProfile: true,
              matchedRuntimeRuleIds: ['nav-runtime-approvals'],
            },
          },
        }),
      })
    );
  });

  it('parses direct url navigation before action and ai-plan when recorder candidates are present', async () => {
    const listModels = jest.fn().mockResolvedValue([{ id: 'model-1', status: 'active' }]);
    const callModel = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        steps: [
          {
            action: 'click',
            params: { candidateId: 'action_1' },
            description: '点击详情',
          },
        ],
        explanation: '错误地把打开 URL 当成点击',
      }),
    });
    const service = createService({
      modelOverrides: {
        listModels,
        callModel,
      },
    });

    const result = await service.parseCommand({
      input: '打开 https://example.com/?e2e=nav-profile-987',
      context: {
        currentPageUrl: 'http://192.168.100.143/#dashboard',
        availableCandidates: [
          {
            candidateId: 'action_1',
            kind: 'action',
            label: '详细',
            summary:
              'candidateId=action_1 | kind=action | ref=e88 | role=button | label=详细',
            source: 'probe',
            ref: 'e88',
            role: 'button',
            preferredLocator: { type: 'ref', value: 'e88' },
          },
          {
            candidateId: 'action_2',
            kind: 'action',
            label: '更多',
            summary:
              'candidateId=action_2 | kind=action | ref=e89 | role=button | label=更多',
            source: 'probe',
            ref: 'e89',
            role: 'button',
            preferredLocator: { type: 'ref', value: 'e89' },
          },
        ],
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'navigate',
          params: {
            url: 'https://example.com/?e2e=nav-profile-987',
          },
          description: '导航到 https://example.com/?e2e=nav-profile-987',
        },
      ],
      explanation: '将导航到 https://example.com/?e2e=nav-profile-987',
      parserMetadata: {
        navigation: {
          status: 'success',
          reason: 'navigation-direct-url',
          resolvedTarget: 'https://example.com/?e2e=nav-profile-987',
          resolvedUrl: 'https://example.com/?e2e=nav-profile-987',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    });
    expect(listModels).not.toHaveBeenCalled();
    expect(callModel).not.toHaveBeenCalled();
  });

  it('classifies missing credential values as login-field-missing before falling back', async () => {
    const createErrorLog = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      modelOverrides: {
        listModels: jest.fn().mockResolvedValue([{ id: 'model-1', status: 'active' }]),
        callModel: jest.fn().mockRejectedValue(new Error('planner unavailable')),
      },
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'runtime-rule-set-field-missing',
          version: '2026.06.21',
          status: 'ACTIVE',
          rules: [
            {
              id: 'login-runtime-field-missing',
              category: 'LOGIN',
              priority: 100,
              outputs: {
                profile_type: 'login_terms',
                credential_intent_terms: ['工号', '口令'],
                username_terms: ['工号'],
                password_terms: ['口令'],
                submit_intent_terms: ['继续登录'],
                submit_labels: ['继续登录'],
              },
            },
          ],
        }),
        createErrorLog,
      },
    });

    const result = await service.parseCommand({
      input: '工号是 u001 口令；继续登录',
    });

    expect(result).toEqual({
      success: false,
      commands: [],
      explanation: 'AI 解析失败: planner unavailable',
      parserMetadata: {
        login: {
          status: 'profile_miss',
          reason: 'login-ai-fallback-failed',
          triggerReason: 'login-field-missing',
          fallbackUsed: true,
        },
      },
    });
    expect(createErrorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        normalized_semantic: expect.objectContaining({
          parser_metadata: {
            login: {
              status: 'profile_miss',
              reason: 'login-ai-fallback-failed',
              triggerReason: 'login-field-missing',
              fallbackUsed: true,
            },
          },
        }),
      })
    );
  });

});
