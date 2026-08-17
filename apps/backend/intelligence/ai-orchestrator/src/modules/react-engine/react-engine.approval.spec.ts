import { ReActEngineService } from './react-engine.service';
import {
  CapabilitySnapshot,
  ExecutionContext,
  ReActState,
  StreamEventType,
  ToolDefinition,
} from './interfaces';
import { PromptDebugSettingsService } from '../debug-settings/prompt-debug-settings.service';

describe('ReActEngineService approval resume', () => {
  it('resumes the blocked action when approval is granted without a new message', async () => {
    const capabilitySnapshot: CapabilitySnapshot = {
      userId: 'user-1',
      sessionId: 'session-1',
      roles: ['admin'],
      mode: 'task',
      selectedSkillId: 'skill-1',
      skillScopedToolNames: ['api_call'],
      deniedToolNames: [],
      visibleTools: [
        {
          name: 'api_call',
          description: '调用外部 API',
          category: 'execution',
          requiresApproval: true,
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          exposure: 'prompt_and_runtime',
        },
      ],
      visibleSkills: [
        {
          skillId: 'skill-1',
          skillName: '测试技能',
          triggerKeywords: [],
          paramsSchema: {
            properties: {},
            required: [],
          },
          executionType: 'flow',
        },
      ],
      constraints: {
        disallowToolNames: [],
        disallowSkillIds: [],
        forceSkillBoundExecution: true,
        forbidExternalApiInTaskMode: true,
        maxVisibleSkills: 20,
      },
      policies: {
        requireConfirmToolNames: [],
        requireApprovalToolNames: ['api_call'],
        requireHumanReviewOnWrite: true,
        documentTemplateClarificationEnabled: true,
      },
      generatedAt: new Date().toISOString(),
      version: 'test',
    };

    const savedState: ReActState = {
      thought: '准备调用 api_call',
      action: 'api_call',
      actionInput: {},
      observation: '工具 "api_call" 需要审批后才能执行，当前请求未携带审批通过状态。',
      iteration: 1,
      maxIterations: 5,
      isFinished: false,
      isWaitingForUserInput: true,
      lastToolResult: {
        success: false,
        output: '工具 "api_call" 需要审批后才能执行，当前请求未携带审批通过状态。',
        code: 'tool_requires_approval',
        severity: 'error',
        requiresUserInput: true,
        userInputPrompt: '请先完成工具 "api_call" 的审批，再继续执行。',
        data: {
          error: 'tool_requires_approval',
          toolName: 'api_call',
        },
        meta: {
          toolName: 'api_call',
        },
      },
      retryState: {},
    };

    const toolDefinition: ToolDefinition = {
      name: 'api_call',
      description: '调用外部 API',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      validateParams: () => ({ valid: true, missing: [] }),
      execute: jest.fn() as any,
    };

    const modelService = {} as any;
    const toolExecutor = {
      loadDynamicFlowTools: jest.fn().mockResolvedValue(undefined),
      getTools: jest.fn().mockReturnValue([toolDefinition]),
      executeToolStream: jest.fn().mockResolvedValue({
        type: StreamEventType.OBSERVATION,
        content: '审批已通过，API 调用执行完成',
        data: {
          tool: 'api_call',
          result: {
            success: true,
            output: '审批已通过，API 调用执行完成',
            code: 'api_done',
            severity: 'info',
            data: {
              taskComplete: true,
              finalAnswer: '审批已通过，API 调用执行完成',
            },
          },
          success: true,
          code: 'api_done',
          severity: 'info',
        },
        iteration: 2,
      }),
    } as any;
    const sessionService = {
      getSession: jest.fn().mockResolvedValue({
        state: savedState,
        history: [],
        context: {
          capabilitySnapshot,
          approvedToolNames: [],
        },
      }),
      saveSession: jest.fn().mockResolvedValue(undefined),
      deleteSession: jest.fn().mockResolvedValue(undefined),
    } as any;
    const capabilityResolver = {
      resolveIfNeeded: jest.fn().mockResolvedValue(capabilitySnapshot),
    } as any;
    const modelRouterService = {
      resolveInitialModel: jest.fn().mockReturnValue({
        modelId: 'default',
        attemptedModelIds: ['default'],
        reason: 'test',
      }),
    } as any;

    const service = new ReActEngineService(
      modelService,
      toolExecutor,
      sessionService,
      capabilityResolver,
      modelRouterService,
      new PromptDebugSettingsService()
    );

    const context: ExecutionContext = {
      sessionId: 'session-1',
      userId: 'user-1',
      userRoles: ['admin'],
      history: [],
    };

    const events = [];
    for await (const event of service.execute(
      {
        message: '',
        sessionId: 'session-1',
        approvedToolNames: ['api_call'],
      },
      context
    )) {
      events.push(event);
    }

    expect(toolExecutor.executeToolStream).toHaveBeenCalledWith(
      'api_call',
      {},
      expect.objectContaining({
        approvedToolNames: ['api_call'],
      }),
      2
    );
    expect(sessionService.deleteSession).toHaveBeenCalledWith('session-1');
    expect(events.some((event) => event.type === StreamEventType.RESULT)).toBe(true);
    expect(events.at(-1)?.content).toContain('审批已通过，API 调用执行完成');
  });
});
