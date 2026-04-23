import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WorkerService } from './worker.service';

@ApiTags('Worker')
@Controller('worker')
export class WorkerController {
  constructor(private readonly workerService: WorkerService) {}

  @Post('start')
  @ApiOperation({ summary: 'Start the Temporal worker' })
  async startWorker(@Body() data: { taskQueue?: string }) {
    return this.workerService.startWorker(data.taskQueue || 'SKILL_TASK_QUEUE');
  }

  @Post('stop')
  @ApiOperation({ summary: 'Stop the Temporal worker' })
  async stopWorker() {
    return this.workerService.stopWorker();
  }

  @Get('status')
  @ApiOperation({ summary: 'Get worker status' })
  async getStatus() {
    return this.workerService.getStatus();
  }
}