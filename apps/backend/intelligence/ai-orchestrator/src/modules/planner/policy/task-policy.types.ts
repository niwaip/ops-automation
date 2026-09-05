export interface EffectiveTaskPolicyAlias {
  canonicalCommand: string;
  alias: string;
  matchType: 'exact' | 'phrase' | 'regex' | 'semantic';
  weight: number;
}

export interface EffectiveTaskPolicyRecipe {
  recipeKey: string;
  version: string;
  name: string;
  requiredCommandsJson: string[];
  optionalCommandsJson: string[];
  triggerJson: Record<string, unknown>;
  stepsJson: Array<Record<string, unknown>>;
  bindingsJson: Array<Record<string, unknown>>;
  completionClaimsJson: string[];
  riskLevel: string;
}

export interface EffectiveTaskCapabilityBinding {
  capabilityRole: string;
  capabilityId: string;
  capabilityVersion?: string | null;
  priority: number;
  inputMappingJson: Record<string, unknown>;
  outputMappingJson: Record<string, unknown>;
}

export interface EffectiveTaskPolicySnapshot {
  schemaVersion: 'effective-task-policy/v1';
  digest: string;
  sourcePolicies: Array<{
    id: string;
    scopeType: string;
    scopeId: string;
    version: string;
    digest: string;
  }>;
  aliases: EffectiveTaskPolicyAlias[];
  recipes: EffectiveTaskPolicyRecipe[];
  bindings: EffectiveTaskCapabilityBinding[];
}
