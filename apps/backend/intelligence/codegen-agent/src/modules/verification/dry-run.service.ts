import { Injectable } from '@nestjs/common';
import type { SandboxRuntimeBinding } from '../../contracts/codegen-agent.types';

export type DryRunPlan = {
  binding: SandboxRuntimeBinding;
  command: string;
};

@Injectable()
export class DryRunService {
  plan(binding: SandboxRuntimeBinding): DryRunPlan {
    return {
      binding,
      command: `${binding.runtime}:${binding.executionMode}`,
    };
  }
}
