import { Injectable, ServiceUnavailableException, Optional } from '@nestjs/common';
import { ERROR_CODES } from '@ops/backend-error-codes';
import { BrowserRuntimeAdapter } from './browser-runtime.adapter';
import { CapabilityRuntimeAdapter } from './capability-runtime.adapter';
import { DocumentRuntimeAdapter } from './document-runtime.adapter';
import {
  buildRuntimeAdapterRouteKey,
  RuntimeAdapter,
  RuntimeAdapterRouteKey,
  RuntimeStepInvokeRequest,
} from './runtime-adapter.interface';
import { WorkflowRuntimeAdapter } from './workflow-runtime.adapter';
import { BuiltinWorkflowRuntimeAdapter } from './builtin-workflow-runtime.adapter';

@Injectable()
export class RuntimeAdapterRegistry {
  private readonly adapters: RuntimeAdapter[];
  private readonly adaptersByRouteKey = new Map<RuntimeAdapterRouteKey, RuntimeAdapter>();
  private readonly builtinWorkflowRuntimeAdapter: BuiltinWorkflowRuntimeAdapter;

  constructor(
    browserRuntimeAdapter: BrowserRuntimeAdapter,
    capabilityRuntimeAdapter: CapabilityRuntimeAdapter,
    documentRuntimeAdapter: DocumentRuntimeAdapter,
    workflowRuntimeAdapter: WorkflowRuntimeAdapter,
    @Optional() builtinWorkflowRuntimeAdapter?: BuiltinWorkflowRuntimeAdapter,
  ) {
    this.builtinWorkflowRuntimeAdapter = builtinWorkflowRuntimeAdapter || new BuiltinWorkflowRuntimeAdapter();
    this.adapters = [
      browserRuntimeAdapter,
      capabilityRuntimeAdapter,
      documentRuntimeAdapter,
      workflowRuntimeAdapter,
    ];
    if (builtinWorkflowRuntimeAdapter) {
      this.adapters.unshift(builtinWorkflowRuntimeAdapter);
    }
    this.registerAdapters(this.adapters);
  }

  resolve(request: RuntimeStepInvokeRequest): RuntimeAdapter {
    // 1. Builtin Skill priority check
    if (this.builtinWorkflowRuntimeAdapter.supports(request)) {
      return this.builtinWorkflowRuntimeAdapter;
    }

    // 2. Direct routeKey match
    const routeKey = buildRuntimeAdapterRouteKey(request.runtimeType, request.capabilityType);
    const directMatch = this.adaptersByRouteKey.get(routeKey);
    if (directMatch) {
      return directMatch;
    }

    // 3. Fallback candidate supports check
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
