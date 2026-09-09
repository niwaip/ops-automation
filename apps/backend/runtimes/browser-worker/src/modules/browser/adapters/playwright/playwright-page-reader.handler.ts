import { Injectable, Optional } from '@nestjs/common';
import { BrowserContentExtractionService } from '../../content/browser-content-extraction.service';
import { PlaywrightCliRunner } from './playwright-cli.runner';
import { PlaywrightSessionManager } from './playwright-session.manager';
import {
  CliActionResult,
  getDefaultPlaywrightConfig,
  PlaywrightCliConfig,
} from './playwright.types';

@Injectable()
export class PlaywrightPageReader {
  private readonly config: PlaywrightCliConfig;

  constructor(
    private readonly cliRunner: PlaywrightCliRunner,
    private readonly sessionManager: PlaywrightSessionManager,
    @Optional()
    private readonly contentExtraction: BrowserContentExtractionService = new BrowserContentExtractionService(),
    @Optional() config?: Partial<PlaywrightCliConfig>
  ) {
    this.config = { ...getDefaultPlaywrightConfig(), ...config };
  }

  normalizeEvalStringOutput(output: string): string {
    if (!output || !output.trim()) {
      return '';
    }

    const trimmed = output.trim();
    const resultBlockMatch = trimmed.match(
      /### Result\s*\n?([\s\S]*?)(?:\n### Ran Playwright code|\n### |\n```|$)/
    );
    const candidate =
      resultBlockMatch && typeof resultBlockMatch[1] === 'string'
        ? resultBlockMatch[1].trim()
        : trimmed;

    if (!candidate) {
      return '';
    }

    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') {
        return parsed;
      }
      if (typeof parsed === 'number' || typeof parsed === 'boolean') {
        return String(parsed);
      }
      return candidate;
    } catch {
      if (
        (candidate.startsWith('"') && candidate.endsWith('"')) ||
        (candidate.startsWith("'") && candidate.endsWith("'"))
      ) {
        return candidate.slice(1, -1);
      }
      return candidate;
    }
  }

  extractMainTextFromHtml(html: string): string | undefined {
    if (!html || !html.trim()) return undefined;
    try {
      const extracted = this.contentExtraction.extract(html, {
        schemaVersion: 'capture-profile/v1',
        profile: 'article',
        capture: { screenshot: true, html: true, snapshot: false, mainContent: true },
        limits: { htmlBytes: 1_000_000, contentChars: 30_000, tableCells: 500 },
        content: {
          preserveHeadings: true,
          preserveLinks: true,
          preserveTables: true,
          preserveCodeBlocks: true,
        },
      });
      return extracted.text && extracted.text.trim().length > 0 ? extracted.text : undefined;
    } catch {
      return undefined;
    }
  }

  async readCurrentPageHtml(sessionId: string): Promise<string> {
    await this.sessionManager.ensureSessionReady(sessionId);
    const script = `async page => {
      const activePage = (page.context().pages().find(p => p.url() && !p.url().startsWith('about:')) || page.context().pages()[page.context().pages().length - 1] || page);
      await activePage.bringToFront().catch(() => {});
      await activePage.waitForLoadState('domcontentloaded').catch(() => {});

      // Wait briefly for SPA hydration before capturing HTML
      let articles = await activePage.evaluate(() => document.querySelectorAll('article').length).catch(() => 0);
      if (articles === 0) {
        const waitStart = Date.now();
        while (Date.now() - waitStart < 4000) {
          articles = await activePage.evaluate(() => document.querySelectorAll('article').length).catch(() => 0);
          if (articles > 0) break;
          await activePage.waitForTimeout(500).catch(() => {});
        }
      }

      // Self-heal: if articles still 0 and transient error visible (e.g. 列表加载失败), click retry button
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
          while (Date.now() - retryStart < 8000) {
            articles = await activePage.evaluate(() => document.querySelectorAll('article').length).catch(() => 0);
            if (articles > 0) break;
            await activePage.waitForTimeout(500).catch(() => {});
          }

          if (articles === 0) {
            await activePage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            const reloadStart = Date.now();
            while (Date.now() - reloadStart < 8000) {
              articles = await activePage.evaluate(() => document.querySelectorAll('article').length).catch(() => 0);
              if (articles > 0) break;
              await activePage.waitForTimeout(500).catch(() => {});
            }
          }
        }
      }

      return await activePage.evaluate((maxChars) => {
        if (!document.documentElement) return '';
        try {
          const clone = document.documentElement.cloneNode(true);
          if (clone && typeof clone.querySelectorAll === 'function') {
            try {
              const suspenseDivs = clone.querySelectorAll('div[id^="S:"], div[id^="P:"], div[id^="rc_"], div[data-rsc-chunk]');
              suspenseDivs.forEach(div => {
                const id = div.id;
                const key = id.includes(':') ? id.split(':')[1] : id;
                const template = clone.querySelector('[id="B:' + key + '"], [id="T:' + key + '"], [id="P:' + key + '"], [id="rc_' + key + '"]');
                div.removeAttribute('hidden');
                if (template && template.parentNode) {
                  template.parentNode.insertBefore(div, template);
                  template.remove();
                }
              });
            } catch {}
            clone.querySelectorAll('style, script, noscript, template, iframe, svg, canvas').forEach(el => el.remove());
            clone.querySelectorAll('textarea[style*="display: none"], textarea[style*="display:none"], textarea[id*="css"], [id*="_css"]').forEach(el => el.remove());
            clone.querySelectorAll('input[type="hidden"]').forEach(el => el.remove());
            return clone.outerHTML.slice(0, maxChars);
          }
        } catch {}
        return document.documentElement.outerHTML.slice(0, maxChars);
      }, ${this.config.maxHtmlChars});
    }`;
    const result = await this.cliRunner.execCli(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Read page HTML failed');
    return this.normalizeEvalStringOutput(result.stdout);
  }

  async handleReadPage(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.sessionManager.ensureSessionReady(sessionId);
    const session = this.sessionManager.getOrCreateSession(sessionId);

    const selector = this.cliRunner.readOptionalStringParam(params, ['selector', 'target']);
    const maxLength = this.cliRunner.readOptionalNumberParam(params, ['max_length']) ?? 4000;
    const method =
      this.cliRunner.readOptionalStringParam(params, ['method']) || (selector ? 'textContent' : 'innerText');
    const attributeName = this.cliRunner.readOptionalStringParam(params, ['attribute']);
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

              try {
                const NOISE_BUTTONS = new Set([
                  '登录', '注册', '登出', '退出', '搜索', '全站搜索', '打开菜单', '关闭', '展开', '收起',
                  '切换到看板', '设置', '换一换', '添加表情反应', '请作者喝奶茶', '反馈建议', '热榜会员',
                  '公众号', '分享', '点赞', '收藏', '关注', '订阅', '举报', '广告', 'app 内打开',
                  '下载 app', '客户端下载', '更多', '刷新', '返回', '确定', '取消'
                ]);

                const rootEl = document.querySelector('main') || document.querySelector('[role="main"]') || body;
                const clone = rootEl.cloneNode(true);
                try {
                  const suspenseDivs = clone.querySelectorAll('div[id^="S:"], div[id^="P:"], div[id^="rc_"], div[data-rsc-chunk]');
                  suspenseDivs.forEach(div => {
                    const id = div.id;
                    const key = id.includes(':') ? id.split(':')[1] : id;
                    const template = clone.querySelector('#B\\\\:' + key + ', #T\\\\:' + key + ', #P\\\\:' + key + ', #rc_' + key);
                    div.removeAttribute('hidden');
                    if (template && template.parentNode) {
                      template.parentNode.insertBefore(div, template);
                      template.remove();
                    }
                  });
                } catch {}
                const selectorsToRemove = [
                  'script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'svg', 'canvas', 'dialog', 'select', 'option',
                  'header', 'footer', 'nav', 'aside',
                  '[hidden]', '[aria-hidden="true"]', '[inert]', '.sr-only',
                  '[role="banner"]', '[role="navigation"]', '[role="contentinfo"]', '[role="search"]',
                  '[data-site-header]', '[data-site-header-spacer]',
                  '.ad-container', '.advertisement', '.cookie-banner', '.popup-overlay', '.share-buttons', '.social-links',
                  '[data-testid*="reaction"]', '[data-testid*="search"]', '[data-testid*="header"]',
                  '[data-slot="skeleton"]', '.skeleton', '[data-testid*="fallback"]',
                  'input[type="hidden"]'
                ];

                for (const sel of selectorsToRemove) {
                  try {
                    const els = clone.querySelectorAll(sel);
                    els.forEach(el => {
                      if (
                        sel === '[hidden]' &&
                        (el.querySelector('article, main, [role="main"], [data-latest-list-item-key], .item-card, .card, h1, h2, h3, p') ||
                          el.id?.startsWith('S:') ||
                          el.id?.startsWith('P:') ||
                          el.id?.startsWith('rc_'))
                      ) {
                        el.removeAttribute('hidden');
                        return;
                      }
                      el.remove();
                    });
                  } catch {}
                }

                const lines = [];
                function extractArticle(articleEl) {
                  const rankEl = articleEl.querySelector('[data-testid*="rank"]') || articleEl.querySelector('.rank');
                  const rank = (rankEl && rankEl.textContent ? rankEl.textContent.trim() : '');
                  const titleEl =
                    articleEl.querySelector('h1, h2, h3, h4, h5, h6') ||
                    articleEl.querySelector('a[data-item-title-link="true"]') ||
                    articleEl.querySelector('a[data-item-primary-link="true"]') ||
                    articleEl.querySelector('.title, a');
                  const title = (titleEl && titleEl.textContent ? titleEl.textContent.replace(/\\s+/g, ' ').trim() : '');
                  const href =
                    (titleEl && titleEl.getAttribute ? titleEl.getAttribute('href') : '') ||
                    (articleEl.querySelector('a') ? articleEl.querySelector('a').getAttribute('href') : '') ||
                    '';
                  const excerptEl =
                    articleEl.querySelector('[data-testid*="body"] a:not([data-item-title-link="true"])') ||
                    articleEl.querySelector('p, .summary, .excerpt, .description');
                  let excerpt = (excerptEl && excerptEl.textContent ? excerptEl.textContent.replace(/\\s+/g, ' ').trim() : '');
                  if (excerpt === title || excerpt.startsWith('[')) {
                    excerpt = (excerptEl && excerptEl.textContent ? excerptEl.textContent.replace(/^\\[.*?\\]\\s*/, '').replace(/\\s+/g, ' ').trim() : '');
                  }
                  const metaEl =
                    articleEl.querySelector('[data-testid*="meta"]') ||
                    articleEl.querySelector('.meta, .footer, .extra');
                  const metaText = (metaEl && metaEl.textContent ? metaEl.textContent.replace(/\\s+/g, ' ').trim() : '');

                  const parts = [];
                  if (rank && title) parts.push(rank + '. ' + title);
                  else if (title) parts.push('- ' + title);
                  if (excerpt && excerpt !== title) parts.push('   摘要: ' + excerpt);
                  if (metaText) parts.push('   信息: ' + metaText);
                  if (href && !href.startsWith('javascript:')) parts.push('   链接: ' + href);
                  return parts.join('\\n');
                }

                function isNoise(el) {
                  const tag = el.tagName.toLowerCase();
                  if (tag === 'button' || el.getAttribute('role') === 'button') {
                    const t = (el.textContent || '').trim().toLowerCase();
                    if (!t || NOISE_BUTTONS.has(t) || (t.length <= 6 && NOISE_BUTTONS.has(t))) return true;
                  }
                  return false;
                }

                function walk(node) {
                  if (!node) return;
                  if (node.nodeType === 3) {
                    const t = (node.textContent || '').replace(/[ \\t]+/g, ' ').trim();
                    if (t) lines.push(t);
                    return;
                  }
                  if (node.nodeType === 1) {
                    const el = node;
                    if (isNoise(el)) return;
                    const tag = el.tagName.toLowerCase();
                    if (/^h[1-6]$/.test(tag)) {
                      const ht = (el.textContent || '').replace(/\\s+/g, ' ').trim();
                      if (ht && !NOISE_BUTTONS.has(ht.toLowerCase())) {
                        const level = parseInt(tag.charAt(1), 10) || 1;
                        lines.push('\\n' + '#'.repeat(level) + ' ' + ht + '\\n');
                      }
                      return;
                    }
                    if (tag === 'article' || el.getAttribute('data-latest-list-item-key') || el.classList.contains('item-card') || el.classList.contains('card')) {
                      const artText = extractArticle(el);
                      if (artText) {
                        lines.push('\\n' + artText + '\\n');
                        return;
                      }
                    }
                    if (tag === 'table') {
                      const rows = Array.from(el.querySelectorAll('tr'));
                      for (const row of rows) {
                        const cells = Array.from(row.querySelectorAll('th, td')).map(c => (c.textContent || '').replace(/\\s+/g, ' ').trim()).filter(Boolean);
                        if (cells.length) lines.push(cells.join(' | '));
                      }
                      return;
                    }
                    if (tag === 'li') {
                      const lt = (el.textContent || '').replace(/\\s+/g, ' ').trim();
                      if (lt) lines.push('- ' + lt);
                      return;
                    }
                    if (tag === 'p' || tag === 'blockquote') {
                      const pt = (el.textContent || '').replace(/[ \\t]+/g, ' ').trim();
                      if (pt) lines.push('\\n' + pt + '\\n');
                      return;
                    }
                    for (const child of Array.from(el.childNodes)) {
                      walk(child);
                    }
                  }
                }

                walk(clone);
                const structured = lines.join('\\n').replace(/\\n{3,}/g, '\\n\\n').trim();
                if (structured.length > 50) {
                  return structured.slice(0, maxLength);
                }
              } catch {}

              return String(body.innerText || '').slice(0, maxLength);
            },
            {
              maxLength: ${maxLength},
              method: ${JSON.stringify(method)},
              attributeName: ${JSON.stringify(attributeName || '')},
            }
          );
          return text || '';
        }`;

    const result = await this.cliRunner.execCli(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Read page failed');
    const text = this.normalizeEvalStringOutput(result.stdout);

    return {
      status: 'success',
      command: selector ? 'read_page' : 'get_text',
      stdout: result.stdout,
      stderr: result.stderr,
      data: { text, selector, maxLength },
    };
  }
}
