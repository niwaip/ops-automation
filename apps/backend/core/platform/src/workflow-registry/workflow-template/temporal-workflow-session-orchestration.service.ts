import { Injectable } from '@nestjs/common';
import {
  TemporalWorkflowSessionService,
  type TemporalWorkflowSessionSupport,
} from '../../modules/temporal-workflow/temporal-workflow-session.service';
import type {
  AiWorkflowDraftSession,
  AiWorkflowDraftSessionListItem,
  GenerateAiWorkflowDraftSessionDTO,
  RefineAiWorkflowDraftSessionDTO,
} from '../../modules/temporal-workflow/temporal-workflow.types';
import { TemporalWorkflowSessionSupportFactoryService } from './temporal-workflow-session-support-factory.service';

type TemporalWorkflowSessionDraftCallbacks = Pick<
  TemporalWorkflowSessionSupport,
  'generateAiWorkflowDraft' | 'refineAiWorkflowDraft'
>;

@Injectable()
export class TemporalWorkflowSessionOrchestrationService {
  constructor(
    private readonly sessionService: TemporalWorkflowSessionService,
    private readonly sessionSupportFactoryService: TemporalWorkflowSessionSupportFactoryService
  ) {}

  async createAiDraftSession(
    data: GenerateAiWorkflowDraftSessionDTO,
    callbacks: TemporalWorkflowSessionDraftCallbacks,
    userId?: string
  ): Promise<AiWorkflowDraftSession> {
    return this.sessionService.createAiDraftSession(
      data,
      this.createSessionSupport(callbacks),
      userId
    );
  }

  async refineAiDraftSession(
    data: RefineAiWorkflowDraftSessionDTO,
    callbacks: TemporalWorkflowSessionDraftCallbacks,
    userId?: string
  ): Promise<AiWorkflowDraftSession> {
    return this.sessionService.refineAiDraftSession(
      data,
      this.createSessionSupport(callbacks),
      userId
    );
  }

  async getAiDraftSession(sessionId: string, userId?: string): Promise<AiWorkflowDraftSession> {
    return this.sessionService.getAiDraftSession(sessionId, userId);
  }

  async listAiDraftSessions(userId?: string): Promise<AiWorkflowDraftSessionListItem[]> {
    return this.sessionService.listAiDraftSessions(userId);
  }

  async deleteAiDraftSession(sessionId: string, userId?: string): Promise<{ success: boolean }> {
    return this.sessionService.deleteAiDraftSession(sessionId, userId);
  }

  private createSessionSupport(
    callbacks: TemporalWorkflowSessionDraftCallbacks
  ): TemporalWorkflowSessionSupport {
    return this.sessionSupportFactoryService.createSessionSupport(
      callbacks.generateAiWorkflowDraft,
      callbacks.refineAiWorkflowDraft
    );
  }
}
