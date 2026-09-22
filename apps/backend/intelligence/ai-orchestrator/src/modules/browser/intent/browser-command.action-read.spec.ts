import { createService } from './browser-command.test-helper';

describe('BrowserCommandService', () => {
  it('maps unapproved-data selection to pending status candidate on approvals page', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '选择没有承认的数据',
      context: {
        currentPageUrl: 'http://localhost/#approvals',
        availableCandidates: [
          {
            candidateId: 'action_23',
            kind: 'action',
            label: 'すべて',
            summary:
              'candidateId=action_23 | kind=action | ref=e81 | role=button | label=すべて | text=すべて',
            source: 'probe',
            ref: 'e81',
            role: 'button',
            text: 'すべて',
            preferredLocator: { type: 'ref', value: 'e81' },
          },
          {
            candidateId: 'action_24',
            kind: 'action',
            label: '保留中',
            summary:
              'candidateId=action_24 | kind=action | ref=e82 | role=button | label=保留中 | text=保留中',
            source: 'probe',
            ref: 'e82',
            role: 'button',
            text: '保留中',
            preferredLocator: { type: 'ref', value: 'e82' },
          },
          {
            candidateId: 'action_25',
            kind: 'action',
            label: '承認済み',
            summary:
              'candidateId=action_25 | kind=action | ref=e83 | role=button | label=承認済み | text=承認済み',
            source: 'probe',
            ref: 'e83',
            role: 'button',
            text: '承認済み',
            preferredLocator: { type: 'ref', value: 'e83' },
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
            target: 'e82',
          },
          description: '选择没有承认的数据',
          locator: {
            strategy: 'ref',
            value: 'e82',
            generatedBy: 'candidate-first',
            confidence: 0.98,
            matchedCandidateId: 'action_24',
            resolutionMode: 'preferred-locator',
          },
        },
      ],
      explanation: '将选择没有承认的数据',
      parserMetadata: {
        action: {
          status: 'success',
          reason: 'action-default-candidate',
          resolvedTarget: '没有承认的数据',
          resolvedActionTerm: '没有承认的数据',
          semanticHint: undefined,
          resolvedRegion: undefined,
          resolvedRoleHint: undefined,
          rowIndex: undefined,
          categoryHint: undefined,
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    });
  });

  it('falls back to raw text click when no candidates are available', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '点击继续',
      context: {
        commandType: 'click',
      },
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      {
        tool: 'click',
        params: {
          text: '继续',
        },
        description: '点击继续',
        locator: {
          strategy: 'text',
          value: '继续',
          generatedBy: 'fallback',
          confidence: 0.4,
          matchedCandidateId: undefined,
          resolutionMode: 'text-fallback',
        },
      },
    ]);
  });

  it('parses row-scoped detail click into a ref target when context provides structured hints', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '点击第一条记录的详情',
      context: {
        availableCandidates: [
          'kind=action | ref=e88 | role=button | region=approval-list | row=1 | rowKey=PRJ-2026-001 | action=detail | stable=open-project-detail | label=詳細 | rowText=PRJ-2026-001 AI搭載スマート倉庫',
          'kind=action | ref=e99 | role=button | region=approval-list | row=2 | rowKey=PRJ-2026-002 | action=detail | stable=open-project-detail | label=詳細 | rowText=PRJ-2026-002 グローバルEC刷新',
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      {
        tool: 'click',
        params: {
          target: 'e88',
        },
        description: '点击第一条记录的详情',
        locator: {
          strategy: 'ref',
          value: 'e88',
          generatedBy: 'candidate-first',
          confidence: 0.98,
          matchedCandidateId: 'candidate_1',
          resolutionMode: 'preferred-locator',
        },
      },
    ]);
  });

  it('parses first-row detail click into nth-match locator when repeated actions have no unique ref', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '点击第一条记录的详情',
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

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      expect.objectContaining({
        tool: 'click',
        params: {
          target:
            ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
        },
        description: '点击第一条记录的详情',
        locator: expect.objectContaining({
          strategy: 'css',
          value:
            ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
          generatedBy: 'candidate-first',
          matchedCandidateId: 'action_31',
          resolutionMode: 'preferred-locator',
        }),
      }),
    ]);
  });

  it('parses colloquial first-row detail phrasing into a row-scoped locator', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '点击第一个条记录，进行详细页面',
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
              'candidateId=action_31 | kind=action | role=button | row=1 | rowKey=PRJ-2026-001 | action=detail | stable=open-project-detail | label=詳細',
            source: 'row',
            role: 'button',
            text: '詳細',
            action: 'detail',
            stableName: 'open-project-detail',
            row: { index: 1, key: 'PRJ-2026-001' },
            preferredLocator: {
              type: 'css',
              value: ':nth-match([data-ai-action="detail"], 1)',
            },
          },
          {
            candidateId: 'action_40',
            kind: 'action',
            label: '詳細',
            summary:
              'candidateId=action_40 | kind=action | role=button | row=2 | rowKey=PRJ-2026-002 | action=detail | stable=open-project-detail | label=詳細',
            source: 'row',
            role: 'button',
            text: '詳細',
            action: 'detail',
            stableName: 'open-project-detail',
            row: { index: 2, key: 'PRJ-2026-002' },
            preferredLocator: {
              type: 'css',
              value: ':nth-match([data-ai-action="detail"], 2)',
            },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      expect.objectContaining({
        tool: 'click',
        params: {
          target: ':nth-match([data-ai-action="detail"], 1)',
        },
        description: '点击第一个条记录，进行详细页面',
        locator: expect.objectContaining({
          strategy: 'css',
          value: ':nth-match([data-ai-action="detail"], 1)',
          generatedBy: 'candidate-first',
          matchedCandidateId: 'action_31',
          resolutionMode: 'preferred-locator',
        }),
      }),
    ]);
  });

  it('parses unique approve action from structured candidates', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '点击承认按钮',
      context: {
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
            region: { name: 'decision-actions' },
            preferredLocator: { type: 'ref', value: 'e301' },
          },
          {
            candidateId: 'action_2',
            kind: 'action',
            label: '却下する (Reject)',
            summary:
              'candidateId=action_2 | kind=action | ref=e302 | region=decision-actions | action=reject | stable=reject-project | label=却下する (Reject)',
            source: 'region',
            ref: 'e302',
            action: 'reject',
            stableName: 'reject-project',
            region: { name: 'decision-actions' },
            preferredLocator: { type: 'ref', value: 'e302' },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
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
    ]);
  });

  it('parses action target from runtime action profile and records profile metadata', async () => {
    const createHitLog = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'runtime-rule-set-action',
          version: '2026.06.21',
          status: 'ACTIVE',
          rules: [
            {
              id: 'action-runtime-approve',
              category: 'ROW_ACTION',
              priority: 120,
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
        createHitLog,
      },
    });

    const result = await service.parseCommand({
      input: '点击承认按钮',
      context: {
        pageType: 'detail',
        traceId: 'trace-action-profile',
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
          matchedRuntimeRuleIds: ['action-runtime-approve'],
        },
      },
    });
    expect(createHitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        matched_rule_ids: ['action-runtime-approve'],
        normalized_semantic: expect.objectContaining({
          parser_source: 'action-profile',
          effective_profile_versions: expect.objectContaining({
            action: '2026.06.21',
          }),
          parser_metadata: {
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
              matchedRuntimeRuleIds: ['action-runtime-approve'],
            },
          },
        }),
      })
    );
  });

  it('parses detail-open target from runtime action profile and records profile metadata', async () => {
    const createHitLog = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'runtime-rule-set-detail-action',
          version: '2026.06.21',
          status: 'ACTIVE',
          rules: [
            {
              id: 'action-runtime-detail',
              category: 'DETAIL_OPEN',
              priority: 120,
              outputs: {
                profile_type: 'action_target',
                target_terms: ['详情', '详细页面'],
                semantic_hint: 'detail',
                action_terms: ['详情'],
                category_hint: 'DETAIL_OPEN',
                intent_terms: ['打开'],
              },
            },
          ],
        }),
        createHitLog,
      },
    });

    const result = await service.parseCommand({
      input: '打开第一条记录的详情',
      context: {
        pageType: 'list',
        traceId: 'trace-detail-action-profile',
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
        ],
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'click',
          params: {
            target:
              ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
          },
          description: '打开第一条记录的详情',
          locator: {
            strategy: 'css',
            value:
              ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
            generatedBy: 'candidate-first',
            confidence: 0.98,
            matchedCandidateId: 'action_31',
            resolutionMode: 'preferred-locator',
          },
        },
      ],
      explanation: '将打开第一条记录的详情',
      parserMetadata: {
        action: {
          status: 'success',
          reason: 'action-runtime-row',
          resolvedTarget: '详情',
          resolvedActionTerm: '详情',
          semanticHint: 'open',
          resolvedRegion: undefined,
          resolvedRoleHint: undefined,
          rowIndex: 1,
          categoryHint: 'DETAIL_OPEN',
          usedRuntimeProfile: true,
          matchedRuntimeRuleIds: ['action-runtime-detail'],
        },
      },
    });
    expect(createHitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        matched_rule_ids: ['action-runtime-detail'],
        normalized_semantic: expect.objectContaining({
          parser_source: 'action-profile',
          effective_profile_versions: expect.objectContaining({
            action: '2026.06.21',
          }),
          parser_metadata: {
            action: {
              status: 'success',
              reason: 'action-runtime-row',
              resolvedTarget: '详情',
              resolvedActionTerm: '详情',
              semanticHint: 'open',
              resolvedRegion: undefined,
              resolvedRoleHint: undefined,
              rowIndex: 1,
              categoryHint: 'DETAIL_OPEN',
              usedRuntimeProfile: true,
              matchedRuntimeRuleIds: ['action-runtime-detail'],
            },
          },
        }),
      })
    );
  });

  it('parses menu-selection target from runtime action profile and records profile metadata', async () => {
    const createHitLog = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'runtime-rule-set-menu-action',
          version: '2026.06.21',
          status: 'ACTIVE',
          rules: [
            {
              id: 'action-runtime-menu',
              category: 'MENU_SELECTION',
              priority: 120,
              outputs: {
                profile_type: 'action_target',
                target_terms: ['更多菜单', '操作菜单'],
                semantic_hint: 'menu',
                action_terms: ['menu'],
                role_hints: ['button'],
                category_hint: 'MENU_SELECTION',
                intent_terms: ['选择'],
              },
            },
          ],
        }),
        createHitLog,
      },
    });

    const result = await service.parseCommand({
      input: '选择更多菜单',
      context: {
        pageType: 'detail',
        traceId: 'trace-menu-action-profile',
        availableCandidates: [
          {
            candidateId: 'action_menu_1',
            kind: 'action',
            label: '更多',
            summary:
              'candidateId=action_menu_1 | kind=action | ref=e901 | role=button | region=toolbar-actions | action=menu | label=更多',
            source: 'region',
            ref: 'e901',
            role: 'button',
            action: 'menu',
            region: { name: 'toolbar-actions' },
            preferredLocator: { type: 'ref', value: 'e901' },
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
            target: 'e901',
          },
          description: '选择更多菜单',
          locator: {
            strategy: 'ref',
            value: 'e901',
            generatedBy: 'candidate-first',
            confidence: 0.98,
            matchedCandidateId: 'action_menu_1',
            resolutionMode: 'preferred-locator',
          },
        },
      ],
      explanation: '将选择更多菜单',
      parserMetadata: {
        action: {
          status: 'success',
          reason: 'action-runtime-target',
          resolvedTarget: '更多菜单',
          resolvedActionTerm: 'menu',
          semanticHint: 'open',
          resolvedRegion: undefined,
          resolvedRoleHint: 'button',
          rowIndex: undefined,
          categoryHint: 'MENU_SELECTION',
          usedRuntimeProfile: true,
          matchedRuntimeRuleIds: ['action-runtime-menu'],
        },
      },
    });
    expect(createHitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        matched_rule_ids: ['action-runtime-menu'],
        normalized_semantic: expect.objectContaining({
          parser_source: 'action-profile',
          effective_profile_versions: expect.objectContaining({
            action: '2026.06.21',
          }),
          parser_metadata: {
            action: {
              status: 'success',
              reason: 'action-runtime-target',
              resolvedTarget: '更多菜单',
              resolvedActionTerm: 'menu',
              semanticHint: 'open',
              resolvedRegion: undefined,
              resolvedRoleHint: 'button',
              rowIndex: undefined,
              categoryHint: 'MENU_SELECTION',
              usedRuntimeProfile: true,
              matchedRuntimeRuleIds: ['action-runtime-menu'],
            },
          },
        }),
      })
    );
  });

  it('parses field read intent into a stable selector from structured candidates', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '读取当前案件毛利率',
      context: {
        availableCandidates: [
          {
            candidateId: 'field_1',
            kind: 'field',
            label: '案件粗利率（毛利率）',
            summary:
              'candidateId=field_1 | kind=field | testid=gross-margin-value | region=gross-margin-panel | field=grossMargin | label=案件粗利率（毛利率） | text=25.5%',
            source: 'region',
            dataTestId: 'gross-margin-value',
            field: 'grossMargin',
            text: '25.5%',
            region: { name: 'gross-margin-panel' },
            preferredLocator: { type: 'testid', value: 'gross-margin-value' },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      {
        tool: 'get_text',
        params: {
          selector: '[data-testid="gross-margin-value"]',
          max_length: 1000,
        },
        description: '读取当前案件毛利率',
        locator: {
          strategy: 'css',
          value: '[data-testid="gross-margin-value"]',
          generatedBy: 'context',
          confidence: 0.9,
        },
      },
    ]);
  });

  it('parses gross margin read intent even when field candidate label is only numeric', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '读取当前案件毛利率',
      context: {
        availableCandidates: [
          {
            candidateId: 'field_39',
            kind: 'field',
            label: '25.5%',
            summary:
              'candidateId=field_39 | kind=field | id=detail-gross-margin | testid=gross-margin-value | region=gross-margin-panel | field=grossMargin | label=25.5% | text=25.5%',
            source: 'region',
            elementId: 'detail-gross-margin',
            dataTestId: 'gross-margin-value',
            field: 'grossMargin',
            text: '25.5%',
            region: { name: 'gross-margin-panel' },
            preferredLocator: { type: 'testid', value: 'gross-margin-value' },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      {
        tool: 'get_text',
        params: {
          selector: '[data-testid="gross-margin-value"]',
          max_length: 1000,
        },
        description: '读取当前案件毛利率',
        locator: {
          strategy: 'css',
          value: '[data-testid="gross-margin-value"]',
          generatedBy: 'context',
          confidence: 0.9,
        },
      },
    ]);
  });

  it('deduplicates equivalent read selectors and still chooses the field candidate', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '读取当前案件毛利率',
      context: {
        availableCandidates: [
          {
            candidateId: 'region_38',
            kind: 'region',
            label: '案件粗利率（毛利率） 25.5%',
            summary:
              'candidateId=region_38 | kind=region | id=detail-margin-card | region=gross-margin-panel | label=案件粗利率（毛利率） 25.5%',
            source: 'region',
            region: { name: 'gross-margin-panel' },
            preferredLocator: { type: 'css', value: '#detail-margin-card' },
          },
          {
            candidateId: 'field_22',
            kind: 'field',
            label: '25.5%',
            summary:
              'candidateId=field_22 | kind=field | testid=gross-margin-value | region=approval-workspace | field=grossMargin | label=25.5%',
            source: 'region',
            dataTestId: 'gross-margin-value',
            field: 'grossMargin',
            region: { name: 'approval-workspace' },
            preferredLocator: { type: 'testid', value: 'gross-margin-value' },
          },
          {
            candidateId: 'field_30',
            kind: 'field',
            label: '25.5%',
            summary:
              'candidateId=field_30 | kind=field | testid=gross-margin-value | region=approval-detail | field=grossMargin | label=25.5%',
            source: 'region',
            dataTestId: 'gross-margin-value',
            field: 'grossMargin',
            region: { name: 'approval-detail' },
            preferredLocator: { type: 'testid', value: 'gross-margin-value' },
          },
          {
            candidateId: 'field_39',
            kind: 'field',
            label: '25.5%',
            summary:
              'candidateId=field_39 | kind=field | testid=gross-margin-value | region=gross-margin-panel | field=grossMargin | label=25.5%',
            source: 'region',
            dataTestId: 'gross-margin-value',
            field: 'grossMargin',
            region: { name: 'gross-margin-panel' },
            preferredLocator: { type: 'testid', value: 'gross-margin-value' },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.commands).toEqual([
      expect.objectContaining({
        tool: 'get_text',
        params: expect.objectContaining({
          selector: '[data-testid="gross-margin-value"]',
        }),
      }),
    ]);
  });

  it('parses read target from runtime read profile and records profile metadata', async () => {
    const createHitLog = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      browserSemanticsOverrides: {
        resolveRuntimeRuleSet: jest.fn().mockResolvedValue({
          rule_set_id: 'runtime-rule-set-read',
          version: '2026.06.21',
          status: 'ACTIVE',
          rules: [
            {
              id: 'read-runtime-margin',
              category: 'READ_VALUE',
              priority: 120,
              outputs: {
                profile_type: 'read_target',
                target_terms: ['毛利率', '粗利率'],
                field_terms: ['grossMargin'],
                region_terms: ['gross-margin-panel'],
                intent_terms: ['读取'],
              },
            },
          ],
        }),
        createHitLog,
      },
    });

    const result = await service.parseCommand({
      input: '读取当前案件毛利率',
      context: {
        traceId: 'trace-read-profile',
        pageType: 'detail',
        availableCandidates: [
          {
            candidateId: 'field_39',
            kind: 'field',
            label: '25.5%',
            summary:
              'candidateId=field_39 | kind=field | testid=gross-margin-value | region=gross-margin-panel | field=grossMargin | label=25.5%',
            source: 'region',
            dataTestId: 'gross-margin-value',
            field: 'grossMargin',
            region: { name: 'gross-margin-panel' },
            preferredLocator: { type: 'testid', value: 'gross-margin-value' },
          },
        ],
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'get_text',
          params: {
            selector: '[data-testid="gross-margin-value"]',
            max_length: 1000,
          },
          description: '读取当前案件毛利率',
          locator: {
            strategy: 'css',
            value: '[data-testid="gross-margin-value"]',
            generatedBy: 'context',
            confidence: 0.9,
          },
        },
      ],
      explanation: '将读取当前案件毛利率',
      parserMetadata: {
        read: {
          status: 'success',
          reason: 'read-runtime-field-region',
          resolvedTarget: '毛利率',
          resolvedField: 'grossMargin',
          resolvedRegion: 'gross-margin-panel',
          selector: '[data-testid="gross-margin-value"]',
          usedRuntimeProfile: true,
          matchedRuntimeRuleIds: ['read-runtime-margin'],
        },
      },
    });
    expect(createHitLog).toHaveBeenCalledWith(
      expect.objectContaining({
        matched_rule_ids: ['read-runtime-margin'],
        normalized_semantic: expect.objectContaining({
          parser_source: 'read-profile',
          effective_profile_versions: expect.objectContaining({
            read: '2026.06.21',
          }),
          parser_metadata: {
            read: {
              status: 'success',
              reason: 'read-runtime-field-region',
              resolvedTarget: '毛利率',
              resolvedField: 'grossMargin',
              resolvedRegion: 'gross-margin-panel',
              selector: '[data-testid="gross-margin-value"]',
              usedRuntimeProfile: true,
              matchedRuntimeRuleIds: ['read-runtime-margin'],
            },
          },
        }),
      })
    );
  });

  it('parses read intent from input candidates before falling back to ai-plan', async () => {
    const service = createService();

    const result = await service.parseCommand({
      input: '读取 Customer name:',
      context: {
        availableCandidates: [
          {
            candidateId: 'input_1',
            kind: 'input',
            label: 'Customer name:',
            summary:
              'candidateId=input_1 | kind=input | ref=e5 | role=textbox | label=Customer name:',
            source: 'probe',
            ref: 'e5',
            role: 'textbox',
            preferredLocator: { type: 'ref', value: 'e5' },
          },
        ],
      },
    });

    expect(result).toEqual({
      success: true,
      commands: [
        {
          tool: 'get_text',
          params: {
            selector: 'role=textbox[name="Customer name:"]',
            max_length: 1000,
            method: 'value',
          },
          description: '读取Customer name:',
          locator: {
            strategy: 'role',
            value: 'role=textbox[name="Customer name:"]',
            generatedBy: 'context',
            confidence: 0.9,
          },
        },
      ],
      explanation: '将读取Customer name:',
      parserMetadata: {
        read: {
          status: 'success',
          reason: 'read-default-candidate',
          resolvedTarget: 'customer name',
          resolvedField: undefined,
          resolvedRegion: undefined,
          selector: 'role=textbox[name="Customer name:"]',
          usedRuntimeProfile: false,
          matchedRuntimeRuleIds: [],
        },
      },
    });
  });
});
