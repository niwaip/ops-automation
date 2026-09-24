import {
BadRequestException,
Body,
Controller,
Delete,
Get,
Logger,
Param,
Post,
Put,
Query,
Req,
Res,
UnauthorizedException,
UploadedFile,
UseGuards,
UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes,ApiOperation,ApiResponse,ApiTags } from '@nestjs/swagger';
import type { Request,Response } from 'express';
import * as path from 'path';
import { AiAuthGuard,Public,verifyInternalSecret } from '../../common/guards/ai-auth.guard';
import { ChatRateLimit,ChatRateLimiterGuard } from '../../common/guards/chat-rate-limiter.guard';
import { getOrCreateTraceId } from '../../common/trace.util';
import type { StreamEvent } from '../react-engine/interfaces';
import { StreamEventType } from '../react-engine/interfaces';
import { SetAssistantFeedbackDto } from './assistant-feedback.dto';
import { ChatConversationService } from './chat-conversation.service';
import { ChatFeedbackService } from './chat-feedback.service';
import { ChatMediaService } from './chat-media.service';
import { ChatOrchestratorService } from './chat-orchestrator.service';
import { parseChatSlashCommand } from './chat-slash-command.util';
import type {
ChatAudioTranscriptionResponseDTO,
ChatHistoryResponseDTO,
ChatRequestDTO,
ChatResponseDTO,
ChatSessionsResponseDTO,
ChatUploadFileResponseDTO,
} from './chat.dto';
import { UserSandboxDispatcherService } from './user-sandbox-dispatcher.service';
import { WorkspaceArtifactService } from './workspace-artifact.service';

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
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatConversationService: ChatConversationService,
    private readonly chatMediaService: ChatMediaService,
    private readonly chatOrchestratorService: ChatOrchestratorService,
    private readonly chatFeedbackService: ChatFeedbackService,
    private readonly userSandboxDispatcherService: UserSandboxDispatcherService,
    private readonly workspaceArtifactService: WorkspaceArtifactService
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

  private resolveUserIdFromRequest(
    req: Request,
    identityUserId?: string
  ): string | undefined {
    if (identityUserId) return identityUserId;
    const supplied = req.headers['x-internal-auth'];
    const userId = req.headers['x-user-id'];
    if (
      typeof supplied === 'string' &&
      verifyInternalSecret(supplied) &&
      typeof userId === 'string' &&
      userId.trim()
    ) {
      return userId.trim();
    }
    return undefined;
  }

  @Get('chat/sessions')
  @ApiOperation({ summary: 'List chat sessions' })
  @ApiResponse({ status: 200, description: 'Chat sessions loaded successfully' })
  async listSessions(@Req() req: Request): Promise<ChatSessionsResponseDTO> {
    const identity = await this.chatOrchestratorService.resolveAuthenticatedUser(
      req.headers.authorization
    );
    const userId = this.resolveUserIdFromRequest(req, identity.userId);
    if (!userId) throw new UnauthorizedException('Login required');
    const sessions = await this.chatConversationService.listSessions(userId);
    return { sessions };
  }

  @Delete('chat/sessions')
  @ApiOperation({ summary: 'Delete all chat sessions for the current user' })
  @ApiResponse({ status: 200, description: 'All chat sessions deleted successfully' })
  async clearAllSessions(
    @Req() req: Request
  ): Promise<{ success: boolean; count: number }> {
    const identity = await this.chatOrchestratorService.resolveAuthenticatedUser(
      req.headers.authorization
    );
    const userId = this.resolveUserIdFromRequest(req, identity.userId);
    if (!userId) throw new UnauthorizedException('Login required');
    const count = await this.chatConversationService.clearAllSessions(userId);
    return { success: true, count };
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
    const userId = this.resolveUserIdFromRequest(req, identity.userId);
    if (!userId) throw new UnauthorizedException('Login required');
    await this.chatConversationService.deleteSession(sessionId, userId);
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
    const userId = this.resolveUserIdFromRequest(req, identity.userId);
    if (!userId) throw new UnauthorizedException('Login required');
    const messages = await this.chatConversationService.getChatHistory(sessionId, userId);
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

  @Public()
  @Post('chat/stream')
  @UseGuards(ChatRateLimiterGuard)
  @ChatRateLimit(60, 60000, 'Chat stream limit exceeded. Please wait a moment.')
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

    const resolvedUser = await this.chatOrchestratorService.resolveAuthenticatedUser(
      req.headers.authorization
    );
    const mode: 'chat' | 'task' = parsed.mode;
    const userCtx = {
      userId: resolvedUser.userId,
      organizationId: resolvedUser.organizationId,
      role: resolvedUser.userRoles?.includes('admin') ? 'admin' : undefined,
      mode,
    };

    const resolvedFiles = await this.chatMediaService.resolveUploadedFiles(body.files, userCtx);
    body = {
      ...body,
      message: parsed.message,
      files: resolvedFiles,
      config: {
        ...body.config,
        mode,
      },
    };

    const abortController = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    try {
      if (mode === 'chat') {
        const resolvedUser = await this.chatOrchestratorService.resolveAuthenticatedUser(
          req.headers.authorization
        );
        const userId = resolvedUser.userId || 'admin';

        const shouldBypassSandbox =
          body.sessionId?.startsWith('office-') ||
          (body.config as any)?.source === 'office-addin' ||
          (body.config as any)?.bypassSandbox === true;

        if (!shouldBypassSandbox) {
          this.logger.log(
            `Dispatching personal chat request to unified sandbox agent for user [${userId}]`
          );
          // 个人模式：统一由个人安全沙箱 (DeepSeek Harness) 执行
          // 由模型自主感知上下文并自主调用工具（外部检索/代码运行/文件分析等），无工具需求则单轮快速返回
          const handledBySandbox = await this.userSandboxDispatcherService.dispatchPersonalSandbox(
            body,
            (event) => {
              if (!abortController.signal.aborted) {
                emit(event as unknown as SseEventPayload);
              }
            },
            userId,
            abortController.signal
          );

          if (abortController.signal.aborted) {
            res.end();
            return;
          }

          if (handledBySandbox) {
            if (!abortController.signal.aborted) {
              emit({
                type: 'done',
                content: 'Stream completed',
              });
            }
            res.end();
            return;
          }
        } else {
          this.logger.log(
            `Sandbox bypassed by configuration for user [${userId}], falling back to direct streamChat`
          );
        }

        // 沙箱未就绪、出现异常或为内部插件/服务分析调用时，直接进行模型流式交互
        if (!shouldBypassSandbox && !abortController.signal.aborted) {
          emit({
            type: 'observation',
            content: 'ℹ️ 个人专属安全沙箱当前连接异常或离线，已为您无缝切换至标准问答模式（注：标准对话模式暂不支持文件落盘与全屏交互卡片）。\n\n',
          });
        }

        await this.chatConversationService.streamChat(
          body,
          (event) => {
            if (!abortController.signal.aborted) {
              emit(event as unknown as SseEventPayload);
            }
          },
          userCtx
        );

        if (!abortController.signal.aborted) {
          emit({
            type: 'done',
            content: 'Stream completed',
          });
        }
        res.end();
        return;
      }

      const history = await this.chatConversationService.loadTaskHistory(
        body.sessionId || 'default'
      );
      const taskBody: ChatRequestDTO = {
        ...body,
        files: body.files,
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
          clientAssistantMessageId: body.clientAssistantMessageId,
          files: body.files,
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

  @Public()
  @Post('chat/stop')
  @ApiOperation({ summary: '显式停止正在执行的个人沙箱与会话任务' })
  async stopChat(
    @Body() body: { sessionId?: string },
    @Req() req: Request
  ): Promise<{ success: boolean; message: string }> {
    const resolvedUser = await this.chatOrchestratorService.resolveAuthenticatedUser(
      req.headers.authorization
    );
    const userId = resolvedUser.userId || 'admin';
    await this.userSandboxDispatcherService.stopPersonalSandbox(userId);
    return { success: true, message: 'Chat execution stopped successfully' };
  }

  @Public()
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

    const resolvedUser = await this.chatOrchestratorService.resolveAuthenticatedUser(
      req.headers.authorization
    );
    const userCtx = {
      userId: resolvedUser.userId,
      organizationId: resolvedUser.organizationId,
      role: resolvedUser.userRoles?.includes('admin') ? 'admin' : undefined,
      mode,
    };

    const resolvedFiles = await this.chatMediaService.resolveUploadedFiles(body.files, userCtx);
    body = {
      ...body,
      files: resolvedFiles,
    };

    if (mode === 'chat') {
      const chatResponse = await this.chatConversationService.chat(body, userCtx);
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
      files: resolvedFiles,
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
        clientAssistantMessageId: body.clientAssistantMessageId,
        files: body.files,
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
    const supplied = req.headers['x-internal-auth'];
    const userId = req.headers['x-user-id'];
    if (!verifyInternalSecret(typeof supplied === 'string' ? supplied : undefined) || typeof userId !== 'string' || !userId.trim()) {
      throw new UnauthorizedException('Invalid internal identity');
    }
    const parsed = parseChatSlashCommand(body.message, body.config?.mode || 'chat');
    if ((body.config as any)?.systemReply) {
      const reply = String((body.config as any).systemReply);
      await this.chatConversationService.persistConversation({
        sessionId: body.sessionId || 'default',
        userContent: body.message || '[已上传附件]',
        assistantContent: reply,
        rawAssistantContent: reply,
        thinkingEnabled: false,
        ownerUserId: userId,
        clientMessageId: body.clientMessageId,
        files: body.files,
      });
      if (body.files && body.files.length > 0) {
        this.userSandboxDispatcherService.syncFilesToSandboxWorkspace(userId, body.files);
      }
      return {
        response: reply,
        events: [],
      };
    }
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
    const shouldBypassSandbox =
      body.sessionId?.startsWith('office-') ||
      (body.config as any)?.source === 'office-addin' ||
      (body.config as any)?.bypassSandbox === true;

    if (mode !== 'task') {
      if (!shouldBypassSandbox) {
        // 个人模式：统一由用户专属安全沙箱 (DeepSeek Harness) 执行
        const events: StreamEvent[] = [];
        let resultAnswer = '';
        let outboundFiles: any[] | undefined = undefined;
        const handledBySandbox = await this.userSandboxDispatcherService.dispatchPersonalSandbox(
          body,
          (event) => {
            if (event.type === StreamEventType.RESULT) {
              if (typeof event.content === 'string') {
                resultAnswer = event.content;
              }
              if ((event as any).data?.outboundFiles) {
                outboundFiles = (event as any).data.outboundFiles;
              }
            }
            events.push(event as unknown as StreamEvent);
          },
          userId
        );

        if (handledBySandbox && resultAnswer) {
          return {
            response: resultAnswer,
            events,
            outboundFiles,
          };
        }
      }

      return this.chatConversationService.chat(
        { ...body, userId },
        {
          userId,
          organizationId:
            typeof req.headers['x-organization-id'] === 'string'
              ? req.headers['x-organization-id']
              : undefined,
          role: 'internal_service',
        }
      );
    }

    const traceId = getOrCreateTraceId(body.traceId);
    const sessionId = body.sessionId || 'default';
    const taskBody: ChatRequestDTO = {
      ...body,
      userId,
      files: await this.chatMediaService.resolveUploadedFiles(body.files, {
        userId,
        organizationId:
          typeof req.headers['x-organization-id'] === 'string'
            ? req.headers['x-organization-id']
            : undefined,
        role: 'internal_service',
      }),
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
        clientAssistantMessageId: body.clientAssistantMessageId,
        files: body.files,
      });
      if (sessionPatch) events.push(sessionPatch);
    }
    return { response: finalResponse, events };
  }

  @Post('chat/upload')
  @UseGuards(AiAuthGuard, ChatRateLimiterGuard)
  @ChatRateLimit(30, 60000, 'Upload rate limit exceeded. Please wait a minute.')
  @ApiOperation({ summary: 'Upload file for chat' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'File uploaded successfully' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (req: any, file, callback) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExtensions = new Set([
          '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg',
          '.mp3', '.wav', '.webm', '.ogg', '.m4a',
          '.pdf', '.txt', '.md', '.csv', '.json',
          '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt',
        ]);
        if (!allowedExtensions.has(ext)) {
          req.fileValidationError = `Unsupported file type extension: ${ext || 'none'}`;
          return callback(null, false);
        }
        callback(null, true);
      },
    })
  )
  async uploadChatFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user?: any; fileValidationError?: string }
  ): Promise<ChatUploadFileResponseDTO> {
    if (req?.fileValidationError) {
      throw new BadRequestException(req.fileValidationError);
    }
    if (!file) {
      throw new BadRequestException('No file uploaded or file rejected by policy');
    }
    const userCtx = req.user
      ? {
          userId: req.user.id || req.user.userId,
          organizationId: req.user.organizationId,
          role: req.user.role,
        }
      : undefined;
    return this.chatMediaService.uploadChatFile(file, userCtx);
  }

  @Post('chat/audio/transcriptions')
  @UseGuards(AiAuthGuard)
  @ApiOperation({ summary: 'Transcribe audio file using the selected model' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Audio transcribed successfully' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (req: any, file, callback) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedAudioExts = new Set(['.mp3', '.wav', '.webm', '.ogg', '.m4a', '.flac', '.aac']);
        if (!allowedAudioExts.has(ext)) {
          req.fileValidationError = `Only audio files are permitted for transcription: ${ext || 'none'}`;
          return callback(null, false);
        }
        callback(null, true);
      },
    })
  )
  async transcribeAudio(
    @UploadedFile() file: Express.Multer.File,
    @Body('modelId') modelId: string,
    @Req() req: Request & { fileValidationError?: string }
  ): Promise<ChatAudioTranscriptionResponseDTO> {
    if (req?.fileValidationError) {
      throw new BadRequestException(req.fileValidationError);
    }
    if (!file) {
      throw new BadRequestException('No audio file uploaded or file rejected by policy');
    }
    return this.chatMediaService.transcribeAudio(file, modelId);
  }

  @Get('chat/workspace-files/:userId/:fileName')
  @ApiOperation({ summary: 'Serve workspace file generated in user sandbox (e.g. AI images)' })
  async serveWorkspaceFile(
    @Param('userId') userId: string,
    @Param('fileName') fileName: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    let requestingUser = (req as any).user;
    if (!requestingUser?.id) {
      const authHeader = req.headers.authorization;
      const queryToken = typeof req.query?.token === 'string' ? `Bearer ${req.query.token}` : undefined;
      const identity = await this.chatOrchestratorService.resolveAuthenticatedUser(
        authHeader || queryToken
      );
      const resolvedId = this.resolveUserIdFromRequest(req, identity.userId);
      if (resolvedId) {
        requestingUser = {
          id: resolvedId,
          role: identity.userRoles?.[0] || 'employee',
        };
      }
    }

    await this.workspaceArtifactService.serveWorkspaceFile({
      targetUserId: userId,
      fileName,
      requestingUser,
      res,
    });
  }
}
