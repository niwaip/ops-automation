import { Controller, Get, Post, Body, Param, Patch, Delete, HttpException, HttpStatus, Res, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ModelService } from './modules/model/model.service';
import { AgentService } from './modules/agent/agent.service';
import { RecognizerService } from './modules/recognizer/recognizer.service';
import { DeciderService } from './modules/decider/decider.service';
import { ReActEngineService } from './modules/react-engine/react-engine.service';
import {
  CreateModelDTO,
  AIModelDTO,
  CreateAgentDTO,
  AIAgentDTO,
  RecognizeParamsDTO,
  RecognizeParamsResponseDTO,
  DecideFailureDTO,
  DecideFailureResponseDTO,
} from './interfaces';
import { ChatRequestDTO, StreamEvent, ExecutionContext } from './modules/react-engine/interfaces';

// 内存文件存储（生产环境应使用持久化存储）
const fileStore = new Map<string, { fileName: string; mimeType: string; size: number; content: string }>();

@ApiTags('AI')
@Controller('ai')
export class AIController {
  constructor(
    private readonly modelService: ModelService,
    private readonly agentService: AgentService,
    private readonly recognizerService: RecognizerService,
    private readonly deciderService: DeciderService,
    private readonly reactEngineService: ReActEngineService,
  ) {}

  // Model endpoints
  @Get('models')
  @ApiOperation({ summary: 'List all registered AI models' })
  @ApiResponse({ status: 200, description: 'Returns list of models' })
  async listModels(): Promise<{ models: AIModelDTO[] }> {
    const models = await this.modelService.listModels();
    return { models };
  }

  @Get('models/presets')
  @ApiOperation({ summary: 'List all available preset model configurations' })
  @ApiResponse({ status: 200, description: 'Returns list of preset models with configuration status' })
  async listPresetModels(): Promise<{ presets: Array<{ name: string; provider: string; configured: boolean; default?: boolean; description?: string }> }> {
    const presets = this.modelService.checkPresetModelStatus();
    return { presets };
  }

  @Post('models')
  @ApiOperation({ summary: 'Register a new AI model' })
  @ApiResponse({ status: 201, description: 'Model registered successfully' })
  async createModel(@Body() body: CreateModelDTO): Promise<AIModelDTO> {
    return this.modelService.createModel(body);
  }

