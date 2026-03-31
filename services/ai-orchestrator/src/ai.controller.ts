import { Controller, Get, Post, Body, Param, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
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
  @ApiResponse({ status: 200, description: 'Returns list of models', type: [AIModelDTO] })
  async listModels(): Promise<{ models: AIModelDTO[] }> {
    const models = await this.modelService.listModels();
    return { models };
  }

  @Post('models')
  @ApiOperation({ summary: 'Register a new AI model' })
  @ApiResponse({ status: 201, description: 'Model registered successfully', type: AIModelDTO })
  async createModel(@Body() body: CreateModelDTO): Promise<AIModelDTO> {
    return this.modelService.createModel(body);
  }

  @Get('models/:id')
  @ApiOperation({ summary: 'Get a specific AI model' })
  @ApiResponse({ status: 200, description: 'Returns model details', type: AIModelDTO })
  @ApiResponse({ status: 404, description: 'Model not found' })
  async getModel(@Param('id') id: string): Promise<AIModelDTO> {
    const model = await this.modelService.getModel(id);
    if (!model) {
      throw new HttpException('Model not found', HttpStatus.NOT_FOUND);
    }
    return model;
  }

  // Agent endpoints
  @Post('agents')
  @ApiOperation({ summary: 'Create a new AI agent instance' })
  @ApiResponse({ status: 201, description: 'Agent created successfully', type: AIAgentDTO })
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
  @ApiResponse({ status: 200, description: 'Returns agent status', type: AIAgentDTO })
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
  @ApiResponse({ status: 200, description: 'Returns recognized parameters', type: RecognizeParamsResponseDTO })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async recognizeParams(@Body() body: RecognizeParamsDTO): Promise<RecognizeParamsResponseDTO> {
    return this.recognizerService.recognizeParams(body);
  }

  // Failure decision endpoint
  @Post('decide-failure')
  @ApiOperation({ summary: 'Decide failure handling strategy' })
  @ApiResponse({ status: 200, description: 'Returns failure decision', type: DecideFailureResponseDTO })
  async decideFailure(@Body() body: DecideFailureDTO): Promise<DecideFailureResponseDTO> {
    return this.deciderService.decideFailure(body);
  }
}