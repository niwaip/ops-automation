jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
    Logger: class {
      log() {}
      warn() {}
      error() {}
      debug() {}
    },
  }),
  { virtual: true }
);

jest.mock(
  '../model/model.service',
  () => ({
    ModelService: class {},
  }),
  { virtual: true }
);

import { BrowserCommandService } from './browser-command.service';
import { BrowserCandidateContextFormatter } from './browser-candidate-context.formatter';
import { BrowserPlannerPromptBuilder } from './browser-planner-prompt.builder';
import { BrowserPlannerResponseParser } from './browser-planner-response.parser';
import { BrowserExecutionPlannerService } from './browser-execution-planner.service';

describe('BrowserCommandService', () => {
  const createService = (modelOverrides?: Partial<{ listModels: jest.Mock; callModel: jest.Mock }>) => {
    const modelService = {
      listModels: modelOverrides?.listModels || jest.fn().mockResolvedValue([]),
      callModel: modelOverrides?.callModel || jest.fn(),
    } as any;
    const candidateFormatter = new BrowserCandidateContextFormatter();
    const promptBuilder = new BrowserPlannerPromptBuilder(candidateFormatter);
    const responseParser = new BrowserPlannerResponseParser();
    const plannerService = new BrowserExecutionPlannerService(
      modelService,
      promptBuilder,
      responseParser
    );

    return new BrowserCommandService(plannerService);
  };

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
            summary: 'candidateId=action_23 | kind=action | ref=e81 | role=button | label=すべて | text=すべて',
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
            summary: 'candidateId=action_24 | kind=action | ref=e82 | role=button | label=保留中 | text=保留中',
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
            summary: 'candidateId=action_25 | kind=action | ref=e83 | role=button | label=承認済み | text=承認済み',
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
            summary:
              'candidateId=action_1 | kind=action | ref=e1080 | role=link | label=平台登录',
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
      expect.stringContaining('"params":{"rawTarget":"登录","roleHint":"button","semanticHint":"submit"}')
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
