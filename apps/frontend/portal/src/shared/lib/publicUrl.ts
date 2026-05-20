import { runtimeConfig } from '@/shared/config/runtime';

const LOCAL_HOST_PATTERN = /(^https?:\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(?=[:/]|$)/i;

export const replaceLocalhostWithCurrentHost = (url?: string): string | undefined => {
  if (!url) {
    return undefined;
  }

  const currentHost = window.location.hostname;
  const fallbackHost = runtimeConfig.hostIp;
  const targetHost = (
    currentHost
    && currentHost !== 'localhost'
    && currentHost !== '127.0.0.1'
    && currentHost !== '0.0.0.0'
  )
    ? currentHost
    : fallbackHost;

  if (!targetHost) {
    return url;
  }

  return url.replace(LOCAL_HOST_PATTERN, `$1${targetHost}`);
};
