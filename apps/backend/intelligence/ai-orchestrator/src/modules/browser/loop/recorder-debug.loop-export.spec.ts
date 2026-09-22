import { createService, resetRecorderDebugTestEnv } from '../execute/recorder-debug.test-helper';
import { RecorderLoopService } from './recorder-loop.service';
import { RecorderParameterService } from '../intent/recorder-parameter.service';
import { RecorderTemplateExportService } from '../export';

describe('RecorderDebugService', () => {
  beforeEach(() => {
    resetRecorderDebugTestEnv();
  });

  it('upsertLoopDraft should persist normalized loop config into recorder session', async () => {
    const redisGet = jest.fn().mockResolvedValue(null);
    const redisSet = jest.fn().mockResolvedValue(undefined);
    const service = createService({
      redisService: {
        get: redisGet,
        set: redisSet,
      },
    });

    const result = await service.upsertLoopDraft({
      sessionId: 'recorder-debug-loop',
      runtimeSessionId: 'runtime-loop',
      backend: 'cli',
      loopDraft: {
        mode: 'repeat_until',
        target: {
          scope: 'current_list',
          currentPageUrl: 'http://localhost/list',
          match: {
            field: 'status',
            operator: 'contains',
            value: '未承认',
          },
        },
        sampleRow: {
          rowKey: ' approval-1001 ',
          semanticPath: [' list ', '', ' action '],
        },
        eachIteration: {
          capturedFromIndex: 2,
          capturedToIndex: 4,
          stepIds: [' step-1 ', '', 'step-2'],
          stepCount: 99,
        },
        stopWhen: {
          read: {
            type: 'count',
            locator: {
              type: ' css ',
              value: ' .pending-count ',
            },
          },
          conditionFn: ' value === 0 ',
          description: ' 数量为 0 时结束 ',
        },
        onNoProgress: 'takeover',
        maxIterations: 50,
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        sessionId: 'recorder-debug-loop',
        runtimeSessionId: 'runtime-loop',
        loopDraft: expect.objectContaining({
          mode: 'repeat_until',
          target: expect.objectContaining({
            scope: 'current_list',
            currentPageUrl: 'http://localhost/list',
            match: {
              field: 'status',
              operator: 'contains',
              value: '未承认',
            },
          }),
          sampleRow: {
            rowKey: 'approval-1001',
            semanticPath: ['list', 'action'],
          },
          eachIteration: {
            capturedFromIndex: 2,
            capturedToIndex: 4,
            stepIds: ['step-1', 'step-2'],
            stepCount: 99,
          },
          stopWhen: {
            read: {
              type: 'count',
              locator: {
                type: 'css',
                value: '.pending-count',
              },
            },
            conditionFn: 'value === 0',
            description: '数量为 0 时结束',
          },
          onNoProgress: 'takeover',
          maxIterations: 50,
        }),
      })
    );
    expect(redisSet).toHaveBeenCalledTimes(1);
    expect(redisSet.mock.calls[0][0]).toBe('recorder_debug_session:recorder-debug-loop');
    expect(JSON.parse(redisSet.mock.calls[0][1])).toEqual(
      expect.objectContaining({
        sessionId: 'recorder-debug-loop',
        runtimeSessionId: 'runtime-loop',
        loopDraft: expect.objectContaining({
          eachIteration: expect.objectContaining({
            stepIds: ['step-1', 'step-2'],
          }),
        }),
      })
    );
  });

  it('reconcileAfterTakeover should delegate to execution reconcile service', async () => {
    const reconcile = jest.fn().mockResolvedValue({
      strategy: 'replace_failed_step',
      explanation: 'ok',
      confidence: 0.9,
      resumeCommands: [],
    });
    const service = createService({
      executionReconcileService: { reconcile, buildResumePrompt: jest.fn() },
    });
    const request = {
      sessionId: 'session-1',
      runtimeSessionId: 'runtime-1',
      originalCommands: [],
      patchSteps: [],
      observation: {},
    };

    await expect(service.reconcileAfterTakeover(request as any)).resolves.toEqual({
      strategy: 'replace_failed_step',
      explanation: 'ok',
      confidence: 0.9,
      resumeCommands: [],
    });
    expect(reconcile).toHaveBeenCalledWith(request);
  });

  it('chat should persist loop control tokens into recorder session and capture iteration boundaries', async () => {
    const parseCommand = jest
      .fn()
      .mockResolvedValueOnce({
        success: true,
        commands: [
          {
            tool: 'click',
            params: { target: 'row-1-detail' },
            description: '点击第一条数据',
          },
        ],
        explanation: '点击第一条数据',
      })
      .mockResolvedValueOnce({
        success: true,
        commands: [
          {
            tool: 'click',
            params: { target: 'next-button' },
            description: '进入下一条数据',
          },
          {
            tool: 'click',
            params: { target: 'back-to-list' },
            description: '返回一览页面',
          },
        ],
        explanation: '进入下一条数据并返回一览页面',
      });
    const service = createService({
      browserCommandService: { parseCommand },
    });
    const session = {
      sessionId: 'recorder-debug-loop-token',
      runtimeSessionId: 'runtime-loop-token',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: undefined,
      lastObservation: undefined,
      loopDraft: undefined,
      manualInterventions: undefined,
      pendingLoopCaptureStartCommandIndex: undefined,
      history: [],
      executedCommands: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const observation = {
      currentPageUrl: 'http://192.168.100.143/#approvals',
      text: '承认一览 未承认',
      title: 'Approvals',
      inputs: [],
      buttons: [{ text: '承认' }],
      headings: [],
      links: [],
      suggestedParameters: [],
      candidates: [],
    };

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'observePageSafely').mockResolvedValue(observation);
    jest
      .spyOn(service as any, 'executeBrowserCommands')
      .mockResolvedValueOnce({
        success: true,
        results: [],
        steps: [],
        executedCommands: [
          {
            tool: 'click',
            params: { target: 'row-1-detail' },
            description: '点击第一条数据',
          },
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        results: [],
        steps: [],
        executedCommands: [
          {
            tool: 'click',
            params: { target: 'next-button' },
            description: '进入下一条数据',
          },
          {
            tool: 'click',
            params: { target: 'back-to-list' },
            description: '返回一览页面',
          },
        ],
      });
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'refreshObservationAfterExecution').mockResolvedValue(undefined);

    const scopeResponse = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message: '[循环对象:当前列表]',
    });
    expect(scopeResponse.status).toBe('answer');
    expect(scopeResponse.loopDraft).toEqual(
      expect.objectContaining({
        target: expect.objectContaining({
          scope: 'current_list',
          currentPageUrl: 'http://192.168.100.143/#approvals',
        }),
      })
    );
    expect(scopeResponse.loopState).toEqual(
      expect.objectContaining({
        rawTokens: ['[循环对象:当前列表]'],
        loopTargetScope: 'current_list',
        hasLoopStart: false,
        hasLoopEnd: false,
        isLoopCaptureActive: false,
      })
    );
    expect(parseCommand).not.toHaveBeenCalled();
    expect(session.loopDraft).toEqual(
      expect.objectContaining({
        target: expect.objectContaining({
          scope: 'current_list',
          currentPageUrl: 'http://192.168.100.143/#approvals',
        }),
      })
    );

    const loopStartResponse = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message: '[循环开始] 点击第一条数据',
    });
    expect(loopStartResponse.loopState).toEqual(
      expect.objectContaining({
        rawTokens: ['[循环开始]'],
        hasLoopStart: true,
        hasLoopEnd: false,
        pendingLoopCaptureStartCommandIndex: 0,
        isLoopCaptureActive: true,
      })
    );
    const loopEndResponse = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message: '进入下一条数据并返回一览页面 [循环结束]',
    });
    expect(loopEndResponse.loopDraft).toEqual(
      expect.objectContaining({
        eachIteration: expect.objectContaining({
          capturedFromIndex: 0,
          capturedToIndex: 2,
          stepCount: 3,
        }),
      })
    );
    expect(loopEndResponse.loopState).toEqual(
      expect.objectContaining({
        rawTokens: ['[循环结束]'],
        hasLoopStart: false,
        hasLoopEnd: true,
        isLoopCaptureActive: false,
      })
    );

    expect(parseCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: '点击第一条数据',
        context: expect.objectContaining({
          controlHints: expect.arrayContaining([
            'Loop target is 当前列表.',
            'This message marks the start of one loop iteration.',
          ]),
        }),
      })
    );
    expect(parseCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: '进入下一条数据并返回一览页面',
        context: expect.objectContaining({
          controlHints: expect.arrayContaining([
            'Loop target is 当前列表.',
            'This message marks the end of one loop iteration.',
          ]),
        }),
      })
    );
    expect((session as any).loopDraft?.eachIteration).toEqual({
      capturedFromIndex: 0,
      capturedToIndex: 2,
      stepIds: ['recorded_step_1', 'recorded_step_2', 'recorded_step_3'],
      stepCount: 3,
    });
  });

  it('chat should record manual intervention token without requiring recorder-side takeover', async () => {
    const parseCommand = jest.fn();
    const service = createService({
      browserCommandService: { parseCommand },
    });
    const session = {
      sessionId: 'recorder-debug-manual-token',
      runtimeSessionId: 'runtime-manual-token',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'http://192.168.100.143/#approvals',
      lastObservation: undefined,
      loopDraft: undefined,
      manualInterventions: undefined,
      pendingLoopCaptureStartCommandIndex: undefined,
      history: [],
      executedCommands: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const observation = {
      currentPageUrl: 'http://192.168.100.143/#approvals',
      text: 'Approvals page',
      title: 'Approvals',
      inputs: [],
      buttons: [],
      headings: [],
      links: [],
      suggestedParameters: [],
      candidates: [],
    };

    jest.spyOn(service as any, 'loadOrCreateSession').mockResolvedValue(session);
    jest.spyOn(service as any, 'ensureBrowserReady').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'observePageSafely').mockResolvedValue(observation);
    jest.spyOn(service as any, 'saveSession').mockResolvedValue(undefined);

    const response = await service.chat({
      sessionId: session.sessionId,
      runtimeSessionId: session.runtimeSessionId,
      backend: 'cli',
      message:
        '[人工介入:MFA认证|behavior=optional_takeover_if_present|selector=body|method=attribute|attribute=data-auth-stage|expect=mfa|precheck=true|fallbackPattern=mfa,otp,two factor,multi factor,verification code,one time code,authenticator,验证码,二次验证,双重认证,双因素,多因素]',
    });

    expect(response.status).toBe('answer');
    expect(parseCommand).not.toHaveBeenCalled();
    expect(session.manualInterventions).toEqual([
      expect.objectContaining({
        label: 'MFA认证',
        behavior: 'optional_takeover_if_present',
        signal: expect.objectContaining({
          selector: 'body',
          method: 'attribute',
          attribute: 'data-auth-stage',
          expectedValue: 'mfa',
          precheckBeforeRecordedCommands: true,
        }),
      }),
    ]);
  });

  it('exportArtifacts should carry MFA manual intervention into templateSteps and executionPlan', async () => {
    const service = createService({
      modelService: { getPreferredDefaultModel: jest.fn().mockReturnValue(undefined) },
    });
    const session = {
      sessionId: 'recorder-debug-mfa-export',
      runtimeSessionId: 'runtime-mfa-export',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'http://127.0.0.1:8015/?force_mfa=true',
      loopDraft: undefined,
      manualInterventions: [
        {
          id: 'manual-mfa-1',
          label: 'MFA认证',
          behavior: 'optional_takeover_if_present',
          createdAt: new Date().toISOString(),
          startCommandIndex: 3,
          endCommandIndex: 2,
          signal: {
            selector: 'body',
            method: 'attribute',
            attribute: 'data-auth-stage',
            expectedValue: 'mfa',
            fallbackPattern:
              'mfa|otp|two[- ]factor|multi[- ]factor|verification code|one[- ]time code|authenticator|验证码|二次验证|双重认证|双因素|多因素',
            precheckBeforeRecordedCommands: true,
          },
        },
      ],
      lastObservation: {
        currentPageUrl: 'http://127.0.0.1:8015/?force_mfa=true',
        title: 'Mock ERP Portal - 承認管理システム',
        text: '多要素認証 (MFA) セキュリティコードの入力が必要です 認証コード (6桁)',
        inputs: [{ id: 'login-mfa-code' }],
        buttons: [{ text: '検証してログイン' }],
        headings: ['多要素認証 (MFA)'],
        links: [],
        suggestedParameters: [],
      },
      history: [
        {
          role: 'user',
          content: '打开登录页面并登录系统',
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: '已打开登录页',
          observation: {
            currentPageUrl: 'http://127.0.0.1:8015/?force_mfa=true',
            title: 'Login',
            text: 'Mock ERP Portal admin admin',
            inputs: [{ id: 'login-username' }, { id: 'login-password' }],
            buttons: [{ text: 'ログイン' }],
            headings: ['Mock ERP Portal'],
            links: [],
          },
          timestamp: new Date().toISOString(),
        },
      ],
      executedCommands: [
        {
          tool: 'navigate',
          params: { url: 'http://127.0.0.1:8015/?force_mfa=true' },
          description: '打开登录页',
        },
        {
          tool: 'fill',
          params: { selector: '#login-username', value: 'admin' },
          description: '填写用户名',
        },
        {
          tool: 'fill',
          params: { selector: '#login-password', value: 'admin' },
          description: '填写密码',
        },
        {
          tool: 'click',
          params: { selector: '#btn-submit-login' },
          description: '点击登录',
        },
        {
          tool: 'click',
          params: { selector: '#nav-dashboard' },
          description: '进入系统首页',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const artifacts = await (service as any).recorderExportAssemblyService.buildExportArtifacts(
      session,
      '登录系统并进入首页'
    );

    expect(artifacts.templateSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'fill', params: { value: '${username}' } }),
        expect.objectContaining({ action: 'fill', params: { value: '${loginCredential}' } }),
        expect.objectContaining({
          action: 'read_value',
          description: '读取MFA认证页面信号',
          output_var: 'manual_precheck_0_signal',
        }),
        expect.objectContaining({
          action: 'read_value',
          description: '检查是否出现MFA认证提示',
          output_var: 'manual_checkpoint_3_0_text',
        }),
        expect.objectContaining({
          action: 'branch',
          branch: expect.objectContaining({
            on_match: 'continue',
            on_mismatch: 'takeover',
            takeover_reason: '检测到MFA认证提示，请人工介入后继续执行',
          }),
        }),
      ])
    );
    expect(artifacts.skillDraft.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'username',
          source: expect.stringMatching(/^template\.step_\d+\.params\.value$/),
        }),
        expect.objectContaining({
          name: 'loginCredential',
          source: expect.stringMatching(/^template\.step_\d+\.params\.value$/),
        }),
      ])
    );
    expect(artifacts.skillDraft.executionPlan.templateSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'fill',
          description: '填写用户名',
          params: { value: '${username}' },
        }),
        expect.objectContaining({
          action: 'fill',
          description: '填写密码',
          params: { value: '${loginCredential}' },
        }),
      ])
    );
    expect(artifacts.skillDraft.executionPlan.manualInterventions).toEqual([
      {
        label: 'MFA认证',
        behavior: 'optional_takeover_if_present',
        startCommandIndex: 3,
        endCommandIndex: 2,
        signal: {
          selector: 'body',
          method: 'attribute',
          attribute: 'data-auth-stage',
          expectedValue: 'mfa',
          fallbackPattern:
            'mfa|otp|two[- ]factor|multi[- ]factor|verification code|one[- ]time code|authenticator|验证码|二次验证|双重认证|双因素|多因素',
          precheckBeforeRecordedCommands: true,
        },
      },
    ]);
    expect(artifacts.skillDraft.executionPlan.runtimeHints).toEqual(
      expect.objectContaining({
        manualInterventions: [
          {
            label: 'MFA认证',
            behavior: 'optional_takeover_if_present',
          },
        ],
      })
    );
  });

  it('exportArtifacts should reuse branch analysis output to build a single template block', async () => {
    const analyzeBranchCondition = jest.fn().mockResolvedValue({
      branchStepSpec: {
        readSelectors: ['#detail-gross-margin'],
        readMethod: 'innerText',
        outputVar: 'grossMarginRaw',
        conditionFn:
          '(ctx) => Number(String(ctx.grossMarginRaw || "").replace(/[^0-9.]+/g, "")) >= 20',
        takeoverReason: '低于阈值需要人工介入',
        onMismatch: 'takeover',
        onMatch: 'continue',
        description: '根据毛利率阈值判断',
      },
      nextAction: {
        action: 'click',
        text: '承認する (Approve)',
        description: '条件满足后点击承认按钮',
      },
      analysisSource: 'llm',
      pageContext: {
        pageUrl: 'http://localhost/#approvals',
        pageTitle: 'Mock ERP Portal',
      },
    });
    const service = createService({
      modelService: { getPreferredDefaultModel: jest.fn().mockReturnValue(undefined) },
      branchAnalysisService: { analyzeBranchCondition },
    });
    const session = {
      sessionId: 'recorder-debug-export',
      runtimeSessionId: 'runtime-export',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'http://localhost/#approvals',
      loopDraft: {
        mode: 'repeat_until',
        target: {
          scope: 'current_list',
          currentPageUrl: 'http://localhost/#approvals',
          match: {
            field: 'status',
            operator: 'equals',
            value: '未承认',
          },
        },
        eachIteration: {
          stepIds: ['step_3', 'step_4', 'step_5'],
          stepCount: 3,
        },
        stopWhen: {
          read: {
            type: 'count',
            locator: {
              type: 'css',
              value: '.pending-count',
            },
          },
          conditionFn: 'value === 0',
          description: '待处理数量为 0 时结束',
        },
        onNoProgress: 'takeover',
        maxIterations: 100,
      },
      lastObservation: {
        currentPageUrl: 'http://localhost/#approvals/detail',
        title: 'Mock ERP Portal',
        text: '案件粗利率（毛利率） 25.5% ※ システム承認自動化基準: 20.0% 以上',
        inputs: [],
        buttons: [{ text: '承認する (Approve)' }],
        headings: ['案件承認管理 / 案件詳細'],
        links: [],
        suggestedParameters: [],
      },
      history: [
        {
          role: 'user',
          content:
            '[条件分歧] 根据【案件粗利率（毛利率）】生成分歧条件，大于20% 就直接执行，否则就人工介入。',
          timestamp: new Date().toISOString(),
        },
      ],
      executedCommands: [
        {
          tool: 'navigate',
          params: { url: 'http://localhost/#approvals' },
          description: '打开审批页面',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const artifacts = await (service as any).recorderExportAssemblyService.buildExportArtifacts(
      session,
      '根据毛利率执行审批'
    );

    expect(analyzeBranchCondition).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeSessionId: 'runtime-export',
        onMismatch: 'takeover',
        userIntent: expect.stringContaining('毛利率'),
        pageSignals: expect.objectContaining({
          buttons: ['承認する (Approve)'],
        }),
      })
    );
    expect(artifacts.templateSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'read_value', output_var: 'grossMarginRaw' }),
        expect.objectContaining({
          action: 'branch',
          branch: expect.objectContaining({
            on_match: 'continue',
            on_mismatch: 'takeover',
          }),
        }),
        expect.objectContaining({
          action: 'click',
          locator: { type: 'role', value: 'button[name="承認する (Approve)"]' },
        }),
      ])
    );
    expect(
      artifacts.templateSteps?.some(
        (step: any) =>
          typeof step.locator?.value === 'string' && step.locator.value.includes('${rowIndex}')
      )
    ).toBe(false);
    expect(artifacts.skillDraft.parameters).toEqual([
      expect.objectContaining({
        name: 'startUrl',
        required: false,
        exampleValue: 'http://localhost/#approvals',
      }),
      expect.objectContaining({
        name: 'grossMarginThreshold',
        required: true,
        exampleValue: '20',
      }),
    ]);
    expect(artifacts.skillDraft.publishPayload.paramsSchema.properties.rowIndex).toBeUndefined();
    expect(artifacts.skillDraft.publishPayload.paramsSchema.properties.startUrl).toEqual(
      expect.objectContaining({
        type: 'string',
        default: 'http://localhost/#approvals',
      })
    );
    expect(artifacts.skillDraft.publishPayload.paramsSchema.properties.grossMarginThreshold).toEqual(
      expect.objectContaining({
        type: 'number',
        description: expect.stringContaining('毛利率阈值'),
        default: 20,
      })
    );
    const exportedBranchStep = artifacts.templateSteps?.find((step: any) => step.action === 'branch');
    expect(exportedBranchStep?.branch?.condition_fn).toContain('Number(ctx.grossMarginThreshold)');
    expect(exportedBranchStep?.branch?.condition_fn).not.toContain('${grossMarginThreshold}');
    expect(artifacts.scriptValidation).toEqual(
      expect.objectContaining({
        syntaxValid: true,
        warnings: expect.arrayContaining([
          expect.stringContaining('条件分支与人工接管只在 templateSteps/模板执行链中生效'),
        ]),
      })
    );
    expect(artifacts.loopDraft).toEqual(
      expect.objectContaining({
        mode: 'repeat_until',
        target: expect.objectContaining({
          scope: 'current_list',
        }),
      })
    );
    expect(artifacts.loopPlanPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'loop_target',
          type: 'loop_target',
        }),
        expect.objectContaining({
          id: 'loop_each_iteration',
          type: 'loop_each_iteration',
        }),
        expect.objectContaining({
          id: 'loop_stop_when',
          type: 'loop_stop_when',
        }),
      ])
    );
    expect(artifacts.skillDraft.executionPlan).toEqual(
      expect.objectContaining({
        loopDraft: expect.objectContaining({
          mode: 'repeat_until',
        }),
      })
    );
    expect(artifacts.skillDraft.publishPayload.loopPlanPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'loop_policy',
          type: 'loop_policy',
        }),
      ])
    );
  });

  it('exportArtifacts should derive loop stopWhen and first-row iteration plan when current_list export lacks stopWhen', async () => {
    const analyzeBranchCondition = jest.fn().mockResolvedValue({
      branchStepSpec: {
        readSelectors: ['#detail-gross-margin'],
        readMethod: 'innerText',
        outputVar: 'grossMarginRaw',
        conditionFn:
          '(ctx) => Number(String(ctx.grossMarginRaw || "").replace(/[^0-9.]+/g, "")) >= 20',
        takeoverReason: '低于阈值需要人工介入',
        onMismatch: 'takeover',
        onMatch: 'continue',
        description: '根据毛利率阈值判断',
      },
      nextAction: {
        action: 'click',
        text: '承認する (Approve)',
        description: '条件满足后点击承认按钮',
      },
      analysisSource: 'llm',
      pageContext: {
        pageUrl: 'http://localhost/#approvals',
        pageTitle: 'Mock ERP Portal',
      },
    });
    const service = createService({
      modelService: { getPreferredDefaultModel: jest.fn().mockReturnValue(undefined) },
      branchAnalysisService: { analyzeBranchCondition },
    });
    const session = {
      sessionId: 'recorder-debug-loop-export',
      runtimeSessionId: 'runtime-loop-export',
      backend: 'cli',
      browserInitialized: true,
      currentPageUrl: 'http://localhost/#approvals',
      loopDraft: {
        mode: 'repeat_until',
        target: {
          scope: 'current_list',
          currentPageUrl: 'http://localhost/#approvals',
        },
        eachIteration: {
          capturedFromIndex: 1,
          capturedToIndex: 3,
          stepIds: ['recorded_step_2', 'recorded_step_3', 'recorded_step_4'],
          stepCount: 3,
        },
        onNoProgress: 'stop',
        maxIterations: 100,
      },
      lastObservation: {
        currentPageUrl: 'http://localhost/#approvals/detail',
        title: 'Mock ERP Portal',
        text: '案件粗利率（毛利率） 25.5% ※ システム承認自動化基準: 20.0% 以上',
        inputs: [],
        buttons: [{ text: '承認する (Approve)' }],
        headings: ['案件承認管理 / 案件詳細'],
        links: [],
        suggestedParameters: [],
      },
      history: [
        {
          role: 'user',
          content: '根据【案件粗利率（毛利率）】生成分歧条件，大于20% 就直接执行，否则就人工介入。',
          timestamp: new Date().toISOString(),
        },
      ],
      executedCommands: [
        {
          tool: 'navigate',
          params: { url: 'http://localhost/#approvals' },
          description: '打开审批页面',
        },
        {
          tool: 'click',
          params: { target: '[data-ai-action="detail"]' },
          locator: { strategy: 'css', value: '[data-ai-action="detail"]', generatedBy: 'system' },
          description: '点击第一条待处理案件详情',
        },
        {
          tool: 'click',
          params: { target: 'e201' },
          locator: {
            strategy: 'testid',
            value: 'btn-approve',
            generatedBy: 'cli',
            confidence: 0.95,
          },
          description: '点击承認する (Approve) 按钮',
        },
        {
          tool: 'click',
          params: { target: 'e168' },
          locator: { strategy: 'ref', value: 'e168', generatedBy: 'system' },
          description: '点击「一覧に戻る」按钮返回一览页面',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const artifacts = await (service as any).recorderExportAssemblyService.buildExportArtifacts(
      session,
      '循环审批待处理案件'
    );

    expect(artifacts.templateSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'click',
          locator: { type: 'css', value: ':nth-match([data-ai-action="detail"], 1)' },
          description: '打开当前第一条待处理案件详情',
        }),
        expect.objectContaining({
          action: 'click',
          locator: expect.objectContaining({
            type: 'role',
            value: 'button[name="一覧に戻る"]',
          }),
        }),
      ])
    );
    expect(artifacts.loopDraft).toEqual(
      expect.objectContaining({
        eachIteration: {
          capturedFromIndex: 1,
          capturedToIndex: 3,
          stepIds: ['step_2', 'step_3', 'step_4', 'step_5', 'step_6'],
          stepCount: 5,
        },
        stopWhen: {
          read: {
            type: 'text',
            locator: {
              type: 'css',
              value:
                'tr:has([data-ai-action="detail"]), [role="row"]:has([data-ai-action="detail"]), [data-ai-row]:has([data-ai-action="detail"]), [data-row-key]:has([data-ai-action="detail"]), [data-ai-card]:has([data-ai-action="detail"]), [data-ai-action="detail"]',
            },
          },
          conditionFn: "!String(value || '').trim()",
          description: '当前列表中已无可处理项时结束循环',
        },
        onNoProgress: 'stop',
      })
    );
    expect(artifacts.skillDraft.parameters).toEqual([
      expect.objectContaining({
        name: 'startUrl',
        required: false,
        exampleValue: 'http://localhost/#approvals',
      }),
      expect.objectContaining({
        name: 'grossMarginThreshold',
        required: true,
        exampleValue: '20',
      }),
    ]);
    expect(artifacts.skillDraft.publishPayload.paramsSchema).toEqual(
      expect.objectContaining({
        properties: {
          startUrl: expect.objectContaining({
            type: 'string',
            default: 'http://localhost/#approvals',
          }),
          grossMarginThreshold: expect.objectContaining({
            type: 'number',
            default: 20,
          }),
        },
        required: ['grossMarginThreshold'],
      })
    );
    expect(artifacts.skillDraft.publishPayload.loopPlanPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'loop_stop_when',
          type: 'loop_stop_when',
        }),
      ])
    );
  });

});
