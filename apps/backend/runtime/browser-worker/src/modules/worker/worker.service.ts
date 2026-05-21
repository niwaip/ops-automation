import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as http from 'http';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateWorkerRequestDto,
  CreateWorkerResponseDto,
  WorkerStatusDto,
  WorkerEndpointsDto,
} from '../../dto';
import { getPublicHost, getSessionBrokerUrl } from '../../config/service-endpoints';

const Docker = require('dockerode');

const DEFAULT_DOCKER_SOCKET_PATH = '/var/run/docker.sock';

interface ManagedWorkerStatus extends WorkerStatusDto {
  container_name: string;
  container_ip: string;
  runtime_session_id?: string;
  mode: 'interactive' | 'agent';
  enable_codegen: boolean;
  headless: boolean;
  internal_cdp_url: string;
  internal_codegen_url?: string;
}

interface SessionWorkerOptions {
  userId?: string;
  profilePath?: string;
  mode?: 'interactive' | 'agent';
  enableCodegen?: boolean;
  headless?: boolean;
}

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly workers = new Map<string, ManagedWorkerStatus>();
  private readonly runtimeSessionIndex = new Map<string, string>();
  private readonly dockerSocketPath =
    process.env.DOCKER_SOCKET_PATH || process.env.DOCKER_SOCK || DEFAULT_DOCKER_SOCKET_PATH;
  private readonly docker = new Docker({ socketPath: this.dockerSocketPath });
  private readonly dockerNetworkName = process.env.NETWORK_NAME || 'ops-network';
  private readonly sessionBrowserImage = process.env.SESSION_BROWSER_IMAGE || 'ops-browser-chrome:local';
  private readonly externalHost = getPublicHost();
  private readonly defaultSessionMode =
    process.env.SESSION_DEFAULT_MODE === 'agent' ? 'agent' : 'interactive';
  private readonly defaultEnableCodegen =
    (process.env.SESSION_ENABLE_CODEGEN || 'false').toLowerCase() !== 'false';
  private readonly defaultHeadless =
    (process.env.SESSION_HEADLESS || 'false').toLowerCase() === 'true';
  private readonly sessionBrokerUrl = getSessionBrokerUrl();
  private readonly orphanSweepEnabled =
    (process.env.BROWSER_WORKER_ORPHAN_SWEEP_ENABLED || 'true').toLowerCase() !== 'false';
  private readonly orphanSweepIntervalMs = this.readPositiveInt(
    process.env.BROWSER_WORKER_ORPHAN_SWEEP_INTERVAL_MS,
    30000,
  );
  private readonly orphanSweepRequestTimeoutMs = this.readPositiveInt(
    process.env.BROWSER_WORKER_ORPHAN_SWEEP_REQUEST_TIMEOUT_MS,
    3000,
  );
  private readonly orphanSweepMinIdleMs = this.readPositiveInt(
    process.env.BROWSER_WORKER_ORPHAN_SWEEP_MIN_IDLE_MS,
    90000,
  );
  private orphanSweepTimer?: NodeJS.Timeout;
  private orphanSweepRunning = false;

  onModuleInit() {
    this.logger.log(`Using Docker socket path: ${this.dockerSocketPath}`);
    if (!this.orphanSweepEnabled) {
      this.logger.log('Orphan worker sweep is disabled');
      return;
    }

    this.orphanSweepTimer = setInterval(() => {
      this.sweepOrphanWorkers('periodic').catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Periodic orphan sweep failed: ${errorMessage}`);
      });
    }, this.orphanSweepIntervalMs);

    setTimeout(() => {
      this.sweepOrphanWorkers('startup').catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Startup orphan sweep failed: ${errorMessage}`);
      });
      // Also perform a Docker-level sweep to find containers not in memory (e.g. after service restart)
      this.sweepDockerOrphanContainers().catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Docker orphan container sweep failed: ${errorMessage}`);
      });
    }, 2000);
  }

  private async sweepDockerOrphanContainers(): Promise<void> {
    this.logger.log('Scanning Docker for orphan browser session containers...');
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          name: ['ops-browser-session-'],
        },
      });

      let removedCount = 0;
      for (const containerInfo of containers) {
        // Find the full name (dockerode returns names starting with /)
        const name = containerInfo.Names.find((n: string) => n.includes('ops-browser-session-'))?.replace(/^\//, '');
        if (!name) continue;

        const workerId = name.replace('ops-browser-session-', '');
        
        // If it's not in our memory map, it's an orphan from a previous run
        if (!this.workers.has(workerId)) {
          this.logger.warn(`Found untracked container ${name}, checking if its session still exists...`);
          
          // Use the workerId as runtimeSessionId (fallback logic in ensureSessionWorker)
          const exists = await this.runtimeSessionExists(workerId);
          if (!exists) {
            this.logger.warn(`Removing untracked orphan container ${name}`);
            try {
              const container = this.docker.getContainer(containerInfo.Id);
              await container.remove({ force: true });
              removedCount += 1;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              this.logger.warn(`Failed to remove untracked container ${name}: ${errorMessage}`);
            }
          }
        }
      }

      if (removedCount > 0) {
        this.logger.log(`Docker orphan sweep removed ${removedCount} untracked container(s)`);
      }
    } catch (error) {
      throw error;
    }
  }

  onModuleDestroy() {
    if (this.orphanSweepTimer) {
      clearInterval(this.orphanSweepTimer);
      this.orphanSweepTimer = undefined;
    }
  }

  async createWorker(request: CreateWorkerRequestDto): Promise<CreateWorkerResponseDto> {
    const workerId = uuidv4();
    const containerName = `ops-browser-session-${workerId}`;
    const runtimeSessionId = request.runtime_session_id;
    const profilePath = request.profile_path || `/tmp/browser-profiles/${request.user_id}/${workerId}`;
    const mode = request.mode || this.defaultSessionMode;
    const headless = request.headless ?? (mode === 'agent' ? true : this.defaultHeadless);
    const enableCodegen = request.enable_codegen ?? this.defaultEnableCodegen;
    const effectiveEnableCodegen = headless ? false : enableCodegen;
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
        `SESSION_MODE=${mode}`,
        `HEADLESS=${headless ? 'true' : 'false'}`,
        `ENABLE_CODEGEN=${effectiveEnableCodegen ? 'true' : 'false'}`,
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
      mode,
      enable_codegen: effectiveEnableCodegen,
      headless,
      internal_cdp_url: `http://${containerIp}:9222`,
      internal_codegen_url: effectiveEnableCodegen ? `http://${containerIp}:3011` : undefined,
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
    options?: SessionWorkerOptions,
  ): Promise<WorkerStatusDto> {
    const existingWorkerId = this.runtimeSessionIndex.get(runtimeSessionId);
    if (existingWorkerId) {
      const existingWorker = this.workers.get(existingWorkerId);
      if (existingWorker?.status === 'running') {
        if (!this.requiresWorkerRecreation(existingWorker, options)) {
          return this.getWorker(existingWorkerId);
        }

        this.logger.log(
          `Recreating worker ${existingWorkerId} for runtime ${runtimeSessionId} to apply updated session options`,
        );
        await this.deleteWorker(existingWorkerId).catch((error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to delete outdated worker ${existingWorkerId}: ${errorMessage}`);
        });
      } else if (existingWorker) {
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
      mode: options?.mode,
      enable_codegen: options?.enableCodegen,
      headless: options?.headless,
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

  touchWorkerByRuntimeSessionId(runtimeSessionId: string): void {
    const workerId = this.runtimeSessionIndex.get(runtimeSessionId);
    if (!workerId) {
      return;
    }
    const worker = this.workers.get(workerId);
    if (!worker) {
      return;
    }
    worker.updated_at = new Date();
    this.workers.set(workerId, worker);
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
    if (worker?.internal_codegen_url) {
      return worker.internal_codegen_url;
    }
    if (worker?.enable_codegen === false) {
      return undefined;
    }
    return worker ? `http://${worker.container_ip}:3011` : undefined;
  }

  private requiresWorkerRecreation(
    worker: ManagedWorkerStatus,
    options?: SessionWorkerOptions,
  ): boolean {
    if (!options) {
      return false;
    }

    const requestedMode = options.mode;
    if (requestedMode && worker.mode !== requestedMode) {
      return true;
    }

    const requestedHeadless = options.headless;
    if (typeof requestedHeadless === 'boolean' && worker.headless !== requestedHeadless) {
      return true;
    }

    const effectiveRequestedCodegen = typeof options.enableCodegen === 'boolean'
      ? ((requestedHeadless ?? worker.headless) ? false : options.enableCodegen)
      : undefined;
    if (
      typeof effectiveRequestedCodegen === 'boolean'
      && worker.enable_codegen !== effectiveRequestedCodegen
    ) {
      return true;
    }

    return false;
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
    if (worker.enable_codegen && worker.internal_codegen_url) {
      await this.waitForHttpReady(`${worker.internal_codegen_url}/status`, 30000);
    }
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

  private async readJson<T>(url: string, timeoutMs = 5000): Promise<T> {
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
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`GET ${url} timed out`));
      });
    });
  }

  private async sweepOrphanWorkers(reason: 'startup' | 'periodic'): Promise<void> {
    if (this.orphanSweepRunning) {
      return;
    }

    this.orphanSweepRunning = true;
    try {
      const candidates = Array.from(this.workers.values())
        .filter((worker) => Boolean(worker.runtime_session_id))
        .filter((worker) => {
          const ageMs = Date.now() - worker.updated_at.getTime();
          return ageMs >= this.orphanSweepMinIdleMs;
        })
        .map((worker) => ({
          workerId: worker.worker_id,
          runtimeSessionId: worker.runtime_session_id as string,
        }));
      if (candidates.length === 0) {
        return;
      }
      this.logger.log(`Orphan sweep (${reason}) checking ${candidates.length} worker(s)`);

      let removedCount = 0;
      for (const candidate of candidates) {
        const exists = await this.runtimeSessionExists(candidate.runtimeSessionId);
        if (!exists) {
          this.logger.warn(
            `Removing orphan worker ${candidate.workerId} for missing runtime session ${candidate.runtimeSessionId} (${reason})`,
          );
          await this.deleteWorker(candidate.workerId).catch((error: unknown) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Failed to delete orphan worker ${candidate.workerId}: ${errorMessage}`);
          });
          removedCount += 1;
        }
      }

      if (removedCount > 0) {
        this.logger.log(`Orphan sweep (${reason}) removed ${removedCount} worker(s)`);
      }
    } finally {
      this.orphanSweepRunning = false;
    }
  }

  private async runtimeSessionExists(runtimeSessionId: string): Promise<boolean> {
    const sessionUrl = `${this.sessionBrokerUrl}/runtime-sessions/${runtimeSessionId}`;
    const statusCode = await this.readStatusCode(sessionUrl, this.orphanSweepRequestTimeoutMs);
    if (statusCode === 404) {
      this.logger.warn(`Runtime session ${runtimeSessionId} not found (404), worker can be removed`);
      return false;
    }
    if (statusCode >= 200 && statusCode < 300) {
      try {
        const runtimeSession = await this.readJson<{ state?: string }>(
          sessionUrl,
          this.orphanSweepRequestTimeoutMs,
        );
        if (runtimeSession.state === 'closed') {
          this.logger.warn(
            `Runtime session ${runtimeSessionId} is closed, treating worker as orphan`,
          );
          return false;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to read runtime session ${runtimeSessionId} payload, keeping worker: ${errorMessage}`,
        );
      }
      return true;
    }
    this.logger.warn(
      `Runtime session lookup for ${runtimeSessionId} returned status ${statusCode}, keeping worker`,
    );
    // On transient failures (network/5xx), avoid false positives.
    return true;
  }

  private async readStatusCode(url: string, timeoutMs: number): Promise<number> {
    return new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode || 500);
      });
      req.on('error', () => resolve(0));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve(0);
      });
    });
  }

  private readPositiveInt(input: string | undefined, fallback: number): number {
    if (!input) {
      return fallback;
    }
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }
}
