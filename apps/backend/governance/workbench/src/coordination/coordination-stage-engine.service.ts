import { Injectable,Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CoordinationAutomationRunnerService } from './coordination-automation-runner.service';
import type {
CoordinationAttachment,
SubmitCoordinationActionDto,
} from './dto/workbench-coordination.dto';
import {
CoordinationTaskPriority,
CoordinationTaskStatus,
CoordinationTaskType,
} from './dto/workbench-coordination.dto';
import type {
OrganizationWorkflowDefinition,
WorkflowStageDefinition,
} from './org-workflow.entity';

export interface StageTransitionContext {
  workflow: OrganizationWorkflowDefinition;
  currentStageId: string;
  targetItem: {
    id: string;
    sourceTitle?: string;
    title: string;
    sourceType?: any;
    confidence?: number;
  };
  payload: Record<string, any>;
  dto: SubmitCoordinationActionDto;
  operator: { id: string; username: string; email?: string | null };
  initiator: { id?: string; username?: string; email?: string | null };
  prisma: any;
  resolveStageApprover: (
    workflowId: string,
    stageId: string,
    initiatorId?: string
  ) => Promise<{ id?: string; username?: string; email?: string | null }>;
  isLegal?: boolean;
}

export interface StageTransitionResult {
  handled: boolean;
  nextStatus: CoordinationTaskStatus;
  actionText: string;
  externalSyncResult: Record<string, any>;
  nextInboxItemData?: Record<string, any>;
  rollbackToCurrentAssignee?: boolean;
  rollbackStageId?: string;
  failedStageName?: string;
  failureReason?: string;
}

@Injectable()
export class CoordinationStageEngineService {
  private readonly logger = new Logger(CoordinationStageEngineService.name);

  constructor(
    private readonly automationRunner: CoordinationAutomationRunnerService = new CoordinationAutomationRunnerService()
  ) {}

  /**
   * 判断一个阶段或任务上下文是否属于“通用文件成果/初稿核对与确认节点”
   */
  public isArtifactConfirmationStage(
    stage?: WorkflowStageDefinition,
    payload?: Record<string, any>
  ): boolean {
    if (stage?.allowFileReplacement || stage?.isArtifactReview) {
      return true;
    }

    const hasArtifact = Boolean(
      (payload?.attachments && payload.attachments.length > 0) ||
        payload?.parameters?.downloadUrl ||
        payload?.parameters?.fileUrl ||
        payload?.parameters?.artifactUrl ||
        payload?.parameters?.generatedDocUrl
    );

    if (hasArtifact) {
      return true;
    }

    const stageId = stage?.id || payload?.currentStage || '';
    return /confirm|review|核对|确认|审查|复核/i.test(stageId);
  }

