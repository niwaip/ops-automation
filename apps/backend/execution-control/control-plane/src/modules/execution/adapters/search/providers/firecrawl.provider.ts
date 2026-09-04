import axios from 'axios';
import {
  isAxiosErrorLike,
  SearchEngineProvider,
  SearchEngineResponse,
  SearchRequestOptions,
  SearchResultItem,
} from '../search-engine.types';
import { KeyRotator } from '../key-rotator';

const FIRECRAWL_SEARCH_ENDPOINT = 'https://api.firecrawl.dev/v1/search';
const DEFAULT_TIMEOUT_MS = 20_000;

type FirecrawlItem = {
  title?: unknown;
  url?: unknown;
  description?: unknown;
  markdown?: unknown;
  metadata?: {
    title?: unknown;
    description?: unknown;
    sourceURL?: unknown;
    statusCode?: unknown;
  };
};

export class FirecrawlProvider implements SearchEngineProvider {
  public readonly name = 'firecrawl';
  private readonly rotator = new KeyRotator('firecrawl');

  private resolveKeys(runtimeConfigs?: Record<string, string>): string[] {
    const fromEnv = process.env.FIRECRAWL_API_KEY;
    const fromRuntime = runtimeConfigs?.FIRECRAWL_API_KEY;
    const raw = fromEnv || fromRuntime || '';
    this.rotator.setRawKeys(raw);
    return this.rotator.getAllKeys();
  }

  public isConfigured(runtimeConfigs?: Record<string, string>): boolean {
    const hasKey = this.resolveKeys(runtimeConfigs).length > 0;
    const explicitInOrder =
      process.env.SEARCH_PROVIDER_ORDER?.includes('firecrawl') ||
      runtimeConfigs?.SEARCH_PROVIDER_ORDER?.includes('firecrawl');
    const allowKeyless =
      process.env.FIRECRAWL_KEYLESS_ENABLED === 'true' ||
      runtimeConfigs?.FIRECRAWL_KEYLESS_ENABLED === 'true' ||
      Boolean(explicitInOrder);
    return hasKey || allowKeyless;
  }

  public async search(
    options: SearchRequestOptions,
    runtimeConfigs?: Record<string, string>
  ): Promise<SearchEngineResponse> {
    const keys = this.resolveKeys(runtimeConfigs);
    const allowKeyless =
      process.env.FIRECRAWL_KEYLESS_ENABLED === 'true' ||
      runtimeConfigs?.FIRECRAWL_KEYLESS_ENABLED === 'true' ||
      Boolean(
        process.env.SEARCH_PROVIDER_ORDER?.includes('firecrawl') ||
          runtimeConfigs?.SEARCH_PROVIDER_ORDER?.includes('firecrawl')
      );

    if (keys.length === 0 && !allowKeyless) {
      throw new Error('Firecrawl API Key 未配置且未启用免 Key 模式');
    }

    const maxResults = Math.min(10, Math.max(1, Math.trunc(options.maxResults || 5)));
    const timeout = Math.min(30_000, Math.max(1_000, options.timeoutMs || DEFAULT_TIMEOUT_MS));

    const requestPayload = {
      query: options.query,
      limit: maxResults,
      lang: 'zh',
    };

    let lastError: unknown;
    const attempts = keys.length > 0 ? keys.length : 1;

    for (let i = 0; i < attempts; i++) {
      const apiKey = keys.length > 0 ? this.rotator.getAvailableKey() : undefined;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      try {
        const response = await axios.post(FIRECRAWL_SEARCH_ENDPOINT, requestPayload, {
          timeout,
          headers,
        });

        if (apiKey) {
          this.rotator.markSuccess(apiKey);
        }

        const data = response.data as {
          success?: boolean;
          data?: FirecrawlItem[];
          results?: FirecrawlItem[];
        };

        const rawList = Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.results)
            ? data.results
            : [];

        const results: SearchResultItem[] = rawList
          .map((item, idx) => {
            const url =
              typeof item.url === 'string'
                ? item.url
                : typeof item.metadata?.sourceURL === 'string'
                  ? item.metadata.sourceURL
                  : '';
            const title =
              typeof item.title === 'string'
                ? item.title
                : typeof item.metadata?.title === 'string'
                  ? item.metadata.title
                  : url;
            const snippet =
              typeof item.description === 'string'
                ? item.description
                : typeof item.metadata?.description === 'string'
                  ? item.metadata.description
                  : typeof item.markdown === 'string'
                    ? item.markdown.slice(0, 300)
                    : '';

            return {
              title: title || url,
              url,
              snippet: snippet.trim(),
              score: Number((1 - idx * 0.05).toFixed(2)),
            };
          })
          .filter((item) => item.url.length > 0)
          .slice(0, maxResults);

        const warnings: string[] = [];
        if (!apiKey) {
          warnings.push('使用 Firecrawl 免 Key 公开通道检索');
        }
        if (results.length === 0) {
          warnings.push('Firecrawl 未返回匹配结果');
        }

        return {
          provider: 'firecrawl',
          results,
          resultCount: results.length,
          warnings,
        };
      } catch (error) {
        lastError = error;
        const status = isAxiosErrorLike(error) ? error.response?.status : undefined;
        if (apiKey && status === 401) {
          this.rotator.markFailure(apiKey, 'invalid');
        } else if (apiKey && (status === 429 || status === 402)) {
          this.rotator.markFailure(apiKey, 'quota_exhausted');
        } else {
          break;
        }
      }
    }

    if (isAxiosErrorLike(lastError)) {
      const status = lastError.response?.status;
      if (status === 401) {
        throw new Error('Firecrawl API Key 鉴权失败 (401)');
      }
      if (status === 402 || status === 429) {
        throw new Error('Firecrawl 额度耗尽或请求超限 (429/402)');
      }
      if (lastError.code === 'ECONNABORTED') {
        throw new Error('Firecrawl 检索请求超时');
      }
      if (status) {
        throw new Error(`Firecrawl 返回错误 (${status})`);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Firecrawl 检索失败');
  }
}
