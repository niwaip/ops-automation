import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import type { RuntimeStepInvokeRequest } from './runtime-adapter.interface';
import { getCarboneServiceUrl } from '../../../config/service-endpoints';

export type BuiltinHandlerFn = (request: RuntimeStepInvokeRequest, idempotencyKey: string) => Promise<BuiltinSkillHandlerResult>;

@Injectable()
export class BuiltinHandlerRegistryService implements OnModuleInit {
  private readonly logger = new Logger(BuiltinHandlerRegistryService.name);
  private readonly handlerMap = new Map<string, BuiltinHandlerFn>();

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

    // 2. Platform Internal Notification Handler
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
  }

  private registerDocumentDomainHandler(
    handlerKey: string,
    endpoint: string,
    capabilityAliases: string[] = []
  ): void {
    const handler: BuiltinHandlerFn = async (req, idempotencyKey) => {
      const domainUrl = getCarboneServiceUrl();
      const response = await axios.post(`${domainUrl}${endpoint}`, {
        executionId: req.executionId,
        stepId: req.stepId,
        capabilityKey: req.publishedSkillId || req.skillId,
        definitionVersion: req.metadata?.definitionVersion || (req as any).skillVersion,
        idempotencyKey,
        input: req.input || {},
      });
      return response.data as BuiltinSkillHandlerResult;
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
