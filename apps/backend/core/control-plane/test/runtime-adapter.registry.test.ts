import { ServiceUnavailableException } from '@nestjs/common';
import { RuntimeAdapterRegistry } from '../src/modules/execution/runtime-adapter.registry';
import {
  RuntimeAdapter,
  RuntimeStepInvokeRequest,
  buildRuntimeAdapterRouteKey,
} from '../src/modules/execution/runtime-adapter.interface';

describe('RuntimeAdapterRegistry', () => {
  const baseRequest: RuntimeStepInvokeRequest = {
    requestId: 'request-1',
    executionId: 'execution-1',
    stepId: 'step-1',
    runtimeType: 'browser',
    capabilityType: 'browser.step',
    action: 'goto',
    input: {},
  };

  it('resolves adapter by explicit route key before checking supports()', () => {
    const browserAdapter: RuntimeAdapter = {
      runtimeType: 'browser',
      routeKeys: [buildRuntimeAdapterRouteKey('browser', 'browser.step')],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };
    const capabilityAdapter: RuntimeAdapter = {
      runtimeType: 'custom',
      routeKeys: [buildRuntimeAdapterRouteKey('custom', 'skill.runtime')],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };

    const registry = new RuntimeAdapterRegistry(
      browserAdapter as never,
      capabilityAdapter as never,
    );

    const resolved = registry.resolve(baseRequest);

    expect(resolved).toBe(browserAdapter);
    expect(browserAdapter.supports).not.toHaveBeenCalled();
  });

  it('falls back to supports() when no explicit route key matches', () => {
    const browserAdapter: RuntimeAdapter = {
      runtimeType: 'browser',
      routeKeys: [],
      supports: jest.fn().mockReturnValue(true),
      invokeStep: jest.fn(),
    };
    const capabilityAdapter: RuntimeAdapter = {
      runtimeType: 'custom',
      routeKeys: [],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };

    const registry = new RuntimeAdapterRegistry(
      browserAdapter as never,
      capabilityAdapter as never,
    );

    const resolved = registry.resolve(baseRequest);

    expect(resolved).toBe(browserAdapter);
    expect(browserAdapter.supports).toHaveBeenCalledWith(baseRequest);
  });

  it('throws a runtime_unavailable error when no adapter can resolve the request', () => {
    const browserAdapter: RuntimeAdapter = {
      runtimeType: 'browser',
      routeKeys: [],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };
    const capabilityAdapter: RuntimeAdapter = {
      runtimeType: 'custom',
      routeKeys: [],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };

    const registry = new RuntimeAdapterRegistry(
      browserAdapter as never,
      capabilityAdapter as never,
    );

    try {
      registry.resolve(baseRequest);
      throw new Error('expected resolve() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const response = (error as ServiceUnavailableException).getResponse() as Record<string, unknown>;
      expect(response).toMatchObject({
        code: 'RUNTIME_UNAVAILABLE',
        runtimeType: 'browser',
        capabilityType: 'browser.step',
      });
      expect(response.registeredRoutes).toEqual([]);
    }
  });
});
