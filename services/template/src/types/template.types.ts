/**
 * Template Types and Interfaces
 */

export type TemplateStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'DEPRECATED' | 'REVOKED';

export type LocatorType = 'role' | 'text' | 'test-id' | 'css' | 'xpath';

export type ActionType =
  | 'click'
  | 'fill'
  | 'navigate'
  | 'wait'
  | 'select'
  | 'check'
  | 'screenshot'
  | 'assert';

export type WaitType = 'timeout' | 'visible' | 'hidden' | 'text';

export type OnFailAction = 'skip' | 'stop' | 'takeover';

export interface Locator {
  type: LocatorType;
  value: string;
  fallback?: Locator;
}

export interface WaitConfig {
  type: WaitType;
  value: number | string;
}

export interface Assertion {
  type: 'visible' | 'hidden' | 'text' | 'value' | 'count';
  expected: string | number | boolean;
  locator?: Locator;
}

export interface RetryConfig {
  max_attempts: number;
  delay_ms: number;
}

export interface TemplateStep {
  step_id: string;
  action: ActionType;
  locator?: Locator;
  params?: Record<string, string | number>;
  wait?: WaitConfig;
  assertions?: Assertion[];
  retry?: RetryConfig;
  on_fail?: OnFailAction;
  idempotency_key?: string;
}

export interface ParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  default?: string | number | boolean;
  required?: boolean;
  enum?: string[];
}

export interface ParamsSchema {
  type: 'object';
  properties: Record<string, ParamSchema>;
  required: string[];
}

export interface TemplateMetadata {
  created_by: string;
  created_at: string;
  updated_at: string;
  description?: string;
  tags?: string[];
  intent?: string;
}

export interface TemplateJSON {
  id: string;
  name: string;
  version: string;
  status: TemplateStatus;
  params_schema: ParamsSchema;
  steps: TemplateStep[];
  metadata: TemplateMetadata;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CompileRequest {
  script: string;
}

export interface CompileResponse extends TemplateJSON {}

export interface ListTemplatesQuery {
  status?: TemplateStatus;
  page?: number;
  limit?: number;
}

export interface ListTemplatesResponse {
  templates: TemplateJSON[];
  total: number;
  page: number;
  limit: number;
}

// Locator priority mapping
export const LOCATOR_PRIORITY: Record<LocatorType, number> = {
  'role': 1,
  'text': 2,
  'test-id': 3,
  'css': 4,
  'xpath': 5,
};

// Forbidden parameter names (security check)
export const FORBIDDEN_PARAM_NAMES = ['password', 'passwd', 'pwd', 'secret', 'token', 'api_key', 'apikey'];