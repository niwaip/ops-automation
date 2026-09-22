import {
  BadRequestException,
  Inject,
  Injectable,
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
    )
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
      this.workspaceService
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

          const configuredSkillIds = (
            process.env.DOCUMENT_STAGE_SKILL_IDS ||
            '16fb88e9-ba9c-4ab7-b508-f23adb1a821a,773bd4a6-8327-4610-8fb2-826314133335'
          )
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

          const queryWhere: any = executionId
            ? { id: executionId }
            : {
                status: 'succeeded',
                OR: [...configuredSkillIds.map((skillId) => ({ skillId }))],
              };

          const latestDocExecution = await this.prisma.execution.findFirst({
            where: queryWhere,
            orderBy: { createdAt: 'desc' },
            select: { id: true, resultJson: true },
          });

          if (latestDocExecution?.resultJson) {
            const rJson = latestDocExecution.resultJson as any;
            const downloadUrl =
              rJson.downloadUrl || rJson.result?.businessData?.result?.downloadUrl;
            const fileName =
              rJson.fileName ||
              rJson.result?.businessData?.result?.fileName ||
              `${dto.title.trim()}.docx`;
            if (downloadUrl) {
              const docSize =
                Number(rJson.size) || Number(rJson.result?.businessData?.result?.size) || undefined;
              attachments.push({
                name: fileName,
                url: downloadUrl,
                ...(docSize ? { size: docSize } : {}),
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              });
              (parameters as any).downloadUrl = downloadUrl;
              (parameters as any).fileName = fileName;
            }
          }
        } catch (queryErr) {
          this.logger.warn('Failed to query latest document execution:', queryErr);
        }
      }
    }

    const unifiedPayload = {
      kind: 'coordination',
      taskId,
      workflowId,
      currentStage,
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
      attachments,
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

    return await this.executeActionProcess(operatorUserId, taskId, dto, targetItem);
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
