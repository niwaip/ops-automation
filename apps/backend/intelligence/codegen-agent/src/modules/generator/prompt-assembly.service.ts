import { Injectable } from '@nestjs/common';
import type { CodegenAgentProfile } from '../../contracts/codegen-agent.types';

export type PromptAssemblyInput = {
  objective: string;
  constraints?: string[];
  profile: CodegenAgentProfile;
};

@Injectable()
export class PromptAssemblyService {
  assemble(input: PromptAssemblyInput): string {
    const constraints = (input.constraints || []).filter(Boolean);
    return [
      `agent=${input.profile.name}@${input.profile.version}`,
      `objective=${input.objective}`,
      constraints.length > 0 ? `constraints=${constraints.join(' | ')}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');
  }
}
