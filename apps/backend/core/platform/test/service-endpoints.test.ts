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

  beforeEach(() => {
    delete process.env.CARBONE_SERVICE_URL;
    delete process.env.CARBONE_EXTERNAL_URL;
    delete process.env.DOCKER_ENV;
    delete process.env.NODE_ENV;
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

    expect(getWorkflowValidationAgentUrl()).toBe('http://temporal-sandbox-agent:8090');
  });
});
