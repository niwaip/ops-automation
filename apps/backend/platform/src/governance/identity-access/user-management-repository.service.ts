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

    return { users, total };
  }

  async findUserById(userId: string): Promise<IdentityAccessUserSummaryRecord | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: this.userSelect,
    });
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

  async setUserActive(
    userId: string,
    isActive: boolean
  ): Promise<IdentityAccessUserSummaryRecord> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: this.userSelect,
    });
  }

  private readonly userSelect = {
    id: true,
    username: true,
    email: true,
    role: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  };
}
