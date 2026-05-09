const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const isContainerRuntime = (): boolean =>
  process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production';

export const getBrowserWorkerUrl = (
  fallback: string = 'http://ops-browser-worker:3004',
): string => {
  const configured = process.env.BROWSER_WORKER_URL;
  if (configured && configured.trim()) {
    return trimTrailingSlash(configured.trim());
  }

  return fallback;
};

export const getBrowserTemplateServiceUrl = (
  fallback: string = 'http://ops-browser-template:3005',
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
