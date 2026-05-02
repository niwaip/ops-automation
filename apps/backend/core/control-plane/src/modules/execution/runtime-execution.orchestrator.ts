import { Injectable } from '@nestjs/common';
import { RuntimeAdapterRegistry } from './runtime-adapter.registry';
import { RuntimeStepInvokeRequest, RuntimeStepInvokeResult } from './runtime-adapter.interface';

@Injectable()
export class RuntimeExecutionOrchestrator {
  constructor(
    private readonly runtimeAdapterRegistry: RuntimeAdapterRegistry,
  ) {}

  async executeStep(
    request: RuntimeStepInvokeRequest,
  ): Promise<RuntimeStepInvokeResult> {
    const adapter = this.runtimeAdapterRegistry.resolve(request);
    if (request.runtimeSessionId && adapter.initializeSession) {
      await adapter.initializeSession(request.runtimeSessionId);
    }

    return adapter.invokeStep(request);
  }
}
