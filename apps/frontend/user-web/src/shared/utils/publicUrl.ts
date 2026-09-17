import { replaceLocalhostWithHost } from '@ops/user-core';
import { runtimeConfig } from '@/shared/config/runtime';

export const replaceLocalhostWithCurrentHost = (url?: string): string | undefined => {
  if (!url) return undefined;
  const target = url.trim();

  // Handle studio download routes (e.g. /studio/download/xxx, http://...:3009/studio/download/xxx)
  // Route through current origin / Vite proxy so it works on any host/IP
  if (/^(?:https?:\/\/[^/]+)?(?:\/api)?\/studio\/(.*)$/i.test(target)) {
    const rest = target.replace(/^(?:https?:\/\/[^/]+)?(?:\/api)?\/studio\//i, '');
    return `/studio/${rest}`;
  }

  // Handle carbone renders routes (e.g. /renders/xxx, http://...:3009/renders/xxx)
  if (/^(?:https?:\/\/[^/]+)?(?:\/api)?\/renders\/(.*)$/i.test(target)) {
    const rest = target.replace(/^(?:https?:\/\/[^/]+)?(?:\/api)?\/renders\//i, '');
    return `/api/renders/${rest}`;
  }

  return replaceLocalhostWithHost(
    target,
    typeof window !== 'undefined' ? window.location.hostname : undefined,
    runtimeConfig.hostIp
  );
};
