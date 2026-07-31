import { BuiltinSkillPermissionService } from './builtin-skill-permission.service';

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

  it('should deny access if org deny override exists', async () => {
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
      action: 'discover',
    });

    expect(result.authorized).toBe(false);
    expect(result.reason).toBe('ORG_DENIED');
  });

  it('should prioritize user deny over role allow', async () => {
    mockPrisma.builtinSkillPermissionOverride.findMany.mockResolvedValue([
      {
        principalType: 'user',
        principalId: 'user-123',
        effect: 'deny',
        expiresAt: null,
      },
      {
        principalType: 'role',
        principalId: 'role-admin',
        effect: 'allow',
        expiresAt: null,
      },
    ]);

    const result = await service.authorize({
      capabilityKey: 'platform.document.markdown-artifact-writer',
      userId: 'user-123',
      roleIds: ['role-admin'],
      action: 'execute',
    });

    expect(result.authorized).toBe(false);
    expect(result.reason).toBe('USER_DENIED');
  });
});
