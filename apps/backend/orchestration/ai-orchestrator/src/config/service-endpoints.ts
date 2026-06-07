const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const stripWrappingQuotes = (value: string): string => {
  let normalized = value.trim();
  while (
    normalized.length >= 2
    && (
      (normalized.startsWith('"') && normalized.endsWith('"'))
      || (normalized.startsWith('\'') && normalized.endsWith('\''))
      || (normalized.startsWith('`') && normalized.endsWith('`'))
    )
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
};

const isContainerRuntime = (): boolean =>
  process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production';

const readConfiguredUrl = (...candidates: Array<string | undefined>): string | undefined => {
  const configured = candidates.find((value) => typeof value === 'string' && value.trim());
  if (!configured) {
    return undefined;
  }
  const normalized = trimTrailingSlash(stripWrappingQuotes(configured));
  return normalized || undefined;
};

export const getPublicHost = (): string =>
  process.env.HOST_IP?.trim()
  || process.env.EXTERNAL_HOST?.trim()
  || 'localhost';

export const getAuthServiceUrl = (): string => {
  const configured = readConfiguredUrl(process.env.AUTH_SERVICE_URL, process.env.PLATFORM_SERVICE_URL);
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'http://platform:3001' : 'http://localhost:3001';
};

export const getCarboneServiceUrl = (): string => {
  const configured = readConfiguredUrl(process.env.CARBONE_API_URL, process.env.CARBONE_SERVICE_URL);
  if (configured) {
    return configured;
  }

  if (isContainerRuntime()) {
    return 'http://carbone-engine:3009';
  }

  // Fallback to 3009 or 3010 if specifically set in environment
  const port = process.env.CARBONE_PORT || '3009';
  return `http://localhost:${port}`;
};

export const getCarboneExternalUrl = (): string => {
  const configured = readConfiguredUrl(process.env.CARBONE_EXTERNAL_URL);
  if (configured) {
    return configured;
  }

  return trimTrailingSlash(`http://${getPublicHost()}:3009`);
};

export const getBrowserWorkerUrl = (): string => {
  const configured = readConfiguredUrl(process.env.BROWSER_WORKER_URL);
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'http://ops-browser-worker:3004' : 'http://localhost:3004';
};

export const getControlPlaneApiUrl = (): string => {
  const configured = readConfiguredUrl(process.env.CONTROL_PLANE_URL);
  if (configured) {
    return configured.endsWith('/api') ? configured : `${configured}/api`;
  }

  const baseUrl = isContainerRuntime() ? 'http://control-plane:3003' : 'http://localhost:3003';
  return `${baseUrl}/api`;
};

export const getReportServiceUrl = (): string => {
  const configured = readConfiguredUrl(process.env.REPORT_SERVICE_URL);
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'http://ops-report:3008' : 'http://localhost:3008';
};

export const getRedisHost = (): string => {
  const configured = process.env.REDIS_HOST?.trim();
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'redis' : 'localhost';
};
