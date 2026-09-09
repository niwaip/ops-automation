import { Injectable, Logger, Optional } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PlaywrightCliRunner } from './playwright-cli.runner';
import { PlaywrightSessionManager } from './playwright-session.manager';
import {
  CliExecResult,
  CliSessionState,
  getDefaultPlaywrightConfig,
  PlaywrightCliConfig,
  PlaywrightCliContext,
} from './playwright.types';

@Injectable()
export class PlaywrightStateManager {
  private readonly logger = new Logger(PlaywrightStateManager.name);
  private readonly config: PlaywrightCliConfig;
  private context?: PlaywrightCliContext;

  constructor(
    private readonly cliRunner: PlaywrightCliRunner,
    private readonly sessionManager: PlaywrightSessionManager,
    @Optional() config?: Partial<PlaywrightCliConfig>
  ) {
    this.config = { ...getDefaultPlaywrightConfig(), ...config };
  }

  setContext(context: PlaywrightCliContext): void {
    this.context = context;
  }

  private exec(sessionId: string, args: string[], timeoutMs?: number): Promise<CliExecResult> {
    if (this.context) {
      return timeoutMs !== undefined
        ? this.context.execCli(sessionId, args, timeoutMs)
        : this.context.execCli(sessionId, args);
    }
    return timeoutMs !== undefined
      ? this.cliRunner.execCli(sessionId, args, timeoutMs)
      : this.cliRunner.execCli(sessionId, args);
  }

  private ensureReady(sessionId: string): Promise<void> {
    return this.context
      ? this.context.ensureSessionReady(sessionId)
      : this.sessionManager.ensureSessionReady(sessionId);
  }

  private ensureDirs(): Promise<void> {
    return this.context
      ? this.context.ensureDirectories()
      : this.sessionManager.ensureDirectories();
  }

  private getSession(sessionId: string): CliSessionState {
    return this.context
      ? this.context.getOrCreateSession(sessionId)
      : this.sessionManager.getOrCreateSession(sessionId);
  }

  private resolvePath(sessionId: string, executionIndex: number): Promise<string> {
    return this.context
      ? this.context.resolveStateFilePath(sessionId, executionIndex)
      : this.resolveStateFilePath(sessionId, executionIndex);
  }

  async captureState(
    runtimeSessionId: string,
    executionIndex: number
  ): Promise<{
    stateHandle: string;
    url?: string;
    capturedAt: string;
  }> {
    const sessionId = runtimeSessionId || 'default';
    await this.ensureReady(sessionId);
    await this.ensureDirs();
    const session = this.getSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const script = `async page => {
      const activePage = ${activePageExpr};
      await activePage.bringToFront().catch(() => {});
      const storageState = await activePage.context().storageState();
      return JSON.stringify({ url: activePage.url(), storageState });
    }`;
    const result = await this.exec(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Capture state failed');
    const payload = this.cliRunner.parseJsonStdout<{
      url?: string;
      storageState?: { cookies?: unknown[]; origins?: unknown[] };
    }>(result.stdout);
    if (!payload || !payload.storageState) {
      throw new Error('Capture state failed: CLI did not return storageState payload');
    }
    const capturedAt = new Date().toISOString();
    const stateFile = await this.writeStateFile(sessionId, executionIndex, {
      executionIndex,
      capturedAt,
      url: payload.url,
      storageState: payload.storageState,
    });
    this.logger.debug(`Captured recorder state for ${sessionId}#${executionIndex} -> ${stateFile}`);
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
      stateFile = await this.resolvePath(sessionId, executionIndex);
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

    await this.ensureReady(sessionId);
    const session = this.getSession(sessionId);
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
    const result = await this.exec(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Restore state failed');
    const payload = this.cliRunner.parseJsonStdout<{
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

  buildStateHandle(runtimeSessionId: string, executionIndex: number): string {
    return `rw:${runtimeSessionId}:${executionIndex}`;
  }

  parseExecutionIndexFromHandle(
    stateHandle: string,
    expectedRuntimeSessionId: string
  ): number | null {
    if (typeof stateHandle !== 'string' || !stateHandle) return null;
    const parts = stateHandle.split(':');
    if (parts.length < 3 || parts[0] !== 'rw') return null;
    const idx = Number(parts[parts.length - 1]);
    if (!Number.isFinite(idx) || idx < 0) return null;
    const reconstructed = parts.slice(1, -1).join(':');
    return reconstructed === expectedRuntimeSessionId ? idx : null;
  }

  resolveSessionStateDir(runtimeSessionId: string): string {
    return path.join(this.config.artifactDir, 'recorder-state', runtimeSessionId);
  }

  async resolveStateFilePath(
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

  async writeStateFile(
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
}
