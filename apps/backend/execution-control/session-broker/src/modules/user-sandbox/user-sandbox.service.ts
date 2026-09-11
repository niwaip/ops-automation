import {
  Injectable,
  Logger,
  Optional,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  UserSandboxStatus,
  UserSandboxLaunchOptions,
  UserSandboxExecResult,
  UserSandboxHarnessResult,
} from './user-sandbox.interface';
import { UserSandboxStorageService, UserWorkspacePaths, UserSandboxQuota } from './user-sandbox-storage.service';
import { UserSandboxContainerService } from './user-sandbox-container.service';
import { UserSandboxHarnessService } from './user-sandbox-harness.service';

@Injectable()
export class UserSandboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserSandboxService.name);
  private readonly storageService: UserSandboxStorageService;
  private readonly containerService: UserSandboxContainerService;
  private readonly harnessService: UserSandboxHarnessService;
  private readonly idleTimeoutMinutes: number;
  private idleCheckTimer: NodeJS.Timeout | null = null;

  constructor(
    @Optional() storageService?: UserSandboxStorageService,
    @Optional() containerService?: UserSandboxContainerService,
    @Optional() harnessService?: UserSandboxHarnessService
  ) {
    this.storageService = storageService || new UserSandboxStorageService();
    this.containerService =
      containerService || new UserSandboxContainerService(this.storageService);
    this.harnessService =
      harnessService ||
      new UserSandboxHarnessService(this.storageService, this.containerService);

    this.idleTimeoutMinutes = Math.max(
      0,
      parseInt(process.env.USER_SANDBOX_IDLE_TIMEOUT_MINUTES || '30', 10) || 30
    );
  }

  get lastActiveMap(): Map<string, number> {
    return (this.containerService as any).lastActiveMap;
  }

  onModuleInit() {
    if (this.idleTimeoutMinutes > 0) {
      this.logger.log(
        `User sandbox auto-idle cleanup enabled: timeout = ${this.idleTimeoutMinutes}m`
      );
      this.idleCheckTimer = setInterval(() => {
        void this.checkAndFreezeIdleSandboxes();
      }, 60 * 1000);
      if (this.idleCheckTimer?.unref) {
        this.idleCheckTimer.unref();
      }
    } else {
      this.logger.log('User sandbox auto-idle cleanup disabled (always stay warm)');
    }

    // 自动巡检运行中容器，对旧规格进行平滑对齐
    void this.reconcileDefaultQuotas();
  }

  onModuleDestroy() {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
  }

  getUserConfigPath(userId: string): string {
    return this.storageService.getUserConfigPath(userId);
  }

  getUserQuota(userId: string): UserSandboxQuota {
    return this.storageService.getUserQuota(userId);
  }

  async setUserQuota(
    userId: string,
    quota: { cpuLimit?: number; memoryLimitMb?: number }
  ): Promise<UserSandboxStatus> {
    const updated = this.storageService.writeUserQuota(userId, quota);
    const containerName = this.getContainerName(userId);
    const container = await this.containerService.findContainer(containerName);
    if (container) {
      try {
        await container.update({
          CpuQuota: Math.round(updated.cpuLimit * 100000),
          CpuPeriod: 100000,
          Memory: Math.round(updated.memoryLimitMb * 1024 * 1024),
        });
        this.logger.log(`Live updated resource limits for container ${containerName}`);
      } catch (err: any) {
        this.logger.warn(
          `Live container resource update failed (will apply on next restart): ${err.message}`
        );
      }
    }

    return this.getUserSandboxStatus(userId);
  }

  async reconcileDefaultQuotas(): Promise<void> {
    return this.containerService.reconcileDefaultQuotas();
  }

  recordActivity(userId: string): void {
    this.containerService.recordActivity(userId);
  }

  async checkAndFreezeIdleSandboxes(): Promise<void> {
    const idleTimeoutMs = this.idleTimeoutMinutes * 60 * 1000;
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
            `User sandbox [${sb.userId}] has been idle for ${idleMins}m (>= ${this.idleTimeoutMinutes}m). Auto-freezing container to release system resources...`
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

  getContainerName(userId: string): string {
    return this.containerService.getContainerName(userId);
  }

  getUserWorkspacePaths(userId: string): UserWorkspacePaths {
    return this.storageService.getUserWorkspacePaths(userId);
  }

  async ensureUserSandbox(
    userId: string,
    options: UserSandboxLaunchOptions = {}
  ): Promise<UserSandboxStatus> {
    return this.containerService.ensureUserSandbox(userId, options);
  }

  async freezeUserSandbox(userId: string): Promise<UserSandboxStatus> {
    return this.containerService.freezeUserSandbox(userId);
  }

  async stopUserSandbox(userId: string): Promise<UserSandboxStatus> {
    return this.containerService.stopUserSandbox(userId);
  }

  async getUserSandboxStatus(userId: string): Promise<UserSandboxStatus> {
    return this.containerService.getUserSandboxStatus(userId);
  }

  async listAllUserSandboxes(): Promise<UserSandboxStatus[]> {
    return this.containerService.listAllUserSandboxes();
  }

  async recreateUserSandbox(
    userId: string,
    options?: UserSandboxLaunchOptions
  ): Promise<UserSandboxStatus> {
    return this.containerService.recreateUserSandbox(userId, options);
  }

  async executeInSandbox(
    userId: string,
    cmd: string | string[],
    options?: { timeoutMs?: number; workDir?: string }
  ): Promise<UserSandboxExecResult> {
    return this.harnessService.executeInSandbox(userId, cmd, options);
  }

  async runHarness(
    userId: string,
    prompt: string,
    options?: {
      webSearch?: boolean;
      model?: string;
      sessionId?: string;
      history?: Array<{ role: string; content: string }>;
      timeoutMs?: number;
    }
  ): Promise<UserSandboxHarnessResult> {
    return this.harnessService.runHarness(
      userId,
      prompt,
      options,
      (u, cmd, opts) => this.executeInSandbox(u, cmd, opts)
    );
  }

  async stopSandboxExecution(userId: string): Promise<boolean> {
    return this.harnessService.stopSandboxExecution(userId);
  }

  async destroyUserSandbox(userId: string): Promise<boolean> {
    return this.containerService.destroyUserSandbox(userId);
  }

  /**
   * Compatibility helpers for spec / internal access
   */
  private sanitizeEnvironment(userId: string, options: UserSandboxLaunchOptions): string[] {
    return this.containerService.sanitizeEnvironment(userId, options);
  }

  private mapInspectToStatus(
    userId: string,
    containerName: string,
    paths: { workspace: string; knowledge: string },
    inspect: any
  ): UserSandboxStatus {
    return this.containerService.mapInspectToStatus(userId, containerName, paths, inspect);
  }

  private sanitizeUserId(userId: string): string {
    return this.storageService.sanitizeUserId(userId);
  }
}