  @Get('models/:id')
  @ApiOperation({ summary: 'Get a specific AI model' })
  @ApiResponse({ status: 200, description: 'Returns model details' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async getModel(@Param('id') id: string): Promise<AIModelDTO> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    return model;
  }

  @Patch('models/:id/enable')
  @ApiOperation({ summary: 'Enable an AI model' })
  @ApiResponse({ status: 200, description: 'Model enabled successfully' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async enableModel(@Param('id') id: string): Promise<AIModelDTO> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    return this.modelService.setModelStatus(id, 'active') as Promise<AIModelDTO>;
  }

  @Patch('models/:id/disable')
  @ApiOperation({ summary: 'Disable an AI model' })
  @ApiResponse({ status: 200, description: 'Model disabled successfully' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async disableModel(@Param('id') id: string): Promise<AIModelDTO> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    return this.modelService.setModelStatus(id, 'inactive') as Promise<AIModelDTO>;
  }

  @Patch('models/:id')
  @ApiOperation({ summary: 'Update an AI model configuration' })
  @ApiResponse({ status: 200, description: 'Model updated successfully' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async updateModel(@Param('id') id: string, @Body() body: Partial<CreateModelDTO>): Promise<AIModelDTO> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    return this.modelService.updateModel(id, body) as Promise<AIModelDTO>;
  }

  @Delete('models/:id')
  @ApiOperation({ summary: 'Delete an AI model' })
  @ApiResponse({ status: 200, description: 'Model deleted successfully' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async deleteModel(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.modelService.deleteModel(id);
    if (!success) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    return { success };
  }

  @Post('models/:id/test')
  @ApiOperation({ summary: 'Test an AI model with a prompt' })
  @ApiResponse({ status: 200, description: 'Test result' })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async testModel(@Param('id') id: string, @Body() body: { prompt: string }): Promise<{ success: boolean; response?: string; error?: string }> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    try {
      const response = await this.modelService.callModel(id, body.prompt || 'Hello, this is a test.');
      return { success: true, response };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  @Post('models/:id/stream')
  @ApiOperation({ summary: 'Test an AI model with streaming SSE response' })
  async testModelStream(
    @Param('id') id: string,
    @Body() body: { prompt: string },
    @Res() res: Response,
  ): Promise<void> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      res.status(404).json({ error: 'Model not found' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      await this.modelService.callModelStream(id, body.prompt || 'Hello, this is a test.', (chunk: string) => {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      });
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
    }
  }

  @Post('models/test-config')
  @ApiOperation({ summary: 'Test a model configuration before creating' })
  @ApiResponse({ status: 200, description: 'Test result' })
  async testConfig(@Body() body: { endpoint: string; apiKey: string; modelName: string }): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
      // Create a temporary client to test the configuration
      const { OpenAICompatibleClient } = await import('./client/openai-compatible.js');
      const client = new OpenAICompatibleClient({
        baseURL: body.endpoint,
        apiKey: body.apiKey,
        model: body.modelName,
      });
      const messages = [{ role: 'user' as const, content: 'Hello, this is a test message.' }];
      const response = await client.chatCompletion(messages);
      return { success: true, response };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  // Agent endpoints
  @Post('agents')
  @ApiOperation({ summary: 'Create a new AI agent instance' })
  @ApiResponse({ status: 201, description: 'Agent created successfully' })
  @ApiResponse({ status: 400, description: 'Model is inactive' })
  async createAgent(@Body() body: CreateAgentDTO): Promise<AIAgentDTO> {
    const model = await this.modelService.getModel(body.model_id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    if (model.status !== 'active') {
      throw new HttpException('Model is inactive', HttpStatus.BAD_REQUEST);
    }
    return this.agentService.createAgent(body);
  }

  @Get('agents/:id')
  @ApiOperation({ summary: 'Get AI agent status' })
  @ApiResponse({ status: 200, description: 'Returns agent status' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  async getAgent(@Param('id') id: string): Promise<AIAgentDTO> {
    const agent = await this.agentService.getAgent(id);
    if (!agent) {
      throw new HttpException('Agent not found', HttpStatus.NOT_FOUND);
    }
    return agent;
  }

  // Parameter recognition endpoint
  @Post('recognize-params')
  @ApiOperation({ summary: 'Recognize parameters from user input' })
  @ApiResponse({ status: 200, description: 'Returns recognized parameters' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async recognizeParams(@Body() body: RecognizeParamsDTO): Promise<RecognizeParamsResponseDTO> {
    return this.recognizerService.recognizeParams(body);
  }

  // Failure decision endpoint
  @Post('decide-failure')
  @ApiOperation({ summary: 'Decide failure handling strategy' })
  @ApiResponse({ status: 200, description: 'Returns failure decision' })
  async decideFailure(@Body() body: DecideFailureDTO): Promise<DecideFailureResponseDTO> {
    return this.deciderService.decideFailure(body);
  }

  // Chat stream endpoint - ReAct engine or simple chat
  @Post('chat/stream')
  @ApiOperation({ summary: 'AI chat with ReAct engine or simple mode (SSE stream)' })
  async chatStream(
    @Body() body: ChatRequestDTO,
    @Res() res: Response,
  ): Promise<void> {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const mode = body.config?.mode || 'task';  // 默认task模式

    try {
      // 普通聊天模式：直接调用模型
      if (mode === 'chat') {
        const modelId = body.modelId || 'default';
        const client = this.modelService.getClient(modelId);

        if (!client) {
          res.write(`data: ${JSON.stringify({ type: 'error', content: `模型 ${modelId} 未初始化` })}\n\n`);
          res.end();
          return;
        }

        // 发送thought事件
        res.write(`data: ${JSON.stringify({ type: 'thought', content: '正在思考...' })}\n\n`);

        // 构建消息内容，包含文件内容
        let messageContent = body.message;

        // 如果有文件，从存储中获取内容
        if (body.files && body.files.length > 0) {
          const fileContents: string[] = [];
          for (const file of body.files) {
            // 从存储获取文件内容
            const storedFile = fileStore.get(file.fileId);
            if (storedFile && storedFile.content) {
              try {
                // 解码base64内容
                const decodedContent = Buffer.from(storedFile.content, 'base64').toString('utf-8');
                fileContents.push(`【文件: ${storedFile.fileName}】\n${decodedContent}`);
              } catch (e) {
                // 如果解码失败，可能是二进制文件
                fileContents.push(`【文件: ${storedFile.fileName} (类型: ${storedFile.mimeType}, 大小: ${storedFile.size}字节)】\n(二进制文件，无法直接显示内容)`);
              }
            } else {
              fileContents.push(`【文件: ${file.fileName} (类型: ${file.mimeType}, 大小: ${file.size}字节)】\n(文件内容未找到，可能已过期)`);
            }
          }
          if (fileContents.length > 0) {
            messageContent = `${messageContent}\n\n以下是用户上传的文件内容：\n${fileContents.join('\n\n')}`;
          }
        }

        // 流式调用模型
        let fullContent = '';
        const messages = [
          { role: 'system', content: '你是一个智能助手，请用中文友好地回答用户的问题。如果用户上传了文件，请分析文件内容并给出相关回答。' },
          { role: 'user', content: messageContent },
        ];

        await this.modelService.callModelStream(modelId, messageContent, (chunk: string) => {
          fullContent += chunk;
          // 实时发送内容块
          res.write(`data: ${JSON.stringify({ type: 'observation', content: fullContent })}\n\n`);
        });

        // 发送最终结果
        res.write(`data: ${JSON.stringify({ type: 'result', content: fullContent || '处理完成' })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', content: 'Stream completed' })}\n\n`);
        res.end();
      } else {
        // Task模式：使用ReAct引擎
        const context: ExecutionContext = {
          sessionId: body.sessionId || 'default',
          userId: body.userId || 'anonymous',
          history: [],
          uploadedFiles: body.files || [],
        };

        for await (const event of this.reactEngineService.execute(body, context)) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ type: 'done', content: 'Stream completed' })}\n\n`);
        res.end();
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      res.write(`data: ${JSON.stringify({ type: 'error', content: errorMsg })}\n\n`);
      res.end();
    }
  }

  // Simple chat endpoint (non-streaming)
  @Post('chat')
  @ApiOperation({ summary: 'Simple AI chat (non-streaming)' })
  async chat(@Body() body: ChatRequestDTO): Promise<{ response: string; events: StreamEvent[] }> {
    const context: ExecutionContext = {
      sessionId: body.sessionId || 'default',
      userId: body.userId || 'anonymous',
      history: [],
      uploadedFiles: body.files || [],
    };

    const events: StreamEvent[] = [];
    let finalResponse = '';

    for await (const event of this.reactEngineService.execute(body, context)) {
      events.push(event);
      if (event.type === 'result' || event.type === 'error') {
        finalResponse = event.content;
      }
    }

    return { response: finalResponse, events };
  }

  // File upload endpoint for chat
  @Post('chat/upload')
  @ApiOperation({ summary: 'Upload file for chat' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'File uploaded successfully' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadChatFile(@UploadedFile() file: Express.Multer.File): Promise<{ fileId: string; fileName: string; mimeType: string; size: number }> {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    // Generate a unique file ID
    const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 保存文件内容到内存存储（base64编码）
    const content = file.buffer.toString('base64');
    fileStore.set(fileId, {
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      content,
    });

    // 清理旧文件（保留最近100个）
    if (fileStore.size > 100) {
      const keys = Array.from(fileStore.keys());
      keys.slice(0, keys.length - 100).forEach(key => fileStore.delete(key));
    }

    return {
      fileId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}