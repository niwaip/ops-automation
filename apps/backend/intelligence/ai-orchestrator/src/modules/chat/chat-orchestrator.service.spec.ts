import { ControlPlaneClient } from '../../client/control-plane.client';
import { StreamEventType } from '../react-engine/interfaces';
import { ChatOrchestratorService } from './chat-orchestrator.service';

describe('ChatOrchestratorService', () => {
  const createAsyncGenerator = <T>(events: T[]) =>
    async function* () {
      for (const event of events) {
        yield event;
      }
    };

  const createService = () => {
    const controlPlaneClient = {
      getExecution: jest.fn(),
      submitExecutionInput: jest.fn(),
      createExecution: jest.fn(),
    };
    const reactEngineService = {
      execute: jest.fn(),
    };
    const plannerService = {
      matchSkillPhase: jest.fn(),
      completePlanFromMatchPhase: jest.fn(),
    };
    const promptDebugSettingsService = {
      isPromptDebugEnabled: jest.fn(() => false),
    };
    const waitingInputService = {
      buildControlPlaneRequestOptions: jest.fn((authToken?: string, user?: unknown) => ({
        authToken,
        user,
      })),
      loadWaitingInputDetails: jest.fn(),
      extractExecutionSemantic: jest.fn(),
      buildWaitingInputPayload: jest.fn(),
      buildWaitingInputSubmissionFeedback: jest.fn(),
      formatWaitingInputMessage: jest.fn(),
    };
    const executionStreamService = {
      observeExecution: jest.fn(),
      buildLatestExecutionStateEvent: jest.fn(),
    };
    const chatConversationService = {
      getLatestCompletedTaskResult: jest.fn().mockResolvedValue(null),
    };

    const service = new ChatOrchestratorService(
      controlPlaneClient as unknown as ControlPlaneClient,
      reactEngineService as any,
      plannerService as any,
      promptDebugSettingsService as any,
      waitingInputService as any,
      executionStreamService as any,
      chatConversationService as any
    );

    return {
      service,
      controlPlaneClient,
      reactEngineService,
      plannerService,
      promptDebugSettingsService,
      waitingInputService,
      executionStreamService,
      chatConversationService,
    };
  };

  const createDeterministicService = () => {
    const base = createService();
    const deterministicTaskExecutionService = {
      shouldRouteToDeterministicPlan: jest.fn().mockReturnValue(true),
      shouldAttemptSingleSkillContinuation: jest.fn().mockReturnValue(false),
      executeDeterministicTask: jest.fn(),
      executeMatchedSavedWorkflow: jest.fn().mockResolvedValue({
        matched: false,
        success: false,
      }),
    };
    const skillCacheService = {
      loadAvailableSkills: jest.fn().mockResolvedValue([]),
    };

    const service = new ChatOrchestratorService(
      base.controlPlaneClient as unknown as ControlPlaneClient,
      base.reactEngineService as any,
      base.plannerService as any,
      base.promptDebugSettingsService as any,
      base.waitingInputService as any,
      base.executionStreamService as any,
      base.chatConversationService as any,
      deterministicTaskExecutionService as any,
      skillCacheService as any
    );

    return {
      ...base,
      service,
      deterministicTaskExecutionService,
      skillCacheService,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('executes a confidently matched private saved workflow without replanning', async () => {
    const {
      service,
      deterministicTaskExecutionService,
      executionStreamService,
      skillCacheService,
    } = createDeterministicService();
    deterministicTaskExecutionService.executeMatchedSavedWorkflow.mockResolvedValue({
      matched: true,
      success: true,
      executionId: 'execution-saved-1',
      score: 1,
      workflow: {
        id: 'saved-1',
        name: '查询微博热点并进行总结，最后通过 Bark 推送',
        version: '1',
      },
    });
    executionStreamService.observeExecution.mockImplementation(
      createAsyncGenerator([{ type: StreamEventType.RESULT, content: '完成' }])
    );

    const events = [];
    for await (const event of service.handleTaskMode(
      {
        message: '查看微博的热点，然后给出总结，用bark推送',
        sessionId: 'session-saved-1',
      },
      {
        sessionId: 'session-saved-1',
        userId: 'user-1',
        userRoles: ['employee'],
        traceId: 'trace-1',
        history: [],
        uploadedFiles: [],
      },
      'Bearer token'
    )) {
      events.push(event);
    }

    expect(events[0]).toEqual(
      expect.objectContaining({
        type: StreamEventType.THOUGHT,
        data: expect.objectContaining({
          executionId: 'execution-saved-1',
          routeSource: 'saved_workflow',
        }),
      })
    );
    expect(executionStreamService.observeExecution).toHaveBeenCalledWith(
      'execution-saved-1',
      'Bearer token',
      { userId: 'user-1', userRoles: ['employee'] },
      { modelId: undefined }
    );
    expect(skillCacheService.loadAvailableSkills).not.toHaveBeenCalled();
    expect(deterministicTaskExecutionService.executeDeterministicTask).not.toHaveBeenCalled();
  });

  it('routes a follow-up operation with the previous structured result and source reference', async () => {
    const { service, chatConversationService, deterministicTaskExecutionService } =
      createDeterministicService();
    chatConversationService.getLatestCompletedTaskResult.mockResolvedValue({
      summaryText: '1. 安装方法 A\n2. 安装方法 B',
      structuredData: { searchResults: [{ title: 'A' }, { title: 'B' }] },
      executionId: 'execution-search-1',
      resultType: 'search_results',
    });
    deterministicTaskExecutionService.executeDeterministicTask.mockResolvedValue({
      success: false,
      errorCode: 'CAPABILITY_NOT_FOUND',
    });

    const events = [];
    for await (const event of service.handleTaskMode(
      { message: '进行总结', sessionId: 'session-follow-up' },
      {
        sessionId: 'session-follow-up',
        userId: 'user-1',
        userRoles: ['employee'],
        organizationId: '00000000-0000-4000-8000-000000000010',
        traceId: 'trace-follow-up',
        history: [],
        uploadedFiles: [],
      },
      'Bearer token'
    )) {
      events.push(event);
    }

    expect(deterministicTaskExecutionService.shouldRouteToDeterministicPlan).toHaveBeenCalledWith(
      '进行总结',
      { hasPreviousResult: true }
    );
    expect(deterministicTaskExecutionService.executeDeterministicTask).toHaveBeenCalledWith(
      '进行总结',
      'user-1',
      expect.objectContaining({
        user: {
          userId: 'user-1',
          userRoles: ['employee'],
          organizationId: '00000000-0000-4000-8000-000000000010',
        },
        systemInputs: expect.objectContaining({
          previousResultText: '1. 安装方法 A\n2. 安装方法 B',
          previousResultData: { searchResults: [{ title: 'A' }, { title: 'B' }] },
          previousResultRef: {
            executionId: 'execution-search-1',
            resultType: 'search_results',
          },
        }),
      })
    );
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        type: StreamEventType.RESULT,
        data: expect.objectContaining({ status: 'not_started' }),
      })
    );
  });

  it('executes a one-Skill continuation without invoking topology planning', async () => {
    const {
      service,
      chatConversationService,
      deterministicTaskExecutionService,
      plannerService,
      controlPlaneClient,
      executionStreamService,
    } = createDeterministicService();
    chatConversationService.getLatestCompletedTaskResult.mockResolvedValue({
      summaryText: '{"summary":"# 安装摘要"}',
      structuredData: { summary: '# 安装摘要' },
      executionId: 'execution-summary-1',
      resultType: 'summary',
    });
    deterministicTaskExecutionService.shouldAttemptSingleSkillContinuation.mockReturnValue(true);
    plannerService.matchSkillPhase.mockResolvedValue({
      objective: 'bark推送',
      hasVisibleSkills: true,
      matchedSkill: {
        skillId: 'skill-bark',
        skillName: 'Bark推送服务',
      },
    });
    plannerService.completePlanFromMatchPhase.mockResolvedValue({
      plan_id: 'plan-bark-1',
      planner_mode: 'skill',
      objective: 'bark推送',
      summary: '可以执行',
      skill_match: {
        skill_id: 'skill-bark',
        skill_name: 'Bark推送服务',
        confidence: 0.99,
      },
      required_inputs: [
        {
          name: 'content',
          type: 'string',
          required: true,
          missing: false,
          source: 'external',
          value: '# 安装摘要',
        },
      ],
      steps: [{ id: 'execute-skill', title: 'Execute skill', kind: 'skill', status: 'planned' }],
      risk_summary: { level: 'low', requires_human_review: false, items: [] },
      metadata: {
        previous_result_continuation: {
          applied: true,
          sourceExecutionId: 'execution-summary-1',
          projectedFields: ['content'],
        },
      },
    });
    controlPlaneClient.createExecution.mockResolvedValue({ id: 'execution-bark-1' });
    executionStreamService.observeExecution.mockImplementation(
      createAsyncGenerator([{ type: StreamEventType.RESULT, content: '推送完成' }])
    );

    const events = [];
    for await (const event of service.handleTaskMode(
      { message: 'bark推送', sessionId: 'session-bark' },
      {
        sessionId: 'session-bark',
        userId: 'user-1',
        userRoles: ['employee'],
        traceId: 'trace-bark',
        history: [],
        uploadedFiles: [],
      },
      'Bearer token'
    )) {
      events.push(event);
    }

    expect(deterministicTaskExecutionService.executeDeterministicTask).not.toHaveBeenCalled();
    expect(deterministicTaskExecutionService.shouldRouteToDeterministicPlan).not.toHaveBeenCalled();
    expect(controlPlaneClient.createExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: 'skill-bark',
        input: expect.objectContaining({ content: '# 安装摘要' }),
      }),
      expect.any(Object)
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: StreamEventType.THOUGHT,
        data: expect.objectContaining({
          routeSource: 'single_skill_continuation',
          plannerInvoked: false,
        }),
      })
    );
  });

  it('returns auth error when task mode lacks authenticated user', async () => {
    const { service } = createService();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
    } as Response);

    const result = await service.buildTaskModeContext(
      {
        message: '生成采购合同',
        sessionId: 'session-auth-1',
      },
      'Bearer token-auth-1',
      'trace-auth-1',
      []
    );

    expect(fetchSpy).toHaveBeenCalled();
    expect(result).toEqual({
      authError: {
        type: StreamEventType.ERROR,
        content: '任务模式需要登录后使用，请重新登录后重试。',
        data: {
          errorCode: 'AUTH_LOGIN_REQUIRED',
          statusCode: 401,
        },
      },
    });
  });

  it('carries the identity service active organization into task context', async () => {
    const { service } = createService();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        user: { id: 'user-1', role: 'employee' },
        roles: [{ name: 'employee' }],
        activeOrgId: '00000000-0000-4000-8000-000000000010',
      }),
    } as unknown as Response);

    await expect(
      service.buildTaskModeContext(
        { message: '生成周报', sessionId: 'session-org-1' },
        'Bearer token-org-1',
        'trace-org-1',
        []
      )
    ).resolves.toMatchObject({
      context: {
        userId: 'user-1',
        organizationId: '00000000-0000-4000-8000-000000000010',
      },
    });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('submits waiting_input payload and resumes execution observation', async () => {
    const { service, controlPlaneClient, waitingInputService, executionStreamService } =
      createService();

    controlPlaneClient.getExecution.mockResolvedValue({
      skillId: 'skill-1',
      status: 'waiting_input',
      normalizedInput: {
        objective: 'Collect user info',
      },
    });
    waitingInputService.loadWaitingInputDetails.mockResolvedValue({
      waitingStepId: 'step-1',
      missingInputs: [
        {
          name: 'url',
          description: '待处理链接',
          missing: true,
        },
      ],
      allRequiredInputs: [],
    });
    waitingInputService.extractExecutionSemantic.mockReturnValue(undefined);
    waitingInputService.buildWaitingInputPayload.mockResolvedValue({
      input: {
        url: 'https://example.com',
      },
      usage: undefined,
    });
    controlPlaneClient.submitExecutionInput.mockResolvedValue({
      id: 'execution-1',
      status: 'running',
    });
    executionStreamService.buildLatestExecutionStateEvent.mockResolvedValue(null);
    executionStreamService.observeExecution.mockImplementation(
      createAsyncGenerator([
        {
          type: StreamEventType.RESULT,
          content: '任务继续执行',
          data: {
            executionId: 'execution-1',
            status: 'running',
          },
        },
      ])
    );

    const events: Array<{ type: StreamEventType; content: string }> = [];
    for await (const event of service.handleTaskMode(
      {
        message: '{"url":"https://example.com"}',
        executionId: 'execution-1',
      },
      {
        sessionId: 'session-1',
        userId: 'user-1',
        userRoles: ['employee'],
        traceId: 'trace-1',
        history: [],
        executionId: 'execution-1',
      },
      'Bearer token-1'
    )) {
      events.push({ type: event.type, content: event.content });
    }

    expect(controlPlaneClient.submitExecutionInput).toHaveBeenCalledWith(
      'execution-1',
      {
        stepId: 'step-1',
        input: {
          url: 'https://example.com',
        },
        usage: undefined,
      },
      {
        authToken: 'Bearer token-1',
        user: {
          userId: 'user-1',
          userRoles: ['employee'],
        },
      }
    );
    expect(events).toEqual([
      {
        type: StreamEventType.THOUGHT,
        content: '正在提交您补充的信息...',
      },
      {
        type: StreamEventType.THOUGHT,
        content: '信息已提交，任务继续执行。',
      },
      {
        type: StreamEventType.RESULT,
        content: '任务继续执行',
      },
    ]);
  });

  it('creates resumable execution when planner returns missing required inputs', async () => {
    const { service, plannerService, controlPlaneClient, waitingInputService } = createService();
    const planDraft = {
      plan_id: 'plan-1',
      planner_mode: 'skill',
      objective: '生成采购合同',
      summary: '已识别技能 采购合同，但仍缺少 1 个关键输入。',
      skill_match: {
        skill_id: 'skill-contract',
        skill_name: '采购合同',
      },
      required_inputs: [
        {
          name: 'info.partyA',
          missing: true,
        },
      ],
      steps: [],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
      risk_summary: undefined,
      semantic: {
        summary: '请补充甲方名称',
      },
    };

    plannerService.matchSkillPhase.mockResolvedValue({
      matchedSkill: {
        skillId: 'skill-contract',
        skillName: '采购合同',
      },
    });
    plannerService.completePlanFromMatchPhase.mockResolvedValue(planDraft);
    controlPlaneClient.createExecution.mockResolvedValue({
      id: 'execution-plan-1',
      status: 'waiting_input',
    });
    waitingInputService.extractExecutionSemantic.mockReturnValue(undefined);
    waitingInputService.formatWaitingInputMessage.mockReturnValue('请补充甲方名称');

    const events: Array<{ type: StreamEventType; content: string }> = [];
    for await (const event of service.handleTaskMode(
      {
        message: '帮我生成采购合同',
        sessionId: 'session-plan-1',
      },
      {
        sessionId: 'session-plan-1',
        userId: 'user-plan-1',
        userRoles: ['employee'],
        traceId: 'trace-plan-1',
        history: [],
      },
      'Bearer token-plan-1'
    )) {
      events.push({ type: event.type, content: event.content });
    }

    expect(controlPlaneClient.createExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: 'skill-contract',
        input: {
          prompt: '帮我生成采购合同',
        },
        planDraft: expect.objectContaining({
          plan_id: 'plan-1',
          planner_mode: 'skill',
        }),
      }),
      {
        authToken: 'Bearer token-plan-1',
        user: {
          userId: 'user-plan-1',
          userRoles: ['employee'],
        },
      }
    );
    expect(events).toEqual([
      {
        type: StreamEventType.THOUGHT,
        content: '正在规划任务...',
      },
      {
        type: StreamEventType.THOUGHT,
        content: '已识别到技能: 采购合同，正在识别参数...',
      },
      {
        type: StreamEventType.THOUGHT,
        content: '已识别到技能: 采购合同，正在创建可恢复的执行单...',
      },
      {
        type: StreamEventType.RESULT,
        content: '请补充甲方名称',
      },
    ]);
  });

  it('does not recognize parameters or create an execution when no Skill matches', async () => {
    const { service, plannerService, controlPlaneClient, reactEngineService } = createService();
    plannerService.matchSkillPhase.mockResolvedValue({
      objective: '查看今天的天气',
      matchedSkill: null,
      hasVisibleSkills: true,
    });

    const events: Array<{ type: StreamEventType; content: string; data?: unknown }> = [];
    for await (const event of service.handleTaskMode(
      {
        message: '查看今天的天气',
        sessionId: 'session-no-skill',
      },
      {
        sessionId: 'session-no-skill',
        userId: 'user-no-skill',
        userRoles: ['employee'],
        traceId: 'trace-no-skill',
        history: [],
      },
      'Bearer token-no-skill'
    )) {
      events.push({ type: event.type, content: event.content, data: event.data });
    }

    expect(plannerService.completePlanFromMatchPhase).not.toHaveBeenCalled();
    expect(controlPlaneClient.createExecution).not.toHaveBeenCalled();
    expect(reactEngineService.execute).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      type: StreamEventType.RESULT,
      content: '当前没有可执行且与该请求充分匹配的 Skills，任务未执行。',
      data: {
        code: 'CAPABILITY_NOT_FOUND',
        status: 'not_started',
        executed: false,
      },
    });
  });

  it('reports a retryable matcher outage instead of a false capability-not-found result', async () => {
    const { service, plannerService, controlPlaneClient } = createService();
    plannerService.matchSkillPhase.mockResolvedValue({
      objective: '未知业务请求',
      matchedSkill: null,
      hasVisibleSkills: true,
      failure: {
        code: 'SKILL_MATCH_MODEL_UNAVAILABLE',
        message: '能力匹配服务暂时不可用，请稍后重试。',
        retryable: true,
      },
    });

    const events: Array<{ type: StreamEventType; content: string; data?: unknown }> = [];
    for await (const event of service.handleTaskMode(
      { message: '未知业务请求', sessionId: 'session-match-outage' },
      {
        sessionId: 'session-match-outage',
        userId: 'user-match-outage',
        userRoles: ['employee'],
        traceId: 'trace-match-outage',
        history: [],
      },
      'Bearer token-match-outage'
    )) {
      events.push({ type: event.type, content: event.content, data: event.data });
    }

    expect(controlPlaneClient.createExecution).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      type: StreamEventType.ERROR,
      content: '能力匹配服务暂时不可用，请稍后重试。',
      data: {
        code: 'SKILL_MATCH_MODEL_UNAVAILABLE',
        status: 'not_started',
        executed: false,
        retryable: true,
      },
    });
  });

  it('fails closed instead of entering ReAct when the planner cannot produce an executable Skill plan', async () => {
    const { service, plannerService, controlPlaneClient, reactEngineService } = createService();
    plannerService.matchSkillPhase.mockResolvedValue({
      objective: '探索未知系统',
      matchedSkill: { skillId: 'candidate-1', skillName: '候选能力' },
      hasVisibleSkills: true,
    });
    plannerService.completePlanFromMatchPhase.mockResolvedValue({
      planner_mode: 'fallback',
      objective: '探索未知系统',
      required_inputs: [],
      steps: [],
    });

    const events: Array<{ type: StreamEventType; content: string; data?: unknown }> = [];
    for await (const event of service.handleTaskMode(
      { message: '探索未知系统', sessionId: 'session-exploratory' },
      {
        sessionId: 'session-exploratory',
        userId: 'user-exploratory',
        userRoles: ['employee'],
        traceId: 'trace-exploratory',
        history: [],
      },
      'Bearer token-exploratory'
    )) {
      events.push({ type: event.type, content: event.content, data: event.data });
    }

    expect(controlPlaneClient.createExecution).not.toHaveBeenCalled();
    expect(reactEngineService.execute).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      type: StreamEventType.RESULT,
      content:
        '当前请求无法形成可验证的生产执行计划；任务未执行。可切换到独立探索模式创建候选能力或工作流。',
      data: {
        code: 'EXPLORATORY_REQUIRED',
        status: 'not_started',
        executed: false,
      },
    });
  });

  it('returns no matching Skills for deterministic planning without creating execution', async () => {
    const { service, deterministicTaskExecutionService, controlPlaneClient } =
      createDeterministicService();
    deterministicTaskExecutionService.executeDeterministicTask.mockResolvedValue({
      success: false,
      errorCode: 'CAPABILITY_NOT_FOUND',
      errorMessage: '没有匹配的 Skill',
    });

    const events: Array<{ type: StreamEventType; content: string; data?: unknown }> = [];
    for await (const event of service.handleTaskMode(
      {
        message: '搜索天气并总结，最后生成 MD 文件',
        sessionId: 'session-det-no-skill',
      },
      {
        sessionId: 'session-det-no-skill',
        userId: 'user-det-no-skill',
        userRoles: ['employee'],
        traceId: 'trace-det-no-skill',
        history: [],
      },
      'Bearer token-det-no-skill'
    )) {
      events.push({ type: event.type, content: event.content, data: event.data });
    }

    expect(controlPlaneClient.createExecution).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      type: StreamEventType.RESULT,
      content: '当前没有可执行且与该请求充分匹配的 Skills，任务未执行。',
      data: {
        code: 'CAPABILITY_NOT_FOUND',
        status: 'not_started',
        executed: false,
      },
    });
  });

  it('includes llmCalls in __promptDebug when creating execution if prompt debug enabled', async () => {
    const {
      service,
      plannerService,
      controlPlaneClient,
      waitingInputService,
      promptDebugSettingsService,
    } = createService();
    promptDebugSettingsService.isPromptDebugEnabled.mockReturnValue(true);

    const planDraft = {
      plan_id: 'plan-debug-1',
      planner_mode: 'skill',
      objective: '生成合同',
      summary: '需要输入',
      skill_match: { skill_id: 'skill-contract', skill_name: '采购合同' },
      required_inputs: [{ name: 'partyA', missing: true }],
      steps: [],
      metadata: {
        debug: {
          llmCalls: [
            { stage: 'planner', label: 'Match Phase', modelId: 'gpt-4', responseText: 'ok' },
          ],
        },
      },
    };

    plannerService.matchSkillPhase.mockResolvedValue({
      matchedSkill: { skillId: 'skill-contract', skillName: '采购合同' },
    });
    plannerService.completePlanFromMatchPhase.mockResolvedValue(planDraft);
    controlPlaneClient.createExecution.mockResolvedValue({
      id: 'exec-debug-1',
      status: 'waiting_input',
    });
    waitingInputService.extractExecutionSemantic.mockReturnValue(undefined);
    waitingInputService.formatWaitingInputMessage.mockReturnValue('请补充信息');

    for await (const _ of service.handleTaskMode(
      { message: '生成合同', sessionId: 's-debug-1' },
      {
        sessionId: 's-debug-1',
        userId: 'admin-1',
        userRoles: ['admin'],
        traceId: 't-1',
        history: [],
      },
      'Bearer token-1'
    )) {
      // Drain the async stream so orchestration side effects complete.
    }

    expect(controlPlaneClient.createExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          __promptDebug: expect.objectContaining({
            llmCalls: [
              { stage: 'planner', label: 'Match Phase', modelId: 'gpt-4', responseText: 'ok' },
            ],
          }),
        }),
      }),
      expect.anything()
    );
  });

  it('observes deterministic execution with auth token and user context', async () => {
    const { service, deterministicTaskExecutionService, executionStreamService } =
      createDeterministicService();

    deterministicTaskExecutionService.executeDeterministicTask.mockResolvedValue({
      success: true,
      executionId: 'execution-det-1',
      planDraft: {
        objective: '生成 AI 新闻 Markdown',
        nodes: [
          {
            nodeId: 'search',
            sequence: 1,
            title: '搜索新闻',
            kind: 'skill',
            skillId: 'skill-search',
            skillVersion: '1',
            runtimeType: 'workflow',
            dependsOn: [],
            inputBindings: {},
            outputContract: { results: 'news_item_list' },
            failurePolicy: 'abort',
          },
        ],
        finalOutputs: [],
      },
    });
    executionStreamService.observeExecution.mockImplementation(
      createAsyncGenerator([
        {
          type: StreamEventType.RESULT,
          content: '任务完成',
          data: {
            executionId: 'execution-det-1',
            status: 'succeeded',
          },
        },
      ])
    );

    const events: Array<{ type: StreamEventType; content: string }> = [];
    for await (const event of service.handleTaskMode(
      {
        message: '搜索 最新的人工智能 的新闻 并且对结果进行总结，最终输出md文件',
        sessionId: 'session-det-1',
      },
      {
        sessionId: 'session-det-1',
        userId: 'user-det-1',
        userRoles: ['employee'],
        traceId: 'trace-det-1',
        history: [],
      },
      'Bearer token-det-1'
    )) {
      events.push(event);
    }

    expect(executionStreamService.observeExecution).toHaveBeenCalledWith(
      'execution-det-1',
      'Bearer token-det-1',
      {
        userId: 'user-det-1',
        userRoles: ['employee'],
      },
      { modelId: undefined }
    );
    expect(
      events.some(
        (event) =>
          event.type === StreamEventType.THOUGHT && event.content.includes('Skill: skill-search@1')
      )
    ).toBe(true);
  });

  it('returns friendly Chinese error prompting authorization when skill execution creation fails with permission error', async () => {
    const { service, plannerService, controlPlaneClient } = createService();
    const planDraft = {
      plan_id: 'plan-weather-1',
      planner_mode: 'skill',
      skill_match: {
        skill_id: '6b346cd2-670a-4bbf-aa3d-5b9449fd8753',
        skill_name: '天气查询',
        confidence: 0.95,
      },
      required_inputs: [{ name: 'city', description: '城市', missing: true }],
      steps: [],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    };
    plannerService.matchSkillPhase.mockResolvedValue({
      objective: '查看今天的天气',
      matchedSkill: { skillId: '6b346cd2-670a-4bbf-aa3d-5b9449fd8753', skillName: '天气查询' },
      planDraft,
      hasVisibleSkills: true,
    });
    plannerService.completePlanFromMatchPhase.mockResolvedValue(planDraft);
    controlPlaneClient.createExecution.mockRejectedValue({
      response: {
        data: {
          statusCode: 403,
          message: 'You do not have permission to execute this skill',
        },
      },
    });

    const events: Array<{ type: StreamEventType; content: string }> = [];
    for await (const event of service.handleTaskMode(
      {
        message: '查看今天的天气',
        sessionId: 'session-weather-1',
      },
      {
        sessionId: 'session-weather-1',
        userId: 'user-weather-1',
        userRoles: ['employee'],
        traceId: 'trace-weather-1',
        history: [],
      },
      'Bearer token-weather-1'
    )) {
      events.push({ type: event.type, content: event.content });
    }

    const errorEvent = events.find((e) => e.type === StreamEventType.ERROR);
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.content).toBe(
      '您当前暂无「天气查询」技能的执行权限。如需使用，请前往「技能中心」申请授权，或联系系统管理员开通权限。'
    );
  });
});
