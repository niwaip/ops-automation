import { SemanticRuleGenerationService } from '../src/modules/generation/semantic-rule-generation.service';

describe('SemanticRuleGenerationService', () => {
  it('generates LOGIN profile drafts with login_terms outputs from login-tagged samples', async () => {
    const prisma = {
      semanticRuleDomain: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'domain-browser-recorder',
          code: 'browser_recorder',
        }),
      },
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-log-login-1',
            createdAt: new Date('2026-06-21T00:00:00.000Z'),
            source: 'parse',
            errorType: 'COMMAND_PARSE_FAILED',
            errorMessage: 'login profile miss',
            inputText: '工号是 u001 口令是 s3curE 继续',
            normalizedInput: '工号是 u001 口令是 s3curE 继续',
            traceId: 'trace-login-1',
            host: 'erp.example.com',
            pageType: 'login',
            observationSummary: '页面显示 继续登录 按钮',
            normalizedSemantic: {
              parser_metadata: {
                login: {
                  status: 'profile_miss',
                  reason: 'login-submit-target-missing',
                },
              },
            },
            parserOutput: {
              metadata: {
                login: {
                  status: 'profile_miss',
                  reason: 'login-submit-target-missing',
                },
              },
            },
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleGenerationService(prisma, {} as any);

    const result = await service.generateDraft({
      domain_code: 'browser_recorder',
      category: 'LOGIN',
    });

    expect(result.generated).toBe(true);
    expect(result.draft_rule_set.rules).toHaveLength(1);
    expect(result.draft_rule_set.rules[0]).toEqual(
      expect.objectContaining({
        type: 'LOGIN_PHRASE',
        category: 'LOGIN',
        name: 'ai_login_profile',
        outputs: expect.objectContaining({
          profile_type: 'login_terms',
          semantic_key: 'login_profile',
          credential_intent_terms: expect.arrayContaining(['工号', '口令']),
          username_terms: ['工号'],
          password_terms: ['口令'],
          submit_intent_terms: expect.arrayContaining(['继续', '登录']),
          interrupt_policy: 'takeover_required',
        }),
      })
    );
  });

  it('generates NAVIGATION profile drafts with navigation_target outputs when destination is inferable', async () => {
    const prisma = {
      semanticRuleDomain: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'domain-browser-recorder',
          code: 'browser_recorder',
        }),
      },
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-log-navigation-1',
            createdAt: new Date('2026-06-21T00:00:00.000Z'),
            source: 'execution',
            errorType: 'COMMAND_EXECUTION_FAILED',
            errorMessage: 'navigation target resolved but click timed out',
            inputText: '打开审批中心',
            normalizedInput: '打开审批中心',
            traceId: 'trace-navigation-1',
            host: '192.168.100.143',
            pageType: 'workspace',
            pageUrl: 'http://192.168.100.143/#dashboard',
            observationSummary: '页面顶部有审批中心入口',
            normalizedSemantic: {
              parser_metadata: {
                navigation: {
                  status: 'success',
                  resolvedTarget: '审批中心',
                  resolvedUrl: 'http://192.168.100.143/#approvals',
                },
              },
            },
            parserOutput: {
              metadata: {
                navigation: {
                  status: 'success',
                  resolvedTarget: '审批中心',
                  resolvedUrl: 'http://192.168.100.143/#approvals',
                },
              },
            },
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleGenerationService(prisma, {} as any);

    const result = await service.generateDraft({
      domain_code: 'browser_recorder',
      category: 'NAVIGATION',
    });

    expect(result.generated).toBe(true);
    expect(result.draft_rule_set.rules).toHaveLength(1);
    expect(result.draft_rule_set.rules[0]).toEqual(
      expect.objectContaining({
        type: 'INTENT_ALIAS',
        category: 'NAVIGATION',
        name: 'ai_navigation_profile',
        outputs: expect.objectContaining({
          profile_type: 'navigation_target',
          semantic_key: 'navigation_profile',
          target_terms: expect.arrayContaining(['审批中心']),
          destination_path: '/#approvals',
        }),
      })
    );
  });

  it('keeps generic navigate alias when navigation destination is not inferable', async () => {
    const prisma = {
      semanticRuleDomain: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'domain-browser-recorder',
          code: 'browser_recorder',
        }),
      },
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-log-navigation-2',
            createdAt: new Date('2026-06-21T00:00:00.000Z'),
            source: 'parse',
            errorType: 'COMMAND_PARSE_FAILED',
            errorMessage: 'cannot infer where to open',
            inputText: '打开工作台',
            normalizedInput: '打开工作台',
            traceId: 'trace-navigation-2',
            host: 'erp.example.com',
            pageType: 'workspace',
            observationSummary: '当前在首页',
            normalizedSemantic: null,
            parserOutput: null,
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleGenerationService(prisma, {} as any);

    const result = await service.generateDraft({
      domain_code: 'browser_recorder',
      category: 'NAVIGATION',
    });

    expect(result.generated).toBe(true);
    expect(result.draft_rule_set.rules).toHaveLength(1);
    const generatedRule = result.draft_rule_set.rules[0]!;
    expect(generatedRule).toEqual(
      expect.objectContaining({
        name: 'ai_navigate_intent',
        outputs: expect.objectContaining({
          semantic_key: 'navigate',
        }),
      })
    );
    expect(generatedRule.outputs).not.toHaveProperty('profile_type');
  });

  it('generates READ profile drafts with read_target outputs when read metadata is available', async () => {
    const prisma = {
      semanticRuleDomain: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'domain-browser-recorder',
          code: 'browser_recorder',
        }),
      },
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-log-read-1',
            createdAt: new Date('2026-06-21T00:00:00.000Z'),
            source: 'execution',
            errorType: 'COMMAND_EXECUTION_FAILED',
            errorMessage: 'read target resolved but selector timed out',
            inputText: '读取当前案件毛利率',
            normalizedInput: '读取当前案件毛利率',
            traceId: 'trace-read-1',
            host: 'erp.example.com',
            pageType: 'detail',
            observationSummary: '详情页有 gross margin 卡片',
            normalizedSemantic: {
              parser_metadata: {
                read: {
                  status: 'success',
                  reason: 'read-runtime-field-region',
                  resolvedTarget: '毛利率',
                  resolvedField: 'grossMargin',
                  resolvedRegion: 'gross-margin-panel',
                },
              },
            },
            parserOutput: {
              metadata: {
                read: {
                  status: 'success',
                  reason: 'read-runtime-field-region',
                  resolvedTarget: '毛利率',
                  resolvedField: 'grossMargin',
                  resolvedRegion: 'gross-margin-panel',
                },
              },
            },
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleGenerationService(prisma, {} as any);

    const result = await service.generateDraft({
      domain_code: 'browser_recorder',
      category: 'READ_VALUE',
    });

    expect(result.generated).toBe(true);
    expect(result.draft_rule_set.rules).toHaveLength(1);
    expect(result.draft_rule_set.rules[0]).toEqual(
      expect.objectContaining({
        type: 'READ_INTENT',
        category: 'READ_VALUE',
        name: 'ai_read_profile',
        outputs: expect.objectContaining({
          profile_type: 'read_target',
          semantic_key: 'read_profile',
          target_terms: ['毛利率'],
          field_terms: ['grossMargin'],
          region_terms: ['gross-margin-panel'],
        }),
      })
    );
  });

  it('generates ACTION profile drafts with action_target outputs when action metadata is available', async () => {
    const prisma = {
      semanticRuleDomain: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'domain-browser-recorder',
          code: 'browser_recorder',
        }),
      },
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-log-action-1',
            createdAt: new Date('2026-06-21T00:00:00.000Z'),
            source: 'execution',
            errorType: 'COMMAND_EXECUTION_FAILED',
            errorMessage: 'action target resolved but click timed out',
            inputText: '点击承认按钮',
            normalizedInput: '点击承认按钮',
            traceId: 'trace-action-1',
            host: 'erp.example.com',
            pageType: 'detail',
            observationSummary: '详情页有审批通过按钮',
            normalizedSemantic: {
              parser_metadata: {
                action: {
                  status: 'success',
                  reason: 'action-runtime-region',
                  resolvedTarget: '承认按钮',
                  resolvedActionTerm: 'approve',
                  semanticHint: 'confirm',
                  resolvedRegion: 'decision-actions',
                  resolvedRoleHint: 'button',
                  categoryHint: 'ROW_ACTION',
                },
              },
            },
            parserOutput: {
              metadata: {
                action: {
                  status: 'success',
                  reason: 'action-runtime-region',
                  resolvedTarget: '承认按钮',
                  resolvedActionTerm: 'approve',
                  semanticHint: 'confirm',
                  resolvedRegion: 'decision-actions',
                  resolvedRoleHint: 'button',
                  categoryHint: 'ROW_ACTION',
                },
              },
            },
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleGenerationService(prisma, {} as any);

    const result = await service.generateDraft({
      domain_code: 'browser_recorder',
      category: 'ROW_ACTION',
    });

    expect(result.generated).toBe(true);
    expect(result.draft_rule_set.rules).toHaveLength(1);
    expect(result.draft_rule_set.rules[0]).toEqual(
      expect.objectContaining({
        type: 'INTENT_ALIAS',
        category: 'ROW_ACTION',
        name: 'ai_row_action_profile',
        outputs: expect.objectContaining({
          profile_type: 'action_target',
          semantic_key: 'action_profile',
          target_terms: ['承认按钮'],
          action_terms: ['approve'],
          region_terms: ['decision-actions'],
          role_hints: ['button'],
          category_hint: 'ROW_ACTION',
        }),
      })
    );
  });

  it('generates DETAIL_OPEN action profile drafts from detail metadata', async () => {
    const prisma = {
      semanticRuleDomain: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'domain-browser-recorder',
          code: 'browser_recorder',
        }),
      },
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-log-detail-1',
            createdAt: new Date('2026-06-21T00:00:00.000Z'),
            source: 'execution',
            errorType: 'COMMAND_EXECUTION_FAILED',
            errorMessage: 'detail action resolved but detail page timeout',
            inputText: '打开第一条记录的详情',
            normalizedInput: '打开第一条记录的详情',
            traceId: 'trace-detail-1',
            host: 'erp.example.com',
            pageType: 'list',
            observationSummary: '审批列表每一行都有详情按钮',
            normalizedSemantic: {
              parser_metadata: {
                action: {
                  status: 'success',
                  reason: 'action-runtime-row',
                  resolvedTarget: '详情',
                  resolvedActionTerm: '详情',
                  semanticHint: 'open',
                  rowIndex: 1,
                  categoryHint: 'DETAIL_OPEN',
                },
              },
            },
            parserOutput: {
              metadata: {
                action: {
                  status: 'success',
                  reason: 'action-runtime-row',
                  resolvedTarget: '详情',
                  resolvedActionTerm: '详情',
                  semanticHint: 'open',
                  rowIndex: 1,
                  categoryHint: 'DETAIL_OPEN',
                },
              },
            },
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleGenerationService(prisma, {} as any);

    const result = await service.generateDraft({
      domain_code: 'browser_recorder',
      category: 'DETAIL_OPEN',
    });

    expect(result.generated).toBe(true);
    expect(result.draft_rule_set.rules).toHaveLength(1);
    expect(result.draft_rule_set.rules[0]).toEqual(
      expect.objectContaining({
        type: 'INTENT_ALIAS',
        category: 'DETAIL_OPEN',
        name: 'ai_detail_action_profile',
        outputs: expect.objectContaining({
          profile_type: 'action_target',
          semantic_key: 'action_profile',
          target_terms: ['详情'],
          action_terms: ['详情'],
          semantic_hint: 'detail',
          category_hint: 'DETAIL_OPEN',
        }),
      })
    );
  });

  it('generates MENU_SELECTION action profile drafts from menu metadata', async () => {
    const prisma = {
      semanticRuleDomain: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'domain-browser-recorder',
          code: 'browser_recorder',
        }),
      },
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-log-menu-1',
            createdAt: new Date('2026-06-21T00:00:00.000Z'),
            source: 'execution',
            errorType: 'COMMAND_EXECUTION_FAILED',
            errorMessage: 'menu action resolved but dropdown did not open',
            inputText: '选择更多菜单',
            normalizedInput: '选择更多菜单',
            traceId: 'trace-menu-1',
            host: 'erp.example.com',
            pageType: 'detail',
            observationSummary: '工具栏有更多菜单按钮',
            normalizedSemantic: {
              parser_metadata: {
                action: {
                  status: 'success',
                  reason: 'action-runtime-target',
                  resolvedTarget: '更多菜单',
                  resolvedActionTerm: 'menu',
                  semanticHint: 'open',
                  resolvedRoleHint: 'button',
                  categoryHint: 'MENU_SELECTION',
                },
              },
            },
            parserOutput: {
              metadata: {
                action: {
                  status: 'success',
                  reason: 'action-runtime-target',
                  resolvedTarget: '更多菜单',
                  resolvedActionTerm: 'menu',
                  semanticHint: 'open',
                  resolvedRoleHint: 'button',
                  categoryHint: 'MENU_SELECTION',
                },
              },
            },
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleGenerationService(prisma, {} as any);

    const result = await service.generateDraft({
      domain_code: 'browser_recorder',
      category: 'MENU_SELECTION',
    });

    expect(result.generated).toBe(true);
    expect(result.draft_rule_set.rules).toHaveLength(1);
    expect(result.draft_rule_set.rules[0]).toEqual(
      expect.objectContaining({
        type: 'INTENT_ALIAS',
        category: 'MENU_SELECTION',
        name: 'ai_menu_action_profile',
        outputs: expect.objectContaining({
          profile_type: 'action_target',
          semantic_key: 'action_profile',
          target_terms: ['更多菜单'],
          action_terms: ['menu'],
          role_hints: ['button'],
          semantic_hint: 'menu',
          category_hint: 'MENU_SELECTION',
        }),
      })
    );
  });

  it('generates SEARCH profile drafts with search_intent outputs when search metadata is available', async () => {
    const prisma = {
      semanticRuleDomain: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'domain-browser-recorder',
          code: 'browser_recorder',
        }),
      },
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-log-search-1',
            createdAt: new Date('2026-06-21T00:00:00.000Z'),
            source: 'execution',
            errorType: 'COMMAND_EXECUTION_FAILED',
            errorMessage: 'search resolved but result click timed out',
            inputText: '站内搜 审批单',
            normalizedInput: '站内搜 审批单',
            traceId: 'trace-search-1',
            host: 'erp.example.com',
            pageType: 'list',
            observationSummary: '列表页包含站内搜索框',
            normalizedSemantic: {
              parser_metadata: {
                search: {
                  status: 'success',
                  reason: 'search-runtime-query',
                  intentType: 'smart_search',
                  query: '审批单',
                  triggerTerm: '站内搜',
                },
              },
            },
            parserOutput: {
              metadata: {
                search: {
                  status: 'success',
                  reason: 'search-runtime-query',
                  intentType: 'smart_search',
                  query: '审批单',
                  triggerTerm: '站内搜',
                },
              },
            },
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleGenerationService(prisma, {} as any);

    const result = await service.generateDraft({
      domain_code: 'browser_recorder',
      category: 'SEARCH',
    });

    expect(result.generated).toBe(true);
    expect(result.draft_rule_set.rules).toHaveLength(1);
    expect(result.draft_rule_set.rules[0]).toEqual(
      expect.objectContaining({
        type: 'INTENT_ALIAS',
        category: 'SEARCH',
        name: 'ai_search_profile',
        outputs: expect.objectContaining({
          profile_type: 'search_intent',
          semantic_key: 'search_profile',
          search_terms: ['搜索'],
          smart_search_terms: ['站内搜'],
          list_result_terms: ['列出搜索结果'],
          click_result_terms: ['点击'],
        }),
      })
    );
  });

  it('generates FIELD_FILL profile drafts with field_fill_terms outputs when field fill metadata is available', async () => {
    const prisma = {
      semanticRuleDomain: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'domain-browser-recorder',
          code: 'browser_recorder',
        }),
      },
      semanticRuleErrorLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'error-log-field-fill-1',
            createdAt: new Date('2026-06-21T00:00:00.000Z'),
            source: 'execution',
            errorType: 'COMMAND_EXECUTION_FAILED',
            errorMessage: 'field fill resolved but value validation failed',
            inputText: '在审批区域填写备注 通过',
            normalizedInput: '在审批区域填写备注 通过',
            traceId: 'trace-field-fill-1',
            host: 'erp.example.com',
            pageType: 'detail',
            observationSummary: '审批区域有备注输入框',
            normalizedSemantic: {
              parser_metadata: {
                fieldFill: {
                  status: 'success',
                  reason: 'field-fill-runtime-field-region',
                  resolvedField: '备注',
                  resolvedCanonicalField: 'comment',
                  resolvedRegion: '审批区域',
                  value: '通过',
                },
              },
            },
            parserOutput: {
              metadata: {
                fieldFill: {
                  status: 'success',
                  reason: 'field-fill-runtime-field-region',
                  resolvedField: '备注',
                  resolvedCanonicalField: 'comment',
                  resolvedRegion: '审批区域',
                  value: '通过',
                },
              },
            },
          },
        ]),
      },
    } as any;

    const service = new SemanticRuleGenerationService(prisma, {} as any);

    const result = await service.generateDraft({
      domain_code: 'browser_recorder',
      category: 'FIELD_FILL',
    });

    expect(result.generated).toBe(true);
    expect(result.draft_rule_set.rules).toHaveLength(1);
    expect(result.draft_rule_set.rules[0]).toEqual(
      expect.objectContaining({
        type: 'FIELD_ALIAS',
        category: 'FIELD_FILL',
        name: 'ai_field_fill_profile',
        outputs: expect.objectContaining({
          profile_type: 'field_fill_terms',
          semantic_key: 'field_fill_profile',
          field_terms: ['备注'],
          canonical_field: 'comment',
          region_terms: ['审批区域'],
          value_hints: ['通过'],
          intent_terms: ['填写'],
        }),
      })
    );
  });
});
