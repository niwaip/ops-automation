import { Injectable } from '@nestjs/common';
import type { GeneratedWorkUnitArtifact } from '../../contracts/codegen-agent.types';

@Injectable()
export class PackageAssemblerService {
  assembleArtifacts(artifacts: GeneratedWorkUnitArtifact[]): GeneratedWorkUnitArtifact[] {
    return artifacts.map((artifact) => ({
      ...artifact,
      path: artifact.path.trim(),
    }));
  }
}
