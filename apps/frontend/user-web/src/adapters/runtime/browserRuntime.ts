import {
  normalizeRuntimeConfig,
  type RuntimeEnvSource,
  type RuntimeConfigPort,
} from '@ops/user-core';

export const browserRuntimeConfig: RuntimeConfigPort = normalizeRuntimeConfig(
  import.meta.env as RuntimeEnvSource
);
