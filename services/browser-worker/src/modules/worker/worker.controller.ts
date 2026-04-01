import { Controller, Post, Get, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { WorkerService } from './worker.service';
import { CreateWorkerRequestDto, CreateWorkerResponseDto, WorkerStatusDto } from '../../dto';

@ApiTags('workers')
@Controller('workers')
export class WorkerController {
  constructor(private readonly workerService: WorkerService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new browser worker' })
  @ApiResponse({ status: 201, description: 'Worker created successfully', type: CreateWorkerResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 500, description: 'Failed to create worker' })
  async createWorker(@Body() request: CreateWorkerRequestDto): Promise<CreateWorkerResponseDto> {
    return this.workerService.createWorker(request);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get worker status' })
  @ApiParam({ name: 'id', description: 'Worker ID' })
  @ApiResponse({ status: 200, description: 'Worker status', type: WorkerStatusDto })
  @ApiResponse({ status: 404, description: 'Worker not found' })
  async getWorker(@Param('id') id: string): Promise<WorkerStatusDto> {
    return this.workerService.getWorker(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a browser worker' })
  @ApiParam({ name: 'id', description: 'Worker ID' })
  @ApiResponse({ status: 200, description: 'Worker deleted successfully' })
  @ApiResponse({ status: 404, description: 'Worker not found' })
  @ApiResponse({ status: 500, description: 'Failed to delete worker' })
  async deleteWorker(@Param('id') id: string): Promise<{ success: boolean }> {
    return this.workerService.deleteWorker(id);
  }

  @Get()
  @ApiOperation({ summary: 'List all workers' })
  @ApiResponse({ status: 200, description: 'List of all workers', type: [WorkerStatusDto] })
  async listWorkers(): Promise<WorkerStatusDto[]> {
    return this.workerService.listWorkers();
  }
}