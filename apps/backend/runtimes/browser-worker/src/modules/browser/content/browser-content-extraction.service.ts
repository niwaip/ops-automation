import { Injectable } from '@nestjs/common';
import type { CaptureProfileV1 } from '@ops/backend-browser-execution-contract';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { ExtractedBrowserContent } from './content-extraction.types';

const NOISE_BUTTON_TEXTS = new Set([
  '登录', '注册', '登出', '退出', '搜索', '全站搜索', '打开菜单', '关闭', '展开', '收起',
  '切换到看板', '设置', '换一换', '添加表情反应', '请作者喝奶茶', '反馈建议', '热榜会员',
  '公众号', '分享', '点赞', '收藏', '关注', '订阅', '举报', '广告', 'app 内打开',
  '下载 app', '客户端下载', '更多', '刷新', '返回', '确定', '取消', 'copy', 'share',
  'like', 'subscribe', 'follow', 'sign in', 'log in', 'sign up', 'menu', 'close'
]);

@Injectable()
export class BrowserContentExtractionService {
  extract(html: string, profile: CaptureProfileV1): ExtractedBrowserContent {
    if (!profile.capture.mainContent) {
      return {
        text: '',
        profile: profile.profile,
        method: 'none',
        confidence: 1,
        fallbackLevel: 0,
        truncated: false,
        activeContentRemoved: false,
        suspectedPromptInjection: false,
      };
    }

    let dom: JSDOM;
    try {
      dom = new JSDOM(html);
    } catch {
      return {
        text: '',
        profile: profile.profile,
        method: 'visible-text',
        confidence: 0,
        fallbackLevel: 3,
        truncated: false,
        activeContentRemoved: false,
        suspectedPromptInjection: false,
      };
    }

    const doc = dom.window.document;

    // Check if active content was present
    const hadActiveContent =
      /<(?:script|style|template|noscript|iframe|object|embed|svg|canvas)\b/iu.test(html) ||
      /<input\b[^>]*(?:type\s*=\s*["']?hidden|name\s*=\s*["']?(?:token|password|cookie|authorization))/iu.test(
        html
      );

    // 1. Try Readability on a cloned document
    let readabilityResult: { title?: string; text: string; excerpt?: string } | null = null;
    try {
      const readerDom = new JSDOM(html);
      this.resolveReactSuspense(readerDom.window.document);
      this.preCleanDocument(readerDom.window.document);
      const reader = new Readability(readerDom.window.document, {
        charThreshold: 40,
      });
      const parsed = reader.parse();
      if (parsed && parsed.content && parsed.textContent && parsed.textContent.trim().length >= 40) {
        const contentDom = new JSDOM(parsed.content);
        const structuredReadability = this.extractStructuredText(contentDom.window.document.body);
        if (structuredReadability.length >= 30) {
          readabilityResult = {
            title: parsed.title || undefined,
            text: structuredReadability,
            excerpt: parsed.excerpt || undefined,
          };
        }
      }
    } catch {
      readabilityResult = null;
    }

    // 2. Extract structured content from main / body
    this.resolveReactSuspense(doc);
    this.preCleanDocument(doc);
    const listingItemSelector =
      '[data-latest-list-item-key], .item-card, [data-item-title-link="true"], [data-item-primary-link="true"]';
    const listingItemCount = doc.querySelectorAll(listingItemSelector).length;
    const candidateMain = doc.querySelector('main') || doc.querySelector('[role="main"]');
    let mainRoot: Element | null = null;
    if (candidateMain) {
      const mainArticles = candidateMain.querySelectorAll(listingItemSelector).length;
      if (
        listingItemCount === 0 ||
        mainArticles > 0 ||
        (candidateMain.textContent || '').trim().length >= 80
      ) {
        mainRoot = candidateMain;
      }
    }
    if (!mainRoot) {
      mainRoot =
        doc.querySelector('article') ||
        doc.querySelector('div[id^="S:"]') ||
        doc.querySelector('div[id^="P:"]') ||
        doc.body;
    }

    const structuredText = mainRoot ? this.extractStructuredText(mainRoot) : '';

    // 3. Selection Strategy:
    // For listing / feeds / aggregator pages (>= 3 articles/cards), structuredText retains card structure, titles, links, and ranks.
    // For articles, prefer readabilityResult when available and coherent.
    let selectedText = '';
    let selectedMethod: ExtractedBrowserContent['method'] = 'visible-text';
    let selectedTitle: string | undefined;
    let selectedExcerpt: string | undefined;

    // Generic <article> and .card elements also appear around comments,
    // recommendations and sidebars on article pages (notably Zhihu).  Treat
    // a page as a feed only when it exposes repeated, explicit list-item
    // semantics; otherwise Readability must get the article-page decision.
    const isListingOrFeed = listingItemCount >= 3;

    if (isListingOrFeed && structuredText.length > 0) {
      selectedText = structuredText;
      selectedMethod = 'semantic-main';
      selectedTitle = doc.title?.trim() || undefined;
    } else if (readabilityResult && readabilityResult.text.length >= 40 && profile.profile === 'article') {
      selectedText = readabilityResult.text;
      selectedMethod = 'readability';
      selectedTitle = readabilityResult.title;
      selectedExcerpt = readabilityResult.excerpt;
    } else if (structuredText.length > 0) {
      selectedText = structuredText;
      selectedMethod = 'semantic-main';
      selectedTitle = doc.title?.trim() || undefined;
    } else {
      selectedText = (doc.body?.textContent || '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      selectedMethod = 'visible-text';
    }

    const truncated = selectedText.length > profile.limits.contentChars;
    const text = truncated ? selectedText.slice(0, profile.limits.contentChars) : selectedText;

    return {
      text,
      title: selectedTitle,
      excerpt: selectedExcerpt,
      profile: profile.profile,
      method: selectedMethod,
      confidence: confidence(text),
      fallbackLevel:
        selectedMethod === 'readability' ? 0 : selectedMethod === 'semantic-main' ? 1 : 2,
      truncated,
      activeContentRemoved: hadActiveContent,
      suspectedPromptInjection: isSuspectedPromptInjection(text),
    };
  }

  private resolveReactSuspense(document: Document): void {
    const suspenseDivs = document.querySelectorAll(
      'div[id^="S:"], div[id^="P:"], div[id^="rc_"], div[data-rsc-chunk]'
    );
    suspenseDivs.forEach((div) => {
      const id = div.id;
      const key = id.includes(':') ? id.split(':')[1] : id;
      const template =
        document.getElementById(`B:${key}`) ||
        document.getElementById(`T:${key}`) ||
        document.getElementById(`P:${key}`) ||
        document.getElementById(`rc_${key}`);
      div.removeAttribute('hidden');
      if (template && template.parentNode) {
        template.parentNode.insertBefore(div, template);
        template.remove();
      }
    });
  }

  private preCleanDocument(document: Document): void {
    const selectorsToRemove = [
      'script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'svg', 'canvas', 'dialog', 'select', 'option',
      'header', 'footer', 'nav', 'aside',
      '[hidden]', '[aria-hidden="true"]', '[inert]', '.sr-only',
      '[role="banner"]', '[role="navigation"]', '[role="contentinfo"]', '[role="search"]',
      '[data-site-header]', '[data-site-header-spacer]',
      '.ad-container', '.advertisement', '.cookie-banner', '.popup-overlay', '.share-buttons', '.social-links',
      '[data-testid*="reaction"]', '[data-testid*="search"]', '[data-testid*="header"]',
      '[data-slot="skeleton"]', '.skeleton', '[data-testid*="fallback"]',
      'input[type="hidden"]', 'input[name*="token" i]', 'input[name*="password" i]', 'input[name*="cookie" i]'
    ];

    for (const sel of selectorsToRemove) {
      try {
        const els = document.querySelectorAll(sel);
        els.forEach((el) => {
          if (
            sel === '[hidden]' &&
            (el.querySelector(
              'article, main, [role="main"], [data-latest-list-item-key], .item-card, .card, h1, h2, h3, p'
            ) ||
              el.id?.startsWith('S:') ||
              el.id?.startsWith('P:') ||
              el.id?.startsWith('rc_'))
          ) {
            el.removeAttribute('hidden');
            return;
          }
          el.remove();
        });
      } catch {
        // Ignore selectors unsupported by the current DOM implementation.
      }
    }
  }

  private extractStructuredText(rootElement: Element): string {
    const lines: string[] = [];
    this.walkNode(rootElement, lines);
    return lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private walkNode(node: Node, lines: string[]): void {
    if (!node) return;

    if (node.nodeType === 3) {
      const text = (node.textContent || '').replace(/[ \t]+/g, ' ').trim();
      if (text) {
        lines.push(text);
      }
      return;
    }

    if (node.nodeType === 1) {
      const el = node as Element;
      if (this.isNoiseElement(el)) {
        return;
      }

      const tag = el.tagName.toLowerCase();

      // Headings
      if (/^h[1-6]$/.test(tag)) {
        const hText = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (hText && !NOISE_BUTTON_TEXTS.has(hText.toLowerCase())) {
          const level = parseInt(tag.charAt(1), 10) || 1;
          const prefix = '#'.repeat(level);
          lines.push(`\n${prefix} ${hText}\n`);
        }
        return;
      }

      // Article / Card Item
      if (
        el.getAttribute('data-latest-list-item-key') ||
        el.classList?.contains('item-card') ||
        el.querySelector(':scope > a[data-item-title-link="true"], :scope > a[data-item-primary-link="true"]')
      ) {
        const articleText = this.extractArticleCardText(el);
        if (articleText) {
          lines.push(`\n${articleText}\n`);
          return;
        }
      }

      // Table
      if (tag === 'table') {
        const rows = Array.from(el.querySelectorAll('tr'));
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('th, td'))
            .map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean);
          if (cells.length > 0) {
            lines.push(cells.join(' | '));
          }
        }
        return;
      }

      // List item
      if (tag === 'li') {
        const liText = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (liText) {
          lines.push(`- ${liText}`);
        }
        return;
      }

      // Paragraph / Blockquote
      if (tag === 'p' || tag === 'blockquote') {
        const pText = (el.textContent || '').replace(/[ \t]+/g, ' ').trim();
        if (pText) {
          lines.push(`\n${pText}\n`);
        }
        return;
      }

      // Pre / Code
      if (tag === 'pre') {
        const codeText = (el.textContent || '').trim();
        if (codeText) {
          lines.push(`\n\`\`\`\n${codeText}\n\`\`\`\n`);
        }
        return;
      }

      // Default: walk children
      for (const child of Array.from(el.childNodes)) {
        this.walkNode(child, lines);
      }
    }
  }

