import { ControlPlaneClient } from '../../client/control-plane.client';
import {
  CONTROL_PLANE_EVENT_TYPE,
  CONTROL_PLANE_EXECUTION_STATUS,
} from '../../client/control-plane.contracts';
import { StreamEventType } from '../react-engine/interfaces';
import { ChatExecutionStreamService } from './chat-execution-stream.service';

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
      resultNormalizerService as any,
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
      },
    );

    expect(waitingInputService.buildControlPlaneRequestOptions).toHaveBeenCalledWith(
      'Bearer token-1',
      {
        userId: 'user-1',
        userRoles: ['employee'],
      },
    );
    expect(event).toEqual({
      type: StreamEventType.ERROR,
      content: 'Failed to allocate runtime session: Request failed with status code 400',
      data: {
        executionId: 'execution-failed-1',
        status: CONTROL_PLANE_EXECUTION_STATUS.FAILED,
        failureReason: 'Failed to allocate runtime session: Request failed with status code 400',
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
});
