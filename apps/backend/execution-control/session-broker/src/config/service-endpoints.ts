const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const isContainerRuntime = (): boolean =>
  process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production';

export const getBrowserWorkerUrl = (
  fallback: string = 'http://ops-browser-worker:3004'
): string => {
  const configured = process.env.BROWSER_WORKER_URL;
  if (configured && configured.trim()) {
    return trimTrailingSlash(configured.trim());
  }

  return fallback;
};

export const getBrowserTemplateServiceUrl = (
  fallback: string = 'http://ops-browser-template:3005'
): string => {
  const configured = process.env.BROWSER_TEMPLATE_SERVICE_URL;
  if (configured && configured.trim()) {
    return trimTrailingSlash(configured.trim());
  }

  return fallback;
};

export const getRedisHost = (): string => {
  const configured = process.env.REDIS_HOST?.trim();
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'redis' : 'localhost';
};

export const getInternalAuthHeaders = (): Record<string, string> => {
  const secret =
    process.env.INTERNAL_API_SHARED_SECRET ||
    process.env.INTERNAL_API_SECRET ||
    'ops_internal_shared_secret_change_me';
  return { 'x-internal-auth': secret };
};

