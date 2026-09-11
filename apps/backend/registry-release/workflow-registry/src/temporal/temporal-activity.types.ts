export interface ActivityFormData {
  name: string;
  fn: string;
  timeout?: string;
  retryPolicy?: { maxRetries: number; backoffMs?: number };
  handler: 'api' | 'carbone' | 'browser' | 'script';
  config: Record<string, any>;
  generatedCode?: string;
  isActive?: boolean;
}

export interface ActivityValidationResult {
  isValid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface GenerateCodeResult {
  success: boolean;
  code?: string;
  error?: string;
}

export interface BuiltinActivityDTO {
  key: string;
  name: string;
  description?: string;
  category?: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  defaultConfig?: Record<string, any>;
}

export interface ActivityExecutionOptions {
  timeout?: string;
  retryPolicy?: { maxRetries: number; backoffMs?: number };
  preferSandboxStreaming?: boolean;
}

export interface ActivityDeprecation {
  status: 'legacy' | 'experimental' | 'beta' | 'stable';
  migrateTo?: string;
  migrationPlan?: string;
  fallbackFlag?: string;
  fallbackEventCode?: string;
  canBeUsedInNewWorkflows: boolean;
}

export interface ActivityDefinitionWithDeprecation {
  deprecation?: ActivityDeprecation;
  requiresAttestation?: boolean;
}
