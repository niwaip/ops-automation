import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
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
import { ChatConversationService } from './chat-conversation.service';
import { ChatMediaService } from './chat-media.service';
import { ChatOrchestratorService } from './chat-orchestrator.service';

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
    private readonly chatOrchestratorService: ChatOrchestratorService
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
  async listSessions(): Promise<ChatSessionsResponseDTO> {
    const sessions = await this.chatConversationService.listSessions();
    return { sessions };
  }

  @Get('chat/history/:sessionId')
  @ApiOperation({ summary: 'Get chat history by session ID' })
  @ApiResponse({ status: 200, description: 'Chat history loaded successfully' })
  async getChatHistory(@Param('sessionId') sessionId: string): Promise<ChatHistoryResponseDTO> {
    const messages = await this.chatConversationService.getChatHistory(sessionId);
    return { messages };
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
    const mode: 'chat' | 'task' = body.config?.mode || 'chat';
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

    try {
      if (mode === 'chat') {
        await this.chatConversationService.streamChat(body, (event) => {
          emit(event as unknown as SseEventPayload);
        });

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
    const mode: 'chat' | 'task' = body.config?.mode || 'task';

    if (mode === 'chat') {
      const chatResponse = await this.chatConversationService.chat(body);
      return {
        ...chatResponse,
        events: chatResponse.events.map((event, index) =>
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
