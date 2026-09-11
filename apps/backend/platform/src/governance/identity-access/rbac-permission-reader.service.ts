import { ForbiddenException, Injectable } from '@nestjs/common';
import type { RbacPermissionReader, RbacPermissionResolution } from '@ops/identity-access';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlatformRbacPermissionReader implements RbacPermissionReader {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePermissions(input: {
    userId: string;
    requestedOrgId?: string | null;
  }): Promise<RbacPermissionResolution> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: input.userId },
      include: { role: true },
    });

    const permissions = new Set<string>();

    for (const userRole of userRoles) {
      this.collectPermissions(userRole.role.permissions as Record<string, boolean>, permissions);
    }

    if (!input.requestedOrgId) {
      return { permissions: [...permissions] };
    }

    const membership = await this.prisma.orgMembership.findFirst({
      where: {
        userId: input.userId,
        orgId: input.requestedOrgId,
        status: 'active',
        organization: {
          isActive: true,
        },
      },
      include: {
        roleBindings: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Invalid organization context');
    }

    for (const binding of membership.roleBindings) {
      this.collectPermissions(binding.role.permissions as Record<string, boolean>, permissions);
    }

    return {
      permissions: [...permissions],
      orgContext: {
        orgId: input.requestedOrgId,
        membershipId: membership.id,
      },
    };
  }

  private collectPermissions(
    permissionMap: Record<string, boolean>,
    permissions: Set<string>
  ): void {
    for (const permission of Object.keys(permissionMap)) {
      if (permissionMap[permission]) {
        permissions.add(permission);
      }
    }
  }
}
