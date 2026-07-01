import axios from 'axios';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ReleaseAccessorBindingsService,
  ReleaseAccessorDepsService,
  ReleaseAccessorSourceService,
  ReleaseFacadeAccessorFactoryService,
  ReleaseAccessorFactoryService,
  ReleaseAuditAccessorDepsService,
  ReleaseDraftQueryBridgeService,
  ReleaseFacadeAccessorsService,
  ReleaseDraftQuerySourceService,
  ReleaseFacadeAccessorBindingsService,
  ReleaseFacadeContextService,
  ReleaseLifecycleService,
  ReleaseManagementAccessorSourceService,
  ReleaseManagementFacadeContextService,
  ReleaseManagementFacadeAccessorsService,
  ReleaseQueryService,
  ReleaseRuntimeAccessorFactoryService,
  ReleaseRuntimeAccessorSourceService,
  ReleaseRuntimeFacadeContextService,
  ReleaseRuntimeFacadeAccessorsService,
  ReleaseRuntimeAccessorBindingsService,
  ReleaseSupportAccessorDepsService,
} from '@ops/release-manager/release';
import { CapabilityReleaseService } from '@ops/release-manager/release';
import { BridgeRecorderExportDTO } from '../../../registry-release/release-manager/src/interfaces';

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
    const activityService = {
      executeCodeInTemporalSandbox: jest.fn(),
      executeCodeStreaming: jest.fn(),
    };
    const skillService = {
      validateSkillToolsPayload: jest.fn(),
      createSkill: jest.fn(),
      getSkillToolBindings: jest.fn(),
    };
    const toolCatalogService = {
      getCatalogItemsByNames: jest.fn(),
    };
    const releaseRuntimeAccessorFactoryService = new ReleaseRuntimeAccessorFactoryService();
    const releaseFacadeAccessorFactoryService = new ReleaseFacadeAccessorFactoryService();
    const releaseAccessorFactoryService = new ReleaseAccessorFactoryService(
      releaseRuntimeAccessorFactoryService,
      releaseFacadeAccessorFactoryService
    );
    const releaseLifecycleService = new ReleaseLifecycleService(prisma as any);
    const releaseQueryService = new ReleaseQueryService(prisma as any);
    const releaseDraftService = {
      createCapability: jest.fn(),
      updateSource: jest.fn(),
    };
    const releaseDraftQueryBridgeService = new ReleaseDraftQueryBridgeService(
      releaseDraftService as any,
      releaseQueryService
    );
    const releaseRuntimeAccessorBindingsService = new ReleaseRuntimeAccessorBindingsService();
    const releaseFacadeAccessorBindingsService = new ReleaseFacadeAccessorBindingsService();
    const releaseAccessorBindingsService = new ReleaseAccessorBindingsService(
      releaseRuntimeAccessorBindingsService,
      releaseFacadeAccessorBindingsService
    );
    const releaseAuditAccessorDepsService = new ReleaseAuditAccessorDepsService({
      insertAuditEvent: jest.fn(),
    } as any);
    const releaseSupportAccessorDepsService = new ReleaseSupportAccessorDepsService(
      releaseAccessorBindingsService,
      {
        ensureInfrastructure: jest.fn(),
        getReleaseOrThrow: jest.fn(),
        getCurrentSnapshotOrThrow: jest.fn(),
        getBuildOrThrow: jest.fn(),
        getValidationOrThrow: jest.fn(),
        getDeploymentOrThrow: jest.fn(),
        getSkillDraftOrThrow: jest.fn(),
        getLatestSuccessfulValidationOrThrow: jest.fn(),
        resolveTemporalExecutableBuildOrThrow: jest.fn(),
        resolveWorkflowFnOrThrow: jest.fn(),
      } as any
    );
    const releaseDraftQuerySourceService = new ReleaseDraftQuerySourceService(
      releaseAuditAccessorDepsService as any,
      releaseDraftQueryBridgeService,
      releaseSupportAccessorDepsService
    );
    const releaseAccessorSourceService = new ReleaseAccessorSourceService(
      new ReleaseRuntimeAccessorSourceService(releaseSupportAccessorDepsService),
      new ReleaseManagementAccessorSourceService(
        releaseAuditAccessorDepsService as any,
        releaseDraftQuerySourceService,
        releaseSupportAccessorDepsService
      )
    );
    const releaseAccessorDepsService = new ReleaseAccessorDepsService(
      releaseSupportAccessorDepsService
    );
    const releaseFacadeAccessorsService = new ReleaseFacadeAccessorsService(
      new ReleaseRuntimeFacadeAccessorsService(
        releaseAccessorFactoryService,
        releaseAccessorDepsService
      ),
      new ReleaseManagementFacadeAccessorsService(
        releaseAccessorFactoryService,
        releaseAccessorDepsService
      )
    );
    const releaseFacadeContextService = new ReleaseFacadeContextService(
      new ReleaseRuntimeFacadeContextService(
        releaseFacadeAccessorsService,
        releaseAccessorSourceService
      ),
      new ReleaseManagementFacadeContextService(
        new ReleaseManagementFacadeAccessorsService(
          releaseAccessorFactoryService,
          releaseAccessorDepsService
        ),
        releaseAccessorSourceService
      )
    );

    const service = new CapabilityReleaseService(
      {} as any, // capabilityReleaseBuildValidationService
      {} as any, // capabilityReleaseDeploymentService
      {} as any, // capabilityReleaseAssistService
      {} as any, // capabilityReleasePublishService
      {} as any, // capabilityReleaseRuntimeService
      {} as any, // releaseDraftService
      releaseFacadeContextService,
      releaseLifecycleService,
      releaseQueryService,
      {} as any, // capabilityReleaseManifestService
      {} as any, // capabilityReleaseSkillDraftService
      {} as any, // capabilityReleaseTemporalSchemaService
      {} as any // capabilityReleaseAuditService
    );

    return {
      service,
      prisma,
      skillService,
      toolCatalogService,
      activityService,
      releaseFacadeContextService,
    };
  };

  it('archives the release and deactivates its published skill', async () => {
    const { service, prisma, releaseFacadeContextService } = createService();

    jest.spyOn((releaseFacadeContextService as any), 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-1',
      publishedSkillId: 'skill-1',
    });
    jest
      .spyOn((releaseFacadeContextService as any), 'insertAuditEvent')
      .mockResolvedValue(undefined);

    const result = await service.archiveCapability('release-1', 'user-1');

    expect(result).toEqual({ success: true, archivedId: 'release-1' });
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE capability_releases'),
      'release-1'
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE skill_configs'),
      'skill-1'
    );
    expect((releaseFacadeContextService as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'published_skill_deactivated',
      'user-1',
      true,
      '归档 Release 时停用已发布 Skill: skill-1',
      { publishedSkillId: 'skill-1' }
    );
    expect((releaseFacadeContextService as any).insertAuditEvent).toHaveBeenCalledWith(
      'release-1',
      'release_archived',
      'user-1',
      true,
      '归档 Capability',
      undefined
    );
  });
});
