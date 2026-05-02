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

describe('ReActEngineService Document Flow E2E', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs document intake -> render fail -> param recover -> render success end-to-end', async () => {
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url.includes('/execution-flow-templates')) {
        return { data: { templates: [] } } as any;
      }
      if (url.includes('/report-templates')) {
        return {
          data: {
            templates: [
              {
                id: 'tpl-1',
                name: '合同模板',
              },
            ],
          },
        } as any;
      }
      return { data: {} } as any;
    });

    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          success: true,
          generatedData: { partyA: '甲方A', partyB: '乙方B' },
        },
      } as any)
      .mockRejectedValueOnce(new Error('validation failed'))
      .mockResolvedValueOnce({
        data: {
          success: true,
          generatedData: { partyA: '甲方A', partyB: '乙方B', signedAt: '2026-04-28' },
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          downloadUrl: '/studio/download/doc-1',
          fileName: 'contract.docx',
          format: 'docx',
        },
      } as any);

    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        skills: [
          {
            id: 'skill-1',
            name: '合同文档生成',
            description: '生成合同文档',
            triggerKeywords: ['合同', '文档'],
            paramsSchema: { properties: {}, required: [] },
            carboneTemplateId: 'tpl-1',
            carboneSkillId: 'carbone-skill-1',
            executionFlowTemplateIds: [],
            executionFlow: [],
          },
        ],
      }),
    });

    const modelService = {
      getClient: jest.fn((id: string) => {
        if (id === 'doc-model' || id === 'default') {
          return {
            updateConfig: jest.fn(),
            chatCompletion: jest.fn().mockResolvedValue(
              'Thought: 先执行文档入口\nAction: document_intake\nAction Input: {"userInput":"生成合同，甲方A，乙方B"}',
            ),
          };
        }
        return null;
      }),
      getFallbackModelIds: jest.fn().mockReturnValue(['default']),
      listActiveModelsForRouting: jest.fn().mockReturnValue([
        {
          id: 'doc-model',
          name: 'gpt-4o',
          provider: 'openai',
          api_endpoint: 'https://example.com',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          config: {
            description: '多模态模型',
            input: ['text', 'image'],
          },
        },
        {
          id: 'default',
          name: 'abab6.5s-chat',
          provider: 'minimax',
          api_endpoint: 'https://example.com',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date(),
          config: {
            description: '对话模型',
            default: true,
          },
        },
      ]),
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
      message: '生成合同，甲方A，乙方B',
      sessionId: 's-1',
      userId: 'u-1',
      userRoles: ['admin'],
    };

    const context: ExecutionContext = {
      sessionId: 's-1',
      userId: 'u-1',
      history: [],
    };

    const events = [];
    for await (const event of service.execute(request, context)) {
      events.push(event);
    }

    const resultEvent = events.find((event) => event.type === StreamEventType.RESULT);
    expect(resultEvent).toBeDefined();
    const resultContent = resultEvent?.content || '';
    expect(resultContent).toContain('文档生成成功');
    expect(resultContent).toContain('/studio/download/doc-1');
    expect(resultEvent?.data?.code).toBe('document_render_completed');
    expect(resultEvent?.data?.severity).toBe('info');

    const actions = events
      .filter((event) => event.type === StreamEventType.ACTION)
      .map((event) => ({
        content: event.content,
        routing: event.data?.routing,
      }));
    expect(actions.map((item) => item.content)).toContain('document_param_recover');
    expect(actions[0]?.routing).toMatchObject({
      modelId: 'doc-model',
      attemptedModelIds: ['doc-model'],
      routingReason: 'task_type_document',
    });

    const renderObservation = events.find((event) => {
      return event.type === StreamEventType.OBSERVATION
        && event.data?.tool === 'document_render'
        && event.data?.code === 'param_validation_failed';
    });
    expect(renderObservation).toBeDefined();
    expect(renderObservation?.data?.severity).toBe('error');
    expect(renderObservation?.data?.routing).toMatchObject({
      modelId: 'doc-model',
      attemptedModelIds: ['doc-model'],
      routingReason: 'task_type_document',
    });
    expect((renderObservation?.data?.result as Record<string, unknown> | undefined)?.data).toMatchObject({
      errorCategory: 'tool_runtime_error',
      parameterIssue: true,
    });
    expect(resultEvent?.data?.routing).toMatchObject({
      modelId: 'doc-model',
      attemptedModelIds: ['doc-model'],
      routingReason: 'task_type_document',
    });

    expect(mockedAxios.post).toHaveBeenCalledTimes(4);
    expect(sessionService.deleteSession).toHaveBeenCalledWith('s-1');
  });
});
