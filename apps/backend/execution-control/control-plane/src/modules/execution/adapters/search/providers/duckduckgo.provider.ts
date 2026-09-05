import axios from 'axios';
import {
  isAxiosErrorLike,
  SearchEngineProvider,
  SearchEngineResponse,
  SearchRequestOptions,
  SearchResultItem,
} from '../search-engine.types';

const DUCKDUCKGO_HTML_ENDPOINT = 'https://html.duckduckgo.com/html/';
const DEFAULT_TIMEOUT_MS = 15_000;

export class DuckDuckGoProvider implements SearchEngineProvider {
  public readonly name = 'duckduckgo';

  public isConfigured(runtimeConfigs?: Record<string, string>): boolean {
    const configuredValue =
      process.env.DUCKDUCKGO_ENABLED ?? runtimeConfigs?.DUCKDUCKGO_ENABLED;
    if (configuredValue?.trim().toLowerCase() === 'false') return false;
    return true;
  }

  public async search(options: SearchRequestOptions): Promise<SearchEngineResponse> {
    const maxResults = Math.min(10, Math.max(1, Math.trunc(options.maxResults || 5)));
    const timeout = Math.min(30_000, Math.max(1_000, options.timeoutMs || DEFAULT_TIMEOUT_MS));

    try {
      const response = await axios.post(
        DUCKDUCKGO_HTML_ENDPOINT,
        new URLSearchParams({ q: options.query, b: '' }).toString(),
        {
          timeout,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        }
      );

      const html = typeof response.data === 'string' ? response.data : '';
      const results = this.parseHtmlResults(html, maxResults);

      const warnings: string[] = ['使用 DuckDuckGo 免凭据公开通道检索'];
      if (results.length === 0) {
        warnings.push('DuckDuckGo 未返回匹配结果');
      }

      return {
        provider: 'duckduckgo',
        results,
        resultCount: results.length,
        warnings,
      };
    } catch (error) {
      if (isAxiosErrorLike(error)) {
        if (error.code === 'ECONNABORTED') {
          throw new Error('DuckDuckGo 检索请求超时');
        }
        if (error.response?.status) {
          throw new Error(`DuckDuckGo 返回错误 (${error.response.status})`);
        }
      }
      throw error instanceof Error ? error : new Error('DuckDuckGo 检索失败');
    }
  }

  private parseHtmlResults(html: string, maxResults: number): SearchResultItem[] {
    const results: SearchResultItem[] = [];
    const resultBlocks = html.split('<div class="result results_links');

    for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
      const block = resultBlocks[i];

      const titleMatch = block.match(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/s);
      const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/s);

      if (titleMatch) {
        let rawUrl = titleMatch[1];
        const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/);
        if (uddgMatch) {
          try {
            rawUrl = decodeURIComponent(uddgMatch[1]);
          } catch {
            // keep rawUrl
          }
        }

        const rawTitle = titleMatch[2].replace(/<[^>]+>/g, '').trim();
        const rawSnippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        if (rawUrl && rawUrl.startsWith('http')) {
          results.push({
            title: this.unescapeHtml(rawTitle) || rawUrl,
            url: rawUrl,
            snippet: this.unescapeHtml(rawSnippet),
            score: Number((1 - results.length * 0.05).toFixed(2)),
          });
        }
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
      .replace(/&nbsp;/g, ' ');
  }
}
