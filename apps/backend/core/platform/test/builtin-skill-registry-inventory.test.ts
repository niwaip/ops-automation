import { BuiltinSkillRegistryService } from '../src/modules/builtin-skill/registry/builtin-skill-registry.service';

describe('BuiltinSkillRegistryService inventory', () => {
  it('returns active deployment details and keeps inactive skills visible', async () => {
    const activeVersion = {
      id: 'version-1',
      definitionVersion: '1.0.0',
      apiVersion: 'platform.ops/v1alpha1',
      definitionDigest: 'sha256:digest',
      runtimeBuild: 'document.content-extractor.pdf',
      attestationId: 'attestation-1',
      manifestJson: { spec: { planner: { triggerKeywords: ['解析PDF'] } } },
      deployments: [
        {
          environment: 'development',
          status: 'healthy',
          smokeTestStatus: 'passed',
          failureCode: null,
          deployedAt: new Date('2026-08-13T00:00:00.000Z'),
        },
      ],
      createdAt: new Date('2026-08-13T00:00:00.000Z'),
    };
    const prisma = {
      builtinSkill: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'skill-1',
            capabilityKey: 'platform.document.pdf-content-extractor',
            displayName: '内置 PDF 内容提取',
            description: '提取 PDF 文本层',
            owner: 'platform-document',
            category: 'extraction',
            defaultAccess: 'authenticated',
            lifecycle: 'experimental',
            isEnabled: true,
            activeVersionId: activeVersion.id,
            versions: [activeVersion],
            createdAt: new Date('2026-08-13T00:00:00.000Z'),
            updatedAt: new Date('2026-08-13T00:00:00.000Z'),
          },
          {
            id: 'skill-2',
            capabilityKey: 'platform.test.inactive',
            displayName: 'Inactive',
            description: null,
            owner: 'platform',
            category: 'test',
            defaultAccess: 'restricted',
            lifecycle: 'experimental',
            isEnabled: false,
            activeVersionId: null,
            versions: [],
            createdAt: new Date('2026-08-13T00:00:00.000Z'),
            updatedAt: new Date('2026-08-13T00:00:00.000Z'),
          },
        ]),
      },
    };
    const service = new BuiltinSkillRegistryService(prisma as any, {} as any);

    const inventory = await service.listSkillInventory();

    expect(inventory).toHaveLength(2);
    expect(inventory[0].activeVersion?.definitionVersion).toBe('1.0.0');
    expect(inventory[0].activeVersion?.deployments[0].status).toBe('healthy');
    expect(inventory[0].aliases).toEqual([]);
    expect(inventory[1].isEnabled).toBe(false);
    expect(inventory[1].activeVersion).toBeNull();
  });
});
