import type {
  RuntimeStepInvokeRequest,
  RuntimeStepInvokeResult,
} from '@ops/backend-runtime-capability-contract';

export interface CapabilityRuntimeAdapter {
  readonly routeKey: string;
  readonly adapterVersion: string;
  readonly protocolVersion: string;
  supports(request: RuntimeStepInvokeRequest): boolean;
  invoke(request: RuntimeStepInvokeRequest): Promise<RuntimeStepInvokeResult>;
  probe(): Promise<{ healthy: boolean; detail?: string }>;
}

export function assertUniqueRuntimeRoutes(adapters: CapabilityRuntimeAdapter[]): void {
  const seen = new Set<string>();
  for (const adapter of adapters) {
    if (seen.has(adapter.routeKey)) throw new Error(`Duplicate runtime route: ${adapter.routeKey}`);
    seen.add(adapter.routeKey);
  }
}
