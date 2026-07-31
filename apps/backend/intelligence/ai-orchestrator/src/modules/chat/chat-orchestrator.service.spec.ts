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

    const service = new ChatOrchestratorService(
      controlPlaneClient as unknown as ControlPlaneClient,
      reactEngineService as any,
      plannerService as any,
      promptDebugSettingsService as any,
      waitingInputService as any,
      executionStreamService as any
    );

    return {
      service,
      controlPlaneClient,
      reactEngineService,
      plannerService,
      promptDebugSettingsService,
      waitingInputService,
      executionStreamService,
    };
  };

  const createDeterministicService = () => {
    const base = createService();
    const deterministicTaskExecutionService = {
      shouldRouteToDeterministicPlan: jest.fn().mockReturnValue(true),
      executeDeterministicTask: jest.fn(),
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

  it('observes deterministic execution with auth token and user context', async () => {
    const {
      service,
      deterministicTaskExecutionService,
      executionStreamService,
    } = createDeterministicService();

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
      }
    );
    expect(events.some((event) => event.type === StreamEventType.THOUGHT && event.content.includes('Skill: skill-search@1'))).toBe(true);
  });
});
