import { Injectable } from '@nestjs/common';
import type {
  GeneratedWorkUnit,
  GeneratedWorkUnitArtifact,
} from '../../contracts/codegen-agent.types';

export type GeneratedWorkUnitInput = {
  workUnitId: string;
  title: string;
  objective: string;
  outputType: GeneratedWorkUnit['outputType'];
  entrypoints: string[];
  artifacts: GeneratedWorkUnitArtifact[];
};

@Injectable()
export class GeneratedWorkUnitMapper {
  map(input: GeneratedWorkUnitInput): GeneratedWorkUnit {
    return {
      workUnitId: input.workUnitId,
      title: input.title,
      objective: input.objective,
      outputType: input.outputType,
      entrypoints: input.entrypoints,
      artifacts: input.artifacts,
    };
  }
}
