import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { lookup } from 'dns/promises';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import {
  AssertBrowserStateDto,
  BrowserPageAssertionResultDto,
  BrowserPageStateDto,
  BrowserControlStateDto,
  ExecuteStepDto,
  ExecuteStepResultDto,
  FreezeBrowserSessionDto,
  InspectBrowserStateDto,
  ResumeBrowserSessionDto,
} from '../../../dto/worker.dto';
import {
  BrowserExecutionAdapter,
  BrowserExecutionOptions,
  BrowserInitOptions,
  MCPCommand,
} from './browser-execution.adapter';
import { WorkerService } from '../../worker/worker.service';

interface CliSessionState {
  runtimeSessionId: string;
  profilePath: string;
  initialized: boolean;
  attached: boolean;
  controlMode: 'AGENT_RUNNING' | 'HUMAN_CONTROL';
  frozenReason?: string;
  preferLatestTab?: boolean;
  lastUrl?: string;
  lastSearchResults?: Array<{
    rank: number;
    text: string;
    href: string;
    score?: number;
    host?: string;
  }>;
}

interface CliBinary {
  command: string;
  baseArgs: string[];
}

interface CliExecResult {
  stdout: string;
  stderr: string;
}

interface CliActionResult {
  status: 'success';
  command: string;
  stdout?: string;
  stderr?: string;
  screenshot?: string;
  html?: string;
  text?: string;
  data?: Record<string, unknown>;
  snapshot?: {
    id: string;
    path: string;
  };
}

@Injectable()
export class PlaywrightCliAdapter implements BrowserExecutionAdapter {
  readonly backend = 'cli' as const;

  private readonly logger = new Logger(PlaywrightCliAdapter.name);
  private readonly sessions = new Map<string, CliSessionState>();
  private readonly profileDir =
    process.env.PLAYWRIGHT_CLI_PROFILE_DIR?.trim() ||
    path.join(process.cwd(), 'temp', 'playwright-profiles');
  private readonly artifactDir =
    process.env.PLAYWRIGHT_CLI_ARTIFACT_DIR?.trim() ||
    path.join(process.cwd(), 'temp', 'playwright-cli-artifacts');
  private readonly screenshotCompressionThresholdBytes = 350 * 1024;
  private readonly screenshotMaxDimension = 1600;
  private readonly screenshotJpegQuality = 70;
  private readonly maxHtmlChars = parseInt(
    process.env.PLAYWRIGHT_CLI_MAX_HTML_CHARS || '120000',
    10
  );
  private readonly cliAutoArtifactTimeoutMs = this.readTimeoutMs(
    'PLAYWRIGHT_CLI_AUTO_ARTIFACT_TIMEOUT_MS',
    8000
  );
  private readonly cliActionTimeoutMs = this.readTimeoutMs(
    'PLAYWRIGHT_CLI_ACTION_TIMEOUT_MS',
    60000
  );
  private readonly cliNavigationTimeoutMs = this.readTimeoutMs(
    'PLAYWRIGHT_CLI_NAVIGATION_TIMEOUT_MS',
    60000
  );
  private readonly cliProcessTimeoutMs = this.readTimeoutMs(
    'PLAYWRIGHT_CLI_PROCESS_TIMEOUT_MS',
    120000
  );
  private readonly cliPageSettleTimeoutMs = this.readTimeoutMs(
    'PLAYWRIGHT_CLI_PAGE_SETTLE_TIMEOUT_MS',
    8000
  );
  private readonly chromeRemoteDebuggingHost =
    process.env.CHROME_REMOTE_DEBUGGING_HOST || 'browser-chrome';
  private readonly chromeRemoteDebuggingPort = Number(
    process.env.CHROME_REMOTE_DEBUGGING_PORT || '9222'
  );
  private cliBinaryPromise?: Promise<CliBinary>;

  constructor(private readonly workerService: WorkerService) {}

  async onModuleDestroy() {
    const sessionIds = [...this.sessions.keys()];
    for (const sessionId of sessionIds) {
      await this.closeSession(sessionId);
    }
  }

  async initBrowser(options?: BrowserInitOptions): Promise<{ success: boolean; message: string }> {
    const sessionId = options?.runtimeSessionId || 'default';
    const initialUrl = options?.initialUrl || 'about:blank';

    this.logger.log(`Initializing Playwright CLI session ${sessionId} at ${initialUrl}`);

    try {
      await this.workerService.ensureSessionWorker(sessionId, {
        mode: options?.sessionPreferences?.mode,
        enableCodegen: options?.sessionPreferences?.enableCodegen,
        headless: options?.sessionPreferences?.headless,
      });
      await this.ensureDirectories();
      await this.openSession(sessionId, initialUrl);
      await this.configureSessionTimeouts(sessionId);
      return { success: true, message: `Playwright CLI session ${sessionId} initialized` };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initialize CLI browser: ${errorMessage}`);
      return { success: false, message: errorMessage };
    }
  }

  async executeCommands(
    commands: MCPCommand[],
    options?: BrowserExecutionOptions
  ): Promise<{ success: boolean; results: any[]; message?: string }> {
    const sessionId = options?.runtimeSessionId || 'default';
    const includeArtifacts = options?.includeArtifacts !== false;
    const results: any[] = [];

    const totalCommands = commands.length;
    for (const [index, command] of commands.entries()) {
      try {
        const rawResult = await this.runCliAction(command.tool, command.params || {}, sessionId);
        const shouldEnrich =
          includeArtifacts && this.shouldEnrichCommandResult(command.tool, index, totalCommands);
        const enrichedResult = shouldEnrich
          ? await this.enrichResultArtifacts(sessionId, rawResult)
          : rawResult;
        const result = includeArtifacts
          ? enrichedResult
          : this.stripResultArtifacts(enrichedResult);
        results.push(result);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          status: 'error',
          command: command.tool,
          message: errorMessage,
        });
      }
    }

    const success = results.every((result) => result.status !== 'error');
    const firstFailure = results.find((result) => result?.status === 'error');
    const failureSummary = firstFailure
      ? [
          String(firstFailure.command || 'unknown'),
          String(firstFailure.message || 'unknown error'),
        ].join(': ')
      : '';
    return {
      success,
      results,
      message: success
        ? undefined
        : failureSummary
          ? `One or more CLI commands failed. First failure: ${failureSummary}`
          : 'One or more CLI commands failed',
    };
  }

  async resetBrowser(options?: BrowserExecutionOptions): Promise<void> {
    const sessionId = options?.runtimeSessionId || 'default';
    await this.closeSession(sessionId);

    try {
      await this.execCli(sessionId, ['delete-data']);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to delete CLI session data for ${sessionId}: ${errorMessage}`);
    }

