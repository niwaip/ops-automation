import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../ports';
import { InboxItemStatus, TodoSourceType } from '../inbox/dto/workbench-inbox.dto';
import { TodoStatus } from '../todo/dto/workbench-todo.dto';
import { WorkbenchInboxService } from '../inbox/workbench-inbox.service';
import {
  CoordinationTaskPriority,
  CoordinationTaskStatus,
  CoordinationTaskType,
  CreateCoordinationTaskDto,
  QueryCollaboratorsDto,
  SubmitCoordinationActionDto,
} from './dto/workbench-coordination.dto';
import { BUILT_IN_WORKFLOW_TEMPLATES } from './workflow-templates.constants';

import { OrgWorkflowService } from './org-workflow.service';
import { WorkflowStageDefinition } from './org-workflow.entity';
import { CoordinationStageEngineService } from './coordination-stage-engine.service';
import { WorkspaceService } from '../workspace/workspace.service';
import {
  CoordinationCollaboratorService,
  CollaboratorUserDto,
  UUID_REGEX,
} from './coordination-collaborator.service';
import { CoordinationLifecycleService } from './coordination-lifecycle.service';

import {
  sanitizeCoordinationAttachments,
  resolveEffectiveAndHistoricalAttachments,
} from './coordination-attachment-helper';
import { CoordinationActionProcessor } from './coordination-action.processor';

import { CoordinationAttachmentStorageService } from './coordination-attachment-storage.service';
import { DocxCommentInjectorService } from './docx-comment-injector.service';

export {
  CollaboratorUserDto,
  sanitizeCoordinationAttachments,
  resolveEffectiveAndHistoricalAttachments,
};

@Injectable()
export class WorkbenchCoordinationService implements OnModuleInit {
  private readonly logger = new Logger(WorkbenchCoordinationService.name);
  private readonly lifecycleService: CoordinationLifecycleService;
  private readonly actionProcessor: CoordinationActionProcessor;

