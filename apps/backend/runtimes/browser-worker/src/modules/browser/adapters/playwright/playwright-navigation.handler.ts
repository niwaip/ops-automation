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

  async handleNavigate(sessionId: string, url: string): Promise<CliActionResult> {
    const session = this.sessionManager.getOrCreateSession(sessionId);

    if (!session.initialized) {
      await this.sessionManager.openSession(sessionId, url);
    }
    const script = `async page => {
        const activePage = (page.context().pages().find(p => p.url() && !p.url().startsWith('about:')) || page.context().pages()[page.context().pages().length - 1] || page);
        const currentUrl = activePage.url();
        const normalize = u => (typeof u === 'string' && u.endsWith('/') ? u.slice(0, -1) : (u || ''));
        if (normalize(currentUrl) !== normalize(${JSON.stringify(url)})) {
          await activePage.goto(${JSON.stringify(url)}).catch(() => {});
        }
        await activePage.waitForLoadState('domcontentloaded').catch(() => {});
        await Promise.race([
          activePage.waitForLoadState('networkidle'),
          activePage.waitForTimeout(1000)
        ]).catch(() => {});

        // Wait up to 2.5s for SPA data hydration or content readiness
        const spaStart = Date.now();
        let articles = 0;
        while (Date.now() - spaStart < 2500) {
          const status = await activePage.evaluate(() => {
            const count = document.querySelectorAll('article').length;
            const hasMainContent = Boolean(
              document.querySelector('main, #root, #app, [role="main"], form, table') ||
              (document.body && document.body.innerText && document.body.innerText.trim().length > 30)
            );
            return { count, hasMainContent };
          }).catch(() => ({ count: 0, hasMainContent: false }));
          articles = status.count;
          if (articles > 0) break;
          if (status.hasMainContent && (Date.now() - spaStart > 600)) {
            break;
          }
          await activePage.waitForTimeout(200).catch(() => {});
        }

        // Self-heal: if articles still 0 and transient error visible, click retry button
        if (articles === 0) {
          const isError = await activePage.evaluate(() => {
            const text = document.body ? document.body.innerText || '' : '';
            return text.includes('列表加载失败') || text.includes('加载失败，请重试') || text.includes('加载失败');
          }).catch(() => false);

          if (isError) {
            await activePage.evaluate(() => {
              const b = document.querySelector('[data-slot=empty-content] button') ||
                        Array.from(document.querySelectorAll('button')).find(el => (el.innerText || el.textContent || '').includes('重试') || (el.innerText || el.textContent || '').toLowerCase().includes('retry'));
              if (b) {
                b.scrollIntoView();
                b.focus();
                ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
                  b.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
                });
                b.click();
              }
            }).catch(() => {});

            const retryStart = Date.now();
            while (Date.now() - retryStart < 10000) {
              articles = await activePage.evaluate(() => document.querySelectorAll('article').length).catch(() => 0);
              if (articles > 0) break;
              await activePage.waitForTimeout(500).catch(() => {});
            }

            // Last resort: full page reload
            if (articles === 0) {
              await activePage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
              const reloadStart = Date.now();
              while (Date.now() - reloadStart < 10000) {
                articles = await activePage.evaluate(() => document.querySelectorAll('article').length).catch(() => 0);
                if (articles > 0) break;
                await activePage.waitForTimeout(500).catch(() => {});
              }
            }
          }
        }

        await activePage.bringToFront().catch(() => {});
        // Return only minimal JSON (not HTML) to avoid stdout size/parsing issues.
        // HTML is fetched separately by readCurrentPageHtml which also waits for SPA hydration.
      return JSON.stringify({ url: activePage.url(), status: 'navigated', articles });
    }`;
    const result = await this.cliRunner.execCli(sessionId, ['run-code', script]);
    session.lastUrl = url;
    this.cliRunner.assertNoCliError(result, 'Navigation failed');

    let navigateHtml: string | undefined;
    let navigateArticles: number | undefined;
    const parsed = this.cliRunner.parseJsonStdout<Record<string, unknown>>(result.stdout);
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
        pageUrl: session.lastUrl || url,
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
      const script = `async page => {
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
        return 'settled';
      }`;
      await this.cliRunner.execCli(sessionId, ['run-code', script]);
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
    session.preferLatestTab = true;

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
    session.preferLatestTab = true;

    return {
      status: 'success',
      command: 'close_tab',
      stdout: result.stdout,
      stderr: result.stderr,
      data: closeMeta || { closed: true },
    };
  }
}
