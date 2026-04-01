import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../lock/redis.service';
import { WorkerEndpoints, WorkerInfo } from '../../interfaces';

// Worker pool key patterns
const WORKER_POOL_AVAILABLE = 'worker:pool:available';
const WORKER_BUSY_PREFIX = 'worker:pool:busy:';
const WORKER_HEARTBEAT_PREFIX = 'worker:heartbeat:';

@Injectable()
export class AllocationService {
  private readonly logger = new Logger(AllocationService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Get an available worker from the pool
   * Uses SPOP to atomically remove a worker from the available set
   */
  async allocateWorker(sessionId: string): Promise<WorkerInfo | null> {
    // Try to get an available worker
    const workerRef = await this.redisService.spop(WORKER_POOL_AVAILABLE);

    if (!workerRef) {
      this.logger.warn('No available workers in pool');
      return null;
    }

    // Mark worker as busy
    const busyKey = `${WORKER_BUSY_PREFIX}${workerRef}`;
    await this.redisService.set(busyKey, sessionId, 86400);

    // Generate endpoints for this worker
    const endpoints = this.generateWorkerEndpoints(workerRef);

    this.logger.log(`Worker allocated: worker=${workerRef}, session=${sessionId}`);

    return {
      worker_id: workerRef,
      status: 'busy',
      session_id: sessionId,
      endpoints,
    };
  }

  /**
   * Return a worker to the pool
   */
  async releaseWorker(workerRef: string): Promise<boolean> {
    const busyKey = `${WORKER_BUSY_PREFIX}${workerRef}`;

    // Remove busy state
    await this.redisService.del(busyKey);

    // Add back to available pool
    await this.redisService.sadd(WORKER_POOL_AVAILABLE, [workerRef]);

    this.logger.log(`Worker released: worker=${workerRef}`);
    return true;
  }

  /**
   * Get worker info
   */
  async getWorkerInfo(workerRef: string): Promise<WorkerInfo | null> {
    const busyKey = `${WORKER_BUSY_PREFIX}${workerRef}`;
    const sessionId = await this.redisService.get(busyKey);
    const heartbeat = await this.redisService.get(`${WORKER_HEARTBEAT_PREFIX}${workerRef}`);

    const status: 'available' | 'busy' | 'error' = sessionId ? 'busy' : 'available';
    const endpoints = this.generateWorkerEndpoints(workerRef);

    return {
      worker_id: workerRef,
      status,
      session_id: sessionId || undefined,
      endpoints,
      last_heartbeat: heartbeat ? parseInt(heartbeat, 10) : undefined,
    };
  }

  /**
   * Check worker health (heartbeat)
   */
  async checkWorkerHealth(workerRef: string): Promise<boolean> {
    const heartbeat = await this.redisService.get(`${WORKER_HEARTBEAT_PREFIX}${workerRef}`);
    if (!heartbeat) {
      return false;
    }

    const lastHeartbeat = parseInt(heartbeat, 10);
    const now = Date.now();
    const threshold = 30000; // 30 seconds

    return (now - lastHeartbeat) < threshold;
  }

  /**
   * Update worker heartbeat
   */
  async updateHeartbeat(workerRef: string): Promise<void> {
    const heartbeatKey = `${WORKER_HEARTBEAT_PREFIX}${workerRef}`;
    await this.redisService.set(heartbeatKey, String(Date.now()), 30);
  }

  /**
   * Get count of available workers
   */
  async getAvailableWorkerCount(): Promise<number> {
    const members = await this.redisService.smembers(WORKER_POOL_AVAILABLE);
    return members.length;
  }

  /**
   * Initialize worker pool (for testing/setup)
   */
  async initializeWorkerPool(workerIds: string[]): Promise<void> {
    await this.redisService.sadd(WORKER_POOL_AVAILABLE, workerIds);
    this.logger.log(`Worker pool initialized with ${workerIds.length} workers`);
  }

  /**
   * Generate worker endpoints based on worker reference
   * In production, this would be based on actual Kubernetes pod info
   */
  private generateWorkerEndpoints(workerRef: string): WorkerEndpoints {
    // Extract worker number from reference (e.g., "worker-1" -> 1)
    const workerNum = parseInt(workerRef.replace(/worker-/, '').replace(/pod-/, ''), 10) || 0;

    // Calculate ports based on worker number
    const baseNovncPort = 8080;
    const baseCdpPort = 9222;
    const baseVncPort = 5900;

    return {
      novnc: `http://10.0.0.${workerNum + 1}:${baseNovncPort}/vnc.html`,
      cdp: `ws://10.0.0.${workerNum + 1}:${baseCdpPort}`,
      vnc: `vnc://10.0.0.${workerNum + 1}:${baseVncPort}`,
    };
  }
}