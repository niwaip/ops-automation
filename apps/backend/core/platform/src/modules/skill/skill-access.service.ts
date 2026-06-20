import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SkillConfigDto, SkillPermissionDTO } from './interfaces';
import { SkillEnrichmentService } from './skill-enrichment.service';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

@Injectable()
export class SkillAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skillEnrichmentService: SkillEnrichmentService
  ) {}

  async ensureSystemRoles(): Promise<void> {
    const systemRoles: Array<{
      name: string;
      description: string;
      permissions: Record<string, boolean>;
    }> = [
      {
        name: 'employee',
        description: '普通员工角色',
        permissions: {},
      },
      {
        name: 'agent',
        description: '自动化代理角色',
        permissions: {
          replay_start: true,
          replay_stop: true,
          agent_create: true,
        },
      },
      {
        name: 'admin',
        description: '系统管理员角色',
        permissions: {
          all_skills: true,
        },
      },
    ];

    for (const role of systemRoles) {
      await this.prisma.role.upsert({
        where: { name: role.name },
        update: {
          isSystem: true,
        },
        create: {
          name: role.name,
          description: role.description,
          permissions: role.permissions as any,
          isSystem: true,
        },
      });
    }
  }

  async listRoles(): Promise<{ id: string; name: string }[]> {
    await this.ensureSystemRoles();
    return this.prisma.role.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async listSkillsForUser(userId: string): Promise<SkillConfigDto[]> {
    if (!isValidUUID(userId)) {
      return [];
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (user?.role === 'admin') {
      return this.listAllActiveSkills();
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });

    const roleIds = userRoles.map((ur: any) => ur.roleId);
    const roleNames = new Set(userRoles.map((ur: any) => ur.role?.name).filter(Boolean));

    const isAdmin = userRoles.some(
      (ur: any) =>
        ur.role.name === 'admin' ||
        (ur.role.permissions as Record<string, boolean>)?.['all_skills'] === true
    );

    if (isAdmin) {
      return this.listAllActiveSkills();
    }

    if (user?.role && !roleNames.has(user.role)) {
      const fallbackRole = await this.prisma.role.findUnique({
        where: { name: user.role },
        select: { id: true, name: true, permissions: true },
      });

      if (fallbackRole) {
        roleIds.push(fallbackRole.id);
        roleNames.add(fallbackRole.name);
      }
    }

    if (roleNames.has('admin')) {
      return this.listAllActiveSkills();
    }

    if (roleIds.length === 0) {
      return [];
    }

    const skillPermissions = await this.prisma.skillPermission.findMany({
      where: { roleId: { in: roleIds } },
      include: { skill: true },
    });

    const uniqueSkillIds = new Set<string>();
    const skills = [];

    for (const perm of skillPermissions as any[]) {
      if (!uniqueSkillIds.has(perm.skillId) && perm.skill.isActive) {
        uniqueSkillIds.add(perm.skillId);
        skills.push(perm.skill);
      }
    }

    const enrichedSkills = await this.skillEnrichmentService.enrichSkillsWithPublication(skills);
    return enrichedSkills.filter((skill) => skill.isPublished);
  }

  async checkUserSkillPermission(userId: string, skillId: string): Promise<boolean> {
    if (!isValidUUID(userId) || !isValidUUID(skillId)) {
      return false;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (user?.role === 'admin') {
      return true;
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });

    const isAdmin = userRoles.some(
      (ur: any) =>
        ur.role.name === 'admin' ||
        (ur.role.permissions as Record<string, boolean>)?.['all_skills'] === true
    );
    if (isAdmin) {
      return true;
    }

    const skill = await this.prisma.skillConfig.findUnique({
      where: { id: skillId },
    });
    if (!skill || !skill.isActive) {
      return false;
    }

    const publication = await this.skillEnrichmentService.getPublishedReleaseMap([skillId]);
    if (!publication.has(skillId)) {
      return false;
    }

    const roleIds = userRoles.map((ur: any) => ur.roleId);
    const roleNames = new Set(userRoles.map((ur: any) => ur.role?.name).filter(Boolean));

    if (user?.role && !roleNames.has(user.role)) {
      const fallbackRole = await this.prisma.role.findUnique({
        where: { name: user.role },
        select: { id: true, name: true, permissions: true },
      });
      if (fallbackRole) {
        roleIds.push(fallbackRole.id);
      }
    }

    const permission = await this.prisma.skillPermission.findFirst({
      where: {
        skillId,
        roleId: { in: roleIds },
      },
    });

    return !!permission;
  }

  async grantSkillToRole(
    skillId: string,
    roleId: string,
    grantedBy: string
  ): Promise<SkillPermissionDTO> {
    if (!isValidUUID(skillId)) {
      throw new ForbiddenException('Invalid skillId format');
    }
    if (!isValidUUID(roleId)) {
      throw new ForbiddenException('Invalid roleId format');
    }

    const skill = await this.prisma.skillConfig.findUnique({ where: { id: skillId } });
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });

    if (!skill) {
      throw new NotFoundException('Skill not found');
    }

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (!skill.isActive) {
      throw new BadRequestException('当前 Skill 已停用，不能分配权限');
    }

    const publication = await this.skillEnrichmentService.getPublishedReleaseMap([skillId]);
    if (!publication.has(skillId)) {
      throw new BadRequestException('只有已公开发布的 Skill 才能分配给普通用户使用');
    }

    const permission = await this.prisma.skillPermission.upsert({
      where: {
        skillId_roleId: { skillId, roleId },
      },
      update: {
        grantedAt: new Date(),
        grantedBy,
      },
      create: {
        skillId,
        roleId,
        grantedBy,
      },
    });

    return {
      skillId: permission.skillId,
      skillName: skill.name,
      roleId: permission.roleId,
      roleName: role.name,
      grantedAt: permission.grantedAt,
      grantedBy: permission.grantedBy,
    };
  }

  async revokeSkillFromRole(skillId: string, roleId: string): Promise<boolean> {
    const result = await this.prisma.skillPermission.delete({
      where: {
        skillId_roleId: { skillId, roleId },
      },
    });

    return !!result;
  }

  async getSkillPermissions(skillId: string): Promise<SkillPermissionDTO[]> {
    const permissions = await this.prisma.skillPermission.findMany({
      where: { skillId },
      include: { skill: true, role: true },
    });

    return permissions.map((perm: any) => ({
      skillId: perm.skillId,
      skillName: perm.skill.name,
      roleId: perm.roleId,
      roleName: perm.role.name,
      grantedAt: perm.grantedAt,
      grantedBy: perm.grantedBy,
    }));
  }

  private async listAllActiveSkills(): Promise<SkillConfigDto[]> {
    const skills = await this.prisma.skillConfig.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return this.skillEnrichmentService.enrichSkillsWithPublication(skills, {
      hideHistoricalPublishedVersions: true,
    });
  }
}
