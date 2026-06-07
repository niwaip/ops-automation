import type { StoragePort } from "@ops/user-core";

const storage = new Map<string, string>();

export const memoryStorage: StoragePort = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => {
    storage.set(key, value);
  },
  removeItem: (key) => {
    storage.delete(key);
  },
};
