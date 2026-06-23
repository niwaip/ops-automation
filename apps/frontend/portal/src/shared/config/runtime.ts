import {
  buildOfficeAddinUrl as buildOfficeAddinUrlFromCore,
  normalizeRuntimeConfig,
} from '@ops/user-core';

const ensureLeadingSlash = (value: string): string => (value.startsWith('/') ? value : `/${value}`);

export const runtimeConfig = normalizeRuntimeConfig(
  import.meta.env as Record<string, string | undefined>
);

export const buildOfficeAddinUrl = (path: string): string =>
  runtimeConfig.officeAddinBaseUrl
    ? buildOfficeAddinUrlFromCore(runtimeConfig, path)
    : ensureLeadingSlash(path);

export const buildUserWebUrl = (path = '/'): string =>
  runtimeConfig.userWebBaseUrl
    ? `${runtimeConfig.userWebBaseUrl}${ensureLeadingSlash(path)}`
    : ensureLeadingSlash(path);
