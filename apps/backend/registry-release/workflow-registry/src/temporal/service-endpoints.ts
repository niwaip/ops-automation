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

const isContainerRuntime = (): boolean => process.env.DOCKER_ENV === 'true';

const readConfiguredUrl = (...candidates: Array<string | undefined>): string | undefined => {
  const configured = candidates.find((value) => typeof value === 'string' && value.trim());
  if (!configured) {
    return undefined;
  }
  const normalized = trimTrailingSlash(stripWrappingQuotes(configured));
  return normalized || undefined;
};

export const getPublicHost = (): string =>
  process.env.HOST_IP?.trim() || process.env.EXTERNAL_HOST?.trim() || 'localhost';

export const getCarboneServiceUrl = (): string => {
  const configured = readConfiguredUrl(process.env.CARBONE_SERVICE_URL);
  if (configured) {
    return configured;
  }
  return isContainerRuntime() ? 'http://carbone-engine:3009' : 'http://localhost:3009';
};

export const getBrowserWorkerUrl = (): string => {
  const configured = readConfiguredUrl(process.env.BROWSER_WORKER_URL);
  if (configured) {
    return configured;
  }
  return isContainerRuntime() ? 'http://ops-browser-worker:3004' : 'http://localhost:3004';
};

export const getCarboneExternalUrl = (): string => {
  const configured = readConfiguredUrl(process.env.CARBONE_EXTERNAL_URL);
  if (configured) {
    return configured;
  }
  return trimTrailingSlash(`http://${getPublicHost()}:3009`);
};

export const getAiOrchestratorUrl = (): string => {
  const configured = readConfiguredUrl(process.env.AI_ORCHESTRATOR_URL, process.env.AI_SERVICE_URL);
  if (configured) {
    return configured;
  }
  return isContainerRuntime() ? 'http://ai-orchestrator:3007' : 'http://localhost:3007';
};

export const getWorkflowValidationAgentUrl = (): string => {
  const configured = readConfiguredUrl(
    process.env.WORKFLOW_VALIDATION_AGENT_URL,
    process.env.ACTIVITY_VALIDATION_AGENT_URL,
    process.env.SANDBOX_WORKER_URL
  );
  if (configured) {
    return configured;
  }
  return isContainerRuntime()
    ? 'http://ops-workflow-validation-agent:8080'
    : 'http://localhost:8080';
};
