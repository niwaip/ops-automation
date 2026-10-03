import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import axios from 'axios';
import { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import type { RuntimeStepInvokeRequest } from './runtime-adapter.interface';
import { getCarboneServiceUrl } from '../../../config/service-endpoints';
import { executeWebSearch } from './search-web.handler';
import { executeEmailMessages } from './email/email-messages.handler';
import { executeEmailSend } from './email/email-send.handler';
import { executeEmailUpdate } from './email/email-update.handler';
import { executeWorkspaceExplorer } from './workspace/workspace-explorer.handler';
import { ReminderService } from '../../reminders/reminder.service';
import { OutboundEffectLedgerService } from '../outbox/outbound-effect-ledger.service';
import { ModelInvocationLedgerService } from '../../experience-learning/model-invocation-ledger.service';
import { executeContractReviewOrchestration } from './contract/contract-review-orchestrator';
import { executeContractCompareOrchestration } from './contract/contract-compare-orchestrator';
import {
  DEFAULT_REMINDER_TIMEZONE,
  REMINDER_CAPABILITY_KEY,
} from '../../reminders/reminder.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { ExecutionOutboxService } from '../outbox/execution-outbox.service';
import { randomUUID } from 'node:crypto';

export function formatDocumentDomainError(err: any, serviceName = 'carbone-engine'): Error {
  const code = err.code || err.cause?.code;
  const rawMessage = String(err.message || '');
  if (code === 'ENOTFOUND' || rawMessage.includes('ENOTFOUND')) {
    return new Error(
      `文档智能处理服务 (${serviceName}) 未就绪：域名无法解析 (ENOTFOUND)。请检查 ${serviceName} 容器是否已通过 './docker/start-smart.sh dev up -d' 启动并在同一 Docker 网络运行。`
    );
  }
  if (code === 'ECONNREFUSED' || rawMessage.includes('ECONNREFUSED')) {
    return new Error(
      `文档智能处理服务 (${serviceName}) 拒绝连接 (ECONNREFUSED)。服务可能仍在启动中或端口未就绪，请检查容器健康状态并稍后重试。`
    );
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED' || rawMessage.includes('timeout')) {
    return new Error(
      `文档智能处理服务 (${serviceName}) 请求超时，服务可能正在处理复杂大文档或处于高负载中。`
    );
  }
  const remoteMsg =
    err.response?.data?.message ||
    err.response?.data?.error ||
    err.message ||
    'Document domain execution error';
  return new Error(remoteMsg);
}

export type BuiltinHandlerFn = (
  request: RuntimeStepInvokeRequest,
  idempotencyKey: string
) => Promise<BuiltinSkillHandlerResult>;

@Injectable()
export class BuiltinHandlerRegistryService implements OnModuleInit {
  private readonly logger = new Logger(BuiltinHandlerRegistryService.name);
  private readonly handlerMap = new Map<string, BuiltinHandlerFn>();

  constructor(
    private readonly ledger: OutboundEffectLedgerService,
    @Optional() private readonly reminders?: ReminderService,
    @Optional() private readonly modelLedger?: ModelInvocationLedgerService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly outbox?: ExecutionOutboxService
  ) {}

  onModuleInit() {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    // 1. Markdown Artifact Writer Handler
    this.registerDocumentDomainHandler(
      'document.markdown-artifact-writer',
      '/internal/document/markdown-artifacts/invoke',
      ['platform.document.markdown-artifact-writer']
    );

    // Deterministic document content extraction handlers. Format-specific
    // parsing remains in document-domain; future extractors reuse this route.
    this.registerDocumentDomainHandler(
      'document.content-extractor.pdf',
      '/internal/document/content-extractors/pdf/invoke',
      ['platform.document.pdf-content-extractor']
    );

    // Public web search remains isolated behind the built-in capability. The
    // provider credential is resolved only at runtime and never enters plans.
    this.registerHandler('search.web', executeWebSearch);
    this.registerHandler('platform.search.web', executeWebSearch);
    this.registerHandler('tavily_search', executeWebSearch);
    this.registerDocumentDomainHandler('document.pdf.merge', '/internal/document/pdf/merge/invoke', [
      'platform.document.pdf-merge',
    ]);
    this.registerDocumentDomainHandler('document.pdf.split', '/internal/document/pdf/split/invoke', [
      'platform.document.pdf-split',
    ]);
    this.registerDocumentDomainHandler(
      'document.pdf.create',
      '/internal/document/pdf/create/invoke',
      ['platform.document.pdf-create']
    );
    const contractCompareHandler: BuiltinHandlerFn = (req, idempotencyKey) =>
      executeContractCompareOrchestration(req, idempotencyKey, this.logger);
    this.registerHandler('document.contract.compare', contractCompareHandler);
    this.registerHandler('platform.document.contract-comparator', contractCompareHandler);
    const contractReviewHandler: BuiltinHandlerFn = (req, idempotencyKey) =>
      executeContractReviewOrchestration(req, idempotencyKey, this.logger, this.modelLedger);
    this.registerHandler('document.contract.review', contractReviewHandler);
    this.registerHandler('platform.document.contract-reviewer', contractReviewHandler);

    // 2. Built-in Email Capabilities (email.messages, email.send, email.update)
    this.registerHandler('email.messages', executeEmailMessages);
    this.registerHandler('platform.email.messages', executeEmailMessages);
    this.registerHandler('email.send', (req, key) => executeEmailSend(req, key, this.ledger));
    this.registerHandler('platform.email.send', (req, key) => executeEmailSend(req, key, this.ledger));
    this.registerHandler('email.update', executeEmailUpdate);
    this.registerHandler('platform.email.update', executeEmailUpdate);

    // 3. Built-in Workspace Explorer Capabilities
    this.registerHandler('workspace.explorer', executeWorkspaceExplorer);
    this.registerHandler('platform.workspace.explorer', executeWorkspaceExplorer);

    // 4. Platform Internal Notification Handler
    this.registerHandler('platform.notification.internal-message', async (req) => {
      const input = (req.input || {}) as Record<string, any>;
      const metadata = (input.metadata || {}) as Record<string, any>;
      const taskContext = (input.taskContext || {}) as Record<string, any>;

      const rawRecipientId = String(input.recipientId || input.recipient || metadata.recipientId || '').trim();
      const rawRecipientUsername = String(input.recipientUsername || metadata.recipientUsername || '').trim();
      const title = String(input.title || metadata.title || '通知消息').trim();
      const message = String(input.message || input.content || title).trim();

      // Resolve attachments from all potential sources
      let attachments: any[] = [];
      if (Array.isArray(input.attachments) && input.attachments.length > 0) {
        attachments = [...input.attachments];
      } else if (Array.isArray(taskContext.attachments) && taskContext.attachments.length > 0) {
        attachments = [...taskContext.attachments];
      } else if (Array.isArray(metadata.attachments) && metadata.attachments.length > 0) {
        attachments = [...metadata.attachments];
      }

      // If downloadUrl (e.g. generated PDF) is present and not yet in attachments, ensure it's included
      const downloadUrl = input.downloadUrl || metadata.downloadUrl || taskContext.downloadUrl;
      if (downloadUrl && !attachments.some((a: any) => (a?.url || a?.downloadUrl) === downloadUrl)) {
        attachments.unshift({
          name: `${input.contractTitle || metadata.contractTitle || '终审合同'}.pdf`,
          url: downloadUrl,
          downloadUrl,
          sha256: input.sha256 || metadata.sha256,
          mimeType: 'application/pdf',
        });
      }

      const trackingNumber =
        input.trackingNumber || metadata.trackingNumber || taskContext.trackingNumber;
      const canonicalTaskId =
        input.taskId || taskContext.taskId || metadata.taskId || req.executionId;
      const workflowId =
        input.workflowId || taskContext.workflowId || metadata.workflowId;
      const stageId =
        input.stageId || taskContext.stageId || metadata.stageId || 'final_receipt';
      const reviewSummary =
        input.reviewSummary || metadata.reviewSummary || taskContext.reviewSummary;

      this.logger.log(
        `[BuiltinHandlerRegistryService] Delivering internal notification: "${title}" (recipientId: "${rawRecipientId}", recipientUser: "${rawRecipientUsername}", taskId: "${canonicalTaskId}")`
      );

      let targetUser: any = null;
      if (this.prisma) {
        if (
          rawRecipientId &&
          /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
            rawRecipientId
          )
        ) {
          targetUser = await this.prisma.user.findUnique({
            where: { id: rawRecipientId },
          });
        }
        if (!targetUser && rawRecipientUsername) {
          targetUser = await this.prisma.user.findFirst({
            where: { username: rawRecipientUsername },
          });
        }
        if (!targetUser && rawRecipientId && rawRecipientId !== 'system') {
          targetUser = await this.prisma.user.findFirst({
            where: { username: rawRecipientId },
          });
        }
      }

      if (!targetUser) {
        this.logger.error(
          `[BuiltinHandlerRegistryService] Target recipient user not found (id: "${rawRecipientId}", username: "${rawRecipientUsername}")`
        );
        throw new Error(
          `内部消息投递失败：未在组织用户库中检索到接收人 [${
            rawRecipientUsername || rawRecipientId || '未知'
          }]，流转阻断`
        );
      }

      const orgId =
        input.orgId || taskContext.orgId || metadata.orgId || (req as any).orgId || targetUser.organizationId;

      const effectiveSha256 =
        input.sha256 ||
        metadata.sha256 ||
        attachments.find((a: any) => a.sha256 || a.metadata?.sha256)?.sha256 ||
        attachments.find((a: any) => a.metadata?.sha256)?.metadata?.sha256;
      const effectiveDownloadUrl =
        downloadUrl ||
        input.downloadUrl ||
        metadata.downloadUrl ||
        attachments.find((a: any) => a.downloadUrl || a.url)?.downloadUrl ||
        attachments.find((a: any) => a.url)?.url;

      const receiptPayload = {
        taskId: canonicalTaskId,
        taskType: 'receipt',
        isReceipt: true,
        workflowId,
        orgId,
        currentStage: stageId,
        status: 'completed',
        attachments,
        trackingNumber,
        reviewSummary,
        externalSyncResult: {
          success: true,
          trackingNumber,
          sha256: effectiveSha256,
          downloadUrl: effectiveDownloadUrl,
          externalSystem: '法务电子合同库 & 存证归档中心',
          digitalProof: input.digitalProof || {
            trackingNumber,
            sha256: effectiveSha256,
            downloadUrl: effectiveDownloadUrl,
          },
          attachments,
        },
        metadata: {
          ...metadata,
          ...taskContext,
          orgId,
          workflowId,
          taskId: canonicalTaskId,
          trackingNumber,
          reviewSummary,
          sha256: effectiveSha256,
          downloadUrl: effectiveDownloadUrl,
        },
      };

      let persistentId: string = randomUUID();
      const deliveryStatus = 'delivered';

      if (this.prisma) {
        // 在同一事务中同时创建收件箱项与 Outbox 事件
        await this.prisma.$transaction(async (tx) => {
          const inboxItem = await tx.workbenchInboxItem.create({
            data: {
              id: persistentId,
              userId: targetUser.id,
              title,
              rawContent: message,
              sourceType: 'chat' as any,
              sourceRefId: canonicalTaskId,
              sourceTitle: metadata.contractTitle || input.contractTitle || title,
              sourceSender: metadata.operator?.username || input.recipientUsername || '协同中心',
              unifiedPayload: receiptPayload as any,
              status: 'unprocessed' as any,
              confidence: 1.0,
            },
          });
          persistentId = inboxItem.id;

          if (this.outbox) {
            await this.outbox.enqueue(
              {
                aggregateType: 'notification',
                aggregateId: persistentId,
                eventType: 'notification.internal_message.delivered',
                payload: {
                  notificationId: persistentId,
                  recipientId: targetUser.id,
                  recipientUsername: targetUser.username,
                  title,
                  deliveryStatus: 'delivered',
                  deliveredAt: new Date().toISOString(),
                  taskId: canonicalTaskId,
                  workflowId,
                  orgId,
                  executionId: req.executionId,
                  attachments,
                  trackingNumber,
                },
              },
              tx as any
            );
          }
        });
      }

      return {
        success: true,
        output: {
          notificationId: persistentId,
          deliveryStatus,
          deliveredAt: new Date().toISOString(),
          recipientId: targetUser.id,
          recipientUsername: targetUser.username,
          title,
          taskId: canonicalTaskId,
          workflowId,
          orgId,
          attachments,
        },
      };
    });

    this.registerHandler(REMINDER_CAPABILITY_KEY, async (req) => {
      const userId = req.traceContext?.userId;
      if (!userId) throw new Error('Reminder requires an authenticated user');
      if (!this.reminders) throw new Error('ReminderService is not available');
      const input = req.input || {};
      const rule = await this.reminders.createFromSkill(userId, req.executionId, {
        title: String(input.title || ''), message: String(input.message || ''),
        cronExpression: String(input.cronExpression || ''),
        runAt: input.runAt ? String(input.runAt) : undefined,
        timezone: String(input.timezone || DEFAULT_REMINDER_TIMEZONE),
        sendWechat: input.sendWechat === true,
      });
      return { success: true, output: { reminderId: rule.id, nextRunAt: rule.nextRunAt.toISOString() } };
    });
  }

  private registerDocumentDomainHandler(
    handlerKey: string,
    endpoint: string,
    capabilityAliases: string[] = []
  ): void {
    const handler: BuiltinHandlerFn = async (req, idempotencyKey) => {
      const domainUrl = getCarboneServiceUrl();
      try {
        const response = await axios.post(
          `${domainUrl}${endpoint}`,
          {
            executionId: req.executionId,
            stepId: req.stepId,
            capabilityKey: req.publishedSkillId || req.skillId,
            definitionVersion: req.metadata?.definitionVersion || (req as any).skillVersion,
            idempotencyKey,
            input: req.input || {},
          },
          {
            timeout: 120000,
          }
        );
        return response.data as BuiltinSkillHandlerResult;
      } catch (err: any) {
        throw formatDocumentDomainError(err);
      }
    };
    this.registerHandler(handlerKey, handler);
    capabilityAliases.forEach((capabilityKey) => this.registerHandler(capabilityKey, handler));
  }

  registerHandler(handlerKey: string, handlerFn: BuiltinHandlerFn): void {
    this.handlerMap.set(handlerKey, handlerFn);
    this.logger.log(`Registered builtin handler for key: '${handlerKey}'`);
  }

  getHandler(handlerKey: string): BuiltinHandlerFn | undefined {
    return this.handlerMap.get(handlerKey);
  }

  hasHandler(handlerKey: string): boolean {
    return this.handlerMap.has(handlerKey);
  }
}
