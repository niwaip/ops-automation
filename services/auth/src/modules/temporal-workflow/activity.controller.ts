import { Controller, Get, Post, Put, Delete, Body, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ActivityService, ActivityFormData, ActivityValidationResult, GenerateCodeResult } from './activity.service';
import { Activity } from '@prisma/client';

@ApiTags('Activities')
@Controller('activities')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

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
  async update(@Param('id') id: string, @Body() data: Partial<ActivityFormData>): Promise<Activity> {
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
    return this.activityService.validate(config);
  }

  @Post('generate-code')
  @ApiOperation({ summary: 'Generate Python code using AI' })
  async generateCode(@Body() data: { config: ActivityFormData; errorContext?: string }): Promise<GenerateCodeResult> {
    return this.activityService.generateCode(data.config, data.errorContext);
  }

  @Post('execute-code')
  @ApiOperation({ summary: 'Execute generated code for real validation' })
  async executeCode(@Body() data: {
    code: string;
    fn: string;
    taskQueue: string;
    timeout?: string;
    retryPolicy?: { maxRetries: number; backoffMs?: number };
    input?: Record<string, any>;
  }) {
    return this.activityService.executeCode(data.code, data.fn, data.taskQueue, data.input);
  }

  @Post('execute-code/stream')
  @ApiOperation({ summary: 'Execute generated code with SSE streaming' })
  async executeCodeStream(@Body() data: {
    code?: string;
    fn: string;
    taskQueue: string;
    timeout?: string;
    retryPolicy?: { maxRetries: number; backoffMs?: number };
    input?: Record<string, any>;
  }, @Res() res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      let code = data.code;

      // If no code provided, generate new code
      if (!code) {
        res.write(`data: ${JSON.stringify({ type: 'log', message: '正在生成代码...' })}\n\n`);
        const handler = 'api';
        const genResult = await this.activityService.generateCode({
          name: data.fn,
          fn: data.fn,
          handler: handler as any,
          config: { taskQueue: data.taskQueue },
        } as any);

        if (!genResult.success || !genResult.code) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: genResult.error || '代码生成失败' })}\n\n`);
          res.end();
          return;
        }
        code = genResult.code;
        res.write(`data: ${JSON.stringify({ type: 'log', message: '代码生成完成' })}\n\n`);
      }

      // Execute with streaming
      res.write(`data: ${JSON.stringify({ type: 'log', message: '开始执行代码...' })}\n\n`);
      const execResult = await this.activityService.executeCodeStreaming(
        code,
        data.fn,
        data.taskQueue,
        data.input,
        (log: string) => {
          res.write(`data: ${JSON.stringify({ type: 'log', message: log })}\n\n`);
        },
        {
          timeout: data.timeout,
          retryPolicy: data.retryPolicy,
        },
      );

      res.write(`data: ${JSON.stringify({ type: 'done', result: execResult })}\n\n`);
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
  }
}
