import { replaceLocalhostWithHost } from '@ops/user-core';
import { runtimeConfig } from '@/shared/config/runtime';

export const replaceLocalhostWithCurrentHost = (url?: string): string | undefined =>
  replaceLocalhostWithHost(
    url,
    typeof window !== 'undefined' ? window.location.hostname : undefined,
    runtimeConfig.hostIp
  );
