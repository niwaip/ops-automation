import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { lookup } from 'dns/promises';
import * as fsSync from 'fs';
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

// ---------------------------------------------------------------------------
// Locator / error pattern constants
// Keep in sync with browser-domain.constants.ts in ai-orchestrator.
// ---------------------------------------------------------------------------
/** Playwright strict-mode: locator resolved to multiple elements. */
const STRICT_MODE_VIOLATION_PATTERN = /strict mode violation/i;
/** Playwright: element not found or timed out. */
const ELEMENT_NOT_FOUND_PATTERN = /does not match any elements|No element found|Timeout/i;
/** Any locator resolution failure (superset of the two above). */
const LOCATOR_ERROR_PATTERN =
  /does not match any elements|No element found|strict mode violation|Unknown engine|Timeout/i;
/** Ephemeral runtime element handle (e.g. "e24" or "12_3"). */
const EPHEMERAL_REF_RE = /^(?:e\d+|\d+_\d+)$/i;

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
    // #region debug-point C:init-browser
    this.reportDebugEvent(
      'C',
      'playwright-cli.adapter.ts:initBrowser:start',
      '[DEBUG] initBrowser start',
      {
        sessionId,
        initialUrl,
        sessionPreferences: options?.sessionPreferences || null,
      }
    );
    // #endregion

    try {
      await this.workerService.ensureSessionWorker(sessionId, {
        mode: options?.sessionPreferences?.mode,
        enableCodegen: options?.sessionPreferences?.enableCodegen,
        headless: options?.sessionPreferences?.headless,
      });
      // #region debug-point C:init-browser-worker-ready
      this.reportDebugEvent(
        'C',
        'playwright-cli.adapter.ts:initBrowser:worker-ready',
        '[DEBUG] initBrowser worker ready',
        { sessionId }
      );
      // #endregion
      await this.ensureDirectories();
      await this.openSession(sessionId, initialUrl);
      await this.configureSessionTimeouts(sessionId);
      // #region debug-point C:init-browser-success
      this.reportDebugEvent(
        'C',
        'playwright-cli.adapter.ts:initBrowser:success',
        '[DEBUG] initBrowser success',
        { sessionId, initialUrl }
      );
      // #endregion
      return { success: true, message: `Playwright CLI session ${sessionId} initialized` };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initialize CLI browser: ${errorMessage}`);
      // #region debug-point C:init-browser-error
      this.reportDebugEvent(
        'C',
        'playwright-cli.adapter.ts:initBrowser:error',
        '[DEBUG] initBrowser failed',
        { sessionId, initialUrl, errorMessage }
      );
      // #endregion
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

  // #region v4.1 P0: recorder state capture/restore (CLI subprocess architecture)
  // State is captured/restored by shelling out to playwright-cli run-code scripts,
  // same pattern as inspectPageState. Files live under PLAYWRIGHT_CLI_ARTIFACT_DIR/recorder-state/.
  // stateHandle is opaque to ai-orchestrator; worker reconstructs path from runtimeSessionId + executionIndex.

  async captureState(
    runtimeSessionId: string,
    executionIndex: number
  ): Promise<{
    stateHandle: string;
    url?: string;
    capturedAt: string;
  }> {
    const sessionId = runtimeSessionId || 'default';
    await this.ensureSessionReady(sessionId);
    await this.ensureDirectories();
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const script = `async page => {
      const activePage = ${activePageExpr};
      await activePage.bringToFront().catch(() => {});
      const storageState = await activePage.context().storageState();
      return JSON.stringify({ url: activePage.url(), storageState });
    }`;
    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'Capture state failed');
    const payload = this.parseJsonStdout<{
      url?: string;
      storageState?: { cookies?: unknown[]; origins?: unknown[] };
    }>(result.stdout);
    if (!payload || !payload.storageState) {
      throw new Error('Capture state failed: CLI did not return storageState payload');
    }
    const capturedAt = new Date().toISOString();
    const stateFile = await this.writeStateFile(
      sessionId,
      executionIndex,
      {
        executionIndex,
        capturedAt,
        url: payload.url,
        storageState: payload.storageState,
      }
    );
    this.logger.debug(
      `Captured recorder state for ${sessionId}#${executionIndex} -> ${stateFile}`
    );
    return {
      stateHandle: this.buildStateHandle(sessionId, executionIndex),
      url: payload.url,
      capturedAt,
    };
  }

  async restoreState(
    runtimeSessionId: string,
    stateHandle: string
  ): Promise<{
    restored: boolean;
    partial?: boolean;
    reason?: string;
    url?: string;
  }> {
    const sessionId = runtimeSessionId || 'default';
    const executionIndex = this.parseExecutionIndexFromHandle(stateHandle, sessionId);
    if (executionIndex === null) {
      return {
        restored: false,
        reason: 'invalid-state-handle',
      };
    }
    let stateFile: string;
    try {
      stateFile = await this.resolveStateFilePath(sessionId, executionIndex);
    } catch {
      return {
        restored: false,
        reason: 'state-file-not-found',
      };
    }
    let rawState: {
      url?: string;
      storageState?: { cookies?: unknown[]; origins?: unknown[] };
    };
    try {
      const fileContent = await fs.readFile(stateFile, 'utf8');
      rawState = JSON.parse(fileContent);
    } catch {
      return {
        restored: false,
        reason: 'state-file-unreadable',
      };
    }
    if (!rawState?.storageState) {
      return {
        restored: false,
        reason: 'state-file-corrupt',
      };
    }

    await this.ensureSessionReady(sessionId);
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    // Embed the state as a JS literal in the script. JSON.stringify produces valid JS,
    // but U+2028/U+2029 are valid JSON yet break JS literals — escape them defensively.
    const stateLiteral = JSON.stringify(rawState)
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    const script = `async page => {
      const STATE = ${stateLiteral};
      const activePage = ${activePageExpr};
      const ctx = activePage.context();
      let localStorageFailures = 0;
      let hasCrossOriginIframe = false;
      try {
        await ctx.clearCookies();
        if (Array.isArray(STATE.storageState.cookies) && STATE.storageState.cookies.length) {
          await ctx.addCookies(STATE.storageState.cookies);
        }
        for (const origin of (STATE.storageState.origins || [])) {
          try {
            await activePage.goto(origin.origin, { waitUntil: 'domcontentloaded' });
            await activePage.evaluate((items) => {
              // v4.1 P0 fix: clear existing localStorage BEFORE restoring snapshot keys.
              // Without this, keys written by the rolled-back step (draft marks, selected
              // state, feature flags) survive as "dirty" residue — merge semantics, not
              // the "replace" semantics doc §4.4 promises.
              try { localStorage.clear(); } catch (e) { /* ignore */ }
              for (const entry of items || []) {
                try {
                  localStorage.setItem(entry.name, entry.value);
                } catch (e) {
                  /* ignore per-item failure */
                }
              }
            }, origin.localStorage || []);
          } catch (e) {
            localStorageFailures++;
          }
        }
        if (STATE.url) {
          await activePage.goto(STATE.url, { waitUntil: 'domcontentloaded' });
        }
        // v4.1 P0 (doc §4.4): detect cross-origin iframes on the restored page.
        // storageState only covers the main context; iframe-internal storage is not
        // restored. Warn the user via partial: true + reason: 'cross-origin-iframe'.
        try {
          hasCrossOriginIframe = await activePage.evaluate(() => {
            const frames = document.querySelectorAll('iframe');
            for (const frame of frames) {
              try {
                const doc = frame.contentDocument;
                if (!doc) return true;
              } catch (e) {
                return true;
              }
            }
            return false;
          });
        } catch (e) {
          /* ignore iframe check failure */
        }
        await activePage.bringToFront().catch(() => {});
        const partial = localStorageFailures > 0 || hasCrossOriginIframe;
        const reason = hasCrossOriginIframe
          ? 'cross-origin-iframe'
          : (localStorageFailures > 0 ? 'localStorage-partial' : undefined);
        return JSON.stringify({
          restored: true,
          partial: partial,
          reason: reason,
          url: activePage.url(),
        });
      } catch (e) {
        return JSON.stringify({ restored: false, reason: 'restore-error: ' + (e && e.message ? e.message : String(e)) });
      }
    }`;
    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'Restore state failed');
    const payload = this.parseJsonStdout<{
      restored?: boolean;
      partial?: boolean;
      reason?: string;
      url?: string;
    }>(result.stdout);
    if (!payload || typeof payload.restored !== 'boolean') {
      return {
        restored: false,
        reason: 'restore-output-unparseable',
      };
    }
    if (payload.url) {
      session.lastUrl = payload.url;
    }
    return {
      restored: payload.restored,
      ...(payload.partial ? { partial: payload.partial } : {}),
      ...(payload.reason ? { reason: payload.reason } : {}),
      ...(payload.url ? { url: payload.url } : {}),
    };
  }

  async cleanupStateFilesAfter(
    runtimeSessionId: string,
    executionIndex: number
  ): Promise<{ cleanedCount: number }> {
    const sessionId = runtimeSessionId || 'default';
    const sessionDir = this.resolveSessionStateDir(sessionId);
    let files: string[];
    try {
      files = await fs.readdir(sessionDir);
    } catch {
      return { cleanedCount: 0 };
    }
    let cleaned = 0;
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const match = file.match(/^(\d+)\.json$/);
      if (!match) continue;
      const fileExecIndex = Number(match[1]);
      if (fileExecIndex < executionIndex) continue;
      try {
        await fs.unlink(path.join(sessionDir, file));
        cleaned++;
      } catch {
        /* ignore per-file failure */
      }
    }
    this.logger.debug(
      `Cleaned ${cleaned} state files for ${sessionId} >= execution ${executionIndex}`
    );
    return { cleanedCount: cleaned };
  }

  async cleanupAllStateFiles(runtimeSessionId: string): Promise<{ cleanedCount: number }> {
    const sessionId = runtimeSessionId || 'default';
    const sessionDir = this.resolveSessionStateDir(sessionId);
    try {
      const entries = await fs.readdir(sessionDir);
      let cleaned = 0;
      for (const entry of entries) {
        try {
          await fs.unlink(path.join(sessionDir, entry));
          cleaned++;
        } catch {
          /* ignore */
        }
      }
      await fs.rmdir(sessionDir).catch(() => {});
      this.logger.debug(`Cleaned all ${cleaned} state files for ${sessionId}`);
      return { cleanedCount: cleaned };
    } catch {
      return { cleanedCount: 0 };
    }
  }

  private buildStateHandle(runtimeSessionId: string, executionIndex: number): string {
    return `rw:${runtimeSessionId}:${executionIndex}`;
  }

  private parseExecutionIndexFromHandle(
    stateHandle: string,
    expectedRuntimeSessionId: string
  ): number | null {
    if (typeof stateHandle !== 'string' || !stateHandle) return null;
    const parts = stateHandle.split(':');
    if (parts.length < 3 || parts[0] !== 'rw') return null;
    const idx = Number(parts[parts.length - 1]);
    if (!Number.isFinite(idx) || idx < 0) return null;
    // Reconstruct runtimeSessionId from middle segments (handles IDs that contain ':')
    const reconstructed = parts.slice(1, -1).join(':');
    return reconstructed === expectedRuntimeSessionId ? idx : null;
  }

  private resolveSessionStateDir(runtimeSessionId: string): string {
    return path.join(this.artifactDir, 'recorder-state', runtimeSessionId);
  }

  private async resolveStateFilePath(
    runtimeSessionId: string,
    executionIndex: number
  ): Promise<string> {
    const filePath = path.join(
      this.resolveSessionStateDir(runtimeSessionId),
      `${executionIndex}.json`
    );
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      throw new Error(`State file not found: ${filePath}`);
    }
  }

  private async writeStateFile(
    runtimeSessionId: string,
    executionIndex: number,
    payload: Record<string, unknown>
  ): Promise<string> {
    const sessionDir = this.resolveSessionStateDir(runtimeSessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    const filePath = path.join(sessionDir, `${executionIndex}.json`);
    await fs.writeFile(filePath, JSON.stringify(payload), 'utf8');
    return filePath;
  }
  // #endregion v4.1 P0: recorder state capture/restore

  private async runCliAction(
    action: string,
    params: Record<string, unknown>,
    sessionId: string
  ): Promise<CliActionResult> {
    await this.ensureDirectories();
    const normalizedParams = await this.resolveRuntimeTargetRefs(action, params, sessionId);
    // #region debug-point B:run-cli-action-start
    this.reportDebugEvent(
      'B',
      'playwright-cli.adapter.ts:runCliAction:start',
      '[DEBUG] runCliAction start',
      {
        sessionId,
        action,
        params: this.summarizeParams(normalizedParams),
      }
    );
    // #endregion

    try {
      let result: CliActionResult;
      switch (action) {
        case 'goto':
        case 'navigate':
          result = await this.handleNavigate(
            sessionId,
            this.requireStringParam(normalizedParams, ['target', 'url'])
          );
          break;
        case 'click':
          result = await this.handleClick(sessionId, normalizedParams);
          break;
        case 'fill':
          result = await this.handleSimpleCommand(sessionId, 'fill', [
            this.requireStringParam(normalizedParams, ['target', 'selector']),
            this.requireStringParam(normalizedParams, ['value', 'text']),
          ]);
          break;
        case 'type':
        case 'type_text':
          result = await this.handleTypeText(sessionId, normalizedParams);
          break;
        case 'press':
        case 'press_key':
          result = await this.handleSimpleCommand(sessionId, 'press', [
            this.requireStringParam(normalizedParams, ['key', 'target']),
          ]);
          break;
        case 'hover':
          result = await this.handleSimpleCommand(sessionId, 'hover', [
            this.requireStringParam(normalizedParams, ['target', 'selector']),
          ]);
          break;
        case 'drag':
          result = await this.handleSimpleCommand(sessionId, 'drag', [
            this.requireStringParam(normalizedParams, ['src']),
            this.requireStringParam(normalizedParams, ['dst']),
          ]);
          break;
        case 'screenshot':
          result = await this.handleScreenshot(sessionId, normalizedParams);
          break;
        case 'snapshot':
          result = await this.handleSnapshot(sessionId, normalizedParams);
          break;
        case 'evaluate':
          result = await this.handleEvaluate(
            sessionId,
            this.requireStringParam(normalizedParams, ['script'])
          );
          break;
        case 'wait':
          result = await this.handleWait(sessionId, normalizedParams);
          break;
        case 'scroll':
          result = await this.handleScroll(sessionId, normalizedParams);
          break;
        case 'read_page':
        case 'get_text':
          result = await this.handleReadPage(sessionId, normalizedParams);
          break;
        case 'search':
          result = await this.handleSearch(
            sessionId,
            this.requireStringParam(normalizedParams, ['query', 'text'])
          );
          break;
        case 'smart_search':
          result = await this.handleSmartSearch(
            sessionId,
            this.requireStringParam(normalizedParams, ['query', 'text'])
          );
          break;
        case 'list_search_results':
        case 'inspect_search_results':
          result = await this.handleListSearchResults(sessionId, normalizedParams);
          break;
        case 'click_result':
          result = await this.handleClickResult(
            sessionId,
            this.requireNumberParam(normalizedParams, ['index'])
          );
          break;
        case 'switch_latest_tab':
        case 'focus_latest_page':
          result = await this.handleSwitchLatestTab(sessionId);
          break;
        case 'close_tab':
          result = await this.handleCloseTab(sessionId);
          break;
        default:
          throw new Error(`Unsupported Playwright CLI action: ${action}`);
      }
      // #region debug-point B:run-cli-action-success
      this.reportDebugEvent(
        'B',
        'playwright-cli.adapter.ts:runCliAction:success',
        '[DEBUG] runCliAction success',
        {
          sessionId,
          action,
          command: result.command,
        }
      );
      // #endregion
      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // #region debug-point B:run-cli-action-error
      this.reportDebugEvent(
        'B',
        'playwright-cli.adapter.ts:runCliAction:error',
        '[DEBUG] runCliAction failed',
        {
          sessionId,
          action,
          params: this.summarizeParams(normalizedParams),
          errorMessage,
        }
      );
      // #endregion
      throw error;
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
        let fbSucceeded = false;
        try {
          result = await this.execCli(sessionId, [command, ...fallbackArgs]);
          this.assertNoCliError(result, `${command} failed`);
          fbSucceeded = true;
        } catch (fbError) {
          // Try remaining label candidates before falling back to iframe
          const remainingCandidates = this.buildLabelFallbackArgsList(command, normalizedArgs);
          let lastCandidateError: unknown = fbError;
          for (const candidateArgs of remainingCandidates) {
            try {
              result = await this.execCli(sessionId, [command, ...candidateArgs]);
              this.assertNoCliError(result, `${command} failed`);
              fbSucceeded = true;
              break;
            } catch (candidateError) {
              lastCandidateError = candidateError;
            }
          }
          if (!fbSucceeded) {
            result = await this.executeIframeFallback(sessionId, command, fallbackArgs).catch(
              () => undefined
            );
            if (!result) throw lastCandidateError;
          }
        }
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error || '');
        // strict mode violation: locator matched multiple elements.
        // For click commands backed by a text= or role= selector, retry with .first()
        // so that ambiguous pages (e.g. repeated table rows) succeed on the first match
        // rather than crashing the whole session.
        if (
          command === 'click' &&
          STRICT_MODE_VIOLATION_PATTERN.test(errorMessage) &&
          normalizedArgs[0]
        ) {
          const firstResult = await this.executeStrictModeFirstFallback(
            sessionId,
            normalizedArgs[0]
          ).catch(() => undefined);
          if (firstResult) {
            result = firstResult;
          } else {
            // Try iframe before giving up
            result = await this.executeIframeFallback(sessionId, command, normalizedArgs).catch(
              () => undefined
            );
            if (!result) throw error;
          }
        } else if (
          ELEMENT_NOT_FOUND_PATTERN.test(errorMessage) ||
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
      stdout: result!.stdout,
      stderr: result!.stderr,
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
          ELEMENT_NOT_FOUND_PATTERN.test(errorMessage) ||
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
        this.buildSearchScript(sessionId, query, false),
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
      fillResult = await this.execCli(sessionId, ['run-code', this.buildSearchScript(sessionId, query, true)]);
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
      this.buildListSearchResultsScript(sessionId, limit),
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

  private buildSearchScript(sessionId: string, query: string, allowLooseFallback: boolean): string {
    const minScore = allowLooseFallback ? 25 : 60;
    const errorMessage = allowLooseFallback
      ? 'No searchable input found on current page'
      : 'No explicit search entry found on current page';
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    return `async page => {
      const activePage = ${activePageExpr};
      return await activePage.evaluate(({ query, minScore, errorMessage, allowLooseFallback }) => {
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

    const script = this.buildClickSearchResultScript(sessionId, index);

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

  private buildListSearchResultsScript(sessionId: string, limit: number): string {
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const normalizedLimit = Math.max(1, Math.min(limit, 20));
    return `async page => {
      const activePage = ${activePageExpr};
      const settleTimeout = ${this.cliPageSettleTimeoutMs};
      await activePage.waitForLoadState('domcontentloaded', { timeout: settleTimeout }).catch(() => {});
      await activePage.waitForLoadState('networkidle', { timeout: settleTimeout }).catch(() => {});
      await activePage.waitForTimeout(500).catch(() => {});

      return await activePage.evaluate(({ limit }) => {
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
          if (location.hostname.includes('baidu.com') && element.closest('.c-container h3, h3.t')) score += 300;
          if (location.hostname.includes('google.') && element.closest('.g h3')) score += 300;
          if (location.hostname.includes('bing.com') && element.closest('.b_algo h2')) score += 300;

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

  private buildClickSearchResultScript(sessionId: string, index: number): string {
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const normalizedIndex = Math.max(index, 1);
    return `async page => {
      const activePage = ${activePageExpr};
      const settleTimeout = ${this.cliPageSettleTimeoutMs};
      await activePage.waitForLoadState('domcontentloaded', { timeout: settleTimeout }).catch(() => {});
      const originalUrl = await activePage.url();
      const originalTitle = await activePage.title().catch(() => '');
      await activePage.waitForLoadState('networkidle', { timeout: settleTimeout }).catch(() => {});
      await activePage.waitForTimeout(300).catch(() => {});

      let selected = await activePage.evaluate(({ targetIndex }) => {
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
        selected = JSON.parse(await activePage.evaluate(${JSON.stringify(`({ targetIndex }) => {
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
            if (location.hostname.includes('baidu.com') && element.closest('.c-container h3, h3.t')) score += 300;
            if (location.hostname.includes('google.') && element.closest('.g h3')) score += 300;
            if (location.hostname.includes('bing.com') && element.closest('.b_algo h2')) score += 300;

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

      // Use activePage (which may be the latest tab) as the locator target
      const target = activePage.locator('[data-ops-search-result-rank="${normalizedIndex}"]').first();
      const pageCountBefore = page.context().pages().length;
      const popupPromise = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
      await target.scrollIntoViewIfNeeded().catch(() => {});
      await activePage.waitForTimeout(200).catch(() => {});
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

      // Wait for any in-page or new-tab navigation to settle
      await activePage.waitForLoadState('domcontentloaded', { timeout: settleTimeout }).catch(() => {});
      await activePage.waitForTimeout(500).catch(() => {});
      await activePage.evaluate(() => { window.focus(); }).catch(() => {});
      await activePage.waitForTimeout(300).catch(() => {});
      await activePage.bringToFront().catch(() => {});

      const landedUrl = await activePage.url();
      const title = await activePage.title().catch(() => '');
      const navigationConfirmed = landedUrl !== originalUrl || title !== originalTitle;

      // Even if the current page URL did not change, a new tab may have been opened
      // without firing the 'page' popup event (e.g. Baidu search results use window.open
      // with a short delay, or the click triggered a context-level navigation).
      if (!navigationConfirmed) {
        const allPages = page.context().pages();
        if (allPages.length > pageCountBefore) {
          // A new tab was opened without a popup event — switch to it
          const newTab = allPages[allPages.length - 1];
          await newTab.waitForLoadState('domcontentloaded', { timeout: settleTimeout }).catch(() => {});
          await newTab.bringToFront().catch(() => {});
          return JSON.stringify({
            openedNewPage: true,
            landedUrl: await newTab.url(),
            title: await newTab.title().catch(() => ''),
            pageCount: allPages.length,
            ...selected,
            navigationConfirmed: true,
          });
        }
        // Truly no navigation occurred
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

  private async handleCloseTab(sessionId: string): Promise<CliActionResult> {
    await this.ensureSessionReady(sessionId);
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';

    const script = `async page => {
      const pages = page.context().pages();
      if (!pages.length) {
        throw new Error('No pages found in current browser context');
      }

      const activePage = ${activePageExpr};
      if (!activePage.isClosed()) {
        await activePage.close().catch(() => {});
      }
      
      const remainingPages = page.context().pages();
      const latestPage = remainingPages.length > 0 ? remainingPages[remainingPages.length - 1] : null;
      if (latestPage) {
        await latestPage.bringToFront().catch(() => {});
      }

      return JSON.stringify({
        pageCount: remainingPages.length,
        closed: true,
        landedUrl: latestPage ? latestPage.url() : '',
        title: latestPage ? await latestPage.title().catch(() => '') : '',
      });
    }`;

    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'Close tab failed');
    const closeMeta = this.parseJsonStdout<{
      pageCount?: number;
      closed?: boolean;
      landedUrl?: string;
      title?: string;
    }>(result.stdout);

    if (typeof closeMeta?.landedUrl === 'string' && closeMeta.landedUrl.trim()) {
      session.lastUrl = closeMeta.landedUrl.trim();
    }
    session.preferLatestTab = true;

    return {
      status: 'success',
      command: 'close_tab',
      stdout: result.stdout,
      stderr: result.stderr,
      data: closeMeta || { closed: true },
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
    return typeof value === 'string' && EPHEMERAL_REF_RE.test(value.trim());
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
    if (!LOCATOR_ERROR_PATTERN.test(errorMessage)) {
      return undefined;
    }

    const [target, ...restArgs] = args;
    if (!target) {
      return undefined;
    }

    const placeholder = this.extractRoleTextboxName(target);
    if (placeholder) {
      return [this.buildPlaceholderSelector(placeholder), ...restArgs];
    }

    // For label= targets, return the first (most specific) adjacent-input candidate.
    // If this also fails, handleSimpleCommand will iterate remaining candidates
    // via buildLabelFallbackArgsList.
    const labelText = this.extractLabelText(target);
    if (labelText) {
      const candidates = this.buildAdjacentInputSelectors(labelText);
      if (candidates[0]) {
        return [candidates[0], ...restArgs];
      }
    }

    return undefined;
  }

  private buildLabelFallbackArgsList(
    command: string,
    args: string[]
  ): string[][] {
    if (command !== 'fill' || args.length < 2) {
      return [];
    }
    const [target, ...restArgs] = args;
    if (!target) {
      return [];
    }
    const labelText = this.extractLabelText(target);
    if (!labelText) {
      return [];
    }
    // Return all candidates except the first (already tried by buildPlaceholderFallbackArgs).
    return this.buildAdjacentInputSelectors(labelText)
      .slice(1)
      .map((selector) => [selector, ...restArgs]);
  }

  private extractLabelText(target: string): string | undefined {
    // Matches: label=密码, label="密码", internal:label="密码", internal:label=密码
    const match = target.match(/^(?:internal:)?label=(['"]?)(.+?)\1$/i);
    return match?.[2]?.trim() || undefined;
  }

  private buildAdjacentInputSelectors(labelText: string): string[] {
    // Returns an ordered list of selectors to try, from most specific to least.
    const escaped = labelText.replace(/"/g, '\\"');
    const regexEscaped = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [
      // Standard <label> wrapping
      `label:has-text("${escaped}") >> input >> visible=true >> nth=0`,
      `label:has-text("${escaped}") >> select >> visible=true >> nth=0`,
      // Exact text match (innermost element) -> closest ancestor <tr>
      `text="${escaped}" >> xpath=ancestor::tr[1] >> input[type="password"] >> visible=true >> nth=0`,
      `text="${escaped}" >> xpath=ancestor::tr[1] >> input:not([type="hidden"]):not([type="button"]):not([type="submit"]) >> visible=true >> nth=0`,
      `text="${escaped}" >> xpath=ancestor::tr[1] >> select >> visible=true >> nth=0`,
      // Substring text match (innermost element) -> closest ancestor <tr>
      `text=/${regexEscaped}/i >> xpath=ancestor::tr[1] >> input[type="password"] >> visible=true >> nth=0`,
      `text=/${regexEscaped}/i >> xpath=ancestor::tr[1] >> input:not([type="hidden"]):not([type="button"]):not([type="submit"]) >> visible=true >> nth=0`,
      `text=/${regexEscaped}/i >> xpath=ancestor::tr[1] >> select >> visible=true >> nth=0`,
    ];
  }

  /**
   * W3C/Playwright ARIA role names that are valid targets for `getByRole()`.
   * HTML tag names (input, select, textarea, div, span, …) must NOT be treated
   * as roles — they are CSS selectors and must be passed through unchanged.
   */
  private static readonly PLAYWRIGHT_ARIA_ROLES = new Set([
    'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote',
    'button', 'caption', 'cell', 'checkbox', 'code', 'columnheader', 'combobox',
    'complementary', 'contentinfo', 'definition', 'deletion', 'dialog', 'directory',
    'document', 'emphasis', 'feed', 'figure', 'form', 'generic', 'grid', 'gridcell',
    'group', 'heading', 'img', 'insertion', 'link', 'list', 'listbox', 'listitem',
    'log', 'main', 'marquee', 'math', 'meter', 'menu', 'menubar', 'menuitem',
    'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note', 'option',
    'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region',
    'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox', 'separator',
    'slider', 'spinbutton', 'status', 'strong', 'subscript', 'superscript',
    'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'time',
    'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
  ]);

  private normalizeSemanticRoleSelector(target: string): string {
    if (!target || /^role=/i.test(target)) {
      return target;
    }

    // Convert CSS `label:has-text("xxx")` to Playwright `internal:label="xxx"` so it uses
    // getByLabel() semantics instead of a raw CSS selector. Pages using table
    // layouts without <label> elements will fail natively, but our label= fallback
    // chain below will handle it gracefully.
    const labelHasTextMatch = target.match(/^label:has-text\((['"]?)(.+?)\1\)$/i);
    if (labelHasTextMatch?.[2]) {
      return `internal:label="${labelHasTextMatch[2].trim()}"`;
    }

    // Match `something[name="..."]` — only convert when `something` is a known
    // ARIA role.  HTML tag names like `input`, `select`, `div` must not be
    // prefixed with `role=` because Playwright would then look for an element
    // with that ARIA role rather than the HTML tag, causing "does not match".
    const match = target.match(/^([a-z_][\w-]*)\[name=(['"]?)(.+?)\2\]$/i);
    if (!match?.[1] || !match[3]) {
      return target;
    }

    const role = match[1].trim().toLowerCase();
    if (!PlaywrightCliAdapter.PLAYWRIGHT_ARIA_ROLES.has(role)) {
      // Not an ARIA role (e.g. `input`, `select`) — return as-is so Playwright
      // interprets it as a CSS attribute selector.
      return target;
    }

    const name = match[3].trim().replace(/"/g, '\\"');
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

  /**
   * Strict-mode fallback for click: when a text= or role= selector matches
   * multiple elements, click the first visible one using .first() semantics.
   * This is intentionally a best-effort measure — if the target page really
   * requires a specific occurrence the template should carry a :nth-match locator
   * (produced by the export layer).  Here we just prevent a hard crash when the
   * template was generated before per-occurrence disambiguation was available.
   */
  private async executeStrictModeFirstFallback(
    sessionId: string,
    selector: string
  ): Promise<CliExecResult | undefined> {
    const session = this.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';

    const script = `async page => {
      const activePage = ${activePageExpr};
      const tryFirst = async (scope) => {
        const loc = scope.locator(${JSON.stringify(selector)}).first();
        const count = await loc.count().catch(() => 0);
        if (!count) return null;
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.click({ force: true, timeout: 5000 });
        return JSON.stringify({ selector: ${JSON.stringify(selector)}, matchedIn: 'page', first: true });
      };
      const pageResult = await tryFirst(activePage).catch(() => null);
      if (pageResult) return pageResult;
      for (const frame of activePage.frames()) {
        if (frame === activePage.mainFrame()) continue;
        const frameResult = await tryFirst(frame).catch(() => null);
        if (frameResult) return frameResult;
      }
      throw new Error('strict-mode-first fallback found no element for: ' + ${JSON.stringify(selector)});
    }`;

    const result = await this.execCli(sessionId, ['run-code', script]);
    this.assertNoCliError(result, 'strict-mode-first fallback failed');
    return result;
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
    // #region debug-point C:open-session-start
    this.reportDebugEvent(
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
    // #endregion
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
    // #region debug-point C:open-session-success
    this.reportDebugEvent(
      'C',
      'playwright-cli.adapter.ts:openSession:success',
      '[DEBUG] openSession success',
      {
        sessionId,
        initialUrl,
        attached: session.attached,
      }
    );
    // #endregion

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
      // #region debug-point C:resolve-cdp-ws
      this.reportDebugEvent(
        'C',
        'playwright-cli.adapter.ts:resolveSessionCdpUrl:worker-ws',
        '[DEBUG] resolveSessionCdpUrl via worker websocket',
        { sessionId, cdpUrl: workerDebuggerWsUrl }
      );
      // #endregion
      return workerDebuggerWsUrl;
    }

    const workerCdpHttpUrl = this.workerService.getPublicCdpHttpUrl(sessionId);
    if (workerCdpHttpUrl) {
      // #region debug-point C:resolve-cdp-http
      this.reportDebugEvent(
        'C',
        'playwright-cli.adapter.ts:resolveSessionCdpUrl:worker-http',
        '[DEBUG] resolveSessionCdpUrl via worker http',
        { sessionId, cdpUrl: workerCdpHttpUrl }
      );
      // #endregion
      return workerCdpHttpUrl;
    }

    const remoteHost = await this.resolveRemoteDebuggingHost();
    const fallbackUrl = `http://${remoteHost}:${this.chromeRemoteDebuggingPort}`;
    // #region debug-point C:resolve-cdp-fallback
    this.reportDebugEvent(
      'C',
      'playwright-cli.adapter.ts:resolveSessionCdpUrl:fallback',
      '[DEBUG] resolveSessionCdpUrl fallback host',
      { sessionId, remoteHost, cdpUrl: fallbackUrl }
    );
    // #endregion
    return fallbackUrl;
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
    // #region debug-point A:exec-cli-start
    this.reportDebugEvent(
      'A',
      'playwright-cli.adapter.ts:execCli:start',
      '[DEBUG] execCli start',
      {
        sessionId,
        command: binary.command,
        args: this.summarizeCliArgs(fullArgs),
        processTimeoutMs: this.cliProcessTimeoutMs,
        actionTimeoutMs: this.cliActionTimeoutMs,
        navigationTimeoutMs: this.cliNavigationTimeoutMs,
        pageSettleTimeoutMs: this.cliPageSettleTimeoutMs,
      }
    );
    // #endregion
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
      const startedAt = Date.now();
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
            const errorWithMeta = error as NodeJS.ErrnoException & {
              killed?: boolean;
              code?: string | number;
              signal?: NodeJS.Signals | null;
            };
            // #region debug-point D:exec-file-error
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
            // #endregion
            reject(new Error(stderr?.trim() || error.message));
            return;
          }

          // #region debug-point A:exec-file-success
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
          // #endregion
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

  private summarizeCliArgs(args: string[]): string[] {
    return args.map((arg) => {
      if (arg.length <= 160) {
        return arg;
      }
      return `${arg.slice(0, 157)}...`;
    });
  }

  private summarizeParams(params: Record<string, unknown>): Record<string, unknown> {
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

  private reportDebugEvent(
    hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E',
    location: string,
    msg: string,
    data: Record<string, unknown>
  ): void {
    const envPath = path.join(process.cwd(), '.dbg', 'playwright-cli-timeout.env');
    const isContainerRuntime =
      process.env.DOCKER_ENV === 'true' ||
      process.env.CHROME_REMOTE_DEBUGGING_HOST === 'browser-chrome' ||
      fsSync.existsSync('/.dockerenv');
    let debugServerUrl =
      process.env.DEBUG_SERVER_URL?.trim() ||
      (isContainerRuntime
        ? 'http://host.docker.internal:7777/event'
        : 'http://127.0.0.1:7777/event');
    let debugSessionId = process.env.DEBUG_SESSION_ID?.trim() || 'playwright-cli-timeout';

    try {
      const envContent = fsSync.readFileSync(envPath, 'utf8');
      debugServerUrl =
        envContent.match(/^DEBUG_SERVER_URL=(.+)$/m)?.[1]?.trim() || debugServerUrl;
      debugSessionId =
        envContent.match(/^DEBUG_SESSION_ID=(.+)$/m)?.[1]?.trim() || debugSessionId;
    } catch {
      // Ignore missing debug env file; fall back to defaults.
    }

    void fetch(debugServerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: debugSessionId,
        runId: 'pre-fix',
        hypothesisId,
        location,
        msg,
        data,
        ts: Date.now(),
      }),
    }).catch(() => undefined);
  }
}
