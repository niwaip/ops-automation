import { useQuery } from 'react-query';
import { llmOperationApi } from '../api/llmOperationApi';
import type { LlmOperationCatalogEntry } from '../types';

export interface UseLlmOperationsResult {
  entries: LlmOperationCatalogEntry[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useLlmOperations(): UseLlmOperationsResult {
  const { data, isLoading, error, refetch } = useQuery(
    ['llm-operations-catalog'],
    llmOperationApi.fetchCatalog,
    {
      staleTime: 30000,
      refetchOnWindowFocus: false,
    }
  );

  return {
    entries: data || [],
    loading: isLoading,
    error: error instanceof Error ? error : null,
    refresh: () => refetch(),
  };
}