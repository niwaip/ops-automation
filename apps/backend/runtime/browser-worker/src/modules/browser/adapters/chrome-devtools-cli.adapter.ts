import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { lookup } from 'dns/promises';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WorkerService } from '../../worker/worker.service';
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

interface DevtoolsCliSessionState {
  runtimeSessionId: string;
  initialized: boolean;
  controlMode: 'AGENT_RUNNING' | 'HUMAN_CONTROL';
  frozenReason?: string;
  currentPageIndex: number;
  lastUrl?: string;
  lastSnapshotText?: string;
  lastSearchResults?: Array<{
    rank: number;
    uid: string;
    text: string;
    href?: string;
  }>;
}

interface DevtoolsCliBinary {
  command: string;
  baseArgs: string[];
}

interface DevtoolsExecResult {
  stdout: string;
  stderr: string;
}

interface DevtoolsActionResult {
  status: 'success';
  command: string;
  stdout?: string;
  stderr?: string;
  data?: Record<string, unknown>;
  snapshot?: {
    id: string;
    path: string;
  };
}

@Injectable()
export class ChromeDevtoolsCliAdapter implements BrowserExecutionAdapter {
  readonly backend = 'chrome-devtools' as const;

  private readonly logger = new Logger(ChromeDevtoolsCliAdapter.name);
  private readonly sessions = new Map<string, DevtoolsCliSessionState>();
  private readonly artifactDir = path.join(process.cwd(), 'temp', 'chrome-devtools-artifacts');
  private readonly chromeRemoteDebuggingHost =
    process.env.CHROME_REMOTE_DEBUGGING_HOST || 'browser-chrome';
  private readonly chromeRemoteDebuggingPort = Number(
    process.env.CHROME_REMOTE_DEBUGGING_PORT || '9222'
  );
  private readonly cliIdleTtlMs = this.readPositiveInt(
    process.env.CHROME_DEVTOOLS_CLI_IDLE_TTL_MS,
    300000
  );
  private cliBinaryPromise?: Promise<DevtoolsCliBinary>;
  private cliServerReadyPromise?: Promise<void>;
  private cliIdleTimer?: NodeJS.Timeout;

  constructor(private readonly workerService: WorkerService) {}

  async onModuleDestroy() {
    this.sessions.clear();
    await this.shutdownCliServer('module destroy');
  }

