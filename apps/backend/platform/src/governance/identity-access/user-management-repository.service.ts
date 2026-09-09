import { Injectable } from '@nestjs/common';
import type {
  IdentityAccessRoleSummaryRecord,
  IdentityAccessUserListResult,
  IdentityAccessUserManagementRepository,
  IdentityAccessUserSummaryRecord,
} from '@ops/identity-access';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlatformIdentityAccessUserManagementRepository
  implements IdentityAccessUserManagementRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(input: {
    page: number;
    pageSize: number;
    role?: string;
  }): Promise<IdentityAccessUserListResult> {
    const skip = (input.page - 1) * input.pageSize;
    const where: Record<string, unknown> = {};

    if (input.role) {
      where.role = input.role;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: input.pageSize,
        select: this.userSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users: users.map((u) => this.mapUserWithOrg(u)), total };
  }

  async findUserById(userId: string): Promise<IdentityAccessUserSummaryRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.userSelect,
    });
    return user ? this.mapUserWithOrg(user) : null;
  }

  async findRolesByNames(roleNames: string[]): Promise<IdentityAccessRoleSummaryRecord[]> {
    return this.prisma.role.findMany({
      where: { name: { in: roleNames } },
      select: {
        id: true,
        name: true,
      },
    });
  }

  async replaceUserRoles(input: {
    userId: string;
    roles: IdentityAccessRoleSummaryRecord[];
    adminId: string;
  }): Promise<void> {
    await this.prisma.userRole.deleteMany({
      where: { userId: input.userId },
    });

    await this.prisma.userRole.createMany({
      data: input.roles.map((role) => ({
        userId: input.userId,
        roleId: role.id,
        assignedBy: input.adminId,
      })),
    });
  }

  async updateUserDepartment(input: {
    userId: string;
    orgId: string;
    departmentId?: string | null;
    title?: string | null;
  }): Promise<void> {
    await this.prisma.orgMembership.upsert({
      where: {
        userId_orgId: {
          userId: input.userId,
          orgId: input.orgId,
        },
      },
      update: {
        departmentId: input.departmentId || null,
        title: input.title || null,
        status: 'active',
      },
      create: {
        userId: input.userId,
        orgId: input.orgId,
        departmentId: input.departmentId || null,
        title: input.title || null,
        status: 'active',
      },
    });

    await this.prisma.user.update({
      where: { id: input.userId },
      data: { activeOrgId: input.orgId },
    });
  }

  async setUserActive(
    userId: string,
    isActive: boolean
  ): Promise<IdentityAccessUserSummaryRecord> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: this.userSelect,
    });
    return this.mapUserWithOrg(updated);
  }

  private mapUserWithOrg(user: any): IdentityAccessUserSummaryRecord {
    const primaryMembership = user.orgMemberships?.find((m: any) => m.status === 'active') || user.orgMemberships?.[0];
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      department: primaryMembership?.department ? {
        id: primaryMembership.department.id,
        name: primaryMembership.department.name,
        code: primaryMembership.department.code,
      } : null,
      organization: primaryMembership?.organization ? {
        id: primaryMembership.organization.id,
        name: primaryMembership.organization.name,
        code: primaryMembership.organization.code,
      } : null,
      title: primaryMembership?.title || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private readonly userSelect = {
    id: true,
    username: true,
    email: true,
    role: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    orgMemberships: {
      where: { status: 'active' as const },
      select: {
        id: true,
        title: true,
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    },
  };
}

