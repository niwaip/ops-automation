import axios from 'axios';
import { CapabilityReleaseService } from '../src/modules/capability-release/capability-release.service';

jest.mock('axios');

describe('CapabilityReleaseService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CARBONE_SERVICE_URL;
    delete process.env.CARBONE_EXTERNAL_URL;
    delete process.env.DOCKER_ENV;
    delete process.env.NODE_ENV;
    delete process.env.HOST_IP;
    delete process.env.EXTERNAL_HOST;
  });

  const createService = () => {
    const prisma = {
      $executeRawUnsafe: jest.fn(),
      $queryRawUnsafe: jest.fn(),
    };
    const skillService = {
      validateSkillToolsPayload: jest.fn(),
      createSkill: jest.fn(),
      getSkillToolBindings: jest.fn(),
    };
    const toolCatalogService = {
      getCatalogItemsByNames: jest.fn(),
    };

    const service = new CapabilityReleaseService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      skillService as any,
      toolCatalogService as any,
    );

    return { service, prisma, skillService, toolCatalogService };
  };

  it('archives the release and deactivates its published skill', async () => {
    const { service, prisma } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-1',
      publishedSkillId: 'skill-1',
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);

    const result = await service.archiveRelease('release-1', 'user-1');

    expect(result).toEqual({ success: true, archivedId: 'release-1' });
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE capability_releases'),
      'release-1',
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE skill_configs'),
      'skill-1',
    );
    expect((service as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'published_skill_deactivated',
      'user-1',
      true,
      '归档 Release 时停用已发布 Skill: skill-1',
      { publishedSkillId: 'skill-1' },
    );
    expect((service as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'release_archived',
      'user-1',
      true,
      '归档 Capability Release',
    );
  });

  it('blocks publishing when tool validation fails', async () => {
    const { service, skillService } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-1',
      approvalStatus: 'approved',
      status: 'approved',
      currentSkillDraftId: 'draft-1',
      publishedSkillId: null,
    });
    jest.spyOn(service as any, 'getSkillDraftOrThrow').mockResolvedValue({
      id: 'draft-1',
      tools: ['api_call'],
      executionFlowTemplateIds: ['tpl-1'],
      draftPayload: {
        name: 'Test Draft',
        description: 'desc',
        tools: ['api_call'],
        executionFlowTemplateIds: ['tpl-1'],
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    skillService.validateSkillToolsPayload.mockResolvedValue({
      isValid: false,
      declaredTools: ['api_call'],
      inferredTools: [],
      effectiveTools: ['api_call'],
      missingTools: [],
      disabledTools: ['api_call'],
      forbiddenSkillTools: [],
      undeclaredFlowTools: [],
      messages: [
        {
          code: 'tool_disabled',
          toolName: 'api_call',
          severity: 'error',
          message: '工具 "api_call" 当前已被禁用',
        },
      ],
    });

    await expect(service.publishSkill('release-1', {}, 'user-1')).rejects.toThrow('发布前工具校验失败');
    expect((service as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'skill_publish_blocked_by_tool_validation',
      'user-1',
      false,
      '发布前工具校验失败',
      expect.objectContaining({
        toolValidation: expect.objectContaining({
          isValid: false,
        }),
      }),
    );
  });

  it('returns runtime tool policies from tool catalog metadata', async () => {
    const { service, prisma, skillService, toolCatalogService } = createService();

    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ id: 'release-row-1' }])
      .mockResolvedValueOnce([{ id: 'deployment-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
      lastDeploymentId: null,
    });
    jest.spyOn(service as any, 'mapDeployment').mockReturnValue({
      id: 'deployment-1',
      runtimeType: 'flow_runtime',
      environment: 'dev',
    });
    skillService.getSkillToolBindings.mockResolvedValue({
      validation: {
        effectiveTools: ['api_call', 'user_ask'],
      },
    });
    toolCatalogService.getCatalogItemsByNames.mockResolvedValue(
      new Map([
        ['api_call', {
          promptExposure: 'prompt_and_runtime',
          defaultRequiresConfirmation: false,
          defaultRequiresApproval: true,
          status: 'active',
        }],
        ['user_ask', {
          promptExposure: 'runtime_only',
          defaultRequiresConfirmation: false,
          defaultRequiresApproval: false,
          status: 'active',
        }],
      ]),
    );

    const result = await service.getPublishedSkillRuntimeContext('skill-1');

    expect(result.allowedToolNames).toEqual(['api_call', 'user_ask']);
    expect(result.toolPolicies).toEqual([
      {
        name: 'api_call',
        promptExposure: 'prompt_and_runtime',
        defaultRequiresConfirmation: false,
        defaultRequiresApproval: true,
        status: 'active',
      },
      {
        name: 'user_ask',
        promptExposure: 'runtime_only',
        defaultRequiresConfirmation: false,
        defaultRequiresApproval: false,
        status: 'active',
      },
    ]);
  });

  it('extracts document source template metadata from execution flow payload', () => {
    const { service } = createService();

    const sourceTemplate = (service as any).extractExecutionFlowSourceTemplate({
      category: 'document',
      paramsSchema: {
        properties: {
          customerName: { type: 'string' },
          amount: { type: 'number' },
        },
      },
      steps: [
        {
          type: 'api',
          name: '渲染文档',
          api: {
            endpoint: '/api/carbone/render',
            body: {
              templateId: 'tpl-contract',
              outputFormat: 'pdf',
            },
          },
        },
      ],
    });

    expect(sourceTemplate).toEqual({
      templateId: 'tpl-contract',
      skillId: undefined,
      fileName: undefined,
      format: 'pdf',
      variableCount: 2,
    });
  });

  it('executes published document skill via template render when templateId is available', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        category: 'document',
        sourceTemplate: {
          templateId: 'tpl-001',
          format: 'docx',
        },
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post.mockResolvedValue({
      data: {
        downloadUrl: '/studio/download/doc-1',
        fileName: 'contract.docx',
        format: 'docx',
      },
    } as any);

    const result = await service.executePublishedSkill(
      'skill-1',
      {
        data: {
          customerName: 'Alice',
        },
      },
      'user-1',
      {
        executionId: 'exec-1',
        stepId: 'step-1',
      },
    );

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3009/studio/render',
      {
        templateId: 'tpl-001',
        data: {
          customerName: 'Alice',
        },
        outputFormat: 'docx',
      },
      {
        timeout: 120000,
      },
    );
    expect(result.runtime).toBe('document');
    expect(result.success).toBe(true);
    expect(result.downloadUrl).toBe('http://localhost:3009/studio/download/doc-1');
    expect(result.output).toEqual(
      expect.objectContaining({
        templateId: 'tpl-001',
        fileName: 'contract.docx',
        downloadUrl: 'http://localhost:3009/studio/download/doc-1',
      }),
    );
  });

  it('executes published document skill via render-with-skill fallback when templateId is unavailable', async () => {
    const { service, prisma } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    jest.spyOn(service as any, 'getCurrentSnapshotOrThrow').mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        category: 'document',
        steps: [
          {
            type: 'api',
            api: {
              endpoint: '/api/carbone/render',
            },
          },
        ],
      },
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);
    mockedAxios.post.mockResolvedValue({
      data: {
        downloadUrl: '/studio/download/doc-2',
        fileName: 'fallback.docx',
        format: 'docx',
      },
    } as any);

    const result = await service.executePublishedSkill(
      'skill-2',
      {
        params: {
          customerName: 'Bob',
        },
        outputFormat: 'pdf',
      },
      'user-1',
    );

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:3009/studio/render-with-skill',
      {
        skillId: 'skill-2',
        params: {
          customerName: 'Bob',
        },
        outputFormat: 'pdf',
      },
      {
        timeout: 120000,
      },
    );
    expect(result.runtime).toBe('document');
    expect(result.success).toBe(true);
    expect(result.downloadUrl).toBe('http://localhost:3009/studio/download/doc-2');
  });
});
