export type SkillCaptureStatus =
  | 'queued'
  | 'generating'
  | 'validating'
  | 'installing'
  | 'ready'
  | 'failed';

export interface PersonalSkillSourceRef {
  kind: 'sandbox_turn' | 'execution';
  sessionId?: string;
  messageId?: string;
  executionId?: string;
}

export interface SkillSourceInput {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
}

export interface SkillSourceStep {
  description: string;
  tool?: string;
  code?: string;
}

export interface SkillSourceFile {
  name: string;
  path?: string;
  role: 'template' | 'reference' | 'script' | 'data';
}

export interface SkillSourceOutput {
  filenamePattern?: string;
  type: string;
  description?: string;
}

export interface SkillSourceCorrection {
  userCorrection: string;
  adjustment?: string;
}

export interface SkillSource {
  source: PersonalSkillSourceRef;
  objective: string;
  confirmedInstructions: string[];
  corrections?: SkillSourceCorrection[];
  inputs: SkillSourceInput[];
  reusableSteps: SkillSourceStep[];
  reusableFiles: SkillSourceFile[];
  outputContract: SkillSourceOutput[];
  scriptCode?: string;
}

export interface PersonalSkillVersionSnapshot {
  version: number;
  packageHash: string;
  createdAt: string;
  description?: string;
}

export interface PersonalSkillCatalogRecord {
  skillId: string;
  ownerUserId: string;
  slug: string;
  displayName: string;
  description: string;
  aliases: string[];
  triggers: string[];
  deliverables: string[];
  requiresExecution: boolean;
  version: number;
  packageHash: string;
  status: 'ready' | 'failed';
  sourceRef?: PersonalSkillSourceRef;
  hasScript: boolean;
  versions: PersonalSkillVersionSnapshot[];
  createdAt: string;
  updatedAt: string;
}
