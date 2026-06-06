import {
  getCarboneExternalUrl,
  getCarboneServiceUrl,
} from '../src/config/service-endpoints';

describe('service-endpoints', () => {
  const originalCarboneServiceUrl = process.env.CARBONE_SERVICE_URL;
  const originalCarboneExternalUrl = process.env.CARBONE_EXTERNAL_URL;

  beforeEach(() => {
    delete process.env.CARBONE_SERVICE_URL;
    delete process.env.CARBONE_EXTERNAL_URL;
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
  });

  it('strips wrapping quotes and whitespace from carbone urls', () => {
    process.env.CARBONE_SERVICE_URL = ' `http://carbone-engine:3009/` ';
    process.env.CARBONE_EXTERNAL_URL = ' "http://127.0.0.1:3009/" ';

    expect(getCarboneServiceUrl()).toBe('http://carbone-engine:3009');
    expect(getCarboneExternalUrl()).toBe('http://127.0.0.1:3009');
  });
});
