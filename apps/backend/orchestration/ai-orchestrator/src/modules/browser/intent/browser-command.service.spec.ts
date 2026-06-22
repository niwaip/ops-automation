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
  '../../model/model.service',
  () => ({
    ModelService: class {},
  }),
  { virtual: true }
);

import { BrowserCommandService } from './browser-command.service';
import { BrowserCommandLoginService } from './browser-command-login.service';
import { BrowserCommandNavigationService } from './browser-command-navigation.service';
import { BrowserCommandReadService } from './browser-command-read.service';
import { BrowserCommandActionService } from './browser-command-action.service';
import { BrowserCommandSearchService } from './browser-command-search.service';
import { BrowserCommandFieldFillService } from './browser-command-field-fill.service';
import { BrowserCommandAtomicService } from './browser-command-atomic.service';
import { BrowserCommandSequentialService } from './browser-command-sequential.service';
import { BrowserCommandSemanticLogService } from './browser-command-semantic-log.service';
import { BrowserCommandSemanticRuntimeService } from './browser-command-semantic-runtime.service';
import { BrowserCommandContextNormalizerService } from './browser-command-context-normalizer.service';
import { BrowserCommandClickContextService } from './browser-command-click-context.service';
import { BrowserCandidateContextFormatter } from './browser-candidate-context.formatter';
import { BrowserPlannerPromptBuilder } from './browser-planner-prompt.builder';
import { BrowserPlannerResponseParser } from './browser-planner-response.parser';
import { BrowserExecutionPlannerService } from './browser-execution-planner.service';
import type { BrowserSemanticsClient } from '../../../client/browser-semantics.client';

describe('BrowserCommandService', () => {
  type ModelOverrides = Partial<{ listModels: jest.Mock; callModel: jest.Mock }>;
  type CreateServiceOptions = {
    modelOverrides?: ModelOverrides;
    browserSemanticsOverrides?: Partial<{
      resolveRuntimeRuleSet: jest.Mock;
      createHitLog: jest.Mock;
      createErrorLog: jest.Mock;
    }>;
  };
  const createService = (
    optionsOrModelOverrides?: ModelOverrides | CreateServiceOptions
  ) => {
    const options: CreateServiceOptions =
      optionsOrModelOverrides &&
      ('modelOverrides' in optionsOrModelOverrides ||
        'browserSemanticsOverrides' in optionsOrModelOverrides)
        ? (optionsOrModelOverrides as CreateServiceOptions)
        : { modelOverrides: optionsOrModelOverrides as ModelOverrides | undefined };
    const modelService = {
      listModels: options?.modelOverrides?.listModels || jest.fn().mockResolvedValue([]),
      callModel: options?.modelOverrides?.callModel || jest.fn(),
    } as any;
    const candidateFormatter = new BrowserCandidateContextFormatter();
    const promptBuilder = new BrowserPlannerPromptBuilder(candidateFormatter);
    const responseParser = new BrowserPlannerResponseParser();
    const plannerService = new BrowserExecutionPlannerService(
      modelService,
      promptBuilder,
      responseParser
    );
    const browserSemanticsClient = {
      resolveRuntimeRuleSet:
        options?.browserSemanticsOverrides?.resolveRuntimeRuleSet ||
        jest.fn().mockResolvedValue(null),
      createHitLog:
        options?.browserSemanticsOverrides?.createHitLog || jest.fn().mockResolvedValue(undefined),
      createErrorLog:
        options?.browserSemanticsOverrides?.createErrorLog || jest.fn().mockResolvedValue(undefined),
    } as unknown as BrowserSemanticsClient;
    const browserCommandSemanticLogService = new BrowserCommandSemanticLogService(
      browserSemanticsClient
    );
    const browserCommandSemanticRuntimeService = new BrowserCommandSemanticRuntimeService(
      browserSemanticsClient
    );
    const browserCommandContextNormalizerService = new BrowserCommandContextNormalizerService();
    const browserCommandClickContextService = new BrowserCommandClickContextService(
      browserCommandContextNormalizerService
    );

    return new BrowserCommandService(
      plannerService,
      new BrowserCommandLoginService(),
      new BrowserCommandNavigationService(),
      new BrowserCommandReadService(),
      new BrowserCommandActionService(),
      new BrowserCommandSearchService(),
      new BrowserCommandFieldFillService(),
      new BrowserCommandAtomicService(),
      new BrowserCommandSequentialService(
        new BrowserCommandNavigationService(),
        new BrowserCommandSearchService()
      ),
      browserCommandSemanticLogService,
      browserCommandSemanticRuntimeService,
      browserCommandContextNormalizerService,
      browserCommandClickContextService
    );
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
          params: { url: 'https://www.baidu.com/s?wd=%E6%AF%9B%E5%88%A9%E7%8E%87' },
          description: '在百度搜索 毛利率',
        },
      ],
      explanation: '将在百度搜索 毛利率',
      parserMetadata: {
        search: {
          status: 'success',
          reason: 'search-default-engine',
          intentType: 'engine_search',
          query: '毛利率',
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
          parser_source: 'search-profile',
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
