import { apiClient } from '@/shared/api/http/client';

export type StorageProtocol = 'local' | 'minio' | 's3' | 'oss';

export interface StorageConfig {
  protocol: StorageProtocol;
  localRoot?: string;
  endpoint?: string;
  bucket?: string;
  region?: string;
  accessKey?: string;
  secretKey?: string;
  useSSL?: boolean;
  publicUrl?: string;
  pathPrefix?: string;
  hasSecret?: boolean;
  updatedAt?: string;
}

export interface UpdateStorageConfigRequest {
  protocol: StorageProtocol;
  localRoot?: string;
  endpoint?: string;
  bucket?: string;
  region?: string;
  accessKey?: string;
  secretKey?: string;
  useSSL?: boolean;
  publicUrl?: string;
  pathPrefix?: string;
}

export interface TestStorageConnectionResult {
  success: boolean;
  message: string;
  protocol: StorageProtocol;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export const storageApi = {
  getConfig: async (): Promise<StorageConfig> => {
    return apiClient.get<StorageConfig>('/ai/storage/config');
  },

  updateConfig: async (data: UpdateStorageConfigRequest): Promise<StorageConfig> => {
    return apiClient.put<StorageConfig>('/ai/storage/config', data);
  },

  testConnection: async (
    data: UpdateStorageConfigRequest
  ): Promise<TestStorageConnectionResult> => {
    return apiClient.post<TestStorageConnectionResult>('/ai/storage/test', data);
  },
};
