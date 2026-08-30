import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  BackupConflictItem,
  BackupImportStrategy,
  BackupModulePreview,
} from '../interfaces/system-backup.interface';

@Injectable()
export class UserOrgBackupHandler {
  private readonly logger = new Logger(UserOrgBackupHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async count(): Promise<number> {
    const [userCount, orgCount] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.organization.count(),
    ]);
    return userCount + orgCount;
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
    ] = await Promise.all([
      this.prisma.user.findMany(),
      this.prisma.role.findMany(),
      this.prisma.userRole.findMany(),
      this.prisma.organization.findMany(),
      this.prisma.department.findMany(),
      this.prisma.team.findMany(),
      this.prisma.orgMembership.findMany(),
      this.prisma.orgRoleBinding.findMany(),
    ]);

    return {
      users,
      roles,
      userRoles,
      organizations,
      departments,
      teams,
      orgMemberships,
      orgRoleBindings,
    };
  }

  async preview(backupData?: {
    users?: any[];
    organizations?: any[];
  }): Promise<BackupModulePreview> {
    const backupUsers = backupData?.users || [];
    const currentUsers = await this.prisma.user.findMany({
      select: { id: true, username: true, email: true },
    });
    const currentMap = new Map<string, any>();
    for (const u of currentUsers) {
      currentMap.set(u.id, u);
      if (u.username) currentMap.set(`username:${u.username}`, u);
      if (u.email) currentMap.set(`email:${u.email}`, u);
    }

    const items: BackupConflictItem[] = [];
    let newCount = 0;
    let conflictCount = 0;

    for (const item of backupUsers) {
      const id = item.id;
      const name = item.username || item.email || id;
      const exists =
        currentMap.has(id) ||
        currentMap.has(`username:${item.username}`) ||
        (item.email && currentMap.has(`email:${item.email}`));

      if (exists) {
        conflictCount += 1;
        items.push({
          key: id,
          name: `User: ${name}`,
          existsInTarget: true,
          action: 'update',
        });
      } else {
        newCount += 1;
        items.push({
          key: id,
          name: `User: ${name}`,
          existsInTarget: false,
          action: 'create',
        });
      }
    }

    return {
      moduleKey: 'userOrganizations',
      totalInBackup: backupUsers.length,
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
      }
    }

    // 2. Organizations
    const orgs = backupData.organizations || [];
    for (const org of orgs) {
      if (!org.code) continue;
      const existing = await this.prisma.organization.findUnique({ where: { code: org.code } });
      if (existing) {
        if (strategy === 'merge_override') {
          await this.prisma.organization.update({
            where: { code: org.code },
            data: {
              name: org.name,
              type: org.type,
              description: org.description,
              isActive: org.isActive,
            },
          });
        }
      } else {
        await this.prisma.organization.create({
          data: {
            id: org.id,
            code: org.code,
            name: org.name,
            type: org.type || 'enterprise',
            description: org.description,
            isActive: org.isActive ?? true,
          },
        });
      }
    }

    // 3. Departments
    const depts = backupData.departments || [];
    for (const d of depts) {
      if (!d.id || !d.orgId || !d.name) continue;
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
      }
    }

    // 4. Users
    const users = backupData.users || [];
    for (const u of users) {
      if (!u.username) continue;
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
    }

    // 5. User Roles Junction
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

    return { created, updated, skipped };
  }
}
