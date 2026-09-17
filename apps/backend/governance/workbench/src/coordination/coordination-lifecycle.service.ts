import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../ports';
import { InboxItemStatus, TodoSourceType } from '../inbox/dto/workbench-inbox.dto';
import { TodoPriority, TodoStatus } from '../todo/dto/workbench-todo.dto';
import { CoordinationActionRecord, CoordinationTaskStatus } from './dto/workbench-coordination.dto';
import { UUID_REGEX } from './coordination-collaborator.service';

@Injectable()
export class CoordinationLifecycleService {
  private readonly logger = new Logger(CoordinationLifecycleService.name);

  constructor(
    @Inject(WORKBENCH_PRISMA)
    private readonly prisma: WorkbenchPrismaPort,
    private readonly resolveUserFn: (idOrUsername?: string) => Promise<any>,
    private readonly findTargetInboxItemFn: (taskId: string) => Promise<any>
  ) {}

  /**
   * 归档协同任务及其关联的所有收件箱与待办条目
   */
  async archiveTask(userId: string, taskId: string) {
    const cleanId = taskId.replace(/^(?:coord_)+/, '');
    const isTaskIdUuid = UUID_REGEX.test(taskId);
    const isCleanIdUuid = UUID_REGEX.test(cleanId);

    const relatedRefIds = new Set<string>([taskId, `coord_${cleanId}`, cleanId]);

    const targetItems = await this.prisma.workbenchInboxItem.findMany({
      where: {
        OR: [
          { sourceRefId: { in: Array.from(relatedRefIds) } },
          isTaskIdUuid ? { id: taskId } : undefined,
          isCleanIdUuid ? { id: cleanId } : undefined,
        ].filter(Boolean) as any,
      },
      select: { id: true, sourceRefId: true, unifiedPayload: true },
    });

    const idsToArchive = new Set<string>(targetItems.map((i) => i.id));
    if (isTaskIdUuid) idsToArchive.add(taskId);
    if (isCleanIdUuid) idsToArchive.add(cleanId);

    for (const item of targetItems) {
      if (item.sourceRefId) relatedRefIds.add(item.sourceRefId);
      const p = (item.unifiedPayload || {}) as any;
      if (p?.metadata?.parentTaskId) relatedRefIds.add(p.metadata.parentTaskId);
    }

    await this.prisma.workbenchInboxItem.updateMany({
      where: {
        OR: [
          { id: { in: Array.from(idsToArchive) } },
          { sourceRefId: { in: Array.from(relatedRefIds) } },
        ],
      },
      data: {
        status: InboxItemStatus.archived,
        updatedAt: new Date(),
      },
    });

    try {
      await this.prisma.workbenchTodo.updateMany({
        where: {
          OR: [
            { sourceRefId: { in: Array.from(relatedRefIds) } },
            isTaskIdUuid ? { id: taskId } : undefined,
          ].filter(Boolean) as any,
        },
        data: {
          status: TodoStatus.cancelled,
          updatedAt: new Date(),
        },
      });
    } catch {
      // 兼容非 UUID 主键查询
    }

    this.logger.log(`Coordination task ${taskId} archived by user ${userId}`);
    return { success: true, taskId };
  }

