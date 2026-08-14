import { BuiltinActivityRegistry } from '../src/modules/temporal-workflow/builtin-activity.registry';
import { ActivityPluginProbeService } from '../src/modules/temporal-workflow/activity-plugin/activity-plugin-probe.service';
import { ActivityPluginRegistryService } from '../src/modules/temporal-workflow/activity-plugin/activity-plugin-registry.service';
import { ActivityPluginSpecValidatorService } from '../src/modules/temporal-workflow/activity-plugin/activity-plugin-spec-validator.service';

describe('Activity Plugin ABI and real probe', () => {
  const createServices = () => {
    const builtinRegistry = new BuiltinActivityRegistry();
    const registry = new ActivityPluginRegistryService(builtinRegistry);
    const validator = new ActivityPluginSpecValidatorService(registry);
    const executionService = {
      executeCodeInTemporalSandbox: jest.fn(),
    };
    const probe = new ActivityPluginProbeService(
      registry,
      validator,
      builtinRegistry,
      executionService as any
    );
    return { builtinRegistry, registry, validator, executionService, probe };
  };

  it('publishes fixed implementation hashes and small synthesis budgets', () => {
    const { registry } = createServices();
    const http = registry.getByRef('builtin:httpRequest');

    expect(http).toEqual(
      expect.objectContaining({
        version: '1.0.0',
        synthesis: expect.objectContaining({ mode: 'spec', maxOutputTokens: 1200 }),
        runtime: expect.objectContaining({ implementationHash: expect.stringMatching(/^sha256:/) }),
      })
    );
  });

  it('fills typed defaults but rejects string values for numeric fields', () => {
    const { validator } = createServices();
    const valid = validator.validateAndNormalize({
      pluginRef: 'builtin:httpRequest',
      pluginVersion: '1.0.0',
      config: { urlTemplate: 'https://example.com' },
    });
    const invalid = validator.validateAndNormalize({
      pluginRef: 'builtin:httpRequest',
      pluginVersion: '1.0.0',
      config: {
        method: 'GET',
        urlTemplate: 'https://example.com',
        timeout: '30',
        responseMode: 'body',
      },
    });

    expect(valid.success).toBe(true);
    expect(valid.spec?.config).toEqual(
      expect.objectContaining({ method: 'GET', timeout: 30, responseMode: 'body' })
    );
    expect(invalid.success).toBe(false);
    expect(invalid.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'SPEC_SCHEMA_VIOLATION', path: '/config/timeout' }),
      ])
    );
  });

  it('uses the exact registered Activity code and validates response projections', async () => {
    const { builtinRegistry, executionService, probe } = createServices();
    executionService.executeCodeInTemporalSandbox.mockResolvedValue({
      success: true,
      result: {
        status: 'success',
        ok: true,
        method: 'GET',
        url: 'https://weather.example.test/current',
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: { current: { temperature: 26, condition: 'sunny' } },
        text: '{"current":{"temperature":26,"condition":"sunny"}}',
      },
    });

    const result = await probe.probe({
      spec: {
        pluginRef: 'builtin:httpRequest',
        pluginVersion: '1.0.0',
        config: {
          method: 'GET',
          urlTemplate: 'https://weather.example.test/current',
          timeout: 30,
          responseMode: 'bodyMap',
          responseFieldMappings: {
            temperature: 'current.temperature',
            weather: 'current.condition',
          },
        },
      },
    });

    const builtin = builtinRegistry.getByRef('builtin:httpRequest')!;
    expect(executionService.executeCodeInTemporalSandbox).toHaveBeenCalledWith(
      builtin.generatedCode,
      builtin.fn,
      'activity-plugin-real-probe',
      expect.objectContaining({ method: 'GET', timeout: 30 })
    );
    expect(result.success).toBe(true);
    expect(result.projectedOutput).toEqual({ temperature: 26, weather: 'sunny' });
    expect(result.sampleHash).toMatch(/^sha256:/);
  });

  it('fails the probe when a declared output path is absent', async () => {
    const { executionService, probe } = createServices();
    executionService.executeCodeInTemporalSandbox.mockResolvedValue({
      success: true,
      result: {
        status: 'success',
        ok: true,
        method: 'GET',
        url: 'https://example.test',
        statusCode: 200,
        headers: {},
        body: { data: {} },
        text: '{}',
      },
    });

    const result = await probe.probe({
      spec: {
        pluginRef: 'builtin:httpRequest',
        pluginVersion: '1.0.0',
        config: {
          method: 'GET',
          urlTemplate: 'https://example.test',
          timeout: 30,
          responseMode: 'bodyPath',
          responseBodyPath: 'data.missing',
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'OUTPUT_PATH_NOT_FOUND' })])
    );
  });

  it('blocks side-effecting HTTP probes unless explicitly approved', async () => {
    const { executionService, probe } = createServices();
    const result = await probe.probe({
      spec: {
        pluginRef: 'builtin:httpRequest',
        pluginVersion: '1.0.0',
        config: {
          method: 'POST',
          urlTemplate: 'https://example.test/items',
          timeout: 30,
          responseMode: 'body',
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics[0].code).toBe('UNSAFE_REAL_PROBE');
    expect(executionService.executeCodeInTemporalSandbox).not.toHaveBeenCalled();
  });

  it('executes fixed structured transforms without requiring an AI instruction', async () => {
    const { executionService, probe } = createServices();
    executionService.executeCodeInTemporalSandbox.mockResolvedValue({
      success: true,
      result: {
        status: 'success',
        mode: 'fixed',
        outputMode: 'json',
        result: { title: 'DeepSeek V4 Flash' },
        raw: '{"title":"DeepSeek V4 Flash"}',
      },
    });

    const result = await probe.probe({
      spec: {
        pluginRef: 'builtin:structuredTransform',
        pluginVersion: '1.0.0',
        config: {
          contentType: 'json',
          contentTemplate: '{content}',
          instructionTemplate: '',
          outputMode: 'json',
          fieldMappings: { title: 'items.0.title' },
        },
      },
      sampleInput: { items: [{ title: 'DeepSeek V4 Flash' }] },
    });

    expect(result.success).toBe(true);
    expect(result.projectedOutput).toEqual({ title: 'DeepSeek V4 Flash' });
  });

  it('rejects fixed transform samples whose mapped fields resolve to null', async () => {
    const { executionService, probe } = createServices();
    executionService.executeCodeInTemporalSandbox.mockResolvedValue({
      success: true,
      result: {
        status: 'success',
        mode: 'fixed',
        outputMode: 'json',
        result: { temperature: null },
        raw: '{"temperature":null}',
      },
    });

    const result = await probe.probe({
      spec: {
        pluginRef: 'builtin:structuredTransform',
        pluginVersion: '1.0.0',
        config: {
          contentType: 'json',
          contentTemplate: '{content}',
          outputMode: 'json',
          outputSchema: { temperature: 'number' },
          fieldMappings: { temperature: 'current.temperature' },
        },
      },
      sampleInput: { current: {} },
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'OUTPUT_PATH_NOT_FOUND' })])
    );
  });
});