  constructor(
    @Inject(WORKBENCH_PRISMA)
    private readonly prisma: WorkbenchPrismaPort,
    private readonly inboxService: WorkbenchInboxService,
    @Optional()
    private readonly orgWorkflowService?: OrgWorkflowService,
    @Optional()
    private readonly stageEngine: CoordinationStageEngineService = new CoordinationStageEngineService(),
    @Optional()
    private readonly workspaceService?: WorkspaceService,
    @Optional()
    private readonly collaboratorService: CoordinationCollaboratorService = new CoordinationCollaboratorService(
      prisma,
      orgWorkflowService
    ),
    @Optional()
    private readonly attachmentStorage?: CoordinationAttachmentStorageService,
    @Optional()
    private readonly commentInjector: DocxCommentInjectorService = new DocxCommentInjectorService()
  ) {
    this.lifecycleService = new CoordinationLifecycleService(
      this.prisma,
      (id) => this.resolveUser(id),
      (taskId) => this.findTargetInboxItem(taskId)
    );
    this.actionProcessor = new CoordinationActionProcessor(
      this.prisma,
      this.logger,
      (id) => this.findTargetInboxItem(id),
      (id) => this.resolveUser(id),
      (...args) => (this.resolveStageApprover as any)(...args),
      this.stageEngine,
      this.orgWorkflowService,
      this.workspaceService,
      this.attachmentStorage,
      this.commentInjector
    );
  }

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
    return this.collaboratorService.searchCollaborators(currentUserId, query);
  }

  /**
   * 安全解析用户：支持 UUID、username、email，或兜底首个有效用户
   */
  private async resolveUser(idOrUsername?: string) {
    return this.collaboratorService.resolveUser(idOrUsername);
  }

  /**
   * 基于工作流模版中的阶段定义（approverRule / approverDepartment / approverUsername / approverRole），
   * 严格按照流程模版中选择的部门或用户进行受派人解析，杜绝任何随意模糊匹配。
   */
  async resolveStageApprover(
    workflowId: string,
    stageId: string,
    initiatorUserId: string
  ): Promise<{ id: string; username: string; email?: string | null }> {
    return this.collaboratorService.resolveStageApprover(workflowId, stageId, initiatorUserId);
  }

  /**
   * 发起协同任务并推入接收人的 GTD 收集箱
   */
  async createTask(initiatorUserId: string, dto: CreateCoordinationTaskDto) {
    if (!dto.assigneeId || !dto.title?.trim() || !dto.content?.trim()) {
      throw new BadRequestException('创建协同任务失败：指派人、标题与内容不能为空');
    }

    // 1. 查询发起人与接收人信息（安全解析 UUID、用户名或兜底）
    const [initiator, assignee] = await Promise.all([
      this.resolveUser(initiatorUserId),
      this.resolveUser(dto.assigneeId),
    ]);

    if (!initiator) {
      throw new NotFoundException(`发起人用户不存在: ${initiatorUserId}`);
    }
    if (!assignee) {
      throw new NotFoundException(`被指派协同用户不存在: ${dto.assigneeId}`);
    }

    const taskId = `coord_${randomUUID()}`;
    const workflowId = dto.workflowId;
    const parameters = dto.parameters || {};
    const taskType = dto.taskType || CoordinationTaskType.approval;

    // 核心幂等保证：若已存在相同 executionId 的协同工单，直接返回已有工单，杜绝重复创建
    const executionId = (parameters as any).executionId || (dto.metadata as any)?.executionId;
    if (executionId) {
      try {
        const existingItem = await this.prisma.workbenchInboxItem.findFirst({
          where: {
            userId: assignee.id,
            unifiedPayload: {
              path: ['parameters', 'executionId'],
              equals: executionId,
            },
          },
        });
        if (existingItem) {
          const payload = (existingItem.unifiedPayload || {}) as any;
          const stage = payload.currentStage;
          if (!stage || stage === 'initiator_confirm' || stage === 'draft_submission') {
            this.logger.log(`[CreateTask] Returning existing coordination task for executionId ${executionId}: ${existingItem.sourceRefId}`);
            return {
              taskId: existingItem.sourceRefId || payload.taskId || existingItem.id,
              inboxItemId: existingItem.id,
              taskType: payload.taskType || CoordinationTaskType.approval,
              status: payload.status || CoordinationTaskStatus.pending,
              title: existingItem.sourceTitle || existingItem.title,
              initiator: payload.initiator,
              assignee: payload.assignee,
              unifiedPayload: payload,
            };
          }
        }
      } catch (e) {
        // ignore JSON path error on older sqlite if any
      }
    }

    let typePrefix = '[待我处理]';
    if (taskType === CoordinationTaskType.approval) {
      typePrefix = '[待我承认]';
    } else if (taskType === CoordinationTaskType.assignment) {
      typePrefix = '[待我执行]';
    } else if (taskType === CoordinationTaskType.review) {
      typePrefix = '[待我复核]';
    }

    const workflow: any = workflowId
      ? this.orgWorkflowService?.getWorkflowById(workflowId) ||
        BUILT_IN_WORKFLOW_TEMPLATES.find((t) => t.id === workflowId || t.workflowId === workflowId)
      : undefined;

    const stages: any[] = workflow?.processDefinition?.stages || [];
    const firstActionableStage = stages.find(
      (s) => s.type === 'approval' || s.type === 'review' || s.type === 'assignment'
    );
    const currentStage =
      (parameters as any)?.currentStage ||
      (dto.metadata as any)?.currentStage ||
      firstActionableStage?.id ||
      (stages.length > 0 ? stages[0].id : undefined);

    const currentStageDef = stages.find((s) => s.id === currentStage);
    if (currentStageDef?.name) {
      if (
        currentStageDef.approverRule === 'initiator' ||
        currentStageDef.id === 'initiator_confirm' ||
        currentStageDef.name.includes('担当') ||
        currentStageDef.name.includes('初稿确认')
      ) {
        typePrefix = '[待发送]';
      } else if (currentStageDef.name.includes('法务')) {
        typePrefix = '[待法务确认]';
      } else {
        let stageLabel = currentStageDef.name;
        if (stageLabel.length > 5) stageLabel = stageLabel.slice(0, 5);
        typePrefix = `[待${stageLabel}]`;
      }
    }

    const inboxTitle = `${typePrefix} ${dto.title.trim()}`;
    const cleanContent = dto.content.trim();

    const attachments = [...(dto.attachments || [])];

    // 通用成果物/生成文件自动提取与关联（适用于所有含文件生成或成果确认的阶段）
    const isArtifactStage = this.stageEngine.isArtifactConfirmationStage(currentStageDef, {
      attachments,
      parameters: parameters as any,
    });

    if (attachments.length === 0) {
      const directUrl =
        (parameters as any).downloadUrl ||
        (parameters as any).fileUrl ||
        (parameters as any).artifactUrl ||
        (parameters as any).documentUrl ||
        (dto.metadata as any)?.downloadUrl ||
        (dto.metadata as any)?.fileUrl ||
        (dto.metadata as any)?.artifactUrl ||
        (dto.metadata as any)?.generatedDocUrl;

      if (directUrl) {
        const fileName =
          (parameters as any).fileName ||
          (parameters as any).contractFileName ||
          (parameters as any).documentName ||
          `${dto.title.trim()}.docx`;
        const attachmentSize =
          Number((parameters as any).size) || Number((parameters as any).fileSize) || undefined;
        attachments.push({
          name: fileName,
          url: directUrl,
          ...(attachmentSize ? { size: attachmentSize } : {}),
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        (parameters as any).downloadUrl = directUrl;
        (parameters as any).fileName = fileName;
      } else if (isArtifactStage) {
        try {
          const executionId = (parameters as any).executionId || (dto.metadata as any)?.executionId;

          // 核心安全准则：必须使用精确的 executionId 绑定，严禁模糊查询全库“最近一次成功执行”
          if (executionId) {
            const docExecution = await this.prisma.execution.findUnique({
              where: { id: executionId },
              include: { artifacts: true },
            });

            if (docExecution) {
              const rJson = (docExecution.resultJson || {}) as any;
              const artifactRecord = docExecution.artifacts?.[0];
              const downloadUrl =
                artifactRecord?.url ||
                rJson.downloadUrl ||
                rJson.result?.businessData?.result?.downloadUrl;
              const fileName =
                artifactRecord?.name ||
                rJson.fileName ||
                rJson.result?.businessData?.result?.fileName ||
                `${dto.title.trim()}.docx`;
              const docSize =
                artifactRecord?.sizeBytes ||
                Number(rJson.size) ||
                Number(rJson.result?.businessData?.result?.size) ||
                undefined;

              if (downloadUrl) {
                attachments.push({
                  id: artifactRecord?.id,
                  name: fileName,
                  url: downloadUrl,
                  downloadUrl,
                  ...(docSize ? { size: docSize } : {}),
                  sha256: artifactRecord?.sha256,
                  mimeType: artifactRecord?.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                });
                (parameters as any).downloadUrl = downloadUrl;
                (parameters as any).fileName = fileName;
                (parameters as any).artifactId = artifactRecord?.id;
              }
            }
          }
        } catch (queryErr) {
          this.logger.warn('Failed to query precise execution artifact:', queryErr);
        }
      }
    }

    const effectiveParameters = {
      ...(parameters || {}),
      currentStage,
    };

    const unifiedPayload = {
      kind: 'coordination',
      taskId,
      workflowId,
      currentStage,
      parameters: effectiveParameters,
      taskType,
      status: CoordinationTaskStatus.pending,
      priority: dto.priority || CoordinationTaskPriority.medium,
      dueDate: dto.dueDate || null,
      initiator: {
        id: initiator.id,
        username: initiator.username,
        email: initiator.email,
        orgId: initiator.orgId || null,
      },
      assignee: {
        id: assignee.id,
        username: assignee.username,
        email: assignee.email,
        orgId: assignee.orgId || null,
      },
      attachments,
      isCardTemplate: Boolean(dto.isCardTemplate),
      actions: [],
      orgId: initiator.orgId || assignee.orgId || null,
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
  /**
   * 多维安全查找协同任务关联的收件箱条目
   */
  async findTargetInboxItem(taskId: string) {
    const cleanId = taskId.replace(/^(?:coord_)+/, '');
    const isTaskIdUuid = UUID_REGEX.test(taskId);
    const isCleanIdUuid = UUID_REGEX.test(cleanId);

    let rawTarget = await this.prisma.workbenchInboxItem.findFirst({
      where: {
        OR: [
          { sourceRefId: taskId },
          isTaskIdUuid ? { id: taskId } : undefined,
          { sourceRefId: `coord_${cleanId}` },
          { sourceRefId: cleanId },
          isCleanIdUuid ? { id: cleanId } : undefined,
        ].filter(Boolean) as any,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (rawTarget && rawTarget.id !== taskId && (rawTarget.title?.startsWith('[协同回执]') || (rawTarget.unifiedPayload as any)?.isReceipt)) {
      const isRevision =
        (rawTarget.unifiedPayload as any)?.status === 'revision_required' ||
        (rawTarget.unifiedPayload as any)?.receiptAction === 'reject' ||
        rawTarget.title?.includes('[需重修]') ||
        rawTarget.title?.includes('已驳回');
      if (!isRevision) {
        try {
          const realTaskItem = await this.prisma.workbenchInboxItem.findFirst({
            where: {
              OR: [
                { sourceRefId: taskId },
                { sourceRefId: `coord_${cleanId}` },
                { sourceRefId: cleanId },
              ],
              NOT: {
                title: { startsWith: '[协同回执]' },
              },
            },
            orderBy: { createdAt: 'desc' },
          });
          if (realTaskItem) {
            rawTarget = realTaskItem;
          }
        } catch {
          // ignore
        }
      }
    }

    if (!rawTarget) {
      // 尝试通过 workbenchTodo 关联反查
      try {
        const todo = await this.prisma.workbenchTodo?.findFirst?.({
          where: {
            OR: [
              isTaskIdUuid ? { id: taskId } : undefined,
              isCleanIdUuid ? { id: cleanId } : undefined,
              { sourceRefId: taskId },
              { sourceRefId: cleanId },
              { sourceRefId: `coord_${cleanId}` },
            ].filter(Boolean) as any,
          },
        });
        if (todo) {
          const cData = (todo.contextData || {}) as Record<string, any>;
          const refId = todo.sourceRefId || cData.taskId || cData.inboxItemId;
          if (refId) {
            const cleanRef = refId.replace(/^(?:coord_)+/, '');
            const isRefUuid = UUID_REGEX.test(refId);
            const isCleanRefUuid = UUID_REGEX.test(cleanRef);
            const isInboxItemIdUuid = cData.inboxItemId && UUID_REGEX.test(cData.inboxItemId);

            const itemByTodo = await this.prisma.workbenchInboxItem.findFirst({
              where: {
                OR: [
                  { sourceRefId: refId },
                  { sourceRefId: cleanRef },
                  { sourceRefId: `coord_${cleanRef}` },
                  isRefUuid ? { id: refId } : undefined,
                  isCleanRefUuid ? { id: cleanRef } : undefined,
                  isInboxItemIdUuid ? { id: cData.inboxItemId } : undefined,
                ].filter(Boolean) as any,
              },
              orderBy: { createdAt: 'desc' },
            });
            if (itemByTodo) rawTarget = itemByTodo;
          }
        }
      } catch {
        // ignore
      }
    }

    if (!rawTarget) return null;

    // 智能穿透关联：如果找到的条目属于单任务执行报告/成果物通知 (无 workflowId)，
    // 但归属用户存在正处于初稿确认待发送阶段的真实协同任务，自动将成果物（文档下载链接等）注入协同任务并返回真实协同任务以驱动流转
    const payload = (rawTarget.unifiedPayload || {}) as Record<string, any>;
    if (!payload.workflowId) {
      try {
        const activeCoordItem = await this.prisma.workbenchInboxItem.findFirst({
          where: {
            userId: rawTarget.userId,
            status: InboxItemStatus.unprocessed,
            OR: [
              { sourceRefId: { startsWith: 'coord_' } },
              { title: { contains: '待发送' } },
              { title: { contains: '需重修' } },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });

        if (activeCoordItem && (activeCoordItem.unifiedPayload as any)?.workflowId) {
          const rawArtifacts = payload.artifacts || payload.result?.businessData?.result || {};
          const downloadUrl =
            payload.downloadUrl || rawArtifacts.downloadUrl || (payload.extra as any)?.downloadUrl;
          const fileName =
            payload.result?.businessData?.result?.fileName ||
            rawArtifacts.fileName ||
            rawArtifacts.name;

          if (downloadUrl) {
            const coordPayload = (activeCoordItem.unifiedPayload || {}) as Record<string, any>;
            const params = { ...(coordPayload.parameters || {}) };
            params.downloadUrl = downloadUrl;
            if (fileName) params.fileName = fileName;
            coordPayload.parameters = params;

            const existingAttachments = Array.isArray(coordPayload.attachments)
              ? coordPayload.attachments
              : [];
            const hasFile = existingAttachments.some((a: any) => a?.url === downloadUrl);
            if (!hasFile && (fileName || downloadUrl)) {
              coordPayload.attachments = [
                ...existingAttachments,
                {
                  name: fileName || '保密合同初稿.docx',
                  url: downloadUrl,
                  size: 19463,
                  mimeType:
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                },
              ];
            }

            await this.prisma.workbenchInboxItem.update({
              where: { id: activeCoordItem.id },
              data: {
                unifiedPayload: coordPayload as any,
                updatedAt: new Date(),
              },
            });
          }

          // 将当前执行报告收件箱条目及其关联待办标记为已处理/已完成
          await this.prisma.workbenchInboxItem.update({
            where: { id: rawTarget.id },
            data: {
              status: InboxItemStatus.converted,
              updatedAt: new Date(),
            },
          });
          if (rawTarget.convertedTodoId) {
            await this.prisma.workbenchTodo?.updateMany?.({
              where: { id: rawTarget.convertedTodoId },
              data: {
                status: TodoStatus.completed,
                completedAt: new Date(),
                updatedAt: new Date(),
              },
            });
          }

          return activeCoordItem;
        }
      } catch (linkErr) {
        this.logger.warn(`Failed to link execution item to active coordination task:`, linkErr);
      }
    }

    return rawTarget;
  }

  /**
   * 处理协同操作（同意、拒绝、提交完成，可附带说明与附件）
   * 当流转路径中包含前置自动化能力（如合同合规审查）时，默认进入后台异步执行与 3 次重试机制，避免同步阻塞客户端
   */
  async submitAction(
    operatorUserId: string,
    taskId: string,
    dto: SubmitCoordinationActionDto
  ): Promise<any> {
    if (!dto.action) {
      throw new BadRequestException('操作动作不能为空');
    }

    const targetItem = await this.findTargetInboxItem(taskId);
    if (!targetItem) {
      throw new NotFoundException(`未找到协同任务: ${taskId}`);
    }

    const payload = (targetItem.unifiedPayload || {}) as Record<string, any>;

    // 识别当前任务是否处于需重修/已驳回状态
    const isRevisionRequired =
      payload.status === 'revision_required' ||
      payload.status === CoordinationTaskStatus.rejected ||
      payload.receiptAction === 'reject' ||
      targetItem.title?.includes('[需重修]') ||
      targetItem.title?.includes('需重修') ||
      targetItem.title?.includes('已驳回');

    // 1. 权限强校验：必须为指定承办人或系统管理员（基于角色的 RBAC），严禁未授权代办
    const operator = await this.resolveUser(operatorUserId);
    const isAssignee =
      payload.assignee?.id === operatorUserId ||
      payload.assigneeId === operatorUserId ||
      targetItem.userId === operatorUserId ||
      payload.assignee?.username === operatorUserId ||
      Boolean(operator?.username && payload.assignee?.username === operator.username) ||
      (isRevisionRequired &&
        (payload.initiator?.id === operatorUserId ||
          payload.initiator?.username === operator?.username ||
          targetItem.userId === operatorUserId));
    const isAdmin = operator?.role === 'admin';

    if (!isAssignee && !isAdmin) {
      throw new ForbiddenException(
        `无权处理当前协同任务：当前操作人 [${operator?.username || operatorUserId}] 不是本阶段的指定承办人 [${payload.assignee?.username || payload.assigneeId || '未指定'}]`
      );
    }

    // 2. 组织租户隔离安全校验：禁止跨组织越权流转
    const taskOrgId = payload.orgId || (targetItem as any).orgId;
    if (taskOrgId && operator?.orgId && taskOrgId !== operator.orgId && !isAdmin) {
      throw new ForbiddenException('无权跨组织处理协同任务');
    }

    // 3. 初稿确认送审门禁：必须存在真实合同附件或条款，严禁无产物送审
    const isConfirmOrSendStage =
      payload.currentStage === 'initiator_confirm' ||
      payload.currentStage === 'draft_submission' ||
      targetItem.title?.includes('[待发送]') ||
      targetItem.title?.includes('初稿确认');

    if (isConfirmOrSendStage && (dto.action === 'approve' || dto.action === 'complete')) {
      const hasAttachment =
        (Array.isArray(payload.attachments) &&
          payload.attachments.some((a: any) => Boolean(a && (a.url || a.downloadUrl)))) ||
        (Array.isArray(dto.attachments) &&
          dto.attachments.some((a: any) => Boolean(a && (a.url || a.downloadUrl)))) ||
        Boolean(payload.parameters?.downloadUrl || payload.parameters?.fileUrl || dto.parameters?.downloadUrl);

      if (!hasAttachment && !payload.parameters?.text && !dto.parameters?.text) {
        throw new BadRequestException('无法提交送审：当前协同任务未包含有效的合同文件或条款产物');
      }
    }

    // 核心约束：已驳回的内容，重新提交时不能无修改直接提交（必须修改业务要件参数或上传/替换附件）
    if (isRevisionRequired && (dto.action === 'approve' || dto.action === 'complete')) {
      const origParams = (payload.parameters || {}) as Record<string, any>;
      const newParams = (dto.parameters || {}) as Record<string, any>;
      const ignoredParamKeys = new Set([
        'downloadUrl',
        'fileUrl',
        'fileName',
        'executionId',
        'contractFileName',
        'contractUrl',
      ]);

      const hasParamChanges = Object.keys(newParams).some((k) => {
        if (ignoredParamKeys.has(k)) return false;
        const oldVal = String(origParams[k] ?? '').trim();
        const newVal = String(newParams[k] ?? '').trim();
        return oldVal !== newVal;
      });

      const origAttachments = (payload.attachments || []) as any[];
      const newAttachments = (dto.attachments || []) as any[];
      let hasAttachmentChanges = false;
      if (newAttachments.length !== origAttachments.length) {
        hasAttachmentChanges = true;
      } else {
        const origUrls = new Set(origAttachments.map((a) => a.url).filter(Boolean));
        const origNames = new Set(origAttachments.map((a) => a.name).filter(Boolean));
        for (const na of newAttachments) {
          if ((na.url && !origUrls.has(na.url)) || (na.name && !origNames.has(na.name))) {
            hasAttachmentChanges = true;
            break;
          }
        }
      }

      if (
        Boolean(dto.parameters?.isDraftReplaced) ||
        (newParams.downloadUrl && newParams.downloadUrl !== origParams.downloadUrl)
      ) {
        hasAttachmentChanges = true;
      }

      const hasComment = Boolean(dto.comment && dto.comment.trim());

      if (!hasParamChanges && !hasAttachmentChanges && !hasComment) {
        throw new BadRequestException(
          '已驳回的任务不能无修改直接提交！请修改业务要件参数、上传替换修订版附件，或填写重新提交的理由说明后再发送。'
        );
      }
    }

    // 识别是否属于驳回重修任务的重新提交流程
    const isResubmission =
      isRevisionRequired && (dto.action === 'approve' || dto.action === 'complete');

    // 核心特性：若目标为协同回执条目 (taskType === 'receipt' 或 isReceipt) 或动作指令为归档，且非重新提交流程，执行回执已阅归档
    const isReceipt = Boolean(
      payload.isReceipt ||
      payload.taskType === 'receipt' ||
      targetItem.title?.includes('[协同回执]') ||
      targetItem.title?.includes('已办结') ||
      targetItem.title?.includes('已归档')
    );

    if (!isResubmission && (isReceipt || (dto.action as any) === 'archive')) {
      await this.prisma.workbenchInboxItem.update({
        where: { id: targetItem.id },
        data: {
          status: InboxItemStatus.archived,
          updatedAt: new Date(),
        },
      });

      // 全链路级联归档：将该协同事项/流程实例关联的所有前置收件箱条目一并置为 archived
      try {
        const relatedRefIds = new Set<string>();
        if (targetItem.sourceRefId) {
          relatedRefIds.add(targetItem.sourceRefId);
          relatedRefIds.add(targetItem.sourceRefId.replace(/^(?:coord_)+/, ''));
        }
        if (taskId) {
          relatedRefIds.add(taskId);
          relatedRefIds.add(taskId.replace(/^(?:coord_)+/, ''));
        }
        if (payload.metadata?.parentTaskId) {
          relatedRefIds.add(payload.metadata.parentTaskId);
          relatedRefIds.add(String(payload.metadata.parentTaskId).replace(/^(?:coord_)+/, ''));
        }
        const refIdList = Array.from(relatedRefIds).filter(Boolean);

        const whereOrConditions: any[] = [
          targetItem.sourceRefId ? { id: targetItem.sourceRefId } : undefined,
          { sourceRefId: { in: refIdList } },
          { sourceRefId: targetItem.id },
        ].filter(Boolean);
        if (UUID_REGEX.test(taskId)) {
          whereOrConditions.push({ id: taskId });
        }

        const relatedItems = await this.prisma.workbenchInboxItem.findMany({
          where: {
            OR: whereOrConditions,
          },
          select: { id: true },
        });

        const idsToArchive = relatedItems.map((r) => r.id).filter((id) => id !== targetItem.id);
        if (idsToArchive.length > 0) {
          await this.prisma.workbenchInboxItem.updateMany({
            where: {
              id: { in: idsToArchive },
            },
            data: {
              status: InboxItemStatus.archived,
              updatedAt: new Date(),
            },
          });
        }
      } catch (cascadeErr) {
        this.logger.warn(`Failed to cascade archive related items for task ${taskId}:`, cascadeErr);
      }

      try {
        await this.prisma.workbenchTodo?.updateMany?.({
          where: {
            OR: [
              targetItem.convertedTodoId ? { id: targetItem.convertedTodoId } : undefined,
              { sourceRefId: taskId },
              { sourceRefId: targetItem.sourceRefId },
              UUID_REGEX.test(taskId) ? { id: taskId } : undefined,
            ].filter(Boolean) as any,
          },
          data: {
            status: TodoStatus.completed,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to mark todo completed when archiving receipt ${taskId}:`, err);
      }

      // 自动触发流程成果物归档入库至「流程管理空间」
      try {
        const ext = payload.externalSyncResult || {};
        const detail = ext.detail || {};
        await this.workspaceService?.archiveWorkflowDeliverables?.({
          workflowId: payload.workflowId || detail.workflowId,
          workflowName: detail.workflowName || payload.workflowName,
          category: '合规法务',
          taskTitle:
            detail.contractTitle ||
            payload.parameters?.contractTitle ||
            targetItem.sourceTitle ||
            targetItem.title,
          trackingNumber: ext.trackingNumber || `LEGAL-ARC-${Date.now().toString().slice(-6)}`,
          archiveId: detail.archiveId,
          initiator: payload.initiator,
          operator: { username: payload.sourceSender || payload.assignee?.username || 'system' },
          parameters: payload.parameters,
          reviewReport: payload.reviewReport,
          actions: payload.actions,
          attachments: payload.attachments,
          syncResult: ext,
        });
      } catch (archErr) {
        this.logger.warn(`Failed to archive deliverables for task ${taskId}:`, archErr);
      }

      this.logger.log(`Receipt / task ${taskId} archived successfully in inbox.`);
      return {
        taskId,
        status: 'archived',
        action: dto.action,
        unifiedPayload: {
          ...payload,
          status: 'archived',
        },
      };
    }

    if (isResubmission) {
      delete (payload as any).isReceipt;
      delete (payload as any).receiptAction;
      delete (payload as any).rollbackReason;
      if (payload.metadata) {
        delete (payload.metadata as any).isReceipt;
        delete (payload.metadata as any).rollbackReason;
      }
      payload.isResubmission = true;
      payload.taskType = payload.originalTaskType || CoordinationTaskType.approval;
      payload.status = CoordinationTaskStatus.pending;

      const rollbackTarget =
        payload.externalSyncResult?.rollbackTarget ||
        payload.metadata?.rollbackTarget ||
        payload.metadata?.rollbackFromStage;
      if (rollbackTarget) {
        payload.currentStage = rollbackTarget;
      } else if (!payload.currentStage || payload.currentStage === 'legal_review') {
        payload.currentStage = 'initiator_confirm';
      }
      targetItem.unifiedPayload = payload;
    }

    // 防重复提交与终态保护：仅当条目已归档/废弃（且非重新提交流程），或者已经流转完毕（converted）且处于终态已办结时才拦截
    const isTerminalCompleted =
      !isResubmission &&
      (targetItem.status === InboxItemStatus.archived ||
        targetItem.status === InboxItemStatus.discarded ||
        (!isRevisionRequired &&
          !payload.isRecalled &&
          targetItem.status === InboxItemStatus.converted &&
          (payload.status === CoordinationTaskStatus.completed ||
            payload.status === CoordinationTaskStatus.approved)));

    if (isTerminalCompleted) {
      this.logger.warn(
        `协同任务 ${taskId} 已完成流转处理 (status: ${payload.status || targetItem.status})`
      );
      return {
        taskId,
        status: payload.status || CoordinationTaskStatus.approved,
        action: dto.action,
        unifiedPayload: payload,
      };
    }

    // 4. 并发幂等与原子 CAS 防护：所有门禁校验通过后，在此加原子行级锁
    if (payload.asyncExecution?.status === 'running' || payload.inTransit === true) {
      throw new ConflictException('该协同任务正在后台自动流转中，请勿重复操作');
    }

    try {
      const lockRows = await this.prisma.$executeRaw`
        UPDATE workbench_inbox_items
        SET unified_payload = jsonb_set(
          COALESCE(unified_payload, '{}'::jsonb),
          '{inTransit}',
          'true'::jsonb,
          true
        ),
        updated_at = NOW()
        WHERE id = ${targetItem.id}::uuid
          AND (
            unified_payload->>'inTransit' IS NULL
            OR unified_payload->>'inTransit' = 'false'
          )
          AND (
            unified_payload->'asyncExecution'->>'status' IS NULL
            OR unified_payload->'asyncExecution'->>'status' != 'running'
          )
      `;

      if (lockRows === 0) {
        throw new ConflictException('该协同任务正在后台自动流转中，请勿重复操作');
      }
    } catch (lockErr) {
      if (lockErr instanceof ConflictException) throw lockErr;
      this.logger.error(`Failed to acquire CAS lock for task ${targetItem.id}:`, lockErr);
      throw new InternalServerErrorException('协同任务加锁失败，请重试');
    }

    // 检查后续流转是否包含自动化执行阶段
    const workflow: any = payload.workflowId
      ? this.orgWorkflowService?.getWorkflowById(payload.workflowId) ||
        BUILT_IN_WORKFLOW_TEMPLATES.find(
          (t) => t.id === payload.workflowId || t.workflowId === payload.workflowId
        )
      : undefined;

    const stages: WorkflowStageDefinition[] = workflow?.processDefinition?.stages || [];
    const currentStageIndex = stages.findIndex((s) => s.id === payload.currentStage);
    const hasAutomationAhead =
      (dto.action === 'approve' || dto.action === 'complete') &&
      currentStageIndex >= 0 &&
      stages.slice(currentStageIndex + 1).some((s) => s.type === 'automation');

    // 发送时不要执行同步任务，采用异步执行（除非调用方显式指定 sync: true）
    const shouldRunAsync = hasAutomationAhead && dto.sync !== true;

    if (shouldRunAsync) {
      const cleanTitle = (targetItem.sourceTitle || targetItem.title || '')
        .replace(/^【(?:已驳回|需重修|待发送|已发送)】\s*/g, '')
        .replace(/^\[(?:已驳回|需重修|待发送|已发送|待担当确认|待初稿确认)\]\s*/g, '')
        .replace(/^\[协同回执\][^:]*:\s*/g, '')
        .trim();

      const nextStage = stages[currentStageIndex + 1];
      const { effectiveAttachments, parameterPatch } = resolveEffectiveAndHistoricalAttachments(
        dto.attachments,
        payload.attachments,
        payload.parameters
      );

      const asyncRunningPayload = {
        ...payload,
        status: CoordinationTaskStatus.pending,
        currentStage: nextStage?.id || payload.currentStage,
        inTransit: true,
        isSent: true,
        attachments: effectiveAttachments,
        parameters: {
          ...(payload.parameters || {}),
          ...(dto.parameters || {}),
          ...parameterPatch,
        },
        asyncExecution: {
          status: 'running',
          currentStage: nextStage?.id || payload.currentStage,
          startedAt: new Date().toISOString(),
        },
      };

      await this.prisma.workbenchInboxItem.update({
        where: { id: targetItem.id },
        data: {
          title: cleanTitle ? `[已发送] ${cleanTitle}` : targetItem.title,
          status: InboxItemStatus.converted,
          unifiedPayload: asyncRunningPayload as any,
          updatedAt: new Date(),
        },
      });

      // 如果存在关联待办任务，更新状态为已完成（离开待办看板，进入已发事项）
      try {
        await this.prisma.workbenchTodo?.updateMany?.({
          where: {
            OR: [
              targetItem.convertedTodoId ? { id: targetItem.convertedTodoId } : undefined,
              { sourceRefId: taskId },
              { sourceRefId: targetItem.sourceRefId },
            ].filter(Boolean) as any,
          },
          data: {
            status: TodoStatus.completed,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      } catch {
        // ignore
      }

      // 后台异步调度执行节点自动化任务
      setImmediate(async () => {
        try {
          await this.executeActionProcess(operatorUserId, taskId, dto, targetItem);
        } catch (asyncErr) {
          this.logger.error(`[AsyncRunner] Task ${taskId} async execution error:`, asyncErr);
          try {
            await this.prisma.$executeRaw`
              UPDATE workbench_inbox_items
              SET unified_payload = jsonb_set(
                jsonb_set(
                  COALESCE(unified_payload, '{}'::jsonb),
                  '{inTransit}',
                  'false'::jsonb,
                  true
                ),
                '{asyncExecution}',
                jsonb_build_object(
                  'status', 'failed',
                  'error', ${String((asyncErr as any)?.message || asyncErr)},
                  'failedAt', NOW()
                ),
                true
              ),
              updated_at = NOW()
              WHERE id = ${targetItem.id}::uuid
            `;
          } catch (unlockErr) {
            this.logger.error(`Failed to release CAS lock on async error for task ${taskId}:`, unlockErr);
          }
        }
      });

      return {
        taskId,
        status: CoordinationTaskStatus.pending,
        action: dto.action,
        isAsync: true,
        message: '已提交发送，系统正在后台异步执行节点任务（自动重试最多3次）...',
        unifiedPayload: asyncRunningPayload,
      };
    }

    try {
      return await this.executeActionProcess(operatorUserId, taskId, dto, targetItem);
    } catch (syncErr) {
      try {
        await this.prisma.$executeRaw`
          UPDATE workbench_inbox_items
          SET unified_payload = jsonb_set(
            COALESCE(unified_payload, '{}'::jsonb),
            '{inTransit}',
            'false'::jsonb,
            true
          ),
          updated_at = NOW()
          WHERE id = ${targetItem.id}::uuid
        `;
      } catch (unlockErr) {
        this.logger.error(`Failed to release CAS lock on sync error for task ${taskId}:`, unlockErr);
      }
      throw syncErr;
    }
  }

  /**
   * 真实执行协同流转处理逻辑（支持同步模式与后台异步调度模式）
   */
  async executeActionProcess(
    operatorUserId: string,
    taskId: string,
    dto: SubmitCoordinationActionDto,
    targetItem: any
  ): Promise<any> {
    return this.actionProcessor.executeActionProcess(operatorUserId, taskId, dto, targetItem);
  }

  /**
   * 查询协同任务详情
   */
  async getTaskDetails(userId: string, taskId: string) {
    const item = await this.findTargetInboxItem(taskId);

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
      currentStage: payload.currentStage,
      reviewReport: payload.reviewReport,
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
      unifiedPayload: payload,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  /**
   * 查询协同任务与流程实例列表
   */
  async listTasks(userId: string, role: 'all' | 'assignee' | 'initiator' = 'all') {
    const user = await this.resolveUser(userId);
    const targetUserId = user?.id || userId;
    const targetUsername = user?.username || '';

    const items = await this.prisma.workbenchInboxItem.findMany({
      where: {
        sourceRefId: { startsWith: 'coord_' },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const taskMap = new Map<string, any>();
    const supersededParentTaskIds = new Set<string>();
    const seenWorkflowKeys = new Set<string>();

    // 先收集所有已被后续阶段接替的前置父任务 ID
    for (const item of items) {
      const payload = (item.unifiedPayload || {}) as Record<string, any>;
      const parentId = payload.metadata?.parentTaskId;
      if (parentId) {
        supersededParentTaskIds.add(parentId);
      }
    }

    for (const item of items) {
      const taskId = item.sourceRefId!;
      if (taskMap.has(taskId)) continue;
      // 若该任务已被流转推进至下一阶段，则跳过旧阶段任务，避免卡片重复展示
      if (supersededParentTaskIds.has(taskId)) continue;

      const payload = (item.unifiedPayload || {}) as Record<string, any>;
      const initiator = payload.initiator || {};
      const assignee = payload.assignee || {};

      const isInitiator =
        initiator.id === targetUserId ||
        initiator.username === targetUsername ||
        item.sourceSender === targetUsername;
      const isAssignee =
        assignee.id === targetUserId ||
        assignee.username === targetUsername ||
        item.userId === targetUserId;

      if (role === 'initiator' && !isInitiator) continue;
      if (role === 'assignee' && !isAssignee) continue;

      const cleanTitle = item.sourceTitle || item.title.replace(/^\[待我[^\]]+\]\s*/, '');

      const extSync = (payload.externalSyncResult || {}) as Record<string, any>;
      const isTerminalArchived =
        item.status === InboxItemStatus.archived || item.status === InboxItemStatus.discarded;

      const isArchivedSync =
        Boolean(extSync.detail?.archiveId) ||
        (Boolean(extSync.trackingNumber) && !extSync.trackingNumber.includes('-REV-'));

      const isTerminalCompleted =
        payload.status === 'completed' ||
        isArchivedSync ||
        payload.currentStage === 'final_receipt';

      const isRecalled = Boolean(payload.isRecalled);
      const taskStatus = isRecalled
        ? 'pending'
        : item.status === InboxItemStatus.discarded || payload.status === 'rejected'
          ? 'cancelled'
          : isTerminalArchived
            ? isTerminalCompleted || payload.status === 'approved'
              ? 'completed'
              : 'cancelled'
            : isTerminalCompleted
              ? 'completed'
              : payload.status || 'pending';

      const isEndedStatus =
        !isRecalled && (taskStatus === 'completed' || taskStatus === 'cancelled');
      const workflowKey = payload.workflowId
        ? `${payload.workflowId}::${cleanTitle.trim()}::${isEndedStatus ? 'ended' : 'active'}`
        : null;
      // 对同一工作流同一标题的重复发起实例进行合并，区分进行中与已结束状态，保留对应最新阶段
      if (workflowKey) {
        if (seenWorkflowKeys.has(workflowKey)) continue;
        seenWorkflowKeys.add(workflowKey);
      }

      taskMap.set(taskId, {
        taskId,
        inboxItemId: item.id,
        title: cleanTitle,
        rawContent: item.rawContent,
        workflowId: payload.workflowId,
        parameters: payload.parameters,
        currentStage: payload.currentStage,
        unifiedPayload: payload,
        status: taskStatus,
        taskType:
          payload.taskType === 'receipt'
            ? payload.originalTaskType || 'approval'
            : payload.taskType || 'approval',
        priority: payload.priority || 'medium',
        dueDate: payload.dueDate,
        initiator,
        assignee,
        attachments: payload.attachments || [],
        actions: payload.actions || [],
        externalSyncResult: payload.externalSyncResult,
        metadata: payload.metadata || {},
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      });
    }

    return Array.from(taskMap.values());
  }

  /**
   * 归档协同任务及其关联的所有收件箱与待办条目
   */
  async archiveTask(userId: string, taskId: string) {
    return this.lifecycleService.archiveTask(userId, taskId);
  }

  /**
   * 发起人撤回协同事项至待办（终止下游处理，重置回经办人待办状态，绝不关闭归档）
   */
  async recallTask(userId: string, taskId: string, comment?: string) {
    return this.lifecycleService.recallTask(userId, taskId, comment);
  }
}
