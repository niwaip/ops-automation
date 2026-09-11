export type ActivityPluginSynthesisMode = 'none' | 'spec' | 'expression' | 'code-hole';

export type ActivityPluginJsonSchema = {
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, ActivityPluginJsonSchema>;
  required?: string[];
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  items?: ActivityPluginJsonSchema;
  additionalProperties?: boolean | ActivityPluginJsonSchema;
  oneOf?: ActivityPluginJsonSchema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  minProperties?: number;
};

export interface ActivityPluginManifest {
  ref: string;
  version: string;
  activityKey: string;
  activityFn: string;
  stepConfigKey: string;
  discovery: {
    name: string;
    description: string;
    useCases: string[];
    negativeUseCases?: string[];
  };
  contracts: {
    implementationSpecSchema: ActivityPluginJsonSchema;
    runtimeInputSchema: ActivityPluginJsonSchema;
    runtimeOutputSchema: ActivityPluginJsonSchema;
  };
  synthesis: {
    mode: ActivityPluginSynthesisMode;
    maxInputTokens: number;
    maxOutputTokens: number;
    allowedExpressionLanguage?: 'jsonpath';
  };
  runtime: {
    timeout: string;
    retryPolicy?: { maxRetries?: number; backoffMs?: number };
    implementationHash: string;
  };
  validation: {
    supportsRealProbe: boolean;
    safeProbeMethods?: string[];
  };
}

export interface ActivityPluginImplementationSpec {
  pluginRef: string;
  pluginVersion: string;
  config: Record<string, unknown>;
}

export interface ActivityPluginDiagnostic {
  code:
    | 'PLUGIN_NOT_FOUND'
    | 'PLUGIN_VERSION_MISMATCH'
    | 'SPEC_SCHEMA_VIOLATION'
    | 'UNSAFE_REAL_PROBE'
    | 'REAL_PROBE_FAILED'
    | 'OUTPUT_SCHEMA_VIOLATION'
    | 'OUTPUT_PATH_NOT_FOUND';
  path?: string;
  message: string;
  recoverable: boolean;
}

export interface ActivityPluginSpecValidationResult {
  success: boolean;
  spec?: ActivityPluginImplementationSpec;
  diagnostics: ActivityPluginDiagnostic[];
}

export interface ActivityPluginProbeResult {
  success: boolean;
  pluginRef: string;
  pluginVersion: string;
  spec?: ActivityPluginImplementationSpec;
  runtimeInput?: Record<string, unknown>;
  runtimeOutput?: Record<string, unknown>;
  projectedOutput?: unknown;
  sampleHash?: string;
  durationMs?: number;
  validatedAt: string;
  diagnostics: ActivityPluginDiagnostic[];
}
