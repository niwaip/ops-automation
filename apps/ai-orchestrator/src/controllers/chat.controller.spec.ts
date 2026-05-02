import { Readable } from 'stream';
import { ControlPlaneClient } from '../client/control-plane.client';
import { ChatController } from './chat.controller';
import { StreamEventType } from '../modules/react-engine/interfaces';

describe('ChatController control-plane integration', () => {
  const createController = () => {
    const controlPlaneClient = {
      getExecution: jest.fn(),
      getExecutionSteps: jest.fn(),
      submitExecutionInput: jest.fn(),
      createExecution: jest.fn(),
      streamExecutionEvents: jest.fn(),
    };
    const modelService = {
      stripThinkingTags: jest.fn((value: string) => value),
    };
    const recognizerService = {};
    const reactEngineService = {
      execute: jest.fn(),
    };
    const sessionService = {
      getChatSession: jest.fn(),
      appendChatMessages: jest.fn(),
    };
    const plannerService = {
      generatePlan: jest.fn(),
    };
    const promptDebugSettingsService = {
      isPromptDebugEnabled: jest.fn(() => false),
    };

    const controller = new ChatController(
      controlPlaneClient as unknown as ControlPlaneClient,
      modelService as any,
      recognizerService as any,
      reactEngineService as any,
      sessionService as any,
      plannerService as any,
      promptDebugSettingsService as any,
    );

    return {
      controller,
      controlPlaneClient,
      plannerService,
    };
  };

  it('submits waiting_input payload through control-plane client and resumes observation', async () => {
    const { controller, controlPlaneClient } = createController();

    controlPlaneClient.getExecution.mockResolvedValue({
      skillId: 'skill-1',
      status: 'waiting_input',
      normalizedInput: {
        objective: 'Collect user info',
        requiredInputs: [
          {
            name: 'url',
            missing: true,
          },
        ],
      },
    });
    controlPlaneClient.getExecutionSteps.mockResolvedValue([
      {
        id: 'step-1',
        status: 'waiting_input',
        type: 'input_collection',
      },
    ]);
    controlPlaneClient.submitExecutionInput.mockResolvedValue({
      id: 'execution-1',
    });

    jest.spyOn(controller as any, 'observeExecution').mockImplementation(async function* () {
      yield {
        type: StreamEventType.RESULT,
        content: '任务继续执行',
        data: {
          executionId: 'execution-1',
          status: 'running',
        },
      };
    });

    const events: Array<{ type: StreamEventType; content: string }> = [];
    for await (const event of (controller as any).handleTaskMode(
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
      'Bearer token-1',
    )) {
      events.push({ type: event.type, content: event.content });
    }

    expect(controlPlaneClient.getExecution).toHaveBeenCalledWith(
      'execution-1',
      {
        authToken: 'Bearer token-1',
        user: {
          userId: 'user-1',
          userRoles: ['employee'],
        },
      },
    );
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
      },
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

  it('returns immediate waiting_input state without opening event stream', async () => {
    const { controller, controlPlaneClient } = createController();

    controlPlaneClient.getExecution.mockResolvedValue({
      id: 'execution-2',
      status: 'waiting_input',
      normalizedInput: {
        requiredInputs: [
          {
            name: 'url',
            missing: true,
          },
        ],
      },
      usage: { total_tokens: 12 },
    });

    const events = [];
    for await (const event of (controller as any).observeExecution(
      'execution-2',
      'Bearer token-2',
      {
        userId: 'user-2',
        userRoles: ['employee'],
      },
    )) {
      events.push(event);
    }

    expect(controlPlaneClient.streamExecutionEvents).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        type: StreamEventType.WAITING_INPUT,
        content: '任务需要你补充信息后才能继续执行。\n\n缺少参数：url\n\n执行单 ID: execution-2',
        data: {
          executionId: 'execution-2',
          status: 'waiting_input',
          hasBusinessResult: false,
          missingInputs: [{ name: 'url', missing: true }],
          usage: { total_tokens: 12 },
        },
      },
    ]);
  });

  it('returns immediate pending_approval state without opening event stream', async () => {
    const { controller, controlPlaneClient } = createController();

    controlPlaneClient.getExecution.mockResolvedValue({
      id: 'execution-4',
      status: 'pending_approval',
      approvalStatus: 'pending',
      usage: { total_tokens: 8 },
    });

    const events = [];
    for await (const event of (controller as any).observeExecution(
      'execution-4',
      'Bearer token-4',
      {
        userId: 'user-4',
        userRoles: ['employee'],
      },
    )) {
      events.push(event);
    }

    expect(controlPlaneClient.streamExecutionEvents).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        type: StreamEventType.RESULT,
        content: '任务需要审批后才能继续执行。\n\n当前审批状态: pending\n执行单 ID: execution-4',
        data: {
          executionId: 'execution-4',
          status: 'pending_approval',
          approvalStatus: 'pending',
          hasBusinessResult: false,
          usage: { total_tokens: 8 },
        },
      },
    ]);
  });

  it('maps streamed events and stops on terminal status change', async () => {
    const { controller, controlPlaneClient } = createController();

    controlPlaneClient.getExecution
      .mockResolvedValueOnce({
        id: 'execution-3',
        status: 'running',
      })
      .mockResolvedValueOnce({
        id: 'execution-3',
        status: 'succeeded',
        result: {
          finalAnswer: '任务已完成',
        },
        usage: { total_tokens: 20 },
      });
    controlPlaneClient.streamExecutionEvents.mockResolvedValue(
      Readable.from([
        `data: ${JSON.stringify({
          executionId: 'execution-3',
          eventType: 'step.started',
          payload: {
            stepId: 'step-1',
            action: 'goto',
          },
        })}\n`,
        `data: ${JSON.stringify({
          executionId: 'execution-3',
          eventType: 'execution.status_changed',
          payload: {
            newStatus: 'succeeded',
          },
        })}\n`,
      ]),
    );

    const events = [];
    for await (const event of (controller as any).observeExecution(
      'execution-3',
      'Bearer token-3',
      {
        userId: 'user-3',
        userRoles: ['employee'],
      },
    )) {
      events.push(event);
    }

    expect(controlPlaneClient.streamExecutionEvents).toHaveBeenCalledWith(
      'execution-3',
      {
        authToken: 'Bearer token-3',
        user: {
          userId: 'user-3',
          userRoles: ['employee'],
        },
      },
    );
    expect(events).toEqual([
      {
        type: StreamEventType.ACTION,
        content: '正在执行: goto',
        data: { stepId: 'step-1' },
      },
      {
        type: StreamEventType.RESULT,
        content: '任务已完成',
        data: {
          executionId: 'execution-3',
          status: 'succeeded',
          result: {
            finalAnswer: '任务已完成',
          },
          downloadUrl: undefined,
          hasBusinessResult: true,
          usage: { total_tokens: 20 },
        },
      },
    ]);
  });

  it('rejects anonymous task mode for non-streaming chat before planning', async () => {
    const { controller, controlPlaneClient, plannerService } = createController();

    const result = await controller.chat(
      {
        message: '上海的天气',
        config: { mode: 'task' },
        sessionId: 'session-anon-1',
      } as any,
      {
        headers: {},
      } as any,
    );

    expect(result).toEqual({
      response: '任务模式需要登录后使用，请重新登录后重试。',
      events: [
        {
          type: StreamEventType.ERROR,
          content: '任务模式需要登录后使用，请重新登录后重试。',
          data: {
            errorCode: 'AUTH_LOGIN_REQUIRED',
            statusCode: 401,
            traceId: expect.any(String),
          },
        },
      ],
    });
    expect(plannerService.generatePlan).not.toHaveBeenCalled();
    expect(controlPlaneClient.createExecution).not.toHaveBeenCalled();
  });

  it('rejects anonymous task mode for streaming chat before planning', async () => {
    const { controller, controlPlaneClient, plannerService } = createController();
    const res = {
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };

    await controller.chatStream(
      {
        message: '上海的天气',
        config: { mode: 'task' },
        sessionId: 'session-anon-2',
      } as any,
      {
        headers: {},
      } as any,
      res as any,
    );

    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.write.mock.calls[0][0]).toContain('"type":"error"');
    expect(res.write.mock.calls[0][0]).toContain('任务模式需要登录后使用，请重新登录后重试。');
    expect(res.write.mock.calls[0][0]).toContain('"errorCode":"AUTH_LOGIN_REQUIRED"');
    expect(res.end).toHaveBeenCalled();
    expect(plannerService.generatePlan).not.toHaveBeenCalled();
    expect(controlPlaneClient.createExecution).not.toHaveBeenCalled();
  });
});
