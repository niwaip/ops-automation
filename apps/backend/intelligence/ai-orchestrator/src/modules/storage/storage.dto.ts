export type StorageProtocol = 'local' | 'minio' | 's3' | 'oss';

export interface StorageConfigDTO {
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

export interface UpdateStorageConfigDTO {
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

export interface TestStorageConnectionDTO {
  success: boolean;
  message: string;
  protocol: StorageProtocol;
  latencyMs?: number;
  details?: Record<string, unknown>;
}