  async initBrowser(options?: BrowserInitOptions): Promise<{ success: boolean; message: string }> {
    const sessionId = options?.runtimeSessionId || 'default';
    const initialUrl = options?.initialUrl || 'about:blank';

    try {
      await this.workerService.ensureSessionWorker(sessionId, {
        mode: options?.sessionPreferences?.mode,
        enableCodegen: options?.sessionPreferences?.enableCodegen,
        headless: options?.sessionPreferences?.headless,
      });
      await this.ensureDirectories();
      await this.ensurePageSelected(sessionId, initialUrl, true);
      return { success: true, message: `Chrome DevTools CLI session ${sessionId} initialized` };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initialize Chrome DevTools CLI browser: ${errorMessage}`);
      return { success: false, message: errorMessage };
    }
  }

  async executeCommands(
    commands: MCPCommand[],
    options?: BrowserExecutionOptions
  ): Promise<{ success: boolean; results: any[]; message?: string }> {
    const sessionId = options?.runtimeSessionId || 'default';
    const results: Array<Record<string, unknown>> = [];

    for (const command of commands) {
      try {
        const result = await this.runCliAction(command.tool, command.params || {}, sessionId);
        results.push(result as unknown as Record<string, unknown>);
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
    return {
      success,
      results,
      message: success ? undefined : 'One or more Chrome DevTools CLI commands failed',
    };
  }

  async resetBrowser(options?: BrowserExecutionOptions): Promise<void> {
    const sessionId = options?.runtimeSessionId || 'default';
    this.sessions.delete(sessionId);

    const worker = await this.workerService.getWorkerByRuntimeSessionId(sessionId);
    if (worker) {
      await this.workerService.deleteWorker(worker.worker_id).catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Failed to delete worker for ${sessionId}: ${errorMessage}`);
      });
    }
    if (this.sessions.size === 0) {
      await this.shutdownCliServer('all devtools sessions were reset');
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
        pageState,
        shouldTakeover: false,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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

    return {
      matched: this.matchPageAssertion(dto, pageState, selectorMatched, textMatched),
      pageState,
      details: {
        selectorMatched: selectorMatched ?? null,
        textMatched: textMatched ?? null,
      },
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

  private async runCliAction(
    action: string,
    params: Record<string, unknown>,
    sessionId: string
  ): Promise<DevtoolsActionResult> {
    switch (action) {
      case 'goto':
      case 'navigate':
        return this.handleNavigate(sessionId, this.requireStringParam(params, ['target', 'url']));
      case 'click':
        return this.handleClick(sessionId, params);
      case 'fill':
        return this.handleFill(sessionId, params);
      case 'type':
      case 'type_text':
        return this.handleTypeText(sessionId, params);
      case 'press':
      case 'press_key':
        return this.handlePressKey(sessionId, this.requireStringParam(params, ['key', 'target']));
      case 'hover':
        return this.handleUidCommand(
          sessionId,
          'hover',
          this.requireStringParam(params, ['uid', 'target', 'selector'])
        );
      case 'screenshot':
        return this.handleScreenshot(sessionId, params);
      case 'snapshot':
        return this.handleSnapshot(sessionId, params);
      case 'evaluate':
        return this.handleEvaluate(sessionId, this.requireStringParam(params, ['script']));
      case 'wait':
        return this.handleWait(sessionId, params);
      case 'scroll':
        return this.handleScroll(sessionId, params);
      case 'read_page':
      case 'get_text':
        return this.handleReadPage(sessionId, params, action);
      case 'search':
      case 'smart_search':
        return this.handleSearch(sessionId, this.requireStringParam(params, ['query', 'text']));
      case 'list_search_results':
      case 'inspect_search_results':
        return this.handleListSearchResults(sessionId, params);
      case 'click_result':
        return this.handleClickResult(sessionId, this.requireNumberParam(params, ['index']));
      case 'switch_latest_tab':
      case 'focus_latest_page':
        return this.handleSwitchLatestTab(sessionId);
      default:
        throw new Error(`Unsupported Chrome DevTools CLI action: ${action}`);
    }
  }

  private async handleNavigate(sessionId: string, url: string): Promise<DevtoolsActionResult> {
    const session = await this.ensurePageSelected(sessionId, url, true);
    session.lastUrl = url;

    return {
      status: 'success',
      command: 'navigate',
      data: { url, pageIndex: session.currentPageIndex },
    };
  }

  private async handleClick(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<DevtoolsActionResult> {
    await this.ensurePageSelected(sessionId);
    const target = this.readOptionalStringParam(params, ['uid', 'target', 'selector', 'text']);
    if (!target) {
      throw new Error('Chrome DevTools CLI click requires a uid/target/selector/text');
    }
    const result = await this.execCli(sessionId, ['click', target, '--includeSnapshot', 'true']);
    const snapshot = this.extractSnapshotText(result.stdout);
    const session = this.getOrCreateSession(sessionId);
    if (snapshot) {
      session.lastSnapshotText = snapshot;
    }
    return {
      status: 'success',
      command: 'click',
      stdout: result.stdout,
      stderr: result.stderr,
      data: {
        target,
      },
    };
  }

  private async handleFill(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<DevtoolsActionResult> {
    await this.ensurePageSelected(sessionId);
    const uid = this.requireStringParam(params, ['uid', 'target', 'selector']);
    const value = this.requireStringParam(params, ['value', 'text']);
    const result = await this.execCli(sessionId, ['fill', uid, value, '--includeSnapshot', 'true']);
    const snapshot = this.extractSnapshotText(result.stdout);
    const session = this.getOrCreateSession(sessionId);
    if (snapshot) {
      session.lastSnapshotText = snapshot;
    }
    return {
      status: 'success',
      command: 'fill',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { uid, value },
    };
  }

  private async handleTypeText(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<DevtoolsActionResult> {
    await this.ensurePageSelected(sessionId);
    const text = this.requireStringParam(params, ['text', 'value']);
    const submitKey = this.readOptionalStringParam(params, ['submit_key']);
    const typeResult = await this.execCli(sessionId, ['type_text', text]);

    if (!submitKey) {
      return {
        status: 'success',
        command: 'type_text',
        stdout: typeResult.stdout,
        stderr: typeResult.stderr,
        data: { text },
      };
    }

    const pressResult = await this.execCli(sessionId, ['press_key', submitKey]);
    return {
      status: 'success',
      command: 'type_text',
      stdout: [typeResult.stdout, pressResult.stdout].filter(Boolean).join('\n'),
      stderr: [typeResult.stderr, pressResult.stderr].filter(Boolean).join('\n'),
      data: { text, submitKey },
    };
  }

  private async handlePressKey(sessionId: string, key: string): Promise<DevtoolsActionResult> {
    await this.ensurePageSelected(sessionId);
    const result = await this.execCli(sessionId, ['press_key', key, '--includeSnapshot', 'true']);
    const snapshot = this.extractSnapshotText(result.stdout);
    const session = this.getOrCreateSession(sessionId);
    if (snapshot) {
      session.lastSnapshotText = snapshot;
    }
    return {
      status: 'success',
      command: 'press_key',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { key },
    };
  }

  private async handleUidCommand(
    sessionId: string,
    command: string,
    uid: string
  ): Promise<DevtoolsActionResult> {
    await this.ensurePageSelected(sessionId);
    const result = await this.execCli(sessionId, [command, uid, '--includeSnapshot', 'true']);
    return {
      status: 'success',
      command,
      stdout: result.stdout,
      stderr: result.stderr,
      data: { uid },
    };
  }

  private async handleScreenshot(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<DevtoolsActionResult> {
    await this.ensurePageSelected(sessionId);
    const screenshotPath = path.join(this.artifactDir, `${sessionId}-${Date.now()}.png`);
    const args = ['take_screenshot', '--filePath', screenshotPath];
    if (params.fullPage === true) {
      args.push('--fullPage', 'true');
    }
    const uid = this.readOptionalStringParam(params, ['uid', 'target']);
    if (uid) {
      args.push('--uid', uid);
    }
    const result = await this.execCli(sessionId, args);
    return {
      status: 'success',
      command: 'screenshot',
      stdout: result.stdout,
      stderr: result.stderr,
      snapshot: {
        id: path.basename(screenshotPath, '.png'),
        path: screenshotPath,
      },
      data: { path: screenshotPath },
    };
  }

  private async handleSnapshot(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<DevtoolsActionResult> {
    await this.ensurePageSelected(sessionId);
    const snapshotPath = path.join(this.artifactDir, `${sessionId}-${Date.now()}.txt`);
    const args = ['take_snapshot', '--filePath', snapshotPath];
    if (params.verbose === true) {
      args.push('--verbose', 'true');
    }
    const result = await this.execCli(sessionId, args);
    const snapshotText = await this.readArtifactIfExists(snapshotPath, result.stdout);
    const session = this.getOrCreateSession(sessionId);
    session.lastSnapshotText = snapshotText;
    return {
      status: 'success',
      command: 'snapshot',
      stdout: snapshotText,
      stderr: result.stderr,
      snapshot: {
        id: path.basename(snapshotPath, '.txt'),
        path: snapshotPath,
      },
      data: { path: snapshotPath },
    };
  }

  private async handleEvaluate(sessionId: string, script: string): Promise<DevtoolsActionResult> {
    await this.ensurePageSelected(sessionId);
    const result = await this.execCli(sessionId, [
      'evaluate_script',
      script,
      '--output-format=json',
    ]);
    return {
      status: 'success',
      command: 'evaluate',
      stdout: result.stdout,
      stderr: result.stderr,
      data: {
        result: result.stdout.trim(),
      },
    };
  }

  private async inspectPageState(sessionId: string): Promise<BrowserPageStateDto> {
    const session = await this.ensurePageSelected(sessionId);
    const pages = await this.listPages(sessionId);
    const current = pages[Math.max(0, (session.currentPageIndex || 1) - 1)] || pages[0];
    const evalResult = await this.execCli(sessionId, [
      'evaluate_script',
      '() => ({ readyState: document.readyState, title: document.title, url: location.href })',
      '--output-format=json',
    ]);
    const evaluated = this.parseJsonStdout<Record<string, unknown>>(evalResult.stdout);
    const pageUrl =
      typeof evaluated?.url === 'string' && evaluated.url.trim()
        ? evaluated.url.trim()
        : current?.url;
    const pageTitle =
      typeof evaluated?.title === 'string' && evaluated.title.trim()
        ? evaluated.title.trim()
        : current?.title;
    const readyState = typeof evaluated?.readyState === 'string' ? evaluated.readyState.trim() : '';
    if (pageUrl) {
      session.lastUrl = pageUrl;
    }
    return {
      runtimeSessionId: sessionId,
      pageUrl: pageUrl || undefined,
      pageTitle: pageTitle || undefined,
      pageFingerprint: this.buildPageFingerprint(pageUrl, pageTitle),
      readyState: readyState || undefined,
      observedAt: new Date().toISOString(),
    };
  }

  private async checkSelectorExists(sessionId: string, selector: string): Promise<boolean> {
    await this.ensurePageSelected(sessionId);
    const result = await this.execCli(sessionId, [
      'evaluate_script',
      `() => ({ matched: Boolean(document.querySelector(${JSON.stringify(selector)})) })`,
      '--output-format=json',
    ]);
    const payload = this.parseJsonStdout<Record<string, unknown>>(result.stdout);
    return Boolean(payload?.matched);
  }

  private async checkTextIncludes(sessionId: string, text: string): Promise<boolean> {
    await this.ensurePageSelected(sessionId);
    const result = await this.execCli(sessionId, [
      'evaluate_script',
      `() => ({ matched: (document.body?.innerText || '').includes(${JSON.stringify(text)}) })`,
      '--output-format=json',
    ]);
    const payload = this.parseJsonStdout<Record<string, unknown>>(result.stdout);
    return Boolean(payload?.matched);
  }

  private async handleWait(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<DevtoolsActionResult> {
    await this.ensurePageSelected(sessionId);
    const selector = this.readOptionalStringParam(params, ['selector', 'target']);
    const text = this.readOptionalStringParam(params, ['text']);
    const duration = this.readOptionalNumberParam(params, ['duration']) ?? 1000;

    let args: string[];
    if (selector) {
      args = ['wait_for', '--selector', selector, '--timeout', String(duration)];
    } else if (text) {
      args = ['wait_for', '--text', text, '--timeout', String(duration)];
    } else {
      await new Promise((resolve) => setTimeout(resolve, duration));
      return {
        status: 'success',
        command: 'wait',
        data: { duration },
      };
    }

    const result = await this.execCli(sessionId, args);
    return {
      status: 'success',
      command: 'wait',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { selector, text, duration },
    };
  }

  private async handleScroll(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<DevtoolsActionResult> {
    await this.ensurePageSelected(sessionId);
    const uid = this.readOptionalStringParam(params, ['uid', 'target']);
    const direction = this.readOptionalStringParam(params, ['direction']) || 'down';
    const args = [
      'evaluate_script',
      this.buildScrollScript(direction, this.readOptionalNumberParam(params, ['amount']) ?? 600),
    ];
    const result = await this.execCli(sessionId, args);
    return {
      status: 'success',
      command: 'scroll',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { uid, direction },
    };
  }

  private async handleReadPage(
    sessionId: string,
    params: Record<string, unknown>,
    action: 'read_page' | 'get_text'
  ): Promise<DevtoolsActionResult> {
    await this.ensurePageSelected(sessionId);
    const maxLength = this.readOptionalNumberParam(params, ['max_length']) ?? 4000;
    const selector = this.readOptionalStringParam(params, ['selector', 'target']);
    const method =
      this.readOptionalStringParam(params, ['method']) || (selector ? 'textContent' : 'innerText');
    const attributeName = this.readOptionalStringParam(params, ['attribute']) || '';
    const script = selector
      ? `() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return ${JSON.stringify(method === 'visible' ? 'false' : '')};
          if (${JSON.stringify(method)} === 'visible') {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return String(
              style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              rect.width > 0 &&
              rect.height > 0
            );
          }
          if (${JSON.stringify(method)} === 'attribute') {
            return String(el.getAttribute(${JSON.stringify(attributeName)}) || '').slice(0, ${maxLength});
          }
          if (${JSON.stringify(method)} === 'value') {
            const fieldValue = 'value' in el ? el.value : el.getAttribute('value');
            return String(fieldValue || '').slice(0, ${maxLength});
          }
          if (${JSON.stringify(method)} === 'innerText') {
            return String(el.innerText || '').slice(0, ${maxLength});
          }
          return String(el.textContent || '').slice(0, ${maxLength});
        }`
      : `() => {
          const body = document.body;
          if (!body) return '';
          if (${JSON.stringify(method)} === 'visible') {
            return 'true';
          }
          if (${JSON.stringify(method)} === 'attribute') {
            return String(body.getAttribute(${JSON.stringify(attributeName)}) || '').slice(0, ${maxLength});
          }
          if (${JSON.stringify(method)} === 'value') {
            return String(body.getAttribute('value') || '').slice(0, ${maxLength});
          }
          if (${JSON.stringify(method)} === 'textContent') {
            return String(body.textContent || '').slice(0, ${maxLength});
          }
          return String(body.innerText || '').slice(0, ${maxLength});
        }`;
    const result = await this.execCli(sessionId, [
      'evaluate_script',
      script,
      '--output-format=json',
    ]);
    const text = result.stdout.trim();
    return {
      status: 'success',
      command: action,
      stdout: result.stdout,
      stderr: result.stderr,
      data: { text, selector, maxLength },
    };
  }

  private async handleSearch(sessionId: string, query: string): Promise<DevtoolsActionResult> {
    const listResult = await this.handleSnapshot(sessionId, {});
    const candidate = this.findBestSearchInput(
      this.getOrCreateSession(sessionId).lastSnapshotText || ''
    );
    if (!candidate) {
      throw new Error('当前页面未找到可搜索的输入框');
    }
    const fillResult = await this.execCli(sessionId, [
      'fill',
      candidate.uid,
      query,
      '--includeSnapshot',
      'true',
    ]);
    const pressResult = await this.execCli(sessionId, [
      'press_key',
      'Enter',
      '--includeSnapshot',
      'true',
    ]);
    const session = this.getOrCreateSession(sessionId);
    const latestSnapshot = this.extractSnapshotText(
      [pressResult.stdout, fillResult.stdout].filter(Boolean).join('\n')
    );
    if (latestSnapshot) {
      session.lastSnapshotText = latestSnapshot;
    }
    return {
      status: 'success',
      command: 'search',
      stdout: [listResult.stdout, fillResult.stdout, pressResult.stdout].filter(Boolean).join('\n'),
      stderr: [listResult.stderr, fillResult.stderr, pressResult.stderr].filter(Boolean).join('\n'),
      data: { query, uid: candidate.uid },
    };
  }

  private async handleListSearchResults(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<DevtoolsActionResult> {
    const session = await this.ensurePageSelected(sessionId);
    const limit = this.readOptionalNumberParam(params, ['limit', 'max']) ?? 8;
    const snapshotResult = await this.handleSnapshot(sessionId, { verbose: true });
    const snapshotText =
      typeof snapshotResult.stdout === 'string'
        ? snapshotResult.stdout
        : session.lastSnapshotText || '';
    const parsed = this.extractSearchResults(snapshotText, limit);
    session.lastSnapshotText = snapshotText;
    session.lastSearchResults = parsed;

    return {
      status: 'success',
      command: 'list_search_results',
      stdout: snapshotText,
      stderr: snapshotResult.stderr,
      data: {
        candidateCount: parsed.length,
        results: parsed.map((item) => ({
          rank: item.rank,
          text: item.text,
          href: item.href,
          uid: item.uid,
        })),
      },
    };
  }

  private async handleClickResult(sessionId: string, index: number): Promise<DevtoolsActionResult> {
    const session = await this.ensurePageSelected(sessionId);
    if (!session.lastSearchResults || session.lastSearchResults.length < index) {
      await this.handleListSearchResults(sessionId, { limit: Math.max(index, 8) });
    }
    const selected = session.lastSearchResults?.[index - 1];
    if (!selected) {
      throw new Error(`Search result index out of range: ${index}`);
    }

    const beforePages = await this.listPages(sessionId);
    const result = await this.execCli(sessionId, [
      'click',
      selected.uid,
      '--includeSnapshot',
      'true',
    ]);
    const afterPages = await this.listPages(sessionId);
    const pageCount = afterPages.length;
    const openedNewPage = afterPages.length > beforePages.length;
    if (openedNewPage) {
      session.currentPageIndex = afterPages.length;
      await this.selectPage(sessionId, session.currentPageIndex);
    } else {
      await this.selectPage(sessionId, session.currentPageIndex);
    }
    const activePage =
      afterPages[session.currentPageIndex - 1] || afterPages[afterPages.length - 1];
    if (activePage?.url) {
      session.lastUrl = activePage.url;
    }

    return {
      status: 'success',
      command: 'click_result',
      stdout: result.stdout,
      stderr: result.stderr,
      data: {
        index,
        selectedText: selected.text,
        selectedHref: selected.href,
        candidateCount: session.lastSearchResults?.length || 0,
        openedNewPage,
        pageCount,
        landedUrl: activePage?.url,
        title: activePage?.title,
        navigationConfirmed: true,
      },
    };
  }

  private async handleSwitchLatestTab(sessionId: string): Promise<DevtoolsActionResult> {
    const session = await this.ensurePageSelected(sessionId);
    const pages = await this.listPages(sessionId);
    if (!pages.length) {
      throw new Error('No pages found in current browser context');
    }
    session.currentPageIndex = pages.length;
    await this.selectPage(sessionId, session.currentPageIndex);
    const latest = pages[pages.length - 1];
    if (latest?.url) {
      session.lastUrl = latest.url;
    }
    return {
      status: 'success',
      command: 'switch_latest_tab',
      data: {
        switched: true,
        pageCount: pages.length,
        landedUrl: latest?.url,
        title: latest?.title,
      },
    };
  }

  private async ensurePageSelected(
    sessionId: string,
    initialUrl?: string,
    navigateIfNeeded = false
  ): Promise<DevtoolsCliSessionState> {
    await this.ensureDirectories();
    const session = this.getOrCreateSession(sessionId);
    if (session.controlMode === 'HUMAN_CONTROL') {
      throw new Error(session.frozenReason || 'Browser session is under human control');
    }

    const pages = await this.listPages(sessionId, true);
    if (!pages.length) {
      if (initialUrl && initialUrl !== 'about:blank') {
        await this.execCli(sessionId, ['new_page', initialUrl]);
      } else {
        await this.execCli(sessionId, ['new_page', 'about:blank']);
      }
      session.currentPageIndex = 1;
    } else if (!session.initialized) {
      session.currentPageIndex = Math.min(session.currentPageIndex || 1, pages.length);
    }

    await this.selectPage(sessionId, session.currentPageIndex || 1);

    if (navigateIfNeeded && initialUrl && initialUrl !== 'about:blank') {
      await this.execCli(sessionId, ['navigate_page', '--url', initialUrl]);
    }

    session.initialized = true;
    return session;
  }

  private async listPages(
    sessionId: string,
    allowEmpty = false
  ): Promise<Array<{ index: number; title?: string; url?: string }>> {
    const result = await this.execCli(sessionId, ['list_pages', '--output-format=json']);
    const pages = this.parseJsonStdout<Array<Record<string, unknown>> | Record<string, unknown>>(
      result.stdout
    );
    const normalized = Array.isArray(pages)
      ? pages
      : Array.isArray((pages as Record<string, unknown> | null)?.pages)
        ? ((pages as Record<string, unknown>).pages as Array<Record<string, unknown>>)
        : [];

    if (!allowEmpty && normalized.length === 0) {
      throw new Error('No Chrome pages available for Chrome DevTools CLI session');
    }

    return normalized.map((page, index) => ({
      index: index + 1,
      title: typeof page.title === 'string' ? page.title : undefined,
      url: typeof page.url === 'string' ? page.url : undefined,
    }));
  }

  private async selectPage(sessionId: string, index: number): Promise<void> {
    await this.execCli(sessionId, ['select_page', String(index), '--bringToFront', 'true']);
  }

  private getOrCreateSession(runtimeSessionId: string): DevtoolsCliSessionState {
    const existing = this.sessions.get(runtimeSessionId);
    if (existing) {
      return existing;
    }

    const session: DevtoolsCliSessionState = {
      runtimeSessionId,
      initialized: false,
      controlMode: 'AGENT_RUNNING',
      currentPageIndex: 1,
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
    await fs.mkdir(this.artifactDir, { recursive: true });
  }

  private async execCli(sessionId: string, args: string[]): Promise<DevtoolsExecResult> {
    const binary = await this.resolveCliBinary();
    await this.ensureCliServerStarted(sessionId);
    const fullArgs = [...binary.baseArgs, ...args];
    this.logger.debug(
      `Running Chrome DevTools CLI command for ${sessionId}: ${binary.command} ${fullArgs.join(' ')}`
    );
    try {
      return await this.execFileAsync(binary.command, fullArgs);
    } finally {
      this.scheduleCliServerIdleShutdown();
    }
  }

  private async ensureCliServerStarted(sessionId?: string): Promise<void> {
    if (!this.cliServerReadyPromise) {
      this.cliServerReadyPromise = this.startCliServer(sessionId);
    }

    try {
      await this.cliServerReadyPromise;
      this.scheduleCliServerIdleShutdown();
    } catch (error) {
      this.cliServerReadyPromise = undefined;
      throw error;
    }
  }

  private async startCliServer(sessionId?: string): Promise<void> {
    const binary = await this.resolveCliBinary();
    const browserUrl = await this.resolveBrowserUrl(sessionId);
    const startArgs = [...binary.baseArgs, 'start', '--browserUrl', browserUrl];

    this.logger.debug(
      `Starting Chrome DevTools CLI server: ${binary.command} ${startArgs.join(' ')}`
    );
    await this.execFileAsync(binary.command, startArgs);
  }

  private scheduleCliServerIdleShutdown(): void {
    this.clearCliIdleTimer();
    if (this.cliIdleTtlMs <= 0 || this.sessions.size === 0) {
      return;
    }
    this.cliIdleTimer = setTimeout(() => {
      void this.shutdownCliServer(`idle timeout reached (${this.cliIdleTtlMs}ms)`);
    }, this.cliIdleTtlMs);
  }

  private clearCliIdleTimer(): void {
    if (this.cliIdleTimer) {
      clearTimeout(this.cliIdleTimer);
      this.cliIdleTimer = undefined;
    }
  }

  private async shutdownCliServer(reason: string): Promise<void> {
    this.clearCliIdleTimer();
    if (!this.cliServerReadyPromise) {
      return;
    }
    this.cliServerReadyPromise = undefined;
    try {
      await this.execFileAsync('pkill', ['-f', 'chrome-devtools-mcp']);
      this.logger.log(`Stopped Chrome DevTools CLI server (${reason})`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (/no process found|not found/i.test(errorMessage)) {
        this.logger.debug(`No Chrome DevTools CLI process to stop (${reason})`);
        return;
      }
      this.logger.warn(`Failed to stop Chrome DevTools CLI server (${reason}): ${errorMessage}`);
    }
  }

  private readPositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private async resolveCliBinary(): Promise<DevtoolsCliBinary> {
    if (!this.cliBinaryPromise) {
      this.cliBinaryPromise = this.detectCliBinary();
    }
    return this.cliBinaryPromise;
  }

  private async detectCliBinary(): Promise<DevtoolsCliBinary> {
    const candidates: DevtoolsCliBinary[] = [
      { command: 'chrome-devtools', baseArgs: [] },
      {
        command: 'npx',
        baseArgs: ['--yes', '-p', 'chrome-devtools-mcp@latest', 'chrome-devtools'],
      },
    ];

    for (const candidate of candidates) {
      try {
        await this.execFileAsync(candidate.command, [...candidate.baseArgs, '--help']);
        return candidate;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Chrome DevTools CLI probe failed for ${candidate.command}: ${errorMessage}`
        );
      }
    }

    throw new Error(
      'Chrome DevTools CLI is not available. Install `chrome-devtools` or make `npx chrome-devtools-mcp@latest` available.'
    );
  }

  private async resolveBrowserUrl(sessionId?: string): Promise<string> {
    if (sessionId) {
      const workerCdpHttpUrl = this.workerService.getPublicCdpHttpUrl(sessionId);
      if (workerCdpHttpUrl) {
        return workerCdpHttpUrl;
      }
    }

    if (
      this.chromeRemoteDebuggingHost === 'localhost' ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(this.chromeRemoteDebuggingHost)
    ) {
      return `http://${this.chromeRemoteDebuggingHost}:${this.chromeRemoteDebuggingPort}`;
    }

    try {
      const result = await lookup(this.chromeRemoteDebuggingHost, { family: 4 });
      return `http://${result.address}:${this.chromeRemoteDebuggingPort}`;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to resolve ${this.chromeRemoteDebuggingHost} to IP, falling back to host name: ${errorMessage}`
      );
      return `http://${this.chromeRemoteDebuggingHost}:${this.chromeRemoteDebuggingPort}`;
    }
  }

  private execFileAsync(command: string, args: string[]): Promise<DevtoolsExecResult> {
    return new Promise((resolve, reject) => {
      execFile(
        command,
        args,
        {
          cwd: process.cwd(),
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024,
          env: process.env,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr?.trim() || stdout?.trim() || error.message));
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

  private extractSnapshotText(stdout: string): string | undefined {
    const trimmed = stdout?.trim();
    if (!trimmed) {
      return undefined;
    }

    const snapshotStart = trimmed.indexOf('uid=');
    if (snapshotStart >= 0) {
      return trimmed.slice(snapshotStart).trim();
    }

    const rootIndex = trimmed.indexOf('RootWebArea');
    if (rootIndex >= 0) {
      return trimmed.slice(rootIndex).trim();
    }

    return trimmed;
  }

  private findBestSearchInput(snapshotText: string): { uid: string; label: string } | null {
    const lines = snapshotText.split('\n');
    for (const line of lines) {
      const uidMatch =
        line.match(/uid=([^\s]+)/) ||
        line.match(
          /^\s*([0-9A-Za-z_:-]+)\s+(?:textbox|searchbox|combobox|TextField|text field|input)/i
        );
      if (!uidMatch) {
        continue;
      }
      if (/(textbox|searchbox|combobox|input|搜索|search)/i.test(line)) {
        return {
          uid: uidMatch[1]!,
          label: line.trim(),
        };
      }
    }
    return null;
  }

  private extractSearchResults(snapshotText: string, limit: number) {
    const lines = snapshotText.split('\n');
    const results: Array<{ rank: number; uid: string; text: string; href?: string }> = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const uidMatch =
        line.match(/uid=([^\s]+)/) || line.match(/^\s*([0-9A-Za-z_:-]+)\s+(?:link|heading)/i);
      if (!uidMatch) {
        continue;
      }
      if (!/(link|heading)/i.test(line)) {
        continue;
      }
      const uid = uidMatch[1]!;
      const quotedTexts = [...line.matchAll(/"([^"]+)"/g)]
        .map((match) => match[1]?.trim())
        .filter(Boolean) as string[];
      const fallbackText = line
        .replace(/^\s*[0-9A-Za-z_:-]+\s+/, '')
        .replace(/uid=[^\s]+\s*/, '')
        .replace(/url="[^"]+"/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const text = quotedTexts.join(' ').trim() || fallbackText;
      const hrefMatch = line.match(/url="([^"]+)"/);
      const key = `${uid}:${text}`;
      if (!text || seen.has(key)) {
        continue;
      }
      seen.add(key);
      results.push({
        rank: results.length + 1,
        uid,
        text,
        href: hrefMatch?.[1],
      });
      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }

  private buildScrollScript(direction: string, amount: number): string {
    switch (direction) {
      case 'up':
        return `() => { window.scrollBy(0, -${amount}); return "scrolled-up"; }`;
      case 'top':
        return '() => { window.scrollTo(0, 0); return "scrolled-top"; }';
      case 'bottom':
        return '() => { window.scrollTo(0, document.body.scrollHeight); return "scrolled-bottom"; }';
      default:
        return `() => { window.scrollBy(0, ${amount}); return "scrolled-down"; }`;
    }
  }

  private async readArtifactIfExists(filePath: string, fallback: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return fallback;
    }
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

  private parseJsonStdout<T>(stdout: string): T | null {
    if (!stdout || !stdout.trim()) {
      return null;
    }

    const normalized = stdout.trim();
    try {
      return JSON.parse(normalized) as T;
    } catch {
      return null;
    }
  }
}
