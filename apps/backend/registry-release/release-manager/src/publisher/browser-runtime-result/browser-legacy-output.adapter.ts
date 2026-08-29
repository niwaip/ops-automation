import { Injectable } from '@nestjs/common';
import { BrowserRuntimeMutableState, BrowserRuntimePlanValidation } from '../capability-release-browser-runtime.types';

@Injectable()
export class BrowserLegacyOutputAdapter {
  build(input: {
    runtimeSessionId: string;
    backend: string;
    planValidation: BrowserRuntimePlanValidation;
    runtimeTrace: Record<string, unknown>;
    state: BrowserRuntimeMutableState;
  }): Record<string, unknown> {
    return {
      runtimeSessionId: input.runtimeSessionId,
      backend: input.backend,
      stepResults: input.state.stepResults,
      variables: input.state.variables,
      executionPlanVersion: input.planValidation.executionPlanVersion || 'legacy/unknown',
      degradedMode: input.planValidation.degradedMode,
      degradeReason: input.planValidation.degradeReason,
      trace: input.runtimeTrace,
      runtimeEvidence: input.state.runtimeEvidence,
    };
  }
}
