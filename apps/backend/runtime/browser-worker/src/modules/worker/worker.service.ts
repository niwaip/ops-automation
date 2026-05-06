import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as http from 'http';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateWorkerRequestDto,
  CreateWorkerResponseDto,
  WorkerStatusDto,
  WorkerEndpointsDto,
} from '../../dto';

const Docker = require('dockerode');

interface ManagedWorkerStatus extends WorkerStatusDto {
  container_name: string;
  container_ip: string;
  runtime_session_id?: string;
  internal_cdp_url: string;
  internal_codegen_url: string;
}

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);
  private readonly workers = new Map<string, ManagedWorkerStatus>();
  private readonly runtimeSessionIndex = new Map<string, string>();
  private readonly docker = new Docker({ socketPath: '/var/run/docker.sock' });
  private readonly dockerNetworkName = process.env.NETWORK_NAME || 'ops-network';
  private readonly sessionBrowserImage = process.env.SESSION_BROWSER_IMAGE || 'ops-browser-chrome:local';
  private readonly externalHost = process.env.EXTERNAL_HOST || process.env.HOST_IP || 'localhost';

  async createWorker(request: CreateWorkerRequestDto): Promise<CreateWorkerResponseDto> {
    const workerId = uuidv4();
    const containerName = `ops-browser-session-${workerId}`;
    const runtimeSessionId = request.runtime_session_id;
    const profilePath = request.profile_path || `/tmp/browser-profiles/${request.user_id}/${workerId}`;
    this.logger.log(`Creating browser worker ${workerId} for user ${request.user_id}`);

    const container = await this.docker.createContainer({
      Image: this.sessionBrowserImage,
      name: containerName,
      Cmd: ['/start-recorder.sh'],
      Env: [
        'SCREEN_WIDTH=1920',
        'SCREEN_HEIGHT=1080',
        'SCREEN_DEPTH=24',
        'NOVNC_PORT=8080',
        'VNC_PORT=5900',
        'CHROME_DEBUG_PORT=9222',
        'CODEGEN_API_PORT=3011',
        `CHROME_PROFILE_PATH=${profilePath}`,
      ],
      ExposedPorts: {
        '8080/tcp': {},
        '9222/tcp': {},
      },
      HostConfig: {
        AutoRemove: true,
        PortBindings: {
          '8080/tcp': [{ HostPort: '' }],
          '9222/tcp': [{ HostPort: '' }],
        },
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [this.dockerNetworkName]: {
            Aliases: [containerName],
          },
        },
      },
    });

    await container.start();
    const inspect = await container.inspect();
    const endpoints = this.resolvePublishedEndpoints(inspect);
    const containerIp = this.resolveContainerIp(inspect);
    const now = new Date();
    const workerStatus: ManagedWorkerStatus = {
      worker_id: workerId,
      user_id: request.user_id,
      status: 'starting',
      endpoints,
      profile_path: profilePath,
      created_at: now,
      updated_at: now,
      container_name: containerName,
      container_ip: containerIp,
      runtime_session_id: runtimeSessionId,
      internal_cdp_url: `http://${containerIp}:9222`,
      internal_codegen_url: `http://${containerIp}:3011`,
    };

    this.workers.set(workerId, workerStatus);
    if (runtimeSessionId) {
      this.runtimeSessionIndex.set(runtimeSessionId, workerId);
    }

    try {
      await this.waitForWorkerReady(workerStatus);
      workerStatus.status = 'running';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Worker ${workerId} failed to start: ${errorMessage}`);
      try {
        await container.remove({ force: true });
      } catch (removeError) {
        const removeErrorMessage = removeError instanceof Error ? removeError.message : String(removeError);
        this.logger.warn(`Failed to remove errored worker container ${containerName}: ${removeErrorMessage}`);
      }
      if (runtimeSessionId) {
        this.runtimeSessionIndex.delete(runtimeSessionId);
      }
      this.workers.delete(workerId);
      throw new Error(`Failed to start browser worker: ${errorMessage}`);
    }

    workerStatus.updated_at = new Date();
    this.workers.set(workerId, workerStatus);
    this.logger.log(`Worker ${workerId} is now ${workerStatus.status} for runtime ${runtimeSessionId || 'n/a'}`);

    return {
      worker_id: workerId,
      endpoints: workerStatus.endpoints,
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
    worker.status = 'stopping';
    worker.updated_at = new Date();
    this.workers.set(id, worker);
    try {
      const container = this.docker.getContainer(worker.container_name);
      await container.remove({ force: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to remove container ${worker.container_name}: ${errorMessage}`);
    }

    if (worker.runtime_session_id) {
      this.runtimeSessionIndex.delete(worker.runtime_session_id);
    }
    this.workers.delete(id);
    this.logger.log(`Worker ${id} removed`);

    return { success: true };
  }

  async listWorkers(): Promise<WorkerStatusDto[]> {
    return Array.from(this.workers.values());
  }

  async ensureSessionWorker(
    runtimeSessionId: string,
    options?: { userId?: string; profilePath?: string },
  ): Promise<WorkerStatusDto> {
    const existingWorkerId = this.runtimeSessionIndex.get(runtimeSessionId);
    if (existingWorkerId) {
      const existingWorker = this.workers.get(existingWorkerId);
      if (existingWorker?.status === 'running') {
        return this.getWorker(existingWorkerId);
      }

      if (existingWorker) {
        this.logger.warn(
          `Existing worker ${existingWorkerId} for runtime ${runtimeSessionId} is ${existingWorker.status}, recreating`,
        );
        await this.deleteWorker(existingWorkerId).catch((error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to delete stale worker ${existingWorkerId}: ${errorMessage}`);
        });
      } else {
        this.runtimeSessionIndex.delete(runtimeSessionId);
      }
    }

    const created = await this.createWorker({
      user_id: options?.userId || `runtime-${runtimeSessionId}`,
      profile_path: options?.profilePath,
      runtime_session_id: runtimeSessionId,
    });
    return this.getWorker(created.worker_id);
  }

  async getWorkerByRuntimeSessionId(runtimeSessionId: string): Promise<WorkerStatusDto | null> {
    const workerId = this.runtimeSessionIndex.get(runtimeSessionId);
    if (!workerId) {
      return null;
    }
    return this.getWorker(workerId);
  }

  getInternalCdpUrl(runtimeSessionId: string): string | undefined {
    const workerId = this.runtimeSessionIndex.get(runtimeSessionId);
    const worker = workerId ? this.workers.get(workerId) : undefined;
    return worker?.internal_cdp_url;
  }

  getPublicCdpHttpUrl(runtimeSessionId: string): string | undefined {
    const workerId = this.runtimeSessionIndex.get(runtimeSessionId);
    const worker = workerId ? this.workers.get(workerId) : undefined;
    if (worker?.internal_cdp_url) {
      return worker.internal_cdp_url;
    }

    const cdpUrl = worker?.endpoints?.cdp;
    return cdpUrl ? cdpUrl.replace(/^ws:\/\//, 'http://') : undefined;
  }

  async getPublicDebuggerWsUrl(runtimeSessionId: string): Promise<string | undefined> {
    const cdpHttpUrl = this.getPublicCdpHttpUrl(runtimeSessionId);
    if (!cdpHttpUrl) {
      return undefined;
    }

    try {
      const response = await this.readJson<{ webSocketDebuggerUrl?: string }>(
        `${cdpHttpUrl}/json/version`,
      );
      return response?.webSocketDebuggerUrl;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to resolve debugger websocket URL for session ${runtimeSessionId}: ${errorMessage}`,
      );
      return undefined;
    }
  }

  getInternalCodegenUrl(runtimeSessionId: string): string | undefined {
    const workerId = this.runtimeSessionIndex.get(runtimeSessionId);
    const worker = workerId ? this.workers.get(workerId) : undefined;
    return worker?.internal_codegen_url;
  }

  // Method to check if worker is healthy (called by health service)
  isWorkerHealthy(id: string): boolean {
    const worker = this.workers.get(id);
    return worker?.status === 'running';
  }

  private resolvePublishedEndpoints(inspect: any): WorkerEndpointsDto {
    const cdpHostPort = inspect?.NetworkSettings?.Ports?.['9222/tcp']?.[0]?.HostPort;
    const novncHostPort = inspect?.NetworkSettings?.Ports?.['8080/tcp']?.[0]?.HostPort;

    if (!cdpHostPort) {
      throw new Error('CDP host port was not published for worker container');
    }

    return {
      cdp: `ws://${this.externalHost}:${cdpHostPort}`,
      novnc: novncHostPort ? `http://${this.externalHost}:${novncHostPort}/vnc.html` : undefined,
    };
  }

  private resolveContainerIp(inspect: any): string {
    const containerIp = inspect?.NetworkSettings?.Networks?.[this.dockerNetworkName]?.IPAddress;
    if (!containerIp) {
      throw new Error(`Container IP not found on network ${this.dockerNetworkName}`);
    }

    return containerIp;
  }

  private async waitForWorkerReady(worker: ManagedWorkerStatus): Promise<void> {
    await this.waitForHttpReady(`${worker.internal_cdp_url}/json/version`, 30000);
    await this.waitForHttpReady(`${worker.internal_codegen_url}/status`, 30000);
  }

  private async waitForHttpReady(url: string, timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const ok = await this.checkHttp(url);
      if (ok) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Timed out waiting for worker endpoint: ${url}`);
  }

  private async checkHttp(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve((res.statusCode || 500) < 500);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private async readJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const statusCode = res.statusCode || 500;
          const body = Buffer.concat(chunks).toString('utf8');
          if (statusCode >= 400) {
            reject(new Error(`GET ${url} failed with status ${statusCode}: ${body}`));
            return;
          }

          try {
            resolve(JSON.parse(body) as T);
          } catch (error) {
            reject(
              error instanceof Error
                ? error
                : new Error(`Failed to parse JSON response from ${url}`),
            );
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.destroy(new Error(`GET ${url} timed out`));
      });
    });
  }
}
