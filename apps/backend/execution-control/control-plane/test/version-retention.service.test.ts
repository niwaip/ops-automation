import { VersionRetentionService } from '../src/modules/execution/plan-runtime/version-retention.service';

describe('VersionRetentionService (§15.4 item 6)', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    envBackup.VERSION_RETENTION_ENABLED = process.env.VERSION_RETENTION_ENABLED;
    envBackup.VERSION_RETENTION_MAX_VERSIONS = process.env.VERSION_RETENTION_MAX_VERSIONS;
    envBackup.VERSION_RETENTION_WINDOW_DAYS = process.env.VERSION_RETENTION_WINDOW_DAYS;
    delete process.env.VERSION_RETENTION_ENABLED;
    delete process.env.VERSION_RETENTION_MAX_VERSIONS;
    delete process.env.VERSION_RETENTION_WINDOW_DAYS;
  });

  afterEach(() => {
    process.env.VERSION_RETENTION_ENABLED = envBackup.VERSION_RETENTION_ENABLED;
    process.env.VERSION_RETENTION_MAX_VERSIONS = envBackup.VERSION_RETENTION_MAX_VERSIONS;
    process.env.VERSION_RETENTION_WINDOW_DAYS = envBackup.VERSION_RETENTION_WINDOW_DAYS;
    delete process.env.VERSION_RETENTION_ENABLED;
    delete process.env.VERSION_RETENTION_MAX_VERSIONS;
    delete process.env.VERSION_RETENTION_WINDOW_DAYS;
  });

  const version = (id: string, definitionVersion: string) => ({ id, definitionVersion });

  const createService = (over: {
    versions?: Array<{ id: string; definitionVersion: string }>;
    activeVersionId?: string | null;
    planRefCount?: number;
    deploymentRefCount?: number;
  } = {}) => {
    const prisma = {
      builtinSkill: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'skill-1', capabilityKey: 'tavily_search', activeVersionId: over.activeVersionId ?? 'v12' },
        ]),
      },
      builtinSkillVersion: {
        findMany: jest.fn().mockResolvedValue(over.versions ?? []),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      builtinSkillAuditEvent: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      $queryRawUnsafe: jest.fn((_sql: string, _param: unknown) =>
        Promise.resolve([{ count: 0 }])
      ),
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    };
    return { service: new VersionRetentionService(prisma as never), prisma };
  };

  const twelveVersions = () =>
    Array.from({ length: 12 }, (_, i) => version(`v${String(i + 1).padStart(2, '0')}`, `1.0.${i + 1}`));

  it('is disabled by default — nothing is scheduled or deleted', () => {
    const { service } = createService();
    expect(service.isEnabled()).toBe(false);
    expect(service.getMaxVersions()).toBe(10);
    expect(service.getWindowDays()).toBe(90);
  });

  it('reads max versions / window from env with safe fallbacks', () => {
    const { service } = createService();
    process.env.VERSION_RETENTION_MAX_VERSIONS = '5';
    process.env.VERSION_RETENTION_WINDOW_DAYS = '30';
    expect(service.getMaxVersions()).toBe(5);
    expect(service.getWindowDays()).toBe(30);

    process.env.VERSION_RETENTION_MAX_VERSIONS = 'not-a-number';
    process.env.VERSION_RETENTION_WINDOW_DAYS = '-3';
    expect(service.getMaxVersions()).toBe(10);
    expect(service.getWindowDays()).toBe(90);
  });

  it('deletes the oldest versions beyond the max and writes audit events', async () => {
    process.env.VERSION_RETENTION_MAX_VERSIONS = '10';
    const { service, prisma } = createService({
      versions: twelveVersions().reverse(), // newest-first, as orderBy createdAt desc
      activeVersionId: 'v12',
    });

    const result = await service.retainActiveSkillVersions();

    expect(result.deleted).toBe(2); // v02, v01
    expect(prisma.builtinSkillVersion.delete).toHaveBeenCalledTimes(2);
    expect(prisma.builtinSkillVersion.delete).toHaveBeenCalledWith({ where: { id: 'v01' } });
    expect(prisma.builtinSkillVersion.delete).toHaveBeenCalledWith({ where: { id: 'v02' } });
    expect(prisma.builtinSkillAuditEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.builtinSkillAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        builtinSkillId: 'skill-1',
        action: 'version_deleted_by_retention',
        versionId: 'v01',
        payload: expect.objectContaining({ definitionVersion: '1.0.1', maxVersions: 10 }),
      }),
    });
  });

  it('keeps the active version even when it is older than the retained window', async () => {
    process.env.VERSION_RETENTION_MAX_VERSIONS = '10';
    const { service, prisma } = createService({
      versions: twelveVersions().reverse(),
      activeVersionId: 'v01', // oldest, but still active
    });

    const result = await service.retainActiveSkillVersions();

    expect(result.deleted).toBe(1); // only v02
    expect(prisma.builtinSkillVersion.delete).toHaveBeenCalledWith({ where: { id: 'v02' } });
    expect(prisma.builtinSkillVersion.delete).not.toHaveBeenCalledWith({ where: { id: 'v01' } });
  });

  it('skips versions referenced by frozen execution plans (nodes[].skillVersion == definitionVersion, fix ⑪)', async () => {
    process.env.VERSION_RETENTION_MAX_VERSIONS = '10';
    const { service, prisma } = createService({ versions: twelveVersions().reverse() });
    // v01 (definitionVersion '1.0.1') is referenced by a frozen plan node;
    // v02 (definitionVersion '1.0.2') is free (deployment check is free)
    prisma.$queryRawUnsafe.mockImplementation((sql: string, param: unknown) => {
      if (sql.includes("node->>'skillVersion'")) {
        return Promise.resolve([{ count: param === '1.0.1' ? 1 : 0 }]);
      }
      return Promise.resolve([{ count: 0 }]);
    });

    const result = await service.retainActiveSkillVersions();

    expect(result.keptByReference).toBe(1);
    expect(result.deleted).toBe(1);
    expect(prisma.builtinSkillVersion.delete).toHaveBeenCalledWith({ where: { id: 'v02' } });
    expect(prisma.builtinSkillVersion.delete).not.toHaveBeenCalledWith({ where: { id: 'v01' } });
  });

  it('matches plan references by definitionVersion, never by the row UUID (regression for fix ⑪)', async () => {
    process.env.VERSION_RETENTION_MAX_VERSIONS = '10';
    const { service, prisma } = createService({ versions: twelveVersions().reverse() });
    let planQuery: { sql: string; param: unknown } | null = null;
    prisma.$queryRawUnsafe.mockImplementation((sql: string, param: unknown) => {
      if (sql.includes("node->>'skillVersion'")) {
        planQuery = { sql, param };
        return Promise.resolve([{ count: 0 }]);
      }
      return Promise.resolve([{ count: 0 }]);
    });

    await service.retainActiveSkillVersions();

    // The lookup is executed against the version's definitionVersion string
    // ("1.0.1"), not against the row id ("v01").
    expect(planQuery?.param).toBe('1.0.1');
    expect(planQuery?.sql).not.toContain('plan_json @>');
    expect(planQuery?.sql).toContain('jsonb_array_elements(plan_json -> \'nodes\')');
  });

  it('skips versions that still have deployments', async () => {
    process.env.VERSION_RETENTION_MAX_VERSIONS = '10';
    const { service, prisma } = createService({ versions: twelveVersions().reverse() });
    prisma.$queryRawUnsafe.mockImplementation((sql: string) => {
      const deploymentCheck = sql.includes('builtin_skill_deployments');
      return Promise.resolve([{ count: deploymentCheck ? 1 : 0 }]);
    });

    const result = await service.retainActiveSkillVersions();

    expect(result.keptByReference).toBe(2);
    expect(result.deleted).toBe(0);
  });

  it('does nothing when the version count is within the limit', async () => {
    const { service, prisma } = createService({
      versions: twelveVersions().slice(0, 8), // 8 ≤ default max 10
    });

    const result = await service.retainActiveSkillVersions();

    expect(result.deleted).toBe(0);
    expect(prisma.builtinSkillVersion.delete).not.toHaveBeenCalled();
    expect(prisma.builtinSkillAuditEvent.create).not.toHaveBeenCalled();
  });

  it('archives old terminal releases and prunes their artifacts in FK-safe order', async () => {
    const { service, prisma } = createService();
    const result = await service.pruneOldReleases();

    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE capability_releases'),
      90
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('DELETE FROM capability_validations'),
      90
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('DELETE FROM capability_builds'),
      90
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('DELETE FROM capability_source_snapshots'),
      90
    );
    expect(result).toEqual({
      archivedReleases: 0,
      prunedValidations: 0,
      prunedBuilds: 0,
      prunedSnapshots: 0,
    });
  });
});
