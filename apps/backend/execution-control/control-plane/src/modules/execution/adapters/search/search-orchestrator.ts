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
}

export const defaultSearchOrchestrator = new SearchOrchestrator();
