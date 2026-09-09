import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import {
  AssertBrowserStateDto,
  BrowserPageAssertionResultDto,
  BrowserPageStateDto,
  InspectBrowserStateDto,
} from '../../../../dto/worker.dto';
import { PlaywrightCliRunner } from './playwright-cli.runner';
import { PlaywrightSessionManager } from './playwright-session.manager';
import { PlaywrightPageReader } from './playwright-page-reader.handler';
import {
  CliActionResult,
  CliExecResult,
  ELEMENT_NOT_FOUND_PATTERN,
  getDefaultPlaywrightConfig,
  PlaywrightCliConfig,
} from './playwright.types';

@Injectable()
export class PlaywrightInspectionHandler {
  private readonly logger = new Logger(PlaywrightInspectionHandler.name);
  private readonly config: PlaywrightCliConfig;

  constructor(
    private readonly cliRunner: PlaywrightCliRunner,
    private readonly sessionManager: PlaywrightSessionManager,
    private readonly pageReader: PlaywrightPageReader,
    @Optional() config?: Partial<PlaywrightCliConfig>
  ) {
    this.config = { ...getDefaultPlaywrightConfig(), ...config };
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

  async handleScreenshot(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.sessionManager.ensureSessionReady(sessionId);

    const screenshotPath = path.join(this.config.artifactDir, `${sessionId}-${Date.now()}.png`);
    const target = this.cliRunner.readOptionalStringParam(params, ['target', 'selector']);
    const fullPage = params.fullPage === true;
    let result = await this.captureScreenshot(sessionId, screenshotPath, { target, fullPage });

    try {
      this.cliRunner.assertNoCliError(result, 'Screenshot failed');
    } catch (error: unknown) {
      if (target) {
        const errorMessage = error instanceof Error ? error.message : String(error || '');
        if (ELEMENT_NOT_FOUND_PATTERN.test(errorMessage) || /failed/i.test(errorMessage)) {
          try {
            result = await this.captureIframeScreenshotFallback(sessionId, screenshotPath, target);
            this.cliRunner.assertNoCliError(result, 'Iframe screenshot failed');
          } catch {
            throw error;
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

  async captureIframeScreenshotFallback(
    sessionId: string,
    screenshotPath: string,
    target: string
  ): Promise<CliExecResult> {
    const session = this.sessionManager.getOrCreateSession(sessionId);
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
        timeout: ${this.config.cliActionTimeoutMs},
      });
      return JSON.stringify({ path: ${JSON.stringify(screenshotPath)}, target: ${JSON.stringify(target)}, iframe: true });
    }`;

    return this.cliRunner.execCli(sessionId, ['run-code', script]);
  }

  async handleSnapshot(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.sessionManager.ensureSessionReady(sessionId);

    const snapshotPath = path.join(this.config.artifactDir, `${sessionId}-${Date.now()}.yaml`);
    const target = this.cliRunner.readOptionalStringParam(params, ['target', 'selector']);
    const args = ['snapshot'];

    if (target) {
      args.push(target);
    }

    args.push(`--filename=${snapshotPath}`);
    const result = await this.cliRunner.execCli(sessionId, args);
    this.cliRunner.assertNoCliError(result, 'Snapshot failed');
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

  async handleEvaluate(sessionId: string, script: string): Promise<CliActionResult> {
    await this.sessionManager.ensureSessionReady(sessionId);
    const result = await this.cliRunner.execCli(sessionId, ['--raw', 'eval', script]);
    this.cliRunner.assertNoCliError(result, 'Evaluate script failed');

    return {
      status: 'success',
      command: 'evaluate',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { result: result.stdout.trim() },
    };
  }

  async inspectPageState(sessionId: string): Promise<BrowserPageStateDto> {
    await this.sessionManager.ensureSessionReady(sessionId);
    const session = this.sessionManager.getOrCreateSession(sessionId);
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
    const result = await this.cliRunner.execCli(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Inspect page state failed');
    const payload = this.cliRunner.parseJsonStdout<Record<string, unknown>>(result.stdout);
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

  async checkSelectorExists(sessionId: string, selector: string): Promise<boolean> {
    await this.sessionManager.ensureSessionReady(sessionId);
    const session = this.sessionManager.getOrCreateSession(sessionId);
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
    const result = await this.cliRunner.execCli(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Check selector existence failed');
    const payload = this.cliRunner.parseJsonStdout<Record<string, unknown>>(result.stdout);
    return Boolean(payload?.matched);
  }

  async checkTextIncludes(sessionId: string, text: string): Promise<boolean> {
    await this.sessionManager.ensureSessionReady(sessionId);
    const session = this.sessionManager.getOrCreateSession(sessionId);
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
    const result = await this.cliRunner.execCli(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Check page text failed');
    const payload = this.cliRunner.parseJsonStdout<Record<string, unknown>>(result.stdout);
    return Boolean(payload?.matched);
  }

  stripResultArtifacts(result: CliActionResult): CliActionResult {
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

  async enrichResultArtifacts(
    sessionId: string,
    result: CliActionResult
  ): Promise<CliActionResult> {
    const enriched: CliActionResult = { ...result };

    if (enriched.command === 'wait') {
      return enriched;
    }

    if (!enriched.html) {
      enriched.html = await this.pageReader.readCurrentPageHtml(sessionId).catch(() => undefined);
    }

    if (
      enriched.html &&
      !enriched.text &&
      !enriched.data?.text &&
      (enriched.command === 'read_page' ||
        enriched.command === 'get_text' ||
        enriched.command === 'read_value' ||
        enriched.command === 'navigate' ||
        enriched.command === 'click' ||
        enriched.command === 'press_key')
    ) {
      const extractedText = this.pageReader.extractMainTextFromHtml(enriched.html);
      if (extractedText) {
        enriched.text = extractedText;
        enriched.data = {
          ...(enriched.data || {}),
          text: extractedText,
        };
      }
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

  shouldEnrichCommandResult(
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

  async captureInlineScreenshot(
    sessionId: string
  ): Promise<{ path: string; base64: string }> {
    const attempt = async (): Promise<{ path: string; base64: string }> => {
      const screenshotPath = path.join(this.config.artifactDir, `${sessionId}-${Date.now()}-auto.png`);
      const result = await this.captureScreenshot(sessionId, screenshotPath, {
        timeoutMs: this.config.cliAutoArtifactTimeoutMs,
      });
      this.cliRunner.assertNoCliError(result, 'Auto screenshot failed');
      const base64 = await this.readScreenshotAsBase64(screenshotPath);
      return { path: screenshotPath, base64 };
    };

    try {
      return await attempt();
    } catch {
      await this.cliRunner.execCli(sessionId, [
        'run-code',
        'async page => { await page.waitForLoadState("domcontentloaded").catch(() => {}); await page.waitForTimeout(250).catch(() => {}); return "ready"; }',
      ]);
      return attempt();
    }
  }

  async readFileAsBase64(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return buffer.toString('base64');
  }

  async readScreenshotAsBase64(filePath: string): Promise<string> {
    try {
      const buffer = await fs.readFile(filePath);
      if (buffer.length <= this.config.screenshotCompressionThresholdBytes) {
        return buffer.toString('base64');
      }

      const metadata = await sharp(buffer).metadata();
      const shouldResize =
        (metadata.width || 0) > this.config.screenshotMaxDimension ||
        (metadata.height || 0) > this.config.screenshotMaxDimension;

      let pipeline = sharp(buffer, { failOn: 'none' }).flatten({ background: '#ffffff' });
      if (shouldResize) {
        pipeline = pipeline.resize({
          width: this.config.screenshotMaxDimension,
          height: this.config.screenshotMaxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      const compressed = await pipeline
        .jpeg({
          quality: this.config.screenshotJpegQuality,
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

  async captureScreenshot(
    sessionId: string,
    screenshotPath: string,
    options?: {
      target?: string;
      fullPage?: boolean;
      timeoutMs?: number;
    }
  ): Promise<CliExecResult> {
    const session = this.sessionManager.getOrCreateSession(sessionId);
    const target = options?.target;
    const fullPage = options?.fullPage === true;
    const timeoutMs = options?.timeoutMs ?? this.config.cliActionTimeoutMs;
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

    return this.cliRunner.execCli(sessionId, ['run-code', script]);
  }

  buildPageFingerprint(url?: string, title?: string): string | undefined {
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

  matchPageAssertion(
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
}
