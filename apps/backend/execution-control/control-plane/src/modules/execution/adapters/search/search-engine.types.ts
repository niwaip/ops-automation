export type SearchTopic = 'general' | 'news';
export type SearchDepth = 'basic' | 'advanced';

export type SearchRequestOptions = {
  query: string;
  maxResults?: number;
  topic?: SearchTopic;
  searchDepth?: SearchDepth;
  days?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  timeoutMs?: number;
};

export type SearchResultItem = {
  title: string;
  url: string;
  snippet: string;
  score: number;
  publishedAt?: string;
};

export type SearchEngineResponse = {
  provider: string;
  results: SearchResultItem[];
  resultCount: number;
  answer?: string;
  warnings?: string[];
};

export interface SearchEngineProvider {
  readonly name: string;
  isConfigured(runtimeConfigs?: Record<string, string>): boolean;
  search(
    options: SearchRequestOptions,
    runtimeConfigs?: Record<string, string>
  ): Promise<SearchEngineResponse>;
}

export type AxiosErrorLike = {
  isAxiosError?: boolean;
  code?: string;
  response?: { status?: number; data?: unknown };
  message?: string;
};

export function isAxiosErrorLike(error: unknown): error is AxiosErrorLike {
  return typeof error === 'object' && error !== null && ('isAxiosError' in error || 'response' in error || 'code' in error);
}
