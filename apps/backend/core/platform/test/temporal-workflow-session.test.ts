import axios from 'axios';
import { TemporalWorkflowActivityResolutionService } from '../src/modules/temporal-workflow/temporal-workflow-activity-resolution.service';
import { TemporalWorkflowBrowserDraftService } from '../src/modules/temporal-workflow/browser-bridge/temporal-workflow-browser-draft.service';
import { TemporalWorkflowCodegenService } from '../src/modules/temporal-workflow/temporal-workflow-codegen.service';
import { ActivityCodegenService } from '../src/modules/temporal-workflow/temporal-activity-codegen.service';
import { TemporalWorkflowService } from '../src/modules/temporal-workflow/temporal-workflow.service';
import { TemporalWorkflowArtifactService } from '../src/workflow-registry/workflow-template/temporal-workflow-artifact.service';
import { TemporalWorkflowConfigOrchestrationService } from '../src/workflow-registry/workflow-template/temporal-workflow-config-orchestration.service';
import { TemporalWorkflowConfigService } from '../src/workflow-registry/workflow-template/temporal-workflow-config.service';
import { TemporalWorkflowDraftOrchestrationService } from '../src/workflow-registry/workflow-template/temporal-workflow-draft-orchestration.service';
import { TemporalWorkflowManagementService } from '../src/workflow-registry/workflow-template/temporal-workflow-management.service';
import { TemporalWorkflowSessionOrchestrationService } from '../src/workflow-registry/workflow-template/temporal-workflow-session-orchestration.service';
import { TemporalWorkflowSessionSupportFactoryService } from '../src/workflow-registry/workflow-template/temporal-workflow-session-support-factory.service';
import { TemporalWorkflowTemplateService } from '../src/workflow-registry/workflow-template/temporal-workflow-template.service';
import { buildDeterministicWorkflowCodeForWorkflow } from '../src/modules/temporal-workflow/temporal-workflow-deterministic-builder';
import { TemporalWorkflowAiDraftService } from '../src/modules/temporal-workflow/temporal-workflow-draft.service';
import {
  buildGenericAiDraftSampleValue,
  inferWorkflowInputParamType,
  normalizeAiDraftStepInput,
  normalizeDraftInputParams,
} from '../src/modules/temporal-workflow/temporal-workflow-draft.normalizers';
import { repairCommonDraftPlanIssues } from '../src/modules/temporal-workflow/temporal-workflow-draft-plan.helpers';
import { TemporalWorkflowNormalizationService } from '../src/modules/temporal-workflow/temporal-workflow-normalization.service';
import { pickFirstNonEmptyString } from '../src/modules/temporal-workflow/temporal-workflow-json.utils';
import { TemporalWorkflowSessionService } from '../src/modules/temporal-workflow/temporal-workflow-session.service';
import { TemporalWorkflowSupportService } from '../src/modules/temporal-workflow/temporal-workflow-support.service';
import {
  buildTemplateWorkflowParamSeeds,
  normalizeWorkflowInputParamType,
  normalizeWorkflowInputRenderPath,
} from '../src/modules/temporal-workflow/temporal-workflow-template.helpers';
import { TemporalWorkflowValidationFacadeService } from '../src/modules/temporal-workflow/temporal-workflow-validation-facade.service';
import { TemporalWorkflowValidationService } from '../src/modules/temporal-workflow/temporal-workflow-validation.service';
import { TemporalWorkflowArtifactValidationService } from '../src/workflow-registry/validation/temporal-workflow-artifact-validation.service';
import { TemporalWorkflowValidationContractService } from '../src/workflow-registry/validation/temporal-workflow-validation-contract.service';
import { TemporalWorkflowDslValidationService } from '../src/workflow-registry/validation/temporal-workflow-dsl-validation.service';
import { TemporalWorkflowCodegenOrchestrationService } from '../src/workflow-registry/codegen/temporal-workflow-codegen-orchestration.service';
import { BuiltinActivityRegistry } from '../src/modules/temporal-workflow/builtin-activity.registry';

jest.mock('axios');

