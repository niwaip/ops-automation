<<<<<<< HEAD
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
=======
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
>>>>>>> 326e2d06510e0b3ff127d572df7deb4ecb7b1191
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get activity by ID' })
<<<<<<< HEAD
  async findOne(@Param('id') id: string): Promise<Activity | null> {
    return this.activityService.findOne(id);
=======
  async get(@Param('id') id: string) {
    return this.service.getById(id);
>>>>>>> 326e2d06510e0b3ff127d572df7deb4ecb7b1191
  }

  @Post()
  @ApiOperation({ summary: 'Create a new activity' })
<<<<<<< HEAD
  async create(@Body() data: ActivityFormData): Promise<Activity> {
    return this.activityService.create(data);
=======
  async create(@Body() body: CreateActivityDto) {
    return this.service.create(body);
>>>>>>> 326e2d06510e0b3ff127d572df7deb4ecb7b1191
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an activity' })
<<<<<<< HEAD
  async update(@Param('id') id: string, @Body() data: Partial<ActivityFormData>): Promise<Activity> {
    return this.activityService.update(id, data);
=======
  async update(@Param('id') id: string, @Body() body: UpdateActivityDto) {
    return this.service.update(id, body);
>>>>>>> 326e2d06510e0b3ff127d572df7deb4ecb7b1191
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an activity' })
<<<<<<< HEAD
  async delete(@Param('id') id: string): Promise<{ success: boolean }> {
    return this.activityService.delete(id);
=======
  async delete(@Param('id') id: string) {
    return this.service.delete(id);
>>>>>>> 326e2d06510e0b3ff127d572df7deb4ecb7b1191
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate activity configuration' })
<<<<<<< HEAD
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
  async executeCode(@Body() data: { code: string; fn: string; taskQueue: string; input?: Record<string, any> }) {
    return this.activityService.executeCode(data.code, data.fn, data.taskQueue, data.input);
  }

  @Post('execute-code/stream')
  @ApiOperation({ summary: 'Execute generated code with SSE streaming' })
  async executeCodeStream(@Body() data: { code?: string; fn: string; taskQueue: string; input?: Record<string, any> }, @Res() res: any) {
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
      const execResult = await this.activityService.executeCodeStreaming(code, data.fn, data.taskQueue, data.input, (log: string) => {
        res.write(`data: ${JSON.stringify({ type: 'log', message: log })}\n\n`);
      });

      res.write(`data: ${JSON.stringify({ type: 'done', result: execResult })}\n\n`);
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.end();
    }
=======
  async validate(@Body() body: ActivityConfig) {
    return this.service.validate(body);
>>>>>>> 326e2d06510e0b3ff127d572df7deb4ecb7b1191
  }
}