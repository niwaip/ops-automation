import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../lock/redis.service';
import { getBrowserWorkerUrl } from '../../config/service-endpoints';
import { WorkerEndpoints, WorkerInfo } from '../../interfaces/session.interface';

@Injectable()
export class AllocationService implements OnModuleInit {
  private readonly logger = new Logger(AllocationService.name);
  private readonly browserWorkerUrl = getBrowserWorkerUrl('http://ops-browser-worker:3004');

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    this.logger.log('Allocation service running in dynamic per-session worker mode');
  }

  /**
   * Allocate an isolated browser worker for the session.
   */
  async allocateWorker(sessionId: string, userId: string = 'system'): Promise<WorkerInfo | null> {
    try {
      // #region debug-point A:allocate-worker
      (() => {
        fetch('http://192.168.100.143:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'approval-test-no-approve',
            runId: 'pre-fix',
            hypothesisId: 'A',
            location: 'allocation.service.ts:22',
            msg: '[DEBUG] allocateWorker start',
            data: { sessionId, userId },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion
      const created = await this.postJson<{
        worker_id: string;
        endpoints?: WorkerEndpoints;
      }>('/workers', {
        user_id: userId,
        runtime_session_id: sessionId,
      });

      const endpoints = created.endpoints
        ? {
            cdp: created.endpoints.cdp,
            vnc: created.endpoints.vnc,
            novnc: created.endpoints.novnc,
          }
        : undefined;

      this.logger.log(`Worker allocated: worker=${created.worker_id}, session=${sessionId}`);
      // #region debug-point A:allocate-worker-result
      (() => {
        fetch('http://192.168.100.143:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'approval-test-no-approve',
            runId: 'pre-fix',
            hypothesisId: 'A',
            location: 'allocation.service.ts:39',
            msg: '[DEBUG] allocateWorker success',
            data: { sessionId, workerId: created.worker_id, hasEndpoints: Boolean(endpoints) },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion

      return {
        worker_id: created.worker_id,
        status: 'busy',
        session_id: sessionId,
        endpoints,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to allocate worker for session ${sessionId}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Destroy the isolated browser worker for the session.
   */
  async releaseWorker(workerRef: string): Promise<boolean> {
    try {
      // #region debug-point B:release-worker
      (() => {
        fetch('http://192.168.100.143:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'approval-test-no-approve',
            runId: 'pre-fix',
            hypothesisId: 'B',
            location: 'allocation.service.ts:59',
            msg: '[DEBUG] releaseWorker start',
            data: { workerRef },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion
      await this.deleteJson(`/workers/${workerRef}`);
      this.logger.log(`Worker released: worker=${workerRef}`);
      // #region debug-point B:release-worker-result
      (() => {
        fetch('http://192.168.100.143:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'approval-test-no-approve',
            runId: 'pre-fix',
            hypothesisId: 'B',
            location: 'allocation.service.ts:62',
            msg: '[DEBUG] releaseWorker success',
            data: { workerRef },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // #region debug-point B:release-worker-error
      (() => {
        fetch('http://192.168.100.143:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'approval-test-no-approve',
            runId: 'pre-fix',
            hypothesisId: 'B',
            location: 'allocation.service.ts:66',
            msg: '[DEBUG] releaseWorker error',
            data: { workerRef, errorMessage },
            ts: Date.now(),
          }),
        }).catch(() => {});
      })();
      // #endregion
      this.logger.warn(`Failed to release worker ${workerRef}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Get worker info
   */
  async getWorkerInfo(
    workerRef: string,
    includeNoVnc: boolean = false
  ): Promise<WorkerInfo | null> {
    try {
      const worker = await this.getJson<{
        worker_id: string;
        status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
        endpoints?: WorkerEndpoints;
      }>(`/workers/${workerRef}`);

      return {
        worker_id: worker.worker_id,
        status:
          worker.status === 'running' ? 'busy' : worker.status === 'error' ? 'error' : 'available',
        endpoints: worker.endpoints
          ? {
              cdp: worker.endpoints.cdp,
              novnc: includeNoVnc ? worker.endpoints.novnc : undefined,
              vnc: worker.endpoints.vnc,
            }
          : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to get worker info ${workerRef}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Check worker health (heartbeat)
   */
  async checkWorkerHealth(workerRef: string): Promise<boolean> {
    return (await this.getWorkerInfo(workerRef)) !== null;
  }

  /**
   * Update worker heartbeat
   */
  async updateHeartbeat(workerRef: string): Promise<void> {
    await this.redisService.set(`worker:heartbeat:${workerRef}`, String(Date.now()), 30);
  }

  /**
   * Get count of available workers
   */
  async getAvailableWorkerCount(): Promise<number> {
    return 999;
  }

  /**
   * Initialize worker pool (for testing/setup)
   */
  async initializeWorkerPool(workerIds: string[]): Promise<void> {
    this.logger.log(
      `Dynamic worker mode active, initializeWorkerPool ignored for ${workerIds.length} ids`
    );
  }

  private async postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.browserWorkerUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `Request failed with status ${response.status}`);
    }
    return JSON.parse(text) as T;
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.browserWorkerUrl}${path}`);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `Request failed with status ${response.status}`);
    }
    return JSON.parse(text) as T;
  }

  private async deleteJson(path: string): Promise<void> {
    const response = await fetch(`${this.browserWorkerUrl}${path}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed with status ${response.status}`);
    }
  }
}
