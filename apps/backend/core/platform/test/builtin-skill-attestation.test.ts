import { BuiltinSkillRegistryService } from '../src/modules/builtin-skill/registry/builtin-skill-registry.service';

describe('Builtin skill bundle attestation', () => {
  it('binds a provisioned version to source, contract, runtime, and fixture digests', async () => {
    const prisma = {
      builtinSkillVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'version-1',
          builtinSkillId: 'skill-1',
          definitionVersion: '1.0.0',
          attestationId: null,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'version-1',
          builtinSkillId: 'skill-1',
          definitionVersion: '1.0.0',
          attestationId: 'attestation-1',
        }),
      },
      capabilityAttestation: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'attestation-1' }),
      },
    };
    const auditService = { logEvent: jest.fn().mockResolvedValue(undefined) };
    const registry = new BuiltinSkillRegistryService(prisma as never, auditService as never);

    const version = await registry.attestVersion({
      builtinSkillId: 'skill-1',
      builtinSkillVersionId: 'version-1',
      sourceDigest: 'sha256:source',
      contractDigest: 'sha256:contract',
      runtimeDigest: 'sha256:runtime',
      fixtureDigest: 'sha256:fixture',
    });

    expect(prisma.capabilityAttestation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        releaseId: 'skill-1',
        buildId: 'version-1',
        sourceDigest: 'sha256:source',
        contractDigest: 'sha256:contract',
        generatedCodeDigest: 'sha256:runtime',
        fixtureDigest: 'sha256:fixture',
        gateResultsJson: {
          tests: expect.objectContaining({ sandbox: 'passed' }),
        },
      }),
    });
    expect(prisma.builtinSkillVersion.update).toHaveBeenCalledWith({
      where: { id: 'version-1' },
      data: { attestationId: 'attestation-1' },
    });
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'attestation_created' })
    );
    expect(version.attestationId).toBe('attestation-1');
  });

  it('reuses an existing attestation when provisioning is repeated', async () => {
    const existingVersion = {
      id: 'version-1',
      builtinSkillId: 'skill-1',
      definitionVersion: '1.0.0',
      attestationId: 'attestation-1',
    };
    const prisma = {
      builtinSkillVersion: {
        findUnique: jest.fn().mockResolvedValue(existingVersion),
        update: jest.fn(),
      },
      capabilityAttestation: {
        findUnique: jest.fn().mockResolvedValue({ id: 'attestation-1' }),
        create: jest.fn(),
      },
    };
    const registry = new BuiltinSkillRegistryService(
      prisma as never,
      { logEvent: jest.fn() } as never
    );

    const result = await registry.attestVersion({
      builtinSkillId: 'skill-1',
      builtinSkillVersionId: 'version-1',
      sourceDigest: 'sha256:source',
      contractDigest: 'sha256:contract',
      runtimeDigest: 'sha256:runtime',
    });

    expect(result).toBe(existingVersion);
    expect(prisma.capabilityAttestation.create).not.toHaveBeenCalled();
    expect(prisma.builtinSkillVersion.update).not.toHaveBeenCalled();
  });
});
