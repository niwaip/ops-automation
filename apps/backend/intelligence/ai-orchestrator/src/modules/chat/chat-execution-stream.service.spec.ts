import { ControlPlaneClient } from '../../client/control-plane.client';
import {
  CONTROL_PLANE_EVENT_TYPE,
  CONTROL_PLANE_EXECUTION_STATUS,
} from '../../client/control-plane.contracts';
import { StreamEventType } from '../react-engine/interfaces';
import { ChatExecutionStreamService } from './chat-execution-stream.service';
import { ChatResultNormalizerService } from './chat-result-normalizer.service';

describe('ChatExecutionStreamService', () => {
  const createService = () => {
    const controlPlaneClient = {
      getExecution: jest.fn(),
      streamExecutionEvents: jest.fn(),
    };
    const waitingInputService = {
      buildControlPlaneRequestOptions: jest.fn((authToken?: string, user?: unknown) => ({
        authToken,
        user,
      })),
      loadWaitingInputDetails: jest.fn(),
      extractExecutionSemantic: jest.fn(),
      formatWaitingInputMessage: jest.fn(),
    };
    const resultNormalizerService = {
      normalize: jest.fn(),
      formatForChat: jest.fn(),
    };

    const service = new ChatExecutionStreamService(
      controlPlaneClient as unknown as ControlPlaneClient,
      waitingInputService as any,
      resultNormalizerService as any
    );

    return {
      service,
      controlPlaneClient,
      waitingInputService,
      resultNormalizerService,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns structured failure reason for failed terminal executions', async () => {
    const { service, controlPlaneClient, waitingInputService } = createService();

    controlPlaneClient.getExecution
      .mockResolvedValueOnce({
        id: 'execution-failed-1',
        status: CONTROL_PLANE_EXECUTION_STATUS.FAILED,
      })
      .mockResolvedValueOnce({
        id: 'execution-failed-1',
        status: CONTROL_PLANE_EXECUTION_STATUS.FAILED,
        failureReason: 'Failed to allocate runtime session: Request failed with status code 400',
      });

    const event = await service.buildLatestExecutionStateEvent(
      'execution-failed-1',
      'Bearer token-1',
      {
        userId: 'user-1',
        userRoles: ['employee'],
      }
    );

    expect(waitingInputService.buildControlPlaneRequestOptions).toHaveBeenCalledWith(
      'Bearer token-1',
      {
        userId: 'user-1',
        userRoles: ['employee'],
      }
    );
    expect(event).toEqual({
      type: StreamEventType.RESULT,
      content:
        '❌ 任务执行失败\n\n原因：Failed to allocate runtime session: Request failed with status code 400\n\n执行单 ID: execution-failed-1',
      data: {
        executionId: 'execution-failed-1',
        status: CONTROL_PLANE_EXECUTION_STATUS.FAILED,
        failureReason: 'Failed to allocate runtime session: Request failed with status code 400',
        hasBusinessResult: false,
        chatSummary:
          '❌ 任务执行失败\n\n原因：Failed to allocate runtime session: Request failed with status code 400',
        summaryFormat: 'markdown',
        usage: undefined,
      },
    });
  });

  it('falls back to concise failure payload when terminal detail loading fails', async () => {
    const { service, controlPlaneClient } = createService();

    controlPlaneClient.getExecution
      .mockResolvedValueOnce({
        id: 'execution-failed-2',
        status: CONTROL_PLANE_EXECUTION_STATUS.FAILED,
      })
      .mockRejectedValueOnce(new Error('control plane timeout'));

    const event = await service.buildLatestExecutionStateEvent('execution-failed-2');

    expect(event).toEqual({
      type: StreamEventType.ERROR,
      content: '任务执行失败',
      data: {
        executionId: 'execution-failed-2',
        status: CONTROL_PLANE_EXECUTION_STATUS.FAILED,
        failureReason: '任务执行失败',
      },
    });
  });

  it('summarizes successful step observations for chat progress', () => {
    const { service, resultNormalizerService } = createService();

    resultNormalizerService.normalize.mockReturnValue({
      summary: undefined,
      detailText: undefined,
      body: undefined,
      downloadUrl: undefined,
    });

    const streamEvent = (service as any).mapExecutionEventToStreamEvent({
      executionId: 'execution-1',
      eventType: CONTROL_PLANE_EVENT_TYPE.STEP_SUCCEEDED,
      payload: {
        stepId: 'step-1',
        result: {
          status: 'success',
          command: 'wait',
          data: { duration: 1000 },
          pageUrl: 'http://192.168.100.143:5173/login',
          pageTitle: 'Ops Portal',
          stdout: 'very long raw output',
        },
      },
    });

    expect(streamEvent).toEqual({
      type: StreamEventType.OBSERVATION,
      content: '步骤执行成功，命令：wait，页面：Ops Portal，耗时 1000 ms',
      data: {
        stepId: 'step-1',
        result: {
          status: 'success',
          command: 'wait',
          data: { duration: 1000 },
          pageUrl: 'http://192.168.100.143:5173/login',
          pageTitle: 'Ops Portal',
          stdout: 'very long raw output',
        },
        normalizedResult: {
          summary: undefined,
          detailText: undefined,
          body: undefined,
          downloadUrl: undefined,
        },
        downloadUrl: undefined,
      },
    });
  });

  it('emits protocol-level pending approval event from latest execution state', async () => {
    const { service, controlPlaneClient } = createService();

    controlPlaneClient.getExecution.mockResolvedValue({
      id: 'execution-approval-1',
      status: CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL,
      approvalStatus: 'pending',
    });

    await expect(service.buildLatestExecutionStateEvent('execution-approval-1')).resolves.toEqual({
      type: StreamEventType.PENDING_APPROVAL,
      content:
        '任务需要审批后才能继续执行。\n\n当前审批状态: pending\n执行单 ID: execution-approval-1',
      data: {
        executionId: 'execution-approval-1',
        status: CONTROL_PLANE_EXECUTION_STATUS.PENDING_APPROVAL,
        approvalStatus: 'pending',
        hasBusinessResult: false,
        usage: undefined,
      },
    });
  });

  it('emits protocol-level human control event from execution status change', () => {
    const { service } = createService();

    const streamEvent = (service as any).mapExecutionEventToStreamEvent({
      executionId: 'execution-human-1',
      eventType: CONTROL_PLANE_EVENT_TYPE.EXECUTION_STATUS_CHANGED,
      payload: {
        newStatus: CONTROL_PLANE_EXECUTION_STATUS.HUMAN_CONTROL,
        takeoverReason: '需要人工处理 MFA 验证',
      },
    });

    expect(streamEvent).toEqual({
      type: StreamEventType.HUMAN_CONTROL,
      content: '需要人工处理 MFA 验证',
      data: {
        executionId: 'execution-human-1',
        status: CONTROL_PLANE_EXECUTION_STATUS.HUMAN_CONTROL,
        hasBusinessResult: false,
        takeoverReason: '需要人工处理 MFA 验证',
      },
    });
  });

  it('honors preferAiSummary for any standard business result envelope', async () => {
    const controlPlaneClient = {
      getExecution: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'execution-weather',
          status: CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED,
        })
        .mockResolvedValueOnce({
          id: 'execution-weather',
          status: CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED,
          runtimeType: 'custom',
          normalizedInput: { objective: '上海的天气怎么样' },
          resultJson: {
            execution: { status: 'success' },
            result: {
              resultType: 'generic',
              title: 'weather_query_workflow',
              businessData: {
                date: '2026-08-12',
                noon: { tempC: '28' },
              },
            },
            presentation: { preferAiSummary: true },
          },
        }),
      streamExecutionEvents: jest.fn(),
    };
    const waitingInputService = {
      buildControlPlaneRequestOptions: jest.fn(() => ({})),
      loadWaitingInputDetails: jest.fn(),
      extractExecutionSemantic: jest.fn(),
      formatWaitingInputMessage: jest.fn(),
    };
    const chatCompletion = jest.fn().mockResolvedValue({
      content: '上海今日中午 28°C。',
    });
    const modelService = {
      getPreferredDefaultModel: jest.fn(() => ({ id: 'model-1', name: 'model-1' })),
      getClient: jest.fn(() => ({ chatCompletion })),
      stripThinkingTags: jest.fn((content: string) =>
        content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      ),
    };
    const service = new ChatExecutionStreamService(
      controlPlaneClient as any,
      waitingInputService as any,
      new ChatResultNormalizerService(),
      modelService as any
    );

    const event = await service.buildLatestExecutionStateEvent('execution-weather');

    expect(chatCompletion).toHaveBeenCalledTimes(1);
    expect(event).toEqual(
      expect.objectContaining({
        type: StreamEventType.RESULT,
        content: '上海今日中午 28°C。',
        data: expect.objectContaining({
          hasBusinessResult: true,
          chatSummary: '上海今日中午 28°C。',
          normalizedResult: expect.objectContaining({
            summary: '上海今日中午 28°C。',
            structuredData: {
              date: '2026-08-12',
              noon: { tempC: '28' },
            },
          }),
        }),
      })
    );
  });

  it('honors preferAiSummary even when the workflow also provides raw detail text', async () => {
    const controlPlaneClient = {
      getExecution: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'execution-search',
          status: CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED,
        })
        .mockResolvedValueOnce({
          id: 'execution-search',
          status: CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED,
          normalizedInput: { objective: '查看 dsh 的安装方法' },
          resultJson: {
            execution: { status: 'success' },
            result: {
              resultType: 'search_results',
              businessData: { searchResults: [{ title: 'DSH', content: '安装步骤' }] },
            },
            presentation: {
              preferAiSummary: true,
              chatSummary: '找到 1 条相关结果',
              notificationSummary: '找到 1 条相关结果',
              detailText: '1. DSH 安装步骤',
            },
          },
        }),
      streamExecutionEvents: jest.fn(),
      updateExecutionResultSummary: jest.fn(),
    };
    const waitingInputService = {
      buildControlPlaneRequestOptions: jest.fn(() => ({})),
      loadWaitingInputDetails: jest.fn(),
      extractExecutionSemantic: jest.fn(),
      formatWaitingInputMessage: jest.fn(),
    };
    const chatCompletion = jest.fn().mockResolvedValue({
      content: '# DSH 安装方法\n\n执行安装命令。',
    });
    const modelService = {
      getPreferredDefaultModel: jest.fn(() => ({ id: 'model-1', name: 'model-1' })),
      getClient: jest.fn(() => ({ chatCompletion })),
      stripThinkingTags: jest.fn((content: string) => content),
    };
    const service = new ChatExecutionStreamService(
      controlPlaneClient as any,
      waitingInputService as any,
      new ChatResultNormalizerService(),
      modelService as any
    );

    const event = await service.buildLatestExecutionStateEvent('execution-search');

    expect(chatCompletion).toHaveBeenCalledTimes(1);
    expect(event?.content).toBe('# DSH 安装方法\n\n执行安装命令。');
    expect((event?.data as any)?.normalizedResult?.envelope?.presentation).toEqual(
      expect.objectContaining({
        chatSummary: '# DSH 安装方法\n\n执行安装命令。',
        detailText: '# DSH 安装方法\n\n执行安装命令。',
      })
    );
  });

  it('removes model reasoning blocks from contract presentation summaries', async () => {
    const controlPlaneClient = {
      getExecution: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'execution-generic',
          status: CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED,
        })
        .mockResolvedValueOnce({
          id: 'execution-generic',
          status: CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED,
          normalizedInput: { objective: '展示执行结果' },
          resultJson: {
            execution: { status: 'success' },
            result: {
              title: 'generic_workflow',
              businessData: { value: 42 },
            },
            presentation: { preferAiSummary: true },
          },
        }),
      streamExecutionEvents: jest.fn(),
    };
    const waitingInputService = {
      buildControlPlaneRequestOptions: jest.fn(() => ({})),
      loadWaitingInputDetails: jest.fn(),
      extractExecutionSemantic: jest.fn(),
      formatWaitingInputMessage: jest.fn(),
    };
    const chatCompletion = jest.fn().mockResolvedValue({
      content: '<think>内部推理不得展示</think>业务结果为 42。',
    });
    const modelService = {
      getPreferredDefaultModel: jest.fn(() => ({ id: 'model-1', name: 'model-1' })),
      getClient: jest.fn(() => ({ chatCompletion })),
      stripThinkingTags: jest.fn((content: string) =>
        content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
      ),
    };
    const service = new ChatExecutionStreamService(
      controlPlaneClient as any,
      waitingInputService as any,
      new ChatResultNormalizerService(),
      modelService as any
    );

    const event = await service.buildLatestExecutionStateEvent('execution-generic');

    expect(event?.content).toBe('业务结果为 42。');
    expect(event?.data).toEqual(
      expect.objectContaining({
        chatSummary: '业务结果为 42。',
        normalizedResult: expect.objectContaining({ summary: '业务结果为 42。' }),
      })
    );
  });

  it('does not ask a model to summarize a terminal action with protocol presentation text', async () => {
    const controlPlaneClient = {
      getExecution: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'execution-bark',
          status: CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED,
        })
        .mockResolvedValueOnce({
          id: 'execution-bark',
          status: CONTROL_PLANE_EXECUTION_STATUS.SUCCEEDED,
          normalizedInput: { objective: '用 bark 推送' },
          resultJson: {
            execution: { status: 'success' },
            result: {
              resultType: 'generic',
              title: 'Bark推送服务',
              businessData: { statusCode: 200 },
            },
            presentation: {
              preferAiSummary: true,
              chatSummary: 'Bark 推送已成功发送 ✅',
              detailText: '**推送状态**：成功（状态码 200）',
            },
          },
        }),
      streamExecutionEvents: jest.fn(),
    };
    const waitingInputService = {
      buildControlPlaneRequestOptions: jest.fn(() => ({})),
      loadWaitingInputDetails: jest.fn(),
      extractExecutionSemantic: jest.fn(),
      formatWaitingInputMessage: jest.fn(),
    };
    const chatCompletion = jest.fn();
    const modelService = {
      getPreferredDefaultModel: jest.fn(() => ({ id: 'model-1', name: 'model-1' })),
      getClient: jest.fn(() => ({ chatCompletion })),
      stripThinkingTags: jest.fn((content: string) => content),
    };
    const service = new ChatExecutionStreamService(
      controlPlaneClient as any,
      waitingInputService as any,
      new ChatResultNormalizerService(),
      modelService as any
    );

    const event = await service.buildLatestExecutionStateEvent('execution-bark');

    expect(chatCompletion).not.toHaveBeenCalled();
    expect(event?.content).toContain('状态码 200');
  });
});