describe('TemporalWorkflowSessionService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const createService = () => {
    const prisma = {
      temporalWorkflow: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      chatSession: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      activity: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
      skillConfig: {
        findUnique: jest.fn(),
      },
    };

    const builtinRegistry = new BuiltinActivityRegistry();
    const workflowNormalizationService = new TemporalWorkflowNormalizationService(
      prisma as any,
      builtinRegistry
    );
    const aiDraftService = new TemporalWorkflowAiDraftService(prisma as any, builtinRegistry);
    const browserDraftService = new TemporalWorkflowBrowserDraftService();
    const codegenService = new TemporalWorkflowCodegenService();
    const sessionService = new TemporalWorkflowSessionService(
      prisma as any,
      workflowNormalizationService
    );
    const validationService = new TemporalWorkflowValidationService();
    const activityResolutionService = new TemporalWorkflowActivityResolutionService(
      prisma as any,
      builtinRegistry
    );
    const workflowConfigService = new TemporalWorkflowConfigService();
    const workflowTemplateService = new TemporalWorkflowTemplateService();
    const workflowArtifactService = new TemporalWorkflowArtifactService(prisma as any);
    const workflowConfigOrchestrationService = new TemporalWorkflowConfigOrchestrationService(
      workflowConfigService
    );
    const workflowManagementService = new TemporalWorkflowManagementService(
      prisma as any,
      workflowNormalizationService,
      workflowArtifactService
    );
    const activityCodegenService = new ActivityCodegenService();
    const workflowSupportService = new TemporalWorkflowSupportService(
      builtinRegistry,
      aiDraftService,
      activityResolutionService,
      workflowConfigService,
      workflowNormalizationService,
      activityCodegenService
    );
    const workflowDraftOrchestrationService = new TemporalWorkflowDraftOrchestrationService(
      aiDraftService,
      browserDraftService,
      workflowSupportService,
      workflowTemplateService
    );
    const workflowSessionSupportFactoryService = new TemporalWorkflowSessionSupportFactoryService(
      workflowSupportService
    );
    const workflowSessionOrchestrationService = new TemporalWorkflowSessionOrchestrationService(
      sessionService,
      workflowSessionSupportFactoryService
    );
    const validationFacade = new TemporalWorkflowValidationFacadeService(validationService);
    const workflowArtifactValidationService = new TemporalWorkflowArtifactValidationService(
      prisma as any,
      validationFacade,
      workflowArtifactService,
      new TemporalWorkflowValidationContractService()
    );
    const workflowDslValidationService = new TemporalWorkflowDslValidationService(
      workflowSupportService
    );
    const workflowCodegenOrchestrationService = new TemporalWorkflowCodegenOrchestrationService(
      prisma as any,
      codegenService,
      workflowArtifactService,
      workflowSupportService,
      workflowNormalizationService
    );
    const service = new TemporalWorkflowService(
      workflowCodegenOrchestrationService,
      workflowArtifactService,
      workflowConfigOrchestrationService,
      workflowDraftOrchestrationService,
      workflowManagementService,
      workflowSessionOrchestrationService,
      workflowArtifactValidationService,
      workflowDslValidationService
    );

    return {
      service,
      prisma,
      builtinRegistry,
      aiDraftService,
      browserDraftService,
      codegenService,
      sessionService,
      validationService,
      activityResolutionService,
      workflowConfigService,
      workflowNormalizationService,
      workflowTemplateService,
      workflowArtifactService,
      workflowSupportService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates persistent AI draft session and returns current draft/messages', async () => {
    const { service, prisma } = createService();
    const now = new Date('2025-05-03T10:00:00.000Z');

    prisma.activity.findMany.mockResolvedValue([]);
    prisma.chatSession.create.mockResolvedValue({
      id: 'session-1',
    });
    prisma.chatSession.findUnique.mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      title: '天气草稿会话',
      modelId: 'temporal-workflow-draft',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: 'message-1',
          sessionId: 'session-1',
          role: 'user',
          content: '创建一个天气查询工作流',
          metadata: { kind: 'temporal_workflow_draft_prompt' },
          createdAt: now,
        },
        {
          id: 'message-2',
          sessionId: 'session-1',
          role: 'assistant',
          content: '已生成初始工作流草稿',
          metadata: {
            kind: 'temporal_workflow_draft_result',
            draft: {
              name: '天气查询工作流',
              description: '根据城市查询天气',
              taskQueue: 'SKILL_TASK_QUEUE',
              workflowDsl: {
                name: '天气查询工作流',
                taskQueue: 'SKILL_TASK_QUEUE',
                steps: [
                  {
                    id: 'step_1',
                    name: '查询天气接口',
                    type: 'activity',
                    activityRef: 'builtin:httpRequest',
                    activityName: 'HTTP 请求',
                  },
                ],
              },
              activityDsl: {
                activities: [
                  {
                    name: 'HTTP 请求',
                    fn: 'httpRequest',
                    timeout: '30s',
                    handler: 'api',
                    config: {},
                  },
                ],
              },
              warnings: [],
            },
          },
          createdAt: now,
        },
      ],
    });
    mockedAxios.post.mockResolvedValue({
      data: {
        result: JSON.stringify({
          workflowName: '天气查询工作流',
          workflowDescription: '根据城市查询天气',
          workflowClassName: 'WeatherLookupWorkflow',
          workflowDefnName: '天气查询工作流',
          taskQueue: 'SKILL_TASK_QUEUE',
          inputParams: {
            city: {
              description: '城市名',
              required: true,
              defaultValue: '',
            },
          },
          outputParams: {
            result: {
              description: '天气结果',
              sourceStep: 'step_1',
            },
          },
          steps: [
            {
              id: 'step_1',
              name: '查询天气接口',
              type: 'activity',
              activityRef: 'builtin:httpRequest',
              activityName: 'HTTP 请求',
            },
          ],
          activities: [
            {
              activityRef: 'builtin:httpRequest',
              name: 'HTTP 请求',
              timeout: '30s',
              config: {},
            },
          ],
        }),
      },
    } as any);

    const session = await service.createAiDraftSession(
      {
        title: '天气草稿会话',
        description: '创建一个天气查询工作流',
      },
      'user-1'
    );

    expect(prisma.chatSession.create).toHaveBeenCalled();
    expect(session.sessionId).toBe('session-1');
    expect(session.currentDraft?.name).toBe('天气查询工作流');
    expect(session.messages).toHaveLength(2);
  });

  it('refines persistent AI draft session using last assistant draft', async () => {
    const { service, prisma } = createService();
    const now = new Date('2025-05-03T10:00:00.000Z');

    const initialSession = {
      id: 'session-2',
      userId: 'user-1',
      title: '天气草稿会话',
      modelId: 'temporal-workflow-draft',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: 'message-1',
          sessionId: 'session-2',
          role: 'assistant',
          content: '已生成初始工作流草稿',
          metadata: {
            kind: 'temporal_workflow_draft_result',
            draft: {
              name: '天气查询工作流',
              description: '根据城市查询天气',
              taskQueue: 'SKILL_TASK_QUEUE',
              workflowDsl: {
                name: '天气查询工作流',
                taskQueue: 'SKILL_TASK_QUEUE',
                steps: [
                  {
                    id: 'step_1',
                    name: '查询天气接口',
                    type: 'activity',
                    activityRef: 'builtin:httpRequest',
                    activityName: 'HTTP 请求',
                  },
                ],
              },
              activityDsl: {
                activities: [
                  {
                    name: 'HTTP 请求',
                    fn: 'httpRequest',
                    timeout: '30s',
                    handler: 'api',
                    config: {},
                  },
                ],
              },
              warnings: [],
            },
          },
          createdAt: now,
        },
      ],
    };
    prisma.chatSession.findUnique.mockResolvedValue(initialSession);
    prisma.chatSession.update.mockResolvedValue({ id: 'session-2' });
    jest.spyOn(service, 'refineAiWorkflowDraft').mockResolvedValue({
      name: '天气查询工作流',
      description: '根据城市查询天气并返回结构化结果',
      taskQueue: 'SKILL_TASK_QUEUE',
      workflowDsl: {
        name: '天气查询工作流',
        taskQueue: 'SKILL_TASK_QUEUE',
        outputParams: {
          result: {
            description: '结构化天气结果',
            sourceStep: 'step_1',
          },
        },
        steps: [
          {
            id: 'step_1',
            name: '查询天气接口',
            type: 'activity',
            activityRef: 'builtin:httpRequest',
            activityName: 'HTTP 请求',
          },
        ],
      },
      activityDsl: {
        activities: [
          {
            name: 'HTTP 请求',
            fn: 'httpRequest',
            timeout: '30s',
            handler: 'api',
            config: {},
          },
        ],
      },
      warnings: [],
    });
    prisma.chatSession.findUnique.mockResolvedValueOnce(initialSession).mockResolvedValueOnce({
      id: 'session-2',
      userId: 'user-1',
      title: '天气草稿会话',
      modelId: 'temporal-workflow-draft',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: 'message-1',
          sessionId: 'session-2',
          role: 'assistant',
          content: '已生成初始工作流草稿',
          metadata: {
            kind: 'temporal_workflow_draft_result',
            draft: {
              name: '天气查询工作流',
              description: '根据城市查询天气',
              taskQueue: 'SKILL_TASK_QUEUE',
              workflowDsl: {
                name: '天气查询工作流',
                taskQueue: 'SKILL_TASK_QUEUE',
                steps: [
                  {
                    id: 'step_1',
                    name: '查询天气接口',
                    type: 'activity',
                    activityRef: 'builtin:httpRequest',
                    activityName: 'HTTP 请求',
                  },
                ],
              },
              activityDsl: {
                activities: [
                  {
                    name: 'HTTP 请求',
                    fn: 'httpRequest',
                    timeout: '30s',
                    handler: 'api',
                    config: {},
                  },
                ],
              },
              warnings: [],
            },
          },
          createdAt: now,
        },
        {
          id: 'message-2',
          sessionId: 'session-2',
          role: 'user',
          content: '请增加结构化输出字段',
          metadata: { kind: 'temporal_workflow_draft_refine_prompt' },
          createdAt: now,
        },
        {
          id: 'message-3',
          sessionId: 'session-2',
          role: 'assistant',
          content: '已更新工作流草稿',
          metadata: {
            kind: 'temporal_workflow_draft_result',
            draft: {
              name: '天气查询工作流',
              description: '根据城市查询天气并返回结构化结果',
              taskQueue: 'SKILL_TASK_QUEUE',
              workflowDsl: {
                name: '天气查询工作流',
                taskQueue: 'SKILL_TASK_QUEUE',
                outputParams: {
                  result: {
                    description: '结构化天气结果',
                    sourceStep: 'step_1',
                  },
                },
                steps: [
                  {
                    id: 'step_1',
                    name: '查询天气接口',
                    type: 'activity',
                    activityRef: 'builtin:httpRequest',
                    activityName: 'HTTP 请求',
                  },
                ],
              },
              activityDsl: {
                activities: [
                  {
                    name: 'HTTP 请求',
                    fn: 'httpRequest',
                    timeout: '30s',
                    handler: 'api',
                    config: {},
                  },
                ],
              },
              warnings: [],
            },
          },
          createdAt: now,
        },
      ],
    });

    const session = await service.refineAiDraftSession(
      {
        sessionId: 'session-2',
        userPrompt: '请增加结构化输出字段',
      },
      'user-1'
    );

    expect(prisma.chatSession.update).toHaveBeenCalled();
    expect(session.currentDraft?.description).toContain('结构化结果');
    expect(session.messages).toHaveLength(3);
  });

  it('lists persistent AI draft sessions with draft summary', async () => {
    const { service, prisma } = createService();
    const now = new Date('2025-05-03T10:00:00.000Z');

    prisma.chatSession.findMany.mockResolvedValue([
      {
        id: 'session-3',
        userId: 'user-1',
        title: '天气草稿会话',
        modelId: 'temporal-workflow-draft',
        status: 'active',
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: 'message-1',
            sessionId: 'session-3',
            role: 'assistant',
            content: '已生成初始工作流草稿',
            metadata: {
              kind: 'temporal_workflow_draft_result',
              draft: {
                name: '天气查询工作流',
                description: '根据城市查询天气',
                taskQueue: 'SKILL_TASK_QUEUE',
                workflowDsl: {
                  name: '天气查询工作流',
                  taskQueue: 'SKILL_TASK_QUEUE',
                  steps: [],
                },
                activityDsl: { activities: [] },
                warnings: [],
              },
            },
            createdAt: now,
          },
        ],
      },
    ]);

    const sessions = await service.listAiDraftSessions('user-1');

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        sessionId: 'session-3',
        currentDraftName: '天气查询工作流',
        currentDraftDescription: '根据城市查询天气',
        messageCount: 1,
      })
    );
  });
});
