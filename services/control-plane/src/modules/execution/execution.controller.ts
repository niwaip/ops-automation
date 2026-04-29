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
  ExecutionStepDto,
  TakeoverExecutionDto,
  ResumeExecutionDto,
  ReleaseHumanControlDto,
  ListExecutionsDto,
  SubmitInputDto,
  ApprovalDecisionDto,
} from './execution.dto';
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
  async create(@Body() dto: CreateExecutionDto, @Req() req: AuthenticatedRequest): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Creating execution for user ${userId}, skill ${dto.skillId}`);
    return this.executionService.create(userId, dto, {
      authToken: req.headers.authorization,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List executions' })
  @ApiResponse({ status: 200, description: 'List of executions' })
  async list(@Query() dto: ListExecutionsDto): Promise<{ data: ExecutionDto[]; total: number; page: number; pageSize: number }> {
    return this.executionService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get execution by ID' })
  @ApiResponse({ status: 200, description: 'Execution details', type: ExecutionDto })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async getById(@Param('id') id: string): Promise<ExecutionDto> {
    return this.executionService.getById(id);
  }

  @Get(':id/steps')
  @ApiOperation({ summary: 'Get execution steps' })
  @ApiResponse({ status: 200, description: 'List of execution steps' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async getSteps(@Param('id') id: string): Promise<ExecutionStepDto[]> {
    return this.executionService.getSteps(id);
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
    @Req() req: AuthenticatedRequest,
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Takeover requested for execution ${id} by user ${userId}`);
    return this.executionService.takeover(id, userId, dto);
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
    @Req() req: AuthenticatedRequest,
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Resume requested for execution ${id} by user ${userId}`);
    return this.executionService.resume(id, userId, dto);
  }

  @Get(':id/events/stream')
  @ApiOperation({ summary: 'Stream execution events (SSE)' })
  async streamEvents(
    @Param('id') id: string,
    @Res() res: any,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const subscription = this.executionService.subscribeToEvents(id, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
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
    @Req() req: AuthenticatedRequest,
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Release human control requested for execution ${id} by user ${userId}`);
    return this.executionService.releaseHumanControl(id, userId, dto);
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
    @Req() req: AuthenticatedRequest,
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Approval requested for execution ${id} by user ${userId}`);
    return this.executionService.approve(id, userId, dto);
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
    @Req() req: AuthenticatedRequest,
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Rejection requested for execution ${id} by user ${userId}`);
    return this.executionService.reject(id, userId, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel execution' })
  @ApiResponse({ status: 200, description: 'Execution cancelled', type: ExecutionDto })
  @ApiResponse({ status: 400, description: 'Cannot cancel from current status' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async cancel(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Cancel requested for execution ${id} by user ${userId}`);
    return this.executionService.cancel(id, userId);
  }

  @Post(':id/submit-input')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit missing input and resume execution from waiting_input' })
  @ApiResponse({ status: 200, description: 'Input submitted and execution resumed', type: ExecutionDto })
  @ApiResponse({ status: 400, description: 'Execution is not in waiting_input status or invalid step ID' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async submitInput(
    @Param('id') id: string,
    @Body() dto: SubmitInputDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ExecutionDto> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Input submission requested for execution ${id} by user ${userId}`);
    return this.executionService.submitInputAndResume(id, userId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete execution' })
  @ApiResponse({ status: 200, description: 'Execution deleted successfully' })
  @ApiResponse({ status: 404, description: 'Execution not found' })
  async delete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    const userId = req.user?.id || 'anonymous';
    this.logger.log(`Delete requested for execution ${id} by user ${userId}`);
    return this.executionService.delete(id, userId);
  }
}
