import { createService, resetRecorderDebugTestEnv } from './recorder-debug.test-helper';

describe('RecorderDebugService', () => {
  beforeEach(() => {
    resetRecorderDebugTestEnv();
  });

  it('chat should prioritize executable commands over observation wording', async () => {
    const parsedCommands = [
      {
        tool: 'fill',
        params: { selector: '密码', value: 'secret' },
        description: '填写密码',
      },
      {
        tool: 'click',
        params: { text: 'Log On' },
        description: '点击 Log On',
      },
    ];
    const parseCommand = jest.fn().mockResolvedValue({
      success: true,
      commands: parsedCommands,
      explanation: '将依次填写密码，点击 Log On',
    });
    const service = createService({
      browserCommandService: { parseCommand },
    });
    const session = {
      sessionId: 'recorder-debug-1',
      runtimeSessionId: 'runtime-1',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'https://signin.aliyun.com',
      lastObservation: undefined,
      history: [],
      executedCommands: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const observation = {
      currentPageUrl: 'https://signin.aliyun.com',
      text: 'Log On page',
      title: 'Sign In',
      inputs: [{ label: '密码' }],
      buttons: [{ text: 'Log On' }],
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const execution = {
      success: true,
      results: [],
      steps: [],
      executedCommands: [
        {
          tool: 'fill',
          params: { selector: '密码', value: 'secret', target: 'e115' },
          description: '填写密码',
        },
      ],
    };

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'observePageSafely').mockResolvedValue(observation);
    const executeBrowserCommandsSpy = jest
      .spyOn(service as any, 'executeBrowserCommands')
      .mockResolvedValue(execution);
    const describePageSpy = jest
      .spyOn(service as any, 'describePage')
      .mockResolvedValue('observation answer');
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'refreshObservationAfterExecution').mockResolvedValue(undefined);

    const response = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message: '输入密码 secret 然后点击 Log On',
    });

    expect(response.status).toBe('executed');
    expect(response.commands).toEqual(parsedCommands);
    expect(executeBrowserCommandsSpy).toHaveBeenCalledWith(
      session,
      expect.arrayContaining([
        expect.objectContaining({ tool: 'fill' }),
        expect.objectContaining({ tool: 'click' }),
      ]),
      { appendDefaultWait: true }
    );
    expect(describePageSpy).not.toHaveBeenCalled();
  });

  it('chat should navigate first and reparse follow-up actions with refreshed observation', async () => {
    const parseCommand = jest.fn().mockImplementation(async ({ input }) => {
      if (input === '打开 http://192.168.100.143/#approvals') {
        return {
          success: true,
          commands: [
            {
              tool: 'navigate',
              params: { url: 'http://192.168.100.143/#approvals' },
              description: '打开 http://192.168.100.143/#approvals',
            },
          ],
          explanation: '先打开审批页面',
        };
      }

      return {
        success: true,
        commands: [
          {
            tool: 'fill',
            params: { selector: '用户名', value: 'admin' },
            description: '填写用户名',
          },
          {
            tool: 'fill',
            params: { selector: '密码', value: 'admin' },
            description: '填写密码',
          },
          {
            tool: 'click',
            params: { target: 'e16' },
            description: '点击登录',
            locator: {
              strategy: 'ref',
              value: 'e16',
              generatedBy: 'candidate',
              confidence: 0.98,
              resolutionMode: 'preferred-locator',
            },
          },
        ],
        explanation: '填写用户名密码并点击登录',
      };
    });
    const executeAndResolve = jest.fn().mockResolvedValue({
      kind: 'completed',
      reply: '填写用户名密码并点击登录\n已执行当前页面操作。',
      execution: {
        success: true,
        results: [],
        steps: [
          { action: 'fill', status: 'success' },
          { action: 'fill', status: 'success' },
          { action: 'click', status: 'success' },
        ],
        executedCommands: [
          {
            tool: 'fill',
            params: { selector: '用户名', value: 'admin' },
            description: '填写用户名',
          },
          {
            tool: 'fill',
            params: { selector: '密码', value: 'admin' },
            description: '填写密码',
          },
          {
            tool: 'click',
            params: { target: 'e16' },
            description: '点击登录',
          },
        ],
      },
      nextObservation: {
        currentPageUrl: 'http://192.168.100.143/#approvals',
        text: '审批列表',
        title: 'Approvals',
        inputs: [],
        buttons: [{ text: '承認する (Approve)' }],
        headings: [],
        links: [],
        suggestedParameters: [],
      },
    });
    const service = createService({
      browserCommandService: { parseCommand },
      recorderDebugChatExecutionService: { executeAndResolve } as any,
    });
    const session = {
      sessionId: 'recorder-debug-stage-login',
      runtimeSessionId: 'runtime-stage-login',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'about:blank',
      lastObservation: undefined,
      history: [],
      executedCommands: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const initialObservation = {
      currentPageUrl: 'about:blank',
      text: '',
      title: 'Blank',
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
      candidates: [],
      candidateTrace: [],
    };
    const postNavigateObservation = {
      currentPageUrl: 'http://192.168.100.143/#approvals',
      text: 'ログイン',
      title: 'Login',
      inputs: [{ label: '用户名' }, { label: '密码' }],
      buttons: [{ ref: 'e16', text: 'ログイン', role: 'button' }],
      headings: [],
      links: [],
      suggestedParameters: [],
      candidates: [
        {
          candidateId: 'action_6',
          kind: 'action',
          label: 'ログイン',
          summary: 'candidateId=action_6 | kind=action | ref=e16 | role=button | label=ログイン',
          source: 'probe',
          ref: 'e16',
          role: 'button',
          text: 'ログイン',
          preferredLocator: { type: 'ref', value: 'e16' },
        },
      ],
      candidateTrace: [],
    };
    const navigateExecution = {
      success: true,
      results: [{ status: 'success', data: { url: 'http://192.168.100.143/#approvals' } }],
      steps: [{ action: 'navigate', status: 'success' }],
      executedCommands: [
        {
          tool: 'navigate',
          params: { url: 'http://192.168.100.143/#approvals' },
          description: '打开 http://192.168.100.143/#approvals',
        },
      ],
    };

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'observePageSafely')
      .mockResolvedValueOnce(initialObservation)
      .mockResolvedValueOnce(postNavigateObservation);
    const executeBrowserCommandsSpy = jest
      .spyOn(service as any, 'executeBrowserCommands')
      .mockResolvedValue(navigateExecution);
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'refreshObservationAfterExecution').mockResolvedValue(undefined);

    const response = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message:
        '打开 http://192.168.100.143/#approvals\n用 用户名admin 密码 admin 进行登录',
    });

    expect(response.status).toBe('executed');
    expect(response.reply).toContain('已先打开目标页面');
    expect(response.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: 'navigate' }),
        expect.objectContaining({ tool: 'fill', description: '填写用户名' }),
        expect.objectContaining({ tool: 'click', params: { target: 'e16' } }),
      ])
    );
    expect(executeBrowserCommandsSpy).toHaveBeenCalledWith(
      session,
      [
        expect.objectContaining({
          tool: 'navigate',
          params: { url: 'http://192.168.100.143/#approvals' },
        }),
      ],
      { appendDefaultWait: true }
    );
    expect(parseCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: '打开 http://192.168.100.143/#approvals',
      })
    );
    expect(parseCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: '用 用户名admin 密码 admin 进行登录',
        context: expect.objectContaining({
          currentPageUrl: 'http://192.168.100.143/#approvals',
          availableCandidates: expect.arrayContaining([
            expect.objectContaining({ candidateId: 'action_6', ref: 'e16' }),
          ]),
        }),
      })
    );
    expect(executeAndResolve).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveMessage: '用 用户名admin 密码 admin 进行登录',
        observation: postNavigateObservation,
      })
    );
  });

  it('chat should execute high-risk actions directly during recorder flow', async () => {
    const parseCommand = jest.fn().mockResolvedValue({
      success: true,
      commands: [
        {
          tool: 'click',
          params: { text: '承认' },
          description: '点击承认按钮',
        },
      ],
      explanation: '点击承认按钮',
    });
    const service = createService({
      browserCommandService: { parseCommand },
    });
    const session = {
      sessionId: 'recorder-debug-risk',
      runtimeSessionId: 'runtime-risk',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'http://localhost/#approvals',
      lastObservation: undefined,
      history: [],
      executedCommands: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const observation = {
      currentPageUrl: 'http://localhost/#approvals',
      text: 'Approval List',
      title: 'Approval List',
      inputs: [],
      buttons: [],
      rows: [],
      regions: [],
      candidates: [],
      candidateTrace: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'observePageSafely').mockResolvedValue(observation);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    const executeSpy = jest
      .spyOn(service as any, 'executeBrowserCommands')
      .mockResolvedValue({ success: true, results: [], steps: [], executedCommands: [] });
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'refreshObservationAfterExecution').mockResolvedValue(undefined);

    const result = await service.chat({
      sessionId: 'recorder-debug-risk',
      message: '点击承认',
    });

    expect(result.status).toBe('executed');
    expect(executeSpy).toHaveBeenCalled();
    expect((session as any).pendingRiskConfirmation).toBeUndefined();
  });

  it('chat should return disambiguation options when strict mode click matches multiple elements', async () => {
    const parsedCommands = [
      {
        tool: 'click',
        params: { text: '登录' },
        description: '点击登录',
      },
    ];
    const parseCommand = jest.fn().mockResolvedValue({
      success: true,
      commands: parsedCommands,
      explanation: '点击页面上的登录按钮',
    });
    const service = createService({
      browserCommandService: { parseCommand },
    });
    const session = {
      sessionId: 'recorder-debug-ambiguous',
      runtimeSessionId: 'runtime-ambiguous',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'https://www.minimaxi.com',
      lastObservation: undefined,
      history: [],
      executedCommands: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
    const execution = {
      success: false,
      results: [],
      message:
        'One or more CLI commands failed. First failure: click: Error: strict mode violation',
      steps: [
        { status: 'success', action: 'snapshot', params: {} },
        {
          status: 'error',
          action: 'click',
          params: { text: '登录', target: 'link[name="平台登录"]' },
          error: { message: 'Error: strict mode violation: locator matched 2 elements' },
        },
      ],
    };

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'observePageSafely').mockResolvedValue(observation);
    jest.spyOn(service as any, 'executeBrowserCommands').mockResolvedValue(execution);
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);

    const response = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message: '点击登录',
    });

    expect(response.status).toBe('question');
    expect(response.reply).toContain('请直接回复 `选1` 或 `选2` 继续');
    expect(response.reply).toContain('ref=e1203');
    expect(response.reply).toContain('ref=e1080');
    expect((session as any).pendingDisambiguation).toEqual(
      expect.objectContaining({
        targetLabel: '平台登录',
        candidates: expect.arrayContaining([
          expect.objectContaining({ index: 1, ref: 'e1203' }),
          expect.objectContaining({ index: 2, ref: 'e1080' }),
        ]),
      })
    );
  });

  it('chat should execute selected disambiguation candidate when user replies with option number', async () => {
    const parseCommand = jest.fn();
    const service = createService({
      browserCommandService: { parseCommand },
    });
    const session = {
      sessionId: 'recorder-debug-select',
      runtimeSessionId: 'runtime-select',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'https://www.minimaxi.com',
      lastObservation: undefined,
      history: [],
      executedCommands: [],
      pendingDisambiguation: {
        command: {
          tool: 'click',
          params: { text: '登录' },
          description: '点击登录',
        },
        targetLabel: '平台登录',
        candidates: [
          { index: 1, ref: 'e1203', text: '平台登录', role: 'link' },
          { index: 2, ref: 'e1080', text: '平台登录', role: 'link' },
        ],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const observation = {
      currentPageUrl: 'https://www.minimaxi.com',
      text: 'MiniMax',
      title: 'MiniMax',
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
    };
    const execution = {
      success: true,
      results: [],
      steps: [],
      executedCommands: [
        {
          tool: 'click',
          params: { text: '登录', target: 'e1080' },
          description: '点击登录',
        },
      ],
    };

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'observePageSafely').mockResolvedValue(observation);
    const executeBrowserCommandsSpy = jest
      .spyOn(service as any, 'executeBrowserCommands')
      .mockResolvedValue(execution);
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'refreshObservationAfterExecution').mockResolvedValue(undefined);

    const response = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message: '选2',
    });

    expect(parseCommand).not.toHaveBeenCalled();
    expect(response.status).toBe('executed');
    expect(response.commands).toEqual([
      expect.objectContaining({
        tool: 'click',
        params: expect.objectContaining({ target: 'e1080' }),
      }),
    ]);
    expect(executeBrowserCommandsSpy).toHaveBeenCalledWith(
      session,
      [
        expect.objectContaining({
          tool: 'click',
          params: expect.objectContaining({ target: 'e1080' }),
        }),
      ],
      { appendDefaultWait: true }
    );
  });

  it('chat should execute conditional branch next action when current page matches the condition', async () => {
    const parseCommand = jest.fn();
    const analyzeBranchCondition = jest.fn().mockResolvedValue({
      branchStepSpec: {
        readSelectors: ['#detail-gross-margin'],
        readMethod: 'innerText',
        outputVar: 'profitMarginText',
        conditionFn:
          "(ctx) => Number(String(ctx.profitMarginText || '').replace(/[^0-9.-]+/g, '')) > 20",
        takeoverReason: '毛利率未超过20%，需要人工接管',
        onMismatch: 'takeover',
        onMatch: 'continue',
        description: '判断当前案件毛利率是否大于20%',
      },
      nextAction: {
        action: 'click',
        text: '承認する (Approve)',
        description: '点击承認する (Approve) 按钮',
      },
      analysisSource: 'fallback',
      pageContext: {
        pageUrl: 'http://localhost/#approvals/detail',
        pageTitle: 'Approval Detail',
      },
    });
    const service = createService({
      browserCommandService: { parseCommand },
      branchAnalysisService: { analyzeBranchCondition },
    });
    const session = {
      sessionId: 'recorder-debug-conditional-token',
      runtimeSessionId: 'runtime-conditional-token',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'http://localhost/#approvals/detail',
      lastObservation: undefined,
      history: [],
      executedCommands: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const observation = {
      currentPageUrl: 'http://localhost/#approvals/detail',
      text: '案件粗利率（毛利率） 25.5%',
      title: 'Approval Detail',
      inputs: [],
      buttons: [{ text: '承認する (Approve)' }, { text: '却下する (Reject)' }],
      headings: ['案件承認管理 / 案件詳細'],
      links: [],
      suggestedParameters: [],
      candidates: [
        {
          candidateId: 'action_17',
          kind: 'action',
          label: '承認する (Approve)',
          summary: 'candidateId=action_17 | ref=e239 | action=approve',
          source: 'region',
          ref: 'e239',
          action: 'approve',
          preferredLocator: { type: 'ref', value: 'e239' },
        },
        {
          candidateId: 'action_18',
          kind: 'action',
          label: '却下する (Reject)',
          summary: 'candidateId=action_18 | ref=e240 | action=reject',
          source: 'region',
          ref: 'e240',
          action: 'reject',
          preferredLocator: { type: 'ref', value: 'e240' },
        },
      ],
      rows: [],
      regions: [],
      candidateTrace: [],
    };
    const readConditionExecution = {
      success: true,
      results: [{ command: 'read_page', data: { text: '25.5%' } }],
    };
    const approveExecution = {
      success: true,
      results: [],
      steps: [],
      executedCommands: [
        {
          tool: 'click',
          params: { target: 'e239', text: '承認する (Approve)' },
          description: '点击承認する (Approve) 按钮',
        },
      ],
    };

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'observePageSafely').mockResolvedValue(observation);
    const executeSpy = jest
      .spyOn(service as any, 'executeBrowserCommands')
      .mockResolvedValueOnce(readConditionExecution)
      .mockResolvedValueOnce(approveExecution);
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'refreshObservationAfterExecution').mockResolvedValue(undefined);

    const response = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message: '[条件分歧] 毛利率大于 20% 自动承认，否则人工介入',
    });

    expect(response.status).toBe('executed');
    expect(response.reply).toContain('已记录条件分歧');
    expect(response.reply).toContain('已记录条件说明：毛利率大于 20% 自动承认，否则人工介入');
    expect(response.reply).toContain('已执行当前页面操作');
    expect(parseCommand).not.toHaveBeenCalled();
    expect(executeSpy).toHaveBeenNthCalledWith(
      1,
      session,
      [
        expect.objectContaining({
          tool: 'read_page',
          params: expect.objectContaining({ selector: '#detail-gross-margin' }),
        }),
      ],
      expect.objectContaining({ skipValidation: true })
    );
    expect(executeSpy).toHaveBeenNthCalledWith(
      2,
      session,
      [
        expect.objectContaining({
          tool: 'click',
          params: expect.objectContaining({ target: 'e239' }),
        }),
      ],
      expect.objectContaining({ appendDefaultWait: true, skipValidation: true })
    );
    expect(session.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: '[条件分歧] 毛利率大于 20% 自动承认，否则人工介入',
        }),
      ])
    );
  });

  it('chat should keep conditional branch as export intent when current page does not match the condition', async () => {
    const analyzeBranchCondition = jest.fn().mockResolvedValue({
      branchStepSpec: {
        readSelectors: ['#detail-gross-margin'],
        readMethod: 'innerText',
        outputVar: 'profitMarginText',
        conditionFn:
          "(ctx) => Number(String(ctx.profitMarginText || '').replace(/[^0-9.-]+/g, '')) > 20",
        takeoverReason: '毛利率未超过20%，需要人工接管',
        onMismatch: 'takeover',
        onMatch: 'continue',
        description: '判断当前案件毛利率是否大于20%',
      },
      nextAction: {
        action: 'click',
        text: '承認する (Approve)',
        description: '点击承認する (Approve) 按钮',
      },
      analysisSource: 'fallback',
    });
    const service = createService({
      branchAnalysisService: { analyzeBranchCondition },
    });
    const session = {
      sessionId: 'recorder-debug-conditional-token-no-match',
      runtimeSessionId: 'runtime-conditional-token-no-match',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'http://localhost/#approvals/detail',
      lastObservation: undefined,
      history: [],
      executedCommands: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const observation = {
      currentPageUrl: 'http://localhost/#approvals/detail',
      text: '案件粗利率（毛利率） 12.5%',
      title: 'Approval Detail',
      inputs: [],
      buttons: [{ text: '承認する (Approve)' }],
      headings: ['案件承認管理 / 案件詳細'],
      links: [],
      suggestedParameters: [],
      candidates: [],
      rows: [],
      regions: [],
      candidateTrace: [],
    };

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'observePageSafely').mockResolvedValue(observation);
    const executeSpy = jest
      .spyOn(service as any, 'executeBrowserCommands')
      .mockResolvedValueOnce({
        success: true,
        results: [{ command: 'read_page', data: { text: '12.5%' } }],
      });
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);

    const response = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message: '[条件分歧] 毛利率大于 20% 自动承认，否则人工介入',
    });

    expect(response.status).toBe('answer');
    expect(response.reply).toContain('当前页面未命中条件');
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('chat should prefer stable gross margin field candidate over incorrect branch selector', async () => {
    const analyzeBranchCondition = jest.fn().mockResolvedValue({
      branchStepSpec: {
        readSelectors: ['[data-status]'],
        readMethod: 'innerText',
        outputVar: 'profitMarginText',
        conditionFn:
          "(ctx) => Number(String(ctx.profitMarginText || '').replace(/[^0-9.-]+/g, '')) > 20",
        takeoverReason: '毛利率未超过20%，需要人工接管',
        onMismatch: 'takeover',
        onMatch: 'continue',
        description: '根据案件粗利率判断是否自动承认',
      },
      nextAction: {
        action: 'click',
        text: '承認する (Approve)',
        description: '点击承認する (Approve) 按钮',
      },
      analysisSource: 'llm',
    });
    const service = createService({
      branchAnalysisService: { analyzeBranchCondition },
    });
    const session = {
      sessionId: 'recorder-debug-conditional-candidate-selector',
      runtimeSessionId: 'runtime-conditional-candidate-selector',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'http://localhost/#approvals/detail',
      lastObservation: undefined,
      history: [],
      executedCommands: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const observation = {
      currentPageUrl: 'http://localhost/#approvals/detail',
      text: '案件粗利率（毛利率） 25.5%',
      title: 'Approval Detail',
      inputs: [],
      buttons: [{ text: '承認する (Approve)' }, { text: '却下する (Reject)' }],
      headings: ['案件承認管理 / 案件詳細'],
      links: [],
      suggestedParameters: [],
      candidates: [
        {
          candidateId: 'field_36',
          kind: 'field',
          label: '25.5%',
          summary:
            'candidateId=field_36 | kind=field | id=detail-gross-margin | testid=gross-margin-value | field=grossMargin | text=25.5%',
          source: 'region',
          field: 'grossMargin',
          elementId: 'detail-gross-margin',
          dataTestId: 'gross-margin-value',
          text: '25.5%',
          preferredLocator: { type: 'testid', value: 'gross-margin-value' },
        },
        {
          candidateId: 'action_17',
          kind: 'action',
          label: '承認する (Approve)',
          summary: 'candidateId=action_17 | ref=e239 | action=approve',
          source: 'region',
          ref: 'e239',
          action: 'approve',
          preferredLocator: { type: 'ref', value: 'e239' },
        },
      ],
      rows: [],
      regions: [],
      candidateTrace: [],
    };
    const executeSpy = jest
      .spyOn(service as any, 'executeBrowserCommands')
      .mockResolvedValueOnce({
        success: true,
        results: [{ command: 'read_page', data: { text: '25.5%' } }],
      })
      .mockResolvedValueOnce({
        success: true,
        results: [],
        steps: [],
        executedCommands: [
          {
            tool: 'click',
            params: { target: 'e239', text: '承認する (Approve)' },
            description: '点击承認する (Approve) 按钮',
          },
        ],
      });

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'observePageSafely').mockResolvedValue(observation);
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'refreshObservationAfterExecution').mockResolvedValue(undefined);

    const response = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message: '[条件分歧] 根据 案件粗利率 生成条件执行，如果 案件粗利率 大于 20% 就直接承认，否则需要介入同意，才承认',
    });

    expect(response.status).toBe('executed');
    expect(executeSpy).toHaveBeenNthCalledWith(
      1,
      session,
      [
        expect.objectContaining({
          tool: 'read_page',
          params: expect.objectContaining({ selector: '[data-testid="gross-margin-value"]' }),
        }),
      ],
      expect.objectContaining({ skipValidation: true })
    );
    expect(executeSpy).toHaveBeenNthCalledWith(
      2,
      session,
      [
        expect.objectContaining({
          tool: 'click',
          params: expect.objectContaining({ target: 'e239' }),
        }),
      ],
      expect.objectContaining({ appendDefaultWait: true, skipValidation: true })
    );
  });
});
