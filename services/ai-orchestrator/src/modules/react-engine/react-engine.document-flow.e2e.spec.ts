import axios from 'axios';
import { ReActEngineService } from './react-engine.service';
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
      getClient: jest.fn().mockReturnValue({
        updateConfig: jest.fn(),
        chatCompletion: jest.fn().mockResolvedValue(
          'Thought: 先执行文档入口\nAction: document_intake\nAction Input: {"userInput":"生成合同，甲方A，乙方B"}',
        ),
      }),
    } as unknown as ModelService;

    const sessionService = {
      getSession: jest.fn().mockResolvedValue(null),
      saveSession: jest.fn().mockResolvedValue(undefined),
      deleteSession: jest.fn().mockResolvedValue(undefined),
    } as unknown as SessionService;

    const service = new ReActEngineService(
      modelService,
      new ToolExecutor(),
      sessionService,
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

    const actions = events
      .filter((event) => event.type === StreamEventType.ACTION)
      .map((event) => event.content);
    expect(actions).toContain('document_param_recover');

    expect(mockedAxios.post).toHaveBeenCalledTimes(4);
    expect(sessionService.deleteSession).toHaveBeenCalledWith('s-1');
  });
});
