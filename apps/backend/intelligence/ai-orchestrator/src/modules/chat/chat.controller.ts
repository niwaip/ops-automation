import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { getOrCreateTraceId } from '../../common/trace.util';
import { StreamEventType } from '../react-engine/interfaces';
import type { StreamEvent } from '../react-engine/interfaces';
import type {
  ChatHistoryResponseDTO,
  ChatAudioTranscriptionResponseDTO,
  ChatRequestDTO,
  ChatResponseDTO,
  ChatSessionsResponseDTO,
  ChatUploadFileResponseDTO,
} from './chat.dto';
import { ChatFeedbackService } from './chat-feedback.service';
import { SetAssistantFeedbackDto } from './assistant-feedback.dto';
import { ChatConversationService } from './chat-conversation.service';
import { ChatMediaService } from './chat-media.service';
import { ChatOrchestratorService } from './chat-orchestrator.service';
import { parseChatSlashCommand } from './chat-slash-command.util';

type SseEventPayload = {
  type: string;
  content: string;
  data?: unknown;
  sessionId?: string;
  [key: string]: unknown;
};

@ApiTags('AI-Chat')
@Controller('ai')
export class ChatController {
  constructor(
    private readonly chatConversationService: ChatConversationService,
    private readonly chatMediaService: ChatMediaService,
    private readonly chatOrchestratorService: ChatOrchestratorService,
    private readonly chatFeedbackService: ChatFeedbackService
  ) {}

