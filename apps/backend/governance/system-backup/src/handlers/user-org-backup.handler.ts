import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_BACKUP_PRISMA, SystemBackupPrismaPort } from '../ports';
import {
  BackupConflictItem,
  BackupImportStrategy,
  BackupModulePreview,
} from '../interfaces/system-backup.interface';

@Injectable()
export class UserOrgBackupHandler {
  private readonly logger = new Logger(UserOrgBackupHandler.name);

  constructor(
    @Inject(SYSTEM_BACKUP_PRISMA) private readonly prisma: SystemBackupPrismaPort
  ) {}

  async count(): Promise<number> {
    const [userCount, orgCount, roleCount, deptCount, teamCount, credCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.organization.count(),
      this.prisma.role ? this.prisma.role.count() : 0,
      this.prisma.department ? this.prisma.department.count() : 0,
      this.prisma.team ? this.prisma.team.count() : 0,
      this.prisma.userCredential ? this.prisma.userCredential.count() : 0,
    ]);
    return userCount + orgCount + roleCount + deptCount + teamCount + credCount;
  }

  async export(): Promise<{
    users: any[];
    roles: any[];
    userRoles: any[];
    organizations: any[];
    departments: any[];
    teams: any[];
    orgMemberships: any[];
    orgRoleBindings: any[];
    credentials: any[];
    skillCredentialBindings: any[];
  }> {
    const [
      users,
      roles,
      userRoles,
      organizations,
      departments,
      teams,
      orgMemberships,
      orgRoleBindings,
      credentials,
      skillCredentialBindings,
    ] = await Promise.all([
      this.prisma.user.findMany(),
      this.prisma.role.findMany(),
      this.prisma.userRole.findMany(),
      this.prisma.organization.findMany(),
      this.prisma.department.findMany(),
      this.prisma.team ? this.prisma.team.findMany() : [],
      this.prisma.orgMembership ? this.prisma.orgMembership.findMany() : [],
      this.prisma.orgRoleBinding ? this.prisma.orgRoleBinding.findMany() : [],
      this.prisma.userCredential ? this.prisma.userCredential.findMany() : [],
      this.prisma.userSkillCredentialBinding
        ? this.prisma.userSkillCredentialBinding.findMany()
        : [],
    ]);

    return {
      users,
      roles,
      userRoles,
      organizations,
      departments,
      teams: Array.isArray(teams) ? teams : [],
      orgMemberships: Array.isArray(orgMemberships) ? orgMemberships : [],
      orgRoleBindings: Array.isArray(orgRoleBindings) ? orgRoleBindings : [],
      credentials: Array.isArray(credentials) ? credentials : [],
      skillCredentialBindings: Array.isArray(skillCredentialBindings)
        ? skillCredentialBindings
        : [],
    };
  }

  async preview(backupData?: {
    users?: any[];
    organizations?: any[];
    roles?: any[];
    departments?: any[];
    teams?: any[];
    credentials?: any[];
  }): Promise<BackupModulePreview> {
    const backupUsers = backupData?.users || [];
    const backupOrgs = backupData?.organizations || [];
    const backupDepts = backupData?.departments || [];
    const backupTeams = backupData?.teams || [];
    const backupRoles = backupData?.roles || [];
    const backupCreds = backupData?.credentials || [];

    const allItems = [
      ...backupUsers.map((u) => ({ ...u, _type: 'User' })),
      ...backupOrgs.map((o) => ({ ...o, _type: 'Organization' })),
      ...backupRoles.map((r) => ({ ...r, _type: 'Role' })),
      ...backupDepts.map((d) => ({ ...d, _type: 'Department' })),
      ...backupTeams.map((t) => ({ ...t, _type: 'Team' })),
      ...backupCreds.map((c) => ({ ...c, _type: 'Credential' })),
    ];

    const currentMap = new Map<string, any>();
    try {
      const [currentUsers, currentOrgs, currentRoles] = await Promise.all([
        this.prisma.user.findMany({ select: { id: true, username: true, email: true } }),
        this.prisma.organization.findMany({ select: { id: true, code: true, name: true } }),
        this.prisma.role ? this.prisma.role.findMany({ select: { id: true, name: true } }) : [],
      ]);

      for (const u of currentUsers) {
        currentMap.set(`user:${u.id}`, u);
        if (u.username) currentMap.set(`user:username:${u.username}`, u);
        if (u.email) currentMap.set(`user:email:${u.email}`, u);
      }
      for (const o of currentOrgs) {
        currentMap.set(`org:${o.id}`, o);
        if (o.code) currentMap.set(`org:code:${o.code}`, o);
      }
      for (const r of currentRoles) {
        currentMap.set(`role:${r.id}`, r);
        if (r.name) currentMap.set(`role:name:${r.name}`, r);
      }

      if (this.prisma.department) {
        const depts = await this.prisma.department.findMany({ select: { id: true, orgId: true, name: true } });
        for (const d of depts) {
          currentMap.set(`dept:${d.id}`, d);
          currentMap.set(`dept:${d.orgId}:${d.name}`, d);
        }
      }

      if (this.prisma.team) {
        const teams = await this.prisma.team.findMany({ select: { id: true, orgId: true, name: true } });
        for (const t of teams) {
          currentMap.set(`team:${t.id}`, t);
          currentMap.set(`team:${t.orgId}:${t.name}`, t);
        }
      }

      if (this.prisma.userCredential) {
        const creds = await this.prisma.userCredential.findMany({ select: { id: true, name: true, userId: true } });
        for (const c of creds) {
          currentMap.set(`cred:${c.id}`, c);
          currentMap.set(`cred:${c.userId}:${c.name}`, c);
        }
      }
    } catch (err) {
      this.logger.debug(`Error reading existing org data for preview: ${err}`);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of allItems) {
      const id = item.id;
      let name = item.username || item.name || item.code || item.email || id;
      let exists = false;

      if (item._type === 'User') {
        exists =
          currentMap.has(`user:${id}`) ||
          (item.username && currentMap.has(`user:username:${item.username}`)) ||
          (item.email && currentMap.has(`user:email:${item.email}`));
      } else if (item._type === 'Organization') {
        exists = currentMap.has(`org:${id}`) || (item.code && currentMap.has(`org:code:${item.code}`));
      } else if (item._type === 'Role') {
        exists = currentMap.has(`role:${id}`) || (item.name && currentMap.has(`role:name:${item.name}`));
      } else if (item._type === 'Department') {
        exists = currentMap.has(`dept:${id}`) || (item.orgId && item.name && currentMap.has(`dept:${item.orgId}:${item.name}`));
      } else if (item._type === 'Team') {
        exists = currentMap.has(`team:${id}`) || (item.orgId && item.name && currentMap.has(`team:${item.orgId}:${item.name}`));
      } else if (item._type === 'Credential') {
        exists = currentMap.has(`cred:${id}`) || (item.userId && item.name && currentMap.has(`cred:${item.userId}:${item.name}`));
      }

      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `${item._type}: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `${item._type}: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'userOrganizations',
      totalInBackup: allItems.length,
      newCount,
      conflictCount,
      items,
    };
  }

  async import(
    backupData: {
      users?: any[];
      roles?: any[];
      userRoles?: any[];
      organizations?: any[];
      departments?: any[];
      teams?: any[];
      orgMemberships?: any[];
      orgRoleBindings?: any[];
      credentials?: any[];
      skillCredentialBindings?: any[];
    },
    strategy: BackupImportStrategy
  ): Promise<{ created: number; updated: number; skipped: number }> {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // 1. Roles
    const roles = backupData.roles || [];
    for (const r of roles) {
      if (!r.name) continue;
      try {
        const existing = await this.prisma.role.findUnique({ where: { name: r.name } });
        if (existing) {
          if (strategy === 'merge_override') {
            await this.prisma.role.update({
              where: { name: r.name },
              data: {
                description: r.description,
                permissions: r.permissions,
                isSystem: r.isSystem,
              },
            });
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await this.prisma.role.create({
            data: {
              id: r.id,
              name: r.name,
              description: r.description,
              permissions: r.permissions || {},
              isSystem: r.isSystem ?? false,
            },
          });
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import role ${r.name}: ${err}`);
        skipped += 1;
      }
    }

    // 2. Organizations (aligned with latest schema including legal profile)
    const orgs = backupData.organizations || [];
    for (const org of orgs) {
      if (!org.code) continue;
      try {
        const existing = await this.prisma.organization.findUnique({ where: { code: org.code } });
        const orgData = {
          name: org.name,
          type: org.type || 'enterprise',
          description: org.description,
          isActive: org.isActive ?? true,
          legalEntityName: org.legalEntityName || null,
          aliases: Array.isArray(org.aliases) ? org.aliases : [],
          creditCode: org.creditCode || null,
          defaultContractRole: org.defaultContractRole || 'seller',
        };

        if (existing) {
          if (strategy === 'merge_override') {
            await this.prisma.organization.update({
              where: { code: org.code },
              data: orgData,
            });
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await this.prisma.organization.create({
            data: {
              id: org.id,
              code: org.code,
              ...orgData,
            },
          });
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import organization ${org.code}: ${err}`);
        skipped += 1;
      }
    }

    // 3. Departments
    const depts = backupData.departments || [];
    for (const d of depts) {
      if (!d.id || !d.orgId || !d.name) continue;
      try {
        const orgExists = await this.prisma.organization.findUnique({ where: { id: d.orgId } });
        if (!orgExists) continue;

        const existing = await this.prisma.department.findUnique({ where: { id: d.id } });
        if (existing) {
          if (strategy === 'merge_override') {
            await this.prisma.department.update({
              where: { id: d.id },
              data: {
                name: d.name,
                code: d.code,
                isActive: d.isActive,
              },
            });
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await this.prisma.department.create({
            data: {
              id: d.id,
              orgId: d.orgId,
              parentId: d.parentId,
              name: d.name,
              code: d.code,
              isActive: d.isActive ?? true,
            },
          });
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import department ${d.name}: ${err}`);
        skipped += 1;
      }
    }

    // 4. Teams
    const teams = backupData.teams || [];
    for (const t of teams) {
      if (!t.id || !t.orgId || !t.name) continue;
      try {
        if (!this.prisma.team) continue;
        const orgExists = await this.prisma.organization.findUnique({ where: { id: t.orgId } });
        if (!orgExists) continue;

        let existing = await this.prisma.team.findUnique({ where: { id: t.id } });
        if (!existing) {
          existing = await this.prisma.team.findUnique({
            where: {
              orgId_name: {
                orgId: t.orgId,
                name: t.name,
              },
            },
          });
        }

        if (existing) {
          if (strategy === 'merge_override') {
            await this.prisma.team.update({
              where: { id: existing.id },
              data: {
                name: t.name,
                code: t.code,
                departmentId: t.departmentId,
                leadUserId: t.leadUserId,
                isActive: t.isActive ?? true,
              },
            });
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await this.prisma.team.create({
            data: {
              id: t.id,
              orgId: t.orgId,
              departmentId: t.departmentId,
              name: t.name,
              code: t.code,
              leadUserId: t.leadUserId,
              isActive: t.isActive ?? true,
            },
          });
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import team ${t.name}: ${err}`);
        skipped += 1;
      }
    }

    // 5. Users
    const users = backupData.users || [];
    for (const u of users) {
      if (!u.username) continue;
      try {
        const existing = await this.prisma.user.findFirst({
          where: {
            OR: [{ id: u.id }, { username: u.username }, ...(u.email ? [{ email: u.email }] : [])],
          },
        });

        if (existing) {
          if (strategy === 'merge_override') {
            await this.prisma.user.update({
              where: { id: existing.id },
              data: {
                username: u.username,
                email: u.email,
                role: u.role,
                passwordHash: u.passwordHash,
                isActive: u.isActive,
                activeOrgId: u.activeOrgId,
              },
            });
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await this.prisma.user.create({
            data: {
              id: u.id,
              username: u.username,
              email: u.email,
              passwordHash: u.passwordHash || '$2b$10$defaultHashPlaceholder',
              role: u.role || 'employee',
              isActive: u.isActive ?? true,
              activeOrgId: u.activeOrgId,
            },
          });
          created += 1;
        }
      } catch (err) {
        this.logger.warn(`Failed to import user ${u.username}: ${err}`);
        skipped += 1;
      }
    }

    // 6. User Roles Junction
    const userRoles = backupData.userRoles || [];
    for (const ur of userRoles) {
      if (!ur.userId || !ur.roleId) continue;
      try {
        await this.prisma.userRole.upsert({
          where: {
            userId_roleId: {
              userId: ur.userId,
              roleId: ur.roleId,
            },
          },
          create: {
            userId: ur.userId,
            roleId: ur.roleId,
            assignedBy: ur.assignedBy,
          },
          update: {},
        });
      } catch (err) {
        this.logger.debug(`UserRole binding skipped: ${err}`);
      }
    }

    // 7. Org Memberships
    const memberships = backupData.orgMemberships || [];
    for (const m of memberships) {
      if (!m.id || !m.userId || !m.orgId) continue;
      try {
        if (!this.prisma.orgMembership) continue;
        const [uExists, oExists] = await Promise.all([
          this.prisma.user.findUnique({ where: { id: m.userId } }),
          this.prisma.organization.findUnique({ where: { id: m.orgId } }),
        ]);
        if (!uExists || !oExists) continue;

        await this.prisma.orgMembership.upsert({
          where: {
            userId_orgId: {
              userId: m.userId,
              orgId: m.orgId,
            },
          },
          create: {
            id: m.id,
            userId: m.userId,
            orgId: m.orgId,
            departmentId: m.departmentId,
            title: m.title,
            status: m.status || 'active',
            joinedAt: m.joinedAt || new Date(),
          },
          update: {
            departmentId: m.departmentId,
            title: m.title,
            status: m.status || 'active',
          },
        });
      } catch (err) {
        this.logger.debug(`OrgMembership binding skipped: ${err}`);
      }
    }

    // 8. Org Role Bindings
    const roleBindings = backupData.orgRoleBindings || [];
    for (const rb of roleBindings) {
      if (!rb.id || !rb.orgId || !rb.membershipId || !rb.roleId) continue;
      try {
        if (!this.prisma.orgRoleBinding) continue;
        const [mExists, rExists] = await Promise.all([
          this.prisma.orgMembership.findUnique({ where: { id: rb.membershipId } }),
          this.prisma.role.findUnique({ where: { id: rb.roleId } }),
        ]);
        if (!mExists || !rExists) continue;

        await this.prisma.orgRoleBinding.upsert({
          where: {
            membershipId_roleId_scopeType_scopeRefId: {
              membershipId: rb.membershipId,
              roleId: rb.roleId,
              scopeType: rb.scopeType || 'organization',
              scopeRefId: rb.scopeRefId || null,
            },
          },
          create: {
            id: rb.id,
            orgId: rb.orgId,
            membershipId: rb.membershipId,
            roleId: rb.roleId,
            scopeType: rb.scopeType || 'organization',
            scopeRefId: rb.scopeRefId || null,
            assignedBy: rb.assignedBy,
          },
          update: {
            assignedBy: rb.assignedBy,
          },
        });
      } catch (err) {
        this.logger.debug(`OrgRoleBinding skipped: ${err}`);
      }
    }

    // 9. User Credentials
    const credentials = backupData.credentials || [];
    for (const c of credentials) {
      if (!c.id || !c.userId) continue;
      try {
        if (!this.prisma.userCredential) continue;
        const userExists = await this.prisma.user.findUnique({ where: { id: c.userId } });
        if (!userExists) continue;

        const exists = await this.prisma.userCredential.findUnique({
          where: { id: c.id },
        });
        if (!exists) {
          await this.prisma.userCredential.create({
            data: c,
          });
          created += 1;
        } else if (strategy === 'merge_override') {
          const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = c;
          await this.prisma.userCredential.update({
            where: { id },
            data: rest,
          });
          updated += 1;
        } else {
          skipped += 1;
        }
      } catch (err) {
        this.logger.debug(`UserCredential import skipped: ${err}`);
      }
    }

    // 10. User Skill Credential Bindings
    const skillCredBindings = backupData.skillCredentialBindings || [];
    for (const scb of skillCredBindings) {
      if (!scb.id || !scb.userId || !scb.skillId || !scb.paramName || !scb.credentialId) continue;
      try {
        if (!this.prisma.userSkillCredentialBinding) continue;
        const [uExists, cExists] = await Promise.all([
          this.prisma.user.findUnique({ where: { id: scb.userId } }),
          this.prisma.userCredential.findUnique({ where: { id: scb.credentialId } }),
        ]);
        if (!uExists || !cExists) continue;

        await this.prisma.userSkillCredentialBinding.upsert({
          where: {
            userId_skillId_paramName: {
              userId: scb.userId,
              skillId: scb.skillId,
              paramName: scb.paramName,
            },
          },
          create: {
            id: scb.id,
            userId: scb.userId,
            skillId: scb.skillId,
            paramName: scb.paramName,
            credentialId: scb.credentialId,
          },
          update: {
            credentialId: scb.credentialId,
          },
        });
      } catch (err) {
        this.logger.debug(`UserSkillCredentialBinding skipped: ${err}`);
      }
    }

    return { created, updated, skipped };
  }
}
