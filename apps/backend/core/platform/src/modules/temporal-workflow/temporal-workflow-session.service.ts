import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessage, ChatSession } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TemporalWorkflowNormalizationService } from './temporal-workflow-normalization.service';
import type {
  AiWorkflowDraft,
  AiWorkflowDraftSession,
  AiWorkflowDraftSessionListItem,
  GenerateAiWorkflowDraftSessionDTO,
  RefineAiWorkflowDraftSessionDTO,
} from './temporal-workflow.types';

export interface TemporalWorkflowSessionSupport {
  generateAiWorkflowDraft(data: GenerateAiWorkflowDraftSessionDTO): Promise<AiWorkflowDraft>;
  refineAiWorkflowDraft(data: {
    currentWorkflowDsl: AiWorkflowDraft['workflowDsl'];
    currentActivityDsl: AiWorkflowDraft['activityDsl'];
    userPrompt: string;
  }): Promise<AiWorkflowDraft>;
}

@Injectable()
export class TemporalWorkflowSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowNormalizationService: TemporalWorkflowNormalizationService,
  ) {}

  async createAiDraftSession(
    data: GenerateAiWorkflowDraftSessionDTO,
    support: TemporalWorkflowSessionSupport,
    userId?: string,
  ): Promise<AiWorkflowDraftSession> {
    const effectiveUserId = userId || await this.resolveFallbackUserId();
    const draft = await support.generateAiWorkflowDraft(data);
    const userPrompt = [
      String(data?.description || '').trim(),
      data?.referenceUrl ? `参考 URL: ${String(data.referenceUrl).trim()}` : '',
    ].filter(Boolean).join('\n');

    const session = await this.prisma.chatSession.create({
      data: {
        userId: effectiveUserId,
        title: String(data?.title || draft.name || 'Workflow Draft Session').trim().slice(0, 255) || 'Workflow Draft Session',
        modelId: 'temporal-workflow-draft',
        status: 'active',
        messages: {
          create: [
            {
              role: 'user',
              content: userPrompt || '创建工作流草稿',
              metadata: this.workflowNormalizationService.sanitizeJsonValue({
                kind: 'temporal_workflow_draft_prompt',
                description: String(data?.description || '').trim() || undefined,
                referenceUrl: String(data?.referenceUrl || '').trim() || undefined,
              }) as any,
            },
            {
              role: 'assistant',
              content: '已生成初始工作流草稿',
              metadata: this.workflowNormalizationService.sanitizeJsonValue({
                kind: 'temporal_workflow_draft_result',
                draft,
              }) as any,
            },
          ],
        },
      },
    });

    return this.getAiDraftSession(session.id, effectiveUserId);
  }

  async refineAiDraftSession(
    data: RefineAiWorkflowDraftSessionDTO,
    support: TemporalWorkflowSessionSupport,
    userId?: string,
  ): Promise<AiWorkflowDraftSession> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: data.sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) {
      throw new NotFoundException(`草稿会话不存在: ${data.sessionId}`);
    }
    if (userId && session.userId !== userId) {
      throw new NotFoundException(`草稿会话不存在: ${data.sessionId}`);
    }

    const lastDraft = this.extractLatestDraftFromMessages(session.messages);
    if (!lastDraft) {
      throw new BadRequestException('当前会话没有可继续改进的草稿');
    }

    const refinedDraft = await support.refineAiWorkflowDraft({
      currentWorkflowDsl: lastDraft.workflowDsl,
      currentActivityDsl: lastDraft.activityDsl,
      userPrompt: data.userPrompt,
    });

    const updated = await this.prisma.chatSession.update({
      where: { id: session.id },
      data: {
        updatedAt: new Date(),
        messages: {
          create: [
            {
              role: 'user',
              content: String(data.userPrompt || '').trim(),
              metadata: this.workflowNormalizationService.sanitizeJsonValue({
                kind: 'temporal_workflow_draft_refine_prompt',
              }) as any,
            },
            {
              role: 'assistant',
              content: '已更新工作流草稿',
              metadata: this.workflowNormalizationService.sanitizeJsonValue({
                kind: 'temporal_workflow_draft_result',
                draft: refinedDraft,
              }) as any,
            },
          ],
        },
      },
    });

    return this.getAiDraftSession(updated.id, userId || session.userId);
  }

  async getAiDraftSession(sessionId: string, userId?: string): Promise<AiWorkflowDraftSession> {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!session) {
      throw new NotFoundException(`草稿会话不存在: ${sessionId}`);
    }
    if (userId && session.userId !== userId) {
      throw new NotFoundException(`草稿会话不存在: ${sessionId}`);
    }
    return this.mapChatSessionToAiDraftSession(session);
  }

  async listAiDraftSessions(userId?: string): Promise<AiWorkflowDraftSessionListItem[]> {
    const effectiveUserId = userId || await this.resolveFallbackUserId();
    const sessions = await this.prisma.chatSession.findMany({
      where: {
        userId: effectiveUserId,
        modelId: 'temporal-workflow-draft',
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    return sessions.map((session) => {
      const currentDraft = this.extractLatestDraftFromMessages(session.messages);
      return {
        sessionId: session.id,
        title: session.title || undefined,
        status: session.status,
        updatedAt: session.updatedAt.toISOString(),
        messageCount: session.messages.length,
        currentDraftName: currentDraft?.workflowDsl?.name || currentDraft?.name || undefined,
        currentDraftDescription: currentDraft?.description || undefined,
      };
    });
  }

  async deleteAiDraftSession(sessionId: string, userId?: string): Promise<{ success: boolean }> {
    const effectiveUserId = userId || await this.resolveFallbackUserId();
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        modelId: true,
      },
    });
    if (!session || session.modelId !== 'temporal-workflow-draft' || session.userId !== effectiveUserId) {
      throw new NotFoundException(`草稿会话不存在: ${sessionId}`);
    }

    await this.prisma.chatSession.delete({
      where: { id: sessionId },
    });

    return { success: true };
  }

  private async resolveFallbackUserId(): Promise<string> {
    const firstUser = await this.prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!firstUser?.id) {
      throw new BadRequestException('当前没有可用用户，无法创建草稿会话');
    }
    return firstUser.id;
  }

  private extractLatestDraftFromMessages(messages: ChatMessage[]): AiWorkflowDraft | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const metadata = this.parseJson<Record<string, unknown>>(messages[index]?.metadata) || {};
      const draft = this.parseJson<AiWorkflowDraft>(metadata.draft);
      if (draft?.workflowDsl && draft?.activityDsl) {
        return draft;
      }
    }
    return null;
  }

  private mapChatSessionToAiDraftSession(
    session: ChatSession & { messages: ChatMessage[] },
  ): AiWorkflowDraftSession {
    return {
      sessionId: session.id,
      title: session.title || undefined,
      status: session.status,
      messages: (session.messages || []).map((message) => {
        const metadata = this.parseJson<Record<string, unknown>>(message.metadata) || {};
        const draft = this.parseJson<AiWorkflowDraft>(metadata.draft);
        return {
          id: message.id,
          role: (message.role as 'user' | 'assistant' | 'system') || 'assistant',
          content: message.content,
          createdAt: message.createdAt.toISOString(),
          draft: draft?.workflowDsl && draft?.activityDsl ? draft : undefined,
        };
      }),
      currentDraft: this.extractLatestDraftFromMessages(session.messages),
    };
  }

  private parseJson<T = unknown>(value: unknown): T {
    if (value === null || value === undefined) {
      return value as T;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    }
    return value as T;
  }
}
