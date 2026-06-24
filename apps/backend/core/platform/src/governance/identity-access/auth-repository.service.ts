import { Injectable } from '@nestjs/common';
import type {
  IdentityAccessAuthRepository,
  IdentityAccessAuthUserRecord,
  IdentityAccessSsoProviderConfigRecord,
  IdentityAccessUserProfileRecord,
} from '@ops/identity-access';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlatformIdentityAccessAuthRepository implements IdentityAccessAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByUsername(username: string): Promise<IdentityAccessAuthUserRecord | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findUserByEmail(email: string): Promise<IdentityAccessAuthUserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findUserById(userId: string): Promise<IdentityAccessAuthUserRecord | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  async updateLastLoginAt(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  async createUser(input: {
    username: string;
    passwordHash: string;
    email?: string;
    role: 'employee' | 'admin' | 'agent';
  }): Promise<IdentityAccessAuthUserRecord> {
    return this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          username: input.username,
          passwordHash: input.passwordHash,
          email: input.email,
          role: input.role,
        },
      });

      let mappedRole = await tx.role.findUnique({
        where: { name: input.role },
      });

      if (!mappedRole) {
        mappedRole = await tx.role.create({
          data: {
            name: input.role,
            description:
              input.role === 'admin'
                ? '系统管理员角色'
                : input.role === 'agent'
                  ? '自动化代理角色'
                  : '普通员工角色',
            permissions: (input.role === 'admin' ? { all_skills: true } : {}) as Record<
              string,
              boolean
            >,
            isSystem: true,
          },
        });
      }

      await tx.userRole.upsert({
        where: {
          userId_roleId: {
            userId: createdUser.id,
            roleId: mappedRole.id,
          },
        },
        update: {},
        create: {
          userId: createdUser.id,
          roleId: mappedRole.id,
        },
      });

      return createdUser;
    });
  }

  async findUserProfile(userId: string): Promise<IdentityAccessUserProfileRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
        orgMemberships: {
          where: {
            status: { in: ['active', 'invited'] },
            organization: {
              isActive: true,
            },
          },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      ...user,
      roles: user.userRoles.map((userRole) => ({
        id: userRole.role.id,
        name: userRole.role.name,
        description: userRole.role.description,
        permissions: userRole.role.permissions as Record<string, boolean>,
        isSystem: userRole.role.isSystem,
      })),
      organizations: user.orgMemberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        code: membership.organization.code,
        membershipId: membership.id,
        status: membership.status,
      })),
    };
  }

  async hasActiveOrganizationMembership(userId: string, orgId: string): Promise<boolean> {
    const membership = await this.prisma.orgMembership.findFirst({
      where: {
        userId,
        orgId,
        status: 'active',
        organization: {
          isActive: true,
        },
      },
      select: { id: true },
    });

    return Boolean(membership);
  }

  async switchActiveOrganization(userId: string, orgId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { activeOrgId: orgId },
    });
  }

  async listEnabledSsoProviders(orgId: string) {
    return this.prisma.identityProviderConfig.findMany({
      where: {
        orgId,
        isEnabled: true,
      },
      select: {
        id: true,
        name: true,
        providerType: true,
        orgId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findSsoProviderConfig(input: {
    provider: string;
    orgId: string;
  }): Promise<IdentityAccessSsoProviderConfigRecord | null> {
    const providerConfig = await this.prisma.identityProviderConfig.findFirst({
      where: {
        orgId: input.orgId,
        isEnabled: true,
        providerType: input.provider === 'microsoft' ? 'microsoft_oidc' : 'oidc',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!providerConfig) {
      return null;
    }

    return {
      id: providerConfig.id,
      orgId: providerConfig.orgId,
      providerType: providerConfig.providerType,
      tenantId: providerConfig.tenantId,
      clientId: providerConfig.clientId,
      authUrl: providerConfig.authUrl,
      scopes: Array.isArray(providerConfig.scopes) ? (providerConfig.scopes as string[]) : [],
    };
  }
}
