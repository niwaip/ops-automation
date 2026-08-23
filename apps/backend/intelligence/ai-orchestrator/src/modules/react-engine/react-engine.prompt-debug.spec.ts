import { ReActEngineService } from './react-engine.service';
import { ModelService } from '../model/model.service';
import { CapabilityResolver } from './capability-resolver';
import { ModelRouterService } from './model-router.service';
import { ToolExecutor } from './tool-executor';
import { SessionService } from '../redis/session.service';
import { PromptDebugSettingsService } from '../debug-settings/prompt-debug-settings.service';
import { ExecutionContext, ReActConfig, ReActState } from './interfaces';

/**
 * B-3 regression coverage: multi-round ReAct inference must APPEND llmCalls
 * (one node per iteration, labelled with the round number) instead of
 * overwriting, and promptDebug exposure must respect the admin+switch guard
 * in every event builder (including createResultEvent/createWaitingEvent,
 * which previously bypassed it).
 */
describe('ReActEngineService promptDebug (B-3)', () => {
  function createService(settings: PromptDebugSettingsService) {
    const chatCompletion = jest.fn().mockResolvedValue(
      'Thought: 测试完成\nAction: finish\nAction Input: {"answer":"ok"}'
    );
    const modelService = {
      getClient: jest.fn().mockReturnValue({
        updateConfig: jest.fn(),
        chatCompletion,
      }),
      getFallbackModelIds: jest.fn().mockReturnValue(['default']),
    } as unknown as ModelService;

    const sessionService = {
      getSession: jest.fn().mockResolvedValue(null),
      saveSession: jest.fn().mockResolvedValue(undefined),
      deleteSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as SessionService;

    const toolExecutor = new ToolExecutor();
    const capabilityResolver = new CapabilityResolver(toolExecutor);
    const modelRouterService = new ModelRouterService(modelService);
    const service = new ReActEngineService(
      modelService,
      toolExecutor,
      sessionService,
      capabilityResolver,
      modelRouterService,
      settings
    );

    return { service, chatCompletion };
  }

  function buildState(): ReActState {
    return {
      thought: '',
      action: '',
      actionInput: {},
      observation: '',
      iteration: 0,
      maxIterations: 5,
      isFinished: false,
    };
  }

  const adminContext: ExecutionContext = {
    sessionId: 'pd-session',
    userId: 'u-1',
    userRoles: ['admin'],
    history: [],
  };

  const nonAdminContext: ExecutionContext = {
    sessionId: 'pd-session',
    userId: 'u-2',
    userRoles: ['employee'],
    history: [],
  };

  const config: ReActConfig = {
    maxIterations: 5,
    modelId: 'default',
    tools: [],
    mode: 'task',
  };

  const messages = [{ role: 'user' as const, content: '测试任务' }];

  async function runOneIteration(
    service: ReActEngineService,
    state: ReActState,
    context: ExecutionContext
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const generator = (service as any).generateThoughtAndAction(
      state,
      context,
      messages,
      [],
      config
    );
    for await (const _event of generator) {
      // drain events
    }
  }

  it('appends one llmCall per iteration with round-numbered labels', async () => {
    const settings = new PromptDebugSettingsService();
    const { service } = createService(settings);
    const state = buildState();

    await runOneIteration(service, state, adminContext);
    expect(state.promptDebug?.llmCalls).toHaveLength(1);
    expect(state.promptDebug?.llmCalls?.[0]?.label).toBe('ReAct 推理 #1');

    state.iteration = 1;
    await runOneIteration(service, state, adminContext);
    expect(state.promptDebug?.llmCalls).toHaveLength(2);
    expect(state.promptDebug?.llmCalls?.[0]?.label).toBe('ReAct 推理 #1');
    expect(state.promptDebug?.llmCalls?.[1]?.label).toBe('ReAct 推理 #2');
    // The top-level payload reflects the LATEST round, while llmCalls keeps history.
    expect(state.promptDebug?.llmRequestMessages).toHaveLength(2);
  });

  it('keeps state.promptDebug undefined when the debug switch is off', async () => {
    const settings = new PromptDebugSettingsService();
    settings.updateSettings({ promptDebugEnabled: false });
    const { service } = createService(settings);
    const state = buildState();

    await runOneIteration(service, state, adminContext);
    expect(state.promptDebug).toBeUndefined();
  });

  it('keeps state.promptDebug undefined for non-admin users even when the switch is on', async () => {
    const settings = new PromptDebugSettingsService();
    const { service } = createService(settings);
    const state = buildState();

    await runOneIteration(service, state, nonAdminContext);
    expect(state.promptDebug).toBeUndefined();
  });

  it('createResultEvent respects the guard (no bypass)', () => {
    const settings = new PromptDebugSettingsService();
    const { service } = createService(settings);
    const state = buildState();
    state.promptDebug = {
      systemPrompt: 'sys',
      userPrompt: 'usr',
      debugSource: 'react-engine',
      llmCalls: [{ stage: 'react-engine', label: 'ReAct 推理 #1' }],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminEvent = (service as any).createResultEvent(state, adminContext);
    expect(adminEvent.data.promptDebug).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nonAdminEvent = (service as any).createResultEvent(state, nonAdminContext);
    expect(nonAdminEvent.data.promptDebug).toBeUndefined();

    settings.updateSettings({ promptDebugEnabled: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const switchedOffEvent = (service as any).createResultEvent(state, adminContext);
    expect(switchedOffEvent.data.promptDebug).toBeUndefined();
  });

  it('createWaitingEvent respects the guard (no bypass)', () => {
    const settings = new PromptDebugSettingsService();
    const { service } = createService(settings);
    const state = buildState();
    state.isWaitingForUserInput = true;
    state.observation = '请补充参数';
    state.promptDebug = {
      systemPrompt: 'sys',
      userPrompt: 'usr',
      debugSource: 'react-engine',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminEvent = (service as any).createWaitingEvent(state, adminContext);
    expect(adminEvent.data.promptDebug).toBeDefined();

    settings.updateSettings({ promptDebugEnabled: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const switchedOffEvent = (service as any).createWaitingEvent(state, adminContext);
    expect(switchedOffEvent.data.promptDebug).toBeUndefined();
  });
});
