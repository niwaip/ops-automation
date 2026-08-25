import type { RuntimeStepInvokeRequest, RuntimeStepInvokeResult } from '@ops/backend-runtime-capability-contract';
export interface CapabilityRuntimeAdapter {
    readonly routeKey: string;
    readonly adapterVersion: string;
    readonly protocolVersion: string;
    supports(request: RuntimeStepInvokeRequest): boolean;
    invoke(request: RuntimeStepInvokeRequest): Promise<RuntimeStepInvokeResult>;
    probe(): Promise<{
        healthy: boolean;
        detail?: string;
    }>;
}
export declare function assertUniqueRuntimeRoutes(adapters: CapabilityRuntimeAdapter[]): void;
//# sourceMappingURL=runtime-adapter.d.ts.map