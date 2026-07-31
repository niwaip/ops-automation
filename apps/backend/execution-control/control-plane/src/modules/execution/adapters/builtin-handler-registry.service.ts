import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import type { RuntimeStepInvokeRequest } from './runtime-adapter.interface';

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
      const domainUrl = process.env.CARBONE_SERVICE_URL || 'http://localhost:3009';
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
