import { Body, Controller, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { getOrCreateTraceId } from '../../common/trace.util';
import { StreamEventType } from '../react-engine/interfaces';
import type { StreamEvent } from '../react-engine/interfaces';
import type {
  ChatAudioTranscriptionResponseDTO,
  ChatRequestDTO,
  ChatResponseDTO,
  ChatUploadFileResponseDTO,
} from './chat.dto';
import { ChatConversationService } from './chat-conversation.service';
import { ChatMediaService } from './chat-media.service';
import { ChatOrchestratorService } from './chat-orchestrator.service';

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
    const mode: 'chat' | 'task' = body.config?.mode || 'chat';

    try {
      if (mode === 'chat') {
        await this.chatConversationService.streamChat(body, (event) => {
          this.writeSse(res, {
            ...event,
            traceId,
          });
        });

        this.writeSse(res, {
          type: 'done',
          content: 'Stream completed',
          traceId,
        });
        res.end();
        return;
      }

      const history = await this.chatConversationService.loadTaskHistory(
        body.sessionId || 'default'
      );
      const taskModeContext = await this.chatOrchestratorService.buildTaskModeContext(
        body,
        req.headers.authorization,
        traceId,
        history
      );

      if (!taskModeContext.context) {
        this.writeSse(res, {
          ...taskModeContext.authError,
          traceId,
          data: {
            ...(taskModeContext.authError?.data || {}),
            traceId,
          },
        });
        res.end();
        return;
      }

      for await (const event of this.chatOrchestratorService.handleTaskMode(
        body,
        taskModeContext.context,
        req.headers.authorization
      )) {
        this.writeSse(res, { ...event, traceId });
      }
      this.writeSse(res, { type: 'done', content: 'Stream completed', traceId });
      res.end();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.writeSse(res, {
        type: StreamEventType.ERROR,
        content: errorMsg,
        traceId,
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
    const mode: 'chat' | 'task' = body.config?.mode || 'task';

    if (mode === 'chat') {
      const chatResponse = await this.chatConversationService.chat(body);
      return {
        ...chatResponse,
        events: chatResponse.events.map((event) => ({
          ...event,
          data: {
            ...(event.data || {}),
            traceId,
          },
        })),
      };
    }

    const taskModeContext = await this.chatOrchestratorService.buildTaskModeContext(
      body,
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
          {
            ...authError,
            data: {
              ...(authError.data || {}),
              traceId,
            },
          },
        ],
      };
    }

    const events: StreamEvent[] = [];
    let finalResponse = '';

    for await (const event of this.chatOrchestratorService.handleTaskMode(
      body,
      taskModeContext.context,
      req.headers.authorization
    )) {
      const eventWithTrace = {
        ...event,
        data: {
          ...(event.data || {}),
          traceId,
        },
      };
      events.push(eventWithTrace);
      if (
        event.type === StreamEventType.RESULT ||
        event.type === StreamEventType.WAITING_INPUT ||
        event.type === StreamEventType.ERROR
      ) {
        finalResponse = event.content;
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
