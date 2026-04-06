import { Controller, Get, Post, Body, Param, Patch, Delete, HttpException, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { ModelService } from './modules/model/model.service';
import { AgentService } from './modules/agent/agent.service';
import { RecognizerService } from './modules/recognizer/recognizer.service';
import { DeciderService } from './modules/decider/decider.service';
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

@ApiTags('AI')
@Controller('ai')
export class AIController {
  constructor(
    private readonly modelService: ModelService,
    private readonly agentService: AgentService,
    private readonly recognizerService: RecognizerService,
    private readonly deciderService: DeciderService,
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
    return this.modelService.setModelStatus(id, 'active');
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
    return this.modelService.setModelStatus(id, 'inactive');
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
    return this.modelService.updateModel(id, body);
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
      const { OpenAICompatibleClient } = await import('./client/openai-compatible');
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
}