import { BuiltinSkillProvisioningService } from './builtin-skill-provisioning.service';
import { BuiltinSkillManifest } from '@ops/backend-builtin-skill-contract';

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

  describe('validateManifest', () => {
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

    it('should throw on invalid key format', () => {
      const invalidManifest = {
        apiVersion: 'platform.ops/v1alpha1',
        kind: 'BuiltinWorkflowSkill',
        metadata: { key: 'invalid-key-format' },
        spec: { definitionVersion: '1.0.0', runtime: { handlerKey: 'h1' } },
      };

      expect(() => service.validateManifest(invalidManifest)).toThrow();
    });
  });

  describe('computeManifestDigest', () => {
    it('should generate deterministic SHA-256 digest', () => {
      const manifest: any = {
        kind: 'BuiltinWorkflowSkill',
        metadata: { key: 'platform.test.skill' },
      };
      const digest1 = service.computeManifestDigest(manifest);
      const digest2 = service.computeManifestDigest(manifest);

      expect(digest1).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(digest1).toBe(digest2);
    });
  });
});
