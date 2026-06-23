import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { WorkerService } from '../worker/worker.service';
import { HealthCheckResponseDto, SystemHealthResponseDto } from '../../dto';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly workerService: WorkerService
  ) {}

  @Get('workers/:id/health')
  @ApiOperation({ summary: 'Check worker health' })
  @ApiParam({ name: 'id', description: 'Worker ID' })
  @ApiResponse({ status: 200, description: 'Worker health status', type: HealthCheckResponseDto })
  @ApiResponse({ status: 404, description: 'Worker not found' })
  async checkWorkerHealth(@Param('id') id: string): Promise<HealthCheckResponseDto> {
    // Verify worker exists
    try {
      await this.workerService.getWorker(id);
    } catch {
      throw new NotFoundException(`Worker ${id} not found`);
    }

    return this.healthService.checkWorkerHealth(id);
  }

  @Get('health')
  @ApiOperation({ summary: 'Check system health' })
  @ApiResponse({ status: 200, description: 'System health status', type: SystemHealthResponseDto })
  async checkSystemHealth(): Promise<SystemHealthResponseDto> {
    return this.healthService.checkSystemHealth();
  }
}