  /**
   * 通用推进工作流阶段（无硬编码，由流程模版 processDefinition.stages 动态驱动）
   */
  public async executeTransition(
    ctx: StageTransitionContext
  ): Promise<StageTransitionResult | null> {
    const {
      workflow,
      currentStageId,
      targetItem,
      payload,
      dto,
      operator,
      initiator,
      resolveStageApprover,
      prisma,
    } = ctx;

    const stages: WorkflowStageDefinition[] =
      workflow?.processDefinition?.stages || [];
    const isLegal =
      workflow.category === 'legal' || workflow.workflowId?.includes('legal');

    const currentStageIndex = stages.findIndex((s) => s.id === currentStageId);
    if (currentStageIndex === -1) {
      if (!currentStageId) {
        // 如果任务上下文未标记 currentStageId（例如单阶段审批或终审审批任务）
        if (dto.action === 'reject') {
          return {
            handled: true,
            nextStatus: 'revision_required' as any,
            actionText: '驳回退回修改',
            externalSyncResult: {
              success: false,
              rollbackTarget: 'draft_submission',
              message: isLegal
                ? '法务审查提出修订意见，流程已回退至草案阶段，请根据批注修改后重新提单。'
                : '审查提出修订意见，流程已回退至草案阶段，请根据批注修改后重新提单。',
            },
          };
        } else if (dto.action === 'approve') {
          const trackingNumber = `${(workflow.category || 'LEGAL').toUpperCase()}-ARC-${Date.now().toString().slice(-6)}`;
          const params = payload.parameters || {};
          return {
            handled: true,
            nextStatus: CoordinationTaskStatus.approved,
            actionText: '终审通过并归档',
            externalSyncResult: {
              success: true,
              trackingNumber,
              externalSystem: isLegal
                ? '法务电子合同库 & 存证归档中心'
                : '统一电子文档存证与归档中心',
              message: isLegal
                ? `保密/商业合同审查通过！已完成法务合规归档与存证备案（合同名称：${params.contractTitle || targetItem.sourceTitle || targetItem.title}）`
                : `流程全周期已成功闭环！已完成合规归档与电子存证备案。`,
              detail: {
                archiveId: `ARC_${Date.now()}`,
                contractTitle: params.contractTitle || targetItem.sourceTitle,
                contractType: params.contractType || 'nda',
                counterpartyName: params.counterpartyName,
                archivedAt: new Date().toISOString(),
              },
            },
          };
        }
      }
      return null;
    }

    const currentStageDef = stages[currentStageIndex];
    const sourceTitle =
      payload?.parameters?.contractTitle ||
      targetItem.sourceTitle ||
      targetItem.title;

    // 1. 通用处理文件替换与多版本历史履历留存 (File Replacement & Version Tracking)
    const sanitizeAttachments = (arr?: any[]): CoordinationAttachment[] => {
      if (!Array.isArray(arr)) return [];
      return arr.filter(
        (a) => Boolean(a && typeof a === 'object' && !Array.isArray(a) && (a.url?.trim() || a.name?.trim()))
      );
    };

    const sanitizedDtoAttachments = sanitizeAttachments(dto.attachments);
    const sanitizedPayloadAttachments = sanitizeAttachments(payload.attachments);

    const hasReplacedFile = sanitizedDtoAttachments.length > 0;
    const replacedFileName = hasReplacedFile ? sanitizedDtoAttachments[0]?.name : undefined;
    const replacedFileUrl = hasReplacedFile ? sanitizedDtoAttachments[0]?.url : undefined;

    // 组装并留存多版本历史履历：最新送审文件置顶（Index 0），前序历史原稿顺序留存（Index 1..N）
    const historicalAttachments: CoordinationAttachment[] = [];
    const initialDraftUrl =
      payload.parameters?.originalDraftUrl ||
      payload.parameters?.downloadUrl ||
      payload.parameters?.fileUrl;

    if (initialDraftUrl && initialDraftUrl !== replacedFileUrl) {
      historicalAttachments.push({
        name: payload.parameters?.originalDraftFileName || payload.parameters?.fileName || '保密合同初稿_V1.docx',
        url: initialDraftUrl,
        size: payload.parameters?.originalDraftSize,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    }

    for (const prev of sanitizedPayloadAttachments) {
      const isHtml =
        prev.name?.toLowerCase().endsWith('.html') ||
        prev.name?.toLowerCase().endsWith('.htm') ||
        prev.mimeType === 'text/html';
      if (hasReplacedFile && isHtml) {
        continue;
      }
      if (
        prev.url !== replacedFileUrl &&
        !historicalAttachments.some((h) => h.url === prev.url) &&
        !sanitizedDtoAttachments.some((d) => d.url === prev.url)
      ) {
        historicalAttachments.push(prev);
      }
    }

    const activeAttachments: CoordinationAttachment[] = hasReplacedFile
      ? [
          ...sanitizedDtoAttachments,
          ...historicalAttachments.filter(
            (h) => !sanitizedDtoAttachments.some((d) => d.url === h.url)
          ),
        ]
      : sanitizedPayloadAttachments.length > 0
      ? sanitizedPayloadAttachments
      : historicalAttachments;

    const params = { ...(payload.parameters || {}), ...((dto as any).parameters || {}) };
    if (hasReplacedFile && replacedFileUrl) {
      if (!params.originalDraftUrl && payload.parameters?.downloadUrl && payload.parameters.downloadUrl !== replacedFileUrl) {
        params.originalDraftUrl = payload.parameters.downloadUrl;
        params.originalDraftFileName = payload.parameters.fileName;
      }
      params.downloadUrl = replacedFileUrl;
      params.fileUrl = replacedFileUrl;
      params.fileName = replacedFileName;
      params.isDraftReplaced = true;
    }

    // 2. 驳回动作处理 (Reject & Generic Rollback)
    if (dto.action === 'reject') {
      const rollbackStageId =
        currentStageDef.rollbackStageId ||
        (currentStageIndex > 0 ? stages[currentStageIndex - 1].id : undefined);

      if (rollbackStageId) {
        const rollbackStage = stages.find((s) => s.id === rollbackStageId);
        const rollbackAssignee = await resolveStageApprover(
          workflow.workflowId,
          rollbackStageId,
          initiator.id || operator.id
        );

        const rollbackAssigneeName = rollbackAssignee.username || '发起人';
        const rollbackAssigneeId = rollbackAssignee.id || operator.id;

        let rollbackLabel = rollbackStage?.name || '上一阶段';
        if (rollbackLabel.includes('担当')) {
          rollbackLabel = '担当重修';
        }

        const actionText = `驳回退回${rollbackLabel}`;

        let nextInboxItemData: any = undefined;
        // 若回退目标承办人非发起人（发起人会在外层统一收到协同回执），才额外派发新的待办条目
        if (rollbackAssigneeId && rollbackAssigneeId !== initiator.id) {
          const rollbackTaskTitle = `[需重修] ${sourceTitle} - ${currentStageDef.name}已驳回`;
          const rollbackContent = [
            `审核人员 (@${operator.username}) 在「${currentStageDef.name}」提出修订意见：`,
            dto.comment ? `> ${dto.comment}` : '> 请根据要求调整材料并重新提单。',
            ``,
            `流程已回退至「${rollbackStage?.name || rollbackStageId}」，请重新确认并提交。`,
          ].join('\n');

          const nextTaskId = `coord_${randomUUID()}`;
          const rollbackPayload = {
            kind: 'coordination',
            taskId: nextTaskId,
            workflowId: workflow.workflowId,
            currentStage: rollbackStageId,
            previousStage: currentStageId,
            parameters: params,
            taskType: CoordinationTaskType.approval,
            status: CoordinationTaskStatus.pending,
            priority: payload.priority || CoordinationTaskPriority.medium,
            initiator,
            assignee: {
              id: rollbackAssigneeId,
              username: rollbackAssigneeName,
              email: rollbackAssignee.email,
            },
            attachments: activeAttachments,
            isCardTemplate: Boolean(payload.isCardTemplate),
            actions: [],
            metadata: {
              ...(payload.metadata || {}),
              parentTaskId: payload.taskId,
              rolledBackAt: new Date().toISOString(),
              rollbackReason: dto.comment,
              rollbackFromStage: currentStageId,
            },
            createdAt: new Date().toISOString(),
          };

          nextInboxItemData = {
            userId: rollbackAssigneeId,
            title: rollbackTaskTitle,
            rawContent: rollbackContent,
            sourceType: targetItem.sourceType || 'chat',
            sourceRefId: nextTaskId,
            sourceTitle,
            sourceSender: operator.username,
            unifiedPayload: rollbackPayload,
            status: 'unprocessed',
            confidence: 1.0,
          };
        }

        return {
          handled: true,
          nextStatus: 'revision_required' as any,
          actionText,
          externalSyncResult: {
            success: false,
            rollbackTarget: rollbackStageId,
            rollbackAssignee: rollbackAssigneeName,
            message: `${currentStageDef.name}提出修订意见，流程已回退至「${rollbackStage?.name || rollbackStageId}」(@${rollbackAssigneeName})，请根据批注调整后重新提交。`,
          },
          nextInboxItemData,
        };
      } else {
        // 首节点被驳回，或流程中无可回退的前置阶段 -> 直接回退至发起人提单修改
        const rollbackAssigneeName = initiator.username || '发起人';
        return {
          handled: true,
          nextStatus: 'revision_required' as any,
          actionText: '驳回退回发起人',
          externalSyncResult: {
            success: false,
            rollbackTarget: 'draft_submission',
            rollbackAssignee: rollbackAssigneeName,
            message: `${currentStageDef.name}提出修订意见，流程已退回至发起人(@${rollbackAssigneeName})，请根据批注修改后重新提单。`,
          },
        };
      }
    }

    // 3. 承认/完成动作处理 (Approve / Complete -> Forward to Next Stage)
    if (dto.action === 'approve' || dto.action === 'complete') {
      const nextStatus =
        dto.action === 'complete'
          ? CoordinationTaskStatus.completed
          : CoordinationTaskStatus.approved;

      let scanIdx = currentStageIndex + 1;
      let nextHumanStage: WorkflowStageDefinition | null = null;
      let archiveStage: WorkflowStageDefinition | null = null;
      const automationReports: any[] = [];

      while (scanIdx < stages.length) {
        const candidate = stages[scanIdx];
        if (candidate.type === 'automation') {
          // 通用执行自动化中间阶段，支持自动重试 3 次，并在 prisma.execution 记录凭证
          const autoRes = await this.evaluateAutomationStageWithRetry(candidate, params, {
            prisma,
            operator,
            initiator,
            targetItem,
            workflow,
            payload,
            activeAttachments,
          }, 3);

          if (!autoRes.success) {
            this.logger.error(
              `[CoordinationStageEngine] Automation stage "${candidate.name}" failed after 3 retries: ${autoRes.error?.message || autoRes.error}. Rolling back to assignee.`
            );
            const rollbackAssignee = payload.assignee?.username || operator.username || initiator.username || '担当';
            const errorReason = autoRes.error?.message || '自动化任务执行异常（重试3次未果）';
            const failureReason = `前置自动化任务「${candidate.name}」执行失败（已重试3次）：${errorReason}`;

            return {
              handled: true,
              nextStatus: 'revision_required' as any,
              actionText: `自动化任务执行失败·已回退担当`,
              externalSyncResult: {
                success: false,
                failedAtStage: candidate.id,
                failedStageName: candidate.name,
                rollbackTarget: currentStageDef.id,
                rollbackAssignee,
                retryAttempts: 3,
                errorMessage: errorReason,
                message: `${failureReason}。流程已自动回退至担当 (@${rollbackAssignee})，请核对材料后重新提交。`,
              },
              rollbackToCurrentAssignee: true,
              rollbackStageId: currentStageDef.id,
              failedStageName: candidate.name,
              failureReason: errorReason,
            };
          }

          automationReports.push(autoRes.report);
          scanIdx++;
          continue;
        }

        if (candidate.type === 'approval' || candidate.type === 'submission') {
          nextHumanStage = candidate;
          break;
        }

        if (candidate.type === 'archive') {
          archiveStage = candidate;
          break;
        }

        scanIdx++;
      }

      // 情况 A: 成功流转到下一个人工处理阶段
      if (nextHumanStage) {
        const nextAssignee = await resolveStageApprover(
          workflow.workflowId,
          nextHumanStage.id,
          initiator.id || operator.id
        );

        const nextAssigneeName = nextAssignee.username || '审核专员';
        const nextAssigneeId = nextAssignee.id || operator.id;

        let stagePrefix = nextHumanStage.name;
        if (stagePrefix.includes('法务')) stagePrefix = '法务确认';
        else if (stagePrefix.includes('担当')) stagePrefix = '担当确认';

        const nextTaskTitle = hasReplacedFile
          ? `[待${stagePrefix}] ${sourceTitle}（担当已上传修订版）`
          : `[待${stagePrefix}] ${sourceTitle}`;

        const replacedNotice = hasReplacedFile
          ? `⚠️ **【文件/初稿修订提醒】**：经办人 (@${operator.username}) 已在本地对文档进行修正，并**上传替换了原生成文件**：\`${replacedFileName}\`。本阶段审核将以该修订版为准。`
          : '';

        const latestAuto =
          automationReports.length > 0
            ? automationReports[automationReports.length - 1]
            : null;

        const autoReportSection =
          latestAuto
            ? [
                ``,
                `🤖 **【${latestAuto.title || '前置自动化合规核查报告'}】**：`,
                `- **综合评级**：${
                  latestAuto.overallRisk === 'LOW'
                    ? '合规良好'
                    : latestAuto.overallRisk === 'HIGH'
                    ? '高危漏洞预警'
                    : '中度合规风险'
                }${
                  latestAuto.riskScore !== undefined
                    ? `（${latestAuto.riskScore} 分）`
                    : ''
                }`,
                ...(latestAuto.summaryItems || []),
                latestAuto.executionId
                  ? `- **执行单号**：[#${latestAuto.executionId.slice(0, 8)}](/executions)`
                  : '',
              ]
                .filter(Boolean)
                .join('\n')
            : '';

        const nextContent = [
          `经办人 (@${operator.username}) 已完成「${currentStageDef.name}」确认并流转。`,
          replacedNotice,
          autoReportSection,
          dto.comment ? `\n- **上一节点说明**：${dto.comment}` : '',
          ``,
          `请 (@${nextAssigneeName}) 进行下一步「${nextHumanStage.name}」把关。`,
        ]
          .filter(Boolean)
          .join('\n');

        const nextTaskId = `coord_${randomUUID()}`;
        const nextPayload = {
          kind: 'coordination',
          taskId: nextTaskId,
          workflowId: workflow.workflowId,
          currentStage: nextHumanStage.id,
          previousStage: currentStageId,
          parameters: params,
          reviewReport: latestAuto || undefined,
          executionId: latestAuto?.executionId || undefined,
          taskType: CoordinationTaskType.approval,
          status: CoordinationTaskStatus.pending,
          priority: payload.priority || CoordinationTaskPriority.medium,
          initiator,
          assignee: {
            id: nextAssigneeId,
            username: nextAssigneeName,
            email: nextAssignee.email,
          },
          attachments: activeAttachments,
          isCardTemplate: Boolean(payload.isCardTemplate),
          actions: [],
          metadata: {
            ...(payload.metadata || {}),
            parentTaskId: payload.taskId,
            previousConfirmedAt: new Date().toISOString(),
            previousComment: dto.comment,
            isDraftReplaced: hasReplacedFile,
            replacedFileName,
            replacedFileUrl,
            executionId: latestAuto?.executionId,
          },
          createdAt: new Date().toISOString(),
        };

        const nextInboxItemData = {
          userId: nextAssigneeId,
          title: nextTaskTitle,
          rawContent: nextContent,
          sourceType: targetItem.sourceType || 'chat',
          sourceRefId: nextTaskId,
          sourceTitle,
          sourceSender: initiator.username || operator.username,
          unifiedPayload: nextPayload,
          status: 'unprocessed',
          confidence: 1.0,
        };

        const autoMsg =
          automationReports.length > 0 && latestAuto
            ? `前置自动化任务「${latestAuto.title || '合规审查'}」已自动完成（${latestAuto.overallRisk === 'LOW' ? '合规良好' : latestAuto.overallRisk === 'HIGH' ? '高危漏洞预警' : '中度合规风险'}${latestAuto.riskScore !== undefined ? ` ${latestAuto.riskScore}分` : ''}），`
            : '';

        const syncMessage = hasReplacedFile
          ? `经办核对已确认（已替换为上传的修订文档「${replacedFileName}」）！${autoMsg}已流转至「${nextHumanStage.name}」(@${nextAssigneeName}) 审核。`
          : `经办核对已确认！${autoMsg}已流转至「${nextHumanStage.name}」(@${nextAssigneeName}) 审核。`;

        return {
          handled: true,
          nextStatus,
          actionText: `确认并转派${nextHumanStage.name}`,
          externalSyncResult: {
            success: true,
            currentStage: nextHumanStage.id,
            nextAssignee: nextAssigneeName,
            trackingNumber: `${(workflow.category || 'STAGE').toUpperCase()}-REV-${Date.now().toString().slice(-6)}`,
            externalSystem: isLegal
              ? '合同合规智能审查与法务流转中心'
              : '企业流程流转中心',
            message: syncMessage,
            reviewReport: latestAuto || undefined,
            executionId: latestAuto?.executionId || undefined,
            isDraftReplaced: hasReplacedFile,
            activeAttachment: activeAttachments[0],
          },
          nextInboxItemData,
        };
      }

      // 情况 B: 已到达归档/办结阶段 (Reached Archive Stage or End)
      const trackingNumber = `${(workflow.category || 'LEGAL').toUpperCase()}-ARC-${Date.now().toString().slice(-6)}`;
      return {
        handled: true,
        nextStatus,
        actionText: '终审通过并归档',
        externalSyncResult: {
          success: true,
          currentStage: archiveStage?.id || 'archive',
          trackingNumber,
          externalSystem: isLegal
            ? '法务电子合同库 & 存证归档中心'
            : '统一电子文档存证与归档中心',
          message: isLegal
            ? `保密/商业合同审查通过！已完成法务合规归档与存证备案（合同名称：${params.contractTitle || targetItem.sourceTitle || targetItem.title || sourceTitle}）`
            : `流程全周期已成功闭环！已完成合规归档与电子存证备案（业务标识：${sourceTitle}）。`,
          detail: {
            archiveId: `ARC_${Date.now()}`,
            workflowId: workflow.workflowId,
            workflowName: workflow.name,
            contractTitle: params.contractTitle || targetItem.sourceTitle || sourceTitle,
            contractType: params.contractType || 'nda',
            counterpartyName: params.counterpartyName,
            activeAttachment: activeAttachments[0],
            archivedAt: new Date().toISOString(),
          },
        },
      };
    }

    return null;
  }

  /**
   * 带重试（默认最多 3 次）的自动化阶段执行，失败捕获并在重试耗尽后返回错误
   */
  public async evaluateAutomationStageWithRetry(
    stage: WorkflowStageDefinition,
    params: Record<string, any>,
    context?: any,
    maxRetries = 3
  ): Promise<{ success: boolean; report?: any; error?: any; attempts: number }> {
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(
          `[AsyncStageEngine] Executing stage task "${stage.name || stage.id}" (attempt ${attempt}/${maxRetries})...`
        );
        const report = await this.evaluateAutomationStage(stage, params, context);
        return { success: true, report, attempts: attempt };
      } catch (err: any) {
        lastError = err;
        this.logger.warn(
          `[AsyncStageEngine] Attempt ${attempt}/${maxRetries} failed for stage "${stage.name || stage.id}": ${err?.message || err}`
        );
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
    }
    return {
      success: false,
      error: lastError,
      attempts: maxRetries,
    };
  }

  /**
   * 通用评估自动化中间阶段（根据 stage.capabilityId / stage.workflowId / config 动态调度并真实执行能力）
   * 并在 prisma.execution 中记录真实的执行数据与执行步骤，
   * 以便在任务中心 (/executions) 和协同链路中清晰追溯该自动化能力的执行产物与风险评级。
   */
  private async evaluateAutomationStage(
    stage: WorkflowStageDefinition,
    params: Record<string, any>,
    context?: {
      prisma?: any;
      operator?: { id: string; username: string; email?: string | null };
      initiator?: { id?: string; username?: string; email?: string | null };
      targetItem?: { id: string; sourceTitle?: string; title: string };
      workflow?: OrganizationWorkflowDefinition;
      payload?: Record<string, any>;
      activeAttachments?: CoordinationAttachment[];
    }
  ): Promise<any> {
    const stageId = stage.id || '';
    const stageName = stage.name || '';
    const stageConfig: Record<string, any> = {
      ...(stage.config || {}),
    };

    if (params?.simulateFailure === true || stageConfig?.simulateFailure === true) {
      throw new Error(params?.simulateErrorMessage || '模拟自动化执行异常：审查引擎超时未响应');
    }

    // 1. 动态能力解析：优先 stage 自身显式配置的 capabilityId / workflowId，其次在 assembledWorkflows 中按 stageId / stageType 匹配
    const matchedAssembled = context?.workflow?.assembledWorkflows?.find(
      (w) =>
        (w.stageId && w.stageId === stage.id) ||
        (stage.capabilityId && (w.refId === stage.capabilityId || w.name === stage.capabilityId)) ||
        (w.stageType === 'automation' && stage.type === 'automation')
    );

    if (matchedAssembled?.config) {
      Object.assign(stageConfig, matchedAssembled.config);
    }

    const capabilityRefId =
      stage.capabilityId ||
      stage.workflowId ||
      matchedAssembled?.refId ||
      (stageId.includes('archive') || stageId.includes('pdf') || stageName.includes('归档')
        ? 'platform.document.pdf-create'
        : stageId.includes('compare') || stageName.includes('比对')
        ? 'platform.document.contract-comparator'
        : 'platform.document.contract-reviewer');

    const capabilityName =
      matchedAssembled?.name ||
      stageName ||
      (capabilityRefId.includes('reviewer') || capabilityRefId.includes('review')
        ? '合同文档智能审查与合规诊断'
        : capabilityRefId.includes('comparator') || capabilityRefId.includes('compare')
        ? '合同版本智能比对与差异分析'
        : capabilityRefId.includes('pdf-create') || capabilityRefId.includes('pdf')
        ? '防篡改电子凭证与归档存证'
        : '自动化能力执行');

    // 2. 委托自动化执行器调度执行（优先 Control Plane /executions，网络异常备用真实引擎并产出 HTML 报告工件）
    const report = await this.automationRunner.executeAutomationStage({
      stage,
      params,
      stageConfig,
      capabilityRefId,
      capabilityName,
      activeAttachments: context?.activeAttachments,
      targetItem: context?.targetItem,
      operator: context?.operator,
      initiator: context?.initiator,
      workflow: context?.workflow,
      payload: context?.payload,
    });

    // 3. 将真实执行记录写入 prisma.execution 与 step (若尚未通过 Control Plane 创建)
    if (context?.prisma?.execution && !report.executionId) {
      try {
        const isUuid = (val?: string) =>
          typeof val === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            val
          );

        const executionUserId = isUuid(context.operator?.id)
          ? context.operator!.id
          : isUuid(context.initiator?.id)
            ? context.initiator!.id
            : '00000000-0000-0000-0000-000000000000';

        const execution = await context.prisma.execution.create({
          data: {
            createdBy: executionUserId,
            // executions.skill_id is a legacy FK-shaped UUID column in Postgres.
            // Built-in capabilities use stable string keys which live in inputJson/normalizedInputJson.
            skillId: null,
            skillVersion: '1.0.0',
            status: 'succeeded',
            runtimeType: 'system',
            riskLevel:
              report.overallRisk === 'HIGH'
                ? 'L2'
                : report.overallRisk === 'MEDIUM'
                ? 'L1'
                : 'L0',
            executionMode: 'single_skill',
            inputJson: {
              capabilityId: capabilityRefId,
              skillId: capabilityRefId,
              capabilityName,
              sourceTitle:
                context.targetItem?.sourceTitle || context.targetItem?.title,
              workflowId: context.workflow?.workflowId,
              stageId: stage.id,
              stageConfig,
              parameters: params,
              attachments: context.activeAttachments || [],
            },
            normalizedInputJson: {
              capabilityId: capabilityRefId,
              skillId: capabilityRefId,
              parameters: params,
              stageConfig,
            },
            resultJson: {
              success: true,
              capabilityKey: capabilityRefId,
              report,
              artifacts: report.artifacts || [],
            },
            startedAt: new Date(),
            endedAt: new Date(),
          },
        });

        report.executionId = execution.id;

        if (context.prisma.executionStep) {
          await context.prisma.executionStep.create({
            data: {
              executionId: execution.id,
              stepIndex: 0,
              name: capabilityName,
              type: 'system',
              status: 'succeeded',
              action:
                capabilityRefId === 'platform.document.pdf-create'
                  ? 'document_archive'
                  : 'contract_review',
              capabilityId: capabilityRefId,
              capabilityVersion: '1.0.0',
              inputJson: {
                parameters: params,
                stageConfig,
                attachments: context.activeAttachments || [],
              },
              outputJson: report,
            },
          });
        }

        this.logger.log(
          `Recorded automated stage execution ${execution.id} for capability ${capabilityRefId} (workflow: ${context.workflow?.workflowId})`
        );
      } catch (err) {
        this.logger.error(
          'Failed to create execution record for automated stage:',
          err
        );
      }
    }

    // 4. 将生成的 HTML 报告等关键工件同步回填至 context.activeAttachments
    if (Array.isArray(report.artifacts) && Array.isArray(context?.activeAttachments)) {
      // 移除前序旧审查轮次遗留的过期 HTML 报告，确保附件列表中仅保留与本次评估对应的最新诊断报告
      const isReviewCapability = capabilityRefId.includes('review') || capabilityRefId.includes('reviewer');
      if (isReviewCapability) {
        for (let i = context.activeAttachments.length - 1; i >= 0; i--) {
          const a = context.activeAttachments[i];
          const aName = a?.name?.toLowerCase() || '';
          if (
            aName.includes('审查报告') ||
            aName.includes('合规审查') ||
            aName.includes('review-report') ||
            a?.mimeType === 'text/html' ||
            aName.endsWith('.html') ||
            aName.endsWith('.htm')
          ) {
            context.activeAttachments.splice(i, 1);
          }
        }
      }

      for (const art of report.artifacts) {
        const artUrl = art.url || art.downloadUrl;
        if (artUrl && !context.activeAttachments.some((a) => a.url === artUrl)) {
          context.activeAttachments.push({
            name: art.name || art.fileName || '智能合规审查诊断报告.html',
            url: artUrl,
            size: art.sizeBytes || art.size,
            mimeType: art.mimeType || 'text/html',
          });
        }
      }
    }

    return report;
  }

}
