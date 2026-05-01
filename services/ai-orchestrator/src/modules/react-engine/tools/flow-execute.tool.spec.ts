import axios from 'axios';
import { FlowExecuteTool } from './flow-execute.tool';
import { ExecutionContext } from '../interfaces';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FlowExecuteTool', () => {
  const baseContext: ExecutionContext = {
    sessionId: 'session-1',
    userId: 'user-1',
    history: [],
    skill: {
      skillId: 'skill-1',
      skillName: '测试技能',
      matchedKeywords: [],
      confidence: 1,
      collectedParams: {},
      missingParams: [],
      paramsSchema: {
        properties: {},
        required: [],
      },
    },
    selectedSkillToolNames: ['flow_execute'],
    capabilitySnapshot: {
      userId: 'user-1',
      sessionId: 'session-1',
      roles: ['admin'],
      mode: 'task',
      selectedSkillId: 'skill-1',
      skillScopedToolNames: ['flow_execute'],
      deniedToolNames: [],
      visibleTools: [
        {
          name: 'flow_execute',
          description: '执行流程',
          category: 'flow',
          requiresApproval: false,
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          exposure: 'prompt_and_runtime',
        },
        {
          name: 'api_call',
          description: 'API 调用',
          category: 'execution',
          requiresApproval: false,
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
          executionFlowTemplateIds: ['tpl-1'],
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
        requireApprovalToolNames: [],
        requireHumanReviewOnWrite: true,
        documentTemplateClarificationEnabled: true,
      },
      generatedAt: new Date().toISOString(),
      version: 'test',
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects tool step outside selected skill scope', async () => {
    const tool = new FlowExecuteTool();
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        name: '测试流程',
        steps: [
          {
            id: 'step-tool',
            type: 'tool',
            name: '调用外部 API 工具',
            tool: {
              name: 'api_call',
              params: {},
            },
          },
        ],
      },
    } as any);

    const result = await tool.execute({ templateId: 'tpl-1' }, baseContext);

    expect(result.success).toBe(false);
    expect(result.code).toBe('tool_not_bound_to_skill');
    expect(result.data?.toolName).toBe('api_call');
  });

  it('rejects api step when api_call is outside selected skill scope', async () => {
    const tool = new FlowExecuteTool();
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        name: '测试流程',
        steps: [
          {
            id: 'step-api',
            type: 'api',
            name: '直接 API 步骤',
            api: {
              endpoint: 'https://example.com/test',
              method: 'GET',
            },
          },
        ],
      },
    } as any);

    const result = await tool.execute({ templateId: 'tpl-1' }, baseContext);

    expect(result.success).toBe(false);
    expect(result.code).toBe('tool_not_bound_to_skill');
    expect(result.data?.toolName).toBe('api_call');
  });

  it('rejects api step when api_call requires approval', async () => {
    const tool = new FlowExecuteTool();
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        name: '测试流程',
        steps: [
          {
            id: 'step-api',
            type: 'api',
            name: '直接 API 步骤',
            api: {
              endpoint: 'https://example.com/test',
              method: 'GET',
            },
          },
        ],
      },
    } as any);

    const context: ExecutionContext = {
      ...baseContext,
      selectedSkillToolNames: ['flow_execute', 'api_call'],
      capabilitySnapshot: {
        ...baseContext.capabilitySnapshot!,
        skillScopedToolNames: ['flow_execute', 'api_call'],
        visibleTools: [
          baseContext.capabilitySnapshot!.visibleTools[0]!,
          {
            ...baseContext.capabilitySnapshot!.visibleTools[1]!,
            requiresApproval: true,
          },
        ],
        policies: {
          ...baseContext.capabilitySnapshot!.policies,
          requireApprovalToolNames: ['api_call'],
        },
      },
    };

    const result = await tool.execute({ templateId: 'tpl-1' }, context);

    expect(result.success).toBe(false);
    expect(result.code).toBe('tool_requires_approval');
    expect(result.data?.toolName).toBe('api_call');
  });

  it('rejects tool step when target tool requires approval', async () => {
    const tool = new FlowExecuteTool();
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        name: '测试流程',
        steps: [
          {
            id: 'step-tool',
            type: 'tool',
            name: '调用外部 API 工具',
            tool: {
              name: 'api_call',
              params: {},
            },
          },
        ],
      },
    } as any);

    const context: ExecutionContext = {
      ...baseContext,
      selectedSkillToolNames: ['flow_execute', 'api_call'],
      capabilitySnapshot: {
        ...baseContext.capabilitySnapshot!,
        skillScopedToolNames: ['flow_execute', 'api_call'],
        visibleTools: [
          baseContext.capabilitySnapshot!.visibleTools[0]!,
          {
            ...baseContext.capabilitySnapshot!.visibleTools[1]!,
            requiresApproval: true,
          },
        ],
        policies: {
          ...baseContext.capabilitySnapshot!.policies,
          requireApprovalToolNames: ['api_call'],
        },
      },
    };

    const result = await tool.execute({ templateId: 'tpl-1' }, context);

    expect(result.success).toBe(false);
    expect(result.code).toBe('tool_requires_approval');
    expect(result.data?.toolName).toBe('api_call');
  });

  it('allows api step after api_call approval is granted', async () => {
    const tool = new FlowExecuteTool();
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        name: '测试流程',
        steps: [
          {
            id: 'step-api',
            type: 'api',
            name: '直接 API 步骤',
            api: {
              endpoint: 'https://example.com/test',
              method: 'GET',
            },
          },
        ],
      },
    } as any);
    (mockedAxios as unknown as jest.Mock).mockResolvedValueOnce({
      data: {
        ok: true,
      },
    } as any);

    const context: ExecutionContext = {
      ...baseContext,
      selectedSkillToolNames: ['flow_execute', 'api_call'],
      approvedToolNames: ['api_call'],
      capabilitySnapshot: {
        ...baseContext.capabilitySnapshot!,
        skillScopedToolNames: ['flow_execute', 'api_call'],
        visibleTools: [
          baseContext.capabilitySnapshot!.visibleTools[0]!,
          {
            ...baseContext.capabilitySnapshot!.visibleTools[1]!,
            requiresApproval: true,
          },
        ],
        policies: {
          ...baseContext.capabilitySnapshot!.policies,
          requireApprovalToolNames: ['api_call'],
        },
      },
    };

    const result = await tool.execute({ templateId: 'tpl-1' }, context);

    expect(result.success).toBe(true);
    expect(result.code).toBe('flow_step_completed');
  });
});
