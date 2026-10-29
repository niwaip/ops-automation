import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { Writable } from 'stream';
import { StringDecoder } from 'string_decoder';
import * as path from 'path';
import {
  UserSandboxExecResult,
  UserSandboxHarnessResult,
} from './user-sandbox.interface';
import { UserSandboxStorageService } from './user-sandbox-storage.service';
import { UserSandboxContainerService } from './user-sandbox-container.service';
import { LockService } from '../lock/lock.service';
import { ExecutionWatchdog } from './execution-watchdog';

const MAX_SANDBOX_OUTPUT_BYTES = 1024 * 1024; // 1MB 硬上限，防止进程大输出拖死 NodeJS 主进程

export type SandboxExecutorFn = (
  userId: string,
  cmd: string | string[],
  options?: { timeoutMs?: number; workDir?: string; env?: string[]; onStdoutChunk?: (chunk: string) => void }
) => Promise<UserSandboxExecResult>;

@Injectable()
export class UserSandboxHarnessService {
  private readonly logger = new Logger(UserSandboxHarnessService.name);
  private readonly activeLockOwners = new Map<string, { sessionId: string; token: string }>();

  constructor(
    private readonly storageService: UserSandboxStorageService,
    private readonly containerService: UserSandboxContainerService,
    @Optional() private readonly lockService?: LockService
  ) {}

