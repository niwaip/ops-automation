import {
  getCarboneExternalUrl,
  getCarboneServiceUrl,
  getWorkflowValidationAgentUrl,
} from '../src/config/service-endpoints';

describe('service-endpoints', () => {
  const originalCarboneServiceUrl = process.env.CARBONE_SERVICE_URL;
  const originalCarboneExternalUrl = process.env.CARBONE_EXTERNAL_URL;
  const originalDockerEnv = process.env.DOCKER_ENV;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSandboxWorkerUrl = process.env.SANDBOX_WORKER_URL;
  const originalWorkflowValidationAgentUrl = process.env.WORKFLOW_VALIDATION_AGENT_URL;
  const originalActivityValidationAgentUrl = process.env.ACTIVITY_VALIDATION_AGENT_URL;
  const originalTemporalSandboxAgentUrl = process.env.TEMPORAL_SANDBOX_AGENT_URL;
  const originalSandboxAgentUrl = process.env.SANDBOX_AGENT_URL;

  beforeEach(() => {
    delete process.env.CARBONE_SERVICE_URL;
    delete process.env.CARBONE_EXTERNAL_URL;
    delete process.env.DOCKER_ENV;
    delete process.env.NODE_ENV;
    delete process.env.SANDBOX_WORKER_URL;
    delete process.env.WORKFLOW_VALIDATION_AGENT_URL;
    delete process.env.ACTIVITY_VALIDATION_AGENT_URL;
    delete process.env.TEMPORAL_SANDBOX_AGENT_URL;
    delete process.env.SANDBOX_AGENT_URL;
  });

  afterAll(() => {
    if (typeof originalCarboneServiceUrl === 'string') {
      process.env.CARBONE_SERVICE_URL = originalCarboneServiceUrl;
    } else {
      delete process.env.CARBONE_SERVICE_URL;
    }

    if (typeof originalCarboneExternalUrl === 'string') {
      process.env.CARBONE_EXTERNAL_URL = originalCarboneExternalUrl;
    } else {
      delete process.env.CARBONE_EXTERNAL_URL;
    }

    if (typeof originalDockerEnv === 'string') {
      process.env.DOCKER_ENV = originalDockerEnv;
    } else {
      delete process.env.DOCKER_ENV;
    }

    if (typeof originalNodeEnv === 'string') {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }

    if (typeof originalSandboxWorkerUrl === 'string') {
      process.env.SANDBOX_WORKER_URL = originalSandboxWorkerUrl;
    } else {
      delete process.env.SANDBOX_WORKER_URL;
    }

    if (typeof originalWorkflowValidationAgentUrl === 'string') {
      process.env.WORKFLOW_VALIDATION_AGENT_URL = originalWorkflowValidationAgentUrl;
    } else {
      delete process.env.WORKFLOW_VALIDATION_AGENT_URL;
    }

    if (typeof originalActivityValidationAgentUrl === 'string') {
      process.env.ACTIVITY_VALIDATION_AGENT_URL = originalActivityValidationAgentUrl;
    } else {
      delete process.env.ACTIVITY_VALIDATION_AGENT_URL;
    }

    if (typeof originalTemporalSandboxAgentUrl === 'string') {
      process.env.TEMPORAL_SANDBOX_AGENT_URL = originalTemporalSandboxAgentUrl;
    } else {
      delete process.env.TEMPORAL_SANDBOX_AGENT_URL;
    }

    if (typeof originalSandboxAgentUrl === 'string') {
      process.env.SANDBOX_AGENT_URL = originalSandboxAgentUrl;
    } else {
      delete process.env.SANDBOX_AGENT_URL;
    }
  });

  it('strips wrapping quotes and whitespace from carbone urls', () => {
    process.env.CARBONE_SERVICE_URL = ' `http://carbone-engine:3009/` ';
    process.env.CARBONE_EXTERNAL_URL = ' "http://127.0.0.1:3009/" ';

    expect(getCarboneServiceUrl()).toBe('http://carbone-engine:3009');
    expect(getCarboneExternalUrl()).toBe('http://127.0.0.1:3009');
  });

  it('uses localhost for workflow validation outside docker even in production mode', () => {
    process.env.NODE_ENV = 'production';

    expect(getWorkflowValidationAgentUrl()).toBe('http://localhost:8090');
  });

  it('uses the docker service hostname for workflow validation inside docker', () => {
    process.env.DOCKER_ENV = 'true';

    expect(getWorkflowValidationAgentUrl()).toBe('http://sandbox-worker:8090');
  });

  it('prefers SANDBOX_WORKER_URL over legacy workflow validation env names', () => {
    process.env.SANDBOX_WORKER_URL = 'http://sandbox-worker-new:8090';
    process.env.WORKFLOW_VALIDATION_AGENT_URL = 'http://workflow-validation-agent:8090';
    process.env.ACTIVITY_VALIDATION_AGENT_URL = 'http://activity-validation-agent:8090';
    process.env.TEMPORAL_SANDBOX_AGENT_URL = 'http://temporal-sandbox-agent:8090';
    process.env.SANDBOX_AGENT_URL = 'http://legacy-sandbox-agent:8090';

    expect(getWorkflowValidationAgentUrl()).toBe('http://sandbox-worker-new:8090');
  });

  it('falls back to SANDBOX_AGENT_URL when newer sandbox worker env names are absent', () => {
    process.env.SANDBOX_AGENT_URL = 'http://legacy-sandbox-agent:8090';

    expect(getWorkflowValidationAgentUrl()).toBe('http://legacy-sandbox-agent:8090');
  });
});
