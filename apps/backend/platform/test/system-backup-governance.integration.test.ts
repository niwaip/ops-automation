import {
  TaskPolicyBackupHandler,
  UserOrgBackupHandler,
  SkillWorkflowBackupHandler,
} from '@ops/system-backup';

describe('SystemBackup Governance & Extended Entities Roundtrip Tests', () => {
  describe('TaskPolicyBackupHandler full roundtrip', () => {
    it('should export and import policySets, recipes, commandAliases, and capabilityBindings with fidelity', async () => {
      const policySets = new Map<string, any>();
      const recipes = new Map<string, any>();
      const aliases = new Map<string, any>();
      const bindings = new Map<string, any>();

      // Seed initial data in source
      policySets.set('ps-1', {
        id: 'ps-1',
        name: 'Default Policy Set',
        scopeType: 'global',
        scopeId: 'all',
        status: 'published',
        version: '1.0.0',
        schemaVersion: '1.0',
        policyJson: {},
        digest: 'sha256:abc',
      });

      recipes.set('rc-1', {
        id: 'rc-1',
        policySetId: 'ps-1',
        recipeKey: 'contract_review',
        version: '1.0.0',
        name: 'Contract Review Recipe',
        requiredCommandsJson: ['read_file', 'analyze'],
      });

      aliases.set('al-1', {
        id: 'al-1',
        policySetId: 'ps-1',
        canonicalCommand: 'review_contract',
        alias: '合同初审',
      });

      bindings.set('cb-1', {
        id: 'cb-1',
        policySetId: 'ps-1',
        capabilityRole: 'reviewer',
        capabilityId: 'cap-legal-v1',
        capabilityVersion: '1.0.0',
      });

      const mockPrisma: any = {
        taskPolicySet: {
          count: async () => policySets.size,
          findMany: async () => Array.from(policySets.values()),
          findUnique: async (args: any) => policySets.get(args.where.id) || null,
          create: async (args: any) => {
            policySets.set(args.data.id, args.data);
            return args.data;
          },
          update: async (args: any) => {
            const current = policySets.get(args.where.id) || {};
            const merged = { ...current, ...args.data };
            policySets.set(args.where.id, merged);
            return merged;
          },
        },
        taskRecipe: {
          count: async () => recipes.size,
          findMany: async () => Array.from(recipes.values()),
          findUnique: async (args: any) => {
            if (args.where.id) return recipes.get(args.where.id) || null;
            if (args.where.policySetId_recipeKey_version) {
              const { policySetId, recipeKey, version } = args.where.policySetId_recipeKey_version;
              for (const r of recipes.values()) {
                if (r.policySetId === policySetId && r.recipeKey === recipeKey && r.version === version) {
                  return r;
                }
              }
            }
            return null;
          },
          create: async (args: any) => {
            recipes.set(args.data.id, args.data);
            return args.data;
          },
          update: async (args: any) => {
            const current = recipes.get(args.where.id) || {};
            const merged = { ...current, ...args.data };
            recipes.set(args.where.id, merged);
            return merged;
          },
        },
        taskCommandAlias: {
          count: async () => aliases.size,
          findMany: async () => Array.from(aliases.values()),
          findUnique: async (args: any) => {
            if (args.where.id) return aliases.get(args.where.id) || null;
            if (args.where.policySetId_canonicalCommand_alias) {
              const { policySetId, canonicalCommand, alias } = args.where.policySetId_canonicalCommand_alias;
              for (const a of aliases.values()) {
                if (a.policySetId === policySetId && a.canonicalCommand === canonicalCommand && a.alias === alias) {
                  return a;
                }
              }
            }
            return null;
          },
          create: async (args: any) => {
            aliases.set(args.data.id, args.data);
            return args.data;
          },
          update: async (args: any) => {
            const current = aliases.get(args.where.id) || {};
            const merged = { ...current, ...args.data };
            aliases.set(args.where.id, merged);
            return merged;
          },
        },
        taskCapabilityBinding: {
          count: async () => bindings.size,
          findMany: async () => Array.from(bindings.values()),
          findUnique: async (args: any) => {
            if (args.where.id) return bindings.get(args.where.id) || null;
            if (args.where.policySetId_capabilityRole_capabilityId_capabilityVersion) {
              const { policySetId, capabilityRole, capabilityId, capabilityVersion } =
                args.where.policySetId_capabilityRole_capabilityId_capabilityVersion;
              for (const b of bindings.values()) {
                if (
                  b.policySetId === policySetId &&
                  b.capabilityRole === capabilityRole &&
                  b.capabilityId === capabilityId &&
                  (b.capabilityVersion || null) === (capabilityVersion || null)
                ) {
                  return b;
                }
              }
            }
            return null;
          },
          create: async (args: any) => {
            bindings.set(args.data.id, args.data);
            return args.data;
          },
          update: async (args: any) => {
            const current = bindings.get(args.where.id) || {};
            const merged = { ...current, ...args.data };
            bindings.set(args.where.id, merged);
            return merged;
          },
        },
      };

      const handler = new TaskPolicyBackupHandler(mockPrisma);

      // 1. Check count
      const totalCount = await handler.count();
      expect(totalCount).toBe(4);

      // 2. Export
      const exported = await handler.export();
      expect(exported.policySets).toHaveLength(1);
      expect(exported.recipes).toHaveLength(1);
      expect(exported.commandAliases).toHaveLength(1);
      expect(exported.capabilityBindings).toHaveLength(1);

      // 3. Clear mock database and import
      policySets.clear();
      recipes.clear();
      aliases.clear();
      bindings.clear();

      const previewResult = await handler.preview(exported);
      expect(previewResult.totalInBackup).toBe(4);
      expect(previewResult.newCount).toBe(4);
      expect(previewResult.conflictCount).toBe(0);

      const importResult = await handler.import(exported, 'merge_override');
      expect(importResult.created).toBe(4);

      // Verify all 4 entities were restored
      expect(policySets.has('ps-1')).toBe(true);
      expect(recipes.get('rc-1')?.name).toBe('Contract Review Recipe');
      expect(aliases.get('al-1')?.alias).toBe('合同初审');
      expect(bindings.get('cb-1')?.capabilityRole).toBe('reviewer');
    });
  });

  describe('UserOrgBackupHandler full roundtrip with Enterprise Legal Profile', () => {
    it('should export and import enterprise legal profile, teams, orgMemberships, and credentials', async () => {
      const users = new Map<string, any>();
      const roles = new Map<string, any>();
      const userRoles = new Map<string, any>();
      const orgs = new Map<string, any>();
      const depts = new Map<string, any>();
      const teams = new Map<string, any>();
      const memberships = new Map<string, any>();
      const credentials = new Map<string, any>();

      // Seed organization with newly added legal profile fields
      orgs.set('org-ent-1', {
        id: 'org-ent-1',
        name: '测试集团有限公司',
        code: 'TEST_CORP',
        type: 'enterprise',
        description: '核心测试集团',
        isActive: true,
        legalEntityName: '测试集团数字科技有限公司',
        aliases: ['测试集团', '数字科技'],
        creditCode: '91110000MA00000000',
        defaultContractRole: 'buyer',
      });

      depts.set('dept-1', {
        id: 'dept-1',
        orgId: 'org-ent-1',
        name: '法务合规部',
        code: 'LEGAL',
        isActive: true,
      });

      teams.set('team-1', {
        id: 'team-1',
        orgId: 'org-ent-1',
        departmentId: 'dept-1',
        name: '合同审核小组',
        code: 'CONTRACT_REVIEW_TEAM',
        isActive: true,
      });

      users.set('u-law-1', {
        id: 'u-law-1',
        username: 'lawyer_wang',
        email: 'wang@test.com',
        role: 'employee',
        isActive: true,
        activeOrgId: 'org-ent-1',
      });

      credentials.set('cred-1', {
        id: 'cred-1',
        userId: 'u-law-1',
        orgId: 'org-ent-1',
        name: 'Tavily Search API Key',
        category: 'api_key',
        encryptedData: 'enc:xyz123',
        maskedPreview: { preview: 'tvly-****' },
        status: 'active',
      });

      const mockPrisma: any = {
        user: {
          count: async () => users.size,
          findMany: async () => Array.from(users.values()),
          findFirst: async (args: any) => {
            const id = args.where.OR?.[0]?.id;
            return users.get(id) || null;
          },
          findUnique: async (args: any) => users.get(args.where.id) || null,
          create: async (args: any) => {
            users.set(args.data.id, args.data);
            return args.data;
          },
          update: async (args: any) => {
            const curr = users.get(args.where.id) || {};
            const merged = { ...curr, ...args.data };
            users.set(args.where.id, merged);
            return merged;
          },
        },
        role: {
          count: async () => roles.size,
          findMany: async () => Array.from(roles.values()),
          findUnique: async (args: any) => roles.get(args.where.name) || null,
          create: async (args: any) => {
            roles.set(args.data.name, args.data);
            return args.data;
          },
          update: async (args: any) => {
            const curr = roles.get(args.where.name) || {};
            const merged = { ...curr, ...args.data };
            roles.set(args.where.name, merged);
            return merged;
          },
        },
        userRole: {
          findMany: async () => Array.from(userRoles.values()),
          upsert: async (args: any) => {
            userRoles.set(`${args.create.userId}_${args.create.roleId}`, args.create);
            return args.create;
          },
        },
        organization: {
          count: async () => orgs.size,
          findMany: async () => Array.from(orgs.values()),
          findUnique: async (args: any) => {
            if (args.where.id) return orgs.get(args.where.id) || null;
            if (args.where.code) {
              for (const o of orgs.values()) {
                if (o.code === args.where.code) return o;
              }
            }
            return null;
          },
          create: async (args: any) => {
            orgs.set(args.data.id, args.data);
            return args.data;
          },
          update: async (args: any) => {
            for (const [id, o] of orgs.entries()) {
              if (o.code === args.where.code) {
                const merged = { ...o, ...args.data };
                orgs.set(id, merged);
                return merged;
              }
            }
            return null;
          },
        },
        department: {
          count: async () => depts.size,
          findMany: async () => Array.from(depts.values()),
          findUnique: async (args: any) => depts.get(args.where.id) || null,
          create: async (args: any) => {
            depts.set(args.data.id, args.data);
            return args.data;
          },
          update: async (args: any) => {
            const curr = depts.get(args.where.id) || {};
            const merged = { ...curr, ...args.data };
            depts.set(args.where.id, merged);
            return merged;
          },
        },
        team: {
          count: async () => teams.size,
          findMany: async () => Array.from(teams.values()),
          findUnique: async (args: any) => {
            if (args.where.id) return teams.get(args.where.id) || null;
            if (args.where.orgId_name) {
              for (const t of teams.values()) {
                if (t.orgId === args.where.orgId_name.orgId && t.name === args.where.orgId_name.name) {
                  return t;
                }
              }
            }
            return null;
          },
          create: async (args: any) => {
            teams.set(args.data.id, args.data);
            return args.data;
          },
          update: async (args: any) => {
            const curr = teams.get(args.where.id) || {};
            const merged = { ...curr, ...args.data };
            teams.set(args.where.id, merged);
            return merged;
          },
        },
        orgMembership: {
          count: async () => memberships.size,
          findMany: async () => Array.from(memberships.values()),
          upsert: async (args: any) => {
            memberships.set(args.create.id, args.create);
            return args.create;
          },
        },
        orgRoleBinding: {
          findMany: async () => [],
          upsert: async () => ({}),
        },
        userCredential: {
          count: async () => credentials.size,
          findMany: async () => Array.from(credentials.values()),
          findUnique: async (args: any) => credentials.get(args.where.id) || null,
          create: async (args: any) => {
            credentials.set(args.data.id, args.data);
            return args.data;
          },
          update: async (args: any) => {
            const curr = credentials.get(args.where.id) || {};
            const merged = { ...curr, ...args.data };
            credentials.set(args.where.id, merged);
            return merged;
          },
        },
        userSkillCredentialBinding: {
          findMany: async () => [],
          upsert: async () => ({}),
        },
      };

      const handler = new UserOrgBackupHandler(mockPrisma);

      // Export
      const exported = await handler.export();
      expect(exported.organizations[0].legalEntityName).toBe('测试集团数字科技有限公司');
      expect(exported.organizations[0].creditCode).toBe('91110000MA00000000');
      expect(exported.teams).toHaveLength(1);
      expect(exported.credentials).toHaveLength(1);

      // Clear & restore
      orgs.clear();
      depts.clear();
      teams.clear();
      users.clear();
      credentials.clear();

      await handler.import(exported, 'merge_override');

      // Verify restored data retains legalEntityName, creditCode, defaultContractRole
      const restoredOrg = Array.from(orgs.values())[0];
      expect(restoredOrg).toBeDefined();
      expect(restoredOrg.legalEntityName).toBe('测试集团数字科技有限公司');
      expect(restoredOrg.creditCode).toBe('91110000MA00000000');
      expect(restoredOrg.defaultContractRole).toBe('buyer');

      // Verify teams and credentials were restored
      expect(teams.has('team-1')).toBe(true);
      expect(teams.get('team-1')?.name).toBe('合同审核小组');
      expect(credentials.has('cred-1')).toBe(true);
    });
  });

  describe('SkillWorkflowBackupHandler permissions and schedules', () => {
    it('should export and import skillPermissions and skillSchedules without data loss', async () => {
      const skills = new Map<string, any>();
      const tools = new Map<string, any>();
      const toolBindings = new Map<string, any>();
      const permissions = new Map<string, any>();
      const schedules = new Map<string, any>();

      skills.set('sk-1', {
        id: 'sk-1',
        name: 'Auto Summary Skill',
        description: 'Auto summary description',
      });

      permissions.set('sk-1_role-admin', {
        skillId: 'sk-1',
        roleId: 'role-admin',
        grantedBy: 'admin',
      });

      schedules.set('sched-1', {
        id: 'sched-1',
        name: 'Daily Summary Schedule',
        skillId: 'sk-1',
        cronExpression: '0 9 * * *',
      });

      const mockPrisma: any = {
        skillConfig: {
          count: async () => skills.size,
          findMany: async () => Array.from(skills.values()),
          findUnique: async (args: any) => {
            if (args.where.id) return skills.get(args.where.id) || null;
            if (args.where.name) {
              for (const s of skills.values()) {
                if (s.name === args.where.name) return s;
              }
            }
            return null;
          },
          create: async (args: any) => {
            skills.set(args.data.id, args.data);
            return args.data;
          },
          update: async (args: any) => {
            const curr = skills.get(args.where.name) || {};
            const merged = { ...curr, ...args.data };
            skills.set(args.where.name, merged);
            return merged;
          },
        },
        toolCatalog: {
          count: async () => tools.size,
          findMany: async () => Array.from(tools.values()),
          findUnique: async () => null,
          create: async () => ({}),
        },
        skillToolBinding: {
          findMany: async () => Array.from(toolBindings.values()),
          findFirst: async () => null,
          create: async () => ({}),
        },
        skillPermission: {
          findMany: async () => Array.from(permissions.values()),
          upsert: async (args: any) => {
            const key = `${args.create.skillId}_${args.create.roleId}`;
            permissions.set(key, args.create);
            return args.create;
          },
        },
        skillSchedule: {
          count: async () => schedules.size,
          findMany: async () => Array.from(schedules.values()),
          findUnique: async (args: any) => schedules.get(args.where.id) || null,
          create: async (args: any) => {
            schedules.set(args.data.id, args.data);
            return args.data;
          },
          update: async (args: any) => {
            const curr = schedules.get(args.where.id) || {};
            const merged = { ...curr, ...args.data };
            schedules.set(args.where.id, merged);
            return merged;
          },
        },
        role: {
          findUnique: async () => ({ id: 'role-admin', name: 'admin' }),
        },
      };

      const handler = new SkillWorkflowBackupHandler(mockPrisma);

      const exported = await handler.exportSkills();
      expect(exported.skillPermissions).toHaveLength(1);
      expect(exported.skillSchedules).toHaveLength(1);

      // Clear & import
      permissions.clear();
      schedules.clear();

      await handler.importSkills(exported, 'merge_override');

      expect(permissions.has('sk-1_role-admin')).toBe(true);
      expect(schedules.has('sched-1')).toBe(true);
      expect(schedules.get('sched-1')?.name).toBe('Daily Summary Schedule');
    });
  });
});
