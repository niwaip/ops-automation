import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../ports';
import { InboxItemStatus, TodoSourceType } from '../inbox/dto/workbench-inbox.dto';
import { WorkbenchInboxService } from '../inbox/workbench-inbox.service';
import { MockHrService } from './mock-hr.service';
import {
  CoordinationActionRecord,
  CoordinationTaskPriority,
  CoordinationTaskStatus,
  CoordinationTaskType,
  CreateCoordinationTaskDto,
  QueryCollaboratorsDto,
  SubmitCoordinationActionDto,
  WorkflowTemplateDto,
} from './dto/workbench-coordination.dto';
import { BUILT_IN_WORKFLOW_TEMPLATES } from './workflow-templates.constants';

import { OrgWorkflowService } from './org-workflow.service';

export interface CollaboratorUserDto {
  id: string;
  username: string;
  email: string | null;
  role: string;
}

@Injectable()
export class WorkbenchCoordinationService implements OnModuleInit {
  private readonly logger = new Logger(WorkbenchCoordinationService.name);

  constructor(
    @Inject(WORKBENCH_PRISMA)
    private readonly prisma: WorkbenchPrismaPort,
    private readonly inboxService: WorkbenchInboxService,
    private readonly mockHrService: MockHrService,
    private readonly orgWorkflowService?: OrgWorkflowService
  ) {}

  async onModuleInit() {
    try {
      const testUser = await this.prisma.user.findUnique({
        where: { username: 'test' },
      });
      if (!testUser) {
        this.logger.log('Auto-ensuring test user in database...');
        const passwordHash = await bcrypt.hash('test123', 10);
        await this.prisma.user.create({
          data: {
            username: 'test',
            passwordHash,
            email: 'test@example.com',
            role: 'employee' as any,
            isActive: true,
          },
        });
        this.logger.log('Test user created in database.');
      }
    } catch (err) {
      this.logger.warn('Failed to auto-ensure test user:', err);
    }
  }

  /**
   * 获取系统内置的规范工作流模版列表（暴露参数 Schema 供前端动态生成卡片）
   */
  getWorkflowTemplates(): any[] {
    if (this.orgWorkflowService) {
      const all = Array.from((this.orgWorkflowService as any).workflows?.values?.() || []);
      if (all.length > 0) {
        return all;
      }
    }
    return BUILT_IN_WORKFLOW_TEMPLATES;
  }

