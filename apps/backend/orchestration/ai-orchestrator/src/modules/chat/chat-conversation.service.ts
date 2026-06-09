import { Injectable, Logger } from '@nestjs/common';
import { ChatMessage as MultimodalChatMessage, ContentBlock } from '../../interfaces';
import { ModelService } from '../model/model.service';
import { SessionService } from '../redis/session.service';
import { StreamEventType } from '../react-engine/interfaces';
import type { StreamEvent } from '../react-engine/interfaces';
import type { ExecutionContext } from '../react-engine/interfaces';
import type { ChatRequestDTO, ChatResponseDTO } from './chat.dto';
import { ChatMediaService } from './chat-media.service';

@Injectable()
export class ChatConversationService {
  private readonly logger = new Logger(ChatConversationService.name);

  constructor(
    private readonly modelService: ModelService,
    private readonly sessionService: SessionService,
    private readonly chatMediaService: ChatMediaService,
  ) {}

  async streamChat(
    body: ChatRequestDTO,
    emit: (event: StreamEvent) => void,
  ): Promise<void> {
    const modelId = this.resolvePreferredChatModelId(body);
    const sessionId = body.sessionId || 'default';
    const thinkingEnabled = this.isThinkingEnabled(body);
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

    const messageContent = await this.chatMediaService.buildMessageContent(body.message, body.files);
    const systemMessage = this.buildChatSystemMessage(
      thinkingEnabled,
      Boolean(body.files && body.files.length > 0),
    );
    const messages = await this.buildConversationMessages(sessionId, systemMessage, messageContent);

    const userMessageForHistory = this.normalizeContentToText(messageContent);
    let fullContent = '';
    const response = await this.modelService.callModelStreamWithMessages(modelId, messages, (chunk: string) => {
      fullContent += chunk;
      emit({
        type: StreamEventType.OBSERVATION,
        content: this.getVisibleChatContent(fullContent, thinkingEnabled),
        data: {
          mode: 'chat',
          thinking: thinkingEnabled,
        },
      });
    });

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
        usage: response.usage,
        rateLimit: response.rateLimit,
      },
    });

    await this.persistConversation(sessionId, userMessageForHistory, historyAssistantContent);
  }

  async chat(body: ChatRequestDTO): Promise<ChatResponseDTO> {
    const modelId = this.resolvePreferredChatModelId(body);
    const sessionId = body.sessionId || 'default';
    const thinkingEnabled = this.isThinkingEnabled(body);
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
      userContent,
    );
    const response = await client.chatCompletion(messages);
    const visibleContent = this.getVisibleChatContent(response.content, thinkingEnabled);
    const historyAssistantContent = this.modelService.stripThinkingTags(response.content);

    await this.persistConversation(
      sessionId,
      this.normalizeContentToText(userContent),
      historyAssistantContent,
    );

    return {
      response: visibleContent,
      events: [{
        type: StreamEventType.RESULT,
        content: visibleContent,
        data: {
          sessionId,
          mode: 'chat',
          thinking: thinkingEnabled,
          usage: response.usage,
          rateLimit: response.rateLimit,
        },
      }],
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

  private async buildConversationMessages(
    sessionId: string,
    systemMessage: string,
    userContent: string | ContentBlock[],
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

  private async persistConversation(
    sessionId: string,
    userContent: string,
    assistantContent: string,
  ): Promise<void> {
    await this.sessionService.appendChatMessages(sessionId, [
      {
        role: 'user',
        content: userContent,
        timestamp: new Date().toISOString(),
      },
      {
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString(),
      },
    ]);
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

  private isThinkingEnabled(body: ChatRequestDTO): boolean {
    return body.config?.thinking !== false;
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