  private isNoiseElement(el: Element): boolean {
    const tagName = el.tagName.toLowerCase();

    if (tagName === 'button' || el.getAttribute('role') === 'button') {
      const text = (el.textContent || '').trim().toLowerCase();
      if (!text || NOISE_BUTTON_TEXTS.has(text) || (text.length <= 6 && NOISE_BUTTON_TEXTS.has(text))) {
        return true;
      }
    }

    return false;
  }

  private extractArticleCardText(articleEl: Element): string {
    const rankEl =
      articleEl.querySelector('[data-testid*="rank"]') || articleEl.querySelector('.rank');
    const rank = (rankEl?.textContent || '').trim();

    const titleEl =
      articleEl.querySelector('h1, h2, h3, h4, h5, h6') ||
      articleEl.querySelector('a[data-item-title-link="true"]') ||
      articleEl.querySelector('a[data-item-primary-link="true"]') ||
      articleEl.querySelector('.title, a');
    const title = (titleEl?.textContent || '').replace(/\s+/g, ' ').trim();
    const href =
      titleEl?.getAttribute('href') ||
      titleEl?.querySelector('a')?.getAttribute('href') ||
      articleEl.querySelector('a')?.getAttribute('href') ||
      '';

    const excerptEl =
      articleEl.querySelector('[data-testid*="body"] a:not([data-item-title-link="true"])') ||
      articleEl.querySelector('p, .summary, .excerpt, .description');
    let excerpt = (excerptEl?.textContent || '').replace(/\s+/g, ' ').trim();
    if (excerpt === title || excerpt.startsWith('[')) {
      const fullExcerptText = (excerptEl?.textContent || '')
        .replace(/^\[.*?\]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
      excerpt = fullExcerptText;
    }

    const metaEl =
      articleEl.querySelector('[data-testid*="meta"]') ||
      articleEl.querySelector('.meta, .footer, .extra');
    const metaText = (metaEl?.textContent || '').replace(/\s+/g, ' ').trim();

    const parts: string[] = [];
    if (rank && title) {
      parts.push(`${rank}. ${title}`);
    } else if (title) {
      parts.push(`- ${title}`);
    }

    if (excerpt && excerpt !== title) {
      parts.push(`   摘要: ${excerpt}`);
    }

    if (metaText) {
      parts.push(`   信息: ${metaText}`);
    }

    if (href && !href.startsWith('javascript:')) {
      parts.push(`   链接: ${href}`);
    }

    return parts.join('\n');
  }
}

function isSuspectedPromptInjection(text: string): boolean {
  return /ignore\s+(?:all\s+)?(?:previous|prior)|system\s+prompt|developer\s+message|忽略.{0,12}(?:之前|上述).{0,12}指令/iu.test(
    text
  );
}

function confidence(text: string): number {
  if (text.length >= 2000) return 0.9;
  if (text.length >= 600) return 0.75;
  if (text.length >= 160) return 0.55;
  return text.length > 0 ? 0.35 : 0;
}
