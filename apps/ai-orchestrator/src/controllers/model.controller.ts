import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Res } from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModelService } from '../modules/model/model.service';
import { PromptDebugSettingsService } from '../modules/debug-settings/prompt-debug-settings.service';
import type { Response } from 'express';
import type {
  AIModelDTO,
  AIProviderConfigDTO,
  AIProviderModelListDTO,
  AIProviderSummaryDTO,
  CreateModelDTO,
  CreateProviderConfigDTO,
  LLMUsage,
  UpdateProviderConfigDTO,
} from '../interfaces';

@ApiTags('AI-Models')
@Controller('ai')
export class ModelController {
  constructor(
    private readonly modelService: ModelService,
    private readonly promptDebugSettingsService: PromptDebugSettingsService,
  ) {}

  @Get('models')
  @ApiOperation({ summary: 'List all registered AI models' })
  async listModels(): Promise<{ models: AIModelDTO[] }> {
    const models = await this.modelService.listModels();
    return { models };
  }

  @Get('models/admin')
  @ApiOperation({ summary: 'List all models for admin (including inactive)' })
  async listModelsForAdmin(): Promise<{ models: AIModelDTO[] }> {
    const models = await this.modelService.listModelsForAdmin();
    return { models };
  }

  @Get('models/providers')
  @ApiOperation({ summary: 'List provider-level summaries for model governance' })
  async listProviderSummaries(): Promise<{ providers: AIProviderSummaryDTO[] }> {
    const providers = this.modelService.listProviderSummaries();
    return { providers };
  }

  @Get('providers')
  @ApiOperation({ summary: 'List provider configs for governance' })
  async listProviderConfigs(): Promise<{ providers: AIProviderConfigDTO[] }> {
    const providers = await this.modelService.listProviderConfigs();
    return { providers };
  }

  @Post('providers')
  @ApiOperation({ summary: 'Create or register a provider config' })
  async createProviderConfig(@Body() body: CreateProviderConfigDTO): Promise<AIProviderConfigDTO> {
    return this.modelService.createProviderConfig(body);
  }

