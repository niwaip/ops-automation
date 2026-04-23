import { Controller, Get, Post, Put, Delete, Body, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import {
  TemporalWorkflowService,
  CreateTemporalWorkflowDTO,
  UpdateTemporalWorkflowDTO,
  TemporalValidationResult,
  WorkflowDsl,
  ActivityDsl,
} from './temporal-workflow.service';
import { TemporalWorkflow } from '@prisma/client';

@ApiTags('Temporal Workflows')
@Controller('temporal-workflow')
export class TemporalWorkflowController {
  constructor(private readonly temporalWorkflowService: TemporalWorkflowService) {}

  @Get()
  @ApiOperation({ summary: 'List all temporal workflows' })
  async findAll(): Promise<TemporalWorkflow[]> {
    return this.temporalWorkflowService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow by ID' })
  async findOne(@Param('id') id: string): Promise<TemporalWorkflow | null> {
    return this.temporalWorkflowService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new temporal workflow' })
  async create(@Body() data: CreateTemporalWorkflowDTO): Promise<TemporalWorkflow> {
    return this.temporalWorkflowService.create(data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a temporal workflow' })
  async update(
    @Param('id') id: string,
    @Body() data: UpdateTemporalWorkflowDTO,
  ): Promise<TemporalWorkflow> {
    return this.temporalWorkflowService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a temporal workflow' })
  async delete(@Param('id') id: string): Promise<{ success: boolean }> {
    return this.temporalWorkflowService.delete(id);
  }

  @Post(':id/deploy')
  @ApiOperation({ summary: 'Deploy workflow to Temporal worker' })
  async deploy(@Param('id') id: string): Promise<TemporalWorkflow> {
    return this.temporalWorkflowService.deploy(id);
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate workflow DSL and activity DSL' })
  async validate(
    @Body() data: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl },
  ): Promise<TemporalValidationResult> {
    return this.temporalWorkflowService.validate(data.workflowDsl, data.activityDsl);
  }

  @Post('generate-code')
  @ApiOperation({ summary: 'Generate workflow Python code from DSL' })
  async generateCode(
    @Body() data: { workflowDsl: WorkflowDsl; activityDsl: ActivityDsl },
  ): Promise<{ success: boolean; code?: string; error?: string }> {
    return this.temporalWorkflowService.generateWorkflowCode(data.workflowDsl, data.activityDsl);
  }

  @Post('validate-code')
  @ApiOperation({ summary: 'Validate generated code in sandbox' })
  async validateCode(
    @Body() data: { code: string; fn: string; input?: Record<string, any> },
  ): Promise<{ success: boolean; logs: string[]; result?: any; error?: string; score: number }> {
    return this.temporalWorkflowService.validateInSandbox(data.code, data.fn, data.input);
  }

  @Post('validate-code/stream')
  @ApiOperation({ summary: 'Validate generated code in sandbox with streaming logs' })
  async validateCodeStream(
    @Body() data: { code: string; fn: string; input?: Record<string, any> },
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const result = await this.temporalWorkflowService.validateInSandboxStreaming(
        data.code,
        data.fn,
        data.input,
        (log: string) => {
          res.write(`data: ${JSON.stringify({ type: 'log', content: log })}\n\n`);
        },
      );

      if (result.success) {
        res.write(`data: ${JSON.stringify({ type: 'done', success: true, score: result.score, result: result.result })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'done', success: false, error: result.error, score: result.score })}\n\n`);
      }
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
    }

    res.end();
  }
}