import { Injectable, Logger, Optional } from '@nestjs/common';
import { lookup } from 'dns/promises';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  BrowserControlStateDto,
  FreezeBrowserSessionDto,
  ResumeBrowserSessionDto,
} from '../../../../dto/worker.dto';
import { BrowserExecutionOptions, BrowserInitOptions } from '../browser-execution.adapter';
import { WorkerService } from '../../../worker/worker.service';
import { PlaywrightCliRunner } from './playwright-cli.runner';
import {
  CliExecResult,
  CliSessionState,
  getDefaultPlaywrightConfig,
  PlaywrightCliConfig,
} from './playwright.types';

@Injectable()
export class PlaywrightSessionManager {
  private readonly logger = new Logger(PlaywrightSessionManager.name);
  private readonly sessions = new Map<string, CliSessionState>();
  private readonly config: PlaywrightCliConfig;

  constructor(
    private readonly cliRunner: PlaywrightCliRunner,
    @Optional() private readonly workerService?: WorkerService,
    @Optional() config?: Partial<PlaywrightCliConfig>
  ) {
    this.config = { ...getDefaultPlaywrightConfig(), ...config };
  }

  getSessions(): Map<string, CliSessionState> {
    return this.sessions;
  }

  async onModuleDestroy(): Promise<void> {
    const sessionIds = [...this.sessions.keys()];
    for (const sessionId of sessionIds) {
      await this.closeSession(sessionId);
    }
  }

  getOrCreateSession(runtimeSessionId: string): CliSessionState {
    const existing = this.sessions.get(runtimeSessionId);
    if (existing) {
      return existing;
    }

    const session: CliSessionState = {
      runtimeSessionId,
      profilePath: path.join(this.config.profileDir, runtimeSessionId),
      initialized: false,
      attached: false,
      controlMode: 'AGENT_RUNNING',
    };

    this.sessions.set(runtimeSessionId, session);
    return session;
  }

  getControlState(runtimeSessionId: string): BrowserControlStateDto {
    const session = this.getOrCreateSession(runtimeSessionId);
    return {
      runtimeSessionId,
      controlMode: session.controlMode,
      frozen: session.controlMode === 'HUMAN_CONTROL',
      reason: session.frozenReason,
    };
  }

