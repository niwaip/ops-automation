import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../ports';
import { QueryCollaboratorsDto } from './dto/workbench-coordination.dto';
import { BUILT_IN_WORKFLOW_TEMPLATES } from './workflow-templates.constants';
import { OrgWorkflowService } from './org-workflow.service';

export interface CollaboratorUserDto {
  id: string;
  username: string;
  email: string | null;
  role: string;
  departmentId?: string | null;
  departmentName?: string | null;
}

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SYSTEM_SERVICE_PRINCIPAL: CollaboratorUserDto = {
  id: '00000000-0000-0000-0000-000000000000',
  username: 'system',
  email: 'system@internal.local',
  role: 'admin',
};

@Injectable()
export class CoordinationCollaboratorService {
  private readonly logger = new Logger(CoordinationCollaboratorService.name);

  constructor(
    @Inject(WORKBENCH_PRISMA)
    private readonly prisma: WorkbenchPrismaPort,
    @Optional()
    private readonly orgWorkflowService?: OrgWorkflowService
  ) {}

  /**
   * 检索可协同的组织成员（脱敏）
   */
  async searchCollaborators(
    currentUserId: string,
    query: QueryCollaboratorsDto
  ): Promise<CollaboratorUserDto[]> {
    const keyword = (query.keyword || '').trim();
    const limit = Math.min(Math.max(query.limit || 20, 1), 50);

    const whereClause: any = {
      isActive: true,
    };

    if (keyword) {
      whereClause.OR = [
        { username: { contains: keyword, mode: 'insensitive' } },
        { email: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where: whereClause,
      take: limit,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        orgMemberships: {
          where: { status: 'active' },
          select: {
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          take: 1,
        },
      } as any,
      orderBy: { username: 'asc' },
    });

    return users.map((u: any) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      departmentId: u.orgMemberships?.[0]?.department?.id || null,
      departmentName: u.orgMemberships?.[0]?.department?.name || null,
    }));
  }

  /**
   * 安全解析用户：支持 UUID、username、email、服务主体 system，未知或 anonymous 用户返回 null
   */
  async resolveUser(idOrUsername?: string) {
    if (!idOrUsername || idOrUsername === 'anonymous') {
      return null;
    }

    if (
      idOrUsername === 'system' ||
      idOrUsername === 'system_principal' ||
      idOrUsername === SYSTEM_SERVICE_PRINCIPAL.id
    ) {
      return {
        id: SYSTEM_SERVICE_PRINCIPAL.id,
        username: SYSTEM_SERVICE_PRINCIPAL.username,
        email: SYSTEM_SERVICE_PRINCIPAL.email,
      };
    }

    if (UUID_REGEX.test(idOrUsername)) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: idOrUsername },
          select: { id: true, username: true, email: true },
        });
        if (user) return user;
      } catch {
        // ignore uuid syntax error
      }
    }

    try {
      const userByUsername = await this.prisma.user.findFirst({
        where: {
          username: { equals: idOrUsername, mode: 'insensitive' },
          isActive: true,
        },
        select: { id: true, username: true, email: true },
      });
      if (userByUsername) return userByUsername;
    } catch {
      // ignore error
    }

    try {
      const userByEmail = await this.prisma.user.findFirst({
        where: {
          email: { equals: idOrUsername, mode: 'insensitive' },
          isActive: true,
        },
        select: { id: true, username: true, email: true },
      });
      if (userByEmail) return userByEmail;
    } catch {
      // ignore error
    }

    // 如果非标准 UUID 且非 anonymous，尝试 findUnique（兼顾测试 mock 环境）
    try {
      const userById = await this.prisma.user.findUnique({
        where: { id: idOrUsername },
        select: { id: true, username: true, email: true },
      });
      if (userById) return userById;
    } catch {
      // 捕获真实 PostgreSQL 的 invalid input syntax for type uuid，安全忽略
    }

    // 明确指定的用户/UUID 未找到时，直接返回 null，杜绝静默篡改
    return null;
  }

  /**
   * 基于工作流模版中的阶段定义（approverRule / approverDepartment / approverUsername / approverRole），
   * 严格按照流程模版中选择的部门或用户进行受派人解析，杜绝任何随意模糊匹配与静默篡改。
   */
  async resolveStageApprover(
    workflowId: string,
    stageId: string,
    initiatorUserId: string
  ): Promise<{ id: string; username: string; email?: string | null }> {
    const workflow: any =
      this.orgWorkflowService?.getWorkflowById(workflowId) ||
      BUILT_IN_WORKFLOW_TEMPLATES.find(
        (t) => t.id === workflowId || t.workflowId === workflowId
      );

    const stage = workflow?.processDefinition?.stages?.find(
      (s: any) => s.id === stageId
    );

    if (!stage) {
      throw new BadRequestException(`流程中未找到阶段【${stageId}】，已阻止该次流转`);
    }

    const rule = stage.approverRule || 'leader';

    // 1. 业务担当本人确认 (initiator)
    if (rule === 'initiator') {
      const user = await this.resolveUser(initiatorUserId);
      if (user) return user;
      throw new BadRequestException(
        `无法解析流程阶段【${stage.name || stageId}】的审批人：发起人用户 (${initiatorUserId}) 不存在或非激活状态`
      );
    }

    // 2. 指定具体承办用户 (specific_user)
    if (rule === 'specific_user') {
      const targetIdentifier = stage.approverUserId || stage.approverUsername;
      if (!targetIdentifier) {
        throw new BadRequestException(
          `流程阶段【${stage.name || stageId}】配置为指定承办用户，但未配置具体用户`
        );
      }
      const targetUser = await this.resolveUser(targetIdentifier);
      if (targetUser) return targetUser;
      throw new BadRequestException(
        `无法解析流程阶段【${stage.name || stageId}】的审批人：指定的承办用户【${targetIdentifier}】不存在或非激活状态，已阻止自动流转`
      );
    }

    // 3. 选定组织部门路由 (department)
    if (rule === 'department') {
      const deptName = stage.approverDepartment?.trim();
      const deptId = (stage as any).approverDepartmentId?.trim();

      // 如果模版在选定部门的同时指定了具体经办人 (approverUsername)，按模版指定人受派，但必须校验其属于该部门
      if (stage.approverUsername || stage.approverUserId) {
        const directUser = await this.resolveUser(
          stage.approverUserId || stage.approverUsername
        );
        if (directUser) {
          let isMember = false;
          try {
            const memberCount = await (this.prisma as any).orgMembership?.count?.({
              where: {
                userId: directUser.id,
                status: 'active',
                OR: [
                  deptId ? { departmentId: deptId } : undefined,
                  deptName ? { department: { name: deptName } } : undefined,
                ].filter(Boolean),
              },
            });
            if (memberCount && memberCount > 0) {
              isMember = true;
            } else {
              const deptMember = await (this.prisma as any).department?.findFirst?.({
                where: {
                  OR: [
                    deptId ? { id: deptId } : undefined,
                    deptName ? { name: deptName } : undefined,
                  ].filter(Boolean),
                  members: {
                    some: {
                      userId: directUser.id,
                      status: 'active',
                    },
                  },
                },
              });
              if (deptMember) isMember = true;
            }
          } catch (err: any) {
            this.logger.warn(
              `Failed to verify membership for ${directUser.username} in ${deptName || deptId}: ${err.message}`
            );
          }

          if (isMember) {
            return directUser;
          }

          this.logger.warn(
            `指定经办人 ${directUser.username} (${directUser.id}) 不属于部门 ${deptName || deptId}，已拒绝作为部门审批人`
          );
          throw new BadRequestException(
            `指定经办人【${directUser.username}】不属于部门【${deptName || deptId}】，已拒绝作为该部门审批人`
          );
        }
      }

      if (deptId || deptName) {
        try {
          // 从组织成员关系 (org_memberships) 中查询属于该部门的有效用户
          const membership = await (this.prisma as any).orgMembership?.findFirst?.({
            where: {
              status: 'active',
              OR: [
                deptId ? { departmentId: deptId } : undefined,
                deptName ? { department: { name: deptName } } : undefined,
              ].filter(Boolean),
              user: { isActive: true },
            },
            include: {
              user: { select: { id: true, username: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
          });

          if (membership?.user) {
            return membership.user;
          }

          const dept = await (this.prisma as any).department?.findFirst?.({
            where: {
              OR: [
                deptId ? { id: deptId } : undefined,
                deptName ? { name: deptName } : undefined,
              ].filter(Boolean),
            },
            include: {
              members: {
                where: { status: 'active', user: { isActive: true } },
                include: {
                  user: { select: { id: true, username: true, email: true } },
                },
                take: 1,
              },
            },
          });

          if (dept?.members?.[0]?.user) {
            return dept.members[0].user;
          }
        } catch (err) {
          this.logger.warn(
            `Failed to resolve department members for ${deptName || deptId}:`,
            err
          );
        }
      }

      throw new BadRequestException(
        `无法解析流程阶段【${stage.name || stageId}】的审批人：指定的部门【${deptName || deptId || '未配置'}】暂无有效在职成员，已阻止流程自动流转`
      );
    }

    // 4. 按业务角色权限路由 (role)
    if (rule === 'role') {
      if (stage.approverRole) {
        const userByRole = await this.prisma.user.findFirst({
          where: { role: stage.approverRole as any, isActive: true },
          select: { id: true, username: true, email: true },
        });
        if (userByRole) return userByRole;
      }
      throw new BadRequestException(
        `无法解析流程阶段【${stage.name || stageId}】的审批人：指定的角色【${stage.approverRole || '未配置'}】暂无有效在职用户，已阻止流程自动流转`
      );
    }

    // 5. 直属业务主管或自选指派 (leader / assignee)
    if (rule === 'leader') {
      const leaderUser = await this.resolveUser(initiatorUserId);
      if (leaderUser) return leaderUser;
    }

    throw new BadRequestException(
      `无法解析流程阶段【${stage.name || stageId}】的审批人：规则【${rule}】无法匹配到有效审批人，已阻止流程自动流转，请重新配置审批阶段专员`
    );
  }
}
