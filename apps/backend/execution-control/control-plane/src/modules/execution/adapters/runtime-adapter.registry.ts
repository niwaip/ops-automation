import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { ERROR_CODES } from '@ops/backend-error-codes';
import {
  buildRuntimeAdapterRouteKey,
  RuntimeAdapter,
  RuntimeAdapterRouteKey,
  RuntimeStepInvokeRequest,
} from './runtime-adapter.interface';
import { BuiltinWorkflowRuntimeAdapter } from './builtin-workflow-runtime.adapter';

@Injectable()
export class RuntimeAdapterRegistry implements OnModuleInit {
  private readonly logger = new Logger(RuntimeAdapterRegistry.name);
  private readonly adapters: RuntimeAdapter[] = [];
  private readonly adaptersByRouteKey = new Map<RuntimeAdapterRouteKey, RuntimeAdapter>();
  private builtinWorkflowRuntimeAdapter?: BuiltinWorkflowRuntimeAdapter;
  private readonly discovery?: DiscoveryService;

  constructor(
    @Optional()
    @Inject(DiscoveryService)
    discoveryOrAdapters?: DiscoveryService | RuntimeAdapter | RuntimeAdapter[]
  ) {
    if (this.isDiscoveryService(discoveryOrAdapters)) {
      this.discovery = discoveryOrAdapters;
      return;
    }
    if (Array.isArray(discoveryOrAdapters)) {
      this.registerAdapters(discoveryOrAdapters);
    } else if (discoveryOrAdapters) {
      this.registerAdapters([discoveryOrAdapters]);
    }
  }

  onModuleInit(): void {
    if (!this.discovery) return;
    const discovered = this.discovery
      .getProviders()
      .map((wrapper) => wrapper.instance)
      .filter((instance): instance is RuntimeAdapter => this.isRuntimeAdapter(instance));
    this.registerAdapters(discovered);
    this.logger.log(
      `Discovered ${this.adapters.length} runtime adapters with ${this.adaptersByRouteKey.size} explicit routes`
    );
  }

  registerAdapters(adapters: readonly RuntimeAdapter[]): void {
    for (const adapter of adapters) {
      if (this.adapters.includes(adapter)) continue;
      if (adapter instanceof BuiltinWorkflowRuntimeAdapter) {
        this.builtinWorkflowRuntimeAdapter = adapter;
        this.adapters.unshift(adapter);
      } else {
        this.adapters.push(adapter);
      }
      for (const routeKey of adapter.routeKeys || []) {
        const existing = this.adaptersByRouteKey.get(routeKey);
        if (existing && existing !== adapter) {
          throw new Error(
            `Duplicate runtime adapter route '${routeKey}' registered by ${this.adapterName(existing)} and ${this.adapterName(adapter)}`
          );
        }
        this.adaptersByRouteKey.set(routeKey, adapter);
      }
    }
  }

  resolve(request: RuntimeStepInvokeRequest): RuntimeAdapter {
    if (this.builtinWorkflowRuntimeAdapter?.supports(request)) {
      return this.builtinWorkflowRuntimeAdapter;
    }

    const routeKey = buildRuntimeAdapterRouteKey(request.runtimeType, request.capabilityType);
    const directMatch = this.adaptersByRouteKey.get(routeKey);
    if (directMatch) return directMatch;

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
    return Array.from(this.adaptersByRouteKey.keys()).sort();
  }

  private isRuntimeAdapter(value: unknown): value is RuntimeAdapter {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<RuntimeAdapter>;
    return (
      typeof candidate.runtimeType === 'string' &&
      typeof candidate.supports === 'function' &&
      typeof candidate.invokeStep === 'function'
    );
  }

  private isDiscoveryService(value: unknown): value is DiscoveryService {
    return Boolean(value && typeof (value as DiscoveryService).getProviders === 'function');
  }

  private adapterName(adapter: RuntimeAdapter): string {
    return (adapter as object).constructor?.name || adapter.runtimeType;
  }
}
