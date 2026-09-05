export const STORAGE_DRIVER = 'STORAGE_DRIVER';

export interface StorageDriver {
  putFile(storageKey: string, data: Buffer): Promise<void>;
  getFile(storageKey: string): Promise<Buffer>;
  deleteFile(storageKey: string): Promise<void>;
  getAbsolutePath(storageKey: string): string;
  exists(storageKey: string): Promise<boolean>;
}
