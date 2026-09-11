import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  UserSandboxStatus,
  UserSandboxState,
  UserSandboxLaunchOptions,
} from './user-sandbox.interface';
import { UserSandboxStorageService } from './user-sandbox-storage.service';

const Docker = require('dockerode');

const DEFAULT_DOCKER_SOCKET = '/var/run/docker.sock';
const DEFAULT_IMAGE_NAME = 'ops-user-sandbox:local';
const DEFAULT_SANDBOX_NETWORK = 'ops-sandbox-network';
const FORBIDDEN_ENV_PREFIXES = [
  'WORKFLOW_',
  'DATABASE_',
  'POSTGRES_',
  'REDIS_',
  'TEMPORAL_',
  'AUTH_SECRET',
  'INTERNAL_API_',
];
const DEFAULT_INTERNAL_API_SHARED_SECRET = 'ops_internal_shared_secret_change_me';

@Injectable()
export class UserSandboxContainerService {
  private readonly logger = new Logger(UserSandboxContainerService.name);
  private readonly docker: any;
  private readonly sandboxNetworkName: string;
  private readonly sandboxImage: string;
  private readonly aiOrchestratorHost: string;
  private readonly aiOrchestratorPort: string;
  private readonly lastActiveMap = new Map<string, number>();

  constructor(private readonly storageService: UserSandboxStorageService) {
    const socketPath = process.env.DOCKER_SOCKET_PATH || process.env.DOCKER_SOCK || DEFAULT_DOCKER_SOCKET;
    this.docker = new Docker({ socketPath });
    this.sandboxNetworkName = process.env.SANDBOX_NETWORK_NAME || DEFAULT_SANDBOX_NETWORK;
    this.sandboxImage = process.env.USER_SANDBOX_IMAGE || DEFAULT_IMAGE_NAME;
    this.aiOrchestratorHost = process.env.AI_ORCHESTRATOR_HOST || 'ops-ai-orchestrator';
    this.aiOrchestratorPort = process.env.AI_ORCHESTRATOR_PORT || '3007';
  }

  getDockerClient(): any {
    return this.docker;
  }

  getContainerName(userId: string): string {
    const sanitized = this.storageService.sanitizeUserId(userId);
    return `ops-user-sandbox-${sanitized}`;
  }

  recordActivity(userId: string): void {
    try {
      const sanitized = this.storageService.sanitizeUserId(userId);
      this.lastActiveMap.set(sanitized, Date.now());
    } catch {
      // ignore
    }
  }

  deleteActivity(userId: string): void {
    try {
      const sanitized = this.storageService.sanitizeUserId(userId);
      this.lastActiveMap.delete(sanitized);
    } catch {
      // ignore
    }
  }

  async findContainer(containerName: string): Promise<any | null> {
    try {
      const container = this.docker.getContainer(containerName);
      await container.inspect();
      return container;
    } catch (err: any) {
      if (err.statusCode === 404) {
        return null;
      }
      this.logger.warn(`Error inspecting container ${containerName}: ${err.message}`);
      return null;
    }
  }

