import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CoordinationTaskType } from './dto/workbench-coordination.dto';
import {
  AssembledBaseWorkflow,
  AvailableBaseWorkflowItem,
  CreateOrgWorkflowDto,
  OrganizationWorkflowDefinition,
  OrgWorkflowAccessRequest,
  OrgWorkflowCatalogItemDto,
  OrgWorkflowPublishStatus,
  UpdateOrgWorkflowDto,
  WorkflowStageDefinition,
} from './org-workflow.entity';
import { BUILT_IN_WORKFLOW_TEMPLATES } from './workflow-templates.constants';
import {
  DEDICATED_BASE_WORKFLOW_TEMPLATES,
  DEFAULT_LEAVE_ASSEMBLED_WORKFLOWS,
  DEFAULT_EXPENSE_ASSEMBLED_WORKFLOWS,
  DEFAULT_GENERAL_COORDINATION_ASSEMBLED_WORKFLOWS,
} from './org-base-workflow-templates.constants';

@Injectable()
export class OrgWorkflowService implements OnModuleInit {
  private readonly logger = new Logger(OrgWorkflowService.name);

  // 内存中持久化维护企业工作流，初始化时加载默认种子数据
  private workflows = new Map<string, OrganizationWorkflowDefinition>();
  private accessRequests = new Map<string, OrgWorkflowAccessRequest>();
  private customBaseWorkflows = new Map<string, AvailableBaseWorkflowItem>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    this.seedDefaultWorkflows();
  }

  /**
   * 初始化预置的企业工作流（基于 5173 底层普通工作流组装并赋予标准流程定义）
   */
  private seedDefaultWorkflows() {
    const defaultWorkflows: OrganizationWorkflowDefinition[] = [
      {
        id: 'hr.leave.request',
        workflowId: 'hr.leave.request',
        name: '员工请假审批',
        description: '支持事假、年假、病假等考勤申请，审批承认后自动联动外部人事考勤系统核销额度。',
        category: 'hr',
        icon: 'CalendarOutlined',
        taskType: CoordinationTaskType.approval,
        status: 'published',
        isPublished: true,
        version: '1.0.0',
        assembledWorkflows: [...DEFAULT_LEAVE_ASSEMBLED_WORKFLOWS],
        processDefinition: {
          stages: [
            {
              id: 'submit',
              name: '发起申请',
              type: 'submission',
              description: '员工填写请假类型、时长与事由参数卡片',
            },
            {
              id: 'leader_approval',
              name: '主管审批',
              type: 'approval',
              description: '直属主管在 GTD 收集箱在线核准或驳回',
              approverRule: 'leader',
              approverRole: 'leader',
              actions: ['approve', 'reject'],
            },
            {
              id: 'hrms_sync',
              name: '考勤核销执行',
              type: 'automation',
              description: '自动对接 HRMS 扣减额度并写入考勤结算单',
            },
            {
              id: 'archive',
              name: '回执与归档',
              type: 'archive',
              description: '考勤凭证回执推入收集箱，员工一键归档闭环',
            },
          ],
        },
        paramsSchema: BUILT_IN_WORKFLOW_TEMPLATES.find((t) => t.id === 'hr.leave.request')!
          .paramsSchema as any,
        grantedRoleIds: ['employee', 'admin'],
        createdAt: new Date('2026-09-01T08:00:00Z').toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'oa.expense.claim',
        workflowId: 'oa.expense.claim',
        name: '费用报销审批',
        description: '日常差旅、办公及招待费用报销审批，财务承认后自动写入 ERP 财务系统。',
        category: 'oa',
        icon: 'DollarOutlined',
        taskType: CoordinationTaskType.approval,
        status: 'published',
        isPublished: true,
        version: '1.0.0',
        assembledWorkflows: [...DEFAULT_EXPENSE_ASSEMBLED_WORKFLOWS],
        processDefinition: {
          stages: [
            {
              id: 'submit',
              name: '提报凭证',
              type: 'submission',
              description: '填写报销类别、金额及发票事由',
            },
            {
              id: 'finance_approval',
              name: '财务审核',
              type: 'approval',
              description: '主管及财务专员在收集箱审核凭证合规性',
              approverRule: 'role',
              approverRole: 'finance',
              actions: ['approve', 'reject'],
            },
            {
              id: 'erp_sync',
              name: '核算建档',
              type: 'automation',
              description: '自动对接财务网关建档并生成打款批次',
            },
            {
              id: 'archive',
              name: '回执与归档',
              type: 'archive',
              description: '生成报销凭证回执并归档',
            },
          ],
        },
        paramsSchema: BUILT_IN_WORKFLOW_TEMPLATES.find((t) => t.id === 'oa.expense.claim')!
          .paramsSchema as any,
        grantedRoleIds: ['employee', 'admin'],
        createdAt: new Date('2026-09-01T08:00:00Z').toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'general.coordination',
        workflowId: 'general.coordination',
        name: '通用协同任务',
        description: '日常跨部门工作指派、业务备忘或审阅协同任务。',
        category: 'general',
        icon: 'FileDoneOutlined',
        taskType: CoordinationTaskType.assignment,
        status: 'published',
        isPublished: true,
        version: '1.0.0',
        assembledWorkflows: [...DEFAULT_GENERAL_COORDINATION_ASSEMBLED_WORKFLOWS],
        processDefinition: {
          stages: [
            {
              id: 'submit',
              name: '任务布置',
              type: 'submission',
              description: '明确协同目标、要求及交付标准',
            },
            {
              id: 'execute',
              name: '协作者执行',
              type: 'approval',
              description: '协作者在 GTD 收集箱办理并回传结果附件',
              approverRule: 'assignee',
              actions: ['complete'],
            },
            {
              id: 'archive',
              name: '验收归档',
              type: 'archive',
              description: '发起人核准交付物，关闭任务并归档',
            },
          ],
        },
        paramsSchema: BUILT_IN_WORKFLOW_TEMPLATES.find((t) => t.id === 'general.coordination')!
          .paramsSchema as any,
        grantedRoleIds: ['employee', 'admin'],
        createdAt: new Date('2026-09-01T08:00:00Z').toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const w of defaultWorkflows) {
      this.workflows.set(w.id, w);
    }
    this.logger.log(`Initialized ${defaultWorkflows.length} default enterprise workflows.`);
  }

  /**
   * 获取 5173 底层可用资产（供管理员组装时多选）
   */
  async getAvailableBaseWorkflows(): Promise<AvailableBaseWorkflowItem[]> {
    const results: AvailableBaseWorkflowItem[] = [...DEDICATED_BASE_WORKFLOW_TEMPLATES];
    const seenIds = new Set<string>(results.map((r) => r.id));

    try {
      // 1. 获取 Execution Flow Templates (通用技术执行流，不预设流程阶段)
      const flows = await this.prisma.executionFlowTemplate.findMany({
        where: { isActive: true },
        select: { id: true, name: true, category: true, description: true },
        take: 30,
      });
      for (const f of flows) {
        if (!seenIds.has(f.id)) {
          seenIds.add(f.id);
          results.push({
            type: 'execution_flow',
            id: f.id,
            name: f.name,
            category: f.category,
            description: f.description || undefined,
            handlerRule: '执行流后台自动化执行',
          });
        }
      }
    } catch (err) {
      this.logger.warn('Failed to query executionFlowTemplates:', err);
    }

    try {
      // 2. 获取 Temporal Workflows (包含通用编排流与带 stageType 的流程专用流)
      const temporalWorkflows = await this.prisma.temporalWorkflow.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          workflowDsl: true,
          activityDsl: true,
          generatedCode: true,
          validationStatus: true,
          validationScore: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      for (const tw of temporalWorkflows) {
        if (!seenIds.has(tw.id)) {
          seenIds.add(tw.id);
          let dsl: any = null;
          try {
            dsl = typeof tw.workflowDsl === 'string' ? JSON.parse(tw.workflowDsl) : tw.workflowDsl;
          } catch (error) {
            this.logger.warn(`Failed to parse workflowDsl for workflow ${tw.id}: ${(error as Error).message}`);
          }
          let actDsl: any = null;
          try {
            actDsl = typeof tw.activityDsl === 'string' ? JSON.parse(tw.activityDsl) : tw.activityDsl;
          } catch (error) {
            this.logger.warn(`Failed to parse activityDsl for workflow ${tw.id}: ${(error as Error).message}`);
          }

          const stageType = dsl?.stageType || undefined;
          results.push({
            type: 'temporal_workflow',
            id: tw.id,
            name: tw.name,
            category: dsl?.stageCategory || dsl?.category || 'temporal',
            description: tw.description || undefined,
            stageType,
            handlerRule: dsl?.handlerRule || (stageType ? '后台自动化执行' : 'Temporal 引擎异步编排执行'),
            requiredMetadata: dsl?.requiredMetadata || undefined,
            validationStatus: tw.validationStatus || 'draft',
            validationScore: tw.validationScore || 0,
            hasGeneratedCode: Boolean(tw.generatedCode),
            workflowDsl: dsl || undefined,
            activityDsl: actDsl || undefined,
            generatedCode: tw.generatedCode || undefined,
          });
        }
      }
    } catch (err) {
      this.logger.warn('Failed to query temporalWorkflows:', err);
    }

    try {
      // 3. 获取 Skills (原子技能，不预设流程阶段)
      const skills = await this.prisma.skillConfig.findMany({
        where: { isActive: true },
        select: { id: true, name: true, description: true },
        take: 30,
      });
      for (const s of skills) {
        if (!seenIds.has(s.id)) {
          seenIds.add(s.id);
          results.push({
            type: 'skill',
            id: s.id,
            name: s.name,
            category: 'skill',
            description: s.description || undefined,
            handlerRule: 'AI / 工具原子技能执行',
          });
        }
      }
    } catch (err) {
      this.logger.warn('Failed to query skills:', err);
    }

    // 4. 追加用户自定义或 AI 生成的流程专用原子流 (具备明确 stageType)
    for (const customFlow of this.customBaseWorkflows.values()) {
      if (!seenIds.has(customFlow.id)) {
        seenIds.add(customFlow.id);
        results.push(customFlow);
      }
    }

    return results;
  }

  /**
   * 注册用户创建或 AI 生成的流程专用原子工作流 (支持与 Temporal 真实工作流关联持久化)
   */
  async registerCustomBaseWorkflow(
    item: Partial<AvailableBaseWorkflowItem> & { id: string; name: string }
  ): Promise<AvailableBaseWorkflowItem> {
    if (!item.id || !item.name) {
      throw new BadRequestException('工作流 ID 和名称不能为空');
    }
    const flow: AvailableBaseWorkflowItem = {
      type: item.type || 'temporal_workflow',
      id: item.id.trim(),
      name: item.name.trim(),
      category: item.category || 'general',
      stageType: item.stageType || 'automation',
      handlerRule: item.handlerRule || '后台自动化执行',
      requiredMetadata: item.requiredMetadata || ['业务主键', '操作人'],
      description: item.description,
      validationStatus: item.validationStatus || (item.generatedCode ? 'generated' : 'draft'),
      validationScore: item.validationScore || 0,
      hasGeneratedCode: Boolean(item.generatedCode),
      workflowDsl: item.workflowDsl,
      activityDsl: item.activityDsl,
      generatedCode: item.generatedCode,
    };

    // 如果包含 workflowDsl，同步存入真实的 temporal_workflows 数据表
    try {
      if (item.workflowDsl) {
        const dsl = {
          ...item.workflowDsl,
          stageType: flow.stageType,
          handlerRule: flow.handlerRule,
          requiredMetadata: flow.requiredMetadata,
          stageCategory: flow.category,
        };
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(flow.id);
        const existing = isUuid
          ? await this.prisma.temporalWorkflow.findUnique({ where: { id: flow.id } })
          : await this.prisma.temporalWorkflow.findFirst({ where: { name: flow.name } });

        if (existing) {
          const updated = await this.prisma.temporalWorkflow.update({
            where: { id: existing.id },
            data: {
              name: flow.name,
              description: flow.description,
              workflowDsl: dsl as any,
              activityDsl: (item.activityDsl || { activities: [] }) as any,
              generatedCode: item.generatedCode || existing.generatedCode,
              validationStatus: flow.validationStatus || existing.validationStatus,
              validationScore: flow.validationScore || existing.validationScore,
            },
          });
          flow.id = updated.id;
        } else {
          const created = await this.prisma.temporalWorkflow.create({
            data: {
              ...(isUuid ? { id: flow.id } : {}),
              name: flow.name,
              description: flow.description,
              taskQueue: `${(flow.category || 'general').toUpperCase()}_STAGE_TASK_QUEUE`,
              workflowDsl: dsl as any,
              activityDsl: (item.activityDsl || { activities: [] }) as any,
              generatedCode: item.generatedCode || null,
              validationStatus: flow.validationStatus || (item.generatedCode ? 'generated' : 'draft'),
              validationScore: flow.validationScore || 0,
              isActive: true,
            },
          });
          flow.id = created.id;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to persist custom stage workflow to temporal_workflows: ${err}`);
    }

    this.customBaseWorkflows.set(flow.id, flow);
    this.logger.log(`Registered custom base workflow: ${flow.id} (${flow.name})`);
    return flow;
  }

  /**
   * 删除指定的自定义流程专用原子流
   */
  async deleteCustomBaseWorkflow(id: string): Promise<boolean> {
    const existed = this.customBaseWorkflows.delete(id);
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        await this.prisma.temporalWorkflow.deleteMany({ where: { id } });
      }
    } catch (err) {
      this.logger.warn(`Failed to delete temporal workflow record for ${id}: ${err}`);
    }
    this.logger.log(`Deleted custom base workflow: ${id}, existed: ${existed}`);
    return existed || true;
  }

  /**
   * 清空所有自定义流程专用原子流
   */
  async clearAllCustomBaseWorkflows(): Promise<void> {
    this.customBaseWorkflows.clear();
    try {
      const all = await this.prisma.temporalWorkflow.findMany();
      const toDeleteIds: string[] = [];
      for (const w of all) {
        let dsl: any = null;
        try {
          dsl = typeof w.workflowDsl === 'string' ? JSON.parse(w.workflowDsl) : w.workflowDsl;
        } catch (error) {
          this.logger.warn(`Failed to parse workflowDsl for workflow ${w.id}: ${(error as Error).message}`);
        }
        if (dsl?.stageType) {
          toDeleteIds.push(w.id);
        }
      }
      if (toDeleteIds.length > 0) {
        await this.prisma.temporalWorkflow.deleteMany({
          where: { id: { in: toDeleteIds } },
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to clear custom temporal workflows: ${err}`);
    }
    this.logger.log('Cleared all custom base workflows');
  }

  /**
   * 管理员查询全量工作流列表（草稿 + 已发布）及全景统计
   */
  async listAdminWorkflows(): Promise<{
    workflows: OrganizationWorkflowDefinition[];
    stats: {
      total: number;
      publishedCount: number;
      draftCount: number;
      assembledBaseCount: number;
    };
  }> {
    const all = Array.from(this.workflows.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const publishedCount = all.filter((w) => w.isPublished).length;
    const draftCount = all.length - publishedCount;
    const assembledBaseCount = all.reduce(
      (sum, w) => sum + (w.assembledWorkflows?.length || 0),
      0
    );

    return {
      workflows: all,
      stats: {
        total: all.length,
        publishedCount,
        draftCount,
        assembledBaseCount,
      },
    };
  }

  /**
   * 业务端员工查询已发布的组织工作流目录（带权限判定）
   */
  async listCatalogForUser(userId: string): Promise<OrgWorkflowCatalogItemDto[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });

    const userRoleNames = new Set<string>();
    const userRoleIds = new Set<string>();

    if (user) {
      if (user.role) {
        userRoleNames.add(user.role);
      }
      for (const ur of user.userRoles || []) {
        userRoleIds.add(ur.roleId);
        if (ur.role?.name) {
          userRoleNames.add(ur.role.name);
        }
      }
    }

    const isAdmin = userRoleNames.has('admin') || user?.role === 'admin';

    // 仅返回已发布的工作流
    const publishedWorkflows = Array.from(this.workflows.values()).filter(
      (w) => w.isPublished
    );

    // 查询该用户当前的所有申请
    const userRequests = Array.from(this.accessRequests.values()).filter(
      (r) => r.userId === userId
    );
    const requestMap = new Map<string, OrgWorkflowAccessRequest>(
      userRequests.map((r) => [r.workflowId, r])
    );

    return publishedWorkflows.map((w) => {
      let isAuthorized = isAdmin;

      if (!isAuthorized) {
        // 校验 grantedRoleIds
        const granted = w.grantedRoleIds || [];
        if (granted.length === 0) {
          // 未配置角色时默认对所有已激活员工开放
          isAuthorized = true;
        } else {
          isAuthorized = granted.some(
            (roleIdOrName) =>
              userRoleIds.has(roleIdOrName) || userRoleNames.has(roleIdOrName)
          );
        }
      }

      const req = requestMap.get(w.id);
      let accessStatus: 'authorized' | 'requested' | 'unauthorized' = 'unauthorized';

      if (isAuthorized) {
        accessStatus = 'authorized';
      } else if (req && req.status === 'pending') {
        accessStatus = 'requested';
      }

      return {
        ...w,
        accessStatus,
        accessRequest: req || null,
      };
    });
  }

  /**
   * 获取单个工作流详情
   */
  getWorkflowById(id: string): OrganizationWorkflowDefinition | null {
    return this.workflows.get(id) || null;
  }

  /**
   * 创建新的企业工作流（基于底层工作流组装与流程定义）
   */
  async createWorkflow(
    dto: CreateOrgWorkflowDto,
    creatorUserId?: string
  ): Promise<OrganizationWorkflowDefinition> {
    if (!dto.name?.trim() || !dto.workflowId?.trim()) {
      throw new BadRequestException('工作流名称和唯一代号 (workflowId) 不能为空');
    }

    const existing = Array.from(this.workflows.values()).find(
      (w) => w.workflowId === dto.workflowId.trim()
    );
    if (existing) {
      throw new ConflictException(`已存在相同代号的企业工作流: ${dto.workflowId}`);
    }

    const id = dto.workflowId.trim();
    const status: OrgWorkflowPublishStatus = dto.status || 'draft';
    const isPublished = status === 'published';

    const defaultStages: WorkflowStageDefinition[] = [
      {
        id: 'submit',
        name: '发起申请',
        type: 'submission',
        description: '申请人提交业务表单参数',
      },
      {
        id: 'approval',
        name: '主管审批',
        type: 'approval',
        description: '相关审批人在收集箱核准或驳回',
        approverRule: 'leader',
        actions: ['approve', 'reject'],
      },
      {
        id: 'archive',
        name: '闭环归档',
        type: 'archive',
        description: '自动归档并保留履历审计',
      },
    ];

    const workflow: OrganizationWorkflowDefinition = {
      id,
      workflowId: dto.workflowId.trim(),
      name: dto.name.trim(),
      description: dto.description?.trim() || '',
      category: dto.category || 'general',
      icon: dto.icon || 'ApartmentOutlined',
      taskType: dto.taskType || CoordinationTaskType.approval,
      status,
      isPublished,
      version: dto.version || '1.0.0',
      assembledWorkflows: dto.assembledWorkflows || [],
      processDefinition: dto.processDefinition || { stages: defaultStages },
      paramsSchema: dto.paramsSchema || {
        properties: {
          title: { type: 'string', description: '事项标题', required: true },
          reason: { type: 'string', description: '事由说明', required: true },
        },
        required: ['title', 'reason'],
      },
      grantedRoleIds: dto.grantedRoleIds || ['employee', 'admin'],
      createdBy: creatorUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.workflows.set(id, workflow);
    this.logger.log(`Created enterprise workflow: ${workflow.name} (${workflow.id})`);
    return workflow;
  }

  /**
   * 更新企业工作流配置、底层工作流组装与流程定义
   */
  async updateWorkflow(
    id: string,
    dto: UpdateOrgWorkflowDto
  ): Promise<OrganizationWorkflowDefinition> {
    const existing = this.workflows.get(id);
    if (!existing) {
      throw new NotFoundException(`企业工作流不存在: ${id}`);
    }

    const nextStatus = dto.status !== undefined ? dto.status : existing.status;
    const isPublished = nextStatus === 'published';

    const updated: OrganizationWorkflowDefinition = {
      ...existing,
      name: dto.name?.trim() ?? existing.name,
      description: dto.description?.trim() ?? existing.description,
      category: dto.category ?? existing.category,
      icon: dto.icon ?? existing.icon,
      taskType: dto.taskType ?? existing.taskType,
      status: nextStatus,
      isPublished,
      version: dto.version ?? existing.version,
      assembledWorkflows: dto.assembledWorkflows ?? existing.assembledWorkflows,
      processDefinition: dto.processDefinition ?? existing.processDefinition,
      paramsSchema: dto.paramsSchema ?? existing.paramsSchema,
      grantedRoleIds: dto.grantedRoleIds ?? existing.grantedRoleIds,
      updatedAt: new Date().toISOString(),
    };

    this.workflows.set(id, updated);
    this.logger.log(`Updated enterprise workflow: ${updated.name} (${id})`);
    return updated;
  }

  /**
   * 管理员一键发布 / 下架
   */
  async togglePublish(id: string, publish?: boolean): Promise<OrganizationWorkflowDefinition> {
    const existing = this.workflows.get(id);
    if (!existing) {
      throw new NotFoundException(`企业工作流不存在: ${id}`);
    }

    const nextPublished = publish !== undefined ? publish : !existing.isPublished;
    existing.isPublished = nextPublished;
    existing.status = nextPublished ? 'published' : 'draft';
    existing.updatedAt = new Date().toISOString();

    this.workflows.set(id, existing);
    this.logger.log(`Workflow [${existing.name}] published status set to ${nextPublished}`);
    return existing;
  }

  /**
   * 删除工作流
   */
  async deleteWorkflow(id: string): Promise<void> {
    if (!this.workflows.has(id)) {
      throw new NotFoundException(`企业工作流不存在: ${id}`);
    }
    this.workflows.delete(id);
    this.logger.log(`Deleted enterprise workflow: ${id}`);
  }

  /**
   * 授权管理：修改角色列表
   */
  async updatePermissions(id: string, roleIds: string[]): Promise<OrganizationWorkflowDefinition> {
    const existing = this.workflows.get(id);
    if (!existing) {
      throw new NotFoundException(`企业工作流不存在: ${id}`);
    }
    existing.grantedRoleIds = Array.from(new Set(roleIds));
    existing.updatedAt = new Date().toISOString();
    this.workflows.set(id, existing);
    return existing;
  }

  /**
   * 普通员工提交开通权限申请
   */
  async requestAccess(
    workflowId: string,
    userId: string,
    reason?: string
  ): Promise<OrgWorkflowAccessRequest> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new NotFoundException(`企业工作流不存在: ${workflowId}`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    const requestId = `req_${randomUUID()}`;
    const request: OrgWorkflowAccessRequest = {
      id: requestId,
      workflowId,
      userId,
      username: user?.username || 'user',
      status: 'pending',
      reason: reason?.trim(),
      createdAt: new Date().toISOString(),
    };

    this.accessRequests.set(requestId, request);
    this.logger.log(`User ${userId} requested access for workflow ${workflowId}`);
    return request;
  }

  /**
   * 管理员审核开通权限申请
   */
  async reviewAccessRequest(
    requestId: string,
    reviewerId: string,
    status: 'approved' | 'rejected',
    note?: string
  ): Promise<OrgWorkflowAccessRequest> {
    const request = this.accessRequests.get(requestId);
    if (!request) {
      throw new NotFoundException(`授权申请不存在: ${requestId}`);
    }

    request.status = status;
    request.responseNote = note?.trim();
    request.processedAt = new Date().toISOString();
    request.processedBy = reviewerId;

    if (status === 'approved') {
      // 自动将员工角色或该工作流授权名单更新
      const workflow = this.workflows.get(request.workflowId);
      if (workflow && !workflow.grantedRoleIds.includes('employee')) {
        workflow.grantedRoleIds.push('employee');
        this.workflows.set(request.workflowId, workflow);
      }
    }

    this.accessRequests.set(requestId, request);
    return request;
  }

  /**
   * 获取某工作流的所有开通申请列表
   */
  listAccessRequests(workflowId?: string): OrgWorkflowAccessRequest[] {
    const all = Array.from(this.accessRequests.values());
    if (workflowId) {
      return all.filter((r) => r.workflowId === workflowId);
    }
    return all;
  }
}
