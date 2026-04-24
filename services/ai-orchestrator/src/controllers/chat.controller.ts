import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { ModelService } from '../modules/model/model.service';
import { ReActEngineService } from '../modules/react-engine/react-engine.service';
import { getOrCreateTraceId } from '../common/trace.util';
import { ContentBlock, ChatMessage as MultimodalChatMessage } from '../interfaces';
import { ChatRequestDTO, ExecutionContext, StreamEvent, StreamEventType } from '../modules/react-engine/interfaces';
import { SessionService } from '../modules/redis/session.service';

const fileStore = new Map<string, { fileName: string; mimeType: string; size: number; content: string }>();

@ApiTags('AI-Chat')
@Controller('ai')
export class ChatController {
  constructor(
    private readonly modelService: ModelService,
    private readonly reactEngineService: ReActEngineService,
    private readonly sessionService: SessionService,
  ) {}

  private writeSse(res: Response, payload: Record<string, unknown>): void {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  private normalizeContentToText(content: string | ContentBlock[]): string {
    if (typeof content === 'string') return content;
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

  @Post('chat/stream')
  @ApiOperation({ summary: 'AI chat with ReAct engine or simple mode (SSE stream)' })
  async chatStream(
    @Body() body: ChatRequestDTO,
    @Req() req: Request & { traceId?: string },
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const traceId = getOrCreateTraceId(body.traceId || req.traceId);
    const mode: 'chat' | 'task' = body.config?.mode || 'chat';

    try {
      if (mode === 'chat') {
        const modelId = body.modelId || 'default';
        const sessionId = body.sessionId || 'default';
        const client = this.modelService.getClient(modelId);

        if (!client) {
          this.writeSse(res, {
            type: StreamEventType.ERROR,
            content: `模型 ${modelId} 未初始化`,
            traceId,
          });
          res.end();
          return;
        }

        this.writeSse(res, {
          type: StreamEventType.THOUGHT,
          content: '正在思考...',
          traceId,
        });

        let messageContent: string | ContentBlock[];
        const systemMessage = '你是一个智能助手，请用中文友好地回答用户的问题。如果用户上传了文件，请分析文件内容并给出相关回答。';

        if (body.files && body.files.length > 0) {
          const contentBlocks: ContentBlock[] = [{ type: 'text', text: body.message }];

          for (const file of body.files) {
            const storedFile = fileStore.get(file.fileId);
            if (!storedFile?.content) {
              contentBlocks.push({
                type: 'text',
                text: `\n【文件: ${file.fileName}】\n(文件内容未找到，可能已过期)`,
              });
              continue;
            }

            const isImage = storedFile.mimeType.startsWith('image/');
            if (isImage) {
              contentBlocks.push({
                type: 'image_url',
                image_url: {
                  url: `data:${storedFile.mimeType};base64,${storedFile.content}`,
                  detail: 'auto',
                },
              });
              continue;
            }

            try {
              const decodedContent = Buffer.from(storedFile.content, 'base64').toString('utf-8');
              contentBlocks.push({
                type: 'text',
                text: `\n【文件: ${storedFile.fileName}】\n${decodedContent}`,
              });
            } catch {
              contentBlocks.push({
                type: 'text',
                text: `\n【文件: ${storedFile.fileName} (${storedFile.mimeType}, ${storedFile.size}字节)】\n(二进制文件，无法直接显示内容)`,
              });
            }
          }

          messageContent = contentBlocks;
        } else {
          messageContent = body.message;
        }

        const messages: MultimodalChatMessage[] = [
          { role: 'system', content: systemMessage },
        ];
        const chatSession = await this.sessionService.getChatSession(sessionId);
        const historyMessages: MultimodalChatMessage[] = (chatSession?.history || []).map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));
        messages.push(...historyMessages);
        messages.push({ role: 'user', content: messageContent });

        const userMessageForHistory = this.normalizeContentToText(messageContent);

        let fullContent = '';
        await this.modelService.callModelStreamWithMessages(modelId, messages, (chunk: string) => {
          fullContent += chunk;
          this.writeSse(res, {
            type: StreamEventType.OBSERVATION,
            content: fullContent,
            traceId,
          });
        });

        this.writeSse(res, {
          type: StreamEventType.RESULT,
          content: fullContent || '处理完成',
          traceId,
        });

        await this.sessionService.appendChatMessages(sessionId, [
          {
            role: 'user',
            content: userMessageForHistory,
            timestamp: new Date().toISOString(),
          },
          {
            role: 'assistant',
            content: fullContent || '处理完成',
            timestamp: new Date().toISOString(),
          },
        ]);

        this.writeSse(res, {
          type: 'done',
          content: 'Stream completed',
          traceId,
        });
        res.end();
        return;
      }

      const context: ExecutionContext = {
        sessionId: body.sessionId || 'default',
        userId: body.userId || 'anonymous',
        userRoles: body.userRoles,
        traceId,
        history: [],
        uploadedFiles: body.files || [],
      };

      for await (const event of this.reactEngineService.execute({ ...body, traceId }, context)) {
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
    @Req() req: Request & { traceId?: string },
  ): Promise<{ response: string; events: StreamEvent[] }> {
    const traceId = getOrCreateTraceId(body.traceId || req.traceId);
    const mode: 'chat' | 'task' = body.config?.mode || 'task';

    if (mode === 'chat') {
      const modelId = body.modelId || 'default';
      const sessionId = body.sessionId || 'default';
      const client = this.modelService.getClient(modelId);
      if (!client) {
        return {
          response: `模型 ${modelId} 未初始化`,
          events: [{ type: StreamEventType.ERROR, content: `模型 ${modelId} 未初始化` }],
        };
      }

      const systemMessage = '你是一个智能助手，请用中文友好地回答用户的问题。';
      const chatSession = await this.sessionService.getChatSession(sessionId);
      const historyMessages: MultimodalChatMessage[] = (chatSession?.history || []).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
      const userContent = body.message;
      const messages: MultimodalChatMessage[] = [
        { role: 'system', content: systemMessage },
        ...historyMessages,
        { role: 'user', content: userContent },
      ];
      const response = await client.chatCompletion(messages);

      await this.sessionService.appendChatMessages(sessionId, [
        {
          role: 'user',
          content: this.normalizeContentToText(userContent),
          timestamp: new Date().toISOString(),
        },
        {
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString(),
        },
      ]);

      return {
        response,
        events: [{
          type: StreamEventType.RESULT,
          content: response,
          data: { traceId, sessionId, mode: 'chat' },
        }],
      };
    }

    const context: ExecutionContext = {
      sessionId: body.sessionId || 'default',
      userId: body.userId || 'anonymous',
      userRoles: body.userRoles,
      traceId,
      history: [],
      uploadedFiles: body.files || [],
    };

    const events: StreamEvent[] = [];
    let finalResponse = '';

    for await (const event of this.reactEngineService.execute({ ...body, traceId }, context)) {
      const eventWithTrace = {
        ...event,
        data: {
          ...(event.data || {}),
          traceId,
        },
      };
      events.push(eventWithTrace);
      if (
        event.type === StreamEventType.RESULT
        || event.type === StreamEventType.WAITING_INPUT
        || event.type === StreamEventType.ERROR
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
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ fileId: string; fileName: string; mimeType: string; size: number }> {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    fileStore.set(fileId, {
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      content: file.buffer.toString('base64'),
    });

    if (fileStore.size > 100) {
      const keys = Array.from(fileStore.keys());
      keys.slice(0, keys.length - 100).forEach((key) => fileStore.delete(key));
    }

    return {
      fileId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
