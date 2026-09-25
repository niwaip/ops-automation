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

const MAX_SANDBOX_OUTPUT_BYTES = 1024 * 1024; // 1MB 硬上限，防止进程大输出拖死 NodeJS 主进程

export type SandboxExecutorFn = (
  userId: string,
  cmd: string | string[],
  options?: { timeoutMs?: number; workDir?: string; onStdoutChunk?: (chunk: string) => void }
) => Promise<UserSandboxExecResult>;

@Injectable()
export class UserSandboxHarnessService {
  private readonly logger = new Logger(UserSandboxHarnessService.name);

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
    options?: { timeoutMs?: number; workDir?: string; onStdoutChunk?: (chunk: string) => void }
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

    const exec = await container.exec({
      Cmd: commandArray,
      AttachStdout: true,
      AttachStderr: true,
      User: 'sandbox',
      WorkingDir: options?.workDir || '/workspace',
    });

    const timeoutMs = options?.timeoutMs || 300000;
    const dockerClient = this.containerService.getDockerClient();

    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(async () => {
        timedOut = true;
        this.logger.warn(
          `Execution timed out (${timeoutMs}ms) in sandbox [${containerName}], forcibly stopping processes...`
        );
        try {
          await this.stopSandboxExecution(userId);
        } catch (killErr: any) {
          this.logger.warn(`Failed to stop sandbox execution on timeout for user [${userId}]: ${killErr.message}`);
        }
        reject(new BadRequestException(`沙箱命令执行超时 (${timeoutMs}ms)`));
      }, timeoutMs);

      exec.start({ hijack: true, stdin: false }, (err: any, stream: any) => {
        if (err) {
          clearTimeout(timer);
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
          clearTimeout(timer);
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
            resolve({
              exitCode: inspect.ExitCode ?? 0,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              durationMs: Date.now() - startTime,
              containerName,
            });
          } catch {
            this.containerService.recordActivity(sanitizedUserId);
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
      research?: boolean;
      model?: string;
      modelDisplayName?: string;
      sessionId?: string;
      history?: Array<{ role: string; content: string }>;
      timeoutMs?: number;
      files?: string[];
      onStdoutChunk?: (chunk: string) => void;
    },
    customExecutor?: SandboxExecutorFn
  ): Promise<UserSandboxHarnessResult> {
    const sanitizedUserId = this.storageService.sanitizeUserId(userId);
    const sanitizedSessionId = (options?.sessionId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');

    // 若传入了多轮会话历史记录，委托 storageService 写入工作区 session 存储目录
    if (options?.history && Array.isArray(options.history) && options.history.length > 0) {
      this.storageService.writeSessionHistory(sanitizedUserId, sanitizedSessionId, options.history);
    }

    // 若传入了会话关联附件列表，委托 storageService 写入 session 附件索引
    if (options?.files && Array.isArray(options.files) && options.files.length > 0) {
      this.storageService.writeSessionAttachments(sanitizedUserId, sanitizedSessionId, options.files);
    }

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
    const timeoutMs = options?.timeoutMs || 300000;

    let lockToken: string | null = null;
    if (this.lockService) {
      const ttlSeconds = Math.ceil(timeoutMs / 1000) + 15;
      const lockResult = await this.lockService.acquireSandboxLock(sanitizedUserId, ttlSeconds);
      if (!lockResult.success) {
        throw new ConflictException(`该用户的个人沙箱当前正在执行其他任务，请稍后再试`);
      }
      lockToken = lockResult.token;
    }

    try {
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
      if (this.lockService && lockToken) {
        await this.lockService.releaseSandboxLock(sanitizedUserId, lockToken);
      }
    }
  }

  /**
   * 强制终止用户沙箱中正在执行的 DeepSeek Harness 或前台任务进程
   */
  async stopSandboxExecution(userId: string): Promise<boolean> {
    const sanitizedUserId = this.storageService.sanitizeUserId(userId);
    if (this.lockService) {
      await this.lockService.forceReleaseSandboxLock(sanitizedUserId).catch(() => {});
    }

    const containerName = this.containerService.getContainerName(userId);
    const container = await this.containerService.findContainer(containerName);
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
}
