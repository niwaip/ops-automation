jest.mock(
  '@nestjs/common',
  () => ({
    Injectable: () => () => undefined,
    Optional: () => () => undefined,
    Logger: class {
      log() {}
      warn() {}
      error() {}
      debug() {}
    },
  }),
  { virtual: true }
);

import { BrowserExecutionControllerService } from './browser-execution-controller.service';
import { RecorderDebugChatSupportService } from './recorder-debug-chat-support.service';
import { RecorderDisambiguationService } from '../intent';

describe('BrowserExecutionControllerService', () => {
  const createService = () => {
    const browserSemanticsClient = {
      createErrorLog: jest.fn().mockResolvedValue(undefined),
    } as any;

    return {
      service: new BrowserExecutionControllerService(
        new RecorderDebugChatSupportService(new RecorderDisambiguationService()),
        browserSemanticsClient
      ),
      browserSemanticsClient,
    };
  };

  it('returns ambiguous outcome and stores pending disambiguation when strict mode matches multiple elements', async () => {
    const { service } = createService();
    const session: any = {
      currentPageUrl: 'https://www.minimaxi.com',
      executedCommands: [],
    };
    const parsed = {
      success: true,
      commands: [
        {
          tool: 'click',
          params: { text: '登录' },
          description: '点击登录',
        },
      ],
      explanation: '点击登录',
    };
    const observation = {
      currentPageUrl: 'https://www.minimaxi.com',
      text: 'MiniMax',
      title: 'MiniMax',
      inputs: [],
      buttons: [
        { ref: 'e1203', text: '平台登录', role: 'link' },
        { ref: 'e1080', text: '平台登录', role: 'link' },
      ],
      headings: [],
      links: [],
      suggestedParameters: [],
    };

    const result = await service.executeAndResolve({
      session,
      effectiveMessage: '点击登录',
      parsed,
      observation,
      controlTokenState: {
        cleanedMessage: '点击登录',
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
      executeBrowserCommands: jest.fn().mockResolvedValue({
        success: false,
        results: [],
        message: 'strict mode violation',
        steps: [
          {
            status: 'error',
            action: 'click',
            params: { text: '登录', target: 'link[name="平台登录"]' },
            error: { message: 'Error: strict mode violation: locator matched 2 elements' },
          },
        ],
      }),
      observePageSafely: jest.fn(),
      mergeObservationWithExecution: jest.fn(),
      applyRecorderControlTokensAfterExecution: jest.fn(),
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'ambiguous',
        reply: expect.stringContaining('请直接回复 `选1` 或 `选2` 继续'),
      })
    );
    expect(session.pendingDisambiguation).toEqual(
      expect.objectContaining({
        targetLabel: '平台登录',
      })
    );
  });

  it('returns completed outcome and updates session observation after successful execution', async () => {
    const { service } = createService();
    const session: any = {
      currentPageUrl: 'https://example.com/login',
      executedCommands: [],
    };
    const parsed = {
      success: true,
      commands: [
        {
          tool: 'click',
          params: { text: '登录' },
          description: '点击登录',
        },
      ],
      explanation: '点击登录',
    };
    const observation = {
      currentPageUrl: 'https://example.com/login',
      text: 'login',
      title: 'Login',
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const nextObservation = {
      ...observation,
      currentPageUrl: 'https://example.com/dashboard',
      text: 'dashboard',
    };
    const applyRecorderControlTokensAfterExecution = jest.fn();

    const result = await service.executeAndResolve({
      session,
      effectiveMessage: '点击登录',
      parsed,
      observation,
      controlTokenState: {
        cleanedMessage: '点击登录',
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
      executeBrowserCommands: jest.fn().mockResolvedValue({
        success: true,
        results: [{ command: 'click', status: 'success' }],
        steps: [],
        executedCommands: parsed.commands,
      }),
      observePageSafely: jest.fn().mockResolvedValue(nextObservation),
      mergeObservationWithExecution: jest.fn().mockReturnValue(nextObservation),
      applyRecorderControlTokensAfterExecution,
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'completed',
        reply: '点击登录\n已执行当前页面操作。',
        nextObservation,
      })
    );
    expect(session.currentPageUrl).toBe('https://example.com/dashboard');
    expect(session.lastObservation).toEqual(nextObservation);
    expect(session.executedCommands).toEqual(parsed.commands);
    expect(applyRecorderControlTokensAfterExecution).toHaveBeenCalled();
  });

  it('re-observes and retries with recovery commands when execution fails with retryable error', async () => {
    const { service, browserSemanticsClient } = createService();
    const session: any = {
      currentPageUrl: 'https://example.com/login',
      backend: 'cli',
      executedCommands: [],
    };
    const parsed = {
      success: true,
      commands: [
        {
          tool: 'click',
          params: { text: '登录' },
          description: '点击登录',
        },
      ],
      explanation: '点击登录',
    };
    const observation = {
      currentPageUrl: 'https://example.com/login',
      text: 'login page',
      title: 'Login',
      inputs: [],
      buttons: [],
      candidates: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const recoveryObservation = {
      ...observation,
      currentPageUrl: 'https://example.com/login',
      text: '页面显示按钮 ログイン',
      buttons: [{ ref: 'e16', text: 'ログイン', role: 'button' }],
      candidates: [
        {
          candidateId: 'action_1',
          kind: 'action',
          label: 'ログイン',
          summary: 'candidateId=action_1 | kind=action | ref=e16 | role=button | label=ログイン',
          source: 'probe',
          ref: 'e16',
          role: 'button',
          preferredLocator: { type: 'ref', value: 'e16' },
        },
      ],
    };
    const finalObservation = {
      ...recoveryObservation,
      currentPageUrl: 'https://example.com/dashboard',
      text: 'dashboard',
    };
    const executeBrowserCommands = jest
      .fn()
      .mockResolvedValueOnce({
        success: false,
        results: [{ command: 'click', status: 'error' }],
        message: 'Text click failed to find element: 登录',
        steps: [
          {
            status: 'error',
            action: 'click',
            params: { text: '登录' },
            error: {
              message: 'Text click failed to find element: 登录',
              code: 'element_not_found',
              retryable: true,
            },
          },
        ],
        executedCommands: parsed.commands,
      })
      .mockResolvedValueOnce({
        success: true,
        results: [{ command: 'click', status: 'success' }],
        steps: [],
        executedCommands: [
          {
            tool: 'click',
            params: { target: 'e16' },
            description: '点击登录按钮',
          },
        ],
      });
    const observePageSafely = jest
      .fn()
      .mockResolvedValueOnce(recoveryObservation)
      .mockResolvedValueOnce(finalObservation);
    const parseRecoveryCommand = jest.fn().mockResolvedValue({
      success: true,
      commands: [
        {
          tool: 'click',
          params: { target: 'e16' },
          description: '点击登录按钮',
        },
      ],
      explanation: '基于当前候选点击登录',
    });

    const result = await service.executeAndResolve({
      session,
      effectiveMessage: '点击登录',
      parsed,
      observation,
      controlTokenState: {
        cleanedMessage: '点击登录',
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
      executeBrowserCommands,
      observePageSafely,
      parseRecoveryCommand,
      mergeObservationWithExecution: jest.fn().mockImplementation((currentObservation, execution) => ({
        ...currentObservation,
        currentPageUrl: execution.success
          ? 'https://example.com/dashboard'
          : 'https://example.com/login',
      })),
      applyRecorderControlTokensAfterExecution: jest.fn(),
    });

    expect(parseRecoveryCommand).toHaveBeenCalledWith({
      input: '点击登录',
      observation: recoveryObservation,
      failureContext: expect.objectContaining({
        errorMessage: 'Text click failed to find element: 登录',
        errorType: 'element_not_found',
        retryable: true,
      }),
    });
    expect(executeBrowserCommands).toHaveBeenCalledTimes(2);
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'completed',
        reply: '基于当前候选点击登录\n已执行当前页面操作。',
        nextObservation: finalObservation,
      })
    );
    expect(session.currentPageUrl).toBe('https://example.com/dashboard');
    expect(session.executedCommands).toEqual([
      ...parsed.commands,
      {
        tool: 'click',
        params: { target: 'e16' },
        description: '点击登录按钮',
      },
    ]);
    expect(browserSemanticsClient.createErrorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        domain_code: 'browser_recorder',
        source: 'execution',
        error_type: 'element_not_found',
        error_message: 'Text click failed to find element: 登录',
        input_text: '点击登录',
        metadata: expect.objectContaining({
          source_stage: 'initial-execution',
          retryable: true,
        }),
      })
    );
  });

  it('mergeExecutionResponses does not surface initial failure message or error results when recovery succeeds', async () => {
    // Regression: when the initial command fails (e.g. "search" couldn't find the search
    // entrance) and the recovery command succeeds (e.g. "smart_search"), the merged
    // execution result used to carry initialExecution.message ("One or more CLI commands
    // failed...") and initial error results alongside `success: true` — contradicting
    // itself and confusing the displayed execution result / outcome toolExecution.
    const { service } = createService();
    const session: any = {
      currentPageUrl: 'https://www.baidu.com/',
      backend: 'cli',
      executedCommands: [],
    };
    const observation: any = {
      currentPageUrl: 'https://www.baidu.com/',
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const parsed = {
      success: true,
      commands: [{ tool: 'search', params: { query: 'mcp' }, description: '搜索 mcp' }],
      explanation: '在百度首页搜索 mcp',
    };

    const executeBrowserCommands = jest
      .fn()
      // Initial: search failed — no search entrance recognized
      .mockResolvedValueOnce({
        success: false,
        results: [
          {
            command: 'search',
            status: 'error',
            message: '未识别到明确的搜索入口，请改用"智搜"或指定搜索框',
          },
        ],
        message: 'One or more CLI commands failed. First failure: search: 未识别到明确的搜索入口',
        steps: [
          {
            status: 'error',
            action: 'search',
            params: { query: 'mcp' },
            error: {
              message: '未识别到明确的搜索入口，请改用"智搜"或指定搜索框',
              code: 'search_entrance_not_found',
              retryable: true,
            },
          },
        ],
        executedCommands: parsed.commands,
      })
      // Recovery: smart_search succeeded
      .mockResolvedValueOnce({
        success: true,
        results: [
          {
            command: 'smart_search',
            status: 'success',
            stdout: '### Result\n"search-input-filled"',
          },
        ],
        steps: [],
        executedCommands: [
          { tool: 'smart_search', params: { query: 'mcp' }, description: '使用智搜搜索 mcp' },
        ],
      });
    const observePageSafely = jest
      .fn()
      .mockResolvedValueOnce({ ...observation, text: 'recovery observation' })
      .mockResolvedValueOnce({ ...observation, currentPageUrl: 'https://www.baidu.com/s?wd=mcp', text: 'search results' });
    const parseRecoveryCommand = jest.fn().mockResolvedValue({
      success: true,
      commands: [{ tool: 'smart_search', params: { query: 'mcp' }, description: '使用智搜搜索 mcp' }],
      explanation: '使用智搜搜索 mcp',
    });

    const result = await service.executeAndResolve({
      session,
      effectiveMessage: '搜索 mcp',
      parsed,
      observation,
      controlTokenState: {
        cleanedMessage: '搜索 mcp',
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
      executeBrowserCommands,
      observePageSafely,
      parseRecoveryCommand,
      mergeObservationWithExecution: jest.fn().mockImplementation((current, exec) => ({
        ...current,
        currentPageUrl: exec.success ? 'https://www.baidu.com/s?wd=mcp' : 'https://www.baidu.com/',
      })),
      applyRecorderControlTokensAfterExecution: jest.fn(),
    });

    // Recovery succeeded → overall success
    expect(result.execution.success).toBe(true);
    // Message must NOT contain the initial failure text
    expect(result.execution.message).not.toContain('One or more CLI commands failed');
    expect(result.execution.message).not.toContain('未识别到明确的搜索入口');
    // Results must NOT contain the initial error entry
    const resultStatuses = (result.execution.results || []).map((r: any) => r.status);
    expect(resultStatuses).not.toContain('error');
    expect(resultStatuses).toContain('success');
  });

  it('preflights recovery on login gate before executing non-login target click', async () => {
    const { service } = createService();
    const session: any = {
      currentPageUrl: 'https://example.com/approvals',
      backend: 'cli',
      executedCommands: [],
    };
    const parsed = {
      success: true,
      commands: [
        {
          tool: 'click',
          params: { text: '保留中' },
          description: '点击保留中',
        },
      ],
      explanation: '点击保留中',
    };
    const observation = {
      currentPageUrl: 'https://example.com/approvals',
      text: '用户登录 用户名 admin 密码 admin ログイン',
      title: 'Login',
      inputs: [
        { label: 'ユーザー名 (Username)' },
        { label: 'パスワード (Password)' },
      ],
      buttons: [{ ref: 'e16', text: 'ログイン', role: 'button' }],
      candidates: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const postLoginObservation = {
      ...observation,
      currentPageUrl: 'https://example.com/approvals#list',
      text: '保留中 承认済み',
      buttons: [{ ref: 'e101', text: '保留中', role: 'button' }],
    };
    const executeBrowserCommands = jest.fn().mockResolvedValue({
      success: true,
      results: [{ command: 'fill', status: 'success' }, { command: 'click', status: 'success' }],
      steps: [],
      executedCommands: [
        { tool: 'fill', params: { selector: '用户名', value: 'admin' }, description: '填写用户名' },
        { tool: 'fill', params: { selector: '密码', value: 'admin' }, description: '填写密码' },
        { tool: 'click', params: { target: 'e16' }, description: '点击登录按钮' },
        { tool: 'click', params: { target: 'e101' }, description: '点击保留中' },
      ],
    });
    const parseRecoveryCommand = jest.fn().mockResolvedValue({
      success: true,
      commands: [
        { tool: 'fill', params: { selector: '用户名', value: 'admin' }, description: '填写用户名' },
        { tool: 'fill', params: { selector: '密码', value: 'admin' }, description: '填写密码' },
        { tool: 'click', params: { target: 'e16' }, description: '点击登录按钮' },
        { tool: 'click', params: { target: 'e101' }, description: '点击保留中' },
      ],
      explanation: '由于当前是登录页,先使用测试凭据 admin/admin 登录,登录后再点击保留中标签',
    });

    const result = await service.executeAndResolve({
      session,
      effectiveMessage: '点击保留中',
      parsed,
      observation,
      controlTokenState: {
        cleanedMessage: '点击保留中',
        rawTokens: [],
        hasLoopStart: false,
        hasLoopEnd: false,
        hasConditionalBranch: false,
        manualInterventions: [],
        manualInterventionLabels: [],
      },
      executeBrowserCommands,
      observePageSafely: jest.fn().mockResolvedValue(postLoginObservation),
      parseRecoveryCommand,
      mergeObservationWithExecution: jest.fn().mockReturnValue(postLoginObservation),
      applyRecorderControlTokensAfterExecution: jest.fn(),
    });

    expect(parseRecoveryCommand).toHaveBeenCalledWith({
      input: '点击保留中',
      observation,
      failureContext: expect.objectContaining({
        errorType: 'login_gate_preflight',
        retryable: true,
      }),
    });
    expect(executeBrowserCommands).toHaveBeenCalledTimes(1);
    expect(executeBrowserCommands).toHaveBeenCalledWith(
      session,
      [
        { tool: 'fill', params: { selector: '用户名', value: 'admin' }, description: '填写用户名' },
        { tool: 'fill', params: { selector: '密码', value: 'admin' }, description: '填写密码' },
        { tool: 'click', params: { target: 'e16' }, description: '点击登录按钮' },
        { tool: 'click', params: { target: 'e101' }, description: '点击保留中' },
      ],
      expect.objectContaining({ appendDefaultWait: true })
    );
    expect(session.executedCommands).toEqual([
      { tool: 'fill', params: { selector: '用户名', value: 'admin' }, description: '填写用户名' },
      { tool: 'fill', params: { selector: '密码', value: 'admin' }, description: '填写密码' },
      { tool: 'click', params: { target: 'e16' }, description: '点击登录按钮' },
      { tool: 'click', params: { target: 'e101' }, description: '点击保留中' },
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'completed',
        reply: '由于当前是登录页,先使用测试凭据 admin/admin 登录,登录后再点击保留中标签\n已执行当前页面操作。',
      })
    );
  });
});
