import type {
  ArtifactRef,
  PolicyContext,
  RuntimePhaseArtifact,
  RuntimePhaseInvokeRequest,
  RuntimePhaseInvokeResult,
  RuntimeMetrics,
  RuntimeStepInvokeRequest,
  RuntimeStepInvokeResult,
  RuntimeType,
  SnapshotRef,
  TraceContext,
} from '@ops/backend-runtime-capability-contract';

export type RuntimeAdapterRouteKey = `${RuntimeType}:${string}`;

export const buildRuntimeAdapterRouteKey = (
  runtimeType: RuntimeType,
  capabilityType: string
): RuntimeAdapterRouteKey => `${runtimeType}:${capabilityType}`;

export type {
  ArtifactRef,
  PolicyContext,
  RuntimePhaseArtifact,
  RuntimePhaseInvokeRequest,
  RuntimePhaseInvokeResult,
  RuntimeMetrics,
  RuntimeStepInvokeRequest,
  RuntimeStepInvokeResult,
  RuntimeType,
  SnapshotRef,
  TraceContext,
};

export interface RuntimeAdapter {
  readonly runtimeType: RuntimeType;
  readonly routeKeys?: readonly RuntimeAdapterRouteKey[];
  supports(request: RuntimeStepInvokeRequest): boolean;
  initializeSession?(runtimeSessionId: string): Promise<void>;
  invokeStep(request: RuntimeStepInvokeRequest): Promise<RuntimeStepInvokeResult>;
}