  private writeSse(res: Response, payload: Record<string, unknown>): void {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  private enrichStreamEvent(
    event: SseEventPayload,
    options: {
      sessionId: string;
      traceId: string;
      seq: number;
    }
  ): SseEventPayload {
    const data =
      event.data && typeof event.data === 'object' && !Array.isArray(event.data)
        ? (event.data as Record<string, unknown>)
        : undefined;

    return {
      ...event,
      seq: options.seq,
      protocolVersion: '1',
      sessionId:
        typeof event.sessionId === 'string' && event.sessionId.trim()
          ? event.sessionId
          : options.sessionId,
      traceId: options.traceId,
      data: {
        ...(data || {}),
        traceId: options.traceId,
      },
    };
  }

  private isPersistableTaskEvent(event: StreamEvent | SseEventPayload): boolean {
    return (
      event.type === StreamEventType.RESULT ||
      event.type === StreamEventType.WAITING_INPUT ||
      event.type === StreamEventType.PENDING_APPROVAL ||
      event.type === StreamEventType.HUMAN_CONTROL ||
      event.type === StreamEventType.ERROR
    );
  }

  @Get('chat/sessions')
  @ApiOperation({ summary: 'List chat sessions' })
  @ApiResponse({ status: 200, description: 'Chat sessions loaded successfully' })
  async listSessions(@Req() req: Request): Promise<ChatSessionsResponseDTO> {
    const identity = await this.chatOrchestratorService.resolveAuthenticatedUser(
      req.headers.authorization
    );
    if (!identity.userId) throw new UnauthorizedException('Login required');
    const sessions = await this.chatConversationService.listSessions(identity.userId);
    return { sessions };
  }

  @Delete('chat/sessions/:sessionId')
  @ApiOperation({ summary: 'Delete chat session' })
  @ApiResponse({ status: 200, description: 'Chat session deleted successfully' })
  async deleteSession(
    @Param('sessionId') sessionId: string,
    @Req() req: Request
  ): Promise<{ success: boolean }> {
    const identity = await this.chatOrchestratorService.resolveAuthenticatedUser(
      req.headers.authorization
    );
    if (!identity.userId) throw new UnauthorizedException('Login required');
    await this.chatConversationService.deleteSession(sessionId, identity.userId);
    return { success: true };
  }

  @Get('chat/history/:sessionId')
  @ApiOperation({ summary: 'Get chat history by session ID' })
  @ApiResponse({ status: 200, description: 'Chat history loaded successfully' })
  async getChatHistory(
    @Param('sessionId') sessionId: string,
    @Req() req: Request
  ): Promise<ChatHistoryResponseDTO> {
    const identity = await this.chatOrchestratorService.resolveAuthenticatedUser(
      req.headers.authorization
    );
    if (!identity.userId) throw new UnauthorizedException('Login required');
    const messages = await this.chatConversationService.getChatHistory(sessionId, identity.userId);
    return { messages };
  }

  @Put('chat/sessions/:sessionId/messages/:messageId/feedback')
  @ApiOperation({ summary: 'Set feedback for an assistant answer' })
  async setFeedback(
    @Param('sessionId') sessionId: string,
    @Param('messageId') messageId: string,
    @Body() body: SetAssistantFeedbackDto,
    @Req() req: Request
  ) {
    return this.chatFeedbackService.set(sessionId, messageId, body, req.headers.authorization);
  }

  @Get('chat/sessions/:sessionId/messages/:messageId/feedback')
  @ApiOperation({ summary: 'Get feedback for an assistant answer' })
  async getFeedback(
    @Param('sessionId') sessionId: string,
    @Param('messageId') messageId: string,
    @Query('executionId') executionId: string | undefined,
    @Req() req: Request
  ) {
    return this.chatFeedbackService.get(
      sessionId,
      messageId,
      req.headers.authorization,
      executionId
    );
  }

  @Delete('chat/sessions/:sessionId/messages/:messageId/feedback')
  @ApiOperation({ summary: 'Clear feedback for an assistant answer' })
  async clearFeedback(
    @Param('sessionId') sessionId: string,
    @Param('messageId') messageId: string,
    @Query('executionId') executionId: string | undefined,
    @Req() req: Request
  ) {
    return this.chatFeedbackService.clear(
      sessionId,
      messageId,
      req.headers.authorization,
      executionId
    );
  }

  @Post('chat/stream')
  @ApiOperation({ summary: 'AI chat with ReAct engine or simple mode (SSE stream)' })
  async chatStream(
    @Body() body: ChatRequestDTO,
    @Req() req: Request & { traceId?: string },
    @Res() res: Response
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const traceId = getOrCreateTraceId(body.traceId || req.traceId);
    const sessionId = body.sessionId || 'default';
    const parsed = parseChatSlashCommand(body.message, body.config?.mode || 'chat');
    let seq = 0;
    const emit = (event: SseEventPayload) => {
      seq += 1;
      this.writeSse(
        res,
        this.enrichStreamEvent(event, {
          sessionId,
          traceId,
          seq,
        })
      );
    };

    if (parsed.isCommandOnly && parsed.systemReply) {
      emit({
        type: StreamEventType.OBSERVATION,
        content: parsed.systemReply,
      });
      emit({
        type: 'done',
        content: 'Stream completed',
      });
      res.end();
      return;
    }

    const mode: 'chat' | 'task' = parsed.mode;
    body = {
      ...body,
      message: parsed.message,
      config: {
        ...body.config,
        mode,
      },
    };

    try {
      if (mode === 'chat') {
        const resolvedUser = await this.chatOrchestratorService.resolveAuthenticatedUser(
          req.headers.authorization
        );
        await this.chatConversationService.streamChat(
          body,
          (event) => {
            emit(event as unknown as SseEventPayload);
          },
          resolvedUser.userId
        );

        emit({
          type: 'done',
          content: 'Stream completed',
        });
        res.end();
        return;
      }

      const history = await this.chatConversationService.loadTaskHistory(
        body.sessionId || 'default'
      );
      const taskBody: ChatRequestDTO = {
        ...body,
        files: this.chatMediaService.resolveUploadedFiles(body.files),
      };
      const taskModeContext = await this.chatOrchestratorService.buildTaskModeContext(
        taskBody,
        req.headers.authorization,
        traceId,
        history
      );

      if (!taskModeContext.context) {
        const authError: SseEventPayload = taskModeContext.authError
          ? (taskModeContext.authError as unknown as SseEventPayload)
          : {
              type: StreamEventType.ERROR,
              content: '任务模式需要登录后使用，请重新登录后重试。',
            };
        emit(authError);
        res.end();
        return;
      }

      let latestPersistableEvent: StreamEvent | null = null;
      for await (const event of this.chatOrchestratorService.handleTaskMode(
        taskBody,
        taskModeContext.context,
        req.headers.authorization
      )) {
        const streamEvent = event as unknown as StreamEvent;
        if (this.isPersistableTaskEvent(streamEvent)) {
          latestPersistableEvent = streamEvent;
        }
        emit(event as unknown as SseEventPayload);
      }

      if (latestPersistableEvent) {
        const sessionPatchEvent = await this.chatConversationService.persistTaskConversation({
          sessionId,
          userContent: body.message,
          terminalEvent: latestPersistableEvent,
          modelId: body.modelId,
          ownerUserId: taskModeContext.context.userId,
          clientMessageId: body.clientMessageId,
        });
        if (sessionPatchEvent) {
          emit(sessionPatchEvent as unknown as SseEventPayload);
        }
      }
      emit({ type: 'done', content: 'Stream completed' });
      res.end();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      emit({
        type: StreamEventType.ERROR,
        content: errorMsg,
      });
      res.end();
    }
  }

  @Post('chat')
  @ApiOperation({ summary: 'Simple AI chat (non-streaming)' })
  async chat(
    @Body() body: ChatRequestDTO,
    @Req() req: Request & { traceId?: string }
  ): Promise<ChatResponseDTO> {
    const traceId = getOrCreateTraceId(body.traceId || req.traceId);
    const sessionId = body.sessionId || 'default';
    const parsed = parseChatSlashCommand(body.message, body.config?.mode || 'task');

    if (parsed.isCommandOnly && parsed.systemReply) {
      return {
        response: parsed.systemReply,
        events: [
          this.enrichStreamEvent(
            {
              type: StreamEventType.OBSERVATION,
              content: parsed.systemReply,
            } as unknown as SseEventPayload,
            { sessionId, traceId, seq: 1 }
          ) as unknown as StreamEvent,
        ],
      };
    }

    const mode: 'chat' | 'task' = parsed.mode;
    body = {
      ...body,
      message: parsed.message,
      config: {
        ...body.config,
        mode,
      },
    };

    if (mode === 'chat') {
      const resolvedUser = await this.chatOrchestratorService.resolveAuthenticatedUser(
        req.headers.authorization
      );
      const chatResponse = await this.chatConversationService.chat(body, resolvedUser.userId);
      return {
        ...chatResponse,
        events: chatResponse.events.map(
          (event, index) =>
            this.enrichStreamEvent(event as unknown as SseEventPayload, {
              sessionId,
              traceId,
              seq: index + 1,
            }) as unknown as StreamEvent
        ),
      };
    }

    const taskBody: ChatRequestDTO = {
      ...body,
      files: this.chatMediaService.resolveUploadedFiles(body.files),
    };
    const taskModeContext = await this.chatOrchestratorService.buildTaskModeContext(
      taskBody,
      req.headers.authorization,
      traceId,
      []
    );

    if (!taskModeContext.context) {
      const authError = taskModeContext.authError || {
        type: StreamEventType.ERROR,
        content: '任务模式需要登录后使用，请重新登录后重试。',
        data: {
          errorCode: 'AUTH_LOGIN_REQUIRED',
          statusCode: 401,
        },
      };
      return {
        response: authError.content,
        events: [
          this.enrichStreamEvent(authError as unknown as SseEventPayload, {
            sessionId,
            traceId,
            seq: 1,
          }) as unknown as StreamEvent,
        ],
      };
    }

    const events: StreamEvent[] = [];
    let finalResponse = '';
    let latestPersistableEvent: StreamEvent | null = null;

    let seq = 0;
    for await (const event of this.chatOrchestratorService.handleTaskMode(
      taskBody,
      taskModeContext.context,
      req.headers.authorization
    )) {
      seq += 1;
      const eventWithTrace = this.enrichStreamEvent(event as unknown as SseEventPayload, {
        sessionId,
        traceId,
        seq,
      }) as unknown as StreamEvent;
      events.push(eventWithTrace);
      if (this.isPersistableTaskEvent(eventWithTrace)) {
        latestPersistableEvent = eventWithTrace;
        finalResponse = event.content;
      }
    }

    if (latestPersistableEvent) {
      const sessionPatchEvent = await this.chatConversationService.persistTaskConversation({
        sessionId,
        userContent: body.message,
        terminalEvent: latestPersistableEvent,
        modelId: body.modelId,
        ownerUserId: taskModeContext.context.userId,
        clientMessageId: body.clientMessageId,
      });
      if (sessionPatchEvent) {
        events.push(
          this.enrichStreamEvent(sessionPatchEvent as unknown as SseEventPayload, {
            sessionId,
            traceId,
            seq: events.length + 1,
          }) as unknown as StreamEvent
        );
      }
    }

    return { response: finalResponse, events };
  }

  @Post('internal/chat')
  @ApiOperation({ summary: 'Internal non-streaming chat for trusted channel gateways' })
  async internalChat(@Body() body: ChatRequestDTO, @Req() req: Request): Promise<ChatResponseDTO> {
    const expected = process.env.INTERNAL_API_SHARED_SECRET;
    const supplied = req.headers['x-internal-auth'];
    const userId = req.headers['x-user-id'];
    if (!expected || supplied !== expected || typeof userId !== 'string' || !userId.trim()) {
      throw new UnauthorizedException('Invalid internal identity');
    }
    const parsed = parseChatSlashCommand(body.message, body.config?.mode || 'chat');
    if (parsed.isCommandOnly && parsed.systemReply) {
      return {
        response: parsed.systemReply,
        events: [],
      };
    }
    const mode: 'chat' | 'task' = parsed.mode;
    body = {
      ...body,
      message: parsed.message,
      config: {
        ...body.config,
        mode,
      },
    };
    if (mode !== 'task') {
      return this.chatConversationService.chat({ ...body, userId }, userId);
    }

    const traceId = getOrCreateTraceId(body.traceId);
    const sessionId = body.sessionId || 'default';
    const taskBody: ChatRequestDTO = {
      ...body,
      userId,
      files: this.chatMediaService.resolveUploadedFiles(body.files),
    };
    const history = await this.chatConversationService.loadTaskHistory(sessionId);
    const taskModeContext = await this.chatOrchestratorService.buildTaskModeContext(
      taskBody,
      undefined,
      traceId,
      history,
      {
        userId,
        userRoles:
          typeof req.headers['x-user-roles'] === 'string'
            ? req.headers['x-user-roles']
                .split(',')
                .map((role) => role.trim())
                .filter(Boolean)
            : undefined,
        organizationId:
          typeof req.headers['x-organization-id'] === 'string'
            ? req.headers['x-organization-id']
            : undefined,
      }
    );
    if (!taskModeContext.context) throw new UnauthorizedException('Invalid internal identity');

    const events: StreamEvent[] = [];
    let finalResponse = '';
    let latestPersistableEvent: StreamEvent | null = null;
    for await (const event of this.chatOrchestratorService.handleTaskMode(
      taskBody,
      taskModeContext.context
    )) {
      const enriched = this.enrichStreamEvent(event as unknown as SseEventPayload, {
        sessionId,
        traceId,
        seq: events.length + 1,
      }) as unknown as StreamEvent;
      events.push(enriched);
      if (this.isPersistableTaskEvent(enriched)) {
        latestPersistableEvent = enriched;
        finalResponse = enriched.content;
      }
    }
    if (latestPersistableEvent) {
      const sessionPatch = await this.chatConversationService.persistTaskConversation({
        sessionId,
        userContent: body.message,
        terminalEvent: latestPersistableEvent,
        modelId: body.modelId,
        ownerUserId: userId,
        clientMessageId: body.clientMessageId,
      });
      if (sessionPatch) events.push(sessionPatch);
    }
    return { response: finalResponse, events };
  }

  @Post('chat/upload')
  @ApiOperation({ summary: 'Upload file for chat' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'File uploaded successfully' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadChatFile(
    @UploadedFile() file: Express.Multer.File
  ): Promise<ChatUploadFileResponseDTO> {
    return this.chatMediaService.uploadChatFile(file);
  }

  @Post('chat/audio/transcriptions')
  @ApiOperation({ summary: 'Transcribe audio file using the selected model' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Audio transcribed successfully' })
  @UseInterceptors(FileInterceptor('file'))
  async transcribeAudio(
    @UploadedFile() file: Express.Multer.File,
    @Body('modelId') modelId: string
  ): Promise<ChatAudioTranscriptionResponseDTO> {
    return this.chatMediaService.transcribeAudio(file, modelId);
  }
}