  @Get('providers/:id')
  @ApiOperation({ summary: 'Get a specific provider config' })
  async getProviderConfig(@Param('id') id: string): Promise<AIProviderConfigDTO> {
    const provider = await this.modelService.getProviderConfig(id);
    if (!provider) {
      throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);
    }
    return provider;
  }

  @Patch('providers/:id')
  @ApiOperation({ summary: 'Update a provider config' })
  async updateProviderConfig(
    @Param('id') id: string,
    @Body() body: UpdateProviderConfigDTO,
  ): Promise<AIProviderConfigDTO> {
    try {
      const provider = await this.modelService.updateProviderConfig(id, body);
      if (!provider) {
        throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);
      }
      return provider;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(errorMsg, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('providers/:id/health')
  @ApiOperation({ summary: 'Check health of a specific provider' })
  async checkProviderHealth(@Param('id') id: string): Promise<{ success: boolean; response?: string; error?: string }> {
    return this.modelService.checkProviderHealth(id);
  }

  @Post('model/call')
  @ApiOperation({ summary: 'Call AI model with a prompt (for skill matching)' })
  async callModel(@Body() body: {
    modelId: string;
    prompt: string;
    includeDebug?: boolean;
  }): Promise<{
    result: string;
    usage?: LLMUsage;
    debug?: {
      modelId: string;
      requestMessages: Array<{ role: 'user'; content: string }>;
      responseText: string;
    };
  }> {
    const modelId = body.modelId || 'default';

    try {
      const response = await this.modelService.callModel(modelId, body.prompt);
      return {
        result: response.content,
        usage: response.usage,
        ...(body.includeDebug ? {
          debug: {
            modelId,
            requestMessages: [{ role: 'user', content: body.prompt }],
            responseText: response.content,
          },
        } : {}),
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(`Model call failed: ${errorMsg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('debug-settings')
  @ApiOperation({ summary: 'Get prompt debug settings' })
  async getDebugSettings(): Promise<{ promptDebugEnabled: boolean }> {
    return this.promptDebugSettingsService.getSettings();
  }

  @Patch('debug-settings')
  @ApiOperation({ summary: 'Update prompt debug settings' })
  async updateDebugSettings(
    @Body() body: { promptDebugEnabled?: boolean },
  ): Promise<{ promptDebugEnabled: boolean }> {
    if (typeof body.promptDebugEnabled !== 'boolean') {
      throw new HttpException('promptDebugEnabled must be boolean', HttpStatus.BAD_REQUEST);
    }
    return this.promptDebugSettingsService.updateSettings({
      promptDebugEnabled: body.promptDebugEnabled,
    });
  }

  @Get('providers/:id/models')
  @ApiOperation({ summary: 'Load available model names from a specific provider' })
  async listProviderModels(@Param('id') id: string): Promise<AIProviderModelListDTO> {
    try {
      return await this.modelService.listProviderModels(id);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpException(errorMsg, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('models')
  @ApiOperation({ summary: 'Register a new AI model' })
  async createModel(@Body() body: CreateModelDTO): Promise<AIModelDTO> {
    return this.modelService.createModel(body);
  }

  @Get('models/:id')
  @ApiOperation({ summary: 'Get a specific AI model' })
  async getModel(@Param('id') id: string): Promise<AIModelDTO> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    return model;
  }

  @Patch('models/:id/enable')
  @ApiOperation({ summary: 'Enable an AI model' })
  async enableModel(@Param('id') id: string): Promise<AIModelDTO> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    return this.modelService.setModelStatus(id, 'active') as Promise<AIModelDTO>;
  }

  @Patch('models/:id/disable')
  @ApiOperation({ summary: 'Disable an AI model' })
  async disableModel(@Param('id') id: string): Promise<AIModelDTO> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    return this.modelService.setModelStatus(id, 'inactive') as Promise<AIModelDTO>;
  }

  @Patch('models/:id')
  @ApiOperation({ summary: 'Update an AI model configuration' })
  async updateModel(@Param('id') id: string, @Body() body: Partial<CreateModelDTO>): Promise<AIModelDTO> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    return this.modelService.updateModel(id, body) as Promise<AIModelDTO>;
  }

  @Delete('models/:id')
  @ApiOperation({ summary: 'Delete an AI model' })
  async deleteModel(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.modelService.deleteModel(id);
    if (!success) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    return { success };
  }

  @Post('models/:id/test-config')
  @ApiOperation({ summary: 'Test model configuration using stored API key' })
  async testModelConfig(@Param('id') id: string): Promise<{ success: boolean; response?: string; error?: string }> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    try {
      const response = await this.modelService.callModel(id, 'Hello, this is a test.');
      return { success: true, response: response.content };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  @Post('models/:id/test')
  @ApiOperation({ summary: 'Test an AI model with a prompt' })
  async testModel(@Param('id') id: string, @Body() body: { prompt: string }): Promise<{ success: boolean; response?: string; error?: string }> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    try {
      const response = await this.modelService.callModel(id, body.prompt || 'Hello, this is a test.');
      return { success: true, response: response.content };
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
  @ApiConsumes('application/json')
  async testConfig(@Body() body: { endpoint: string; apiKey: string; modelName: string }): Promise<{ success: boolean; response?: string; error?: string }> {
    if (!body.endpoint || !body.apiKey || !body.modelName) {
      return { success: false, error: '请填写完整的配置信息：Endpoint、API Key 和模型名称' };
    }

    try {
      const { OpenAICompatibleClient } = await import('../client/openai-compatible.js');
      const client = new OpenAICompatibleClient({
        baseURL: body.endpoint,
        apiKey: body.apiKey,
        model: body.modelName,
      });
      const messages = [{ role: 'user' as const, content: 'Hello, this is a test message.' }];
      const response = await client.chatCompletion(messages);
      return { success: true, response: response.content };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }
}
