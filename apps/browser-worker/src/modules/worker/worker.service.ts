import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateWorkerRequestDto,
  CreateWorkerResponseDto,
  WorkerStatusDto,
  WorkerEndpointsDto,
} from '../../dto';

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);
  private workers: Map<string, WorkerStatusDto> = new Map();

  async createWorker(request: CreateWorkerRequestDto): Promise<CreateWorkerResponseDto> {
    const workerId = uuidv4();
    this.logger.log(`Creating worker ${workerId} for user ${request.user_id}`);

    const profilePath = request.profile_path || `/profiles/${request.user_id}/chrome`;

    // Calculate port mappings (in production, this would be dynamic port allocation)
    const basePort = this.calculatePortForWorker(workerId);
    const novncPort = basePort;
    const cdpPort = basePort + 100;
    const vncPort = basePort + 200;

    const endpoints: WorkerEndpointsDto = {
      novnc: `http://localhost:${novncPort}`,
      cdp: `http://localhost:${cdpPort}`,
      vnc: `vnc://localhost:${vncPort}`,
    };

    const workerStatus: WorkerStatusDto = {
      worker_id: workerId,
      user_id: request.user_id,
      status: 'starting',
      endpoints,
      profile_path: profilePath,
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.workers.set(workerId, workerStatus);

    // Simulate worker startup process
    // In production, this would trigger actual Docker container creation
    this.logger.log(`Worker ${workerId} configuration:`, {
      ports: { novnc: novncPort, cdp: cdpPort, vnc: vncPort },
      profile_path: profilePath,
    });

    // Simulate transition to running state
    setTimeout(() => {
      const worker = this.workers.get(workerId);
      if (worker) {
        worker.status = 'running';
        worker.updated_at = new Date();
        this.workers.set(workerId, worker);
        this.logger.log(`Worker ${workerId} is now running`);
      }
    }, 2000);

    return {
      worker_id: workerId,
      endpoints,
    };
  }

  async getWorker(id: string): Promise<WorkerStatusDto> {
    const worker = this.workers.get(id);
    if (!worker) {
      throw new NotFoundException(`Worker ${id} not found`);
    }
    return worker;
  }

  async deleteWorker(id: string): Promise<{ success: boolean }> {
    const worker = this.workers.get(id);
    if (!worker) {
      throw new NotFoundException(`Worker ${id} not found`);
    }

    this.logger.log(`Deleting worker ${id}`);

    // Update status to stopping
    worker.status = 'stopping';
    worker.updated_at = new Date();
    this.workers.set(id, worker);

    // Simulate shutdown process
    // In production, this would stop the Docker container
    setTimeout(() => {
      this.workers.delete(id);
      this.logger.log(`Worker ${id} removed`);
    }, 1000);

    return { success: true };
  }

  async listWorkers(): Promise<WorkerStatusDto[]> {
    return Array.from(this.workers.values());
  }

  private calculatePortForWorker(workerId: string): number {
    // Simple hash-based port allocation for demo
    // In production, use proper port management
    const hash = workerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return 8000 + (hash % 100) * 10;
  }

  // Method to check if worker is healthy (called by health service)
  isWorkerHealthy(id: string): boolean {
    const worker = this.workers.get(id);
    return worker?.status === 'running';
  }
}