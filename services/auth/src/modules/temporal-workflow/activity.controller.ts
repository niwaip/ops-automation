import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ActivityService, ActivityConfig, CreateActivityDto, UpdateActivityDto } from './activity.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RbacGuard } from '../../guards/rbac.guard';

@ApiTags('activities')
@Controller('activities')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ActivityController {
  constructor(private readonly service: ActivityService) {}

  @Get()
  @ApiOperation({ summary: 'List all activities' })
  async list(@Query('handler') handler?: string) {
    return this.service.list(handler);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get activity by ID' })
  async get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new activity' })
  async create(@Body() body: CreateActivityDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an activity' })
  async update(@Param('id') id: string, @Body() body: UpdateActivityDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an activity' })
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate activity configuration' })
  async validate(@Body() body: ActivityConfig) {
    return this.service.validate(body);
  }
}