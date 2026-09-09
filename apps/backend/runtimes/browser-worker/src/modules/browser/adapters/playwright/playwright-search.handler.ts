import { Injectable, Optional } from '@nestjs/common';
import { PlaywrightCliRunner } from './playwright-cli.runner';
import { PlaywrightSessionManager } from './playwright-session.manager';
import {
  CliActionResult,
  CliExecResult,
  getDefaultPlaywrightConfig,
  PlaywrightCliConfig,
} from './playwright.types';

@Injectable()
export class PlaywrightSearchHandler {
  private readonly config: PlaywrightCliConfig;

  constructor(
    private readonly cliRunner: PlaywrightCliRunner,
    private readonly sessionManager: PlaywrightSessionManager,
    @Optional() config?: Partial<PlaywrightCliConfig>
  ) {
    this.config = { ...getDefaultPlaywrightConfig(), ...config };
  }

  async handleSearch(sessionId: string, query: string): Promise<CliActionResult> {
    await this.sessionManager.ensureSessionReady(sessionId);

    let fillResult: CliExecResult;
    try {
      fillResult = await this.cliRunner.execCli(sessionId, [
        'run-code',
        this.buildSearchScript(sessionId, query, false),
      ]);
      this.cliRunner.assertNoCliError(fillResult, 'Search input detection failed');
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

  async handleSmartSearch(sessionId: string, query: string): Promise<CliActionResult> {
    await this.sessionManager.ensureSessionReady(sessionId);

    let fillResult: CliExecResult;
    try {
      fillResult = await this.cliRunner.execCli(sessionId, [
        'run-code',
        this.buildSearchScript(sessionId, query, true),
      ]);
      this.cliRunner.assertNoCliError(fillResult, 'Smart search input detection failed');
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

  async submitSearch(sessionId: string, fallbackMessage: string): Promise<CliExecResult> {
    try {
      const submitResult = await this.cliRunner.execCli(sessionId, [
        'run-code',
        this.buildSearchSubmitScript(sessionId),
      ]);
      this.cliRunner.assertNoCliError(submitResult, fallbackMessage);
      return submitResult;
    } catch {
      const pressResult = await this.cliRunner.execCli(sessionId, ['press', 'Enter']);
      this.cliRunner.assertNoCliError(pressResult, fallbackMessage);
      return pressResult;
    }
  }

  async handleListSearchResults(
    sessionId: string,
    params: Record<string, unknown>
  ): Promise<CliActionResult> {
    await this.sessionManager.ensureSessionReady(sessionId);
    const session = this.sessionManager.getOrCreateSession(sessionId);
    const limit = this.cliRunner.readOptionalNumberParam(params, ['limit', 'max']) ?? 8;
    const result = await this.cliRunner.execCli(sessionId, [
      'run-code',
      this.buildListSearchResultsScript(sessionId, limit),
    ]);
    this.cliRunner.assertNoCliError(result, 'List search results failed');
    const meta = this.cliRunner.parseJsonStdout<{
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

  buildSearchScript(sessionId: string, query: string, allowLooseFallback: boolean): string {
    const minScore = allowLooseFallback ? 25 : 60;
    const errorMessage = allowLooseFallback
      ? 'No searchable input found on current page'
      : 'No explicit search entry found on current page';
    const session = this.sessionManager.getOrCreateSession(sessionId);
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

  buildSearchSubmitScript(sessionId: string): string {
    const session = this.sessionManager.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    return `async page => {
      const activePage = ${activePageExpr};
      const settleTimeout = ${this.config.cliPageSettleTimeoutMs};
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

  async handleClickResult(sessionId: string, index: number): Promise<CliActionResult> {
    await this.sessionManager.ensureSessionReady(sessionId);
    const session = this.sessionManager.getOrCreateSession(sessionId);

    if (!session.lastSearchResults || session.lastSearchResults.length < index) {
      await this.handleListSearchResults(sessionId, { limit: Math.max(index, 8) });
    }

    const script = this.buildClickSearchResultScript(sessionId, index);

    const result = await this.cliRunner.execCli(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(result, 'Click search result failed');
    const clickMeta = this.cliRunner.parseJsonStdout<{
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

  buildListSearchResultsScript(sessionId: string, limit: number): string {
    const session = this.sessionManager.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const normalizedLimit = Math.max(1, Math.min(limit, 20));
    return `async page => {
      const activePage = ${activePageExpr};
      const settleTimeout = ${this.config.cliPageSettleTimeoutMs};
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

  buildClickSearchResultScript(sessionId: string, index: number): string {
    const session = this.sessionManager.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const normalizedIndex = Math.max(index, 1);
    return `async page => {
      const activePage = ${activePageExpr};
      const settleTimeout = ${this.config.cliPageSettleTimeoutMs};
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

      await activePage.waitForLoadState('domcontentloaded', { timeout: settleTimeout }).catch(() => {});
      await activePage.waitForTimeout(500).catch(() => {});
      await activePage.evaluate(() => { window.focus(); }).catch(() => {});
      await activePage.waitForTimeout(300).catch(() => {});
      await activePage.bringToFront().catch(() => {});

      const landedUrl = await activePage.url();
      const title = await activePage.title().catch(() => '');
      const navigationConfirmed = landedUrl !== originalUrl || title !== originalTitle;

      if (!navigationConfirmed) {
        const allPages = page.context().pages();
        if (allPages.length > pageCountBefore) {
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

  async handleClickTableRow(
    sessionId: string,
    index: number,
    scope?: string,
    regionIdHint?: string
  ): Promise<CliActionResult> {
    await this.sessionManager.ensureSessionReady(sessionId);
    const session = this.sessionManager.getOrCreateSession(sessionId);
    const activePageExpr = session.preferLatestTab
      ? '(page.context().pages().length ? page.context().pages()[page.context().pages().length - 1] : page)'
      : 'page';
    const normalizedIndex = Math.max(index, 1);
    const settleMs = this.config.cliPageSettleTimeoutMs;

    const script = `async page => {
      const activePage = ${activePageExpr};
      await activePage.waitForLoadState('domcontentloaded', { timeout: ${settleMs} }).catch(() => {});
      await activePage.waitForLoadState('networkidle', { timeout: ${settleMs} }).catch(() => {});
      await activePage.waitForTimeout(400).catch(() => {});

      const originalUrl = activePage.url();
      const originalTitle = await activePage.title().catch(() => '');

      const selected = await activePage.evaluate((targetIndex) => {
        const MARKER = 'data-ops-table-row-target';
        document.querySelectorAll('[' + MARKER + ']').forEach(el => el.removeAttribute(MARKER));

        const isVisible = el => {
          if (!(el instanceof HTMLElement)) return false;
          const s = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 4 && r.height > 4;
        };

        const isInExcludedZone = el =>
          !!el.closest('nav,header,footer,aside,[role="navigation"],[role="menubar"],[role="menu"]');

        const computeSyntheticRegionId = (regionElement) => {
          if (!regionElement) return '';
          const allRegions = Array.from(document.querySelectorAll('[data-ai-region], section, main, aside, nav, form')).filter(isVisible);
          const idx = allRegions.indexOf(regionElement);
          if (idx === -1) return '';
          return regionElement.getAttribute('data-ai-region') || regionElement.getAttribute('aria-label') || regionElement.getAttribute('id') || ('region-' + (idx + 1));
        };

        const candidates = [];
        const scopeFilter = ${JSON.stringify(scope || '')};
        const regionIdHint = ${JSON.stringify(regionIdHint || '')};
        const rows = document.querySelectorAll('tr');
        for (const row of rows) {
          if (isInExcludedZone(row)) continue;
          if (!isVisible(row)) continue;
          if (row.closest('thead')) continue;
          if (row.querySelectorAll('th').length >= row.cells.length && row.cells.length > 0) continue;
          if (row.cells.length === 0) continue;

          if (scopeFilter || regionIdHint) {
            const table = row.closest('table, [role="table"], [role="grid"], .datagrid-view');
            const region = row.closest('[data-ai-region], section, main, aside, nav, form');
            
            let regionMatch = false;
            let tableMatch = false;
            let headerMatch = false;

            if (regionIdHint && region) {
               const syntheticId = computeSyntheticRegionId(region);
               if (syntheticId === regionIdHint) {
                 regionMatch = true;
               }
            }

            if (scopeFilter) {
              const regionName = region ? region.getAttribute('data-ai-region') : '';
              const tableText = table ? table.textContent || '' : '';
              const headerText = table ? (table.querySelector('thead, th, tr:first-child')?.textContent || '') : '';
              
              if (regionName && (regionName.includes(scopeFilter) || scopeFilter.includes(regionName))) regionMatch = true;
              if (tableText && (tableText.includes(scopeFilter) || scopeFilter.includes(tableText.substring(0, 20)))) tableMatch = true;
              if (headerText && (headerText.includes(scopeFilter) || scopeFilter.includes(headerText.trim()))) headerMatch = true;
            }
            
            if (!regionMatch && !tableMatch && !headerMatch) {
              continue;
            }
          }

          const isNotCheckbox = el => {
            if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return false;
            if (el.querySelector && el.querySelector('input[type="checkbox"], input[type="radio"]')) return false;
            return true;
          };

          let target =
            [...row.querySelectorAll('a[href]')].find(el => isVisible(el) && el.textContent.trim()) ||
            [...row.querySelectorAll('button')].find(el => isVisible(el) && el.textContent.trim()) ||
            row.querySelector('a[href], button') ||
            [...row.querySelectorAll('td [onclick], td [cursor="pointer"]')].find(el => isVisible(el) && isNotCheckbox(el)) ||
            [...row.querySelectorAll('td span,td div,td a,td')].find(el => {
              if (!isVisible(el) || !isNotCheckbox(el)) return false;
              return window.getComputedStyle(el).cursor === 'pointer';
            }) ||
            [...row.querySelectorAll('td a')].find(el => isVisible(el)) ||
            [...row.querySelectorAll('td')].find(el => isVisible(el) && isNotCheckbox(el)) ||
            row;

          candidates.push({
            element: target,
            text: (target.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
          });
        }

        if (candidates.length === 0) {
          const items = document.querySelectorAll('li,[role="listitem"],[role="row"]');
          for (const item of items) {
            if (isInExcludedZone(item)) continue;
            if (!isVisible(item)) continue;
            candidates.push({
              element: item,
              text: (item.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
            });
          }
        }

        if (candidates.length < targetIndex) {
          throw new Error('click_table_row: found ' + candidates.length + ' data rows, requested index ' + targetIndex);
        }

        const chosen = candidates[targetIndex - 1];
        chosen.element.setAttribute(MARKER, String(targetIndex));
        return { selectedText: chosen.text };
      }, ${normalizedIndex});

      const target = activePage.locator('[data-ops-table-row-target="${normalizedIndex}"]').first();
      const pageCountBefore = page.context().pages().length;
      const popupPromise = page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
      await target.scrollIntoViewIfNeeded().catch(() => {});
      await activePage.waitForTimeout(150).catch(() => {});
      await target.click({ force: true });
      await activePage.evaluate(() => {
        document.querySelectorAll('[data-ops-table-row-target]').forEach(el => el.removeAttribute('data-ops-table-row-target'));
      }).catch(() => {});

      const popup = await popupPromise;
      if (popup) {
        await popup.waitForLoadState('domcontentloaded', { timeout: ${settleMs} }).catch(() => {});
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

      await activePage.waitForLoadState('domcontentloaded', { timeout: ${settleMs} }).catch(() => {});
      await activePage.waitForTimeout(500).catch(() => {});
      await activePage.bringToFront().catch(() => {});

      const landedUrl = activePage.url();
      const title = await activePage.title().catch(() => '');
      const navigationConfirmed = landedUrl !== originalUrl || title !== originalTitle;

      if (!navigationConfirmed) {
        const allPages = page.context().pages();
        if (allPages.length > pageCountBefore) {
          const newTab = allPages[allPages.length - 1];
          await newTab.waitForLoadState('domcontentloaded', { timeout: ${settleMs} }).catch(() => {});
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

    const execResult = await this.cliRunner.execCli(sessionId, ['run-code', script]);
    this.cliRunner.assertNoCliError(execResult, 'click_table_row failed');
    const clickMeta = this.cliRunner.parseJsonStdout<{
      openedNewPage?: boolean;
      landedUrl?: string;
      title?: string;
      pageCount?: number;
      selectedText?: string;
      navigationConfirmed?: boolean;
    }>(execResult.stdout);
    if (typeof clickMeta?.landedUrl === 'string' && clickMeta.landedUrl.trim()) {
      session.lastUrl = clickMeta.landedUrl.trim();
    }
    session.preferLatestTab = clickMeta?.openedNewPage === true;

    return {
      status: 'success',
      command: 'click_table_row',
      stdout: execResult.stdout,
      stderr: execResult.stderr,
      data: {
        index,
        ...(clickMeta || {}),
      },
    };
  }
}
