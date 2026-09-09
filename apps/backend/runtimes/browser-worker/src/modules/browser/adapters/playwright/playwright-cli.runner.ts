import { Injectable, Logger, Optional } from '@nestjs/common';
import { execFile } from 'child_process';
import { WorkerService } from '../../../worker/worker.service';
import {
  CliBinary,
  CliExecResult,
  getDefaultPlaywrightConfig,
  PlaywrightCliConfig,
} from './playwright.types';

@Injectable()
export class PlaywrightCliRunner {
  private readonly logger = new Logger(PlaywrightCliRunner.name);
  private readonly config: PlaywrightCliConfig;
  private cliBinaryPromise?: Promise<CliBinary>;

  constructor(
    @Optional() private readonly workerService?: WorkerService,
    @Optional() config?: Partial<PlaywrightCliConfig>
  ) {
    this.config = { ...getDefaultPlaywrightConfig(), ...config };
  }

  async execCli(sessionId: string, args: string[], timeoutMs?: number): Promise<CliExecResult> {
    this.workerService?.touchWorkerByRuntimeSessionId(sessionId);
    const binary = await this.resolveCliBinary();
    const fullArgs = [...binary.baseArgs, `-s=${sessionId}`, ...args];
    this.logger.debug(`Running CLI command: ${binary.command} ${fullArgs.join(' ')}`);

    this.reportDebugEvent('A', 'playwright-cli.adapter.ts:execCli:start', '[DEBUG] execCli start', {
      sessionId,
      command: binary.command,
      args: this.summarizeCliArgs(fullArgs),
      processTimeoutMs: timeoutMs || this.config.cliProcessTimeoutMs,
      actionTimeoutMs: this.config.cliActionTimeoutMs,
      navigationTimeoutMs: this.config.cliNavigationTimeoutMs,
      pageSettleTimeoutMs: this.config.cliPageSettleTimeoutMs,
    });

    return this.execFileAsync(binary.command, fullArgs, timeoutMs);
  }

  async resolveCliBinary(): Promise<CliBinary> {
    if (!this.cliBinaryPromise) {
      this.cliBinaryPromise = this.detectCliBinary();
    }
    return this.cliBinaryPromise;
  }