    this.sessions.delete(sessionId);
    const worker = await this.workerService.getWorkerByRuntimeSessionId(sessionId);
    if (worker) {
      await this.workerService.deleteWorker(worker.worker_id).catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Failed to delete worker for ${sessionId}: ${errorMessage}`);
      });
    }
  }

  async executeStep(dto: ExecuteStepDto): Promise<ExecuteStepResultDto> {
    const sessionId = dto.runtimeSessionId || 'default';

    try {
      const result = await this.runCliAction(
        dto.action,
        {
          target: dto.target,
          ...dto.args,
        },
        sessionId
      );
      const pageState = await this.inspectPageState(sessionId).catch(
        () =>
          ({
            runtimeSessionId: sessionId,
            pageUrl: this.getOrCreateSession(sessionId).lastUrl,
            observedAt: new Date().toISOString(),
          }) as BrowserPageStateDto
      );

      return {
        success: true,
        snapshotId: result.snapshot?.id,
        output: {
          ...(result as unknown as Record<string, unknown>),
          pageUrl: pageState.pageUrl,
          pageTitle: pageState.pageTitle,
          pageFingerprint: pageState.pageFingerprint,
        },
        artifacts: result.snapshot?.id
          ? [
              {
                type: 'snapshot',
                id: result.snapshot.id,
                metadata: {
                  ...(result.snapshot.path ? { path: result.snapshot.path } : {}),
                },
              },
            ]
          : undefined,
        snapshot: result.snapshot?.id
          ? {
              id: result.snapshot.id,
              type: 'browser',
              url: pageState.pageUrl,
              createdAt: pageState.observedAt,
              metadata: {
                ...(result.snapshot.path ? { path: result.snapshot.path } : {}),
                ...(pageState.pageTitle ? { pageTitle: pageState.pageTitle } : {}),
                ...(pageState.pageFingerprint
                  ? { pageFingerprint: pageState.pageFingerprint }
                  : {}),
              },
            }
          : undefined,
        pageState,
        shouldTakeover: false,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`CLI step execution failed: ${errorMessage}`);

      return {
        success: false,
        errorCode: 'STEP_EXECUTION_ERROR',
        errorMessage,
        shouldTakeover: false,
      };
    }
  }

  async inspectState(dto: InspectBrowserStateDto): Promise<BrowserPageStateDto> {
    return this.inspectPageState(dto.runtimeSessionId || 'default');
  }

  async assertState(dto: AssertBrowserStateDto): Promise<BrowserPageAssertionResultDto> {
    const pageState = await this.inspectPageState(dto.runtimeSessionId || 'default');
    const selectorMatched = dto.selectorExists
      ? await this.checkSelectorExists(dto.runtimeSessionId || 'default', dto.selectorExists)
      : undefined;
    const textMatched = dto.textIncludes
      ? await this.checkTextIncludes(dto.runtimeSessionId || 'default', dto.textIncludes)
      : undefined;

    const details: Record<string, unknown> = {
      selectorMatched: selectorMatched ?? null,
      textMatched: textMatched ?? null,
    };

    const matched = this.matchPageAssertion(dto, pageState, selectorMatched, textMatched);
    return {
      matched,
      pageState,
      details,
    };
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

  async generateLocator(
    targetRef: string,
    options?: BrowserExecutionOptions
  ): Promise<string | undefined> {
    const sessionId = options?.runtimeSessionId || 'default';
    await this.ensureSessionReady(sessionId);
    const result = await this.execCli(sessionId, ['--raw', 'generate-locator', targetRef]);
    this.assertNoCliError(result, 'Generate locator failed');
    const locator = result.stdout.trim();
    return locator || undefined;
  }

  private async runCliAction(
    action: string,
    params: Record<string, unknown>,
    sessionId: string
  ): Promise<CliActionResult> {
    await this.ensureDirectories();
    const normalizedParams = await this.resolveRuntimeTargetRefs(action, params, sessionId);

    switch (action) {
      case 'goto':
      case 'navigate':
        return this.handleNavigate(
          sessionId,
          this.requireStringParam(normalizedParams, ['target', 'url'])
        );
      case 'click':
        return this.handleClick(sessionId, normalizedParams);
      case 'fill':
        return this.handleSimpleCommand(sessionId, 'fill', [
          this.requireStringParam(normalizedParams, ['target', 'selector']),
          this.requireStringParam(normalizedParams, ['value', 'text']),
        ]);
      case 'type':
      case 'type_text':
        return this.handleTypeText(sessionId, normalizedParams);
      case 'press':
      case 'press_key':
        return this.handleSimpleCommand(sessionId, 'press', [
          this.requireStringParam(normalizedParams, ['key', 'target']),
        ]);
      case 'hover':
        return this.handleSimpleCommand(sessionId, 'hover', [
          this.requireStringParam(normalizedParams, ['target', 'selector']),
        ]);
      case 'drag':
        return this.handleSimpleCommand(sessionId, 'drag', [
          this.requireStringParam(normalizedParams, ['src']),
          this.requireStringParam(normalizedParams, ['dst']),
        ]);
      case 'screenshot':
        return this.handleScreenshot(sessionId, normalizedParams);
      case 'snapshot':
        return this.handleSnapshot(sessionId, normalizedParams);
      case 'evaluate':
        return this.handleEvaluate(
          sessionId,
          this.requireStringParam(normalizedParams, ['script'])
        );
      case 'wait':
        return this.handleWait(sessionId, normalizedParams);
      case 'scroll':
        return this.handleScroll(sessionId, normalizedParams);
      case 'read_page':
      case 'get_text':
        return this.handleReadPage(sessionId, normalizedParams);
      case 'search':
        return this.handleSearch(
          sessionId,
          this.requireStringParam(normalizedParams, ['query', 'text'])
        );
      case 'smart_search':
        return this.handleSmartSearch(
          sessionId,
          this.requireStringParam(normalizedParams, ['query', 'text'])
        );
      case 'list_search_results':
      case 'inspect_search_results':
        return this.handleListSearchResults(sessionId, normalizedParams);
      case 'click_result':
        return this.handleClickResult(
          sessionId,
          this.requireNumberParam(normalizedParams, ['index'])
        );
      case 'switch_latest_tab':
      case 'focus_latest_page':
        return this.handleSwitchLatestTab(sessionId);
      default:
        throw new Error(`Unsupported Playwright CLI action: ${action}`);
    }
  }

  private async handleNavigate(sessionId: string, url: string): Promise<CliActionResult> {
    const session = this.getOrCreateSession(sessionId);

    let result: CliExecResult;
    if (!session.initialized) {
      result = await this.openSession(sessionId, url);
    } else {
      // Use run-code to ensure page is brought to front after navigation
      const script = `async page => {
        await page.goto(${JSON.stringify(url)});
        await page.bringToFront().catch(() => {});
        return JSON.stringify({ url: page.url(), status: "navigated" });
      }`;
      result = await this.execCli(sessionId, ['run-code', script]);
      session.lastUrl = url;
    }
    this.assertNoCliError(result, 'Navigation failed');

    return {
      status: 'success',
      command: 'navigate',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { url },
    };
  }

  private async handleClick(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    const explicitTarget = this.readOptionalStringParam(params, ['target', 'selector']);
    if (explicitTarget) {
      const positionalClickResult = await this.executePositionalSelectorAction(
        sessionId,
        explicitTarget,
        'click'
      );
      if (positionalClickResult) {
        return positionalClickResult;
      }
      return this.handleSimpleCommand(sessionId, 'click', [explicitTarget]);
    }

    const text = this.readOptionalStringParam(params, ['text']);
    if (!text) {
      throw new Error('Missing required parameter: target or selector or text');
    }

    await this.ensureSessionReady(sessionId);
    const result = await this.execCli(sessionId, [
      'run-code',
      this.buildTextClickScript(sessionId, text),
    ]);
    this.assertNoCliError(result, 'Text click failed');

    return {
      status: 'success',
      command: 'click',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { text },
    };
  }

  private buildTextClickScript(sessionId: string, text: string): string {
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';

    return `async page => {
      const activePage = ${activePageExpr};
      const clickByText = async (scope) => {
        const candidates = [
          scope.getByRole('button', { name: ${JSON.stringify(text)}, exact: false }).first(),
          scope.getByRole('link', { name: ${JSON.stringify(text)}, exact: false }).first(),
          scope.getByText(${JSON.stringify(text)}, { exact: false }).first(),
        ];
        for (const locator of candidates) {
          const count = await locator.count().catch(() => 0);
          if (!count) continue;
          await locator.scrollIntoViewIfNeeded().catch(() => {});
          await locator.click({ force: true, timeout: 5000 });
          return true;
        }
        return false;
      };

      if (await clickByText(activePage).catch(() => false)) {
        await activePage.waitForTimeout(300).catch(() => {});
        return JSON.stringify({ text: ${JSON.stringify(text)}, matchedIn: 'page' });
      }

      for (const frame of activePage.frames()) {
        if (frame === activePage.mainFrame()) continue;
        if (await clickByText(frame).catch(() => false)) {
          await activePage.waitForTimeout(300).catch(() => {});
          return JSON.stringify({ text: ${JSON.stringify(text)}, matchedIn: 'iframe' });
        }
      }

      throw new Error(${JSON.stringify(`Text click failed to find element: ${text}`)});
    }`;
  }

  private async handleSimpleCommand(
    sessionId: string,
    command: string,
    args: string[]
  ): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);
    const normalizedArgs = args.map((arg, index) =>
      index === 0 ? this.normalizeSemanticRoleSelector(arg) : arg
    );
    let result: CliExecResult | undefined;
    try {
      result = await this.execCli(sessionId, [command, ...normalizedArgs]);
      this.assertNoCliError(result, `${command} failed`);
    } catch (error: unknown) {
      const fallbackArgs = this.buildPlaceholderFallbackArgs(command, normalizedArgs, error);
      if (fallbackArgs) {
        try {
          result = await this.execCli(sessionId, [command, ...fallbackArgs]);
          this.assertNoCliError(result, `${command} failed`);
        } catch (fbError) {
          result = await this.executeIframeFallback(sessionId, command, fallbackArgs).catch(
            () => undefined
          );
          if (!result) throw fbError;
        }
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error || '');
        if (
          /does not match any elements|No element found|Timeout/i.test(errorMessage) ||
          /failed/i.test(errorMessage)
        ) {
          result = await this.executeIframeFallback(sessionId, command, normalizedArgs).catch(
            () => undefined
          );
          if (!result) throw error;
        } else {
          throw error;
        }
      }
    }

    return {
      status: 'success',
      command,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  private async executeIframeFallback(
    sessionId: string,
    command: string,
    args: string[]
  ): Promise<CliExecResult> {
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';

    const target = args[0];
    if (!target || typeof target !== 'string' || command === 'press' || command === 'drag') {
      throw new Error(`Iframe fallback not supported for command: ${command}`);
    }

    let actionCode = '';
    if (command === 'click') {
      actionCode = `await loc.first().click({ force: true, timeout: 5000 });`;
    } else if (command === 'fill') {
      actionCode = `await loc.first().fill(${JSON.stringify(args[1] || '')}, { timeout: 5000 });`;
    } else if (command === 'hover') {
      actionCode = `await loc.first().hover({ timeout: 5000 });`;
    } else {
      throw new Error(`Iframe fallback not supported for command: ${command}`);
    }

    const script = `async page => {
      const activePage = ${activePageExpr};
      const frames = activePage.frames();
      let found = false;
      for (const frame of frames) {
        if (frame === activePage.mainFrame()) continue;
        const loc = frame.locator(${JSON.stringify(target)});
        if (await loc.count().catch(() => 0) > 0) {
          try {
            ${actionCode}
            found = true;
            break;
          } catch (e) {
            // ignore and try next frame if action fails
          }
        }
      }
      if (!found) {
        throw new Error("Iframe fallback failed to find or interact with element");
      }
      return "iframe-fallback-success";
    }`;

    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, `Iframe fallback ${command} failed`);
    return result;
  }

  private async handleTypeText(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);

    const text = this.requireStringParam(params, ['text', 'value']);
    const typeResult = await this.execCli(sessionId, ['type', text]);
    this.assertNoCliError(typeResult, 'Type text failed');
    const submitKey = this.readOptionalStringParam(params, ['submit_key']);

    if (!submitKey) {
      return {
        status: 'success',
        command: 'type',
        stdout: typeResult.stdout,
        stderr: typeResult.stderr,
        data: { text },
      };
    }

    const pressResult = await this.execCli(sessionId, ['press', submitKey]);
    this.assertNoCliError(pressResult, `Press ${submitKey} failed`);
    return {
      status: 'success',
      command: 'type_text',
      stdout: [typeResult.stdout, pressResult.stdout].filter(Boolean).join('\n'),
      stderr: [typeResult.stderr, pressResult.stderr].filter(Boolean).join('\n'),
      data: { text, submitKey },
    };
  }

  private async handleScreenshot(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);

    const screenshotPath = path.join(this.artifactDir, `${sessionId}-${Date.now()}.png`);
    const target = this.readOptionalStringParam(params, ['target', 'selector']);
    const fullPage = params.fullPage === true;
    let result = await this.captureScreenshot(sessionId, screenshotPath, { target, fullPage });

    try {
      this.assertNoCliError(result, 'Screenshot failed');
    } catch (error: unknown) {
      if (target) {
        const errorMessage = error instanceof Error ? error.message : String(error || '');
        if (
          /does not match any elements|No element found|Timeout/i.test(errorMessage) ||
          /failed/i.test(errorMessage)
        ) {
          try {
            result = await this.captureIframeScreenshotFallback(sessionId, screenshotPath, target);
            this.assertNoCliError(result, 'Iframe screenshot failed');
          } catch (fbError) {
            throw error; // Throw original error
          }
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    const screenshotBase64 = await this.readScreenshotAsBase64(screenshotPath);

    return {
      status: 'success',
      command: 'screenshot',
      stdout: result.stdout,
      stderr: result.stderr,
      screenshot: screenshotBase64,
      snapshot: {
        id: path.basename(screenshotPath, '.png'),
        path: screenshotPath,
      },
      data: { path: screenshotPath },
    };
  }

  private async captureIframeScreenshotFallback(
    sessionId: string,
    screenshotPath: string,
    target: string
  ): Promise<CliExecResult> {
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';

    const script = `async page => {
      const activePage = ${activePageExpr};
      const frames = activePage.frames();
      let locator = null;
      for (const frame of frames) {
        if (frame === activePage.mainFrame()) continue;
        const loc = frame.locator(${JSON.stringify(target)});
        if (await loc.count().catch(() => 0) > 0) {
          locator = loc.first();
          break;
        }
      }
      if (!locator) {
        throw new Error("Iframe fallback failed to find element for screenshot");
      }
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.screenshot({
        path: ${JSON.stringify(screenshotPath)},
        timeout: ${this.cliActionTimeoutMs},
      });
      return JSON.stringify({ path: ${JSON.stringify(screenshotPath)}, target: ${JSON.stringify(target)}, iframe: true });
    }`;

    return this.execCli(sessionId, ['run-code', script]);
  }

  private async handleSnapshot(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);

    const snapshotPath = path.join(this.artifactDir, `${sessionId}-${Date.now()}.yaml`);
    const target = this.readOptionalStringParam(params, ['target', 'selector']);
    const args = ['snapshot'];

    if (target) {
      args.push(target);
    }

    args.push(`--filename=${snapshotPath}`);
    const result = await this.execCli(sessionId, args);
    this.assertNoCliError(result, 'Snapshot failed');
    const snapshotContent = await fs.readFile(snapshotPath, 'utf8');

    return {
      status: 'success',
      command: 'snapshot',
      stdout: result.stdout,
      stderr: result.stderr,
      snapshot: {
        id: path.basename(snapshotPath, '.yaml'),
        path: snapshotPath,
      },
      data: { path: snapshotPath, content: snapshotContent },
    };
  }

  private async handleEvaluate(sessionId: string, script: string): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);
    const result = await this.execCli(sessionId, ['--raw', 'eval', script]);
    this.assertNoCliError(result, 'Evaluate script failed');

    return {
      status: 'success',
      command: 'evaluate',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { result: result.stdout.trim() },
    };
  }

  private async inspectPageState(sessionId: string): Promise<BrowserPageStateDto> {
    await this.ensureSessionReady(sessionId);
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const script = `async page => {
      const activePage = ${activePageExpr};
      await activePage.bringToFront().catch(() => {});
      const title = await activePage.title().catch(() => '');
      const url = activePage.url();
      const readyState = await activePage.evaluate(() => document.readyState).catch(() => '');
      return JSON.stringify({
        pageUrl: url,
        pageTitle: title,
        readyState,
      });
    }`;
    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'Inspect page state failed');
    const payload = this.parseJsonStdout<Record<string, unknown>>(result.stdout);
    const pageUrl = typeof payload?.pageUrl === 'string' ? payload.pageUrl.trim() : '';
    const pageTitle = typeof payload?.pageTitle === 'string' ? payload.pageTitle.trim() : '';
    const readyState = typeof payload?.readyState === 'string' ? payload.readyState.trim() : '';
    if (pageUrl) {
      session.lastUrl = pageUrl;
    }
    return {
      runtimeSessionId: sessionId,
      pageUrl: pageUrl || session.lastUrl,
      pageTitle: pageTitle || undefined,
      pageFingerprint: this.buildPageFingerprint(pageUrl || session.lastUrl, pageTitle),
      readyState: readyState || undefined,
      observedAt: new Date().toISOString(),
    };
  }

  private async checkSelectorExists(sessionId: string, selector: string): Promise<boolean> {
    await this.ensureSessionReady(sessionId);
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const script = `async page => {
      const activePage = ${activePageExpr};
      let count = await activePage.locator(${JSON.stringify(selector)}).count().catch(() => 0);
      if (count === 0) {
        for (const frame of activePage.frames()) {
          if (frame === activePage.mainFrame()) continue;
          count = await frame.locator(${JSON.stringify(selector)}).count().catch(() => 0);
          if (count > 0) break;
        }
      }
      return JSON.stringify({ matched: count > 0 });
    }`;
    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'Check selector existence failed');
    const payload = this.parseJsonStdout<Record<string, unknown>>(result.stdout);
    return Boolean(payload?.matched);
  }

  private async checkTextIncludes(sessionId: string, text: string): Promise<boolean> {
    await this.ensureSessionReady(sessionId);
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const script = `async page => {
      const activePage = ${activePageExpr};
      let bodyText = await activePage.evaluate(() => document.body?.innerText || '').catch(() => '');
      let matched = bodyText.includes(${JSON.stringify(text)});
      if (!matched) {
        for (const frame of activePage.frames()) {
          if (frame === activePage.mainFrame()) continue;
          const frameText = await frame.evaluate(() => document.body?.innerText || '').catch(() => '');
          if (frameText.includes(${JSON.stringify(text)})) {
            matched = true;
            break;
          }
        }
      }
      return JSON.stringify({ matched });
    }`;
    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'Check page text failed');
    const payload = this.parseJsonStdout<Record<string, unknown>>(result.stdout);
    return Boolean(payload?.matched);
  }

  private async handleWait(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);

    const selector =
      this.normalizeSemanticRoleSelector(
        this.readOptionalStringParam(params, ['target', 'selector']) || ''
      ) || undefined;
    const duration = this.readOptionalNumberParam(params, ['duration']) ?? 1000;
    const positionalSelector = selector ? this.parseNthMatchSelector(selector) : null;
    const selectorExpr = positionalSelector
      ? `activePage.locator(${JSON.stringify(positionalSelector.selector)}).nth(${positionalSelector.index})`
      : selector
        ? `activePage.locator(${JSON.stringify(selector)}).first()`
        : null;
    const frameSelectorExpr = positionalSelector
      ? `frame.locator(${JSON.stringify(positionalSelector.selector)}).nth(${positionalSelector.index})`
      : selector
        ? `frame.locator(${JSON.stringify(selector)}).first()`
        : null;

    const script = selectorExpr
      ? `async page => {
          const activePage = page;
          let found = false;
          try {
            await ${selectorExpr}.waitFor({ timeout: ${duration} });
            found = true;
          } catch (e) {
            for (const frame of activePage.frames()) {
              if (frame === activePage.mainFrame()) continue;
              try {
                await ${frameSelectorExpr}.waitFor({ timeout: ${duration} });
                found = true;
                break;
              } catch (e2) {}
            }
          }
          if (!found) throw new Error("Timeout waiting for selector in page and iframes");
          return "selector-ready";
        }`
      : `async page => { await page.waitForTimeout(${duration}); return "waited-${duration}"; }`;

    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'Wait failed');

    return {
      status: 'success',
      command: 'wait',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { selector, duration },
    };
  }

  private async handleScroll(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);

    const direction = this.readOptionalStringParam(params, ['direction']) || 'down';
    const amount = this.readOptionalNumberParam(params, ['amount']) ?? 600;

    let script = '';
    switch (direction) {
      case 'up':
        script = `async page => { await page.evaluate(() => window.scrollBy(0, -${amount})); return "scrolled-up"; }`;
        break;
      case 'top':
        script =
          'async page => { await page.evaluate(() => window.scrollTo(0, 0)); return "scrolled-top"; }';
        break;
      case 'bottom':
        script =
          'async page => { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); return "scrolled-bottom"; }';
        break;
      default:
        script = `async page => { await page.evaluate(() => window.scrollBy(0, ${amount})); return "scrolled-down"; }`;
        break;
    }

    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'Scroll failed');

    return {
      status: 'success',
      command: 'scroll',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { direction, amount },
    };
  }

  private async handleReadPage(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);
    const session = this.getOrCreateSession(sessionId);

    const selector = this.readOptionalStringParam(params, ['selector', 'target']);
    const maxLength = this.readOptionalNumberParam(params, ['max_length']) ?? 4000;
    const method =
      this.readOptionalStringParam(params, ['method']) || (selector ? 'textContent' : 'innerText');
    const attributeName = this.readOptionalStringParam(params, ['attribute']);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';

    const script = selector
      ? `async page => {
          const activePage = ${activePageExpr};
          const method = ${JSON.stringify(method)};
          const attributeName = ${JSON.stringify(attributeName || '')};
          const maxLength = ${maxLength};
          const readLocatorValue = async (locator) => {
            if (method === 'visible') {
              return String(await locator.isVisible().catch(() => false));
            }
            if (method === 'attribute') {
              if (!attributeName) return '';
              const attrValue = await locator.getAttribute(attributeName).catch(() => null);
              return typeof attrValue === 'string' ? attrValue.slice(0, maxLength) : '';
            }
            if (method === 'value') {
              const inputValue = await locator.inputValue().catch(() => null);
              if (typeof inputValue === 'string') {
                return inputValue.slice(0, maxLength);
              }
              const fallbackValue = await locator.getAttribute('value').catch(() => null);
              return typeof fallbackValue === 'string' ? fallbackValue.slice(0, maxLength) : '';
            }
            if (method === 'innerText') {
              const innerText = await locator.innerText().catch(() => null);
              return typeof innerText === 'string' ? innerText.slice(0, maxLength) : '';
            }
            const text = await locator.textContent().catch(() => null);
            return typeof text === 'string' ? text.slice(0, maxLength) : '';
          };
          const readLocatorText = async (scope) => {
            const locator = scope.locator(${JSON.stringify(selector)}).first();
            const count = await locator.count().catch(() => 0);
            if (!count) {
              return null;
            }
            return readLocatorValue(locator);
          };
          let text = await readLocatorText(activePage);
          
          if (text === null) {
            for (const frame of activePage.frames()) {
              if (frame === activePage.mainFrame()) continue;
              const frameText = await readLocatorText(frame).catch(() => null);
              if (frameText !== null) {
                text = frameText;
                break;
              }
            }
          }
          return text || '';
        }`
      : `async page => {
          const activePage = ${activePageExpr};
          let text = await activePage.evaluate(
            ({ maxLength, method, attributeName }) => {
              const body = document.body;
              if (!body) return '';
              if (method === 'visible') {
                return 'true';
              }
              if (method === 'attribute') {
                if (!attributeName) return '';
                return String(body.getAttribute(attributeName) || '').slice(0, maxLength);
              }
              if (method === 'value') {
                return String(body.getAttribute('value') || '').slice(0, maxLength);
              }
              if (method === 'textContent') {
                return String(body.textContent || '').slice(0, maxLength);
              }
              return String(body.innerText || '').slice(0, maxLength);
            },
            {
              maxLength: ${maxLength},
              method: ${JSON.stringify(method)},
              attributeName: ${JSON.stringify(attributeName || '')},
            }
          );
          if (!text || text.length < 100) {
            for (const frame of activePage.frames()) {
              if (frame === activePage.mainFrame()) continue;
              const frameText = await frame
                .evaluate(
                  ({ maxLength, method, attributeName }) => {
                    const body = document.body;
                    if (!body) return '';
                    if (method === 'visible') {
                      return 'true';
                    }
                    if (method === 'attribute') {
                      if (!attributeName) return '';
                      return String(body.getAttribute(attributeName) || '').slice(0, maxLength);
                    }
                    if (method === 'value') {
                      return String(body.getAttribute('value') || '').slice(0, maxLength);
                    }
                    if (method === 'textContent') {
                      return String(body.textContent || '').slice(0, maxLength);
                    }
                    return String(body.innerText || '').slice(0, maxLength);
                  },
                  {
                    maxLength: ${maxLength},
                    method: ${JSON.stringify(method)},
                    attributeName: ${JSON.stringify(attributeName || '')},
                  }
                )
                .catch(() => '');
              if (frameText && frameText.length > text.length) {
                text = frameText;
              }
            }
          }
          return text;
        }`;

    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'Read page failed');
    const text = this.normalizeEvalStringOutput(result.stdout);

    return {
      status: 'success',
      command: selector ? 'read_page' : 'get_text',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { text, selector, maxLength },
    };
  }

  private async handleSearch(sessionId: string, query: string): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);

    let fillResult: CliExecResult;
    try {
      fillResult = await this.execCli(sessionId, [
        'run-code',
        this.buildSearchScript(query, false),
      ]);
      this.assertNoCliError(fillResult, 'Search input detection failed');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Search input detection failed';
      throw new Error(
        message.includes('No explicit search entry found')
          ? '未识别到明确的搜索入口，请改用“智搜”或指定搜索框'
          : message
      );
    }
    const submitResult = await this.submitSearch(sessionId, 'Search submit failed');

    return {
      status: 'success',
      command: 'search',
      stdout: [fillResult.stdout, submitResult.stdout].filter(Boolean).join('\n'),
      stderr: [fillResult.stderr, submitResult.stderr].filter(Boolean).join('\n'),
      data: { query },
    };
  }

  private async handleSmartSearch(sessionId: string, query: string): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);

    let fillResult: CliExecResult;
    try {
      fillResult = await this.execCli(sessionId, ['run-code', this.buildSearchScript(query, true)]);
      this.assertNoCliError(fillResult, 'Smart search input detection failed');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Smart search input detection failed';
      throw new Error(
        message.includes('No searchable input found') ? '当前页面未找到可搜索的输入框' : message
      );
    }
    const submitResult = await this.submitSearch(sessionId, 'Smart search submit failed');

    return {
      status: 'success',
      command: 'smart_search',
      stdout: [fillResult.stdout, submitResult.stdout].filter(Boolean).join('\n'),
      stderr: [fillResult.stderr, submitResult.stderr].filter(Boolean).join('\n'),
      data: { query },
    };
  }

  private async submitSearch(sessionId: string, fallbackMessage: string): Promise<CliExecResult> {
    try {
      const submitResult = await this.execCli(sessionId, [
        'run-code',
        this.buildSearchSubmitScript(sessionId),
      ]);
      this.assertNoCliError(submitResult, fallbackMessage);
      return submitResult;
    } catch {
      const pressResult = await this.execCli(sessionId, ['press', 'Enter']);
      this.assertNoCliError(pressResult, fallbackMessage);
      return pressResult;
    }
  }

  private async handleListSearchResults(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);
    const session = this.getOrCreateSession(sessionId);
    const limit = this.readOptionalNumberParam(params, ['limit', 'max']) ?? 8;
    const result = await this.execCli(sessionId, [
      'run-code',
      this.buildListSearchResultsScript(limit),
    ]);
    this.assertNoCliError(result, 'List search results failed');
    const meta = this.parseJsonStdout<{
      host?: string;
      candidateCount?: number;
      results?: Array<{
        rank?: number;
        text?: string;
        href?: string;
        score?: number;
      }>;
    }>(result.stdout);

    session.lastSearchResults = (meta?.results || [])
      .filter(
        (item) =>
          typeof item.rank === 'number' &&
          typeof item.text === 'string' &&
          typeof item.href === 'string'
      )
      .map((item) => ({
        rank: item.rank as number,
        text: item.text as string,
        href: item.href as string,
        score: typeof item.score === 'number' ? item.score : undefined,
        host: typeof meta?.host === 'string' ? meta.host : undefined,
      }));

    return {
      status: 'success',
      command: 'list_search_results',
      stdout: result.stdout,
      stderr: result.stderr,
      data: meta || {
        results: session.lastSearchResults,
        candidateCount: session.lastSearchResults?.length || 0,
      },
    };
  }

  private buildSearchScript(query: string, allowLooseFallback: boolean): string {
    const minScore = allowLooseFallback ? 25 : 60;
    const errorMessage = allowLooseFallback
      ? 'No searchable input found on current page'
      : 'No explicit search entry found on current page';
    return `async page => {
      return await page.evaluate(({ query, minScore, errorMessage, allowLooseFallback }) => {
        const isVisible = element => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== 'hidden'
            && style.display !== 'none'
            && rect.width > 0
            && rect.height > 0;
        };

        const editableCandidates = [
          ...document.querySelectorAll('input:not([type="hidden"]):not([disabled])'),
          ...document.querySelectorAll('textarea:not([disabled])'),
          ...document.querySelectorAll('[contenteditable="true"]'),
          ...document.querySelectorAll('[role="textbox"]'),
          ...document.querySelectorAll('[role="searchbox"]'),
          ...document.querySelectorAll('[role="combobox"]'),
        ].filter(isVisible);

        const keywordPattern = /(search|query|keyword|find|搜|查询|检索)/i;
        const buttonKeywordPattern = /(search|go|submit|搜|查询)/i;

        const scoreCandidate = element => {
          let score = 0;
          const tagName = element.tagName.toLowerCase();
          const type = tagName === 'input' ? (element.getAttribute('type') || 'text').toLowerCase() : tagName;
          const attributes = [
            element.getAttribute('name'),
            element.getAttribute('id'),
            element.getAttribute('placeholder'),
            element.getAttribute('aria-label'),
            element.getAttribute('role'),
            element.getAttribute('enterkeyhint'),
            element.getAttribute('autocomplete'),
            element.getAttribute('title'),
          ].filter(Boolean).join(' ');

          if (type === 'search') {
            score += 80;
          }
          if (type === 'text' || type === 'search') {
            score += 20;
          }
          if (tagName === 'textarea') {
            score -= 15;
          }
          if (keywordPattern.test(attributes)) {
            score += 45;
          }

          const form = element.closest('form');
          if (form) {
            score += 10;
            if ((form.getAttribute('role') || '').toLowerCase() === 'search') {
              score += 40;
            }
            const submitControls = [...form.querySelectorAll('button, input[type="submit"], input[type="button"]')];
            if (submitControls.some(control => buttonKeywordPattern.test(
              [control.textContent, control.getAttribute('value'), control.getAttribute('aria-label')]
                .filter(Boolean)
                .join(' ')
            ))) {
              score += 20;
            }
          }

          const rect = element.getBoundingClientRect();
          if (rect.width >= 160) {
            score += 5;
          }
          if (rect.top >= 0 && rect.top <= 280) {
            score += 15;
          }
          if (element === document.activeElement) {
            score += 15;
          }
          if (
            (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
            && element.value.trim().length > 0
            && rect.top >= 0
            && rect.top <= 280
          ) {
            score += 10;
          }

          const container = element.parentElement;
          if (container) {
            const nearbyControls = [...container.querySelectorAll('button, input[type="submit"], input[type="button"]')]
              .filter(control => control !== element && isVisible(control));
            if (nearbyControls.length > 0) {
              score += 15;
            }
          }

          return { element, score, tagName, type, attributes };
        };

        const rankedCandidates = editableCandidates
          .map(scoreCandidate)
          .sort((a, b) => b.score - a.score);

        let target = rankedCandidates.find(candidate => candidate.score >= minScore);
        if (!target && allowLooseFallback) {
          const activeCandidate = rankedCandidates.find(candidate => candidate.element === document.activeElement);
          if (activeCandidate) {
            target = activeCandidate;
          }
        }
        if (!target && allowLooseFallback) {
          const focusedEditable = document.activeElement;
          if (focusedEditable && editableCandidates.includes(focusedEditable)) {
            target = rankedCandidates.find(candidate => candidate.element === focusedEditable);
          }
        }
        if (!target && allowLooseFallback) {
          const likelySingleLineInput = rankedCandidates.find(candidate => (
            candidate.tagName === 'input'
            || candidate.type === 'search'
            || candidate.type === 'text'
          ));
          if (likelySingleLineInput) {
            target = likelySingleLineInput;
          }
        }
        if (!target) {
          throw new Error(errorMessage);
        }

        const element = target.element;
        element.focus();

        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          const prototype = element instanceof HTMLInputElement
            ? window.HTMLInputElement.prototype
            : window.HTMLTextAreaElement.prototype;
          const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          valueSetter?.call(element, query);
        } else {
          element.textContent = query;
        }

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        return JSON.stringify({
          status: 'search-input-filled',
          score: target.score,
          tagName: target.tagName,
          type: target.type,
          attributes: target.attributes,
        });
      }, {
        query: ${JSON.stringify(query)},
        minScore: ${minScore},
        errorMessage: ${JSON.stringify(errorMessage)},
        allowLooseFallback: ${allowLooseFallback ? 'true' : 'false'},
      });
    }`;
  }

  private buildSearchSubmitScript(sessionId: string): string {
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    return `async page => {
      const activePage = ${activePageExpr};
      const settleTimeout = ${this.cliPageSettleTimeoutMs};
      const originalUrl = activePage.url();
      const originalTitle = await activePage.title().catch(() => '');

      const submitMeta = await activePage.evaluate(() => {
        const isVisible = element => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== 'hidden'
            && style.display !== 'none'
            && rect.width > 0
            && rect.height > 0;
        };
        const isEditable = element => (
          element instanceof HTMLInputElement
          || element instanceof HTMLTextAreaElement
          || element?.isContentEditable === true
          || ['textbox', 'searchbox', 'combobox'].includes(String(element?.getAttribute?.('role') || '').toLowerCase())
        );
        const buttonKeywordPattern = /(search|go|submit|搜|查询|检索|google)/i;
        const candidates = [
          document.activeElement,
          ...document.querySelectorAll('input:not([type="hidden"]):not([disabled])'),
          ...document.querySelectorAll('textarea:not([disabled])'),
          ...document.querySelectorAll('[contenteditable="true"]'),
          ...document.querySelectorAll('[role="textbox"]'),
          ...document.querySelectorAll('[role="searchbox"]'),
          ...document.querySelectorAll('[role="combobox"]'),
        ];
        const target = candidates.find((candidate) => isEditable(candidate) && isVisible(candidate));
        if (!(target instanceof HTMLElement)) {
          throw new Error('No focused search input found after filling query');
        }

        const pickSubmitControl = root => {
          if (!(root instanceof Element)) {
            return null;
          }
          const controls = [
            ...root.querySelectorAll('button, input[type="submit"], input[type="button"]'),
          ];
          return controls.find((control) => {
            if (!(control instanceof HTMLElement) || !isVisible(control)) {
              return false;
            }
            const label = [
              control.textContent,
              control.getAttribute('value'),
              control.getAttribute('aria-label'),
              control.getAttribute('title'),
            ].filter(Boolean).join(' ');
            return buttonKeywordPattern.test(label);
          }) || controls.find((control) => control instanceof HTMLElement && isVisible(control)) || null;
        };

        target.focus();
        const form = target.closest('form');
        const submitControl = pickSubmitControl(form || target.parentElement || document.body);
        if (submitControl instanceof HTMLElement) {
          submitControl.click();
          return {
            submitted: true,
            submitMethod: 'button-click',
            usedForm: Boolean(form),
          };
        }

        if (form instanceof HTMLFormElement) {
          if (typeof form.requestSubmit === 'function') {
            form.requestSubmit();
            return {
              submitted: true,
              submitMethod: 'requestSubmit',
              usedForm: true,
            };
          }
          form.submit();
          return {
            submitted: true,
            submitMethod: 'submit',
            usedForm: true,
          };
        }

        ['keydown', 'keypress', 'keyup'].forEach((type) => {
          target.dispatchEvent(new KeyboardEvent(type, {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          }));
        });
        return {
          submitted: true,
          submitMethod: 'keyboard-event',
          usedForm: false,
        };
      });

