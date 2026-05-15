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
    const recognizerService = {
      recognizeParams: jest.fn(),
    };
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
      recognizerService,
      plannerService,
    };
  };

  it('submits waiting_input payload through control-plane client and resumes observation', async () => {
    const { controller, controlPlaneClient } = createController();

    controlPlaneClient.getExecution
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        id: 'execution-1',
        status: 'running',
      });
    controlPlaneClient.getExecutionSteps.mockResolvedValue([
      {
        id: 'step-1',
        status: 'waiting_input',
        type: 'input_collection',
        inputJson: {
          requiredInputs: [
            {
              name: 'url',
              description: '待处理链接',
              missing: true,
            },
          ],
        },
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

  it('reports resolved and remaining fields when waiting_input is only partially filled', async () => {
    const { controller, controlPlaneClient } = createController();

    controlPlaneClient.getExecution
      .mockResolvedValueOnce({
        id: 'execution-partial-1',
        skillId: 'skill-contract',
        status: 'waiting_input',
        normalizedInput: {
          objective: '生成采购合同',
          requiredInputs: [
            { name: 'info.partyA', missing: true },
            { name: 'info.partyB', missing: true },
          ],
        },
      })
      .mockResolvedValueOnce({
        id: 'execution-partial-1',
        status: 'waiting_input',
      });
    controlPlaneClient.getExecutionSteps
      .mockResolvedValueOnce([
        {
          id: 'step-partial-1',
          status: 'waiting_input',
          type: 'input_collection',
          inputJson: {
            requiredInputs: [
              {
                name: 'info.partyA',
                description: '甲方名称',
                missing: true,
              },
              {
                name: 'info.partyB',
                description: '乙方名称',
                missing: true,
              },
            ],
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'step-partial-1',
          status: 'waiting_input',
          type: 'input_collection',
          inputJson: {
            requiredInputs: [
              {
                name: 'info.partyB',
                description: '乙方名称',
                missing: true,
              },
            ],
          },
        },
      ]);
    controlPlaneClient.submitExecutionInput.mockResolvedValue({
      id: 'execution-partial-1',
      status: 'waiting_input',
    });

    const events: Array<{ type: StreamEventType; content: string }> = [];
    for await (const event of (controller as any).handleTaskMode(
      {
        message: '{"info.partyA":"星海智造科技有限公司"}',
        executionId: 'execution-partial-1',
      },
      {
        sessionId: 'session-partial-1',
        userId: 'user-partial-1',
        userRoles: ['employee'],
        traceId: 'trace-partial-1',
        history: [],
        executionId: 'execution-partial-1',
      },
      'Bearer token-partial-1',
    )) {
      events.push({ type: event.type, content: event.content });
    }

    expect(events).toEqual([
      {
        type: StreamEventType.THOUGHT,
        content: '正在提交您补充的信息...',
      },
      {
        type: StreamEventType.THOUGHT,
        content: '已提交补充信息。\n\n本次识别到 1 个字段：info.partyA\n\n仍缺少 1 个字段：info.partyB\n\n已保留当前执行单，请继续补充剩余信息。\n\n执行单 ID: execution-partial-1',
      },
      {
        type: StreamEventType.WAITING_INPUT,
        content: '任务需要你补充信息后才能继续执行。\n\n缺少参数：乙方名称\n\n执行单 ID: execution-partial-1',
      },
    ]);
  });

  it('passes document guide context into recognizer during waiting_input resume', async () => {
    const { controller, controlPlaneClient, recognizerService } = createController();

    controlPlaneClient.getExecution
      .mockResolvedValueOnce({
        id: 'execution-doc-1',
        skillId: 'skill-doc-1',
        status: 'waiting_input',
        normalizedInput: {
          objective: '生成采购合同',
          requiredInputs: [
            { name: 'info.partyA', missing: true },
          ],
        },
      })
      .mockResolvedValueOnce({
        id: 'execution-doc-1',
        status: 'running',
      });
    controlPlaneClient.getExecutionSteps.mockResolvedValue([
      {
        id: 'step-doc-1',
        status: 'waiting_input',
        type: 'input_collection',
        inputJson: {
          requiredInputs: [
            {
              name: 'info.partyA',
              description: '甲方名称',
              missing: true,
            },
          ],
        },
      },
    ]);
    controlPlaneClient.submitExecutionInput.mockResolvedValue({
      id: 'execution-doc-1',
      status: 'running',
    });
    recognizerService.recognizeParams.mockResolvedValue({
      params: {
        'info.partyA': '星海智造科技有限公司',
      },
      confidence: 0.93,
    });

    jest.spyOn(controller as any, 'loadSkillSchema').mockResolvedValue({
      name: '采购合同渲染',
      paramsSchema: {
        properties: {
          'info.partyA': {
            type: 'string',
            description: '甲方名称',
          },
        },
        required: ['info.partyA'],
      },
      guideContext: {
        mode: 'document_skill',
        templateOverview: '这是一个采购合同文档模板。',
        paramCollectionGuidance: '优先识别合同主体信息。',
        outputExample: {
          info: {
            partyA: '星海智造科技有限公司',
          },
        },
      },
    });
    jest.spyOn(controller as any, 'observeExecution').mockImplementation(async function* () {
      yield {
        type: StreamEventType.RESULT,
        content: '任务继续执行',
      };
    });

    const events: Array<{ type: StreamEventType; content: string }> = [];
    for await (const event of (controller as any).handleTaskMode(
      {
        message: '甲方是星海智造科技有限公司',
        executionId: 'execution-doc-1',
      },
      {
        sessionId: 'session-doc-1',
        userId: 'user-doc-1',
        userRoles: ['employee'],
        traceId: 'trace-doc-1',
        history: [],
        executionId: 'execution-doc-1',
      },
      'Bearer token-doc-1',
    )) {
      events.push({ type: event.type, content: event.content });
    }

    expect(recognizerService.recognizeParams).toHaveBeenCalledWith(
      expect.objectContaining({
        template_id: 'skill-doc-1',
        guide_context: expect.objectContaining({
          mode: 'document_skill',
          templateOverview: expect.stringContaining('采购合同'),
          paramCollectionGuidance: expect.stringContaining('合同主体'),
        }),
      }),
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
      usage: { total_tokens: 12 },
    });
    controlPlaneClient.getExecutionSteps.mockResolvedValue([
      {
        id: 'step-input-2',
        type: 'input_collection',
        status: 'waiting_input',
        inputJson: {
          requiredInputs: [
            {
              name: 'partyA',
              description: '甲方公司名称',
              missing: true,
            },
          ],
        },
      },
    ]);

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
        content: '任务需要你补充信息后才能继续执行。\n\n缺少参数：甲方公司名称\n\n执行单 ID: execution-2',
        data: {
          executionId: 'execution-2',
          status: 'waiting_input',
          hasBusinessResult: false,
          missingInputs: [{
            name: 'partyA',
            description: '甲方公司名称',
            group_label: undefined,
            display_name: undefined,
            missing: true,
            needs_confirmation: false,
          }],
          semantic: undefined,
          usage: { total_tokens: 12 },
        },
      },
    ]);
  });

  it('prefers semantic groupedMissing when waiting_input execution contains business-group summary', async () => {
    const { controller, controlPlaneClient } = createController();

    controlPlaneClient.getExecution.mockResolvedValue({
      id: 'execution-semantic-1',
      status: 'waiting_input',
      usage: { total_tokens: 18 },
      semantic: {
        mode: 'complex_document',
        previewReady: false,
        finalReady: false,
        summary: '文档仍缺少 2 个关键业务组。',
        groupedMissing: [
          {
            key: 'items',
            label: '标的清单',
            kind: 'array_group',
            blocking: true,
            required: true,
            missingFieldNames: ['items[].deviceName', 'items[].quantity'],
          },
          {
            key: 'deliveryItems',
            label: '交付计划',
            kind: 'array_group',
            blocking: true,
            required: true,
            missingFieldNames: ['deliveryItems[].date'],
          },
        ],
      },
    });
    controlPlaneClient.getExecutionSteps.mockResolvedValue([
      {
        id: 'step-input-semantic-1',
        type: 'input_collection',
        status: 'waiting_input',
        inputJson: {
          requiredInputs: [
            {
              name: 'items[].deviceName',
              description: '设备名称',
              missing: true,
            },
            {
              name: 'deliveryItems[].date',
              description: '交付日期',
              missing: true,
            },
          ],
        },
      },
    ]);

    const events = [];
    for await (const event of (controller as any).observeExecution(
      'execution-semantic-1',
      'Bearer token-semantic',
      {
        userId: 'user-semantic',
        userRoles: ['employee'],
      },
    )) {
      events.push(event);
    }

    expect(controlPlaneClient.streamExecutionEvents).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        type: StreamEventType.WAITING_INPUT,
        content: '任务需要你补充信息后才能继续执行。\n\n文档仍缺少 2 个关键业务组。\n\n缺少业务组：标的清单、交付计划\n\n字段兜底：设备名称、交付日期\n\n可预览：否；可正式生成：否\n\n执行单 ID: execution-semantic-1',
        data: {
          executionId: 'execution-semantic-1',
          status: 'waiting_input',
          hasBusinessResult: false,
          missingInputs: [
            {
              name: 'items[].deviceName',
              description: '设备名称',
              group_label: undefined,
              display_name: undefined,
              missing: true,
              needs_confirmation: false,
            },
            {
              name: 'deliveryItems[].date',
              description: '交付日期',
              group_label: undefined,
              display_name: undefined,
              missing: true,
              needs_confirmation: false,
            },
          ],
          semantic: {
            mode: 'complex_document',
            previewReady: false,
            finalReady: false,
            summary: '文档仍缺少 2 个关键业务组。',
            groupedMissing: [
              {
                key: 'items',
                label: '标的清单',
                kind: 'array_group',
                blocking: true,
                required: true,
                missingFieldNames: ['items[].deviceName', 'items[].quantity'],
              },
              {
                key: 'deliveryItems',
                label: '交付计划',
                kind: 'array_group',
                blocking: true,
                required: true,
                missingFieldNames: ['deliveryItems[].date'],
              },
            ],
          },
          usage: { total_tokens: 18 },
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
