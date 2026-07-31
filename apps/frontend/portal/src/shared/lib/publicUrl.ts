import { replaceLocalhostWithHost } from '@ops/user-core';
import { runtimeConfig } from '@/shared/config/runtime';

export const replaceLocalhostWithCurrentHost = (url?: string): string | undefined => {
  if (!url) return undefined;
  const target = url.trim();
  const host =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : runtimeConfig.hostIp || 'localhost';

  if (target.startsWith('/') && /^\/([a-zA-Z0-9_-]+\/)*(renders)\//i.test(target)) {
    const cleanPath = target.replace(/^(\/public)?(\/api)?\/renders\//i, '/renders/');
    return `http://${host}:3009${cleanPath}`;
  }

  return replaceLocalhostWithHost(
    target,
    typeof window !== 'undefined' ? window.location.hostname : undefined,
    runtimeConfig.hostIp
  );
};
