import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AddOrganizationMemberDto,
  CreateDepartmentDto,
  CreateOrganizationDto,
  CreateTeamDto,
  OrganizationRepository,
  OrganizationStructureRecord,
} from '@ops/organization';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlatformOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrganization(dto: CreateOrganizationDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.name,
          code: dto.code.toUpperCase(),
          description: dto.description,
        },
      });

      const membership = await tx.orgMembership.create({
        data: {
          userId: actorUserId,
          orgId: organization.id,
          status: 'active',
          joinedAt: new Date(),
        },
      });

      const adminRole = await tx.role.findFirst({
        where: { name: 'admin' },
      });

      if (adminRole) {
        await tx.orgRoleBinding.create({
          data: {
            orgId: organization.id,
            membershipId: membership.id,
            roleId: adminRole.id,
            scopeType: 'organization',
            scopeRefId: organization.id,
            assignedBy: actorUserId,
          },
        });
      }

      await tx.user.update({
        where: { id: actorUserId },
        data: { activeOrgId: organization.id },
      });

      return organization;
    });
  }

  async listMyOrganizations(userId: string) {
    const memberships = await this.prisma.orgMembership.findMany({
      where: {
        userId,
        status: { in: ['active', 'invited'] },
        organization: { isActive: true },
      },
      include: {
        organization: true,
      },
      orderBy: {
        organization: {
          name: 'asc',
        },
      },
    });

    return memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      code: membership.organization.code,
      status: membership.status,
      membershipId: membership.id,
      departmentId: membership.departmentId,
    }));
  }

  async getOrganizationStructure(orgId: string): Promise<OrganizationStructureRecord | null> {
    return this.prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        departments: {
          orderBy: { name: 'asc' },
        },
        teams: {
          orderBy: { name: 'asc' },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                isActive: true,
              },
            },
            roleBindings: {
              include: {
                role: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        identityProviders: {
          where: { isEnabled: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    }) as Promise<OrganizationStructureRecord | null>;
  }

  async createDepartment(orgId: string, dto: CreateDepartmentDto) {
    await this.ensureOrganizationExists(orgId);

    return this.prisma.department.create({
      data: {
        orgId,
        name: dto.name,
        code: dto.code,
        parentId: dto.parentId,
      },
    });
  }

  async createTeam(orgId: string, dto: CreateTeamDto) {
    await this.ensureOrganizationExists(orgId);

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: {
          id: dto.departmentId,
          orgId,
        },
      });
      if (!department) {
        throw new BadRequestException('Department does not belong to organization');
      }
    }

    return this.prisma.team.create({
      data: {
        orgId,
        departmentId: dto.departmentId,
        name: dto.name,
        code: dto.code,
      },
    });
  }

  async addMember(orgId: string, dto: AddOrganizationMemberDto, actorUserId: string) {
    await this.ensureOrganizationExists(orgId);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) {
      throw new BadRequestException('Target user not found or inactive');
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findFirst({
        where: {
          id: dto.departmentId,
          orgId,
        },
      });
      if (!department) {
        throw new BadRequestException('Department does not belong to organization');
      }
    }

    const membership = await this.prisma.orgMembership.upsert({
      where: {
        userId_orgId: {
          userId: dto.userId,
          orgId,
        },
      },
      update: {
        departmentId: dto.departmentId,
        title: dto.title,
        status: 'active',
      },
      create: {
        userId: dto.userId,
        orgId,
        departmentId: dto.departmentId,
        title: dto.title,
        status: 'active',
        joinedAt: new Date(),
      },
    });

    if (dto.teamIds && dto.teamIds.length > 0) {
      const teams = await this.prisma.team.findMany({
        where: {
          id: { in: dto.teamIds },
          orgId,
        },
        select: { id: true },
      });

      if (teams.length !== dto.teamIds.length) {
        throw new BadRequestException('Some teams do not belong to organization');
      }

      await this.prisma.teamMembership.createMany({
        data: teams.map((team) => ({
          orgMembershipId: membership.id,
          teamId: team.id,
        })),
        skipDuplicates: true,
      });
    }

    if (dto.roleNames && dto.roleNames.length > 0) {
      const roles = await this.prisma.role.findMany({
        where: { name: { in: dto.roleNames } },
      });

      if (roles.length !== dto.roleNames.length) {
        throw new BadRequestException('Some roles were not found');
      }

      for (const role of roles) {
        const existing = await this.prisma.orgRoleBinding.findFirst({
          where: {
            orgId,
            membershipId: membership.id,
            roleId: role.id,
            scopeType: 'organization',
            scopeRefId: orgId,
          },
          select: { id: true },
        });

        if (!existing) {
          await this.prisma.orgRoleBinding.create({
            data: {
              orgId,
              membershipId: membership.id,
              roleId: role.id,
              scopeType: 'organization',
              scopeRefId: orgId,
              assignedBy: actorUserId,
            },
          });
        }
      }
    }

    return membership;
  }

  private async ensureOrganizationExists(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, isActive: true },
    });
    if (!org || !org.isActive) {
      throw new NotFoundException('Organization not found or inactive');
    }
  }
}