  /**
   * 发起人撤回协同事项至待办（终止下游处理，重置回经办人待办状态，绝不关闭归档）
   */
  async recallTask(userId: string, taskId: string, comment?: string) {
    const operator = await this.resolveUserFn(userId);
    const operatorUserId = operator?.id || userId;
    const operatorUsername = operator?.username || '经办人';

    const targetItem = await this.findTargetInboxItemFn(taskId);
    if (!targetItem) {
      throw new NotFoundException(`未找到协同任务: ${taskId}`);
    }

    const payload = (targetItem.unifiedPayload || {}) as Record<string, any>;
    const initiator = payload.initiator || {};

    const isInitiatorOrAssignee =
      initiator.id === operatorUserId ||
      initiator.username === operatorUsername ||
      targetItem.userId === operatorUserId ||
      targetItem.sourceSender === operatorUsername;

    if (!isInitiatorOrAssignee) {
      throw new BadRequestException('只有事项发起人有权撤回该流转任务');
    }

    const cleanId = taskId.replace(/^(?:coord_)+/, '');
    const isTaskIdUuid = UUID_REGEX.test(taskId);
    const relatedRefIds = new Set<string>([taskId, `coord_${cleanId}`, cleanId]);
    if (targetItem.sourceRefId) relatedRefIds.add(targetItem.sourceRefId);
    if (payload.metadata?.parentTaskId) relatedRefIds.add(payload.metadata.parentTaskId);

    // 1. 废弃已派发给下游协同人的任务条目，终止下游流转
    try {
      await this.prisma.workbenchInboxItem.updateMany({
        where: {
          sourceRefId: { in: Array.from(relatedRefIds) },
          id: { not: targetItem.id },
          userId: { not: operatorUserId },
        },
        data: {
          status: InboxItemStatus.discarded,
          updatedAt: new Date(),
        },
      });

      await this.prisma.workbenchTodo.updateMany({
        where: {
          sourceRefId: { in: Array.from(relatedRefIds) },
          userId: { not: operatorUserId },
        },
        data: {
          status: TodoStatus.cancelled,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (e) {
      this.logger.warn(`Failed to discard downstream items for recall ${taskId}:`, e);
    }

    // 2. 标题清洗并打上 [已撤回] 前缀
    const cleanTitle = (targetItem.sourceTitle || targetItem.title || '')
      .replace(/^【(?:已驳回|需重修|待发送|已发送|已撤回)】\s*/g, '')
      .replace(/^\[(?:已驳回|需重修|待发送|已发送|已撤回|待担当确认|待初稿确认)\]\s*/g, '')
      .replace(/^\[协同回执\]\s*@\S+\s*(?:已驳回退回担当重修:\s*|已驳回:\s*|已同意:\s*|已办结:\s*)?/g, '')
      .trim();
    const recalledTitle = cleanTitle ? `[已撤回] ${cleanTitle}` : targetItem.title;

    const actionRecord: CoordinationActionRecord = {
      id: `act_${randomUUID()}`,
      operatorId: operatorUserId,
      operatorName: operatorUsername,
      action: 'recall' as any,
      comment: comment?.trim() || '发起人主动撤回事项至待办',
      attachments: [],
      timestamp: new Date().toISOString(),
    };

    // 3. 重置经办人条目为待办/待发送状态
    const updatedPayload = {
      ...payload,
      status: CoordinationTaskStatus.pending,
      currentStage: 'initiator_confirm',
      previousStage: payload.currentStage,
      inTransit: false,
      isSent: false,
      isRecalled: true,
      assignee: initiator.id ? initiator : { id: operatorUserId, username: operatorUsername },
      actions: Array.isArray(payload.actions) ? [...payload.actions, actionRecord] : [actionRecord],
      updatedAt: new Date().toISOString(),
    };
    delete (updatedPayload as any).asyncExecution;

    await this.prisma.workbenchInboxItem.update({
      where: { id: targetItem.id },
      data: {
        title: recalledTitle,
        status: InboxItemStatus.converted, // 标记为已转待办，仅停留在行动待办看板，不在 GTD 收集箱待整理中重复出现
        unifiedPayload: updatedPayload as any,
        updatedAt: new Date(),
      },
    });

    // 4. 重置待办任务状态为 pending，回到待办看板
    try {
      const updatedTodos = await this.prisma.workbenchTodo.updateMany({
        where: {
          OR: [
            targetItem.convertedTodoId ? { id: targetItem.convertedTodoId } : undefined,
            { sourceRefId: { in: Array.from(relatedRefIds) }, userId: operatorUserId },
            isTaskIdUuid ? { id: taskId, userId: operatorUserId } : undefined,
          ].filter(Boolean) as any,
        },
        data: {
          title: recalledTitle,
          status: TodoStatus.pending, // 回到待办！
          completedAt: null,
          contextData: {
            taskId,
            inboxItemId: targetItem.id,
            sourceSender: operatorUsername,
            isRecalled: true,
            unifiedPayload: updatedPayload,
          },
          updatedAt: new Date(),
        },
      });

      if (updatedTodos.count === 0 && operatorUserId) {
        const createdTodo = await this.prisma.workbenchTodo.create({
          data: {
            userId: operatorUserId,
            title: recalledTitle,
            description: `事项已撤回至待办。${comment?.trim() ? `附言：${comment.trim()}` : '可重新编辑要件并再次发送。'}`,
            priority: TodoPriority.medium,
            status: TodoStatus.pending,
            sourceType: TodoSourceType.chat,
            sourceRefId: taskId,
            sourceTitle: cleanTitle,
            contextData: {
              taskId,
              inboxItemId: targetItem.id,
              sourceSender: operatorUsername,
              isRecalled: true,
              unifiedPayload: updatedPayload,
            },
          },
        });
        await this.prisma.workbenchInboxItem.update({
          where: { id: targetItem.id },
          data: { convertedTodoId: createdTodo.id },
        });
      }
    } catch (todoErr) {
      this.logger.warn(`Failed to reset todo for recall ${taskId}:`, todoErr);
    }

    this.logger.log(`Coordination task ${taskId} recalled to pending todos by user ${operatorUsername}`);
    return {
      success: true,
      taskId,
      status: 'pending',
      message: '已成功撤回该事项，已返回您的「待办」',
      unifiedPayload: updatedPayload,
    };
  }
}
