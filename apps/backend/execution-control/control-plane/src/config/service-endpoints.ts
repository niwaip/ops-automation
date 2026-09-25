const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const stripWrappingQuotes = (value: string): string => {
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

export const getPublicHost = (): string => {
  const configured = (process.env.HOST_IP?.trim() || process.env.EXTERNAL_HOST?.trim())
    ?.replace(/^https?:\/\//, '')
    ?.replace(/\/+$/, '');
  if (configured && configured !== '0.0.0.0') {
    return configured;
  }
  return 'localhost';
};

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

export const getCarboneServiceUrl = (): string => {
  const configured = readConfiguredUrl(process.env.CARBONE_SERVICE_URL);
  if (configured) {
    return configured;
  }

  return isContainerRuntime() ? 'http://carbone-engine:3009' : 'http://localhost:3009';
};

export const getInternalServiceHeaders = (serviceName = 'control-plane'): Record<string, string> => {
  const internalSecret =
    process.env.INTERNAL_API_SHARED_SECRET ||
    process.env.INTERNAL_API_SECRET ||
    process.env.JWT_SECRET;
  return {
    'X-Internal-Service': serviceName,
    ...(internalSecret ? { 'X-Internal-Auth': internalSecret } : {}),
  };
};
