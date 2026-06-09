import axios from 'axios';
import { ReActEngineService } from './react-engine.service';
import { CapabilityResolver } from './capability-resolver';
import { ModelRouterService } from './model-router.service';
import { ToolExecutor } from './tool-executor';
import { ModelService } from '../model/model.service';
import { SessionService } from '../redis/session.service';
import { ChatRequestDTO, ExecutionContext, StreamEventType } from './interfaces';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ReActEngineService Retry E2E', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retries model inference once after provider error and then finishes', async () => {
    mockedAxios.get.mockResolvedValue({ data: { templates: [] } } as any);

    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        skills: [],
      }),
    });

    const chatCompletion = jest.fn()
      .mockRejectedValueOnce(new Error('upstream timeout'))
      .mockResolvedValueOnce(
        'Thought: 模型恢复成功，直接完成\nAction: finish\nAction Input: {"answer":"自动重试后成功"}',
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
    );

    const request: ChatRequestDTO = {
      message: '帮我简单总结一下当前状态',
      sessionId: 'retry-session',
      userId: 'u-1',
      userRoles: ['admin'],
    };

    const context: ExecutionContext = {
      sessionId: 'retry-session',
      userId: 'u-1',
      history: [],
    };

    const events = [];
    for await (const event of service.execute(request, context)) {
      events.push(event);
    }

    const waitingEvent = events.find((event) => event.type === StreamEventType.WAITING_INPUT);
    const resultEvent = events.find((event) => event.type === StreamEventType.RESULT);
    const finishActionEvent = events.find((event) => {
      return event.type === StreamEventType.ACTION && event.content === 'finish';
    });

    expect(waitingEvent).toBeUndefined();
    expect(resultEvent).toBeDefined();
    expect(resultEvent?.content).toContain('自动重试后成功');
    expect(finishActionEvent?.data?.routing).toMatchObject({
      modelId: 'default',
      attemptedModelIds: ['default'],
    });
    expect(resultEvent?.data?.routing).toMatchObject({
      modelId: 'default',
      attemptedModelIds: ['default'],
    });
    expect(resultEvent?.data?.meta).toMatchObject({
      systemPromptSectionKeys: expect.arrayContaining(['system_policy', 'capability_policy', 'skill_index']),
      userPromptSectionKeys: expect.arrayContaining(['task_input', 'routing_state', 'prompt_assembly_state', 'execution_request']),
    });
    expect(resultEvent?.data?.promptAssembly).toMatchObject({
      systemPromptSectionKeys: expect.arrayContaining(['system_policy', 'capability_policy', 'skill_index']),
      userPromptSectionKeys: expect.arrayContaining(['task_input', 'routing_state', 'prompt_assembly_state', 'execution_request']),
    });
    expect(resultEvent?.data?.decisionContext).toMatchObject({
      routing: {
        modelId: 'default',
        attemptedModelIds: ['default'],
      },
      promptAssembly: {
        systemPromptSectionKeys: expect.arrayContaining(['system_policy', 'capability_policy', 'skill_index']),
        userPromptSectionKeys: expect.arrayContaining(['task_input', 'routing_state', 'prompt_assembly_state', 'execution_request']),
      },
    });
    expect(chatCompletion.mock.calls[1]?.[0]?.[1]?.content).toContain('systemSections=');
    expect(chatCompletion.mock.calls[1]?.[0]?.[1]?.content).toContain('## Prompt Assembly State');
    expect(chatCompletion.mock.calls[1]?.[0]?.[1]?.content).toContain('system_policy>capability_policy>skill_index');
    expect(chatCompletion).toHaveBeenCalledTimes(2);
    expect(sessionService.deleteSession).toHaveBeenCalledWith('retry-session');
  });

  it('switches to fallback model after retry budget is exhausted', async () => {
    mockedAxios.get.mockResolvedValue({ data: { templates: [] } } as any);

    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        skills: [],
      }),
    });

    const primaryChatCompletion = jest.fn()
      .mockRejectedValueOnce(new Error('primary timeout'))
      .mockRejectedValueOnce(new Error('primary timeout again'));
    const backupChatCompletion = jest.fn()
      .mockResolvedValueOnce(
        'Thought: 后备模型恢复成功，直接完成\nAction: finish\nAction Input: {"answer":"切换后备模型后成功"}',
      );
    const primaryClient = {
      updateConfig: jest.fn(),
      chatCompletion: primaryChatCompletion,
    };
    const backupClient = {
      updateConfig: jest.fn(),
      chatCompletion: backupChatCompletion,
    };

    const modelService = {
      getClient: jest.fn((id: string) => {
        if (id === 'primary-model') {
          return primaryClient;
        }
        if (id === 'backup-model') {
          return backupClient;
        }
        return null;
      }),
      getFallbackModelIds: jest.fn().mockImplementation((id: string) => {
        if (id === 'default') {
          return ['primary-model', 'backup-model'];
        }
        return ['primary-model', 'backup-model'];
      }),
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
    );

    const request: ChatRequestDTO = {
      message: '帮我简单总结一下当前状态',
      sessionId: 'fallback-session',
      userId: 'u-1',
      userRoles: ['admin'],
      modelId: 'default',
    };

    const context: ExecutionContext = {
      sessionId: 'fallback-session',
      userId: 'u-1',
      history: [],
    };

    const events = [];
    for await (const event of service.execute(request, context)) {
      events.push(event);
    }

    const waitingEvent = events.find((event) => event.type === StreamEventType.WAITING_INPUT);
    const resultEvent = events.find((event) => event.type === StreamEventType.RESULT);
    const providerErrorEvent = events.find((event) => {
      return event.type === StreamEventType.ERROR
        && event.data?.code === 'provider_error';
    });
    const fallbackFinishAction = events.find((event) => {
      return event.type === StreamEventType.ACTION && event.content === 'finish';
    });

    expect(waitingEvent).toBeUndefined();
    expect(resultEvent?.content).toContain('切换后备模型后成功');
    expect(providerErrorEvent?.data?.routing).toMatchObject({
      modelId: 'primary-model',
      attemptedModelIds: ['primary-model'],
    });
    expect(providerErrorEvent?.data?.meta).toMatchObject({
      systemPromptSectionKeys: expect.arrayContaining(['system_policy', 'capability_policy', 'skill_index']),
      userPromptSectionKeys: expect.arrayContaining(['task_input', 'routing_state', 'execution_request']),
    });
    expect(providerErrorEvent?.data?.promptAssembly).toMatchObject({
      systemPromptSectionKeys: expect.arrayContaining(['system_policy', 'capability_policy', 'skill_index']),
      userPromptSectionKeys: expect.arrayContaining(['task_input', 'routing_state', 'execution_request']),
    });
    expect(providerErrorEvent?.data?.decisionContext).toMatchObject({
      routing: {
        modelId: 'primary-model',
        attemptedModelIds: ['primary-model'],
      },
      promptAssembly: {
        systemPromptSectionKeys: expect.arrayContaining(['system_policy', 'capability_policy', 'skill_index']),
        userPromptSectionKeys: expect.arrayContaining(['task_input', 'routing_state', 'execution_request']),
      },
    });
    expect(resultEvent?.data?.routing).toMatchObject({
      modelId: 'backup-model',
      attemptedModelIds: ['primary-model', 'backup-model'],
      routingReason: 'provider_error',
    });
    expect(resultEvent?.data?.decisionContext).toMatchObject({
      routing: {
        modelId: 'backup-model',
        attemptedModelIds: ['primary-model', 'backup-model'],
        routingReason: 'provider_error',
      },
      promptAssembly: {
        systemPromptSectionKeys: expect.arrayContaining(['system_policy', 'capability_policy', 'skill_index']),
        userPromptSectionKeys: expect.arrayContaining(['task_input', 'routing_state', 'prompt_assembly_state', 'execution_request']),
      },
    });
    expect(fallbackFinishAction?.data?.routing).toMatchObject({
      modelId: 'backup-model',
      attemptedModelIds: ['primary-model', 'backup-model'],
      routingReason: 'provider_error',
    });
    expect(primaryChatCompletion).toHaveBeenCalledTimes(2);
    expect(backupChatCompletion).toHaveBeenCalledTimes(1);
    expect((modelService.getClient as jest.Mock).mock.calls.map((call) => call[0])).toEqual([
      'primary-model',
      'primary-model',
      'backup-model',
    ]);
  });

  it('prefers same-provider fallback for protocol errors', async () => {
    mockedAxios.get.mockResolvedValue({ data: { templates: [] } } as any);

    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        skills: [],
      }),
    });

    const primaryChatCompletion = jest.fn()
      .mockResolvedValueOnce('not a valid react payload')
      .mockResolvedValueOnce('still invalid payload');
    const sameProviderChatCompletion = jest.fn()
      .mockResolvedValueOnce(
        'Thought: 同 provider 后备模型恢复成功\nAction: finish\nAction Input: {"answer":"同 provider fallback 成功"}',
      );
    const crossProviderChatCompletion = jest.fn();

    const modelService = {
      getClient: jest.fn((id: string) => {
        if (id === 'primary-model') {
          return { updateConfig: jest.fn(), chatCompletion: primaryChatCompletion };
        }
        if (id === 'same-provider-backup') {
          return { updateConfig: jest.fn(), chatCompletion: sameProviderChatCompletion };
        }
        if (id === 'cross-provider-backup') {
          return { updateConfig: jest.fn(), chatCompletion: crossProviderChatCompletion };
        }
        return null;
      }),
      getFallbackModelIds: jest.fn().mockImplementation((_id: string, strategy?: { groupOrder: string[]; includeCurrentModel: boolean }) => {
        if (strategy?.groupOrder?.[0] === 'same_provider') {
          return ['primary-model', 'same-provider-backup', 'cross-provider-backup'];
        }
        return ['primary-model', 'cross-provider-backup', 'same-provider-backup'];
      }),
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
    );

    const request: ChatRequestDTO = {
      message: '帮我简单总结一下当前状态',
      sessionId: 'protocol-fallback-session',
      userId: 'u-1',
      userRoles: ['admin'],
      modelId: 'default',
    };

    const context: ExecutionContext = {
      sessionId: 'protocol-fallback-session',
      userId: 'u-1',
      history: [],
    };

    const events = [];
    for await (const event of service.execute(request, context)) {
      events.push(event);
    }

    const resultEvent = events.find((event) => event.type === StreamEventType.RESULT);
    const protocolErrorEvent = events.find((event) => {
      return event.type === StreamEventType.ERROR
        && event.data?.code === 'protocol_error';
    });
    const protocolFinishAction = events.find((event) => {
      return event.type === StreamEventType.ACTION && event.content === 'finish';
    });

    expect(resultEvent?.content).toContain('同 provider fallback 成功');
    expect(protocolErrorEvent?.data?.routing).toMatchObject({
      modelId: 'primary-model',
      attemptedModelIds: ['primary-model'],
    });
    expect(resultEvent?.data?.routing).toMatchObject({
      modelId: 'same-provider-backup',
      attemptedModelIds: ['primary-model', 'same-provider-backup'],
      routingReason: 'protocol_error',
    });
    expect(resultEvent?.data?.decisionContext).toMatchObject({
      routing: {
        modelId: 'same-provider-backup',
        attemptedModelIds: ['primary-model', 'same-provider-backup'],
        routingReason: 'protocol_error',
      },
      promptAssembly: {
        systemPromptSectionKeys: expect.arrayContaining(['system_policy', 'capability_policy', 'skill_index']),
        userPromptSectionKeys: expect.arrayContaining(['task_input', 'routing_state', 'prompt_assembly_state', 'execution_request']),
      },
    });
    expect(protocolFinishAction?.data?.routing).toMatchObject({
      modelId: 'same-provider-backup',
      attemptedModelIds: ['primary-model', 'same-provider-backup'],
      routingReason: 'protocol_error',
    });
    expect(primaryChatCompletion).toHaveBeenCalledTimes(2);
    expect(sameProviderChatCompletion).toHaveBeenCalledTimes(1);
    expect(crossProviderChatCompletion).not.toHaveBeenCalled();
  });
});
