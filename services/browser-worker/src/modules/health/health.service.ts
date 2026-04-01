import { Injectable, Logger } from '@nestjs/common';
import { HealthCheckResponseDto, SystemHealthResponseDto } from '../../dto';
import { WorkerService } from '../worker/worker.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly workerService: WorkerService) {}

  async checkWorkerHealth(workerId: string): Promise<HealthCheckResponseDto> {
    this.logger.debug(`Checking health for worker ${workerId}`);

    const isHealthy = this.workerService.isWorkerHealthy(workerId);
    const chromeRunning = isHealthy; // In production, this would check actual Chrome process

    return {
      healthy: isHealthy,
      chrome_running: chromeRunning,
      cdp_port: 9222,
      novnc_port: 8080,
    };
  }

  async checkSystemHealth(): Promise<SystemHealthResponseDto> {
    const workers = await this.workerService.listWorkers();
    const healthyWorkers = workers.filter(w => w.status === 'running');

    return {
      status: 'ok',
      workers: healthyWorkers.length,
      timestamp: new Date(),
    };
  }

  // Method to check CDP endpoint (would use HTTP request in production)
  async checkCDPEndpoint(cdpUrl: string): Promise<boolean> {
    this.logger.debug(`Checking CDP endpoint at ${cdpUrl}`);

    // In production, this would make an actual HTTP request to:
    // ${cdpUrl}/json/version
    // and check the response

    // For demo, we return true
    return true;
  }

  // Method to check noVNC endpoint (would use HTTP request in production)
  async checkNoVNCEndpoint(novncUrl: string): Promise<boolean> {
    this.logger.debug(`Checking noVNC endpoint at ${novncUrl}`);

    // In production, this would make an actual HTTP request to the noVNC URL
    // and verify the WebSocket is available

    // For demo, we return true
    return true;
  }
}