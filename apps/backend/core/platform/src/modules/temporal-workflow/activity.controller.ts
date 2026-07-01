import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ActivityService } from './temporal-activity.service';
import { TemporalActivityValidationHttpService } from './temporal-activity-validation-http.service';
import {
  ActivityFormData,
  ActivityValidationResult,
  BuiltinActivityDTO,
  GenerateCodeResult,
} from './temporal-activity.types';
import { Activity } from '../../prisma/client';

@ApiTags('Activities')
@Controller('activities')
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly validationHttpService: TemporalActivityValidationHttpService
  ) {}

  @Get('builtin')
  @ApiOperation({ summary: 'List all builtin activities' })
  async listBuiltin(): Promise<BuiltinActivityDTO[]> {
    return this.activityService.listBuiltin();
  }

  @Get('builtin/:key')
  @ApiOperation({ summary: 'Get builtin activity by key' })
  async getBuiltin(@Param('key') key: string): Promise<BuiltinActivityDTO | null> {
    return this.activityService.getBuiltin(key);
  }

  @Get()
  @ApiOperation({ summary: 'List all activities' })
  async findAll(): Promise<Activity[]> {
    return this.activityService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get activity by ID' })
  async findOne(@Param('id') id: string): Promise<Activity | null> {
    return this.activityService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new activity' })
  async create(@Body() data: ActivityFormData): Promise<Activity> {
    return this.activityService.create(data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an activity' })
  async update(
    @Param('id') id: string,
    @Body() data: Partial<ActivityFormData>
  ): Promise<Activity> {
    return this.activityService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an activity' })
  async delete(@Param('id') id: string): Promise<{ success: boolean }> {
    return this.activityService.delete(id);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate activity configuration' })
  async validate(@Body() config: ActivityFormData): Promise<ActivityValidationResult> {
    return this.validationHttpService.validateRequest(config);
  }

  @Post('generate-code')
  @ApiOperation({ summary: 'Generate Python code using AI' })
  async generateCode(
    @Body() data: { config: ActivityFormData; errorContext?: string }
  ): Promise<GenerateCodeResult> {
    return this.activityService.generateCode(data.config, data.errorContext);
  }
}
