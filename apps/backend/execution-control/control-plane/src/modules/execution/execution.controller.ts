import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  Delete,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ExecutionService } from './execution.service';
import {
  CreateExecutionDto,
  ExecutionDto,
  ExecutionPhaseDto,
  ExecutionStepDto,
  TakeoverExecutionDto,
  ResumeExecutionDto,
  ReleaseHumanControlDto,
  ListExecutionsDto,
  SubmitInputDto,
  ApprovalDecisionDto,
  CleanupExecutionsBeforeDateDto,
  ReconcilePhaseTakeoverDto,
  UpdateWorkflowActivityProgressDto,
  UpdateExecutionResultSummaryDto,
} from './state/execution.dto';
import { AuthenticatedRequest } from '../auth/auth.middleware';

@ApiTags('Executions')
@ApiBearerAuth()
@Controller('executions')
export class ExecutionController {
  private readonly logger = new Logger(ExecutionController.name);

  constructor(private readonly executionService: ExecutionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new execution' })
  @ApiResponse({ status: 201, description: 'Execution created successfully', type: ExecutionDto })
  async create(
    @Body() dto: CreateExecutionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Creating execution for user ${userId}, skill ${dto.skillId}`);
    return this.executionService.create(userId, dto, {
      authToken: req.headers.authorization,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List executions' })
  @ApiResponse({ status: 200, description: 'List of executions' })
  async list(
    @Query() dto: ListExecutionsDto,
    @Req() req: AuthenticatedRequest
  ): Promise<{ data: ExecutionDto[]; total: number; page: number; pageSize: number }> {
    return this.executionService.list(dto, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get execution by ID' })
  @ApiResponse({ status: 200, description: 'Execution details', type: ExecutionDto })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async getById(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<ExecutionDto> {
    return this.executionService.getById(id, req.user);
  }

  @Get(':id/steps')
  @ApiOperation({ summary: 'Get execution steps' })
  @ApiResponse({ status: 200, description: 'List of execution steps' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async getSteps(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ): Promise<ExecutionStepDto[]> {
    return this.executionService.getSteps(id, req.user);
  }

  @Get(':id/phases')
  @ApiOperation({ summary: 'Get execution phases' })
  @ApiResponse({
    status: 200,
    description: 'List of execution phases',
    type: ExecutionPhaseDto,
    isArray: true,
  })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async getPhases(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ): Promise<ExecutionPhaseDto[]> {
    return this.executionService.getPhases(id, req.user);
  }

  @Get(':id/plan')
  @ApiOperation({ summary: 'Get frozen execution plan by execution ID' })
  @ApiResponse({ status: 200, description: 'Frozen plan details' })
  @ApiResponse({ status: 404, description: 'Plan or execution not found' })
  async getPlan(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<any> {
    return this.executionService.getPlan(id, req.user);
  }

  @Get(':id/artifacts')
  @ApiOperation({ summary: 'Get execution business artifacts' })
  @ApiResponse({ status: 200, description: 'List of execution artifacts' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async getArtifacts(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<any[]> {
    return this.executionService.getArtifacts(id, req.user);
  }

  @Post(':id/phases/progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update workflow activity progress for an execution' })
  async updateWorkflowActivityProgress(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowActivityProgressDto,
    @Req() req: AuthenticatedRequest
  ): Promise<{ ok: true }> {
    await this.executionService.updateWorkflowActivityProgress(id, dto, req.user);
    return { ok: true };
  }

  @Post(':id/result-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update AI summary for execution result' })
  @ApiResponse({ status: 200, description: 'Summary updated successfully', type: ExecutionDto })
  async updateResultSummary(
    @Param('id') id: string,
    @Body() dto: UpdateExecutionResultSummaryDto
  ): Promise<ExecutionDto> {
    return this.executionService.updateResultSummary(id, dto.summary);
  }

  @Post(':id/phases/:phaseKey/takeover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request human takeover for a phase' })
  @ApiResponse({
    status: 200,
    description: 'Phase entered waiting_takeover and execution entered human_control',
    type: ExecutionDto,
  })
  async takeoverPhase(
    @Param('id') id: string,
    @Param('phaseKey') phaseKey: string,
    @Body() dto: TakeoverExecutionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    return this.executionService.takeoverPhase(id, phaseKey, userId, dto, req.user);
  }

  @Post(':id/phases/:phaseKey/reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a takeover phase as reconciled and resumable' })
  @ApiResponse({ status: 200, description: 'Phase reconciled', type: ExecutionDto })
  async reconcilePhaseTakeover(
    @Param('id') id: string,
    @Param('phaseKey') phaseKey: string,
    @Body() dto: ReconcilePhaseTakeoverDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    return this.executionService.reconcilePhaseTakeover(id, phaseKey, userId, dto, req.user);
  }

  @Post(':id/phases/:phaseKey/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume execution from a takeover phase' })
  @ApiResponse({
    status: 200,
    description: 'Execution resumed from phase takeover',
    type: ExecutionDto,
  })
  async resumePhaseTakeover(
    @Param('id') id: string,
    @Param('phaseKey') phaseKey: string,
    @Body() dto: ResumeExecutionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    return this.executionService.resumePhaseTakeover(id, phaseKey, userId, dto, req.user);
  }

  @Post(':id/takeover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request human takeover' })
  @ApiResponse({ status: 200, description: 'Execution entered human_control', type: ExecutionDto })
  @ApiResponse({ status: 400, description: 'Cannot takeover from current status' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async takeover(
    @Param('id') id: string,
    @Body() dto: TakeoverExecutionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Takeover requested for execution ${id} by user ${userId}`);
    return this.executionService.takeover(id, userId, dto, req.user);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume execution from human_control (legacy route)' })
  @ApiResponse({ status: 200, description: 'Execution resumed', type: ExecutionDto })
  @ApiResponse({ status: 400, description: 'Execution is not in human_control' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async resume(
    @Param('id') id: string,
    @Body() dto: ResumeExecutionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Resume requested for execution ${id} by user ${userId}`);
    return this.executionService.resume(id, userId, dto, req.user);
  }

  @Get(':id/events/stream')
  @ApiOperation({ summary: 'Stream execution events (SSE)' })
  async streamEvents(@Param('id') id: string, @Res() res: any): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const subscription = this.executionService.subscribeToEvents(id, (event) => {
      const frame = `data: ${JSON.stringify(event)}\n\n`;
      const newStatus =
        event.eventType === 'execution.status_changed' &&
        event.payload &&
        typeof event.payload === 'object'
          ? (event.payload as Record<string, unknown>).newStatus
          : undefined;
      if (
        newStatus === 'succeeded' ||
        newStatus === 'failed' ||
        newStatus === 'cancelled' ||
        newStatus === 'rolled_back'
      ) {
        res.end(frame);
        return;
      }

      res.write(frame);
    });

    res.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @Post(':id/release-human-control')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Release human control and resume execution' })
  @ApiResponse({ status: 200, description: 'Execution resumed', type: ExecutionDto })
  @ApiResponse({ status: 400, description: 'Execution is not in human_control' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async releaseHumanControl(
    @Param('id') id: string,
    @Body() dto: ReleaseHumanControlDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Release human control requested for execution ${id} by user ${userId}`);
    return this.executionService.releaseHumanControl(id, userId, dto, req.user);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve execution from pending_approval' })
  @ApiResponse({ status: 200, description: 'Execution approved and re-queued', type: ExecutionDto })
  @ApiResponse({ status: 400, description: 'Execution is not in pending_approval' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async approve(
    @Param('id') id: string,
    @Body() dto: ApprovalDecisionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Approval requested for execution ${id} by user ${userId}`);
    return this.executionService.approve(id, userId, dto, req.user);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject execution from pending_approval' })
  @ApiResponse({ status: 200, description: 'Execution rejected and cancelled', type: ExecutionDto })
  @ApiResponse({ status: 400, description: 'Execution is not in pending_approval' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async reject(
    @Param('id') id: string,
    @Body() dto: ApprovalDecisionDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Rejection requested for execution ${id} by user ${userId}`);
    return this.executionService.reject(id, userId, dto, req.user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel execution' })
  @ApiResponse({ status: 200, description: 'Execution cancelled', type: ExecutionDto })
  @ApiResponse({ status: 400, description: 'Cannot cancel from current status' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async cancel(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Cancel requested for execution ${id} by user ${userId}`);
    return this.executionService.cancel(id, userId, req.user);
  }

  @Post(':id/submit-input')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit missing input and resume execution from waiting_input' })
  @ApiResponse({
    status: 200,
    description: 'Input submitted and execution resumed',
    type: ExecutionDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Execution is not in waiting_input status or invalid step ID',
  })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async submitInput(
    @Param('id') id: string,
    @Body() dto: SubmitInputDto,
    @Req() req: AuthenticatedRequest
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Input submission requested for execution ${id} by user ${userId}`);
    return this.executionService.submitInputAndResume(id, userId, dto, req.user);
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete executions created before the specified date' })
  @ApiResponse({ status: 200, description: 'Executions deleted successfully' })
  async cleanupBeforeDate(
    @Body() dto: CleanupExecutionsBeforeDateDto,
    @Req() req: AuthenticatedRequest
  ): Promise<{ success: boolean; deletedCount: number; beforeDate: string }> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Cleanup requested before ${dto.beforeDate} by user ${userId}`);
    return this.executionService.cleanupBeforeDate(dto.beforeDate, userId, req.user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete execution' })
  @ApiResponse({ status: 200, description: 'Execution deleted successfully' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async delete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ): Promise<{ success: boolean }> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Delete requested for execution ${id} by user ${userId}`);
    return this.executionService.delete(id, userId, req.user);
  }
}
