import { ServiceUnavailableException } from '@nestjs/common';
import { RuntimeAdapterRegistry } from '../src/modules/execution/adapters/runtime-adapter.registry';
import {
  RuntimeAdapter,
  RuntimeStepInvokeRequest,
  buildRuntimeAdapterRouteKey,
} from '../src/modules/execution/adapters/runtime-adapter.interface';

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
    const documentAdapter: RuntimeAdapter = {
      runtimeType: 'document',
      routeKeys: [buildRuntimeAdapterRouteKey('document', 'document.render')],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };
    const workflowAdapter: RuntimeAdapter = {
      runtimeType: 'workflow',
      routeKeys: [buildRuntimeAdapterRouteKey('workflow', 'workflow.run')],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };

    const registry = new RuntimeAdapterRegistry();
    registry.registerAdapters([
      browserAdapter,
      capabilityAdapter,
      documentAdapter,
      workflowAdapter,
    ]);

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
    const documentAdapter: RuntimeAdapter = {
      runtimeType: 'document',
      routeKeys: [],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };
    const workflowAdapter: RuntimeAdapter = {
      runtimeType: 'workflow',
      routeKeys: [],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };

    const registry = new RuntimeAdapterRegistry();
    registry.registerAdapters([
      browserAdapter,
      capabilityAdapter,
      documentAdapter,
      workflowAdapter,
    ]);

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
    const documentAdapter: RuntimeAdapter = {
      runtimeType: 'document',
      routeKeys: [],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };
    const workflowAdapter: RuntimeAdapter = {
      runtimeType: 'workflow',
      routeKeys: [],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };

    const registry = new RuntimeAdapterRegistry();
    registry.registerAdapters([
      browserAdapter,
      capabilityAdapter,
      documentAdapter,
      workflowAdapter,
    ]);

    try {
      registry.resolve(baseRequest);
      throw new Error('expected resolve() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const response = (error as ServiceUnavailableException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response).toMatchObject({
        code: 'RUNTIME_UNAVAILABLE',
        runtimeType: 'browser',
        capabilityType: 'browser.step',
      });
      expect(response.registeredRoutes).toEqual([]);
    }
  });

  it('resolves workflow adapter by explicit route key', () => {
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
    const documentAdapter: RuntimeAdapter = {
      runtimeType: 'document',
      routeKeys: [buildRuntimeAdapterRouteKey('document', 'document.render')],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };
    const workflowAdapter: RuntimeAdapter = {
      runtimeType: 'workflow',
      routeKeys: [buildRuntimeAdapterRouteKey('workflow', 'workflow.run')],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };

    const registry = new RuntimeAdapterRegistry();
    registry.registerAdapters([
      browserAdapter,
      capabilityAdapter,
      documentAdapter,
      workflowAdapter,
    ]);

    const request: RuntimeStepInvokeRequest = {
      ...baseRequest,
      runtimeType: 'workflow',
      capabilityType: 'workflow.run',
    };

    const resolved = registry.resolve(request);
    expect(resolved).toBe(workflowAdapter);
    expect(workflowAdapter.supports).not.toHaveBeenCalled();
  });

  it('fails fast when two adapters declare the same route key', () => {
    const routeKey = buildRuntimeAdapterRouteKey('custom', 'duplicate.route');
    const first: RuntimeAdapter = {
      runtimeType: 'custom',
      routeKeys: [routeKey],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };
    const second: RuntimeAdapter = {
      runtimeType: 'custom',
      routeKeys: [routeKey],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };
    const registry = new RuntimeAdapterRegistry();
    expect(() => registry.registerAdapters([first, second])).toThrow(
      "Duplicate runtime adapter route 'custom:duplicate.route'"
    );
  });

  it('discovers adapters from Nest providers during module initialization', () => {
    const adapter: RuntimeAdapter = {
      runtimeType: 'custom',
      routeKeys: [buildRuntimeAdapterRouteKey('custom', 'discovered.route')],
      supports: jest.fn().mockReturnValue(false),
      invokeStep: jest.fn(),
    };
    const registry = new RuntimeAdapterRegistry({
      getProviders: () => [{ instance: adapter }, { instance: {} }],
    } as any);
    registry.onModuleInit();
    expect(registry.listRouteKeys()).toEqual(['custom:discovered.route']);
  });
});
