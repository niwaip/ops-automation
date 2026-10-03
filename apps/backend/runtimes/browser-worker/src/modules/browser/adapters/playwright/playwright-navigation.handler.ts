import { Injectable, Optional } from '@nestjs/common';
import { ExecuteStepDto } from '../../../../dto/worker.dto';
import {
  BrowserPageReadinessResult,
  BrowserPageReadinessService,
} from '../../application/browser-page-readiness.service';
import { PlaywrightCliRunner } from './playwright-cli.runner';
import { PlaywrightSessionManager } from './playwright-session.manager';
import {
  CliActionResult,
  getDefaultPlaywrightConfig,
  PlaywrightCliConfig,
} from './playwright.types';

@Injectable()
export class PlaywrightNavigationHandler {
  private readonly config: PlaywrightCliConfig;

  constructor(
    private readonly cliRunner: PlaywrightCliRunner,
    private readonly sessionManager: PlaywrightSessionManager,
    @Optional()
    private readonly pageReadiness: BrowserPageReadinessService = new BrowserPageReadinessService(),
    @Optional() config?: Partial<PlaywrightCliConfig>
  ) {
    this.config = { ...getDefaultPlaywrightConfig(), ...config };
  }

  normalizeUrl(rawUrl: string): string {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) {
      return trimmed;
    }
    if (
      /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ||
      trimmed.startsWith('about:') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('javascript:')
    ) {
      return trimmed;
    }
    return `https://${trimmed}`;
  }

  async handleNavigate(sessionId: string, rawUrl: string): Promise<CliActionResult> {
    const url = this.normalizeUrl(rawUrl);
    const session = this.sessionManager.getOrCreateSession(sessionId);

    if (!session.initialized) {
      await this.sessionManager.openSession(sessionId, url);
    }
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const script = `async page => {
        const activePage = ${activePageExpr};
        const currentUrl = activePage.url();
        const normalize = u => (typeof u === 'string' && u.endsWith('/') ? u.slice(0, -1) : (u || ''));
        let navError = null;
        if (normalize(currentUrl) !== normalize(${JSON.stringify(url)})) {
          try {
            await activePage.goto(${JSON.stringify(url)}, { timeout: 30000 });
          } catch (e) {
            navError = e && e.message ? e.message : String(e);
          }
        }
        if (navError) {
          return JSON.stringify({ url: activePage.url(), status: 'failed', error: navError });
        }
        await activePage.waitForLoadState('domcontentloaded').catch(() => {});
        await Promise.race([
          activePage.waitForLoadState('networkidle'),
          activePage.waitForTimeout(500)
        ]).catch(() => {});

        await activePage.bringToFront().catch(() => {});
        return JSON.stringify({ url: activePage.url(), status: 'navigated' });
    }`;
    const result = await this.cliRunner.execCli(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Navigation failed');

    const parsed = this.cliRunner.parseJsonStdout<Record<string, unknown>>(result.stdout);
    if (parsed?.status === 'failed') {
      const navError = (parsed.error as string) || 'Navigation failed';
      throw new Error(`Navigation failed: ${navError}`);
    }

    const currentActualUrl = typeof parsed?.url === 'string' ? parsed.url : '';
    if (url !== 'about:blank' && (!currentActualUrl || currentActualUrl.startsWith('about:blank'))) {
      throw new Error(`Navigation failed: page remained on blank page (${currentActualUrl || 'empty'})`);
    }

    session.lastUrl = currentActualUrl || url;

    let navigateHtml: string | undefined;
    let navigateArticles: number | undefined;
    if (parsed?.html) {
      navigateHtml = parsed.html as string;
    }
    if (parsed?.articles !== undefined && typeof parsed.articles === 'number') {
      navigateArticles = parsed.articles;
    }

    return {
      status: 'success',
      command: 'navigate',
      stdout: result.stdout,
      stderr: result.stderr,
      html: navigateHtml,
      data: {
        pageUrl: session.lastUrl,
        ...(navigateArticles !== undefined ? { articles: navigateArticles } : {}),
      },
    };
  }

  async waitForStandardPageReadiness(
    dto: ExecuteStepDto,
    sessionId: string,
    normalizeEvalStringOutput: (stdout: string) => string
  ): Promise<BrowserPageReadinessResult> {
    return this.pageReadiness
      .wait({
        action: dto.action,
        captureProfile: dto.captureProfile,
        execute: async (script) => {
          const result = await this.cliRunner.execCli(sessionId, ['run-code', script]);
          this.cliRunner.assertNoCliError(result, 'Page readiness wait failed');
          return normalizeEvalStringOutput(result.stdout);
        },
      })
      .catch(() => ({
        ready: false,
        required: false,
        reason: 'dom_not_stable',
      }));
  }

  async settlePageAfterAction(sessionId: string): Promise<void> {
    try {
      const session = this.sessionManager.getOrCreateSession(sessionId);
      const activePageExpr = session.preferLatestTab
        ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
        : 'page';
      const settleTimeout = this.config.cliPageSettleTimeoutMs;
      const lastKnownCount = session.lastKnownPageCount ?? 1;
      const script = `async page => {
        const pages = page.context().pages();
        const activePage = ${activePageExpr};
        await activePage.waitForLoadState('domcontentloaded', { timeout: Math.min(${settleTimeout}, 2500) }).catch(() => {});
        await Promise.race([
          activePage.waitForLoadState('networkidle', { timeout: 600 }),
          activePage.waitForTimeout(350)
        ]).catch(() => {});
        await activePage.evaluate(() => new Promise(resolve => {
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => setTimeout(resolve, 60));
          } else {
            setTimeout(resolve, 60);
          }
        })).catch(() => {});
        const isNewTab = pages.length > ${lastKnownCount};
        const latestPage = isNewTab && pages.length > 1 ? pages[pages.length - 1] : null;
        if (latestPage && latestPage !== activePage) {
          await latestPage.bringToFront().catch(() => {});
        }
        return JSON.stringify({
          pageCount: pages.length,
          isNewTab,
          activeUrl: (latestPage || activePage).url(),
        });
      }`;
      const result = await this.cliRunner.execCli(sessionId, ['run-code', script]);
      const parsed = this.cliRunner.parseJsonStdout<{ pageCount?: number; isNewTab?: boolean; activeUrl?: string }>(result.stdout);
      if (parsed && typeof parsed.pageCount === 'number') {
        if (parsed.isNewTab) {
          session.preferLatestTab = true;
          const newIndex = parsed.pageCount - 1;
          await this.cliRunner.execCli(sessionId, ['tab-select', String(newIndex)]).catch(() => {});
          session.activeTabIndex = newIndex;
          if (typeof parsed.activeUrl === 'string' && parsed.activeUrl.trim() && !parsed.activeUrl.startsWith('about:blank')) {
            session.lastUrl = parsed.activeUrl.trim();
          }
        } else if (parsed.pageCount <= 1) {
          session.preferLatestTab = false;
          session.activeTabIndex = 0;
        }
        session.lastKnownPageCount = parsed.pageCount;
      }
    } catch {
      // settle is best-effort — never fail the step
    }
  }

  async handleSwitchLatestTab(sessionId: string): Promise<CliActionResult> {
    await this.sessionManager.ensureSessionReady(sessionId);
    const session = this.sessionManager.getOrCreateSession(sessionId);
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

    const result = await this.cliRunner.execCli(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Switch latest tab failed');
    const switchMeta = this.cliRunner.parseJsonStdout<{
      pageCount?: number;
      switched?: boolean;
      landedUrl?: string;
      title?: string;
    }>(result.stdout);

    if (typeof switchMeta?.landedUrl === 'string' && switchMeta.landedUrl.trim()) {
      session.lastUrl = switchMeta.landedUrl.trim();
    }
    const switchIndex = Math.max(0, (switchMeta?.pageCount || 1) - 1);
    await this.cliRunner.execCli(sessionId, ['tab-select', String(switchIndex)]).catch(() => {});
    session.activeTabIndex = switchIndex;
    session.preferLatestTab = (switchMeta?.pageCount || 1) > 1;
    session.lastKnownPageCount = switchMeta?.pageCount || 1;

    return {
      status: 'success',
      command: 'switch_latest_tab',
      stdout: result.stdout,
      stderr: result.stderr,
      data: switchMeta || { switched: true },
    };
  }

  async handleCloseTab(sessionId: string): Promise<CliActionResult> {
    await this.sessionManager.ensureSessionReady(sessionId);
    const session = this.sessionManager.getOrCreateSession(sessionId);
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

    const result = await this.cliRunner.execCli(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Close tab failed');
    const closeMeta = this.cliRunner.parseJsonStdout<{
      pageCount?: number;
      closed?: boolean;
      landedUrl?: string;
      title?: string;
    }>(result.stdout);

    if (typeof closeMeta?.landedUrl === 'string' && closeMeta.landedUrl.trim()) {
      session.lastUrl = closeMeta.landedUrl.trim();
    }
    const remainingCount = closeMeta?.pageCount || 1;
    const closeIndex = Math.max(0, remainingCount - 1);
    await this.cliRunner.execCli(sessionId, ['tab-select', String(closeIndex)]).catch(() => {});
    session.activeTabIndex = closeIndex;
    session.preferLatestTab = remainingCount > 1;
    session.lastKnownPageCount = remainingCount;

    return {
      status: 'success',
      command: 'close_tab',
      stdout: result.stdout,
      stderr: result.stderr,
      data: closeMeta || { closed: true },
    };
  }
}
