import { Injectable, Logger } from '@nestjs/common';
import {
  ChatMessage as MultimodalChatMessage,
  ContentBlock,
  ModelReasoningConfig,
} from '../../interfaces';
import { ModelService } from '../model/model.service';
import { ChatSessionData, SessionService } from '../redis/session.service';
import { StreamEventType } from '../react-engine/interfaces';
import type { StreamEvent } from '../react-engine/interfaces';
import type { ExecutionContext } from '../react-engine/interfaces';
import type { ChatRequestDTO, ChatResponseDTO } from './chat.dto';
import { ChatMediaService } from './chat-media.service';

interface ChatSessionListItem {
  id: string;
  title?: string;
  modelId?: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

interface ChatHistoryItem {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

type PersistedTaskStatus =
  | 'running'
  | 'waiting_input'
  | 'pending_approval'
  | 'human_control'
  | 'completed'
  | 'failed';

@Injectable()
export class ChatConversationService {
  private readonly logger = new Logger(ChatConversationService.name);

  constructor(
    private readonly modelService: ModelService,
    private readonly sessionService: SessionService,
    private readonly chatMediaService: ChatMediaService
  ) {}

  async streamChat(body: ChatRequestDTO, emit: (event: StreamEvent) => void): Promise<void> {
    const modelId = this.resolvePreferredChatModelId(body);
    const sessionId = body.sessionId || 'default';
    const thinkingEnabled = this.isThinkingEnabled(body);
    const reasoningConfig = await this.resolveReasoningConfig(body, modelId);
    const client = this.modelService.getClient(modelId);

    if (!client) {
      emit({
        type: StreamEventType.ERROR,
        content: `模型 ${modelId} 未初始化`,
      });
      return;
    }

    emit({
      type: StreamEventType.THOUGHT,
      content: '正在思考...',
    });

    const messageContent = await this.chatMediaService.buildMessageContent(
      body.message,
      body.files
    );
    const systemMessage = this.buildChatSystemMessage(
      thinkingEnabled,
      Boolean(body.files && body.files.length > 0)
    );
    const messages = await this.buildConversationMessages(sessionId, systemMessage, messageContent);

    const userMessageForHistory = this.normalizeContentToText(messageContent);
    let fullContent = '';
    const response = await this.modelService.callModelStreamWithMessages(
      modelId,
      messages,
      (chunk: string) => {
        fullContent += chunk;
        emit({
          type: StreamEventType.OBSERVATION,
          content: this.getVisibleChatContent(fullContent, thinkingEnabled),
          data: {
            mode: 'chat',
            thinking: thinkingEnabled,
            reasoning: reasoningConfig.enabled === true,
          },
        });
      },
      {
        reasoning: reasoningConfig,
      }
    );

    const visibleContent = this.getVisibleChatContent(fullContent || '处理完成', thinkingEnabled);
    const historyAssistantContent = this.modelService.stripThinkingTags(fullContent || '处理完成');

    if (response.usage) {
      this.logger.debug(`Chat completion usage: ${JSON.stringify(response.usage)}`);
    }

    emit({
      type: StreamEventType.RESULT,
      content: visibleContent,
      data: {
        mode: 'chat',
        thinking: thinkingEnabled,
        reasoning: reasoningConfig.enabled === true,
        usage: response.usage,
        rateLimit: response.rateLimit,
      },
    });

    const session = await this.persistConversation({
      sessionId,
      userContent: userMessageForHistory,
      assistantContent: historyAssistantContent,
      rawAssistantContent: fullContent || '处理完成',
      modelId,
      thinkingEnabled,
      usage: response.usage,
      rateLimit: response.rateLimit,
    });
    emit(this.buildSessionPatchEvent(sessionId, session));
  }

