import { BuiltinSkillProvisioningService } from '../src/modules/builtin-skill/provisioning/builtin-skill-provisioning.service';
import { BuiltinSkillPermissionService } from '../src/modules/builtin-skill/permissions/builtin-skill-permission.service';
import { BuiltinSkillManifest } from '@ops/backend-builtin-skill-contract';

describe('BuiltinSkill Platform Module Tests', () => {
  describe('BuiltinSkillProvisioningService', () => {
    let service: BuiltinSkillProvisioningService;
    let mockRegistryService: any;
    let mockAuditService: any;

    beforeEach(() => {
      mockRegistryService = {
        upsertSkillFromManifest: jest.fn().mockResolvedValue({
          skill: { id: 's1', capabilityKey: 'platform.document.markdown-artifact-writer' },
          version: { id: 'v1', definitionVersion: '1.0.0' },
        }),
        markDeployment: jest.fn().mockResolvedValue({}),
        activateVersion: jest.fn().mockResolvedValue({}),
      };
      mockAuditService = {
        logEvent: jest.fn().mockResolvedValue(undefined),
      };

      service = new BuiltinSkillProvisioningService(mockRegistryService, mockAuditService);
    });

    it('should validate a correct manifest', () => {
      const manifest: BuiltinSkillManifest = {
        apiVersion: 'platform.ops/v1alpha1',
        kind: 'BuiltinWorkflowSkill',
        metadata: {
          key: 'platform.document.markdown-artifact-writer',
          displayName: 'Test Writer',
          owner: 'test',
        },
        spec: {
          definitionVersion: '1.0.0',
          lifecycle: 'stable',
          defaultAccess: { mode: 'authenticated' },
          contracts: {
            input: { schema: { type: 'object' } },
            output: { schema: { type: 'object' } },
          },
          runtime: {
            adapterRoute: 'builtin:workflow',
            handlerKey: 'document.markdown-artifact-writer',
          },
        },
      };

      const validated = service.validateManifest(manifest);
      expect(validated.metadata.key).toBe('platform.document.markdown-artifact-writer');
    });

    it('should generate deterministic SHA-256 digest', () => {
      const manifest: any = {
        apiVersion: 'v1',
        kind: 'BuiltinWorkflowSkill',
        metadata: { key: 'platform.test.skill' },
        spec: { definitionVersion: '1.0.0' },
      };
      const digest1 = service.computeManifestDigest(manifest);
      const digest2 = service.computeManifestDigest(manifest);

      expect(digest1).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(digest1).toBe(digest2);
    });
  });

  describe('BuiltinSkillPermissionService', () => {
    let service: BuiltinSkillPermissionService;
    let mockPrisma: any;
    let mockRegistryService: any;

    beforeEach(() => {
      mockPrisma = {
        builtinSkillPermissionOverride: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({ id: 'ovr1' }),
        },
      };
      mockRegistryService = {
        findSkillByKey: jest.fn().mockImplementation((key: string) => {
          if (key === 'platform.document.markdown-artifact-writer') {
            return {
              id: 'skill-1',
              capabilityKey: 'platform.document.markdown-artifact-writer',
              defaultAccess: 'authenticated',
              isEnabled: true,
            };
          }
          return null;
        }),
      };

      service = new BuiltinSkillPermissionService(mockPrisma, mockRegistryService);
    });

    it('should allow authenticated users by default', async () => {
      const result = await service.authorize({
        capabilityKey: 'platform.document.markdown-artifact-writer',
        userId: 'user-123',
        action: 'discover',
      });

      expect(result.authorized).toBe(true);
      expect(result.reason).toBe('DEFAULT_AUTHENTICATED_ACCESS');
    });

    it('should deny access if org-wide deny override exists', async () => {
      mockPrisma.builtinSkillPermissionOverride.findMany.mockResolvedValue([
        {
          orgId: 'org-blocked',
          principalType: 'org',
          principalId: 'org-blocked',
          effect: 'deny',
          expiresAt: null,
        },
      ]);

      const result = await service.authorize({
        capabilityKey: 'platform.document.markdown-artifact-writer',
        userId: 'user-123',
        orgId: 'org-blocked',
        action: 'discover',
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('ORG_DENIED');
    });

    it('should deny access if role-based org deny override matches user role', async () => {
      mockPrisma.builtinSkillPermissionOverride.findMany.mockResolvedValue([
        {
          orgId: 'org-blocked',
          principalType: 'role',
          principalId: 'r1',
          effect: 'deny',
          expiresAt: null,
        },
      ]);

      const result = await service.authorize({
        capabilityKey: 'platform.document.markdown-artifact-writer',
        userId: 'user-123',
        orgId: 'org-blocked',
        roleIds: ['r1'],
        action: 'discover',
      });

      expect(result.authorized).toBe(false);
      expect(result.reason).toBe('ORG_DENIED');
    });
  });
});
