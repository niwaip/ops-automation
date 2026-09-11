import { getWorkflowValidationAgentUrl } from '@ops/workflow-registry/temporal/service-endpoints';

describe('Temporal service endpoints', () => {
  const originalEnv = {
    DOCKER_ENV: process.env.DOCKER_ENV,
    WORKFLOW_VALIDATION_AGENT_URL: process.env.WORKFLOW_VALIDATION_AGENT_URL,
    ACTIVITY_VALIDATION_AGENT_URL: process.env.ACTIVITY_VALIDATION_AGENT_URL,
    SANDBOX_WORKER_URL: process.env.SANDBOX_WORKER_URL,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('uses the configured sandbox worker when no workflow-specific URL exists', () => {
    delete process.env.WORKFLOW_VALIDATION_AGENT_URL;
    delete process.env.ACTIVITY_VALIDATION_AGENT_URL;
    process.env.SANDBOX_WORKER_URL = 'http://sandbox-worker:8090/';

    expect(getWorkflowValidationAgentUrl()).toBe('http://sandbox-worker:8090');
  });

  it('prefers workflow-specific and activity validation URLs in that order', () => {
    process.env.WORKFLOW_VALIDATION_AGENT_URL = 'http://workflow-validator:8080';
    process.env.ACTIVITY_VALIDATION_AGENT_URL = 'http://activity-validator:8090';
    process.env.SANDBOX_WORKER_URL = 'http://sandbox-worker:8090';
    expect(getWorkflowValidationAgentUrl()).toBe('http://workflow-validator:8080');

    delete process.env.WORKFLOW_VALIDATION_AGENT_URL;
    expect(getWorkflowValidationAgentUrl()).toBe('http://activity-validator:8090');
  });
});
