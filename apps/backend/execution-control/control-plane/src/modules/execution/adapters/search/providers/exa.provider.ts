import axios from 'axios';
import {
  isAxiosErrorLike,
  SearchEngineProvider,
  SearchEngineResponse,
  SearchRequestOptions,
  SearchResultItem,
} from '../search-engine.types';
import { KeyRotator } from '../key-rotator';

const EXA_SEARCH_ENDPOINT = 'https://api.exa.ai/search';
const DEFAULT_TIMEOUT_MS = 18_000;

type ExaApiResult = {
  title?: unknown;
  url?: unknown;
  text?: unknown;
  score?: unknown;
  publishedDate?: unknown;
  highlights?: unknown[];
};

export class ExaProvider implements SearchEngineProvider {
  public readonly name = 'exa';
  private readonly rotator = new KeyRotator('exa');

  private resolveKeys(runtimeConfigs?: Record<string, string>): string[] {
    const fromEnv = process.env.EXA_API_KEY;
    const fromRuntime = runtimeConfigs?.EXA_API_KEY;
    const raw = fromEnv || fromRuntime || '';
    this.rotator.setRawKeys(raw);
    return this.rotator.getAllKeys();
  }

  public isConfigured(runtimeConfigs?: Record<string, string>): boolean {
    return this.resolveKeys(runtimeConfigs).length > 0;
  }

  public async search(
    options: SearchRequestOptions,
    runtimeConfigs?: Record<string, string>
  ): Promise<SearchEngineResponse> {
    this.resolveKeys(runtimeConfigs);
    const keys = this.rotator.getAllKeys();
    if (keys.length === 0) {
      throw new Error('Exa API Key 未配置');
    }

    const maxResults = Math.min(10, Math.max(1, Math.trunc(options.maxResults || 5)));
    const timeout = Math.min(30_000, Math.max(1_000, options.timeoutMs || DEFAULT_TIMEOUT_MS));

    let lastError: unknown;
    const attempts = keys.length;

    for (let i = 0; i < attempts; i++) {
      const apiKey = this.rotator.getAvailableKey();
      if (!apiKey) break;

      try {
        const response = await axios.post(
          EXA_SEARCH_ENDPOINT,
          {
            query: options.query,
            numResults: maxResults,
            useAutoprompt: true,
            contents: { text: { maxCharacters: 1000 } },
            ...(options.includeDomains && options.includeDomains.length > 0
              ? { includeDomains: options.includeDomains }
              : {}),
            ...(options.excludeDomains && options.excludeDomains.length > 0
              ? { excludeDomains: options.excludeDomains }
              : {}),
          },
          {
            timeout,
            headers: {
              'x-api-key': apiKey,
              'Content-Type': 'application/json',
            },
          }
        );

        this.rotator.markSuccess(apiKey);
        const payload = response.data as { results?: ExaApiResult[] };
        const rawResults = Array.isArray(payload.results) ? payload.results : [];
        const results: SearchResultItem[] = rawResults
          .filter((item) => typeof item?.url === 'string' && item.url.length > 0)
          .slice(0, maxResults)
          .map((item) => ({
            title: typeof item.title === 'string' ? item.title : String(item.url),
            url: String(item.url),
            snippet:
              typeof item.text === 'string'
                ? item.text.slice(0, 300)
                : Array.isArray(item.highlights) && typeof item.highlights[0] === 'string'
                  ? item.highlights[0]
                  : '',
            score: typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : 0,
            ...(typeof item.publishedDate === 'string' ? { publishedAt: item.publishedDate } : {}),
          }));

        const warnings: string[] = [];
        if (results.length === 0) {
          warnings.push('Exa 未返回匹配结果');
        }

        return {
          provider: 'exa',
          results,
          resultCount: results.length,
          warnings,
        };
      } catch (error) {
        lastError = error;
        const status = isAxiosErrorLike(error) ? error.response?.status : undefined;
        if (status === 401) {
          this.rotator.markFailure(apiKey, 'invalid');
        } else if (status === 429) {
          this.rotator.markFailure(apiKey, 'rate_limited');
        } else {
          break;
        }
      }
    }

    if (isAxiosErrorLike(lastError)) {
      const status = lastError.response?.status;
      if (status === 401) {
        throw new Error('Exa API Key 鉴权失败 (401)');
      }
      if (status === 429) {
        throw new Error('Exa 触发限流或额度用尽 (429)');
      }
      if (lastError.code === 'ECONNABORTED') {
        throw new Error('Exa 检索请求超时');
      }
      if (status) {
        throw new Error(`Exa 搜索服务返回错误 (${status})`);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Exa 检索失败');
  }
}
