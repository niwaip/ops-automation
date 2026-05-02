import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ERROR_CODES } from '@ops/contracts';
import { BrowserRuntimeAdapter } from './browser-runtime.adapter';
import { CapabilityRuntimeAdapter } from './capability-runtime.adapter';
import {
  buildRuntimeAdapterRouteKey,
  RuntimeAdapter,
  RuntimeAdapterRouteKey,
  RuntimeStepInvokeRequest,
} from './runtime-adapter.interface';

@Injectable()
export class RuntimeAdapterRegistry {
  private readonly adapters: RuntimeAdapter[];
  private readonly adaptersByRouteKey = new Map<RuntimeAdapterRouteKey, RuntimeAdapter>();

  constructor(
    browserRuntimeAdapter: BrowserRuntimeAdapter,
    capabilityRuntimeAdapter: CapabilityRuntimeAdapter,
  ) {
    this.adapters = [browserRuntimeAdapter, capabilityRuntimeAdapter];
    this.registerAdapters(this.adapters);
  }

  resolve(request: RuntimeStepInvokeRequest): RuntimeAdapter {
    const routeKey = buildRuntimeAdapterRouteKey(request.runtimeType, request.capabilityType);
    const directMatch = this.adaptersByRouteKey.get(routeKey);
    if (directMatch) {
      return directMatch;
    }

    const adapter = this.adapters.find((candidate) => candidate.supports(request));
    if (!adapter) {
      throw new ServiceUnavailableException({
        code: ERROR_CODES.RUNTIME_UNAVAILABLE,
        message: `No runtime adapter found for runtimeType=${request.runtimeType}, capabilityType=${request.capabilityType}`,
        runtimeType: request.runtimeType,
        capabilityType: request.capabilityType,
        registeredRoutes: this.listRouteKeys(),
      });
    }

    return adapter;
  }

  listRouteKeys(): RuntimeAdapterRouteKey[] {
    return Array.from(this.adaptersByRouteKey.keys());
  }

  private registerAdapters(adapters: RuntimeAdapter[]): void {
    for (const adapter of adapters) {
      for (const routeKey of adapter.routeKeys || []) {
        this.adaptersByRouteKey.set(routeKey, adapter);
      }
    }
  }
}