  async chat(body: ChatRequestDTO): Promise<ChatResponseDTO> {
    const modelId = this.resolvePreferredChatModelId(body);
    const sessionId = body.sessionId || 'default';
    const thinkingEnabled = this.isThinkingEnabled(body);
    const reasoningConfig = await this.resolveReasoningConfig(body, modelId);
    const client = this.modelService.getClient(modelId);

    if (!client) {
      return {
        response: `模型 ${modelId} 未初始化`,
        events: [{ type: StreamEventType.ERROR, content: `模型 ${modelId} 未初始化` }],
      };
    }

    const userContent = await this.chatMediaService.buildMessageContent(body.message, body.files);
    const messages = await this.buildConversationMessages(
      sessionId,
      this.buildChatSystemMessage(thinkingEnabled, Boolean(body.files?.length)),
      userContent
    );
    const response = await client.chatCompletion({
      messages,
      reasoning: reasoningConfig,
    });
    const visibleContent = this.getVisibleChatContent(response.content, thinkingEnabled);
    const historyAssistantContent = this.modelService.stripThinkingTags(response.content);

    const session = await this.persistConversation({
      sessionId,
      userContent: this.normalizeContentToText(userContent),
      assistantContent: historyAssistantContent,
      rawAssistantContent: response.content,
      modelId,
      thinkingEnabled,
      usage: response.usage,
      rateLimit: response.rateLimit,
    });

    return {
      response: visibleContent,
      events: [
        {
          type: StreamEventType.RESULT,
          content: visibleContent,
          data: {
            sessionId,
            mode: 'chat',
            thinking: thinkingEnabled,
            reasoning: reasoningConfig.enabled === true,
            usage: response.usage,
            rateLimit: response.rateLimit,
          },
        },
        this.buildSessionPatchEvent(sessionId, session),
      ],
    };
  }

  async loadTaskHistory(sessionId: string): Promise<ExecutionContext['history']> {
    const chatSession = await this.sessionService.getChatSession(sessionId);
    return (chatSession?.history || []).map((message) => ({
      role: message.role as 'user' | 'assistant' | 'system',
      content: message.content,
      timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
    }));
  }

  async listSessions(): Promise<ChatSessionListItem[]> {
    return this.sessionService.listChatSessions();
  }

  async getChatHistory(sessionId: string): Promise<ChatHistoryItem[]> {
    const chatSession = await this.sessionService.getChatSession(sessionId);
    return (chatSession?.history || []).map((message, index) => ({
      id: message.id || `${sessionId}-${index}`,
      sessionId,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      metadata: message.metadata,
    }));
  }

  async persistTaskConversation(params: {
    sessionId: string;
    userContent: string;
    terminalEvent: StreamEvent;
    modelId?: string;
  }): Promise<StreamEvent | null> {
    const normalizedUserContent = params.userContent.trim();
    const assistantMessage = this.buildTaskAssistantHistoryMessage(params.terminalEvent);
    if (!normalizedUserContent || !assistantMessage) {
      return null;
    }

    const nextSession = await this.sessionService.appendChatMessages(
      params.sessionId,
      [
        {
          role: 'user',
          content: normalizedUserContent,
          timestamp: new Date().toISOString(),
          metadata: {
            mode: 'task',
          },
        },
        assistantMessage,
      ],
      {
        modelId: params.modelId && params.modelId !== 'default' ? params.modelId : undefined,
        title: this.buildSessionTitle(normalizedUserContent),
      }
    );

    return this.buildSessionPatchEvent(params.sessionId, nextSession.session);
  }

  private async buildConversationMessages(
    sessionId: string,
    systemMessage: string,
    userContent: string | ContentBlock[]
  ): Promise<MultimodalChatMessage[]> {
    const chatSession = await this.sessionService.getChatSession(sessionId);
    const historyMessages: MultimodalChatMessage[] = (chatSession?.history || []).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    return [
      { role: 'system', content: systemMessage },
      ...historyMessages,
      { role: 'user', content: userContent },
    ];
  }

  private async persistConversation(params: {
    sessionId: string;
    userContent: string;
    assistantContent: string;
    rawAssistantContent: string;
    modelId?: string;
    thinkingEnabled: boolean;
    usage?: unknown;
    rateLimit?: unknown;
  }): Promise<NonNullable<ChatSessionData['session']> | undefined> {
    const assistantMetadata = this.buildChatAssistantMetadata({
      rawAssistantContent: params.rawAssistantContent,
      thinkingEnabled: params.thinkingEnabled,
      usage: params.usage,
      rateLimit: params.rateLimit,
    });
    const nextSession = await this.sessionService.appendChatMessages(params.sessionId, [
      {
        role: 'user',
        content: params.userContent,
        timestamp: new Date().toISOString(),
        metadata: {
          mode: 'chat',
        },
      },
      {
        role: 'assistant',
        content: params.assistantContent,
        timestamp: new Date().toISOString(),
        metadata: assistantMetadata,
      },
    ], {
      modelId: params.modelId && params.modelId !== 'default' ? params.modelId : undefined,
      title: this.buildSessionTitle(params.userContent),
    });
    return nextSession.session;
  }

