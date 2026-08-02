import { BuiltinSkillRegistryService } from '../src/modules/builtin-skill/registry/builtin-skill-registry.service';

describe('Activation Gate (P3 item 4, §10.6)', () => {
  const createRegistry = (over: {
    attestation?: unknown | null;
    versionAttestationId?: string | null;
  } = {}) => {
    const prisma = {
      builtinSkill: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'skill-1',
          capabilityKey: 'tavily_search',
          activeVersionId: null,
          isEnabled: false,
          versions: [],
          permissionOverrides: [],
        }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'skill-1', ...data })
        ),
      },
      builtinSkillVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'v12',
          builtinSkillId: 'skill-1',
          definitionVersion: '1.2.0',
          definitionDigest: 'sha256:abc',
          manifestJson: {},
          workflowJson: {},
          attestationId: over.versionAttestationId ?? null,
        }),
      },
      capabilityAttestation: {
        findFirst: jest.fn().mockResolvedValue(over.attestation ?? null),
      },
    };
    const auditService = {
      logEvent: jest.fn().mockResolvedValue(undefined),
    };
    const registry = new BuiltinSkillRegistryService(prisma as never, auditService as never);
    return { registry, prisma, auditService };
  };

  it('blocks activation of a version without attestation (hard gate §10.6)', async () => {
    const { registry, prisma, auditService } = createRegistry({ versionAttestationId: null });

    await expect(registry.activateVersion('tavily_search', '1.2.0')).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.stringContaining('no validation attestation'),
      }),
    });
    expect(prisma.builtinSkill.update).not.toHaveBeenCalled();
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'activate_version_blocked',
        payload: expect.objectContaining({ reason: 'no_attestation' }),
      })
    );
  });

  it('activates normally when the version carries a valid attestation', async () => {
    const { registry, prisma } = createRegistry({
      versionAttestationId: 'att-1',
      attestation: { id: 'att-1', releaseId: 'release-1', buildId: 'build-1' },
    });

    const result = await registry.activateVersion('tavily_search', '1.2.0');

    expect(result.version.id).toBe('v12');
    expect(prisma.capabilityAttestation.findFirst).toHaveBeenCalledWith({
      where: { id: 'att-1' },
    });
    expect(prisma.builtinSkill.update).toHaveBeenCalled();
  });

  it('blocks activation when the referenced attestation no longer exists (hard gate §10.6)', async () => {
    const { registry, prisma, auditService } = createRegistry({ versionAttestationId: 'att-gone' });

    await expect(registry.activateVersion('tavily_search', '1.2.0')).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.stringContaining('no longer exists'),
      }),
    });
    expect(prisma.capabilityAttestation.findFirst).toHaveBeenCalledWith({
      where: { id: 'att-gone' },
    });
    expect(prisma.builtinSkill.update).not.toHaveBeenCalled();
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'activate_version_blocked',
        payload: expect.objectContaining({ reason: 'attestation_missing' }),
      })
    );
  });

  it('rollback goes through the same gate', async () => {
    const { registry, prisma } = createRegistry({
      versionAttestationId: 'att-1',
      attestation: { id: 'att-1' },
    });

    await registry.rollbackVersion('tavily_search', '1.2.0');

    expect(prisma.capabilityAttestation.findFirst).toHaveBeenCalledWith({
      where: { id: 'att-1' },
    });
    expect(prisma.builtinSkill.update).toHaveBeenCalled();
  });

  it('writes an activate_version audit event', async () => {
    const { registry, auditService } = createRegistry({
      versionAttestationId: 'att-1',
      attestation: { id: 'att-1', releaseId: 'release-1', buildId: 'build-1' },
    });

    await registry.activateVersion('tavily_search', '1.2.0');

    expect(auditService.logEvent).toHaveBeenCalledWith({
      builtinSkillId: 'skill-1',
      action: 'activate_version',
      versionId: 'v12',
      payload: { versionStr: '1.2.0' },
    });
  });

  it('throws NotFoundException for unknown skill or version', async () => {
    const prisma = {
      builtinSkill: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const registry = new BuiltinSkillRegistryService(prisma as never, { logEvent: jest.fn() } as never);
    await expect(registry.activateVersion('nope', '1.0.0')).rejects.toThrow('not found');
  });
});
