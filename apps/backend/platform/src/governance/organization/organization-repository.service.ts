import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AddOrganizationMemberDto,
  CreateDepartmentDto,
  CreateOrganizationDto,
  CreateTeamDto,
  OrganizationRepository,
  OrganizationStructureRecord,
  UpdateDepartmentDto,
} from '@ops/organization';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlatformOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOrganization(dto: CreateOrganizationDto, actorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const code = dto.code.toUpperCase();
      const existing = await tx.organization.findUnique({
        where: { code },
      });

      let organization;
      if (existing) {
        organization = await tx.organization.update({
          where: { id: existing.id },
          data: {
            name: dto.name,
            description: dto.description,
            isActive: true,
          },
        });
      } else {
        organization = await tx.organization.create({
          data: {
            name: dto.name,
            code,
            description: dto.description,
            isActive: true,
          },
        });
      }

      if (actorUserId) {
        const actor = await tx.user.findUnique({
          where: { id: actorUserId },
        }).catch(() => null);

        if (actor) {
          const membership = await tx.orgMembership.upsert({
            where: {
              userId_orgId: {
                userId: actor.id,
                orgId: organization.id,
              },
            },
            update: { status: 'active' },
            create: {
              userId: actor.id,
              orgId: organization.id,
              status: 'active',
              joinedAt: new Date(),
            },
          });

          const adminRole = await tx.role.findFirst({
            where: { name: 'admin' },
          });

          if (adminRole) {
            await tx.orgRoleBinding.upsert({
              where: {
                membershipId_roleId_scopeType_scopeRefId: {
                  membershipId: membership.id,
                  roleId: adminRole.id,
                  scopeType: 'organization',
                  scopeRefId: organization.id,
                },
              },
              update: {},
              create: {
                orgId: organization.id,
                membershipId: membership.id,
                roleId: adminRole.id,
                scopeType: 'organization',
                scopeRefId: organization.id,
                assignedBy: actor.id,
              },
            }).catch(() => {});
          }

          await tx.user.update({
            where: { id: actor.id },
            data: { activeOrgId: organization.id },
          }).catch(() => {});
        }
      }

      return organization;
    });
  }

  async listAllOrganizations(actorUserId?: string) {
    let orgs = await this.prisma.organization.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    if (orgs.length === 0) {
      // 1. 检查是否存在被软删除或禁用的历史组织，直接激活复用
      const anyOrg = await this.prisma.organization.findFirst();
      if (anyOrg) {
        const activated = await this.prisma.organization.update({
          where: { id: anyOrg.id },
          data: { isActive: true },
        });
        orgs = [activated];
      } else {
        // 2. 初始化系统默认根组织
        const defaultOrg = await this.createOrganization(
          {
            name: '总公司 / 集团总经办',
            code: 'HEADQUARTERS',
            description: '系统默认根组织',
          },
          actorUserId
        );
        orgs = [defaultOrg];
      }
    }

    return orgs.map((o) => ({
      id: o.id,
      name: o.name,
      code: o.code,
      description: o.description,
    }));
  }

  async listMyOrganizations(userId: string) {
    let memberships = await this.prisma.orgMembership.findMany({
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

    if (memberships.length === 0) {
      const allOrgs = await this.listAllOrganizations(userId);
      if (allOrgs.length > 0) {
        const primaryOrgId = allOrgs[0].id;
        try {
          const user = await this.prisma.user.findUnique({ where: { id: userId } });
          if (user) {
            const newMembership = await this.prisma.orgMembership.upsert({
              where: {
                userId_orgId: {
                  userId: user.id,
                  orgId: primaryOrgId,
                },
              },
              update: { status: 'active' },
              create: {
                userId: user.id,
                orgId: primaryOrgId,
                status: 'active',
                joinedAt: new Date(),
              },
              include: {
                organization: true,
              },
            });
            await this.prisma.user.update({
              where: { id: user.id },
              data: { activeOrgId: primaryOrgId },
            }).catch(() => {});
            memberships = [newMembership];
          }
        } catch {
          // Ignore fallback linking errors
        }
      }
    }

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

    const existingName = await this.prisma.department.findFirst({
      where: { orgId, name: dto.name },
    });
    if (existingName) {
      throw new BadRequestException(`该组织下已存在同名部门「${dto.name}」`);
    }

    if (dto.parentId) {
      const parent = await this.prisma.department.findFirst({
        where: { id: dto.parentId, orgId },
      });
      if (!parent) {
        throw new BadRequestException('上级部门不存在或不属于当前组织');
      }
    }

    return this.prisma.department.create({
      data: {
        orgId,
        name: dto.name,
        code: dto.code || null,
        parentId: dto.parentId || null,
      },
    });
  }

  async updateDepartment(orgId: string, deptId: string, dto: UpdateDepartmentDto) {
    await this.ensureOrganizationExists(orgId);

    const existing = await this.prisma.department.findFirst({
      where: { id: deptId, orgId },
    });
    if (!existing) {
      throw new NotFoundException('Department not found in organization');
    }

    if (dto.name && dto.name !== existing.name) {
      const dupName = await this.prisma.department.findFirst({
        where: { orgId, name: dto.name, id: { not: deptId } },
      });
      if (dupName) {
        throw new BadRequestException(`该组织下已存在同名部门「${dto.name}」`);
      }
    }

    if (dto.parentId) {
      if (dto.parentId === deptId) {
        throw new BadRequestException('Department cannot be its own parent');
      }
      const parent = await this.prisma.department.findFirst({
        where: { id: dto.parentId, orgId },
      });
      if (!parent) {
        throw new BadRequestException('上级部门不存在或不属于当前组织');
      }
    }

    return this.prisma.department.update({
      where: { id: deptId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.managerUserId !== undefined ? { managerUserId: dto.managerUserId } : {}),
      },
    });
  }

  async deleteDepartment(orgId: string, deptId: string) {
    await this.ensureOrganizationExists(orgId);

    const dept = await this.prisma.department.findFirst({
      where: { id: deptId, orgId },
      include: {
        children: true,
      },
    });
    if (!dept) {
      throw new NotFoundException('Department not found in organization');
    }

    if (dept.children.length > 0) {
      throw new BadRequestException('Cannot delete department that contains sub-departments');
    }

    await this.prisma.orgMembership.updateMany({
      where: { departmentId: deptId },
      data: { departmentId: null },
    });

    await this.prisma.department.delete({
      where: { id: deptId },
    });
  }

  async removeMember(orgId: string, userId: string) {
    await this.ensureOrganizationExists(orgId);

    await this.prisma.orgMembership.deleteMany({
      where: {
        orgId,
        userId,
      },
    });

    await this.prisma.user.updateMany({
      where: { id: userId, activeOrgId: orgId },
      data: { activeOrgId: null },
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
