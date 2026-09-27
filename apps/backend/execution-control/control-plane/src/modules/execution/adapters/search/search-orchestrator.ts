import { Logger } from '@nestjs/common';
import axios from 'axios';
import { getAuthServiceUrl } from '../../../../config/service-endpoints';
import {
  SearchEngineProvider,
  SearchEngineResponse,
  SearchRequestOptions,
} from './search-engine.types';
import { TavilyProvider } from './providers/tavily.provider';
import { FirecrawlProvider } from './providers/firecrawl.provider';
import { ExaProvider } from './providers/exa.provider';
import { DuckDuckGoProvider } from './providers/duckduckgo.provider';

export class SearchOrchestrator {
  private readonly logger = new Logger(SearchOrchestrator.name);
  private readonly providers: Map<string, SearchEngineProvider> = new Map();
  private cachedRuntimeConfigs: { values: Record<string, string>; expiresAt: number } | null = null;

  constructor() {
    this.registerProvider(new TavilyProvider());
    this.registerProvider(new FirecrawlProvider());
    this.registerProvider(new ExaProvider());
    this.registerProvider(new DuckDuckGoProvider());
  }

  public registerProvider(provider: SearchEngineProvider): void {
    this.providers.set(provider.name, provider);
  }

  public async fetchRuntimeConfigs(): Promise<Record<string, string>> {
    if (this.cachedRuntimeConfigs && this.cachedRuntimeConfigs.expiresAt > Date.now()) {
      return this.cachedRuntimeConfigs.values;
    }

    const internalSecret =
      process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;
    if (!internalSecret) {
      return {};
    }

    try {
      const response = await axios.get<{ values?: Record<string, string> }>(
        `${getAuthServiceUrl()}/internal/builtin-skills/platform.search.web/runtime-config`,
        { timeout: 3_000, headers: { 'x-internal-secret': internalSecret } }
      );
      const values = response.data?.values || {};
      this.cachedRuntimeConfigs = {
        values,
        expiresAt: Date.now() + 60_000,
      };
      return values;
    } catch {
      return {};
    }
  }

  public resolveProviderChain(runtimeConfigs: Record<string, string>): SearchEngineProvider[] {
    const defaultOrder = ['tavily', 'firecrawl', 'exa', 'duckduckgo'];
    const customOrderStr =
      process.env.SEARCH_PROVIDER_ORDER ||
      runtimeConfigs.SEARCH_PROVIDER_ORDER ||
      runtimeConfigs.SEARCH_PROVIDERS;

    const targetOrder = customOrderStr
      ? customOrderStr
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : defaultOrder;

    const chain: SearchEngineProvider[] = [];
    for (const name of targetOrder) {
      const provider = this.providers.get(name);
      if (provider && provider.isConfigured(runtimeConfigs)) {
        chain.push(provider);
      }
    }

    return chain;
  }

  public async search(options: SearchRequestOptions): Promise<SearchEngineResponse> {
    const runtimeConfigs = await this.fetchRuntimeConfigs();
    const chain = this.resolveProviderChain(runtimeConfigs);

    if (chain.length === 0) {
      throw new Error(
        '联网搜索尚未配置可用服务商，请在内置 Skill 管理页设置 TAVILY_API_KEY、FIRECRAWL_API_KEY 或 EXA_API_KEY'
      );
    }

    const accumulatedWarnings: string[] = [];
    const providerErrors: Array<{ provider: string; message: string }> = [];

    for (let i = 0; i < chain.length; i++) {
      const provider = chain[i];
      try {
        const response = await provider.search(options, runtimeConfigs);
        if (response.resultCount === 0) {
          const nextProvider = chain[i + 1];
          if (nextProvider) {
            accumulatedWarnings.push(
              `搜索通道 '${provider.name}' 未返回结果，已继续尝试 '${nextProvider.name}'`
            );
            continue;
          }
        }
        if (accumulatedWarnings.length > 0) {
          response.warnings = [...accumulatedWarnings, ...(response.warnings || [])];
        }
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Search provider '${provider.name}' failed: ${message}`);
        providerErrors.push({ provider: provider.name, message });

        const nextProvider = chain[i + 1];
        if (nextProvider) {
          accumulatedWarnings.push(
            `搜索通道 '${provider.name}' 异常 (${message})，已自动故障转移至 '${nextProvider.name}'`
          );
        }
      }
    }

    const detailedSummary = providerErrors.map((e) => `[${e.provider}] ${e.message}`).join('; ');
    throw new Error(`所有联网搜索通道均失败: ${detailedSummary}`);
  }

  /** Execute a bounded query portfolio and fuse structured evidence across providers. */
  public async searchMany(
    queries: string[],
    options: Omit<SearchRequestOptions, 'query'>
  ): Promise<SearchEngineResponse> {
    const uniqueQueries = [...new Set(queries.map((query) => query.trim()).filter(Boolean))].slice(0, 3);
    if (uniqueQueries.length === 0) throw new Error('联网搜索查询不能为空');

    const settled = await Promise.allSettled(
      uniqueQueries.map((query) => this.search({ ...options, query }))
    );
    const successful = settled
      .filter((item): item is PromiseFulfilledResult<SearchEngineResponse> => item.status === 'fulfilled')
      .map((item) => item.value);
    if (successful.length === 0) {
      const errors = settled
        .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
        .map((item) => (item.reason instanceof Error ? item.reason.message : String(item.reason)));
      throw new Error(`所有联网搜索查询均失败: ${errors.join('; ')}`);
    }

    const byUrl = new Map<string, SearchEngineResponse['results'][number]>();
    for (const response of successful) {
      for (const result of response.results) {
        const key = result.url.replace(/\/$/, '').toLowerCase();
        const existing = byUrl.get(key);
        if (!existing || result.score > existing.score) byUrl.set(key, result);
      }
    }
    const officialPattern = /(^|\.)(github\.com|gitlab\.com)$|(^|\.)(docs?|developer|developers)\./i;
    const results = [...byUrl.values()]
      .sort((left, right) => {
        if (options.sourcePolicy === 'official-first') {
          const leftOfficial = officialPattern.test(new URL(left.url).hostname) ? 1 : 0;
          const rightOfficial = officialPattern.test(new URL(right.url).hostname) ? 1 : 0;
          if (leftOfficial !== rightOfficial) return rightOfficial - leftOfficial;
        }
        return right.score - left.score;
      })
      .slice(0, Math.min(10, Math.max(1, options.maxResults || 5)));
    const providers = [...new Set(successful.map((item) => item.provider))];
    const warnings = successful.flatMap((item) => item.warnings || []);
    const failedCount = settled.length - successful.length;
    if (failedCount > 0) warnings.push(`${failedCount} 个扩展查询失败，已使用其余结果完成聚合`);

    return {
      provider: providers.length === 1 ? providers[0] : 'multi-provider',
      providers,
      results,
      resultCount: results.length,
      warnings,
    };
  }
}

export const defaultSearchOrchestrator = new SearchOrchestrator();