  async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.config.profileDir, { recursive: true });
    await fs.mkdir(this.config.artifactDir, { recursive: true });
  }

  shouldAttachToRemoteChrome(): boolean {
    return process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'development';
  }

  async openSession(sessionId: string, initialUrl: string): Promise<CliExecResult> {
    const session = this.getOrCreateSession(sessionId);

    this.cliRunner.reportDebugEvent(
      'C',
      'playwright-cli.adapter.ts:openSession:start',
      '[DEBUG] openSession start',
      {
        sessionId,
        initialUrl,
        attachToRemoteChrome: this.shouldAttachToRemoteChrome(),
        profilePath: session.profilePath,
      }
    );

    const result = this.shouldAttachToRemoteChrome()
      ? await this.attachToRemoteChrome(sessionId, initialUrl)
      : await this.cliRunner.execCli(sessionId, [
          'open',
          initialUrl,
          '--persistent',
          `--profile=${session.profilePath}`,
        ]);

    session.initialized = true;
    session.attached = this.shouldAttachToRemoteChrome();
    session.lastUrl = initialUrl;
    session.controlMode = 'AGENT_RUNNING';
    session.frozenReason = undefined;

    this.cliRunner.reportDebugEvent(
      'C',
      'playwright-cli.adapter.ts:openSession:success',
      '[DEBUG] openSession success',
      {
        sessionId,
        initialUrl,
        attached: session.attached,
      }
    );

    return result;
  }

  async configureSessionTimeouts(sessionId: string): Promise<void> {
    const script = `async page => {
      const actionTimeout = ${this.config.cliActionTimeoutMs};
      const navigationTimeout = ${this.config.cliNavigationTimeoutMs};
      page.setDefaultTimeout(actionTimeout);
      page.setDefaultNavigationTimeout(navigationTimeout);
      page.context().setDefaultTimeout(actionTimeout);
      page.context().setDefaultNavigationTimeout(navigationTimeout);
      await page.bringToFront().catch(() => {});
      return JSON.stringify({ actionTimeout, navigationTimeout });
    }`;

    try {
      await this.cliRunner.execCli(sessionId, ['run-code', script]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to configure Playwright timeouts for ${sessionId}: ${errorMessage}`);
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.initialized) {
      return;
    }

    try {
      await this.cliRunner.execCli(sessionId, [session.attached ? 'detach' : 'close']);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to close CLI session ${sessionId}: ${errorMessage}`);
    } finally {
      session.initialized = false;
      session.attached = false;
    }
  }

  async ensureSessionReady(sessionId: string): Promise<void> {
    const session = this.getOrCreateSession(sessionId);
    if (session.controlMode === 'HUMAN_CONTROL') {
      throw new Error(session.frozenReason || 'Browser session is under human control');
    }

    if (!session.initialized) {
      await this.openSession(sessionId, session.lastUrl || 'about:blank');
    }
  }

  async attachToRemoteChrome(
    sessionId: string,
    initialUrl: string
  ): Promise<CliExecResult> {
    const cdpUrl = await this.resolveSessionCdpUrl(sessionId);
    const attachResult = await this.cliRunner.execCli(sessionId, ['attach', `--cdp=${cdpUrl}`]);

    if (initialUrl && initialUrl !== 'about:blank') {
      const script = `async page => {
        await page.goto(${JSON.stringify(initialUrl)}).catch(() => {});
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.bringToFront().catch(() => {});
        return "initial-navigated";
      }`;
      const gotoResult = await this.cliRunner.execCli(sessionId, ['run-code', script]);
      return {
        stdout: [attachResult.stdout, gotoResult.stdout].filter(Boolean).join('\n'),
        stderr: [attachResult.stderr, gotoResult.stderr].filter(Boolean).join('\n'),
      };
    }

    return attachResult;
  }

  async resolveSessionCdpUrl(sessionId: string): Promise<string> {
    if (this.workerService) {
      const workerDebuggerWsUrl = await this.workerService.getPublicDebuggerWsUrl(sessionId);
      if (workerDebuggerWsUrl) {
        this.cliRunner.reportDebugEvent(
          'C',
          'playwright-cli.adapter.ts:resolveSessionCdpUrl:worker-ws',
          '[DEBUG] resolveSessionCdpUrl via worker websocket',
          { sessionId, cdpUrl: workerDebuggerWsUrl }
        );
        return workerDebuggerWsUrl;
      }

      const workerCdpHttpUrl = this.workerService.getPublicCdpHttpUrl(sessionId);
      if (workerCdpHttpUrl) {
        this.cliRunner.reportDebugEvent(
          'C',
          'playwright-cli.adapter.ts:resolveSessionCdpUrl:worker-http',
          '[DEBUG] resolveSessionCdpUrl via worker http',
          { sessionId, cdpUrl: workerCdpHttpUrl }
        );
        return workerCdpHttpUrl;
      }
    }

    const remoteHost = await this.resolveRemoteDebuggingHost();
    const fallbackUrl = `http://${remoteHost}:${this.config.chromeRemoteDebuggingPort}`;
    this.cliRunner.reportDebugEvent(
      'C',
      'playwright-cli.adapter.ts:resolveSessionCdpUrl:fallback',
      '[DEBUG] resolveSessionCdpUrl fallback host',
      { sessionId, remoteHost, cdpUrl: fallbackUrl }
    );
    return fallbackUrl;
  }

  async resolveRemoteDebuggingHost(): Promise<string> {
    if (
      this.config.chromeRemoteDebuggingHost === 'localhost' ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(this.config.chromeRemoteDebuggingHost)
    ) {
      return this.config.chromeRemoteDebuggingHost;
    }

    try {
      const result = await lookup(this.config.chromeRemoteDebuggingHost, { family: 4 });
      return result.address;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to resolve ${this.config.chromeRemoteDebuggingHost} to IP, falling back to host name: ${errorMessage}`
      );
      return this.config.chromeRemoteDebuggingHost;
    }
  }

  async freeze(dto: FreezeBrowserSessionDto): Promise<BrowserControlStateDto> {
    const session = this.getOrCreateSession(dto.runtimeSessionId);
    session.controlMode = 'HUMAN_CONTROL';
    session.frozenReason = dto.reason || 'Human takeover requested';
    return this.getControlState(dto.runtimeSessionId);
  }

  async resume(dto: ResumeBrowserSessionDto): Promise<BrowserControlStateDto> {
    const session = this.getOrCreateSession(dto.runtimeSessionId);
    session.controlMode = 'AGENT_RUNNING';
    session.frozenReason = undefined;
    return this.getControlState(dto.runtimeSessionId);
  }

  async initBrowser(options?: BrowserInitOptions): Promise<{ success: boolean; message: string }> {
    const sessionId = options?.runtimeSessionId || 'default';
    const initialUrl = options?.initialUrl || 'about:blank';

    this.logger.log(`Initializing Playwright CLI session ${sessionId} at ${initialUrl}`);
    this.cliRunner.reportDebugEvent(
      'C',
      'playwright-cli.adapter.ts:initBrowser:start',
      '[DEBUG] initBrowser start',
      {
        sessionId,
        initialUrl,
        sessionPreferences: options?.sessionPreferences || null,
      }
    );

    try {
      if (this.workerService) {
        await this.workerService.ensureSessionWorker(sessionId, {
          mode: options?.sessionPreferences?.mode,
          enableCodegen: options?.sessionPreferences?.enableCodegen,
          headless: options?.sessionPreferences?.headless,
        });
        this.cliRunner.reportDebugEvent(
          'C',
          'playwright-cli.adapter.ts:initBrowser:worker-ready',
          '[DEBUG] initBrowser worker ready',
          { sessionId }
        );
      }
      await this.ensureDirectories();
      await this.openSession(sessionId, initialUrl);
      await this.configureSessionTimeouts(sessionId);
      this.cliRunner.reportDebugEvent(
        'C',
        'playwright-cli.adapter.ts:initBrowser:success',
        '[DEBUG] initBrowser success',
        { sessionId, initialUrl }
      );
      return { success: true, message: `Playwright CLI session ${sessionId} initialized` };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initialize CLI browser: ${errorMessage}`);
      this.cliRunner.reportDebugEvent(
        'C',
        'playwright-cli.adapter.ts:initBrowser:error',
        '[DEBUG] initBrowser failed',
        { sessionId, initialUrl, errorMessage }
      );
      return { success: false, message: errorMessage };
    }
  }

  async resetBrowser(options?: BrowserExecutionOptions): Promise<void> {
    const sessionId = options?.runtimeSessionId || 'default';
    await this.closeSession(sessionId);

    try {
      await this.cliRunner.execCli(sessionId, ['delete-data']);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to delete CLI session data for ${sessionId}: ${errorMessage}`);
    }

    this.sessions.delete(sessionId);
    if (this.workerService) {
      const worker = await this.workerService.getWorkerByRuntimeSessionId(sessionId);
      if (worker) {
        await this.workerService.deleteWorker(worker.worker_id).catch((error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(`Failed to delete worker for ${sessionId}: ${errorMessage}`);
        });
      }
    }
  }
}
