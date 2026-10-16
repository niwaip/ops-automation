import axios from 'axios';
import {
  isAxiosErrorLike,
  SearchEngineProvider,
  SearchEngineResponse,
  SearchRequestOptions,
  SearchResultItem,
} from '../search-engine.types';

const BING_SEARCH_ENDPOINT = 'https://www.bing.com/search';
const DEFAULT_TIMEOUT_MS = 15_000;

const DISCARD_RE =
  /windows.*?(帮助|支持|客户端)|无法正常浏览.*?浏览器版本过低|人机身份验证|enable cookies|captcha|microsoft support/i;

export class BingProvider implements SearchEngineProvider {
  public readonly name = 'bing';

  public isConfigured(runtimeConfigs?: Record<string, string>): boolean {
    const configuredValue =
      process.env.BING_ENABLED ??
      process.env.BING_SEARCH_ENABLED ??
      runtimeConfigs?.BING_ENABLED ??
      runtimeConfigs?.BING_SEARCH_ENABLED;
    if (configuredValue?.trim().toLowerCase() === 'false') return false;
    return true;
  }

  public async search(
    options: SearchRequestOptions,
    _runtimeConfigs?: Record<string, string>
  ): Promise<SearchEngineResponse> {
    const maxResults = Math.min(10, Math.max(1, Math.trunc(options.maxResults || 5)));
    const timeout = Math.min(30_000, Math.max(1_000, options.timeoutMs || DEFAULT_TIMEOUT_MS));

    let queryText = options.query.trim();
    if (options.includeDomains && options.includeDomains.length > 0) {
      const domainFilter = options.includeDomains
        .map((d) => `site:${d.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')}`)
        .join(' OR ');
      queryText = `${queryText} ${domainFilter}`.trim();
    }

    let filterParam = '';
    if (options.days != null) {
      if (options.days <= 1) {
        filterParam = '&filters=ex1:"ez1"';
      } else if (options.days <= 7) {
        filterParam = '&filters=ex1:"ez2"';
      } else if (options.days <= 30) {
        filterParam = '&filters=ex1:"ez3"';
      }
    }

    try {
      const url = `${BING_SEARCH_ENDPOINT}?q=${encodeURIComponent(queryText)}${filterParam}`;
      const response = await axios.get(url, {
        timeout,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      });

      const html = typeof response?.data === 'string' ? response.data : '';
      if (/anomaly-modal|challenge-form|b_captcha/i.test(html)) {
        throw new Error('Bing 触发反爬验证拦截 (Bot Challenge)');
      }

      const results = this.parseHtmlResults(html, maxResults);
      const warnings: string[] = ['使用 Bing 免凭据公开通道检索'];
      if (results.length === 0) {
        warnings.push('Bing 未返回匹配结果');
      }

      return {
        provider: 'bing',
        results,
        resultCount: results.length,
        warnings,
      };
    } catch (error) {
      if (isAxiosErrorLike(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error('Bing 检索请求超时');
        }
        if (error.response?.status) {
          throw new Error(`Bing 返回错误 (${error.response.status})`);
        }
      }
      throw error instanceof Error ? error : new Error('Bing 检索失败');
    }
  }

  private parseHtmlResults(html: string, maxResults: number): SearchResultItem[] {
    const results: SearchResultItem[] = [];
    const blocks = html.match(/<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/g) || [];

    for (let i = 0; i < blocks.length && results.length < maxResults; i++) {
      const b = blocks[i];
      const h2Match = b.match(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/i);
      const pMatch = b.match(/<p[^>]*>([\s\S]*?)<\/p>/i);

      if (!h2Match) continue;

      const rawUrl = h2Match[1].trim();
      const rawTitle = h2Match[2].replace(/<[^>]+>/g, '').trim();
      const rawSnippet = pMatch ? pMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      if (DISCARD_RE.test(rawTitle) || DISCARD_RE.test(rawSnippet)) {
        continue;
      }

      if (rawUrl && rawUrl.startsWith('http')) {
        let publishedAt: string | undefined;
        const dtMatch = b.match(/<span class="[^"]*news_dt[^"]*">(.*?)<\/span>/i);
        if (dtMatch) {
          publishedAt = this.unescapeHtml(dtMatch[1].replace(/<[^>]+>/g, '').trim());
        } else {
          const txtDtMatch = rawSnippet.match(/^(\d{4}[年\-/]\d{1,2}[月\-/]\d{1,2}|\d+\s*(?:小时|天|周|个月)前)/);
          if (txtDtMatch) {
            publishedAt = txtDtMatch[1].trim();
          }
        }

        results.push({
          title: this.unescapeHtml(rawTitle) || rawUrl,
          url: rawUrl,
          snippet: this.unescapeHtml(rawSnippet),
          score: Number((1 - results.length * 0.05).toFixed(2)),
          ...(publishedAt ? { publishedAt } : {}),
        });
      }
    }

    return results;
  }

  private unescapeHtml(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&ensp;/g, ' ')
      .replace(/&#0183;/g, '·')
      .replace(/&middot;/g, '·')
      .trim();
  }
}
