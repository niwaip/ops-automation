import axios from 'axios';
import {
  isAxiosErrorLike,
  SearchEngineProvider,
  SearchEngineResponse,
  SearchRequestOptions,
  SearchResultItem,
} from '../search-engine.types';
import { KeyRotator } from '../key-rotator';

const TAVILY_SEARCH_ENDPOINT = 'https://api.tavily.com/search';
const DEFAULT_TIMEOUT_MS = 18_000;

type TavilyApiResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  score?: unknown;
  published_date?: unknown;
};

export class TavilyProvider implements SearchEngineProvider {
  public readonly name = 'tavily';
  private readonly rotator = new KeyRotator('tavily');

  private resolveKeys(runtimeConfigs?: Record<string, string>): string[] {
    const fromEnv = process.env.TAVILY_API_KEY || process.env.SEARCH_API_KEY;
    const fromRuntime = runtimeConfigs?.TAVILY_API_KEY || runtimeConfigs?.SEARCH_API_KEY;
    const raw = fromEnv || fromRuntime || '';
    this.rotator.setRawKeys(raw);
    return this.rotator.getAllKeys();
  }

  public isConfigured(runtimeConfigs?: Record<string, string>): boolean {
    const keys = this.resolveKeys(runtimeConfigs);
    return keys.length > 0;
  }

  public async search(
    options: SearchRequestOptions,
    runtimeConfigs?: Record<string, string>
  ): Promise<SearchEngineResponse> {
    this.resolveKeys(runtimeConfigs);
    const keys = this.rotator.getAllKeys();
    if (keys.length === 0) {
      throw new Error('Tavily API Key 未配置');
    }

    const maxResults = Math.min(10, Math.max(1, Math.trunc(options.maxResults || 5)));
    const topic = options.topic === 'news' ? 'news' : 'general';
    const searchDepth = options.searchDepth === 'advanced' ? 'advanced' : 'basic';
    const timeout = Math.min(30_000, Math.max(1_000, options.timeoutMs || DEFAULT_TIMEOUT_MS));

    let lastError: unknown;
    const attempts = keys.length;

    for (let i = 0; i < attempts; i++) {
      const apiKey = this.rotator.getAvailableKey();
      if (!apiKey) break;

      try {
        const response = await axios.post(
          TAVILY_SEARCH_ENDPOINT,
          {
            api_key: apiKey,
            query: options.query,
            topic,
            search_depth: searchDepth,
            max_results: maxResults,
            include_answer: true,
            include_raw_content: false,
            safe_search: true,
            ...(options.days ? { days: options.days } : {}),
            ...(options.includeDomains && options.includeDomains.length > 0
              ? { include_domains: options.includeDomains }
              : {}),
            ...(options.excludeDomains && options.excludeDomains.length > 0
              ? { exclude_domains: options.excludeDomains }
              : {}),
          },
          {
            timeout,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        this.rotator.markSuccess(apiKey);
        const payload = response.data as { answer?: unknown; results?: TavilyApiResult[] };
        const warnings: string[] = [];
        const rawResults = Array.isArray(payload.results) ? payload.results : [];
        const results: SearchResultItem[] = rawResults
          .filter((item) => typeof item?.url === 'string' && item.url.length > 0)
          .slice(0, maxResults)
          .map((item) => ({
            title: typeof item.title === 'string' ? item.title : String(item.url),
            url: String(item.url),
            snippet: typeof item.content === 'string' ? item.content : '',
            score: typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : 0,
            ...(typeof item.published_date === 'string' ? { publishedAt: item.published_date } : {}),
          }));

        if (results.length === 0) {
          warnings.push('Tavily 搜索服务未返回匹配结果');
        }

        return {
          provider: 'tavily',
          results,
          resultCount: results.length,
          ...(typeof payload.answer === 'string' ? { answer: payload.answer } : {}),
          warnings,
        };
      } catch (error: any) {
        lastError = error;
        const status = isAxiosErrorLike(error) ? error.response?.status : undefined;
        console.log(`[TavilyProvider DEBUG] key=${apiKey?.slice(0, 8)} status=${status} data=${JSON.stringify(error?.response?.data)} msg=${error?.message}`);
        if (status === 401) {
          this.rotator.markFailure(apiKey, 'invalid');
        } else if (status === 429) {
          this.rotator.markFailure(apiKey, 'rate_limited');
        } else if (status === 403) {
          this.rotator.markFailure(apiKey, 'forbidden');
        } else if (status === 432 || status === 433) {
          this.rotator.markFailure(apiKey, 'quota_exhausted');
        } else {
          // Other network / 5xx errors: do not loop all keys indefinitely
          break;
        }
      }
    }

    if (isAxiosErrorLike(lastError)) {
      const status = lastError.response?.status;
      if (status === 401) {
        throw new Error('Tavily API Key 无效或已被吊销，请检查配置');
      }
      if (status === 403) {
        throw new Error(
          'Tavily 已接收凭据但拒绝 Search 请求；请检查 Tavily 账户权限、项目限制或当前服务器出口 IP/区域策略'
        );
      }
      if (status === 429 || status === 432 || status === 433) {
        throw new Error('Tavily 额度已用完或触发调用频率限制');
      }
      if (lastError.code === 'ECONNABORTED') {
        throw new Error('Tavily 联网搜索请求超时');
      }
      if (status) {
        throw new Error(`Tavily 搜索服务返回错误 (${status})`);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Tavily 联网搜索失败');
  }
}