  /**
   * 获取当前登录用户的组织工作流目录（带权限判断、申请状态与完整流程定义）
   */
  async getWorkflowCatalogForUser(userId: string) {
    if (this.orgWorkflowService) {
      return await this.orgWorkflowService.listCatalogForUser(userId);
    }
    return BUILT_IN_WORKFLOW_TEMPLATES.map((t) => ({
      ...t,
      accessStatus: 'authorized',
      isPublished: true,
    }));
  }

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
      },
      orderBy: { username: 'asc' },
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
    }));
  }

  /**
   * 发起协同任务并推入接收人的 GTD 收集箱
   */
  async createTask(initiatorUserId: string, dto: CreateCoordinationTaskDto) {
    if (!dto.assigneeId || !dto.title?.trim() || !dto.content?.trim()) {
      throw new BadRequestException('创建协同任务失败：指派人、标题与内容不能为空');
    }

    // 1. 查询发起人与接收人信息
    const [initiator, assignee] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: initiatorUserId },
        select: { id: true, username: true, email: true },
      }),
      this.prisma.user.findUnique({
        where: { id: dto.assigneeId },
        select: { id: true, username: true, email: true },
      }),
    ]);

    if (!initiator) {
      throw new NotFoundException(`发起人用户不存在: ${initiatorUserId}`);
    }
    if (!assignee) {
      throw new NotFoundException(`被指派协同用户不存在: ${dto.assigneeId}`);
    }

    const taskId = `coord_${randomUUID()}`;
    const workflowId =
      dto.workflowId || (dto.isCardTemplate ? 'general.coordination' : undefined);
    const parameters = dto.parameters || {};
    const taskType = dto.taskType || (workflowId === 'hr.leave.request' ? CoordinationTaskType.approval : CoordinationTaskType.approval);

    let typePrefix = '[待我处理]';
    if (taskType === CoordinationTaskType.approval) {
      typePrefix = '[待我承认]';
    } else if (taskType === CoordinationTaskType.assignment) {
      typePrefix = '[待我执行]';
    } else if (taskType === CoordinationTaskType.review) {
      typePrefix = '[待我复核]';
    }

    const inboxTitle = `${typePrefix} ${dto.title.trim()}`;
    const cleanContent = dto.content.trim();

    const unifiedPayload = {
      kind: 'coordination',
      taskId,
      workflowId,
      parameters,
      taskType,
      status: CoordinationTaskStatus.pending,
      priority: dto.priority || CoordinationTaskPriority.medium,
      dueDate: dto.dueDate || null,
      initiator: {
        id: initiator.id,
        username: initiator.username,
        email: initiator.email,
      },
      assignee: {
        id: assignee.id,
        username: assignee.username,
        email: assignee.email,
      },
      attachments: dto.attachments || [],
      isCardTemplate: Boolean(dto.isCardTemplate),
      actions: [],
      metadata: dto.metadata || {},
      createdAt: new Date().toISOString(),
    };

    // 2. 写入接收人 GTD 收集箱
    const inboxItem = await this.prisma.workbenchInboxItem.create({
      data: {
        userId: assignee.id,
        title: inboxTitle,
        rawContent: cleanContent,
        sourceType: TodoSourceType.chat,
        sourceRefId: taskId,
        sourceTitle: dto.title.trim(),
        sourceSender: initiator.username,
        unifiedPayload: unifiedPayload as any,
        status: InboxItemStatus.unprocessed,
        confidence: 1.0,
      },
    });

    this.logger.log(
      `Coordination task created: ${taskId} by user ${initiator.username} -> assignee ${assignee.username}, inboxItem: ${inboxItem.id}`
    );

    return {
      taskId,
      inboxItemId: inboxItem.id,
      taskType,
      status: CoordinationTaskStatus.pending,
      title: dto.title.trim(),
      initiator: unifiedPayload.initiator,
      assignee: unifiedPayload.assignee,
      unifiedPayload,
    };
  }

  /**
   * 处理协同操作（同意、拒绝、提交完成，可附带说明与附件）
   */
  async submitAction(
    operatorUserId: string,
    taskId: string,
    dto: SubmitCoordinationActionDto
  ) {
    if (!dto.action) {
      throw new BadRequestException('操作动作不能为空');
    }

    // 1. 查找对应的收件箱条目
    const targetItem = await this.prisma.workbenchInboxItem.findFirst({
      where: {
        sourceRefId: taskId,
      },
    });

    if (!targetItem) {
      throw new NotFoundException(`未找到协同任务: ${taskId}`);
    }

    const payload = (targetItem.unifiedPayload || {}) as Record<string, any>;
    const initiator = payload.initiator || {};
    const assignee = payload.assignee || {};

    const operator = await this.prisma.user.findUnique({
      where: { id: operatorUserId },
      select: { id: true, username: true },
    });

    const actionRecord: CoordinationActionRecord = {
      id: `act_${randomUUID()}`,
      operatorId: operatorUserId,
      operatorName: operator?.username || '未知成员',
      action: dto.action,
      comment: dto.comment?.trim(),
      attachments: dto.attachments || [],
      timestamp: new Date().toISOString(),
    };

    let nextStatus: CoordinationTaskStatus = CoordinationTaskStatus.pending;
    let actionText = '处理';
    if (dto.action === 'approve') {
      nextStatus = CoordinationTaskStatus.approved;
      actionText = '同意承认';
    } else if (dto.action === 'reject') {
      nextStatus = CoordinationTaskStatus.rejected;
      actionText = '驳回拒绝';
    } else if (dto.action === 'complete') {
      nextStatus = CoordinationTaskStatus.completed;
      actionText = '完成提交';
    }

    // 模拟调用外部系统（如考勤系统、HRMS、ERP 财务系统）
    let externalSyncResult: any = undefined;
    if (dto.action === 'approve' && payload.workflowId === 'hr.leave.request') {
      try {
        const params = payload.parameters || {};
        externalSyncResult = await this.mockHrService.syncLeaveApproval({
          taskId,
          applicantName: initiator.username || '员工',
          approverName: operator?.username || '主管',
          leaveType: params.leaveType || '请假',
          startTime: params.startTime || '',
          endTime: params.endTime || '',
          durationHours: Number(params.durationHours || 4),
          reason: params.reason || targetItem.sourceTitle || targetItem.title,
          handoverPerson: params.handoverPerson,
          emergencyContact: params.emergencyContact,
        });
      } catch (hrErr) {
        this.logger.warn(`Failed to sync leave approval to Mock HR:`, hrErr);
      }
    } else if (dto.action === 'approve' && payload.workflowId === 'oa.expense.claim') {
      const params = payload.parameters || {};
      externalSyncResult = {
        success: true,
        trackingNumber: `ERP-EXP-${Date.now().toString().slice(-6)}`,
        externalSystem: 'ERP 财务结算网关',
        message: `报销核准通过，已同步至财务凭证中心完成结算建档（金额：¥${params.amount || 0}）`,
        detail: {
          voucherId: `VCH_${Date.now()}`,
          expenseType: params.expenseType,
          amount: params.amount,
          settledAt: new Date().toISOString(),
        },
      };
    }

    const updatedActions = Array.isArray(payload.actions)
      ? [...payload.actions, actionRecord]
      : [actionRecord];

    const updatedPayload = {
      ...payload,
      status: nextStatus,
      actions: updatedActions,
      externalSyncResult,
      updatedAt: new Date().toISOString(),
    };

    // 2. 更新被指派人收件箱条目为已转待办或已处理
    await this.prisma.workbenchInboxItem.update({
      where: { id: targetItem.id },
      data: {
        status: InboxItemStatus.converted,
        unifiedPayload: updatedPayload as any,
        updatedAt: new Date(),
      },
    });

    // 3. 向发起人 GTD 收集箱回传结果提醒
    if (initiator.id && initiator.id !== operatorUserId) {
      const responseTitle = `[协同回执] @${operator?.username || '协作者'} 已${actionText}: ${targetItem.sourceTitle || targetItem.title}`;
      let responseContent = dto.comment?.trim()
        ? `处理意见：${dto.comment.trim()}`
        : `已${actionText}，无附加留言。`;

      if (externalSyncResult?.message) {
        responseContent += `\n\n📌 **外部人事考勤系统联动已完成**：\n- 处理说明：${externalSyncResult.message}\n- 对接网关：\`${externalSyncResult.externalSystem}\`\n- 凭证单号：\`${externalSyncResult.trackingNumber}\``;
      }

      const receiptPayload = {
        ...updatedPayload,
        taskType: 'receipt',
        isReceipt: true,
        receiptAction: dto.action,
        originalTaskType: (targetItem.unifiedPayload as any)?.taskType || 'approval',
      };

      await this.prisma.workbenchInboxItem.create({
        data: {
          userId: initiator.id,
          title: responseTitle,
          rawContent: responseContent,
          sourceType: TodoSourceType.chat,
          sourceRefId: taskId,
          sourceTitle: targetItem.sourceTitle || targetItem.title,
          sourceSender: operator?.username || '协作者',
          unifiedPayload: receiptPayload as any,
          status: InboxItemStatus.unprocessed,
          confidence: 1.0,
        },
      });
    }

    this.logger.log(
      `Coordination task ${taskId} action submitted: ${dto.action} by ${operator?.username}`
    );

    return {
      taskId,
      status: nextStatus,
      action: dto.action,
      actionRecord,
      unifiedPayload: updatedPayload,
    };
  }

  /**
   * 查询协同任务详情
   */
  async getTaskDetails(userId: string, taskId: string) {
    const item = await this.prisma.workbenchInboxItem.findFirst({
      where: {
        sourceRefId: taskId,
      },
    });

    if (!item) {
      throw new NotFoundException(`协同任务不存在: ${taskId}`);
    }

    const payload = (item.unifiedPayload || {}) as Record<string, any>;
    return {
      taskId,
      inboxItemId: item.id,
      title: item.sourceTitle || item.title,
      rawContent: item.rawContent,
      workflowId: payload.workflowId,
      parameters: payload.parameters,
      status: payload.status || 'pending',
      taskType: payload.taskType || 'approval',
      priority: payload.priority || 'medium',
      dueDate: payload.dueDate,
      initiator: payload.initiator,
      assignee: payload.assignee,
      attachments: payload.attachments || [],
      actions: payload.actions || [],
      externalSyncResult: payload.externalSyncResult,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  /**
   * 查询协同任务与流程实例列表
   */
  async listTasks(userId: string, role: 'all' | 'assignee' | 'initiator' = 'all') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    const items = await this.prisma.workbenchInboxItem.findMany({
      where: {
        sourceRefId: { startsWith: 'coord_' },
        OR: [
          { userId },
          { sourceSender: user?.username || '' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const taskMap = new Map<string, any>();
    for (const item of items) {
      const taskId = item.sourceRefId!;
      if (taskMap.has(taskId)) continue;

      const payload = (item.unifiedPayload || {}) as Record<string, any>;
      const initiator = payload.initiator || {};
      const assignee = payload.assignee || {};

      const isInitiator = initiator.id === userId || initiator.username === user?.username;
      const isAssignee = assignee.id === userId || assignee.username === user?.username;

      if (role === 'initiator' && !isInitiator) continue;
      if (role === 'assignee' && !isAssignee) continue;

      taskMap.set(taskId, {
        taskId,
        inboxItemId: item.id,
        title: item.sourceTitle || item.title.replace(/^\[待我[^\]]+\]\s*/, ''),
        rawContent: item.rawContent,
        workflowId: payload.workflowId,
        parameters: payload.parameters,
        status: payload.status || 'pending',
        taskType: payload.taskType === 'receipt' ? payload.originalTaskType || 'approval' : payload.taskType || 'approval',
        priority: payload.priority || 'medium',
        dueDate: payload.dueDate,
        initiator,
        assignee,
        attachments: payload.attachments || [],
        actions: payload.actions || [],
        externalSyncResult: payload.externalSyncResult,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    }

    return Array.from(taskMap.values());
  }
}
