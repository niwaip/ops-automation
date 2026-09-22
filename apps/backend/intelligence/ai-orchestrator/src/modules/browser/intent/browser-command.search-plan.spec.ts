import { createService } from './browser-command.test-helper';

describe('BrowserCommandService', () => {
  it('parses search intent with runtime profile before falling back to generic parsers', async () => {
    const createHitLog = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'rule-set-search-profile',
          version: '2026.06.21',
          rules: [
            {
              id: 'search-runtime-smart',
              priority: 900,
              category: 'SEARCH',
              outputs: {
                profile_type: 'search_intent',
                smart_search_terms: ['站内搜'],
              },
            },
          ],
        }),
        createHitLog,
      },
    });

    const result = await service.parseCommand({
      input: '站内搜 审批单',
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'smart_search',
          params: { query: '审批单' },
          description: '智搜 审批单',
        },
      ],
      explanation: '将智能查找当前页面的搜索入口并搜索 审批单',
      parserMetadata: {
        search: {
          status: 'success',
          reason: 'search-runtime-query',
          intentType: 'smart_search',
          query: '审批单',
          resultIndex: undefined,
          triggerTerm: '站内搜',
          usedRuntimeProfile: true,
          matchedRuntimeRuleIds: ['search-runtime-smart'],
        },
      },
    });

    expect(createHitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        matched_rule_ids: ['search-runtime-smart'],
        normalized_semantic: expect.objectContaining({
          parser_source: 'search-profile',
          effective_profile_versions: expect.objectContaining({
            search: '2026.06.21',
          }),
          parser_metadata: {
            search: {
              status: 'success',
              reason: 'search-runtime-query',
              intentType: 'smart_search',
              query: '审批单',
              resultIndex: undefined,
              triggerTerm: '站内搜',
              usedRuntimeProfile: true,
              matchedRuntimeRuleIds: ['search-runtime-smart'],
            },
          },
        }),
      })
    );
  });

  it('parses default search plus click-result sequence through search profile service', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '搜索 毛利率 然后点击第一个结果',
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'search',
          params: { query: '毛利率' },
          description: '搜索 毛利率',
        },
        {
          tool: 'click_result',
          params: { index: 1 },
          description: '点击第1个结果',
        },
      ],
      explanation: '将依次搜索 毛利率，点击第1个结果',
      parserMetadata: {
        search: {
          status: 'success',
          reason: 'search-default-sequential',
          intentType: 'search',
          query: '毛利率',
          resultIndex: 1,
          triggerTerm: '搜索',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    });
  });

  it('parses explicit search engine query through search profile service before pattern parser', async () => {
    const createHitLog = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'rule-set-search-profile',
          version: '2026.06.21',
          rules: [],
        }),
        createHitLog,
      },
    });

    const result = await service.parseCommand({
      input: '在百度搜索 毛利率',
      context: {
        traceId: 'trace-search-engine',
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'navigate',
          params: { url: 'https://www.baidu.com' },
          description: '打开百度',
        },
        {
          tool: 'smart_search',
          params: { query: '毛利率' },
          description: '在百度搜索 毛利率',
        },
      ],
      explanation: '将依次打开百度，搜索 毛利率',
      parserMetadata: {
        search: {
          status: 'success',
          reason: 'search-default-engine',
          intentType: 'engine_search',
          query: '毛利率',
          resultIndex: undefined,
          triggerTerm: '百度',
          engine: 'baidu',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    });

    expect(createHitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        normalized_semantic: expect.objectContaining({
          parser_source: 'sequential-pattern',
          parser_metadata: {
            search: expect.objectContaining({
              reason: 'search-default-engine',
              intentType: 'engine_search',
            }),
          },
        }),
      })
    );
  });

  it('keeps sequential navigate-plus-search flow while delegating search parsing to search profile service', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '打开 baidu.com 搜索 毛利率 然后点击第一个结果',
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'navigate',
          params: { url: 'https://www.baidu.com' },
          description: '导航到 baidu.com',
        },
        {
          tool: 'search',
          params: { query: '毛利率' },
          description: '搜索 毛利率',
        },
        {
          tool: 'click_result',
          params: { index: 1 },
          description: '点击第1个结果',
        },
      ],
      explanation: '将依次打开 https://www.baidu.com，搜索 毛利率，点击第1个结果',
      parserMetadata: {
        navigation: {
          status: 'success',
          reason: 'navigation-direct-url',
          resolvedTarget: 'baidu.com',
          resolvedUrl: 'https://www.baidu.com',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
        search: {
          status: 'success',
          reason: 'search-default-sequential',
          intentType: 'search',
          query: '毛利率',
          resultIndex: 1,
          triggerTerm: '搜索',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    });
  });

  it('reuses navigation profile inside sequential navigate-plus-search flow', async () => {
    const service = createService({
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'rule-set-sequential-navigation-profile',
          version: '2026.06.22',
          rules: [
            {
              id: 'nav-runtime-approvals-sequential',
              priority: 900,
              category: 'NAVIGATION',
              outputs: {
                profile_type: 'navigation_target',
                target_terms: ['审批中心', '审批页面'],
                destination_path: '/#approvals',
                intent_terms: ['打开'],
              },
            },
          ],
        }),
      },
    });

    const result = await service.parseCommand({
      input: '打开 审批中心 搜索 审批单',
      context: {
        currentPageUrl: 'http://192.168.100.143/#dashboard',
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'navigate',
          params: { url: 'http://192.168.100.143/#approvals' },
          description: '导航到 审批中心',
        },
        {
          tool: 'search',
          params: { query: '审批单' },
          description: '搜索 审批单',
        },
      ],
      explanation: '将依次打开 http://192.168.100.143/#approvals，搜索 审批单',
      parserMetadata: {
        navigation: {
          status: 'success',
          reason: 'navigation-runtime-path',
          resolvedTarget: '审批中心',
          resolvedUrl: 'http://192.168.100.143/#approvals',
          usedRuntimeProfile: true,
          matchedRuntimeRuleIds: ['nav-runtime-approvals-sequential'],
        },
        search: {
          status: 'success',
          reason: 'search-default-query',
          intentType: 'search',
          query: '审批单',
          resultIndex: undefined,
          triggerTerm: '搜索',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    });
  });

  it('parses runtime field fill with search profile chain still intact', async () => {
    const createHitLog = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'rule-set-field-fill-profile',
          version: '2026.06.21',
          rules: [
            {
              id: 'field-fill-runtime-comment',
              priority: 880,
              category: 'FIELD_FILL',
              outputs: {
                profile_type: 'field_fill_terms',
                field_terms: ['备注', '审批备注'],
                canonical_field: 'comment',
                region_terms: ['审批区域'],
                intent_terms: ['填写'],
              },
            },
          ],
        }),
        createHitLog,
      },
    });

    const result = await service.parseCommand({
      input: '在审批区域填写备注 通过',
      context: {
        availableCandidates: [
          {
            candidateId: 'input_1',
            kind: 'input',
            label: '备注',
            summary:
              'candidateId=input_1 | kind=input | region=审批区域 | field=comment | label=备注',
            source: 'region',
            field: 'comment',
            region: { name: '审批区域' },
            preferredLocator: {
              type: 'css',
              value: '[data-ai-region="审批区域"] [data-ai-field="comment"]',
            },
          },
        ],
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector: '[data-ai-region="审批区域"] [data-ai-field="comment"]',
            value: '通过',
          },
          description: '填写备注',
          locator: {
            strategy: 'css',
            value: '[data-ai-region="审批区域"] [data-ai-field="comment"]',
            generatedBy: 'candidate-first',
            confidence: 0.96,
            matchedCandidateId: 'input_1',
            resolutionMode: 'preferred-locator',
          },
        },
      ],
      explanation: '将填写备注',
      parserMetadata: {
        fieldFill: {
          status: 'success',
          reason: 'field-fill-runtime-field-region',
          resolvedField: '备注',
          resolvedCanonicalField: 'comment',
          resolvedRegion: '审批区域',
          selector: '[data-ai-region="审批区域"] [data-ai-field="comment"]',
          value: '通过',
          usedRuntimeProfile: true,
          matchedRuntimeRuleIds: ['field-fill-runtime-comment'],
        },
      },
    });

    expect(createHitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        matched_rule_ids: ['field-fill-runtime-comment'],
        normalized_semantic: expect.objectContaining({
          parser_source: 'field-fill-profile',
          effective_profile_versions: expect.objectContaining({
            fieldFill: '2026.06.21',
          }),
          parser_metadata: {
            fieldFill: {
              status: 'success',
              reason: 'field-fill-runtime-field-region',
              resolvedField: '备注',
              resolvedCanonicalField: 'comment',
              resolvedRegion: '审批区域',
              selector: '[data-ai-region="审批区域"] [data-ai-field="comment"]',
              value: '通过',
              usedRuntimeProfile: true,
              matchedRuntimeRuleIds: ['field-fill-runtime-comment'],
            },
          },
        }),
      })
    );
  });

  it('parses default field fill when candidate label has a trailing colon but user omits it', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '填写 Customer name AliceCN988',
      context: {
        availableCandidates: [
          {
            candidateId: 'input_1',
            kind: 'input',
            label: 'Customer name:',
            summary:
              'candidateId=input_1 | kind=input | ref=e5 | role=textbox | label=Customer name:',
            source: 'probe',
            preferredLocator: {
              type: 'role',
              value: 'textbox[name="Customer name:"]',
            },
          },
        ],
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'fill',
          params: {
            selector: 'role=textbox[name="Customer name:"]',
            value: 'AliceCN988',
          },
          description: '填写Customer name',
          locator: {
            strategy: 'role',
            value: 'role=textbox[name="Customer name:"]',
            generatedBy: 'candidate-first',
            confidence: 0.95,
            matchedCandidateId: 'input_1',
            resolutionMode: 'preferred-locator',
          },
        },
      ],
      explanation: '将填写Customer name',
      parserMetadata: {
        fieldFill: {
          status: 'success',
          reason: 'field-fill-default-candidate',
          resolvedField: 'Customer name:',
          resolvedCanonicalField: 'Customer name',
          resolvedRegion: undefined,
          selector: 'role=textbox[name="Customer name:"]',
          value: 'AliceCN988',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    });
  });

  it('parses region-scoped action with css locator when no ref is available', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '在审批区域点击拒绝',
      context: {
        availableCandidates: [
          {
            candidateId: 'action_1',
            kind: 'action',
            label: '拒绝',
            summary:
              'candidateId=action_1 | kind=action | region=审批区域 | action=reject | label=拒绝',
            source: 'region',
            action: 'reject',
            region: { name: '审批区域' },
            preferredLocator: {
              type: 'css',
              value: '[data-ai-region="审批区域"] [data-ai-action="reject"]',
            },
          },
          {
            candidateId: 'action_2',
            kind: 'action',
            label: '拒绝',
            summary:
              'candidateId=action_2 | kind=action | region=搜索区域 | action=reject | label=拒绝',
            source: 'region',
            action: 'reject',
            region: { name: '搜索区域' },
            preferredLocator: {
              type: 'css',
              value: '[data-ai-region="搜索区域"] [data-ai-action="reject"]',
            },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      {
        tool: 'click',
        params: {
          target: '[data-ai-region="审批区域"] [data-ai-action="reject"]',
        },
        description: '点击拒绝',
        locator: {
          strategy: 'css',
          value: '[data-ai-region="审批区域"] [data-ai-action="reject"]',
          generatedBy: 'candidate-first',
          confidence: 0.98,
          matchedCandidateId: 'action_1',
          resolutionMode: 'preferred-locator',
        },
      },
    ]);
  });

  it('uses candidate-first resolution for command-context click requests', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '点击登录',
      context: {
        commandType: 'click',
        availableCandidates: [
          {
            candidateId: 'action_1',
            kind: 'action',
            label: '平台登录',
            summary: 'candidateId=action_1 | kind=action | ref=e1080 | role=link | label=平台登录',
            source: 'probe',
            ref: 'e1080',
            role: 'link',
            preferredLocator: { type: 'ref', value: 'e1080' },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      {
        tool: 'click',
        params: {
          target: 'e1080',
        },
        description: '点击登录',
        locator: {
          strategy: 'ref',
          value: 'e1080',
          generatedBy: 'candidate-first',
          confidence: 0.98,
          matchedCandidateId: 'action_1',
          resolutionMode: 'preferred-locator',
        },
      },
    ]);
  });

  it('reuses action profile for command-context click requests', async () => {
    const service = createService({
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'rule-set-context-action-profile',
          version: '2026.06.22',
          rules: [
            {
              id: 'action-runtime-context-approve',
              category: 'ROW_ACTION',
              priority: 900,
              outputs: {
                profile_type: 'action_target',
                target_terms: ['承认按钮', '审批通过'],
                semantic_hint: 'approve',
                action_terms: ['approve'],
                region_terms: ['decision-actions'],
                role_hints: ['button'],
                category_hint: 'ROW_ACTION',
                intent_terms: ['点击'],
              },
            },
          ],
        }),
      },
    });

    const result = await service.parseCommand({
      input: '承认按钮',
      context: {
        commandType: 'click',
        availableCandidates: [
          {
            candidateId: 'action_1',
            kind: 'action',
            label: '承認する (Approve)',
            summary:
              'candidateId=action_1 | kind=action | ref=e301 | region=decision-actions | action=approve | stable=approve-project | label=承認する (Approve)',
            source: 'region',
            ref: 'e301',
            action: 'approve',
            stableName: 'approve-project',
            role: 'button',
            region: { name: 'decision-actions' },
            preferredLocator: { type: 'ref', value: 'e301' },
          },
        ],
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'click',
          params: {
            target: 'e301',
          },
          description: '点击承认按钮',
          locator: {
            strategy: 'ref',
            value: 'e301',
            generatedBy: 'candidate-first',
            confidence: 0.98,
            matchedCandidateId: 'action_1',
            resolutionMode: 'preferred-locator',
          },
        },
      ],
      explanation: '将点击承认按钮',
      parserMetadata: {
        action: {
          status: 'success',
          reason: 'action-runtime-region',
          resolvedTarget: '承认按钮',
          resolvedActionTerm: 'approve',
          semanticHint: 'confirm',
          resolvedRegion: 'decision-actions',
          resolvedRoleHint: 'button',
          rowIndex: undefined,
          categoryHint: 'ROW_ACTION',
          usedRuntimeProfile: true,
          matchedRuntimeRuleIds: ['action-runtime-context-approve'],
        },
      },
    });
  });

  it('reuses navigation profile for command-context navigate requests', async () => {
    const service = createService({
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'rule-set-context-navigation-profile',
          version: '2026.06.22',
          rules: [
            {
              id: 'nav-runtime-context-approvals',
              priority: 900,
              category: 'NAVIGATION',
              outputs: {
                profile_type: 'navigation_target',
                target_terms: ['审批中心', '审批页面'],
                destination_path: '/#approvals',
                intent_terms: ['打开'],
              },
            },
          ],
        }),
      },
    });

    const result = await service.parseCommand({
      input: '审批中心',
      context: {
        commandType: 'navigate',
        currentPageUrl: 'http://192.168.100.143/#dashboard',
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
          matchedRuntimeRuleIds: ['nav-runtime-context-approvals'],
        },
      },
    });
  });

  it('reuses search profile for command-context search requests', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '审批单',
      context: {
        commandType: 'search',
        currentPageUrl: 'http://192.168.100.143/#approvals',
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'search',
          params: {
            query: '审批单',
          },
          description: '搜索 审批单',
        },
      ],
      explanation: '将搜索 审批单',
      parserMetadata: {
        search: {
          status: 'success',
          reason: 'search-default-query',
          intentType: 'search',
          query: '审批单',
          resultIndex: undefined,
          triggerTerm: '搜索',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    });
  });

  it('reuses search profile for command-context smart_search requests', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '审批单',
      context: {
        commandType: 'smart_search',
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'smart_search',
          params: {
            query: '审批单',
          },
          description: '智搜 审批单',
        },
      ],
      explanation: '将智能查找当前页面的搜索入口并搜索 审批单',
      parserMetadata: {
        search: {
          status: 'success',
          reason: 'search-default-query',
          intentType: 'smart_search',
          query: '审批单',
          resultIndex: undefined,
          triggerTerm: '智搜',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    });
  });

  it('routes atomic wait commands through the atomic command service entry', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '等待 2 秒',
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'wait',
          params: { duration: 2000 },
          description: '等待 2000ms',
        },
      ],
      explanation: '将等待 2000 毫秒',
    });
  });

  it('mapPlanStepToCommand should preserve click target when planner returns ref target', () => {
    const service = createService();
    const command = (service as any).mapPlanStepToCommand({
      action: 'click',
      params: { target: 'e88' },
      description: '点击候选项',
    });

    expect(command).toEqual({
      tool: 'click',
      params: { target: 'e88' },
      description: '点击候选项',
    });
  });

  it('mapPlanStepToCommand should resolve planner click text through candidate-first resolver', () => {
    const service = createService();
    const command = (service as any).mapPlanStepToCommand(
      {
        action: 'click',
        params: { text: '登录', semanticHint: 'submit' },
        description: '点击登录',
      },
      {
        availableCandidates: [
          {
            candidateId: 'action_1',
            kind: 'action',
            label: 'Sign In',
            summary:
              'candidateId=action_1 | kind=action | ref=e-submit | role=button | label=Sign In',
            source: 'probe',
            ref: 'e-submit',
            role: 'button',
            preferredLocator: { type: 'ref', value: 'e-submit' },
          },
        ],
      }
    );

    expect(command).toEqual({
      tool: 'click',
      params: { target: 'e-submit' },
      description: '点击登录',
      locator: {
        strategy: 'ref',
        value: 'e-submit',
        generatedBy: 'candidate-first',
        confidence: 0.95,
        matchedCandidateId: 'action_1',
        resolutionMode: 'preferred-locator',
      },
    });
  });

  it('parseWithAI should resolve candidate-aware click intent returned by model', async () => {
    const listModels = jest.fn().mockResolvedValue([{ id: 'model-1', status: 'active' }]);
    const callModel = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        commands: [
          {
            tool: 'click',
            params: {
              rawTarget: '登录',
              roleHint: 'button',
              semanticHint: 'submit',
            },
            description: '点击登录',
          },
        ],
        explanation: '点击登录',
      }),
    });
    const service = createService({ listModels, callModel });

    const result = await (service as any).parseWithAI('点击登录', {
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
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'click',
          params: { target: 'e-login' },
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
      ],
      explanation: '点击登录',
    });
  });

  it('mapPlanStepsToCommands should resolve planner candidateId click intent', () => {
    const service = createService();
    const commands = (service as any).mapPlanStepsToCommands(
      [
        {
          action: 'click',
          params: { candidateId: 'action_1' },
          description: '点击第一条记录的详情',
        },
      ],
      {
        availableCandidates: [
          {
            candidateId: 'action_1',
            kind: 'action',
            label: '詳細',
            summary:
              'candidateId=action_1 | kind=action | ref=e88 | role=button | row=1 | label=詳細',
            source: 'probe',
            ref: 'e88',
            role: 'button',
            preferredLocator: { type: 'ref', value: 'e88' },
          },
        ],
      }
    );

    expect(commands).toEqual([
      {
        tool: 'click',
        params: { target: 'e88' },
        description: '点击第一条记录的详情',
        locator: {
          strategy: 'ref',
          value: 'e88',
          generatedBy: 'candidate-first',
          confidence: 0.98,
          matchedCandidateId: 'action_1',
          resolutionMode: 'preferred-locator',
        },
      },
    ]);
  });

  it('prefers AI plan for row-scoped detail intents when structured candidates are present', async () => {
    const listModels = jest.fn().mockResolvedValue([{ id: 'model-1', status: 'active' }]);
    const callModel = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        steps: [
          {
            action: 'click',
            params: {
              rawTarget: '详情',
              rowHint: { index: 1 },
              semanticHint: 'detail',
            },
            description: '点击第一条数据的详情',
          },
        ],
        explanation: '点击第一条数据的详情按钮',
      }),
    });
    const service = createService({ listModels, callModel });

    const result = await service.parseCommand({
      input: '点击第一条数据，进入详细页面',
      context: {
        availableCandidates: [
          {
            candidateId: 'action_31',
            kind: 'action',
            label: '詳細',
            summary:
              'candidateId=action_31 | kind=action | role=button | region=approval-list | row=1 | rowKey=PRJ-2026-001 | action=detail | stable=open-project-detail | label=詳細',
            source: 'row',
            role: 'button',
            text: '詳細',
            action: 'detail',
            stableName: 'open-project-detail',
            row: { index: 1, key: 'PRJ-2026-001' },
            region: { name: 'approval-list' },
            preferredLocator: {
              type: 'css',
              value:
                ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
            },
          },
          {
            candidateId: 'action_40',
            kind: 'action',
            label: '詳細',
            summary:
              'candidateId=action_40 | kind=action | role=button | region=approval-list | row=2 | rowKey=PRJ-2026-002 | action=detail | stable=open-project-detail | label=詳細',
            source: 'row',
            role: 'button',
            text: '詳細',
            action: 'detail',
            stableName: 'open-project-detail',
            row: { index: 2, key: 'PRJ-2026-002' },
            region: { name: 'approval-list' },
            preferredLocator: {
              type: 'css',
              value:
                ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 2)',
            },
          },
        ],
      },
    });

    expect(callModel).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      expect.objectContaining({
        tool: 'click',
        params: {
          target:
            ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
        },
        description: '点击第一条数据的详情',
        locator: expect.objectContaining({
          strategy: 'css',
          value:
            ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
          generatedBy: 'candidate-first',
          matchedCandidateId: 'action_31',
        }),
      }),
    ]);
  });

  it('rejects ungrounded AI plan clicks for row-scoped detail intents and falls back to rule parser', async () => {
    const listModels = jest.fn().mockResolvedValue([{ id: 'model-1', status: 'active' }]);
    const callModel = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        steps: [
          {
            action: 'click',
            params: {
              text: '第一条数据，进入详细页面',
            },
            description: '点击第一条数据，进入详细页面',
          },
        ],
        explanation: '点击第一条数据',
      }),
    });
    const service = createService({ listModels, callModel });

    const result = await service.parseCommand({
      input: '点击第一条数据，进入详细页面',
      context: {
        availableCandidates: [
          {
            candidateId: 'action_31',
            kind: 'action',
            label: '詳細',
            summary:
              'candidateId=action_31 | kind=action | role=button | region=approval-list | row=1 | rowKey=PRJ-2026-001 | action=detail | stable=open-project-detail | label=詳細',
            source: 'row',
            role: 'button',
            text: '詳細',
            action: 'detail',
            stableName: 'open-project-detail',
            row: { index: 1, key: 'PRJ-2026-001' },
            region: { name: 'approval-list' },
            preferredLocator: {
              type: 'css',
              value:
                ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
            },
          },
          {
            candidateId: 'action_40',
            kind: 'action',
            label: '詳細',
            summary:
              'candidateId=action_40 | kind=action | role=button | region=approval-list | row=2 | rowKey=PRJ-2026-002 | action=detail | stable=open-project-detail | label=詳細',
            source: 'row',
            role: 'button',
            text: '詳細',
            action: 'detail',
            stableName: 'open-project-detail',
            row: { index: 2, key: 'PRJ-2026-002' },
            region: { name: 'approval-list' },
            preferredLocator: {
              type: 'css',
              value:
                ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 2)',
            },
          },
        ],
      },
    });

    expect(callModel).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      expect.objectContaining({
        tool: 'click',
        params: {
          target:
            ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
        },
        description: '点击第一条数据，进入详细页面',
        locator: expect.objectContaining({
          strategy: 'css',
          value:
            ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
          generatedBy: 'candidate-first',
          matchedCandidateId: 'action_31',
        }),
      }),
    ]);
  });

  it('rejects AI plan clicks that bind row-scoped detail intents to non-row candidates', async () => {
    const listModels = jest.fn().mockResolvedValue([{ id: 'model-1', status: 'active' }]);
    const callModel = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        steps: [
          {
            action: 'click',
            params: {
              candidateId: 'action_13',
            },
            description: '点击第一条数据(PRJ-2026-001)的详情按钮',
          },
        ],
        explanation: '点击第一条数据的详情按钮',
      }),
    });
    const service = createService({ listModels, callModel });

    const result = await service.parseCommand({
      input: '点击第一条数据，进入详细页面',
      context: {
        availableCandidates: [
          {
            candidateId: 'action_13',
            kind: 'action',
            label: '詳細',
            summary:
              'candidateId=action_13 | kind=action | role=button | action=detail | stable=open-project-detail | label=詳細',
            source: 'probe',
            role: 'button',
            text: '詳細',
            action: 'detail',
            stableName: 'open-project-detail',
            preferredLocator: {
              type: 'css',
              value: '[data-ai-action="detail"]',
            },
          },
          {
            candidateId: 'action_31',
            kind: 'action',
            label: '詳細',
            summary:
              'candidateId=action_31 | kind=action | role=button | region=approval-list | row=1 | rowKey=PRJ-2026-001 | action=detail | stable=open-project-detail | label=詳細',
            source: 'row',
            role: 'button',
            text: '詳細',
            action: 'detail',
            stableName: 'open-project-detail',
            row: { index: 1, key: 'PRJ-2026-001' },
            region: { name: 'approval-list' },
            preferredLocator: {
              type: 'css',
              value:
                ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
            },
          },
          {
            candidateId: 'action_40',
            kind: 'action',
            label: '詳細',
            summary:
              'candidateId=action_40 | kind=action | role=button | region=approval-list | row=2 | rowKey=PRJ-2026-002 | action=detail | stable=open-project-detail | label=詳細',
            source: 'row',
            role: 'button',
            text: '詳細',
            action: 'detail',
            stableName: 'open-project-detail',
            row: { index: 2, key: 'PRJ-2026-002' },
            region: { name: 'approval-list' },
            preferredLocator: {
              type: 'css',
              value:
                ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 2)',
            },
          },
        ],
      },
    });

    expect(callModel).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      expect.objectContaining({
        tool: 'click',
        params: {
          target:
            ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
        },
        description: '点击第一条数据，进入详细页面',
        locator: expect.objectContaining({
          strategy: 'css',
          value:
            ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
          generatedBy: 'candidate-first',
          matchedCandidateId: 'action_31',
        }),
      }),
    ]);
  });

  it('buildAIPlan prompt should instruct candidate-aware click intents instead of text clicks', async () => {
    const listModels = jest.fn().mockResolvedValue([{ id: 'model-1', status: 'active' }]);
    const callModel = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        steps: [],
        explanation: '',
      }),
    });
    const service = createService({ listModels, callModel });

    await (service as any).buildAIPlan('点击登录', {
      availableCandidates: [
        {
          candidateId: 'action_1',
          kind: 'action',
          label: '平台登录',
          summary: 'candidateId=action_1 | kind=action | ref=e1080 | role=link | label=平台登录',
          source: 'probe',
          ref: 'e1080',
          role: 'link',
          preferredLocator: { type: 'ref', value: 'e1080' },
        },
      ],
    });

    expect(callModel).toHaveBeenCalledWith(
      'model-1',
      expect.stringContaining('prefer params.candidateId or params.rawTarget')
    );
    expect(callModel).toHaveBeenCalledWith(
      'model-1',
      expect.stringContaining(
        '"params":{"rawTarget":"登录","roleHint":"button","semanticHint":"submit"}'
      )
    );
    expect(callModel).toHaveBeenCalledWith(
      'model-1',
      expect.stringContaining('"params":{"candidateId":"action_1"}')
    );
    expect(callModel).toHaveBeenCalledWith(
      'model-1',
      expect.stringContaining('params.rawTarget="详情" with params.rowHint={"index":1}')
    );
  });
});
