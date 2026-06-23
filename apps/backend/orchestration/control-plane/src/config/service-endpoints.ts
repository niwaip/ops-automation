const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const isContainerRuntime = (): boolean =>
  process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production';

const readConfiguredUrl = (...candidates: Array<string | undefined>): string | undefined => {
  const configured = candidates.find((value) => typeof value === 'string' && value.trim());
  return configured ? trimTrailingSlash(configured.trim()) : undefined;
};

export const getPublicHost = (): string =>
  process.env.HOST_IP?.trim() || process.env.EXTERNAL_HOST?.trim() || 'localhost';

export const getAuthServiceUrl = (): string => {
  const configured = readConfiguredUrl(
    process.env.AUTH_SERVICE_URL,
    process.env.PLATFORM_SERVICE_URL
  );
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'http://platform:3001' : 'http://localhost:3001';
};

export const getBrowserWorkerUrl = (): string => {
  const configured = readConfiguredUrl(
    process.env.BROWSER_WORKER_URL,
    process.env.WORKER_SERVICE_URL
  );
  if (configured) {
    return configured;
  }

  return 'http://ops-browser-worker:3004';
};

export const getSessionBrokerUrl = (): string => {
  const configured = readConfiguredUrl(
    process.env.SESSION_BROKER_URL,
    process.env.SESSION_SERVICE_URL
  );
  if (configured) {
    return configured;
  }

  return 'http://session-broker:3002';
};

export const getAiOrchestratorUrl = (): string => {
  const configured = readConfiguredUrl(process.env.AI_ORCHESTRATOR_URL, process.env.AI_SERVICE_URL);
  if (configured) {
    return configured;
  }

  return 'http://ai-orchestrator:3007';
};

export const getBrowserTemplateServiceUrl = (): string => {
  const configured = readConfiguredUrl(process.env.BROWSER_TEMPLATE_SERVICE_URL);
  if (configured) {
    return configured;
  }

  return 'http://browser-template:3005';
};

export const getReportServiceUrl = (): string => {
  const configured = readConfiguredUrl(process.env.REPORT_SERVICE_URL);
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'http://ops-report:3008' : 'http://localhost:3008';
};
