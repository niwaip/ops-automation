import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Writable } from 'stream';
import { StringDecoder } from 'string_decoder';
import {
  UserSandboxStatus,
  UserSandboxState,
  UserSandboxLaunchOptions,
  UserSandboxExecResult,
  UserSandboxHarnessResult,
} from './user-sandbox.interface';

// 动态引入 Dockerode，与 browser-worker 保持一致
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

@Injectable()
export class UserSandboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserSandboxService.name);
  private readonly docker: any;
  private readonly projectRoot: string;
  private readonly hostProjectRoot: string;
  private readonly localProjectRoot: string;
  private readonly sandboxNetworkName: string;
  private readonly sandboxImage: string;
  private readonly aiOrchestratorHost: string;
  private readonly aiOrchestratorPort: string;
  private readonly idleTimeoutMinutes: number;
  private readonly defaultCpuLimit: number;
  private readonly defaultMemoryLimitMb: number;
  private readonly lastActiveMap = new Map<string, number>();
  private idleCheckTimer: NodeJS.Timeout | null = null;

  constructor() {
    const socketPath = process.env.DOCKER_SOCKET_PATH || process.env.DOCKER_SOCK || DEFAULT_DOCKER_SOCKET;
    this.docker = new Docker({ socketPath });
    this.hostProjectRoot = process.env.PROJECT_ROOT || process.cwd();
    this.localProjectRoot =
      Boolean(process.env.DOCKER_ENV) && fs.existsSync('/workspace')
        ? '/workspace'
        : this.hostProjectRoot;
    this.projectRoot = this.hostProjectRoot;
    this.sandboxNetworkName = process.env.SANDBOX_NETWORK_NAME || DEFAULT_SANDBOX_NETWORK;
    this.sandboxImage = process.env.USER_SANDBOX_IMAGE || DEFAULT_IMAGE_NAME;
    this.aiOrchestratorHost = process.env.AI_ORCHESTRATOR_HOST || 'ops-ai-orchestrator';
    this.aiOrchestratorPort = process.env.AI_ORCHESTRATOR_PORT || '3007';
    this.idleTimeoutMinutes = Math.max(
      0,
      parseInt(process.env.USER_SANDBOX_IDLE_TIMEOUT_MINUTES || '30', 10) || 30
    );
    this.defaultCpuLimit = Math.max(
      0.1,
      parseFloat(process.env.USER_SANDBOX_DEFAULT_CPU || '1') || 1
    );
    this.defaultMemoryLimitMb = Math.max(
      128,
      parseInt(process.env.USER_SANDBOX_DEFAULT_MEMORY_MB || '2048', 10) || 2048
    );
  }

  onModuleInit() {
    if (this.idleTimeoutMinutes > 0) {
      this.logger.log(
        `User sandbox auto-idle cleanup enabled: timeout = ${this.idleTimeoutMinutes}m, default spec = ${this.defaultCpuLimit}C ${this.defaultMemoryLimitMb}MB`
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
    const sanitized = this.sanitizeUserId(userId);
    const userRoot = path.join(this.localProjectRoot, 'data', 'users', sanitized);
    if (!fs.existsSync(userRoot)) {
      fs.mkdirSync(userRoot, { recursive: true });
    }
    return path.join(userRoot, 'sandbox-config.json');
  }

  getUserQuota(userId: string): { cpuLimit: number; memoryLimitMb: number } {
    try {
      const configPath = this.getUserConfigPath(userId);
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const data = JSON.parse(content);
        return {
          cpuLimit:
            typeof data.cpuLimit === 'number' && data.cpuLimit > 0
              ? data.cpuLimit
              : this.defaultCpuLimit,
          memoryLimitMb:
            typeof data.memoryLimitMb === 'number' && data.memoryLimitMb > 0
              ? data.memoryLimitMb
              : this.defaultMemoryLimitMb,
        };
      }
    } catch (err: any) {
      this.logger.warn(`Failed to read user quota for ${userId}: ${err.message}`);
    }
    return {
      cpuLimit: this.defaultCpuLimit,
      memoryLimitMb: this.defaultMemoryLimitMb,
    };
  }

  async setUserQuota(
    userId: string,
    quota: { cpuLimit?: number; memoryLimitMb?: number }
  ): Promise<UserSandboxStatus> {
    const current = this.getUserQuota(userId);
    const newCpu =
      typeof quota.cpuLimit === 'number' && quota.cpuLimit > 0
        ? quota.cpuLimit
        : current.cpuLimit;
    const newMem =
      typeof quota.memoryLimitMb === 'number' && quota.memoryLimitMb > 0
        ? quota.memoryLimitMb
        : current.memoryLimitMb;

    const configPath = this.getUserConfigPath(userId);
    fs.writeFileSync(
      configPath,
      JSON.stringify({ cpuLimit: newCpu, memoryLimitMb: newMem }, null, 2),
      'utf-8'
    );
    this.logger.log(
      `Updated user sandbox quota for [${userId}]: ${newCpu} CPU, ${newMem} MB RAM`
    );

    const containerName = this.getContainerName(userId);
    const container = await this.findContainer(containerName);
    if (container) {
      try {
        await container.update({
          CpuQuota: Math.round(newCpu * 100000),
          CpuPeriod: 100000,
          Memory: Math.round(newMem * 1024 * 1024),
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
    try {
      const sandboxes = await this.listAllUserSandboxes();
      for (const sb of sandboxes) {
        if (sb.status !== 'running') continue;
        const quota = this.getUserQuota(sb.userId);
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

  recordActivity(userId: string) {
    try {
      const sanitized = this.sanitizeUserId(userId);
      this.lastActiveMap.set(sanitized, Date.now());
    } catch {
      // ignore
    }
  }

  async checkAndFreezeIdleSandboxes(): Promise<void> {
    const idleTimeoutMs = this.idleTimeoutMinutes * 60 * 1000;
    if (idleTimeoutMs <= 0) return;

    try {
      const sandboxes = await this.listAllUserSandboxes();
      const now = Date.now();

      for (const sb of sandboxes) {
        if (sb.status !== 'running') continue;
        const sanitizedId = this.sanitizeUserId(sb.userId);
        const lastActive = this.lastActiveMap.get(sanitizedId);

        if (!lastActive) {
          // 首次发现处于运行态的沙箱，初始化起点为当前时间
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

  /**
   * 格式化并校验安全的用户容器名称
   */
  getContainerName(userId: string): string {
    const sanitized = this.sanitizeUserId(userId);
    return `ops-user-sandbox-${sanitized}`;
  }

  /**
   * 获取宿主机上用户的持久化工作区路径与集中插件库、技能库路径
   */
  getUserWorkspacePaths(userId: string): { workspace: string; knowledge: string; sharedPlugins: string; sharedSkills: string } {
    const sanitized = this.sanitizeUserId(userId);
    const hostUserRoot = path.join(this.hostProjectRoot, 'data', 'users', sanitized);
    const hostWorkspace = path.join(hostUserRoot, 'workspace');
    const hostKnowledge = path.join(hostUserRoot, 'knowledge');
    const hostSharedPlugins = path.join(this.hostProjectRoot, 'data', 'shared', 'dsh-plugins');
    const hostSharedSkills = path.join(this.hostProjectRoot, 'data', 'shared', 'dsh-skills');

    const localUserRoot = path.join(this.localProjectRoot, 'data', 'users', sanitized);
    const localWorkspace = path.join(localUserRoot, 'workspace');
    const localKnowledge = path.join(localUserRoot, 'knowledge');
    const localSharedPlugins = path.join(this.localProjectRoot, 'data', 'shared', 'dsh-plugins');
    const localSharedSkills = path.join(this.localProjectRoot, 'data', 'shared', 'dsh-skills');

    // 自动确保工作区与个人知识库物理存在，并赋予非 root 沙箱用户读写权限
    if (!fs.existsSync(localWorkspace)) {
      fs.mkdirSync(localWorkspace, { recursive: true });
    }
    try {
      fs.chmodSync(localWorkspace, 0o777);
    } catch {
      // 忽略 chmod 在部分环境下的非致命警告
    }

    if (!fs.existsSync(localKnowledge)) {
      fs.mkdirSync(localKnowledge, { recursive: true });
    }

    // 自动确保管理员统一共享插件目录存在，并同步预置插件
    if (!fs.existsSync(localSharedPlugins)) {
      fs.mkdirSync(localSharedPlugins, { recursive: true });
    }
    const defaultPluginsDir = path.join(this.localProjectRoot, 'docker', 'user-sandbox', 'plugins');
    if (fs.existsSync(defaultPluginsDir)) {
      try {
        const defaultPlugins = fs.readdirSync(defaultPluginsDir);
        for (const p of defaultPlugins) {
          const src = path.join(defaultPluginsDir, p);
          const dest = path.join(localSharedPlugins, p);
          if (!fs.existsSync(dest) || fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs) {
            fs.copyFileSync(src, dest);
            try {
              fs.chmodSync(dest, 0o755);
            } catch {}
          }
        }
      } catch (e: any) {
        this.logger.warn(`Failed to seed default plugins: ${e.message}`);
      }
    }

    // 自动确保管理员统一共享技能模版目录存在，并同步预置技能
    if (!fs.existsSync(localSharedSkills)) {
      fs.mkdirSync(localSharedSkills, { recursive: true });
    }
    const defaultSkillsDir = path.join(this.localProjectRoot, 'docker', 'user-sandbox', 'skills');
    if (fs.existsSync(defaultSkillsDir)) {
      try {
        const defaultSkills = fs.readdirSync(defaultSkillsDir);
        for (const s of defaultSkills) {
          const src = path.join(defaultSkillsDir, s);
          const dest = path.join(localSharedSkills, s);
          if (!fs.existsSync(dest)) {
            fs.cpSync(src, dest, { recursive: true });
          }
        }
      } catch (e: any) {
        this.logger.warn(`Failed to seed default skills: ${e.message}`);
      }
    }

    return {
      workspace: hostWorkspace,
      knowledge: hostKnowledge,
      sharedPlugins: hostSharedPlugins,
      sharedSkills: hostSharedSkills,
    };
  }

  /**
   * 幂等启动/唤醒用户的个人沙箱容器
   */
  async ensureUserSandbox(
    userId: string,
    options: UserSandboxLaunchOptions = {}
  ): Promise<UserSandboxStatus> {
    this.recordActivity(userId);
    const containerName = this.getContainerName(userId);
    const paths = this.getUserWorkspacePaths(userId);

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

      // 已停止，重新启动
      this.logger.log(`Starting stopped container ${containerName}...`);
      await existing.start();
      const freshInspect = await existing.inspect();
      return this.mapInspectToStatus(userId, containerName, paths, freshInspect);
    }

    // 容器不存在，开始新建并启动
    this.logger.log(`Creating fresh immutable sandbox container ${containerName} from image ${this.sandboxImage}`);

    // 安全过滤注入的环境变量（注入平台 AI 代理端点与虚拟用户 Token，严防真实 Key 泄露）
    const safeEnv = this.sanitizeEnvironment(userId, options);
    const userQuota = this.getUserQuota(userId);
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
          `${paths.knowledge}:/knowledge:ro`,
          `${paths.sharedPlugins}:/opt/dsh/plugins:ro`,
          `${paths.sharedSkills}:/opt/dsh/skills:ro`,
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

  /**
   * 冻结/暂停用户沙箱（释放 CPU 与内存）
   */
  async freezeUserSandbox(userId: string): Promise<UserSandboxStatus> {
    const containerName = this.getContainerName(userId);
    const paths = this.getUserWorkspacePaths(userId);
    const container = await this.findContainer(containerName);

    if (!container) {
      throw new NotFoundException(`用户沙箱容器 ${containerName} 不存在`);
    }

    const inspect = await container.inspect();
    if (inspect.State.Running) {
      this.logger.log(`Stopping container ${containerName} for freezing...`);
      await container.stop({ t: 5 });
    }
    this.lastActiveMap.delete(this.sanitizeUserId(userId));

    const freshInspect = await container.inspect();
    return this.mapInspectToStatus(userId, containerName, paths, freshInspect);
  }

  /**
   * 停止用户沙箱
   */
  async stopUserSandbox(userId: string): Promise<UserSandboxStatus> {
    return this.freezeUserSandbox(userId);
  }

  /**
   * 获取沙箱当前状态
   */
  async getUserSandboxStatus(userId: string): Promise<UserSandboxStatus> {
    const containerName = this.getContainerName(userId);
    const paths = this.getUserWorkspacePaths(userId);
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

  /**
   * 查询宿主机上所有用户个人沙箱容器列表
   */
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
        const paths = this.getUserWorkspacePaths(userId);

        let status: UserSandboxState = 'stopped';
        if (c.State === 'running') status = 'running';
        else if (c.State === 'paused') status = 'paused';
        else if (c.State === 'exited') status = 'stopped';
        else status = 'error';

        const net = c.NetworkSettings?.Networks?.[this.sandboxNetworkName];
        const sanitizedUserId = this.sanitizeUserId(userId);
        const lastActiveTime = this.lastActiveMap.get(sanitizedUserId);
        const quota = this.getUserQuota(userId);

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

  /**
   * 使用最新镜像重建个人沙箱容器（保留磁盘数据）
   */
  async recreateUserSandbox(userId: string, options?: UserSandboxLaunchOptions): Promise<UserSandboxStatus> {
    this.logger.log(`Recreating user sandbox for [${userId}] to apply latest image/config...`);
    await this.destroyUserSandbox(userId);
    return this.ensureUserSandbox(userId, options);
  }

  /**
   * 在用户的安全沙箱中执行命令（非 root 用户权限）
   */
  async executeInSandbox(
    userId: string,
    cmd: string | string[],
    options?: { timeoutMs?: number; workDir?: string }
  ): Promise<UserSandboxExecResult> {
    const startTime = Date.now();
    const containerName = this.getContainerName(userId);
    // 确保沙箱处于运行状态
    await this.ensureUserSandbox(userId);

    const container = await this.findContainer(containerName);
    if (!container) {
      throw new NotFoundException(`无法找到用户沙箱容器: ${containerName}`);
    }

    const commandArray = Array.isArray(cmd) ? cmd : ['bash', '-c', cmd];
    this.logger.log(`Executing in sandbox [${containerName}]: ${JSON.stringify(commandArray)}`);

    const exec = await container.exec({
      Cmd: commandArray,
      AttachStdout: true,
      AttachStderr: true,
      User: 'sandbox',
      WorkingDir: options?.workDir || '/workspace',
    });

    const timeoutMs = options?.timeoutMs || 300000;

    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new BadRequestException(`沙箱命令执行超时 (${timeoutMs}ms)`));
      }, timeoutMs);

      exec.start({ hijack: true, stdin: false }, (err: any, stream: any) => {
        if (err) {
          clearTimeout(timer);
          return reject(err);
        }

        let stdout = '';
        let stderr = '';
        const stdoutDecoder = new StringDecoder('utf-8');
        const stderrDecoder = new StringDecoder('utf-8');

        const stdoutStream = new Writable({
          write(chunk, encoding, callback) {
            stdout += stdoutDecoder.write(chunk);
            callback();
          },
        });

        const stderrStream = new Writable({
          write(chunk, encoding, callback) {
            stderr += stderrDecoder.write(chunk);
            callback();
          },
        });

        if (this.docker.modem && typeof this.docker.modem.demuxStream === 'function') {
          this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);
        } else {
          stream.on('data', (chunk: Buffer) => {
            stdout += stdoutDecoder.write(chunk);
          });
        }

        stream.on('end', async () => {
          clearTimeout(timer);
          if (timedOut) return;
          stdout += stdoutDecoder.end();
          stderr += stderrDecoder.end();
          try {
            const inspect = await exec.inspect();
            this.recordActivity(userId);
            resolve({
              exitCode: inspect.ExitCode ?? 0,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              durationMs: Date.now() - startTime,
              containerName,
            });
          } catch {
            this.recordActivity(userId);
            resolve({
              exitCode: 0,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              durationMs: Date.now() - startTime,
              containerName,
            });
          }
        });

        stream.on('error', (streamErr: any) => {
          clearTimeout(timer);
          if (!timedOut) reject(streamErr);
        });
      });
    });
  }

  /**
   * 调用预装在个人沙箱中的 DeepSeek Harness 进行智能分析与检索
   */
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
    const paths = this.getUserWorkspacePaths(userId);
    const sanitizedSessionId = (options?.sessionId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');

    // 若传入了多轮会话历史记录，写入工作区 session 存储目录中
    if (options?.history && Array.isArray(options.history) && options.history.length > 0) {
      try {
        const sessionsDir = path.join(paths.workspace, '.dsh', 'sessions');
        if (!fs.existsSync(sessionsDir)) {
          fs.mkdirSync(sessionsDir, { recursive: true });
          try {
            fs.chmodSync(sessionsDir, 0o777);
          } catch {}
        }
        const historyFile = path.join(sessionsDir, `${sanitizedSessionId}.json`);
        fs.writeFileSync(historyFile, JSON.stringify(options.history, null, 2), 'utf-8');
        try {
          fs.chmodSync(historyFile, 0o666);
        } catch {}
      } catch (err: any) {
        this.logger.warn(`Failed to persist session history for sandbox: ${err.message}`);
      }
    }

    const dshCmd = ['dsh', 'run', prompt, '--session-id', sanitizedSessionId];
    if (options?.webSearch) {
      dshCmd.push('--web-search');
    }
    if (options?.model) {
      dshCmd.push('--model', options.model);
    }

    const execResult = await this.executeInSandbox(userId, dshCmd, {
      timeoutMs: options?.timeoutMs || 300000,
      workDir: '/workspace',
    });

    const stdout = execResult.stdout?.trim() || '';
    const stderr = execResult.stderr?.trim() || '';
    let output = '';
    if (stdout && stderr && execResult.exitCode !== 0) {
      output = `${stdout}\n\n${stderr}`;
    } else {
      output = stdout || stderr || 'DeepSeek Harness 执行完毕 (无返回内容)';
    }
    return {
      success: execResult.exitCode === 0,
      output,
      containerName: execResult.containerName,
      durationMs: execResult.durationMs,
      exitCode: execResult.exitCode,
    };
  }

  /**
   * 强制终止用户沙箱中正在执行的 DeepSeek Harness 或前台任务进程
   */
  async stopSandboxExecution(userId: string): Promise<boolean> {
    const containerName = this.getContainerName(userId);
    const container = await this.findContainer(containerName);
    if (!container) return false;

    try {
      this.logger.log(`Forcibly stopping executing processes in sandbox [${containerName}]...`);
      const exec = await container.exec({
        Cmd: ['pkill', '-9', '-f', 'dsh'],
        User: 'root',
      });
      await exec.start({ hijack: true, stdin: false });
      return true;
    } catch (err: any) {
      this.logger.warn(`Failed to stop processes in container ${containerName}: ${err.message}`);
      return false;
    }
  }

  /**
   * 销毁用户沙箱（磁盘文件保留）
   */
  async destroyUserSandbox(userId: string): Promise<boolean> {
    this.lastActiveMap.delete(this.sanitizeUserId(userId));
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

  private async findContainer(containerName: string): Promise<any | null> {
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

  private sanitizeUserId(userId: string): string {
    if (!userId || typeof userId !== 'string') {
      throw new BadRequestException('userId 不能为空');
    }
    const sanitized = userId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!sanitized) {
      throw new BadRequestException('userId 包含无效字符');
    }
    return sanitized;
  }

  /**
   * 环境变量安全过滤与内部模型代理注入
   * 严禁将管理员真实 API Key 注入容器，强制使用内部代理路由与虚拟用户 Token
   */
  private sanitizeEnvironment(userId: string, options: UserSandboxLaunchOptions): string[] {
    const sanitized = this.sanitizeUserId(userId);
    const proxyBaseUrl = `http://${this.aiOrchestratorHost}:${this.aiOrchestratorPort}/ai/proxy/v1`;
    const virtualUserToken = `sandbox-user-token-${sanitized}`;

    const envList: string[] = [
      'USER_MODE=personal',
      'WORKSPACE=/workspace',
      'KNOWLEDGE_DIR=/knowledge',
      'DSH_PLUGIN_DIR=/opt/dsh/plugins',
      'LANG=C.UTF-8',
      'LC_ALL=C.UTF-8',
      'PYTHONIOENCODING=utf-8',
      // 平台统一 AI 代理端点与虚拟用户凭据，真实 API 密钥永不出平台
      `DEEPSEEK_BASE_URL=${proxyBaseUrl}`,
      `DEEPSEEK_API_KEY=${virtualUserToken}`,
      `OPENAI_BASE_URL=${proxyBaseUrl}`,
      `OPENAI_API_KEY=${virtualUserToken}`,
    ];

    if (options.customEnv) {
      for (const [k, v] of Object.entries(options.customEnv)) {
        const upper = k.toUpperCase();
        // 过滤高危系统变量及私自覆盖模型凭据行为
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

  private mapInspectToStatus(
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

    const sanitizedUserId = this.sanitizeUserId(userId);
    const lastActiveTime = this.lastActiveMap.get(sanitizedUserId);
    const quota = this.getUserQuota(userId);

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
}
