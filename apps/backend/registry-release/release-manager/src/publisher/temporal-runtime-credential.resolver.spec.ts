import {
  findTemporalCredentialDefaults,
  resolveTemporalRuntimeCredentials,
} from './temporal-runtime-credential.resolver';

const sourcePayload = {
  paramsSchema: {
    properties: {
      query: { type: 'string' },
      apiKey: {
        type: 'string',
        default: 'expired-snapshot-key',
        description: 'Tavily API key',
      },
    },
  },
};

describe('resolveTemporalRuntimeCredentials', () => {
  it('does not expose a snapshot credential default to runtime users', () => {
    const resolution = resolveTemporalRuntimeCredentials(
      { query: 'deepseek' },
      sourcePayload,
      {}
    );

    expect(resolution.input).toEqual({ query: 'deepseek' });
    expect(resolution.missing).toEqual([]);
    expect(findTemporalCredentialDefaults(sourcePayload)).toEqual(['apiKey']);
  });

  it('preserves user/workflow input value when provided', () => {
    const resolution = resolveTemporalRuntimeCredentials(
      { query: 'deepseek', apiKey: 'user-custom-key' },
      sourcePayload,
      {}
    );

    expect(resolution).toEqual({
      input: { query: 'deepseek', apiKey: 'user-custom-key' },
      missing: [],
    });
  });

  it('uses runtime environment variable as fallback when neither input nor default is present', () => {
    const resolution = resolveTemporalRuntimeCredentials(
      { query: 'deepseek' },
      {
        paramsSchema: {
          required: ['apiKey'],
          properties: {
            query: { type: 'string' },
            apiKey: {
              type: 'string',
              description: 'Tavily API key',
            },
          },
        },
      },
      { TAVILY_API_KEY: 'env-fallback-key' }
    );

    expect(resolution).toEqual({
      input: { query: 'deepseek', apiKey: 'env-fallback-key' },
      missing: [],
    });
  });

  it('reports missing when required credential has no input, default, or env variable', () => {
    const resolution = resolveTemporalRuntimeCredentials(
      { query: 'deepseek' },
      {
        paramsSchema: {
          required: ['apiKey'],
          properties: {
            query: { type: 'string' },
            apiKey: {
              type: 'string',
              description: 'Tavily API key',
            },
          },
        },
      },
      {}
    );

    expect(resolution.input).toEqual({ query: 'deepseek' });
    expect(resolution.missing).toEqual([
      { field: 'apiKey', envKeys: ['TAVILY_API_KEY', 'SEARCH_API_KEY'] },
    ]);
  });

  it('rejects generated and masked device-key placeholders as missing credentials', () => {
    const barkPayload = {
      paramsSchema: {
        required: ['deviceKey'],
        properties: {
          deviceKey: { type: 'string', description: 'Bark device key' },
          content: { type: 'string' },
        },
      },
    };

    for (const deviceKey of ['test_deviceKey', '••••••••', '[REDACTED]']) {
      const resolution = resolveTemporalRuntimeCredentials(
        { deviceKey, content: 'deployment smoke' },
        barkPayload,
        {}
      );
      expect(resolution.input).toEqual({ content: 'deployment smoke' });
      expect(resolution.missing).toEqual([{ field: 'deviceKey', envKeys: [] }]);
    }
  });
});
