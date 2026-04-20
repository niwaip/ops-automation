import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TemporalWorkflowService, WorkflowDsl, ActivityDsl } from './temporal-workflow.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RbacGuard } from '../../guards/rbac.guard';

@ApiTags('temporal-workflow')
@Controller('temporal-workflow')
@UseGuards(JwtAuthGuard, RbacGuard)
export class TemporalWorkflowController {
  constructor(private readonly service: TemporalWorkflowService) {}

  @Get()
  @ApiOperation({ summary: 'List all temporal workflows' })
  async list() {
    return this.service.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow by ID' })
  async get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new temporal workflow' })
  async create(@Body() body: {
    name: string;
    description?: string;
    taskQueue: string;
    workflowDsl: WorkflowDsl;
    activityDsl: ActivityDsl;
  }) {
    return this.service.create(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a temporal workflow' })
  async update(@Param('id') id: string, @Body() body: Partial<{
    name: string;
    description?: string;
    taskQueue: string;
    workflowDsl: WorkflowDsl;
    activityDsl: ActivityDsl;
    isActive: boolean;
  }>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a temporal workflow' })
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Post(':id/deploy')
  @ApiOperation({ summary: 'Deploy workflow to Temporal worker' })
  async deploy(@Param('id') id: string) {
    return this.service.deploy(id);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate workflow DSL and activity DSL' })
  async validate(@Body() body: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl }) {
    return this.service.validateDsl(body.workflowDsl, body.activityDsl);
  }
}