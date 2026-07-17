/**
 * Template Types and Interfaces
 */

export type TemplateStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'DEPRECATED' | 'REVOKED';

export type LocatorType = 'role' | 'text' | 'label' | 'test-id' | 'css' | 'xpath' | 'ref';

export type ActionType =
  | 'click'
  | 'fill'
  | 'navigate'
  | 'wait'
  | 'select'
  | 'check'
  | 'screenshot'
  | 'assert'
  | 'search'
  | 'smart_search'
  | 'hover'
  | 'press'
  | 'press_key'
  | 'scroll'
  | 'type_text'
  | 'get_text'
  | 'snapshot'
  | 'read_page'
  | 'list_search_results'
  | 'click_result'
  | 'click_table_row'
  | 'switch_latest_tab'
  | 'close_tab'
  | 'read_value'
  | 'branch'
  | 'takeover_gate';

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

export type ReadMethod = 'innerText' | 'textContent' | 'value' | 'attribute' | 'visible';

export type BranchOutcome = 'continue' | 'stop' | 'takeover';

export type StepExecutionPolicy =
  | 'auto_execute'
  | 'require_confirmation'
  | 'require_takeover'
  | 'forbid_in_replay';

export interface BranchConfig {
  condition_fn: string;
  on_match: Exclude<BranchOutcome, 'takeover'>;
  on_mismatch: BranchOutcome;
  takeover_reason?: string;
  description?: string;
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
  output_var?: string;
  branch?: BranchConfig;
  description?: string;
  execution_policy?: StepExecutionPolicy;
}

export interface ParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date';
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
  description?: string;
  params_schema: ParamsSchema;
  steps: TemplateStep[];
  guards: Record<string, unknown>[];
  config: Record<string, unknown>;
  created_by: string;
  reviewed_by?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  deprecated_at?: string | null;
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
  excludeDraft?: boolean | string;
  page?: number | string;
  limit?: number | string;
  pageSize?: number | string;
  search?: string;
}

export interface ListTemplatesResponse {
  templates: TemplateJSON[];
  total: number;
  page: number;
  limit: number;
}

// Locator priority mapping
export const LOCATOR_PRIORITY: Record<LocatorType, number> = {
  role: 1,
  text: 2,
  label: 2,
  'test-id': 3,
  css: 4,
  xpath: 5,
  ref: 1,
};

// Forbidden parameter names (security check)
export const FORBIDDEN_PARAM_NAMES = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'api_key',
  'apikey',
];