  /**
   * 在用户的安全沙箱中执行命令（非 root 用户权限）
   */
  async executeInSandbox(
    userId: string,
    cmd: string | string[],
    options?: { timeoutMs?: number; workDir?: string; env?: string[]; onStdoutChunk?: (chunk: string) => void }
  ): Promise<UserSandboxExecResult> {
    const sanitizedUserId = this.storageService.sanitizeUserId(userId);
    const startTime = Date.now();
    const containerName = this.containerService.getContainerName(sanitizedUserId);
    // 确保沙箱处于运行状态
    await this.containerService.ensureUserSandbox(sanitizedUserId);

    const container = await this.containerService.findContainer(containerName);
    if (!container) {
      throw new NotFoundException(`无法找到用户沙箱容器: ${containerName}`);
    }

    const commandArray = Array.isArray(cmd) ? cmd : ['bash', '-c', cmd];
    this.logger.log(`Executing in sandbox [${containerName}]: ${JSON.stringify(commandArray)}`);

    // 动态生成并注入最新有效的虚拟凭证，彻底杜绝长周期容器因 Token 过期报 401
    const runtimeEnv = this.containerService.getExecutionEnvironment(sanitizedUserId);
    const mergedEnv = options?.env && options.env.length > 0
      ? [...runtimeEnv, ...options.env]
      : runtimeEnv;

    const exec = await container.exec({
      Cmd: commandArray,
      AttachStdout: true,
      AttachStderr: true,
      User: 'sandbox',
      WorkingDir: options?.workDir || '/workspace',
      Env: mergedEnv,
    });

    const timeoutMs = options?.timeoutMs;
    const dockerClient = this.containerService.getDockerClient();

    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timer = new ExecutionWatchdog(async (reason) => {
        timedOut = true;
        this.logger.warn(
          `Execution ${reason} watchdog expired (${reason === "total" ? timeoutMs : 360000}ms) in sandbox [${containerName}], forcibly stopping processes...`
        );
        try {
          await this.stopSandboxExecution(userId);
        } catch (killErr: any) {
          this.logger.warn(`Failed to stop sandbox execution on timeout for user [${userId}]: ${killErr.message}`);
        }
        reject(new BadRequestException(reason === 'total' ? `沙箱命令达到指定总时限 (${timeoutMs}ms)` : `沙箱连续 360 秒无有效执行进展，已停止任务`));
      }, timeoutMs);

      exec.start({ hijack: true, stdin: false }, (err: any, stream: any) => {
        if (err) {
          timer.stop();
          return reject(err);
        }

        let stdout = '';
        let stderr = '';
        let stdoutTruncated = false;
        let stderrTruncated = false;
        const stdoutDecoder = new StringDecoder('utf-8');
        const stderrDecoder = new StringDecoder('utf-8');

        const stdoutStream = new Writable({
          write(chunk, encoding, callback) {
            const decoded = stdoutDecoder.write(chunk);
            timer.observe(decoded);
            if (!stdoutTruncated) {
              stdout += decoded;
              if (stdout.length > MAX_SANDBOX_OUTPUT_BYTES) {
                stdout = stdout.slice(0, MAX_SANDBOX_OUTPUT_BYTES) + '\n[警告: 沙箱 stdout 输出已超过 1MB 上限，已自动截断]';
                stdoutTruncated = true;
              }
            }
            if (options?.onStdoutChunk && decoded) {
              try { options.onStdoutChunk(decoded); } catch { /* ignore */ }
            }
            callback();
          },
        });

        const stderrStream = new Writable({
          write(chunk, encoding, callback) {
            const decoded = stderrDecoder.write(chunk);
            if (!stderrTruncated) {
              stderr += decoded;
              if (stderr.length > MAX_SANDBOX_OUTPUT_BYTES) {
                stderr = stderr.slice(0, MAX_SANDBOX_OUTPUT_BYTES) + '\n[警告: 沙箱 stderr 输出已超过 1MB 上限，已自动截断]';
                stderrTruncated = true;
              }
            }
            callback();
          },
        });

        if (dockerClient.modem && typeof dockerClient.modem.demuxStream === 'function') {
          dockerClient.modem.demuxStream(stream, stdoutStream, stderrStream);
        } else {
          stream.on('data', (chunk: Buffer) => {
            const decoded = stdoutDecoder.write(chunk);
            timer.observe(decoded);
            if (!stdoutTruncated) {
              stdout += decoded;
              if (stdout.length > MAX_SANDBOX_OUTPUT_BYTES) {
                stdout = stdout.slice(0, MAX_SANDBOX_OUTPUT_BYTES) + '\n[警告: 沙箱 stdout 输出已超过 1MB 上限，已自动截断]';
                stdoutTruncated = true;
              }
            }
            if (options?.onStdoutChunk && decoded) {
              try { options.onStdoutChunk(decoded); } catch { /* ignore */ }
            }
          });
        }

        stream.on('end', async () => {
          timer.stop();
          if (timedOut) return;
          if (!stdoutTruncated) {
            stdout += stdoutDecoder.end();
          }
          if (!stderrTruncated) {
            stderr += stderrDecoder.end();
          }
          try {
            const inspect = await exec.inspect();
            this.containerService.recordActivity(sanitizedUserId);
            const hasValidExitCode = typeof inspect?.ExitCode === 'number';
            resolve({
              exitCode: hasValidExitCode ? inspect.ExitCode : -1,
              stdout: stdout.trim(),
              stderr: hasValidExitCode
                ? stderr.trim()
                : [stderr.trim(), '[警告: 沙箱进程退出码缺失]'].filter(Boolean).join('\n'),
              durationMs: Date.now() - startTime,
              containerName,
            });
          } catch (inspectErr: any) {
            this.containerService.recordActivity(sanitizedUserId);
            const errMsg = inspectErr?.message
              ? `[警告: 无法读取沙箱进程退出状态: ${inspectErr.message}]`
              : '[警告: 无法读取沙箱进程退出状态]';
            resolve({
              exitCode: -1,
              stdout: stdout.trim(),
              stderr: [stderr.trim(), errMsg].filter(Boolean).join('\n'),
              durationMs: Date.now() - startTime,
              containerName,
            });
          }
        });

        stream.on('error', (streamErr: any) => {
          timer.stop();
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
      research?: boolean;
      model?: string;
      modelDisplayName?: string;
      sessionId?: string;
      history?: Array<{ role: string; content: string }>;
      timeoutMs?: number;
      files?: string[];
      waitTimeoutSeconds?: number;
      thinking?: boolean;
      reasoningEffort?: string;
      signal?: AbortSignal;
      onLockAcquired?: () => void;
      onWaiting?: (waitedMs: number) => void;
      onStdoutChunk?: (chunk: string) => void;
    },
    customExecutor?: SandboxExecutorFn
  ): Promise<UserSandboxHarnessResult> {
    const sanitizedUserId = this.storageService.sanitizeUserId(userId);
    const sanitizedSessionId = (options?.sessionId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');

    const dshCmd = ['dsh', 'run', prompt, '--session-id', sanitizedSessionId];
    if (options?.files && options.files.length > 0) {
      const cleanFiles = options.files
        .map((f) => path.basename(f.trim()))
        .filter(Boolean);
      if (cleanFiles.length > 0) {
        dshCmd.push('--files', cleanFiles.join(','));
      }
    }
    if (options?.webSearch) {
      dshCmd.push('--web-search');
    }
    if (options?.research) {
      dshCmd.push('--research');
    }
    if (options?.thinking !== undefined) {
      if (options.thinking) {
        dshCmd.push('--thinking');
      } else {
        dshCmd.push('--no-thinking');
      }
    }
    if (options?.reasoningEffort) {
      dshCmd.push('--reasoning-effort', options.reasoningEffort);
    }
    if (options?.model) {
      dshCmd.push('--model', options.model);
    }
    if (options?.modelDisplayName) {
      dshCmd.push('--model-display-name', options.modelDisplayName);
    }
    if (options?.timeoutMs) {
      const timeoutSec = Math.floor(options.timeoutMs / 1000);
      if (timeoutSec > 0) {
        dshCmd.push('--timeout', String(timeoutSec));
      }
    }

    const executor = customExecutor || ((u, c, opts) => this.executeInSandbox(u, c, opts));
    const timeoutMs = options?.timeoutMs;
    let renewal: ReturnType<typeof setInterval> | undefined;

    let lockToken: string | null = null;
    if (this.lockService) {
      const ttlSeconds = 420;
      const waitTimeoutSeconds =
        typeof options?.waitTimeoutSeconds === 'number'
          ? options.waitTimeoutSeconds
          : 35;
      const lockResult = await this.lockService.acquireSandboxLock(
        sanitizedUserId,
        ttlSeconds,
        waitTimeoutSeconds,
        options?.onWaiting,
        options?.signal
      );
      if (!lockResult.success) {
        if ((lockResult as any).aborted || options?.signal?.aborted) {
          throw new ConflictException('沙箱排队请求已取消。');
        }
        throw new ConflictException(
          `个人沙箱正在执行前序任务，排队等待超时（${waitTimeoutSeconds}秒）。请稍候再试，或在前一会话中点击“停止”后再试。`
        );
      }
      lockToken = lockResult.token;
      let renewing = false;
      renewal = setInterval(async () => {
        if (renewing) return;
        renewing = true;
        try {
          this.containerService.recordActivity(sanitizedUserId);
          if (!await this.lockService!.extendSandboxLock(sanitizedUserId, lockToken!, ttlSeconds) &&
              this.activeLockOwners.get(sanitizedUserId)?.token === lockToken) {
            await this.stopSandboxExecution(sanitizedUserId, sanitizedSessionId);
          }
        } catch (error: any) {
          this.logger.error(`Sandbox lock renewal failed: ${error.message}`);
          if (this.activeLockOwners.get(sanitizedUserId)?.token === lockToken)
            await this.stopSandboxExecution(sanitizedUserId, sanitizedSessionId).catch(() => {});
        } finally { renewing = false; }
      }, 60000);

      this.activeLockOwners.set(sanitizedUserId, {
        sessionId: sanitizedSessionId,
        token: lockToken,
      });
    }

    try {
      options?.onLockAcquired?.();
      if (options?.signal?.aborted) {
        throw new ConflictException('沙箱请求在执行开始前已取消。');
      }

      // 获得用户执行锁之后再落盘当前轮次的会话历史与附件索引，防止排队请求覆写正在执行轮次的输入状态
      if (options?.history && Array.isArray(options.history) && options.history.length > 0) {
        this.storageService.writeSessionHistory(sanitizedUserId, sanitizedSessionId, options.history);
      }
      if (options?.files && Array.isArray(options.files) && options.files.length > 0) {
        this.storageService.writeSessionAttachments(sanitizedUserId, sanitizedSessionId, options.files);
      }

      const execResult = await executor(sanitizedUserId, dshCmd, {
        timeoutMs,
        workDir: '/workspace',
        onStdoutChunk: options?.onStdoutChunk,
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
    } finally {
      if (renewal) clearInterval(renewal);
      const currentOwner = this.activeLockOwners.get(sanitizedUserId);
      if (currentOwner && currentOwner.token === lockToken) {
        this.activeLockOwners.delete(sanitizedUserId);
      }
      if (this.lockService && lockToken) {
        await this.lockService.releaseSandboxLock(sanitizedUserId, lockToken);
      }
    }
  }

  /**
   * 强制终止用户沙箱中正在执行的 DeepSeek Harness 或前台任务进程
   */
  async stopSandboxExecution(userId: string, sessionId?: string): Promise<boolean> {
    const sanitizedUserId = this.storageService.sanitizeUserId(userId);
    const sanitizedSessionId = sessionId ? sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') : undefined;
    const activeOwner = this.activeLockOwners.get(sanitizedUserId);

    // 若指定了 sessionId，但当前持有执行锁的是同一用户的另一活跃会话，则不误杀另一会话进程、不释放其锁
    if (sanitizedSessionId && activeOwner && activeOwner.sessionId !== sanitizedSessionId) {
      this.logger.log(
        `Skip stopping sandbox [${sanitizedUserId}] for queued/inactive session [${sanitizedSessionId}]; active lock is owned by session [${activeOwner.sessionId}]`
      );
      return false;
    }

    const releaseOwnedOrForceLock = async () => {
      if (!this.lockService) return;
      if (activeOwner && typeof this.lockService.releaseSandboxLock === 'function') {
        await this.lockService.releaseSandboxLock(sanitizedUserId, activeOwner.token).catch(() => {});
      } else if (typeof this.lockService.forceReleaseSandboxLock === 'function') {
        await this.lockService.forceReleaseSandboxLock(sanitizedUserId).catch(() => {});
      }
    };

    const containerName = this.containerService.getContainerName(userId);
    const container = await this.containerService.findContainer(containerName);
    if (!container) {
      await releaseOwnedOrForceLock();
      return false;
    }

    try {
      this.logger.log(
        `Forcibly stopping executing processes in sandbox [${containerName}]${sessionId ? ` (session: ${sessionId})` : ''}...`
      );
      const cmd = sanitizedSessionId
        ? ['pkill', '-9', '-f', `dsh.*${sanitizedSessionId}`]
        : ['pkill', '-9', '-f', 'dsh'];
      const exec = await container.exec({
        Cmd: cmd,
        User: 'root',
      });
      await exec.start({ hijack: true, stdin: false });
      await releaseOwnedOrForceLock();
      return true;
    } catch (err: any) {
      this.logger.warn(`Failed to stop processes in container ${containerName}: ${err.message}`);
      await releaseOwnedOrForceLock();
      return false;
    }
  }
}
