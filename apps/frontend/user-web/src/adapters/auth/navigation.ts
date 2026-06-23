import { browserRuntimeConfig } from '../runtime/browserRuntime';

const resolveApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseUrl = browserRuntimeConfig.apiBaseUrl.trim().replace(/\/+$/, '');

  if (/^https?:\/\//i.test(baseUrl)) {
    return `${baseUrl}${normalizedPath}`;
  }

  return `${baseUrl || '/api'}${normalizedPath}`;
};

export const redirectToLogin = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
};

export const redirectToSsoLogin = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.location.assign(resolveApiUrl('/auth/sso/login'));
};

export const resolveSsoCallbackUrl = (): string => resolveApiUrl('/auth/sso/callback');