      await activePage.waitForTimeout(150).catch(() => {});
      await activePage.waitForLoadState('domcontentloaded', { timeout: settleTimeout }).catch(() => {});
      await activePage.waitForLoadState('networkidle', { timeout: settleTimeout }).catch(() => {});
      await activePage.waitForTimeout(300).catch(() => {});

      const landedUrl = activePage.url();
      const landedTitle = await activePage.title().catch(() => '');
      return JSON.stringify({
        ...submitMeta,
        originalUrl,
        landedUrl,
        landedTitle,
        navigationConfirmed: landedUrl !== originalUrl || landedTitle !== originalTitle,
      });
    }`;
  }

  private async handleClickResult(sessionId: string, index: number): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);
    const session = this.getOrCreateSession(sessionId);

    if (!session.lastSearchResults || session.lastSearchResults.length < index) {
      await this.handleListSearchResults(sessionId, { limit: Math.max(index, 8) });
    }

    const script = this.buildClickSearchResultScript(index);

    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'Click search result failed');
    const clickMeta = this.parseJsonStdout<{
      openedNewPage?: boolean;
      landedUrl?: string;
      title?: string;
      pageCount?: number;
      selectedText?: string;
      selectedHref?: string;
      candidateCount?: number;
      score?: number;
      host?: string;
      navigationConfirmed?: boolean;
    }>(result.stdout);
    if (typeof clickMeta?.landedUrl === 'string' && clickMeta.landedUrl.trim()) {
      session.lastUrl = clickMeta.landedUrl.trim();
    }
    session.preferLatestTab = clickMeta?.openedNewPage === true;

    return {
      status: 'success',
      command: 'click_result',
      stdout: result.stdout,
      stderr: result.stderr,
      data: {
        index,
        ...(clickMeta || {}),
      },
    };
  }

  private buildListSearchResultsScript(limit: number): string {
    const normalizedLimit = Math.max(1, Math.min(limit, 20));
    return `async page => {
      const settleTimeout = ${this.cliPageSettleTimeoutMs};
      await page.waitForLoadState('domcontentloaded', { timeout: settleTimeout }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: settleTimeout }).catch(() => {});
      await page.waitForTimeout(500).catch(() => {});

      return await page.evaluate(({ limit }) => {
        const FLAG_ATTR = 'data-ops-search-result-rank';
        document.querySelectorAll(\`[\${FLAG_ATTR}]\`).forEach((node) => {
          node.removeAttribute(FLAG_ATTR);
        });

        const isVisible = element => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== 'hidden'
            && style.display !== 'none'
            && rect.width > 12
            && rect.height > 12;
        };
        const normalizeText = value => String(value || '').replace(/\\s+/g, ' ').trim();
        const badHref = href => !href
          || href.startsWith('#')
          || href.startsWith('javascript:')
          || href.startsWith('about:blank')
          || href.startsWith('data:');

        const roots = [
          document.querySelector('[role="main"]'),
          document.querySelector('main'),
          document.body,
        ].filter(Boolean);

        const seen = new Set();
        const candidates = [];
        const pushCandidate = element => {
          if (!(element instanceof HTMLAnchorElement)) {
            return;
          }
          if (!isVisible(element)) {
            return;
          }
          const href = normalizeText(element.href || element.getAttribute('href'));
          if (badHref(href)) {
            return;
          }
          const text = normalizeText(
            element.innerText
            || element.textContent
            || element.getAttribute('aria-label')
            || element.getAttribute('title'),
          );
          if (!text) {
            return;
          }

          const key = \`\${href}::\${text}\`;
          if (seen.has(key)) {
            return;
          }
          seen.add(key);

          let score = 0;
          if (element.querySelector('h1, h2, h3, h4')) score += 80;
          if (element.closest('h1, h2, h3, h4')) score += 60;
          if (element.closest('article, [role="article"]')) score += 35;
          if (element.closest('li')) score += 20;
          if (element.closest('section, main, [role="main"]')) score += 15;
          if (element.closest('header, nav, footer, aside, [role="navigation"], [role="menu"]')) score -= 120;
          if (text.length >= 8) score += 10;
          if (text.length >= 16) score += 10;
          if (href && !href.includes(location.hostname)) score += 10;
          if (element.target === '_blank') score += 5;
          if (element.querySelector('img') && text.length < 6) score -= 20;

          candidates.push({ element, href, text, score });
        };

        roots.forEach((root) => {
          root.querySelectorAll('a[href]').forEach((node) => pushCandidate(node));
        });

        const ranked = candidates
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((item, idx) => {
            item.element.setAttribute(FLAG_ATTR, String(idx + 1));
            return {
              rank: idx + 1,
              text: item.text,
              href: item.href,
              score: item.score,
            };
          });

        return JSON.stringify({
          host: location.hostname,
          candidateCount: ranked.length,
          results: ranked,
        });
      }, { limit: ${normalizedLimit} });
    }`;
  }

  private buildClickSearchResultScript(index: number): string {
    const normalizedIndex = Math.max(index, 1);
    return `async page => {
      const settleTimeout = ${this.cliPageSettleTimeoutMs};
      await page.waitForLoadState('domcontentloaded', { timeout: settleTimeout }).catch(() => {});
      const originalUrl = await page.url();
      const originalTitle = await page.title().catch(() => '');
      await page.waitForLoadState('networkidle', { timeout: settleTimeout }).catch(() => {});
      await page.waitForTimeout(300).catch(() => {});

      let selected = await page.evaluate(({ targetIndex }) => {
        const target = document.querySelector(\`[data-ops-search-result-rank="\${targetIndex}"]\`);
        if (!(target instanceof HTMLAnchorElement)) {
          return null;
        }
        return {
          selectedText: (target.innerText || target.textContent || '').replace(/\\s+/g, ' ').trim(),
          selectedHref: target.href || target.getAttribute('href') || '',
          host: location.hostname,
        };
      }, { targetIndex: ${normalizedIndex} });

      if (!selected) {
        selected = JSON.parse(await page.evaluate(${JSON.stringify(`({ targetIndex }) => {
          const FLAG_ATTR = 'data-ops-search-result-rank';
          document.querySelectorAll(\`[\${FLAG_ATTR}]\`).forEach((node) => {
            node.removeAttribute(FLAG_ATTR);
          });
          const isVisible = element => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 12 && rect.height > 12;
          };
          const normalizeText = value => String(value || '').replace(/\\s+/g, ' ').trim();
          const badHref = href => !href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('about:blank') || href.startsWith('data:');
          const roots = [document.querySelector('[role="main"]'), document.querySelector('main'), document.body].filter(Boolean);
          const seen = new Set();
          const candidates = [];
          const pushCandidate = element => {
            if (!(element instanceof HTMLAnchorElement) || !isVisible(element)) return;
            const href = normalizeText(element.href || element.getAttribute('href'));
            if (badHref(href)) return;
            const text = normalizeText(element.innerText || element.textContent || element.getAttribute('aria-label') || element.getAttribute('title'));
            if (!text) return;
            const key = \`\${href}::\${text}\`;
            if (seen.has(key)) return;
            seen.add(key);
            let score = 0;
            if (element.querySelector('h1, h2, h3, h4')) score += 80;
            if (element.closest('h1, h2, h3, h4')) score += 60;
            if (element.closest('article, [role="article"]')) score += 35;
            if (element.closest('li')) score += 20;
            if (element.closest('section, main, [role="main"]')) score += 15;
            if (element.closest('header, nav, footer, aside, [role="navigation"], [role="menu"]')) score -= 120;
            if (text.length >= 8) score += 10;
            if (text.length >= 16) score += 10;
            if (href && !href.includes(location.hostname)) score += 10;
            if (element.target === '_blank') score += 5;
            if (element.querySelector('img') && text.length < 6) score -= 20;
            candidates.push({ element, href, text, score });
          };
          roots.forEach((root) => root.querySelectorAll('a[href]').forEach((node) => pushCandidate(node)));
          const ranked = candidates.sort((a, b) => b.score - a.score).slice(0, 20);
          if (ranked.length < targetIndex) {
            throw new Error(\`Search result index out of range; only found \${ranked.length} ranked candidates\`);
          }
          ranked.forEach((item, idx) => item.element.setAttribute(FLAG_ATTR, String(idx + 1)));
          const chosen = ranked[targetIndex - 1];
          return JSON.stringify({
            selectedText: chosen.text,
            selectedHref: chosen.href,
            candidateCount: ranked.length,
            score: chosen.score,
            host: location.hostname,
          });
        }`)})( { targetIndex: ${normalizedIndex} } ));
      }

      const target = page.locator('[data-ops-search-result-rank="${normalizedIndex}"]').first();
      const popupPromise = page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null);
      await target.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(200).catch(() => {});
      await target.click({ force: true });
      const popup = await popupPromise;
      if (popup) {
        await popup.waitForLoadState('domcontentloaded', { timeout: settleTimeout }).catch(() => {});
        await popup.evaluate(() => { window.focus(); }).catch(() => {});
        await popup.waitForTimeout(300).catch(() => {});
        await popup.bringToFront().catch(() => {});
        return JSON.stringify({
          openedNewPage: true,
          landedUrl: await popup.url(),
          title: await popup.title().catch(() => ''),
          pageCount: page.context().pages().length,
          ...selected,
          navigationConfirmed: true,
        });
      }

      await page.waitForLoadState('domcontentloaded', { timeout: settleTimeout }).catch(() => {});
      await page.waitForTimeout(500).catch(() => {});
      await page.evaluate(() => { window.focus(); }).catch(() => {});
      await page.waitForTimeout(300).catch(() => {});
      await page.bringToFront().catch(() => {});

      const landedUrl = await page.url();
      const title = await page.title().catch(() => '');
      const navigationConfirmed = landedUrl !== originalUrl || title !== originalTitle;

      if (!navigationConfirmed) {
        throw new Error(\`Click did not navigate away from current page; host=\${selected.host}; target=\${selected.selectedText}; href=\${selected.selectedHref}\`);
      }

      return JSON.stringify({
        openedNewPage: false,
        landedUrl,
        title,
        pageCount: page.context().pages().length,
        ...selected,
        navigationConfirmed,
      });
    }`;
  }

  private async handleSwitchLatestTab(sessionId: string): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);
    const session = this.getOrCreateSession(sessionId);
    const script = `async page => {
      const pages = page.context().pages();
      if (!pages.length) {
        throw new Error('No pages found in current browser context');
      }

      const latestPage = pages[pages.length - 1];
      await latestPage.waitForLoadState('domcontentloaded').catch(() => {});
      await latestPage.evaluate(() => { window.focus(); }).catch(() => {});
      await latestPage.waitForTimeout(300).catch(() => {});
      await latestPage.bringToFront().catch(() => {});

      return JSON.stringify({
        pageCount: pages.length,
        switched: true,
        landedUrl: await latestPage.url(),
        title: await latestPage.title().catch(() => ''),
      });
    }`;

    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'Switch latest tab failed');
    const switchMeta = this.parseJsonStdout<{
      pageCount?: number;
      switched?: boolean;
      landedUrl?: string;
      title?: string;
    }>(result.stdout);

    if (typeof switchMeta?.landedUrl === 'string' && switchMeta.landedUrl.trim()) {
      session.lastUrl = switchMeta.landedUrl.trim();
    }
    session.preferLatestTab = true;

    return {
      status: 'success',
      command: 'switch_latest_tab',
      stdout: result.stdout,
      stderr: result.stderr,
      data: switchMeta || { switched: true },
    };
  }

  private async ensureSessionReady(sessionId: string): Promise<void> {
    const session = this.getOrCreateSession(sessionId);
    if (session.controlMode === 'HUMAN_CONTROL') {
      throw new Error(session.frozenReason || 'Browser session is under human control');
    }

    if (!session.initialized) {
      await this.openSession(sessionId, session.lastUrl || 'about:blank');
    }
  }

  private async resolveRuntimeTargetRefs(
    action: string,
    params: Record<string, unknown>,
    sessionId: string
  ): Promise<Record<string, unknown>> {
    const refKeys = this.getRuntimeTargetRefKeys(action);
    if (!refKeys.length) {
      return params;
    }

    let normalizedParams = params;
    for (const key of refKeys) {
      const value = normalizedParams[key];
      if (!this.isRuntimeTargetRef(value)) {
        continue;
      }

      const targetRef = value.trim();
      const resolvedLocator = await this.generateLocator(targetRef, {
        runtimeSessionId: sessionId,
      });
      if (!resolvedLocator) {
        throw new Error(`Failed to resolve runtime target ref: ${targetRef}`);
      }

      if (normalizedParams === params) {
        normalizedParams = { ...params };
      }
      normalizedParams[key] = resolvedLocator;
    }

    return normalizedParams;
  }

  private getRuntimeTargetRefKeys(action: string): string[] {
    switch (action) {
      case 'click':
      case 'fill':
      case 'hover':
      case 'press':
      case 'press_key':
      case 'wait':
      case 'screenshot':
      case 'snapshot':
      case 'read_page':
      case 'get_text':
        return ['target', 'selector'];
      case 'drag':
        return ['src', 'dst'];
      default:
        return [];
    }
  }

  private isRuntimeTargetRef(value: unknown): value is string {
    return typeof value === 'string' && /^e\d+$/i.test(value.trim());
  }

  private assertNoCliError(result: CliExecResult, fallbackMessage: string): void {
    const match = result.stdout.match(/^### Error\s*\n([\s\S]*?)(?:\n### |\s*$)/m);
    if (match?.[1]) {
      throw new Error(match[1].trim() || fallbackMessage);
    }
  }

  private buildPlaceholderFallbackArgs(
    command: string,
    args: string[],
    error: unknown
  ): string[] | undefined {
    if (command !== 'fill' || args.length < 2) {
      return undefined;
    }

    const errorMessage = error instanceof Error ? error.message : String(error || '');
    if (!/does not match any elements|No element found|strict mode violation/i.test(errorMessage)) {
      return undefined;
    }

    const [target, ...restArgs] = args;
    if (!target) {
      return undefined;
    }

    const placeholder = this.extractRoleTextboxName(target);
    if (!placeholder) {
      return undefined;
    }

    return [this.buildPlaceholderSelector(placeholder), ...restArgs];
  }

  private normalizeSemanticRoleSelector(target: string): string {
    if (!target || /^role=/i.test(target)) {
      return target;
    }

    const match = target.match(/^([a-z_][\w-]*)\[name=(['"]?)(.+?)\2\]$/i);
    if (!match?.[1] || !match[3]) {
      return target;
    }

    const role = match[1].trim();
    const name = match[3].trim().replace(/"/g, '\\"');
    if (!role || !name) {
      return target;
    }

    return `role=${role}[name="${name}"]`;
  }

  private parseNthMatchSelector(
    target: string
  ): {
    selector: string;
    index: number;
  } | null {
    const trimmed = target.trim();
    const match = trimmed.match(/^:nth-match\((.+),\s*(\d+)\)$/);
    if (!match?.[1] || !match[2]) {
      return null;
    }

    const index = Number(match[2]);
    if (!Number.isInteger(index) || index <= 0) {
      return null;
    }

    return {
      selector: match[1].trim(),
      index: index - 1,
    };
  }

  private async executePositionalSelectorAction(
    sessionId: string,
    target: string,
    action: 'click'
  ): Promise<CliActionResult | null> {
    const positionalSelector = this.parseNthMatchSelector(target);
    if (!positionalSelector) {
      return null;
    }

    await this.ensureSessionReady(sessionId);
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const locatorExpr = `scope.locator(${JSON.stringify(positionalSelector.selector)}).nth(${positionalSelector.index})`;
    const actionCode =
      action === 'click'
        ? `await locator.click({ force: true, timeout: 5000 });`
        : 'return null;';
    const script = `async page => {
      const activePage = ${activePageExpr};
      const runWithin = async (scope, matchedIn) => {
        const locator = ${locatorExpr};
        const count = await locator.count().catch(() => 0);
        if (!count) return null;
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        ${actionCode}
        return JSON.stringify({
          target: ${JSON.stringify(target)},
          selector: ${JSON.stringify(positionalSelector.selector)},
          index: ${positionalSelector.index},
          matchedIn,
        });
      };

      const pageResult = await runWithin(activePage, 'page').catch(() => null);
      if (pageResult) {
        return pageResult;
      }

      for (const frame of activePage.frames()) {
        if (frame === activePage.mainFrame()) continue;
        const frameResult = await runWithin(frame, 'iframe').catch(() => null);
        if (frameResult) {
          return frameResult;
        }
      }

      throw new Error(${JSON.stringify(`Positional selector action failed: ${target}`)});
    }`;

    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, `${action} failed`);
    return {
      status: 'success',
      command: action,
      stdout: result.stdout,
      stderr: result.stderr,
      data: {
        target,
        selector: positionalSelector.selector,
        index: positionalSelector.index,
      },
    };
  }

  private extractRoleTextboxName(target: string): string | undefined {
    const match = target.match(/^(?:role=)?textbox\[name=(['"]?)(.+?)\1\]$/i);
    return match?.[2]?.trim() || undefined;
  }

  private stripResultArtifacts(result: CliActionResult): CliActionResult {
    const stripped: CliActionResult = { ...result };
    delete stripped.html;
    delete stripped.screenshot;

    if (stripped.data && typeof stripped.data === 'object') {
      const data = { ...stripped.data } as Record<string, unknown>;
      delete data.content;
      delete data.html;
      delete data.screenshot;
      stripped.data = data;
    }

    return stripped;
  }

  private buildPlaceholderSelector(placeholder: string): string {
    const escapedPlaceholder = placeholder.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `input[placeholder="${escapedPlaceholder}"], textarea[placeholder="${escapedPlaceholder}"]`;
  }

  private async enrichResultArtifacts(
    sessionId: string,
    result: CliActionResult
  ): Promise<CliActionResult> {
    const enriched: CliActionResult = { ...result };

    // Skip expensive artifact collection for synthetic wait steps.
    if (enriched.command === 'wait') {
      return enriched;
    }

    if (!enriched.html) {
      enriched.html = await this.readCurrentPageHtml(sessionId).catch(() => undefined);
    }

    if (!enriched.screenshot && enriched.command !== 'screenshot') {
      const screenshot = await this.captureInlineScreenshot(sessionId).catch(() => undefined);
      if (screenshot?.base64) {
        enriched.screenshot = screenshot.base64;
      }
      if (screenshot?.path && !enriched.snapshot) {
        enriched.snapshot = {
          id: path.basename(screenshot.path, '.png'),
          path: screenshot.path,
        };
      }
      enriched.data = {
        ...(enriched.data || {}),
        ...(screenshot?.path ? { screenshotPath: screenshot.path } : {}),
      };
    }

    return enriched;
  }

  private async readCurrentPageHtml(sessionId: string): Promise<string> {
    await this.ensureSessionReady(sessionId);
    const session = this.getOrCreateSession(sessionId);
    const script = `async page => {
      const activePage = ${
        session.preferLatestTab
          ? `(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)`
          : 'page'
      };
      return await activePage.evaluate((maxChars) => (
        document.documentElement ? document.documentElement.outerHTML.slice(0, maxChars) : ''
      ), ${this.maxHtmlChars});
    }`;
    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'Read page HTML failed');
    return this.normalizeEvalStringOutput(result.stdout);
  }

  private shouldEnrichCommandResult(
    command: string,
    index: number,
    totalCommands: number
  ): boolean {
    if (
      command === 'wait' ||
      command === 'list_search_results' ||
      command === 'evaluate' ||
      command === 'get_text' ||
      command === 'read_page'
    ) {
      return false;
    }

    if (command === 'screenshot' || command === 'snapshot') {
      return true;
    }

    return index === totalCommands - 1;
  }

  private async captureInlineScreenshot(
    sessionId: string
  ): Promise<{ path: string; base64: string }> {
    const attempt = async (): Promise<{ path: string; base64: string }> => {
      const screenshotPath = path.join(this.artifactDir, `${sessionId}-${Date.now()}-auto.png`);
      const result = await this.captureScreenshot(sessionId, screenshotPath, {
        timeoutMs: this.cliAutoArtifactTimeoutMs,
      });
      this.assertNoCliError(result, 'Auto screenshot failed');
      const base64 = await this.readScreenshotAsBase64(screenshotPath);
      return { path: screenshotPath, base64 };
    };

    try {
      return await attempt();
    } catch {
      await this.execCli(sessionId, [
        'run-code',
        'async page => { await page.waitForLoadState("domcontentloaded").catch(() => {}); await page.waitForTimeout(250).catch(() => {}); return "ready"; }',
      ]);
      return attempt();
    }
  }

  private async readFileAsBase64(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return buffer.toString('base64');
  }

  private async readScreenshotAsBase64(filePath: string): Promise<string> {
    try {
      const buffer = await fs.readFile(filePath);
      if (buffer.length <= this.screenshotCompressionThresholdBytes) {
        return buffer.toString('base64');
      }

      const metadata = await sharp(buffer).metadata();
      const shouldResize =
        (metadata.width || 0) > this.screenshotMaxDimension ||
        (metadata.height || 0) > this.screenshotMaxDimension;

      let pipeline = sharp(buffer, { failOn: 'none' }).flatten({ background: '#ffffff' });
      if (shouldResize) {
        pipeline = pipeline.resize({
          width: this.screenshotMaxDimension,
          height: this.screenshotMaxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      const compressed = await pipeline
        .jpeg({
          quality: this.screenshotJpegQuality,
          mozjpeg: true,
        })
        .toBuffer();

      return `data:image/jpeg;base64,${compressed.toString('base64')}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Screenshot compression failed, using original image: ${errorMessage}`);
      return this.readFileAsBase64(filePath);
    }
  }

  private async captureScreenshot(
    sessionId: string,
    screenshotPath: string,
    options?: {
      target?: string;
      fullPage?: boolean;
      timeoutMs?: number;
    }
  ): Promise<CliExecResult> {
    const session = this.getOrCreateSession(sessionId);
    const target = options?.target;
    const fullPage = options?.fullPage === true;
    const timeoutMs = options?.timeoutMs ?? this.cliActionTimeoutMs;
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const script = target
      ? `async page => {
          const activePage = ${activePageExpr};
          const locator = activePage.locator(${JSON.stringify(target)}).first();
          await locator.scrollIntoViewIfNeeded().catch(() => {});
          await locator.screenshot({
            path: ${JSON.stringify(screenshotPath)},
            timeout: ${timeoutMs},
          });
          return JSON.stringify({ path: ${JSON.stringify(screenshotPath)}, target: ${JSON.stringify(target)} });
        }`
      : `async page => {
          const activePage = ${activePageExpr};
          await activePage.bringToFront().catch(() => {});
          await activePage.screenshot({
            path: ${JSON.stringify(screenshotPath)},
            fullPage: ${fullPage ? 'true' : 'false'},
            timeout: ${timeoutMs},
          });
          return JSON.stringify({ path: ${JSON.stringify(screenshotPath)}, fullPage: ${fullPage ? 'true' : 'false'} });
        }`;

    return this.execCli(sessionId, ['run-code', script]);
  }

  private normalizeEvalStringOutput(output: string): string {
    const trimmed = output.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'string' ? parsed : trimmed;
    } catch {
      return trimmed;
    }
  }

  private async openSession(sessionId: string, initialUrl: string): Promise<CliExecResult> {
    const session = this.getOrCreateSession(sessionId);
    const result = this.shouldAttachToRemoteChrome()
      ? await this.attachToRemoteChrome(sessionId, initialUrl)
      : await this.execCli(sessionId, [
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

    return result;
  }

  private async configureSessionTimeouts(sessionId: string): Promise<void> {
    const script = `async page => {
      const actionTimeout = ${this.cliActionTimeoutMs};
      const navigationTimeout = ${this.cliNavigationTimeoutMs};
      page.setDefaultTimeout(actionTimeout);
      page.setDefaultNavigationTimeout(navigationTimeout);
      page.context().setDefaultTimeout(actionTimeout);
      page.context().setDefaultNavigationTimeout(navigationTimeout);
      await page.bringToFront().catch(() => {});
      return JSON.stringify({ actionTimeout, navigationTimeout });
    }`;

    try {
      await this.execCli(sessionId, ['run-code', script]);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to configure Playwright timeouts for ${sessionId}: ${errorMessage}`);
    }
  }

  private async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.initialized) {
      return;
    }

    try {
      await this.execCli(sessionId, [session.attached ? 'detach' : 'close']);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to close CLI session ${sessionId}: ${errorMessage}`);
    } finally {
      session.initialized = false;
      session.attached = false;
    }
  }

  private getOrCreateSession(runtimeSessionId: string): CliSessionState {
    const existing = this.sessions.get(runtimeSessionId);
    if (existing) {
      return existing;
    }

    const session: CliSessionState = {
      runtimeSessionId,
      profilePath: path.join(this.profileDir, runtimeSessionId),
      initialized: false,
      attached: false,
      controlMode: 'AGENT_RUNNING',
    };

    this.sessions.set(runtimeSessionId, session);
    return session;
  }

  private getControlState(runtimeSessionId: string): BrowserControlStateDto {
    const session = this.getOrCreateSession(runtimeSessionId);
    return {
      runtimeSessionId,
      controlMode: session.controlMode,
      frozen: session.controlMode === 'HUMAN_CONTROL',
      reason: session.frozenReason,
    };
  }

  private buildPageFingerprint(url?: string, title?: string): string | undefined {
    const normalizedUrl = typeof url === 'string' ? url.trim() : '';
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    if (!normalizedUrl && !normalizedTitle) {
      return undefined;
    }
    return createHash('sha256')
      .update(`${normalizedUrl}::${normalizedTitle}`)
      .digest('hex')
      .slice(0, 24);
  }

  private matchPageAssertion(
    dto: AssertBrowserStateDto,
    pageState: BrowserPageStateDto,
    selectorMatched?: boolean,
    textMatched?: boolean
  ): boolean {
    if (dto.pageUrl && pageState.pageUrl !== dto.pageUrl) {
      return false;
    }
    if (dto.pageUrlIncludes && !String(pageState.pageUrl || '').includes(dto.pageUrlIncludes)) {
      return false;
    }
    if (dto.pageTitle && pageState.pageTitle !== dto.pageTitle) {
      return false;
    }
    if (
      dto.pageTitleIncludes &&
      !String(pageState.pageTitle || '').includes(dto.pageTitleIncludes)
    ) {
      return false;
    }
    if (dto.pageFingerprint && pageState.pageFingerprint !== dto.pageFingerprint) {
      return false;
    }
    if (dto.readyState && pageState.readyState !== dto.readyState) {
      return false;
    }
    if (dto.selectorExists && !selectorMatched) {
      return false;
    }
    if (dto.textIncludes && !textMatched) {
      return false;
    }

    return Boolean(
      dto.pageUrl ||
      dto.pageUrlIncludes ||
      dto.pageTitle ||
      dto.pageTitleIncludes ||
      dto.pageFingerprint ||
      dto.readyState ||
      dto.selectorExists ||
      dto.textIncludes
    );
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.profileDir, { recursive: true });
    await fs.mkdir(this.artifactDir, { recursive: true });
  }

  private shouldAttachToRemoteChrome(): boolean {
    return process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'development';
  }

  private async attachToRemoteChrome(
    sessionId: string,
    initialUrl: string
  ): Promise<CliExecResult> {
    const cdpUrl = await this.resolveSessionCdpUrl(sessionId);
    const attachResult = await this.execCli(sessionId, ['attach', `--cdp=${cdpUrl}`]);

    if (initialUrl && initialUrl !== 'about:blank') {
      // Use run-code for initial navigation to ensure page visibility
      const script = `async page => {
        await page.goto(${JSON.stringify(initialUrl)});
        await page.bringToFront().catch(() => {});
        return "initial-navigated";
      }`;
      const gotoResult = await this.execCli(sessionId, ['run-code', script]);
      return {
        stdout: [attachResult.stdout, gotoResult.stdout].filter(Boolean).join('\n'),
        stderr: [attachResult.stderr, gotoResult.stderr].filter(Boolean).join('\n'),
      };
    }

    return attachResult;
  }

  private async resolveSessionCdpUrl(sessionId: string): Promise<string> {
    const workerDebuggerWsUrl = await this.workerService.getPublicDebuggerWsUrl(sessionId);
    if (workerDebuggerWsUrl) {
      return workerDebuggerWsUrl;
    }

    const workerCdpHttpUrl = this.workerService.getPublicCdpHttpUrl(sessionId);
    if (workerCdpHttpUrl) {
      return workerCdpHttpUrl;
    }

    const remoteHost = await this.resolveRemoteDebuggingHost();
    return `http://${remoteHost}:${this.chromeRemoteDebuggingPort}`;
  }

  private async resolveRemoteDebuggingHost(): Promise<string> {
    if (
      this.chromeRemoteDebuggingHost === 'localhost' ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(this.chromeRemoteDebuggingHost)
    ) {
      return this.chromeRemoteDebuggingHost;
    }

    try {
      const result = await lookup(this.chromeRemoteDebuggingHost, { family: 4 });
      return result.address;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to resolve ${this.chromeRemoteDebuggingHost} to IP, falling back to host name: ${errorMessage}`
      );
      return this.chromeRemoteDebuggingHost;
    }
  }

  private async execCli(sessionId: string, args: string[]): Promise<CliExecResult> {
    this.workerService.touchWorkerByRuntimeSessionId(sessionId);
    const binary = await this.resolveCliBinary();
    const fullArgs = [...binary.baseArgs, `-s=${sessionId}`, ...args];
    this.logger.debug(`Running CLI command: ${binary.command} ${fullArgs.join(' ')}`);
    return this.execFileAsync(binary.command, fullArgs);
  }

  private async resolveCliBinary(): Promise<CliBinary> {
    if (!this.cliBinaryPromise) {
      this.cliBinaryPromise = this.detectCliBinary();
    }

    return this.cliBinaryPromise;
  }

  private async detectCliBinary(): Promise<CliBinary> {
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

  private readTimeoutMs(envName: string, fallbackMs: number): number {
    const value = process.env[envName];
    if (!value) {
      return fallbackMs;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this.logger.warn(`Invalid timeout config ${envName}=${value}, falling back to ${fallbackMs}`);
      return fallbackMs;
    }

    return parsed;
  }

  private execFileAsync(command: string, args: string[]): Promise<CliExecResult> {
    return new Promise((resolve, reject) => {
      execFile(
        command,
        args,
        {
          cwd: process.cwd(),
          timeout: this.cliProcessTimeoutMs,
          maxBuffer: 10 * 1024 * 1024,
          env: process.env,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr?.trim() || error.message));
            return;
          }

          resolve({
            stdout: stdout?.trim() || '',
            stderr: stderr?.trim() || '',
          });
        }
      );
    });
  }

  private requireStringParam(params: Record<string, unknown>, keys: string[]): string {
    const value = this.readOptionalStringParam(params, keys);
    if (!value) {
      throw new Error(`Missing required parameter: ${keys.join(' or ')}`);
    }
    return value;
  }

  private readOptionalStringParam(
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

  private requireNumberParam(params: Record<string, unknown>, keys: string[]): number {
    const value = this.readOptionalNumberParam(params, keys);
    if (value === undefined) {
      throw new Error(`Missing required numeric parameter: ${keys.join(' or ')}`);
    }
    return value;
  }

  private readOptionalNumberParam(
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

  private parseJsonStdout<T extends Record<string, unknown>>(stdout: string): T | null {
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

    // Playwright CLI often wraps structured result as:
    // ### Result
    // "{\"foo\":1}"
    // ### Ran Playwright code
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
}
