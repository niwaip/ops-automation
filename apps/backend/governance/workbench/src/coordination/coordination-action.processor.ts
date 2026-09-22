import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WorkbenchPrismaPort } from '../ports';
import { InboxItemStatus, TodoSourceType } from '../inbox/dto/workbench-inbox.dto';
import { TodoStatus } from '../todo/dto/workbench-todo.dto';
import {
  CoordinationActionRecord,
  CoordinationTaskStatus,
  SubmitCoordinationActionDto,
} from './dto/workbench-coordination.dto';
import { BUILT_IN_WORKFLOW_TEMPLATES } from './workflow-templates.constants';
import { OrgWorkflowService } from './org-workflow.service';
import { CoordinationStageEngineService } from './coordination-stage-engine.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { UUID_REGEX } from './coordination-collaborator.service';
import { resolveEffectiveAndHistoricalAttachments } from './coordination-attachment-helper';

export class CoordinationActionProcessor {
  constructor(
    private readonly prisma: WorkbenchPrismaPort,
    private readonly logger: Logger,
    private readonly findTargetInboxItem: (id: string) => Promise<any>,
    private readonly resolveUser: (id: string) => Promise<any>,
    private readonly resolveStageApprover: (...args: any[]) => Promise<any>,
    private readonly stageEngine: CoordinationStageEngineService,
    private readonly orgWorkflowService?: OrgWorkflowService,
    private readonly workspaceService?: WorkspaceService
  ) {}
  async executeActionProcess(
    operatorUserId: string,
    taskId: string,
    dto: SubmitCoordinationActionDto,
    targetItem: any
  ): Promise<any> {
    const payload = (targetItem.unifiedPayload || {}) as Record<string, any>;
    const initiator = payload.initiator || {};

    // 核心安全拦截：若该事项在后台异步执行开始前已被撤回，则立即终止
    const initialFreshItem = await this.findTargetInboxItem(targetItem.id || taskId);
    if ((initialFreshItem?.unifiedPayload as any)?.isRecalled) {
      this.logger.log(`[AsyncRunner] Task ${taskId} has been recalled; aborting before execution.`);
      return;
    }

    const operator = await this.resolveUser(operatorUserId);
    const operatorId = operator?.id || operatorUserId;

    const actionRecord: CoordinationActionRecord = {
      id: `act_${randomUUID()}`,
      operatorId,
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

    // 流程流转执行
    let externalSyncResult: any = undefined;
    if (payload.workflowId) {
      const workflow: any =
        this.orgWorkflowService?.getWorkflowById(payload.workflowId) ||
        BUILT_IN_WORKFLOW_TEMPLATES.find(
          (t) => t.id === payload.workflowId || t.workflowId === payload.workflowId
        );

      if (workflow?.processDefinition?.stages?.length > 0) {
        const stageTransition = await this.stageEngine.executeTransition({
          workflow,
          currentStageId: payload.currentStage,
          targetItem,
          payload,
          dto,
          operator: {
            id: operatorId,
            username: operator?.username || '协作者',
            email: operator?.email,
          },
          initiator: {
            id: initiator.id,
            username: initiator.username,
            email: initiator.email,
          },
          resolveStageApprover: (wId, sId, initId) =>
            this.resolveStageApprover(wId, sId, initId || operatorId),
          prisma: this.prisma,
        });

        // 核心安全拦截：若自动化审查执行期间发起人已撤回该任务，立即终止后续流转，不可覆盖撤回状态
        const freshItemAfterTransition = await this.findTargetInboxItem(targetItem.id || taskId);
        if ((freshItemAfterTransition?.unifiedPayload as any)?.isRecalled) {
          this.logger.log(
            `[AsyncRunner] Task ${taskId} was recalled during stage transition; aborting.`
          );
          return;
        }

        if (stageTransition?.handled) {
          nextStatus = stageTransition.nextStatus;
          actionText = stageTransition.actionText;
          externalSyncResult = stageTransition.externalSyncResult;

          // 核心特性：前置自动化任务失败重试 3 次后仍出错，触发自动回退担当！
          if (stageTransition.rollbackToCurrentAssignee) {
            const failureReason = stageTransition.failureReason || '自动化任务执行失败';
            const failedTitle = `[需重修] ${targetItem.sourceTitle || targetItem.title} - ${stageTransition.failedStageName || '审查'}失败`;
            const failedContent = `⚠️ **【前置自动化任务执行失败·已回退担当】**：\n${failureReason}\n\n系统已自动重试 3 次均未果，流程已回退至当前担当，请核对材料或调整参数后重新点击「发送」。`;

            const rollbackPayload = {
              ...payload,
              status: 'revision_required',
              parameters: dto.parameters
                ? { ...(payload.parameters || {}), ...dto.parameters }
                : payload.parameters,
              actions: Array.isArray(payload.actions)
                ? [...payload.actions, actionRecord]
                : [actionRecord],
              externalSyncResult: stageTransition.externalSyncResult,
              asyncExecution: {
                status: 'failed',
                retryCount: 3,
                error: failureReason,
                failedAt: new Date().toISOString(),
              },
              updatedAt: new Date().toISOString(),
            };

            await this.prisma.workbenchInboxItem.update({
              where: { id: targetItem.id },
              data: {
                title: failedTitle,
                rawContent: failedContent,
                status: InboxItemStatus.unprocessed,
                unifiedPayload: rollbackPayload as any,
                updatedAt: new Date(),
              },
            });

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
                  title: failedTitle,
                  description: failedContent,
                  status: TodoStatus.pending,
                  updatedAt: new Date(),
                },
              });
            } catch (todoErr) {
              this.logger.warn(`Failed to rollback todo for ${taskId}:`, todoErr);
            }

            this.logger.warn(`Task ${taskId} rolled back to assignee: ${failureReason}`);
            return {
              taskId,
              status: 'revision_required' as any,
              action: dto.action,
              actionRecord,
              unifiedPayload: rollbackPayload,
            };
          }

          if (stageTransition.nextInboxItemData) {
            await this.prisma.workbenchInboxItem.create({
              data: stageTransition.nextInboxItemData,
            });

            // 该阶段已确认并流转至下一处理人，将关联待办标记为已完成（离开待办看板，进入已发事项）
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
            } catch (delErr) {
              this.logger.warn(`Failed to update todo for ${taskId}:`, delErr);
            }
          } else if (
            nextStatus === CoordinationTaskStatus.approved ||
            nextStatus === CoordinationTaskStatus.completed
          ) {
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
            } catch (updErr) {
              this.logger.warn(`Failed to mark todo completed for ${taskId}:`, updErr);
            }
          } else if (dto.action === 'reject') {
            try {
              const cleanBaseTitle = (targetItem.sourceTitle || targetItem.title || '')
                .replace(/^\[需重修\]\s*/, '')
                .replace(/^\[协同回执\][^:]*:\s*/, '')
                .replace(/^\[待发送\]\s*/, '')
                .trim();
              await this.prisma.workbenchTodo?.updateMany?.({
                where: {
                  OR: [
                    targetItem.convertedTodoId ? { id: targetItem.convertedTodoId } : undefined,
                    { sourceRefId: taskId },
                    { sourceRefId: targetItem.sourceRefId },
                  ].filter(Boolean) as any,
                },
                data: {
                  title: `[需重修] ${cleanBaseTitle}`,
                  status: TodoStatus.pending,
                  description: dto.comment?.trim()
                    ? `审核人员批注：${dto.comment.trim()}`
                    : undefined,
                  updatedAt: new Date(),
                },
              });
            } catch (rejTodoErr) {
              this.logger.warn(`Failed to update todo for reject ${taskId}:`, rejTodoErr);
            }
          }
        }
      }
    }

    const updatedActions = Array.isArray(payload.actions)
      ? [...payload.actions, actionRecord]
      : [actionRecord];

    const isResubmittingRevision =
      Boolean(payload.isResubmission) ||
      ((payload.status === 'revision_required' ||
        payload.status === CoordinationTaskStatus.rejected ||
        targetItem.title?.includes('[需重修]') ||
        targetItem.title?.includes('需重修') ||
        targetItem.title?.includes('已驳回') ||
        payload.receiptAction === 'reject') &&
        (dto.action === 'approve' || dto.action === 'complete'));

    const { effectiveAttachments, parameterPatch } = resolveEffectiveAndHistoricalAttachments(
      dto.attachments,
      payload.attachments,
      payload.parameters
    );

    const updatedPayload = {
      ...payload,
      currentStage:
        dto.action === 'reject' && externalSyncResult?.rollbackTarget
          ? externalSyncResult.rollbackTarget
          : payload.currentStage,
      previousStage:
        dto.action === 'reject' && externalSyncResult?.rollbackTarget
          ? payload.currentStage
          : payload.previousStage,
      parameters: {
        ...(payload.parameters || {}),
        ...(dto.parameters || {}),
        ...parameterPatch,
      },
      status: nextStatus,
      actions: updatedActions,
      attachments: effectiveAttachments,
      rollbackReason:
        dto.action === 'reject'
          ? dto.comment?.trim() || '审核人员提出了修改意见'
          : payload.rollbackReason,
      metadata: {
        ...(payload.metadata || {}),
        ...(dto.action === 'reject'
          ? { rollbackReason: dto.comment?.trim() || '审核人员提出了修改意见' }
          : {}),
      },
      externalSyncResult,
      asyncExecution: {
        status: 'succeeded',
        endedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };

    if (isResubmittingRevision) {
      delete (updatedPayload as any).rollbackReason;
      delete (updatedPayload as any).lastFailure;
      delete (updatedPayload as any).receiptAction;
      delete (updatedPayload as any).isReceipt;
      delete (updatedPayload as any).isResubmission;
      if ((updatedPayload as any).metadata) {
        delete (updatedPayload as any).metadata.rollbackReason;
        delete (updatedPayload as any).metadata.isReceipt;
      }
    }

    let nextTargetTitle = targetItem.title;
    if (isResubmittingRevision) {
      const cleanTitle = (targetItem.sourceTitle || targetItem.title || '')
        .replace(/^【(?:已驳回|需重修|待发送|已发送)】\s*/g, '')
        .replace(/^\[(?:已驳回|需重修|待发送|已发送|待担当确认|待初稿确认)\]\s*/g, '')
        .replace(/^\[需重修\]\s*/, '')
        .replace(/^\[协同回执\][^:]*:\s*/, '')
        .replace(/^\[待发送\]\s*/, '')
        .trim();
      nextTargetTitle = cleanTitle ? `[已发送] ${cleanTitle}` : targetItem.title;
    }

    // 核心安全拦截：若已被撤回，终止最终写回，确保保留撤回至待办的状态
    const finalFreshItem = await this.findTargetInboxItem(targetItem.id || taskId);
    if ((finalFreshItem?.unifiedPayload as any)?.isRecalled) {
      this.logger.log(
        `[AsyncRunner] Task ${taskId} has been recalled; skipping final status update and todo completion.`
      );
      return;
    }

    // 2. 更新原经办人收件箱条目为已转待办或已流转
    await this.prisma.workbenchInboxItem.update({
      where: { id: targetItem.id },
      data: {
        title: nextTargetTitle,
        status: InboxItemStatus.converted,
        unifiedPayload: updatedPayload as any,
        updatedAt: new Date(),
      },
    });

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
    } catch (delErr) {
      this.logger.warn(`Failed to update todo for ${taskId}:`, delErr);
    }

    // 3. 向发起人 GTD 收集箱回传结果提醒（当操作人非发起人时）
    if (initiator.id && initiator.id !== operatorId) {
      const responseTitle = `[协同回执] @${operator?.username || '协作者'} 已${actionText}: ${targetItem.sourceTitle || targetItem.title}`;
      let responseContent = dto.comment?.trim()
        ? `处理意见：${dto.comment.trim()}`
        : `已${actionText}，无附加留言。`;

      if (externalSyncResult?.message) {
        const sysLabel = externalSyncResult.externalSystem || '业务系统联动';
        responseContent += `\n\n📌 **${sysLabel}**：\n- 处理说明：${externalSyncResult.message}`;
        if (externalSyncResult.trackingNumber) {
          responseContent += `\n- 凭证单号：\`${externalSyncResult.trackingNumber}\``;
        }
      }

      const canonicalTaskId = targetItem.sourceRefId || taskId;
      const receiptPayload = {
        ...updatedPayload,
        taskId: canonicalTaskId,
        taskType: 'receipt',
        isReceipt: true,
        receiptAction: dto.action,
        rollbackReason:
          dto.action === 'reject' ? dto.comment?.trim() || '审核人员提出了修改意见' : undefined,
        metadata: {
          ...((updatedPayload as any).metadata || {}),
          ...(dto.action === 'reject'
            ? { rollbackReason: dto.comment?.trim() || '审核人员提出了修改意见' }
            : {}),
        },
        originalTaskType: (targetItem.unifiedPayload as any)?.taskType || 'approval',
      };

      await this.prisma.workbenchInboxItem.create({
        data: {
          userId: initiator.id,
          title: responseTitle,
          rawContent: responseContent,
          sourceType: TodoSourceType.chat,
          sourceRefId: canonicalTaskId,
          sourceTitle: targetItem.sourceTitle || targetItem.title,
          sourceSender: operator?.username || '协作者',
          unifiedPayload: receiptPayload as any,
          status: InboxItemStatus.unprocessed,
          confidence: 1.0,
        },
      });
    }

    // 4. 若该阶段已达成归档（产生归档单号/存证编号），自动触发「流程管理空间」建档入库
    const isArchiveStage = Boolean(
      externalSyncResult?.detail?.archiveId ||
      (externalSyncResult?.trackingNumber && !externalSyncResult.trackingNumber.includes('-REV-'))
    );
    if (isArchiveStage) {
      try {
        await this.workspaceService?.archiveWorkflowDeliverables?.({
          workflowId: payload.workflowId || externalSyncResult.detail?.workflowId,
          workflowName: externalSyncResult.detail?.workflowName || payload.workflowName,
          category: '合规法务',
          taskTitle:
            externalSyncResult.detail?.contractTitle ||
            payload.parameters?.contractTitle ||
            targetItem.sourceTitle ||
            targetItem.title,
          trackingNumber: externalSyncResult.trackingNumber,
          archiveId: externalSyncResult.detail?.archiveId,
          initiator: payload.initiator,
          operator: {
            username:
              operator?.username || payload.assignee?.username || payload.sourceSender || 'system',
          },
          parameters: payload.parameters,
          reviewReport: payload.reviewReport || externalSyncResult.reviewReport,
          actions: updatedActions,
          attachments: payload.attachments,
          syncResult: externalSyncResult,
        });
      } catch (archErr) {
        this.logger.warn(`Failed to auto-archive deliverables on stage finish:`, archErr);
      }
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
}
