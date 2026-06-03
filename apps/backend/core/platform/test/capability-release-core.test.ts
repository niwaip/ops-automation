import axios from 'axios';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CapabilityReleaseService } from '../src/modules/capability-release/capability-release.service';
import { BridgeRecorderExportDTO } from '../src/modules/capability-release/interfaces';

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

    const service = new CapabilityReleaseService(
      prisma as any,
      {} as any, // capabilityReleaseBuildValidationService
      {} as any, // capabilityReleaseDeploymentService
      {} as any, // capabilityReleaseAssistService
      {} as any, // capabilityReleasePublishService
      {} as any, // capabilityReleaseRuntimeService
      {
        generateSkillDraft: jest.fn(),
      } as any, // capabilityReleaseSkillDraftService
      {} as any, // capabilityReleaseTemporalSchemaService
    );

    return { service, prisma, skillService, toolCatalogService, activityService };
  };

  it('archives the release and deactivates its published skill', async () => {
    const { service, prisma } = createService();

    jest.spyOn(service as any, 'getReleaseOrThrow').mockResolvedValue({
      id: 'release-1',
      publishedSkillId: 'skill-1',
    });
    jest.spyOn(service as any, 'insertAuditEvent').mockResolvedValue(undefined);

    const result = await service.archiveCapability('release-1', 'user-1');

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
      '归档 Capability',
    );
  });
});
