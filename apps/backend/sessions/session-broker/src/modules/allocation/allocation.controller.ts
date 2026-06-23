import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AllocationService } from './allocation.service';

@ApiTags('workers')
@Controller('workers')
export class AllocationController {
  constructor(private readonly allocationService: AllocationService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get worker pool status' })
  @ApiResponse({ status: 200, description: 'Worker pool status' })
  async getWorkerPoolStatus() {
    const availableCount = await this.allocationService.getAvailableWorkerCount();
    return {
      available_workers: availableCount,
      status: availableCount > 0 ? 'available' : 'exhausted',
      message:
        availableCount > 0
          ? `${availableCount} workers available`
          : 'No workers available. Please restart session-broker or release busy workers.',
    };
  }

  @Post('reset')
  @ApiOperation({ summary: 'Reset worker pool (reinitialize default workers)' })
  @ApiResponse({ status: 200, description: 'Worker pool reset' })
  async resetWorkerPool() {
    const defaultWorkers = ['worker-1', 'worker-2', 'worker-3'];
    await this.allocationService.initializeWorkerPool(defaultWorkers);
    const availableCount = await this.allocationService.getAvailableWorkerCount();
    return {
      success: true,
      available_workers: availableCount,
      message: `Worker pool reset with ${availableCount} workers`,
    };
  }
}