  private buildChatAssistantMetadata(params: {
    rawAssistantContent: string;
    thinkingEnabled: boolean;
    usage?: unknown;
    rateLimit?: unknown;
  }): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      mode: 'chat',
      showThinking: params.thinkingEnabled,
    };
    const thoughtLogsSnapshot = params.thinkingEnabled
      ? this.extractThinkingBlocks(params.rawAssistantContent)
      : [];
    if (thoughtLogsSnapshot.length > 0) {
      metadata.thoughtLogsSnapshot = thoughtLogsSnapshot;
    }
    if (params.usage !== undefined) {
      metadata.usage = params.usage;
    }
    if (params.rateLimit !== undefined) {
      metadata.rateLimit = params.rateLimit;
    }
    return metadata;
  }

  private buildSessionPatchEvent(
    sessionId: string,
    session?: NonNullable<ChatSessionData['session']>
  ): StreamEvent {
    return {
      type: StreamEventType.SESSION_PATCH,
      sessionId,
      content: '',
      data: {
        title: session?.title,
        status: session?.status || 'active',
        updatedAt: session?.updatedAt || new Date().toISOString(),
      },
    };
  }

  private buildSessionTitle(content: string): string | undefined {
    const normalized = content.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return undefined;
    }
    return normalized.slice(0, 24);
  }

  private normalizeContentToText(content: string | ContentBlock[]): string {
    if (typeof content === 'string') {
      return content;
    }

    return content
      .map((block) => {
        if (block.type === 'text') {
          return block.text || '';
        }
        if (block.type === 'image_url') {
          return '[用户上传了图片]';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  private extractThinkingBlocks(content: string): string[] {
    const blocks: string[] = [];
    const thinkTagRegex = /<think>([\s\S]*?)(?:<\/think>|$)/gi;
    let match: RegExpExecArray | null;

    while ((match = thinkTagRegex.exec(content)) !== null) {
      const block = match[1]?.trim();
      if (block) {
        blocks.push(block);
      }
    }

    return blocks;
  }

  private buildTaskAssistantHistoryMessage(
    event: StreamEvent
  ): ChatSessionData['history'][number] | null {
    const content = event.content?.trim();
    const data = this.asRecord(event.data);
    const taskStatus = this.resolveTaskStatus(event, data);
    if (!content || !taskStatus) {
      return null;
    }

    const executionId = this.asString(data?.executionId);
    const executionStatus = this.asString(data?.status) || taskStatus;
    const hasBusinessResult =
      typeof data?.hasBusinessResult === 'boolean' ? data.hasBusinessResult : taskStatus === 'completed';
    const metadata: Record<string, unknown> = {
      mode: 'task',
      showThinking: false,
      taskStatus,
      executionStatus,
      finalSummary: content,
      hasBusinessResult,
    };

    if (executionId) {
      metadata.executionId = executionId;
    }
    const runtimeType = this.asString(data?.runtimeType) || this.asString(data?.runtime_type);
    if (runtimeType) {
      metadata.runtimeType = runtimeType;
    }
    if (taskStatus === 'completed') {
      metadata.finalResult = content;
    }
    if (taskStatus === 'failed') {
      metadata.errorMessage = content;
      metadata.failureReason = content;
    }
    if (data?.result !== undefined) {
      metadata.finalResultData = data.result;
    }
    const normalizedResult = this.asRecord(data?.normalizedResult);
    if (normalizedResult) {
      metadata.normalizedResult = normalizedResult;
      const structuredData = normalizedResult.structuredData;
      if (structuredData !== undefined) {
        metadata.finalResultData = structuredData;
      }
    } else if (data?.businessData !== undefined) {
      metadata.finalResultData = data.businessData;
    }
    const resultType = this.asString(data?.resultType);
    if (resultType) {
      metadata.resultType = resultType;
    }
    const resultTitle = this.asString(data?.resultTitle) || this.asString(data?.title);
    if (resultTitle) {
      metadata.resultTitle = resultTitle;
    }
    if (Array.isArray(data?.artifacts)) {
      metadata.artifacts = data.artifacts;
    }
    if (Array.isArray(data?.missingInputs)) {
      metadata.missingInputs = data.missingInputs;
    }

    const downloadUrl = this.asString(data?.downloadUrl);
    if (downloadUrl) {
      metadata.downloadUrl = downloadUrl;
    }

    const temporalLink = this.asString(data?.temporalLink);
    if (temporalLink) {
      metadata.temporalLink = temporalLink;
    }

    return {
      role: 'assistant',
      content,
      timestamp: new Date().toISOString(),
      metadata,
    };
  }

  private resolveTaskStatus(
    event: StreamEvent,
    data?: Record<string, unknown>
  ): PersistedTaskStatus | null {
    switch (event.type) {
      case StreamEventType.WAITING_INPUT:
        return 'waiting_input';
      case StreamEventType.PENDING_APPROVAL:
        return 'pending_approval';
      case StreamEventType.HUMAN_CONTROL:
        return 'human_control';
      case StreamEventType.ERROR:
        return 'failed';
      case StreamEventType.RESULT: {
        const explicitStatus = this.normalizeTaskStatus(
          this.asString(data?.taskStatus) || this.asString(data?.status)
        );
        if (explicitStatus) {
          return explicitStatus;
        }
        return 'completed';
      }
      default:
        return null;
    }
  }

  private normalizeTaskStatus(value?: string): PersistedTaskStatus | null {
    switch (value) {
      case 'draft':
      case 'queued':
      case 'paused':
        return 'running';
      case 'running':
      case 'waiting_input':
      case 'pending_approval':
      case 'human_control':
      case 'completed':
      case 'failed':
        return value;
      case 'succeeded':
        return 'completed';
      default:
        return null;
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private isThinkingEnabled(body: ChatRequestDTO): boolean {
    return body.config?.thinking !== false;
  }

  private async resolveReasoningConfig(
    body: ChatRequestDTO,
    modelId: string
  ): Promise<ModelReasoningConfig> {
    const requested = body.config?.reasoning === true || body.config?.thinking === true;
    if (!requested) {
      return { enabled: false };
    }

    const model = await this.modelService.getModel(modelId);
    if (!model) {
      return { enabled: false };
    }

    const config = (model.config || {}) as Record<string, unknown>;
    const reasoningConfig =
      typeof config.reasoning === 'object' && config.reasoning ? config.reasoning : null;
    const explicitSupport =
      config.supports_reasoning === true ||
      (reasoningConfig &&
        (reasoningConfig as Record<string, unknown>).supported === true);
    const inferredSupport =
      /^(o1|o3|o4|qwq)/i.test(model.name) ||
      /(reasoner|reasoning|deepseek-r1)/i.test(model.name) ||
      (model.provider === 'minimax' && /^MiniMax-M/i.test(model.name));
    const enabled = explicitSupport || inferredSupport;
    const effortValue =
      (typeof config.reasoning_effort === 'string' ? config.reasoning_effort : undefined) ||
      (reasoningConfig &&
      typeof (reasoningConfig as Record<string, unknown>).effort === 'string'
        ? (reasoningConfig as Record<string, unknown>).effort
        : undefined);

    return {
      enabled,
      effort:
        effortValue === 'low' || effortValue === 'high' || effortValue === 'medium'
          ? effortValue
          : 'medium',
    };
  }

  private resolvePreferredChatModelId(body: ChatRequestDTO): string {
    if (body.modelId && body.modelId !== 'default') {
      return body.modelId;
    }

    const preferredModel = this.modelService.getPreferredDefaultModel({
      mode: 'chat',
      userRoles: body.userRoles,
    });
    return preferredModel?.id || 'default';
  }

  private buildChatSystemMessage(thinkingEnabled: boolean, includeFiles: boolean): string {
    const basePrompt = includeFiles
      ? '你是一个智能助手，请用中文友好地回答用户的问题。如果用户上传了文件，请分析文件内容并给出相关回答。'
      : '你是一个智能助手，请用中文友好地回答用户的问题。';

    if (thinkingEnabled) {
      return `${basePrompt} 如模型支持推理或 think 模式，请先充分思考，再给出清晰结论。`;
    }

    return `${basePrompt} 直接输出结论，不要输出思考过程、推理细节或 <think> 标签。`;
  }

  private getVisibleChatContent(content: string, thinkingEnabled: boolean): string {
    return thinkingEnabled ? content : this.modelService.stripThinkingTags(content);
  }
}
