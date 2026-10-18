import { ChatOrchestratorService } from './chat-orchestrator.service';
import { StreamEventType } from '../react-engine/interfaces';

describe('ChatOrchestratorService - search negation routing', () => {
  it('does not enable web search or route to search when prompt has explicit search negation and switch is off', async () => {
    const plannerService = {
      matchSkillPhase: jest.fn().mockResolvedValue({
        objective: '不要联网，不要搜索，也不要读取工作空间。只计算以下虚构销售数据：A店120元，B店80元。返回总额及占比。',
        hasVisibleSkills: false,
        matchedSkill: null,
      }),
      completePlanFromMatchPhase: jest.fn(),
      generatePlan: jest.fn(),
    };

    const mockModelService = {
      streamChatWithTools: jest.fn().mockImplementation(async function* () {
        yield { type: 'chunk', content: '总额200元，A店60%，B店40%。' };
      }),
      resolveModelEntity: jest.fn().mockReturnValue({ id: 'auto' }),
      isVisionCapableModel: jest.fn().mockReturnValue(false),
      callModelStreamWithMessages: jest.fn().mockImplementation((_m, _msg, onChunk) => {
        onChunk('总额200元，A店60%，B店40%。');
        return Promise.resolve({ usage: { promptTokens: 10, completionTokens: 10 } });
      }),
    };

    const mockChatConversation = {
      getLatestCompletedTaskResult: jest.fn().mockResolvedValue(null),
      resolvePreferredChatModelId: jest.fn().mockReturnValue('auto'),
      isThinkingEnabled: jest.fn().mockReturnValue(false),
      resolveReasoningConfig: jest.fn().mockResolvedValue({}),
      buildConversationMessages: jest.fn().mockResolvedValue([{ role: 'user', content: 'test' }]),
      getVisibleChatContent: jest.fn((c) => c),
    };

    const service = new ChatOrchestratorService(
      {} as any,
      {} as any,
      plannerService as any,
      { isPromptDebugEnabled: () => false } as any,
      {} as any,
      {} as any,
      mockChatConversation as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mockModelService as any,
    );

    const events: any[] = [];
    for await (const event of service.handleTaskMode(
      {
        message: '不要联网，不要搜索，也不要读取工作空间。只计算以下虚构销售数据：A店120元，B店80元。返回总额及占比。',
        sessionId: 'session-no-search',
        config: { webSearch: false },
      },
      {
        sessionId: 'session-no-search',
        userId: 'user-1',
        userRoles: ['employee'],
        traceId: 'trace-no-search',
        history: [],
      },
      'Bearer token'
    )) {
      events.push(event);
    }

    expect(plannerService.matchSkillPhase).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          context: expect.objectContaining({
            web_search_enabled: false,
            webSearch: false,
          }),
        }),
      })
    );

    const resultEvent = events.find((e) => e.type === StreamEventType.RESULT);
    expect(resultEvent).toBeDefined();
    expect(resultEvent.content).toContain('总额200元');
  });

  it('keeps web search enabled if the user explicitly turns on the web search toggle even if prompt mentions "不要联网"', async () => {
    const plannerService = {
      matchSkillPhase: jest.fn().mockResolvedValue({
        objective: '不要联网，只查天气',
        hasVisibleSkills: true,
        matchedSkill: { skillId: 'platform.search.web', skillName: '全网搜索' },
      }),
      completePlanFromMatchPhase: jest.fn().mockResolvedValue({
        plan_id: 'plan-1',
        planner_mode: 'skill',
        objective: '不要联网，只查天气',
        required_inputs: [],
        steps: [],
        risk_summary: { level: 'low', requires_human_review: false, items: [] },
      }),
    };

    const controlPlaneClient = {
      createExecution: jest.fn().mockResolvedValue({ id: 'exec-1' }),
    };

    const executionStreamService = {
      observeExecution: jest.fn().mockImplementation(async function* () {
        yield { type: StreamEventType.RESULT, content: '搜索成功' };
      }),
    };

    const taskFallbackPolicyService = {
      isImplicitReactFallbackEnabled: jest.fn().mockReturnValue(false),
    };

    const service = new ChatOrchestratorService(
      controlPlaneClient as any,
      {} as any,
      plannerService as any,
      { isPromptDebugEnabled: () => false } as any,
      {} as any,
      executionStreamService as any,
      { getLatestCompletedTaskResult: jest.fn().mockResolvedValue(null) } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      taskFallbackPolicyService as any,
    );

    for await (const _ of service.handleTaskMode(
      {
        message: '不要联网，只查天气',
        sessionId: 'session-toggle-on',
        config: { webSearch: true }, // Explicitly toggled ON by user
      },
      {
        sessionId: 'session-toggle-on',
        userId: 'user-1',
        userRoles: ['employee'],
        traceId: 'trace-toggle-on',
        history: [],
      },
      'Bearer token'
    )) {
      // consume stream
    }

    // Toggle on must take precedence allowing web search tool to be bound
    expect(plannerService.matchSkillPhase).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          context: expect.objectContaining({
            web_search_enabled: true,
            webSearch: true,
          }),
        }),
      })
    );
  });
});
