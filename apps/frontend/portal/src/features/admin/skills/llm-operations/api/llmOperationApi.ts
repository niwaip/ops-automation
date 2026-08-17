import { apiClient } from '@/shared/api/http/client';
import type {
  LlmOperationCatalogEntry,
  LlmOperationCatalogResponse,
  LlmOperationDetail,
  LlmOperationVersionRecord,
  SaveLlmOperationDraftInput,
  LlmOperationValidationSubmission,
} from '../types';

const actorHeaders = (actor: string) => ({ headers: { 'x-actor': actor } });

export const llmOperationApi = {
  fetchCatalog: async (): Promise<LlmOperationCatalogEntry[]> => {
    try {
      const response = await apiClient.get<LlmOperationCatalogResponse>(
        '/ai/internal/operations/catalog'
      );
      return response.operations || [];
    } catch (error) {
      console.warn('Failed to fetch LLM Operation catalog:', error);
      return [];
    }
  },

  fetchDetail: (operationKey: string): Promise<LlmOperationDetail> =>
    apiClient.get(`/ai/admin/operations/${encodeURIComponent(operationKey)}`),

  createDraft: (
    operationKey: string,
    input: SaveLlmOperationDraftInput,
    actor: string
  ): Promise<LlmOperationVersionRecord> =>
    apiClient.post(
      `/ai/admin/operations/${encodeURIComponent(operationKey)}/versions`,
      input,
      actorHeaders(actor)
    ),

  updateDraft: (
    operationKey: string,
    current: LlmOperationVersionRecord,
    input: Omit<SaveLlmOperationDraftInput, 'version'>,
    actor: string
  ): Promise<LlmOperationVersionRecord> =>
    apiClient.put(
      `/ai/admin/operations/${encodeURIComponent(operationKey)}/versions/${encodeURIComponent(current.version)}`,
      { ...input, expectedVersionId: current.id },
      actorHeaders(actor)
    ),

  validate: (
    operationKey: string,
    version: string,
    actor: string
  ): Promise<LlmOperationValidationSubmission> =>
    apiClient.post(
      `/ai/admin/operations/${encodeURIComponent(operationKey)}/versions/${encodeURIComponent(version)}/validate`,
      undefined,
      { ...actorHeaders(actor), timeout: 300000 }
    ),
};