  /**
   * 环境变量安全过滤与内部模型代理注入
   * 严禁将管理员真实 API Key 注入容器，强制使用内部代理路由与虚拟用户 Token
   */
  sanitizeEnvironment(userId: string, options: UserSandboxLaunchOptions): string[] {
    const sanitized = this.storageService.sanitizeUserId(userId);
    const proxyBaseUrl = `http://${this.aiOrchestratorHost}:${this.aiOrchestratorPort}/ai/proxy/v1`;
    const sharedSecret =
      process.env.INTERNAL_API_SHARED_SECRET ||
      process.env.INTERNAL_API_SECRET ||
      DEFAULT_INTERNAL_API_SHARED_SECRET;
    const signature = crypto.createHmac('sha256', sharedSecret).update(sanitized).digest('base64url');
    const virtualUserToken = `sandbox-user-token-${sanitized}.${signature}`;

    const envList: string[] = [
      'USER_MODE=personal',
      'WORKSPACE=/workspace',
      'KNOWLEDGE_DIR=/knowledge',
      'DSH_PLUGIN_DIR=/opt/dsh/plugins',
      'DSH_SKILL_DIR=/opt/dsh/skills',
      'DSH_CUSTOM_SKILL_DIR=/knowledge/skills',
      'TZ=Asia/Shanghai',
      'LANG=C.UTF-8',
      'LC_ALL=C.UTF-8',
      'PYTHONIOENCODING=utf-8',
      `DEEPSEEK_BASE_URL=${proxyBaseUrl}`,
      `DEEPSEEK_API_KEY=${virtualUserToken}`,
      `OPENAI_BASE_URL=${proxyBaseUrl}`,
      `OPENAI_API_KEY=${virtualUserToken}`,
    ];

    if (options.customEnv) {
      for (const [k, v] of Object.entries(options.customEnv)) {
        const upper = k.toUpperCase();
        const isForbidden =
          FORBIDDEN_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix)) ||
          upper === 'DEEPSEEK_API_KEY' ||
          upper === 'OPENAI_API_KEY' ||
          upper === 'DEEPSEEK_BASE_URL' ||
          upper === 'OPENAI_BASE_URL';

        if (isForbidden) {
          this.logger.warn(`Suppressed forbidden environment variable injection: ${k}`);
          continue;
        }
        envList.push(`${k}=${v}`);
      }
    }

    return envList;
  }

  mapInspectToStatus(
    userId: string,
    containerName: string,
    paths: { workspace: string; knowledge: string },
    inspect: any
  ): UserSandboxStatus {
    const state = inspect.State;
    let status: UserSandboxState = 'stopped';
    if (state.Running) status = 'running';
    else if (state.Paused) status = 'paused';
    else if (state.ExitCode !== 0 && state.ExitCode !== undefined) status = 'error';

    const netConfig = inspect.NetworkSettings?.Networks?.[this.sandboxNetworkName];
    const internalIp = netConfig?.IPAddress;

    const sanitizedUserId = this.storageService.sanitizeUserId(userId);
    const lastActiveTime = this.lastActiveMap.get(sanitizedUserId);
    const quota = this.storageService.getUserQuota(userId);

    return {
      userId,
      containerId: inspect.Id,
      containerName,
      status,
      workspacePath: paths.workspace,
      knowledgePath: paths.knowledge,
      endpoints: {
        internalIp,
      },
      createdAt: inspect.Created,
      lastActiveAt: lastActiveTime ? new Date(lastActiveTime).toISOString() : undefined,
      cpuLimit: inspect.HostConfig?.CpuQuota ? inspect.HostConfig.CpuQuota / 100000 : quota.cpuLimit,
      memoryLimitMb: inspect.HostConfig?.Memory ? inspect.HostConfig.Memory / (1024 * 1024) : quota.memoryLimitMb,
    };
  }

  async ensureUserSandbox(
    userId: string,
    options: UserSandboxLaunchOptions = {}
  ): Promise<UserSandboxStatus> {
    this.recordActivity(userId);
    const containerName = this.getContainerName(userId);
    const paths = this.storageService.getUserWorkspacePaths(userId);

    this.logger.log(`Ensuring user sandbox for [${userId}], container: ${containerName}`);

    const existing = await this.findContainer(containerName);

    if (existing) {
      const inspect = await existing.inspect();
      const state = inspect.State;

      if (state.Running) {
        this.logger.log(`Container ${containerName} is already running.`);
        return this.mapInspectToStatus(userId, containerName, paths, inspect);
      }

      if (state.Paused) {
        this.logger.log(`Unpausing container ${containerName}...`);
        await existing.unpause();
        const freshInspect = await existing.inspect();
        return this.mapInspectToStatus(userId, containerName, paths, freshInspect);
      }

      this.logger.log(`Starting stopped container ${containerName}...`);
      await existing.start();
      const freshInspect = await existing.inspect();
      return this.mapInspectToStatus(userId, containerName, paths, freshInspect);
    }

    this.logger.log(`Creating fresh immutable sandbox container ${containerName} from image ${this.sandboxImage}`);

    const safeEnv = this.sanitizeEnvironment(userId, options);
    const userQuota = this.storageService.getUserQuota(userId);
    const cpuLimit = options.cpuLimit || userQuota.cpuLimit;
    const memoryLimitMb = options.memoryLimitMb || userQuota.memoryLimitMb;

    const containerOptions = {
      Image: this.sandboxImage,
      name: containerName,
      Tty: true,
      OpenStdin: true,
      Env: safeEnv,
      HostConfig: {
        Binds: [
          `${paths.workspace}:/workspace:rw`,
          `${paths.knowledge}:/knowledge:rw`,
          `${paths.sharedPlugins}:/opt/dsh/plugins:ro`,
          `${paths.sharedSkills}:/opt/dsh/skills:ro`,
          ...(paths.dshModules ? [`${paths.dshModules}:/usr/local/bin/dsh_modules:ro`] : []),
        ],
        Memory: memoryLimitMb * 1024 * 1024,
        CpuQuota: cpuLimit * 100000,
        CpuPeriod: 100000,
        RestartPolicy: { Name: 'unless-stopped' },
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [this.sandboxNetworkName]: {
            Aliases: [containerName],
          },
        },
      },
    };

    try {
      const container = await this.docker.createContainer(containerOptions);
      await container.start();
      const freshInspect = await container.inspect();
      this.logger.log(`Container ${containerName} launched successfully.`);
      return this.mapInspectToStatus(userId, containerName, paths, freshInspect);
    } catch (err: any) {
      this.logger.error(`Failed to create/start sandbox ${containerName}: ${err.message}`, err.stack);
      throw new BadRequestException(`沙箱启动失败: ${err.message}`);
    }
  }

  async freezeUserSandbox(userId: string): Promise<UserSandboxStatus> {
    const containerName = this.getContainerName(userId);
    const paths = this.storageService.getUserWorkspacePaths(userId);
    const container = await this.findContainer(containerName);

    if (!container) {
      throw new NotFoundException(`用户沙箱容器 ${containerName} 不存在`);
    }

    const inspect = await container.inspect();
    if (inspect.State.Running) {
      this.logger.log(`Stopping container ${containerName} for freezing...`);
      await container.stop({ t: 5 });
    }
    this.deleteActivity(userId);

    const freshInspect = await container.inspect();
    return this.mapInspectToStatus(userId, containerName, paths, freshInspect);
  }

  async stopUserSandbox(userId: string): Promise<UserSandboxStatus> {
    return this.freezeUserSandbox(userId);
  }

  async getUserSandboxStatus(userId: string): Promise<UserSandboxStatus> {
    const containerName = this.getContainerName(userId);
    const paths = this.storageService.getUserWorkspacePaths(userId);
    const container = await this.findContainer(containerName);

    if (!container) {
      return {
        userId,
        containerName,
        status: 'not_found',
        workspacePath: paths.workspace,
        knowledgePath: paths.knowledge,
      };
    }

    const inspect = await container.inspect();
    return this.mapInspectToStatus(userId, containerName, paths, inspect);
  }

  async listAllUserSandboxes(): Promise<UserSandboxStatus[]> {
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          name: ['ops-user-sandbox-'],
        },
      });

      const list: UserSandboxStatus[] = [];
      for (const c of containers) {
        const rawNames: string[] = c.Names || [];
        const fullName = rawNames.map((n) => n.replace(/^\//, '')).find((n) => n.startsWith('ops-user-sandbox-'));
        if (!fullName) continue;

        const userId = fullName.replace('ops-user-sandbox-', '');
        const paths = this.storageService.getUserWorkspacePaths(userId);

        let status: UserSandboxState = 'stopped';
        if (c.State === 'running') status = 'running';
        else if (c.State === 'paused') status = 'paused';
        else if (c.State === 'exited') status = 'stopped';
        else status = 'error';

        const net = c.NetworkSettings?.Networks?.[this.sandboxNetworkName];
        const sanitizedUserId = this.storageService.sanitizeUserId(userId);
        const lastActiveTime = this.lastActiveMap.get(sanitizedUserId);
        const quota = this.storageService.getUserQuota(userId);

        list.push({
          userId,
          containerId: c.Id,
          containerName: fullName,
          status,
          workspacePath: paths.workspace,
          knowledgePath: paths.knowledge,
          endpoints: {
            internalIp: net?.IPAddress,
          },
          createdAt: new Date(c.Created * 1000).toISOString(),
          lastActiveAt: lastActiveTime ? new Date(lastActiveTime).toISOString() : undefined,
          cpuLimit: quota.cpuLimit,
          memoryLimitMb: quota.memoryLimitMb,
        });
      }
      return list;
    } catch (err: any) {
      this.logger.warn(`Failed to list user sandboxes: ${err.message}`);
      return [];
    }
  }

  async recreateUserSandbox(userId: string, options?: UserSandboxLaunchOptions): Promise<UserSandboxStatus> {
    this.logger.log(`Recreating user sandbox for [${userId}] to apply latest image/config...`);
    await this.destroyUserSandbox(userId);
    return this.ensureUserSandbox(userId, options);
  }

  async destroyUserSandbox(userId: string): Promise<boolean> {
    this.deleteActivity(userId);
    const containerName = this.getContainerName(userId);
    const container = await this.findContainer(containerName);
    if (!container) return false;

    try {
      await container.remove({ force: true });
      this.logger.log(`Destroyed container ${containerName}`);
      return true;
    } catch (err: any) {
      this.logger.warn(`Failed to destroy container ${containerName}: ${err.message}`);
      return false;
    }
  }

  async reconcileDefaultQuotas(): Promise<void> {
    try {
      const sandboxes = await this.listAllUserSandboxes();
      for (const sb of sandboxes) {
        if (sb.status !== 'running') continue;
        const quota = this.storageService.getUserQuota(sb.userId);
        const container = await this.findContainer(sb.containerName);
        if (container) {
          try {
            await container.update({
              CpuQuota: Math.round(quota.cpuLimit * 100000),
              CpuPeriod: 100000,
              Memory: Math.round(quota.memoryLimitMb * 1024 * 1024),
            });
            this.logger.log(
              `Reconciled container ${sb.containerName} to quota: ${quota.cpuLimit} CPU, ${quota.memoryLimitMb} MB RAM`
            );
          } catch (err: any) {
            this.logger.warn(`Failed to reconcile quota for ${sb.containerName}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Error during sandbox quota reconciliation: ${err.message}`);
    }
  }

  async checkAndFreezeIdleSandboxes(idleTimeoutMinutes: number): Promise<void> {
    const idleTimeoutMs = idleTimeoutMinutes * 60 * 1000;
    if (idleTimeoutMs <= 0) return;

    try {
      const sandboxes = await this.listAllUserSandboxes();
      const now = Date.now();

      for (const sb of sandboxes) {
        if (sb.status !== 'running') continue;
        const sanitizedId = this.storageService.sanitizeUserId(sb.userId);
        const lastActive = this.lastActiveMap.get(sanitizedId);

        if (!lastActive) {
          this.lastActiveMap.set(sanitizedId, now);
          continue;
        }

        if (now - lastActive >= idleTimeoutMs) {
          const idleMins = Math.round((now - lastActive) / 60000);
          this.logger.log(
            `User sandbox [${sb.userId}] has been idle for ${idleMins}m (>= ${idleTimeoutMinutes}m). Auto-freezing container to release system resources...`
          );
          try {
            await this.freezeUserSandbox(sb.userId);
            this.lastActiveMap.delete(sanitizedId);
          } catch (err: any) {
            this.logger.warn(`Failed to auto-freeze idle sandbox [${sb.userId}]: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Error during idle sandbox inspection: ${err.message}`);
    }
  }
}
