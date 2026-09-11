import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Writable } from 'stream';
import { StringDecoder } from 'string_decoder';
import {
  UserSandboxExecResult,
  UserSandboxHarnessResult,
} from './user-sandbox.interface';
import { UserSandboxStorageService } from './user-sandbox-storage.service';
import { UserSandboxContainerService } from './user-sandbox-container.service';

export type SandboxExecutorFn = (
  userId: string,
  cmd: string | string[],
  options?: { timeoutMs?: number; workDir?: string }
) => Promise<UserSandboxExecResult>;

@Injectable()
export class UserSandboxHarnessService {
  private readonly logger = new Logger(UserSandboxHarnessService.name);

  constructor(
    private readonly storageService: UserSandboxStorageService,
    private readonly containerService: UserSandboxContainerService
  ) {}

  /**
   * 在用户的安全沙箱中执行命令（非 root 用户权限）
   */
  async executeInSandbox(
    userId: string,
    cmd: string | string[],
    options?: { timeoutMs?: number; workDir?: string }
  ): Promise<UserSandboxExecResult> {
    const startTime = Date.now();
    const containerName = this.containerService.getContainerName(userId);
    // 确保沙箱处于运行状态
    await this.containerService.ensureUserSandbox(userId);

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

        if (dockerClient.modem && typeof dockerClient.modem.demuxStream === 'function') {
          dockerClient.modem.demuxStream(stream, stdoutStream, stderrStream);
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
            this.containerService.recordActivity(userId);
            resolve({
              exitCode: inspect.ExitCode ?? 0,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              durationMs: Date.now() - startTime,
              containerName,
            });
          } catch {
            this.containerService.recordActivity(userId);
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
    },
    customExecutor?: SandboxExecutorFn
  ): Promise<UserSandboxHarnessResult> {
    const sanitizedSessionId = (options?.sessionId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');

    // 若传入了多轮会话历史记录，委托 storageService 写入工作区 session 存储目录
    if (options?.history && Array.isArray(options.history) && options.history.length > 0) {
      this.storageService.writeSessionHistory(userId, sanitizedSessionId, options.history);
    }

    const dshCmd = ['dsh', 'run', prompt, '--session-id', sanitizedSessionId];
    if (options?.webSearch) {
      dshCmd.push('--web-search');
    }
    if (options?.model) {
      dshCmd.push('--model', options.model);
    }

    const executor = customExecutor || ((u, c, opts) => this.executeInSandbox(u, c, opts));
    const execResult = await executor(userId, dshCmd, {
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
