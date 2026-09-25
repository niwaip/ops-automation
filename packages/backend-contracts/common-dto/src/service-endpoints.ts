export const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const stripWrappingQuotes = (value: string): string => {
  let normalized = value.trim();
  while (
    normalized.length >= 2 &&
    ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")) ||
      (normalized.startsWith('`') && normalized.endsWith('`')))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
};

export const sanitizeHost = (value?: string): string | undefined => {
  if (!value) return undefined;
  const stripped = stripWrappingQuotes(value)
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .trim();
  return stripped && stripped !== '0.0.0.0' ? stripped : undefined;
};

export const isContainerRuntime = (): boolean =>
  process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production';

export const readConfiguredUrl = (...candidates: Array<string | undefined>): string | undefined => {
  const configured = candidates.find((value) => typeof value === 'string' && value.trim());
  if (!configured) {
    return undefined;
  }
  const normalized = trimTrailingSlash(stripWrappingQuotes(configured));
  return normalized || undefined;
};

export const getPublicHost = (): string =>
  sanitizeHost(process.env.HOST_IP) ||
  sanitizeHost(process.env.EXTERNAL_HOST) ||
  'localhost';

export const getStandardServiceUrl = (
  envUrlVar: string,
  containerHost: string,
  port: number,
  fallbackEnvVars: string[] = []
): string => {
  const allEnvVars = [envUrlVar, ...fallbackEnvVars];
  const configured = readConfiguredUrl(...allEnvVars.map((v) => process.env[v]));
  if (configured) {
    return configured;
  }
  return isContainerRuntime()
    ? `http://${containerHost}:${port}`
    : `http://localhost:${port}`;
};
