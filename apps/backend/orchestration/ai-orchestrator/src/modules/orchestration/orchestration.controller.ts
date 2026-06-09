import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getOrCreateTraceId } from '../../common/trace.util';
import type {
  AIAgentDTO,
  CreateAgentDTO,
  DecideFailureDTO,
  DecideFailureResponseDTO,
  ExecuteActivityDTO,
  ExecuteActivityResponseDTO,
  GeneratePlanDTO,
  PlanBrowserPhaseRecoveryDTO,
  PlanBrowserPhaseRecoveryResponseDTO,
  PlanDraftDTO,
  RecognizeParamsDTO,
  RecognizeParamsResponseDTO,
} from '../../interfaces';
import { AgentService } from '../agent/agent.service';
import { BrowserPhaseRecoveryService } from '../browser-phase-recovery/browser-phase-recovery.service';
import { DeciderService } from '../decider/decider.service';
import { ModelService } from '../model/model.service';
import { PlannerService } from '../planner/planner.service';
import { RecognizerService } from '../recognizer/recognizer.service';
import { ToolExecutor } from '../react-engine/tool-executor';

@ApiTags('AI-Orchestration')
@Controller('ai')
export class OrchestrationController {
  constructor(
    private readonly modelService: ModelService,
    private readonly agentService: AgentService,
    private readonly recognizerService: RecognizerService,
    private readonly deciderService: DeciderService,
    private readonly plannerService: PlannerService,
    private readonly browserPhaseRecoveryService: BrowserPhaseRecoveryService,
    private readonly toolExecutor: ToolExecutor,
  ) {}

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

  @Post('recognize-params')
  @ApiOperation({ summary: 'Recognize parameters from user input' })
  @ApiResponse({ status: 200, description: 'Returns recognized parameters' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async recognizeParams(@Body() body: RecognizeParamsDTO): Promise<RecognizeParamsResponseDTO> {
    return this.recognizerService.recognizeParams(body);
  }

  @Post('decide-failure')
  @ApiOperation({ summary: 'Decide failure handling strategy' })
  @ApiResponse({ status: 200, description: 'Returns failure decision' })
  async decideFailure(@Body() body: DecideFailureDTO): Promise<DecideFailureResponseDTO> {
    return this.deciderService.decideFailure(body);
  }

  @Post('execute-activity')
  @ApiOperation({ summary: 'Execute generated Temporal Activity code' })
  @ApiResponse({ status: 200, description: 'Returns activity execution result' })
  async executeActivity(@Body() body: ExecuteActivityDTO): Promise<ExecuteActivityResponseDTO> {
    return this.agentService.executeActivity(body.code, body.fn, body.taskQueue, body.input);
  }

  @Post('plans/generate')
  @ApiOperation({ summary: 'Generate a structured plan draft for v3 planner facade' })
  @ApiResponse({ status: 200, description: 'Returns a structured plan draft' })
  async generatePlan(
    @Body() body: GeneratePlanDTO,
    @Req() req: Request & { traceId?: string },
  ): Promise<PlanDraftDTO> {
    const traceId = getOrCreateTraceId(req.traceId);
    return this.plannerService.generatePlan({
      request: body,
      userId: body.user_id,
      authToken: req.headers.authorization,
      traceId,
    });
  }

  @Post('browser-phase-recovery/plan')
  @ApiOperation({ summary: 'Plan a constrained browser phase recovery patch' })
  @ApiResponse({ status: 200, description: 'Returns a browser phase recovery decision' })
  async planBrowserPhaseRecovery(
    @Body() body: PlanBrowserPhaseRecoveryDTO,
  ): Promise<PlanBrowserPhaseRecoveryResponseDTO> {
    return this.browserPhaseRecoveryService.planRecovery(body);
  }

  @Post('tools/refresh')
  @ApiOperation({ summary: 'Force refresh dynamic flow tools' })
  @ApiResponse({ status: 200, description: 'Dynamic flow tools refreshed' })
  async refreshTools(@Req() req: Request & { traceId?: string }): Promise<{
    refreshed: boolean;
    refreshedAt: number;
    dynamicFlowToolCount: number;
    ttlMs: number;
  }> {
    const traceId = getOrCreateTraceId(req.traceId);
    const result = await this.toolExecutor.refreshDynamicFlowTools(traceId);
    return {
      refreshed: result.refreshed,
      refreshedAt: result.loadedAt,
      dynamicFlowToolCount: result.dynamicFlowToolCount,
      ttlMs: result.ttlMs,
    };
  }
}
