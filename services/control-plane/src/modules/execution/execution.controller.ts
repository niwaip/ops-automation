import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
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
  ListExecutionsDto,
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
    return this.executionService.create(userId, dto);
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
  @ApiOperation({ summary: 'Resume execution from human_control' })
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
}