import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PublishedSkillCatalogItemDTO,
  SkillAccessRequestDTO,
  SkillAccessRequestReviewDTO,
  SkillConfigDto,
  SkillPermissionDTO,
} from './interfaces';
import { SkillEnrichmentService } from './skill-enrichment.service';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

type SkillAccessRequestRow = {
  id: string;
  skill_id: string;
  requester_user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string | null;
  response_note: string | null;
  processed_at: Date | null;
  processed_by: string | null;
  created_at: Date;
  updated_at: Date;
};

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
    if (userId === 'system') {
      return (await this.listAllActiveSkills()).filter((skill) => skill.isPublished);
    }

    if (!isValidUUID(userId)) {
      return [];
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (user?.role === 'admin') {
      return (await this.listAllActiveSkills()).filter((skill) => skill.isPublished);
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
      return (await this.listAllActiveSkills()).filter((skill) => skill.isPublished);
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
      return (await this.listAllActiveSkills()).filter((skill) => skill.isPublished);
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

  async listPublishedSkillCatalogForUser(userId: string): Promise<PublishedSkillCatalogItemDTO[]> {
    if (!isValidUUID(userId)) {
      return [];
    }

    const [authorizedSkills, allActiveSkills, latestRequests] = await Promise.all([
      this.listSkillsForUser(userId),
      this.listAllActiveSkills(),
      this.listLatestRequestsForUser(userId),
    ]);

    const authorizedSkillIds = new Set(authorizedSkills.map((skill) => skill.id));
    const latestRequestMap = new Map(latestRequests.map((request) => [request.skillId, request]));

    return allActiveSkills
      .filter((skill) => skill.isPublished)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((skill) => {
        const isAuthorized = authorizedSkillIds.has(skill.id);
        const accessRequest = isAuthorized ? null : latestRequestMap.get(skill.id) || null;

        return {
          ...skill,
          accessStatus: isAuthorized
            ? 'authorized'
            : accessRequest?.status === 'pending'
              ? 'requested'
              : 'unauthorized',
          accessRequest,
        };
      });
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

  async createSkillAccessRequest(
    userId: string,
    skillId: string,
    reason?: string
  ): Promise<SkillAccessRequestDTO> {
    if (!isValidUUID(userId)) {
      throw new ForbiddenException('Invalid userId format');
    }
    if (!isValidUUID(skillId)) {
      throw new ForbiddenException('Invalid skillId format');
    }

    const skill = await this.prisma.skillConfig.findUnique({ where: { id: skillId } });
    if (!skill || !skill.isActive) {
      throw new NotFoundException('Skill not found');
    }

    const publication = await this.skillEnrichmentService.getPublishedReleaseMap([skillId]);
    if (!publication.has(skillId)) {
      throw new BadRequestException('当前 Skill 尚未公开发布，不能发起授权申请');
    }

    const hasPermission = await this.checkUserSkillPermission(userId, skillId);
    if (hasPermission) {
      throw new ConflictException('当前用户已拥有该 Skill 的使用权限');
    }

    const existingRequest = await this.findPendingRequest(skillId, userId);
    if (existingRequest) {
      return existingRequest;
    }

    const now = new Date();
    const requestId = randomUUID();
    const normalizedReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO skill_access_requests (
          id,
          skill_id,
          requester_user_id,
          status,
          reason,
          created_at,
          updated_at
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending', $4, $5, $5)`,
      requestId,
      skillId,
      userId,
      normalizedReason || null,
      now
    );

    return {
      id: requestId,
      skillId,
      requesterUserId: userId,
      status: 'pending',
      reason: normalizedReason || null,
      responseNote: null,
      processedAt: null,
      processedBy: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async listSkillAccessRequests(options?: {
    skillId?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
  }): Promise<SkillAccessRequestReviewDTO[]> {
    if (options?.skillId && !isValidUUID(options.skillId)) {
      throw new ForbiddenException('Invalid skillId format');
    }

    const requests = await this.prisma.skillAccessRequest.findMany({
      where: {
        ...(options?.skillId ? { skillId: options.skillId } : {}),
        ...(options?.status ? { status: options.status } : {}),
      },
      include: {
        skill: true,
        requester: {
          include: {
            userRoles: {
              include: { role: true },
              orderBy: { assignedAt: 'asc' },
            },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });

    return requests.map((request) => this.mapSkillAccessRequestReview(request));
  }

  async approveSkillAccessRequest(
    requestId: string,
    processedBy: string,
    responseNote?: string
  ): Promise<SkillAccessRequestReviewDTO> {
    if (!isValidUUID(requestId)) {
      throw new ForbiddenException('Invalid requestId format');
    }
    if (!isValidUUID(processedBy)) {
      throw new ForbiddenException('Invalid processedBy format');
    }

    const request = await this.prisma.skillAccessRequest.findUnique({
      where: { id: requestId },
      include: {
        skill: true,
        requester: {
          include: {
            userRoles: {
              include: { role: true },
              orderBy: { assignedAt: 'asc' },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Skill access request not found');
    }

    if (request.status !== 'pending') {
      throw new ConflictException('该授权申请已处理');
    }

    const targetRole = await this.resolveTargetRoleForRequest(request.requester);
    await this.grantSkillToRole(request.skillId, targetRole.id, processedBy);

    const updated = await this.prisma.skillAccessRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        responseNote: this.normalizeResponseNote(responseNote),
        processedAt: new Date(),
        processedBy,
      },
      include: {
        skill: true,
        requester: {
          include: {
            userRoles: {
              include: { role: true },
              orderBy: { assignedAt: 'asc' },
            },
          },
        },
      },
    });

    return this.mapSkillAccessRequestReview(updated);
  }

  async rejectSkillAccessRequest(
    requestId: string,
    processedBy: string,
    responseNote?: string
  ): Promise<SkillAccessRequestReviewDTO> {
    if (!isValidUUID(requestId)) {
      throw new ForbiddenException('Invalid requestId format');
    }
    if (!isValidUUID(processedBy)) {
      throw new ForbiddenException('Invalid processedBy format');
    }

    const request = await this.prisma.skillAccessRequest.findUnique({
      where: { id: requestId },
      include: {
        skill: true,
        requester: {
          include: {
            userRoles: {
              include: { role: true },
              orderBy: { assignedAt: 'asc' },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Skill access request not found');
    }

    if (request.status !== 'pending') {
      throw new ConflictException('该授权申请已处理');
    }

    const updated = await this.prisma.skillAccessRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        responseNote: this.normalizeResponseNote(responseNote),
        processedAt: new Date(),
        processedBy,
      },
      include: {
        skill: true,
        requester: {
          include: {
            userRoles: {
              include: { role: true },
              orderBy: { assignedAt: 'asc' },
            },
          },
        },
      },
    });

    return this.mapSkillAccessRequestReview(updated);
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

  private async listPendingRequestsForUser(userId: string): Promise<SkillAccessRequestDTO[]> {
    if (!isValidUUID(userId)) {
      return [];
    }

    const rows = await this.prisma.$queryRawUnsafe<SkillAccessRequestRow[]>(
      `SELECT id,
              skill_id,
              requester_user_id,
              status,
              reason,
              response_note,
              processed_at,
              processed_by,
              created_at,
              updated_at
         FROM skill_access_requests
        WHERE requester_user_id = $1::uuid
          AND status = 'pending'
        ORDER BY updated_at DESC`,
      userId
    );

    return rows.map((row) => this.mapSkillAccessRequestRow(row));
  }

  private async listLatestRequestsForUser(userId: string): Promise<SkillAccessRequestDTO[]> {
    if (!isValidUUID(userId)) {
      return [];
    }

    const rows = await this.prisma.$queryRawUnsafe<SkillAccessRequestRow[]>(
      `SELECT DISTINCT ON (skill_id)
              id,
              skill_id,
              requester_user_id,
              status,
              reason,
              response_note,
              processed_at,
              processed_by,
              created_at,
              updated_at
         FROM skill_access_requests
        WHERE requester_user_id = $1::uuid
        ORDER BY skill_id, updated_at DESC`,
      userId
    );

    return rows.map((row) => this.mapSkillAccessRequestRow(row));
  }

  private async findPendingRequest(
    skillId: string,
    userId: string
  ): Promise<SkillAccessRequestDTO | null> {
    const rows = await this.prisma.$queryRawUnsafe<SkillAccessRequestRow[]>(
      `SELECT id,
              skill_id,
              requester_user_id,
              status,
              reason,
              response_note,
              processed_at,
              processed_by,
              created_at,
              updated_at
         FROM skill_access_requests
        WHERE skill_id = $1::uuid
          AND requester_user_id = $2::uuid
          AND status = 'pending'
        ORDER BY updated_at DESC
        LIMIT 1`,
      skillId,
      userId
    );

    return rows.length > 0 ? this.mapSkillAccessRequestRow(rows[0]) : null;
  }

  private mapSkillAccessRequestRow(row: SkillAccessRequestRow): SkillAccessRequestDTO {
    return {
      id: row.id,
      skillId: row.skill_id,
      requesterUserId: row.requester_user_id,
      status: row.status,
      reason: row.reason,
      responseNote: row.response_note,
      processedAt: row.processed_at,
      processedBy: row.processed_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private normalizeResponseNote(note?: string): string | null {
    const normalized = typeof note === 'string' ? note.trim().slice(0, 500) : '';
    return normalized || null;
  }

  private async resolveTargetRoleForRequest(requester: {
    role: string;
    userRoles: Array<{ roleId: string; role: { id: string; name: string } }>;
  }): Promise<{ id: string; name: string }> {
    await this.ensureSystemRoles();

    const primaryRoleName = String(requester.role || '').trim();
    if (primaryRoleName) {
      const primaryRole = await this.prisma.role.findUnique({
        where: { name: primaryRoleName },
        select: { id: true, name: true },
      });

      if (primaryRole) {
        return primaryRole;
      }
    }

    const fallbackRole = requester.userRoles[0]?.role;
    if (fallbackRole) {
      return { id: fallbackRole.id, name: fallbackRole.name };
    }

    throw new BadRequestException('当前申请用户未绑定可授权角色，无法批准该申请');
  }

  private mapSkillAccessRequestReview(request: {
    id: string;
    skillId: string;
    requesterUserId: string;
    status: string;
    reason: string | null;
    responseNote: string | null;
    processedAt: Date | null;
    processedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
    skill: { name: string };
    requester: {
      username: string;
      email: string | null;
      role: string;
      userRoles: Array<{ role: { id: string; name: string } }>;
    };
  }): SkillAccessRequestReviewDTO {
    const targetRole = request.requester.userRoles[0]?.role;
    const normalizedStatus =
      request.status === 'approved' ||
      request.status === 'rejected' ||
      request.status === 'cancelled'
        ? request.status
        : 'pending';

    return {
      id: request.id,
      skillId: request.skillId,
      requesterUserId: request.requesterUserId,
      status: normalizedStatus,
      reason: request.reason,
      responseNote: request.responseNote,
      processedAt: request.processedAt,
      processedBy: request.processedBy,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      skillName: request.skill.name,
      requesterUsername: request.requester.username,
      requesterEmail: request.requester.email,
      requesterRole: String(request.requester.role || ''),
      targetRoleId: targetRole?.id || null,
      targetRoleName: targetRole?.name || String(request.requester.role || '') || null,
    };
  }
}
