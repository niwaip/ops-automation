import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ExecutorService } from './modules/executor';
import { CdpService } from './modules/cdp';
import { LogService } from './modules/log';
import { AiService } from './modules/ai-interaction';
import { getDefaultCdpUrl } from './config/service-endpoints';
import {
  StartReplayRequestDto,
  StartReplayResponseDto,
  StopReplayRequestDto,
  StopReplayResponseDto,
  ExecutionStatusResponseDto,
  StepLogDto,
  CDPConnectionStatusDto,
} from './dto';

@ApiTags('replay')
@Controller('replay')
export class ReplayController {
  private readonly logger = new Logger(ReplayController.name);

  constructor(
    private readonly executorService: ExecutorService,
    private readonly cdpService: CdpService,
    private readonly logService: LogService,
    private readonly aiService: AiService
  ) {}

  /**
   * Start a replay execution
   * POST /replay/start
   */
  @Post('start')
  @ApiOperation({ summary: 'Start a replay execution' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Execution started',
    type: StartReplayResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request or session not available',
  })
  async startReplay(@Body() request: StartReplayRequestDto): Promise<StartReplayResponseDto> {
    this.logger.log(
      `Starting replay for session ${request.session_id} with template ${request.template_id}`
    );

    // Get CDP URL from session (would normally call Session Broker)
    const cdpUrl = getDefaultCdpUrl();

    try {
      const executionId = await this.executorService.startExecution(
        request.session_id,
        request.template_id,
        request.params,
        cdpUrl
      );

      return {
        execution_id: executionId,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to start replay: ${err.message}`);
      throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Stop a replay execution
   * POST /replay/stop
   */
  @Post('stop')
  @ApiOperation({ summary: 'Stop a replay execution' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Execution stopped',
    type: StopReplayResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Session not found',
  })
  async stopReplay(@Body() request: StopReplayRequestDto): Promise<StopReplayResponseDto> {
    this.logger.log(`Stopping replay for session ${request.session_id}`);

    const success = await this.executorService.stopExecution(request.session_id);

    if (!success) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
    };
  }

  /**
   * Get execution status
   * GET /replay/:execution_id/status
   */
  @Get(':execution_id/status')
  @ApiOperation({ summary: 'Get execution status' })
  @ApiParam({ name: 'execution_id', description: 'Execution ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Execution status',
    type: ExecutionStatusResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Execution not found',
  })
  async getExecutionStatus(
    @Param('execution_id') executionId: string
  ): Promise<ExecutionStatusResponseDto> {
    const execution = this.executorService.getExecutionStatus(executionId);

    if (!execution) {
      throw new HttpException('Execution not found', HttpStatus.NOT_FOUND);
    }

    return {
      execution_id: execution.execution_id,
      session_id: execution.session_id,
      template_id: execution.template_id,
      status: execution.status,
      current_step_index: execution.current_step_index,
      total_steps: execution.total_steps,
      started_at: execution.started_at,
      completed_at: execution.completed_at,
      error: execution.error,
    };
  }

  /**
   * Get step logs for a session
   * GET /replay/session/:session_id/logs
   */
  @Get('session/:session_id/logs')
  @ApiOperation({ summary: 'Get step logs for a session' })
  @ApiParam({ name: 'session_id', description: 'Session ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Step logs',
    type: [StepLogDto],
  })
  async getStepLogs(@Param('session_id') sessionId: string): Promise<StepLogDto[]> {
    const logs = await this.logService.getStepLogs(sessionId);
    return logs.map((log) => ({
      id: log.id,
      session_id: log.session_id,
      step_id: log.step_id,
      step_index: log.step_index,
      action: log.action,
      started_at: log.started_at,
      completed_at: log.completed_at,
      duration_ms: log.duration_ms,
      result: log.result,
      error_class: log.error_class,
      error_message: log.error_message,
      retry_count: log.retry_count,
      takeover_triggered: log.takeover_triggered,
    }));
  }

  /**
   * Get CDP connection status
   * GET /replay/cdp/status
   */
  @Get('cdp/status')
  @ApiOperation({ summary: 'Get CDP connection status' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'CDP connection status',
    type: CDPConnectionStatusDto,
  })
  async getCdpStatus(): Promise<CDPConnectionStatusDto> {
    const state = this.cdpService.getConnectionState();
    return {
      connected: state.connected,
      cdp_url: state.cdp_url,
      page_id: state.page_id,
      connected_at: state.connected_at,
    };
  }

  /**
   * Get AI Orchestrator availability
   * GET /replay/ai/status
   */
  @Get('ai/status')
  @ApiOperation({ summary: 'Check AI Orchestrator availability' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'AI Orchestrator status',
  })
  async getAiStatus(): Promise<{ available: boolean }> {
    const available = await this.aiService.checkAvailability();
    return { available };
  }

  /**
   * Get execution summary for a session
   * GET /replay/session/:session_id/summary
   */
  @Get('session/:session_id/summary')
  @ApiOperation({ summary: 'Get execution summary for a session' })
  @ApiParam({ name: 'session_id', description: 'Session ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Execution summary',
  })
  async getExecutionSummary(@Param('session_id') sessionId: string): Promise<{
    total_steps: number;
    successful_steps: number;
    failed_steps: number;
    retry_steps: number;
    takeover_triggered: boolean;
    total_duration_ms: number;
  }> {
    return this.logService.getExecutionSummary(sessionId);
  }

  /**
   * Health check endpoint
   * GET /replay/health
   */
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service health status',
  })
  async healthCheck(): Promise<{
    status: string;
    service: string;
    cdp_connected: boolean;
    ai_available: boolean;
  }> {
    const cdpState = this.cdpService.getConnectionState();
    const aiAvailable = await this.aiService.checkAvailability();

    return {
      status: 'ok',
      service: 'replay-engine',
      cdp_connected: cdpState.connected,
      ai_available: aiAvailable,
    };
  }
}
