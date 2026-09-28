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
import {
  DEFAULT_REMINDER_TIMEZONE,
  REMINDER_CAPABILITY_KEY,
} from '../../reminders/reminder.constants';

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
    @Optional() private readonly reminders?: ReminderService
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
    this.registerDocumentDomainHandler(
      'document.contract.compare',
      '/internal/document/contract-compare/invoke',
      ['platform.document.contract-comparator']
    );
    this.registerDocumentDomainHandler(
      'document.contract.review',
      '/internal/document/contract-review/invoke',
      ['platform.document.contract-reviewer']
    );

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
      const recipientId = String(req.input?.recipientId || 'system');
      const title = String(req.input?.title || 'Notification');
      this.logger.log(`[BuiltinHandlerRegistryService] Sent notification to ${recipientId}: ${title}`);
      return {
        success: true,
        output: {
          notificationId: `notif_${Date.now()}`,
          deliveredAt: new Date().toISOString(),
          recipientId,
          title,
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
