import type { BuiltinSkillHandlerResult } from '@ops/backend-builtin-skill-contract';
import type { RuntimeStepInvokeRequest } from './runtime-adapter.interface';
import { defaultSearchOrchestrator } from './search/search-orchestrator';

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
  return items.length > 0 ? items : undefined;
}

export async function executeWebSearch(
  request: RuntimeStepInvokeRequest
): Promise<BuiltinSkillHandlerResult> {
  const input = request.input || {};
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) {
    return {
      success: false,
      errorCode: 'WEB_SEARCH_QUERY_REQUIRED',
      errorMessage: 'query 是必填字段',
    };
  }

  const maxResults = boundedInteger(input.maxResults, 5, 1, 10);
  const topic = input.topic === 'news' ? 'news' : 'general';
  const searchDepth = input.searchDepth === 'advanced' ? 'advanced' : 'basic';
  const days = input.days == null ? undefined : boundedInteger(input.days, 7, 1, 30);
  const timeoutMs = boundedInteger(
    process.env.WEB_SEARCH_TIMEOUT_MS,
    18_000,
    1_000,
    30_000
  );

  try {
    const searchResponse = await defaultSearchOrchestrator.search({
      query,
      maxResults,
      topic,
      searchDepth,
      days,
      includeDomains: stringList(input.includeDomains),
      excludeDomains: stringList(input.excludeDomains),
      timeoutMs,
    });

    return {
      success: true,
      output: {
        query,
        provider: searchResponse.provider,
        ...(searchResponse.answer ? { answer: searchResponse.answer } : {}),
        results: searchResponse.results,
        resultCount: searchResponse.resultCount,
        searchedAt: new Date().toISOString(),
        warnings: searchResponse.warnings || [],
      },
    };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    if (rawMessage.includes('尚未配置可用服务商') || rawMessage.includes('未配置')) {
      return {
        success: false,
        errorCode: 'WEB_SEARCH_NOT_CONFIGURED',
        errorMessage: rawMessage,
      };
    }

    return {
      success: false,
      errorCode: 'WEB_SEARCH_PROVIDER_ERROR',
      errorMessage: rawMessage,
    };
  }
}
