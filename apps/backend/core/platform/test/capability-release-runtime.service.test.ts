import axios from 'axios';
import {
  CapabilityReleaseRuntimeAccessors,
  CapabilityReleaseRuntimeService,
} from '../src/modules/capability-release/capability-release-runtime.service';

jest.mock('axios');

describe('CapabilityReleaseRuntimeService', () => {
  const mockedAxios = axios as jest.Mocked<typeof axios>;

  const createService = () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(),
    };
    const activityService = {
      executeCodeInTemporalSandbox: jest.fn(),
      executeCodeStreaming: jest.fn(),
    };
    const skillService = {
      getSkillToolBindings: jest.fn(),
    };
    const toolCatalogService = {
      getCatalogItemsByNames: jest.fn(),
    };
    const capabilityReleaseBrowserRecordingService = {
      buildRuntimePlan: jest.fn(),
    };
    const capabilityReleaseSkillDraftService = {
      extractExecutionFlowSourceTemplate: jest.fn(),
    };

    const service = new CapabilityReleaseRuntimeService(
      prisma as any,
      activityService as any,
      skillService as any,
      toolCatalogService as any,
      capabilityReleaseBrowserRecordingService as any,
      capabilityReleaseSkillDraftService as any,
    );

    const accessors: CapabilityReleaseRuntimeAccessors = {
      getCurrentSnapshotOrThrow: jest.fn(),
      resolveTemporalExecutableBuildOrThrow: jest.fn(),
      resolveWorkflowFnOrThrow: jest.fn(),
      insertAuditEvent: jest.fn().mockResolvedValue(undefined),
    };

    return {
      service,
      prisma,
      capabilityReleaseSkillDraftService,
      accessors,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CARBONE_SERVICE_URL;
    delete process.env.CARBONE_EXTERNAL_URL;
    delete process.env.DOCKER_ENV;
    delete process.env.NODE_ENV;
    delete process.env.HOST_IP;
    delete process.env.EXTERNAL_HOST;
  });

  it('posts to render-resolved with templateId when template binding is available', async () => {
    const { service, prisma, accessors } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    (accessors.getCurrentSnapshotOrThrow as jest.Mock).mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        sourceTemplate: {
          templateId: 'tpl-001',
          format: 'docx',
        },
      },
    });
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Skill not found',
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          downloadUrl: '/studio/download/doc-1',
          fileName: 'contract.docx',
          format: 'docx',
        },
      } as any);

    const result = await service.executePublishedSkill(
      'published-skill-1',
      {
        data: {
          customerName: 'Alice',
        },
      },
      'user-1',
      undefined,
      accessors,
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3009/studio/generate-render-data-with-skill',
      {
        publishedSkillId: 'published-skill-1',
        templateId: 'tpl-001',
        skillId: undefined,
        simulatedData: {
          customerName: 'Alice',
        },
        outputFormat: 'docx',
      },
      {
        timeout: 120000,
      },
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3009/studio/render-resolved',
      {
        publishedSkillId: 'published-skill-1',
        templateId: 'tpl-001',
        skillId: undefined,
        data: {
          customerName: 'Alice',
        },
        outputFormat: 'docx',
      },
      {
        timeout: 120000,
      },
    );
    expect(result.success).toBe(true);
    expect(result.output).toEqual(
      expect.objectContaining({
        templateId: 'tpl-001',
        downloadUrl: 'http://localhost:3009/studio/download/doc-1',
      }),
    );
  });

  it('posts both templateId and source skillId to render-resolved when both bindings exist', async () => {
    const { service, prisma, accessors } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    (accessors.getCurrentSnapshotOrThrow as jest.Mock).mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        sourceTemplate: {
          templateId: 'tpl-002',
          skillId: 'carbone-skill-2',
          format: 'docx',
        },
      },
    });
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          success: true,
          renderResolvedRequest: {
            publishedSkillId: 'published-skill-2',
            templateId: 'tpl-002',
            skillId: 'carbone-skill-2',
            data: {
              contract: {
                customerName: 'Bob',
              },
            },
            outputFormat: 'docx',
          },
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          downloadUrl: '/studio/download/doc-2',
          fileName: 'resolved.docx',
          format: 'docx',
        },
      } as any);

    const result = await service.executePublishedSkill(
      'published-skill-2',
      {
        data: {
          customerName: 'Bob',
        },
      },
      'user-1',
      undefined,
      accessors,
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3009/studio/generate-render-data-with-skill',
      {
        publishedSkillId: 'published-skill-2',
        templateId: 'tpl-002',
        skillId: 'carbone-skill-2',
        simulatedData: {
          customerName: 'Bob',
        },
        outputFormat: 'docx',
      },
      {
        timeout: 120000,
      },
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3009/studio/render-resolved',
      {
        publishedSkillId: 'published-skill-2',
        templateId: 'tpl-002',
        skillId: 'carbone-skill-2',
        data: {
          contract: {
            customerName: 'Bob',
          },
        },
        outputFormat: 'docx',
      },
      {
        timeout: 120000,
      },
    );
    expect(result.output).toEqual(
      expect.objectContaining({
        templateId: 'tpl-002',
        skillId: 'carbone-skill-2',
        downloadUrl: 'http://localhost:3009/studio/download/doc-2',
      }),
    );
  });

  it('posts source skillId to render-resolved when templateId is unavailable', async () => {
    const { service, prisma, accessors } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    (accessors.getCurrentSnapshotOrThrow as jest.Mock).mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        sourceTemplate: {
          skillId: 'carbone-skill-3',
        },
      },
    });
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Skill not found',
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          downloadUrl: '/studio/download/doc-3',
          fileName: 'fallback.pdf',
          format: 'pdf',
        },
      } as any);

    const result = await service.executePublishedSkill(
      'published-skill-3',
      {
        params: {
          customerName: 'Carol',
        },
        outputFormat: 'pdf',
      },
      'user-1',
      undefined,
      accessors,
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3009/studio/generate-render-data-with-skill',
      {
        publishedSkillId: 'published-skill-3',
        templateId: undefined,
        skillId: 'carbone-skill-3',
        simulatedData: {
          customerName: 'Carol',
        },
        outputFormat: 'pdf',
      },
      {
        timeout: 120000,
      },
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3009/studio/render-resolved',
      {
        publishedSkillId: 'published-skill-3',
        templateId: undefined,
        skillId: 'carbone-skill-3',
        data: {
          customerName: 'Carol',
        },
        outputFormat: 'pdf',
      },
      {
        timeout: 120000,
      },
    );
    expect(result.success).toBe(true);
    expect(result.output).toEqual(
      expect.objectContaining({
        skillId: 'carbone-skill-3',
        downloadUrl: 'http://localhost:3009/studio/download/doc-3',
      }),
    );
  });

  it('forwards localized render context and output name to render-resolved', async () => {
    const { service, prisma, accessors } = createService();

    prisma.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'release-row-1' }]);
    jest.spyOn(service as any, 'mapRelease').mockReturnValue({
      id: 'release-1',
      sourceType: 'execution_flow_template',
    });
    (accessors.getCurrentSnapshotOrThrow as jest.Mock).mockResolvedValue({
      id: 'snapshot-1',
      sourcePayload: {
        sourceTemplate: {
          templateId: 'tpl-004',
          format: 'docx',
          outputName: '技术服务合同',
          sourceLanguage: 'zh',
          targetLanguages: ['ja', 'en'],
        },
      },
    });
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          success: true,
          renderResolvedRequest: {
            publishedSkillId: 'published-skill-4',
            templateId: 'tpl-004',
            data: {
              localized: {
                partyA: '甲方公司',
              },
            },
            outputFormat: 'docx',
            outputName: '技术服务合同',
            sourceLanguage: 'zh',
            targetLanguages: ['ja', 'en'],
            prepareLocalizedRenderData: true,
          },
        },
      } as any)
      .mockResolvedValueOnce({
        data: {
          downloadUrl: '/studio/download/doc-4',
          fileName: 'localized.docx',
          format: 'docx',
        },
      } as any);

    await service.executePublishedSkill(
      'published-skill-4',
      {
        data: {
          partyA: '甲方公司',
        },
      },
      'user-1',
      undefined,
      accessors,
    );

    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3009/studio/generate-render-data-with-skill',
      {
        publishedSkillId: 'published-skill-4',
        templateId: 'tpl-004',
        skillId: undefined,
        simulatedData: {
          partyA: '甲方公司',
        },
        outputFormat: 'docx',
        outputName: '技术服务合同',
        sourceLanguage: 'zh',
        targetLanguages: ['ja', 'en'],
        prepareLocalizedRenderData: true,
      },
      {
        timeout: 120000,
      },
    );
    expect(mockedAxios.post).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3009/studio/render-resolved',
      {
        publishedSkillId: 'published-skill-4',
        templateId: 'tpl-004',
        skillId: undefined,
        data: {
          localized: {
            partyA: '甲方公司',
          },
        },
        outputFormat: 'docx',
        outputName: '技术服务合同',
        sourceLanguage: 'zh',
        targetLanguages: ['ja', 'en'],
        prepareLocalizedRenderData: true,
      },
      {
        timeout: 120000,
      },
    );
  });
});
