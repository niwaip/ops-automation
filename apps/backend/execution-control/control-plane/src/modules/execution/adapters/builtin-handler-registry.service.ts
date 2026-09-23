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

export type BuiltinHandlerFn = (request: RuntimeStepInvokeRequest, idempotencyKey: string) => Promise<BuiltinSkillHandlerResult>;

@Injectable()
export class BuiltinHandlerRegistryService implements OnModuleInit {
  private readonly logger = new Logger(BuiltinHandlerRegistryService.name);
  private readonly handlerMap = new Map<string, BuiltinHandlerFn>();

  constructor(
    @Optional() private readonly reminders?: ReminderService,
    @Optional() private readonly ledger?: OutboundEffectLedgerService
  ) {}

  onModuleInit() {
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    // 1. Markdown Artifact Writer Handler
    this.registerHandler('document.markdown-artifact-writer', async (req, idempotencyKey) => {
      const domainUrl = getCarboneServiceUrl();
      const response = await axios.post(`${domainUrl}/internal/document/markdown-artifacts/invoke`, {
        executionId: req.executionId,
        stepId: req.stepId,
        capabilityKey: req.publishedSkillId || req.skillId,
        definitionVersion: req.metadata?.definitionVersion || (req as any).skillVersion,
        idempotencyKey,
        input: req.input || {},
      });
      return response.data as BuiltinSkillHandlerResult;
    });

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
        const response = await axios.post(`${domainUrl}${endpoint}`, {
          executionId: req.executionId,
          stepId: req.stepId,
          capabilityKey: req.publishedSkillId || req.skillId,
          definitionVersion: req.metadata?.definitionVersion || (req as any).skillVersion,
          idempotencyKey,
          input: req.input || {},
        });
        return response.data as BuiltinSkillHandlerResult;
      } catch (err: any) {
        const remoteMsg =
          err.response?.data?.message ||
          err.response?.data?.error ||
          err.message ||
          'Document domain execution error';
        throw new Error(remoteMsg);
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
