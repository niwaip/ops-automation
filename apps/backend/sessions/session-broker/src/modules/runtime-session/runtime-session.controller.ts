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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RuntimeSessionService } from './runtime-session.service';
import {
  CreateRuntimeSessionDto,
  RuntimeSessionDto,
  FreezeRuntimeSessionDto,
  ResumeRuntimeSessionDto,
  CloseRuntimeSessionDto,
  ListRuntimeSessionsDto,
} from './runtime-session.dto';

@ApiTags('Runtime Sessions')
@Controller('runtime-sessions')
export class RuntimeSessionController {
  private readonly logger = new Logger(RuntimeSessionController.name);

  constructor(private readonly runtimeSessionService: RuntimeSessionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new runtime session' })
  @ApiResponse({ status: 201, description: 'Runtime session created', type: RuntimeSessionDto })
  @ApiResponse({ status: 400, description: 'No available workers' })
  async create(@Body() dto: CreateRuntimeSessionDto): Promise<RuntimeSessionDto> {
    this.logger.log(`Creating runtime session for user ${dto.userId}`);
    return this.runtimeSessionService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List runtime sessions' })
  @ApiResponse({ status: 200, description: 'List of runtime sessions' })
  async list(
    @Query() dto: ListRuntimeSessionsDto
  ): Promise<{ data: RuntimeSessionDto[]; total: number; page: number; pageSize: number }> {
    return this.runtimeSessionService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get runtime session by ID' })
  @ApiResponse({ status: 200, description: 'Runtime session details', type: RuntimeSessionDto })
  @ApiResponse({ status: 404, description: 'Runtime session not found' })
  async getById(@Param('id') id: string): Promise<RuntimeSessionDto> {
    return this.runtimeSessionService.getById(id);
  }

  @Post(':id/freeze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Freeze runtime session' })
  @ApiResponse({ status: 200, description: 'Runtime session frozen', type: RuntimeSessionDto })
  @ApiResponse({ status: 400, description: 'Cannot freeze from current state' })
  @ApiResponse({ status: 404, description: 'Runtime session not found' })
  async freeze(
    @Param('id') id: string,
    @Body() dto: FreezeRuntimeSessionDto
  ): Promise<RuntimeSessionDto> {
    this.logger.log(`Freezing runtime session ${id}: ${dto.reason}`);
    return this.runtimeSessionService.freeze(id, dto);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume runtime session from frozen' })
  @ApiResponse({ status: 200, description: 'Runtime session resumed', type: RuntimeSessionDto })
  @ApiResponse({ status: 400, description: 'Runtime session is not frozen' })
  @ApiResponse({ status: 404, description: 'Runtime session not found' })
  async resume(
    @Param('id') id: string,
    @Body() dto: ResumeRuntimeSessionDto
  ): Promise<RuntimeSessionDto> {
    this.logger.log(`Resuming runtime session ${id}`);
    return this.runtimeSessionService.resume(id, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close runtime session' })
  @ApiResponse({ status: 200, description: 'Runtime session closed', type: RuntimeSessionDto })
  @ApiResponse({ status: 400, description: 'Cannot close from current state' })
  @ApiResponse({ status: 404, description: 'Runtime session not found' })
  async close(
    @Param('id') id: string,
    @Body() dto: CloseRuntimeSessionDto
  ): Promise<RuntimeSessionDto> {
    this.logger.log(`Closing runtime session ${id}`);
    return this.runtimeSessionService.close(id);
  }
}