  async detectCliBinary(): Promise<CliBinary> {
    const candidates: CliBinary[] = [
      { command: 'playwright-cli', baseArgs: [] },
      { command: 'npx', baseArgs: ['--no-install', 'playwright-cli'] },
    ];

    for (const candidate of candidates) {
      try {
        await this.execFileAsync(candidate.command, [...candidate.baseArgs, '--version']);
        return candidate;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Playwright CLI probe failed for ${candidate.command}: ${errorMessage}`);
      }
    }

    throw new Error(
      'Playwright CLI is not available. Install `@playwright/cli` globally or make `npx playwright-cli` available.'
    );
  }

  execFileAsync(command: string, args: string[], timeoutMs?: number): Promise<CliExecResult> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      execFile(
        command,
        args,
        {
          cwd: process.cwd(),
          timeout: timeoutMs || this.config.cliProcessTimeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          env: process.env,
        },
        (error, stdout, stderr) => {
          if (error) {
            const errorWithMeta = error as NodeJS.ErrnoException & {
              killed?: boolean;
              code?: string | number;
              signal?: NodeJS.Signals | null;
            };
            this.reportDebugEvent(
              'D',
              'playwright-cli.adapter.ts:execFileAsync:error',
              '[DEBUG] execFileAsync failed',
              {
                command,
                args: this.summarizeCliArgs(args),
                elapsedMs: Date.now() - startedAt,
                errorMessage: stderr?.trim() || error.message,
                killed: errorWithMeta.killed === true,
                code: errorWithMeta.code ?? null,
                signal: errorWithMeta.signal ?? null,
              }
            );
            reject(new Error(stderr?.trim() || error.message));
            return;
          }

          this.reportDebugEvent(
            'A',
            'playwright-cli.adapter.ts:execFileAsync:success',
            '[DEBUG] execFileAsync success',
            {
              command,
              args: this.summarizeCliArgs(args),
              elapsedMs: Date.now() - startedAt,
              stdoutLength: stdout?.trim()?.length || 0,
              stderrLength: stderr?.trim()?.length || 0,
            }
          );
          resolve({
            stdout: stdout?.trim() || '',
            stderr: stderr?.trim() || '',
          });
        }
      );
    });
  }

  requireStringParam(params: Record<string, unknown>, keys: string[]): string {
    const value = this.readOptionalStringParam(params, keys);
    if (!value) {
      throw new Error(`Missing required parameter: ${keys.join(' or ')}`);
    }
    return value;
  }

  readOptionalStringParam(
    params: Record<string, unknown>,
    keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = params[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  requireNumberParam(params: Record<string, unknown>, keys: string[]): number {
    const value = this.readOptionalNumberParam(params, keys);
    if (value === undefined) {
      throw new Error(`Missing required numeric parameter: ${keys.join(' or ')}`);
    }
    return value;
  }

  readOptionalNumberParam(
    params: Record<string, unknown>,
    keys: string[]
  ): number | undefined {
    for (const key of keys) {
      const value = params[key];
      if (typeof value === 'number' && !Number.isNaN(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }

  parseJsonStdout<T extends Record<string, unknown>>(stdout: string): T | null {
    if (!stdout || !stdout.trim()) {
      return null;
    }

    const normalized = stdout.trim();
    const candidates: string[] = [normalized];
    const fencedOrQuoted = normalized;
    if (
      (fencedOrQuoted.startsWith('"') && fencedOrQuoted.endsWith('"')) ||
      (fencedOrQuoted.startsWith("'") && fencedOrQuoted.endsWith("'"))
    ) {
      candidates.push(fencedOrQuoted.slice(1, -1));
    }

    const markdownResult = stdout.match(/### Result\s+([\s\S]*?)(?:\n### |\n```|$)/);
    if (markdownResult?.[1]) {
      const resultBody = markdownResult[1].trim();
      candidates.push(resultBody);
      if (
        (resultBody.startsWith('"') && resultBody.endsWith('"')) ||
        (resultBody.startsWith("'") && resultBody.endsWith("'"))
      ) {
        candidates.push(resultBody.slice(1, -1));
      }
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as T | string;
        if (typeof parsed === 'string') {
          return JSON.parse(parsed) as T;
        }
        return parsed;
      } catch {
        // Keep trying other normalized candidates.
      }
    }

    return null;
  }

  summarizeCliArgs(args: string[]): string[] {
    return args.map((arg) => {
      if (arg.length <= 160) {
        return arg;
      }
      return `${arg.slice(0, 157)}...`;
    });
  }

  summarizeParams(params: Record<string, unknown>): Record<string, unknown> {
    const summary: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        summary[key] = value.length <= 160 ? value : `${value.slice(0, 157)}...`;
        continue;
      }
      summary[key] = value;
    }
    return summary;
  }

  reportDebugEvent(
    hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E',
    location: string,
    msg: string,
    data: Record<string, unknown>
  ): void {
    const debugServerUrl = process.env.BROWSER_WORKER_DEBUG_ENDPOINT?.trim();
    if (!debugServerUrl) {
      return;
    }

    void fetch(debugServerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: process.env.BROWSER_WORKER_DEBUG_SESSION_ID || 'browser-worker',
        runId: process.env.BROWSER_WORKER_DEBUG_RUN_ID || 'runtime',
        hypothesisId,
        location,
        msg,
        data,
        ts: Date.now(),
      }),
    }).catch(() => undefined);
  }

  assertNoCliError(result: CliExecResult, prefix: string): void {
    const stderr = result.stderr?.trim();
    if (stderr && !stderr.startsWith('Debugger listening on')) {
      throw new Error(`${prefix}: ${stderr}`);
    }
    if (result.stdout.includes('### Error')) {
      throw new Error(`${prefix}: ${result.stdout}`);
    }
  }
}
